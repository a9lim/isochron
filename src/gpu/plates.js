// The plates' step on the GPU (src/engine/plates.js is the reference): each
// world cell's point location in the plate frames, its gap and overlap tests,
// consumption, arcs and collisions, boundary relaxation, the crust sampled on
// top, the memories' decay, elevation, the sea level by Newton, the boundary
// kinematics, foundering, and the torque balance's per-plate sums. The engine's
// device runs it (src/engine/worker.js), from Tectonics.stepAsync.
//
// Residency. The CPU's plate frames stay authoritative: the landscape and the
// plumes write them through (owner, ref), and the rare events (merges, rifts,
// initiation, a plate's stray pieces passed on: Tectonics.resolveFragments)
// rewrite whole plates. The GPU keeps a mirror of every frame
// (crust: h, φ, formation and suture time per frame cell; mask: one bit per
// plate per frame cell) and the world's memories (slab, arc, collision front).
//   up, each step      the top cells' h and φ as the CPU's frames hold them (so
//                      the landscape's and the plumes' writes reach the GPU;
//                      the crust's deformation, Tectonics.deform, marks the
//                      frame cells it changes, so they go up at once),
//                      rotations, ice load and swells, the constants
//   down, each step    owner and ref, the crust on top (h, φ, tf, suture time),
//                      elevation, the sea level and land, the kinematics' sums,
//                      the per-plate sums of the balance, counters and collision
//                      tallies, and every frame cell the step changed (edits, so
//                      the CPU's frames stay the GPU's; a relaxed cell's edit
//                      names its source, so the frames' extras, kept on the CPU
//                      only, travel with it)
//   on demand          the memories, before a merge or an initiation (the CPU
//                      runs those); after one, the plates it touched, owner and
//                      ref, and the memories go back up (after pieces passed on,
//                      the plates and owner and ref: the memories stay)
// The step is read-only on the frames until it has decided every cell; the
// writes that follow resolve conflicts deterministically (a frame cell that two
// world cells both reach, which nearest-cell rounding makes, is written once,
// by the lowest index among neighbours, with the sum of their arcs).
//
// Order. The CPU's pass visits cells in index order, and where that order
// changes the outcome the GPU reproduces it: a slab inherits a neighbour's slab
// grown earlier in the pass (the slabs' chain, iterated to SLAB_MAX), a frame
// cell an earlier cell consumed is gone (a second decide pass), and a founder
// keeps its later neighbours from foundering (the founders' pick). Without the
// first, level 7's plates ran ~20% slow (AGENTS.md, "How the plates work").
// Relaxation reads the decided owners whole. f32 flips a nearest-cell tie now
// and then, so the two agree at ~99.99% of cells a step and statistically over
// many (tests/gpu-plates.test.mjs).
import { kernel, storage } from './device.js';
import { PARAMS, FRAME_EXTRA, freshExtras, contSlabAge } from '../engine/plates.js';

const EXTRA = Object.keys(FRAME_EXTRA);

const MAXP = 32, NONE = 0xffffffff, SEG = 4096;
const C_PAIRS = 0, C_MADE = 1024, C_CONSUMED = 1025, C_COLLIDED = 1026, C_RELAXED = 1027, C_FOUNDERED = 1028, C_EDITS = 1029, NCNT = 1040;
const U_BYTES = 128 + 64 * MAXP;

const HEAD = /* wgsl */`
const NONE: u32 = 0xffffffffu;
struct Plate { c0: vec4f, c1: vec4f, c2: vec4f, w: vec4f };
struct Uni {
  n: u32, np: u32, flags: u32, cap: u32,
  t: f32, t1: f32, dt: f32, res: f32,
  cellLen: f32, closing: f32, collideFrac: f32, arcDh: f32,
  arcDphi: f32, slabMax: f32, ka: f32, ks: f32,
  kc: f32, kRidge: f32, kSlab: f32, keel: f32,
  kCollide: f32, founderAge: f32, volume: f32, guess: f32,
  segLen: u32, tb: u32, nseg: u32, npatch: u32,
  kTrench: f32, slabClosing: f32, hStack: f32, contAge: f32,
  plates: array<Plate, ${MAXP}>,
};
`;

// Each binding's declaration; a kernel lists the ones it uses, in order.
const DECL = {
  U: 'var<uniform> U: Uni',
  geo: 'var<storage, read> geo: array<vec4f>',            // 7 per cell: (x, y, z, area), then 6 edges (tangent, bitcast nbr or NONE)
  egw: 'var<storage, read> egw: array<vec4f>',            // 6 per cell: (gradient weight, edge length)
  oref: 'var<storage, read> oref: array<vec2u>',          // (owner, ref) at the step's start
  orefW: 'var<storage, read_write> oref: array<vec2u>',
  oref2: 'var<storage, read> oref2: array<vec2u>',        // (owner, ref) as the step decides
  oref2W: 'var<storage, read_write> oref2: array<vec2u>',
  mask: 'var<storage, read> mask: array<u32>',            // per frame cell, a bit per plate
  maskA: 'var<storage, read_write> mask: array<atomic<u32>>',
  maskW: 'var<storage, read_write> mask: array<u32>',
  maskIn: 'var<storage, read> maskIn: array<u32>',
  pin: 'var<storage, read> pin: array<vec4u>',            // 2 per frame cell the CPU rewrote alone: (k·n + j, held), bitcast crust
  crust: 'var<storage, read> crust: array<vec4f>',        // per plate and frame cell: (h, φ, tf, suture)
  crustW: 'var<storage, read_write> crust: array<vec4f>',
  mem: 'var<storage, read> mem: array<vec4f>',            // 3 per cell: (slab, bitcast plate, age, arc), (slab dir, col), (col dir, bitcast plates)
  memW: 'var<storage, read_write> mem: array<vec4f>',
  memN: 'var<storage, read> memN: array<vec4f>',
  memNW: 'var<storage, read_write> memN: array<vec4f>',
  rec: 'var<storage, read> rec: array<vec4u>',            // 2 per cell: (top, jt, flags, bitcast collision dh), consumed frame cells; flags: 1 gap, 2 collision, ncons << 2, arcs << 8, subducted slot << 16, slab hung by slot << 20
  recW: 'var<storage, read_write> rec: array<vec4u>',
  recP: 'var<storage, read> recP: array<vec4u>',          // the first decide pass's records (the second's input)
  rlx: 'var<storage, read> rlx: array<vec2u>',
  rlxW: 'var<storage, read_write> rlx: array<vec2u>',
  top: 'var<storage, read> top: array<vec2f>',
  wh: 'var<storage, read> wh: array<f32>', whW: 'var<storage, read_write> wh: array<f32>',
  wphi: 'var<storage, read> wphi: array<f32>', wphiW: 'var<storage, read_write> wphi: array<f32>',
  wtf: 'var<storage, read> wtf: array<f32>', wtfW: 'var<storage, read_write> wtf: array<f32>',
  wsutW: 'var<storage, read_write> wsut: array<f32>',
  ls: 'var<storage, read> ls: array<vec2f>',
  elev: 'var<storage, read> elev: array<f32>', elevW: 'var<storage, read_write> elev: array<f32>',
  bal: 'var<storage, read> bal: array<vec4f>', balW: 'var<storage, read_write> bal: array<vec4f>',   // (φ, subsidence if ocean, age, elevation)
  tc: 'var<storage, read> tc: array<vec4f>', tcW: 'var<storage, read_write> tc: array<vec4f>',      // a collision front's torque
  kin: 'var<storage, read> kin: array<vec2f>', kinW: 'var<storage, read_write> kin: array<vec2f>',
  chA: 'var<storage, read> chA: array<vec2f>', chAW: 'var<storage, read_write> chA: array<vec2f>',   // the slabs' chain (slab, bitcast plate)
  cin: 'var<storage, read> cin: array<vec2f>', cout: 'var<storage, read_write> cout: array<vec2f>',
  fin: 'var<storage, read> fin: array<vec4f>', fout: 'var<storage, read_write> fout: array<vec4f>',
  fnd: 'var<storage, read> fnd: array<vec4f>', fndW: 'var<storage, read_write> fnd: array<vec4f>',   // (direction, 1) where old seafloor founders
  contrib: 'var<storage, read> contrib: array<vec4f>', contribW: 'var<storage, read_write> contrib: array<vec4f>',
  part: 'var<storage, read_write> part: array<vec4f>',
  sea: 'var<storage, read_write> sea: array<vec4f>',
  cnt: 'var<storage, read_write> cnt: array<atomic<u32>>',
  edits: 'var<storage, read_write> edits: array<vec4u>',
};
const GEO = /* wgsl */`
fn X(i: u32) -> vec3f { return geo[7u * i].xyz; }
fn nb(i: u32, k: u32) -> u32 { return bitcast<u32>(geo[7u * i + 1u + k].w); }
fn tn(i: u32, k: u32) -> vec3f { return geo[7u * i + 1u + k].xyz; }
// Greedy walk to the cell nearest p (src/grid/icosphere.js, walk).
fn walk(p: vec3f, start: u32) -> u32 {
  var cur = start;
  var best = dot(X(cur), p);
  loop {
    var next = cur;
    for (var k = 0u; k < 6u; k++) {
      let j = nb(cur, k);
      if (j == NONE) { break; }
      let d = dot(X(j), p);
      if (d > best) { best = d; next = j; }
    }
    if (next == cur) { return cur; }
    cur = next;
  }
}
fn toFrame(k: u32, x: vec3f) -> vec3f { let p = U.plates[k]; return vec3f(dot(p.c0.xyz, x), dot(p.c1.xyz, x), dot(p.c2.xyz, x)); }
`;
const mk = (names, body, label) => {
  const decl = names.map((nm, b) => `@group(0) @binding(${b}) ${DECL[nm]};`).join('\n');
  return { code: HEAD + decl + (names.includes('geo') ? GEO : '') + body, label };
};
const MAIN = '@compute @workgroup_size(64)\nfn main(@builtin(global_invocation_id) id: vec3u) {\n  let i = id.x;\n  if (i >= U.n) { return; }\n';

const K = {
  // The CPU's writes to the top cells (the landscape, the plumes) into the frames.
  sync: mk(['U', 'oref', 'top', 'crustW'], MAIN + `
  let o = oref[i];
  let f = o.x * U.n + o.y;
  crust[f] = vec4f(top[i], crust[f].zw);
}`),
  // Rare events' masks: the touched plates' bits replaced.
  maskSet: mk(['U', 'maskW', 'maskIn'], MAIN + `
  mask[i] = (mask[i] & ~U.tb) | maskIn[i];
}`),
  // Frame cells the CPU rewrote one by one (a plate's stray pieces passed on), each listed once.
  patch: mk(['U', 'maskA', 'crustW', 'pin'], `
@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) id: vec3u) {
  let e = id.x;
  if (e >= U.npatch) { return; }
  let a = pin[2u * e];
  let k = a.x / U.n;
  let j = a.x % U.n;
  if (a.y != 0u) { atomicOr(&mask[j], 1u << k); } else { atomicAnd(&mask[j], ~(1u << k)); }
  crust[a.x] = bitcast<vec4f>(pin[2u * e + 1u]);
}`),
  // Every cell decides from the step's start: which plates cover it, which stays on top, which are
  // consumed. Run twice: the CPU's pass unmasks a frame cell as it consumes it, so a later world
  // cell that reaches the same frame cell doesn't see it; the second pass drops a covering frame
  // cell that an earlier neighbour consumed in the first.
  decide: mk(['U', 'geo', 'oref', 'mask', 'crust', 'mem', 'memNW', 'recW', 'recP'], `
fn buoy(c: vec4f) -> f32 { if (c.y >= 0.5) { return 2.0 + 0.001 * c.x; } return 1.0 - (U.t - c.z) / 400.0; }
fn taken(f: u32, i: u32) -> bool {
  for (var e = 0u; e < 6u; e++) {
    let jn = nb(i, e);
    if (jn == NONE) { break; }
    if (jn < i) {
      let rp = recP[2u * jn];
      let r1 = recP[2u * jn + 1u];
      let nc = (rp.z >> 2u) & 7u;
      for (var c = 0u; c < nc; c++) { if (r1[c] == f) { return true; } }
    }
  }
  return false;
}
` + MAIN + `
  let n = U.n;
  let x = X(i);
  var cand: array<u32, 8>;
  var guess: array<u32, 8>;
  let oi = oref[i];
  cand[0] = oi.x; guess[0] = oi.y;
  var nc = 1u;
  for (var k = 0u; k < 6u; k++) {
    let j = nb(i, k);
    if (j == NONE) { break; }
    let oj = oref[j];
    var seen = false;
    for (var c = 0u; c < nc; c++) { if (cand[c] == oj.x) { seen = true; } }
    if (!seen) { cand[nc] = oj.x; guess[nc] = oj.y; nc++; }
  }
  var covK: array<u32, 8>;
  var covJ: array<u32, 8>;
  var ncov = 0u;
  var loc0 = 0u;
  for (var c = 0u; c < nc; c++) {
    let k = cand[c];
    let j = walk(toFrame(k, x), guess[c]);
    if (c == 0u) { loc0 = j; }
    if (((mask[j] >> k) & 1u) != 0u && !taken(k * n + j, i)) { covK[ncov] = k; covJ[ncov] = j; ncov++; }
  }
  var m0 = mem[3u * i];
  var m1 = mem[3u * i + 1u];
  var m2 = mem[3u * i + 2u];
  var tp = cand[0];
  var jt = loc0;
  var flags = 0u;
  var cons = array<u32, 4>(NONE, NONE, NONE, NONE);
  var ncons = 0u;
  var narc = 0u;
  var dh = 0.0;
  if (ncov == 0u) {
    flags = 1u;
  } else if (ncov == 1u) {
    tp = covK[0]; jt = covJ[0];
  } else {
    var best = -1e30;
    var bi = 0u;
    for (var c = 0u; c < ncov; c++) {
      var b = buoy(crust[covK[c] * n + covJ[c]]);
      if (covK[c] == cand[0]) { b += 0.02; }
      if (b > best) { best = b; bi = c; }
    }
    tp = covK[bi]; jt = covJ[bi];
    let topCont = crust[tp * n + jt].y >= 0.5;
    let vt = cross(U.plates[tp].w.xyz, x);
    for (var c = 0u; c < ncov; c++) {
      if (c == bi) { continue; }
      let k = covK[c];
      let j = covJ[c];
      let Q = crust[k * n + j];
      // Consumed only where the plates close on each other (the CPU's CLOSING test).
      var d = cross(U.plates[k].w.xyz, x) - vt;
      d -= dot(d, x) * x;
      let r = length(d);
      var nn = vec3f(0.0);
      for (var e = 0u; e < 6u; e++) {
        let jn = nb(i, e);
        if (jn == NONE) { break; }
        let o = oref[jn].x;
        if (o == tp) { nn += tn(i, e); } else if (o == k) { nn -= tn(i, e); }
      }
      if (!(dot(d, nn) > U.closing * r * length(nn))) { continue; }
      var slot = 4u;
      if (ncons < 4u) { cons[ncons] = k * n + j; slot = ncons; ncons++; }
      let collide = Q.y >= 0.5 && topCont;
      if (collide) {
        dh += U.collideFrac * Q.x;
        flags |= 2u;
        if (r > 0.0) {
          m1.w = min(1.0, m1.w + 0.5);
          m2 = vec4f(d / r, bitcast<f32>((k & 0xffffu) | (tp << 16u)));
        }
      }
      // A slab only where the plates close across the boundary (the CPU's SLAB_CLOSING), pulling down-dip
      // across it; it inherits the longest of its plate's beside the cell (as they stood at the step's start).
      // Under a collision the continent's lithosphere sinks, pulling as its CONT_PULL age's ocean would.
      let ln = length(nn);
      if (dot(d, nn) > U.slabClosing * r * ln && (!collide || U.contAge > 0.0)) {
        var len = 0.0;
        if (bitcast<u32>(m0.y) == k) { len = m0.x; }
        for (var e = 0u; e < 6u; e++) {
          let jn = nb(i, e);
          if (jn == NONE) { break; }
          let mj = mem[3u * jn];
          if (bitcast<u32>(mj.y) == k && mj.x > len) { len = mj.x; }
        }
        m0 = vec4f(min(U.slabMax, len + U.cellLen), bitcast<f32>(k), select(max(0.0, U.t - Q.z), U.contAge, collide), m0.w);
        m1 = vec4f(nn / ln, m1.w);
        if (slot < 4u) { flags |= 1u << (20u + slot); }
      }
      if (!collide) {
        m0.w += 1.0;
        narc++;
        if (slot < 4u) { flags |= 1u << (16u + slot); }
      }
    }
  }
  memN[3u * i] = m0;
  memN[3u * i + 1u] = m1;
  memN[3u * i + 2u] = m2;
  rec[2u * i] = vec4u(tp, jt, flags | (ncons << 2u) | (min(narc, 255u) << 8u), bitcast<u32>(dh));
  rec[2u * i + 1u] = vec4u(cons[0], cons[1], cons[2], cons[3]);
}`),
  // The decisions written into the frames; a frame cell two world cells reach is written once.
  apply: mk(['U', 'geo', 'rec', 'crustW', 'maskA', 'oref2W', 'cnt'], MAIN + `
  let n = U.n;
  let r0 = rec[2u * i];
  let tp = r0.x;
  let jt = r0.y;
  let fl = r0.z;
  oref2[i] = vec2u(tp, jt);
  let f = tp * n + jt;
  if ((fl & 1u) != 0u) {
    // A gap: new oceanic crust for the plate that left.
    var win = true;
    for (var e = 0u; e < 6u; e++) {
      let j = nb(i, e);
      if (j == NONE) { break; }
      let rj = rec[2u * j];
      if (j < i && (rj.z & 1u) != 0u && rj.x == tp && rj.y == jt) { win = false; }
    }
    if (win) {
      crust[f] = vec4f(7.0, 0.0, U.t1 - 0.5 * U.dt, -1e9);
      atomicOr(&mask[jt], 1u << tp);
      atomicAdd(&cnt[${C_MADE}u], 1u);
    }
  }
  if ((fl & 0xff02u) != 0u) {
    // Arcs and stacked crust on the plate above, summed over the world cells that reach it.
    var win = true;
    var na = (fl >> 8u) & 0xffu;
    var dh = bitcast<f32>(r0.w);
    var sut = (fl & 2u) != 0u;
    for (var e = 0u; e < 6u; e++) {
      let j = nb(i, e);
      if (j == NONE) { break; }
      let rj = rec[2u * j];
      if (rj.x == tp && rj.y == jt && (rj.z & 0xff02u) != 0u) {
        if (j < i) { win = false; }
        na += (rj.z >> 8u) & 0xffu;
        dh += bitcast<f32>(rj.w);
        sut = sut || (rj.z & 2u) != 0u;
      }
    }
    if (win) {
      var c = crust[f];
      c.x = min(U.hStack, c.x + dh + f32(na) * U.arcDh);
      c.y = min(1.0, c.y + f32(na) * U.arcDphi);
      if (sut) { c.w = U.t1; }
      crust[f] = c;
    }
  }
  let nc = (fl >> 2u) & 7u;
  let r1 = rec[2u * i + 1u];
  for (var c = 0u; c < nc; c++) {
    let fc = r1[c];
    let k = fc / n;
    atomicAnd(&mask[fc % n], ~(1u << k));
    // Counted here, once (the decide pass runs twice).
    if (((fl >> (16u + c)) & 1u) != 0u) { atomicAdd(&cnt[${C_CONSUMED}u], 1u); }
    else { atomicAdd(&cnt[min(tp, k) * ${MAXP}u + max(tp, k)], 1u); atomicAdd(&cnt[${C_COLLIDED}u], 1u); }
  }
}`),
  // Boundary relaxation (Jacobi: every cell reads the decided owners).
  relaxDecide: mk(['U', 'geo', 'oref2', 'rlxW'], MAIN + `
  let own = oref2[i].x;
  var ks: array<u32, 6>;
  var cs: array<u32, 6>;
  var gs: array<u32, 6>;
  var nk = 0u;
  var same = 0u;
  var d = 0u;
  for (var e = 0u; e < 6u; e++) {
    let j = nb(i, e);
    if (j == NONE) { break; }
    d++;
    let o = oref2[j];
    if (o.x == own) { same++; continue; }
    var c = 0u;
    while (c < nk && ks[c] != o.x) { c++; }
    if (c == nk) { ks[nk] = o.x; cs[nk] = 0u; gs[nk] = o.y; nk++; }
    cs[c]++;
  }
  rlx[i] = vec2u(NONE, NONE);
  if (same > 1u) { return; }
  for (var c = 0u; c < nk; c++) {
    if (cs[c] + 2u >= d) {
      rlx[i] = vec2u(ks[c], walk(toFrame(ks[c], X(i)), gs[c]));
      return;
    }
  }
}`),
  relaxApply: mk(['U', 'geo', 'oref2W', 'rlx', 'crustW', 'maskA', 'cnt'], MAIN + `
  let r = rlx[i];
  if (r.x == NONE) { return; }
  let o = oref2[i];
  var win = true;
  for (var e = 0u; e < 6u; e++) {
    let j = nb(i, e);
    if (j == NONE) { break; }
    if (j < i && rlx[j].x == r.x && rlx[j].y == r.y) { win = false; }
  }
  if (win) { crust[r.x * U.n + r.y] = crust[o.x * U.n + o.y]; }
  atomicOr(&mask[r.y], 1u << r.x);
  atomicAnd(&mask[o.y], ~(1u << o.x));
  oref2[i] = r;
  atomicAdd(&cnt[${C_RELAXED}u], 1u);
}`),
  // The crust on top, sampled; (owner, ref) becomes the next step's start.
  sample: mk(['U', 'oref2', 'orefW', 'crust', 'whW', 'wphiW', 'wtfW', 'wsutW'], MAIN + `
  let o = oref2[i];
  oref[i] = o;
  let c = crust[o.x * U.n + o.y];
  wh[i] = c.x; wphi[i] = c.y; wtf[i] = c.z; wsut[i] = c.w;
}`),
  // The slabs' inheritance as the CPU's pass makes it: a cell visited after a neighbour
  // consumed this step inherits that neighbour's new slab (the reference visits cells in
  // index order). Iterated from the decide pass's values, each pass carries the chain one
  // link further; a chain saturates at SLAB_MAX within SLAB_MAX/cellLen links, so that many
  // passes reach the CPU's values exactly.
  chainInit: mk(['U', 'memN', 'chAW'], MAIN + `
  chA[i] = memN[3u * i].xy;
}`),
  chain: mk(['U', 'geo', 'rec', 'mem', 'cin', 'cout'], MAIN + `
  let n = U.n;
  let fl = rec[2u * i].z;
  if (((fl >> 20u) & 15u) == 0u) { cout[i] = cin[i]; return; }
  let r1 = rec[2u * i + 1u];
  var s = mem[3u * i].x;
  var sp = bitcast<u32>(mem[3u * i].y);
  let nc = (fl >> 2u) & 7u;
  for (var c = 0u; c < nc; c++) {
    if (((fl >> (20u + c)) & 1u) == 0u) { continue; }
    let k = r1[c] / n;
    var len = 0.0;
    if (sp == k) { len = s; }
    for (var e = 0u; e < 6u; e++) {
      let jn = nb(i, e);
      if (jn == NONE) { break; }
      var v = mem[3u * jn].xy;
      if (jn < i) { v = cin[jn]; }
      if (bitcast<u32>(v.y) == k && v.x > len) { len = v.x; }
    }
    s = min(U.slabMax, len + U.cellLen);
    sp = k;
  }
  cout[i] = vec2f(s, bitcast<f32>(sp));
}`),
  // Memories decay; a collision front's torque.
  decay: mk(['U', 'geo', 'memN', 'chA', 'memW', 'tcW'], MAIN + `
  var m0 = memN[3u * i];
  m0 = vec4f(chA[i], m0.zw);
  var m1 = memN[3u * i + 1u];
  let m2 = memN[3u * i + 2u];
  m0.x *= U.ks; m0.w *= U.ka; m1.w *= U.kc;
  mem[3u * i] = m0; mem[3u * i + 1u] = m1; mem[3u * i + 2u] = m2;
  var T = vec3f(0.0);
  let pk = bitcast<u32>(m2.w);
  let a = pk & 0xffffu;
  let b = pk >> 16u;
  if (m1.w >= 1e-3 && a < ${MAXP}u && b < ${MAXP}u && U.plates[a].w.w > 0.5 && U.plates[b].w.w > 0.5) {
    T = cross(X(i), -U.kCollide * m1.w * U.cellLen * U.res * m2.xyz);
  }
  tc[i] = vec4f(T, 0.0);
}`),
  // Isostasy (src/engine/crust.js).
  elevation: mk(['U', 'wh', 'wphi', 'wtf', 'ls', 'elevW', 'balW'], `
fn subsidence(age: f32) -> f32 {
  if (age <= 0.0) { return 0.0; }
  if (age < 20.0) { return 0.365 * sqrt(age); }
  return 3.051 - 2.473 * exp(-0.0278 * age);
}
` + MAIN + `
  let h = wh[i];
  let phi = wphi[i];
  let age = U.t1 - wtf[i];
  let s = subsidence(age);
  let rho = 2.95 + (2.85 - 2.95) * phi;
  let e = h * (1.0 - rho / 3.30) - (1.0 - phi) * s + ls[i].x + ls[i].y;
  elev[i] = e;
  bal[i] = vec4f(phi, select(0.0, s, phi < 0.5), age, e);
}`),
  // Crust opened at ridges and ocean closed at trenches, per cell (Tectonics.kinematics).
  kinematics: mk(['U', 'geo', 'egw', 'oref', 'wphi', 'kinW'], MAIN + `
  let a = oref[i].x;
  let xi = X(i);
  var op = 0.0;
  var cl = 0.0;
  for (var e = 0u; e < 6u; e++) {
    let j = nb(i, e);
    if (j == NONE) { break; }
    let b = oref[j].x;
    if (j < i || b == a) { continue; }
    let vn = dot(cross(U.plates[b].w.xyz - U.plates[a].w.xyz, 0.5 * (xi + X(j))), tn(i, e));
    let ell = egw[6u * i + e].w;
    if (vn > 0.0) { op += vn * ell; } else if (wphi[i] < 0.5 || wphi[j] < 0.5) { cl -= vn * ell; }
  }
  kin[i] = vec2f(op, cl);
}`),
  // The sea level by Newton, from the last (one workgroup; src/engine/crust.js, solveSeaLevel), the land it leaves, and the kinematics' sums.
  sea: mk(['U', 'geo', 'elev', 'kin', 'sea'], `
var<workgroup> red: array<vec4f, 256>;
fn sum4(v: vec4f, tid: u32) -> vec4f {
  red[tid] = v;
  workgroupBarrier();
  for (var s = 128u; s > 0u; s >>= 1u) {
    if (tid < s) { red[tid] += red[tid + s]; }
    workgroupBarrier();
  }
  let r = workgroupUniformLoad(&red[0]);
  workgroupBarrier();
  return r;
}
@compute @workgroup_size(256)
fn main(@builtin(local_invocation_index) tid: u32) {
  let n = U.n;
  var lo = 1e30;
  var hi = -1e30;
  var k0 = vec2f(0.0);
  for (var i = tid; i < n; i += 256u) { let e = elev[i]; lo = min(lo, e); hi = max(hi, e); k0 += kin[i]; }
  red[tid] = vec4f(lo, hi, 0.0, 0.0);
  workgroupBarrier();
  for (var s = 128u; s > 0u; s >>= 1u) {
    if (tid < s) { let a = red[tid]; let b = red[tid + s]; red[tid] = vec4f(min(a.x, b.x), max(a.y, b.y), 0.0, 0.0); }
    workgroupBarrier();
  }
  let mm = workgroupUniformLoad(&red[0]);
  workgroupBarrier();
  let ks = sum4(vec4f(k0, 0.0, 0.0), tid);
  var s = U.guess;
  if ((U.flags & 1u) != 0u) {
    let V = U.volume;
    var a0 = mm.x;
    var b0 = mm.y + V / (4.0 * 3.14159265) + 1.0;
    if (!(s > a0 && s < b0)) { s = 0.5 * (a0 + b0); }
    for (var it = 0; it < 24; it++) {
      // Kahan-compensated sums of the ocean's volume and area below s.
      var v = 0.0; var cv = 0.0; var ar = 0.0; var ca = 0.0;
      for (var i = tid; i < n; i += 256u) {
        let d = s - elev[i];
        if (d > 0.0) {
          let A = geo[7u * i].w;
          let y = d * A - cv; let t = v + y; cv = (t - v) - y; v = t;
          let y2 = A - ca; let t2 = ar + y2; ca = (t2 - ar) - y2; ar = t2;
        }
      }
      let va = sum4(vec4f(v, ar, 0.0, 0.0), tid);
      let r = va.x - V;
      if (abs(r) <= 2e-7 * V) { break; }
      if (r > 0.0) { b0 = s; } else { a0 = s; }
      var nx = 0.5 * (a0 + b0);
      if (va.y > 0.0) { nx = s - r / va.y; }
      if (!(nx > a0 && nx < b0)) { nx = 0.5 * (a0 + b0); }
      if (abs(nx - s) < 1e-6) { s = nx; break; }
      s = nx;
    }
  }
  var land = 0.0;
  for (var i = tid; i < n; i += 256u) { if (elev[i] > s) { land += geo[7u * i].w; } }
  let L = sum4(vec4f(land, 0.0, 0.0, 0.0), tid);
  if (tid == 0u) { sea[0] = vec4f(s, L.x, ks.x, ks.y); }
}`),
  // Old seafloor at a plate's edge with no slab beside it founders (from the decayed memories).
  founder: mk(['U', 'geo', 'oref', 'mem', 'bal', 'fndW'], MAIN + `
  let k = oref[i].x;
  fnd[i] = vec4f(0.0);
  var edge = false;
  var dir = vec3f(0.0);
  var s = 0.0;
  let m = mem[3u * i];
  if (bitcast<u32>(m.y) == k) { s = m.x; }
  for (var e = 0u; e < 6u; e++) {
    let j = nb(i, e);
    if (j == NONE) { break; }
    if (oref[j].x != k) { edge = true; dir += tn(i, e); }
    let mj = mem[3u * j];
    if (bitcast<u32>(mj.y) == k && mj.x > s) { s = mj.x; }
  }
  let b = bal[i];
  if (!edge || s >= 1e-4 || b.x >= 0.5 || b.z < U.founderAge) { return; }
  let r = length(dir);
  if (r > 0.0) { fnd[i] = vec4f(dir / r, 1.0); }
}`),
  // The CPU's pass founders cells in index order, and a founder's later neighbours on its plate then
  // see its slab and don't: the founders are the greedy pick in index order among the candidates
  // (w 1 founders, ½ a candidate an earlier founder beside it blocks). Each pass settles one more
  // link of a chain of candidates; chains are a few cells long.
  founderPick: mk(['U', 'geo', 'oref', 'fin', 'fout'], MAIN + `
  var f = fin[i];
  if (f.w > 0.0) {
    let k = oref[i].x;
    var blocked = false;
    for (var e = 0u; e < 6u; e++) {
      let j = nb(i, e);
      if (j == NONE) { break; }
      if (j < i && oref[j].x == k && fin[j].w > 0.75) { blocked = true; }
    }
    f.w = select(1.0, 0.5, blocked);
  }
  fout[i] = f;
}`),
  // Each cell's share of its plate's drag, ridge push, slab pull and the slab's resistance; founders take their slabs.
  contrib: mk(['U', 'geo', 'egw', 'oref', 'bal', 'memW', 'fnd', 'contribW', 'cnt'], MAIN + `
  let k = oref[i].x;
  let x = X(i);
  let A = geo[7u * i].w;
  let b = bal[i];
  let c = A * (1.0 + U.keel * b.x);
  var T = vec3f(0.0);
  var Ma = vec4f(c * (1.0 - x.x * x.x), -c * x.x * x.y, -c * x.x * x.z, c * (1.0 - x.y * x.y));
  var Mb = vec2f(-c * x.y * x.z, c * (1.0 - x.z * x.z));
  var edge = false;
  if (b.x < 0.5) {
    // Ridge push: the subsidence's gradient within the plate's own ocean.
    var g = vec3f(0.0);
    for (var e = 0u; e < 6u; e++) {
      let j = nb(i, e);
      if (j == NONE) { break; }
      let bj = bal[j];
      if (oref[j].x != k || bj.x >= 0.5) { continue; }
      g += (bj.y - b.y) * egw[6u * i + e].xyz;
    }
    T += cross(x, U.kRidge * A * g);
  }
  for (var e = 0u; e < 6u; e++) { let j = nb(i, e); if (j == NONE) { break; } if (oref[j].x != k) { edge = true; } }
  if (edge) {
    // Slab pull: the longest slab of this plate within a cell (a founder's own, if it is one).
    let fi = fnd[i];
    var s = 0.0;
    var age = 0.0;
    var dir = vec3f(0.0);
    if (fi.w > 0.75) {
      s = 0.3 * U.slabMax; age = b.z; dir = fi.xyz;
      mem[3u * i] = vec4f(s, bitcast<f32>(k), age, mem[3u * i].w);
      mem[3u * i + 1u] = vec4f(dir, mem[3u * i + 1u].w);
      atomicAdd(&cnt[${C_FOUNDERED}u], 1u);
    } else {
      let m = mem[3u * i];
      if (bitcast<u32>(m.y) == k) { s = m.x; age = m.z; dir = mem[3u * i + 1u].xyz; }
      for (var e = 0u; e < 6u; e++) {
        let j = nb(i, e);
        if (j == NONE) { break; }
        if (fnd[j].w > 0.75) {
          // A founder seen only if the CPU's pass reached it first.
          if (j < i && oref[j].x == k && 0.3 * U.slabMax > s) { s = 0.3 * U.slabMax; age = bal[j].z; dir = fnd[j].xyz; }
        } else {
          let mj = mem[3u * j];
          if (bitcast<u32>(mj.y) == k && mj.x > s) { s = mj.x; age = mj.z; dir = mem[3u * j + 1u].xyz; }
        }
      }
    }
    if (s >= 1e-4) {
      let f = U.kSlab * (s / U.slabMax) * sqrt(clamp(age, 0.0, 150.0) / 100.0) * U.cellLen;
      T += cross(x, f * dir);
      // The slab's resistance along its pull: c q qᵀ, q = x × d̂.
      let ct = U.kTrench * (s / U.slabMax) * U.cellLen;
      let q = cross(x, dir);
      Ma += ct * vec4f(q.x * q.x, q.x * q.y, q.x * q.z, q.y * q.y);
      Mb += ct * vec2f(q.y * q.z, q.z * q.z);
    }
  }
  contrib[3u * i] = Ma;
  contrib[3u * i + 1u] = vec4f(Mb, A, select(0.0, A, b.x >= 0.5));
  contrib[3u * i + 2u] = vec4f(T, 0.0);
}`),
  // Per plate and segment of cells, the sums (one workgroup each; the CPU adds the segments).
  reduce: mk(['U', 'oref', 'contrib', 'tc', 'mem', 'part'], `
var<workgroup> r0: array<vec4f, 256>;
var<workgroup> r1: array<vec4f, 256>;
var<workgroup> r2: array<vec4f, 256>;
@compute @workgroup_size(256)
fn main(@builtin(local_invocation_index) tid: u32, @builtin(workgroup_id) wg: vec3u) {
  let seg = wg.x;
  let k = wg.y;
  let a = seg * U.segLen;
  let b = min(U.n, a + U.segLen);
  var s0 = vec4f(0.0);
  var s1 = vec4f(0.0);
  var s2 = vec4f(0.0);
  for (var i = a + tid; i < b; i += 256u) {
    if (oref[i].x == k) { s0 += contrib[3u * i]; s1 += contrib[3u * i + 1u]; s2 += contrib[3u * i + 2u]; }
    let pk = bitcast<u32>(mem[3u * i + 2u].w);
    if ((pk & 0xffffu) == k) { s2 += tc[i]; }
    if ((pk >> 16u) == k) { s2 -= tc[i]; }
  }
  r0[tid] = s0; r1[tid] = s1; r2[tid] = s2;
  workgroupBarrier();
  for (var s = 128u; s > 0u; s >>= 1u) {
    if (tid < s) { r0[tid] += r0[tid + s]; r1[tid] += r1[tid + s]; r2[tid] += r2[tid + s]; }
    workgroupBarrier();
  }
  if (tid == 0u) {
    let o = 3u * (k * U.nseg + seg);
    part[o] = r0[0]; part[o + 1u] = r1[0]; part[o + 2u] = r2[0];
  }
}`),
  // Every frame cell the step changed, with its final state, for the CPU's frames; a relaxed
  // cell's new frame cell names the one its crust came from (+1), so the CPU carries the
  // frames' extras (FRAME_EXTRA) with it, from the world cell whose copy relaxApply kept.
  emit: mk(['U', 'geo', 'rec', 'rlx', 'crust', 'mask', 'edits', 'cnt'], `
fn put(f: u32, src: u32) {
  let at = atomicAdd(&cnt[${C_EDITS}u], 1u);
  if (at >= U.cap) { return; }
  let j = f % U.n;
  edits[2u * at] = vec4u(f, (mask[j] >> (f / U.n)) & 1u, src, 0u);
  edits[2u * at + 1u] = bitcast<vec4u>(crust[f]);
}
` + MAIN + `
  let r0 = rec[2u * i];
  let r1 = rec[2u * i + 1u];
  if ((r0.z & 0xff03u) != 0u) { put(r0.x * U.n + r0.y, 0u); }
  let nc = (r0.z >> 2u) & 7u;
  for (var c = 0u; c < nc; c++) { put(r1[c], 0u); }
  let r = rlx[i];
  if (r.x != NONE) {
    var win = true;
    for (var e = 0u; e < 6u; e++) {
      let j = nb(i, e);
      if (j == NONE) { break; }
      if (j < i && rlx[j].x == r.x && rlx[j].y == r.y) { win = false; }
    }
    let o = r0.x * U.n + r0.y;
    put(r.x * U.n + r.y, select(0u, o + 1u, win));
    put(o, 0u);
  }
}`),
};

const grids = new WeakMap();
/**
 * The grid on the device, once per grid (src/gpu/surface.js shares it): per cell, its centre and
 * area, then its six edges (tangent toward the neighbour, and the neighbour's index or NONE for a
 * pentagon's sixth); and per edge, the least-squares gradient weight and the Voronoi edge's length.
 */
export function gridBuffers(device, g) {
  let G = grids.get(g);
  if (G && G.device === device) return G;
  const n = g.n, geo = new Float32Array(28 * n), gu = new Uint32Array(geo.buffer), egw = new Float32Array(24 * n);
  for (let i = 0; i < n; i++) {
    geo.set([g.pos[3 * i], g.pos[3 * i + 1], g.pos[3 * i + 2], g.area[i]], 28 * i);
    const o = g.nbrOff[i], d = g.nbrOff[i + 1] - o;
    for (let k = 0; k < 6; k++) {
      const b = 28 * i + 4 + 4 * k, c = 24 * i + 4 * k;
      if (k < d) {
        const t = o + k;
        geo[b] = g.tan[3 * t]; geo[b + 1] = g.tan[3 * t + 1]; geo[b + 2] = g.tan[3 * t + 2]; gu[b + 3] = g.nbr[t];
        egw[c] = g.gw[3 * t]; egw[c + 1] = g.gw[3 * t + 1]; egw[c + 2] = g.gw[3 * t + 2]; egw[c + 3] = g.ell[t];
      } else gu[b + 3] = NONE;
    }
  }
  G = { device, geo: storage(device, geo.byteLength, geo), egw: storage(device, egw.byteLength, egw) };
  grids.set(g, G);
  return G;
}

export class GpuPlates {
  constructor(device, tec) {
    const g = tec.grid, n = this.n = g.n;
    this.device = device; this.tec = tec;
    if (16 * MAXP * n > device.limits.maxStorageBufferBindingSize) throw new Error(`plates on the GPU: ${n} cells × ${MAXP} frames exceed the device's binding size`);
    this.S = Math.ceil(n / SEG);
    this.cap = Math.max(4096, n >> 2);
    // Passes of the slabs' chain: enough links to saturate, even (so the last pass lands in chA).
    this.chainPasses = 2 * Math.ceil((Math.ceil(PARAMS.SLAB_MAX / Math.sqrt(4 * Math.PI / n)) + 1) / 2);
    const G = gridBuffers(device, g);
    const S = (bytes, data) => storage(device, bytes, data);
    this.b = {
      geo: G.geo, egw: G.egw,
      oref: S(8 * n), oref2: S(8 * n), mask: S(4 * n), maskIn: S(4 * n), crust: S(16 * MAXP * n), pin: S(32 * this.cap),
      mem: S(48 * n), memN: S(48 * n), chA: S(8 * n), chB: S(8 * n), rec: S(32 * n), recA: S(32 * n), recZ: S(32 * n), rlx: S(8 * n), top: S(8 * n), ls: S(8 * n),
      wh: S(4 * n), wphi: S(4 * n), wtf: S(4 * n), wsut: S(4 * n), elev: S(4 * n),
      bal: S(16 * n), tc: S(16 * n), kin: S(8 * n), fnd: S(16 * n), fndB: S(16 * n), contrib: S(48 * n),
      part: S(48 * MAXP * this.S), sea: S(16), cnt: S(4 * NCNT), edits: S(32 * this.cap),
    };
    this.ub = new ArrayBuffer(U_BYTES); this.uf = new Float32Array(this.ub); this.uu = new Uint32Array(this.ub);
    this.U = device.createBuffer({ size: U_BYTES, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    this.k = {};
    for (const [name, { code }] of Object.entries(K)) {
      const kk = kernel(device, code, 'plates.' + name);
      const res = {};
      for (const m of code.matchAll(/@binding\(\d+\)\s*var(?:<[^>]*>)?\s+(\w+)/g)) res[m[1]] = m[1] === 'U' ? this.U : this.b[m[1]];
      if (name === 'decide') { this.k.decide1 = { pipeline: kk.pipeline, group: kk.bind({ ...res, rec: this.b.recA, recP: this.b.recZ }) }; res.recP = this.b.recA; }
      if (name === 'founderPick') { this.k.founderAB = { pipeline: kk.pipeline, group: kk.bind({ ...res, fin: this.b.fnd, fout: this.b.fndB }) }; res.fin = this.b.fndB; res.fout = this.b.fnd; }
      if (name === 'chain') { this.k.chainAB = { pipeline: kk.pipeline, group: kk.bind({ ...res, cin: this.b.chA, cout: this.b.chB }) }; res.cin = this.b.chB; res.cout = this.b.chA; }
      this.k[name] = { pipeline: kk.pipeline, group: kk.bind(res) };
    }
    // The staging buffer for what comes down each step.
    const L = this.layout = {};
    let off = 0;
    const at = (name, bytes) => { L[name] = off; off += Math.ceil(bytes / 16) * 16; };
    at('oref', 8 * n); for (const f of ['wh', 'wphi', 'wtf', 'wsut', 'elev']) at(f, 4 * n);
    at('cnt', 4 * NCNT); at('sea', 16); at('part', 48 * MAXP * this.S); at('edits', 32 * this.cap);
    this.staging = device.createBuffer({ size: off, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST });
    this.pushAll();
  }

  /** Everything up from the CPU: every plate's frame, the masks, owner and ref, the memories. */
  pushAll() {
    const tec = this.tec, n = this.n;
    const words = new Uint32Array(n);
    for (const p of tec.plates) this.pushFrame(p, words);
    this.device.queue.writeBuffer(this.b.mask, 0, words);
    this.pushOwners(); this.pushMemory();
    tec.dirty.plates.clear(); tec.dirty.cells.clear(); tec.dirty.owner = tec.dirty.mem = false;
  }

  pushFrame(p, words) {
    const n = this.n, c = new Float32Array(4 * n), bit = 1 << p.index;
    for (let j = 0; j < n; j++) {
      c[4 * j] = p.h[j]; c[4 * j + 1] = p.phi[j]; c[4 * j + 2] = p.tf[j]; c[4 * j + 3] = p.sut[j];
      if (p.mask[j]) words[j] |= bit;
    }
    this.device.queue.writeBuffer(this.b.crust, 16 * n * p.index, c);
  }

  pushOwners() {
    const tec = this.tec, n = this.n, o = new Uint32Array(2 * n);
    for (let i = 0; i < n; i++) { o[2 * i] = tec.owner[i]; o[2 * i + 1] = tec.ref[i]; }
    this.device.queue.writeBuffer(this.b.oref, 0, o);
  }

  pushMemory() {
    const t = this.tec, n = this.n, m = new Float32Array(12 * n), mu = new Uint32Array(m.buffer);
    for (let i = 0; i < n; i++) {
      const b = 12 * i;
      m[b] = t.slab[i]; mu[b + 1] = t.slabPlate[i] < 0 ? NONE : t.slabPlate[i]; m[b + 2] = t.slabAge[i]; m[b + 3] = t.arc[i];
      m[b + 4] = t.slabDir[3 * i]; m[b + 5] = t.slabDir[3 * i + 1]; m[b + 6] = t.slabDir[3 * i + 2]; m[b + 7] = t.col[i];
      m[b + 8] = t.colDir[3 * i]; m[b + 9] = t.colDir[3 * i + 1]; m[b + 10] = t.colDir[3 * i + 2];
      mu[b + 11] = (t.colPlate[i] < 0 ? 0xffff : t.colPlate[i]) | ((t.colTop[i] < 0 ? 0xffff : t.colTop[i]) << 16);
    }
    this.device.queue.writeBuffer(this.b.mem, 0, m);
  }

  /** What the CPU changed since the last step: the plates rare events touched, frame cells, owners, memories. */
  pushChanges() {
    const d = this.tec.dirty, n = this.n;
    if (d.cells.size) {
      // Frame cells rewritten one by one, as they stand now, where their plate doesn't go up whole.
      const list = [...d.cells].filter(f => !d.plates.has(Math.floor(f / n)));
      if (list.length > this.cap) for (const f of list) d.plates.add(Math.floor(f / n));
      else if (list.length) {
        const u = new Uint32Array(8 * list.length), fl = new Float32Array(u.buffer);
        list.forEach((f, e) => {
          const p = this.tec.plates[Math.floor(f / n)], j = f % n;
          u[8 * e] = f; u[8 * e + 1] = p.mask[j];
          fl[8 * e + 4] = p.h[j]; fl[8 * e + 5] = p.phi[j]; fl[8 * e + 6] = p.tf[j]; fl[8 * e + 7] = p.sut[j];
        });
        this.device.queue.writeBuffer(this.b.pin, 0, u);
        this.uu[27] = list.length;
        this.patchPending = true;
      }
      d.cells.clear();
    }
    if (d.plates.size) {
      const words = new Uint32Array(this.n);
      let tb = 0;
      for (const k of d.plates) { this.pushFrame(this.tec.plates[k], words); tb |= 1 << k; }
      this.device.queue.writeBuffer(this.b.maskIn, 0, words);
      this.uu[25] = tb >>> 0;
      this.maskPending = true;
      d.plates.clear();
    }
    if (d.owner) { this.pushOwners(); d.owner = false; }
    if (d.mem) { this.pushMemory(); d.mem = false; }
  }

  /** The memories down (slab, arc, collision fronts), before the CPU runs a merge or an initiation. */
  async pullMemory() {
    const n = this.n, dev = this.device, buf = dev.createBuffer({ size: 48 * n, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST });
    const enc = dev.createCommandEncoder();
    enc.copyBufferToBuffer(this.b.mem, 0, buf, 0, 48 * n);
    dev.queue.submit([enc.finish()]);
    await buf.mapAsync(GPUMapMode.READ);
    const m = new Float32Array(buf.getMappedRange()), mu = new Uint32Array(m.buffer), t = this.tec;
    for (let i = 0; i < n; i++) {
      const b = 12 * i;
      t.slab[i] = m[b]; t.slabPlate[i] = mu[b + 1] === NONE ? -1 : mu[b + 1]; t.slabAge[i] = m[b + 2]; t.arc[i] = m[b + 3];
      t.slabDir[3 * i] = m[b + 4]; t.slabDir[3 * i + 1] = m[b + 5]; t.slabDir[3 * i + 2] = m[b + 6]; t.col[i] = m[b + 7];
      t.colDir[3 * i] = m[b + 8]; t.colDir[3 * i + 1] = m[b + 9]; t.colDir[3 * i + 2] = m[b + 10];
      const a = mu[b + 11] & 0xffff, c = mu[b + 11] >>> 16;
      t.colPlate[i] = a === 0xffff ? -1 : a; t.colTop[i] = c === 0xffff ? -1 : c;
    }
    buf.unmap(); buf.destroy();
  }

  /** Every frame down, as the next step will start from it (tests, and the rare step whose edits overflow). */
  async pullFrames() {
    const n = this.n, dev = this.device, tec = this.tec, np = tec.plates.length;
    this.pushChanges();
    const buf = dev.createBuffer({ size: 16 * n * np + 4 * n, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST });
    const enc = dev.createCommandEncoder();
    if (this.maskPending || this.patchPending) {
      this.device.queue.writeBuffer(this.U, 0, this.ub);
      const pass = enc.beginComputePass();
      if (this.maskPending) { const k = this.k.maskSet; pass.setPipeline(k.pipeline); pass.setBindGroup(0, k.group); pass.dispatchWorkgroups(Math.ceil(n / 64)); }
      if (this.patchPending) { const k = this.k.patch; pass.setPipeline(k.pipeline); pass.setBindGroup(0, k.group); pass.dispatchWorkgroups(Math.ceil(this.uu[27] / 64)); }
      pass.end();
      this.maskPending = this.patchPending = false;
    }
    enc.copyBufferToBuffer(this.b.crust, 0, buf, 0, 16 * n * np);
    enc.copyBufferToBuffer(this.b.mask, 0, buf, 16 * n * np, 4 * n);
    dev.queue.submit([enc.finish()]);
    await buf.mapAsync(GPUMapMode.READ);
    const c = new Float32Array(buf.getMappedRange(0, 16 * n * np)), w = new Uint32Array(buf.getMappedRange(16 * n * np, 4 * n));
    const out = tec.plates.map(p => ({ mask: new Uint8Array(n), h: new Float32Array(n), phi: new Float32Array(n), tf: new Float32Array(n), sut: new Float32Array(n), index: p.index }));
    for (const q of out) {
      const o = 4 * n * q.index;
      for (let j = 0; j < n; j++) { q.mask[j] = (w[j] >>> q.index) & 1; q.h[j] = c[o + 4 * j]; q.phi[j] = c[o + 4 * j + 1]; q.tf[j] = c[o + 4 * j + 2]; q.sut[j] = c[o + 4 * j + 3]; }
    }
    buf.unmap(); buf.destroy();
    return out;
  }


  /** The constants and the plates' rotations into the uniform buffer; `decay` false holds the memories (measure). */
  uniforms(dt, t1, decay = true) {
    const tec = this.tec, n = this.n, plates = tec.plates, u = this.uu, f = this.uf, res = tec.res, Pm = PARAMS;
    const ex = tau => decay ? Math.exp(-dt / tau) : 1, fs = tec.forceScales();
    u[0] = n; u[1] = plates.length; u[2] = tec.water > 0 ? 1 : 0; u[3] = this.cap;
    f.set([tec.t, t1, dt, res, Math.sqrt(4 * Math.PI / n), Pm.CLOSING, Pm.COLLIDE_FRAC, Pm.ARC_DH * res,
      Pm.ARC_DPHI * res, Pm.SLAB_MAX, ex(Pm.ARC_TAU), ex(Pm.SLAB_TAU),
      ex(Pm.COLLIDE_TAU), fs.kRidge, fs.kSlab, Pm.KEEL,
      Pm.K_COLLIDE, Pm.FOUNDER_AGE, tec.seaWater(), tec.seaLevel], 4);
    u[24] = SEG; u[26] = this.S;
    f[28] = fs.kTrench; f[29] = Pm.SLAB_CLOSING; f[30] = Pm.H_STACK; f[31] = contSlabAge();
    for (let k = 0; k < MAXP; k++) {
      const o = 32 + 16 * k, p = plates[k];
      if (!p) { f.fill(0, o, o + 16); continue; }
      const R = p.R;
      f[o] = R[0]; f[o + 1] = R[3]; f[o + 2] = R[6]; f[o + 4] = R[1]; f[o + 5] = R[4]; f[o + 6] = R[7];
      f[o + 8] = R[2]; f[o + 9] = R[5]; f[o + 10] = R[8]; f[o + 12] = p.w[0]; f[o + 13] = p.w[1]; f[o + 14] = p.w[2]; f[o + 15] = p.alive ? 1 : 0;
    }
    this.device.queue.writeBuffer(this.U, 0, this.ub);
  }

  /**
   * The step's closing sums (elevation, the sea level, kinematics, the balance) for the CPU's
   * current state as it stands, without stepping: for checking the GPU's sums against the CPU's.
   * The memories go up as the decay's input and are held (not decayed).
   */
  async measure() {
    const tec = this.tec, n = this.n, q = this.device.queue, b = this.b;
    this.pushOwners();
    this.pushMemory();
    const enc0 = this.device.createCommandEncoder();
    enc0.copyBufferToBuffer(b.mem, 0, b.memN, 0, 48 * n);
    q.submit([enc0.finish()]);
    q.writeBuffer(b.wh, 0, tec.h); q.writeBuffer(b.wphi, 0, tec.phi); q.writeBuffer(b.wtf, 0, tec.tf);
    const ls = new Float32Array(2 * n);
    for (let i = 0; i < n; i++) { ls[2 * i] = (tec.load ? tec.load[i] : 0) + (tec.flexc ? tec.flexc[i] : 0) + tec.trench[i] + tec.dyn[i]; ls[2 * i + 1] = tec.swell ? tec.swell[i] : 0; }
    q.writeBuffer(b.ls, 0, ls);
    q.writeBuffer(b.cnt, 0, new Uint32Array(NCNT));
    this.uniforms(0, tec.t, false);
    return this.finish(['chainInit', 'decay', 'elevation', 'kinematics', 'sea', 'founder', 'founderPick', 'contrib', 'reduce'], false);
  }

  /**
   * One step, t → t1, from the CPU's rotations (already turned): up, the dispatches, down. Returns the
   * sums the CPU finishes the step with: the sea level and land, the kinematics, the per-plate drag
   * matrices and torques, the collision tallies; the world fields, counters and frames are written.
   */
  async step(dt, t1) {
    const tec = this.tec, n = this.n, q = this.device.queue, b = this.b, f = Math.fround;
    this.t0 = performance.now();
    this.freshTf = f(f(t1) - f(0.5 * f(dt)));          // new crust's formation time, as the GPU's f32 makes it
    this.pushChanges();
    // The top cells as the CPU's frames hold them.
    const top = this.topBuf || (this.topBuf = new Float32Array(2 * n)), owner = tec.owner, ref = tec.ref, plates = tec.plates;
    for (let i = 0; i < n; i++) { const p = plates[owner[i]], j = ref[i]; top[2 * i] = p.h[j]; top[2 * i + 1] = p.phi[j]; }
    q.writeBuffer(b.top, 0, top);
    // The ice's load, the flexure's correction (src/engine/crustflex.js) and the trenches (Tectonics.trenches), at
    // the step's start: the CPU swaps in the moved crust's after (Tectonics.stepAsync); and the swells.
    {
      const ls = this.lsBuf || (this.lsBuf = new Float32Array(2 * n)), fc = tec.flexc, tr = tec.trench, dy = tec.dyn;
      for (let i = 0; i < n; i++) { ls[2 * i] = (tec.load ? tec.load[i] : 0) + (fc ? fc[i] : 0) + tr[i] + dy[i]; ls[2 * i + 1] = tec.swell ? tec.swell[i] : 0; }
      q.writeBuffer(b.ls, 0, ls);
    }
    q.writeBuffer(b.cnt, 0, this.zeros || (this.zeros = new Uint32Array(NCNT)));
    this.uniforms(dt, t1);
    return this.finish(['sync', 'decide', 'chainInit', 'chain', 'apply', 'relaxDecide', 'relaxApply', 'sample', 'decay', 'elevation', 'kinematics', 'sea', 'founder', 'founderPick', 'contrib', 'reduce', 'emit'], true);
  }

  /** Run the named kernels, then bring down the sums (and, for a step, the world and the frames' edits). */
  async finish(names, world) {
    const tec = this.tec, n = this.n, dev = this.device, np = tec.plates.length, q = dev.queue, b = this.b, plates = tec.plates;
    const enc = dev.createCommandEncoder(), pass = enc.beginComputePass(), x = Math.ceil(n / 64);
    const run = (name, gx = x, gy = 1) => { const k = this.k[name]; pass.setPipeline(k.pipeline); pass.setBindGroup(0, k.group); pass.dispatchWorkgroups(gx, gy); };
    if (this.maskPending) { run('maskSet'); this.maskPending = false; }
    if (this.patchPending) { run('patch', Math.ceil(this.uu[27] / 64)); this.patchPending = false; }
    for (const name of names) {
      if (name === 'sea') run(name, 1); else if (name === 'reduce') run(name, this.S, np);
      else if (name === 'decide') { run('decide1'); run('decide'); }
      else if (name === 'chain') for (let t = 0; t < this.chainPasses; t++) run(t & 1 ? 'chain' : 'chainAB');
      else if (name === 'founderPick') for (let t = 0; t < 6; t++) run(t & 1 ? 'founderPick' : 'founderAB');
      else run(name);
    }
    pass.end();
    const L = this.layout, st = this.staging;
    if (world) {
      enc.copyBufferToBuffer(b.oref, 0, st, L.oref, 8 * n);
      for (const k of ['wh', 'wphi', 'wtf', 'wsut', 'elev']) enc.copyBufferToBuffer(b[k], 0, st, L[k], 4 * n);
      enc.copyBufferToBuffer(b.edits, 0, st, L.edits, 32 * this.cap);
    }
    enc.copyBufferToBuffer(b.cnt, 0, st, L.cnt, 4 * NCNT);
    enc.copyBufferToBuffer(b.sea, 0, st, L.sea, 16);
    enc.copyBufferToBuffer(b.part, 0, st, L.part, 48 * np * this.S);
    q.submit([enc.finish()]);
    const t1 = performance.now();
    await st.mapAsync(GPUMapMode.READ);
    const t2 = performance.now();
    const map = st.getMappedRange();
    const cnt = new Uint32Array(map, L.cnt, NCNT).slice(), sea = Float32Array.from(new Float32Array(map, L.sea, 4));
    const part = new Float32Array(map, L.part, 12 * np * this.S);
    const M = new Float64Array(9 * np), T = new Float64Array(3 * np), area = new Float64Array(np), land = new Float64Array(np);
    for (let k = 0; k < np; k++) for (let s = 0; s < this.S; s++) {
      const e = 12 * (k * this.S + s);
      M[9 * k] += part[e]; M[9 * k + 1] += part[e + 1]; M[9 * k + 2] += part[e + 2]; M[9 * k + 4] += part[e + 3];
      M[9 * k + 5] += part[e + 4]; M[9 * k + 8] += part[e + 5]; area[k] += part[e + 6]; land[k] += part[e + 7];
      T[3 * k] += part[e + 8]; T[3 * k + 1] += part[e + 9]; T[3 * k + 2] += part[e + 10];
    }
    const ne = cnt[C_EDITS], overflow = world && ne > this.cap;
    if (world) {
      // The world as the step left it.
      const o = new Uint32Array(map, L.oref, 2 * n), owner = tec.owner, ref = tec.ref;
      for (let i = 0; i < n; i++) { owner[i] = o[2 * i]; ref[i] = o[2 * i + 1]; }
      tec.h.set(new Float32Array(map, L.wh, n)); tec.phi.set(new Float32Array(map, L.wphi, n));
      tec.tf.set(new Float32Array(map, L.wtf, n)); tec.sut.set(new Float32Array(map, L.wsut, n));
      tec.elev.set(new Float32Array(map, L.elev, n));
      // The frames' edits, into the CPU's plates, and their extras: a frame cell newly held, or
      // holding crust made this step (its formation time says so: a frame cell consumed and made
      // again within the step was held throughout), is new crust (the extras' defaults) unless
      // relaxation copied older crust into it, whose extras it takes (read before any edit lands);
      // a frame cell let go keeps nothing.
      const eu = new Uint32Array(map, L.edits, 8 * Math.min(ne, this.cap)), ef = new Float32Array(eu.buffer, eu.byteOffset, eu.length);
      const m = eu.length >> 3, was = this.wasBuf && this.wasBuf.length >= m ? this.wasBuf : (this.wasBuf = new Uint8Array(Math.max(m, 1024)));
      const carried = [], made = this.freshTf;
      for (let e = 0, c = 0; e < eu.length; e += 8, c++) {
        const fc = eu[e], k = Math.floor(fc / n), j = fc - k * n;
        was[c] = plates[k].mask[j];
        const src = eu[e + 2];
        if (src > 0 && ef[e + 6] !== made) { const ks = Math.floor((src - 1) / n), P = plates[ks], js = src - 1 - ks * n; carried.push(c, ...EXTRA.map(x => P[x][js])); }
      }
      for (let e = 0, c = 0; e < eu.length; e += 8, c++) {
        const fc = eu[e], k = Math.floor(fc / n), j = fc - k * n, p = plates[k];
        p.mask[j] = eu[e + 1]; p.h[j] = ef[e + 4]; p.phi[j] = ef[e + 5]; p.tf[j] = ef[e + 6]; p.sut[j] = ef[e + 7];
        if (!p.mask[j] || !was[c] || p.tf[j] === made) freshExtras(p, j);
      }
      for (let a = 0, w = 1 + EXTRA.length; a < carried.length; a += w) {
        const e = 8 * carried[a], fc = eu[e], k = Math.floor(fc / n), j = fc - k * n, p = plates[k];
        if (p.mask[j]) EXTRA.forEach((x, d) => { p[x][j] = carried[a + 1 + d]; });
      }
    }
    st.unmap();
    // Where a step's time goes (ms, summed until read): up and dispatch, waiting on the GPU, down.
    const p = this.prof || (this.prof = { up: 0, wait: 0, down: 0, steps: 0 });
    if (world) { p.up += t1 - this.t0; p.wait += t2 - t1; p.down += performance.now() - t2; p.steps++; }
    if (overflow) {
      // The frames whole (the extras of cells newly held start fresh: where they came from is lost).
      for (const g of await this.pullFrames()) {
        const p = plates[g.index];
        for (let j = 0; j < n; j++) if (g.mask[j] && !p.mask[j]) freshExtras(p, j);
        p.mask.set(g.mask); p.h.set(g.h); p.phi.set(g.phi); p.tf.set(g.tf); p.sut.set(g.sut);
      }
    }
    return { sea: sea[0], land: sea[1] / (4 * Math.PI), open: sea[2], close: sea[3], M, T, area, plateLand: land, pairs: cnt.subarray(C_PAIRS, C_PAIRS + MAXP * MAXP),
      counts: { made: cnt[C_MADE], consumed: cnt[C_CONSUMED], collided: cnt[C_COLLIDED], relaxed: cnt[C_RELAXED], foundered: cnt[C_FOUNDERED], edits: ne } };
  }
}

export { MAXP };
