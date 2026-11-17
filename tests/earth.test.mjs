// Today's Earth (`?seed=earth`, src/engine/earth.js): the opening stands where the data does (the bed
// within tens of metres, the sea at the datum, the land and the ice Earth's), at the engine's level and
// a coarser one; its plates move as Müller et al. 2019's do; the reversals and the orbit are Earth's today.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openPlanet } from '../src/engine/planet.js';
import { loadEarth, EARTH } from '../src/engine/earth.js';
import { elevation, H_OCEANIC } from '../src/engine/crust.js';
import { nearest } from '../src/grid/icosphere.js';
import { Polarity } from '../src/engine/polarity.js';
import { GTS2012, CNS_START } from '../src/engine/gpts.js';
import { OrbitCycles, EARTH_CYCLES } from '../src/engine/orbit.js';

const data = await loadEarth();
const datum = elevation(H_OCEANIC, 0, 0) + EARTH.RIDGE;
const at = (g, la, lo) => { const r = Math.PI / 180; return nearest(g, Math.cos(la * r) * Math.cos(lo * r), Math.cos(la * r) * Math.sin(lo * r), Math.sin(la * r)); };

for (const level of [6, 5]) {
  test(`Earth's opening at level ${level}`, async () => {
    const P = await openPlanet('earth', { level, earth: data });
    const tec = P.tec, g = P.grid, n = g.n, R = 6371e5 / 1e6;
    let land = 0, e2 = 0, v2 = 0;
    const v = new Float64Array(3);
    for (let i = 0; i < n; i++) {
      if (!tec.sea[i]) land += g.area[i];
      const e = (tec.elev[i] - tec.seaLevel) - (P.earth.target[i] - datum);
      e2 += e * e * g.area[i];
      tec.velocity(tec.owner[i], i, v);
      v2 += (v[0] ** 2 + v[1] ** 2 + v[2] ** 2) * g.area[i];
    }
    land /= 4 * Math.PI;
    assert.ok(Math.abs(tec.seaLevel - datum) < 0.002, `the sea at the datum (${((tec.seaLevel - datum) * 1000).toFixed(1)} m off)`);
    assert.ok(land > 0.27 && land < 0.30, `land ${(100 * land).toFixed(1)}%`);
    assert.ok(Math.sqrt(e2 / (4 * Math.PI)) * 1000 < 80, `the bed within ${(Math.sqrt(e2 / (4 * Math.PI)) * 1000).toFixed(0)} m rms of ETOPO's`);
    const ice = P.ice.stats.volume / 1e15;
    assert.ok(ice > 27 && ice < 31, `grounded ice ${ice.toFixed(1)} M km³ (Antarctica and Greenland ~29)`);
    assert.ok(tec.alivePlates().length >= 16 && tec.alivePlates().length <= 20, `${tec.alivePlates().length} plates`);
    const rms = Math.sqrt(v2 / (4 * Math.PI)) * R;
    assert.ok(rms > 3.5 && rms < 5.5, `plates' rms speed ${rms.toFixed(2)} cm/yr`);
    const pac = tec.plates[tec.owner[at(g, 19.5, -155.5)]];
    assert.equal(pac.name, 'Pacific');
    assert.ok(tec.slab.some(s => s > 0), 'slabs hang on the trenches');
    // Places: the Himalaya high, the Pacific's floor deep and oceanic, the Caspian a basin the sea doesn't reach.
    const h = at(g, 28.6, 87), ocean = at(g, 0, -150), caspian = at(g, 42, 50.5);
    assert.ok(tec.elev[h] - tec.seaLevel > 2.5, `the Himalaya at ${((tec.elev[h] - tec.seaLevel) * 1000).toFixed(0)} m`);
    assert.ok(tec.seaLevel - tec.elev[ocean] > 4 && tec.phi[ocean] < 0.1 && tec.sea[ocean] === 1);
    assert.ok(tec.elev[caspian] < tec.seaLevel && tec.sea[caspian] === 0, 'the Caspian is a basin');
  });
}

test("Earth's reversals: normal today, reversed in C1r, normal through the superchron", () => {
  const p = new Polarity('earth', -400, { reversals: GTS2012, quietFrom: CNS_START });
  assert.equal(p.at(-0.1), 1);
  assert.equal(p.at(-0.9), -1);
  assert.equal(p.at(-100), 1);
  assert.equal(p.at(-120), 1);
  assert.equal(p.at(-80), -1);
  assert.equal(p.countBefore(-83.64 + 1e-9) - p.countBefore(-CNS_START), 1, 'one reversal ends the superchron');
});

test("Earth's orbit today", () => {
  const o = new OrbitCycles('earth', EARTH_CYCLES).at(0, 0);
  assert.ok(Math.abs(o.eMean - 0.017236) < 1e-5, `e ${o.eMean}`);
  assert.ok(Math.abs(o.obliquity * 180 / Math.PI - 23.446) < 1e-3, `obliquity ${o.obliquity * 180 / Math.PI}`);
  assert.ok(Math.abs(o.perihelion * 180 / Math.PI - 281.37) < 0.01, `perihelion ${o.perihelion * 180 / Math.PI}`);
});
