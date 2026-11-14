// The tide on the GPU (src/engine/tides.js is the reference and has the
// physics): the same C grid, forward–backward step and Heun rotation, one
// thread per cell or edge. A step is seven dispatches: the clock (the forcing's
// phase, whether the last cycle is being read), the cells' velocities rebuilt,
// the momentum's predictor, the velocities again, the corrector, continuity
// (and the harmonic read off it), and the edges' mean u². The state stays on
// the GPU between solves, so a re-solve after the coasts move starts from the
// last tide. Runs on the engine's device.
import { kernel, storage, uniform } from './device.js';
import { Tides, TIDES, EARTH } from '../engine/tides.js';

const HEAD = /* wgsl */`
struct Tu { dt: f32, Omega: f32, ga: f32, gb: f32, n: u32, ne: u32, N: u32, readFrom: u32, twoN: f32, oneN: f32, R: f32, pad: f32 };
struct Clock { next: u32, read: u32, k: u32, pad: u32, cw: f32, sw: f32, c1: f32, s1: f32 };
@group(0) @binding(0) var<uniform> U: Tu;
`;
const CLOCK = HEAD + /* wgsl */`
@group(0) @binding(1) var<storage, read_write> clock: Clock;
@compute @workgroup_size(1)
fn main() {
  let k = clock.next;
  clock.next = k + 1u;
  clock.k = k;
  clock.read = select(0u, 1u, k >= U.readFrom);
  // The phase within the cycle, exactly periodic (N steps a cycle).
  let p0 = 6.283185307 * f32(k % U.N) / f32(U.N);
  let p1 = 6.283185307 * f32((k + 1u) % U.N) / f32(U.N);
  clock.cw = cos(p0); clock.sw = sin(p0); clock.c1 = cos(p1); clock.s1 = sin(p1);
}`;
const PEROT = HEAD + /* wgsl */`
@group(0) @binding(1) var<storage, read> cE: array<u32>;
@group(0) @binding(2) var<storage, read> cW: array<f32>;
@group(0) @binding(3) var<storage, read> cT: array<vec4f>;
@group(0) @binding(4) var<storage, read> uIn: array<f32>;
@group(0) @binding(5) var<storage, read_write> vOut: array<vec4f>;
@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) id: vec3u) {
  let i = id.x;
  if (i >= U.n) { return; }
  var v = vec3f(0.0);
  for (var k = 0u; k < 6u; k++) {
    let q = 6u * i + k;
    v += cW[q] * uIn[cE[q]] * cT[q].xyz;
  }
  vOut[i] = vec4f(v, 0.0);
}`;
const EDGE = /* wgsl */`
@group(0) @binding(1) var<storage, read> E0: array<vec4f>;   // normal xyz, 1/(d R)
@group(0) @binding(2) var<storage, read> E1: array<vec4f>;   // midpoint xyz, drag r
@group(0) @binding(3) var<storage, read> E2: array<vec4f>;   // depth He, cells A and B (bits)
@group(0) @binding(6) var<storage, read> cell: array<vec4f>; // η, the forcing's shape (cos, sin)
@group(0) @binding(7) var<storage, read> clock: Clock;
fn cor(e: u32, i: u32, j: u32, vi: vec3f, vj: vec3f) -> f32 {
  let r = E1[e].xyz;
  return -2.0 * U.Omega * r.z * dot(cross(r, 0.5 * (vi + vj)), E0[e].xyz);
}
fn grav(e: u32, i: u32, j: u32) -> f32 {
  let ci = cell[i]; let cj = cell[j];
  let eqi = ci.y * clock.cw - ci.z * clock.sw;
  let eqj = cj.y * clock.cw - cj.z * clock.sw;
  return -(U.gb * (cj.x - ci.x) - U.ga * (eqj - eqi)) * E0[e].w;
}`;
const PRED = HEAD + EDGE + /* wgsl */`
@group(0) @binding(4) var<storage, read> u: array<f32>;
@group(0) @binding(5) var<storage, read_write> us: array<f32>;
@group(0) @binding(8) var<storage, read> v: array<vec4f>;
@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) id: vec3u) {
  let e = id.x;
  if (e >= U.ne) { return; }
  let g = E2[e];
  if (g.x <= 0.0) { us[e] = 0.0; return; }
  let i = bitcast<u32>(g.y); let j = bitcast<u32>(g.z);
  us[e] = (u[e] + U.dt * (grav(e, i, j) + cor(e, i, j, v[i].xyz, v[j].xyz))) / (1.0 + U.dt * E1[e].w);
}`;
const CORR = HEAD + EDGE + /* wgsl */`
@group(0) @binding(4) var<storage, read_write> u: array<f32>;
@group(0) @binding(5) var<storage, read> vs: array<vec4f>;
@group(0) @binding(8) var<storage, read> v: array<vec4f>;
@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) id: vec3u) {
  let e = id.x;
  if (e >= U.ne) { return; }
  let g = E2[e];
  if (g.x <= 0.0) { u[e] = 0.0; return; }
  let i = bitcast<u32>(g.y); let j = bitcast<u32>(g.z);
  let c = 0.5 * (cor(e, i, j, v[i].xyz, v[j].xyz) + cor(e, i, j, vs[i].xyz, vs[j].xyz));
  u[e] = (u[e] + U.dt * (grav(e, i, j) + c)) / (1.0 + U.dt * E1[e].w);
}`;
const CONT = HEAD + /* wgsl */`
@group(0) @binding(1) var<storage, read> cE: array<u32>;
@group(0) @binding(2) var<storage, read> cD: array<f32>;      // sign · ℓ / (A R)
@group(0) @binding(3) var<storage, read> E2: array<vec4f>;
@group(0) @binding(4) var<storage, read> u: array<f32>;
@group(0) @binding(5) var<storage, read_write> cell: array<vec4f>;
@group(0) @binding(6) var<storage, read_write> acc: array<vec2f>;
@group(0) @binding(7) var<storage, read> clock: Clock;
@group(0) @binding(8) var<storage, read> sea: array<f32>;
@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) id: vec3u) {
  let i = id.x;
  if (i >= U.n) { return; }
  let c = cell[i];
  if (sea[i] <= 0.0) { cell[i].x = 0.0; return; }
  var div = 0.0;
  for (var k = 0u; k < 6u; k++) {
    let q = 6u * i + k; let e = cE[q];
    div += cD[q] * E2[e].x * u[e];
  }
  let eta = c.x - U.dt * div;
  cell[i].x = eta;
  if (clock.read == 1u) { acc[i] += vec2f(eta * clock.c1, eta * clock.s1) * U.twoN; }
}`;
const ACC = HEAD + /* wgsl */`
@group(0) @binding(1) var<storage, read> u: array<f32>;
@group(0) @binding(2) var<storage, read_write> u2: array<f32>;
@group(0) @binding(3) var<storage, read> clock: Clock;
@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) id: vec3u) {
  let e = id.x;
  if (e >= U.ne || clock.read == 0u) { return; }
  u2[e] += u[e] * u[e] * U.oneN;
}`;

export class GpuTides {
  constructor(device, grid) {
    this.device = device;
    const cpu = this.cpu = new Tides(grid), M = cpu.mesh, n = M.n, ne = M.ne, R = EARTH.R;
    this.n = n; this.ne = ne;
    const { nbrOff } = grid;
    // Per cell, six edge slots (a pentagon's sixth is the dummy edge ne, always still).
    const cE = new Uint32Array(6 * n).fill(ne), cW = new Float32Array(6 * n), cD = new Float32Array(6 * n), cT = new Float32Array(24 * n);
    for (let i = 0; i < n; i++) for (let t = nbrOff[i], k = 0; t < nbrOff[i + 1]; t++, k++) {
      const q = 6 * i + k, s = M.cellSign[t];
      cE[q] = M.cellEdge[t]; cW[q] = s * M.pw[t]; cD[q] = s * M.len[M.cellEdge[t]] / (grid.area[i] * R);
      cT[4 * q] = M.tan[3 * t]; cT[4 * q + 1] = M.tan[3 * t + 1]; cT[4 * q + 2] = M.tan[3 * t + 2];
    }
    const E0 = new Float32Array(4 * (ne + 1));
    this.E1 = new Float32Array(4 * (ne + 1)); this.E2 = new Float32Array(4 * (ne + 1));
    const E2u = new Uint32Array(this.E2.buffer);
    for (let e = 0; e < ne; e++) {
      E0[4 * e] = M.nrm[3 * e]; E0[4 * e + 1] = M.nrm[3 * e + 1]; E0[4 * e + 2] = M.nrm[3 * e + 2]; E0[4 * e + 3] = 1 / (M.d[e] * R);
      this.E1[4 * e] = M.mid[3 * e]; this.E1[4 * e + 1] = M.mid[3 * e + 1]; this.E1[4 * e + 2] = M.mid[3 * e + 2];
      E2u[4 * e + 1] = M.A[e]; E2u[4 * e + 2] = M.B[e];
    }
    const cellH = new Float32Array(4 * n);
    for (let i = 0; i < n; i++) { cellH[4 * i + 1] = cpu.cosEq[i]; cellH[4 * i + 2] = cpu.sinEq[i]; }
    this.sea = new Float32Array(n);
    const B = (data, size) => storage(device, size ?? data.byteLength, data);
    this.b = {
      cE: B(cE), cW: B(cW), cD: B(cD), cT: B(cT), E0: B(E0), E1: B(this.E1), E2: B(this.E2),
      cell: B(cellH), sea: B(this.sea), u: B(null, 4 * (ne + 1)), us: B(null, 4 * (ne + 1)), v: B(null, 16 * n), vs: B(null, 16 * n),
      acc: B(null, 8 * n), u2: B(null, 4 * ne), clock: B(null, 32),
    };
    this.ub = new ArrayBuffer(48);
    this.U = uniform(device, this.ub);
    const K = { clock: kernel(device, CLOCK, 'tide clock'), perot: kernel(device, PEROT, 'tide perot'), pred: kernel(device, PRED, 'tide pred'), corr: kernel(device, CORR, 'tide corr'), cont: kernel(device, CONT, 'tide cont'), acc: kernel(device, ACC, 'tide acc') };
    const b = this.b, U = this.U;
    const edge = { U, E0: b.E0, E1: b.E1, E2: b.E2, cell: b.cell, clock: b.clock };
    this.list = [
      [K.clock, K.clock.bind({ U, clock: b.clock }), 1],
      [K.perot, K.perot.bind({ U, cE: b.cE, cW: b.cW, cT: b.cT, uIn: b.u, vOut: b.v }), Math.ceil(n / 64)],
      [K.pred, K.pred.bind({ ...edge, u: b.u, us: b.us, v: b.v }), Math.ceil(ne / 64)],
      [K.perot, K.perot.bind({ U, cE: b.cE, cW: b.cW, cT: b.cT, uIn: b.us, vOut: b.vs }), Math.ceil(n / 64)],
      [K.corr, K.corr.bind({ ...edge, u: b.u, vs: b.vs, v: b.v }), Math.ceil(ne / 64)],
      [K.cont, K.cont.bind({ U, cE: b.cE, cD: b.cD, E2: b.E2, u: b.u, cell: b.cell, acc: b.acc, clock: b.clock, sea: b.sea }), Math.ceil(n / 64)],
      [K.acc, K.acc.bind({ U, u: b.u, u2: b.u2, clock: b.clock }), Math.ceil(ne / 64)],
    ];
    this.readAcc = device.createBuffer({ size: 8 * n, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST });
    this.readU2 = device.createBuffer({ size: 4 * ne, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST });
    this.solved = false;
  }

  /** The sea: depth per cell in metres (≤ 0: land). */
  ocean(depth) {
    const cpu = this.cpu, ne = this.ne, n = this.n;
    cpu.ocean(depth);
    for (let e = 0; e < ne; e++) { this.E1[4 * e + 3] = cpu.r[e]; this.E2[4 * e] = cpu.He[e]; }
    for (let i = 0; i < n; i++) this.sea[i] = cpu.H[i] > 0 ? 1 : 0;
    const q = this.device.queue;
    q.writeBuffer(this.b.E1, 0, this.E1); q.writeBuffer(this.b.E2, 0, this.E2); q.writeBuffer(this.b.sea, 0, this.sea);
  }

  /** Run to periodic (cold: TIDES.CYCLES cycles; warm: TIDES.WARM) and read the harmonic. */
  async solve(omega, Omega, cycles = this.solved ? TIDES.WARM : TIDES.CYCLES) {
    const dev = this.device, cpu = this.cpu, M = cpu.mesh, T = TIDES, R = EARTH.R;
    let cmax = 0, dmin = Infinity;
    for (let e = 0; e < this.ne; e++) if (cpu.He[e] > 0) { cmax = Math.max(cmax, Math.sqrt(T.G * Math.max(cpu.H[M.A[e]], cpu.H[M.B[e]]))); dmin = Math.min(dmin, M.d[e] * R); }
    const period = 2 * Math.PI / omega, N = Math.ceil(period / (0.4 * dmin / Math.max(cmax, 1))), dt = period / N;
    const f = new Float32Array(this.ub), u32 = new Uint32Array(this.ub);
    f[0] = dt; f[1] = Omega; f[2] = T.G * T.ALPHA; f[3] = T.G * T.BETA;
    u32[4] = this.n; u32[5] = this.ne; u32[6] = N; u32[7] = (cycles - 1) * N;
    f[8] = 2 / N; f[9] = 1 / N; f[10] = R;
    const q = dev.queue;
    q.writeBuffer(this.U, 0, this.ub);
    q.writeBuffer(this.b.clock, 0, new Uint32Array(8));
    q.writeBuffer(this.b.acc, 0, new Float32Array(2 * this.n));
    q.writeBuffer(this.b.u2, 0, new Float32Array(this.ne));
    // A cycle per command buffer.
    for (let c = 0; c < cycles; c++) {
      const enc = dev.createCommandEncoder(), pass = enc.beginComputePass();
      for (let k = 0; k < N; k++) for (const [K, bg, x] of this.list) { pass.setPipeline(K.pipeline); pass.setBindGroup(0, bg); pass.dispatchWorkgroups(x); }
      pass.end();
      if (c === cycles - 1) { enc.copyBufferToBuffer(this.b.acc, 0, this.readAcc, 0, 8 * this.n); enc.copyBufferToBuffer(this.b.u2, 0, this.readU2, 0, 4 * this.ne); }
      q.submit([enc.finish()]);
      if (c < cycles - 1) await q.onSubmittedWorkDone();   // let the frame's other work in between cycles
    }
    await Promise.all([this.readAcc.mapAsync(GPUMapMode.READ), this.readU2.mapAsync(GPUMapMode.READ)]);
    const acc = new Float32Array(this.readAcc.getMappedRange().slice(0)), u2 = new Float32Array(this.readU2.getMappedRange().slice(0));
    this.readAcc.unmap(); this.readU2.unmap();
    const C = new Float64Array(this.n), S = new Float64Array(this.n);
    for (let i = 0; i < this.n; i++) { C[i] = acc[2 * i]; S[i] = acc[2 * i + 1]; }
    this.solved = true;
    return cpu.harvest(C, S, Float64Array.from(u2));
  }
}
