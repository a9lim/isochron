// The scheduler: time conservation per layer, hand-offs, clamping; and the follow dial's pace (People.pace) and easing.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Scheduler, FOLLOW, followAim, followEase } from '../src/clock.js';
import { paceOf } from '../src/engine/people.js';

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

test("the follow dial: a doubling at its own rate far above a quantity's scale, none at once from below it, eased", () => {
  // A record whose minds grow 1%/yr, with energy from step 40 growing 20%/yr from a megawatt.
  const g = 0.01, ge = 0.2, rows = [];
  for (let k = 0; k <= 120; k++) {
    const t = 10 * k;
    rows.push({ t, minds: 1e9 * Math.exp(g * t), farmA: 0, AI: 0, energy: k >= 40 ? 1e6 * Math.exp(ge * (t - 400)) : 0 });
  }
  // Before energy shows (a megawatt is a millionth of its scale), the minds alone: their own rate.
  const at = k => paceOf(rows.slice(0, k + 1), false);
  assert.ok(Math.abs(at(39) / g - 1) < 1e-9, `minds alone ${at(39)}`);
  // At 2% of its scale energy grows its full 20%/yr (hard floors read that at once): here it barely moves the pace.
  assert.ok(at(45) < 1.2 * g, `energy at 2% of its scale set the pace: ${at(45)}`);
  // Far above its scale, energy's own rate (the 4-norm with the minds' 1%: within 1e-4).
  assert.ok(Math.abs(at(120) / ge - 1) < 1e-4, `energy at scale ${at(120)}`);
  // The aim: FOLLOW.SECS a doubling; the easing slows within DOWN s and speeds at most SLEW decades a second.
  assert.ok(Math.abs(followAim(g, 'industry', -9, 9) - Math.log10(Math.LN2 / (g * FOLLOW.SECS))) < 1e-12);
  let v = 0;
  for (let k = 0; k < 20; k++) v = followEase(v, 3, 0.05);
  assert.ok(Math.abs(v - FOLLOW.SLEW) < 1e-9, `up a second: ${v}`);
  v = 0;
  for (let k = 0; k < 20 * 3 * FOLLOW.DOWN; k++) v = followEase(v, -3, 0.05);
  assert.ok(v < -3 * 0.94, `down ${3 * FOLLOW.DOWN} s: ${v}`);
});
