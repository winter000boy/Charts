import { createChart, CandlestickSeries, CrosshairMode, LineStyle } from 'lightweight-charts';
import { fetchHistory } from './bingx.js';
import { findLevels } from './levels.js';
import { MARKETS } from './markets.js';
import './style.css';

const $ = id => document.getElementById(id);
const ui = { symbol: $('symbol'), intervals: $('intervals'), swing: $('swing'), count: $('count'), status: $('status') };

const chart = createChart($('chart'), {
  autoSize: true,
  layout: { background: { color: '#131722' }, textColor: '#d1d4dc' },
  grid: { vertLines: { color: '#1e222d' }, horzLines: { color: '#1e222d' } },
  rightPriceScale: { borderColor: '#2a2e39' },
  timeScale: { borderColor: '#2a2e39', timeVisible: true, rightOffset: 10 },
  crosshair: { mode: CrosshairMode.Normal },
});

const candles = chart.addSeries(CandlestickSeries, {
  upColor: '#26a69a',
  downColor: '#ef5350',
  borderVisible: false,
  wickUpColor: '#26a69a',
  wickDownColor: '#ef5350',
});

const state = { market: MARKETS[0], interval: ui.intervals.querySelector('.active').dataset.interval, bars: [] };
let lines = [];
let loadId = 0; // ignores responses that arrive after the user switched symbol or timeframe

function setStatus(text, kind = '') {
  ui.status.textContent = text;
  ui.status.className = `status ${kind}`;
}

function drawLevels() {
  for (const line of lines) candles.removePriceLine(line);
  const levels = findLevels(state.bars, { swing: +ui.swing.value || 5, count: +ui.count.value || 8 });
  lines = levels.map(level =>
    candles.createPriceLine({
      price: level.price,
      color: level.kind === 'support' ? '#26a69a' : '#ef5350',
      lineWidth: Math.min(1 + Math.floor(level.touches / 2), 4),
      lineStyle: LineStyle.Solid,
      axisLabelVisible: true,
      title: `${level.kind === 'support' ? 'S' : 'R'} ×${level.touches}`,
    }),
  );
  const from = new Date(state.bars[0].time * 1000).toLocaleDateString();
  setStatus(`${state.bars.length} candles since ${from} · ${levels.length} levels`, 'live');
}

async function load() {
  const id = ++loadId;
  setStatus('Loading history…');
  try {
    const bars = await fetchHistory(state.market.symbol, state.interval);
    if (id !== loadId) return;
    state.bars = bars;
    candles.setData(bars);
    chart.timeScale().fitContent();
    drawLevels();
  } catch (err) {
    if (id === loadId) setStatus(err.message, 'error');
  }
}

for (const market of MARKETS) ui.symbol.add(new Option(market.label, market.symbol));
ui.symbol.addEventListener('change', () => {
  state.market = MARKETS.find(m => m.symbol === ui.symbol.value);
  load();
});
ui.intervals.addEventListener('click', e => {
  const button = e.target.closest('button');
  if (!button) return;
  ui.intervals.querySelector('.active').classList.remove('active');
  button.classList.add('active');
  state.interval = button.dataset.interval;
  load();
});
for (const input of [ui.swing, ui.count]) input.addEventListener('input', () => state.bars.length && drawLevels());

load();
