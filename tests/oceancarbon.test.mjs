// Carbon in the air, the sea and the seafloor: the carbonate system against its
// constants' check values, conservation, a pulse's three stages, the
// thermostat's balance, the cold sea's pull and a 1 Myr step.
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildGrid } from '../src/grid/icosphere.js';
import { Carbon, CARBON } from '../src/engine/carbon.js';
import { OceanCarbon, OC, seawater, speciate, calciteKsp } from '../src/engine/oceancarbon.js';

const near = (a, b, tol, what) => assert.ok(Math.abs(a - b) <= tol, `${what}: ${a} vs ${b}`);

/** Steps growing with time (1 yr at first, at most OC.SUB), landing on each mark. */
function run(m, marks, onMark, inputs) {
  let t = 0;
  for (const mark of marks) {
    while (t < mark - 1e-9) {
      const dt = Math.min(mark - t, Math.min(OC.SUB, Math.max(1, 0.02 * t)));
      m.step(dt, inputs ? inputs(m) : undefined); t += dt;
    }
    onMark(mark);
  }
}

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
  t.diagnostic(`pCO₂ ${s.pco2.toFixed(1)} µatm, pH ${s.pH.toFixed(3)}, CO₃ ${(1e6 * s.co3).toFixed(1)} µmol/kg, Ω ${omega.toFixed(2)}, Revelle ${revelle.toFixed(2)}, ∂ln pCO₂/∂T ${(100 * dlnp).toFixed(2)}%/K`);
});

test('the opening is a steady state: burial meets weathering, and 1 yr steps leave it', (t) => {
  const m = new OceanCarbon();
  const f = m.flux, d = m.stats;
  near(f.shelf + f.deep, f.weather + f.carbW, 1e-6, 'carbonate burial against Ca from weathering (Pg C/yr)');
  const p0 = m.pco2;
  near(p0, CARBON.PCO2_0, 1e-6, 'pCO₂');
  for (let i = 0; i < 200; i++) m.step(1);
  near(m.pco2, p0, 1e-6, 'after 200 yr');
  m.step(1e6);
  near(m.pco2, p0, 0.05, 'after 1 Myr');
  const b = d.boxes;
  assert.ok(b[2].dic > b[1].dic && b[1].dic > b[0].dic, 'DIC rises from the warm surface to the deep');
  assert.ok(b[1].pco2 < p0 && b[0].pco2 > p0, 'the cold sea takes CO₂ up, the warm one gives it off');
  assert.ok(d.ccd > d.saturation, 'compensation below saturation');
  t.diagnostic(`ALK ${b.map(x => x.alk.toFixed(0)).join('/')} · DIC ${b.map(x => x.dic.toFixed(0)).join('/')} · PO₄ ${b.map(x => x.po4.toFixed(2)).join('/')} µmol/kg · Ω ${b.map(x => x.omega.toFixed(2)).join("/")} (warm/cold/deep)`);
  t.diagnostic(`saturation ${d.saturation.toFixed(0)} m, compensation ${d.ccd.toFixed(0)} m; export ${f.export.toFixed(2)}, CaCO₃ rain ${f.rain.toFixed(2)}, shelves ${f.shelf.toFixed(3)}, deep ${f.deep.toFixed(3)}, arcs ${f.arc.toFixed(3)} Pg C/yr; floor's share of rain ${m.calibration.sed.toFixed(2)}`);
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

test("a pulse's three stages: the sea takes it, carbonate neutralizes it, weathering ends it", (t) => {
  const marks = [1e3, 1e4, 1e5, 1e6];
  for (const P of [1000, 5000]) {
    const m = new OceanCarbon(), base = m.pco2;
    m.pulse(P);
    const share = [], ccd = [];
    run(m, marks, () => { share.push((m.pco2 - base) * OC.PPM / P); ccd.push(m.stats.ccd); });
    // Archer's long tail (from memory, unchecked): ~20–35% after 1 kyr, ~10% after 10 kyr, then
    // silicate weathering over 100s of kyr. Bands here are loose; the numbers are the result.
    assert.ok(share[0] > 0.12 && share[0] < 0.45, `1 kyr: ${share[0]}`);
    assert.ok(share[1] > 0.04 && share[1] < 0.2, `10 kyr: ${share[1]}`);
    assert.ok(share[2] < share[1] && share[2] > 0.005, `100 kyr: ${share[2]}`);
    assert.ok(share[3] < 0.01, `1 Myr: ${share[3]}`);
    t.diagnostic(`${P} Pg C: in the air ${share.map(s => (100 * s).toFixed(1) + '%').join(' · ')} after 1, 10, 100, 1000 kyr; compensation depth ${ccd.map(z => (z / 1000).toFixed(2)).join(' · ')} km (opening ${(m.stats.ccd / 1000).toFixed(2)})`);
    // The same pulse in a closed sea and air (no sediments, no weathering), against a closed control.
    const c = new OceanCarbon(), ctl = new OceanCarbon();
    c.closed = ctl.closed = true; c.pulse(P);
    run(c, [3e3], () => {}); run(ctl, [3e3], () => {});
    t.diagnostic(`${P} Pg C, the sea alone after 3 kyr: ${(100 * (c.pco2 - ctl.pco2) * OC.PPM / P).toFixed(1)}% in the air`);
  }
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
  t.diagnostic(out.join(' · '));
});

test('a colder sea draws CO₂ down', (t) => {
  const m = new OceanCarbon({ inputs: { sstWarm: 21, sstCold: 1.5 } }), ctl = new OceanCarbon({ inputs: { sstWarm: 21, sstCold: 1.5 } });
  const base = m.pco2;
  // The sea and the air alone (sediments and weathering off), every box 1 K colder, 5 kyr, against a closed control.
  m.closed = ctl.closed = true;
  m.set({ sstWarm: 20, sstCold: 0.5 });
  run(m, [5e3], () => {}); run(ctl, [5e3], () => {});
  const closed = m.pco2 - ctl.pco2;
  assert.ok(closed < -5 && closed > -20, `closed: ${closed.toFixed(2)} ppm/K`);
  // With the sediments and weathering, 50 kyr on.
  const o = new OceanCarbon({ inputs: { sstWarm: 21, sstCold: 1.5 } });
  o.set({ sstWarm: 20, sstCold: 0.5 });
  const open = [];
  run(o, [5e3, 5e4], () => open.push(o.pco2 - base));
  assert.ok(open[0] < 0, 'open, 5 kyr');
  // The cold box alone, 1 K colder.
  const c = new OceanCarbon({ inputs: { sstWarm: 21, sstCold: 1.5 } }), w = new OceanCarbon({ inputs: { sstWarm: 21, sstCold: 1.5 } });
  c.closed = w.closed = true; c.set({ sstCold: 0.5, tDeep: 1.5 }); w.set({ sstWarm: 20 });
  run(c, [5e3], () => {}); run(w, [5e3], () => {});
  t.diagnostic(`ΔpCO₂ per K: ${closed.toFixed(2)} ppm (sea and air, 5 kyr), ${open.map(v => v.toFixed(2)).join(' then ')} ppm (with sediments, 5 and 50 kyr); the cold box alone ${(c.pco2 - ctl.pco2).toFixed(2)}, the warm box alone ${(w.pco2 - ctl.pco2).toFixed(2)} ppm`);
});

test('stable at a 1 Myr step: one substep, a 10,000 Pg pulse', (t) => {
  const keep = OC.SUB;
  try {
    OC.SUB = 1e6;
    const m = new OceanCarbon(), base = m.pco2;
    m.pulse(10000);
    const seen = [];
    for (let k = 0; k < 6; k++) {
      m.step(1e6);
      assert.ok(Number.isFinite(m.pco2) && m.pco2 > 0, `step ${k}: ${m.pco2}`);
      for (const b of m.stats.boxes) assert.ok(b.dic > 0 && b.alk > 0 && Number.isFinite(b.pH), 'the boxes stay physical');
      seen.push(m.pco2);
    }
    assert.ok(seen[0] > base && seen.every((p, i) => i === 0 || p <= seen[i - 1] + 1e-6), `relaxes monotonically: ${seen.map(p => p.toFixed(1)).join(', ')}`);
    assert.ok(Math.abs(seen[5] - base) < 1, 'back to the balance');
    // Against fine steps: one substep lags (backward Euler damps the ~130 kyr weathering mode as
    // 1/(1 + h/τ) rather than e^{−h/τ}), by well under 1% of the pulse's first excess, and a step later they agree.
    OC.SUB = keep;
    const f = new OceanCarbon();
    f.pulse(10000);
    const excess = f.pco2 - base, fine = [];
    run(f, [1e6], () => fine.push(f.pco2));
    f.step(1e6); fine.push(f.pco2);
    assert.ok(Math.abs(fine[0] - seen[0]) < 0.01 * excess, `1 Myr: fine ${fine[0].toFixed(2)} vs one substep ${seen[0].toFixed(2)}`);
    assert.ok(Math.abs(fine[1] - seen[1]) < 1, `2 Myr: fine ${fine[1].toFixed(2)} vs one substep ${seen[1].toFixed(2)}`);
    // The default substeps take the same pulse in one call of 1 Myr.
    const d = new OceanCarbon();
    d.pulse(10000); d.step(1e6);
    assert.ok(Math.abs(d.pco2 - fine[0]) < 0.5, `one call of 1 Myr ${d.pco2.toFixed(2)} vs growing steps ${fine[0].toFixed(2)}`);
    t.diagnostic(`10,000 Pg C, one 1 Myr substep each: ${seen.map(p => p.toFixed(1)).join(', ')} ppm; fine steps ${fine.map(p => p.toFixed(1)).join(', ')} ppm at 1 and 2 Myr`);
  } finally { OC.SUB = keep; }
});
