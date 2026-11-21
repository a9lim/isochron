// Carbon in the air, the sea and the seafloor (src/engine/oceancarbon.js): published constants, conservation, the
// steady opening, the thermostat.
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildGrid } from '../src/grid/icosphere.js';
import { Carbon, CARBON } from '../src/engine/carbon.js';
import { OceanCarbon, OC, seawater, speciate, calciteKsp } from '../src/engine/oceancarbon.js';

const near = (a, b, tol, what) => assert.ok(Math.abs(a - b) <= tol, `${what}: ${a} vs ${b}`);

test('chemistry: the constants at 25 °C and S = 35 give their published check values', () => {
  const k = seawater(25, 35);
  near(Math.log(k.K0), -3.5617, 2e-4, 'ln K0 (Weiss 1974)');
  near(-Math.log10(k.K1), 5.8472, 2e-4, 'pK1 (Lueker 2000)');
  near(-Math.log10(k.K2), 8.9660, 2e-4, 'pK2 (Lueker 2000)');
  near(Math.log(k.KB), -19.7964, 2e-4, 'ln KB (Dickson 1990)');
  near(k.Ksp / 4.27e-7, 1, 0.005, 'calcite Ksp (Mucci 1983)');
  // Calcite is more soluble under pressure and in the cold.
  assert.ok(calciteKsp(2, 35, 400) > 1.8 * calciteKsp(2, 35, 0), 'Ksp at 4 km');
  assert.ok(calciteKsp(2, 35, 0) > calciteKsp(25, 35, 0), 'Ksp colder');
});

test('chemistry: DIC 2000 and ALK 2300 µmol/kg at 25 °C, S = 35', (t) => {
  const k = seawater(25, 35), s = speciate(2000e-6, 2300e-6, k);
  // Computed from the verified constants (no published CO2SYS output for this pair was found).
  near(s.pco2, 395.9, 1, 'pCO₂ µatm');
  near(s.pH, 8.046, 0.002, 'pH (total)');
  // The alkalinity it was solved from comes back.
  const alk = s.hco3 + 2 * s.co3 + k.BT * k.KB / (k.KB + s.h) + k.Kw / s.h - s.h;
  near(alk, 2300e-6, 1e-12, 'ALK');
  near(s.co2 + s.hco3 + s.co3, 2000e-6, 1e-15, 'DIC');
  const revelle = (speciate(2001e-6, 2300e-6, k).pco2 / s.pco2 - 1) * 2000;
  assert.ok(revelle > 8 && revelle < 12, `Revelle factor ${revelle.toFixed(2)}`);
  const omega = k.Ca * s.co3 / k.Ksp;
  assert.ok(omega > 4 && omega < 7, `Ω calcite ${omega.toFixed(2)}`);
  // pCO₂ at fixed DIC and ALK rises ~4.2%/K (Takahashi and others, from memory).
  const dlnp = Math.log(speciate(2000e-6, 2300e-6, seawater(26, 35)).pco2 / s.pco2);
  assert.ok(dlnp > 0.035 && dlnp < 0.05, `∂ln pCO₂/∂T = ${dlnp.toFixed(4)}/K`);
});

test('carbon and alkalinity are conserved across air, sea, sediments and the mantle', () => {
  const m = new OceanCarbon();
  const i0 = m.inventory();
  m.pulse(3000);
  const steps = [1, 3, 10, 100, 1000, 5000, 2e4, 1e5, 1e6, 7, 3e5];
  const hyps = m.zb ? { depth: Array.from(m.zb), area: Array.from(m.ab, (a, i) => a * (1 + 0.3 * Math.sin(i))) } : null;
  steps.forEach((dt, k) => {
    m.step(dt, {
      lip: k === 4 ? 0.5 : 0, land: k === 2 ? -0.3 : 0.05, orgBurial: 0.02, oxid: 0.015, shelf: 1 + 0.2 * Math.sin(k), bio: 1 + 0.1 * Math.cos(k),
      carbW: 1.2, subduct: 2e-8, sstWarm: 21 + k % 3, sstCold: 1.5 - (k % 2), hyps: k === 6 ? hyps : null,
    });
    if (k === 8) { m.hold = 400; }
    if (k === 9) { m.hold = 0; }
  });
  const i1 = m.inventory();
  const dC = (i1.C - i0.C) - (i1.budget - i0.budget);
  assert.ok(Math.abs(dC) / i0.C < 1e-12, `carbon off by ${(dC / OC.PG).toExponential(2)} Pg of ${(i0.C / OC.PG).toExponential(3)}`);
  assert.ok(Math.abs(i1.alk - i0.alk) / i0.alk < 1e-12, `alkalinity off by ${(i1.alk - i0.alk).toExponential(2)} mol`);
});

test("the thermostat: under constant outgassing silicate weathering meets it, at carbon.js's balance", (t) => {
  const g = buildGrid(2);
  const tec = { grid: g, t: 0, counters: { opened: 0, closed: 0 } };
  const carbon = new Carbon(tec, null, { co2Seen: 280 });
  carbon.wF = carbon.wF0 = 1; carbon.wCO2 = 280;
  const out = [];
  for (const x of [0.5, 1, 2]) {
    // No subduction, so the arcs' return doesn't move with burial and V is all there is.
    const m = new OceanCarbon({ inputs: { subduct: 0 } });
    const V = CARBON.V0 * x;
    for (let k = 0; k < 8; k++) m.step(1e6, { outgas: V });
    const want = carbon.equilibrium(V);
    near(m.equilibrium(V) / want, 1, 1e-12, 'the analytic balance is carbon.js\'s');
    assert.ok(Math.abs(m.pco2 / want - 1) < 0.01, `outgassing ×${x}: ${m.pco2.toFixed(1)} ppm vs ${want.toFixed(1)}`);
    assert.ok(Math.abs(m.flux.weather - m.flux.out) / m.flux.out < 0.01, 'silicate weathering meets outgassing');
    out.push(`×${x}: ${m.pco2.toFixed(1)} ppm (balance ${want.toFixed(1)}), CCD ${(m.stats.ccd / 1000).toFixed(2)} km`);
  }
  // With subduction the buried carbonate returns at arcs, and the balance follows flux.out.
  const m = new OceanCarbon();
  for (let k = 0; k < 8; k++) m.step(1e6, { outgas: 0.5 * CARBON.V0 });
  assert.ok(Math.abs(m.pco2 / m.equilibrium() - 1) < 0.01, `with subduction: ${m.pco2.toFixed(1)} vs ${m.equilibrium().toFixed(1)}`);
  out.push(`×0.5 with subduction: ${m.pco2.toFixed(1)} ppm (V ${m.flux.out.toFixed(4)} Pg C/yr, the arcs' return down with burial)`);
});
