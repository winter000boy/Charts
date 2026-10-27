// Support and resistance from swing highs and lows.
// A swing high is a bar whose high is the highest of `swing` bars on each side (and the reverse for lows).
// Swings within a small price distance are merged into one level; a level touched more often is stronger.

function swings(bars, swing) {
  const points = [];
  for (let i = swing; i < bars.length - swing; i++) {
    let isHigh = true;
    let isLow = true;
    for (let j = i - swing; j <= i + swing && (isHigh || isLow); j++) {
      if (j === i) continue;
      if (bars[j].high >= bars[i].high) isHigh = false;
      if (bars[j].low <= bars[i].low) isLow = false;
    }
    if (isHigh) points.push({ price: bars[i].high, time: bars[i].time });
    if (isLow) points.push({ price: bars[i].low, time: bars[i].time });
  }
  return points;
}

// Average true range: the typical bar size, used as the merge distance so it scales with the timeframe
function atr(bars, period = 14) {
  const ranges = bars.slice(1).map((bar, i) => {
    const prevClose = bars[i].close;
    return Math.max(bar.high - bar.low, Math.abs(bar.high - prevClose), Math.abs(bar.low - prevClose));
  });
  const recent = ranges.slice(-period * 10);
  return recent.reduce((sum, r) => sum + r, 0) / (recent.length || 1);
}

export function findLevels(bars, { swing = 5, count = 8 } = {}) {
  if (bars.length < swing * 2 + 2) return [];
  const tolerance = atr(bars) * 0.5;
  const points = swings(bars, swing).sort((a, b) => a.price - b.price);

  const clusters = [];
  for (const point of points) {
    const last = clusters.at(-1);
    if (last && point.price - last.price <= tolerance) {
      last.points.push(point);
      last.price = last.points.reduce((sum, p) => sum + p.price, 0) / last.points.length;
    } else {
      clusters.push({ price: point.price, points: [point] });
    }
  }

  const firstTime = bars[0].time;
  const span = bars.at(-1).time - firstTime || 1;
  const close = bars.at(-1).close;
  return clusters
    .map(c => {
      const lastTouch = Math.max(...c.points.map(p => p.time));
      // Touches count most; recent touches add up to one extra point
      const score = c.points.length + (lastTouch - firstTime) / span;
      return { price: c.price, touches: c.points.length, lastTouch, score, kind: c.price <= close ? 'support' : 'resistance' };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, count)
    .sort((a, b) => b.price - a.price);
}
