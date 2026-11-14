// Plates: exact rigid motion, crust made equals crust consumed under one
// relative rotation, sea level conserves water, genesis gives a sane planet.
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildGrid, nearest } from '../src/grid/icosphere.js';
import { Tectonics } from '../src/engine/plates.js';
import { genesis } from '../src/engine/genesis.js';
import { oceanVolume, solveSeaLevel, subsidence } from '../src/engine/crust.js';
import { Polarity } from '../src/engine/polarity.js';

const grid = buildGrid(5);

function onePlate(w) {
  const tec = new Tectonics(grid);
  const p = tec.allocPlate();
  p.alive = true;
  p.w.set(w);
  for (let i = 0; i < grid.n; i++) {
    p.mask[i] = 1; p.h[i] = 7; p.phi[i] = 0; p.tf[i] = -grid.pos[3 * i];   // a marker field: tf = −x at t = 0
    tec.owner[i] = 0; tec.ref[i] = i;
  }
  tec.water = 0;
  return tec;
}

test('one plate turning makes and consumes nothing, and a full turn restores every cell', () => {
  const w = [0.3, -0.5, 0.8].map(c => c / Math.hypot(0.3, 0.5, 0.8) * 0.01);
  const tec = onePlate(w);
  const steps = 64, dt = 2 * Math.PI / 0.01 / steps;
  // Suppress the torque balance: hold ω.
  tec.balance = () => {};
  tec.maybeRift = () => {};
  for (let s = 0; s < steps; s++) tec.step(dt);
  assert.equal(tec.counters.made, 0);
  assert.equal(tec.counters.consumed, 0);
  let moved = 0;
  for (let i = 0; i < grid.n; i++) if (tec.ref[i] !== i) moved++;
  assert.ok(moved <= grid.n * 0.001, `${moved} cells not home after a full turn`);
});

test('a quarter turn carries the field with the plate', () => {
  const w = [0, 0, 0.01];
  const tec = onePlate(w);
  tec.balance = () => {}; tec.maybeRift = () => {};
  const steps = 40, dt = (Math.PI / 2) / 0.01 / steps;
  for (let s = 0; s < steps; s++) tec.step(dt);
  // After a quarter turn about z, the point that started at (1, 0, 0) is at (0, 1, 0).
  const i = nearest(grid, 0, 1, 0);
  assert.ok(Math.abs(tec.tf[i] - -1) < 0.05, `tf ${tec.tf[i]}`);
});

test('two plates under one relative rotation: crust made balances crust consumed', () => {
  const tec = new Tectonics(grid);
  const A = tec.allocPlate(), B = tec.allocPlate();
  A.alive = B.alive = true;
  A.w.set([0, 0, -0.004]); B.w.set([0, 0, 0.004]);
  for (let i = 0; i < grid.n; i++) {
    const k = grid.pos[3 * i] > 0 ? 1 : 0;
    const p = tec.plates[k];
    p.mask[i] = 1; p.h[i] = 7; p.phi[i] = 0; p.tf[i] = -50;
    tec.owner[i] = k; tec.ref[i] = i;
  }
  tec.balance = () => {}; tec.maybeRift = () => {};
  for (let s = 0; s < 120; s++) tec.step(0.5);
  const { made, consumed } = tec.counters;
  assert.ok(made > 100 && consumed > 100, `made ${made}, consumed ${consumed}`);
  assert.ok(Math.abs(made - consumed) / made < 0.15, `made ${made} vs consumed ${consumed}`);
  // Young crust only where the plates part: near y < 0 on the x = 0 circle (away
  // from the rotation's poles, where the boundary turns from opening to closing).
  let young = 0, youngWrong = 0;
  for (let i = 0; i < grid.n; i++) {
    if (tec.t - tec.tf[i] < 5 && Math.abs(grid.pos[3 * i + 2]) < 0.6) { young++; if (grid.pos[3 * i + 1] > 0.3) youngWrong++; }
  }
  assert.ok(young > 0 && youngWrong / young < 0.05, `young ${young}, on the closing side ${youngWrong}`);
});

test('sea level holds the water it is given', () => {
  const tec = new Tectonics(grid);
  genesis(tec, 'sea', {});
  const v = oceanVolume(grid, tec.elev, tec.seaLevel);
  assert.ok(Math.abs(v - tec.water) / tec.water < 1e-6);
  const s2 = solveSeaLevel(grid, tec.elev, tec.water * 1.1);
  assert.ok(s2 > tec.seaLevel);
});

test('subsidence follows √age while young and flattens', () => {
  assert.ok(Math.abs(subsidence(4) - 0.73) < 1e-9);
  assert.ok(Math.abs(subsidence(20) - subsidence(19.999)) < 1e-3);   // continuous at 20 Myr
  assert.ok(subsidence(200) < 3.06 && subsidence(200) > 2.9);
});

test('polarity: the integral table matches the record', () => {
  const pol = new Polarity('p');
  const T0 = -50, dT = 0.01, N = 3000;
  const C = pol.table(T0, dT, N);
  for (const k of [10, 500, 1999, 2999]) {
    let s = 0;
    for (let m = 0; m < k * 10; m++) s += pol.at(T0 + (m + 0.5) * dT / 10) * dT / 10;
    assert.ok(Math.abs(C[k] - s) < 0.02, `k ${k}: ${C[k]} vs ${s}`);
  }
  const rate = pol.recent(0, 100).length / 100;
  assert.ok(rate > 0.2 && rate < 15, `rate ${rate}`);
});

test('genesis gives a sane planet that runs', () => {
  const g6 = buildGrid(6);
  const tec = new Tectonics(g6);
  genesis(tec, 'earthlike', {});
  const s0 = tec.stats();
  assert.equal(s0.plates, 12);
  assert.ok(Math.abs(s0.land - 0.29) < 0.02, `land ${s0.land}`);
  const t0 = performance.now();
  for (let s = 0; s < 60; s++) tec.step(0.5);
  const ms = (performance.now() - t0) / 60;
  const s1 = tec.stats();
  for (let i = 0; i < g6.n; i++) assert.ok(Number.isFinite(tec.elev[i]), `elev ${i}`);
  assert.ok(s1.plates >= 3, `plates ${s1.plates}`);
  assert.ok(s1.fastest < 16, `fastest ${s1.fastest} cm/yr`);
  console.log(`  level 6 step: ${ms.toFixed(1)} ms; after 30 Myr: ${s1.plates} plates, land ${(100 * s1.land).toFixed(1)}%, fastest ${s1.fastest.toFixed(1)} cm/yr, ocean age ${s1.meanOceanAge.toFixed(0)} Myr, sea level ${(1000 * (s1.seaLevel - s0.seaLevel)).toFixed(0)} m; ${JSON.stringify(tec.counters)}`);
});
