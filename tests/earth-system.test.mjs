// Ice and carbon: Vialov's steady ice cap, and the thermostat's balance.
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildGrid } from '../src/grid/icosphere.js';
import { Ice } from '../src/engine/ice.js';
import { Carbon, CARBON } from '../src/engine/carbon.js';

test("ice: a cap under uniform snowfall on a flat bed settles to Vialov's profile", () => {
  const g = buildGrid(5), n = g.n;
  const tec = { grid: g, elev: new Float32Array(n).fill(0.5), seaLevel: 0, updateElevation() {} };
  const climate = { version: 0, tAt: () => 0, pAt: () => 0 };
  const ice = new Ice(tec, climate);
  ice.mbVersion = 0;                        // the mass balance is set by hand
  const L = 0.25;                           // the cap's radius (rad, ~1,600 km)
  const r = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    r[i] = Math.acos(Math.min(1, g.pos[3 * i + 2]));
    ice.M[i] = r[i] < L ? 0.3 : -50;        // snowfall inside, everything melts outside
  }
  for (let k = 0; k < 400; k++) ice.advance(1000, 1e9);
  const H0 = Math.max(...ice.H);
  assert.ok(H0 > 1500 && H0 < 6000, `dome ${H0.toFixed(0)} m`);
  let worst = 0;
  for (let i = 0; i < n; i++) {
    if (r[i] > 0.8 * L) continue;
    const v = Math.pow(1 - Math.pow(r[i] / L, 4 / 3), 3 / 8);
    worst = Math.max(worst, Math.abs(ice.H[i] / H0 - v));
  }
  assert.ok(worst < 0.08, `profile off by ${(100 * worst).toFixed(1)}% of the dome`);
});

test('carbon: with the climate fixed, CO₂ settles where weathering meets outgassing', () => {
  const g = buildGrid(2);
  const tec = { grid: g, t: 0, t0: 40, counters: { opened: 40 * CARBON.RIDGE_REF * g.n / 40962, closed: 40 * CARBON.ARC_REF * g.n / 40962 } };
  const climate = { co2Seen: 280 };
  const c = new Carbon(tec, null, climate);
  c.wF = c.wF0 = 1; c.wCO2 = 280;
  for (const out of [0.5, 1, 2]) {
    CARBON.OUTGAS = out;
    for (let k = 0; k < 400; k++) { tec.t += 0.01; tec.counters.opened += 0.01 * CARBON.RIDGE_REF * g.n / 40962; tec.counters.closed += 0.01 * CARBON.ARC_REF * g.n / 40962; c.step(1e4); }
    const want = c.equilibrium(c.flux.out);
    assert.ok(Math.abs(c.pco2 / want - 1) < 0.01, `outgassing ×${out}: ${c.pco2.toFixed(1)} ppm vs ${want.toFixed(1)}`);
    assert.ok(Math.abs(c.flux.out - c.flux.weather) / c.flux.out < 0.01, 'fluxes balance');
  }
  CARBON.OUTGAS = 1;
  assert.ok(Math.abs(c.equilibrium(CARBON.V0) - 280) < 1, 'the reference outgassing balances at the reference CO₂');
});
