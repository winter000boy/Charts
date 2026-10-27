import { createChart, CandlestickSeries, HistogramSeries, CrosshairMode } from 'lightweight-charts';
import { fetchCandles, subscribe } from './bingx.js';
import { EXCHANGES, fetchDepth } from './exchanges.js';
import { MARKETS } from './markets.js';
import { OrderBookProfile, bucketize, biggest, formatValue } from './orderBookProfile.js';
import './style.css';

// BingX streams its top 100 levels live, so its wide 1,000-level snapshot is only re-fetched on this interval
const BINGX_SNAPSHOT_MS = 30_000;
// Binance, Bybit and OKX books are polled as snapshots
const OTHER_BOOKS_MS = 5_000;

const $ = id => document.getElementById(id);
const ui = {
  symbol: $('symbol'),
  intervals: $('intervals'),
  exchanges: $('exchanges'),
  bucket: $('bucket'),
  walls: $('walls'),
  status: $('status'),
  tooltip: $('tooltip'),
};

const chart = createChart($('chart'), {
  autoSize: true,
  layout: { background: { color: '#131722' }, textColor: '#d1d4dc' },
  grid: { vertLines: { color: '#1e222d' }, horzLines: { color: '#1e222d' } },
  rightPriceScale: { borderColor: '#2a2e39' },
  // rightOffset leaves empty bars on the right so the newest candles sit clear of the order book bars
  timeScale: { borderColor: '#2a2e39', timeVisible: true, rightOffset: 30 },
  crosshair: { mode: CrosshairMode.Normal },
});

const candles = chart.addSeries(CandlestickSeries, {
  upColor: '#26a69a',
  downColor: '#ef5350',
  borderVisible: false,
  wickUpColor: '#26a69a',
  wickDownColor: '#ef5350',
});
const volume = chart.addSeries(HistogramSeries, {
  priceFormat: { type: 'volume' },
  priceScaleId: '',
  lastValueVisible: false,
  priceLineVisible: false,
});
volume.priceScale().applyOptions({ scaleMargins: { top: 0.85, bottom: 0 } });

const profile = new OrderBookProfile();
candles.attachPrimitive(profile);

const toCandle = ({ time, open, high, low, close }) => ({ time, open, high, low, close });
const toVolume = bar => ({
  time: bar.time,
  value: bar.volume,
  color: bar.close >= bar.open ? 'rgba(38, 166, 154, 0.4)' : 'rgba(239, 83, 80, 0.4)',
});
const formatPrice = price => price.toLocaleString('en-US', { maximumFractionDigits: 2 });

const state = {
  market: MARKETS[0],
  interval: ui.intervals.querySelector('.active').dataset.interval,
  view: 'all', // 'all' or one exchange id
  books: {}, // latest order book snapshot per exchange id
  live: null, // BingX top-100 levels from the WebSocket
  errors: {}, // exchange id → message from its last failed request
  connection: { text: 'Loading…', kind: '' },
};
let stop = () => {};
let loadId = 0; // ignores candle responses that arrive after the user switched symbol or timeframe
const inFlight = new Set(); // order book requests still running, so slow ones don't pile up

async function load({ newMarket }) {
  const id = ++loadId;
  stop();
  setConnection('Loading…');
  const market = state.market;
  const others = Object.keys(market.symbols).filter(exchange => exchange !== 'bingx');
  if (newMarket) {
    Object.assign(state, { books: {}, live: null, errors: {} });
    profile.setLevels([], 1);
    renderExchangeButtons();
    Object.keys(market.symbols).forEach(exchange => refreshBook(market, exchange));
  }

  try {
    const bars = await fetchCandles(market.symbols.bingx, state.interval);
    if (id !== loadId) return;
    candles.setData(bars.map(toCandle));
    volume.setData(bars.map(toVolume));
    chart.timeScale().scrollToRealTime();
  } catch (err) {
    if (id === loadId) setConnection(`Couldn't load candles: ${err.message}`, 'error');
    return;
  }

  const unsubscribe = subscribe(market.symbols.bingx, state.interval, {
    onKline: bar => {
      candles.update(toCandle(bar));
      volume.update(toVolume(bar));
    },
    onDepth: book => {
      state.live = book;
      drawBook();
    },
    onOpen: reconnected => {
      setConnection('Live', 'live');
      if (reconnected) backfill(id);
    },
    onDrop: () => setConnection('Reconnecting…', 'warn'),
  });
  const timers = [
    setInterval(() => refreshBook(market, 'bingx'), BINGX_SNAPSHOT_MS),
    setInterval(() => others.forEach(exchange => refreshBook(market, exchange)), OTHER_BOOKS_MS),
  ];
  stop = () => {
    unsubscribe();
    timers.forEach(clearInterval);
  };
}

// Candles missed while the socket was down
async function backfill(id) {
  try {
    const bars = await fetchCandles(state.market.symbols.bingx, state.interval);
    if (id !== loadId) return;
    candles.setData(bars.map(toCandle));
    volume.setData(bars.map(toVolume));
  } catch (err) {
    console.warn('Candle backfill failed', err);
  }
}

async function refreshBook(market, exchange) {
  const key = `${market.label}|${exchange}`;
  if (inFlight.has(key)) return;
  inFlight.add(key);
  try {
    const book = await fetchDepth[exchange](market.symbols[exchange]);
    if (market !== state.market) return;
    state.books[exchange] = book;
    delete state.errors[exchange];
  } catch (err) {
    if (market !== state.market) return;
    // Keep showing the last good book, but flag the exchange
    console.warn(`${EXCHANGES[exchange]} order book failed`, err);
    state.errors[exchange] = err.message;
  } finally {
    inFlight.delete(key);
  }
  drawBook();
  updateExchangeButtons();
}

// Live top-100 levels replace the snapshot near the price; the snapshot fills in further out
function bingxBook() {
  const { live } = state;
  const snapshot = state.books.bingx;
  if (!live || !snapshot) return live ?? snapshot;
  const lowestLiveBid = Math.min(...live.bids.map(([price]) => price));
  const highestLiveAsk = Math.max(...live.asks.map(([price]) => price));
  return {
    bids: [...live.bids, ...snapshot.bids.filter(([price]) => price < lowestLiveBid)],
    asks: [...live.asks, ...snapshot.asks.filter(([price]) => price > highestLiveAsk)],
  };
}

// The books for the selected view: every exchange of the market, or just one
function selectedBooks() {
  const exchanges = state.view === 'all' ? Object.keys(state.market.symbols) : [state.view];
  const books = {};
  for (const exchange of exchanges) {
    const book = exchange === 'bingx' ? bingxBook() : state.books[exchange];
    if (book) books[exchange] = book;
  }
  return books;
}

function drawBook() {
  const size = Number(ui.bucket.value);
  if (!(size > 0)) return;
  const levels = bucketize(selectedBooks(), size);
  profile.setLevels(levels, size);

  const bid = biggest(levels, 'bid');
  const ask = biggest(levels, 'ask');
  ui.walls.innerHTML = [
    bid && `Biggest buy wall <b class="bid">${formatPrice(bid.price)}</b> (${formatValue(bid.bid)})`,
    ask && `Biggest sell wall <b class="ask">${formatPrice(ask.price)}</b> (${formatValue(ask.ask)})`,
  ]
    .filter(Boolean)
    .join(' · ');
}

function renderExchangeButtons() {
  const views = ['all', ...Object.keys(state.market.symbols)];
  if (!views.includes(state.view)) state.view = 'all';
  ui.exchanges.innerHTML = views
    .map(view => `<button data-exchange="${view}">${view === 'all' ? 'All' : EXCHANGES[view]}</button>`)
    .join('');
  updateExchangeButtons();
}

function updateExchangeButtons() {
  for (const button of ui.exchanges.children) {
    const view = button.dataset.exchange;
    const error = state.errors[view];
    button.classList.toggle('active', view === state.view);
    button.classList.toggle('failed', Boolean(error));
    button.title = error ? `${EXCHANGES[view]} order book unavailable: ${error}` : '';
  }
  renderStatus();
}

function setConnection(text, kind = '') {
  state.connection = { text, kind };
  renderStatus();
}

function renderStatus() {
  const failed = Object.keys(state.errors).map(exchange => EXCHANGES[exchange]);
  const { text, kind } = state.connection;
  ui.status.textContent = failed.length ? `${text} · ${failed.join(', ')} unavailable` : text;
  ui.status.className = `status ${failed.length && kind === 'live' ? 'warn' : kind}`;
}

// Hovering a bar shows how much of it comes from each exchange
chart.subscribeCrosshairMove(param => {
  const level = param.point ? profile.levelAt(param.point) : null;
  if (!level) {
    ui.tooltip.hidden = true;
    return;
  }
  ui.tooltip.innerHTML = breakdown(level, profile.size);
  ui.tooltip.hidden = false;
  ui.tooltip.style.left = `${Math.max(4, param.point.x - ui.tooltip.offsetWidth - 16)}px`;
  ui.tooltip.style.top = `${Math.max(4, param.point.y - ui.tooltip.offsetHeight / 2)}px`;
});

function breakdown(level, size) {
  const cell = value => (value ? formatValue(value) : '–');
  const row = (name, { bid, ask }, className = '') =>
    `<tr class="${className}"><td>${name}</td><td class="bid">${cell(bid)}</td><td class="ask">${cell(ask)}</td></tr>`;
  const sources = Object.entries(level.sources);
  return `
    <div class="title">${formatPrice(level.price)} – ${formatPrice(level.price + size)}</div>
    <table>
      <tr><th></th><th>Buy</th><th>Sell</th></tr>
      ${sources.map(([exchange, values]) => row(EXCHANGES[exchange], values)).join('')}
      ${sources.length > 1 ? row('Total', level, 'total') : ''}
    </table>`;
}

ui.symbol.innerHTML = MARKETS.map((market, i) => `<option value="${i}">${market.label}</option>`).join('');
ui.bucket.value = state.market.bucket;

ui.symbol.addEventListener('change', () => {
  state.market = MARKETS[ui.symbol.value];
  ui.bucket.value = state.market.bucket;
  load({ newMarket: true });
});

ui.intervals.addEventListener('click', e => {
  const button = e.target.closest('button[data-interval]');
  if (!button || button.dataset.interval === state.interval) return;
  ui.intervals.querySelector('.active').classList.remove('active');
  button.classList.add('active');
  state.interval = button.dataset.interval;
  load({ newMarket: false });
});

ui.exchanges.addEventListener('click', e => {
  const button = e.target.closest('button[data-exchange]');
  if (!button) return;
  state.view = button.dataset.exchange;
  updateExchangeButtons();
  drawBook();
});

ui.bucket.addEventListener('input', () => {
  ui.tooltip.hidden = true;
  drawBook();
});

load({ newMarket: true });
