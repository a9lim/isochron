// Sea ice (src/engine/seaice.js): Stefan's growth, free drift, conservation, the
// cavitating fluid, a coastal polynya, the periodic year, and a seeded planet.
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildGrid } from '../src/grid/icosphere.js';
import { SeaIce, SEAICE, excess, edgeSpread } from '../src/engine/seaice.js';

const DEG = Math.PI / 180, R_M = 6.371e6, MONTH = 365.2422 / 12;
const G4 = buildGrid(4), N4 = G4.n;
const latOf = (g, i) => Math.asin(g.pos[3 * i + 2]);
const lonOf = (g, i) => Math.atan2(g.pos[3 * i + 1], g.pos[3 * i]);
const fill = (n, f) => Float32Array.from({ length: n }, (_, i) => f(i));
/** Run f with SEAICE's constants changed, then put them back. */
const withParams = (p, f) => { const keep = { ...SEAICE }; Object.assign(SEAICE, p); try { return f(); } finally { Object.assign(SEAICE, keep); } };
/** The divergence of the edges' velocities at cell i (1/s). */
function divergence(si, i) {
  const g = si.grid;
  let d = 0;
  for (let t = g.nbrOff[i]; t < g.nbrOff[i + 1]; t++) { const e = si.he[t]; d += (si.ei[e] === i ? 1 : -1) * si.un[e] * si.el[e] / R_M; }
  return d / g.area[i];
}
/** Sea cells next to land. */
const coastal = (g, sea) => Array.from({ length: g.n }, (_, i) => i).filter(i => sea[i] && Array.from({ length: g.nbrOff[i + 1] - g.nbrOff[i] }, (_, k) => g.nbr[g.nbrOff[i] + k]).some(j => !sea[j]));

test("the days' mean excess over a threshold, against the Gaussian integral", () => {
  for (const [mu, a, s] of [[-20, -1.8, 5], [-1, 0, 5], [3, 0, 5], [0.5, -1.8, 3], [-30, 0, 5]]) {
    let sum = 0;
    const k = 20000, lo = mu - 10 * s, dx = 20 * s / k;
    for (let j = 0; j <= k; j++) { const x = lo + j * dx, w = j === 0 || j === k ? 0.5 : 1; sum += w * Math.max(0, x - a) * Math.exp(-0.5 * ((x - mu) / s) ** 2); }
    const want = sum * dx / (s * Math.sqrt(2 * Math.PI));
    assert.ok(Math.abs(excess(mu, a, s) - want) < 1e-6 * Math.max(1, want), `excess(${mu}, ${a}, ${s}) = ${excess(mu, a, s)}, integral ${want}`);
  }
});

test("Stefan's law: thickness grows as √FDD, and Anderson's form with its linear term", () => {
  const months = [-5, -12, -20, -28, -25, -18, -9, -3];   // a winter's monthly air temperatures (°C)
  for (const He of [0, SEAICE.H_E]) withParams({ SIGMA: 0, F_BASE: 0, H_E: He }, () => {
    const si = new SeaIce(G4, { dynamics: false });
    const h0 = 0.05;
    si.h.fill(h0); si.A.fill(1);
    let fdd = 0;
    for (const [m, T] of months.entries()) {
      si.stepMonth(m % 12, new Float32Array(N4).fill(T), null, null, null, null, null);
      fdd += (SEAICE.T_F - T) * MONTH;
      // h² + 2hₑh = h₀² + 2hₑh₀ + κ FDD, solved for h.
      const want = -He + Math.sqrt(He * He + h0 * h0 + 2 * He * h0 + SEAICE.KAPPA * fdd);
      assert.ok(Math.abs(si.h[0] - want) < 1e-9, `month ${m}: h ${si.h[0]}, analytic ${want}`);
      assert.equal(si.A[0], 1);
    }
    if (He === 0) {
      const r = si.h[0] / Math.sqrt(SEAICE.KAPPA * fdd + h0 * h0);
      assert.ok(Math.abs(r - 1) < 1e-9);
    }
  });
  // From open water, 4,000 degree-days give Anderson's ~1.6 m (h² + 5.1h = 6.7 FDD, cm): new ice first closes the
  // leads (Hibler's h₀), then thickens by Stefan's law.
  withParams({ SIGMA: 0, F_BASE: 0 }, () => {
    const si = new SeaIce(G4, { dynamics: false });
    const T = -1.8 - 4000 / (5 * MONTH);
    for (let m = 0; m < 5; m++) si.stepMonth(m, new Float32Array(N4).fill(T), null, null, null, null, null);
    const anderson = (-5.1 + Math.sqrt(5.1 * 5.1 + 4 * 6.7 * 4000)) / 2 / 100;
    console.log(`  4,000 FDD from open water: h ${si.h[0].toFixed(3)} m, A ${si.A[0].toFixed(4)}; Anderson's ${anderson.toFixed(3)} m from bare ice`);
    assert.ok(si.A[0] > 0.999);
    assert.ok(Math.abs(si.h[0] - anderson) < 0.1 * anderson, `h ${si.h[0]}`);
  });
});

test("free drift: 2% of the wind, turned 25° to the right in the north and the left in the south, plus the current", () => {
  const si = new SeaIce(G4);
  const wu = fill(N4, () => 6), wv = fill(N4, () => 8), cu = fill(N4, () => 0.03), cv = fill(N4, () => -0.01);
  si.prepare(new Float32Array(N4).fill(-10), wu, wv, null, null, null);
  const angle = i => {   // the drift's direction against the wind's, counterclockwise seen from outside (degrees)
    const E = si.east, Nn = si.north, o = 3 * i;
    const du = si.uf[o] * E[o] + si.uf[o + 1] * E[o + 1] + si.uf[o + 2] * E[o + 2], dv = si.uf[o] * Nn[o] + si.uf[o + 1] * Nn[o + 1] + si.uf[o + 2] * Nn[o + 2];
    return [Math.hypot(du, dv), (Math.atan2(dv, du) - Math.atan2(8, 6)) / DEG];
  };
  let checked = 0;
  for (let i = 0; i < N4; i++) {
    const la = latOf(G4, i) / DEG;
    if (Math.abs(la) < 20 || Math.abs(la) > 85) continue;
    const [s, th] = angle(i);
    assert.ok(Math.abs(s - 0.02 * 10) < 1e-9, `speed ${s} at ${la.toFixed(1)}°`);
    assert.ok(Math.abs(th - (la > 0 ? -25 : 25)) < 1e-3 * 25 + 25 * (1 - Math.tanh(Math.abs(la) / 5)), `turned ${th.toFixed(3)}° at ${la.toFixed(1)}°`);
    checked++;
  }
  assert.ok(checked > N4 / 2);
  // The current adds as it is.
  const a = si.uf.slice();
  si.prepare(new Float32Array(N4).fill(-10), wu, wv, cu, cv, null);
  for (let i = 0; i < N4; i += 37) {
    const o = 3 * i, E = si.east, Nn = si.north;
    for (let k = 0; k < 3; k++) assert.ok(Math.abs(si.uf[o + k] - a[o + k] - (cu[i] * E[o + k] + cv[i] * Nn[o + k])) < 1e-12);
  }
});

test('transport keeps the ice volume, closed at the coasts', () => {
  // A continent, ragged ice, and a wind that swirls and converges and diverges.
  const sea = Uint8Array.from({ length: N4 }, (_, i) => (Math.abs(latOf(G4, i) - 50 * DEG) < 15 * DEG && Math.abs(lonOf(G4, i)) < 40 * DEG ? 0 : 1));
  const si = new SeaIce(G4, { sea, thermo: false });
  for (let i = 0; i < N4; i++) if (sea[i]) { const s = Math.sin(7 * lonOf(G4, i)) * Math.cos(5 * latOf(G4, i)); si.A[i] = Math.max(0, Math.min(1, 0.6 + 0.6 * s)); si.h[i] = si.A[i] * (1 + 0.8 * Math.cos(3 * lonOf(G4, i))); if (si.A[i] < 0.02) si.A[i] = si.h[i] = 0; }
  const wu = fill(N4, i => 12 * Math.sin(2 * latOf(G4, i)) + 6 * Math.cos(3 * lonOf(G4, i)));
  const wv = fill(N4, i => 9 * Math.sin(2 * lonOf(G4, i)) * Math.cos(latOf(G4, i)));
  const cu = fill(N4, i => 0.1 * Math.cos(4 * latOf(G4, i))), cv = fill(N4, () => 0.02);
  const v0 = si.volume();
  let maxA = 0, landIce = 0;
  for (let m = 0; m < 12; m++) {
    si.stepMonth(m, new Float32Array(N4), wu, wv, cu, cv, null);
    for (let i = 0; i < N4; i++) { maxA = Math.max(maxA, si.A[i]); if (!sea[i]) landIce += si.h[i]; }
  }
  const v1 = si.volume() + si.lost;
  console.log(`  12 months of drift: volume ${(v1 / v0 - 1).toExponential(2)} relative (dropped below H_MIN: ${(si.lost / v0).toExponential(2)}), ${si.stats.substeps} substeps a month`);
  assert.ok(Math.abs(v1 / v0 - 1) < 1e-12);
  assert.equal(landIce, 0);
  assert.ok(maxA <= 1);
});

test('the cavitating fluid: compact ice resists convergence, divergence opens freely, loose ice packs', () => {
  // A polar continent (north of 75°) and wind toward it (onshore, convergent at the coast) or away from it.
  const sea = Uint8Array.from({ length: N4 }, (_, i) => (latOf(G4, i) > 75 * DEG ? 0 : 1));
  const T = new Float32Array(N4);
  const run = (A0, vN, pstar) => withParams(pstar === undefined ? {} : { P_STAR: pstar }, () => {
    const si = new SeaIce(G4, { sea, thermo: false });
    for (let i = 0; i < N4; i++) if (sea[i] && latOf(G4, i) > 50 * DEG) { si.A[i] = A0; si.h[i] = A0 * 1.5; }
    const wv = fill(N4, i => (latOf(G4, i) > 0 ? vN : 0));
    const v0 = si.volume(), area0 = si.A.reduce((s, a, i) => s + a * G4.area[i], 0);
    si.stepMonth(0, T, null, wv, null, null, null);
    let worst = 0, hmax = 0;
    for (let q = 0; q < si.nact; q++) { const i = si.active[q]; if (si.A[i] > 0.99 && si.P[i] < 0.99 * si.pmax[i]) worst = Math.min(worst, divergence(si, i)); }
    for (let i = 0; i < N4; i++) hmax = Math.max(hmax, si.h[i]);
    const area1 = si.A.reduce((s, a, i) => s + a * G4.area[i], 0);
    return { si, worst: worst * MONTH * 86400, hmax, dv: (si.volume() + si.lost) / v0 - 1, darea: area1 / area0 - 1 };
  });
  // Onshore at full concentration: the pressure stops the convergence (strong ice: the cap isn't reached).
  const strong = run(1, 10, 1e7), free = run(1, 10, 0);
  console.log(`  onshore, compact: thickest ${strong.hmax.toFixed(3)} m with the pressure, ${free.hmax.toFixed(3)} m in free drift; worst convergence where P is below its cap ${strong.worst.toExponential(2)} of a cell a month; max P ${strong.si.stats.maxP.toExponential(2)} N/m`);
  assert.ok(strong.worst > -0.01, 'compact ice under its cap barely converges');
  assert.ok(strong.hmax < 1.5 * 1.05, 'and barely ridges');
  assert.ok(free.hmax > 1.5 * 1.3, 'free drift piles it up against the coast');
  // With the standard strength, thin compact ice ridges somewhat, but less than in free drift.
  const std = run(1, 10);
  assert.ok(std.hmax < free.hmax);
  // Offshore: no pressure anywhere, the drift is free, and the pack opens at the coast (its area moves, it isn't lost).
  const off = run(1, -10), coast = coastal(G4, sea);
  assert.equal(off.si.stats.maxP, 0);
  for (let e = 0; e < off.si.ne; e++) if (off.si.wet[e]) assert.equal(off.si.un[e], off.si.unf[e]);
  const coastA = coast.reduce((s, i) => s + off.si.A[i], 0) / coast.length;
  assert.ok(coastA < 0.9, `the coast's concentration ${coastA}`);
  assert.ok(Math.abs(off.darea) < 1e-12, 'transport alone moves area without making or losing it');
  // Loose ice (A = 0.7) has almost no strength: onshore it packs, gaining area per cell without resistance.
  const loose = run(0.7, 10);
  let packed = 0;
  for (let i = 0; i < N4; i++) if (loose.si.A[i] > 0.75) packed++;
  assert.ok(packed > 10, `cells packed past 0.75: ${packed}`);
  assert.ok(Math.abs(strong.dv) < 1e-12 && Math.abs(loose.dv) < 1e-12);
});

test('a coastal polynya under an offshore wind', () => {
  const sea = Uint8Array.from({ length: N4 }, (_, i) => (latOf(G4, i) > 75 * DEG ? 0 : 1));
  const coast = coastal(G4, sea);
  const T = fill(N4, i => (latOf(G4, i) > 55 * DEG ? -25 : 10));
  const run = vN => {
    const si = new SeaIce(G4, { sea });
    for (let i = 0; i < N4; i++) if (sea[i] && latOf(G4, i) > 55 * DEG) { si.A[i] = 1; si.h[i] = 1.5; }
    const wv = fill(N4, i => (latOf(G4, i) > 0 ? vN : 0));
    for (let m = 0; m < 3; m++) si.stepMonth(m, T, null, wv, null, null, null);
    const o = 2 * N4;
    let A = 0, grow = 0, w = 0;
    for (const i of coast) { A += si.Am[o + i] * G4.area[i]; grow += si.grow[o + i] * G4.area[i]; w += G4.area[i]; }
    return { A: A / w, grow: grow / w };
  };
  const off = run(-10), on = run(10);
  console.log(`  coast: offshore wind A ${off.A.toFixed(3)}, new ice ${off.grow.toFixed(3)} m a month; onshore A ${on.A.toFixed(3)}, ${on.grow.toFixed(3)} m`);
  assert.ok(off.A < 0.95 && off.A < on.A - 0.05, 'the offshore wind holds open water at the coast');
  assert.ok(off.grow > 2 * on.grow, 'and the open water makes ice: a factory');
});

test('the periodic year is reached, and repeats', () => {
  const sea = Uint8Array.from({ length: N4 }, (_, i) => (Math.abs(latOf(G4, i) - 60 * DEG) < 12 * DEG && lonOf(G4, i) > 0 && lonOf(G4, i) < 90 * DEG ? 0 : 1));
  const forcing = Array.from({ length: 12 }, (_, m) => {
    const season = Math.cos(2 * Math.PI * (m + 0.5) / 12 - 2 * Math.PI * 0.5 / 12);   // ~January coldest in the north
    const T = fill(N4, i => { const s = Math.sin(latOf(G4, i)); return 27 - 48 * s * s - 16 * season * Math.sign(s) * s * s; });
    const wu = fill(N4, i => -8 * Math.sin(3 * latOf(G4, i))), wv = fill(N4, i => 2 * Math.cos(2 * lonOf(G4, i)) * Math.cos(latOf(G4, i)));
    const cu = fill(N4, i => 0.05 * Math.sin(2 * lonOf(G4, i))), sst = fill(N4, i => 1.5 * Math.cos(lonOf(G4, i)));
    return [T, wu, wv, cu, null, sst];
  });
  const si = new SeaIce(G4, { sea });
  const t0 = performance.now();
  const years = si.equilibrium(forcing, { cold: true });
  const ms = performance.now() - t0;
  assert.ok(si.stats.converged, JSON.stringify(si.stats.residual));
  const Am = si.Am.slice(), h = si.h.slice();
  const warm = si.equilibrium(forcing);
  assert.equal(warm, 1, 'a warm start that has nothing to do takes one year');
  let dA = 0, dh = 0, w = 0;
  for (let i = 0; i < N4; i++) { w += G4.area[i]; dh += G4.area[i] * (si.h[i] - h[i]) ** 2; for (let m = 0; m < 12; m++) dA += G4.area[i] * (si.Am[m * N4 + i] - Am[m * N4 + i]) ** 2 / 12; }
  console.log(`  cold start: ${years} years (${ms.toFixed(0)} ms at level 4); the next year's months differ by rms ${Math.sqrt(dA / w).toExponential(2)} in A, ${Math.sqrt(dh / w).toExponential(2)} m in h`);
  assert.ok(Math.sqrt(dA / w) < 0.002 && Math.sqrt(dh / w) < 0.005);
  // It has a season: more ice in the north's winter than its summer.
  const ext = (m, north) => { let e = 0; for (let i = 0; i < N4; i++) if ((latOf(G4, i) > 0) === north && si.Am[m * N4 + i] >= 0.15) e += G4.area[i]; return e; };
  assert.ok(ext(2, true) > 1.2 * ext(8, true) && ext(8, false) > 1.2 * ext(2, false));
});

test('a seeded planet: extent and edge against the diagnostic share', async () => {
  let Planet;
  try { ({ Planet } = await import('../src/engine/planet.js')); } catch (e) { console.log(`  planet.js didn't load (${e.message}); skipped`); return; }
  const P = new Planet('earthlike', { level: 6 });
  // Five cycles: the ocean solves before the winds within a cycle, so the gyres' first solve (cycle 1) sees no
  // wind and the next is cycle 4 (after three the currents and the SST anomaly are still zero), and the
  // energy balance's share under ice (snowAnn, today's diagnostic) reads that anomaly from cycle 5.
  P.climate.solve(5);
  const c = P.climate, si = SeaIce.fromClimate(c), g = si.grid, n = g.n;
  let t0 = performance.now();
  const years = si.equilibrium(m => si.climateMonth(m), { cold: true });
  const cold = performance.now() - t0;
  t0 = performance.now();
  for (let m = 0; m < 12; m++) si.stepMonth(m, ...si.climateMonth(m));
  const perMonth = (performance.now() - t0) / 12;
  t0 = performance.now();
  const warmYears = si.equilibrium(m => si.climateMonth(m));
  const warm = performance.now() - t0;
  assert.ok(si.stats.converged, JSON.stringify(si.stats.residual));
  // The diagnostic (today's): the climate's share under ice at the month, ramp(−(T + T′), 1.5, 6), on the same forcing.
  const ramp = (x, a, b) => { const t = (x - a) / (b - a); return t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t); };
  const diag = new Float32Array(12 * n);
  for (let m = 0; m < 12; m++) { const [T, , , , , s] = si.climateMonth(m); for (let i = 0; i < n; i++) diag[m * n + i] = si.sea[i] ? ramp(-(T[i] + s[i]), 1.5, 6) : 0; }
  const R2 = R_M * R_M / 1e12;
  const extent = (F, m, north) => { let e = 0; for (let i = 0; i < n; i++) if (si.sea[i] && (si.lat[i] >= 0) === north && F[m * n + i] >= 0.15) e += g.area[i] * R2; return e; };
  const row = (F, m) => F.subarray(m * n, (m + 1) * n);
  const annual = F => { const a = new Float32Array(n); for (let m = 0; m < 12; m++) for (let i = 0; i < n; i++) a[i] += F[m * n + i] / 12; return a; };
  const f1 = x => x.toFixed(1), f2 = x => x.toFixed(2);
  const lines = [`  earthlike, level 6: closure ${years} years cold (${cold.toFixed(0)} ms), ${warmYears} warm (${warm.toFixed(0)} ms); a month ${perMonth.toFixed(2)} ms (zone ${si.nz} of ${n} cells, ${si.stats.substeps} substeps)`];
  for (const [north, name] of [[true, 'north'], [false, 'south']]) {
    const exM = Array.from({ length: 12 }, (_, m) => extent(si.Am, m, north)), exD = Array.from({ length: 12 }, (_, m) => extent(diag, m, north));
    const mx = exM.indexOf(Math.max(...exM)), mn = exM.indexOf(Math.min(...exM));
    lines.push(`  ${name}: extent (10⁶ km²) max month ${mx} model ${f1(exM[mx])} diagnostic ${f1(exD[mx])}; min month ${mn} model ${f1(exM[mn])} diagnostic ${f1(exD[mn])}; diagnostic's own min ${f1(Math.min(...exD))}`);
    for (const m of [mx, mn]) {
      const em = edgeSpread(g, row(si.Am, m), si.sea), ed = edgeSpread(g, row(diag, m), si.sea);
      lines.push(`    month ${m} edge (A = ½): model ${f1(em[name].lat)}° ± ${f2(em[name].sd)}°, diagnostic ${f1(ed[name].lat)}° ± ${f2(ed[name].sd)}°`);
    }
    assert.ok(exM[mx] > 0.5 * exD[mx] && exM[mx] < 2 * exD[mx] + 1, `${name} max extent ${exM[mx]} against ${exD[mx]}`);
  }
  for (const thr of [0.5, 0.15]) {
    const em = edgeSpread(g, annual(si.Am), si.sea, thr), ed = edgeSpread(g, annual(diag), si.sea, thr);
    lines.push(`  share of the year under ice, edge at ${thr}: model ±${f2(em.sd)}° (N ${f1(em.north.lat)}° ± ${f2(em.north.sd)}, S ${f1(em.south.lat)}° ± ${f2(em.south.sd)}), diagnostic ±${f2(ed.sd)}°`);
  }
  // Today's number on its own grid: the climate's share of the year under sea ice (snowAnn at sea), level 6, against the model's carried there.
  // (The coarse share is carried over the coarse sea's own share, so coasts that differ between the grids don't dilute it.)
  const fineSea = Uint8Array.from(c.landMask, l => 1 - l), fineA = si.fine(annual(si.Am)), fineS = si.fine(Float32Array.from(si.sea));
  for (let i = 0; i < fineA.length; i++) fineA[i] = fineS[i] > 0 ? fineA[i] / fineS[i] : 0;
  const ef = edgeSpread(c.grid, fineA, fineSea), df = edgeSpread(c.grid, Float32Array.from(c.snowAnn, (s, i) => (fineSea[i] ? s : 0)), fineSea);
  lines.push(`  on the climate's grid (level 6), share of the year at ½: model ±${f2(ef.sd)}°, the diagnostic's snowAnn ±${f2(df.sd)}°`);
  const fw = si.freshwater();
  lines.push(`  freshwater carried by the ice ${f2(fw.north)} Sv north, ${f2(fw.south)} Sv south; volume Mar ${f1(si.measure(2).north.volume)} / Sep ${f1(si.measure(8).south.volume)} 10³ km³ (north / south)`);
  console.log(lines.join('\n'));
  for (let i = 0; i < 12 * n; i++) assert.ok(Number.isFinite(si.Am[i]) && Number.isFinite(si.hm[i]));
});
