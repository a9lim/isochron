// The landscape's fast paths against their references: the flood seeded from the
// coast against the classic one seeded from every outlet, the twelve months in one
// pass against twelve accumulations, and the crust's diffusion on the GPU
// (src/gpu/landscape.js) against the CPU's, for one step and over twenty coupled
// steps. The GPU tests run headless (WebGPU in node via tests/webgpu-node.mjs) and
// skip without it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { hasGPU } from './webgpu-node.mjs';
import { buildGrid } from '../src/grid/icosphere.js';
import { route, accumulatePass, Landscape } from '../src/engine/landscape.js';
import { Tectonics } from '../src/engine/plates.js';
import { genesis } from '../src/engine/genesis.js';
import { drainage, traceRivers } from '../src/render/rivers.js';

const skip = hasGPU ? false : 'no WebGPU in node (npm install in tests/)';
const say = (...a) => console.log('  ', ...a);

/** The flood as first written: every outlet in the heap. */
function floodReference(g, z, base) {
  const n = g.n, zf = new Float64Array(n), seen = new Uint8Array(n), K = [], V = [];
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
  return zf;
}

/** A planet's crust at level L with relief to cut: a ridge of thick crust across the continents. */
function planet(L, seed = 'landscape-gpu') {
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
  const tec = planet(6), land = new Landscape(tec);
  land.reroute();
  const g = tec.grid, r = land.r, zf = floodReference(g, land.zr, land.base);
  let d = 0;
  for (let i = 0; i < g.n; i++) d = Math.max(d, Math.abs(zf[i] - r.zf[i]));
  assert.equal(d, 0, `filled surface differs by ${d} km`);
  assert.equal(r.count, g.n, 'every cell ordered');
  // Receivers before donors.
  const at = new Int32Array(g.n);
  for (let k = 0; k < r.count; k++) at[r.order[k]] = k;
  for (let i = 0; i < g.n; i++) if (r.rcv[i] >= 0) assert.ok(at[r.rcv[i]] < at[i], `cell ${i} before its receiver`);
});

test('the twelve months in one pass match twelve accumulations', () => {
  const tec = planet(5), land = new Landscape(tec), g = tec.grid, n = g.n;
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

test('crustal diffusion on the GPU: one step as the CPU takes it, crust conserved', { skip }, async () => {
  const { gpuDevice } = await import('../src/gpu/device.js');
  const { GpuDiffusion } = await import('../src/gpu/landscape.js');
  const device = await gpuDevice();
  for (const L of [5, 6]) {
    const tec = planet(L), land = new Landscape(tec), n = tec.grid.n;
    land.gpu = new GpuDiffusion(device, tec.grid);
    const frames = tec.plates.map(p => p.h.slice()), h0 = tec.h.slice();
    const restore = () => { tec.plates.forEach((p, k) => p.h.set(frames[k])); tec.h.set(h0); };
    const v0 = land.volume(), dt = 5e5;
    land.diffuse(dt);
    const hc = tec.h.slice(), vc = land.volume();
    restore();
    const t0 = performance.now();
    await land.diffuseGpu(dt);
    const ms = performance.now() - t0, hg = tec.h.slice(), vg = land.volume();
    let dmax = 0, err = 0;
    for (let i = 0; i < n; i++) { dmax = Math.max(dmax, Math.abs(hc[i] - h0[i])); err = Math.max(err, Math.abs(hg[i] - hc[i])); }
    const sub = land.plan(dt).sub;
    say(`level ${L}: ${sub} substeps, largest change ${(1000 * dmax).toFixed(1)} m, GPU against CPU ${(1000 * err).toFixed(4)} m; volume CPU ${((vc - v0) / v0).toExponential(1)}, GPU ${((vg - v0) / v0).toExponential(1)}; ${ms.toFixed(1)} ms`);
    assert.ok(dmax > 0.05, 'the step diffuses');
    assert.ok(err < 1e-4 * Math.max(1, dmax) + 2e-5, `GPU off the CPU by ${err} km`);
    assert.ok(Math.abs(vg - v0) / v0 < 1e-7, `GPU volume changed by ${((vg - v0) / v0).toExponential(2)}`);
  }
});

test('twenty landscape steps with the GPU diffusing match the CPU statistically', { skip }, async () => {
  const { gpuDevice } = await import('../src/gpu/device.js');
  const { GpuDiffusion } = await import('../src/gpu/landscape.js');
  const device = await gpuDevice();
  const run = async gpu => {
    const tec = planet(6), land = new Landscape(tec);
    if (gpu) land.gpu = new GpuDiffusion(device, tec.grid);
    const v0 = land.volume(), tot = { eroded: 0, toSea: 0, toLakes: 0 };
    for (let s = 0; s < 20; s++) {
      if (gpu) await land.stepAsync(5e5); else land.step(5e5);
      for (const k in tot) tot[k] += land.flux[k] * 5e5;
    }
    land.reroute();
    const g = tec.grid, A = land.areaKm;
    let lakeV = 0, qmax = 0, big = 0;
    for (let i = 0; i < g.n; i++) { lakeV += land.lake[i] * A[i]; qmax = Math.max(qmax, land.discharge[i]); if (land.discharge[i] > 1500) big++; }
    const rivers = traceRivers(g, land);
    const cells = rivers.reduce((s, r) => s + r.cells.length, 0);
    return { tec, land, dv: (land.volume() - v0) / v0, ...tot, lakeV, qmax, big, rivers: rivers.length, cells, h: tec.h.slice() };
  };
  const c = await run(false), q = await run(true);
  const rel = k => Math.abs(q[k] - c[k]) / Math.max(1e-12, Math.abs(c[k]));
  let dh = 0, moved = 0;
  for (let i = 0; i < c.h.length; i++) { const d = Math.abs(q.h[i] - c.h[i]); dh = Math.max(dh, d); if (d > 1e-3) moved++; }
  say(`10 Myr at level 6: eroded ${c.eroded.toFixed(0)}/${q.eroded.toFixed(0)} km³, to the sea ${c.toSea.toFixed(0)}/${q.toSea.toFixed(0)}, to lakes ${c.toLakes.toFixed(1)}/${q.toLakes.toFixed(1)}, lakes ${c.lakeV.toFixed(0)}/${q.lakeV.toFixed(0)} km³`);
  say(`  largest river ${c.qmax.toFixed(0)}/${q.qmax.toFixed(0)} m³/s, cells over 1,500 ${c.big}/${q.big}, rivers ${c.rivers}/${q.rivers} over ${c.cells}/${q.cells} cells; thickness apart by ${(1000 * dh).toFixed(1)} m at most, ${moved} cells over 1 m; volume ${c.dv.toExponential(1)}/${q.dv.toExponential(1)}`);
  assert.ok(Math.abs(q.dv) < 1e-6, `GPU run's volume changed by ${q.dv.toExponential(2)}`);
  for (const [k, tol] of [['eroded', 0.005], ['toSea', 0.01], ['toLakes', 0.05], ['lakeV', 0.05], ['qmax', 0.02], ['big', 0.02], ['rivers', 0.05], ['cells', 0.03]]) {
    assert.ok(rel(k) <= tol, `${k}: CPU ${c[k]}, GPU ${q[k]} (${(100 * rel(k)).toFixed(2)}% > ${100 * tol}%)`);
  }
});
