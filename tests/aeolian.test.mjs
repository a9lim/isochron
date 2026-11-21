// Dust wired into the planet (src/engine/aeolian.js): conserved through land, sea, ice and the crust's budget.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Planet } from '../src/engine/planet.js';
import { AEOLIAN } from '../src/engine/aeolian.js';

const R2 = 6.371e6 ** 2;
let planet = null;
/** A level-5 planet, its climate cycled with the dust converged (the CPU's sweeps to a tight tolerance). */
function opening() {
  if (planet) return planet;
  const P = new Planet('earthlike', { level: 4 });
  Object.assign(P.aeolian.A, { CPU_SWEEPS: 150, CPU_TOL: 1e-7 });
  for (let k = 0; k < 4; k++) { P.climate.solve(1); P.afterClimate(); }
  return (planet = P);
}

test('the wired dust is conserved: emitted = deposited on land, sea and ice; its budget keeps the crust', { timeout: 300000 }, t => {
  const P = opening(), a = P.aeolian, s = a.stats, o = a.dust.out, g = P.grid, n = g.n;
  assert.ok(s.emission > 50, `the opening lifts dust: ${s.emission.toFixed(0)} Tg/yr`);
  const where = s.land + s.sea + s.ice;
  assert.ok(Math.abs(s.deposition / s.emission - 1) < 2e-3, `deposited ${s.deposition.toFixed(1)} of ${s.emission.toFixed(1)} Tg/yr`);
  assert.ok(Math.abs(where / s.deposition - 1) < 1e-6, `land + sea + ice ${where.toFixed(2)} = ${s.deposition.toFixed(2)} Tg/yr`);
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
  assert.ok(Math.abs(dm) < 1e-3 * lost * R2, `the crust's mass moved by ${dm.toExponential(2)} m³ against ${(lost * R2).toExponential(2)} m³ carried`);
});
