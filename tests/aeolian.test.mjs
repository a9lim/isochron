// Dust wired into the planet (src/engine/aeolian.js): conserved through the wired system (emitted =
// deposited on land, sea and ice; the crust's mass kept by the budget), and its routing: dusty snow
// darkens the climate's albedo and speeds the ice's melt; iron raises the cold sea's uptake and
// draws CO₂ down.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Planet } from '../src/engine/planet.js';
import { OceanCarbon, OC } from '../src/engine/oceancarbon.js';
import { AEOLIAN } from '../src/engine/aeolian.js';

const R2 = 6.371e6 ** 2;
let planet = null;
/** A level-5 planet, its climate cycled with the dust converged (the CPU's sweeps to a tight tolerance). */
function opening() {
  if (planet) return planet;
  const P = new Planet('earthlike', { level: 5 });
  Object.assign(P.aeolian.A, { CPU_SWEEPS: 150, CPU_TOL: 1e-7 });
  for (let k = 0; k < 4; k++) { P.climate.solve(1); P.afterClimate(); }
  return (planet = P);
}

test('the wired dust is conserved: emitted = deposited on land, sea and ice; its budget keeps the crust', { timeout: 300000 }, t => {
  const P = opening(), a = P.aeolian, s = a.stats, o = a.dust.out, g = P.grid, n = g.n;
  assert.ok(s.emission > 50, `the opening lifts dust: ${s.emission.toFixed(0)} Tg/yr`);
  const where = s.land + s.sea + s.ice;
  assert.ok(Math.abs(s.deposition / s.emission - 1) < 2e-3, `deposited ${s.deposition.toFixed(1)} of ${s.emission.toFixed(1)} Tg/yr`);
  assert.ok(Math.abs(where / s.deposition - 1) < 1e-9, `land + sea + ice ${where.toFixed(2)} = ${s.deposition.toFixed(2)} Tg/yr`);
  // Nothing is lifted at sea, under ice or from sources without loose ground.
  for (let i = 0; i < n; i++) if (!P.climate.landMask[i] || P.ice.H[i] > AEOLIAN.ICE) assert.equal(o.emitAnn[i], 0);
  // The budget over 10 kyr: what the sources lose is laid down elsewhere, to rounding.
  const h = Float32Array.from(P.regolith.h), dz = a.budget(1e4, h);
  let lost = 0, laid = 0;
  for (let i = 0; i < n; i++) { const v = dz[i] * g.area[i]; if (v < 0) lost -= v; else laid += v; assert.ok(-dz[i] <= h[i] + 1e-9, 'no source loses more than its layer'); }
  assert.ok(lost > 0 && Math.abs(laid / lost - 1) < 1e-12, `lost ${lost.toExponential(4)}, laid ${laid.toExponential(4)}`);
  // Through the regolith's update (the till and erosion zeroed): the crust's mass is kept.
  P.ice.eroded.fill(0); P.ice.till.fill(0); P.ice.outwash.fill(0);
  const R = P.regolith, mass = () => { let m = 0; for (let i = 0; i < n; i++) m += (P.tec.h[i] + R.resid[i]) * g.area[i]; return m; };
  R.settled = true;                         // (the opening's layer is laid already)
  const m0 = mass(), r0 = R.volume();
  R.update(1e4);
  const dm = (mass() - m0) * R2 * 1e3;      // m³ of rock
  t.diagnostic(`emission ${s.emission.toFixed(0)} Tg/yr, lifetime ${s.lifetime.toFixed(2)} d; on land ${s.land.toFixed(0)}, sea ${s.sea.toFixed(0)}, ice ${s.ice.toFixed(1)} Tg/yr; 10 kyr move ${(lost * R2 / 1e9).toFixed(1)} km³ of rock; the crust's mass changes by ${dm.toExponential(2)} m³ (f32), the regolith by ${((R.volume() - r0) / 1e9).toFixed(2)} km³`);
  assert.ok(Math.abs(dm) < 1e-3 * lost * R2, `the crust's mass moved by ${dm.toExponential(2)} m³ against ${(lost * R2).toExponential(2)} m³ carried`);
});

test('dusty snow darkens: the climate\'s snow and ice albedo, and the ice\'s degree-day factors', { timeout: 300000 }, () => {
  const P = opening(), a = P.aeolian, c = P.climate, n = P.grid.n;
  // A snowy land cell (the coldest by annual mean), dusted more and more.
  let i = -1;
  for (let k = 0; k < n; k++) if (c.landMask[k] && c.snowAnn[k] > 0.5 && (i < 0 || c.Tf[0][k] < c.Tf[0][i])) i = k;
  assert.ok(i >= 0, 'a snowy cell');
  const o = a.dust.out, keep = o.depAnn[i], T = c.Tf[0][i] - 20;
  const albAt = dep => { o.depAnn[i] = dep; a.effects(); return { alb: c.albedo(i, T), dark: a.dark[i], ks: a.ddf[2 * i], ki: a.ddf[2 * i + 1], conc: a.conc[i] }; };
  const clean = albAt(0), dusty = albAt(1e-3), dustier = albAt(1e-2);
  o.depAnn[i] = keep; a.effects();
  assert.ok(clean.dark === 0, "clean snow is not darkened");
  assert.ok(dusty.alb < clean.alb && dustier.alb < dusty.alb, `albedo ${clean.alb.toFixed(4)} → ${dusty.alb.toFixed(4)} → ${dustier.alb.toFixed(4)}`);
  assert.ok(dusty.ks > 1 && dusty.ki > 1 && dustier.ks > dusty.ks, 'the factors rise');
  // The surface's darkening against the form: ~0.02 at 100 ppm (DARK_A), half of it in the planetary albedo.
  const want = Math.min(AEOLIAN.DARK_MAX, AEOLIAN.DARK_A * Math.pow(dusty.conc / AEOLIAN.DARK_C, AEOLIAN.DARK_P));
  assert.ok(Math.abs(-dusty.dark - 0.5 * want) < 1e-6);
  // The ice's mass balance where ice would melt (a sheet laid on the snowy margins): more melt with the dust.
  const I = P.ice, H0 = Float64Array.from(I.H);
  for (let k = 0; k < n; k++) if (c.landMask[k] && c.snowAnn[k] > 0.2) I.H[k] = 500;
  I.dustDDF = null; I.massBalance();
  const M0 = Float64Array.from(I.M), melt0 = Float64Array.from(I.melt);
  I.dustDDF = new Float32Array(2 * n).fill(1.25);
  I.massBalance();
  let cells = 0;
  for (let k = 0; k < n; k++) if (I.H[k] > 0 && melt0[k] > 0.01) {
    cells++;
    assert.ok(I.melt[k] > melt0[k] && I.M[k] < M0[k], `cell ${k}: melt ${melt0[k].toFixed(3)} → ${I.melt[k].toFixed(3)} m/yr`);
  }
  assert.ok(cells > 0, 'melting ice to test');
  I.H.set(H0); I.dustDDF = a.ddf; I.massBalance();
});

test('iron raises the cold sea\'s uptake: more export, CO₂ drawn down', t => {
  // The iron factor's form.
  const P = opening(), a = P.aeolian, n = P.grid.n, L = P.climate.landMask;
  const sst = new Float64Array(n);
  for (let i = 0; i < n; i++) sst[i] = Math.abs(P.climate.lat[i]) > 0.9 ? -1 : 20;
  a.ref = null;
  assert.equal(a.ironTo(sst, 0, true), 1, 'the reference: × 1');
  const o = a.dust.out, keep = Float32Array.from(o.depAnn);
  for (let i = 0; i < n; i++) if (!L[i] && sst[i] <= 0) o.depAnn[i] *= 3;
  const f3 = a.ironTo(sst, 0, false), K = AEOLIAN.IRON_K;
  assert.ok(Math.abs(f3 - (1 + K) * 3 / (3 + K)) < 1e-9, `× ${f3.toFixed(3)} at three times the iron`);
  o.depAnn.set(keep);
  assert.ok(a.ironFlux > 0, 'soluble iron to the sea');
  // The sea: the cold box's uptake × 1.5 against a control, closed, 5 kyr.
  const run = (m, years) => { for (let y = 0; y < years; y += OC.SUB) m.step(Math.min(OC.SUB, years - y)); };
  const m = new OceanCarbon(), ctl = new OceanCarbon();
  m.closed = ctl.closed = true;
  m.step(1); ctl.step(1);
  const e0 = m.stats.export ?? m.flux.export;
  m.set({ iron: 1.5 });
  run(m, 5000); run(ctl, 5000);
  const dp = m.pco2 - ctl.pco2;
  t.diagnostic(`cold box's uptake × 1.5: export ${(e0 || 0).toFixed(2)} → ${(m.flux.export || 0).toFixed(2)} Pg C/yr at first; CO₂ ${dp.toFixed(1)} ppm after 5 kyr (closed)`);
  assert.ok(dp < -2, `CO₂ drawn down by ${dp.toFixed(2)} ppm`);
});
