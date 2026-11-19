// The Lights map's light (People.lights, drawn only): its sums against the people's, and each era's
// light a person against its form (docs/people.md, On the page).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildGrid } from '../src/grid/icosphere.js';
import { NZ } from '../src/engine/climate.js';
import { People, softMin } from '../src/engine/people.js';

/** Every cell land, warm, wet, savanna-like and alike (zones all Aw), as tests/people.test.mjs's. */
function uniformPlanet(level) {
  const grid = buildGrid(level), n = grid.n;
  const f = { seed: 'test', grid, n, elev: new Float32Array(n).fill(0.3), ice: new Float32Array(n), T12: new Float32Array(12 * n).fill(22),
    P12: new Float32Array(12 * n).fill(100), ft: new Float32Array(n).fill(0.3), fg: new Float32Array(n).fill(0.5), npp: new Float32Array(n).fill(0.4),
    zones: new Float32Array(NZ * n), runoff: new Float32Array(n).fill(0.3), discharge: new Float32Array(n), lake: new Float32Array(n),
    perma: new Float32Array(n), sigT: new Float32Array(n).fill(1) };
  for (let i = 0; i < n; i++) f.zones[NZ * i + 2] = 1;
  return f;
}
const quiet = { H_FARM: 0, S_BG: 0, V_G: 0, CHECK: 1e12, Z_IND: 1e9, Z_AI: 1e9, Z_BOAT: 1e9, T_COLD0: -100 };

/** A settled planet: 300 people a km², two cells in three farming, every third industrial. */
function settled() {
  const p = new People(uniformPlanet(4), { ...quiet });
  for (let c = 0; c < p.nL; c++) { p.Ntot[c] = 300 * p.H.area[c]; p.f[c] = c % 3 ? 0.3 : 0; p.ind[c] = c % 3 === 0 ? 1 : 0; }
  p.people = p.Ntot.reduce((a, b) => a + b, 0);
  return p;
}

/** Each cell's light (lm) from the map: the countryside's on its land, the cities' on theirs. */
function mapped(p, d, l) {
  let s = 0;
  for (let c = 0; c < p.nL; c++) {
    const i = p.cells[c], cs = d[8 * i + 2];
    s += (l[4 * i] * (1 - cs) + l[4 * i + 1] * cs) * p.H.area[c];
  }
  return s;
}

test('night: before industry, every person\'s hearths and lamps, LM_FIRE, and the map keeps the light', () => {
  const p = settled(), d = p.drawn(), l = p.lights(d);
  let people = 0;
  for (let c = 0; c < p.nL; c++) {
    const i = p.cells[c];
    people += d[8 * i] * p.H.area[c];
    assert.equal(l[4 * i + 2], p.P.LM_FIRE);
  }
  assert.ok(Math.abs(p.lightTotal / (p.P.LM_FIRE * people) - 1) < 1e-9, `${p.lightTotal.toExponential(4)} lm against ${(p.P.LM_FIRE * people).toExponential(4)}`);
  assert.ok(Math.abs(mapped(p, d, l) / p.lightTotal - 1) < 1e-6, `the map holds ${mapped(p, d, l).toExponential(4)} lm of ${p.lightTotal.toExponential(4)}`);
  // The cities are brighter a km² than their countryside, by their density against its.
  const c = Array.from({ length: p.nL }, (_, k) => k).find(k => d[8 * p.cells[k] + 2] > 1e-3);
  assert.ok(c !== undefined, 'a city');
  assert.ok(l[4 * p.cells[c] + 1] > 3 * l[4 * p.cells[c]], `city ${l[4 * p.cells[c] + 1].toFixed(0)} lm/km², countryside ${l[4 * p.cells[c]].toFixed(0)}`);
});

test('night: with industry, S_LIGHT of the power each cell\'s goods take, at the efficacy of the culture', () => {
  const p = settled(), d = p.drawn(), P = p.P;
  // The economy as industrialStep leaves it: 100 W a subsistence-year a year of output, and each
  // industrial cell's people with 20 sy a year of goods a person (a quarter of that where half
  // are industrial), the rest none.
  Object.assign(p.econ, { on: true, eY: 100, z: P.Z_IND + 1.5 });
  for (let c = 0; c < p.nL; c++) { p.ind[c] = [1, 0.5, 0][c % 3]; p.goods[c] = 20 * p.ind[c] ** 2 * p.Ntot[c]; }
  const l = p.lights(d);
  const eta = P.LM_W1 - (P.LM_W1 - P.LM_W0) * Math.exp(-1.5 / P.Z_LM);
  for (let c = 0; c < p.nL; c++) {
    const want = P.LM_FIRE + softMin(eta * P.S_LIGHT * 100 * 20 * p.ind[c] ** 2, P.LM_MAX), got = l[4 * p.cells[c] + 2];
    assert.ok(Math.abs(got / want - 1) < 1e-5, `cell ${c}: ${got.toFixed(1)} lm a person against ${want.toFixed(1)}`);
  }
  // Today's order: ~2 kW a person, 40 W of it to light at ~100 lm/W.
  const lit = l[4 * p.cells[0] + 2];
  assert.ok(lit > 1000 && lit < 1e4, `${lit.toFixed(0)} lm a person where industry is whole`);
  // Goods lost, light lost (a disempowered people's): the hearths' alone.
  for (let c = 0; c < p.nL; c++) p.goods[c] = 0;
  const dark = p.lights(d);
  assert.equal(dark[4 * p.cells[0] + 2], P.LM_FIRE);
  assert.ok(Math.abs(mapped(p, d, dark) / p.lightTotal - 1) < 1e-6, 'the map holds the light');
});
