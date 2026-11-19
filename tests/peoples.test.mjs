// Peoples (src/engine/peoples.js) against their oracles, on identity's torus: two peoples parted drift
// apart as E d² = 4σ²t; a continuum's identity distance grows as the log of the distance between places
// (Séguy's curve: a stepping-stone field in two dimensions); a way's customs hold its people within
// σ²/2r a dimension of them; mixing averages near peoples (people and mean kept) and shifts far ones
// toward the larger; people who change their way of life keep who they are, a share of the way to its
// customs; herders beside farmers stay apart; a founder's kick where migrants settle an empty place.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Peoples, WAYS, wrap } from '../src/engine/peoples.js';
import { PEOPLE } from '../src/engine/people.js';

const say = (...a) => console.log('  ', ...a);
const S = PEOPLE.TOR;

/** A stand-in People: cells joined by `edges` (pairs), N people each, every way's food given (foragers by default). */
function mock({ n, edges = [], N = 1000, wol = [1, 0, 0, 0, 0], params = {}, seed = 'peoples', dx = 120 }) {
  const lists = Array.from({ length: n }, () => []);
  for (const [a, b] of edges) { lists[a].push(b); lists[b].push(a); }
  const off = new Int32Array(n + 1);
  for (let c = 0; c < n; c++) off[c + 1] = off[c] + lists[c].length;
  const m = off[n], E = { off, nb: new Int32Array(m), hop: new Uint8Array(m), slope: new Float64Array(m).fill(1), km: new Float64Array(m).fill(dx) };
  for (let c = 0; c < n; c++) lists[c].forEach((d, k) => { E.nb[off[c] + k] = d; });
  const w = new Float32Array(5 * n);
  for (let c = 0; c < n; c++) for (let k = 0; k < 5; k++) w[5 * c + k] = wol[k];
  const pp = { nL: n, Ntot: new Float64Array(n).fill(N), E, P: { ...PEOPLE, ...params }, planet: { seed }, wol: w, cityShare: null, zl: new Float64Array(n), dx, H: { area: new Float64Array(n).fill(dx * dx) } };
  pp.ids = new Peoples(pp);
  return pp;
}
const put = (ids, s, w, x, y) => { ids.W[s] = w; ids.X[2 * s] = ((x % S) + S) % S; ids.X[2 * s + 1] = ((y % S) + S) % S; };

test('two peoples parted drift apart as E d² = 4σ²t', () => {
  // Two cells out of each other's reach, each a foragers' point from the same place, their customs off: drift alone.
  const T = 3000, trials = 400, sig2 = PEOPLE.ID_SIG2;
  let sum = 0;
  for (let k = 0; k < trials; k++) {
    const pp = mock({ n: 2, seed: `parted-${k}`, params: { R_ATT: 0 } });
    pp.ids.seed([0, 1]);
    for (let t = 0; t < T; t += 500) pp.ids.step(500);
    sum += pp.ids.d2(0, WAYS);
  }
  const got = sum / trials, want = 4 * sig2 * T;
  say(`after ${T} yr: E d² ${got.toFixed(3)} against 4σ²t ${want.toFixed(3)} (d ${Math.sqrt(got).toFixed(2)}: a language apart is 1)`);
  assert.ok(Math.abs(got / want - 1) < 0.1);
});

test("a continuum's identity distance grows as the log of the distance between places (Séguy's curve)", () => {
  // A torus of L×L places, each joined to its four neighbours, in contact's linear range (the pull's fall-off
  // far away), without the media or the customs: a stepping-stone field, whose mean squared distance at lag
  // r grows as a + b ln r in two dimensions (Edwards and Wilkinson's, standard), not as a power of r.
  const L = 32, n = L * L, edges = [];
  for (let y = 0; y < L; y++) for (let x = 0; x < L; x++) { const c = y * L + x; edges.push([c, y * L + (x + 1) % L], [c, ((y + 1) % L) * L + x]); }
  const pp = mock({ n, edges, params: { D_CONT: 1e3, R_MEDIA: 0, R_ATT: 0, ID_L0: 1e4, ID_LMAX: 1e9 } });
  pp.ids.seed(Array.from({ length: n }, (_, c) => c));
  const ids = pp.ids, lags = [1, 2, 4, 8, 16], acc = lags.map(() => 0);
  let samples = 0;
  for (let t = 0; t < 4e5; t += 200) {
    ids.step(200);
    if (t >= 2e5 && (t / 200) % 50 === 0) {
      samples++;
      lags.forEach((r, k) => { for (let y = 0; y < L; y++) for (let x = 0; x < L; x++) acc[k] += ids.d2((y * L + x) * WAYS, (y * L + (x + r) % L) * WAYS) / n; });
    }
  }
  const d2 = acc.map(a => a / samples), inc = d2.slice(1).map((v, k) => v - d2[k]);
  say(`mean d² at lags ${lags.join(', ')}: ${d2.map(v => v.toFixed(4)).join(', ')}; each doubling adds ${inc.map(v => v.toFixed(4)).join(', ')}`);
  // Each doubling of the distance adds about the same (a log); a power law would multiply it. (The last,
  // at half the torus, is short of it: the torus folds back.)
  for (let k = 1; k < 3; k++) assert.ok(Math.abs(inc[k] / inc[0] - 1) < 0.35, `doubling ${k}: ${inc[k]} against ${inc[0]}`);
  assert.ok(d2[3] / d2[0] < 3, 'eight times the distance is well under eight times the d² (not diffusive)');
});

test("a way's customs hold its people within σ²/2r a dimension of them", () => {
  // Many places out of each other's reach, foragers at their customs' point, drifting under its pull (r):
  // an Ornstein–Uhlenbeck process, stationary at variance σ²/2r a dimension (standard).
  const n = 600, r = 1e-3, pp = mock({ n, params: { R_ATT: r } }), ids = pp.ids;
  ids.seed(Array.from({ length: n }, (_, c) => c));
  for (let t = 0; t < 2e4; t += 100) ids.step(100);
  let v = 0;
  for (let c = 0; c < n; c++) { const s = c * WAYS, dx = wrap(ids.X[2 * s] - ids.att[0], S), dy = wrap(ids.X[2 * s + 1] - ids.att[1], S); v += (dx * dx + dy * dy) / 2; }
  v /= n;
  const want = PEOPLE.ID_SIG2 / (2 * r);
  say(`variance about the customs' point ${v.toFixed(4)} a dimension against σ²/2r ${want.toFixed(4)}`);
  assert.ok(Math.abs(v / want - 1) < 0.12);
});

test('mixing averages near peoples and shifts far ones toward the larger', () => {
  const pp = mock({ n: 1 }), ids = pp.ids, X = ids.X, W = ids.W;
  // Near: 300 at (1, 1) take 100 at 0.05 away: people kept, the point at the people-weighted mean (γ ≈ 1).
  put(ids, 0, 300, 1, 1); ids.mix(0, 100, 1.05, 1);
  assert.ok(Math.abs(W[0] - 400) < 1e-9, 'people kept');
  assert.ok(Math.abs(X[0] - 1.0125) < 0.002 && Math.abs(X[1] - 1) < 1e-12, `the mean (${X[0]})`);
  // Far: 300 at 0 take 100 three away: γ near 2, so the point moves ~1/(1 + 3²) of the way, not a quarter.
  put(ids, 1, 300, 0, 0); ids.mix(1, 100, 3, 0);
  const moved = X[2] / 3;
  say(`300 take 100 three apart: the point moves ${(100 * moved).toFixed(1)}% of the way (a plain mean's 25%)`);
  assert.ok(moved > 0.08 && moved < 0.12);
  // Across the torus's seam: the shortest way round.
  put(ids, 2, 100, 7.9, 0); ids.mix(2, 100, 0.1, 0);
  assert.ok(Math.abs(wrap(X[4], S)) < 1e-9, `the midpoint the short way (${X[4]})`);
});

test('people who change their way of life keep who they are, a share of the way to its customs', () => {
  // A foragers' cell whose food turns to the fields: its people become farmers with their own identity,
  // moved F_CONV of the way toward the farmers' customs.
  const pp = mock({ n: 1, params: { R_ATT: 0, ID_SIG2: 0, R_CONT: 0, R_MEDIA: 0 } }), ids = pp.ids;
  ids.seed([0]);
  const x0 = ids.X[0], y0 = ids.X[1];
  pp.wol.set([0.2, 0, 0, 0.8, 0]);
  ids.advance(1);
  assert.ok(Math.abs(ids.W[3] / pp.Ntot[0] - 0.8) < 1e-9 && Math.abs(ids.W[0] / pp.Ntot[0] - 0.2) < 1e-9, 'the ways follow the food');
  const wx = x0 + PEOPLE.F_CONV * wrap(ids.att[6] - x0, S), wy = y0 + PEOPLE.F_CONV * wrap(ids.att[7] - y0, S);
  assert.ok(Math.abs(wrap(ids.X[6] - wx, S)) < 1e-9 && Math.abs(wrap(ids.X[7] - wy, S)) < 1e-9, 'the new farmers are the foragers they were, a share of the way to farming');
  assert.ok(Math.abs(wrap(ids.X[0] - x0, S)) < 1e-12, 'the foragers who stay are unmoved');
});

test('herders beside farmers stay a people of their own', () => {
  // One cell, half herders at their customs and half farmers at theirs (a half side apart), contact across
  // ways of life at X_WAY: 3 kyr without drift.
  const pp = mock({ n: 1, wol: [0, 0.5, 0, 0.5, 0], params: { ID_SIG2: 0 } }), ids = pp.ids, a = ids.att;
  put(ids, 1, 500, a[2], a[3]); put(ids, 3, 500, a[6], a[7]); ids.T[0] = 1000;
  const d0 = Math.sqrt(ids.d2(1, 3));
  for (let t = 0; t < 3000; t += 50) ids.step(50);
  const d = Math.sqrt(ids.d2(1, 3));
  say(`herders and farmers ${d0.toFixed(2)} apart, after 3 kyr ${d.toFixed(2)}`);
  assert.ok(d > 0.8 * d0);
});

test("a founder's kick where migrants settle an empty place", () => {
  // Migrants from a peopled place into an empty one, drift off: the new place's point is the old one's
  // plus a kick of ID_KICK a dimension (E d² = 2 ID_KICK); into a peopled place, none.
  let sum = 0, into = 0;
  const trials = 2000;
  for (let k = 0; k < trials; k++) {
    const pp = mock({ n: 3, seed: `kick-${k}` }), ids = pp.ids;
    ids.seed([0, 2]);
    ids.carry(0, 1, 100); sum += ids.d2(0, WAYS);
    ids.carry(0, 2, 100); into += ids.d2(0, 2 * WAYS);
  }
  const got = sum / trials, want = 2 * PEOPLE.ID_KICK;
  say(`settling: E d² ${got.toFixed(4)} against 2 × ID_KICK ${want.toFixed(4)}; into a peopled place ${(into / trials).toExponential(1)}`);
  assert.ok(Math.abs(got / want - 1) < 0.1);
  assert.ok(into / trials < 1e-20);
});
