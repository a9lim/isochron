// The scheduler: time conservation per layer, hand-offs, clamping.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Scheduler, formatRate, formatTime } from '../src/clock.js';

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

test('weather runs live at 6 h/s and is summarized at 1 yr/s', () => {
  const s = new Scheduler(layers());
  const a = s.advance((6 / 8766) / 60).plan.find(p => p.name === 'weather');
  assert.equal(a.mode, 'live');
  const b = new Scheduler(layers()).advance(1 / 60).plan.find(p => p.name === 'weather');
  assert.equal(b.mode, 'summary');
  assert.equal(b.blend, 1);
});

test('a layer without a closure clamps the frame', () => {
  const s = new Scheduler(layers());
  assert.equal(s.maxFrameYears, 2e6);
  const { dt } = s.advance(1e9);
  assert.equal(dt, 2e6);
});

test('formatting', () => {
  assert.equal(formatRate(1e6), '1 Myr/s');
  assert.equal(formatRate(1e7), '10 Myr/s');
  assert.equal(formatRate(1 / 365.25), '1 day/s');
  assert.equal(formatRate(3.2e4), '32 kyr/s');
  assert.equal(formatTime(412.34e6), '412 Myr');
  assert.equal(formatTime(41.2e6), '41.2 Myr');
});
