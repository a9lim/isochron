// Today's Earth (`?seed=earth`, src/engine/earth.js): the opening stands where the baked data does.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openPlanet } from '../src/engine/planet.js';
import { loadEarth, EARTH } from '../src/engine/earth.js';
import { elevation, H_OCEANIC } from '../src/engine/crust.js';

const data = await loadEarth();
const datum = elevation(H_OCEANIC, 0, 0) + EARTH.RIDGE;

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
