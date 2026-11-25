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
