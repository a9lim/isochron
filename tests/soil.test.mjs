// The ground (src/engine/soil.js): water kept every month, and the bucket's analytic steady state.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Soil, SOIL, potentialEvaporation, aquifer } from '../src/engine/soil.js';

const season = m => Math.cos(2 * Math.PI * (m - 6) / 12);     // July warmest
/** Forcing for n cells from f(i, m) → [T, P]: T, P, PET, 12 per cell. */
function forcing(n, f) {
  const T = new Float32Array(12 * n), P = new Float32Array(12 * n);
  for (let i = 0; i < n; i++) for (let m = 0; m < 12; m++) { const [t, p] = f(i, m); T[12 * i + m] = t; P[12 * i + m] = p; }
  return { T, P, PET: potentialEvaporation(T) };
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

test('the aquifer steps exactly and keeps its water, drawn dry or not, and at its balance passes on its recharge', () => {
  // Exact: two half spans make one span, filling, drawn down past its recharge (it runs dry midway), and drained.
  const tau = SOIL.TAU_A;
  for (const [A0, r, w] of [[0, 50, 0], [3e4, 40, 10], [5e3, 20, 60], [8e3, 0, 0]]) {
    const one = aquifer(A0, r, w, 900, tau), h = aquifer(A0, r, w, 450, tau), two = aquifer(h.A, r, w, 450, tau);
    assert.ok(Math.abs(one.A - two.A) < 1e-9 * Math.max(1, A0), `A0 ${A0}, r ${r}, w ${w}: ${one.A} against ${two.A} in halves`);
    assert.ok(Math.abs(one.out - (h.out + two.out)) < 1e-6 && Math.abs(one.drawn - (h.drawn + two.drawn)) < 1e-6, 'its flows add over halves');
    assert.ok(Math.abs(A0 + r * 900 - (one.A + one.out + one.drawn)) < 1e-6 * Math.max(1, A0 + r * 900), 'what came in is what it holds more and what left');
    assert.ok(one.A >= 0 && one.out >= -1e-9);
  }
  // At its balance under the year's recharge, the periodic year's baseflow over the year is the ground's own.
  const n = 40, fc = forcing(n, (i, m) => climate(CLIMATES[(i * 7) % CLIMATES.length], m)), s = new Soil(n);
  s.equilibrium(fc.T, fc.P, fc.PET, { cold: true });
  s.aquiferStep(Infinity);
  for (let i = 0; i < n; i++) {
    let g = 0, b = 0;
    for (let m = 0; m < 12; m++) { g += s.out.base[12 * i + m]; b += s.riverBase(12 * i + m); }
    assert.ok(Math.abs(b - g) < 1e-6 * Math.max(1, g), `cell ${i}: the rivers' ${b} mm against the ground's ${g}`);
    assert.ok(Math.abs(s.A[i] - tau * SOIL.F_AQ * g) < 1e-6 * Math.max(1, s.A[i]));
  }
});
