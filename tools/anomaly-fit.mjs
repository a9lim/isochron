// The anomaly's amplitude by latitude (src/engine/year.js, YEAR.Q), fitted to the QG
// weather's monthly temperature variance over land. The weather runs headless on the
// GPU (WebGPU in node: `npm install` in tests/), at fixed seasons, from a warm climate;
// its lower layer's θ is sampled daily, and each latitude band's monthly-mean variance
// is the daily variance times the 30-day mean of its pooled autocorrelation. The
// anomaly model is then run with the current Q, and Q is scaled band by band so the
// model's land spread matches the weather's (both hemispheres pooled by |latitude|).
// usage: node tools/anomaly-fit.mjs [seed] [days per season]
import { hasGPU } from '../tests/webgpu-node.mjs';
import { Planet } from '../src/engine/planet.js';
import { Year, YEAR } from '../src/engine/year.js';
import { gpuDevice } from '../src/gpu/device.js';
import { GpuWeather, weatherForcing } from '../src/gpu/weather.js';
import { monthPhase } from '../src/engine/orbit.js';

if (!hasGPU) { console.error('no WebGPU in node (npm install in tests/)'); process.exit(1); }
const seed = process.argv[2] || 'earthlike', DAYS = +(process.argv[3] || 120), SPIN = 15, LAG = 30;
const P = new Planet(seed, { level: 6 });
P.climate.solve(3);
const c = P.climate, g = P.grid, n = g.n, device = await gpuDevice();
const lat = Float64Array.from({ length: n }, (_, i) => Math.asin(g.pos[3 * i + 2]) * 180 / Math.PI);
const NB = 9, bandOf = i => Math.min(NB - 1, Math.floor(Math.abs(lat[i]) / 10));
// Pooled per |latitude| band over land: daily variance, and autocovariance by lag.
const acf = new Float64Array(NB * LAG), cnt = new Float64Array(NB);
for (const month of [0, 6]) {
  const tau = monthPhase(month), wx = new GpuWeather(device, g, `fit-${month}`, null, P.moon.Omega);
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
  console.log(`month ${month}: ${DAYS} days in ${((performance.now() - t0) / 1000).toFixed(1)} s`);
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
// The anomaly model's land spread per band with the current Q (its closure, which tracks the live model: tests/year.test.mjs).
const y = new Year(c, null, 'fit');
y.capacity(true);
const sm = new Float64Array(NB), am = new Float64Array(NB);
for (let i = 0; i < y.n; i++) {
  const b = Math.min(NB - 1, Math.floor(Math.abs(y.lat[i]) * 180 / Math.PI / 10)), a = y.land[i] * y.grid.area[i];
  sm[b] += a * y.sigma[i]; am[b] += a;
}
console.log('|lat|  weather daily  monthly   model   ratio');
const ratio = new Float64Array(NB);
for (let b = 0; b < NB; b++) {
  const m = am[b] > 0 ? sm[b] / am[b] : NaN;
  ratio[b] = sw[b] / m;
  console.log(`${String(b * 10).padStart(3)}°   ${daily[b].toFixed(2).padStart(6)} K   ${sw[b].toFixed(2).padStart(6)} K  ${m.toFixed(2).padStart(6)} K  ${ratio[b].toFixed(2)}`);
}
// Bands without the weather's land take their neighbours'; then the new Q at 10° nodes, pole to pole.
for (let b = 0; b < NB; b++) if (!Number.isFinite(ratio[b])) { let k = 1; while (!Number.isFinite(ratio[b - k] ?? NaN) && !Number.isFinite(ratio[b + k] ?? NaN) && k < NB) k++; ratio[b] = Number.isFinite(ratio[b - k]) ? ratio[b - k] : ratio[b + k]; }
// A node at |φ| sits between the bands either side of it.
const Q = YEAR.Q.map((q, k) => { const j = Math.abs(-9 + k), hi = Math.min(NB - 1, j), lo = Math.max(0, j - 1); return +(q * 0.5 * (ratio[lo] + ratio[hi])).toFixed(2); });
console.log(`Q: [${Q.join(', ')}]`);
process.exit(0);
