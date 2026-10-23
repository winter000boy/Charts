const BID = 'rgba(38, 166, 154, 0.55)';
const ASK = 'rgba(239, 83, 80, 0.55)';
const LABELS_PER_SIDE = 3; // label the biggest walls on each side with their size

const compact = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 });
export const formatValue = value => `$${compact.format(value)}`;

// Groups raw [price, qty] levels from one or more exchanges' books ({ exchangeId: { bids, asks } })
// into fixed-size price buckets: [{ price, bid, ask, sources: { exchangeId: { bid, ask } } }].
// bid/ask hold the USDT value of the orders (qty × price), which reads the same for every contract.
export function bucketize(books, size) {
  const buckets = new Map();
  for (const [exchange, { bids, asks }] of Object.entries(books)) {
    const add = (side, [price, qty]) => {
      // The epsilon and rounding keep float noise (4007.2 / 0.1 = 40071.999…) out of the bucket keys
      const start = Math.round(Math.floor(price / size + 1e-9) * size * 1e8) / 1e8;
      let level = buckets.get(start);
      if (!level) buckets.set(start, (level = { price: start, bid: 0, ask: 0, sources: {} }));
      const source = (level.sources[exchange] ??= { bid: 0, ask: 0 });
      level[side] += qty * price;
      source[side] += qty * price;
    };
    bids.forEach(level => add('bid', level));
    asks.forEach(level => add('ask', level));
  }
  return [...buckets.values()];
}

export const biggest = (levels, side) =>
  levels.reduce((best, level) => (level[side] > (best?.[side] ?? 0) ? level : best), null);

const largest = (levels, side) =>
  levels.filter(level => level[side] > 0).sort((a, b) => b[side] - a[side]).slice(0, LABELS_PER_SIDE);

// Lightweight Charts series primitive: draws the resting order size of each price bucket
// as a horizontal bar against the right price axis, lined up with the candles.
export class OrderBookProfile {
  levels = [];
  size = 1;
  labelled = new Set();

  attached({ series, requestUpdate }) {
    this.series = series;
    this.requestUpdate = requestUpdate;
  }

  detached() {
    this.series = null;
  }

  setLevels(levels, size) {
    this.levels = levels;
    this.size = size;
    this.labelled = new Set([...largest(levels, 'bid'), ...largest(levels, 'ask')]);
    this.requestUpdate?.();
  }

  paneViews() {
    // 'bottom' keeps the bars behind the candles
    return [{ zOrder: () => 'bottom', renderer: () => ({ draw: target => this.draw(target) }) }];
  }

  // The bucket whose bar is under a pane point (e.g. the crosshair), or null
  levelAt({ x, y }) {
    if (!this.series || !this.geometry) return null;
    const price = this.series.coordinateToPrice(y);
    if (price === null) return null;
    const level = this.levels.find(l => price >= l.price && price < l.price + this.size);
    if (!level) return null;
    const { width, maxWidth, maxValue } = this.geometry;
    const barWidth = ((level.bid + level.ask) / maxValue) * maxWidth;
    return x >= width - Math.max(barWidth, 8) ? level : null;
  }

  draw(target) {
    if (!this.series || !this.levels.length) return;
    target.useMediaCoordinateSpace(({ context: ctx, mediaSize }) => {
      const maxWidth = Math.min(mediaSize.width * 0.3, 280);
      const maxValue = Math.max(...this.levels.map(level => level.bid + level.ask));
      this.geometry = { width: mediaSize.width, maxWidth, maxValue };
      ctx.font = '11px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';

      for (const level of this.levels) {
        const yBottom = this.series.priceToCoordinate(level.price);
        const yTop = this.series.priceToCoordinate(level.price + this.size);
        if (yBottom === null || yTop === null || yBottom < 0 || yTop > mediaSize.height) continue;

        const span = yBottom - yTop;
        const height = Math.max(1, span > 3 ? span - 1 : span); // 1px gap between thick bars
        const bidWidth = (level.bid / maxValue) * maxWidth;
        const askWidth = (level.ask / maxValue) * maxWidth;

        let x = mediaSize.width - bidWidth;
        ctx.fillStyle = BID;
        ctx.fillRect(x, yTop, bidWidth, height);
        x -= askWidth;
        ctx.fillStyle = ASK;
        ctx.fillRect(x, yTop, askWidth, height);

        if (this.labelled.has(level)) {
          ctx.fillStyle = level.bid >= level.ask ? '#26a69a' : '#ef5350';
          ctx.fillText(formatValue(level.bid + level.ask), x - 4, yTop + height / 2);
        }
      }
    });
  }
}
