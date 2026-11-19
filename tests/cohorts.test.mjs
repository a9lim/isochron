// The people's age cohorts (src/engine/cohorts.js) against Lotka's stable population, the aging
// scale's endpoints, a famine's notch ageing through the pyramid, and migrants' mixing.
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
  // deaths with its aging) holds its numbers: the total's growth b − m (D_LO + max(0, sen − ref)).
  const m = PEOPLE.M_MIN, c = stable(PEOPLE.B_PRE, 0), tmp = new Float64Array(K + 1), out = {};
  let clk = 0, Tb = {}, r = 0;
  for (let t = 0; t < 1500; t++) {
    const sen = senescent(c), d = m * (PEOPLE.D_LO + Math.max(0, sen - ref)); r = PEOPLE.B_MIN - d;
    const [sh, cn] = ageClock(clk, 1); clk = cn; Tb = stepTables(1, sh, Tb);
    settle(c, 0, stepPyramid(c, 0, PEOPLE.B_MIN, d - m * sen, m, r, Tb, tmp), 1, 0, out);
  }
  assert.ok(Math.abs(r) < 5e-4, `a rich world settles at ${(100 * r).toFixed(3)}%/yr`);
  let o65 = 0; for (let k = 65; k < K; k++) o65 += c[k];
  assert.ok(o65 > 0.2 && o65 < 0.35, `${(100 * o65).toFixed(0)}% over 65`);
});

test("a famine's missing children age through the pyramid, a year a year", () => {
  const b = PEOPLE.B_PRE, c = stable(b, 0), ref = Float64Array.from(c);
  for (let k = 0; k < 5; k++) c[k] *= 0.5;           // a famine takes half the under-fives
  let s = 0; for (let k = 0; k < K; k++) s += c[k]; for (let k = 0; k < K; k++) c[k] /= s;
  let at20 = null;
  run(c, b, 0, 1, 20, (cc, t) => { if (Math.abs(t - 20) < 1e-6) at20 = Float64Array.from(cc); });
  const deficit = k => at20[k] / ref[k];
  // Twenty years on, the notch is at 20–24: those ages are short, their neighbours aren't.
  const notch = (deficit(20) + deficit(22) + deficit(24)) / 3, around = (deficit(14) + deficit(30)) / 2;
  assert.ok(notch < 0.75 * around, `20–24 at ${notch.toFixed(2)} of the stable against ${around.toFixed(2)} around`);
});

test("migrants come young and leave the old behind", () => {
  const c = stable(PEOPLE.B_MIN, 0), w0 = working(c), out = {};
  const inn = Float64Array.from(c), outC = Float64Array.from(c);
  settle(inn, 0, 1, 1, 0.5, out);
  assert.ok(out.work > w0, 'a third of the people newly come: more of working age');
  settle(outC, 0, 1, 1, -0.3, out);
  assert.ok(senescent(outC) > senescent(c), 'three in ten gone: the rest older');
  for (const x of [inn, outC]) { let s = 0; for (let k = 0; k < K; k++) { assert.ok(x[k] >= 0); s += x[k]; } assert.ok(Math.abs(s - 1) < 1e-12); }
  // Founders of an empty cell are the migrants' schedule.
  const e = new Float64Array(K); settle(e, 0, 1, 0, 50, out);
  for (let k = 0; k < K; k++) assert.equal(e[k], MIG[k]);
});
