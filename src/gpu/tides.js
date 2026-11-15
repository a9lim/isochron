// The tide on the GPU (src/engine/tides.js is the reference and has the
// physics): the same C grid, forward–backward step, Heun rotation and
// energy-neutral Coriolis stencil, one thread per cell or edge. A step is five
// dispatches: the clock (the forcing's phase, whether the last cycle is being
// read), the momentum's predictor (which keeps its Coriolis for the corrector),
// the corrector (reading only the predictor's velocities, so no edge reads one
// being written), continuity (and the harmonic read off it), and the edges'
// mean u². The state stays on the GPU between solves, so a re-solve after the
// coasts move starts from the last tide. Runs on the engine's device.
import { kernel, storage, uniform } from './device.js';
import { Tides, TIDES, EARTH } from '../engine/tides.js';

const SLOTS = 10;   // the Coriolis stencil: the other edges of an edge's two cells (5 + 5 on hexagons)
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
const EDGE = /* wgsl */`
@group(0) @binding(1) var<storage, read> E: array<vec4f>;     // depth He, cells A and B (bits), drag r
@group(0) @binding(2) var<storage, read> idr: array<f32>;     // 1/(d R)
@group(0) @binding(3) var<storage, read> cell: array<vec4f>;  // η, the forcing's shape (cos, sin)
@group(0) @binding(4) var<storage, read> clock: Clock;
@group(0) @binding(5) var<storage, read> cor: array<vec2u>;   // ${SLOTS} a edge: the edge read, its weight per unit Ω (bits)
fn grav(e: u32, i: u32, j: u32) -> f32 {
  let ci = cell[i]; let cj = cell[j];
  let eqi = ci.y * clock.cw - ci.z * clock.sw;
  let eqj = cj.y * clock.cw - cj.z * clock.sw;
  return -(U.gb * (cj.x - ci.x) - U.ga * (eqj - eqi)) * idr[e];
}`;
const PRED = HEAD + EDGE + /* wgsl */`
@group(0) @binding(6) var<storage, read> u: array<f32>;
@group(0) @binding(7) var<storage, read_write> us: array<f32>;
@group(0) @binding(8) var<storage, read_write> c0: array<f32>;
@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) id: vec3u) {
  let e = id.x;
  if (e >= U.ne) { return; }
  let g = E[e];
  if (g.x <= 0.0) { us[e] = 0.0; c0[e] = 0.0; return; }
  let i = bitcast<u32>(g.y); let j = bitcast<u32>(g.z);
  var c = 0.0;
  for (var k = 0u; k < ${SLOTS}u; k++) { let q = cor[${SLOTS}u * e + k]; c += bitcast<f32>(q.y) * u[q.x]; }
  c *= U.Omega;
  c0[e] = c;
  us[e] = (u[e] + U.dt * (grav(e, i, j) + c)) / (1.0 + U.dt * g.w);
}`;
const CORR = HEAD + EDGE + /* wgsl */`
@group(0) @binding(6) var<storage, read_write> u: array<f32>;
@group(0) @binding(7) var<storage, read> us: array<f32>;
@group(0) @binding(8) var<storage, read> c0: array<f32>;
@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) id: vec3u) {
  let e = id.x;
  if (e >= U.ne) { return; }
  let g = E[e];
  if (g.x <= 0.0) { u[e] = 0.0; return; }
  let i = bitcast<u32>(g.y); let j = bitcast<u32>(g.z);
  var c = 0.0;
  for (var k = 0u; k < ${SLOTS}u; k++) { let q = cor[${SLOTS}u * e + k]; c += bitcast<f32>(q.y) * us[q.x]; }
  u[e] = (u[e] + U.dt * (grav(e, i, j) + 0.5 * (c0[e] + U.Omega * c))) / (1.0 + U.dt * g.w);
}`;
const CONT = HEAD + /* wgsl */`
@group(0) @binding(1) var<storage, read> cE: array<u32>;
@group(0) @binding(2) var<storage, read> cD: array<f32>;      // sign · ℓ / (A R)
@group(0) @binding(3) var<storage, read> E: array<vec4f>;
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
    div += cD[q] * E[e].x * u[e];
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
    const cE = new Uint32Array(6 * n).fill(ne), cD = new Float32Array(6 * n);
    for (let i = 0; i < n; i++) for (let t = nbrOff[i], k = 0; t < nbrOff[i + 1]; t++, k++) {
      const q = 6 * i + k, s = M.cellSign[t];
      cE[q] = M.cellEdge[t]; cD[q] = s * M.len[M.cellEdge[t]] / (grid.area[i] * R);
    }
    const idr = new Float32Array(ne + 1);
    this.E = new Float32Array(4 * (ne + 1));
    const Eu = new Uint32Array(this.E.buffer);
    for (let e = 0; e < ne; e++) { idr[e] = 1 / (M.d[e] * R); Eu[4 * e + 1] = M.A[e]; Eu[4 * e + 2] = M.B[e]; }
    // The Coriolis stencil: edges fixed, weights per sea (ocean()); unused slots read the dummy edge with weight 0.
    this.cor = new Uint32Array(2 * SLOTS * (ne + 1)); this.corF = new Float32Array(this.cor.buffer);
    for (let e = 0; e <= ne; e++) {
      const k0 = e < ne ? M.cOff[e] : 0, m = e < ne ? M.cOff[e + 1] - k0 : 0;
      if (m > SLOTS) throw new Error(`tide: edge ${e} reads ${m} edges`);
      for (let k = 0; k < SLOTS; k++) this.cor[2 * (SLOTS * e + k)] = k < m ? M.cIdx[k0 + k] : ne;
    }
    const cellH = new Float32Array(4 * n);
    for (let i = 0; i < n; i++) { cellH[4 * i + 1] = cpu.cosEq[i]; cellH[4 * i + 2] = cpu.sinEq[i]; }
    this.sea = new Float32Array(n);
    const B = (data, size) => storage(device, size ?? data.byteLength, data);
    this.b = {
      cE: B(cE), cD: B(cD), E: B(this.E), idr: B(idr), cor: B(this.cor),
      cell: B(cellH), sea: B(this.sea), u: B(null, 4 * (ne + 1)), us: B(null, 4 * (ne + 1)), c0: B(null, 4 * (ne + 1)),
      acc: B(null, 8 * n), u2: B(null, 4 * ne), clock: B(null, 32),
    };
    this.ub = new ArrayBuffer(48);
    this.U = uniform(device, this.ub);
    const K = { clock: kernel(device, CLOCK, 'tide clock'), pred: kernel(device, PRED, 'tide pred'), corr: kernel(device, CORR, 'tide corr'), cont: kernel(device, CONT, 'tide cont'), acc: kernel(device, ACC, 'tide acc') };
    const b = this.b, U = this.U;
    const edge = { U, E: b.E, idr: b.idr, cell: b.cell, clock: b.clock, cor: b.cor };
    this.list = [
      [K.clock, K.clock.bind({ U, clock: b.clock }), 1],
      [K.pred, K.pred.bind({ ...edge, u: b.u, us: b.us, c0: b.c0 }), Math.ceil(ne / 64)],
      [K.corr, K.corr.bind({ ...edge, u: b.u, us: b.us, c0: b.c0 }), Math.ceil(ne / 64)],
      [K.cont, K.cont.bind({ U, cE: b.cE, cD: b.cD, E: b.E, u: b.u, cell: b.cell, acc: b.acc, clock: b.clock, sea: b.sea }), Math.ceil(n / 64)],
      [K.acc, K.acc.bind({ U, u: b.u, u2: b.u2, clock: b.clock }), Math.ceil(ne / 64)],
    ];
    this.readAcc = device.createBuffer({ size: 8 * n, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST });
    this.readU2 = device.createBuffer({ size: 4 * ne, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST });
    this.solved = false;
  }

  /** The sea: depth per cell in metres (≤ 0: land). */
  ocean(depth) {
    const cpu = this.cpu, M = cpu.mesh, ne = this.ne, n = this.n;
    cpu.ocean(depth);
    for (let e = 0; e < ne; e++) {
      this.E[4 * e] = cpu.He[e]; this.E[4 * e + 3] = cpu.r[e];
      for (let k = M.cOff[e], q = 2 * SLOTS * e + 1; k < M.cOff[e + 1]; k++, q += 2) this.corF[q] = cpu.corW[k];
    }
    for (let i = 0; i < n; i++) this.sea[i] = cpu.H[i] > 0 ? 1 : 0;
    const q = this.device.queue;
    q.writeBuffer(this.b.E, 0, this.E); q.writeBuffer(this.b.cor, 0, this.cor); q.writeBuffer(this.b.sea, 0, this.sea);
  }

  /** Forget the last tide: the next solve starts cold, from a still sea. */
  reset() {
    const q = this.device.queue, n = this.n, ne = this.ne;
    q.writeBuffer(this.b.u, 0, new Float32Array(ne + 1));
    const cellH = new Float32Array(4 * n);
    for (let i = 0; i < n; i++) { cellH[4 * i + 1] = this.cpu.cosEq[i]; cellH[4 * i + 2] = this.cpu.sinEq[i]; }
    q.writeBuffer(this.b.cell, 0, cellH);
    this.solved = false;
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
