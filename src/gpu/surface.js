// The drawn surface on the GPU (src/render/surface.js is the reference, and
// says what each field draws): relief eased toward its neighbours and the deep
// sea eased twice more, normals from its gradient, formation times eased along
// each plate's own seafloor, and lakes as a smoothed signed depth. The engine's
// worker prepares a surface after each batch of plate steps; here that's ten
// dispatches and one read back, from the engine's arrays as they stand (so it
// doesn't care which of the CPU or the GPU last stepped them). Every pass reads
// the last pass's field whole (the reference's passes do too), so the two agree
// to rounding.
import { kernel, storage } from './device.js';
import { gridBuffers } from './plates.js';

const HEAD = /* wgsl */`
const NONE: u32 = 0xffffffffu;
struct Uni { n: u32, pad: u32, sea: f32, kLand: f32 };
@group(0) @binding(0) var<uniform> U: Uni;
@group(0) @binding(1) var<storage, read> geo: array<vec4f>;
fn nb(i: u32, k: u32) -> u32 { return bitcast<u32>(geo[7u * i + 1u + k].w); }
`;
const MAIN = '@compute @workgroup_size(64)\nfn main(@builtin(global_invocation_id) id: vec3u) {\n  let i = id.x;\n  if (i >= U.n) { return; }\n';
const K = {
  ease: `
@group(0) @binding(2) var<storage, read> elev: array<f32>;
@group(0) @binding(3) var<storage, read_write> fout: array<f32>;
${MAIN}
  var s = 0.0;
  var d = 0.0;
  for (var k = 0u; k < 6u; k++) { let j = nb(i, k); if (j == NONE) { break; } s += elev[j]; d += 1.0; }
  fout[i] = 0.5 * elev[i] + 0.5 * s / d - U.sea;
}`,
  deep: `
@group(0) @binding(2) var<storage, read> fin: array<f32>;
@group(0) @binding(3) var<storage, read_write> fout: array<f32>;
${MAIN}
  let v = fin[i];
  fout[i] = v;
  if (v > -0.4) { return; }
  var s = 0.0;
  var d = 0.0;
  for (var k = 0u; k < 6u; k++) {
    let j = nb(i, k);
    if (j == NONE) { break; }
    let w = fin[j];
    if (w > -0.4) { return; }
    s += w; d += 1.0;
  }
  fout[i] = 0.4 * v + 0.6 * s / d;
}`,
  normals: `
@group(0) @binding(2) var<storage, read> egw: array<vec4f>;
@group(0) @binding(3) var<storage, read> fin: array<f32>;
@group(0) @binding(4) var<storage, read_write> nrm: array<f32>;
${MAIN}
  let v = fin[i];
  var g = vec3f(0.0);
  for (var k = 0u; k < 6u; k++) { let j = nb(i, k); if (j == NONE) { break; } g += (fin[j] - v) * egw[6u * i + k].xyz; }
  // Land relief at full exaggeration; the sea floor at a third.
  let kk = select(U.kLand, U.kLand / 3.0, v < 0.0);
  let p = normalize(geo[7u * i].xyz - kk * g);
  nrm[3u * i] = p.x; nrm[3u * i + 1u] = p.y; nrm[3u * i + 2u] = p.z;
}`,
  stripes: `
@group(0) @binding(2) var<storage, read> fin: array<f32>;
@group(0) @binding(3) var<storage, read> phi: array<f32>;
@group(0) @binding(4) var<storage, read> owner: array<u32>;
@group(0) @binding(5) var<storage, read_write> fout: array<f32>;
${MAIN}
  fout[i] = fin[i];
  if (phi[i] >= 0.5) { return; }
  var s = 0.0;
  var c = 0.0;
  for (var k = 0u; k < 6u; k++) {
    let j = nb(i, k);
    if (j == NONE) { break; }
    if (owner[j] != owner[i] || phi[j] >= 0.5) { continue; }
    s += fin[j]; c += 1.0;
  }
  if (c > 0.0) { fout[i] = 0.5 * fin[i] + 0.5 * s / c; }
}`,
  lakeInit: `
@group(0) @binding(2) var<storage, read> lake: array<vec4f>;
@group(0) @binding(3) var<storage, read> rel: array<f32>;
@group(0) @binding(4) var<storage, read_write> fout: array<f32>;
${MAIN}
  // (depth, discharge, ice thickness, area in m²): water only where the inflow beats ~1 m/yr of evaporation.
  let L = lake[i];
  var d = 0.0;
  if (L.x > 0.0 && !(L.z > 20.0)) { d = L.x * min(1.0, L.y * 3.156e7 / L.w); }
  if (!(d > 0.03)) { d = select(0.0, -0.05, rel[i] > 0.0); }
  fout[i] = d;
}`,
  lakeMate: `
@group(0) @binding(2) var<storage, read> fin: array<f32>;
@group(0) @binding(3) var<storage, read_write> fout: array<f32>;
${MAIN}
  let v = fin[i];
  fout[i] = v;
  if (!(v > 0.0)) { return; }
  for (var k = 0u; k < 6u; k++) { let j = nb(i, k); if (j == NONE) { break; } if (fin[j] > 0.0) { return; } }
  fout[i] = -0.05;
}`,
  lakeEase: `
@group(0) @binding(2) var<storage, read> fin: array<f32>;
@group(0) @binding(3) var<storage, read> rel: array<f32>;
@group(0) @binding(4) var<storage, read_write> fout: array<f32>;
${MAIN}
  fout[i] = fin[i];
  if (rel[i] <= 0.0) { return; }
  var s = 0.0;
  var d = 0.0;
  for (var k = 0u; k < 6u; k++) { let j = nb(i, k); if (j == NONE) { break; } s += select(-0.05, fin[j], rel[j] > 0.0); d += 1.0; }
  fout[i] = 0.4 * fin[i] + 0.6 * s / d;
}`,
};

const RELIEF = 20, R_KM = 6371, R_M = 6.371e6;

export class GpuSurface {
  constructor(device, grid) {
    const n = this.n = grid.n;
    this.device = device; this.grid = grid;
    const G = gridBuffers(device, grid), S = b => storage(device, b);
    const b = this.b = { geo: G.geo, egw: G.egw, elev: S(4 * n), phi: S(4 * n), owner: S(4 * n), lake: S(16 * n),
      rA: S(4 * n), rB: S(4 * n), tA: S(4 * n), tB: S(4 * n), lA: S(4 * n), lB: S(4 * n), nrm: S(12 * n) };
    this.U = device.createBuffer({ size: 16, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    const k = name => kernel(device, HEAD + K[name], 'surface.' + name);
    const kk = Object.fromEntries(Object.keys(K).map(name => [name, k(name)]));
    const g = (name, res) => ({ pipeline: kk[name].pipeline, group: kk[name].bind({ U: this.U, ...(name === 'lakeInit' ? {} : { geo: b.geo }), ...res }) });
    // The passes in order; tf goes up into tA, the relief ends in rA, the stripes in tA, the lakes in lA.
    this.passes = [
      g('ease', { elev: b.elev, fout: b.rA }),
      g('deep', { fin: b.rA, fout: b.rB }), g('deep', { fin: b.rB, fout: b.rA }),
      g('normals', { egw: b.egw, fin: b.rA, nrm: b.nrm }),
      g('stripes', { fin: b.tA, phi: b.phi, owner: b.owner, fout: b.tB }), g('stripes', { fin: b.tB, phi: b.phi, owner: b.owner, fout: b.tA }),
      g('lakeInit', { lake: b.lake, rel: b.rA, fout: b.lA }),
      g('lakeMate', { fin: b.lA, fout: b.lB }),
      g('lakeEase', { fin: b.lB, rel: b.rA, fout: b.lA }), g('lakeEase', { fin: b.lA, rel: b.rA, fout: b.lB }),
    ];
    this.staging = device.createBuffer({ size: 24 * n, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST });
    this.lakeBuf = new Float32Array(4 * n); this.ownerBuf = new Uint32Array(n);
    this.areaM2 = Float32Array.from(grid.area, a => a * R_M * R_M);
  }

  /** surfaceFields (src/render/surface.js) for the engine's current state, on the GPU. */
  async fields(tec, land, ice) {
    const n = this.n, dev = this.device, q = dev.queue, b = this.b;
    q.writeBuffer(b.elev, 0, tec.elev instanceof Float32Array ? tec.elev : Float32Array.from(tec.elev));
    q.writeBuffer(b.tA, 0, tec.tf); q.writeBuffer(b.phi, 0, tec.phi);
    const o = this.ownerBuf, L = this.lakeBuf, A = this.areaM2;
    for (let i = 0; i < n; i++) { o[i] = tec.owner[i]; L[4 * i] = land.lake[i]; L[4 * i + 1] = land.discharge[i]; L[4 * i + 2] = ice.H[i]; L[4 * i + 3] = A[i]; }
    q.writeBuffer(b.owner, 0, o); q.writeBuffer(b.lake, 0, L);
    const u = new ArrayBuffer(16);
    new Uint32Array(u)[0] = n; new Float32Array(u).set([tec.seaLevel, RELIEF / R_KM], 2);
    q.writeBuffer(this.U, 0, u);
    const enc = dev.createCommandEncoder(), pass = enc.beginComputePass(), x = Math.ceil(n / 64);
    for (const p of this.passes) { pass.setPipeline(p.pipeline); pass.setBindGroup(0, p.group); pass.dispatchWorkgroups(x); }
    pass.end();
    const st = this.staging;
    enc.copyBufferToBuffer(b.rA, 0, st, 0, 4 * n);
    enc.copyBufferToBuffer(b.nrm, 0, st, 4 * n, 12 * n);
    enc.copyBufferToBuffer(b.tA, 0, st, 16 * n, 4 * n);
    enc.copyBufferToBuffer(b.lB, 0, st, 20 * n, 4 * n);
    q.submit([enc.finish()]);
    await st.mapAsync(GPUMapMode.READ);
    const m = st.getMappedRange();
    const f = {
      elevRel: new Float32Array(m, 0, n).slice(), normals: new Float32Array(m, 4 * n, 3 * n).slice(),
      tfDraw: new Float32Array(m, 16 * n, n).slice(), lakeDraw: new Float32Array(m, 20 * n, n).slice(), felsic: Float32Array.from(tec.phi),
    };
    st.unmap();
    return f;
  }
}
