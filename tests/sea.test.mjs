// The ocean and the basins it doesn't reach (src/engine/crust.js, seaMask; src/engine/plates.js,
// solveSea): on a made-up planet, an ocean, a continent, and in the continent a basin below sea
// level joined to the ocean by a channel, floored by continental crust (one floored by the
// ocean's is trapped ocean, joined below the grid's scale). The sea holds its water over the ocean alone; a basin it
// leaves keeps its water for the lakes and the level doesn't move; a sill short of STRAIT keeps
// the strait open; a basin it reaches gives its lakes back to the sea.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildGrid } from '../src/grid/icosphere.js';
import { Tectonics } from '../src/engine/plates.js';
import { SEA } from '../src/engine/crust.js';
const STRAIT = SEA.STRAIT;

const grid = buildGrid(5), n = grid.n, P = grid.pos, A = grid.area;
const deg = Math.PI / 180;
const B = [Math.sin(40 * deg), 0, Math.cos(40 * deg)];   // the basin's centre, 20° in from the coast
const kind = new Uint8Array(n);                            // 0 ocean, 1 land, 2 basin, 3 channel
for (let i = 0; i < n; i++) {
  const x = P[3 * i], y = P[3 * i + 1], z = P[3 * i + 2];
  if (z > Math.cos(60 * deg)) kind[i] = 1;
  if (x * B[0] + z * B[2] > Math.cos(5 * deg)) kind[i] = 2;
  else if (kind[i] === 1 && x > 0 && Math.abs(y) < 0.03 && z < Math.cos(42 * deg)) kind[i] = 3;
}

function planet(channel, oceanicBasin = false) {
  const tec = new Tectonics(grid);
  for (let i = 0; i < n; i++) { tec.elev[i] = [-4, 0.5, -1, channel][kind[i]]; tec.phi[i] = kind[i] === 0 || (oceanicBasin && kind[i] === 2) ? 0 : 1; }
  tec.water = 0;
  for (let i = 0; i < n; i++) if (kind[i] === 0) tec.water += 4 * A[i];
  tec.solveSea();
  return tec;
}
const oceanVol = tec => { let v = 0; for (let i = 0; i < n; i++) if (tec.sea[i]) v += (tec.seaLevel - tec.elev[i]) * A[i]; return v; };
const basinCells = () => { const c = []; for (let i = 0; i < n; i++) if (kind[i] === 2) c.push(i); return c; };
const setChannel = (tec, z) => { for (let i = 0; i < n; i++) if (kind[i] === 3) tec.elev[i] = z; };

test('the sea holds its water over the ocean alone, and a closed basin lies dry', () => {
  const tec = planet(0.3);
  assert.ok(Math.abs(tec.seaLevel) < 1e-6, `sea level ${tec.seaLevel}`);
  assert.ok(basinCells().length > 5);
  for (const i of basinCells()) assert.equal(tec.sea[i], 0);
  assert.ok(Math.abs(oceanVol(tec) - tec.seaWater()) < 1e-9 * tec.water);
  let land = 0;
  for (let i = 0; i < n; i++) if (!tec.sea[i]) land += A[i];
  assert.ok(Math.abs(land - (4 * Math.PI - tec.oceanArea)) < 1e-12);
});

test('a basin floored by oceanic crust is trapped ocean: the sea, joined below the grid\'s scale', () => {
  const tec = planet(0.3, true);
  for (const i of basinCells()) assert.equal(tec.sea[i], 1);
  assert.ok(Math.abs(oceanVol(tec) - tec.seaWater()) < 1e-9 * tec.water);
});

test('a basin the sea leaves keeps its water for the lakes; the level holds', () => {
  const tec = planet(-0.2);
  tec.lakeDepth = new Float32Array(n);                     // lakes attached, empty
  for (const i of basinCells()) assert.equal(tec.sea[i], 1);
  const basins0 = tec.basins;
  // A sill short of STRAIT keeps the strait open (the channel's cells, out of the water now,
  // give the sea their room).
  setChannel(tec, 0.6 * STRAIT);
  tec.solveSea();
  for (const i of basinCells()) assert.equal(tec.sea[i], 1, 'still joined through the strait');
  assert.equal(tec.basins, basins0);
  const s1 = tec.seaLevel;
  let basin = 0;
  for (const i of basinCells()) basin += (s1 - tec.elev[i]) * A[i];
  // Clear of it, the basin is cut off with its water, and the level doesn't move.
  setChannel(tec, 0.1);
  tec.solveSea();
  for (const i of basinCells()) assert.equal(tec.sea[i], 0);
  assert.ok(tec.basins > basins0);
  let cut = 0;
  for (let i = 0; i < n; i++) cut += tec.cutWater[i] * A[i];
  assert.ok(Math.abs(cut - tec.cutHeld) < 1e-6 * cut && tec.lakeWater === tec.cutHeld);
  assert.ok(Math.abs(tec.cutHeld - basin) < 1e-12, `${tec.cutHeld} against ${basin}`);
  assert.ok(Math.abs(oceanVol(tec) - tec.seaWater()) < 1e-9 * tec.water);
  assert.ok(Math.abs(tec.seaLevel - s1) < 1e-9, `the level moved ${(tec.seaLevel - s1) * 1e3} m`);
});

test('a basin the sea reaches takes its water, and its lakes go back to the sea', () => {
  const tec = planet(0.3);
  tec.lakeDepth = new Float32Array(n);
  const s0 = tec.seaLevel;
  // A lake half fills the basin: its water is off the sea's.
  let lake = 0;
  for (const i of basinCells()) { tec.lakeDepth[i] = 0.4; lake += 0.4 * A[i]; }
  tec.lakeWater = lake;
  tec.solveSea();
  assert.ok(tec.seaLevel < s0, 'the lake\'s water left the sea');
  const s1 = tec.seaLevel;
  // The sill drops below the sea: the basin joins, the sea pours in and the lake comes back.
  setChannel(tec, -0.2);
  tec.solveSea();
  for (const i of basinCells()) assert.equal(tec.sea[i], 1);
  assert.ok(tec.lakeWater < 1e-12, `lakes ${tec.lakeWater}`);
  assert.ok(Math.abs(oceanVol(tec) - tec.seaWater()) < 1e-9 * tec.water);
  let basin = 0;
  for (let i = 0; i < n; i++) if (kind[i] === 2 || kind[i] === 3) basin += (tec.seaLevel - tec.elev[i]) * A[i];
  // The level falls by about what the basin takes beyond its lake, over the ocean.
  const expect = s1 - (basin - lake) / tec.oceanArea;
  assert.ok(Math.abs(tec.seaLevel - expect) < 0.02 * Math.abs(s1 - expect) + 1e-6, `${tec.seaLevel} against ${expect}`);
});

test('a rising sea floods over a sill in one solve, and stands lower for it', () => {
  const tec = planet(0.02);   // dry: the sill stands 20 m clear and was never sea
  for (const i of basinCells()) assert.equal(tec.sea[i], 0);
  const s0 = tec.seaLevel;
  tec.water += 0.05 * tec.oceanArea;                       // 50 m more sea: over the sill
  tec.solveSea();
  for (const i of basinCells()) assert.equal(tec.sea[i], 1);
  assert.ok(tec.seaLevel > 0.02 && tec.seaLevel < s0 + 0.05, `sea level ${tec.seaLevel}`);
  assert.ok(Math.abs(oceanVol(tec) - tec.seaWater()) < 1e-9 * tec.water);
});
