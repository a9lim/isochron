// The clouds (src/engine/clouds.js): the adding formula's limits, and the moist adiabat against the standard
// atmosphere.
import test from 'node:test';
import assert from 'node:assert/strict';
import { CLIMATE } from '../src/engine/climate.js';
import { CLOUDS, shortwave, longwave, topEmission, t700, moistLapse } from '../src/engine/clouds.js';

test('the adding formula: its limits, and a cloud over snow adds less than over the sea', () => {
  for (const a of [0, 0.1, 0.6, 0.9]) {
    assert.equal(shortwave(a, 0, 0.3, 0, 0.3), a, 'no cloud: the clear sky');
    assert.ok(Math.abs(shortwave(a, 1, 0, 0, 0.3) - a) < 1e-12, 'a layer that reflects nothing: the clear sky');
  }
  assert.ok(Math.abs(shortwave(0, 1, 0.4, 0, 0) - 0.4) < 1e-12, 'overcast over black: the layer\'s albedo');
  assert.ok(Math.abs(shortwave(1, 1, 0.4, 1, 0.5) - 1) < 1e-12, 'over a perfect reflector: everything');
  // Monotone in cover and in the surface, and a layer over a bright surface adds less.
  let last = -1;
  for (let c = 0; c <= 1; c += 0.1) { const v = shortwave(0.1, c, 0.4, 0, 0); assert.ok(v > last); last = v; }
  const dSea = shortwave(0.08, 0.5, 0.4, 0, 0) - 0.08, dSnow = shortwave(0.65, 0.5, 0.4, 0, 0) - 0.65;
  assert.ok(dSea > 3 * dSnow, `half a sky of cloud brightens the sea by ${dSea.toFixed(3)}, snow by ${dSnow.toFixed(3)}`);
  // The two layers' order: the formula is the same light either way for one layer each.
  assert.ok(Math.abs(shortwave(0.2, 1, 0.3, 1, 0.5) - shortwave(0.2, 1, 0.5, 1, 0.3)) < 1e-12, 'overcast layers commute');
});

test('the moist adiabat and the inversion: against the standard atmosphere\'s numbers', () => {
  // A surface parcel at 80% humidity: from 28 °C at 1000 hPa it saturates ~0.5 km up and reaches
  // 700 hPa ~13–17 °C warmer than the dry adiabat would (~−5 °C); from 0 °C, near the dry adiabat.
  const w = t700(28) - 273.15, c = t700(0) - 273.15, dry = T0 => (T0 + 273.15) * (700 / 1000) ** (287 / 1004) - 273.15;
  assert.ok(w - dry(28) > 13 && w - dry(28) < 19 && w > 8 && w < 14, `28 °C → ${w.toFixed(1)} °C at 700 hPa (dry ${dry(28).toFixed(1)})`);
  assert.ok(c - dry(0) > 3 && c - dry(0) < 9, `0 °C → ${c.toFixed(1)} °C at 700 hPa (dry ${dry(0).toFixed(1)})`);
  // The moist lapse rate: ~4 K/km in warm air, toward the dry 9.8 in cold.
  const g1 = moistLapse(300, 850), g2 = moistLapse(250, 850);
  assert.ok(g1 > 3 && g1 < 5 && g2 > 7.5 && g2 < 9.8, `Γm ${g1.toFixed(2)} K/km at 300 K, ${g2.toFixed(2)} at 250 K`);
  // The high cloud's longwave: c (L − σT⁴), and c B a kelvin warmer.
  const E = topEmission(), L = 280;
  assert.ok(Math.abs(longwave(L, 0.3) - 0.3 * (L - E)) < 1e-9 && longwave(E - 1, 0.5) === 0);
  assert.ok(Math.abs(longwave(L + CLIMATE.B, 0.3) - longwave(L, 0.3) - 0.3 * CLIMATE.B) < 1e-9, 'the fixed top: c B per kelvin');
  assert.equal(longwave(CLOUDS.L_MAX + 50, 0.3), longwave(CLOUDS.L_MAX, 0.3), 'no more than a saturated clear sky to mask');
});
