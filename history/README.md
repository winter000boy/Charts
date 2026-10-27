# Support & Resistance

Past BingX perpetual futures candles with support and resistance levels drawn from swing highs and lows.

## Run

```bash
npm install
npm run dev
```

Then open http://localhost:5174.

## How levels are found

1. **Swings.** A bar is a swing high if its high beats the `Swing bars` bars on each side; swing lows likewise.
2. **Clusters.** Swings within half an ATR (average bar size) of each other merge into one level.
3. **Strength.** Each level scores one point per touch, plus up to one point for how recent its last touch is. The strongest `Levels` are drawn.
4. **Side.** Levels below the last close are support (green), above are resistance (red). Labels show touches, e.g. `R ×4`; thicker lines have more touches.

History goes back as far as BingX returns, up to 5,000 candles per timeframe.
