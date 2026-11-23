// States (src/engine/polities.js) on a line of farming places: cohesion exactly, Boulding's radius, the border at
// equal power, the reach of power projected and nationalism's cut, the media's pull.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Polities, asabiya, KP } from '../src/engine/polities.js';
import { Peoples, wrap } from '../src/engine/peoples.js';
import { PEOPLE, People } from '../src/engine/people.js';


/** A stand-in People: n farming places on a line, N people each, cost c0 a step along it, reach L. */
function line({ n = 200, N = 1e4, c0 = 100, L = 2000, J = 0, at = 99, params = {} }) {
  const lists = Array.from({ length: n }, (_, c) => [c - 1, c + 1].filter(d => d >= 0 && d < n));
  const off = new Int32Array(n + 1);
  for (let c = 0; c < n; c++) off[c + 1] = off[c] + lists[c].length;
  const m = off[n], E = { off, nb: new Int32Array(m), hop: new Uint8Array(m), slope: new Float64Array(m).fill(1), km: new Float64Array(m).fill(100) };
  for (let c = 0; c < n; c++) lists[c].forEach((d, k) => { E.nb[off[c] + k] = d; });
  const P = { ...PEOPLE, R_FORM: 0, R_ASA: 0, D_ASA: 0, C_POL0: L, K_POL: 0, L_POLMAX: Infinity, K_EXIT: 0, K_RUG: 0, W_DEATH: 0, B_LOC: 0.05, COH0: 0.5, ...params };   // no frontier, no war's toll, cohesion ten times the resistance: the geometry alone
  const wol = new Float32Array(5 * n);
  for (let c = 0; c < n; c++) wol[5 * c + 3] = 1;
  const pp = {
    nL: n, P, E, t: 0, packages: [1], planet: { seed: 'polities' }, Ntot: new Float64Array(n).fill(N), K: new Float64Array(n).fill(N),
    zc: new Float64Array(n), zl: new Float64Array(n), ind: new Float32Array(n), city: null, wol, cityShare: null, dx: 100,
    H: { slope: new Float64Array(n), area: new Float64Array(n).fill(1e4) },
    goods: new Float64Array(n), works: new Float64Array(n), wk: { T: new Float64Array(n), C: new Float64Array(n), G: new Float64Array(n), R: new Float64Array(n) },
  };
  // Each place's catchment: the places within M of it along the line, itself first, the strait's cost J
  // added across it.
  const cost = (a, b) => Math.abs(a - b) * c0 + (Math.min(a, b) <= at && Math.max(a, b) > at ? J : 0), M = 60;
  const cof = new Int32Array(n + 1), cix = [], cc = [];
  for (let a = 0; a < n; a++) {
    const near = [];
    for (let b = Math.max(0, a - M); b <= Math.min(n - 1, a + M); b++) near.push(b);
    near.sort((x, y) => cost(a, x) - cost(a, y));
    for (const b of near) { cix.push(b); cc.push(cost(a, b)); }
    cof[a + 1] = cix.length;
  }
  pp.routes = {
    key: 1, nm: n, marketOf: Int32Array.from({ length: n }, (_, c) => c), nodeOf: Int32Array.from({ length: n }, (_, c) => c), ownCost: new Float32Array(n),
    catch: { off: cof, idx: Int32Array.from(cix), cS: Float32Array.from(cc), cI: Float32Array.from(cc) }, cost, reach: () => 0,
  };
  pp.ids = new Peoples(pp);
  for (let c = 0; c < n; c++) { pp.ids.W[5 * c + 3] = N; pp.ids.T[c] = N; }
  pp.pol = new Polities(pp);
  return pp;
}
/** A state founded at c holding the places within r of it (as `found` unites its catchment). */
const seat = (pol, c, r = 10) => { const k = pol.list.length; pol.found(c, 1); for (let b = c - r; b <= c + r; b++) if (b !== c) pol.claim(b, k, 1); return k; };
/** The share of each place held by polity k. */
const held = (pol, k, n) => Array.from({ length: n }, (_, c) => { for (let j = 0; j < KP; j++) if (pol.id[KP * c + j] === k) return pol.s[KP * c + j]; return 0; });
/** Where a profile falls through a half, from the left (interpolated). */
const half = (s, from = 0, dir = 1) => {
  for (let c = from; c >= 0 && c + dir >= 0 && c + dir < s.length; c += dir) if (s[c] >= 0.5 && s[c + dir] < 0.5) return c + dir * (s[c] - 0.5) / (s[c] - s[c + dir]);
  return NaN;
};

test('cohesion is the logistic with decay, exactly', () => {
  // dA/dt = a A (1 − A) − b A against a fine Euler integration, growing and decaying.
  for (const [a, b, A0] of [[0.02, 0.002, 0.3], [0.004, 0.01, 0.6], [0.01, 0.01, 0.2]]) {
    let A = A0;
    const dt = 1e-2;
    for (let t = 0; t < 500; t += dt) A += dt * (a * A * (1 - A) - b * A);
    const x = asabiya(A0, a, b, 500);
    assert.ok(Math.abs(x - A) < 1e-4, `${x} against ${A}`);
    assert.ok(Math.abs(asabiya(A0, a, b, 250) - asabiya(asabiya(A0, a, b, 100), a, b, 150)) < 1e-12, 'one step or two');
  }
});

test("a lone state's edge is where its power meets the region's (Boulding's radius)", () => {
  // A state's power at a place is its arms among the region × cohesion × e^{−x/L} from its capital, the
  // region's resistance B_LOC × all its arms, by one kernel: at a sharp edge on even land the state holds
  // half the region, so the edge is at x = L ln(cohesion/2B_LOC), whatever the state's size (in the sharp
  // limit, γ large: at γ 3 the edge is soft over ~L/γ, and a little nearer). On the line's places the half
  // a sharp edge holds is q/(1 + q), q = e^{−c₀/L}.
  const n = 200, c0 = 100, L = 1000, coh = 0.5, B = 0.05;   // every place's cohesion, held (no frontier acts: R_ASA, D_ASA none), and the resistance (line's)
  for (const r of [5, 25]) {
    const pp = line({ n, c0, L, params: { POL_G: 12 } }), pol = pp.pol;
    seat(pol, 100, r);
    for (let k = 0; k < 600; k++) { pol.advance(10); pp.t += 10; }
    const q = Math.exp(-c0 / L), s = held(pol, 0, n), right = half(s, 100, 1) - 100, left = 100 - half(s, 100, -1), want = L * Math.log(coh * q / ((1 + q) * B)) / c0;
    assert.ok(Math.abs(right - want) < 0.15 && Math.abs(left - want) < 0.15, `${right}, ${left} against ${want}`);
  }
});

test('the border between two states is where their projected powers are equal', () => {
  // Each holds half the region at the border, so there A₁ e^{−x₁/L} = A₂ e^{−x₂/L}: from the midpoint of
  // their capitals, (L/2) ln(A₁/A₂) toward the weaker cohesion, whatever their sizes (sharp limit).
  const n = 200, c0 = 100, L = 4000;
  for (const coh of [0.3, 0.5]) {
    const pp = line({ n, c0, L, params: { POL_G: 12 } }), pol = pp.pol;
    seat(pol, 60); seat(pol, 140);
    for (let c = 0; c < 100; c++) pol.S[c] = coh;
    for (let k = 0; k < 800; k++) { pol.advance(10); pp.t += 10; }
    const s0 = held(pol, 0, n), b = half(s0, 60, 1), q0 = pol.list[0], q1 = pol.list[1];
    const want = 100 + (L / 2) * Math.log(q0.coh / q1.coh) / c0;
    assert.ok(Math.abs(b - want) < 0.3, `${b} against ${want}`);
  }
});

test("power projected past a state's own people holds to LP ln(coh F/B), and a schooled people's resists strangers", () => {
  // A capital at one end, its own reach nil past it: a place far out is held only by the troops raised
  // there, F_PROJ of its region's arms × the state's cohesion × e^{−x/LP}, against its resistance B_LOC ×
  // the same arms, so the edge (half held, sharp γ) is at x* = LP ln(coh F k/B), k = (1 + K_KIN s)/(1 + K_KIN)
  // its people's likeness s to the capital's, × e^{−K_SELF (1 − s)} once schooled past Z_NAT (whose
  // cohesion's floor, the nation's, the state's then is).
  const n = 120, c0 = 100, LP = 3000, F = 0.5, B = 0.05, s = 0.5;
  for (const zl of [0, 20]) {
    const pp = line({ n, c0, L: 10, params: { POL_G: 12, F_PROJ: F, L_PROJ: LP, Z_PROJ: -10 } }), pol = pp.pol, ids = pp.ids, P = pp.P;
    pp.zl.fill(zl);
    for (let c = 0; c < n; c++) { ids.lead[c] = 5 * c + 3; ids.X[2 * (5 * c + 3)] = c ? P.D_SIM : 0; }   // likeness 1/(1 + 1) to the capital's
    seat(pol, 0, 0);
    for (let k = 0; k < 300; k++) { pol.advance(10); pp.t += 10; }
    const nat = 1 / (1 + Math.exp(-(zl - P.Z_NAT) / P.W_NAT)), k = (1 + P.K_KIN * s) / (1 + P.K_KIN) * Math.exp(-P.K_SELF * nat * (1 - s));
    const want = LP * Math.log(pol.list[0].coh * F * k / B) / c0, got = half(held(pol, 0, n), 1, 1);
    assert.ok(Math.abs(got - want) < 0.2, `schooled ${zl}: ${got} against ${want}`);
  }
});

test('within one pool, capital goes where it earns: income a worker e^{θΔz/(1−α)} apart, and a state takes N_TAX', () => {
  // Two places alike but for knowledge Δz: at the steady state the pool's investment holds φ ∝ A^{1/(1−α)} ℓ,
  // so output a worker is A φ^α ℓ^{−α} ∝ e^{θΔz/(1−α)}. Then a state holding the second sends N_TAX of its
  // output to its capital, the first.
  const P = { ...PEOPLE }, dz = 0.4, nL = 2;
  const pp = { P, nL, Ntot: Float64Array.of(1e6, 1e6), ind: Float32Array.of(1, 1), zc: Float64Array.of(7 + dz, 7), lfp: Float64Array.of(0.5, 0.5),
    kF: Float64Array.of(0.5, 0.5), kM: Float64Array.of(0.5, 0.5), goods: new Float64Array(nL), Out: new Float64Array(nL), fos: new Float64Array(nL),
    pol: { id: new Int32Array(KP * nL).fill(-1), s: new Float64Array(KP * nL), list: [] } };
  const E = { Y: 100, sA: 0, Ef: 0, lamE: 0, burned: 0, Kf: 50, Kc: 0, Kq: 0, Kr: 0 }, Lh = 1e6;
  for (let k = 0; k < 400; k++) { pp.goods.fill(0); People.prototype.regional.call(pp, E, Lh, 1, E.Kf, 0, 10); }
  const want = Math.exp(P.THETA_I * dz / (1 - P.ALPHA));
  assert.ok(Math.abs(pp.goods[0] / pp.goods[1] / want - 1) < 1e-6, `${pp.goods[0] / pp.goods[1]} against ${want}`);
  const y0 = pp.goods[0], y1 = pp.goods[1];
  pp.pol.list.push({ cap: 0 }); pp.pol.id[KP * 1] = 0; pp.pol.s[KP * 1] = 1;
  pp.goods.fill(0); People.prototype.regional.call(pp, E, Lh, 1, E.Kf, 0, 10);
  assert.ok(Math.abs(pp.goods[1] - (1 - P.N_TAX) * y1) < 1e-9 * y1 && Math.abs(pp.goods[0] - y0 - P.N_TAX * y1) < 1e-9 * y1);
});

test('states that meet keep apart in look, the smaller giving way', () => {
  // Three states of one look: 0–80 and 81–140 meet, 160–199 past a stateless gap meets neither. The middle
  // one, smaller than its neighbour, takes the look furthest from it (the opposite hue, another angle); the
  // others keep theirs.
  const pp = line({}), pol = pp.pol;
  seat(pol, 40, 40); seat(pol, 110, 29); seat(pol, 180, 19);
  pol.d.fill(1);
  pol.list.forEach((q, k) => Object.assign(q, { N: [3, 1, 2][k], hue: 2, ang: 1 }));
  pol.recolour();
  const [a, b, c] = pol.list.map(q => [q.hue, q.ang]);
  assert.deepEqual([a, c], [[2, 1], [2, 1]]);
  assert.ok(b[0] === 6 && b[1] !== 1, `${b}`);
});

test("the media pull a nation's places toward its capital, whatever the distance", () => {
  // Learning past the world's reach: the media's pull, R_MEDIA × (1 − e^{−(ℓ/L_WORLD)²}), is toward the
  // holders' capitals where a state holds a place (a9), so a place three apart (more than a family) closes
  // e-fold at that rate, not the contact's falloff; the world's mean would be the two points' midpoint.
  const pp = line({ n: 2, params: { R_CONT: 0, R_ATT: 0, R_STATE: 0, ID_SIG2: 0, ID_L0: 1e9, ID_LMAX: 1e9 } }), ids = pp.ids, pol = pp.pol, P = pp.P;
  pp.zl.fill(20);
  pol.found(0, 1);
  pol.id[KP * 1] = 0; pol.s[KP * 1] = 1; pol.d[0] = pol.d[1] = 1;
  ids.X[2 * (5 + 3)] = 3;
  ids.lead[0] = 3; ids.lead[1] = 5 + 3;
  const dt = 50, l = ids.idL(20), gam = P.R_MEDIA * (1 - Math.exp(-((l / P.L_WORLD) ** 2)));
  ids.advance(dt);
  const d1 = Math.abs(wrap(ids.X[2 * 8] - ids.X[2 * 3], P.TOR)), want = 3 * Math.exp(-gam * dt);
  assert.ok(Math.abs(d1 - want) < 1e-6, `${d1} against ${want}`);
});
