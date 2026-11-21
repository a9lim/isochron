// Vegetation as state (src/engine/vegetation.js): carbon kept, the closed form against RK4, Lieth's Miami model.
import test from 'node:test';
import assert from 'node:assert/strict';
import { VEG, Vegetation, equilibrium, npp, gdd } from '../src/engine/vegetation.js';

const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg}: ${a} vs ${b} (±${tol})`);
const cover = (G, P) => { const [f, v] = equilibrium(G, P); return { trees: f, grass: v - f, bare: 1 - v }; };

// One cell of each kind, its climate set, its state out of balance.
function cells() {
  const n = 4, veg = new Vegetation(n);
  veg.setClimate({
    land: [1, 1, 1, 1], gdd: [9500, 1500, 3500, 400], precip: [2500, 500, 350, 300], temp: [26, -2, 8, -12],
  });
  return veg;
}

test('vegetation: carbon is conserved, NPP − respiration = ΔC', () => {
  for (const h of [0.5, 10, 300, 1e4, 1e6]) {
    const v = cells();
    v.Cs[3] = 40;                          // old soil under the tundra, out of balance
    const C0 = v.totals();
    const f = v.step(h), C1 = v.totals();
    const dC = (C1.veg + C1.soil) - (C0.veg + C0.soil);
    near((f.npp - f.resp) * h, dC, 1e-9 * Math.max(1, Math.abs(dC)), `balance over ${h} yr`);
    near(f.air, f.resp - f.npp, 1e-12, 'the flux to the air');
  }
  // From bare ground the land takes carbon up; in balance it trades none.
  const g = cells();
  assert.ok(g.step(50).air < 0, 'a growing land draws down the air');
  g.equilibrate();
  near(g.step(100).air, 0, 1e-9, 'in balance');
});

// The whole state by RK4 from the cover's and pools' equations, for checking the closed form.
function rk4(v, i, h, m) {
  const V = VEG, al = 1 / V.TAU_TREE, ga = 1 / V.TAU_GRASS, aW = 1 / V.TAU_WOOD, aH = 1 / V.TAU_HERB;
  const p = v.pi[i], ve = v.vEq[i], se = v.sEq[i], b = v.kS[i];
  const F = y => [ga * (ve - y[0]), al * (se - y[1]), p * y[0] * y[1] - aW * y[2], p * y[0] * (1 - y[1]) - aH * y[3], aW * y[2] + aH * y[3] - b * y[4]];
  let y = [v.veg[i], v.share[i], v.Ct[i], v.Cg[i], v.Cs[i]];
  const d = h / m, ax = (y, k, c) => y.map((x, j) => x + c * k[j]);
  for (let s = 0; s < m; s++) {
    const k1 = F(y), k2 = F(ax(y, k1, d / 2)), k3 = F(ax(y, k2, d / 2)), k4 = F(ax(y, k3, d));
    y = y.map((x, j) => x + d / 6 * (k1[j] + 2 * k2[j] + 2 * k3[j] + k4[j]));
  }
  return y;
}

test('vegetation: the closed form solves the cover and pools together', () => {
  // From bare ground with old soil, and where the soil's rate meets a pool's or the cover's (the limits).
  for (const kS of [null, 1 / VEG.TAU_WOOD, 1 / VEG.TAU_GRASS, 1 / VEG.TAU_TREE]) {
    const v = cells();
    v.Cs.fill(30); v.Ct[1] = 2;
    if (kS) v.kS.fill(kS);
    const h = 150, want = Array.from({ length: v.n }, (_, i) => rk4(v, i, h, 60000));
    v.step(h);
    for (let i = 0; i < v.n; i++) {
      const [, , ct, cg, cs] = want[i], tag = `cell ${i}${kS ? `, soil at 1/${(1 / kS).toFixed(0)} yr` : ''}`;
      near(v.Ct[i], ct, 1e-8 * Math.max(1, ct), `tree carbon, ${tag}`);
      near(v.Cg[i], cg, 1e-8 * Math.max(1, cg), `grass carbon, ${tag}`);
      near(v.Cs[i], cs, 1e-8 * Math.max(1, cs), `soil carbon, ${tag}`);
    }
  }
  // So one long step is many short ones.
  const a = cells(), b = cells();
  a.step(1000);
  for (let k = 0; k < 1000; k++) b.step(1);
  for (let i = 0; i < a.n; i++) {
    for (const key of ['Ct', 'Cg', 'Cs']) near(a[key][i], b[key][i], 1e-9 * Math.max(1, b[key][i]), `${key} after a kyr, cell ${i}`);
  }
  // And a Myr is the balance.
  const c = cells(), d = cells();
  c.step(1e6); d.equilibrate();
  for (let i = 0; i < c.n; i++) for (const key of ['Ct', 'Cg', 'Cs']) near(c[key][i], d[key][i], 1e-9 * Math.max(1, d[key][i]), `${key} closed, cell ${i}`);
});
