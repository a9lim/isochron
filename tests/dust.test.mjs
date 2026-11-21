// Dust (src/engine/dust.js): the gusts' expectation, the emission law, conservation on one and two grids, the plume's
// length.
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildGrid } from '../src/grid/icosphere.js';
import { Dust, DUST, NP, windFactor, gustFactor, riceDensity } from '../src/engine/dust.js';

const R_KM = 6371;

/** Every phase the same inputs. */
function allPhases(d, inputs) { for (let p = 0; p < NP; p++) d.phase(p, inputs); }

test('the gusts: Φ(m, t) = E[s²(s − t)⁺] against the Rice density, and the hard threshold as σ → 0', () => {
  // m = 0 (Rayleigh) in closed form: Φ = t e^{−t²/2} + 3√(π/2) erfc(t/√2).
  const erfc = x => { let s = 0; const h = 1e-4; for (let u = x; u < x + 10; u += h) s += Math.exp(-((u + h / 2) ** 2)) * h; return 2 / Math.sqrt(Math.PI) * s; };
  for (const t of [0, 1, 2.6, 4]) {
    const ex = t * Math.exp(-t * t / 2) + 3 * Math.sqrt(Math.PI / 2) * erfc(t / Math.SQRT2);
    assert.ok(Math.abs(gustFactor(0, t) / ex - 1) < 3e-3, `Φ(0, ${t}) = ${gustFactor(0, t)} against ${ex}`);
  }
  // Elsewhere by quadrature of the density.
  const direct = (m, t) => { let s = 0; const h = 0.002; for (let x = t + h / 2; x < m + 14; x += h) s += x * x * (x - t) * riceDensity(x, m) * h; return s; };
  for (const [m, t] of [[1.3, 2.6], [2.1, 2.6], [4, 2.6], [5.7, 1.1], [9, 3], [33, 20]]) {
    assert.ok(Math.abs(gustFactor(m, t) / direct(m, t) - 1) < 5e-3, `Φ(${m}, ${t})`);
  }
  // σ → 0: the expectation tends to the hard form, above and below.
  assert.ok(Math.abs(windFactor(10, 6.5, 0.05) / (100 * 3.5) - 1) < 2e-3);
  assert.ok(windFactor(5, 6.5, 0.05) < 1e-20);
});

/** A divergent and rotating wind, patchy rain and sources, for conservation and parity. */
export function testCase(level, opts = {}) {
  const g = buildGrid(level), n = g.n, d = new Dust(g, opts);
  const wind = new Float32Array(3 * n), rain = new Float32Array(n), source = new Float32Array(n);
  for (let p = 0; p < NP; p++) {
    const a = [Math.cos(p), Math.sin(p), 0.4];
    for (let i = 0; i < n; i++) {
      const x = g.pos[3 * i], y = g.pos[3 * i + 1], z = g.pos[3 * i + 2], dot = a[0] * x + a[1] * y + a[2] * z;
      // 8 m/s solid-body easterly-ish plus 6 m/s toward a, which converges there (divergent).
      wind[3 * i] = -8 * y + 6 * (a[0] - dot * x); wind[3 * i + 1] = 8 * x + 6 * (a[1] - dot * y); wind[3 * i + 2] = 6 * (a[2] - dot * z);
      rain[i] = Math.max(0, 3 + 4 * Math.sin(5 * x + p) * Math.cos(3 * z));
      source[i] = Math.max(0, Math.sin(4 * x + 2 * y) * Math.cos(5 * z + p) - 0.3);
    }
    d.phase(p, { wind, rain, source });
  }
  return d;
}

test('conservation: once converged, the planet deposits what it emits', () => {
  const d = testCase(4);
  const r = d.solve(2000, 1e-9);
  const res = d.residual();
  d.finish();
  const s = d.stats, err = Math.abs(s.emission - s.deposition) / s.emission;
  assert.ok(res < 1e-6, `residual ${res.toExponential(2)} after ${r.sweeps} sweeps`);
  assert.ok(err < 1e-5, `emitted ${s.emission.toFixed(3)} Tg/yr, deposited ${s.deposition.toFixed(3)} (${err.toExponential(2)})`);
  assert.ok(s.wet > 0 && s.dry > 0);
});

test('two levels: solved on the coarser grid, the engine\'s cells receive what they emitted, near the direct solve', () => {
  const fine = testCase(5), two = testCase(5, { LEVEL: 4 });
  assert.equal(two.n, buildGrid(4).n);
  fine.solve(2000, 1e-7); two.solve(2000, 1e-7);
  const a = fine.finish(), sa = fine.stats, b = two.finish(), sb = two.stats;
  const err = Math.abs(sb.emission - sb.deposition) / sb.emission;
  assert.ok(err < 1e-5, `two levels: emitted ${sb.emission.toFixed(3)} Tg/yr, the engine's cells received ${sb.deposition.toFixed(3)}`);
  assert.ok(Math.abs(sb.emission / sa.emission - 1) < 1e-6, 'the same emission');
  let d = 0, s = 0;
  for (let i = 0; i < fine.nf; i++) { const w = fine.grid.area[i]; d += w * Math.abs(a.depAnn[i] - b.depAnn[i]); s += w * a.depAnn[i]; }
  assert.ok(d < 0.1 * s, `deposition ${(100 * d / s).toFixed(1)}% (L1) off the direct solve`);
});

/**
 * A one-dimensional plume: solid-body rotation (U at the equator), a source along one
 * meridian, no mixing. At every latitude the load decays per radian of longitude as
 * e^{−kR/U}, so the band's integral decays as e^{−x/ℓ} with x = Rλ and ℓ = U/k.
 */
function plume(rain, level = 6) {
  const U = 10, g = buildGrid(level), n = g.n;
  const d = new Dust(g, { KAPPA: 0, BINS: [{ name: 'one', share: 1, vd: 0.01, mee: 0.3 }] });
  const wind = new Float32Array(3 * n), emission = new Float32Array(n), R = new Float32Array(n).fill(rain);
  const lon = new Float64Array(n), lat = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const x = g.pos[3 * i], y = g.pos[3 * i + 1], z = g.pos[3 * i + 2];
    wind[3 * i] = -U * y; wind[3 * i + 1] = U * x;
    lon[i] = Math.atan2(y, x); lat[i] = Math.asin(z);
    if (lon[i] > -0.035 && lon[i] <= 0 && Math.abs(lat[i]) < 1.05) emission[i] = 1e-3;
  }
  allPhases(d, { wind, carry: wind, rain: R, emission });
  d.solve(400, 1e-8);
  // Mass by longitude downwind, |φ| < 50°, 3° bins.
  const nbin = 120, mass = new Float64Array(nbin);
  for (let i = 0; i < n; i++) {
    if (Math.abs(lat[i]) > 0.87) continue;
    const dl = ((lon[i] % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
    mass[Math.min(nbin - 1, Math.floor(dl / (2 * Math.PI) * nbin))] += g.area[i] * d.L[(i * NP) * d.nb];
  }
  const k = 0.01 / DUST.H + DUST.SCAV * rain / 86400, ell = U / k / 1000;
  // Fit log mass against x over 1,000 km to 3ℓ.
  let sx = 0, sy = 0, sxx = 0, sxy = 0, c = 0;
  for (let b = 0; b < nbin; b++) {
    const x = (b + 0.5) / nbin * 2 * Math.PI * R_KM;
    if (x < 1000 || x > 3 * ell || !(mass[b] > 0)) continue;
    const y = Math.log(mass[b]);
    sx += x; sy += y; sxx += x * x; sxy += x * y; c++;
  }
  const slope = (c * sxy - sx * sy) / (c * sxx - sx * sx);
  return { fit: -1 / slope, ell };
}

test('rain shortens the plume by its scavenging: ℓ = U / (v_d/H + w P)', t => {
  const a = plume(2, 5), b = plume(2, 6), ex = 2 * b.fit - a.fit;
  assert.ok(Math.abs(b.fit / b.ell - 1) < 0.06, `level 6 ℓ ${b.fit.toFixed(0)} km against ${b.ell.toFixed(0)} km`);
  assert.ok(Math.abs(ex / b.ell - 1) < 0.015, `extrapolated ℓ ${ex.toFixed(0)} km against ${b.ell.toFixed(0)} km`);
});
