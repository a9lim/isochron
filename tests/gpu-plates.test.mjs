// The plates' step and the drawn surface on the GPU (src/gpu/plates.js, src/gpu/surface.js)
// against their CPU references, headless (WebGPU in node via tests/webgpu-node.mjs; skipped
// without it). f32 against f64 flips a nearest-cell tie now and then, and the GPU's passes
// reproduce the CPU's sequential ones only where they matter (the slabs' inheritance,
// consumption, foundering), so one step agrees cell for cell almost everywhere and long runs
// agree statistically; the CPU's frames must mirror the GPU's exactly.
import test from 'node:test';
import assert from 'node:assert/strict';
import { hasGPU } from './webgpu-node.mjs';
import { buildGrid } from '../src/grid/icosphere.js';
import { Tectonics, CM_PER_YR } from '../src/engine/plates.js';
import { Landscape } from '../src/engine/landscape.js';
import { genesis } from '../src/engine/genesis.js';

const skip = hasGPU ? false : 'no WebGPU in node (npm install in tests/)';
const grid6 = buildGrid(6);
const planet = (spinup = 20, land = false) => {
  const t = new Tectonics(grid6), L = land ? new Landscape(t) : null;
  genesis(t, 'earthlike', { spinup, landscape: L || undefined });
  return { t, land: L };
};
async function gpu(tec) {
  const { gpuDevice } = await import('../src/gpu/device.js');
  const { GpuPlates } = await import('../src/gpu/plates.js');
  tec.gpu = new GpuPlates(await gpuDevice(), tec);
  return tec.gpu;
}
/** The CPU's frames against the GPU's, every masked frame cell; and the world as sampled from them. */
async function mirrorErrors(tec) {
  let bad = 0;
  const clean = !tec.dirty.owner && !tec.dirty.plates.size;   // else a rare event after the step has moved the world on
  for (const g of await tec.gpu.pullFrames()) {
    const p = tec.plates[g.index];
    for (let j = 0; j < tec.grid.n; j++) {
      if (g.mask[j] !== p.mask[j]) bad++;
      else if (p.mask[j] && (g.h[j] !== p.h[j] || g.phi[j] !== p.phi[j] || g.tf[j] !== p.tf[j] || g.sut[j] !== p.sut[j])) bad++;
    }
  }
  for (let i = 0; i < tec.grid.n && clean; i++) {
    const p = tec.plates[tec.owner[i]];
    if (!p.alive || tec.h[i] !== p.h[tec.ref[i]] || tec.tf[i] !== p.tf[tec.ref[i]]) bad++;
  }
  return bad;
}

test('the plate step on the GPU: one step from one state, as the CPU\'s', { skip }, async () => {
  const a = planet().t, b = planet().t;
  await gpu(b);
  a.step(0.5);
  await b.stepAsync(0.5);
  const n = grid6.n;
  let own = 0, slab = 0, slabs = 0;
  for (let i = 0; i < n; i++) {
    if (a.owner[i] === b.owner[i]) own++;
  }
  await b.gpu.pullMemory();
  for (let i = 0; i < n; i++) if (a.slab[i] > 1e-4 || b.slab[i] > 1e-4) { slabs++; if (Math.abs(a.slab[i] - b.slab[i]) < 1e-5 && a.slabPlate[i] === b.slabPlate[i]) slab++; }
  assert.ok(own > 0.999 * n, `owners agree at ${(100 * own / n).toFixed(3)}% of cells`);
  assert.ok(slab > 0.995 * slabs, `slabs agree at ${(100 * slab / slabs).toFixed(2)}% of ${slabs} cells`);
  assert.ok(Math.abs(a.seaLevel - b.seaLevel) < 0.002, `sea level ${(1000 * a.seaLevel).toFixed(2)} m against ${(1000 * b.seaLevel).toFixed(2)} m`);
  // ω relaxes a fifth of the way to its balance each step, and a plate's slab pull comes from a few
  // hundred trench cells, so one cell's slab moves a small plate's ω by a percent.
  const dw = a.alivePlates().map(p => { const q = b.plates[p.index]; return Math.hypot(p.w[0] - q.w[0], p.w[1] - q.w[1], p.w[2] - q.w[2]) / Math.hypot(...p.w); }).sort((x, y) => x - y);
  console.log(`  ω off by ${dw.map(d => (100 * d).toFixed(2)).join(' ')}%`);
  assert.ok(dw[dw.length >> 1] < 0.005 && dw[dw.length - 1] < 0.05, 'ω');
  assert.equal(await mirrorErrors(b), 0, 'the CPU\'s frames mirror the GPU\'s');
});

test('the balance\'s sums on the GPU: the CPU\'s, on one state', { skip }, async () => {
  const { t: tec } = planet();
  for (let s = 0; s < 4; s++) tec.step(0.5);
  const r = await (await gpu(tec)).measure();
  let cap = null;
  tec.solveBalance = (M, T) => { cap = { M, T }; };
  const o0 = tec.counters.opened, cell = 4 * Math.PI / grid6.n;
  tec.kinematics(cell);
  assert.ok(Math.abs(tec.counters.opened - o0 - r.open) < 1e-5 * r.open, 'kinematics');
  tec.balance(0.5);
  assert.ok(Math.abs(r.sea - tec.seaLevel) < 5e-5, `sea level ${(1e6 * (r.sea - tec.seaLevel)).toFixed(0)} mm off`);
  for (const p of tec.plates) {
    if (!p.alive) continue;
    const k = p.index, T = [0, 1, 2].map(c => r.T[3 * k + c] + p.torqueExt[c] - cap.T[3 * k + c]);
    assert.ok(Math.abs(r.M[9 * k] - cap.M[9 * k]) < 1e-5 * cap.M[9 * k], `plate ${k}: drag`);
    assert.ok(Math.hypot(...T) < 1e-4 * Math.hypot(cap.T[3 * k], cap.T[3 * k + 1], cap.T[3 * k + 2]), `plate ${k}: torque`);
    assert.ok(Math.abs(r.area[k] - p.area) < 1e-5 * p.area, `plate ${k}: area`);
  }
});

test('the plate step on the GPU: 30 Myr with the landscape, statistically the CPU\'s', { skip }, async () => {
  const A = planet(40, true), B = planet(40, true);
  await gpu(B.t);
  const g = grid6, n = g.n;
  const stats = t => {
    let cont = 0, age = 0, ocean = 0, bl = 0, land = 0, v2 = 0;
    for (let i = 0; i < n; i++) {
      const a = g.area[i];
      if (t.phi[i] >= 0.5) cont += a; else { ocean += a; age += a * (t.t - t.tf[i]); }
      if (t.elev[i] > t.seaLevel) land += a;
      for (let e = g.nbrOff[i]; e < g.nbrOff[i + 1]; e++) if (g.nbr[e] > i && t.owner[g.nbr[e]] !== t.owner[i]) bl += g.ell[e];
      const w = t.plates[t.owner[i]].w, x = g.pos[3 * i], y = g.pos[3 * i + 1], z = g.pos[3 * i + 2];
      v2 += a * ((w[1] * z - w[2] * y) ** 2 + (w[2] * x - w[0] * z) ** 2 + (w[0] * y - w[1] * x) ** 2);
    }
    return { cont: cont / (4 * Math.PI), land: land / (4 * Math.PI), age: age / ocean, bl, rms: Math.sqrt(v2 / (4 * Math.PI)) * CM_PER_YR, sea: 1000 * t.seaLevel };
  };
  const sa = [], sb = [];
  for (let s = 1; s <= 60; s++) {
    A.t.step(0.5); A.land.step(5e5);
    await B.t.stepAsync(0.5); B.land.step(5e5);
    if (s % 10 === 0) { sa.push(stats(A.t)); sb.push(stats(B.t)); }
  }
  // The landscape's last writes reach the GPU at the next step's start.
  await B.t.stepAsync(0.5);
  const mean = (a, f) => a.reduce((s, x) => s + x[f], 0) / a.length;
  // Tolerances twice the GPU's spread over five 40–60 Myr runs (three seeds, levels 6 and 7),
  // where it matched a CPU whose ω was nudged by 3e-3: chaos's own spread.
  const tol = { cont: 0.002, land: 0.012, age: 0.03, bl: 0.04, rms: 0.08, sea: 25 };
  const rel = { age: 1, bl: 1, rms: 1 };
  for (const [f, tl] of Object.entries(tol)) {
    const ma = mean(sa, f), mb = mean(sb, f), d = rel[f] ? Math.abs(mb / ma - 1) : Math.abs(mb - ma);
    assert.ok(d < tl, `${f}: CPU ${ma.toFixed(4)}, GPU ${mb.toFixed(4)}`);
  }
  assert.equal(await mirrorErrors(B.t), 0, 'the CPU\'s frames mirror the GPU\'s after the landscape\'s writes');
});

test('rare events on the GPU path: a rift and a merge, run on the CPU and carried back up', { skip }, async () => {
  const { t: tec } = planet();
  await gpu(tec);
  await tec.stepAsync(0.5);
  const alive0 = tec.alivePlates().length, r0 = tec.counters.rifts;
  let big = null;
  for (const p of tec.alivePlates()) if (!big || p.area > big.area) big = p;
  tec.rift(big.index);
  await tec.stepAsync(0.5);
  assert.ok(tec.counters.rifts === r0 + 1 && tec.alivePlates().length > alive0, 'the rift made a plate');
  assert.equal(await mirrorErrors(tec), 0, 'after the rift');
  // Weld two neighbours: the next step finds the tally, reads the memories down, merges and pushes back.
  const g = tec.grid;
  let a = -1, b = -1;
  for (let i = 0; i < g.n && a < 0; i++) for (let e = g.nbrOff[i]; e < g.nbrOff[i + 1]; e++) {
    const o = tec.owner[g.nbr[e]];
    if (o !== tec.owner[i]) { a = Math.min(o, tec.owner[i]); b = Math.max(o, tec.owner[i]); break; }
  }
  tec.pairs.set(a * 32 + b, 1e6);
  const m0 = tec.counters.merges;
  await tec.stepAsync(0.5);
  assert.equal(tec.counters.merges, m0 + 1, 'merged');
  await tec.stepAsync(0.5);
  assert.equal(await mirrorErrors(tec), 0, 'after the merge');
});

test('the drawn surface on the GPU: the CPU\'s fields', { skip }, async () => {
  const { gpuDevice } = await import('../src/gpu/device.js');
  const { GpuSurface } = await import('../src/gpu/surface.js');
  const { surfaceFields } = await import('../src/render/surface.js');
  const { t: tec, land } = planet(20, true);
  land.step(5e5);
  const ice = { H: new Float64Array(grid6.n) };
  for (let i = 0; i < grid6.n; i += 97) ice.H[i] = 30;
  const c = surfaceFields(grid6, tec, land, ice), gs = new GpuSurface(await gpuDevice(), grid6), f = await gs.fields(tec, land, ice);
  const worst = k => { let w = 0; for (let i = 0; i < c[k].length; i++) w = Math.max(w, Math.abs(c[k][i] - f[k][i])); return w; };
  assert.ok(worst('elevRel') < 1e-4, `relief off by ${worst('elevRel')} km`);
  assert.ok(worst('normals') < 1e-4, `normals off by ${worst('normals')}`);
  assert.ok(worst('tfDraw') < 1e-3, `stripes off by ${worst('tfDraw')} Myr`);
  assert.ok(worst('lakeDraw') < 1e-4, `lakes off by ${worst('lakeDraw')} km`);
  let lakes = 0;
  for (let i = 0; i < grid6.n; i++) if (c.lakeDraw[i] > 0) lakes++;
  assert.ok(lakes > 0, 'the planet has lakes to compare');
});
