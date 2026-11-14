// Climate: the sunlight, the energy-balance solver against its analytic modes,
// and a seeded planet's climate within Earth-like bounds.
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildGrid } from '../src/grid/icosphere.js';
import { insolation, solarLongitude, EARTH_ORBIT, S0 } from '../src/engine/orbit.js';
import { cocg, Climate, NZ } from '../src/engine/climate.js';
import { Tectonics } from '../src/engine/plates.js';
import { genesis } from '../src/engine/genesis.js';
import { makeTransfer, prolong, restrict } from '../src/grid/transfer.js';

test('insolation: the global annual mean is S/4 ÷ √(1 − e²); polar day at the solstice', () => {
  let sum = 0, w = 0;
  for (let s = 0; s < 360; s++) {
    const lam = solarLongitude((s + 0.5) / 360, EARTH_ORBIT);
    for (let l = 0; l < 180; l++) {
      const phi = -Math.PI / 2 + Math.PI * (l + 0.5) / 180, c = Math.cos(phi);
      sum += insolation(phi, lam, EARTH_ORBIT) * c; w += c;
    }
  }
  const expect = S0 / 4 / Math.sqrt(1 - EARTH_ORBIT.e ** 2);
  assert.ok(Math.abs(sum / w / expect - 1) < 2e-3, `mean ${(sum / w).toFixed(2)} vs ${expect.toFixed(2)}`);
  const pole = insolation(Math.PI / 2, Math.PI / 2, EARTH_ORBIT);
  assert.ok(pole > 500 && pole < 540, `north pole at the June solstice ${pole.toFixed(0)} W/m²`);
  assert.equal(insolation(-Math.PI / 2, Math.PI / 2, EARTH_ORBIT), 0);
});

test('energy balance: B T − D∇²T = P₂ gives T = P₂/(B + 6D), and the seasonal mode is damped by B + iωC', () => {
  const g = buildGrid(5), n = g.n;
  const ws = { w: Float64Array.from(g.ell, (l, t) => l / g.dist[t]) };
  for (const k of ['rr', 'ri', 'zr', 'zi', 'pr', 'pi', 'qr', 'qi', 'mr', 'mi']) ws[k] = new Float64Array(n);
  const P2 = Float64Array.from({ length: n }, (_, i) => 1.5 * g.pos[3 * i + 2] ** 2 - 0.5);
  const B = 2.09, D = 0.45, C = 7.9, om = 2 * Math.PI;
  for (const [ci, label] of [[0, 'mean'], [C, 'seasonal']]) {
    const dr = new Float64Array(n), di = new Float64Array(n), br = new Float64Array(n), bi = new Float64Array(n);
    const xr = new Float64Array(n), xi = new Float64Array(n);
    for (let i = 0; i < n; i++) { dr[i] = g.area[i] * B; di[i] = g.area[i] * om * ci; br[i] = g.area[i] * P2[i]; }
    cocg(g, D, dr, di, br, bi, xr, xi, ws, 500, 1e-10);
    const den = { r: B + 6 * D, i: om * ci }, m2 = den.r ** 2 + den.i ** 2;
    let worst = 0;
    for (let i = 0; i < n; i++) {
      const er = P2[i] * den.r / m2, ei = -P2[i] * den.i / m2;
      worst = Math.max(worst, Math.hypot(xr[i] - er, xi[i] - ei) / Math.hypot(er, ei + 1e-12) * Math.abs(P2[i]));
    }
    assert.ok(worst < 0.02, `${label}: off by ${(100 * worst).toFixed(2)}%`);
  }
});

test('transfer: restriction keeps the integral, prolongation keeps a constant', () => {
  const f = buildGrid(5), c = buildGrid(4), T = makeTransfer(f, c);
  const u = Float64Array.from({ length: f.n }, (_, i) => Math.sin(3 * f.pos[3 * i]) + f.pos[3 * i + 2]);
  const uc = restrict(T, u, new Float64Array(c.n));
  let If = 0, Ic = 0, Wc = 0;
  for (let i = 0; i < f.n; i++) If += u[i] * f.area[i];
  for (let i = 0; i < c.n; i++) { Ic += uc[i] * T.wsum[i]; Wc += T.wsum[i]; }
  assert.ok(Math.abs(If - Ic) < 1e-9 && Math.abs(Wc - 4 * Math.PI) < 1e-9);
  const one = prolong(T, new Float64Array(c.n).fill(1), new Float64Array(f.n));
  assert.ok(one.every(v => Math.abs(v - 1) < 1e-12));
});

test('a seeded planet: Earth-like mean temperature, wet tropics, dry subtropics, zones summing to one', () => {
  const g = buildGrid(5), tec = new Tectonics(g);
  genesis(tec, 'climate-test', { spinup: 0 });
  const clim = new Climate(tec);
  clim.solve(3);
  const s = clim.stats, z = clim.zonal;
  assert.ok(s.meanT > 5 && s.meanT < 22, `mean T ${s.meanT.toFixed(1)}`);
  assert.ok(s.meanP > 500 && s.meanP < 1600, `mean P ${s.meanP.toFixed(0)}`);
  const eq = z.P[44] + z.P[45], sub = z.P[34] + z.P[55];
  assert.ok(eq > 2 * sub, `equator ${eq.toFixed(0)} vs subtropics ${sub.toFixed(0)}`);
  for (let i = 0; i < g.n; i++) {
    if (!clim.landMask[i]) continue;
    let sum = 0;
    for (let k = 0; k < NZ; k++) sum += clim.zones[NZ * i + k];
    assert.ok(Math.abs(sum - 1) < 1e-6, `cell ${i} zones sum to ${sum}`);
  }
});
