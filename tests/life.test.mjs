// Minimal life wired into the planet (src/engine/life.js): carbon kept across land, air and sea;
// the thermostat's balance through the sea's chemistry and the arcs' split; a pulse's three
// stages on the planet against the theory (src/engine/pulse.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Planet, CARBON, CLIMATE } from '../src/engine/planet.js';
import { OC } from '../src/engine/oceancarbon.js';

// A small planet, its opening settled (the cover's closure and the sea on this planet's).
function opening(seed = 'earthlike') {
  const P = new Planet(seed, { level: 5, spinLevel: 5, spinup: 20 });
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
  console.log(`  over 10 kyr: the land ${dLand >= 0 ? '+' : ''}${dLand.toFixed(1)} Pg, air and sea ${dSea >= 0 ? '+' : ''}${dSea.toFixed(1)} (a 300 Pg pulse)`);
});

test("life: the thermostat's balance holds through the sea's chemistry and the arcs' split", () => {
  const P = opening();
  const C = P.carbon;
  assert.ok(Math.abs(C.equilibrium(C.flux.out) - C.pco2) < 1, `the opening balances: ${C.equilibrium(C.flux.out).toFixed(1)} against ${C.pco2.toFixed(1)}`);
  // The arcs' recycled carbonate comes from the sea's ledger, the rest from the mantle: at the opening they sum to V0.
  C.step(1);
  assert.ok(Math.abs(C.flux.out - CARBON.V0) < 1e-6, `outgassing at the opening ${C.flux.out}`);
  assert.ok(C.flux.arc > 0.2 * CARBON.V0 && C.flux.arc < CARBON.ARC * CARBON.V0, `the arcs' return ${C.flux.arc.toFixed(4)} Pg/yr`);
  for (const out of [2, 0.5]) {
    CARBON.OUTGAS = out;
    for (let k = 0; k < 60; k++) C.step(5e4);
    const want = C.equilibrium(C.flux.out);
    assert.ok(Math.abs(C.pco2 / want - 1) < 0.02, `mantle ×${out}: ${C.pco2.toFixed(1)} ppm against ${want.toFixed(1)}`);
  }
  CARBON.OUTGAS = 1;
});

test("life: a pulse's three stages on the planet, against the theory", () => {
  const P = opening();
  const tag = P.carbon.startPulse(1000);
  let since = 0;
  for (let t = 0; t < 1e5; t += 250) {
    P.years += 250; P.fast(250, 1e9, 2500);
    if ((since += 250) >= 5000) { P.climate.solve(1); P.afterClimate(); since = 0; }
  }
  const [a1, a10, a100] = tag.at, th = tag.theory;
  console.log(`  left in the air after 1, 10, 100 kyr: ${[a1, a10, a100].map(v => (100 * v).toFixed(1) + '%').join(', ')}; theory ${[th.s1, th.s10, th.s100].map(v => (100 * v).toFixed(1) + '%').join(', ')}`);
  assert.ok(a1 > a10 && a10 > a100 && a100 > 0, 'the sea, then carbonate, then weathering');
  assert.ok(Math.abs(a1 / th.s1 - 1) < 0.2, 'at 1 kyr, near the closed sea\'s partition (the deep not quite ventilated)');
  assert.ok(a10 > th.s10 && a10 < 1.6 * th.s10, 'at 10 kyr, compensation mostly done');
  assert.ok(Math.abs(a100 / th.s100 - 1) < 0.35, 'at 100 kyr, weathering\'s tail');
});
