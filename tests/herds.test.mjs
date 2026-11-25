// Herds as a stock (src/engine/people.js): logistic less the closure's die-offs, and a dzud's toll.
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
const quiet = { H_FARM: 0, Z_IND: 1e9, Z_AI: 1e9, Z_BOAT: 1e9, T_COLD0: -100, H_SPILL: 0 };
const dzudland = m => 0 + 14 * Math.cos(2 * Math.PI * (m - 6) / 12);  // −14 °C winters

test('the herd: logistic to 1 − loss/R under the closure; a dzud year takes a third, rebuilt over years', () => {
  const p = new People(planet(dzudland, m => (m < 3 || m > 9 ? 45 : 20)), quiet);
  const c = 0, H = p.H;
  assert.ok(H.snowy[c] > 0.7, `a snowbound winter: ${H.snowy[c].toFixed(2)}`);
  p.anim.fill(1); p.herdM.fill(P.A_SEED);
  p.herdYears();
  const s = p.spreadOf(c, P.E_RAIN, P.B_DZUD * H.snowy[c]), loss = P.F_DIE * s * partialG(-P.TH_DIE / s);
  assert.ok(Math.abs(p.hLoss[c] - loss) < 1e-12 && loss > 0 && loss < P.R_HERD, `the closure's die-offs ${loss.toFixed(4)} a year`);
  for (let k = 0; k < 40; k++) p.stocks(25);
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
  p.stocks(1);
  const after = p.herdM[c];
  assert.ok(Math.abs(after - r * e / (r + P.R_HERD * (e - 1))) < 1e-12 && after < 0.8 && after > 0.6, `a dzud leaves ${after.toFixed(3)} of the herd`);
  p.yrW = 0; p.yrTake = 0; p.yrPhi = 0;
  for (let k = 0; k < 10; k++) { p.herdYears(); p.stocks(1); }
  assert.ok(p.herdM[c] > after && p.herdM[c] < 1 - loss / P.R_HERD, `rebuilt over a decade toward its own: ${p.herdM[c].toFixed(3)}`);
});
