// The dust on a seeded planet (src/engine/aeolian.js): emission, lifetime, where it lands, the
// snow's darkening, the iron to the cold sea, and the loess, cycle by cycle from the opening
// (the climate settles within them: `settled` marks the cycle, where the sea and iron's reference settle).
// With WebGPU in node (tests/webgpu-node.mjs; `cd tests && npm install`), the moisture and
// the dust are solved on the GPU as the page's engine solves them; else on the CPU.
//
//   node tools/dust-check.mjs [seed] [level] [cycles] [cpu]
import { Planet } from '../src/engine/planet.js';

const [seed = 'earthlike', level = '7', cycles = '8', cpu] = process.argv.slice(2);
let device = null;
if (cpu !== 'cpu') {
  const { hasGPU } = await import('../tests/webgpu-node.mjs');
  if (hasGPU) device = await (await import('../src/gpu/device.js')).gpuDevice();
}
const t0 = performance.now();
const P = new Planet(seed, { level: +level });
const tBoot = performance.now() - t0;
const c = P.climate, a = P.aeolian, g = P.grid, n = g.n, R2 = 6.371e6 ** 2;
if (device) {
  const { GpuMoisture } = await import('../src/gpu/moisture.js');
  const { GpuDust } = await import('../src/gpu/dust.js');
  c.gpu = new GpuMoisture(device, P.grid);
  a.gpu = new GpuDust(device, a.dust);
}
console.log(`${seed}, level ${level}, ${device ? 'GPU' : 'CPU'}; boot ${(tBoot / 1000).toFixed(1)} s; C = ${a.dust.P.C.toExponential(2)}`);
for (let k = 0; k < +cycles; k++) {
  const ts = performance.now();
  await c.solveAsync(1);
  const tc = performance.now() - ts;
  P.afterClimate();
  P.years += 10; P.fast(10, 1e9, 100);          // the regolith's update (its opening waits for the third cycle)
  const s = a.stats;
  console.log(`cycle ${k + 1}${c.stats.settled === k + 1 ? ' settled' : ''} ${tc.toFixed(0)} ms: ${c.stats.meanT.toFixed(2)} °C, ${Math.round(P.carbon.pco2)} ppm; dust ${s.emission.toFixed(0)} Tg/yr (deposited ${s.deposition.toFixed(0)}), ${s.lifetime.toFixed(2)} d, wet ${(100 * (s.wet || 0) / Math.max(1e-9, s.deposition)).toFixed(0)}%; τ ${s.tau.toFixed(4)}, ${s.forcing.toFixed(3)} W/m²; on land ${s.land.toFixed(0)}, sea ${s.sea.toFixed(0)}, ice ${s.ice.toFixed(1)}; sources ${s.source.toFixed(1)} M km², gust ${s.gust.toFixed(2)} m/s; iron ×${(s.iron || 1).toFixed(3)}`);
}
// Where the sources are and what they are.
const o = a.dust.out, L = c.landMask;
let bare = 0, salt = 0, out = 0, eAll = 0;
for (let i = 0; i < n; i++) {
  const m = g.area[i] * R2 * o.emitAnn[i];
  eAll += m;
  if (P.lakes.salt[i] > 0.01) salt += m; else if (a.outRate[i] > 0.01) out += m; else bare += m;
}
console.log(`emission from cells with salt flats ${(100 * salt / eAll).toFixed(1)}%, with outwash ${(100 * out / eAll).toFixed(1)}%, the rest ${(100 * bare / eAll).toFixed(1)}%`);
// Snow's darkening and dust in snow.
let cs = 0, ca = 0, cmax = 0;
for (let i = 0; i < n; i++) if (c.snowAnn[i] > 0.3 || P.ice.H[i] > 10) { const A = g.area[i]; cs += A * a.conc[i]; ca += A; cmax = Math.max(cmax, a.conc[i]); }
console.log(`dust in snow: mean ${(1e6 * cs / Math.max(ca, 1e-30)).toFixed(1)} ppm, most ${(1e6 * cmax).toFixed(0)} ppm; ice sheets' darkening ${a.stats.dark.toFixed(4)}; soluble iron to the sea ${(a.ironFlux / 1e9).toFixed(2)} Gmol/yr`);
console.log(`loess and the sea's dust moved ${a.stats.loess.toFixed(0)} Tg/yr; regolith on land ${P.regolith.stats.mean.toFixed(2)} m, bare ${(100 * P.regolith.stats.bare).toFixed(1)}%`);
// By latitude, at sea.
const bands = new Float64Array(6), seaB = new Float64Array(6);
for (let i = 0; i < n; i++) { const b = Math.min(5, Math.floor((c.lat[i] + Math.PI / 2) / Math.PI * 6)), m = g.area[i] * R2 * o.depAnn[i]; bands[b] += m; if (!L[i]) seaB[b] += m; }
const tot = bands.reduce((x, y) => x + y, 0);
console.log(`deposition by 30° band (S→N): ${Array.from(bands, x => (100 * x / tot).toFixed(1) + '%').join(' ')}; at sea ${Array.from(seaB, x => (100 * x / tot).toFixed(1) + '%').join(' ')}`);
process.exit(0);
