// Landscape: the stream-power law's steady state is the slope–area law, and
// erosion, sediment and diffusion move crust without making or losing any. The
// fast paths (phase 10b) against their first forms: the flood seeded from the
// coast against every outlet's, the twelve months in one pass against twelve
// accumulations, the packed diffusion against the edge-by-edge one.
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildGrid } from '../src/grid/icosphere.js';
import { route, accumulate, accumulatePass, streamPower, Landscape, LAND } from '../src/engine/landscape.js';
import { Tectonics } from '../src/engine/plates.js';
import { genesis } from '../src/engine/genesis.js';
import { drainage } from '../src/render/rivers.js';
import { RHO_OCEANIC, RHO_CONTINENTAL } from '../src/engine/crust.js';

const R = 6371;

test('uplift against stream power settles on S = (U/K) Q^(−m)', () => {
  const g = buildGrid(5), n = g.n;
  const base = new Uint8Array(n), z = new Float64Array(n), f = new Float64Array(n).fill(1);
  const w = new Float64Array(n), Q = new Float64Array(n), zb = new Float64Array(n);
  for (let i = 0; i < n; i++) base[i] = g.pos[3 * i + 2] < 0.4 ? 1 : 0;
  for (let i = 0; i < n; i++) w[i] = base[i] ? 0 : g.area[i] * R * R;
  const U = 1e-6, K = 2e-7, m = 0.5, dt = 1e6;   // 1 mm/yr of uplift
  let r = null;
  for (let s = 0; s < 300; s++) {
    for (let i = 0; i < n; i++) if (!base[i]) z[i] += U * dt;
    r = route(g, z, base, r);
    accumulate(r.order, r.count, r.rcv, w, Q);
    streamPower(r, z, Q, f, K, m, dt, zb);
  }
  let worst = 0, land = 0;
  for (let i = 0; i < n; i++) {
    if (base[i]) continue;
    land++;
    const j = r.rcv[i];
    const S = (z[i] - z[j]) / r.rlen[i];
    worst = Math.max(worst, Math.abs(K * Q[i] ** m * S / U - 1));
  }
  assert.ok(land > 1000, `${land} land cells`);
  assert.ok(worst < 0.02, `steady state off by ${(100 * worst).toFixed(2)}%`);
});

test('a landscape step conserves crust: eroded rock all ends up as sediment', () => {
  const g = buildGrid(5);
  const tec = new Tectonics(g);
  genesis(tec, 'landscape-test', { spinup: 0 });
  const land = new Landscape(tec);
  // Give it relief to cut: a ridge of thick crust.
  for (let i = 0; i < g.n; i++) if (tec.phi[i] >= 0.5 && Math.abs(g.pos[3 * i]) < 0.15) {
    const p = tec.plates[tec.owner[i]], j = tec.ref[i];
    p.h[j] += 20; tec.h[i] = p.h[j];
  }
  tec.updateElevation();
  const v0 = land.volume();
  for (let s = 0; s < 5; s++) land.step(5e5);
  const v1 = land.volume();
  assert.ok(land.flux.eroded > 0, 'nothing eroded');
  // The plates hold thickness as float32, so ~1e-7 is rounding.
  assert.ok(Math.abs(v1 - v0) / v0 < 1e-7, `volume changed by ${((v1 - v0) / v0).toExponential(2)}`);
});

/** A planet's crust at level L with relief to cut: a ridge of thick crust across the continents. */
function ridged(L, seed = 'landscape-fast') {
  const g = buildGrid(L), tec = new Tectonics(g);
  genesis(tec, seed, { spinup: 0 });
  for (let i = 0; i < g.n; i++) if (tec.phi[i] >= 0.5 && Math.abs(g.pos[3 * i]) < 0.15) {
    const p = tec.plates[tec.owner[i]], j = tec.ref[i];
    p.h[j] += 25; tec.h[i] = p.h[j];
  }
  tec.updateElevation();
  return tec;
}

test('the coast-seeded flood fills, routes and orders as the outlet-seeded one does', () => {
  const tec = ridged(6), land = new Landscape(tec);
  land.reroute();
  const g = tec.grid, n = g.n, r = land.r, z = land.zr, base = land.base;
  // The flood as first written: every outlet in the heap.
  const zf = new Float64Array(n), seen = new Uint8Array(n), K = [], V = [];
  const push = (k, v) => { let i = K.length; K.push(k); V.push(v); while (i > 0) { const p = (i - 1) >> 1; if (K[p] <= k) break; K[i] = K[p]; V[i] = V[p]; i = p; } K[i] = k; V[i] = v; };
  const pop = () => {
    const top = V[0], lk = K.pop(), lv = V.pop(), m = K.length;
    if (m > 0) { let i = 0; for (;;) { let c = 2 * i + 1; if (c >= m) break; if (c + 1 < m && K[c + 1] < K[c]) c++; if (K[c] >= lk) break; K[i] = K[c]; V[i] = V[c]; i = c; } K[i] = lk; V[i] = lv; }
    return top;
  };
  for (let i = 0; i < n; i++) if (base[i]) { zf[i] = z[i]; seen[i] = 1; push(z[i], i); }
  while (K.length) {
    const c = pop();
    for (let t = g.nbrOff[c]; t < g.nbrOff[c + 1]; t++) { const j = g.nbr[t]; if (seen[j]) continue; seen[j] = 1; zf[j] = Math.max(z[j], zf[c] + 1e-6); push(zf[j], j); }
  }
  let d = 0;
  for (let i = 0; i < n; i++) d = Math.max(d, Math.abs(zf[i] - r.zf[i]));
  assert.equal(d, 0, `filled surface differs by ${d} km`);
  assert.equal(r.count, n, 'every cell ordered');
  const at = new Int32Array(n);
  for (let k = 0; k < r.count; k++) at[r.order[k]] = k;
  for (let i = 0; i < n; i++) if (r.rcv[i] >= 0) assert.ok(at[r.rcv[i]] < at[i], `cell ${i} before its receiver`);
});

test('the twelve months in one pass match twelve accumulations', () => {
  const tec = ridged(5), land = new Landscape(tec), g = tec.grid, n = g.n;
  land.reroute();
  const RM = Float32Array.from({ length: 12 * n }, (_, k) => 0.02 + 0.015 * Math.sin(0.37 * k));
  const rt = drainage(g, land, null);
  rt.pass = Float32Array.from({ length: n }, (_, i) => 0.5 + 0.5 * Math.cos(i));
  const q12 = land.monthly(RM, rt), w = new Float64Array(n), q = new Float64Array(n), toM3s = 1e6 * 12 / 3.156e7;
  for (let m = 0; m < 12; m++) {
    for (let i = 0; i < n; i++) w[i] = land.base[i] ? 0 : land.areaKm[i] * RM[12 * i + m];
    accumulatePass(rt, w, q);
    for (let i = 0; i < n; i++) assert.equal(q12[12 * i + m], land.base[i] ? 0 : Math.fround(q[i] * toM3s));
  }
});

test('the packed diffusion moves the frames’ crust as the edge-by-edge one does', () => {
  const tec = ridged(6), land = new Landscape(tec), g = tec.grid, n = g.n, dt = 5e5;
  const frames = tec.plates.map(p => p.h.slice()), A = land.areaKm;
  // The first form: every continental edge's flow, on the grid's own indices, in f64.
  const { kap, sub, ds } = land.plan(dt), hc = Float64Array.from(tec.h), dh = new Float64Array(n);
  const I = [], J = [], Wt = [];
  for (let i = 0; i < n; i++) for (let t = g.nbrOff[i]; t < g.nbrOff[i + 1]; t++) {
    const j = g.nbr[t];
    if (j > i && kap[i] >= 0 && kap[j] >= 0) { I.push(i); J.push(j); Wt.push(0.5 * (kap[i] + kap[j]) * ds * (g.ell[t] / g.dist[t])); }
  }
  for (let s = 0; s < sub; s++) {
    dh.fill(0);
    for (let k = 0; k < I.length; k++) { const flow = Wt[k] * (hc[J[k]] - hc[I[k]]); dh[I[k]] += flow / A[I[k]]; dh[J[k]] -= flow / A[J[k]]; }
    for (let i = 0; i < n; i++) hc[i] += dh[i];
  }
  const ref = tec.plates.map((p, k) => Float32Array.from(frames[k]));
  for (let i = 0; i < n; i++) if (kap[i] >= 0) { const d = hc[i] - tec.h[i]; if (d !== 0) ref[tec.owner[i]][tec.ref[i]] += d; }
  land.diffuse(dt);
  let worst = 0, moved = 0;
  tec.plates.forEach((p, k) => { for (let j = 0; j < p.h.length; j++) { worst = Math.max(worst, Math.abs(p.h[j] - ref[k][j]) / Math.max(1, ref[k][j])); if (p.h[j] !== frames[k][j]) moved++; } });
  assert.ok(sub > 1 && moved > 1000, `${sub} substeps, ${moved} frame cells moved`);
  assert.ok(worst <= 2 ** -22, `frames apart by ${worst.toExponential(2)} (relative)`);
});

test('the diffusion\'s gain at sea goes seaward, and the thick crust\'s flow stands on local isostasy', () => {
  const tec = ridged(5), land = new Landscape(tec), g = tec.grid, n = g.n;
  land.reroute();
  // Shelf cells of continental crust at sea, shallower than the shelf the sediment builds, beside
  // thick land: the diffusion would fill them; it goes on into deeper water.
  const shelf = [];
  for (let i = 0; i < n; i++) if (land.base[i] && tec.phi[i] >= 0.5 && tec.elev[i] > tec.seaLevel - LAND.SHELF) {
    for (let t = g.nbrOff[i]; t < g.nbrOff[i + 1]; t++) if (!land.base[g.nbr[t]] && tec.h[g.nbr[t]] > tec.h[i] + 5) { shelf.push(i); break; }
  }
  assert.ok(shelf.length > 3, `${shelf.length} shelf cells`);
  const h0 = Float64Array.from(tec.h), v0 = land.volume(), K = LAND.KAPPA_THICK;
  LAND.KAPPA_THICK = 0;
  try { land.diffuse(5e5); } finally { LAND.KAPPA_THICK = K; }
  for (const i of shelf) assert.ok(tec.h[i] <= h0[i] + 1e-6, `a shelf cell filled: ${h0[i]} → ${tec.h[i]}`);
  assert.ok(Math.abs(land.volume() - v0) / v0 < 1e-7, 'crust kept');
  // The thick crust's flow alone: the column's mass the flexure saw moves with it, ρ a km (no load).
  const t2 = ridged(5, 'landscape-thick'), l2 = new Landscape(t2), frames = t2.plates.map(p => p.h.slice());
  for (const p of t2.plates) for (let j = 0; j < p.h.length; j++) p.mq[j] = 100;
  const K0 = LAND.KAPPA;
  LAND.KAPPA = 0;
  try { l2.diffuse(5e5); } finally { LAND.KAPPA = K0; }
  let moved = 0;
  t2.plates.forEach((p, k) => { for (let j = 0; j < p.h.length; j++) { const d = p.h[j] - frames[k][j]; if (d !== 0) { moved++; const want = (RHO_OCEANIC + (RHO_CONTINENTAL - RHO_OCEANIC) * p.phi[j]) * d; assert.ok(Math.abs(p.mq[j] - 100 - want) < 1e-3 * Math.max(1, Math.abs(d)), `mq ${p.mq[j] - 100} vs ${want}`); } } });
  assert.ok(moved > 100, `${moved} frame cells moved`);
});
