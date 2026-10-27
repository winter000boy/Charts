// The same market on each exchange. Candles come from BingX; order books from every exchange listed.
// bucket is the default price step (in USDT) for grouping the order book.
export const MARKETS = [
  {
    label: 'GOLD (XAU) / USDT',
    bucket: 1,
    symbols: { bingx: 'NCCOGOLD2USD-USDT', binance: 'XAUUSDT', bybit: 'XAUUSDT', okx: 'XAU-USDT-SWAP' },
  },
  {
    label: 'XAUT / USDT',
    bucket: 1,
    symbols: { bingx: 'XAUT-USDT', binance: 'XAUTUSDT', bybit: 'XAUTUSDT' },
  },
  {
    label: 'PAXG / USDT',
    bucket: 1,
    symbols: { bingx: 'PAXG-USDT', binance: 'PAXGUSDT', bybit: 'PAXGUSDT' },
  },
  {
    label: 'BTC / USDT',
    bucket: 10,
    symbols: { bingx: 'BTC-USDT', binance: 'BTCUSDT', bybit: 'BTCUSDT', okx: 'BTC-USDT-SWAP' },
  },
];
