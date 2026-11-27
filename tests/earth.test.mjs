// Today's Earth (`?seed=earth`, src/engine/earth.js): the opening stands where the baked data does.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openPlanet } from '../src/engine/planet.js';
import { loadEarth, EARTH } from '../src/engine/earth.js';
import { elevation, H_OCEANIC } from '../src/engine/crust.js';
import { buildGrid, nearest } from '../src/grid/icosphere.js';

const data = await loadEarth();
const datum = elevation(H_OCEANIC, 0, 0) + EARTH.RIDGE;
const at = (g, lat, lon) => { const a = lat * Math.PI / 180, b = lon * Math.PI / 180; return nearest(g, Math.cos(a) * Math.cos(b), Math.cos(a) * Math.sin(b), Math.sin(a)); };

test("Earth's opening at level 6: the sea at the datum, the bed within tens of metres of ETOPO's, the land and the ice Earth's", async () => {
  const P = await openPlanet('earth', { level: 6, earth: data });
  const tec = P.tec, g = P.grid, n = g.n;
  let land = 0, e2 = 0;
  for (let i = 0; i < n; i++) {
    if (!tec.sea[i]) land += g.area[i];
    const e = (tec.elev[i] - tec.seaLevel) - (P.earth.target[i] - datum);
    e2 += e * e * g.area[i];
  }
  land /= 4 * Math.PI;
  assert.ok(Math.abs(tec.seaLevel - datum) < 0.002, `the sea at the datum (${((tec.seaLevel - datum) * 1000).toFixed(1)} m off)`);
  assert.ok(land > 0.27 && land < 0.30, `land ${(100 * land).toFixed(1)}%`);
  assert.ok(Math.sqrt(e2 / (4 * Math.PI)) * 1000 < 80, `the bed within ${(Math.sqrt(e2 / (4 * Math.PI)) * 1000).toFixed(0)} m rms of ETOPO's`);
  const ice = P.ice.stats.volume / 1e15;
  assert.ok(ice > 27 && ice < 31, `grounded ice ${ice.toFixed(1)} M km³ (Antarctica and Greenland ~29)`);
});

test("Earth's baked plates: each one piece, and a deforming zone split by how it moves (Baja rides the Pacific with the sea west of it)", () => {
  const g = buildGrid(data.level), n = g.n, plate = data.plate, seen = new Uint8Array(n), stack = new Int32Array(n);
  let pieces = 0;
  for (let s = 0; s < n; s++) {
    if (seen[s]) continue;
    pieces++; seen[s] = 1; stack[0] = s;
    for (let top = 1; top > 0;) {
      const i = stack[--top];
      for (let t = g.nbrOff[i]; t < g.nbrOff[i + 1]; t++) { const j = g.nbr[t]; if (!seen[j] && plate[j] === plate[i]) { seen[j] = 1; stack[top++] = j; } }
    }
  }
  assert.equal(pieces, new Set(plate).size, `${pieces} pieces of ${new Set(plate).size} plates`);
  const baja = plate[at(g, 28, -113.5)], west = plate[at(g, 28, -115.5)], sonora = plate[at(g, 28, -110)];
  assert.equal(data.plates[baja].name, 'Pacific');
  assert.equal(west, baja, `the sea west of Baja on ${data.plates[west].name}`);
  assert.notEqual(sonora, baja);
});

test("Earth's opening: a plate joined for moving as one keeps its own motion (the Red Sea opens)", async () => {
  const P = await openPlanet('earth', { level: 6, earth: data });
  const tec = P.tec, g = P.grid;
  const arabia = tec.owner[at(g, 24, 45)], africa = tec.owner[at(g, 18, 33)], axis = at(g, 20, 39);
  assert.notEqual(arabia, africa);
  const wa = tec.plates[arabia].w, wf = tec.plates[africa].w, dw = [wa[0] - wf[0], wa[1] - wf[1], wa[2] - wf[2]];
  const x = g.pos[3 * axis], y = g.pos[3 * axis + 1], z = g.pos[3 * axis + 2];
  const v = [dw[1] * z - dw[2] * y, dw[2] * x - dw[0] * z, dw[0] * y - dw[1] * x];   // Arabia against Africa at the axis
  const ia = at(g, 24, 45), ifr = at(g, 18, 33), across = [0, 1, 2].map(c => g.pos[3 * ia + c] - g.pos[3 * ifr + c]);
  const opening = (v[0] * across[0] + v[1] * across[1] + v[2] * across[2]) / Math.hypot(...across) * 637.1;
  assert.ok(opening > 0.5, `Arabia against Africa across the Red Sea: ${opening.toFixed(2)} cm/yr (+ opening)`);
});
