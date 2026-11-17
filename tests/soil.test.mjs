// The ground (src/engine/soil.js): water kept, the periodic year, the bucket's
// steady state, deserts and wet climates, the spring flood, the snow's
// insulation, the periodic year's runoff against the climate's Budyko runoff,
// and the cost at level 7.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Soil, SOIL, potentialEvaporation } from '../src/engine/soil.js';

const season = m => Math.cos(2 * Math.PI * (m - 6) / 12);     // July warmest
/** Forcing for n cells from f(i, m) → [T, P]: T, P, PET, 12 per cell. */
function forcing(n, f) {
  const T = new Float32Array(12 * n), P = new Float32Array(12 * n);
  for (let i = 0; i < n; i++) for (let m = 0; m < 12; m++) { const [t, p] = f(i, m); T[12 * i + m] = t; P[12 * i + m] = p; }
  return { T, P, PET: potentialEvaporation(T) };
}
/** The climate's runoff (src/engine/climate.js, finish): Fu's form of Budyko's curve, ω = 2. */
function budyko(T, P, o) {
  let mat = 0, map = 0;
  for (let m = 0; m < 12; m++) { mat += T[o + m] / 12; map += P[o + m]; }
  const pet = Math.max(30, 55 * (mat + 4));
  return Math.max(0, map - map * pet / Math.sqrt(map * map + pet * pet + 1e-9));
}
// A spread of climates: mean −15…25 °C, seasons 0–20 K, 100–3,000 mm, rain even, with the summer or with the winter.
const CLIMATES = [];
for (const mat of [-15, -10, -5, 0, 5, 10, 15, 20, 25]) for (const A of [0, 5, 10, 15, 20])
  for (const map of [100, 250, 500, 1000, 2000, 3000]) for (const ph of [0, 1, -1]) CLIMATES.push({ mat, A, map, ph });
const climate = (c, m) => [c.mat + c.A * season(m), c.map / 12 * (1 + 0.8 * c.ph * season(m))];
// Cell i of a large grid gets one of them, jittered.
const jitter = i => { const x = Math.sin(i * 12.9898) * 43758.5453; return x - Math.floor(x); };

test('water is kept every month: P = E + R + ΔS + ΔSWE + ΔG', () => {
  const n = CLIMATES.length, f = forcing(n, (i, m) => climate(CLIMATES[i], m));
  const soil = new Soil(n, Float32Array.from({ length: n }, (_, i) => 50 + 400 * jitter(i)));
  const dT = new Float32Array(n), rf = new Float32Array(n);
  let worst = 0;
  for (let k = 0; k < 60; k++) {
    const m = k % 12;
    for (let i = 0; i < n; i++) { dT[i] = 6 * (jitter(i + 7 * k) - 0.5); rf[i] = 2 * jitter(i + 13 * k); }
    const S0 = Float64Array.from(soil.S), W0 = Float64Array.from(soil.SWE), G0 = Float64Array.from(soil.G);
    soil.stepMonth(m, f.T, f.P, f.PET, dT, rf);
    const o = soil.out;
    for (let i = 0; i < n; i++) {
      const j = 12 * i + m, p = f.P[j] * rf[i];
      const r = p - o.evap[j] - o.quick[j] - o.base[j] - (soil.S[i] - S0[i]) - (soil.SWE[i] - W0[i]) - (soil.G[i] - G0[i]);
      worst = Math.max(worst, Math.abs(r) / Math.max(1, p + S0[i] + W0[i] + G0[i]));   // the fluxes are kept as float32
      assert.ok(o.quick[j] >= 0 && o.base[j] >= 0 && o.evap[j] >= 0 && soil.S[i] >= 0 && soil.S[i] <= soil.Smax[i] + 1e-9 && soil.SWE[i] >= 0);
    }
  }
  assert.ok(worst < 1e-6, `worst imbalance ${worst.toExponential(2)} of the water in play`);
});

test('the periodic year: reached from cold, and a year stepped from it repeats it', () => {
  const n = CLIMATES.length, f = forcing(n, (i, m) => climate(CLIMATES[i], m));
  const soil = new Soil(n);
  const r = soil.equilibrium(f.T, f.P, f.PET, { cold: true });
  assert.equal(r.unconverged, 0, `${r.unconverged} cells unconverged`);
  const ref = Object.fromEntries(Object.entries(soil.out).map(([k, v]) => [k, Float32Array.from(v)]));
  for (let m = 0; m < 12; m++) soil.stepMonth(m, f.T, f.P, f.PET);
  let dS = 0, dW = 0, dG = 0, dR = 0;
  for (let k = 0; k < 12 * n; k++) {
    dS = Math.max(dS, Math.abs(soil.out.S[k] - ref.S[k])); dW = Math.max(dW, Math.abs(soil.out.SWE[k] - ref.SWE[k]));
    dG = Math.max(dG, Math.abs(soil.out.Tg[k] - ref.Tg[k]));
    dR = Math.max(dR, Math.abs(soil.out.quick[k] + soil.out.base[k] - ref.quick[k] - ref.base[k]));
  }
  assert.ok(dS < 0.2 && dW < 0.2 && dG < 0.03 && dR < 0.2, `a year on: S ${dS.toFixed(3)} mm, SWE ${dW.toFixed(3)} mm, Tg ${dG.toFixed(4)} K, runoff ${dR.toFixed(3)} mm`);
  // Warm, from its own periodic state, it is done in a year or two.
  const w = soil.equilibrium(f.T, f.P, f.PET);
  assert.ok(w.maxYears <= 2, `warm restart took up to ${w.maxYears} years`);
  // Perennial snow is capped, and its excess runs off: the year's water still balances.
  const k = CLIMATES.findIndex(c => c.mat === -15 && c.A === 0 && c.map === 1000);
  assert.ok(Math.abs(soil.SWE[k] - SOIL.WMAX) < 1 && Math.abs(soil.runoff[k] + soil.evap[k] - 1000) < 1, `perennial snow: SWE ${soil.SWE[k].toFixed(0)}, R + E ${(soil.runoff[k] + soil.evap[k]).toFixed(1)} mm`);
});

test("the bucket's steady state under constant forcing", () => {
  // Wet (w ≥ FC, E = PET): P (1 − w⁴) = PET + K_D S_max w⁴, so w⁴ = (P − PET)/(P + K_D S_max).
  // Dry (w < FC): (P + K_D S_max) w⁴ + (PET/FC) w = P, a quartic, by bisection.
  const smax = 150, kd = SOIL.KD * smax, T = 20, pet = SOIL.PET_K * (T + SOIL.PET_T0);
  for (const P of [300, 60]) {
    let w;
    if (P - pet >= (P + kd) * SOIL.FC ** 4) w = ((P - pet) / (P + kd)) ** 0.25;
    else { let lo = 0, hi = 1; for (let k = 0; k < 200; k++) { const x = 0.5 * (lo + hi); if ((P + kd) * x ** 4 + pet / SOIL.FC * x > P) hi = x; else lo = x; } w = 0.5 * (lo + hi); }
    const f = forcing(1, () => [T, P]), soil = new Soil(1, smax);
    soil.equilibrium(f.T, f.P, f.PET, { cold: true, tol: 1e-6, maxYears: 60 });
    const E = pet * Math.min(1, w / SOIL.FC);
    assert.ok(Math.abs(soil.S[0] / smax - w) < 1e-4, `P ${P}: w ${(soil.S[0] / smax).toFixed(5)} against ${w.toFixed(5)}`);
    assert.ok(Math.abs(soil.evap[0] / 12 - E) < 1e-2 && Math.abs(soil.runoff[0] / 12 - (P - E)) < 1e-2, `P ${P}: E ${(soil.evap[0] / 12).toFixed(3)} against ${E.toFixed(3)}`);
    assert.ok(Math.abs(soil.out.base[0] - kd * w ** 4) < 1e-2, 'baseflow K_D S_max w⁴');
    assert.ok(soil.SWE[0] < 1e-9 && Math.abs(soil.Tg[0] - T) < 1e-6, 'no snow; the ground at the air');
  }
});

test('a desert yields little runoff, a wet climate a lot', () => {
  const f = forcing(3, (i, m) => [[25 + 8 * season(m), 150 / 12], [26, 3000 / 12], [10 + 10 * season(m), 1000 / 12]][i]);
  const soil = new Soil(3);
  soil.equilibrium(f.T, f.P, f.PET, { cold: true });
  assert.ok(soil.runoff[0] < 0.02 * 150 && soil.wet[0] < 0.15, `desert: ${soil.runoff[0].toFixed(1)} mm of 150, wetness ${soil.wet[0].toFixed(2)}`);
  assert.ok(soil.runoff[1] > 0.35 * 3000 && soil.wet[1] > 0.7, `wet: ${soil.runoff[1].toFixed(0)} mm of 3,000, wetness ${soil.wet[1].toFixed(2)}`);
  let q = 0, bf = 0;
  for (let m = 0; m < 12; m++) { q += soil.out.quick[24 + m]; bf += soil.out.base[24 + m]; }
  assert.ok(bf > 0.3 * (q + bf) && bf < 0.7 * (q + bf), `temperate humid: baseflow ${(100 * bf / (q + bf)).toFixed(0)}% of ${(q + bf).toFixed(0)} mm`);
});

test('snowmelt peaks runoff in late spring at a cold site', () => {
  const f = forcing(1, (i, m) => [-3 + 17 * season(m), 40]);
  const soil = new Soil(1);
  soil.equilibrium(f.T, f.P, f.PET, { cold: true });
  const R = Array.from({ length: 12 }, (_, m) => soil.out.quick[m] + soil.out.base[m]);
  const peak = R.indexOf(Math.max(...R));
  assert.ok(peak >= 3 && peak <= 5, `peak in month ${peak + 1}: ${R.map(x => x.toFixed(0)).join(' ')}`);
  assert.ok(R[peak] > 4 * R[0], 'winter runs low');
  assert.ok(soil.out.SWE[1] > 100 && soil.out.SWE[7] === 0, 'a pack in winter, none in August');
});

test('permafrost under thin snow but not under thick, at the same air temperature', () => {
  // A mean of −2 °C and a 15 K season; 40 mm a month in summer, 5 or 80 in winter.
  const f = forcing(3, (i, m) => [-2 + 15 * season(m), season(m) > 0 ? 40 : [0, 5, 80][i]]);
  const soil = new Soil(3);
  soil.equilibrium(f.T, f.P, f.PET, { cold: true });
  const [bare, thin, thick] = [0, 1, 2].map(i => soil.tgMean[i]);
  assert.ok(Math.abs(bare + 2) < 0.02, `bare ground keeps the air's mean: ${bare.toFixed(3)} °C`);
  // The share is a logistic over the spread within a cell (PERMA_W), so −1.9 °C is ~87% frozen ground and +1.6 °C ~17%.
  assert.ok(thin < -1 && soil.permafrost[1] > 0.8, `thin snow: ground ${thin.toFixed(2)} °C, permafrost ${soil.permafrost[1].toFixed(2)}`);
  assert.ok(thick > 0.5 && soil.permafrost[2] < 0.2, `thick snow: ground ${thick.toFixed(2)} °C, permafrost ${soil.permafrost[2].toFixed(2)}`);
});

test("the periodic year's runoff against the climate's Budyko runoff", t => {
  const n = CLIMATES.length, f = forcing(n, (i, m) => climate(CLIMATES[i], m));
  const soil = new Soil(n);
  soil.equilibrium(f.T, f.P, f.PET, { cold: true });
  const bins = {}, add = (k, r, b) => { const x = bins[k] || (bins[k] = [0, 0, 0]); x[0] += r - b; x[1] += b; x[2] += Math.abs(r - b); };
  for (let i = 0; i < n; i++) {
    const c = CLIMATES[i], b = budyko(f.T, f.P, 12 * i), r = soil.runoff[i];
    const ai = Math.max(30, 55 * (c.mat + 4)) / c.map;
    add('all', r, b);
    add(c.mat < -2 ? 'cold (T̄ < −2)' : c.mat < 12 ? 'temperate' : 'warm (T̄ ≥ 12)', r, b);
    add(ai > 2 ? 'arid (PET/P > 2)' : ai > 0.7 ? 'between' : 'humid (PET/P < 0.7)', r, b);
    add(['even rain', 'summer rain', 'winter rain'][(c.ph + 3) % 3], r, b);
  }
  for (const [k, [d, b, a]] of Object.entries(bins)) t.diagnostic(`${k}: bias ${(100 * d / b).toFixed(1)}%, mean |error| ${(100 * a / b).toFixed(1)}% of Budyko's ${b.toFixed(0)} mm`);
  const [d, b, a] = bins.all;
  assert.ok(Math.abs(d / b) < 0.03 && a / b < 0.1, `bias ${(100 * d / b).toFixed(1)}%, mean |error| ${(100 * a / b).toFixed(1)}%`);
});

test("the periodic year's runoff on the opening planet, against its climate's", async t => {
  const { Planet } = await import('../src/engine/planet.js');
  const { monthPhase } = await import('../src/engine/orbit.js');
  const P = new Planet('earthlike', { level: 5, spinup: 10 }), c = P.climate, g = P.grid, n = g.n;
  c.solve(3);
  const f = forcing(n, (i, m) => [c.surfaceT(i, monthPhase(m)), c.pAt(i, monthPhase(m)) * 30.44]);
  const soil = new Soil(n, Float32Array.from(c.landMask, l => l ? SOIL.SMAX : 0));
  soil.equilibrium(f.T, f.P, f.PET, { cold: true });
  let rs = 0, rb = 0, ps = 0, abs = 0;
  const bins = {};
  for (let i = 0; i < n; i++) {
    if (!c.landMask[i]) continue;
    // Budyko's curve in Fu's form (ω = 2), as the climate's runoff was before the ground.
    let mat = 0, map = 0;
    for (let m = 0; m < 12; m++) { mat += f.T[12 * i + m] / 12; map += f.P[12 * i + m]; }
    const pet = Math.max(30, 55 * (mat + 4)), a = g.area[i], r = soil.runoff[i], b = Math.max(0, map - map * pet / Math.sqrt(map * map + pet * pet));
    rs += a * r; rb += a * b; abs += a * Math.abs(r - b); ps += a * map;
    const k = mat < -2 ? 'cold' : mat < 12 ? 'temperate' : 'warm', x = bins[k] || (bins[k] = [0, 0]);
    x[0] += a * (r - b); x[1] += a * b;
  }
  t.diagnostic(`land runoff ${(rs / ps * 100).toFixed(1)}% of rain against Budyko's ${(rb / ps * 100).toFixed(1)}%: bias ${(100 * (rs - rb) / rb).toFixed(1)}%, mean |error| ${(100 * abs / rb).toFixed(1)}%`);
  for (const [k, [d, b]] of Object.entries(bins)) t.diagnostic(`  ${k}: bias ${(100 * d / b).toFixed(1)}%`);
  // Each cell's own seasons (src/engine/climate.js, continentalSeasons) moved this level-5 planet's bias
  // from 3.6% to ~10% (warm land 9.8% → 16%: the bucket answers the seasons Budyko's annual curve
  // can't see), with the settled level-6 climates' runoff within a point of before. The sea's heat
  // transport and the seasons' wider diffusion (D_SEASON 0.29 → 0.49; maritime air's K 10 → 2) took
  // it to ~−16% (runoff 21% of rain against Budyko's 25%; warm land −17%, cold −27%, temperate
  // −3.5%): the bucket matches Budyko under made-up forcing (above), so the band follows the climate.
  assert.ok(Math.abs(rs - rb) < 0.2 * rb, `bias ${(100 * (rs - rb) / rb).toFixed(1)}%`);
});

test('cost: the periodic year for every cell at level 7', t => {
  const n = 163842;
  const f = forcing(n, (i, m) => climate(CLIMATES[i % CLIMATES.length], m).map((v, k) => k ? v * (0.8 + 0.4 * jitter(i)) : v + 2 * jitter(i + 1)));
  const soil = new Soil(n);
  let t0 = performance.now();
  const cold = soil.equilibrium(f.T, f.P, f.PET, { cold: true });
  const tc = performance.now() - t0;
  // A climate cycle later: a little warmer and wetter.
  for (let k = 0; k < 12 * n; k++) { f.T[k] += 0.3; f.P[k] *= 1.03; }
  potentialEvaporation(f.T, f.PET);
  t0 = performance.now();
  const warm = soil.equilibrium(f.T, f.P, f.PET);
  const tw = performance.now() - t0;
  t0 = performance.now();
  soil.stepMonth(0, f.T, f.P, f.PET);
  const tm = performance.now() - t0;
  t.diagnostic(`all ${n} cells land: cold ${tc.toFixed(0)} ms (${cold.meanYears.toFixed(2)} years a cell, at most ${cold.maxYears}); warm ${tw.toFixed(0)} ms (${warm.meanYears.toFixed(2)}, at most ${warm.maxYears}); one month ${tm.toFixed(1)} ms`);
  // The cost is the work, not the wall clock (which a parallel suite inflates): a warm restart
  // converges in a few years a cell.
  assert.ok(warm.meanYears < 3 && warm.maxYears <= 8, `warm periodic year: ${warm.meanYears.toFixed(2)} years a cell, at most ${warm.maxYears}`);
});
