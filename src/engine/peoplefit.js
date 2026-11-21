// The people's hyperbola, read off their record (docs/MODEL.md), for the headless runs
// (tools/people-run.mjs) and the People figure (Fig. 8, from the people's thread).

/**
 * y = C/(t* − t)^p fitted to the history's `key` between `from` and `to`, weighted evenly in
 * log(t* − t) (each step by dt/(t* − t)), over t* from just past the end out to the span again;
 * with the exponential's R² on the same weights for comparison. Standard (von Foerster and others
 * 1960's form; the log-log regression is the usual reading of it).
 */
export function fitHyperbola(h, from, key, to = Infinity) {
  const pts = h.filter(x => x.t >= from && x.t <= to && x[key] > 0);
  if (pts.length < 10) return null;
  const tEnd = pts.at(-1).t, span = tEnd - pts[0].t;
  if (!(span > 0)) return null;
  const reg = (xs, ys, ws) => {
    let W = 0, mx = 0, my = 0;
    for (let k = 0; k < xs.length; k++) { W += ws[k]; mx += ws[k] * xs[k]; my += ws[k] * ys[k]; }
    mx /= W; my /= W;
    let sxx = 0, sxy = 0, syy = 0;
    for (let k = 0; k < xs.length; k++) { const dx = xs[k] - mx, dy = ys[k] - my; sxx += ws[k] * dx * dx; sxy += ws[k] * dx * dy; syy += ws[k] * dy * dy; }
    const b = sxy / sxx;
    return { b, a: my - b * mx, r2: 1 - (syy - b * sxy) / syy };
  };
  const ys = pts.map(x => Math.log(x[key]));
  let best = null;
  for (let k = 0; k <= 400; k++) {
    const tStar = tEnd + span * Math.pow(10, -8 + 8 * k / 400);
    const xs = pts.map(x => Math.log(tStar - x.t)), ws = pts.map(x => x.dt / (tStar - x.t));
    const r = reg(xs, ys, ws);
    if (!best || r.r2 > best.r2) best = { tStar, p: -r.b, r2: r.r2, ws };
  }
  const e = reg(pts.map(x => x.t), ys, best.ws);
  best.r2exp = e.r2; delete best.ws;
  return best;
}

/** The index of the last row with t ≤ x (rows by t). */
function before(t, x) {
  let lo = 0, hi = t.length - 1;
  if (!(hi >= 0) || x < t[0]) return -1;
  while (lo < hi) { const m = (lo + hi + 1) >> 1; if (t[m] <= x) lo = m; else hi = m - 1; }
  return lo;
}

/**
 * The history thinned to about n rows evenly spaced in log(tEnd + ε − t) between `from` and `to`,
 * each row's dt the span since the last kept (so the fit's weights still sum the record's time).
 */
function thin(h, from, to, n) {
  const rows = h.filter(x => x.t >= from && x.t <= to);
  if (rows.length <= n) return rows;
  const ts = rows.map(x => x.t), tEnd = ts.at(-1), eps = Math.max(1e-6, (tEnd - ts[0]) * 1e-9);
  const a = Math.log(tEnd + eps - ts[0]), b = Math.log(eps), out = [];
  let last = -1;
  for (let k = 0; k <= n; k++) {
    const i = Math.max(0, before(ts, tEnd + eps - Math.exp(a + (b - a) * k / n)));
    if (i <= last) continue;
    out.push({ ...rows[i], dt: last >= 0 ? rows[i].t - rows[last].t : rows[i].dt });
    last = i;
  }
  return out;
}

/**
 * Fig. 8's data from a People: the hyperbola's fits (minds and people, from the tip to the dial),
 * its axis log₁₀(t* − t), the record on it (people, minds) and the events. Null before there is a
 * record.
 */
export function figureOf(p, n = 240) {
  const h = p.history;
  if (h.length < 10) return null;
  const tip = p.events.find(e => e.kind === 'tip'), from = tip ? tip.t : h[0].t;
  const to = p.dialAt ?? h.at(-1).t;
  const pts = thin(h, from, to, 600);
  const fm = fitHyperbola(pts, from, 'minds', to), fp = fitHyperbola(pts, from, 'people', to);
  const fit = fm && fm.r2 > 0.5 ? fm : fp && fp.r2 > 0.5 ? fp : null;
  const t0 = h[0].t, tNow = h.at(-1).t;
  const tStar = fit ? fit.tStar : tNow + Math.max(1, 0.05 * (tNow - t0));
  // The axis: from the origin to as near t* as the record comes (or a day short of it).
  const near = Math.max(1 / 365.25, tStar - Math.min(tNow, to));
  const x0 = Math.log10(tStar - t0), x1 = Math.log10(near);
  const ts = h.map(x => x.t), series = [];
  for (let k = 0; k <= n; k++) {
    const x = x0 + (x1 - x0) * k / n, i = before(ts, tStar - Math.pow(10, x));
    if (i < 0 || (series.length && series.at(-1).i === i)) continue;
    const r = h[i];
    series.push({ i, x: Math.log10(tStar - r.t), people: r.people, minds: r.minds });
  }
  const firsts = {};
  for (const e of p.events) if (['origin', 'tip', 'farming', 'industry', 'present', 'dial'].includes(e.kind) && !(e.kind in firsts)) firsts[e.kind] = e.t;
  const events = Object.entries(firsts).filter(([, t]) => tStar - t >= near).map(([kind, t]) => ({ kind, x: Math.log10(tStar - t) }));
  const strip = f => f ? { tStar: f.tStar, p: f.p, r2: f.r2, r2exp: f.r2exp } : null;
  return { tStar, now: tNow, to, x0, x1, fit: strip(fit), minds: strip(fm), people: strip(fp), which: fit === fm ? 'minds' : fit ? 'people' : null, series, events };
}
