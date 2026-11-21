// Plate boundaries as smooth lines.
//
// The boundary between two plates runs along Voronoi edges of the grid, so
// drawn edge by edge it is a stair of hexagon sides, and classified edge by
// edge it flickers between ridge, trench and transform as each side's angle
// swings ±60°. Instead:
//   1. trace the boundary edges into polylines between triple junctions
//      (one polyline separates one pair of plates, left and right);
//   2. smooth each polyline (a Laplacian pass removes the stair, Chaikin
//      corner-cutting rounds it: two rounds at level 6, one at level 7, ~27 km
//      apart either way), on the sphere, junctions fixed;
//   3. classify every point of the smoothed line from the two plates' own
//      rotations there: the relative velocity's component across the line
//      (opening or closing) against its component along it (sliding), averaged
//      along the line so a boundary reads in long runs.
// Each point keeps which side stays on top at a trench and whether the plate
// going down is ocean (so an arc of volcanoes stands on the other side).

export const INACTIVE = 0, RIDGE = 1, TRENCH = 2, TRANSFORM = 3;
const SLOW = 0.3 / 637.1;      // rad/Myr: under 0.3 cm/yr a boundary is drawn as inactive
const OBLIQUE = 0.42;          // |across| / |relative| beyond which a boundary opens or closes
const RUN = 4;                 // half-window (points) of the running mean along the line

export function traceBoundaries(tec) {
  const g = tec.grid, n = g.n, nbrOff = g.nbrOff, nbr = g.nbr, corner = g.corner, owner = tec.owner;
  // Boundary edges, each oriented with its left cell (CCW around `left`).
  const eC0 = [], eC1 = [], eL = [], eR = [];
  for (let i = 0; i < n; i++) {
    const o = nbrOff[i], d = nbrOff[i + 1] - o;
    for (let k = 0; k < d; k++) {
      const j = nbr[o + k];
      if (j < i || owner[j] === owner[i]) continue;
      eC0.push(corner[o + (k + d - 1) % d]); eC1.push(corner[o + k]); eL.push(i); eR.push(j);
    }
  }
  const m = eC0.length;
  // Corner → incident boundary edges (at most 3).
  const inc = new Int32Array(3 * g.nf).fill(-1), deg = new Uint8Array(g.nf);
  for (let e = 0; e < m; e++) {
    const c0 = eC0[e], c1 = eC1[e];
    if (deg[c0] < 3) inc[3 * c0 + deg[c0]] = e;
    deg[c0]++;
    if (deg[c1] < 3) inc[3 * c1 + deg[c1]] = e;
    deg[c1]++;
  }
  const used = new Uint8Array(m);
  const lines = [];

  const walk = (startCorner, e0, closed) => {
    const corners = [startCorner], cells = [];
    let c = startCorner, e = e0;
    for (;;) {
      used[e] = 1;
      const fwd = eC0[e] === c;
      const next = fwd ? eC1[e] : eC0[e];
      cells.push(fwd ? eL[e] : eR[e], fwd ? eR[e] : eL[e]);
      corners.push(next);
      c = next;
      if (deg[c] !== 2) break;
      let ne = -1;
      for (let s = 0; s < 2; s++) { const x = inc[3 * c + s]; if (x >= 0 && !used[x]) ne = x; }
      if (ne < 0) break;
      e = ne;
    }
    lines.push(build(tec, corners, cells, closed && corners[0] === corners[corners.length - 1]));
  };

  for (let c = 0; c < g.nf; c++) {
    if (deg[c] === 0 || deg[c] === 2) continue;
    for (let s = 0; s < Math.min(3, deg[c]); s++) { const e = inc[3 * c + s]; if (e >= 0 && !used[e]) walk(c, e, false); }
  }
  for (let e = 0; e < m; e++) if (!used[e]) walk(eC0[e], e, true);
  return lines;
}

/** A smoothed, classified polyline from Voronoi corners and the cells on either side. */
function build(tec, corners, cells, closed) {
  const g = tec.grid, C = g.centre;
  const left = tec.owner[cells[0]], right = tec.owner[cells[1]];
  // Per segment: which side stays on top (+1 left) and whether ocean goes down.
  const segs = corners.length - 1;
  let P = new Float64Array(3 * corners.length);
  for (let k = 0; k < corners.length; k++) { const c = corners[k]; P[3 * k] = C[3 * c]; P[3 * k + 1] = C[3 * c + 1]; P[3 * k + 2] = C[3 * c + 2]; }
  let over = new Float64Array(corners.length), arc = new Float64Array(corners.length);
  for (let s = 0; s < segs; s++) {
    const a = cells[2 * s], b = cells[2 * s + 1];
    const ba = tec.buoyancyAt(a), bb = tec.buoyancyAt(b);
    const o = ba >= bb ? 1 : -1;
    const down = o > 0 ? b : a;
    const oc = tec.phi[down] < 0.5 ? 1 : 0;
    over[s] += 0.5 * o; over[s + 1] += 0.5 * o;
    arc[s] += 0.5 * oc; arc[s + 1] += 0.5 * oc;
  }
  if (!closed) { over[0] *= 2; over[segs] *= 2; arc[0] *= 2; arc[segs] *= 2; }
  else { over[0] = over[segs] = over[0] + over[segs]; arc[0] = arc[segs] = arc[0] + arc[segs]; }
  // Which side stays on top, and whether ocean goes down, read in runs: where the two
  // plates' buoyancy is close, the per-segment sign alternates and the teeth would jump
  // from side to side. A wide running mean, then runs shorter than ~4 cells take their
  // neighbours' value (a real flip of a trench's polarity is long).
  const W = Math.max(3, Math.round(3 * Math.sqrt(g.n / 40962)));
  over = runs(over, W, closed, v => v >= 0 ? 1 : -1);
  arc = runs(arc, W, closed, v => v > 0.5 ? 1 : 0);

  // Laplacian passes take out the hexagons' stair; ends (junctions) stay put.
  const N = corners.length;
  // Six at level 6 (a boundary re-traced each step then barely shifts), more on finer grids.
  const passes = Math.round(6 * Math.sqrt(g.n / 40962));
  let Q = new Float64Array(P.length);
  for (let pass = 0; pass < passes; pass++) {
    Q.set(P);
    for (let k = 0; k < N; k++) {
      let a = k - 1, b = k + 1;
      if (closed) { a = (k - 1 + N - 1) % (N - 1); b = (k + 1) % (N - 1); }
      else if (k === 0 || k === N - 1) continue;
      for (let c = 0; c < 3; c++) Q[3 * k + c] = 0.5 * P[3 * k + c] + 0.25 * (P[3 * a + c] + P[3 * b + c]);
      normalize(Q, k);
    }
    if (closed) for (let c = 0; c < 3; c++) Q[3 * (N - 1) + c] = Q[c];
    const t = P; P = Q; Q = t;
  }
  // Chaikin: twice at level 6, so points lie ~27 km apart (~1.6 px at the usual zoom); once on
  // the finer grid, which starts with them twice as close (twice there doubled every line's
  // points, and the page's cost of placing, matching and drawing them, for nothing seen).
  const rounds = Math.max(1, Math.round(2 - Math.log2(g.n / 40962) / 2));
  for (let it = 0; it < rounds; it++) ({ P, over, arc } = chaikin(P, over, arc, closed));

  // Classify each point from the plates' rotations.
  const M = P.length / 3;
  const wl = tec.plates[left].w, wr = tec.plates[right].w;
  const dw = [wr[0] - wl[0], wr[1] - wl[1], wr[2] - wl[2]];
  const ratio = new Float64Array(M), speed = new Float64Array(M), slide = new Float64Array(M);
  const T = new Float64Array(3 * M), L = new Float64Array(3 * M);
  for (let k = 0; k < M; k++) {
    const a = Math.max(0, k - 1), b = Math.min(M - 1, k + 1);
    let tx = P[3 * b] - P[3 * a], ty = P[3 * b + 1] - P[3 * a + 1], tz = P[3 * b + 2] - P[3 * a + 2];
    const px = P[3 * k], py = P[3 * k + 1], pz = P[3 * k + 2];
    const dot = tx * px + ty * py + tz * pz;
    tx -= dot * px; ty -= dot * py; tz -= dot * pz;
    const tr = Math.sqrt(tx * tx + ty * ty + tz * tz) || 1;
    tx /= tr; ty /= tr; tz /= tr;
    // Left of the direction of travel: p × t.
    const lx = py * tz - pz * ty, ly = pz * tx - px * tz, lz = px * ty - py * tx;
    T[3 * k] = tx; T[3 * k + 1] = ty; T[3 * k + 2] = tz;
    L[3 * k] = lx; L[3 * k + 1] = ly; L[3 * k + 2] = lz;
    // Right plate relative to left: (ω_R − ω_L) × p.
    const vx = dw[1] * pz - dw[2] * py, vy = dw[2] * px - dw[0] * pz, vz = dw[0] * py - dw[1] * px;
    const v = Math.sqrt(vx * vx + vy * vy + vz * vz);
    const across = -(vx * lx + vy * ly + vz * lz);      // toward the right: opening
    speed[k] = v;
    ratio[k] = v > 0 ? across / v : 0;
    slide[k] = vx * tx + vy * ty + vz * tz;
  }
  const smooth = running(ratio, RUN);
  const type = new Uint8Array(M);
  for (let k = 0; k < M; k++) {
    type[k] = speed[k] < SLOW ? INACTIVE : smooth[k] > OBLIQUE ? RIDGE : smooth[k] < -OBLIQUE ? TRENCH : TRANSFORM;
  }
  return { P, T, L, type, over, arc, slide, closed, left, right };
}

function normalize(P, k) {
  const x = P[3 * k], y = P[3 * k + 1], z = P[3 * k + 2], r = Math.sqrt(x * x + y * y + z * z);
  P[3 * k] /= r; P[3 * k + 1] /= r; P[3 * k + 2] /= r;
}

/** A per-corner value as runs: the mean over ±W corners, classified, and runs under 2W absorbed. */
function runs(x, W, closed, cls) {
  const N = x.length, sm = new Float64Array(N), out = new Float64Array(N);
  for (let k = 0; k < N; k++) {
    let s = 0, c = 0;
    for (let d = -W; d <= W; d++) {
      let j = k + d;
      if (closed) j = ((j % (N - 1)) + (N - 1)) % (N - 1);
      else if (j < 0 || j >= N) continue;
      s += x[j]; c++;
    }
    out[k] = cls(s / c);
  }
  for (let k = 0; k < N;) {
    let e = k;
    while (e < N && out[e] === out[k]) e++;
    if (e - k < 2 * W && (k > 0 || e < N)) { const fill = k > 0 ? out[k - 1] : out[e]; for (let q = k; q < e; q++) out[q] = fill; }
    k = e;
  }
  return out;
}

/** Corner-cutting: each segment gives points at ¼ and ¾, plus the two ends (open) or the closing point. */
function chaikin(P, over, arc, closed) {
  const N = P.length / 3, M = closed ? 2 * N - 1 : 2 * N;
  const out = new Float64Array(3 * M), ov = new Float64Array(M), ar = new Float64Array(M);
  let o = 0;
  const push = (k, j, f) => {
    const g = 1 - f, x = g * P[3 * k] + f * P[3 * j], y = g * P[3 * k + 1] + f * P[3 * j + 1], z = g * P[3 * k + 2] + f * P[3 * j + 2];
    const r = Math.sqrt(x * x + y * y + z * z);
    out[3 * o] = x / r; out[3 * o + 1] = y / r; out[3 * o + 2] = z / r;
    ov[o] = g * over[k] + f * over[j];
    ar[o] = g * arc[k] + f * arc[j];
    o++;
  };
  if (!closed) push(0, 0, 0);
  for (let k = 0; k < N - 1; k++) { push(k, k + 1, 0.25); push(k, k + 1, 0.75); }
  if (!closed) push(N - 1, N - 1, 0);
  else { out[3 * o] = out[0]; out[3 * o + 1] = out[1]; out[3 * o + 2] = out[2]; ov[o] = ov[0]; ar[o] = ar[0]; o++; }
  return { P: out, over: ov, arc: ar };
}

function running(x, h) {
  const n = x.length, out = new Float64Array(n);
  let s = 0, c = 0;
  for (let k = 0; k < Math.min(n, h); k++) { s += x[k]; c++; }
  for (let k = 0; k < n; k++) {
    if (k + h < n) { s += x[k + h]; c++; }
    if (k - h - 1 >= 0) { s -= x[k - h - 1]; c--; }
    out[k] = s / c;
  }
  return out;
}
