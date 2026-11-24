// Classes (src/engine/classes.js): the elite share's exact step, and where it settles on one place.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Classes, eliteStep } from '../src/engine/classes.js';
import { KP } from '../src/engine/polities.js';
import { PEOPLE } from '../src/engine/people.js';

test("an elite's share steps exactly on each side of its positions, and across them", () => {
  // dε/dt = g ε − μ (ε − p), μ = μ_down above p and μ_up below, against a fine Euler integration.
  const p = 0.05, mU = 0.1, mD = 0.05;
  for (const [e0, g, h] of [[0.12, 0.02, 40], [0.01, 0.02, 40], [0.12, -0.08, 60], [0.002, 0.01, 7], [0.06, 0.07, 30]]) {
    let x = e0;
    const dt = 1e-3;
    for (let t = 0; t < h - 1e-12; t += dt) x += dt * (g * x - (x > p ? mD : mU) * (x - p));
    const y = eliteStep(e0, p, g, mU, mD, h);
    assert.ok(Math.abs(y - Math.min(0.5, x)) < 2e-4 * Math.max(x, p), `from ${e0} at g ${g} over ${h} yr: exact ${y}, Euler ${x}`);
    // In one step or in many.
    let z = e0;
    for (let k = 0; k < 10; k++) z = eliteStep(z, p, g, mU, mD, h / 10);
    assert.ok(Math.abs(z - y) < 1e-9, `ten steps ${z} against one ${y}`);
  }
});

test('the elites settle past their positions by their growth over the commoners: p μ/(μ − δ)', () => {
  // One place of farmers fed at subsistence (no immiseration, so no stress): the farmers' elite's
  // positions are TH_W × the harvest over C_E × the mean income, and deaths past the well-fed floor at δ
  // a year (the elites escape them) hold its share at p μ_down/(μ_down − δ).
  const N = 1e5, P = { ...PEOPLE, Y_COMF: 1 };
  const W = new Float64Array(5); W[3] = N;
  const wol = new Float32Array(5); wol[3] = N;
  const pol = { live: [], list: [], id: new Int32Array(KP).fill(-1), s: new Float64Array(KP), d: new Float64Array([1]), ex: new Float64Array(1), held: () => 0 };
  const pp = { P, nL: 1, pol, ids: { W, T: new Float64Array([N]) }, Ntot: new Float64Array([N]), K: new Float64Array([N]), goods: new Float64Array(1), wol, imp: null,
    uSent: null, dlvP: null, kP: null, Kown: new Float64Array([N]), econ: { on: false }, works: new Float64Array(1), wk: { T: new Float64Array(1) } };
  const cl = new Classes(pp), p = P.TH_W[3] / P.C_E, mD = 1 / P.T_DOWN;
  for (const d of [0, 0.01, 0.02]) {
    for (let k = 0; k < 200; k++) { cl.accrue(0, d, 0, 10); cl.tAcc += 10; cl.advance(10); }
    const want = p * mD / (mD - d);
    assert.ok(Math.abs(cl.e[3] / want - 1) < 1e-6, `δ ${d}: the share ${cl.e[3]} against ${want}`);
    assert.equal(cl.psi[0], 0, 'no stress at subsistence');
    assert.equal(pp.Ntot[0], N, 'no internal war without stress');
  }
});
