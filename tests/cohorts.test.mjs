// The age cohorts (src/engine/cohorts.js): Lotka's stable population at any step, and replacement at the rich end.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { COHORTS, stable, stepPyramid, stepTables, ageClock, settle, senescent, working, reference, replacement, MIG } from '../src/engine/cohorts.js';
import { PEOPLE } from '../src/engine/people.js';

const K = COHORTS.K;
const groups = c => { const g = []; for (let k = 0; k < K; k += 5) { let s = 0; for (let j = k; j < Math.min(K, k + 5); j++) s += c[j]; g.push(s); } return g; };
/** Step a pyramid at constant births b and growth r for T years in steps of dt; calls `each` after each. */
function run(c, b, r, dt, T, each = () => {}) {
  let clk = 0, Tb = {};
  const tmp = new Float64Array(K + 1), out = {};
  for (let t = 0; t < T - 1e-9; t += dt) {
    const [shift, cn] = ageClock(clk, dt); clk = cn;
    Tb = stepTables(dt, shift, Tb);
    const sum = stepPyramid(c, 0, b, b - r - senescent(c), 1, r, Tb, tmp);
    settle(c, 0, sum, 1, 0, out);
    each(c, t + dt);
  }
}

test("the cohorts' explicit step holds Lotka's stable population, at any step", () => {
  for (const [b, r] of [[PEOPLE.B_PRE, 0], [0.02, 0.01], [0.012, 0]]) {
    const ref = stable(b, r), gr = groups(ref);
    for (const dt of [0.1, 1, 10]) {
      const c = Float64Array.from(ref);
      run(c, b, r, dt, 400);
      const g = groups(c), dev = Math.max(...g.map((v, k) => Math.abs(v - gr[k])));
      assert.ok(dev < 0.015, `births ${b}, growth ${r}, steps of ${dt} yr: five-year groups off by ${dev.toFixed(4)}`);
      assert.ok(Math.abs(working(c) / working(ref) - 1) < 0.02, `working share ${working(c).toFixed(3)} against ${working(ref).toFixed(3)}`);
    }
  }
  // And it reaches it from elsewhere: a pyramid of migrants settles to its rates' own.
  const c = Float64Array.from(MIG), ref = stable(PEOPLE.B_PRE, 0);
  run(c, PEOPLE.B_PRE, 0, 1, 300);
  const dev = Math.max(...groups(c).map((v, k) => Math.abs(v - groups(ref)[k])));
  assert.ok(dev < 0.015, `migrants' pyramid after 300 years off the stable by ${dev.toFixed(4)}`);
});

test("the rich end's life table is replacement: B_MIN is its stationary birth rate, and a rich world holds there", () => {
  const ref = reference(PEOPLE).sen, rb = replacement(PEOPLE);
  assert.ok(Math.abs(PEOPLE.B_MIN / rb - 1) < 0.01, `B_MIN ${PEOPLE.B_MIN} against the life table's ${rb.toFixed(5)}`);
  // A cell's pyramid stepped at the rich end's rates (births B_MIN, medicine M_MIN, the demography's
  // deaths with its aging) holds its numbers: the total's growth b − m D_LO − m_s max(0, sen − ref).
  const m = PEOPLE.M_MIN, ms = Math.pow(m, PEOPLE.M_SEN), c = stable(PEOPLE.B_PRE, 0), tmp = new Float64Array(K + 1), out = {};
  let clk = 0, Tb = {}, r = 0;
  for (let t = 0; t < 1500; t++) {
    const sen = senescent(c), d = m * PEOPLE.D_LO + ms * Math.max(0, sen - ref); r = PEOPLE.B_MIN - d;
    const [sh, cn] = ageClock(clk, 1); clk = cn; Tb = stepTables(1, sh, Tb);
    settle(c, 0, stepPyramid(c, 0, PEOPLE.B_MIN, d - ms * sen, ms, r, Tb, tmp), 1, 0, out);
  }
  assert.ok(Math.abs(r) < 5e-4, `a rich world settles at ${(100 * r).toFixed(3)}%/yr`);
  let o65 = 0; for (let k = 65; k < K; k++) o65 += c[k];
  assert.ok(o65 > 0.2 && o65 < 0.35, `${(100 * o65).toFixed(0)}% over 65`);
});
