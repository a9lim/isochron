// The plates' step on the GPU (src/gpu/plates.js) against the CPU's. f32 against f64 flips a nearest-cell tie now and
// then, so one step agrees almost everywhere; the CPU's frames must mirror the GPU's exactly.
import test from 'node:test';
import assert from 'node:assert/strict';
import { skip } from './webgpu-node.mjs';
import { buildGrid } from '../src/grid/icosphere.js';
import { Tectonics } from '../src/engine/plates.js';
import { Landscape } from '../src/engine/landscape.js';
import { genesis } from '../src/engine/genesis.js';
import { solveSeaLevel } from '../src/engine/crust.js';

const grid6 = buildGrid(6);
const planet = (spinup = 10, land = false) => {
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
  // The GPU's level fills every basin below it (the CPU then solves the ocean's: plates.js, solveSea).
  const all = solveSeaLevel(grid6, tec.elev, tec.seaWater(), tec.seaLevel);
  assert.ok(Math.abs(r.sea - all) < 5e-5, `sea level ${(1e6 * (r.sea - all)).toFixed(0)} mm off`);
  // The mantle's traction is the CPU's on either path (Tectonics.traction): added to the GPU's sums here as stepAsync does.
  tec.traction(r.T);
  for (const p of tec.plates) {
    if (!p.alive) continue;
    const k = p.index, T = [0, 1, 2].map(c => r.T[3 * k + c] + p.torqueExt[c] - cap.T[3 * k + c]);
    assert.ok(Math.abs(r.M[9 * k] - cap.M[9 * k]) < 1e-5 * cap.M[9 * k], `plate ${k}: drag`);
    assert.ok(Math.hypot(...T) < 1e-4 * Math.hypot(cap.T[3 * k], cap.T[3 * k + 1], cap.T[3 * k + 2]), `plate ${k}: torque`);
    assert.ok(Math.abs(r.area[k] - p.area) < 1e-5 * p.area, `plate ${k}: area`);
  }
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

test('the frames\' extras on the GPU path (the regolith, the flexure\'s correction): carried with the crust, fresh on new crust', { skip }, async () => {
  const a = planet().t, b = planet().t;
  await gpu(b);
  const t0 = a.t, n = grid6.n;
  // The deformation edits the flexure's memory where it moves crust (tests/deform.test.mjs): off here, so a carried value is recognizable.
  for (const tec of [a, b]) tec.deform = () => 0;
  // Mark each frame cell's extras by its crust's age, so a carried value is recognizable.
  for (const tec of [a, b]) for (const p of tec.plates) for (let j = 0; j < n; j++) { const v = p.mask[j] ? t0 - p.tf[j] : 0; p.reg[j] = v; p.cf[j] = 2 * v; p.mq[j] = 3 * v; }
  for (let k = 0; k < 6; k++) { a.step(0.5); await b.stepAsync(0.5); }
  const check = tec => {
    let carried = 0, fresh = 0, bad = 0;
    for (const p of tec.plates) for (let j = 0; j < n; j++) {
      if (!p.mask[j]) continue;
      const v = t0 - p.tf[j];
      if (p.tf[j] > t0 - 1e-3) { if (p.reg[j] === 0 && p.cf[j] === 0 && p.mq[j] === -1) fresh++; else bad++; }
      else if (Math.abs(p.reg[j] - v) < 1e-4 * v && Math.abs(p.cf[j] - 2 * v) < 1e-4 * v && Math.abs(p.mq[j] - 3 * v) < 1e-4 * v) carried++;
      else bad++;
    }
    return { carried, fresh, bad };
  };
  const ca = check(a), cb = check(b);
  assert.equal(ca.bad, 0, 'the CPU\'s step');
  assert.equal(cb.bad, 0, 'the GPU\'s edits');
});
