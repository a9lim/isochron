// The land's works (src/engine/people.js, `stocks`, `workRoom`, `built`, `arableOf`) and the canals'
// salt against their oracles: each kind fills its room and no more, the labour the land can't use goes
// to learning, canals open dry land past the floodplain and salt it toward a/(a + b) exactly,
// terraces open the steep land and hold its soil, granaries keep the store.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildGrid } from '../src/grid/icosphere.js';
import { NZ } from '../src/engine/climate.js';
import { People, PEOPLE } from '../src/engine/people.js';

/** Every cell land, warm, a river through it, dry but for its summer (a monsoon's or a Nile's land). */
function dryPlanet(level, { slope = 0, rain = 20, saw = 0 } = {}) {
  const grid = buildGrid(level), n = grid.n;
  const f = { seed: 'works', grid, n, elev: new Float32Array(n).fill(0.3), ice: new Float32Array(n), T12: new Float32Array(12 * n).fill(24),
    P12: new Float32Array(12 * n).fill(rain), ft: new Float32Array(n).fill(0.1), fg: new Float32Array(n).fill(0.4), npp: new Float32Array(n).fill(0.3),
    zones: new Float32Array(NZ * n), runoff: new Float32Array(n).fill(0.005), discharge: new Float32Array(n).fill(800), lake: new Float32Array(n),
    perma: new Float32Array(n), sigT: new Float32Array(n).fill(1) };
  for (let i = 0; i < n; i++) { f.zones[NZ * i + 4] = 1; f.elev[i] = 0.3 + slope * (grid.pos[3 * i + 2] + 1) + saw * (i % 2); }
  return f;
}
const quiet = { H_FARM: 0, Z_IND: 1e9, Z_AI: 1e9, Z_BOAT: 1e9 };

test('canals open the dry land past the floodplain, as far as a strip beside the river and its water', () => {
  const p = new People(dryPlanet(4), quiet), H = p.H, P = p.P;
  const c = 3, i = p.cells[c], Q = 800, A = H.area[c];
  // A dry warm year: the warm season's whole length would grow, the rain's none of it.
  const cmd = P.K_CMD * P.W_FP * Math.sqrt(Q) / Math.sqrt(A);
  let def = 0; for (let m = 0; m < 12; m++) def += Math.max(0, P.PET_K * (24 + 4) - 20); def *= 1e-3;
  const water = P.ETA_IRR * Q * 3.156e7 / (def * 1e6 * A);
  assert.ok(Math.abs(H.irrPot[c] - Math.min(1 - H.sfp[c], cmd, P.IRR_MAX, water)) < 1e-9, `canals' room ${H.irrPot[c]} against the strip ${cmd.toFixed(3)} and the water ${water.toFixed(3)}`);
  assert.ok(H.arable[c] < 1e-6 + H.sfp[c], 'no rain-fed fields');
  // Built in full, they add their room to the fields' land; half built, half of it.
  p.wk.C[c] = P.W_CANAL * A * H.irrPot[c];
  assert.ok(Math.abs(p.arableOf(c) - (H.arable[c] + H.irrPot[c])) < 1e-9);
  p.wk.C[c] /= 2;
  assert.ok(Math.abs(p.arableOf(c) - (H.arable[c] + 0.5 * H.irrPot[c])) < 1e-9);
  void i;
});

test('the canals\' salt rises toward a/(a + b) exactly, at any step, and leaves as they go', () => {
  const p = new People(dryPlanet(3), quiet), H = p.H, P = p.P, c = 1;
  p.wk.C[c] = P.W_CANAL * H.area[c] * H.irrPot[c]; p.f[c] = 0.2;
  const a = P.R_SALT * H.aridS[c], b = H.sLeach[c], sx = a / (a + b);
  const at = t => sx * (1 - Math.exp(-(a + b) * t));
  p.stocks(300); assert.ok(Math.abs(p.salt[c] - at(300)) < 1e-9, `one step: ${p.salt[c]} against ${at(300)}`);
  const q = new People(dryPlanet(3), quiet); q.wk.C[c] = P.W_CANAL * q.H.area[c] * q.H.irrPot[c]; q.f[c] = 0.2;
  for (let k = 0; k < 30; k++) { q.stocks(10); q.wk.C[c] = P.W_CANAL * q.H.area[c] * q.H.irrPot[c]; }
  assert.ok(Math.abs(q.salt[c] - at(300)) < 1e-6, `thirty steps: ${q.salt[c]} against ${at(300)}`);
  // The salted fields yield less: the canals' tier × (1 − s).
  const y0 = p.fieldYield(c, H.sfp[c] + H.irrPot[c]), s0 = p.salt[c];
  p.salt[c] = 0; const y1 = p.fieldYield(c, H.sfp[c] + H.irrPot[c]); p.salt[c] = s0;
  assert.ok(y0 < y1 && y1 - y0 > 0, 'salt costs the canals\' fields');
  // Abandoned, the fields leach at b alone.
  p.wk.C[c] = 0; p.f[c] = 0; const s1 = p.salt[c]; p.stocks(500);
  assert.ok(Math.abs(p.salt[c] - s1 * Math.exp(-b * 500)) < 1e-9);
});

test('the land\'s works fill their rooms by their gaps, and no more; what the land can\'t use builds learning', () => {
  const p = new People(dryPlanet(3, { slope: 3 }), quiet), H = p.H, P = p.P, c = 2;
  p.f[c] = 0.2; p.Ntot[c] = 1e5; p.uSent = new Float64Array(p.nL).fill(0.1);
  const room = k => p.workRoom(c, k);
  p.landLab[c] = 1e4;   // person-years a year
  p.stocks(2000);
  for (const k of ['T', 'C', 'G', 'R']) if (room(k) > 0) assert.ok(p.wk[k][c] <= room(k) * (1 + 1e-9) && p.wk[k][c] > 0.5 * room(k), `${k}: ${p.wk[k][c].toExponential(2)} against its room ${room(k).toExponential(2)}`);
  // Every room full: the next labour goes to learning.
  for (const k of ['T', 'C', 'G', 'R']) p.wk[k][c] = room(k);
  const L0 = p.works[c];
  p.stocks(1);
  assert.ok(p.works[c] > L0, 'learning takes the labour the land can\'t use');
  void H;
});

test('terraces open the steep land a plough can\'t take, where the rain would grow a crop, and hold its soil', () => {
  const p = new People(dryPlanet(4, { saw: 2, rain: 120 }), quiet), H = p.H, P = p.P;
  let c = 0; for (let k = 0; k < p.nL; k++) if (H.terrPot[k] > H.terrPot[c]) c = k;
  assert.ok(H.terrPot[c] > 0.05, `steep land a plough can't take (${H.terrPot[c].toFixed(3)})`);
  const a0 = p.arableOf(c);
  p.wk.T[c] = P.W_TERR * H.area[c] * H.terrPot[c];
  assert.ok(Math.abs(p.arableOf(c) - Math.min(1, a0 + H.terrPot[c])) < 1e-9, 'terraced in full, it takes fields');
  // Their fields' tillage falls by TERR_ERO.
  p.f[c] = 0.5; p.zc.fill(P.Z_FARM); p.Ef = new Float64Array(p.nL);
  p.wk.T[c] = 0; p.soilStep(1); const e0 = p.Ef[c];
  p.wk.T[c] = P.W_TERR * H.area[c] * H.terrPot[c]; p.soilStep(1);
  assert.ok(Math.abs(p.Ef[c] / e0 - (1 - P.TERR_ERO)) < 1e-9, `tillage ${p.Ef[c]} against ${e0}`);
});

test('granaries enlarge the reserve and cut the store\'s losses', () => {
  const p = new People(dryPlanet(3), quiet), P = p.P, c = 0;
  p.f[c] = 0.3; p.Ntot[c] = 1e5;
  const r0 = p.reserve(c, 0.3, 6);
  p.wk.G[c] = P.W_GRAN * p.Ntot[c];
  assert.ok(Math.abs(p.reserve(c, 0.3, 6) / r0 - (1 + P.G_X)) < 1e-9);
  assert.equal(p.built(c, 'G'), 1);
  void PEOPLE;
});
