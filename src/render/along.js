// Symbols pinned to their lines. Each line's points carry u, a coordinate along
// the line in radians that every retrace inherits from its predecessor's at the
// corresponding point (overlay.js, `correspond`: each new point's nearest point
// on the old line). Symbols sit at fixed values of u, so when a line moves they
// move across it with it, and its ends advance or retreat over symbols that stay
// put, where symbols counted from the line's start slid along it with every change
// at that end.
//
// The marks are a lattice in u. At the globe's usual zoom every 16th node shows,
// spaced at the symbol's gap on screen. Where a line is foreshortened (toward the
// limb) half of them shrink away, an octave at a time, and zoomed in past the
// symbols' largest scale the next octave grows in between, as the patterns'
// octaves do on the globe. A change of view never slides a mark either.
//
// Dashes, dots and zigzags follow u the same way, at a period that is their
// pattern's on screen at the usual zoom.

const R0 = 380;            // px: the globe's radius on screen at which symbols are at scale 1
const START = 0.0171;      // a new line's u at its first point, so no mark sits on its junction

/** Cumulative chord length along a polyline of unit vectors (radians, near enough). */
function arcLength(P) {
  const m = P.length / 3, s = new Float64Array(m);
  for (let k = 1; k < m; k++) s[k] = s[k - 1] + Math.hypot(P[3 * k] - P[3 * k - 3], P[3 * k + 1] - P[3 * k - 2], P[3 * k + 2] - P[3 * k - 1]);
  return s;
}

/** A line with no predecessor: u is its arc length. */
export function freshU(l) {
  const s = arcLength(l.P);
  l.u = Float32Array.from(s, x => x + START);
  l.u0 = l.u; l.us = 1;
}

/**
 * u inherited from a predecessor through the correspondence `corr` (each new point's
 * segment and fraction on the old line; `flip` if the old line runs the other way).
 * `u0` is the inherited value itself, which the line morphs from, so at the start of
 * a morph every mark is where it was. `u` (what it morphs to, and what the next line
 * inherits) is arc length plus the inherited offset smoothed over ~±250 km (the
 * correspondence's own jitter); a tenth of each retrace's stretch is let go, so a
 * growing line's marks keep their spacing. Points beyond the old line's ends carry
 * its coordinate on at arc length.
 */
export function inheritU(l, prev, corr, flip) {
  const P = l.P, m = P.length / 3, n = prev.P.length / 3, pu = prev.u;
  if (!pu || !corr || m < 2 || n < 2) return freshU(l);
  const s = arcLength(P), sg = (prev.us || 1) * (flip ? -1 : 1);
  const u0 = new Float32Array(m), c = new Float64Array(m), ok = new Uint8Array(m);
  let any = false;
  for (let k = 0; k < m; k++) {
    const j = Math.min(n - 2, corr[2 * k]), t = corr[2 * k + 1];
    u0[k] = pu[j] + t * (pu[j + 1] - pu[j]);
    // The ends are pinned to the old ends, and a point whose nearest old point is an old end lies past it.
    ok[k] = k > 0 && k < m - 1 && !(j === 0 && t <= 1e-6) && !(j === n - 2 && t >= 1 - 1e-6) ? 1 : 0;
    if (ok[k]) { c[k] = u0[k] - sg * s[k]; any = true; }
  }
  if (!any) { const k = m >> 1; c.fill(u0[k] - sg * s[k]); }
  else {
    // Unmatched points take the offset of the nearest match before them (the leading ones, the first).
    let last = c[ok.indexOf(1)];
    for (let k = 0; k < m; k++) if (ok[k]) last = c[k]; else c[k] = last;
  }
  // Smoothed (two box passes over ±0.04 rad), then a tenth of the departure from the mean let go.
  const h = s[m - 1] / (m - 1) || 1e-3, K = Math.max(1, Math.min(m >> 1, Math.round(0.04 / h)));
  box(c, K); box(c, K);
  let cbar = 0;
  for (let k = 0; k < m; k++) cbar += c[k];
  cbar /= m;
  const u = new Float32Array(m);
  for (let k = 0; k < m; k++) u[k] = sg * s[k] + cbar + 0.9 * (c[k] - cbar);
  // Kept monotone, outward from the middle: a mark is never met twice.
  const mid = m >> 1;
  for (let k = mid + 1; k < m; k++) { const ds = s[k] - s[k - 1], d = sg * (u[k] - u[k - 1]); if (d < 0.5 * ds) u[k] = u[k - 1] + sg * 0.5 * ds; else if (d > 2 * ds) u[k] = u[k - 1] + sg * 2 * ds; }
  for (let k = mid - 1; k >= 0; k--) { const ds = s[k + 1] - s[k], d = sg * (u[k + 1] - u[k]); if (d < 0.5 * ds) u[k] = u[k + 1] - sg * 0.5 * ds; else if (d > 2 * ds) u[k] = u[k + 1] - sg * 2 * ds; }
  l.u = u; l.u0 = u0; l.us = sg;
}

function box(c, K) {
  const m = c.length, pre = new Float64Array(m + 1);
  for (let k = 0; k < m; k++) pre[k + 1] = pre[k] + c[k];
  for (let k = 0; k < m; k++) { const a = Math.max(0, k - K), b = Math.min(m, k + K + 1); c[k] = (pre[b] - pre[a]) / (b - a); }
}

/** The coordinate shown at a morph's φ: from the inherited value to the relaxed one. */
export function shownU(l, phi) {
  if (!l.u) freshU(l);
  if (!l.prev || phi >= 1 || l.u0 === l.u) return l.u;
  const u = l.u, u0 = l.u0, out = l.uBuf && l.uBuf.length === u.length ? l.uBuf : (l.uBuf = new Float32Array(u.length));
  for (let k = 0; k < u.length; k++) out[k] = u0[k] + phi * (u[k] - u0[k]);
  return out;
}

const ctz = q => q === 0 ? 31 : 31 - Math.clz32(q & -q);

/**
 * A line's octave on screen: per point, log₂ of the lattice nodes between marks
 * (4 at the usual zoom, face on; more where foreshortened). The same for every
 * symbol, whatever its gap; NaN segments don't show.
 */
export function octaves(sx, sy, vis, u, sc) {
  const M = sx.length, seg = new Float32Array(M), pt = new Float32Array(M), cnt = new Uint8Array(M), c = 16 * R0 * sc;
  for (let k = 0; k < M - 1; k++) {
    if (!vis[k] || !vis[k + 1]) { seg[k] = NaN; continue; }
    const du = Math.abs(u[k + 1] - u[k]), dx = sx[k + 1] - sx[k], dy = sy[k + 1] - sy[k], d = Math.sqrt(dx * dx + dy * dy);
    if (!(du > 1e-9) || !(d > 1e-6)) { seg[k] = NaN; continue; }
    const l = Math.log2(c * du / d);
    seg[k] = l; pt[k] += l; cnt[k]++; pt[k + 1] += l; cnt[k + 1]++;
  }
  for (let k = 0; k < M; k++) pt[k] = cnt[k] ? pt[k] / cnt[k] : 0;
  return { seg, pt };
}

/**
 * Walk a line's marks on screen: sx, sy its projected points, u its coordinate, `gap`
 * the marks' spacing in px at the usual zoom (before the symbol scale), `oct` the
 * line's octaves. fn(x, y, tx, ty, size, k, q): position, the segment's direction on
 * screen, size in (0, 1] (1 = full, less as the octave fades), the segment, and the
 * lattice node (q / 16 counts the usual zoom's marks).
 */
export function marks(sx, sy, u, gap, oct, fn) {
  const M = sx.length, base = gap / R0 / 16, segL = oct.seg, pl = oct.pt;
  for (let k = 0; k < M - 1; k++) {
    if (!(segL[k] === segL[k])) continue;
    const ua = u[k], ub = u[k + 1], la = pl[k], lb = pl[k + 1];
    const step = 2 ** Math.max(0, Math.floor(Math.min(la, lb) - 1));   // nodes finer than this are hidden
    const lo = Math.min(ua, ub) / base, hi = Math.max(ua, ub) / base;
    let q = Math.ceil(lo / step) * step;
    if (q >= hi) continue;
    const dx = sx[k + 1] - sx[k], dy = sy[k + 1] - sy[k], seg = Math.sqrt(dx * dx + dy * dy), tx = dx / seg, ty = dy / seg;
    for (; q < hi; q += step) {
      const f = (q * base - ua) / (ub - ua), l = la + f * (lb - la);
      const size = Math.min(1, 2 * (ctz(Math.abs(q)) - l) + 2);
      if (size <= 0.03) continue;
      fn(sx[k] + f * (sx[k + 1] - sx[k]), sy[k] + f * (sy[k + 1] - sy[k]), tx, ty, size, k, q);
    }
  }
}

/**
 * Dashes pinned to the line: the pieces of each segment k with seg(k) where u, in units of
 * the pattern's period, falls in an "on" interval. `pattern` is [on, off, …] in px at
 * symbol scale 1, `sc` the symbol scale and `r` the globe's radius on screen (the
 * period in u is the pattern's length on screen over r, constant within the symbol
 * scale's range); pieces go to `path`.
 */
export function dashes(path, sx, sy, seg, u, pattern, sc, r) {
  let total = 0;
  for (const d of pattern) total += d;
  const per = total * sc / r, ons = [];
  for (let i = 0, a = 0; i < pattern.length; i += 2) { ons.push([a / total, (a + pattern[i]) / total]); a += pattern[i] + (pattern[i + 1] || 0); }
  for (let k = 0; k < sx.length - 1; k++) {
    if (!seg(k)) continue;
    const ua = u[k] / per, ub = u[k + 1] / per, lo = Math.min(ua, ub), hi = Math.max(ua, ub);
    if (!(hi > lo)) continue;
    for (let p = Math.floor(lo); p < hi; p++) for (const [a, b] of ons) {
      const s0 = Math.max(lo, p + a), s1 = Math.min(hi, p + b);
      if (s1 <= s0) continue;
      const f0 = (s0 - ua) / (ub - ua), f1 = (s1 - ua) / (ub - ua);
      path.moveTo(sx[k] + f0 * (sx[k + 1] - sx[k]), sy[k] + f0 * (sy[k + 1] - sy[k]));
      path.lineTo(sx[k] + f1 * (sx[k + 1] - sx[k]), sy[k] + f1 * (sy[k + 1] - sy[k]));
    }
  }
}
