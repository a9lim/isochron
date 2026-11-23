// The Air chart's winds as streamlines, as a meteorological streamline chart
// draws the surface flow: lines everywhere tangent to the wind, evenly spaced,
// with arrowheads along them pointing downwind and a weight that is the speed.
// The wind is the climate's surface wind (src/engine/climate.js, `surfaceWind`)
// from its template's pressure at the shown date or the year's mean; the lines
// are traced off the page's thread (src/render/chart-worker.js) and redrawn
// each frame by reprojecting their points, as the plate boundaries are. The Sea
// chart's currents alike (src/engine/ocean.js, the gyres' surface current), on
// their own scale of speed (`CURRENT`).
//
// The spacing is Jobard and Lefer's (1997): a line is traced both ways from its
// seed until it comes within half the spacing of another line (or of itself,
// further back along it: a spiral into a low), the wind falls calm, or it turns
// back on itself; new seeds are tried a spacing away on either side of each
// line, and a seed closer than the spacing to any line is dropped. Once the
// lines' own seeds are spent, a fixed set of seeds over the sphere (the grid's
// coarse cells, fastest wind first) fills what the lines didn't reach.
import { nearest, cellCount } from '../grid/icosphere.js';

const CALM = 0.4;          // m/s: a line ends where the wind falls below this
/** The currents' scale: a line ends below `calm` (m/s), and its weight rises from a hairline at `slow` to the heaviest at `fast`. */
export const CURRENT = { calm: 0.01, slow: 0.02, fast: 0.15 };
const MAX_LEN = 2.4;       // rad: the longest line (the trades would otherwise ring the globe)

/** The wind at a unit vector, linear in the grid's triangle that holds it, in the tangent plane there. */
function sampler(g, wind) {
  const { pos, nbrOff, nbr } = g;
  let guess = 0;
  const det = (ax, ay, az, bx, by, bz, cx, cy, cz) => ax * (by * cz - bz * cy) + ay * (bz * cx - bx * cz) + az * (bx * cy - by * cx);
  return (x, y, z, out) => {
    const c = guess = nearest(g, x, y, z, guess);
    const o = nbrOff[c], d = nbrOff[c + 1] - o;
    const ax = pos[3 * c], ay = pos[3 * c + 1], az = pos[3 * c + 2];
    let best = -Infinity, wa = 1, wb = 0, wc = 0, jb = c, jc = c;
    // The point lies in one of its nearest cell's triangles (c, k, k + 1), counter-clockwise from outside.
    for (let k = 0; k < d; k++) {
      const j = nbr[o + k], l = nbr[o + (k + 1) % d];
      const bx = pos[3 * j], by = pos[3 * j + 1], bz = pos[3 * j + 2], cx = pos[3 * l], cy = pos[3 * l + 1], cz = pos[3 * l + 2];
      const a = det(x, y, z, bx, by, bz, cx, cy, cz), b = det(ax, ay, az, x, y, z, cx, cy, cz), e = det(ax, ay, az, bx, by, bz, x, y, z);
      const s = a + b + e, m = Math.min(a, b, e) / s;
      if (m > best) { best = m; wa = a / s; wb = b / s; wc = e / s; jb = j; jc = l; }
    }
    wa = Math.max(0, wa); wb = Math.max(0, wb); wc = Math.max(0, wc);
    const s = wa + wb + wc || 1;
    wa /= s; wb /= s; wc /= s;
    let vx = wa * wind[3 * c] + wb * wind[3 * jb] + wc * wind[3 * jc];
    let vy = wa * wind[3 * c + 1] + wb * wind[3 * jb + 1] + wc * wind[3 * jc + 1];
    let vz = wa * wind[3 * c + 2] + wb * wind[3 * jb + 2] + wc * wind[3 * jc + 2];
    const r = vx * x + vy * y + vz * z;
    vx -= r * x; vy -= r * y; vz -= r * z;
    out[0] = vx; out[1] = vy; out[2] = vz;
    return Math.hypot(vx, vy, vz);
  };
}

/**
 * Evenly spaced streamlines of `wind` (3 per cell of `g`, m/s) at spacing `dsep` (radians).
 * Returns { lines: [{ P: Float32Array(3m) unit vectors, V: Float32Array(m) speeds (m/s),
 * S: Float32Array(m) arc length (rad) }], maxWind }, each line running downwind.
 */
export function traceStreamlines(g, wind, dsep, calm = CALM) {
  const at = sampler(g, wind);
  const h = dsep / 4, dtest = 0.5 * dsep, maxSteps = Math.ceil(MAX_LEN / h);
  // The points traced so far, hashed on a 3D lattice of the spacing.
  let cap = 1 << 14, X = new Float64Array(cap), Y = new Float64Array(cap), Z = new Float64Array(cap), LID = new Int32Array(cap), SS = new Float64Array(cap), NEXT = new Int32Array(cap), np = 0;
  const head = new Map(), K = Math.ceil(1 / dsep) + 2, M = 2 * K + 1;
  const key = (i, j, k) => ((i + K) * M + (j + K)) * M + (k + K);
  const add = (x, y, z, line, s) => {
    if (np === cap) {
      cap *= 2;
      const grow = (a, C) => { const b = new C(cap); b.set(a); return b; };
      X = grow(X, Float64Array); Y = grow(Y, Float64Array); Z = grow(Z, Float64Array); LID = grow(LID, Int32Array); SS = grow(SS, Float64Array); NEXT = grow(NEXT, Int32Array);
    }
    X[np] = x; Y[np] = y; Z[np] = z; LID[np] = line; SS[np] = s;
    const kk = key(Math.floor(x / dsep), Math.floor(y / dsep), Math.floor(z / dsep));
    NEXT[np] = head.has(kk) ? head.get(kk) : -1;
    head.set(kk, np++);
  };
  // Is any point within `rad` of (x, y, z), other than the line's own within `skip` of arc s?
  const near = (x, y, z, rad, line = -1, s = 0, skip = 0) => {
    const i0 = Math.floor(x / dsep), j0 = Math.floor(y / dsep), k0 = Math.floor(z / dsep), r2 = rad * rad;
    for (let i = i0 - 1; i <= i0 + 1; i++) for (let j = j0 - 1; j <= j0 + 1; j++) for (let k = k0 - 1; k <= k0 + 1; k++) {
      let q = head.get(key(i, j, k));
      if (q === undefined) continue;
      for (; q >= 0; q = NEXT[q]) {
        const dx = X[q] - x, dy = Y[q] - y, dz = Z[q] - z;
        if (dx * dx + dy * dy + dz * dz >= r2) continue;
        if (LID[q] === line && Math.abs(SS[q] - s) < skip) continue;
        return true;
      }
    }
    return false;
  };

  const v = [0, 0, 0], v2 = [0, 0, 0];
  const lines = [];
  let maxWind = 0, nLine = 0;
  // One half of a line from its seed, downwind (sgn 1) or up (−1): points and speeds after the seed.
  const half = (x, y, z, sgn, line) => {
    const pts = [], spd = [];
    let s = 0;
    for (let n = 0; n < maxSteps; n++) {
      // The midpoint rule on the unit wind, the step's length h along the sphere.
      const a = at(x, y, z, v);
      if (a < calm) break;
      const mx = x + 0.5 * h * sgn * v[0] / a, my = y + 0.5 * h * sgn * v[1] / a, mz = z + 0.5 * h * sgn * v[2] / a, mr = Math.hypot(mx, my, mz);
      const b = at(mx / mr, my / mr, mz / mr, v2);
      if (b < calm || v[0] * v2[0] + v[1] * v2[1] + v[2] * v2[2] < 0) break;   // calm, or turning back (a stagnation point)
      let nx = x + h * sgn * v2[0] / b, ny = y + h * sgn * v2[1] / b, nz = z + h * sgn * v2[2] / b;
      const nr = Math.hypot(nx, ny, nz);
      nx /= nr; ny /= nr; nz /= nr;
      s += h;
      if (near(nx, ny, nz, dtest, line, sgn * s, 3 * dtest)) break;
      x = nx; y = ny; z = nz;
      pts.push(x, y, z); spd.push(b);
      add(x, y, z, line, sgn * s);
    }
    return { pts, spd };
  };
  const queue = [];
  const tryLine = (x, y, z) => {
    if (near(x, y, z, dsep)) return;
    const a = at(x, y, z, v);
    if (a < calm) return;
    const line = nLine++;
    add(x, y, z, line, 0);
    const fw = half(x, y, z, 1, line), bw = half(x, y, z, -1, line);
    const m = 1 + fw.spd.length + bw.spd.length;
    if (m < 2) return;
    const P = new Float32Array(3 * m), V = new Float32Array(m), S = new Float32Array(m);
    let k = 0;
    for (let q = bw.spd.length - 1; q >= 0; q--, k++) { P[3 * k] = bw.pts[3 * q]; P[3 * k + 1] = bw.pts[3 * q + 1]; P[3 * k + 2] = bw.pts[3 * q + 2]; V[k] = bw.spd[q]; }
    P[3 * k] = x; P[3 * k + 1] = y; P[3 * k + 2] = z; V[k] = a; k++;
    for (let q = 0; q < fw.spd.length; q++, k++) { P[3 * k] = fw.pts[3 * q]; P[3 * k + 1] = fw.pts[3 * q + 1]; P[3 * k + 2] = fw.pts[3 * q + 2]; V[k] = fw.spd[q]; }
    for (let q = 1; q < m; q++) S[q] = S[q - 1] + Math.hypot(P[3 * q] - P[3 * q - 3], P[3 * q + 1] - P[3 * q - 2], P[3 * q + 2] - P[3 * q - 1]);
    const l = { P, V, S };
    queue.push(l);
    // Stubs (a seed squeezed between lines) keep their room but aren't drawn.
    if (S[m - 1] < 1.5 * dsep) return;
    for (let q = 0; q < m; q++) maxWind = Math.max(maxWind, V[q]);
    lines.push(l);
  };
  // The fixed seeds: the cells of a level about twice as coarse as the spacing, fastest wind first.
  let lv = 2;
  while (lv < g.level && Math.sqrt(4 * Math.PI / cellCount(lv)) > 1.5 * dsep) lv++;
  const ns = Math.min(g.n, cellCount(lv)), sp = new Float64Array(ns);
  for (let i = 0; i < ns; i++) sp[i] = Math.hypot(wind[3 * i], wind[3 * i + 1], wind[3 * i + 2]);
  const order = Array.from({ length: ns }, (_, i) => i).sort((a, b) => sp[b] - sp[a]);
  const pos = g.pos;
  for (const i of order) {
    tryLine(pos[3 * i], pos[3 * i + 1], pos[3 * i + 2]);
    // Each line's own seeds, a spacing to either side of every other point.
    while (queue.length) {
      const { P, V } = queue.shift(), m = V.length;
      for (let q = 0; q < m; q += 2) {
        const x = P[3 * q], y = P[3 * q + 1], z = P[3 * q + 2];
        const qa = Math.max(0, q - 1), qb = Math.min(m - 1, q + 1);
        let tx = P[3 * qb] - P[3 * qa], ty = P[3 * qb + 1] - P[3 * qa + 1], tz = P[3 * qb + 2] - P[3 * qa + 2];
        // The side: x × t, in the tangent plane.
        let sx = y * tz - z * ty, sy = z * tx - x * tz, sz = x * ty - y * tx;
        const sr = Math.hypot(sx, sy, sz);
        if (!(sr > 0)) continue;
        sx /= sr; sy /= sr; sz /= sr;
        for (const sg of [1, -1]) {
          let cx = x + sg * dsep * sx, cy = y + sg * dsep * sy, cz = z + sg * dsep * sz;
          const cr = Math.hypot(cx, cy, cz);
          tryLine(cx / cr, cy / cr, cz / cr);
        }
      }
    }
  }
  return { lines, maxWind };
}

const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const NB = 6;              // line weights: one path each
/** Arrowheads come about every STREAM_GAP spacings of arc along a line (~80 px on a globe of 380 px). */
export const STREAM_GAP = 3.5;
const W0 = 0.4, W1 = 1.3;  // px: a line's weight in light air, and what the strongest winds add
/** A line's weight (px at scale 1) by the wind's speed: a hairline in light air, ~1.7 px past 12 m/s. */
export const streamWidth = speed => W0 + W1 * smooth(1, 12, speed);
/** A current's, on CURRENT's scale. */
export const currentWidth = speed => W0 + W1 * smooth(CURRENT.slow, CURRENT.fast, speed);

/**
 * The streamlines on the 2D overlay: each set ({ lines, alpha, gap, width }) reprojected, its segments
 * in weight classes, and arrowheads spread evenly along each line (about one per `gap` radians
 * of arc), pointing downwind. `lw` scales the weights (the symbols' scale); a set's `width` maps its
 * speed to a weight (streamWidth's when none).
 */
export function drawStreamlines(ctx, cx, cy, r, camera, sets, ink, lw) {
  const v = [0, 0, 0];
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  for (const set of sets) {
    if (!set || !set.lines || !(set.alpha > 0.01)) continue;
    const width = set.width || streamWidth;
    const paths = Array.from({ length: NB }, () => new Path2D()), heads = new Path2D();
    let sx = new Float32Array(256), sy = new Float32Array(256), vis = new Uint8Array(256);
    for (const l of set.lines) {
      const { P, V, S } = l, m = V.length;
      if (sx.length < m) { sx = new Float32Array(2 * m); sy = new Float32Array(2 * m); vis = new Uint8Array(2 * m); }
      let any = false;
      for (let k = 0; k < m; k++) {
        camera.view(P[3 * k], P[3 * k + 1], P[3 * k + 2], v);
        sx[k] = cx + v[0] * r; sy[k] = cy - v[1] * r; vis[k] = v[2] > 0.03 ? 1 : 0;
        any = any || vis[k] === 1;
      }
      if (!any) continue;
      let lastB = -1;
      for (let k = 0; k < m - 1; k++) {
        if (!vis[k] || !vis[k + 1]) { lastB = -1; continue; }
        const b = Math.min(NB - 1, Math.floor(NB * (width(0.5 * (V[k] + V[k + 1])) - W0) / W1));
        if (b !== lastB) paths[b].moveTo(sx[k], sy[k]);
        paths[b].lineTo(sx[k + 1], sy[k + 1]);
        lastB = b;
      }
      // Arrowheads, evenly along the line.
      const L = S[m - 1], na = Math.max(1, Math.round(L / set.gap));
      let k = 0;
      for (let a = 0; a < na; a++) {
        const s = (a + 0.5) * L / na;
        while (k < m - 2 && S[k + 1] < s) k++;
        if (!vis[k] || !vis[k + 1]) continue;
        const f = (s - S[k]) / Math.max(1e-9, S[k + 1] - S[k]);
        const px = sx[k] + f * (sx[k + 1] - sx[k]), py = sy[k] + f * (sy[k + 1] - sy[k]);
        let tx = sx[k + 1] - sx[k], ty = sy[k + 1] - sy[k];
        const tl = Math.hypot(tx, ty);
        if (tl < 1e-3) continue;
        tx /= tl; ty /= tl;
        const w = width(V[k]) * lw, len = 2.6 + 2.2 * w, half = 1.1 + 1.0 * w;
        heads.moveTo(px + 0.55 * len * tx, py + 0.55 * len * ty);
        heads.lineTo(px - 0.45 * len * tx - half * ty, py - 0.45 * len * ty + half * tx);
        heads.lineTo(px - 0.45 * len * tx + half * ty, py - 0.45 * len * ty - half * tx);
        heads.closePath();
      }
    }
    ctx.globalAlpha = set.alpha;
    ctx.strokeStyle = ink; ctx.fillStyle = ink;
    for (let b = 0; b < NB; b++) { ctx.lineWidth = (W0 + W1 * (b + 0.5) / NB) * lw; ctx.stroke(paths[b]); }
    ctx.fill(heads);
    ctx.globalAlpha = 1;
  }
}
