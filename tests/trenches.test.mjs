// Trenches (src/engine/plates.js, trenches): the broken plate's profile on the sinking plate, none where the plates
// part.
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildGrid } from '../src/grid/icosphere.js';
import { Tectonics, PARAMS, EARTH_RADIUS_KM } from '../src/engine/plates.js';

const grid = buildGrid(5), n = grid.n;

/** Two plates split at x = 0 (A: x > 0), each its crust: [h, φ, age]. */
function twoPlates(wA, wB, crustA, crustB) {
  const tec = new Tectonics(grid);
  const A = tec.allocPlate(), B = tec.allocPlate();
  A.alive = B.alive = true;
  A.w.set(wA); B.w.set(wB);
  for (let i = 0; i < n; i++) {
    const k = grid.pos[3 * i] > 0 ? 0 : 1, p = tec.plates[k], [h, phi, age] = k ? crustB : crustA;
    p.mask[i] = 1; p.h[i] = h; p.phi[i] = phi; p.tf[i] = -age;
    tec.owner[i] = k; tec.ref[i] = i; tec.h[i] = h; tec.phi[i] = phi; tec.tf[i] = -age;
  }
  return tec;
}
const young = [7, 0, 10], old = [7, 0, 100], cont = [30, 1, 1000];
// About z, A (x > 0) moves +x where y > 0 and −x where y < 0, B the other way: the plates close across x = 0
// where y < 0 (up to 0.012 rad/Myr, ~7.6 cm/yr), and part where y > 0.
const closing = () => twoPlates([0, 0, -0.006], [0, 0, 0.006], young, old);

test('a trench and an outer rise on the sinking plate where ocean closes, none where the plates part', () => {
  const tec = closing();
  tec.trenches();
  const tr = tec.trench, w0 = PARAMS.TRENCH, alpha = PARAMS.TRENCH_ALPHA;
  let deep = 0, rise = 0, topSide = 0, parting = 0;
  for (let i = 0; i < n; i++) {
    const x = grid.pos[3 * i], y = grid.pos[3 * i + 1], z = grid.pos[3 * i + 2];
    if (Math.abs(z) > 0.5) continue;
    if (y < -0.4 && tec.owner[i] === 1) { deep = Math.min(deep, tr[i]); rise = Math.max(rise, tr[i]); }
    if (y < -0.4 && tec.owner[i] === 0) topSide = Math.max(topSide, Math.abs(tr[i]));
    if (y > 0.4) parting = Math.max(parting, Math.abs(tr[i]));
  }
  // The deepest cell: the profile's mean over a cell's width (level 5: ~220 km against α 70 km) centred half an
  // edge from the trench.
  const cell = Math.sqrt(4 * Math.PI / n) * EARTH_RADIUS_KM, F = u => 0.5 * Math.exp(-u) * (Math.sin(u) - Math.cos(u));
  // The deepest cell's distance from the trench: half its mean edge to the plate above.
  let di = -1;
  for (let i = 0; i < n; i++) if (tr[i] === deep) di = i;
  let es = 0, em = 0;
  for (let t = grid.nbrOff[di]; t < grid.nbrOff[di + 1]; t++) if (tec.owner[grid.nbr[t]] === 0) { es += grid.dist[t]; em++; }
  const x0 = 0.5 * es / em * EARTH_RADIUS_KM, u0 = Math.max(0, x0 - 0.5 * cell) / alpha, u1 = (x0 + 0.5 * cell) / alpha;
  const nearest = -w0 * (F(u1) - F(u0)) / (u1 - u0);
  assert.ok(Math.abs(deep / nearest - 1) < 0.1, `the trench ${deep.toFixed(3)} km against the nearest cell's mean ${nearest.toFixed(3)}`);
  assert.ok(rise > 0 && rise < 0.15 * w0, `the outer rise ${rise.toFixed(3)} km`);
  assert.equal(topSide, 0, 'the plate above stands unbent');
  assert.equal(parting, 0, 'no trench where the plates part');
  // A trench's depth goes as √age: the same with the sinking plate 25 Myr old is half as deep.
  const yng = twoPlates([0, 0, -0.006], [0, 0, 0.006], young, [7, 0, 25]);
  yng.trenches();
  let d25 = 0;
  for (let i = 0; i < n; i++) if (yng.owner[i] === 1 && grid.pos[3 * i + 1] < -0.4 && Math.abs(grid.pos[3 * i + 2]) < 0.5) d25 = Math.min(d25, yng.trench[i]);
  assert.ok(d25 < 0 && d25 > deep, `25 Myr: ${d25.toFixed(3)} km, shallower than 100 Myr's ${deep.toFixed(3)}`);
});
