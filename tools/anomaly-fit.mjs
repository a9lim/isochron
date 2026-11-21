// The anomaly's amplitude by latitude (src/engine/year.js, YEAR.Q), fitted to the QG
// weather's monthly temperature variance over land. The weather runs headless on the
// GPU (WebGPU in node: `npm install` in tests/), at fixed seasons, from a warm climate;
// its lower layer's θ is sampled daily, and each latitude band's monthly-mean variance
// is the daily variance times the 30-day mean of its pooled autocorrelation. The
// anomaly model is then run with the current Q, and Q is scaled band by band so the
// model's land spread matches the weather's (both hemispheres pooled by |latitude|), to a
// fixed point (a node's Q sets the bands either side of it). The QG weather has no tropical
// convection and damps the tropics (WEATHER.TAU_TROP, e-folding in latitude over 0.18 rad: a
// 2.6-day damping at 10°, 8 days at 15°, 43 at 20°), so only bands from 20° are fitted and the
// nodes within 20° are held at 20°'s: the tropics' spread follows from their heat capacity. The
// pole's node is held at 80°'s, so the seven bands fitted set seven nodes (with one more free, a
// zigzag from node to node went unset).
// usage: node tools/anomaly-fit.mjs [seed] [days per season] [weathers per season]
import { hasGPU } from '../tests/webgpu-node.mjs';
import { openPlanet } from '../src/engine/planet.js';
import { Year, YEAR } from '../src/engine/year.js';
import { gpuDevice } from '../src/gpu/device.js';
import { GpuWeather, weatherForcing } from '../src/gpu/weather.js';
import { monthPhase } from '../src/engine/orbit.js';

if (!hasGPU) { console.error('no WebGPU in node (npm install in tests/)'); process.exit(1); }
const seed = process.argv[2] || 'earthlike', DAYS = +(process.argv[3] || 120), RUNS = +(process.argv[4] || 1), SPIN = 15, LAG = 30;
const P = await openPlanet(seed, { level: 6 });
P.settleClimate();   // the converged climate (its first cycles are a transient)
const c = P.climate, g = P.grid, n = g.n, device = await gpuDevice();
const lat = Float64Array.from({ length: n }, (_, i) => Math.asin(g.pos[3 * i + 2]) * 180 / Math.PI);
const NB = 9, bandOf = i => Math.min(NB - 1, Math.floor(Math.abs(lat[i]) / 10));
// Pooled per |latitude| band over land: daily variance, and autocovariance by lag.
const acf = new Float64Array(NB * LAG), cnt = new Float64Array(NB);
for (const month of [0, 6]) for (let run = 0; run < RUNS; run++) {
  const tau = monthPhase(month), wx = new GpuWeather(device, g, run ? `fit-${month}-${run}` : `fit-${month}`, null, P.moon.Omega);
  const f4 = new Float32Array(4 * n);
  wx.setForcing(f4, weatherForcing(c, tau, f4));
  wx.start();
  const perDay = Math.round(86400 / wx.dt);
  for (let d = 0; d < SPIN; d++) wx.advance(perDay);
  const series = [];
  const t0 = performance.now();
  for (let d = 0; d < DAYS; d++) {
    wx.advance(perDay);
    let r = null;
    while (!r) r = await wx.read();
    if (!r.theta.every(Number.isFinite)) throw new Error('weather blew up');
    series.push(r.theta);
  }
  console.log(`month ${month}${RUNS > 1 ? `, weather ${run + 1}` : ''}: ${DAYS} days in ${((performance.now() - t0) / 1000).toFixed(1)} s`);
  for (let i = 0; i < n; i++) {
    if (!c.landMask[i]) continue;
    let m = 0;
    for (let d = 0; d < DAYS; d++) m += series[d][i];
    m /= DAYS;
    const b = bandOf(i), a = g.area[i];
    for (let k = 0; k < LAG; k++) {
      let s = 0;
      for (let d = 0; d + k < DAYS; d++) s += (series[d][i] - m) * (series[d + k][i] - m);
      acf[b * LAG + k] += a * s / (DAYS - k);
    }
    cnt[b] += a;
  }
}
// The weather's monthly-mean spread per band: σ_m² = Σ_{|k|<30} (1 − |k|/30) C_k / 30.
const sw = new Float64Array(NB), daily = new Float64Array(NB);
for (let b = 0; b < NB; b++) {
  if (!(cnt[b] > 0)) { sw[b] = NaN; continue; }
  const C = k => acf[b * LAG + k] / cnt[b];
  let s = C(0);
  for (let k = 1; k < LAG; k++) s += 2 * (1 - k / LAG) * Math.max(0, C(k));
  sw[b] = Math.sqrt(s / LAG); daily[b] = Math.sqrt(C(0));
}
// The anomaly model's land spread per band under Q (its closure, which tracks the live model).
const Q0 = YEAR.Q.slice(), FIT_FROM = 2;
function modelSpread() {
  const y = new Year(c, null, 'fit');
  y.capacity(true);
  const sm = new Float64Array(NB), am = new Float64Array(NB);
  for (let i = 0; i < y.n; i++) {
    const b = Math.min(NB - 1, Math.floor(Math.abs(y.lat[i]) * 180 / Math.PI / 10)), a = y.land[i] * y.grid.area[i];
    sm[b] += a * y.sigma[i]; am[b] += a;
  }
  return Array.from(sm, (s, b) => am[b] > 0 ? s / am[b] : NaN);
}
function ratios(m) {
  const ratio = Float64Array.from(m, (v, b) => sw[b] / v);
  // Bands without the weather's land take their neighbours'; the damped tropics take 20–30°'s.
  for (let b = 0; b < NB; b++) if (!Number.isFinite(ratio[b])) { let k = 1; while (!Number.isFinite(ratio[b - k] ?? NaN) && !Number.isFinite(ratio[b + k] ?? NaN) && k < NB) k++; ratio[b] = Number.isFinite(ratio[b - k]) ? ratio[b - k] : ratio[b + k]; }
  for (let b = 0; b < FIT_FROM; b++) ratio[b] = ratio[FIT_FROM];
  return ratio;
}
const m0 = modelSpread();
// A node at |φ| sits between the bands either side of it; scaled until the bands match.
for (let it = 0; it < 60; it++) {
  const ratio = ratios(modelSpread());
  YEAR.Q = YEAR.Q.map((q, k) => { const j = Math.abs(-9 + k), hi = Math.min(NB - 1, j), lo = Math.max(0, j - 1); return q * Math.sqrt(0.5 * (ratio[lo] + ratio[hi])); });
  YEAR.Q = YEAR.Q.map((q, k) => Math.abs(-9 + k) < FIT_FROM ? YEAR.Q[k < 9 ? 9 - FIT_FROM : 9 + FIT_FROM] : k === 0 ? YEAR.Q[1] : k === 18 ? YEAR.Q[17] : q);
}
const m1 = modelSpread();
console.log('|lat|  weather daily  monthly   model (was)   model (fitted)');
for (let b = 0; b < NB; b++) console.log(`${String(b * 10).padStart(3)}°   ${daily[b].toFixed(2).padStart(6)} K   ${sw[b].toFixed(2).padStart(6)} K  ${m0[b].toFixed(2).padStart(6)} K (${(sw[b] / m0[b]).toFixed(2)})  ${m1[b].toFixed(2).padStart(6)} K (${(sw[b] / m1[b]).toFixed(2)})`);
console.log(`Q was: [${Q0.join(', ')}]`);
console.log(`Q:     [${YEAR.Q.map(q => +q.toFixed(2)).join(', ')}]`);
process.exit(0);
