// The people's model (src/engine/people.js) against its oracles, on uniform synthetic planets.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildGrid } from '../src/grid/icosphere.js';
import { NZ } from '../src/engine/climate.js';
import { People, PEOPLE, taskLabor, industrialStep, newEconomy, demography, fertility, wetBulb } from '../src/engine/people.js';

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
const quiet = { H_FARM: 0, Z_IND: 1e9, Z_AI: 1e9, Z_BOAT: 1e9, T_COLD0: -100, SIG_LUCK: 0 };
/** The people's arrays under one name (each cell's numbers, knowledge, capacity and minds). */
const pop = p => ({ N: p.Ntot, Z: p.zc, K: p.K, K2: p.K2, M: p.M });

/** Run with a fixed step, calling `each` after every step. */
function runFixed(p, dt, T, each = () => {}) { while (p.t < T - 1e-9) { p.step(Math.min(dt, T - p.t)); each(p); } }

test('a Fisher front spreads at 2√(rD), resolved', () => {
  // Level 5 (~240 km): D 10,000 km²/yr and r 0.02 put the front's width √(D/r) at ~700 km.
  const p = new People(uniformPlanet(5), { ...quiet, A_INV: 0, D0: 1e4, D_Z: 0, D_MAX: 1e9, NSUB_MAX: 1000 });
  const L = pop(p), g = p.planet.grid, i0 = p.cells[0];
  const dist = c => { const i = p.cells[c]; return R * Math.acos(Math.min(1, g.pos[3 * i] * g.pos[3 * i0] + g.pos[3 * i + 1] * g.pos[3 * i0 + 1] + g.pos[3 * i + 2] * g.pos[3 * i0 + 2])); };
  // Start from a settled disc (a front already formed: from one seeded cell the K/2 contour runs
  // ahead of 2√(rD) for centuries while the Gaussian's log correction shrinks).
  p.capacity();
  for (let c = 0; c < p.nL; c++) if (dist(c) < 1500) L.N[c] = L.K[c];
  const front = () => {   // the mean distance of the cells between 0.3 and 0.7 of capacity
    p.capacity(); let s = 0, w = 0;
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
  const L = pop(p);
  L.N[7] = 1e4; L.N[100] = 3e3;
  p.capacity();
  for (let k = 0; k < 30; k++) p.diffuse(50);
  let s = 0; for (let c = 0; c < p.nL; c++) s += L.N[c];
  assert.ok(Math.abs(s / 1.3e4 - 1) < 1e-6, `people ${s} against 13,000`);   // the leading edge's floor (1e-6 a cell) drops a little
});

test('a people at its capacity holds there before industry', () => {
  const p = new People(uniformPlanet(3), { ...quiet, A_INV: 0, LAMBDA: 1e-12, D0: 0 });
  p.capacity();
  for (let c = 0; c < p.nL; c++) p.Ntot[c] = p.K[c];
  runFixed(p, 20, 2000);
  p.capacity();
  let N = 0, K = 0; for (let c = 0; c < p.nL; c++) { N += p.Ntot[c]; K += p.K[c]; }
  assert.ok(Math.abs(N / K - 1) < 1e-6, `people at ${(N / K).toFixed(8)} of the capacity`);
});

test('two domains held equal stay equal: production and learning step for step (ideas, copying, migrants, trade)', () => {
  // Their sources and rates set alike (the luck fields are each their own: none here; learning's copying
  // by how alike two peoples are, production's not: none here).
  const same = { TILT: 0, W_WORK_P: PEOPLE.W_WORK, C_TRADE_L: PEOPLE.C_TRADE, D_BASE: Infinity, SIG_LUCK: 0, ID_COPY: 0 };
  const p = new People(uniformPlanet(3), { Z_IND: 1e9, Z_AI: 1e9, H_FARM: 1e-3, ...same }), g = p.planet.grid;
  p.capacity();
  for (let c = 0; c < p.nL; c++) { p.Ntot[c] = 0.8 * p.K[c]; p.zc[c] = p.zl[c] = 2.6 + 0.6 * g.pos[3 * p.cells[c] + 2]; }
  for (let k = 0; k < 60; k++) {
    p.step(40);
    for (let c = 0; c < p.nL; c++) if (p.zc[c] !== p.zl[c]) assert.fail(`step ${k}, cell ${c}: production ${p.zc[c]}, learning ${p.zl[c]}`);
  }
  assert.ok(p.packages.length > 0 && p.routes && p.routes.active.length > 1, 'farming and trade ran');
});

/** A uniform world held at its capacity, knowledge alone moving: the minds within reach at z = 0. */
function heldWorld(params) {
  const p = new People(uniformPlanet(3), { ...quiet, D0: 0, B_PRE: 1, D_LO: 0, L_S0: 1e9, L_SMAX: 1e9, COPY: 0, RHO_R: 0, CAP_F: 1e12, D_BASE: Infinity, TILT: 0, ...params });
  const L = pop(p);
  p.capacity();
  for (let c = 0; c < p.nL; c++) L.N[c] = L.K[c];
  const a = p.P.A_INV; p.P.A_INV = 0; p.step(1e-6); p.P.A_INV = a;   // one empty step fills M
  let M0 = 0, N0 = 0; for (let c = 0; c < p.nL; c++) { M0 += L.M[c] * L.N[c]; N0 += L.N[c]; }
  return { p, L, M0: M0 / N0, N0 };
}
const zMean = L => { let s = 0, w = 0; for (let c = 0; c < L.N.length; c++) { s += L.N[c] * L.Z[c]; w += L.N[c]; } return s / w; };

test('knowledge settles at A M/λ when capacity doesn\'t answer it', () => {
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
    assert.equal(w.p.tTip !== null, tips, 'the tip is the people\'s event: their mean knowledge past 1');
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
  // Knowledge held below AI's (no compute), fossil carbon plenty: what's saved past energy's share
  // builds fixed capital, which settles where its saving matches its wear. (At z 9: lower, the
  // physical work that builds power stations, B_POW e-fold per Z_BP below Z_AI, holds energy a
  // percent or two short of what industry's early TFP wants.)
  const P = { ...PEOPLE, FOSSIL: 1e9 }, E = newEconomy(P), x = { Lh: 1e6, z: 9 };
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

test('births and deaths: zero growth at the food capacity before industry, the frontier at B − D, replacement when rich', () => {
  const P = PEOPLE, g = (N, K, yg) => { const h = 1e-3, r = demography(N, K, yg, h, P); return Math.log(r.N / N) / h; };
  assert.ok(Math.abs(g(1e6, 1e6, 0)) < 1e-6, `growth at the food capacity, pre-industrial: ${g(1e6, 1e6, 0)}`);
  assert.ok(Math.abs(g(1, 1e9, 0) - (P.B_PRE - P.D_LO)) < 1e-6, `a frontier grows at B_PRE − D_LO (${g(1, 1e9, 0)})`);
  // Rich, in the long run: replacement (neither growing nor dying out).
  const rich = g(1, 1e9, 1e6);
  assert.ok(Math.abs(rich) < 2e-4, `a rich population, far from its food capacity, is stationary: ${rich.toExponential(2)}/yr`);
  // Exact over a long step: the fed side's logistic settles at its equilibrium (r/a).
  const r = demography(1e5, 1e6, 0, 5000, P);
  assert.ok(Math.abs(r.N / 1e6 - 1) < 1e-6, `settled at the food capacity: ${r.N}`);
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

test("realized years drawn as the closure's spread give the closure's famine", () => {
  // The famine's form: realized years with the closure's own distribution are the closure.
  const P = { ...PEOPLE };
  const K = 1, N = 1.02, sigma = 0.25, st = 0.1;
  const c0 = demography(N, K, 0, 10, P, sigma, st);
  const c1 = demography(N, K, 0, 10, P, sigma, st, 1, { phi: 1, m: 0, s: sigma });
  const ch = demography(N, K, 0, 10, P, sigma, st, 1, { phi: 0.5, m: 0, s: sigma });
  assert.ok(Math.abs(c1.famine / c0.famine - 1) < 1e-12 && Math.abs(ch.famine / c0.famine - 1) < 1e-12, 'the closure, whatever share');
});

test("game: logistic under the hunt, exact; held at 1 − h/R where it knew hominins, hunted out where it was naive", () => {
  const f = uniformPlanet(3);
  const p = new People(f, { ...quiet, A_INV: 0, D0: 0, D_Z: 0 });
  const L = pop(p);
  for (let c = 0; c < p.nL; c++) L.Z[c] = 5;   // foragers at full knowledge, as dense as it lets them be
  p.capacity();
  for (let c = 0; c < p.nL; c++) L.N[c] = L.K[c];
  const half = Math.floor(p.nL / 2);
  for (let c = 0; c < p.nL; c++) p.naive[c] = c < half ? p.P.NAIVE_CO : 1;
  // Without people the game's share is its own: logistic, exact over any step.
  const P = p.P, ez = Math.exp(5), PF = ez / (1 + (ez - 1) / P.CAP_F);
  for (let k = 0; k < 40; k++) p.stocks(100);
  for (const c of [0, half - 1]) {
    const rho = p.Ntot[c] / p.H.area[c], h = P.H_MEGA * P.NAIVE_CO * Math.min(3, rho / P.B0) * PF / P.CAP_F;
    assert.ok(h < P.R_MEGA && Math.abs(p.mega[c] - (1 - h / P.R_MEGA)) < 1e-3, `wary game holds at 1 − h/R: ${p.mega[c].toFixed(3)} against ${(1 - h / P.R_MEGA).toFixed(3)}`);
  }
  for (const c of [half, p.nL - 1]) assert.equal(p.mega[c], 0, 'naive game hunted out, and gone for good');
});

test('fishers live by lakes and rivers: a lakeshore, a floodplain and a coast of one productivity feed alike, a dry plain none', () => {
  // No sea: a lakeshore whose lake exports PS_REF (productivity one) and a river of productivity one (F_RIV ×
  // its floodplain share W_FP √Q/√area × Q/(Q + Q_RIVER)) feed B_SEA/2 a km², as a coast on a median sea does;
  // the dry plain beside them nothing.
  const f = uniformPlanet(3);
  f.lakeEx = new Float32Array(f.n);
  const p0 = new People(f, quiet), lakeC = 5, rivC = 40, dryC = 80, A = p0.H.area[rivC], i = c => p0.cells[c];
  const river = Q => PEOPLE.F_RIV * Math.min(PEOPLE.FP_MAX, PEOPLE.W_FP * Math.sqrt(Q / A)) * Q / (Q + PEOPLE.Q_RIVER);
  let lo = 0, hi = 1e7;
  for (let k = 0; k < 200; k++) { const m = 0.5 * (lo + hi); if (river(m) < 1) lo = m; else hi = m; }
  f.lakeEx[i(lakeC)] = PEOPLE.PS_REF;
  f.discharge[i(rivC)] = lo;
  const p = new People(f, quiet), H = p.H;
  for (const c of [lakeC, rivC]) assert.ok(Math.abs(H.bS[c] / (PEOPLE.B_SEA / 2) - 1) < 1e-6, `cell ${c}: the water's ${H.bS[c]} against ${PEOPLE.B_SEA / 2}`);
  assert.equal(H.bS[dryC], 0);
});

test('the check names where a number stops being finite (the page reports the first: src/engine/people-worker.js)', () => {
  const p = new People(uniformPlanet(3), quiet);
  p.seed();
  p.step(10);
  p.debug = true;
  const c = p.cells.findIndex((_, k) => p.Ntot[k] > 0);
  p.zl[c] = NaN;
  assert.throws(() => p.step(10), new RegExp(`zl\\[${c}\\] = NaN`));
});


test("migration settles where crowding against real income is even, a schooled border cuts it B_MIG-fold, and refugees are kept", () => {
  // One potential (batch 3d): people move down crowding against real income, N/(K + goods). The east earning
  // as much again as its food, the people settle at N ∝ K + goods. Then, west and east two states, both schooled,
  // the people crossing between them in a short step are B_MIG of those crossing where neither is a state.
  const P0 = { ...quiet, A_INV: 0, D0: 3e4, D_Z: 0, D_MAX: 1e9, K_CHAIN: 0, NSUB_MAX: 1000 };
  const p = new People(uniformPlanet(3), P0), L = pop(p), nL = p.nL, g = p.planet.grid, east = c => g.pos[3 * p.cells[c]] > 0;
  p.capacity();
  for (let c = 0; c < nL; c++) { L.N[c] = 0.5 * L.K[c]; p.goods[c] = east(c) ? L.K2[c] : 0; }
  for (let k = 0; k < 150; k++) p.diffuse(50);
  const u = Array.from({ length: nL }, (_, c) => L.N[c] / (L.K2[c] + p.goods[c]));
  assert.ok(Math.max(...u) / Math.min(...u) - 1 < 1e-3, `crowding against income from ${Math.min(...u)} to ${Math.max(...u)}`);
  const crossed = schooled => {
    const q = new People(uniformPlanet(3), P0), M = pop(q);
    q.capacity();
    for (let c = 0; c < nL; c++) { M.N[c] = (east(c) ? 0.2 : 0.8) * M.K[c]; q.goods[c] = 0; }
    if (schooled) { q.pol.d.fill(1); q.pol.nat.fill(1); for (let c = 0; c < nL; c++) { q.pol.id[3 * c] = east(c) ? 1 : 0; q.pol.s[3 * c] = 1; } }
    let e0 = 0; for (let c = 0; c < nL; c++) if (east(c)) e0 += M.N[c];
    q.diffuse(0.02);
    let e1 = 0; for (let c = 0; c < nL; c++) if (east(c)) e1 += M.N[c];
    return { q, moved: e1 - e0 };
  };
  const free = crossed(false).moved, { q, moved } = crossed(true);
  assert.ok(free > 0 && Math.abs(moved / free / PEOPLE.B_MIG - 1) < 0.02, `across the border ${moved.toFixed(1)} against ${free.toFixed(1)} free (× ${PEOPLE.B_MIG})`);
  // Refugees: those fleeing a place go to its land neighbours by their room, and no one is made or lost.
  const N0 = q.Ntot.reduce((a, b) => a + b, 0), c0 = 5, got = q.flee(c0, 100);
  assert.ok(got === 100 && Math.abs(q.Ntot.reduce((a, b) => a + b, 0) - N0) < 1e-6 * N0, `${got} housed`);
});

test('the wet bulb is the psychrometer\'s within Stull\'s ~1 K', () => {
  // The psychrometer's equation solved exactly, e_s(T_w) − γ p (T − T_w) = rh e_s(T) at sea level's pressure
  // (e_s Bolton's 1980 form, γ 6.6e-4 /K: standard), against Stull's fit over its range.
  const es = T => 6.112 * Math.exp(17.67 * T / (T + 243.5)), gp = 6.6e-4 * 1013.25;
  for (const T of [10, 20, 30, 40]) for (const rh of [0.2, 0.5, 0.9]) {
    let lo = -40, hi = T;
    for (let k = 0; k < 80; k++) { const m = 0.5 * (lo + hi); if (es(m) - gp * (T - m) > rh * es(T)) hi = m; else lo = m; }
    const want = 0.5 * (lo + hi), got = wetBulb(T, rh);
    assert.ok(Math.abs(got - want) < 1.1, `T ${T}, rh ${rh}: ${got.toFixed(2)} against ${want.toFixed(2)}`);
  }
});
