// The tide and the Moon (src/engine/tides.js), and the rivers' months.
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildGrid } from '../src/grid/icosphere.js';
import { Tides, TIDES, EARTH, Moon, meanMotion } from '../src/engine/tides.js';

test('the tide on a still global ocean: the forced degree-2 response, analytic', () => {
  // No rotation, uniform depth: η_tt = gH∇²(βη − αη_eq), so the response to the
  // Y₂² equilibrium tide is Kα/(Kβ − ω² + iωr) with K = 6gH/R² (here past resonance: inverted).
  const g = buildGrid(4), H = 4000, r = 1 / (2 * 86400), saved = { ...TIDES };
  Object.assign(TIDES, { CDU: r * H, K_IT: 0 });
  try {
    const T = new Tides(g);
    T.ocean(new Float64Array(g.n).fill(H));
    const omega = 1.405e-4, res = T.solve(omega, 0, 30);
    let ar = 0, ai = 0, nn = 0, mass = 0, mabs = 0;
    for (let i = 0; i < g.n; i++) {
      const zr = res.C[i], zi = -res.S[i], fr = T.cosEq[i], fi = T.sinEq[i];
      ar += (zr * fr + zi * fi) * g.area[i]; ai += (zi * fr - zr * fi) * g.area[i]; nn += (fr * fr + fi * fi) * g.area[i];
      mass += T.eta[i] * g.area[i]; mabs += Math.abs(T.eta[i]) * g.area[i];
    }
    const K = 6 * TIDES.G * H / EARTH.R ** 2, dr = K * TIDES.BETA - omega * omega, di = omega * r, m2 = dr * dr + di * di;
    const want = K * TIDES.ALPHA * dr / m2;
    assert.ok(Math.abs(ar / nn - want) < 0.03 * Math.abs(want), `in phase ${(ar / nn).toFixed(4)} against ${want.toFixed(4)}`);
    assert.ok(Math.abs(mass) < 1e-10 * mabs, 'the sea keeps its volume');
  } finally { Object.assign(TIDES, saved); }
});

test('Coriolis does no work, over cliffs too', () => {
  // The energy weighs each edge by H ℓ d; Perot's averaged rotation made energy where one
  // cell's edges spanned a shelf and a deep sea, and a deep cell beside a shelf grew without
  // bound. Antisymmetrized in that norm, its power vanishes for every u; on a uniform sea it
  // stays Perot's within a few per cent.
  const g = buildGrid(4), T = new Tides(g), M = T.mesh;
  let s = 7;
  const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const cliffs = Float64Array.from({ length: g.n }, () => { const r = rnd(); return r < 0.2 ? 0 : r < 0.45 ? 20 + 400 * rnd() : 3000 + 3000 * rnd(); });
  for (const [name, depth] of [['cliffs', cliffs], ['uniform', cliffs.map(x => (x > 0 ? 4000 : 0))]]) {
    T.ocean(depth);
    const u = Float64Array.from({ length: M.ne }, (_, e) => (T.He[e] > 0 ? rnd() - 0.5 : 0));
    let power = 0, terms = 0, dW = 0, nW = 0;
    for (let e = 0; e < M.ne; e++) {
      if (!(T.He[e] > 0)) continue;
      const w = T.He[e] * M.len[e] * M.d[e] * u[e] * T.coriolis(e, u);
      power += w; terms += Math.abs(w);
      for (let k = M.cOff[e]; k < M.cOff[e + 1]; k++) if (T.He[M.cIdx[k]] > 0) { dW += (T.corW[k] - M.cM[k]) ** 2; nW += M.cM[k] ** 2; }
    }
    assert.ok(Math.abs(power) < 1e-12 * terms, `${name}: Coriolis's power ${(power / terms).toExponential(2)} of its terms`);
    if (name === 'uniform') assert.ok(dW < 0.05 ** 2 * nW, `uniform: ${(100 * Math.sqrt(dW / nW)).toFixed(1)}% from Perot's`);
  }
});

test('the spin never passes the synchronous, whatever the dissipation', () => {
  // 1e22 W per m² of tide (~10⁹ TW): each step lands on the balance; the spin only slows,
  // never below the Moon's motion, and spin and orbit keep their angular momentum. The end is
  // the dual-synchronous state (a ~47-day day, the Moon at ~550,000 km; standard, from memory).
  const saved = { ...TIDES };
  Object.assign(TIDES, { SOLAR: 0 });
  try {
    const m = new Moon(), E = EARTH, mu = E.M * E.m / (E.M + E.m), GMt = E.GM * (E.M + E.m);
    const L = () => E.C * m.Omega + mu * Math.sqrt(GMt * m.a), L0 = L();
    m.Punit = 1e22;
    let prev = m.Omega;
    for (let k = 0; k < 400; k++) {
      m.step(5e5);
      assert.ok(m.Omega <= prev * (1 + 1e-12) && m.Omega >= meanMotion(m.a) * (1 - 1e-12), `step ${k}: Ω ${m.Omega.toExponential(4)}, n ${meanMotion(m.a).toExponential(4)}`);
      prev = m.Omega;
    }
    assert.ok(Math.abs(L() / L0 - 1) < 1e-12, 'angular momentum kept');
    const days = 2 * Math.PI / m.Omega / 86400;
    assert.ok(days > 40 && days < 55 && m.a > 5.2e8 && m.a < 5.8e8, `dual-synchronous: ${days.toFixed(1)} days, ${(m.a / 1e3).toFixed(0)} km`);
  } finally { Object.assign(TIDES, saved); }
});
