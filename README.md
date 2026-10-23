# Order Book Chart

Live BingX perpetual futures candles with the order book drawn along the price axis:
green bars are buy orders (bids) waiting at that price, red bars are sell orders (asks).
Bar length is the USDT value of the orders in that price bucket, and the biggest walls are labelled.

The order book can combine **BingX, Binance, Bybit and OKX**, or show one exchange at a time.
Hover over a bar to see how much of it comes from each exchange.

Defaults to **GOLD (XAU) / USDT**:

| Exchange | Contract |
|---|---|
| BingX (candles + order book) | `NCCOGOLD2USD-USDT` |
| Binance | `XAUUSDT` |
| Bybit | `XAUUSDT` |
| OKX | `XAU-USDT-SWAP` |

XAUT, PAXG and BTC are also in the symbol list. OKX has no XAUT or PAXG contract, so it's left out for those.

## Run

```bash
npm install
npm run dev
```

Then open http://localhost:5173.

## How it works

| File | Role |
|---|---|
| `src/markets.js` | Which contract each exchange uses for every symbol in the list |
| `src/bingx.js` | BingX candles, its 1,000-level order book snapshot, and the live WebSocket (gzip frames, `Ping`/`Pong` heartbeat) |
| `src/exchanges.js` | Order book snapshots from each exchange, converted to [price, quantity in the asset]. OKX counts contracts, so its sizes are multiplied by the contract size (0.001 oz for gold) |
| `src/orderBookProfile.js` | Groups the books into price buckets and draws the bars as a Lightweight Charts primitive |
| `src/main.js` | Chart, toolbar and hover breakdown. BingX's live top-100 levels are merged with its snapshot (re-fetched every 30 s); Binance, Bybit and OKX are re-fetched every 5 s |
| `vite.config.js` | Forwards `/bingx`, `/binance`, `/bybit` and `/okx` to each exchange's API, because they block or don't allow browser requests from localhost |

## Adding a symbol

Add an entry to `src/markets.js` with each exchange's contract name and a default bucket size.
Leave out any exchange that doesn't list that contract.

## Limits

- **Different reach per exchange.** Each exchange returns a limited number of price levels, so how far from the price you can see differs. For gold: Binance about ±$14, Bybit about ±$90, BingX about ±$120, OKX several percent. Far-away walls in the combined view come only from the exchanges that reach that far.
- **Prices differ slightly** between exchanges (usually under $1–2 for gold), so their walls can land in neighbouring buckets.
- **Not the whole gold market.** These are crypto exchanges only. COMEX futures need a paid data feed, and spot XAUUSD at brokers has no public order book.
- Large orders can be cancelled before price reaches them (spoofing), and stop orders and iceberg orders don't show in the book.
- The app relies on the Vite server's proxy (`npm run dev` or `npm run preview`). Hosting it elsewhere needs a small backend that does the same forwarding.
