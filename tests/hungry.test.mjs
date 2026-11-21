// The hungry season (src/engine/people.js): the harvest calendar against hand-worked years, and the store's losses
// over the gap.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PEOPLE, calendar, kept } from '../src/engine/people.js';

const P = PEOPLE;
/** Months coded 2 (growing), 1 (dormant), 0 (the season ends), from a string of twelve digits, January first. */
const months = s => Uint8Array.from(s, ch => +ch);

test('the calendar: a harvest at the end of each crop\'s share of a season, the longest gap and the lean month before it', () => {
  // Nine months, March to November, warm enough for two: harvests in July and November, eight months
  // from November to July; lean in June.
  let c = calendar(months('002222222220'), 2, 4, P);
  assert.deepEqual([c.n, c.gap, c.grow, c.lean], [2, 8, 8, 5]);
  // Two rains, March to May and October to December: harvests in May and December, seven months from
  // May to December the longer; lean in November.
  c = calendar(months('002220000222'), 3, 4, P);
  assert.deepEqual([c.n, c.gap, c.grow, c.lean], [2, 7, 6, 10]);
  // A winter wheat: sown in October, dormant December to February, ripe in May; the dry summer ends it.
  c = calendar(months('112220000221'), 3, 4, P);
  assert.deepEqual([c.n, c.gap, c.grow, c.lean], [1, 12, P.M_CROP, 3]);
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

