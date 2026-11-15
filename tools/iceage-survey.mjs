// The ice ages with every amplifier (docs/PLAN.md, phase 9's survey): the regolith's beds, the
// sea's carbon with CO₂ free, dust and the plants' cover. From the opening, the climate is
// settled with CO₂ held at the baseline (as `Planet.settleClimate`, asynchronously: the sea,
// the cover's closure, the lakes, the regolith's layer and the iron's reference wait for it,
// and weathering's is taken there too, so the run starts in balance at the baseline), then the
// coupled planet runs at the Ice ages experiment's pace (a
// climate cycle every 2 kyr, the orbit seen through the window the dial passes in ~2 s:
// 20 kyr at 10 kyr/s) with CO₂ free or held. Per kyr it records the ice's volume, CO₂, dust,
// the mean temperature, the orbit's summer insolation at 65° N and the summer's land
// temperature at 60–70° N; at the end, in successive windows, the ice's dominant period and
// the swings of CO₂ and dust between the ice's highs and lows.
// With WebGPU in node (tests/webgpu-node.mjs) the moisture and the dust run on the GPU, as in
// the page; the ice runs on the CPU (its reference).
//
//   node tools/iceage-survey.mjs [seed] [baseline ppm] [free|held] [kyr] [orbit window kyr] [nodust] [out.json]
import { Planet, CARBON } from '../src/engine/planet.js';
import { monthPhase } from '../src/engine/orbit.js';

const [seed = 'earthlike', base = '260', mode = 'free', kyr = '800', orbitWin = '20', dustArg = 'dust', outFile = ''] = process.argv.slice(2);
const level = +(process.env.LEVEL || 6);
// Overrides for sensitivity runs, as JSON in OVERRIDES: {"ICE": {...}, "CLIMATE": {...}, "AEOLIAN": {...}}.
{
  const o = JSON.parse(process.env.OVERRIDES || '{}');
  const { ICE } = await import('../src/engine/ice.js'), { CLIMATE } = await import('../src/engine/climate.js'), { AEOLIAN } = await import('../src/engine/aeolian.js');
  Object.assign(ICE, o.ICE || {}); Object.assign(CLIMATE, o.CLIMATE || {}); Object.assign(AEOLIAN, o.AEOLIAN || {});
}
CARBON.FIXED = +base;
let device = null;
{ const { hasGPU } = await import('../tests/webgpu-node.mjs'); if (hasGPU) device = await (await import('../src/gpu/device.js')).gpuDevice(); }
const t0 = performance.now();
const P = new Planet(seed, { level, dust: dustArg !== 'nodust' });
const c = P.climate, g = P.grid, n = g.n;
if (device) {
  c.gpu = new (await import('../src/gpu/moisture.js')).GpuMoisture(device, g);
  if (P.aeolian) P.aeolian.gpu = new (await import('../src/gpu/dust.js')).GpuDust(device, P.aeolian.dust);
}
const cycle = async () => { await c.solveAsync(1); P.afterClimate(); };
// The opening's closure: cycles until the climate has settled, CO₂ held at the baseline (each with
// a short fast step, so the regolith's opening layer follows the climate as it does in the page).
P.setOrbit(1000 * +orbitWin);
do { await cycle(); P.years += 10; P.fast(10, 1e9, 100); } while (!c.stats.settled);
// Weathering's reference on the settled climate at the baseline (its own waits for the landscape's
// first step, 250 kyr into the run at this pace).
P.carbon.wF0 = P.carbon.wF; P.carbon.wCO2 = +base;
if (mode === 'free') CARBON.FIXED = null;
const spun = performance.now();
// Summer (the three warmest months of the north) land temperature at 60–70° N.
const mph = Array.from({ length: 12 }, (_, m) => monthPhase(m)), north = [];
for (let i = 0; i < n; i++) { const la = c.lat[i] * 180 / Math.PI; if (la > 60 && la < 70) north.push(i); }
const summerN = () => {
  let s = 0, a = 0;
  for (const i of north) if (c.landMask[i]) { let t = 0; for (const m of [5, 6, 7]) t += c.surfaceT(i, mph[m]); s += g.area[i] * t / 3; a += g.area[i]; }
  return a > 0 ? s / a : NaN;
};
const rec = { t: [], vol: [], co2: [], dust: [], T: [], q65: [], tN: [], iron: [], bare: [], out: [], area: [], acc: [], abl: [] };
// The ice's surface balance, km³ of ice a year: snow kept (M > 0) and melt, over the ice.
const balance = () => {
  const I = P.ice; let acc = 0, abl = 0;
  for (let i = 0; i < n; i++) if (I.H[i] > 0) { const a = I.areaM[i] / 1e9; acc += Math.max(0, I.M[i] + I.melt[i]) * a; abl += I.melt[i] * a; }
  return [acc, abl];
};
let plateBank = 0, since = 0;
for (let k = 0; k < +kyr; k++) {
  P.years += 1000; plateBank += 1000;
  while (plateBank >= 5e5) { P.plateStep(5e5); plateBank -= 5e5; }
  P.setOrbit(1000 * +orbitWin);
  P.fast(1000, 1e9, 1e4);
  if ((since += 1000) >= 2000) { await cycle(); since = 0; }
  const a = P.aeolian ? P.aeolian.stats : { emission: 0, iron: 1 };
  rec.t.push(k); rec.vol.push(P.ice.stats.volume / 1e15); rec.co2.push(P.carbon.pco2); rec.dust.push(a.emission);
  rec.T.push(c.stats.meanT); rec.q65.push(P.orbit.summer65(P.years / 1000)); rec.tN.push(summerN()); rec.iron.push(a.iron || 1);
  rec.bare.push(P.life.stats.bare); rec.out.push(P.aeolian ? P.aeolian.stats.source : 0);
  const [acc, abl] = balance(); rec.area.push(P.ice.stats.area / 1e12); rec.acc.push(acc); rec.abl.push(abl);
  if (k % 100 === 99) console.error(`${k + 1} kyr: ice ${rec.vol[k].toFixed(2)} M km³, ${rec.co2[k].toFixed(0)} ppm, dust ${rec.dust[k].toFixed(0)} Tg/yr, ${rec.T[k].toFixed(2)} °C · ${((performance.now() - spun) / 1000).toFixed(0)} s`);
}

/** Remove a series' linear trend. */
function detrend(x) {
  const N = x.length, m = x.reduce((s, v) => s + v, 0) / N;
  let sx = 0, sxx = 0, sxy = 0;
  x.forEach((v, i) => { sx += i; sxx += i * i; sxy += i * (v - m); });
  const b = sxy / (sxx - sx * sx / N);
  return { y: x.map((v, i) => v - m - b * (i - sx / N)), mean: m, slope: b };
}
/** The dominant period (kyr) between 15 and 150 kyr and its share of the power there. */
function dominant(y) {
  let best = 0, bestP = 0, tot = 0;
  for (let p = 15; p <= 150; p++) {
    let cs = 0, sn = 0;
    y.forEach((v, i) => { cs += v * Math.cos(2 * Math.PI * i / p); sn += v * Math.sin(2 * Math.PI * i / p); });
    const pw = cs * cs + sn * sn; tot += pw;
    if (pw > best) { best = pw; bestP = p; }
  }
  return { period: bestP, share: best / tot };
}
const corr = (a, b) => { const n2 = a.length; let ma = 0, mb = 0; for (let i = 0; i < n2; i++) { ma += a[i]; mb += b[i]; } ma /= n2; mb /= n2; let sab = 0, saa = 0, sbb = 0; for (let i = 0; i < n2; i++) { sab += (a[i] - ma) * (b[i] - mb); saa += (a[i] - ma) ** 2; sbb += (b[i] - mb) ** 2; } return sab / Math.sqrt(saa * sbb || 1); };
const sd = y => Math.sqrt(y.reduce((s, v) => s + v * v, 0) / y.length);
/** The mean of x over the samples where the ice is in its top and bottom quintiles (glacial, interglacial). */
function swing(x, vol) {
  const idx = vol.map((v, i) => i).sort((a, b) => vol[a] - vol[b]), q = Math.max(1, Math.floor(idx.length / 5));
  const lo = idx.slice(0, q).reduce((s, i) => s + x[i], 0) / q, hi = idx.slice(-q).reduce((s, i) => s + x[i], 0) / q;
  return { glacial: hi, interglacial: lo };
}
const W = 200, rows = [];
for (let a = 200; a + W <= rec.vol.length; a += W) {
  const sl = k => rec[k].slice(a, a + W), v = detrend(sl('vol')), d = dominant(v.y);
  const co2 = swing(sl('co2'), v.y), dust = swing(sl('dust'), v.y), tN = detrend(sl('tN')), q = detrend(sl('q65'));
  const cmin = Math.min(...sl('co2')), cmax = Math.max(...sl('co2')), dmin = Math.min(...sl('dust')), dmax = Math.max(...sl('dust'));
  rows.push(`${a}–${a + W} kyr: ice ${v.mean.toFixed(2)} ± ${sd(v.y).toFixed(3)} M km³ (${(100 * sd(v.y) / v.mean).toFixed(2)}%), period ${d.period} kyr (${(100 * d.share).toFixed(0)}%); `
    + `CO₂ ${cmin.toFixed(0)}–${cmax.toFixed(0)} ppm, glacial ${co2.glacial.toFixed(1)} against ${co2.interglacial.toFixed(1)}; dust ${dmin.toFixed(0)}–${dmax.toFixed(0)} Tg/yr (×${(dmax / Math.max(1, dmin)).toFixed(2)}), glacial ${dust.glacial.toFixed(0)} against ${dust.interglacial.toFixed(0)}; `
    + `summer 60–70° N ±${sd(tN.y).toFixed(2)} K, r(T, Q65) ${corr(tN.y, q.y).toFixed(2)}, dT/dQ ${(sd(tN.y) / Math.max(1e-9, sd(q.y))).toFixed(3)} K per W/m², r(ice, Q65) ${corr(v.y, q.y).toFixed(2)}`);
}
console.log(`${seed}, level ${level}, ${device ? 'GPU' : 'CPU'}; ${process.env.OVERRIDES || ''} CO₂ ${mode} from ${base} ppm; the orbit through ${orbitWin} kyr; ${dustArg}; spin-up ${((spun - t0) / 1000).toFixed(0)} s, run ${((performance.now() - spun) / 1000).toFixed(0)} s\n  ` + rows.join('\n  '));
if (outFile) (await import('node:fs')).writeFileSync(outFile, JSON.stringify(rec));
process.exit(0);
