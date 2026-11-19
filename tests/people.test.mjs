// The people prototype (tools/people/model.mjs) against its oracles, on uniform synthetic planets:
// the Fisher front's speed, the spread's conservation, competitive exclusion, culture's
// equilibrium, the saddle-node threshold, and the hyperbola's t*.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildGrid } from '../src/grid/icosphere.js';
import { NZ } from '../src/engine/climate.js';
import { People, PEOPLE, WORLDS, taskLabor, industrialStep, newEconomy, demography, softMin, partialG, energyCES, earthBots, fertility, migration } from '../src/engine/people.js';

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
  const e = rate(0), m = rate(3), l = rate(30);
  assert.ok(m.d < 0.6 * e.d && m.b > 0.8 * e.b, `at y_g 3 mortality has fallen (d ${m.d.toFixed(4)} against ${e.d.toFixed(4)}) and fertility not yet (b ${m.b.toFixed(4)})`);
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

test('ocean routes cross a wide ocean beside a strait, landing apart from it and from each other', () => {
  // Level 4 (~480 km cells): land poleward of 35°, an ocean ~7,800 km wide between, but for a
  // land bridge at 90° E cut by a one-cell strait: the short crossing joins the two, and the
  // routes cross the ocean elsewhere (the Atlantic beside Bering).
  const f = uniformPlanet(4), g = f.grid, s35 = Math.sin(35 * Math.PI / 180);
  const lon = i => Math.atan2(g.pos[3 * i + 1], g.pos[3 * i]) * 180 / Math.PI;
  for (let i = 0; i < f.n; i++) if (Math.abs(g.pos[3 * i + 2]) < s35 && !(Math.abs(lon(i) - 90) < 6 && Math.abs(g.pos[3 * i + 2]) > 0.08)) f.elev[i] = -3;
  const p = new People(f, { ...quiet, Z_BOAT: 0 });
  const north = c => g.pos[3 * p.cells[c] + 2] > 0, xyz = c => [0, 1, 2].map(k => g.pos[3 * p.cells[c] + k]);
  const far = [];
  for (let e = 0; e < p.F.m; e++) if (p.F.hop[e] > p.P.HOPS && north(p.F.a[e]) !== north(p.F.b[e])) far.push(e);
  assert.ok(far.length >= 2, `${far.length} routes across the ocean`);
  // Each route's landing in the south is at least D_ROUTE from the others' (each pair's routes).
  const land = far.map(e => xyz(north(p.F.a[e]) ? p.F.b[e] : p.F.a[e]));
  for (let a = 0; a < land.length; a++) for (let b = a + 1; b < land.length; b++) {
    const km = R * Math.acos(Math.min(1, land[a].reduce((s, v, k) => s + v * land[b][k], 0)));
    assert.ok(km >= p.P.D_ROUTE * 0.99, `landings ${km.toFixed(0)} km apart`);
  }
});

test('crops: leached soil lies fallow, the floodplain is cropped every year', () => {
  // Two halves alike but for the rain's drainage: the wet half's soil is leached (fertility
  // 1/(1 + leach/L_FERT)), so its farmed share is cropped only in part; a river's floodplain is
  // cropped whole and renewed by its floods.
  const f = uniformPlanet(4), g = f.grid;
  for (let i = 0; i < f.n; i++) if (g.pos[3 * i] > 0) f.runoff[i] = 2;
  const p = new People(f, { ...quiet });
  const P = p.P, H = p.H, leach = r => r * Math.exp((22 - 15) / P.T_LEACH);
  const wet = p.cells.findIndex(i => g.pos[3 * i] > 0.5), dry = p.cells.findIndex(i => g.pos[3 * i] < -0.5);
  assert.ok(Math.abs(H.phi[wet] - 1 / (1 + leach(2) / P.L_FERT)) < 1e-6 && Math.abs(H.phi[dry] - 1 / (1 + leach(0.3) / P.L_FERT)) < 1e-6, `fertility ${H.phi[wet].toFixed(3)}, ${H.phi[dry].toFixed(3)}`);
  p.f[wet] = 0.5; p.f[dry] = 0.5;
  assert.ok(Math.abs(p.cropped(wet) - 0.5 * H.phi[wet]) < 1e-9 && p.cropped(dry) > p.cropped(wet), `cropped ${p.cropped(wet).toFixed(3)} of 0.5 where leached`);
  // A river through the wet cell: its floodplain belt W_FP √Q km wide is cropped every year.
  f.discharge[p.cells[wet]] = 2e4; p.rates(f);
  const s = H.sfp[wet];
  assert.ok(Math.abs(s - Math.min(P.FP_MAX, P.W_FP * Math.sqrt(2e4) / Math.sqrt(H.area[wet]))) < 1e-9 && s > 0.1, `floodplain ${s.toFixed(3)}`);
  assert.ok(Math.abs(p.cropped(wet) - (s * H.phiFP[wet] + (0.5 - s) * H.phi[wet])) < 1e-9, 'the floodplain first, then the uplands');
});

test('heritable fertility: growth past replacement rises at V where room is slack, toward the frontier\'s, exactly at any step', () => {
  const P = PEOPLE, R = P.R_FRONT, V = P.V_FERT;
  // Fisher's theorem at the start: the rate rises at the additive variance.
  assert.ok(Math.abs(fertility(0, 1, 1e-3, P) / 1e-3 / V - 1) < 1e-3, 'dr/dt = V at r = 0');
  // r(t) = R (1 − e^{−V t/R}); one step or a thousand.
  let r = 0;
  for (let k = 0; k < 1000; k++) r = fertility(r, 1, 0.3, P);
  const exact = R * (1 - Math.exp(-V * 300 / R));
  assert.ok(Math.abs(r / exact - 1) < 1e-9 && Math.abs(fertility(0, 1, 300, P) / exact - 1) < 1e-12, `${r} against ${exact}`);
  assert.ok(Math.abs(fertility(0.01, 0, 100, P) - 0.01) < 1e-15, 'no slack, no selection');
});

test('migration: out as far as there is room off-world, back as far as Earth has room', () => {
  const P = PEOPLE;
  // A whole Earth with a crowded frontier: Earth refills to its room, and no further.
  const N = 9e9, S = 1e15, RE = 1e10;
  const m = migration(N, S, 2e15, RE, 1, 1, 10, P);
  assert.ok(m < 0 && Math.abs(N - m - RE) < 1, `back to Earth's room (${(N - m).toExponential(4)} against ${RE})`);
  // No room off-world and none on Earth: no one moves.
  assert.equal(migration(9e9, 1e12, 1e12, 9e9, 1, 1, 10, P), 0);
  // A failing Earth empties as fast as R_MIG, with room.
  const f = migration(1e10, 0, 1e20, 0, 1, 0, 1, P);
  assert.ok(Math.abs(f / (1e10 * (1 - Math.exp(-(P.R_VOL + P.R_MIG)))) - 1) < 1e-12, 'out at R_VOL + R_MIG when Earth fails');
});

test('Earth\'s robots: all of them before space opens; past it, the work its own economy needs, or its energy\'s share if more', () => {
  const P = PEOPLE, Lh = 3e9;
  assert.equal(earthBots(1e8, Lh, 0.01, 0, P), 1e8, 'nothing off-world before it opens');
  assert.equal(earthBots(1e8, Lh, 0.01, 1, P), 1e8, 'fewer than Earth\'s physical jobs: all on Earth');
  const pres = earthBots(1e18, Lh, 1e-12, 1, P);
  assert.ok(Math.abs(pres / (P.PHI * Lh) - 1) < 1e-6, `a preserved Earth keeps Φ Lh (${pres.toExponential(3)})`);
  const sac = earthBots(1e18, Lh, 1e-6, 1, P);
  assert.ok(Math.abs(sac / 1e12 - 1) < 1e-3, `a sacrificed Earth's industry its share of the energy (${sac.toExponential(3)})`);
});

test('Mercury is the swarm\'s and the belt the habitats\'; what\'s mined is what has stood', () => {
  const P = PEOPLE, mu = P.SIGMA_SW / P.S_AU;
  assert.ok(Math.abs(mu * P.L_SUN / 2.8e23 - 1) < 0.02, `the whole Sun takes ~2.8e23 kg (${(mu * P.L_SUN).toExponential(2)})`);
  assert.ok(P.M_MERC > mu * P.L_SUN && P.M_BELT < 0.01 * mu * P.L_SUN, 'Mercury builds the whole Sun\'s worth; the belt under 1%');
  const p = new People(uniformPlanet(3), quiet), E = p.econ;
  const cap = p.swarmRoom();
  assert.ok(cap < P.L_SUN && cap > 0.85 * P.L_SUN, `most of the Sun (${(cap / P.L_SUN).toFixed(3)})`);
  // Habitats from the belt: their room is the belt's mass over a person's habitat and its collector.
  p.offBots = 1e20; E.cs = 1e24; E.ApS = 1e20; E.Es = 1e24;
  const surf = p.worldRooms().surf, room = p.offRoom(E);
  assert.ok(Math.abs(room / softMin(1e24 / P.W_HAB, surf + P.M_BELT / (P.M_HAB + mu * P.W_HAB), 4) - 1) < 1e-12, 'the belt, not Mercury, houses people');
  p.space = 1e15;
  p.massBooks(E, 1);
  const hab = p.space - softMin(p.space, surf, 4), m1 = p.minedShares();
  assert.ok(Math.abs(m1.merc - mu * 1e24 / P.M_MERC) < 1e-12 && Math.abs(m1.belt - (P.M_HAB + mu * P.W_HAB) * hab / P.M_BELT) < 1e-12, `${JSON.stringify(m1)}`);
  assert.ok(p.src === 'asteroids', 'the habitats\' belt the larger draw here');
  assert.ok(p.swarmRoom() < cap, 'the habitats\' belt is the swarm\'s no longer');
  E.cs = 1e23; p.massBooks(E, 1);
  assert.ok(p.flow === 0 && p.minedShares().merc === m1.merc, 'a collector taken down is reused, not returned');
  // Where off-world people live sums to them.
  const off = p.offworld(), sum = Object.values(off).reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(sum / p.space - 1) < 1e-12 && off.habitats > 0 && WORLDS.every(w => off[w.k] > 0), 'every world and the habitats');
});

test('the probes: their reach, what\'s seen of it, and (aligned) the people at other stars', () => {
  const P = PEOPLE, p = new People(uniformPlanet(3), quiet);
  p.probeT = p.t - 900;
  let st = p.stars();
  assert.ok(Math.abs(st.reach - 450) < 1e-9 && Math.abs(st.seen - 300) < 1e-9 && Math.abs(st.n / (P.N_STAR * 4 / 3 * Math.PI * 450 ** 3) - 1) < 1e-12 && st.people === 0, `misaligned: no people (${JSON.stringify(st)})`);
  p.ending = { aligned: true, preserve: true }; p.room = 1e17; p.roomE = 0;
  // Young settlements are still their founders: ∫ n 4πd² N₀ e^{r(t − d/v)} dd, small r t.
  p.probeT = p.t - 2;
  st = p.stars();
  const v = P.V_PROBE, r = P.R_FRONT, t = 2, R = v * t, n0 = P.FOUNDERS_STAR;
  // ∫₀^R 4π d² e^{r(t − d/v)} dd, by parts
  const a = r / v, I = 4 * Math.PI * Math.exp(r * t) * (2 / a ** 3 - Math.exp(-a * R) * (R * R / a + 2 * R / a ** 2 + 2 / a ** 3));
  assert.ok(Math.abs(st.people / (P.N_STAR * n0 * I) - 1) < 1e-3, `${st.people.toExponential(4)} against ${(P.N_STAR * n0 * I).toExponential(4)}`);
});

test('lineages part: the divergence is from when the later of them left their last common ancestor', () => {
  const p = new People(uniformPlanet(3), quiet);
  const A = p.newLineage(null, 0, 1); p.t = 100e3;
  const B = p.newLineage(A, 100e3, 1); p.t = 300e3;
  const C = p.newLineage(A, 300e3, 1); p.t = 500e3;
  const D = p.newLineage(B, 450e3, 1);
  assert.equal(p.divergence(A, B), 400e3);
  assert.equal(p.divergence(B, A), 400e3);
  assert.equal(p.divergence(B, C), 400e3, 'siblings: from the earlier split');
  assert.equal(p.divergence(B, D), 50e3);
  assert.equal(p.divergence(C, D), 400e3);
});

test('Earth\'s room, aligned and past scarcity: an ecumenopolis on its living land', () => {
  const P = PEOPLE, p = new People(uniformPlanet(3), quiet);
  let A = 0;
  for (let c = 0; c < p.nL; c++) if (p.H.alive[c]) A += p.H.area[c];
  p.hE = 0.5;
  assert.ok(Math.abs(p.earthRoom(1) / (0.5 * P.D_ECU * A) - 1) < 1e-12 && p.earthRoom(0) === 0);
});

test("the harvest's years: the planet's realized years stand in for the closure's spread", async () => {
  // The famine's form: realized years with the closure's own distribution are the closure.
  const P = { ...PEOPLE };
  const K = 1, N = 1.02, sigma = 0.25, st = 0.1;
  const c0 = demography(N, K, 0, 10, P, sigma, st);
  const c1 = demography(N, K, 0, 10, P, sigma, st, 1, { phi: 1, m: 0, s: sigma });
  const ch = demography(N, K, 0, 10, P, sigma, st, 1, { phi: 0.5, m: 0, s: sigma });
  assert.ok(Math.abs(c1.famine / c0.famine - 1) < 1e-12 && Math.abs(ch.famine / c0.famine - 1) < 1e-12, 'the closure, whatever share');
  const dry = demography(N, K, 0, 10, P, sigma, st, 1, { phi: 1, m: -0.2, s: 0.1 });
  const wet = demography(N, K, 0, 10, P, sigma, st, 1, { phi: 1, m: 0.2, s: 0.1 });
  assert.ok(dry.famine > 1.5 * c0.famine && wet.famine < c0.famine, `a dry decade ${dry.famine.toFixed(4)} against the closure's ${c0.famine.toFixed(4)} and a wet one's ${wet.famine.toFixed(4)}`);

  // The year's live statistics against the closure the people read: over land, a year's mean T′
  // spreads as σ√mem, its log-rain unit as √(ρ² mem + (1 − ρ²)/12), correlated ρ√(mem/(ρ² mem + (1 − ρ²)/12)).
  const { Year, YEAR } = await import('../src/engine/year.js');
  const { HarvestYears } = await import('../src/engine/peoplelink.js');
  const g = buildGrid(4), n = g.n;
  const landMask = Uint8Array.from({ length: n }, (_, i) => g.pos[3 * i + 2] > 0.3 ? 1 : 0);
  const c = { grid: g, landMask, snowAnn: new Float32Array(n), stats: { cycles: 3 },
    Pf: [new Float32Array(n).fill(2), ...Array.from({ length: 4 }, () => new Float32Array(n))] };
  const y = new Year(c, null, 'harvest'), h = new HarvestYears(y);
  for (let t = 0; t <= 40; t += 1 / 24) y.advance(t, 1);   // spun up
  h.take();
  for (let t = 40; t <= 640; t += 1 / 24) y.advance(t, 1);
  const m = h.take();
  let eT = 0, eZ = 0, eC = 0, w = 0, yrs = 0;
  for (let i = 0; i < n; i++) {
    if (!y.land[i] || y.land[i] < 0.99) continue;
    const W = m[6 * i]; yrs = W;
    const mz = m[6 * i + 1] / W, vz = m[6 * i + 2] / W - mz * mz, mt = m[6 * i + 3] / W, vt = m[6 * i + 4] / W - mt * mt, cz = m[6 * i + 5] / W - mz * mt;
    const rho = YEAR.RHO_LAND, mem = y.mem[i], sT = y.sigma[i] * Math.sqrt(mem), sZ = Math.sqrt(rho * rho * mem + (1 - rho * rho) / 12);
    eT += Math.log(Math.sqrt(vt) / sT) ** 2; eZ += Math.log(Math.sqrt(vz) / sZ) ** 2; eC += (cz / Math.sqrt(vz * vt) - rho * Math.sqrt(mem) / sZ) ** 2; w++;
  }
  assert.ok(w > 50 && yrs > 590, `${w} land cells, ${yrs.toFixed(0)} years`);
  const rT = Math.sqrt(eT / w), rZ = Math.sqrt(eZ / w), rC = Math.sqrt(eC / w);
  assert.ok(rT < 0.2 && rZ < 0.15 && rC < 0.12, `a year's T′ spread off the closure by ${(100 * rT).toFixed(0)}% rms, its rain's by ${(100 * rZ).toFixed(0)}%, their correlation by ${rC.toFixed(3)}`);
  // Outrun: no years.
  for (let t = 640; t <= 2e4; t += 100) y.advance(t, 3e3);
  assert.equal(h.take(), null, 'outrun: nothing to take');
  h.detach(); assert.equal(y.hooks.length, 0);

  // The people take them: a dry run of years where farmers are crowded is a famine there.
  const f = uniformPlanet(4);
  f.sigP = new Float32Array(f.n).fill(0.2); f.sigTy = new Float32Array(f.n).fill(0.4);
  const run = years => {
    const p = new People(f, { ...quiet, A_INV: 0, D0: 0, D_Z: 0 });
    const L = p.newLineage(null, 0, 0);
    p.capacity(L); for (let k = 0; k < p.nL; k++) L.N[k] = 1.05 * L.K[k];
    if (years) p.addYears(years, 4);
    p.step(10);
    return p.famine;
  };
  const dryYears = new Float32Array(6 * n);
  for (let i = 0; i < n; i++) { dryYears[6 * i] = 10; dryYears[6 * i + 1] = -10 * 1.5; dryYears[6 * i + 2] = 10 * 2.5; }   // a decade a 1.5σ drought in the rain's unit
  const base = run(null), drought = run(dryYears);
  assert.ok(drought > 2 * base, `famine ${drought.toExponential(2)} in a drought's decade against ${base.toExponential(2)} without`);
});

test("the stocks: game hunted out where it never met hominins, held where it did; fish taken past their regrowth by industry's fleets", () => {
  const f = uniformPlanet(3);
  const p = new People(f, { ...quiet, A_INV: 0, D0: 0, D_Z: 0 });
  const L = p.newLineage(null, 0, 0);
  for (let c = 0; c < p.nL; c++) L.Z[c] = 5;   // foragers at full culture, as dense as it lets them be
  p.capacity(L);
  for (let c = 0; c < p.nL; c++) L.N[c] = L.K[c];
  p.zc = Float64Array.from(L.Z);
  p.Ntot.set(L.N);
  const half = Math.floor(p.nL / 2);
  for (let c = 0; c < p.nL; c++) { p.met[c] = 1; p.naive[c] = c < half ? p.P.NAIVE_CO : 1; }
  // Without people the game's share is its own: logistic, exact over any step.
  const P = p.P, ez = Math.exp(5), PF = ez / (1 + (ez - 1) / P.CAP_F);
  for (let k = 0; k < 40; k++) p.stocks(100, [L]);
  for (const c of [0, half - 1]) {
    const rho = p.Ntot[c] / p.H.area[c], h = P.H_MEGA * P.NAIVE_CO * Math.min(3, rho / P.B0) * PF / P.CAP_F;
    assert.ok(h < P.R_MEGA && Math.abs(p.mega[c] - (1 - h / P.R_MEGA)) < 1e-3, `wary game holds at 1 − h/R: ${p.mega[c].toFixed(3)} against ${(1 - h / P.R_MEGA).toFixed(3)}`);
  }
  for (const c of [half, p.nL - 1]) assert.equal(p.mega[c], 0, 'naive game hunted out, and gone for good');
  // The coast's fish: the cells have no sea here, so give one a coast's and run industry's fleets over it.
  p.H.bS[0] = 0.02; p.fish[0] = 1; p.ind[0] = 0;
  for (let k = 0; k < 100; k++) p.stocks(10, [L]);
  const pre = p.fish[0];
  assert.ok(pre > 0.85 && pre < 1, `before industry the fish hold near their own (${pre.toFixed(3)})`);
  p.ind[0] = 1; p.zc[0] = P.Z_IND;
  for (let k = 0; k < 10; k++) p.stocks(5, [L]);
  assert.ok(p.fish[0] < 0.5 * pre, `fifty years of industry's fleets: ${p.fish[0].toFixed(3)}`);
  const low = p.fish[0];
  p.zc[0] = P.Z_IND + 1 + 4 * P.Z_CONS;   // culture's care eases the take: they come back
  for (let k = 0; k < 20; k++) p.stocks(5, [L]);
  assert.ok(p.fish[0] > low, `and recover as the take eases (${p.fish[0].toFixed(3)})`);
});

test("the sea feeds a desert coast, and herders hold the grass the plough can't, where winter allows", () => {
  const f = uniformPlanet(4), n = f.n, g = f.grid;
  // A dry, cold-wintered grassland: no farming, little to forage; one band of it on a productive coast.
  f.P12.fill(15); f.ft.fill(0.02); f.fg.fill(0.6); f.npp.fill(0.3);
  for (let i = 0; i < n; i++) for (let m = 0; m < 12; m++) f.T12[12 * i + m] = 8 + 14 * Math.cos(2 * Math.PI * (m - 6) / 12);   // −6 °C winters
  f.sea = new Float32Array(n);
  const coastal = new Set();
  for (let i = 0; i < n; i++) if (g.pos[3 * i + 2] < -0.9) f.elev[i] = -1;   // a polar sea
  for (let i = 0; i < n; i++) if (f.elev[i] > 0) for (let o = g.nbrOff[i]; o < g.nbrOff[i + 1]; o++) if (f.elev[g.nbr[o]] <= 0) { coastal.add(i); f.sea[i] = 30; }
  const p = new People(f, { ...quiet });
  const inland = p.cells.findIndex(i => !coastal.has(i)), coast = p.cells.findIndex(i => coastal.has(i));
  assert.ok(p.H.bS[coast] > 0.5 * p.P.B_SEA && p.H.bS[inland] === 0, `the coast's sea feeds ${p.H.bS[coast].toFixed(4)} a km²`);
  assert.ok(p.H.bS[coast] > p.H.bL[coast], 'more than its dry land does');
  // Herding, once known and with animals (their herds full), holds more than foraging there.
  const L = p.newLineage(null, 0, 0);
  for (let c = 0; c < p.nL; c++) L.Z[c] = p.P.Z_HERD + 1;
  p.capacity(L); const Kf = L.K[inland];
  p.anim.fill(1); p.herdM.fill(1);
  p.capacity(L); const Kh = L.K[inland];
  assert.ok(Kh > 2 * Kf, `herders ${Kh.toFixed(0)} against foragers' ${Kf.toFixed(0)}`);
  // Deep snow in winter and nowhere milder within reach: the herds have no winter.
  for (let i = 0; i < n; i++) for (let m = 0; m < 12; m++) { f.T12[12 * i + m] -= 14; f.P12[12 * i + m] = 40; }
  const q = new People(f, { ...quiet });
  assert.ok(q.H.herd[inland] < 0.2 * p.H.herd[inland], `a snowbound winter keeps ${(100 * q.H.herd[inland] / p.H.herd[inland]).toFixed(0)}% of the herds`);
});

test('a pause: a third of the draws, the frontier held where it stands, none of the misaligned or aligned branches', async () => {
  const { capability } = await import('../src/engine/people.js');
  const f = uniformPlanet(3);
  let n = { 1: 0, 2: 0, 3: 0 };
  for (let k = 0; k < 600; k++) {
    const p = new People({ ...f, seed: `pause-${k}` }, { ...quiet });
    p.econ.x = 0.5; p.drawEnding(); n[p.ending.code[0]]++;
    if (p.ending.paused) assert.equal(p.P.X_CAP, 0.5); else assert.equal(p.P.X_CAP, undefined);
  }
  for (const k of [1, 2, 3]) assert.ok(Math.abs(n[k] / 600 - 1 / 3) < 0.07, `ending ${k}: ${n[k]} of 600`);
  const p = new People(f, { ...quiet, ENDING: '3b' });
  p.econ.x = 1.2; p.drawEnding();
  assert.deepEqual([p.ending.code, p.ending.paused, p.ending.aligned, p.ending.preserve], ['3b', true, false, true]);
  // Capability past the cap is the cap's: compute and culture keep growing, the frontier doesn't.
  const held = { ...PEOPLE, X_CAP: p.P.X_CAP };
  const a = capability(1e12, PEOPLE.Z_AI + 0.5, held), b = capability(1e15, PEOPLE.Z_AI + 2, held), free = capability(1e15, PEOPLE.Z_AI + 2, PEOPLE);
  assert.ok(a.x <= 1.2 + 1e-12 && Math.abs(b.x - 1.2) < 1e-12 && free.x > 1.2 && b.bc === capability(1e20, PEOPLE.Z_AI + 3, held).bc);
});
