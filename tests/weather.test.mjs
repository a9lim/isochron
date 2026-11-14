// Weather: Phillips' criterion. With the equilibrium shear well above
// β L_d²/2 the two-layer flow is baroclinically unstable and storms grow;
// well below it, the same noise decays.
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildGrid } from '../src/grid/icosphere.js';
import { makeTransfer } from '../src/grid/transfer.js';
import { Weather, WEATHER } from '../src/engine/weather.js';

function eddyEnergy(shear) {
  const fine = buildGrid(5), coarse = buildGrid(4);
  const lat = i => Math.asin(fine.pos[3 * i + 2]);
  const climate = {
    grid: fine, coarse, T: makeTransfer(fine, coarse), ocean: null,
    landMask: new Uint8Array(fine.n), elevPos: new Float64Array(fine.n),
    tAt: i => 30 - 45 * Math.sin(lat(i)) ** 2,
  };
  const base = { ...WEATHER };
  Object.assign(WEATHER, { SHEAR: shear });
  const w = new Weather(climate, 'phillips');
  w.start(0);
  for (let s = 0; s < 72 * 25; s++) w.step();
  Object.assign(WEATHER, base);
  // Variance of ψ₂ about its zonal mean, in 5° bands, over the mid-latitudes.
  const nb = 36, sum = new Float64Array(nb), cnt = new Float64Array(nb), band = i => Math.min(nb - 1, Math.floor((w.lat[i] + Math.PI / 2) / Math.PI * nb));
  for (let i = 0; i < w.n; i++) { sum[band(i)] += w.psi2[i]; cnt[band(i)]++; }
  let e = 0;
  for (let i = 0; i < w.n; i++) if (Math.abs(w.lat[i]) > 0.5 && Math.abs(w.lat[i]) < 1.2) e += (w.psi2[i] - sum[band(i)] / cnt[band(i)]) ** 2;
  return e;
}

test("two layers: storms grow above Phillips' criterion and die below it", () => {
  const strong = eddyEnergy(2.2e6), weak = eddyEnergy(1.5e5);
  assert.ok(Number.isFinite(strong) && strong > 30 * weak, `eddy energy ${strong.toExponential(2)} vs ${weak.toExponential(2)}`);
});
