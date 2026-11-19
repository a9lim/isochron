// The hungry season (docs/people.md, "Food, years, ages and works"): the harvest calendar against
// hand-worked years, the store's losses over the gap between harvests, the crops' rain spread pooled
// over the months they grow, and the reserve the granary keeps past the season's need.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildGrid } from '../src/grid/icosphere.js';
import { NZ } from '../src/engine/climate.js';
import { People, PEOPLE, calendar, kept } from '../src/engine/people.js';

const P = PEOPLE;
/** Months coded 2 (growing), 1 (dormant), 0 (the season ends), from a string of twelve digits, January first. */
const months = s => Uint8Array.from(s, ch => +ch);

test('the calendar: a harvest at the end of each crop\'s share of a season, the longest gap and the lean month before it', () => {
  // One season of five months, April to August: one crop's months, harvested in August, a year to the
  // next; lean in July.
  let c = calendar(months('000222220000'), 3, 4, P);
  assert.deepEqual([c.n, c.gap, c.grow, c.lean], [1, 12, P.M_CROP, 6]);
  // Nine months, March to November, warm enough for two: harvests in July and November, eight months
  // from November to July; lean in June.
  c = calendar(months('002222222220'), 2, 4, P);
  assert.deepEqual([c.n, c.gap, c.grow, c.lean], [2, 8, 8, 5]);
  // Two rains, March to May and October to December: harvests in May and December, seven months from
  // May to December the longer; lean in November.
  c = calendar(months('002220000222'), 3, 4, P);
  assert.deepEqual([c.n, c.gap, c.grow, c.lean], [2, 7, 6, 10]);
  // A winter wheat: sown in October, dormant December to February, ripe in May; the dry summer ends it.
  c = calendar(months('112220000221'), 3, 4, P);
  assert.deepEqual([c.n, c.gap, c.grow, c.lean], [1, 12, P.M_CROP, 3]);
  // A continental year with no dry month: April to October grows, the winter only waits.
  c = calendar(months('111222222211'), 3, 4, P);
  assert.deepEqual([c.n, c.gap, c.grow, c.lean], [1, 12, P.M_CROP, 8]);
  // Every month grows: the gap is the one given (roots dug as needed, or a delta's crops spread evenly).
  c = calendar(months('222222222222'), 3, P.M_ROOT, P);
  assert.deepEqual([c.gap, c.grow, c.lean], [P.M_ROOT, 12, -1]);
  // Too short a season ripens nothing.
  c = calendar(months('000020000000'), 3, 4, P);
  assert.deepEqual([c.n, c.gap, c.grow, c.lean], [0, 12, 0, -1]);
});

test('the store: what\'s left of a harvest eaten evenly over the gap is (1 − e^{−ℓG})/(ℓG)', () => {
  assert.equal(kept(1, 0), 1);
  assert.ok(Math.abs(kept(1, 1e-12) - 1) < 1e-12, 'no loss, all of it');
  assert.ok(Math.abs(kept(1, 0.3) - (1 - Math.exp(-0.3)) / 0.3) < 1e-15);
  // By quadrature: the food eaten at t ∈ [0, G] has lost 1 − e^{−ℓt}.
  let q = 0; const G = 0.75, l = 0.4, n = 1e5;
  for (let k = 0; k < n; k++) q += Math.exp(-l * G * (k + 0.5) / n) / n;
  assert.ok(Math.abs(kept(G, l) / q - 1) < 1e-9, `${kept(G, l)} against ${q}`);
});

/** Every cell land and alike, its months from `T` (°C) and `Pm` (mm), each a function of the month. */
function planet(T, Pm, level = 3) {
  const grid = buildGrid(level), n = grid.n;
  const f = { seed: 'test', grid, n, elev: new Float32Array(n).fill(0.3), ice: new Float32Array(n), T12: new Float32Array(12 * n),
    P12: new Float32Array(12 * n), ft: new Float32Array(n).fill(0.3), fg: new Float32Array(n).fill(0.5), npp: new Float32Array(n).fill(0.4),
    zones: new Float32Array(NZ * n), runoff: new Float32Array(n).fill(0.3), discharge: new Float32Array(n), lake: new Float32Array(n),
    perma: new Float32Array(n), sigT: new Float32Array(n).fill(1), sigTy: new Float32Array(n).fill(0.5), sigP: new Float32Array(n).fill(0.2) };
  for (let i = 0; i < n; i++) { f.zones[NZ * i + 2] = 1; for (let m = 0; m < 12; m++) { f.T12[12 * i + m] = T(m); f.P12[12 * i + m] = Pm(m); } }
  return f;
}
const quiet = { H_FARM: 0, Z_IND: 1e9, Z_AI: 1e9, Z_BOAT: 1e9, T_COLD0: -100 };
const summer = m => 15 + 12 * Math.cos(2 * Math.PI * (m - 6) / 12);   // −9 °C in January's month, 27 °C in July's

test('the hungry season: a single summer\'s crop keeps less of itself than the tropics\' roots, and bears more of its rain', () => {
  const temperate = new People(planet(summer, () => 90), quiet), tropics = new People(planet(() => 26, () => 200), quiet);
  const a = temperate.H, b = tropics.H;
  assert.ok(Math.abs(a.gapUp[0] - 1) < 1e-12 && a.lean[0] >= 0, `one harvest a year in the summer (lean month ${a.lean[0]})`);
  assert.ok(Math.abs(b.gapUp[0] - P.M_ROOT / 12) < 1e-12 && b.lean[0] === -1, 'roots dug as needed where the year never cools');
  // The fields' yield kept over the gap, at the store's loss and the warmth's.
  for (const [p, H] of [[temperate, a], [tropics, b]]) {
    p.f[0] = 0.5;
    const l = p.keepRate(P.Z_FARM), y0 = p.fieldYield(0, 0.5), y1 = p.fieldYield(0, 0.5, l);
    assert.ok(Math.abs(y1 / y0 - kept(H.gapUp[0], l * H.rot[0])) < 1e-12, 'the uplands\' yield × what the store keeps');
  }
  const ka = kept(a.gapUp[0], temperate.keepRate(P.Z_FARM) * a.rot[0]), kb = kept(b.gapUp[0], tropics.keepRate(P.Z_FARM) * b.rot[0]);
  assert.ok(ka < kb && ka > 0.8, `at farming's start a summer's harvest keeps ${ka.toFixed(3)}, the roots' ${kb.toFixed(3)}`);
  assert.ok(temperate.keepRate(P.Z_FARM + 8) < 0.1 * temperate.keepRate(P.Z_FARM), 'granaries with culture');
  // The crops' rain spread: the year's, as the months they grow have it.
  const ca = temperate.harvestCoef(0, 1).slice(), cb = tropics.harvestCoef(0, 1).slice();
  assert.ok(Math.abs(ca[0] / P.E_RAIN - 1) < 1e-9, `one crop in a six-month summer bears the year's spread: κ ${(ca[0] / P.E_RAIN).toFixed(3)}`);
  assert.ok(Math.abs(cb[0] / P.E_RAIN - Math.sqrt(P.M_CROP / 12)) < 1e-9, `the whole year growing pools it: κ ${(cb[0] / P.E_RAIN).toFixed(3)}`);
  // The reserve: the granary's room past the season's need, S_MAX past a single harvest's year.
  const zr = P.Z_FARM + 40;
  assert.ok(Math.abs(temperate.reserve(0, 1, zr) - P.S_MAX) < 1e-9, 'a single harvest keeps S_MAX past its year');
  assert.ok(Math.abs(tropics.reserve(0, 1, zr) - (P.S_MAX + 1 - P.M_ROOT / 12)) < 1e-9, 'roots leave the granary for bad years');
  assert.equal(temperate.reserve(0, 1, P.Z_FARM), 0, 'none before granaries');
});
