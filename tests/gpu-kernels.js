// The weather's GPU kernels, on the device (open tests/gpu.html; WebGPU only).
//   multigrid    V-cycles reduce the error of both inversions geometrically
//   conservation the PV's integral holds over many steps; nothing blows up
//   Phillips     storms grow above Phillips' criterion and die below it
//   timing       GPU time per step at the drawn mesh's level (7; ?l6 for 6 too)
import { buildGrid } from '../src/grid/icosphere.js';
import { gpuDevice } from '../src/gpu/device.js';
import { GpuWeather, WEATHER } from '../src/gpu/weather.js';
import { A_M } from '../src/gpu/hierarchy.js';

const out = document.getElementById('out');
const results = window.__results = { done: false, tests: [] };
const log = (name, ok, detail) => {
  results.tests.push({ name, ok, detail });
  out.innerHTML = results.tests.map(t => `<span class="${t.ok ? 'ok' : 'fail'}">${t.ok ? 'ok  ' : 'FAIL'}</span> ${t.name} · ${t.detail}`).join('\n') + (results.done ? '' : '\n…');
};

async function readBuf(device, buf, offset, size) {
  const rb = device.createBuffer({ size, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST });
  const enc = device.createCommandEncoder();
  enc.copyBufferToBuffer(buf, offset, rb, 0, size);
  device.queue.submit([enc.finish()]);
  await rb.mapAsync(GPUMapMode.READ);
  const a = new Float32Array(rb.getMappedRange().slice(0));
  rb.unmap(); rb.destroy();
  return a;
}

function run(device, list, times = 1) {
  const enc = device.createCommandEncoder(), pass = enc.beginComputePass();
  for (let r = 0; r < times; r++) for (const [K, bg, x] of list) { pass.setPipeline(K.pipeline); pass.setBindGroup(0, bg); pass.dispatchWorkgroups(x); }
  pass.end();
  device.queue.submit([enc.finish()]);
}

/** A planet with no land, the climate's temperature by latitude. */
function forcing(g) {
  const f4 = new Float32Array(4 * g.n);
  let s = 0, A = 0;
  for (let i = 0; i < g.n; i++) {
    const z = g.pos[3 * i + 2], T = 30 - 45 * z * z;
    f4[4 * i] = T; f4[4 * i + 1] = T; f4[4 * i + 2] = 0; f4[4 * i + 3] = 0;
    s += T * g.area[i]; A += g.area[i];
  }
  return { f4, tmean: s / A };
}

async function multigrid(device) {
  const g = buildGrid(6), w = new GpuWeather(device, g), n = g.n;
  // A smooth field with structure at many scales, and its right-hand side by the same operator (f64).
  const xs = new Float64Array(2 * n), b = new Float32Array(2 * n);
  for (let i = 0; i < n; i++) {
    const x = g.pos[3 * i], y = g.pos[3 * i + 1], z = g.pos[3 * i + 2];
    xs[2 * i] = 1e7 * (x * y + Math.sin(7 * x + 3 * z) + 0.3 * Math.cos(23 * y - 11 * z));
    xs[2 * i + 1] = 1e7 * (z * z * x + Math.cos(13 * x * y) + 0.2 * Math.sin(31 * z + 5 * x));
  }
  for (let i = 0; i < n; i++) {
    for (let c = 0; c < 2; c++) {
      let s = 0;
      for (let t = g.nbrOff[i], e = g.nbrOff[i + 1]; t < e; t++) s += Math.fround(g.ell[t] / g.dist[t]) * (xs[2 * i + c] - xs[2 * g.nbr[t] + c]);
      b[2 * i + c] = s + g.area[i] * A_M * A_M * w.k2[c] * xs[2 * i + c];
    }
  }
  device.queue.writeBuffer(w.Bv, 8 * w.off, b);
  device.queue.writeBuffer(w.X, 8 * w.off, new Float32Array(2 * n));
  const errs = [];
  for (let k = 0; k < 6; k++) {
    run(device, w.cycle);
    const X = await readBuf(device, w.X, 8 * w.off, 8 * n);
    const e = [0, 0], m = [0, 0];
    for (let i = 0; i < n; i++) for (let c = 0; c < 2; c++) { e[c] += (X[2 * i + c] - xs[2 * i + c]) ** 2; m[c] += xs[2 * i + c] ** 2; }
    errs.push([Math.sqrt(e[0] / m[0]), Math.sqrt(e[1] / m[1])]);
  }
  const rate = c => (errs[4][c] / errs[1][c]) ** (1 / 3);
  const ok = errs[1][0] < 0.1 && errs[1][1] < 0.1 && rate(0) < 0.4 && rate(1) < 0.4 && errs[5][0] < 1e-3;
  log('multigrid', ok, `relative error by cycle: ${errs.map(e => `${e[0].toExponential(1)}/${e[1].toExponential(1)}`).join(', ')} · rate ${rate(0).toFixed(2)}/${rate(1).toFixed(2)}`);
}

function eddyEnergy(g, lat, psi2) {
  const nb = 36, sum = new Float64Array(nb), cnt = new Float64Array(nb), band = i => Math.min(nb - 1, Math.floor((lat[i] + Math.PI / 2) / Math.PI * nb));
  for (let i = 0; i < g.n; i++) { sum[band(i)] += psi2[i]; cnt[band(i)]++; }
  let e = 0;
  for (let i = 0; i < g.n; i++) if (Math.abs(lat[i]) > 0.5 && Math.abs(lat[i]) < 1.2) e += (psi2[i] - sum[band(i)] / cnt[band(i)]) ** 2;
  return e / g.n;
}

async function phillips(device) {
  const g = buildGrid(5), { f4, tmean } = forcing(g);
  const energy = async shear => {
    const base = WEATHER.SHEAR;
    WEATHER.SHEAR = shear;
    const w = new GpuWeather(device, g, 'phillips');
    w.setForcing(f4, tmean);
    w.start();
    for (let s = 0; s < 25 * 86400 / w.dt; s += 100) w.advance(100);
    const r = await w.read();
    WEATHER.SHEAR = base;
    return { e: eddyEnergy(g, w.lat, r.psi2), finite: r.psi2.every(Number.isFinite) };
  };
  const strong = await energy(2.2e6), weak = await energy(1.5e5);
  log("Phillips' criterion", strong.finite && weak.finite && strong.e > 30 * weak.e, `eddy energy ${strong.e.toExponential(2)} against ${weak.e.toExponential(2)} (${(strong.e / weak.e).toFixed(0)}×)`);
}

async function conservation(device) {
  const g = buildGrid(6), { f4, tmean } = forcing(g), w = new GpuWeather(device, g, 'conserve');
  w.setForcing(f4, tmean);
  w.start();
  const total = async () => {
    const S = await readBuf(device, w.S[w.cur], 0, 32 * g.n);
    let q = 0, qa = 0, bad = 0;
    for (let i = 0; i < g.n; i++) {
      const f = 2 * 7.292e-5 * g.pos[3 * i + 2], v = S[8 * i] + S[8 * i + 1] - 2 * f;
      if (!Number.isFinite(v)) bad++;
      q += g.area[i] * v; qa += g.area[i] * Math.abs(v);
    }
    return { q, qa, bad };
  };
  const a = await total();
  for (let s = 0; s < 10 * 86400 / w.dt; s += 120) w.advance(120);   // 10 days
  const b = await total();
  const r = await w.read();
  let wind = 0;
  for (let i = 0; i < g.n; i++) {
    let gx = 0, gy = 0, gz = 0;
    for (let t = g.nbrOff[i], e = g.nbrOff[i + 1]; t < e; t++) { const d = r.psi2[g.nbr[t]] - r.psi2[i]; gx += d * g.gw[3 * t]; gy += d * g.gw[3 * t + 1]; gz += d * g.gw[3 * t + 2]; }
    wind = Math.max(wind, Math.hypot(gx, gy, gz) / A_M);
  }
  const drift = Math.abs(b.q - a.q) / Math.max(a.qa, b.qa);
  log('conservation', b.bad === 0 && drift < 1e-4 && wind < 150, `relative PV drift ${drift.toExponential(1)} over 10 days · lower-layer wind to ${wind.toFixed(0)} m/s`);
}

async function timing(device, level) {
  const g = buildGrid(level), { f4, tmean } = forcing(g), w = new GpuWeather(device, g, 'timing');
  w.setForcing(f4, tmean);
  w.start();
  await device.queue.onSubmittedWorkDone();
  const t0 = performance.now();
  for (let k = 0; k < 10; k++) w.advance(30);
  await device.queue.onSubmittedWorkDone();
  const wall = (performance.now() - t0) / 300;
  await new Promise(r => setTimeout(r, 50));
  log(`timing, level ${level}`, true, `${wall.toFixed(3)} ms a step by the wall, ${w.msPerStep.toFixed(3)} ms by timestamps · ${w.steps[0].length} dispatches a step · ${(86400 / w.dt).toFixed(0)} steps a model day · ${(86400 / w.dt * wall).toFixed(0)} ms a model day`);
}

(async () => {
  try {
    const device = await gpuDevice();
    device.addEventListener('uncapturederror', e => log('device error', false, e.error.message));
    await multigrid(device);
    await conservation(device);
    await phillips(device);
    await timing(device, 7);
    if (new URLSearchParams(location.search).has('l6')) await timing(device, 6);
  } catch (e) {
    log('exception', false, e.stack || String(e));
  }
  results.done = true;
  log('done', results.tests.every(t => t.ok), `${results.tests.filter(t => t.ok).length} of ${results.tests.length} passed`);
})();
