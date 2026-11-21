// The runaway greenhouse (src/engine/runaway.js): the OLR's curve, the steam's surface, and the boiled sea's carbon
// kept.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { olr, olrInverse, plateau, RUNAWAY } from '../src/engine/runaway.js';
import { OceanCarbon, OC } from '../src/engine/oceancarbon.js';
import { CLIMATE } from '../src/engine/climate.js';

// The outgoing longwave the runaway sees: the clear sky's A less the clouds' longwave (Climate.olrCorrection; ~28 W/m² on today's Earth).
const A = CLIMATE.A - 28, B = CLIMATE.B;

test('the OLR leaves A + BT at the knee, reaches the limit at the plateau, C¹ at both, and inverts', () => {
  const Tk = RUNAWAY.T_K, Tp = plateau(A, B), h = 1e-4;
  for (const T of [-20, 0, 14, Tk - 1]) assert.equal(olr(T, A, B), A + B * T);
  assert.ok(Math.abs(olr(Tp, A, B) - RUNAWAY.L_RUN) < 1e-9 && olr(Tp + 50, A, B) === RUNAWAY.L_RUN, `the limit at the plateau (${Tp.toFixed(1)} °C)`);
  const slope = T => (olr(T + h, A, B) - olr(T - h, A, B)) / (2 * h);
  assert.ok(Math.abs(slope(Tk) - B) < 1e-3 && Math.abs(slope(Tp - h)) < 1e-3, `C¹ (${slope(Tk)}, ${slope(Tp - h)})`);
  for (const T of [0, 20, 30, 40, Tp - 0.5]) assert.ok(Math.abs(olrInverse(olr(T, A, B), A, B) - T) < 1e-6, `inverse at ${T}`);
  assert.equal(olrInverse(RUNAWAY.L_RUN + 1, A, B), Infinity);
});

test('the sea boiling away: the boiled water\'s carbon goes to the air, and none is made or lost', () => {
  const sea = new OceanCarbon();
  const total = () => sea.I[0] + sea.I[1] + sea.I[2] + sea.I[3];
  const c0 = total(), p0 = sea.pco2, dic0 = sea.I[1] / sea.Mw;
  sea.boilTo(0.5);
  assert.ok(Math.abs(total() / c0 - 1) < 1e-12, 'carbon kept');
  assert.ok(sea.pco2 > 10 * p0, `half the sea's carbon to the air (${p0.toFixed(0)} → ${sea.pco2.toFixed(0)} ppm)`);
  assert.ok(Math.abs(sea.I[1] / sea.Mw / dic0 - 1) < 1e-12, 'what is left keeps its chemistry');
  sea.boilTo(1);   // back: fresh water, nothing made
  assert.ok(Math.abs(total() / c0 - 1) < 1e-12 && sea.left === 1);
  void OC;
});
