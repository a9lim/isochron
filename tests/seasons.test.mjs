// Continental seasons (src/engine/climate.js, `continentalSeasons`): each cell's seasonal
// harmonics answer its own heat capacity. The annual mean is untouched, the coarse grid's
// transport and the exchange within a coarse cell move heat without making any, and with
// neither a cell's response is the analytic F̂/(B + iωC) whatever its coarse cell holds.
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildGrid } from '../src/grid/icosphere.js';
import { Tectonics } from '../src/engine/plates.js';
import { genesis } from '../src/engine/genesis.js';
import { Climate, CLIMATE } from '../src/engine/climate.js';
import { prolong } from '../src/grid/transfer.js';

const say = (...a) => console.log('  ', ...a);
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

test('continental seasons: the annual mean untouched; the transport makes no heat', () => {
  const on = onePass(), off = onePass({ SUBGRID: false }), g = on.grid, n = g.n;
  let dMean = 0;
  for (let i = 0; i < n; i++) dMean = Math.max(dMean, Math.abs(on.Tf[0][i] - off.Tf[0][i]));
  assert.ok(dMean < 1e-6, `the annual mean moved ${dMean.toExponential(2)} K`);
  // Σ a [(B + ikωC) T̂ − F̂] over the globe: the heat the transport and the exchange brought, which must sum to nothing.
  const s = on.sub, C = on.capF, B = CLIMATE.B;
  for (let k = 1; k <= 2; k++) {
    const om = 2 * Math.PI * k, Tr = on.Tf[2 * k - 1], Ti = on.Tf[2 * k], Fr = s.Fr[k - 1], Fi = s.Fi[k - 1];
    let lr = 0, li = 0, scale = 0;
    for (let i = 0; i < n; i++) {
      const a = g.area[i], z = om * C[i];
      lr += a * (B * Tr[i] - z * Ti[i] - Fr[i]); li += a * (B * Ti[i] + z * Tr[i] - Fi[i]);
      scale += a * Math.hypot(Fr[i], Fi[i]);
    }
    say(`harmonic ${k}: the transport's net heat ${(Math.hypot(lr, li) / scale).toExponential(2)} of the forcing's`);
    assert.ok(Math.hypot(lr, li) < 1e-7 * scale, `harmonic ${k}: net ${Math.hypot(lr, li)} against ${scale}`);   // to f32 rounding
  }
  // Land in mixed coarse cells gets its own seasons: larger than with the capacity mixed.
  const lf = new Float64Array(n); prolong(on.T, on.landFracC, lf);
  let a0 = 0, a1 = 0, cnt = 0;
  for (let i = 0; i < n; i++) if (on.landMask[i] && lf[i] < 0.6 && Math.abs(on.lat[i]) > 0.6) {
    a0 += Math.hypot(off.Tf[1][i], off.Tf[2][i]); a1 += Math.hypot(on.Tf[1][i], on.Tf[2][i]); cnt++;
  }
  say(`coastal land beyond 35° (${cnt} cells): first harmonic ${(a0 / cnt).toFixed(1)} K mixed, ${(a1 / cnt).toFixed(1)} K its own`);
  assert.ok(cnt > 10 && a1 > 1.3 * a0);
});

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
  say(`worst relative error ${worst.toExponential(2)}; land in mixed coarse cells (${land}): amplitude / (|F̂|/|B + iωC|) = ${(landAmp / mixedLand).toFixed(6)}`);
  assert.ok(worst < 1e-5 && land > 10);
});
