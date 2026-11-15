// The people prototype (tools/people/model.mjs) against its oracles, on uniform synthetic planets:
// the Fisher front's speed, the spread's conservation, competitive exclusion, culture's
// equilibrium, the saddle-node threshold, and the hyperbola's t*.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildGrid } from '../src/grid/icosphere.js';
import { NZ } from '../src/engine/climate.js';
import { People } from '../tools/people/model.mjs';

const R = 6371;
/** Every cell land, warm, wet, savanna-like and alike (zones all Aw). */
function uniformPlanet(level) {
  const grid = buildGrid(level), n = grid.n;
  const f = { seed: 'test', grid, n, elev: new Float32Array(n).fill(0.3), ice: new Float32Array(n), T12: new Float32Array(12 * n).fill(22),
    P12: new Float32Array(12 * n).fill(100), ft: new Float32Array(n).fill(0.3), fg: new Float32Array(n).fill(0.5), npp: new Float32Array(n).fill(0.4),
    zones: new Float32Array(NZ * n), runoff: new Float32Array(n).fill(0.3), discharge: new Float32Array(n), lake: new Float32Array(n),
    perma: new Float32Array(n), sigT: new Float32Array(n).fill(1) };
  for (let i = 0; i < n; i++) f.zones[NZ * i + 2] = 1;
  return f;
}
const quiet = { H_FARM: 0, S_BG: 0, V_G: 0, CHECK: 1e12, Z_IND: 1e9, Z_AI: 1e9, Z_BOAT: 1e9, T_COLD0: -100 };

/** Run with a fixed step, calling `each` after every step. */
function runFixed(p, dt, T, each = () => {}) { while (p.t < T - 1e-9) { p.step(Math.min(dt, T - p.t)); each(p); } }

test('a Fisher front spreads at 2√(rD), resolved', () => {
  // Level 5 (~240 km): D 10,000 km²/yr and r 0.02 put the front's width √(D/r) at ~700 km.
  const p = new People(uniformPlanet(5), { ...quiet, A_INV: 0, D0: 1e4, D_Z: 0, D_MAX: 1e9, R0: 0.02, NSUB_MAX: 1000 });
  const L = p.newLineage(null, 0, 0), g = p.planet.grid, i0 = p.cells[0];
  const dist = c => { const i = p.cells[c]; return R * Math.acos(Math.min(1, g.pos[3 * i] * g.pos[3 * i0] + g.pos[3 * i + 1] * g.pos[3 * i0 + 1] + g.pos[3 * i + 2] * g.pos[3 * i0 + 2])); };
  // Start from a settled disc (a front already formed: from one seeded cell the K/2 contour runs
  // ahead of 2√(rD) for centuries while the Gaussian's log correction shrinks).
  p.capacity(L);
  for (let c = 0; c < p.nL; c++) if (dist(c) < 1500) L.N[c] = L.K[c];
  const front = () => {   // the mean distance of the cells between 0.3 and 0.7 of capacity
    p.capacity(L); let s = 0, w = 0;
    for (let c = 0; c < p.nL; c++) { const u = L.N[c] / L.K[c]; if (u > 0.3 && u < 0.7) { s += dist(c); w++; } }
    return s / w;
  };
  runFixed(p, 2, 100); const r1 = front(), t1 = p.t;
  runFixed(p, 2, 250); const r2 = front(), t2 = p.t;
  const D = 1e4, r = 0.02, v0 = 2 * Math.sqrt(r * D), v = (r2 - r1) / (t2 - t1);
  // A pulled front from a steep start sits at v₀t − (3/2)√(D/r) ln t (Bramson, standard): over
  // [t₁, t₂] that slows it by (3/2)√(D/r) ln(t₂/t₁)/(t₂ − t₁), ~6.5 km/yr here; on the sphere its
  // curvature slows it by D cot(θ)/R, averaged over the arc it crosses.
  const th1 = r1 / R, th2 = r2 / R;
  const vTh = v0 - 1.5 * Math.sqrt(D / r) * Math.log(t2 / t1) / (t2 - t1) - D / R * Math.log(Math.sin(th2) / Math.sin(th1)) / (th2 - th1);
  assert.ok(Math.abs(v / vTh - 1) < 0.07, `front ${v.toFixed(1)} km/yr against ${vTh.toFixed(1)} (2√(rD) = ${v0.toFixed(1)}, less Bramson's delay and the curvature)`);
});

test('the spread keeps people', () => {
  const p = new People(uniformPlanet(4), { ...quiet, A_INV: 0, D0: 3e3, D_Z: 0, R0: 0 });
  const L = p.newLineage(null, 0, 0);
  L.N[7] = 1e4; L.N[100] = 3e3;
  for (let k = 0; k < 30; k++) p.diffuse(L, 50);
  let s = 0; for (let c = 0; c < p.nL; c++) s += L.N[c];
  assert.ok(Math.abs(s / 1.3e4 - 1) < 1e-6, `people ${s} against 13,000`);   // the leading edge's floor (1e-6 a cell) drops a little
});

test('the lineage with the higher capacity excludes the other', () => {
  const p = new People(uniformPlanet(3), { ...quiet, A_INV: 0, LAMBDA: 1e-12, D0: 0, R0: 0.02, ACC: 0 });
  const A = p.newLineage(null, 0, 0), B = p.newLineage(null, 0, 0);
  p.capacity(B);
  for (let c = 0; c < p.nL; c++) { A.Z[c] = 1; A.N[c] = 0.25 * B.K[c]; B.N[c] = 0.5 * B.K[c]; }
  runFixed(p, 20, 4000);
  let a = 0, b = 0, KA = 0;
  p.capacity(A);
  for (let c = 0; c < p.nL; c++) { a += A.N[c]; b += B.N[c]; KA += A.K[c]; }
  assert.ok(b / (a + b) < 0.01, `the weaker keeps ${(100 * b / (a + b)).toFixed(2)}%`);
  assert.ok(Math.abs(a / KA - 1) < 0.01, `the stronger at ${(a / KA).toFixed(3)} of its capacity`);
});

/** A uniform world held at its capacity, culture alone moving: the minds within reach at z = 0. */
function heldWorld(params) {
  const p = new People(uniformPlanet(4), { ...quiet, D0: 0, R0: 1, L_C0: 2e4, ACC: 0, COPY: 0, RHO_R: 0, CAP_F: 1e12, ...params });
  const L = p.newLineage(null, 0, 0);
  p.capacity(L);
  for (let c = 0; c < p.nL; c++) L.N[c] = L.K[c];
  const a = p.P.A_INV; p.P.A_INV = 0; p.step(1e-6); p.P.A_INV = a;   // one empty step fills M
  let M0 = 0, N0 = 0; for (let c = 0; c < p.nL; c++) { M0 += L.M[c] * L.N[c]; N0 += L.N[c]; }
  return { p, L, M0: M0 / N0, N0 };
}
const zMean = L => { let s = 0, w = 0; for (let c = 0; c < L.N.length; c++) { s += L.N[c] * L.Z[c]; w += L.N[c]; } return s / w; };

test('culture settles at A M/λ when capacity doesn\'t answer it', () => {
  const { p, L, M0 } = heldWorld({ THETA: 0, LAMBDA: 1e-3, A_INV: 1e-12 });
  runFixed(p, 50, 2e4);
  const z = zMean(L), zStar = 1e-12 * M0 / 1e-3;
  assert.ok(Math.abs(z / zStar - 1) < 0.01, `z ${z.toFixed(4)} against A M/λ = ${zStar.toFixed(4)}`);
});

test('the loop tips past A θ e M₀ = λ, and holds below it', () => {
  const lam = 1e-3;
  for (const [k, tips] of [[0.9, false], [1.1, true]]) {
    const w = heldWorld({ THETA: 1, LAMBDA: lam, A_INV: 0 });
    w.p.P.A_INV = k * lam / (Math.E * w.M0);
    runFixed(w.p, 20, 3e4);
    const z = zMean(w.L);
    if (tips) assert.ok(z > 5, `above the threshold z reached only ${z.toFixed(2)}`);
    else {
      // The lower root of k e^{x−1} = x.
      let x = 0; for (let it = 0; it < 200; it++) x = k * Math.exp(x - 1);
      assert.ok(Math.abs(z - x) < 0.03, `below the threshold z ${z.toFixed(3)} against the fixed point ${x.toFixed(3)}`);
    }
  }
});

test('without loss the loop runs as 1/(t* − t), t* = 1/(θ A M₀)', () => {
  const w = heldWorld({ THETA: 1, LAMBDA: 0, A_INV: 0, DZ_MAX: 0.01 });
  const tStar = 1e4;   // M ∝ N, so dz/dt starts at A M₀ = 1/t*: choose A for t* at 10 kyr
  w.p.P.A_INV = 1 / (tStar * w.M0);
  let tHit = null;
  while (tHit === null && w.p.t < 2 * tStar) {
    w.p.step(Math.min(50, 0.01 / Math.max(w.p.lastRate, 1e-9)));
    let N = 0; for (let c = 0; c < w.p.nL; c++) N += w.L.N[c];
    if (N > 100 * w.N0) tHit = w.p.t;
  }
  const want = tStar * (1 - 1 / 100);
  assert.ok(tHit !== null && Math.abs(tHit / want - 1) < 0.02, `N reached 100 N₀ at ${tHit && tHit.toFixed(0)} yr against ${want.toFixed(0)}`);
});
