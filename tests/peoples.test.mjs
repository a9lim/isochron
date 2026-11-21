// Peoples (src/engine/peoples.js) on identity's torus: drift, the customs' hold, and mixing, against their oracles.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Peoples, WAYS, wrap } from '../src/engine/peoples.js';
import { PEOPLE } from '../src/engine/people.js';

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
  assert.ok(Math.abs(got / want - 1) < 0.1);
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
  assert.ok(moved > 0.08 && moved < 0.12);
  // Across the torus's seam: the shortest way round.
  put(ids, 2, 100, 7.9, 0); ids.mix(2, 100, 0.1, 0);
  assert.ok(Math.abs(wrap(X[4], S)) < 1e-9, `the midpoint the short way (${X[4]})`);
});
