import { fetchDepth as fetchBingxDepth } from './bingx.js';

export const EXCHANGES = { bingx: 'BingX', binance: 'Binance', bybit: 'Bybit', okx: 'OKX' };

// All requests go through the dev-server proxy in vite.config.js
async function getJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

const toLevel = ([price, qty]) => [+price, +qty];

// OKX sizes are in contracts; ctVal is how much of the asset one contract is (0.001 oz for gold)
const okxContractSizes = new Map();
function okxContractSize(instId) {
  if (!okxContractSizes.has(instId)) {
    const size = getJson(`/okx/api/v5/public/instruments?instType=SWAP&instId=${instId}`).then(body => {
      if (body.code !== '0' || !body.data.length) throw new Error(`OKX: ${body.msg || 'unknown instrument'}`);
      return +body.data[0].ctVal;
    });
    size.catch(() => okxContractSizes.delete(instId)); // retry on the next poll
    okxContractSizes.set(instId, size);
  }
  return okxContractSizes.get(instId);
}

// Order book snapshot per exchange: { bids, asks } as [price, qty], qty in the asset (ounces for gold)
export const fetchDepth = {
  bingx: fetchBingxDepth,

  // Up to 1,000 levels per side
  async binance(symbol) {
    const { bids, asks } = await getJson(`/binance/fapi/v1/depth?symbol=${symbol}&limit=1000`);
    return { bids: bids.map(toLevel), asks: asks.map(toLevel) };
  },

  // Up to 1,000 levels per side
  async bybit(symbol) {
    const body = await getJson(`/bybit/v5/market/orderbook?category=linear&symbol=${symbol}&limit=1000`);
    if (body.retCode !== 0) throw new Error(`Bybit: ${body.retMsg}`);
    return { bids: body.result.b.map(toLevel), asks: body.result.a.map(toLevel) };
  },

  // books-full allows up to 5,000 levels; 2,000 already reaches several percent from the price
  async okx(instId) {
    const [contractSize, body] = await Promise.all([
      okxContractSize(instId),
      getJson(`/okx/api/v5/market/books-full?instId=${instId}&sz=2000`),
    ]);
    if (body.code !== '0') throw new Error(`OKX: ${body.msg}`);
    const { bids, asks } = body.data[0];
    const toAssetLevel = ([price, contracts]) => [+price, contracts * contractSize];
    return { bids: bids.map(toAssetLevel), asks: asks.map(toAssetLevel) };
  },
};
