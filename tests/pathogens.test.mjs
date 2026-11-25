// Pathogens (src/engine/pathogens.js): the final size, the susceptibles' step, persistence's critical
// community size, and the migrants' carry.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Pathogens, finalSize, finalSizeExact, susceptible, persistence } from '../src/engine/pathogens.js';
import { PEOPLE } from '../src/engine/people.js';

test("an epidemic's final size is the root of z = 1 − e^{−y z}, and none at or below the threshold", () => {
  for (const y of [1.001, 1.05, 1.3, 2, 3.7, 8, 20, 63.9, 100]) {
    const z = finalSizeExact(y), t = finalSize(y);
    assert.ok(Math.abs(z - (1 - Math.exp(-y * z))) < 1e-12, `exact at ${y}: ${z}`);
    assert.ok(Math.abs(t - z) < 2e-3 * Math.max(z, 0.01), `table at ${y}: ${t} against ${z}`);
  }
  assert.ok(Math.abs(finalSizeExact(2) - 0.796812) < 1e-6);
  for (const y of [0, 0.5, 1]) { assert.equal(finalSize(y), 0); assert.equal(finalSizeExact(y), 0); }
});

test("the susceptibles step exactly without epidemics, rebuild to the threshold on time, and settle at their balance under them", () => {
  // No epidemics: s → se = (b (1 − cov) + ω)/(b + ω) exactly, the same in one step as in ten.
  for (const [s0, b, om, cov] of [[0.1, 0.04, 0, 0], [0.9, 0.03, 0.2, 0], [1, 0.02, 0.01, 0.6]]) {
    const se = (b * (1 - cov) + om) / (b + om), t = 37;
    assert.ok(Math.abs(susceptible(s0, t, b, om, cov, 0, 5) - (se + (s0 - se) * Math.exp(-(b + om) * t))) < 1e-14);
    let s = s0; for (let k = 0; k < 10; k++) s = susceptible(s, t / 10, b, om, cov, 0, 5);
    assert.ok(Math.abs(s - susceptible(s0, t, b, om, cov, 0, 5)) < 1e-12);
  }
  // After an epidemic the births rebuild the susceptibles to 1/R in ln((1 − s_a)/(1 − 1/R))/(b + ω): the
  // interval before the next can take hold.
  const R = 4, sa = 1 - finalSizeExact(R), b = 0.035, T = Math.log((1 - sa) / (1 - 1 / R)) / b;
  assert.ok(Math.abs(susceptible(sa, T, b, 0, 0, 0, R) - 1 / R) < 1e-12, `rebuilt in ${T.toFixed(1)} yr`);
  // Under epidemics at λ a year, a long step lands on the balance b (1 − cov − s) + ω (1 − s) = λ Z(R s) s, near 1/R where λ ≫ b.
  for (const [b2, om, cov, lam, R2] of [[0.04, 0, 0, 2, 12], [0.03, 0.3, 0, 0.5, 2.5], [0.02, 0.01, 0.3, 50, 6]]) {
    const s = susceptible(1, 1e10, b2, om, cov, lam, R2), g = b2 * (1 - cov - s) + om * (1 - s) - lam * finalSize(R2 * s) * s;
    assert.ok(Math.abs(g) < 1e-9, `balance ${g} at s ${s}`);
    assert.ok(s > 1 / R2 && s < 1, `s ${s} against 1/R ${1 / R2}`);
  }
  assert.ok(Math.abs(susceptible(1, 1e5, 0.04, 0, 0, 1e3, 12) - 1 / 12) < 2e-3);
  // Backward Euler converges on the equation as its step shrinks (a fine RK4 integration from a virgin people).
  const f = s => 0.04 * (1 - s) - 0.8 * finalSize(3 * s) * s;
  let x = 1;
  for (let t = 0; t < 20; t += 1e-3) { const k1 = f(x), k2 = f(x + 5e-4 * k1), k3 = f(x + 5e-4 * k2), k4 = f(x + 1e-3 * k3); x += 1e-3 * (k1 + 2 * k2 + 2 * k3 + k4) / 6; }
  let y = 1; for (let k = 0; k < 2000; k++) y = susceptible(y, 0.01, 0.04, 0, 0, 0.8, 3);
  assert.ok(Math.abs(y - x) < 2e-3, `backward Euler ${y} against RK4 ${x}`);
});

test("a pathogen persists past its critical community size and fades below it", () => {
  // Measles' traits (R0 ~15, ~2 weeks infectious, lifelong immunity) and a pre-industrial people's births: the
  // critical size, where persistence is a half, within Bartlett's ~2.5–5 × 10⁵ (from memory).
  const P = PEOPLE, b = 0.04, R = 15, D = 2 / 52, Ns = P.I_MIN / (b * (1 - 1 / R) * D);
  assert.ok(Ns > 2.5e5 && Ns < 5e5, `critical size ${Ns.toExponential(2)}`);
  assert.ok(Math.abs(persistence(Ns, b, 0, R, D, P) - 0.5) < 1e-12);
  let last = 0;
  for (const N of [1e3, 1e4, 1e5, Ns, 1e6, 1e7]) { const p = persistence(N, b, 0, R, D, P); assert.ok(p > last); last = p; }
  assert.ok(persistence(1e4, b, 0, R, D, P) < 0.01 && persistence(1e7, b, 0, R, D, P) > 0.99);
  // A chronic infection (a year's) persists in a people a fourteenth of measles', and one whose immunity
  // wanes in a few years in fewer still; nothing persists that can't pass (R ≤ 1).
  assert.ok(persistence(5e4, b, 0, 2, 1, P) > 0.8 && persistence(5e4, b, 0, R, D, P) < 0.05);
  assert.ok(persistence(2e4, b, 0.5, 3, 0.1, P) > 0.6);
  assert.equal(persistence(1e9, b, 0, 1, D, P), 0);
});

test("migrants carry their susceptibility and make or lose none", () => {
  const nL = 4, P = PEOPLE, pp = { nL, P, planet: { seed: 'test' } }, pg = new Pathogens(pp);
  const q = { slot: 2 }; pg.slots[2] = q; pg.live.push(q);
  const o = 2 * nL, N = [100, 50, 0, 30];
  pg.s.set([0.2, 1, 0.7, 0.5], o); pg.e.set([0.9, 0, 0.3, 0.6], o);
  const count = (s, n) => n.reduce((a, x, c) => a + x * s[o + c], 0), before = count(pg.s, N), eb = count(pg.e, N);
  // A substep's flows (into an empty place, both ways along an edge, a chain), mixed in at its end.
  const flows = [[0, 1, 10], [1, 2, 5], [3, 1, 4], [1, 3, 6], [0, 2, 2]], net = N.slice();
  for (const [a, b, n] of flows) { pg.flow(a, b, n); net[a] -= n; net[b] += n; }
  pg.settle(N);
  assert.ok(Math.abs(count(pg.s, net) - before) < 1e-9, `susceptibles ${count(pg.s, net)} against ${before}`);
  assert.ok(Math.abs(count(pg.e, net) - eb) < 1e-9, `the exposed ${count(pg.e, net)} against ${eb}`);
  // Founders into an empty place bring theirs; into a peopled one they mix by numbers.
  const s0 = pg.s[o + 0];
  pg.s[o + 2] = 0.9; pg.mix(0, 2, 3, 0); assert.ok(Math.abs(pg.s[o + 2] - s0) < 1e-15);
  const s1 = pg.s[o + 1], s3 = pg.s[o + 3];
  pg.mix(3, 1, 10, 54); assert.ok(Math.abs(pg.s[o + 1] - (54 * s1 + 10 * s3) / 64) < 1e-15);
});
