// Herds as a stock (docs/people.md, "Food, years, ages and works"): animals domesticated where the
// large game survived a farming origin, passed by contact; the herd a share of what the land keeps,
// logistic less its die-offs, a dzud's toll rebuilt over years; herders need animals, and mixed
// farming's animals manure the fields and pull the plough.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildGrid } from '../src/grid/icosphere.js';
import { NZ } from '../src/engine/climate.js';
import { People, PEOPLE, partialG } from '../src/engine/people.js';

const P = PEOPLE;
/** Every cell land and alike: `T` and `Pm` the month's temperature (°C) and rain (mm). */
function planet(T, Pm, level = 3, zone = 5) {
  const grid = buildGrid(level), n = grid.n;
  const f = { seed: 'test', grid, n, elev: new Float32Array(n).fill(0.3), ice: new Float32Array(n), T12: new Float32Array(12 * n),
    P12: new Float32Array(12 * n), ft: new Float32Array(n).fill(0.02), fg: new Float32Array(n).fill(0.6), npp: new Float32Array(n).fill(0.3),
    zones: new Float32Array(NZ * n), runoff: new Float32Array(n).fill(0.1), discharge: new Float32Array(n), lake: new Float32Array(n),
    perma: new Float32Array(n), sigT: new Float32Array(n).fill(1.5), sigTy: new Float32Array(n).fill(1), sigP: new Float32Array(n).fill(0.25) };
  for (let i = 0; i < n; i++) { f.zones[NZ * i + zone] = 1; for (let m = 0; m < 12; m++) { f.T12[12 * i + m] = T(m); f.P12[12 * i + m] = Pm(m); } }
  return f;
}
const quiet = { H_FARM: 0, S_BG: 0, V_G: 0, CHECK: 1e12, Z_IND: 1e9, Z_AI: 1e9, Z_BOAT: 1e9, T_COLD0: -100 };
const steppe = m => 8 + 14 * Math.cos(2 * Math.PI * (m - 6) / 12);    // −6 °C winters
const dzudland = m => 0 + 14 * Math.cos(2 * Math.PI * (m - 6) / 12);  // −14 °C winters

test('a farming origin domesticates the large game still standing about it: none where it was hunted out', () => {
  const p = new People(planet(() => 24, m => (m >= 5 && m <= 9 ? 160 : 5), 4, 3), { ...quiet, H_FARM: 1e3 });
  const L = p.newLineage(null, 0, 0), g = p.planet.grid;
  for (let c = 0; c < p.nL; c++) { L.Z[c] = P.Z_FARM + 1; p.mega[c] = g.pos[3 * p.cells[c] + 2] > 0 ? 1 : 0; }   // the game stands in the north, gone in the south
  p.capacity(L);
  for (let c = 0; c < p.nL; c++) L.N[c] = L.K[c];
  p.Ntot.set(L.N);
  p.farming([L], 1);
  assert.ok(p.packages.length > 5, `${p.packages.length} origins`);
  let wild = 0, gone = 0;
  for (const q of p.packages) {
    let mg = p.mega[q.c];
    for (let o = p.E.off[q.c]; o < p.E.off[q.c + 1]; o++) if (!p.E.hop[o]) mg = Math.max(mg, p.mega[p.E.nb[o]]);
    assert.equal(q.anim, Math.min(1, mg / P.MG_REF));
    assert.equal(p.anim[q.c], q.anim, 'the origin keeps its animals');
    if (mg === 1) wild++; else if (mg === 0) { gone++; assert.equal(p.anim[q.c], 0); }
  }
  assert.ok(wild > 0 && gone > 0, `${wild} origins among standing game, ${gone} where it was gone`);
});

test('animals pass by contact among people who know farming, onto empty land beside them, as far as the herds are kept', () => {
  const spread = (bare = false) => {
    const p = new People(planet(steppe, () => 30, 4), quiet);
    const L = p.newLineage(null, 0, 0);
    for (let c = 0; c < p.nL; c++) L.Z[c] = P.Z_FARM + 1;
    p.capacity(L);
    const c0 = 0, nb = [];
    for (let o = p.E.off[c0]; o < p.E.off[c0 + 1]; o++) if (!p.E.hop[o]) nb.push(p.E.nb[o]);
    L.N[c0] = L.K[c0]; L.N[nb[0]] = L.K[nb[0]]; p.Ntot.set(L.N);
    p.tame(c0, 1);
    if (bare) p.H.herd[c0] = 0;   // a land that keeps no herds: no pasture, no fields
    p.farming([L], 10);
    return { p, L, c0, nb };
  };
  const { p, L, c0, nb } = spread(), H = p.H;
  assert.equal(p.herdM[c0], P.A_SEED, 'a herd starts from A_SEED of what the land keeps');
  for (const k of nb) assert.ok(p.anim[k] > 0 && p.anim[k] < 1, `a neighbour has ${p.anim[k].toFixed(4)} of the set after a decade`);
  // A neighbour with this cell its only better-stocked one: 1 − e^{−C_ANIM know W dt} of the gap, W the
  // edge's contact × the herds kept there (its share × the trypanosomes' × its land's room for them).
  const d = nb[0], kept = p.herdM[c0] * H.habA[c0] * Math.min(1, H.herd[c0] / P.D_HERD / P.K_KEEP);
  const know = 1 / (1 + Math.exp(-(L.Z[d] - (P.Z_FARM - 0.5)) / 0.25)), e = p.E.slope[p.E.off[c0]] * kept;
  assert.ok(kept > 0.5 * P.A_SEED, `the steppe keeps most of its herd: ${kept.toFixed(3)}`);
  assert.ok(Math.abs(p.anim[d] - (1 - Math.exp(-P.C_ANIM * know * e * 10))) < 1e-9, `${p.anim[d]} after ten years`);
  const far = p.E.nb[p.E.off[nb[1]] + 3];
  if (!nb.includes(far) && far !== c0) assert.equal(p.anim[far], 0, 'no further than the step reaches');
  const bare = spread(true);
  for (const k of bare.nb) assert.equal(bare.p.anim[k], 0, 'a land that keeps no herds passes none on');
});

test('the herd: logistic to 1 − loss/R under the closure; a dzud year takes a third, rebuilt over years', () => {
  const p = new People(planet(dzudland, m => (m < 3 || m > 9 ? 45 : 20)), quiet);
  const c = 0, H = p.H;
  assert.ok(H.snowy[c] > 0.7, `a snowbound winter: ${H.snowy[c].toFixed(2)}`);
  p.anim.fill(1); p.herdM.fill(P.A_SEED);
  p.herdYears();
  const s = p.spreadOf(c, P.E_RAIN, P.B_DZUD * H.snowy[c]), loss = P.F_DIE * s * partialG(-P.TH_DIE / s);
  assert.ok(Math.abs(p.hLoss[c] - loss) < 1e-12 && loss > 0 && loss < P.R_HERD, `the closure's die-offs ${loss.toFixed(4)} a year`);
  for (let k = 0; k < 40; k++) p.stocks(25, []);
  assert.ok(Math.abs(p.herdM[c] - (1 - loss / P.R_HERD)) < 1e-6, `settled at ${p.herdM[c].toFixed(4)} against ${(1 - loss / P.R_HERD).toFixed(4)}`);
  // A dzud: a year 4 K cold in its mean, realized (the dial resolving the year), on a full herd.
  p.herdM.fill(1);
  const n = p.planet.grid.n, mom = new Float32Array(6 * n);
  for (let i = 0; i < n; i++) { mom[6 * i] = 1; mom[6 * i + 3] = -4; mom[6 * i + 4] = 16; }
  p.addYears(mom, p.planet.grid.level);
  p.yrTake = 1; p.yrPhi = 1;
  p.herdYears();
  const h = P.F_DIE * Math.max(0, 4 * P.B_DZUD * H.snowy[c] - P.TH_DIE), r = P.R_HERD - h, e = Math.exp(r);
  assert.ok(Math.abs(p.hLoss[c] - h) < 1e-12, `the year's toll ${h.toFixed(3)}`);
  p.stocks(1, []);
  const after = p.herdM[c];
  assert.ok(Math.abs(after - r * e / (r + P.R_HERD * (e - 1))) < 1e-12 && after < 0.8 && after > 0.6, `a dzud leaves ${after.toFixed(3)} of the herd`);
  p.yrW = 0; p.yrTake = 0; p.yrPhi = 0;
  for (let k = 0; k < 10; k++) { p.herdYears(); p.stocks(1, []); }
  assert.ok(p.herdM[c] > after && p.herdM[c] < 1 - loss / P.R_HERD, `rebuilt over a decade toward its own: ${p.herdM[c].toFixed(3)}`);
});

test('herders need animals; mixed farming\'s animals manure the fields and pull the plough', () => {
  // The steppe: herding holds more than foraging only where the animals are.
  const p = new People(planet(steppe, () => 15, 4), quiet);
  const L = p.newLineage(null, 0, 0);
  for (let c = 0; c < p.nL; c++) L.Z[c] = P.Z_HERD + 1;
  p.packages.push({ id: 0, anim: 1 });
  p.capacity(L); const Kf = L.K[0];
  p.anim.fill(1); p.herdM.fill(1);
  p.capacity(L); const Kh = L.K[0];
  p.herdM.fill(0.5);
  p.capacity(L); const Kh2 = L.K[0];
  assert.ok(Kh > 2 * Kf, `herders ${Kh.toFixed(0)} with a full herd against foragers' ${Kf.toFixed(0)} without animals`);
  assert.ok(Kh2 < Kh && Kh2 > Kf, `half the herd, ${Kh2.toFixed(0)}`);
  // Fields on a leached tropical soil (nothing to forage): manure cuts the fallow, traction lifts the yield.
  const f = planet(() => 26, () => 220, 3, 1);
  f.npp.fill(1e-6); f.runoff.fill(1.5);
  const q = new People(f, { ...quiet, MANURE: 0 }), H = q.H, c = 0;
  const M = new People(f, quiet);
  assert.ok(H.phi[c] < 0.5, `leached: ${H.phi[c].toFixed(2)} cropped`);
  for (const r of [q, M]) { r.f[c] = 0.5; r.pkg[c] = 0; r.packages.push({ id: 0, clim: Float32Array.from(r.H.clim.subarray(0, 4)), anim: 1 }); r.pkgT[c] = -1e9; }
  const Lq = q.newLineage(null, 0, 0); Lq.Z[c] = P.Z_FARM + 2;
  q.capacity(Lq); const K0 = Lq.K[c];
  q.anim[c] = 1; q.herdM[c] = 1;
  q.capacity(Lq); const K1 = Lq.K[c];
  assert.ok(Math.abs(K1 / K0 - (1 + P.TRACT * H.habA[c])) < 1e-3, `traction (the little foraging aside): ${(K1 / K0).toFixed(3)} against 1 + TRACT × ${H.habA[c].toFixed(2)} (the trypanosomes' share left)`);
  const crop0 = M.cropped(c);
  M.anim[c] = 1; M.herdM[c] = 1;
  const want = 0.5 * (H.phi[c] + (1 - H.phi[c]) * P.MANURE * H.habA[c]);
  assert.ok(Math.abs(M.cropped(c) - want) < 1e-12 && M.cropped(c) > crop0, `manure: ${(M.cropped(c) / 0.5).toFixed(3)} of the fields cropped against ${(crop0 / 0.5).toFixed(3)}`);
});
