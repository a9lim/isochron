// The sunlight, the energy-balance solver against its analytic modes (dry, and with moist static energy's
// latent part), the template's trough across its sectors, and the grids' transfer.
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildGrid } from '../src/grid/icosphere.js';
import { insolation, solarLongitude, EARTH_ORBIT, S0 } from '../src/engine/orbit.js';
import { cocg, Climate, CLIMATE, pressureCells, wsat } from '../src/engine/climate.js';
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

test('moist static energy: about a uniform state, P₂ forcing gives T = P₂/(B + 6D(1 + μ)), μ = MSE r ∂W_s/∂T', () => {
  // The latent part split into the edges' moist factor and a lagged rest (`moistWeights`, `latentSource`),
  // stepped to its fixed point: the transport is D∇²(T + MSE r W_s(T)), linear in a small anomaly.
  const g = buildGrid(4), n = g.n, B = 2.09, D = 0.45, T0 = 20, r = 0.6, f = 1;
  const ws = { w: Float64Array.from(g.ell, (l, t) => l / g.dist[t]) };
  for (const k of ['rr', 'ri', 'zr', 'zi', 'pr', 'pi', 'qr', 'qi', 'mr', 'mi']) ws[k] = new Float64Array(n);
  const c = Object.assign(Object.create(Climate.prototype), {
    coarse: g, Tc: [0, 1, 2, 3, 4].map(k => new Float64Array(n).fill(k ? 0 : T0)), rc: Array.from({ length: 6 }, () => new Float64Array(n).fill(r)),
    dc: new Float64Array(n), mu: new Float64Array(g.nbrOff[n]), lshare: new Float64Array(g.nbrOff[n]), zs: new Float64Array(n), wsD: ws, wsM: { ...ws, w: Float64Array.from(ws.w) }, Sx: [0, 1, 2, 3, 4].map(() => new Float64Array(n)),
  });
  // The edges' factor from a colder state (μ about half the answer's), so the lagged rest must carry the difference;
  // the latent part whole at every latitude (a uniform μ: the analytic mode's).
  const keep = { MSE_TROP: CLIMATE.MSE_TROP };
  CLIMATE.MSE_TROP = 1;
  c.Tc[0].fill(T0 - 10); c.moistWeights(); c.Tc[0].fill(T0);
  const P2 = Float64Array.from({ length: n }, (_, i) => 1.5 * g.pos[3 * i + 2] ** 2 - 0.5);
  const dr = Float64Array.from(g.area, a => a * B), zero = new Float64Array(n), br = new Float64Array(n);
  for (let it = 0; it < 30; it++) {
    c.latentSource();
    for (let i = 0; i < n; i++) br[i] = g.area[i] * (B * T0 + f * P2[i]) + D * c.Sx[0][i];
    cocg(g, D, dr, zero, br, zero, c.Tc[0], new Float64Array(n), c.wsM, 500, 1e-12);
  }
  Object.assign(CLIMATE, keep);
  let sum = 0;
  for (let i = 0; i < n; i++) sum += c.Sx[0][i];
  assert.ok(Math.abs(sum) < 1e-9, `the latent part's transport sums to ${sum.toExponential(2)}`);
  const mu = CLIMATE.MSE * r * 0.065 * wsat(T0), want = f / (B + 6 * D * (1 + mu)), dry = f / (B + 6 * D);
  let worst = 0;
  for (let i = 0; i < n; i++) worst = Math.max(worst, Math.abs(c.Tc[0][i] - T0 - want * P2[i]) / want);
  assert.ok(mu > 1 && worst < 0.03, `off by ${(100 * worst).toFixed(2)}% of the moist answer (μ ${mu.toFixed(2)}; dry would be ${(dry / want).toFixed(2)}× it)`);
});

test('the template\'s trough is continuous across its sectors\' edges, through each sector\'s latitude at its centre', () => {
  // Taken whole from each cell's sector, the ITCZ stepped every 10° of longitude: lines of convergence and rain along the edges.
  const itcz = Array.from({ length: 36 }, (_, s) => (s % 2 ? 0.2 : -0.2));
  const k = 7, eps = 1e-6, la = 0.12, pts = [k - 0.5 - eps, k - 0.5 + eps, k, k + 1];
  const x = { lat: new Float64Array(4).fill(la), secX: Float32Array.from(pts), landSmooth: new Float64Array(4), polarHi: new Float64Array(4), anom: new Float64Array(4), itcz, phiH: 0.55, pres: new Float64Array(4), C: { ...CLIMATE } };
  pressureCells(x, 0, 4);
  const at = v => { const y = { ...x, secX: new Float32Array(1), lat: new Float64Array(1).fill(la), pres: new Float64Array(1), itcz: itcz.map(() => v) }; pressureCells(y, 0, 1); return y.pres[0]; };
  assert.ok(Math.abs(x.pres[0] - x.pres[1]) < 1e-3, `a step of ${(x.pres[1] - x.pres[0]).toFixed(3)} hPa at the edge`);
  assert.ok(Math.abs(x.pres[2] - at(itcz[k])) < 1e-4 && Math.abs(x.pres[3] - at(itcz[k + 1])) < 1e-4, 'each sector\'s own latitude at its centre');
  assert.ok(Math.abs(at(0.2) - at(-0.2)) > 1, 'the sectors\' latitudes give the trough distinct pressures there');
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
