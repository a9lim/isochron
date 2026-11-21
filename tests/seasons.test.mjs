// Continental seasons (src/engine/climate.js, continentalSeasons): no heat made, and each cell's harmonic F̂/(B +
// iωC) without transport.
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildGrid } from '../src/grid/icosphere.js';
import { Tectonics } from '../src/engine/plates.js';
import { genesis } from '../src/engine/genesis.js';
import { Climate, CLIMATE } from '../src/engine/climate.js';
import { prolong } from '../src/grid/transfer.js';

let planet = null;
const world = () => planet || (planet = (() => { const g = buildGrid(5), tec = new Tectonics(g); genesis(tec, 'earthlike', { spinup: 10 }); return { g, tec }; })());
/** One pass of the energy balance on the seeded planet, from the uniform start. */
function onePass(over = {}) {
  const keep = {};
  for (const k in over) { keep[k] = CLIMATE[k]; CLIMATE[k] = over[k]; }
  try {
    const { tec } = world(), c = new Climate(tec);
    c.geography();
    for (const _ of c.ebm());
    return c;
  } finally { Object.assign(CLIMATE, keep); }
}

test("continental seasons: without transport, each cell's harmonic is F̂/(B + iωC), land or sea", () => {
  const c = onePass({ D_SEASON: 0, SUB_K: 0 }), n = c.grid.n, s = c.sub, B = CLIMATE.B;
  let worst = 0, land = 0, landAmp = 0, mixedLand = 0;
  const lf = new Float64Array(n); prolong(c.T, c.landFracC, lf);
  for (let k = 1; k <= 2; k++) {
    const om = 2 * Math.PI * k;
    for (let i = 0; i < n; i++) {
      const z = om * c.capF[i], m2 = B * B + z * z, Fr = s.Fr[k - 1][i], Fi = s.Fi[k - 1][i];
      const er = (Fr * B + Fi * z) / m2, ei = (Fi * B - Fr * z) / m2;
      const err = Math.hypot(c.Tf[2 * k - 1][i] - er, c.Tf[2 * k][i] - ei) / Math.max(1e-3, Math.hypot(er, ei));
      worst = Math.max(worst, err);
      if (k === 1 && c.landMask[i] && lf[i] < 0.6) { land++; landAmp += Math.hypot(c.Tf[1][i], c.Tf[2][i]) / (Math.hypot(Fr, Fi) / Math.hypot(B, z)); mixedLand += 1; }
    }
  }
  assert.ok(worst < 1e-5 && land > 10);
});
