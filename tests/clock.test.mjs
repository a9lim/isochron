// The scheduler: time conservation per layer, hand-offs, clamping.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Scheduler } from '../src/clock.js';

const layers = () => [
  { name: 'weather', step: 1 / 17532, budget: 8, summarize: () => {} },   // 30 min
  { name: 'ice', step: 100, budget: 4, summarize: () => {} },
  { name: 'plates', step: 5e5, budget: 4 },
];

test('every layer accounts for all of the time it was given', () => {
  for (const rate of [1e-3, 1, 1e3, 1e5, 1e7]) {
    const s = new Scheduler(layers());
    const done = { weather: 0, ice: 0, plates: 0 };
    let total = 0;
    for (let f = 0; f < 600; f++) {
      const { dt, plan } = s.advance(rate / 60);
      total += dt;
      for (const p of plan) done[p.name] += p.mode === 'live' ? p.steps * p.step : p.span;
    }
    for (const l of s.layers) {
      assert.ok(Math.abs(done[l.name] + l.bank - total) <= 1e-9 * Math.max(1, total), `${l.name} at ${rate}: ${done[l.name]} + ${l.bank} vs ${total}`);
      assert.ok(l.bank < l.step * (l.budget + 1), `${l.name} banked too much`);
    }
  }
});
