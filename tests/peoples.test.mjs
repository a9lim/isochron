// Peoples (src/engine/peoples.js) against their oracles: conformity's closed form; two peoples parted
// drift apart as E d² = 2Dσ²t; a continuum's identity distance grows as the log of the distance between
// places (Séguy's curve: a stepping-stone field in two dimensions); merging keeps people and their mean
// identity; people who change their way of life keep who they are; herders beside farmers stay apart
// while two farming peoples in one cell merge; and on a planet, the atoms hold each cell's people.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Peoples, conform, D_ID, PER } from '../src/engine/peoples.js';
import { PEOPLE } from '../src/engine/people.js';

const say = (...a) => console.log('  ', ...a);

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
const dist2 = (ids, a, b) => ids.d2(a, b);

test("conformity's closed form: the majority's share against the equation stepped finely", () => {
  const f = p => p * (1 - p) * (2 * p - 1);
  for (const [p0, r, T] of [[0.6, 0.02, 200], [0.3, 0.05, 80], [0.51, 0.01, 1000]]) {
    let p = p0;
    const h = T / 20000;
    for (let k = 0; k < 20000; k++) { const k1 = f(p), k2 = f(p + 0.5 * h * r * k1), k3 = f(p + 0.5 * h * r * k2), k4 = f(p + h * r * k3); p += h * r * (k1 + 2 * k2 + 2 * k3 + k4) / 6; }
    const c = conform(p0, r, T);
    assert.ok(Math.abs(c - p) < 1e-9, `p0 ${p0}, r ${r}, ${T} yr: closed form ${c}, stepped ${p}`);
    assert.ok(Math.abs(conform(conform(p0, r, T / 2), r, T / 2) - c) < 1e-12, 'two half steps make the whole');
  }
  assert.equal(conform(0.5, 0.1, 100), 0.5, 'an even split holds');
});

test('two peoples parted drift apart as E d² = 2Dσ²t', () => {
  // Two cells out of each other's reach, each its own atom from the same point: drift alone.
  const T = 3000, trials = 300, sig2 = PEOPLE.ID_SIG2;
  let sum = 0;
  for (let k = 0; k < trials; k++) {
    const pp = mock({ n: 2, seed: `parted-${k}` });
    pp.ids.seed([0, 1]);
    for (let t = 0; t < T; t += 500) pp.ids.step(500);
    sum += dist2(pp.ids, 0, PER);
  }
  const got = sum / trials, want = 2 * D_ID * sig2 * T;
  say(`after ${T} yr: E d² ${got.toFixed(3)} against 2Dσ²t ${want.toFixed(3)} (d ${Math.sqrt(got).toFixed(2)}: a language apart is 1)`);
  assert.ok(Math.abs(got / want - 1) < 0.1);
});

test("a continuum's identity distance grows as the log of the distance between places (Séguy's curve)", () => {
  // A torus of L×L places, each joined to its four neighbours, in contact's linear range (the pull's fall-off
  // far away) and without the media: a stepping-stone field, whose mean squared distance at lag r grows as
  // a + b ln r in two dimensions (Edwards and Wilkinson's, standard), not as a power of r.
  const L = 32, n = L * L, edges = [];
  for (let y = 0; y < L; y++) for (let x = 0; x < L; x++) { const c = y * L + x; edges.push([c, y * L + (x + 1) % L], [c, ((y + 1) % L) * L + x]); }
  const pp = mock({ n, edges, params: { D_CONT: 1e3, R_MEDIA: 0, ID_L0: 1e4, ID_LMAX: 1e9 } });
  pp.ids.seed(Array.from({ length: n }, (_, c) => c));
  const ids = pp.ids, lags = [1, 2, 4, 8, 16], acc = lags.map(() => 0);
  let samples = 0;
  for (let t = 0; t < 4e5; t += 200) {
    ids.step(200);
    if (t >= 2e5 && (t / 200) % 50 === 0) {
      samples++;
      lags.forEach((r, k) => { for (let y = 0; y < L; y++) for (let x = 0; x < L; x++) acc[k] += dist2(ids, (y * L + x) * PER, (y * L + (x + r) % L) * PER) / n; });
    }
  }
  const d2 = acc.map(a => a / samples), inc = d2.slice(1).map((v, k) => v - d2[k]);
  say(`mean d² at lags ${lags.join(', ')}: ${d2.map(v => v.toFixed(4)).join(', ')}; each doubling adds ${inc.map(v => v.toFixed(4)).join(', ')}`);
  // Each doubling of the distance adds about the same (a log); a power law would multiply it. (The last,
  // at half the torus, is short of it: the torus folds back.)
  for (let k = 1; k < 3; k++) assert.ok(Math.abs(inc[k] / inc[0] - 1) < 0.35, `doubling ${k}: ${inc[k]} against ${inc[0]}`);
  assert.ok(d2[3] / d2[0] < 3, 'eight times the distance is well under eight times the d² (not diffusive)');
});

test('merging keeps the people and their mean identity', () => {
  const pp = mock({ n: 2 }), ids = pp.ids, X = ids.X, W = ids.W;
  // Three peoples into one way of cell 1 (two slots): the nearest pair merges.
  const put = (s, w, x) => { W[s] = w; for (let i = 0; i < D_ID; i++) X[s * D_ID + i] = x[i] ?? 0; };
  const src = [[300, [0, 0]], [200, [2, 0]], [500, [0.4, 1]]], scratch = 0;
  let tot = 0;
  const mean = new Float64Array(D_ID);
  for (const [w, x] of src) { put(scratch, w, x); ids.add(1, 3, w, scratch); tot += w; for (let i = 0; i < D_ID; i++) mean[i] += w * (x[i] ?? 0); }
  const a = PER + 6, b = a + 1;
  assert.ok(Math.abs(W[a] + W[b] - tot) < 1e-9, 'people kept');
  for (let i = 0; i < D_ID; i++) assert.ok(Math.abs(W[a] * X[a * D_ID + i] + W[b] * X[b * D_ID + i] - mean[i]) < 1e-9, 'mean identity kept');
  assert.ok(Math.sqrt(dist2(ids, a, b)) > 1, 'the far one kept apart, the near two merged');
});

test('people who change their way of life keep who they are', () => {
  // A foragers' cell whose food turns to the fields: its people become farmers with their own identity.
  const pp = mock({ n: 1 }), ids = pp.ids;
  ids.seed([0]);
  for (let i = 0; i < D_ID; i++) ids.X[i] = 0.3 * (i + 1);
  pp.wol.set([0.2, 0, 0, 0.8, 0]);
  ids.advance(1);
  assert.ok(Math.abs(ids.W[6] / pp.Ntot[0] - 0.8) < 1e-9 && Math.abs(ids.W[0] / pp.Ntot[0] - 0.2) < 1e-9, 'the ways follow the food');
  assert.ok(Math.sqrt(dist2(ids, 0, 6)) < 0.05, 'the new farmers are the foragers they were');
});

test('herders beside farmers stay a people of their own; two farming peoples in one cell merge', () => {
  // One cell, half herders and half farmers, each a people 1.5 apart; among the farmers a second people,
  // 1.5 from the first, at 40%. Contact and conformity for 3 kyr (no drift).
  const pp = mock({ n: 1, wol: [0, 0.5, 0, 0.5, 0], params: { ID_SIG2: 0 } }), ids = pp.ids, W = ids.W, X = ids.X;
  const at = (s, w, x0) => { W[s] = w; X[s * D_ID] = x0; };
  at(2, 500, 1.5); at(6, 300, 0); at(7, 200, -1.5);
  ids.T[0] = 1000;
  for (let t = 0; t < 3000; t += 50) ids.step(50);
  const farmers = W[6] > W[7] ? 6 : 7;
  say(`after 3 kyr: herders and farmers ${Math.sqrt(dist2(ids, 2, farmers)).toFixed(2)} apart; the farmers' minority ${(W[13 - farmers] / (W[6] + W[7]) * 100).toExponential(1)}%`);
  assert.ok(Math.sqrt(dist2(ids, 2, farmers)) > 1, 'herders and farmers apart');
  assert.ok(!(W[13 - farmers] > 1e-6 * (W[6] + W[7])), "the farmers' minority is gone");
});
