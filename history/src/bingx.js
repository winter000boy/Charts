// BingX perpetual futures candles. No account or API key needed.
const REST = '/bingx/openApi/swap'; // proxied to https://open-api.bingx.com, see vite.config.js
const PAGE = 1000; // most candles BingX returns per request

async function page(symbol, interval, endTime) {
  const end = endTime ? `&endTime=${endTime}` : '';
  const res = await fetch(`${REST}/v3/quote/klines?symbol=${symbol}&interval=${interval}&limit=${PAGE}${end}`);
  if (!res.ok) throw new Error(`BingX HTTP ${res.status}`);
  const body = await res.json();
  if (body.code !== 0) throw new Error(`BingX error ${body.code}: ${body.msg}`);
  return body.data.map(k => ({ time: k.time / 1000, open: +k.open, high: +k.high, low: +k.low, close: +k.close }));
}

// Walks back page by page until BingX runs out of history or maxCandles is reached. Oldest first.
export async function fetchHistory(symbol, interval, maxCandles = 5000) {
  const byTime = new Map();
  let endTime;
  while (byTime.size < maxCandles) {
    const rows = await page(symbol, interval, endTime);
    const before = byTime.size;
    for (const row of rows) byTime.set(row.time, row);
    if (rows.length < PAGE || byTime.size === before) break;
    endTime = Math.min(...rows.map(r => r.time)) * 1000 - 1;
  }
  return [...byTime.values()].sort((a, b) => a.time - b.time);
}
