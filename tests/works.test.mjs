// The canals' salt (src/engine/people.js, stocks): toward a/(a + b) exactly at any step.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildGrid } from '../src/grid/icosphere.js';
import { NZ } from '../src/engine/climate.js';
import { People } from '../src/engine/people.js';

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
const quiet = { H_FARM: 0, Z_IND: 1e9, Z_AI: 1e9, Z_BOAT: 1e9, H_SPILL: 0 };

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

test('watered land yields the floodplain\'s where its water lasts the year, and farmers\' own labour builds their works', () => {
  // A monsoon's land: four wet months of 400 mm, the rest dry, warm all year; no river, so its water control is the
  // bunds' and tanks' (the wet season's surplus) and the wells' (the aquifer's recharge).
  const f = dryPlanet(3, { rain: 5 }), n = f.n;
  for (let i = 0; i < n; i++) for (let m = 5; m < 9; m++) f.P12[12 * i + m] = 400;
  f.discharge.fill(0); f.aqR = new Float32Array(n).fill(30); f.aq = new Float32Array(n).fill(3e4);
  const p = new People(f, quiet), H = p.H, P = p.P, c = 2;
  assert.ok(H.irrQ[c] === 0 && H.irrT[c] > 0 && H.irrW[c] > 0, `the sources: river ${H.irrQ[c]}, tanks ${H.irrT[c]}, wells ${H.irrW[c]}`);
  // Its works full: each watered km² crops as a km² of the floodplain does (by warmth, on the floods' renewal).
  p.wk.C[c] = P.W_CANAL * H.area[c] * H.irrPot[c];
  const w = p.watered(c), s = H.sfp[c];
  assert.ok(Math.abs(w - H.irrPot[c]) < 1e-12 && w > 0);
  const yW = p.fieldYield(c, s + w) - p.fieldYield(c, s), yF = w * H.afp[c] * p.fertility(c, H.phiFP[c]);
  assert.ok(Math.abs(yW / yF - 1) < 1e-9, `watered ${yW} against the floodplain's ${yF}`);
  assert.ok(yW > w * H.aup[c] * p.fertility(c) * p.soilYield(c), 'more than the rain-fed field');
  // Farmers' own labour: S_FARM of the farmers' year at full crowding, into terraces and water control by their gaps.
  const g = dryPlanet(3, { rain: 5, saw: 0.4 });
  for (let i = 0; i < n; i++) for (let m = 5; m < 9; m++) g.P12[12 * i + m] = 400;
  const q = new People(g, quiet);
  q.f[c] = 0.3; q.Ntot[c] = 50 * q.H.area[c]; q.K[c] = q.Ntot[c]; q.wol.fill(0); q.wol[5 * c + 3] = 1;
  const gT = q.workRoom(c, 'T'), gC = q.workRoom(c, 'C'), lab = P.S_FARM * q.Ntot[c], dt = 20;
  q.stocks(dt);
  const want = k => lab * (k === 'T' ? gT : gC) / (gT + gC) * (k === 'T' ? P.T_WORK : P.T_CANAL) * -Math.expm1(-dt / (k === 'T' ? P.T_WORK : P.T_CANAL));
  assert.ok(gT > 0 && gC > 0, `the rooms: terraces ${gT}, water control ${gC}`);
  for (const k of ['T', 'C']) assert.ok(Math.abs(q.wk[k][c] / Math.min(want(k), q.workRoom(c, k)) - 1) < 1e-9, `${k}: ${q.wk[k][c]} against ${want(k)}`);
  assert.equal(q.wk.G[c], 0); assert.equal(q.wk.R[c], 0);
});

test('the wells draw the aquifer exactly: two steps make one, and its water is kept', () => {
  const f = dryPlanet(3, { rain: 2 }), n = f.n;
  f.aqR = new Float32Array(n).fill(20); f.aq = new Float32Array(n).fill(2e4);
  const mk = () => { const p = new People(f, { ...quiet, T_CANAL: 1e15, R_SALT: 0 }); p.wk.C[2] = p.P.W_CANAL * p.H.area[2] * p.H.irrPot[2]; return p; };
  const a = mk(), b = mk(), c = 2, tau = 1000;
  const a0 = a.aq[c]; a.stocks(200); b.stocks(100); b.stocks(100);
  assert.ok(Math.abs(a.aq[c] - b.aq[c]) < 1e-9 * a0, `${a.aq[c]} against ${b.aq[c]} in halves`);
  // Kept: the recharge is what it holds more, what flowed out (aq/τ, exactly integrated) and what the wells drew.
  const r = a.H.aqR[c], draw = a.wDraw[c] * 200, u = draw / (a.P.F_WELL * r * 200);
  const k = 1 / tau, as = r * (1 - u * a.P.F_WELL) / k, mean = as + (a0 - as) * -Math.expm1(-k * 200) / (k * 200);
  assert.ok(draw > 0 && Math.abs(r * 200 - ((a.aq[c] - a0) + mean / tau * 200 + draw)) < 1e-6 * r * 200, 'the aquifer\'s books balance');
});
