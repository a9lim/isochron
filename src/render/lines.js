// Plate boundaries as smooth lines (docs/PLAN.md, "The scene").
//
// The boundary between two plates runs along Voronoi edges of the grid, so
// drawn edge by edge it is a stair of hexagon sides, and classified edge by
// edge it flickers between ridge, trench and transform as each side's angle
// swings ±60°. Instead:
//   1. trace the boundary edges into polylines between triple junctions
//      (one polyline separates one pair of plates, left and right);
//   2. smooth each polyline (a Laplacian pass removes the stair, two rounds
//      of Chaikin corner-cutting round it), on the sphere, junctions fixed;
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
    for (const c of [eC0[e], eC1[e]]) { if (deg[c] < 3) inc[3 * c + deg[c]] = e; deg[c]++; }
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

  // Laplacian passes take out the hexagons' stair; ends (junctions) stay put.
  const N = corners.length;
  for (let pass = 0; pass < 3; pass++) {
    const Q = P.slice();
    for (let k = 0; k < N; k++) {
      let a = k - 1, b = k + 1;
      if (closed) { a = (k - 1 + N - 1) % (N - 1); b = (k + 1) % (N - 1); }
      else if (k === 0 || k === N - 1) continue;
      for (let c = 0; c < 3; c++) Q[3 * k + c] = 0.5 * P[3 * k + c] + 0.25 * (P[3 * a + c] + P[3 * b + c]);
      normalize(Q, k);
    }
    if (closed) for (let c = 0; c < 3; c++) Q[3 * (N - 1) + c] = Q[c];
    P = Q;
  }
  // Chaikin, twice.
  for (let it = 0; it < 2; it++) ({ P, over, arc } = chaikin(P, over, arc, closed));

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
    const tr = Math.hypot(tx, ty, tz) || 1;
    tx /= tr; ty /= tr; tz /= tr;
    // Left of the direction of travel: p × t.
    const lx = py * tz - pz * ty, ly = pz * tx - px * tz, lz = px * ty - py * tx;
    T[3 * k] = tx; T[3 * k + 1] = ty; T[3 * k + 2] = tz;
    L[3 * k] = lx; L[3 * k + 1] = ly; L[3 * k + 2] = lz;
    // Right plate relative to left: (ω_R − ω_L) × p.
    const vx = dw[1] * pz - dw[2] * py, vy = dw[2] * px - dw[0] * pz, vz = dw[0] * py - dw[1] * px;
    const v = Math.hypot(vx, vy, vz);
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
  const r = Math.hypot(P[3 * k], P[3 * k + 1], P[3 * k + 2]);
  P[3 * k] /= r; P[3 * k + 1] /= r; P[3 * k + 2] /= r;
}

function chaikin(P, over, arc, closed) {
  const N = P.length / 3;
  const out = [], ov = [], ar = [];
  const push = (k, j, f) => {
    const x = (1 - f) * P[3 * k] + f * P[3 * j], y = (1 - f) * P[3 * k + 1] + f * P[3 * j + 1], z = (1 - f) * P[3 * k + 2] + f * P[3 * j + 2];
    const r = Math.hypot(x, y, z);
    out.push(x / r, y / r, z / r);
    ov.push((1 - f) * over[k] + f * over[j]);
    ar.push((1 - f) * arc[k] + f * arc[j]);
  };
  if (!closed) push(0, 0, 0);
  for (let k = 0; k < N - 1; k++) { push(k, k + 1, 0.25); push(k, k + 1, 0.75); }
  if (!closed) push(N - 1, N - 1, 0);
  else { out.push(out[0], out[1], out[2]); ov.push(ov[0]); ar.push(ar[0]); }
  return { P: Float64Array.from(out), over: Float64Array.from(ov), arc: Float64Array.from(ar) };
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
