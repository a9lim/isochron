// The people prototype (tools/people/model.mjs) against its oracles, on uniform synthetic planets:
// the Fisher front's speed, the spread's conservation, competitive exclusion, culture's
// equilibrium, the saddle-node threshold, and the hyperbola's t*.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildGrid } from '../src/grid/icosphere.js';
import { NZ } from '../src/engine/climate.js';
import { People, PEOPLE, taskLabor, industrialStep, newEconomy, demography, softMin, partialG, energyCES } from '../src/engine/people.js';

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
  const p = new People(uniformPlanet(5), { ...quiet, A_INV: 0, D0: 1e4, D_Z: 0, D_MAX: 1e9, NSUB_MAX: 1000 });
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
  const D = 1e4, r = PEOPLE.B_PRE - PEOPLE.D_LO, v0 = 2 * Math.sqrt(r * D), v = (r2 - r1) / (t2 - t1);
  // A pulled front from a steep start sits at v₀t − (3/2)√(D/r) ln t (Bramson, standard): over
  // [t₁, t₂] that slows it by (3/2)√(D/r) ln(t₂/t₁)/(t₂ − t₁), ~6.5 km/yr here; on the sphere its
  // curvature slows it by D cot(θ)/R, averaged over the arc it crosses.
  const th1 = r1 / R, th2 = r2 / R;
  const vTh = v0 - 1.5 * Math.sqrt(D / r) * Math.log(t2 / t1) / (t2 - t1) - D / R * Math.log(Math.sin(th2) / Math.sin(th1)) / (th2 - th1);
  assert.ok(Math.abs(v / vTh - 1) < 0.07, `front ${v.toFixed(1)} km/yr against ${vTh.toFixed(1)} (2√(rD) = ${v0.toFixed(1)}, less Bramson's delay and the curvature)`);
});

test('the spread keeps people', () => {
  const p = new People(uniformPlanet(4), { ...quiet, A_INV: 0, D0: 3e3, D_Z: 0 });
  const L = p.newLineage(null, 0, 0);
  L.N[7] = 1e4; L.N[100] = 3e3;
  p.capacity(L);
  for (let k = 0; k < 30; k++) p.diffuse(L, 50);
  let s = 0; for (let c = 0; c < p.nL; c++) s += L.N[c];
  assert.ok(Math.abs(s / 1.3e4 - 1) < 1e-6, `people ${s} against 13,000`);   // the leading edge's floor (1e-6 a cell) drops a little
});

test('the lineage with the higher capacity excludes the other', () => {
  const p = new People(uniformPlanet(3), { ...quiet, A_INV: 0, LAMBDA: 1e-12, D0: 0, ACC: 0 });
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
  const p = new People(uniformPlanet(4), { ...quiet, D0: 0, B_PRE: 1, D_LO: 0, L_C0: 1e9, ACC: 0, COPY: 0, RHO_R: 0, CAP_F: 1e12, ...params });
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

test('the task CES: its limits, its boundary and its derivative', () => {
  const close = (a, b, tol, what) => assert.ok(Math.abs(a / b - 1) < tol, `${what}: ${a} against ${b}`);
  close(taskLabor(100, 50, 0, 0.5).L, 100, 1e-12, 'no automatable tasks');
  close(taskLabor(100, 30, 0.5, 0.5).L, 130, 1e-12, 'AI within the automatable tasks adds');
  for (const sigma of [0.3, 1, 3]) {   // continuous where AI fills the automatable tasks
    const b = 0.4, edge = b / (1 - b) * 100;
    close(taskLabor(100, edge * (1 + 1e-9), b, sigma).L, taskLabor(100, edge, b, sigma).L, 1e-6, `the boundary at σ ${sigma}`);
  }
  close(taskLabor(100, 1e6, 0.5, 1e6).L, 1e6 + 100, 1e-3, 'σ → ∞: the sum');
  close(taskLabor(100, 1e12, 0.6, 0.5).L, Math.pow(0.4, 1 / (0.5 - 1)) * 100, 1e-3, 'σ < 1, β < 1: Baumol\'s bound');
  close(taskLabor(100, 1e4, 0.6, 1).L, Math.pow(1e4 / 0.6, 0.6) * Math.pow(100 / 0.4, 0.4), 1e-9, 'σ = 1: Cobb–Douglas');
  for (const sigma of [0.5, 1, 2]) {
    const A = 3e3, h = 1e-4 * A, d = (taskLabor(100, A + h, 0.7, sigma).L - taskLabor(100, A - h, 0.7, sigma).L) / (2 * h);
    close(taskLabor(100, A, 0.7, sigma).dLdA, d, 1e-5, `∂L/∂A at σ ${sigma}`);
  }
});

test('fixed capital settles at the Solow balance, K/Y = s/δ', () => {
  // Culture held below AI's (no compute), fossil carbon plenty: what's saved past energy's share
  // builds fixed capital, which settles where its saving matches its wear.
  const P = { ...PEOPLE, FOSSIL: 1e9 }, E = newEconomy(P), x = { Lh: 1e6, z: 8 };
  E.on = true; E.Kf = 1e5; E.Ke[0] = 1e6;
  let If = 0;
  for (let k = 0; k < 4000; k++) {
    industrialStep(E, x, 0.5, P);
    If = E.flows.f;   // what's saved for fixed capital (past energy, ordinary computing and the margins)
  }
  assert.ok(E.wc < 1e-3 && E.wr < 1e-3, `next to no AI compute or robots well below Z_AI (${E.wc.toExponential(2)}, ${E.wr.toExponential(2)})`);
  assert.ok(Math.abs(E.Kf * P.DELTA_F / If - 1) < 0.02, `K δ ${(E.Kf * P.DELTA_F).toExponential(3)} against what's saved for it ${If.toExponential(3)}`);
  const A = P.A_I0 * Math.exp(P.THETA_I * (x.z - P.Z_IND)), sf = If / E.Y;
  const Kstar = Math.pow(sf * A / P.DELTA_F, 1 / (1 - P.ALPHA)) * x.Lh;
  assert.ok(Math.abs(E.Kf / Kstar - 1) < 0.02, `K ${E.Kf.toExponential(3)} against (s A/δ)^{1/(1−α)} L ${Kstar.toExponential(3)}`);
  assert.ok(E.avail > 0.999, `energy meets demand (${E.avail})`);
});

test('fossil carbon is kept: burned is what the stock lost', () => {
  const P = { ...PEOPLE, FOSSIL: 50 }, E = newEconomy(P);
  E.on = true; E.Kf = 1e8; E.Ke[0] = 1e9;
  let burned = 0;
  for (let k = 0; k < 400; k++) { industrialStep(E, { Lh: 1e7, z: 8 }, 1, P); burned += E.burned; }
  assert.ok(Math.abs(burned - (50 - E.S)) < 1e-9, `burned ${burned} against the stock's loss ${50 - E.S}`);
  assert.ok(E.S < 50, 'some was burned');
});

test('soil under steady erosion settles at h₀ ln(P₀/E)', () => {
  const p = new People(uniformPlanet(3), { ...quiet });
  const Ef = new Float64Array(p.nL).fill(0.05);       // mm/yr, against production of 0.1 mm/yr at bare rock
  for (let k = 0; k < 300; k++) p.env.soil(1000, Ef);
  const want = 0.5 * Math.log(1e-4 / 5e-5);
  assert.ok(Math.abs(p.soil[0] / want - 1) < 1e-3, `soil ${p.soil[0].toFixed(4)} m against h₀ ln(P₀/E) = ${want.toFixed(4)}`);
});

test('births and deaths: zero growth at the food capacity before industry, the frontier at B − D, the transition in its order', () => {
  const P = PEOPLE, g = (N, K, yg) => { const h = 1e-3, r = demography(N, K, yg, h, P); return Math.log(r.N / N) / h; };
  assert.ok(Math.abs(g(1e6, 1e6, 0)) < 1e-6, `growth at the food capacity, pre-industrial: ${g(1e6, 1e6, 0)}`);
  assert.ok(Math.abs(g(1, 1e9, 0) - (P.B_PRE - P.D_LO)) < 1e-6, `a frontier grows at B_PRE − D_LO (${g(1, 1e9, 0)})`);
  assert.ok(g(2e6, 1e6, 0) < -0.05, `famine past the food capacity (${g(2e6, 1e6, 0)})`);
  // With industry's income: deaths fall first (growth rises), then births (growth falls).
  const rate = yg => { const r = demography(5e5, 1e6, yg, 1e-3, P); return { b: r.b, d: r.d, g: r.b - r.d }; };
  const e = rate(0), m = rate(6), l = rate(30);
  assert.ok(m.d < 0.6 * e.d && m.b > 0.9 * e.b, `at y_g 6 mortality has fallen (d ${m.d.toFixed(4)} against ${e.d.toFixed(4)}) and fertility not yet (b ${m.b.toFixed(4)})`);
  assert.ok(m.g > e.g + 0.005 && l.g < m.g - 0.01, `growth rises then falls: ${e.g.toFixed(4)}, ${m.g.toFixed(4)}, ${l.g.toFixed(4)}`);
  // Rich, in the long run: replacement (neither growing nor dying out).
  const rich = g(1, 1e9, 1e6);
  assert.ok(Math.abs(rich) < 2e-4, `a rich population, far from its food capacity, is stationary: ${rich.toExponential(2)}/yr`);
  // Exact over a long step: the fed side's logistic settles at its equilibrium (r/a).
  const r = demography(1e5, 1e6, 0, 5000, P);
  assert.ok(Math.abs(r.N / 1e6 - 1) < 1e-6, `settled at the food capacity: ${r.N}`);
});

test('the soft ceiling, the partial expectation and the energy CES at their limits', () => {
  const close = (a, b, tol, what) => assert.ok(Math.abs(a / b - 1) < tol, `${what}: ${a} against ${b}`);
  close(softMin(1e-3, 1, 1), 1e-3, 2e-3, 'well below the ceiling: linear');
  close(softMin(1e6, 1, 4), 1, 1e-6, 'well above: the ceiling');
  close(softMin(3, 2, 1), 1 / (1 / 3 + 1 / 2), 1e-12, 'p = 1 is the harmonic sum');
  // G(v) = E[(v − X)_+]: φ(0) at 0, v far above, nothing far below; and against a quadrature.
  close(partialG(0), 1 / Math.sqrt(2 * Math.PI), 1e-6, 'G(0)');
  close(partialG(6), 6, 1e-6, 'G far above');
  assert.ok(partialG(-6) < 1e-8, 'G far below');
  let q = 0; for (let x = -10; x < 10; x += 1e-3) q += Math.max(0, 0.7 - x) * Math.exp(-x * x / 2) / Math.sqrt(2 * Math.PI) * 1e-3;
  close(partialG(0.7), q, 1e-5, 'G(0.7) against a quadrature');
  // Energy: full energy gives what the factors could make; σ → 0 is Leontief; at σ 0.3 a third short costs little.
  close(energyCES(1, 0.3, 0.07), 1, 1e-12, 'full energy');
  close(energyCES(0.5, 1e-3, 0.07), 0.5, 0.01, 'σ → 0: Leontief (slowly: w^σ)');
  const h = energyCES(0.68, 0.3, 0.07);
  assert.ok(h > 0.9 && h < 1, `at σ 0.3, 68% of the energy makes ${h.toFixed(3)} of the output`);
});

test('a spread of harvests kills in famine years, and stores take it back', () => {
  const P = PEOPLE, d = (sigma, store) => { const r = demography(1e6, 1.05e6, 0, 1e-3, P, sigma, store); return r.famine; };
  assert.ok(d(0, 0) === 0 && d(1e-9, 0) === 0, 'no spread, no famine past the mean\'s');
  assert.ok(d(0.15, 0) > 1e-3, `a 15% spread near the food capacity starves some each year (${d(0.15, 0).toFixed(4)}/yr)`);
  assert.ok(d(0.15, 0.25) < 0.1 * d(0.15, 0), `a quarter-year's store takes most of it back (${d(0.15, 0.25).toExponential(2)})`);
  assert.ok(d(0.3, 0) > d(0.15, 0), 'more spread, more famine');
});

test('food and CO₂ capture are powered before output; off-world energy heats nothing; a preserved Earth keeps its heat budget', () => {
  const P = { ...PEOPLE, FOSSIL: 1e9 }, AREA = 4 * Math.PI * 6.371e6 ** 2;
  const fresh = () => { const E = newEconomy(P); E.on = true; E.Kf = 1e12; E.Ke = [1e10, 1e10, 1e10, 1e10]; return E; };
  const x = { Lh: 1e9, z: 13 };
  const E0 = industrialStep(fresh(), x, 0.01, P), sup = E0.Ef + E0.Er + E0.Eu + E0.Es;
  const E1 = industrialStep(fresh(), { ...x, Efood: 0.3 * sup, Ecdr: 0.1 * sup }, 0.01, P);
  assert.ok(Math.abs(E1.EfoodGot / (0.3 * sup) - 1) < 1e-9 && Math.abs(E1.EcdrGot / (0.1 * sup) - 1) < 1e-9, `food ${E1.EfoodGot} and capture ${E1.EcdrGot} met first`);
  assert.ok(E1.Y < E0.Y, `output pays for them (${E1.Y.toExponential(3)} against ${E0.Y.toExponential(3)})`);
  assert.ok(E0.Es > 0 && Math.abs(E0.heat - (E0.Ef + E0.Eu) / AREA) < 1e-12, `Earth's heat is fossil carbon's and fusion's alone (${E0.heat} W/m², off-world ${E0.Es.toExponential(2)} W)`);
  const Ep = industrialStep(fresh(), { ...x, ending: { aligned: true, preserve: true }, sA: 1 }, 0.01, P);
  assert.ok(Ep.heat <= P.HEAT_PRES * 1.0001 && Ep.Ef === 0, `preserved: heat ${Ep.heat} W/m² within ${P.HEAT_PRES}, no fossil carbon burned (${Ep.Ef})`);
  const Es = industrialStep(fresh(), { ...x, ending: { aligned: false, preserve: false }, sA: 1 }, 0.01, P);
  assert.ok(Es.capU > 50 * P.HEAT_MAX * AREA, `sacrificed: Earth's budget opens (${(Es.capU / AREA).toFixed(0)} W/m²)`);
});

test('a sea wider than HOPS is crossed by the long crossings, and a voyage settles the far shore', () => {
  // Level 4 (~480 km cells): land poleward of 35°, a sea ~8,000 km wide between (past HOPS's 6 cells).
  const f = uniformPlanet(4), g = f.grid;
  for (let i = 0; i < f.n; i++) if (Math.abs(g.pos[3 * i + 2]) < Math.sin(35 * Math.PI / 180)) f.elev[i] = -3;
  const p = new People(f, { ...quiet, Z_BOAT: 0, A_INV: 0, D0: 3e3, D_Z: 0 });
  const north = c => g.pos[3 * p.cells[c] + 2] > 0;
  let long = 0;
  for (let e = 0; e < p.F.m; e++) if (p.F.hop[e] > p.P.HOPS && north(p.F.a[e]) !== north(p.F.b[e])) long++;
  assert.ok(long >= 1, 'a long crossing joins the caps');
  assert.equal(p.components(() => true, 1e9).count, 1, 'one body across it at any reach');
  // The north settled at capacity with boats far beyond the gap: the south is reached only by a
  // voyage (the flux runs only between settled coasts), and then fills.
  const L = p.newLineage(null, 0, 0);
  for (let c = 0; c < p.nL; c++) L.Z[c] = 20;
  p.capacity(L);
  for (let c = 0; c < p.nL; c++) if (north(c)) L.N[c] = L.K[c];
  const south = () => { let s = 0; for (let c = 0; c < p.nL; c++) if (!north(c)) s += L.N[c]; return s; };
  assert.equal(south(), 0);
  runFixed(p, 20, 2000);
  assert.ok(south() > 1e3, `the south settled (${south().toFixed(0)} people)`);
});

test('the cities keep the people: the drawn people sum to the model\'s', () => {
  const p = new People(uniformPlanet(4), { ...quiet });
  const L = p.newLineage(null, 0, 0);
  p.capacity(L);
  for (let c = 0; c < p.nL; c++) { L.N[c] = L.K[c]; p.Ntot[c] = L.N[c]; p.f[c] = 0.3; p.ind[c] = c % 3 === 0 ? 1 : 0; }
  const out = p.drawn(), g = p.planet.grid;
  let model = 0, drawn = 0, urban = 0;
  for (let c = 0; c < p.nL; c++) { model += p.Ntot[c]; drawn += out[8 * p.cells[c]] * p.H.area[c]; urban += p.city[c]; }
  assert.ok(Math.abs(drawn / model - 1) < 1e-9, `drawn ${drawn.toExponential(4)} against ${model.toExponential(4)}`);
  assert.ok(urban > 0.2 * model && urban < 0.8 * model, `urban share ${(urban / model).toFixed(2)}`);
  void g;
});
