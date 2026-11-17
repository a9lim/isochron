// What the engine's plate step costs, by part, headless: the plates' step
// (the per-cell pass, boundary relaxation, sampling, the sea, the torque
// balance, the rare events), the landscape, the drawn surface and the lines,
// as the engine's worker runs them (src/engine/worker.js); then the landscape's
// step by part, the lakes' rebuild, and the rivers' retrace.
// usage: node tools/engine-cost.mjs [level] [steps] [dt Myr] [seed] [gpu]
//   gpu: the plates, the surface and the crust's flexure on the GPU (src/gpu/;
//   needs tests/node_modules)
import { Planet } from '../src/engine/planet.js';
import { surfaceFields } from '../src/render/surface.js';
import { traceBoundaries } from '../src/render/lines.js';
import { traceRivers, drainage, RIVER_MIN } from '../src/render/rivers.js';
import { route } from '../src/engine/landscape.js';

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
  const { GpuFlexure } = await import('../src/gpu/flexure.js');
  if (P.crustFlex) P.crustFlex.useSolver(new GpuFlexure(device, P.grid, { have: P.ice.flex.levels.map(l => l.g) }));
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
  const f = await lap('surface', () => surfaceGpu ? surfaceGpu.fields(tec, P.lakes) : surfaceFields(P.grid, tec, P.land, P.ice, P.lakes));
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
// The landscape's step by part, at 0.25 and 0.5 Myr (the dial's top steps 0.5 Myr).
const land = P.land, L = {};
const time = async (k, f) => { const t = performance.now(); const r = await f(); L[k] = (L[k] || 0) + performance.now() - t; return r; };
for (const m of ['reroute', 'cut']) { const f = land[m].bind(land); land[m] = (...a) => { const t = performance.now(); const r = f(...a); L[m] = (L[m] || 0) + performance.now() - t; return r; }; }
const reps = 4;
for (const ldt of [2.5e5, 5e5]) {
  for (let s = 0; s < reps + 1; s++) {
    if (s <= 1) for (const k in L) delete L[k];
    await time('step', async () => {
      await time('erode', () => land.erode(ldt));
      await time('diffuse', () => land.diffuse(ldt));
      await time('settle', () => land.settle());
    });
  }
  const per = k => (L[k] || 0) / reps;
  console.log(`  landscape   ${per('step').toFixed(1)} per ${ldt / 1e6} Myr step: routing ${per('reroute').toFixed(1)}, stream power ${per('cut').toFixed(1)}, sediment and the coast ${(per('erode') - per('reroute') - per('cut')).toFixed(1)}, diffusion ${per('diffuse').toFixed(1)} (${land.plan(ldt).sub} substeps), elevation and the sea ${per('settle').toFixed(1)}`);
}
for (const k in L) delete L[k];
for (let s = 0; s < reps; s++) {
  await time('lakes rebuild', () => P.rebuildLakes());
  await time('  their routing', () => route(P.grid, P.lakes.zr, P.lakes.baseR, P.lakes.routeR));
  const rt = await time('rivers: drainage', () => drainage(P.grid, land, P.lakes));
  const q12 = await time('rivers: monthly', () => land.monthly(P.climate.runoffM, rt));
  const f = surfaceFields(P.grid, tec, land, P.ice);
  await time('rivers: trace', () => traceRivers(P.grid, land, f.elevRel, q12, RIVER_MIN, rt));
}
for (const k in L) console.log(`  ${k.padEnd(30)} ${(L[k] / reps).toFixed(1)}`);
const st = tec.stats();
console.log(`t ${tec.t.toFixed(2)} Myr, plates ${st.plates}, land ${(100 * st.land).toFixed(1)}%, sea ${(1000 * tec.seaLevel).toFixed(0)} m`);
