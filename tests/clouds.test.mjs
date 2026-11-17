// The clouds (src/engine/clouds.js): the adding formula's limits, the moist adiabat and the inversion's
// strength against what's known, and on a seeded planet the clouds the climate makes: high cloud where
// it rains, stratocumulus over a cold sea, the shortwave's cooling and the longwave's warming, a cloud
// over snow cooling less than over the sea, and the high cloud's longwave growing with the surface's warmth.
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildGrid } from '../src/grid/icosphere.js';
import { Tectonics } from '../src/engine/plates.js';
import { genesis } from '../src/engine/genesis.js';
import { Climate, CLIMATE } from '../src/engine/climate.js';
import { Ocean } from '../src/engine/ocean.js';
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

test('on a seeded planet: high cloud where it rains, stratocumulus over the cold sea, cooling and warming', () => {
  const g = buildGrid(5), tec = new Tectonics(g);
  genesis(tec, 'earthlike', { spinup: 10 });
  const c = new Climate(tec);
  c.ocean = new Ocean(c, c.coarse);
  c.solve(4);
  const cl = c.clouds, n = g.n;
  assert.equal(cl.stats.points, 24, 'six points a cycle');
  // High cloud follows the rain, point by point.
  let wet = 0, dry = 0, nw = 0, nd = 0;
  for (let p = 0; p < 6; p++) for (let i = 0; i < n; i++) {
    const P = c.Pph[p][i], h = cl.hi[p * n + i];
    if (P > 3) { wet += h; nw++; } else if (P < 0.3) { dry += h; nd++; }
  }
  assert.ok(nw > 50 && nd > 100 && wet / nw > 2.5 * dry / nd, `high cloud ${(wet / nw).toFixed(3)} where it rains past 3 mm/day (${nw}), ${(dry / nd).toFixed(3)} below 0.3 (${nd})`);
  // Stratocumulus: a subtropical sea 4 K colder under the same free troposphere has a stronger
  // inversion by about as much, and more low cloud (its column's humidity rising with it).
  const p = 5, tau = (p + 0.5) / 6, T = Float64Array.from({ length: n }, (_, i) => c.tAt(i, tau)), sst = c.ocean.fine.sst;
  const patch = [];
  for (let i = 0; i < n; i++) { const la = Math.abs(c.lat[i]) * 180 / Math.PI; if (!c.landMask[i] && la > 22 && la < 35 && T[i] + sst[i] > 12) patch.push(i); }
  cl.phase(p, T);
  const before = patch.map(i => [cl.eis[i], cl.lo[p * n + i]]), keepSst = sst.slice();
  for (const i of patch) sst[i] -= 4;
  try { cl.phase(p, T); } finally { sst.set(keepSst); }
  let de = 0, dl = 0;
  patch.forEach((i, k) => { de += cl.eis[i] - before[k][0]; dl += cl.lo[p * n + i] - before[k][1]; });
  de /= patch.length; dl /= patch.length;
  assert.ok(patch.length > 50 && de > 3 && de < 6, `the inversion ${de.toFixed(2)} K stronger over ${patch.length} cells`);
  assert.ok(dl > 0.01, `low cloud up ${dl.toFixed(3)}`);
  cl.phase(p, T);
  // What the energy balance absorbs from one state with its clouds and without: a cooling (the
  // shortwave's, less the high cloud's longwave), and over snow a smaller one than over the sea.
  const snap = { Tc: c.Tc.map(x => x.slice()), Tf: c.Tf.map(x => x.slice()) };
  const absorbed = on => {
    snap.Tc.forEach((x, k) => c.Tc[k].set(x)); snap.Tf.forEach((x, k) => c.Tf[k].set(x));
    const keep = CLOUDS.ON; CLOUDS.ON = on;
    try { const it = c.ebm(); while (!it.next().done); } finally { CLOUDS.ON = keep; }
    return c.scratch.F[0].slice();
  };
  const Fon = absorbed(true), Foff = absorbed(false);
  let dw = 0, a = 0, dSnow = 0, aSnow = 0, dSea = 0, aSea = 0;
  for (let i = 0; i < n; i++) {
    const d = Fon[i] - Foff[i], w = g.area[i];
    dw += w * d; a += w;
    if (c.snowAnn[i] > 0.9 && Math.abs(c.lat[i]) > 1.1) { dSnow += w * d; aSnow += w; }
    else if (!c.landMask[i] && c.snowAnn[i] < 0.01 && Math.abs(c.lat[i]) > 0.8 && Math.abs(c.lat[i]) < 1.1) { dSea += w * d; aSea += w; }
  }
  assert.ok(dw / a < -5 && dw / a > -40, `the clouds' net effect on what the energy balance absorbs: ${(dw / a).toFixed(1)} W/m²`);
  assert.ok(aSnow > 0 && aSea > 0 && dSnow / aSnow > dSea / aSea, `over polar snow ${(dSnow / aSnow).toFixed(1)} W/m², over the open sea at 45–63° ${(dSea / aSea).toFixed(1)}`);
});
