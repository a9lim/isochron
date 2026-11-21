// Life wired into the planet (src/engine/life.js): carbon kept across land, air and sea.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Planet, CARBON, CLIMATE } from '../src/engine/planet.js';
import { OC } from '../src/engine/oceancarbon.js';

// A small planet, its opening settled (the cover's closure and the sea on this planet's).
function opening(seed = 'earthlike') {
  const P = new Planet(seed, { level: 4, spinLevel: 4, spinup: 10 });
  P.settleClimate();   // the closure runs until the climate has settled
  return P;
}
const landC = P => { const t = P.life.veg.totals(); return t.veg + t.soil; };

test('life: the opening is settled, and carbon is kept across land, air and sea', () => {
  const P = opening();
  assert.ok(P.carbon.settled, 'the sea settled at the end of the closure');
  assert.ok(Math.abs(P.carbon.pco2 - CARBON.PCO2_0) < 0.5, `CO₂ at the opening ${P.carbon.pco2.toFixed(2)}`);
  const sea0 = P.carbon.sea.inventory().C / OC.PG, land0 = landC(P);
  // The land's store out of balance: a cooler climate (the cover relaxes, its carbon moves), and a pulse.
  const S = CLIMATE.S;
  CLIMATE.S = 0.97 * S; P.climate.solve(1); P.afterClimate(); CLIMATE.S = S;
  P.carbon.startPulse(300);
  for (let k = 0; k < 40; k++) { P.years += 250; P.fast(250, 1e9, 2500); }
  const inv = P.carbon.sea.inventory(), c = P.carbon.sea.cum;
  const dSea = inv.C / OC.PG - sea0, dLand = landC(P) - land0;
  const budget = (c.source - c.sink + c.held) / OC.PG;
  assert.ok(Math.abs(dLand + P.life.toAir) < 1e-6 * Math.max(1, Math.abs(dLand)), `land: Δ ${dLand.toFixed(4)} Pg against ${(-P.life.toAir).toFixed(4)} given the air`);
  assert.ok(Math.abs(dSea - budget) < 1e-6 * sea0, `air and sea: Δ ${dSea.toFixed(4)} Pg against the budget ${budget.toFixed(4)}`);
  // Across all three: what came from below and the pulse, less burial and the mantle.
  const external = budget - P.life.toAir;
  assert.ok(Math.abs(dSea + dLand - external) < 1e-6 * sea0, 'land, air and sea together');
});
