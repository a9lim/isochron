// What the engine's plate step costs, by part, headless: the plates' step
// (the per-cell pass, boundary relaxation, sampling, the sea, the torque
// balance, the rare events), the landscape, the drawn surface and the lines,
// as the engine's worker runs them (src/engine/worker.js).
// usage: node tools/engine-cost.mjs [level] [steps] [dt Myr] [seed] [gpu]
//   gpu: step the plates on the GPU (src/gpu/plates.js; needs tests/node_modules)
import { Planet } from '../src/engine/planet.js';
import { surfaceFields } from '../src/render/surface.js';
import { traceBoundaries } from '../src/render/lines.js';

const level = +(process.argv[2] || 7), steps = +(process.argv[3] || 20), dt = +(process.argv[4] || 0.1);
const seed = process.argv[5] || 'earthlike', useGpu = process.argv[6] === 'gpu';
let t0 = performance.now();
const P = new Planet(seed, { level });
console.log(`level ${level} (${P.grid.n} cells), boot ${(performance.now() - t0).toFixed(0)} ms`);
const tec = P.tec, T = {};
let surfaceGpu = null;
if (useGpu) {
  await import('../tests/webgpu-node.mjs');
  const { gpuDevice } = await import('../src/gpu/device.js');
  const { GpuPlates } = await import('../src/gpu/plates.js');
  const { GpuSurface } = await import('../src/gpu/surface.js');
  const device = await gpuDevice();
  tec.gpu = new GpuPlates(device, tec);
  surfaceGpu = new GpuSurface(device, P.grid);
}
const wrap = (obj, name, key = name) => {
  const f = obj[name].bind(obj);
  obj[name] = (...a) => { const t = performance.now(); const r = f(...a); T[key] = (T[key] || 0) + performance.now() - t; return r; };
};
for (const m of ['relaxBoundaries', 'kinematics', 'updateElevation', 'exchangeWater', 'balance', 'mergeWelded', 'maybeRift', 'maybeInitiate']) wrap(tec, m);
const lap = async (k, f) => { const t = performance.now(); const r = await f(); T[k] = (T[k] || 0) + performance.now() - t; return r; };
// Warm up (JIT, and the step's first allocations).
for (let s = 0; s < 3; s++) await stepOnce();
for (const k in T) delete T[k];
if (tec.gpu) tec.gpu.prof = null;
async function stepOnce() {
  await lap('plateStep', () => P.plateStepAsync(dt * 1e6));
  await lap('landscape', () => { if (P.landBank >= 2.5e5) { P.land.step(P.landBank); P.landBank = 0; } });
  const f = await lap('surface', () => surfaceGpu ? surfaceGpu.fields(tec, P.land, P.ice) : surfaceFields(P.grid, tec, P.land, P.ice));
  await lap('lines', () => traceBoundaries(tec));
  return f;
}
// The landscape steps every 0.25 Myr; count it apart.
P.landBank = -1e12;
for (let s = 0; s < steps; s++) await stepOnce();
const per = k => (T[k] || 0) / steps;
const parts = ['relaxBoundaries', 'kinematics', 'updateElevation', 'exchangeWater', 'balance', 'mergeWelded', 'maybeRift', 'maybeInitiate'];
const inside = parts.reduce((s, k) => s + per(k), 0);
console.log(`per plate step (${dt} Myr), ms:`);
console.log(`  plateStep   ${per('plateStep').toFixed(1)}  (the per-cell pass, sampling, decays, plumes, Moon: ${(per('plateStep') - inside).toFixed(1)})`);
for (const k of parts) console.log(`    ${k.padEnd(16)} ${per(k).toFixed(2)}`);
if (tec.gpu) { const g = tec.gpu.prof; console.log(`    on the GPU: up ${(g.up / g.steps).toFixed(2)}, waiting ${(g.wait / g.steps).toFixed(2)}, down ${(g.down / g.steps).toFixed(2)}`); }
console.log(`  surface     ${per('surface').toFixed(1)}`);
console.log(`  lines       ${per('lines').toFixed(1)}`);
P.landBank = 2.5e5;
const tl = performance.now();
for (let s = 0; s < 3; s++) { P.land.step(2.5e5); }
console.log(`  landscape   ${((performance.now() - tl) / 3).toFixed(1)} per 0.25 Myr step`);
const st = tec.stats();
console.log(`t ${tec.t.toFixed(2)} Myr, plates ${st.plates}, land ${(100 * st.land).toFixed(1)}%, sea ${(1000 * tec.seaLevel).toFixed(0)} m`);
