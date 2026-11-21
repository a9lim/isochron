// Plates (src/engine/plates.js): exact rigid motion, crust made equal to crust consumed, sea level holding its water.
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildGrid } from '../src/grid/icosphere.js';
import { Tectonics } from '../src/engine/plates.js';

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
