// Dust (src/engine/dust.js): the gusts' expectation, the emission's threshold and
// power law, conservation, plumes against the analytic decay, and a run on the
// opening planet.
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildGrid } from '../src/grid/icosphere.js';
import { Dust, DUST, NP, windFactor, gustFactor, riceDensity, carryingWind } from '../src/engine/dust.js';

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

test('emission: none below the threshold, u²(u − u_t) above it, cubic far above, and gusts lift dust from a calm mean', () => {
  const g = buildGrid(2), n = g.n;
  const d = new Dust(g, { GUST: 0 });
  const wind = new Float32Array(3 * n), rain = new Float32Array(n), source = new Float32Array(n).fill(1);
  const at = V => {
    for (let i = 0; i < n; i++) { // eastward, speed V everywhere off the poles
      const x = g.pos[3 * i], y = g.pos[3 * i + 1], r = Math.hypot(x, y) || 1;
      wind[3 * i] = -V * y / r; wind[3 * i + 1] = V * x / r; wind[3 * i + 2] = 0;
    }
    d.phase(0, { wind, rain, source });
    return d.emit[0][100] / 86400;      // kg m⁻² s⁻¹
  };
  for (const V of [0, 3, 6, 6.49]) assert.equal(at(V), 0, `no emission at ${V} m/s`);
  for (const V of [7, 10, 20]) assert.ok(Math.abs(at(V) / (DUST.C * V * V * (V - DUST.U_T)) - 1) < 1e-5, `C u²(u − u_t) at ${V} m/s`);
  const slope = Math.log(at(400) / at(200)) / Math.log(2);
  assert.ok(Math.abs(slope - 3) < 0.03, `log-log slope ${slope.toFixed(3)} far above the threshold`);
  // With gusts: a calm mean wind lifts a little, and the flux rises with the mean.
  let last = 0;
  for (const V of [0, 2, 4, 6, 8, 12]) {
    const f = windFactor(V, DUST.U_T, DUST.GUST);
    assert.ok(f > last, `gusty flux rises with the mean wind (${V} m/s)`);
    last = f;
  }
  assert.ok(windFactor(0, DUST.U_T, DUST.GUST) > 0);
});

test('the carrying wind: geostrophic part and CARRY of the drift, from the surface wind', async () => {
  const { CLIMATE } = await import('../src/engine/climate.js');
  const g = buildGrid(3), n = g.n, G = new Float32Array(3 * n), w = new Float32Array(3 * n), c = new Float32Array(3 * n);
  // A tangent pressure force at each cell; the template's two winds from it.
  const r = CLIMATE.FRICTION, cy = CLIMATE.CARRY;
  for (let i = 0; i < n; i++) {
    const p = [g.pos[3 * i], g.pos[3 * i + 1], g.pos[3 * i + 2]], a = [0.3, -0.2, 0.9], dot = a[0] * p[0] + a[1] * p[1] + a[2] * p[2];
    const gx = 1e-3 * (a[0] - dot * p[0]), gy = 1e-3 * (a[1] - dot * p[1]), gz = 1e-3 * (a[2] - dot * p[2]), f = 2 * CLIMATE.OMEGA * p[2];
    const kx = p[1] * gz - p[2] * gy, ky = p[2] * gx - p[0] * gz, kz = p[0] * gy - p[1] * gx, D = r * r + f * f;
    w.set([(r * gx - f * kx) / D, (r * gy - f * ky) / D, (r * gz - f * kz) / D], 3 * i);
    c.set([(cy * r * gx - f * kx) / D, (cy * r * gy - f * ky) / D, (cy * r * gz - f * kz) / D], 3 * i);
  }
  carryingWind(g, w, G);
  let worst = 0, big = 0;
  for (let k = 0; k < 3 * n; k++) { worst = Math.max(worst, Math.abs(G[k] - c[k])); big = Math.max(big, Math.abs(c[k])); }
  assert.ok(worst < 1e-4 * big, `carry off by ${worst} of ${big} m/s`);
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
  const d = testCase(5);
  const r = d.solve(2000, 1e-9);
  const res = d.residual();
  d.finish();
  const s = d.stats, err = Math.abs(s.emission - s.deposition) / s.emission;
  assert.ok(res < 1e-6, `residual ${res.toExponential(2)} after ${r.sweeps} sweeps`);
  assert.ok(err < 1e-5, `emitted ${s.emission.toFixed(3)} Tg/yr, deposited ${s.deposition.toFixed(3)} (${err.toExponential(2)})`);
  assert.ok(s.wet > 0 && s.dry > 0);
});

test('two levels: solved on the coarser grid, the engine\'s cells receive what they emitted, near the direct solve', () => {
  const fine = testCase(6), two = testCase(6, { LEVEL: 5 });
  assert.equal(two.n, buildGrid(5).n);
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

// Upwinding is first order: the plume runs long by ~Δx/2ℓ (2% dry, 4% wet at level 6),
// so levels 5 and 6 are extrapolated (Richardson, error ∝ Δx) to the analytic ℓ.
test('a plume under a uniform wind decays as e^{−x/ℓ}, ℓ = U H / v_d (dry deposition only)', t => {
  const a = plume(0, 5), b = plume(0, 6), ex = 2 * b.fit - a.fit;
  t.diagnostic(`ℓ = ${b.ell.toFixed(0)} km: level 5 ${a.fit.toFixed(0)}, level 6 ${b.fit.toFixed(0)}, extrapolated ${ex.toFixed(0)}`);
  assert.ok(Math.abs(b.fit / b.ell - 1) < 0.04, `level 6 ℓ ${b.fit.toFixed(0)} km against ${b.ell.toFixed(0)} km`);
  assert.ok(Math.abs(ex / b.ell - 1) < 0.01, `extrapolated ℓ ${ex.toFixed(0)} km against ${b.ell.toFixed(0)} km`);
});

test('rain shortens the plume by its scavenging: ℓ = U / (v_d/H + w P)', t => {
  const a = plume(2, 5), b = plume(2, 6), ex = 2 * b.fit - a.fit, dry = plume(0, 6);
  t.diagnostic(`ℓ = ${b.ell.toFixed(0)} km: level 5 ${a.fit.toFixed(0)}, level 6 ${b.fit.toFixed(0)}, extrapolated ${ex.toFixed(0)}`);
  assert.ok(Math.abs(b.fit / b.ell - 1) < 0.06, `level 6 ℓ ${b.fit.toFixed(0)} km against ${b.ell.toFixed(0)} km`);
  assert.ok(Math.abs(ex / b.ell - 1) < 0.015, `extrapolated ℓ ${ex.toFixed(0)} km against ${b.ell.toFixed(0)} km`);
  assert.ok(b.fit < 0.56 * dry.fit, `rain shortened the plume to ×${(b.fit / dry.fit).toFixed(3)} (analytic ×${(b.ell / dry.ell).toFixed(3)})`);
});

/** Distance (km) from the nearest cell in `seed`, along the grid's edges (multi-source Dijkstra). */
function distanceFrom(g, seed) {
  const n = g.n, D = new Float64Array(n).fill(Infinity), heap = [];
  const push = (d, i) => { heap.push([d, i]); let k = heap.length - 1; while (k > 0) { const q = (k - 1) >> 1; if (heap[q][0] <= heap[k][0]) break; [heap[q], heap[k]] = [heap[k], heap[q]]; k = q; } };
  const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let k = 0; for (;;) { const a = 2 * k + 1, b = a + 1; let m = k; if (a < heap.length && heap[a][0] < heap[m][0]) m = a; if (b < heap.length && heap[b][0] < heap[m][0]) m = b; if (m === k) break; [heap[m], heap[k]] = [heap[k], heap[m]]; k = m; } } return top; };
  for (let i = 0; i < n; i++) if (seed[i]) { D[i] = 0; push(0, i); }
  while (heap.length) {
    const [d, i] = pop();
    if (d > D[i]) continue;
    for (let t = g.nbrOff[i]; t < g.nbrOff[i + 1]; t++) { const j = g.nbr[t], e = d + g.dist[t] * R_KM; if (e < D[j]) { D[j] = e; push(e, j); } }
  }
  return D;
}

test('the opening planet: dust from the arid zones on the climate\'s winds and rain', { timeout: 300000 }, async () => {
  const { Planet } = await import('../src/engine/planet.js');
  const t0 = performance.now();
  const P = new Planet('earthlike', { level: 6 });
  const c = P.climate, g = c.grid, n = g.n;
  c.solve(3);
  const t1 = performance.now();
  // The stand-in source: the arid (B) share, off snow and ice.
  const source = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    if (!c.landMask[i]) continue;
    const B = c.zones[16 * i + 4] + c.zones[16 * i + 5], ice = P.ice && P.ice.H ? P.ice.H[i] > 1 : false;
    source[i] = ice ? 0 : B * (1 - c.snowAnn[i]);
  }
  const d = new Dust(g);
  const carry = new Float32Array(3 * n);
  const tp = performance.now();
  for (let p = 0; p < NP; p++) d.phase(p, { wind: c.windPhase[p], carry: carryingWind(g, c.windPhase[p], carry), rain: c.Pph[p], source });
  const tPack = (performance.now() - tp) / NP;
  const ts = performance.now();
  const r = d.solve(2000, 1e-6);
  const tSweep = (performance.now() - ts) / r.sweeps;
  const out = d.finish(), s = { ...d.stats };
  const resid = d.residual();
  const iced = i => c.snowAnn[i] > 0.5 || (P.ice && P.ice.H && P.ice.H[i] > 1);
  // Travel: each bin's load-weighted carrying wind × its lifetime (an exponential plume's mean distance).
  const travel = s.burdenBins.map(() => [0, 0]);
  for (let p = 0; p < NP; p++) {
    const w = carryingWind(g, c.windPhase[p], carry), Lf = d.L;   // level 6: the solve's grid is the engine's
    for (let i = 0; i < n; i++) for (let b = 0; b < d.nb; b++) {
      const x = g.area[i] * Lf[(i * NP + p) * d.nb + b];
      travel[b][0] += x * Math.hypot(w[3 * i], w[3 * i + 1], w[3 * i + 2]); travel[b][1] += x;
    }
  }
  const km = travel.map(([u, x], b) => u / x * s.lifetimeBins[b] * 86.4);
  // Where it lands: on the sources, other land, snow and ice, the sea by distance from the coast.
  const coast = distanceFrom(g, c.landMask);
  const kinds = { source: 0, land: 0, snowice: 0, shelf: 0, sea500: 0, sea1000: 0, sea2000: 0 };
  const bands = new Float64Array(6), seaBands = new Float64Array(6);
  let total = 0, emax = 0;
  for (let i = 0; i < n; i++) emax = Math.max(emax, out.emitAnn[i]);
  for (let i = 0; i < n; i++) {
    const m = g.area[i] * out.depAnn[i];
    total += m;
    if (c.landMask[i]) { if (out.emitAnn[i] > 1e-3 * emax) kinds.source += m; else if (iced(i)) kinds.snowice += m; else kinds.land += m; }
    else if (iced(i)) kinds.snowice += m;
    else if (coast[i] < 500) kinds.shelf += m; else if (coast[i] < 1000) kinds.sea500 += m; else if (coast[i] < 2000) kinds.sea1000 += m; else kinds.sea2000 += m;
    const bnd = Math.min(5, Math.floor((c.lat[i] + Math.PI / 2) / Math.PI * 6));
    bands[bnd] += m; if (!c.landMask[i]) seaBands[bnd] += m;
  }
  // Winds over the sources.
  let vs = 0, ws = 0, above = 0;
  for (let p = 0; p < NP; p++) for (let i = 0; i < n; i++) if (source[i] > 0.05) {
    const w = c.windPhase[p], V = Math.hypot(w[3 * i], w[3 * i + 1], w[3 * i + 2]);
    vs += source[i] * V; ws += source[i]; if (V > DUST.U_T) above += source[i];
  }
  // Warm: perturb the winds by 3% and re-solve from the last solution at the default sweeps.
  for (let p = 0; p < NP; p++) { const w = c.windPhase[p].map(x => 1.03 * x); d.phase(p, { wind: w, carry: carryingWind(g, w, carry), rain: c.Pph[p], source }); }
  const before = Float32Array.from(d.L);
  d.solve();
  const warmL = Float32Array.from(d.L);
  d.solve(1200, 1e-6);
  let dw = 0, d0 = 0, sw = 0;
  for (let k = 0; k < d.L.length; k++) { dw += Math.abs(warmL[k] - d.L[k]); d0 += Math.abs(before[k] - d.L[k]); sw += d.L[k]; }
  // Sensitivity: the hyperarid (BW) share alone as the source.
  const bw = new Dust(g);
  for (let i = 0; i < n; i++) source[i] = c.landMask[i] ? c.zones[16 * i + 4] * (1 - c.snowAnn[i]) : 0;
  for (let p = 0; p < NP; p++) bw.phase(p, { wind: c.windPhase[p], carry: carryingWind(g, c.windPhase[p], carry), rain: c.Pph[p], source });
  bw.solve(1200, 1e-6); bw.finish();
  const sb = bw.stats;
  const pct = x => (100 * x / total).toFixed(1) + '%';
  const lines = [
    `planet + 3 cycles ${((t1 - t0) / 1000).toFixed(1)} s; pack ${tPack.toFixed(1)} ms/phase; ${r.sweeps} cold sweeps to 1e-6 at ${tSweep.toFixed(1)} ms each; residual ${resid.toExponential(1)}`,
    `warm (winds +3%): the start is ${(100 * d0 / sw).toFixed(2)}% off (L1), ${DUST.SWEEPS} sweeps leave ${(100 * dw / sw).toFixed(2)}%`,
    `source-weighted mean wind ${(vs / ws).toFixed(1)} m/s, ${(100 * above / ws).toFixed(1)}% of source-phases above u_t`,
    `emission ${s.emission.toFixed(0)} Tg/yr, deposited ${s.deposition.toFixed(0)} (wet ${(100 * s.wet / s.deposition).toFixed(0)}%); burden ${s.burden.toFixed(1)} Tg, lifetime ${s.lifetime.toFixed(1)} d`,
    `fine: burden ${s.burdenBins[0].toFixed(1)} Tg, lifetime ${s.lifetimeBins[0].toFixed(1)} d, travel ~${km[0].toFixed(0)} km; coarse: ${s.burdenBins[1].toFixed(1)} Tg, ${s.lifetimeBins[1].toFixed(1)} d, ~${km[1].toFixed(0)} km`,
    `mean τ ${s.tau.toFixed(4)}, forcing ${s.forcing.toFixed(3)} W/m² (albedo 0)`,
    `lands on: sources ${pct(kinds.source)}, other land ${pct(kinds.land)}, snow and ice ${pct(kinds.snowice)}; sea < 500 km from a coast ${pct(kinds.shelf)}, 500–1000 ${pct(kinds.sea500)}, 1000–2000 ${pct(kinds.sea1000)}, > 2000 ${pct(kinds.sea2000)}`,
    `by latitude (90S→90N, 30° bands): ${Array.from(bands, pct).join(' ')}; at sea ${Array.from(seaBands, pct).join(' ')}`,
    `BW alone: emission ${sb.emission.toFixed(0)} Tg/yr, wet ${(100 * sb.wet / sb.deposition).toFixed(0)}%, lifetime ${sb.lifetime.toFixed(1)} d (fine ${sb.lifetimeBins[0].toFixed(1)}, coarse ${sb.lifetimeBins[1].toFixed(1)})`,
  ];
  console.log(lines.map(l => '  dust: ' + l).join('\n'));
  assert.ok(kinds.sea1000 + kinds.sea2000 > 0, 'some dust reaches the open sea');
  assert.ok(Math.abs(s.emission - s.deposition) < 1e-3 * s.emission, 'conserved');
  assert.ok(s.emission > 0 && s.lifetime > 0.5 && s.lifetime < 30, `lifetime ${s.lifetime.toFixed(1)} days`);
});
