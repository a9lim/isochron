// Reading a run of the people prototype: the hyperbola's fit, the follow dial's wall-clock, years.

/** "3.2 Myr", "41 kyr", "530 yr", "6.1 days", "3.0 h". */
export function fmtYears(y) {
  const a = Math.abs(y), s = y < 0 ? '−' : '';
  if (a >= 1e6) return `${s}${(a / 1e6).toPrecision(3)} Myr`;
  if (a >= 1e3) return `${s}${(a / 1e3).toPrecision(3)} kyr`;
  if (a >= 1) return `${s}${a.toPrecision(3)} yr`;
  if (a * 365.25 >= 1) return `${s}${(a * 365.25).toPrecision(3)} days`;
  return `${s}${(a * 8766).toPrecision(3)} h`;
}

/**
 * y = C/(t* − t)^p fitted to the history's `key` from `from` on, weighted evenly in log(t* − t)
 * (each step by dt/(t* − t)), over t* from just past the end out to the span again; with the
 * exponential's R² on the same weights for comparison.
 */
export function fitHyperbola(h, from, key) {
  const pts = h.filter(x => x.t >= from && x[key] > 0);
  if (pts.length < 10) return null;
  const tEnd = pts.at(-1).t, span = tEnd - pts[0].t;
  const reg = (xs, ys, ws) => {
    let W = 0, mx = 0, my = 0;
    for (let k = 0; k < xs.length; k++) { W += ws[k]; mx += ws[k] * xs[k]; my += ws[k] * ys[k]; }
    mx /= W; my /= W;
    let sxx = 0, sxy = 0, syy = 0;
    for (let k = 0; k < xs.length; k++) { const dx = xs[k] - mx, dy = ys[k] - my; sxx += ws[k] * dx * dx; sxy += ws[k] * dx * dy; syy += ws[k] * dy * dy; }
    const b = sxy / sxx;
    return { b, a: my - b * mx, r2: 1 - (syy - b * sxy) / syy };
  };
  let best = null;
  for (let k = 0; k <= 400; k++) {
    const tStar = tEnd + span * Math.pow(10, -8 + 8 * k / 400);
    const xs = pts.map(x => Math.log(tStar - x.t)), ys = pts.map(x => Math.log(x[key])), ws = pts.map(x => x.dt / (tStar - x.t));
    const r = reg(xs, ys, ws);
    if (!best || r.r2 > best.r2) best = { tStar, p: -r.b, r2: r.r2, ws };
  }
  const e = reg(pts.map(x => x.t), pts.map(x => Math.log(x[key])), best.ws);
  best.r2exp = e.r2; delete best.ws;
  return best;
}

/**
 * The dial set so a doubling of the minds takes `secs` seconds, within the dial's range
 * (10^−3.5 to 10^7 yr/s): its wall-clock in all, and by era (before the first tip, foragers after
 * it, farmers, industry, compute), the eras by the history's own shares.
 */
export function followDial(h, secs) {
  let wall = 0;
  const eras = new Map();
  for (let k = 1; k < h.length; k++) {
    // The growth over the last 20 steps, so the dial reads the trend, not a step's noise.
    const a = h[Math.max(0, k - 20)], b = h[k];
    const g = Math.log(b.minds / a.minds) / (b.t - a.t);
    const rate = g > 1e-7 ? Math.min(1e7, Math.max(Math.pow(10, -3.5), Math.log(2) / g / secs)) : 1e7;
    const w = b.dt / rate;
    wall += w;
    const era = b.ind > 0.05 ? (b.zmax > 11 ? 'compute' : 'industry') : b.farm > 0.05 ? 'farmers' : b.zmax > 1 ? 'foragers' : 'hominins';
    eras.set(era, (eras.get(era) || 0) + w);
  }
  return { wall, eras: [...eras] };
}
