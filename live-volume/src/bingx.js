// BingX perpetual futures public market data. No account or API key needed.
const REST = '/bingx/openApi/swap'; // proxied to https://open-api.bingx.com, see vite.config.js
const WS_URL = 'wss://open-api-swap.bingx.com/swap-market';

async function get(path) {
  const res = await fetch(REST + path);
  if (!res.ok) throw new Error(`BingX HTTP ${res.status}`);
  const body = await res.json();
  if (body.code !== 0) throw new Error(`BingX error ${body.code}: ${body.msg}`);
  return body.data;
}

const toLevel = ([price, qty]) => [+price, +qty];

export async function fetchCandles(symbol, interval) {
  const rows = await get(`/v3/quote/klines?symbol=${symbol}&interval=${interval}&limit=1000`);
  // BingX returns newest first; the chart needs oldest first
  return rows
    .map(k => ({ time: k.time / 1000, open: +k.open, high: +k.high, low: +k.low, close: +k.close, volume: +k.volume }))
    .sort((a, b) => a.time - b.time);
}

// Up to 1,000 price levels per side: the widest view of the book BingX offers
export async function fetchDepth(symbol) {
  const { bids, asks } = await get(`/v2/quote/depth?symbol=${symbol}&limit=1000`);
  return { bids: bids.map(toLevel), asks: asks.map(toLevel) };
}

// Live candles for one interval plus the top 100 book levels every 500 ms, over one socket.
// Reconnects on drop; onOpen(true) tells the caller to backfill candles missed while offline.
export function subscribe(symbol, interval, { onKline, onDepth, onOpen, onDrop }) {
  const klineType = `${symbol}@kline_${interval}`;
  const depthType = `${symbol}@depth100@500ms`;
  let ws;
  let closed = false;
  let retryTimer;
  let opened = false;

  const handle = async data => {
    // Frames arrive gzip-compressed, including the "Ping" heartbeat
    const text = typeof data === 'string' ? data : await gunzip(data);
    if (closed) return;
    if (text === 'Ping') return ws.send('Pong');
    const msg = JSON.parse(text);
    if (msg.dataType === klineType) {
      const k = msg.data[0];
      onKline({ time: k.T / 1000, open: +k.o, high: +k.h, low: +k.l, close: +k.c, volume: +k.v });
    } else if (msg.dataType === depthType) {
      onDepth({ bids: msg.data.bids.map(toLevel), asks: msg.data.asks.map(toLevel) });
    }
  };

  const connect = () => {
    ws = new WebSocket(WS_URL);
    ws.binaryType = 'arraybuffer';
    // Decode frames one at a time so candle updates never go backwards in time
    let queue = Promise.resolve();
    ws.onmessage = e => {
      queue = queue.then(() => handle(e.data)).catch(err => console.error('BingX message', err));
    };
    ws.onopen = () => {
      ws.send(JSON.stringify({ id: 'kline', reqType: 'sub', dataType: klineType }));
      ws.send(JSON.stringify({ id: 'depth', reqType: 'sub', dataType: depthType }));
      onOpen(opened);
      opened = true;
    };
    ws.onclose = () => {
      if (closed) return;
      onDrop();
      retryTimer = setTimeout(connect, 2000);
    };
  };

  connect();
  return () => {
    closed = true;
    clearTimeout(retryTimer);
    ws.close();
  };
}

function gunzip(buffer) {
  const stream = new Blob([buffer]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Response(stream).text();
}
