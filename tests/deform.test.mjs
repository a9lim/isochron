// The crust's deformation past the rigid plates (src/engine/plates.js, deform): no crust made, no load to the
// flexure.
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildGrid } from '../src/grid/icosphere.js';
import { Tectonics, PARAMS } from '../src/engine/plates.js';
import { H_OCEANIC, RHO_OCEANIC, RHO_CONTINENTAL } from '../src/engine/crust.js';

const grid = buildGrid(5), n = grid.n;

/** Two plates split at x = 0 (A: x > 0), continental crust h km thick, turning by wA and wB. */
function twoPlates(h, wA, wB) {
  const tec = new Tectonics(grid);
  const A = tec.allocPlate(), B = tec.allocPlate();
  A.alive = B.alive = true;
  A.w.set(wA); B.w.set(wB);
  for (let i = 0; i < n; i++) {
    const k = grid.pos[3 * i] > 0 ? 0 : 1, p = tec.plates[k];
    p.mask[i] = 1; p.h[i] = h; p.phi[i] = 1; p.tf[i] = -1000; p.sut[i] = -1e9;
    tec.owner[i] = k; tec.ref[i] = i;
  }
  tec.t = 10;
  sample(tec);
  return tec;
}
function sample(tec) {
  for (let i = 0; i < n; i++) { const p = tec.plates[tec.owner[i]], j = tec.ref[i]; tec.h[i] = p.h[j]; tec.phi[i] = p.phi[j]; tec.tf[i] = p.tf[j]; tec.sut[i] = p.sut[j]; }
}
/** A's cells beside B: new ocean made there this step (t1 − dt/2), the crust beside them A's continent. */
function newOcean(tec, t1, dt) {
  const A = tec.plates[0], cells = [];
  for (let i = 0; i < n; i++) {
    if (tec.owner[i] !== 0) continue;
    let edge = false;
    for (let e = grid.nbrOff[i]; e < grid.nbrOff[i + 1]; e++) if (tec.owner[grid.nbr[e]] === 1) edge = true;
    if (edge) { A.h[i] = H_OCEANIC; A.phi[i] = 0; A.tf[i] = t1 - 0.5 * dt; cells.push(i); }
  }
  sample(tec);
  return cells;
}

test('no load to the crust\'s flexure: a front\'s stacking is seen as it stands, and moved crust takes its mass with it', () => {
  const dt = 0.5, t1 = 10.5, massOf = (h, phi) => (RHO_OCEANIC + (RHO_CONTINENTAL - RHO_OCEANIC) * phi) * h;
  // Plates parting about z where y < 0 (rifted margins), a front stacked this step on A away from them, and a plateau.
  const tec = twoPlates(25, [0, 0, 0.004], [0, 0, -0.004]);
  const fresh = newOcean(tec, t1, dt), A = tec.plates[0];
  let f = -1, c = -1;
  for (let i = 0; i < n; i++) {
    const x = grid.pos[3 * i], y = grid.pos[3 * i + 1], z = grid.pos[3 * i + 2];
    if (f < 0 && tec.owner[i] === 0 && x > 0.1 && x < 0.3 && y > 0.5 && Math.abs(z) < 0.3) f = i;
    if (c < 0 && tec.owner[i] === 0 && x > 0.9) c = i;
  }
  A.h[c] = 200;
  // The flexure has seen every column as it stands, but the new ocean (new to it) and the front's stacking.
  for (const p of tec.plates) for (let j = 0; j < n; j++) p.mq[j] = massOf(p.h[j], p.phi[j]);
  for (const i of fresh) A.mq[i] = -1;
  A.h[f] += 30; A.sut[f] = t1;
  sample(tec);
  tec.deform(t1, dt);
  assert.ok(fresh.some(i => tec.phi[i] === 1) && A.h[f] < 55 && A.h[c] <= PARAMS.H_PLATEAU + 1e-9, 'a margin stretched, the front spread, the plateau spread');
  let worst = 0;
  for (const p of tec.plates) for (let j = 0; j < n; j++) if (p.mask[j] && p.mq[j] >= 0) worst = Math.max(worst, Math.abs(massOf(p.h[j], p.phi[j]) - p.mq[j]));
  assert.ok(worst < 1e-3, `a column's mass off what the flexure saw by ${worst.toExponential(2)} (ρh, g/cm³·km)`);
});
