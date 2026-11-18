// A planet's first shapes from its seed: plates as a warped, weighted Voronoi
// partition; continents as thresholded fractal noise covering ~40% of the
// sphere, their crust standing as today's Earth's does (EARTH_CRUST); seafloor
// aged by distance from the ridges its initial motions imply; slabs hung on the
// trenches those motions close. From here the torque balance takes over and the
// initial motions are forgotten within a few tens of Myr; after the spin-up the
// continents stand as Earth's again, in the order the spin-up left them, and
// the sea stands at Earth's freeboard over the ridges.
import { stream } from '../rng.js';
import { makeNoise } from '../noise.js';
import { H_OCEANIC, RHO_OCEANIC, RHO_CONTINENTAL, RHO_MANTLE, FREEBOARD, elevation, subsidence, oceanVolume } from './crust.js';
import { CONTINENTAL, PARAMS, EARTH_RADIUS_KM, contSlabAge } from './plates.js';

/**
 * Today's Earth's continental crust as the sim stands it (its fit to ETOPO's bed, the ice's load off:
 * src/engine/earth.js), by distance from the ocean: each band's lower edge and mean distance (km, `B`,
 * `D`), the crust's distance at each twentieth of its area (km, `Q`), and each band's quantiles (`U`)
 * of the crust's elevation above a new ridge (km, `E`; the sea stands FREEBOARD above it). Written by
 * tools/earth/crust-table.mjs (level 6). A seeded planet's continents are built to these statistics.
 */
export const EARTH_CRUST = {
  B: [0, 100, 200, 400, 800, 1600],
  D: [59, 177, 320, 585, 1150, 2171],
  Q: [55, 56, 63, 167, 188, 278, 315, 400, 496, 563, 642, 738, 842, 956, 1080, 1217, 1384, 1572, 1811, 2260, 3607],
  U: [0, 0.02, 0.05, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 0.95, 0.98, 0.995, 1],
  E: [
    [-0.45, -0.16, -0.08, 0.07, 0.33, 0.59, 0.9, 1.23, 1.56, 1.87, 2.17, 2.45, 2.58, 2.91, 3.58, 4.52],
    [-0.2, 0.44, 0.76, 1.17, 1.78, 2.1, 2.32, 2.45, 2.53, 2.66, 2.83, 3.14, 3.54, 3.98, 5.53, 6.68],
    [-0.07, 0.94, 1.61, 2.03, 2.34, 2.47, 2.55, 2.65, 2.8, 2.96, 3.25, 3.65, 4.03, 5.26, 6.68, 7.12],
    [0.48, 1.86, 2.2, 2.4, 2.49, 2.59, 2.69, 2.79, 2.91, 3.06, 3.3, 3.66, 3.92, 4.28, 5.56, 6.78],
    [0.36, 2.21, 2.42, 2.49, 2.6, 2.68, 2.77, 2.85, 2.97, 3.14, 3.45, 3.78, 4.26, 6.19, 7.46, 7.71],
    [1.88, 2.49, 2.55, 2.58, 2.64, 2.7, 2.81, 2.91, 3.05, 3.36, 3.72, 4.34, 5.54, 7.09, 7.61, 7.93],
  ],
};

export function genesis(tec, seed, opts = {}) {
  const g = tec.grid, n = g.n, pos = g.pos;
  const rng = stream(seed, 'genesis');
  const noise = makeNoise(seed);
  tec.rng = stream(seed, 'tectonics');
  tec.noise = noise;
  const NP = opts.plates ?? 12;
  const continentalArea = opts.continentalArea ?? 0.40;   // Earth's continental crust: 40% of the sphere (EARTH_CRUST's)
  const freeboard = opts.freeboard ?? FREEBOARD;

  // ── Continents ──
  const v = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const x = pos[3 * i], y = pos[3 * i + 1], z = pos[3 * i + 2];
    v[i] = noise.fbm(x + 3.3, y - 1.7, z + 0.4, 1.25, 6, 0.55) + 0.25 * noise.fbm(x - 8, y + 2, z, 3.5, 3);
  }
  const sorted = Float64Array.from(v).sort();
  const thr = sorted[Math.floor((1 - continentalArea) * n)];
  const phi = tec.phi, h = tec.h, tf = tec.tf;
  for (let i = 0; i < n; i++) {
    const s = Math.min(1, Math.max(0, (v[i] - thr) / 0.06 + 0.5));
    phi[i] = s * s * (3 - 2 * s);
  }
  continentalCrust(tec, noise);
  for (let i = 0; i < n; i++) if (phi[i] < CONTINENTAL) h[i] = H_OCEANIC + (MARGIN_H - H_OCEANIC) * phi[i] / CONTINENTAL;

  // ── Plate seeds: one at the heart of each large continent, the rest spread
  // over the ocean by best-candidate sampling. Plates then grow from their
  // seeds at their own pace, so boundaries fall roughly midway between
  // continents, through ocean: the continents open as passengers, with
  // passive margins, as most of Earth's do. ──
  const seeds = [];
  {
    const comp = new Int32Array(n).fill(-1);
    const comps = [];
    for (let i = 0; i < n; i++) {
      if (phi[i] < 0.5 || comp[i] >= 0) continue;
      const id = comps.length, stack = [i];
      let A = 0, sx = 0, sy = 0, sz = 0, far = i;
      comp[i] = id;
      while (stack.length) {
        const q = stack.pop();
        const a = g.area[q];
        A += a; sx += a * pos[3 * q]; sy += a * pos[3 * q + 1]; sz += a * pos[3 * q + 2];
        for (let t = g.nbrOff[q]; t < g.nbrOff[q + 1]; t++) {
          const j = g.nbr[t];
          if (phi[j] >= 0.5 && comp[j] < 0) { comp[j] = id; stack.push(j); }
        }
      }
      const r = Math.hypot(sx, sy, sz) || 1;
      comps.push({ A, c: [sx / r, sy / r, sz / r] });
    }
    comps.sort((p, q) => q.A - p.A);
    for (const cp of comps) {
      if (seeds.length >= Math.floor(NP / 2) || cp.A < 0.01 * 4 * Math.PI) break;
      seeds.push(cp.c);
    }
  }
  while (seeds.length < NP) {
    let best = null, bd = -1;
    for (let c = 0; c < 24; c++) {
      const u = rng.unitVector();
      let md = Infinity;
      for (const s of seeds) md = Math.min(md, Math.acos(Math.max(-1, Math.min(1, u[0] * s[0] + u[1] * s[1] + u[2] * s[2]))));
      if (md > bd) { bd = md; best = u; }
    }
    seeds.push(best);
  }
  const weight = seeds.map(() => rng.range(0.8, 1.25));
  const owner = tec.owner;
  const seedCell = seeds.map(s => nearestByScan(g, s));
  const cost = new Float64Array(n).fill(Infinity);
  const grow = new MinHeap();
  for (let k = 0; k < NP; k++) { cost[seedCell[k]] = 0; owner[seedCell[k]] = k; grow.push(0, seedCell[k]); }
  while (grow.size) {
    const [c, i] = grow.pop();
    if (c > cost[i]) continue;
    const k = owner[i];
    for (let t = g.nbrOff[i]; t < g.nbrOff[i + 1]; t++) {
      const j = g.nbr[t];
      const x = pos[3 * j], y = pos[3 * j + 1], z = pos[3 * j + 2];
      const rough = 1 + 0.5 * noise.fbm(x + 13 * k, y, z, 2.4, 3);
      // Continental crust is quick going: a continent's own plate floods it
      // before meeting anyone, then carries on into the ocean, so boundaries
      // meet out at sea rather than at the coast.
      const nc = c + g.dist[t] * weight[k] * Math.max(0.3, rough) * (1 - 0.6 * phi[j]);
      if (nc < cost[j]) { cost[j] = nc; owner[j] = k; grow.push(nc, j); }
    }
  }

  // ── Initial motions ──
  for (let k = 0; k < NP; k++) {
    const p = tec.allocPlate();
    p.alive = true;
    const pole = rng.unitVector();
    const speed = rng.range(0.004, 0.011);
    p.w[0] = pole[0] * speed; p.w[1] = pole[1] * speed; p.w[2] = pole[2] * speed;
  }

  // ── Seafloor ages: distance from divergent boundaries within each plate ──
  const va = new Float64Array(3), vb = new Float64Array(3);
  const dist = new Float64Array(n).fill(Infinity);
  const rate = new Float64Array(n);
  const heap = new MinHeap();
  const ridgeCells = [];
  for (let i = 0; i < n; i++) {
    if (phi[i] >= 0.5) continue;
    const a = owner[i];
    for (let t = g.nbrOff[i]; t < g.nbrOff[i + 1]; t++) {
      const j = g.nbr[t], b = owner[j];
      if (a === b) continue;
      tec.velocity(a, i, va); tec.velocity(b, j, vb);
      const vn = (vb[0] - va[0]) * g.tan[3 * t] + (vb[1] - va[1]) * g.tan[3 * t + 1] + (vb[2] - va[2]) * g.tan[3 * t + 2];
      if (vn > 0.002) {
        const half = 0.5 * vn;
        if (dist[i] > 0 || half > rate[i]) { dist[i] = 0; rate[i] = half; }
      }
    }
    if (dist[i] === 0) ridgeCells.push(i);
  }
  for (const i of ridgeCells) heap.push(0, i);
  while (heap.size) {
    const [d, i] = heap.pop();
    if (d > dist[i]) continue;
    for (let t = g.nbrOff[i]; t < g.nbrOff[i + 1]; t++) {
      const j = g.nbr[t];
      if (owner[j] !== owner[i] || phi[j] >= 0.5) continue;
      const nd = d + g.dist[t];
      if (nd < dist[j]) { dist[j] = nd; rate[j] = rate[i]; heap.push(nd, j); }
    }
  }
  for (let i = 0; i < n; i++) {
    const x = pos[3 * i], y = pos[3 * i + 1], z = pos[3 * i + 2];
    if (phi[i] >= 0.5) continue;   // continents' formation time is continentalCrust's
    let age = isFinite(dist[i]) ? dist[i] / Math.max(rate[i], 0.002) : 90 + 50 * noise.fbm(x - 4, y, z, 1.5, 3);
    tf[i] = -Math.min(180, Math.max(0, age));
  }

  framesFromWorld(tec);
  hangSlabs(tec);

  tec.trenches();
  tec.updateElevation();
  tec.water = oceanVolume(g, tec.elev, elevation(H_OCEANIC, 0, 0) + freeboard);
  tec.updateElevation();
  tec.balance(1e-6);   // area and land per plate; ω stays (the relaxation is negligible)
  // Spin up so the opening is a planet already in motion; then the continents stand as Earth's again,
  // ranked as the spin-up left them (its orogens, rifted margins and basins), and the sea is filled
  // to Earth's freeboard over the ridges: the seafloor's age has settled toward what the plates' own
  // speeds keep it at, and the land fraction is what the continents then show above it (~28%).
  const spin = opts.spinup ?? 0;
  let m0 = 0, c0 = 0, tm = 0;
  for (let t = 0; t < spin; t += 1) {
    if (t === Math.max(0, spin - 10)) { m0 = tec.counters.opened; c0 = tec.counters.closed; tm = tec.t; }
    tec.step(1);
    if (opts.landscape) opts.landscape.step(1e6);
  }
  // The plates' activity at the end of the spin-up (crust opened and closed per Myr, by their motion): the carbon cycle's reference.
  if (spin > 0) tec.spinRate = { made: (tec.counters.opened - m0) / (tec.t - tm), consumed: (tec.counters.closed - c0) / (tec.t - tm) };
  if (spin > 0) {
    tec.updateElevation();
    continentalCrust(tec, noise, true);
    tec.updateElevation();
    tec.water = oceanVolume(g, tec.elev, elevation(H_OCEANIC, 0, 0) + freeboard);
    tec.updateElevation();
  }
  tec.landTarget = 1 - tec.oceanArea / (4 * Math.PI);
  tec.t0 = tec.t;
  return tec;
}

/**
 * Each cell's distance (km) from the nearest cell that isn't continental (`cont` 0), along the grid's
 * edges; a continental cell beside the ocean is half an edge from it.
 */
export function coastDistance(g, cont) {
  const n = g.n, d = new Float64Array(n).fill(Infinity), heap = new MinHeap(), R = EARTH_RADIUS_KM;
  for (let i = 0; i < n; i++) {
    if (cont[i]) continue;
    d[i] = 0;
    for (let t = g.nbrOff[i]; t < g.nbrOff[i + 1]; t++) {
      const j = g.nbr[t], dj = 0.5 * g.dist[t] * R;
      if (cont[j] && dj < d[j]) { d[j] = dj; heap.push(dj, j); }
    }
  }
  while (heap.size) {
    const [k, i] = heap.pop();
    if (k > d[i]) continue;
    for (let t = g.nbrOff[i]; t < g.nbrOff[i + 1]; t++) {
      const j = g.nbr[t], dj = k + g.dist[t] * R;
      if (dj < d[j]) { d[j] = dj; heap.push(dj, j); }
    }
  }
  return d;
}

/** Earth's crust's elevation above a new ridge (km) at distance d (km) from the ocean and quantile u (EARTH_CRUST). */
export function earthCrustAt(d, u) {
  const { D, U, E } = EARTH_CRUST;
  const row = r => {
    let k = 0; while (k + 2 < U.length && u > U[k + 1]) k++;
    const w = Math.min(1, Math.max(0, (u - U[k]) / (U[k + 1] - U[k])));
    return E[r][k] + w * (E[r][k + 1] - E[r][k]);
  };
  if (d <= D[0]) return row(0);
  if (d >= D[D.length - 1]) return row(D.length - 1);
  let b = 0; while (d > D[b + 1]) b++;
  const w = (d - D[b]) / (D[b + 1] - D[b]);
  return row(b) + w * (row(b + 1) - row(b));
}

/** The thickness (km) the sim's isostasy stands at E km above a new ridge, with felsic share f at age (Myr) (crust.js, elevation, inverted). */
function standing(E, f, age) {
  return (E + elevation(H_OCEANIC, 0, 0) + (1 - f) * subsidence(age)) / (1 - (RHO_OCEANIC + (RHO_CONTINENTAL - RHO_OCEANIC) * f) / RHO_MANTLE);
}
/** The margin's crust where φ reaches ½: Earth's tenth-percentile margin (km thick). */
const MARGIN_H = standing(EARTH_CRUST.E[0][3], CONTINENTAL, 1e3);

/**
 * The continents' crust (synthesis): it stands as today's Earth's does (EARTH_CRUST), so a seeded
 * planet has Earth's margins, platforms and share of mountains, and its sea Earth's depth over the
 * ridges. Each continental cell's distance from the ocean is mapped onto Earth's by area (the cell a
 * fifth of the way in by area stands as Earth's a fifth of the way in does), and within each of Earth's
 * bands of distance the cells take Earth's quantiles of elevation in the order of a score: at genesis
 * the seed's noise (broad swells and basins, fbm, and for the highest ridged belts, so old mountains lie
 * in lines; continents' formation time is set here too, 0.9–2.1 Gyr old); `after` the spin-up the
 * relief the spin-up left (its orogens, rifted margins, basins), written through to the plates' frames.
 * Each cell's thickness is the one the sim's isostasy stands there. Sets h on the continents.
 */
export function continentalCrust(tec, noise, after = false) {
  const g = tec.grid, n = g.n, pos = g.pos, area = g.area, phi = tec.phi, h = tec.h, tf = tec.tf;
  const cont = Uint8Array.from(phi, f => f >= CONTINENTAL), d = coastDistance(g, cont);
  // Earth's distance for each continental cell, by its rank in this planet's continents' area.
  const cells = [];
  let total = 0;
  for (let i = 0; i < n; i++) if (cont[i]) { cells.push(i); total += area[i]; }
  cells.sort((a, b) => d[a] - d[b] || a - b);
  const Q = EARTH_CRUST.Q, de = new Float64Array(n);
  let acc = 0;
  for (const i of cells) {
    const u = 20 * (acc + 0.5 * area[i]) / total, k = Math.min(19, Math.floor(u));
    de[i] = Q[k] + (u - k) * (Q[k + 1] - Q[k]);
    acc += area[i];
  }
  // The score: the order within each band.
  const z = new Float64Array(n);
  for (const i of cells) {
    const x = pos[3 * i], y = pos[3 * i + 1], w = pos[3 * i + 2];
    if (after) z[i] = tec.elev[i] + 1e-3 * noise.fbm(x - 2.1, y + 4.4, w + 1.3, 1.6, 4);
    else {
      z[i] = noise.fbm(x - 2.1, y + 4.4, w + 1.3, 1.6, 4) + 1.4 * noise.ridged(x + 6.2, y - 3.5, w + 9.1, 2.2, 4);
      tf[i] = -(900 + 600 * (1 + noise.fbm(x, y, w, 2, 3)));
    }
  }
  const u = new Float64Array(n), edges = [...EARTH_CRUST.B, Infinity];
  for (let b = 0; b + 1 < edges.length; b++) {
    const band = cells.filter(i => de[i] >= edges[b] && de[i] < edges[b + 1]);
    let A = 0;
    for (const i of band) A += area[i];
    band.sort((p, q) => z[p] - z[q] || p - q);
    let a = 0;
    for (const i of band) { u[i] = (a + 0.5 * area[i]) / A; a += area[i]; }
  }
  for (const i of cells) {
    h[i] = Math.max(H_OCEANIC, Math.min(PARAMS.H_PLATEAU, standing(earthCrustAt(de[i], u[i]), phi[i], tec.t - tf[i])));
    if (after) tec.plates[tec.owner[i]].h[tec.ref[i]] = h[i];
  }
  // World cells sharing a frame cell (nearest-cell rounding) all read what it now holds.
  if (after) for (const i of cells) h[i] = tec.plates[tec.owner[i]].h[tec.ref[i]];
}

/** Plate frames are the world frame at t = 0: each plate's crust where its world cells are. */
export function framesFromWorld(tec) {
  const n = tec.grid.n, owner = tec.owner, h = tec.h, phi = tec.phi, tf = tec.tf;
  for (let i = 0; i < n; i++) {
    const p = tec.plates[owner[i]];
    p.mask[i] = 1; p.h[i] = h[i]; p.phi[i] = phi[i]; p.tf[i] = tf[i];
    tec.ref[i] = i;
  }
}

/**
 * Slabs on the trenches the plates' motions close, as the step hangs them (Tectonics.step): under the
 * denser side, pulling it across the boundary toward the plate above, where the motion closes across
 * the boundary faster than ~1.3 cm/yr and by at least PARAMS.SLAB_CLOSING of the relative motion. Ocean
 * sinks under anything denser-sided; a continent sinks only under another (a collision: the thinner
 * crust goes down), pulling as PARAMS.CONT_PULL of an old ocean slab does.
 */
export function hangSlabs(tec, length = 0.07, steady = false) {
  const g = tec.grid, n = g.n, pos = g.pos, owner = tec.owner, tf = tec.tf, tan = g.tan;
  const va = new Float64Array(3), vb = new Float64Array(3);
  for (let i = 0; i < n; i++) {
    const a = owner[i];
    const cont = tec.phi[i] >= CONTINENTAL;
    if (cont && !(PARAMS.CONT_PULL > 0)) continue;
    // The boundary's normal here, toward the other plates.
    let nx = 0, ny = 0, nz = 0;
    for (let t = g.nbrOff[i]; t < g.nbrOff[i + 1]; t++) if (owner[g.nbr[t]] !== a) { nx += tan[3 * t]; ny += tan[3 * t + 1]; nz += tan[3 * t + 2]; }
    const rn = Math.hypot(nx, ny, nz);
    if (!(rn > 0)) continue;
    nx /= rn; ny /= rn; nz /= rn;
    const x = pos[3 * i], y = pos[3 * i + 1], z = pos[3 * i + 2];
    for (let t = g.nbrOff[i]; t < g.nbrOff[i + 1]; t++) {
      const j = g.nbr[t], b = owner[j];
      if (a === b) continue;
      tec.velocity(a, i, va); tec.velocity(b, j, vb);
      let dx = va[0] - vb[0], dy = va[1] - vb[1], dz = va[2] - vb[2];
      const dot = dx * x + dy * y + dz * z;
      dx -= dot * x; dy -= dot * y; dz -= dot * z;
      const closing = dx * nx + dy * ny + dz * nz;
      if (!(closing > 0.002) || closing < PARAMS.SLAB_CLOSING * Math.hypot(dx, dy, dz)) continue;
      if (tec.buoyancyAt(i) >= tec.buoyancyAt(j)) continue;   // i sinks only if it's the denser side
      if (cont && tec.phi[j] < CONTINENTAL) continue;   // a continent sinks only against another
      // With `steady`, each slab as long as its closing keeps it (the step's memory: closing × SLAB_TAU), at most `length`.
      tec.slab[i] = steady ? Math.min(length, closing * PARAMS.SLAB_TAU) : length;
      tec.slabPlate[i] = a; tec.slabAge[i] = cont ? contSlabAge() : -tf[i];
      tec.slabDir[3 * i] = nx; tec.slabDir[3 * i + 1] = ny; tec.slabDir[3 * i + 2] = nz;
      break;
    }
  }
}

function nearestByScan(g, s) {
  let best = 0, bd = -2;
  for (let i = 0; i < g.n; i++) {
    const d = g.pos[3 * i] * s[0] + g.pos[3 * i + 1] * s[1] + g.pos[3 * i + 2] * s[2];
    if (d > bd) { bd = d; best = i; }
  }
  return best;
}

class MinHeap {
  constructor() { this.k = []; this.v = []; }
  get size() { return this.k.length; }
  push(key, val) {
    const k = this.k, v = this.v;
    let i = k.length; k.push(key); v.push(val);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (k[p] <= key) break;
      k[i] = k[p]; v[i] = v[p]; i = p;
    }
    k[i] = key; v[i] = val;
  }
  pop() {
    const k = this.k, v = this.v;
    const top = [k[0], v[0]];
    const lk = k.pop(), lv = v.pop();
    if (k.length) {
      let i = 0;
      const n = k.length;
      for (;;) {
        let c = 2 * i + 1;
        if (c >= n) break;
        if (c + 1 < n && k[c + 1] < k[c]) c++;
        if (k[c] >= lk) break;
        k[i] = k[c]; v[i] = v[c]; i = c;
      }
      k[i] = lk; v[i] = lv;
    }
    return top;
  }
}
