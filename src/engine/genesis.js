// A planet's first shapes from its seed: plates as a warped, weighted Voronoi
// partition; continents as thresholded fractal noise covering ~38% of the
// sphere; seafloor aged by distance from the ridges its initial motions
// imply; slabs hung on the trenches those motions close. From here the
// torque balance takes over and the initial motions are forgotten within a
// few tens of Myr.
import { stream } from '../rng.js';
import { makeNoise } from '../noise.js';
import { H_OCEANIC, H_CONTINENTAL, waterForLand } from './crust.js';

export function genesis(tec, seed, opts = {}) {
  const g = tec.grid, n = g.n, pos = g.pos;
  const rng = stream(seed, 'genesis');
  const noise = makeNoise(seed);
  tec.rng = stream(seed, 'tectonics');
  tec.noise = noise;
  const NP = opts.plates ?? 12;
  const continentalArea = opts.continentalArea ?? 0.38;
  const landFraction = opts.landFraction ?? 0.29;

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
    const x = pos[3 * i], y = pos[3 * i + 1], z = pos[3 * i + 2];
    const s = Math.min(1, Math.max(0, (v[i] - thr) / 0.06 + 0.5));
    phi[i] = s * s * (3 - 2 * s);
    h[i] = H_OCEANIC + (H_CONTINENTAL - H_OCEANIC) * phi[i] + phi[i] * 8 * noise.fbm(x, y, z, 2.2, 5);
  }

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
    if (phi[i] >= 0.5) { tf[i] = -(900 + 600 * (1 + noise.fbm(x, y, z, 2, 3))); continue; }
    let age = isFinite(dist[i]) ? dist[i] / Math.max(rate[i], 0.002) : 90 + 50 * noise.fbm(x - 4, y, z, 1.5, 3);
    tf[i] = -Math.min(180, Math.max(0, age));
  }

  // ── Plate frames are the world frame at t = 0 ──
  for (let i = 0; i < n; i++) {
    const p = tec.plates[owner[i]];
    p.mask[i] = 1; p.h[i] = h[i]; p.phi[i] = phi[i]; p.tf[i] = tf[i];
    tec.ref[i] = i;
  }

  // ── Slabs on the trenches the initial motions close ──
  for (let i = 0; i < n; i++) {
    const a = owner[i];
    for (let t = g.nbrOff[i]; t < g.nbrOff[i + 1]; t++) {
      const j = g.nbr[t], b = owner[j];
      if (a === b) continue;
      tec.velocity(a, i, va); tec.velocity(b, j, vb);
      const vn = (vb[0] - va[0]) * g.tan[3 * t] + (vb[1] - va[1]) * g.tan[3 * t + 1] + (vb[2] - va[2]) * g.tan[3 * t + 2];
      if (vn > -0.002) continue;
      if (tec.buoyancyAt(i) >= tec.buoyancyAt(j)) continue;   // i sinks only if it's the denser side
      const x = pos[3 * i], y = pos[3 * i + 1], z = pos[3 * i + 2];
      let dx = va[0] - vb[0], dy = va[1] - vb[1], dz = va[2] - vb[2];
      const dot = dx * x + dy * y + dz * z;
      dx -= dot * x; dy -= dot * y; dz -= dot * z;
      const r = Math.hypot(dx, dy, dz) || 1;
      tec.slab[i] = 0.07; tec.slabPlate[i] = a; tec.slabAge[i] = -tf[i];
      tec.slabDir[3 * i] = dx / r; tec.slabDir[3 * i + 1] = dy / r; tec.slabDir[3 * i + 2] = dz / r;
    }
  }

  tec.updateElevation();
  tec.water = waterForLand(g, tec.elev, landFraction);
  tec.updateElevation();
  tec.balance(1e-6);   // area and land per plate; ω stays (the relaxation is negligible)
  // Spin up so the opening is a planet already in motion, then set the water
  // for the land fraction asked: the seafloor's age (and so sea level) has
  // settled toward what the plates' own speeds keep it at.
  const spin = opts.spinup ?? 0;
  let m0 = 0, c0 = 0, tm = 0;
  for (let t = 0; t < spin; t += 1) {
    if (t === Math.max(0, spin - 10)) { m0 = tec.counters.made; c0 = tec.counters.consumed; tm = tec.t; }
    tec.step(1);
    if (opts.landscape) opts.landscape.step(1e6);
  }
  // The plates' activity at the end of the spin-up (crust made and consumed per Myr): the carbon cycle's reference.
  if (spin > 0) tec.spinRate = { made: (tec.counters.made - m0) / (tec.t - tm), consumed: (tec.counters.consumed - c0) / (tec.t - tm) };
  if (spin > 0) {
    tec.water = waterForLand(g, tec.elev, landFraction);
    tec.updateElevation();
  }
  tec.landTarget = landFraction;
  tec.t0 = tec.t;
  return tec;
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
