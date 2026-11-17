// Vegetation as state: cover in limit climates, exact relaxation, carbon's
// balance, the Miami model, snow masking, a toy green–desert bistability, and
// the cost at level 7.
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildGrid } from '../src/grid/icosphere.js';
import {
  VEG, Vegetation, equilibrium, miami, npp, gdd, landAlbedo, transpiration, weathering, dust, colourWeights,
} from '../src/engine/vegetation.js';

const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg}: ${a} vs ${b} (±${tol})`);
const annual = (mean, amp) => Array.from({ length: 12 }, (_, m) => mean - amp * Math.cos(2 * Math.PI * (m + 0.5) / 12));
const cover = (G, P) => { const [f, v] = equilibrium(G, P); return { trees: f, grass: v - f, bare: 1 - v }; };

test('vegetation: degree-days from monthly means', () => {
  near(gdd(Array(12).fill(26)), 26 * 365.28, 1, 'a tropical year');
  near(gdd(Array(12).fill(-30)), 0, 1e-6, 'a polar year');
  near(gdd(annual(5, 10), 0, 0), 30.44 * annual(5, 10).reduce((s, t) => s + Math.max(0, t), 0), 1e-9, 'no spread: the plain sum');
  assert.ok(gdd(annual(-12, 14)) > gdd(annual(-12, 14), 0, 0), "the days' spread adds warm days to a cold year");
});

test('vegetation: equilibrium cover in limit climates', () => {
  const rf = cover(gdd(Array(12).fill(26)), 2500);
  assert.ok(rf.trees > 0.9 && rf.bare < 0.02, `rainforest ${JSON.stringify(rf)}`);
  const ds = cover(gdd(annual(25, 8)), 60);
  assert.ok(ds.bare > 0.99, `desert ${JSON.stringify(ds)}`);
  const tu = cover(gdd(annual(-10, 14)), 300);
  assert.ok(tu.trees < 0.01 && tu.grass > 0.7, `tundra ${JSON.stringify(tu)}`);
  const st = cover(gdd(annual(8, 14)), 350);
  assert.ok(st.grass > 0.6 && st.trees < 0.25, `steppe ${JSON.stringify(st)}`);
  const bo = cover(gdd(annual(-2, 18)), 500);
  assert.ok(bo.trees > 0.6, `boreal ${JSON.stringify(bo)}`);
  const pd = cover(gdd(annual(-20, 10)), 150);
  assert.ok(pd.bare > 0.7, `polar desert ${JSON.stringify(pd)}`);
  // Soil water scales the rain the plants see: a dry soil under the same rain thins the forest.
  assert.ok(equilibrium(3500, 600, 0.1)[0] < equilibrium(3500, 600)[0], 'dry soil, fewer trees');
  for (const [G, P] of [[100, 50], [9000, 300], [2000, 4000], [5000, 120]]) {
    const [f, v] = equilibrium(G, P);
    assert.ok(f >= 0 && f <= v && v <= 1, `fractions in order at ${G}, ${P}`);
  }
});

// One cell of each kind, its climate set, its state out of balance.
function cells() {
  const n = 4, veg = new Vegetation(n);
  veg.setClimate({
    land: [1, 1, 1, 1], gdd: [9500, 1500, 3500, 400], precip: [2500, 500, 350, 300], temp: [26, -2, 8, -12],
  });
  return veg;
}

test('vegetation: relaxation is exact at any step', () => {
  for (const h of [1, 37, 1e3, 1e5, 1e6]) {
    const a = cells(), b = cells();
    a.step(h);
    for (let k = 0; k < 64; k++) b.step(h / 64);
    for (let i = 0; i < a.n; i++) {
      near(a.veg[i], b.veg[i], 1e-12, `vegetated share after ${h} yr`);
      near(a.share[i], b.share[i], 1e-12, `trees' share after ${h} yr`);
      near(a.veg[i], a.vEq[i] * (1 - Math.exp(-h / VEG.TAU_GRASS)), 1e-12, `v against e^{−t/τ}, ${h} yr`);
      near(a.share[i], a.sEq[i] * (1 - Math.exp(-h / VEG.TAU_TREE)), 1e-12, `s against e^{−t/τ}, ${h} yr`);
      near(a.ft[i] + a.fg[i], a.veg[i], 1e-6, 'trees and grass make the cover');
    }
  }
  // Past τ the cover is its climate's: the closure.
  const c = cells();
  c.step(1e6);
  for (let i = 0; i < c.n; i++) {
    const [f, v] = equilibrium(c.gdd[i], [2500, 500, 350, 300][i]);
    near(c.ft[i], f, 1e-6, 'trees closed'); near(c.ft[i] + c.fg[i], v, 1e-6, 'cover closed');
  }
});

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

test("vegetation: Lieth's Miami model", () => {
  near(miami(10, 1e9), 1406.4, 0.1, 'temperature limit at 10 °C (g DM/m²/yr)');
  near(miami(0, 1e9), 635.0, 0.1, 'temperature limit at 0 °C');
  near(miami(100, 1000), 1455.6, 0.1, 'rain limit at 1,000 mm');
  near(miami(30, 3000), 2590.7, 0.1, 'the lesser of the two');
  near(miami(30, 0), 0, 1e-12, 'no rain, no growth');
  near(npp(26, 2500), 0.45 * 1e-3 * miami(26, 2500), 1e-12, 'carbon is 45% of dry matter');
  near(npp(26, 2500, 560) / npp(26, 2500), 1 + VEG.BETA * Math.LN2, 1e-12, "doubled CO₂: VECODE's β");
});

test('vegetation: forest masks snow; the feedback factors', () => {
  const forest = landAlbedo(0.9, 0.05, 1), grass = landAlbedo(0, 0.95, 1), bare = landAlbedo(0, 0, 1);
  assert.ok(forest < grass - 0.15, `snowy forest ${forest} against snowy grass ${grass}`);
  near(grass, 0.62, 1e-12, "snowy grass is the climate's snow");
  near(bare, grass, 1e-12, 'snow hides bare ground and grass alike');
  near(landAlbedo(0, 1, 0), 0.27, 1e-12, "snow-free grass is the climate's land");
  // The planetary albedo sees VEG.PLANETARY of the surface contrasts (VECODE's: forest −0.07, bare +0.13 against grass).
  near(landAlbedo(1, 0, 0) - landAlbedo(0, 1, 0), VEG.PLANETARY * (VEG.ALB_TREE - VEG.ALB_GRASS), 1e-12, 'forest darker');
  near(landAlbedo(0, 0, 0) - landAlbedo(0, 1, 0), VEG.PLANETARY * (VEG.ALB_BARE - VEG.ALB_GRASS), 1e-12, 'bare brighter');
  assert.ok(landAlbedo(1, 0, 0) < landAlbedo(0, 1, 0) && landAlbedo(0, 1, 0) < landAlbedo(0, 0, 0));
  assert.ok(transpiration(0.9, 0.05) > transpiration(0, 0.95) && transpiration(0, 0.95) > transpiration(0, 0), 'forest recycles most');
  assert.ok(transpiration(0.9, 0.05, 0.2) < transpiration(0.9, 0.05, 1), 'dry soil, less transpiration');
  assert.ok(transpiration(0.9, 0.05, 0.2) > transpiration(0, 0.95, 0.2), "trees' roots reach deeper");
  near(weathering(1, 0), 1, 1e-12, 'forest weathers fully');
  near(weathering(0, 0), VEG.W_BARE, 1e-12, 'bare rock');
  near(dust(0.2, 0.3), 0.5, 1e-12, 'dust from bare ground');
  const w = colourWeights(0.6, 0.3, 25, 9000, new Float32Array(8));
  near(w.reduce((s, x) => s + x, 0), 1, 1e-6, 'colour weights sum to one');
  assert.ok(w[0] > 0.5 && w[3] > 0.2, 'warm forest is tropical, warm grass savanna');
  const c = colourWeights(0.6, 0.3, -4, 1200, new Float32Array(8));
  assert.ok(c[2] > 0.4 && c[0] < 0.01, 'cold forest is boreal');
});

test('vegetation: a toy margin where rain follows cover is bistable (speculation)', () => {
  // One subtropical cell whose rain is P₀ + K v (moisture recycling): two
  // stable states under one forcing, and hysteresis as P₀ sweeps up and down.
  const K = 400, G = 7000, veg = new Vegetation(1), land = [1], gdd0 = [G], temp = [22];
  const run = years => {
    for (let k = 0; k < years; k++) {
      veg.setClimate({ land, gdd: gdd0, precip: [P0 + K * veg.veg[0]], temp });
      veg.step(1);
    }
    return veg.veg[0];
  };
  let P0 = 60;
  veg.veg[0] = 0; const desert = run(400);
  veg.veg[0] = 1; const green = run(400);
  assert.ok(desert < 0.05 && green > 0.6, `one forcing, two states: ${desert}, ${green}`);
  // Sweep.
  const ups = [], downs = [];
  veg.veg[0] = 0;
  for (P0 = 0; P0 <= 160; P0 += 4) ups.push([P0, run(300)]);
  for (P0 = 160; P0 >= 0; P0 -= 4) downs.push([P0, run(300)]);
  const up = ups.find(([, v]) => v > 0.3)[0], down = downs.find(([, v]) => v < 0.3)[0];
  console.log(`  toy margin: greens at P₀ ≈ ${up} mm going up, dries at P₀ ≈ ${down} mm going down`);
  assert.ok(up - down >= 30, `hysteresis: up ${up}, down ${down}`);
  // Without the recycling, one state.
  veg.veg[0] = 1; P0 = 60;
  for (let k = 0; k < 400; k++) { veg.setClimate({ land, gdd: gdd0, precip: [P0], temp }); veg.step(1); }
  assert.ok(veg.veg[0] < 0.05, 'no recycling: the margin is desert from either side');
});

test("vegetation: cost at level 7's cells", () => {
  const g = buildGrid(7), n = g.n, veg = new Vegetation(n, g.area);
  const land = new Uint8Array(n), G = new Float32Array(n), P = new Float32Array(n), T = new Float32Array(n);
  let s = 12345;
  const rnd = () => (s = (s * 1103515245 + 12345) % 2147483648) / 2147483648;
  for (let i = 0; i < n; i++) {
    const lat = Math.asin(g.pos[3 * i + 2]);
    T[i] = 28 - 45 * Math.sin(lat) ** 2; G[i] = Math.max(0, 365 * (T[i] + 6)); P[i] = 3000 * rnd();
    land[i] = rnd() < 0.29 ? 1 : 0;
  }
  const time = (f, k) => { const t0 = performance.now(); for (let j = 0; j < k; j++) f(j); return (performance.now() - t0) / k; };
  const tc = time(() => veg.setClimate({ land, gdd: G, precip: P, temp: T, co2: 300 }), 5);
  const ts = time(j => veg.step([0.01, 1, 100, 1e4, 1e6][j % 5]), 50);
  const tk = time(() => veg.colours(), 5);
  const land29 = veg.totals(land);
  land.fill(1);
  veg.setClimate({ land, gdd: G, precip: P, temp: T });
  const ta = time(j => veg.step([0.01, 1, 100, 1e4, 1e6][j % 5]), 50);
  console.log(`  level 7, ${n} cells: setClimate ${tc.toFixed(2)} ms, step ${ts.toFixed(2)} ms (29% land), ${ta.toFixed(2)} ms (all land), colours ${tk.toFixed(2)} ms`);
  console.log(`  on a synthetic climate: land carbon ${(land29.veg).toFixed(0)} Pg in plants, ${(land29.soil).toFixed(0)} Pg in soil; trees ${(100 * land29.trees).toFixed(0)}%, bare ${(100 * land29.bare).toFixed(0)}%`);
  assert.ok(ts < 25 && ta < 40, 'a frame can afford a step');
});
