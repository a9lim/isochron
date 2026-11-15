// Flexure (src/engine/flexure.js) against the planar plate's analytic
// solutions, with α of a few hundred km so the grid resolves them and α ≪ R
// so the plane's solutions hold on the sphere (to O((α/R)²)). Each case
// prints its errors at levels 6 and 7.
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildGrid, nearest } from '../src/grid/icosphere.js';
import {
  Flexure, FLEXURE, rigidity, flexuralLength, teForLength, teOceanic, teContinental, oceanCoefficient,
  breakAtBoundaries, elasticThickness, loadOf, correction,
} from '../src/engine/flexure.js';

const R = 6.371e6, G = FLEXURE.G, RM = FLEXURE.RHO_M;
const say = (...a) => console.log('  ', ...a);

const grids = [];
const grid = L => { for (let l = 1; l <= L; l++) grids[l] ||= buildGrid(l); return grids[L]; };
const solvers = [];
const solver = L => solvers[L] ||= new Flexure(grid(L), { have: grids.filter(Boolean) });
const spacing = g => Math.sqrt(4 * Math.PI / g.n) * R;          // m: √(mean cell area)

// Kelvin's kei by its series (Abramowitz and Stegun 9.9.12), good to x ~ 15.
function kei(x) {
  if (x === 0) return -Math.PI / 4;
  const y = x * x / 4;
  let ber = 0, bei = 0, sum = 0, tb = 1, psi = -0.5772156649015329;     // ψ(1) = −γ
  for (let k = 0; k < 80; k++) {
    const sg = k % 2 ? -1 : 1, ti = tb * y / ((2 * k + 1) ** 2), psi2 = psi + 1 / (2 * k + 1);
    ber += sg * tb; bei += sg * ti; sum += sg * psi2 * ti;
    tb = ti * y / ((2 * k + 2) ** 2);
    psi = psi2 + 1 / (2 * k + 2);
    if (k > 3 && tb < 1e-20) break;
  }
  return -Math.log(x / 2) * bei - Math.PI / 4 * ber + sum;
}

// The plate under a line load V₀ = 1 at x = 0 (m per N/m): continuous, and broken at the load.
const lineG = (x, a, D) => { const u = Math.abs(x) / a; return a ** 3 / (8 * D) * Math.exp(-u) * (Math.cos(u) + Math.sin(u)); };
const brokenG = (x, a, D) => { const u = Math.abs(x) / a; return a ** 3 / (4 * D) * Math.exp(-u) * Math.cos(u); };
// Either, convolved with the Gaussian the grid's load is (σ ≪ α).
function convolved(Gf, x, a, D, sig) {
  const m = 400, L = 6 * sig, hs = 2 * L / m;
  let s = 0;
  for (let k = 0; k <= m; k++) {
    const u = -L + k * hs, wgt = k === 0 || k === m ? 1 : k % 2 ? 4 : 2;
    s += wgt * Gf(x - u, a, D) * Math.exp(-u * u / (2 * sig * sig));
  }
  return s * hs / 3 / (Math.sqrt(2 * Math.PI) * sig);
}

// Area-weighted means of w in bands of x (latitude distance from x₀).
function profile(g, w, x, width, xmax) {
  const nb = Math.ceil(2 * xmax / width), sw = new Float64Array(nb), sa = new Float64Array(nb), sx = new Float64Array(nb);
  for (let i = 0; i < g.n; i++) {
    const b = Math.floor((x[i] + xmax) / width);
    if (b < 0 || b >= nb) continue;
    sw[b] += w[i] * g.area[i]; sx[b] += x[i] * g.area[i]; sa[b] += g.area[i];
  }
  const out = [];
  for (let b = 0; b < nb; b++) if (sa[b] > 0) out.push({ x: sx[b] / sa[b], w: sw[b] / sa[b] });
  return out;
}
// The outer rise on each side: the binned profile's minimum, refined by a parabola; the mean of both sides.
function rise(prof) {
  const side = sgn => {
    const p = prof.filter(b => sgn * b.x > 0).sort((a, b) => sgn * (a.x - b.x));
    let k = 1;
    for (let i = 1; i < p.length - 1; i++) if (p[i].w < p[k].w) k = i;
    const [a, b, c] = [p[k - 1], p[k], p[k + 1]];
    const d = (a.w - c.w) / (2 * (a.w - 2 * b.w + c.w));
    return { x: Math.abs(b.x + d * (c.x - a.x) / 2), w: b.w - 0.25 * (a.w - c.w) * d };
  };
  const l = side(-1), r = side(1);
  return { x: 0.5 * (l.x + r.x), w: 0.5 * (l.w + r.w) };
}

function lineCase(L, { alpha = 3e5, broken = false } = {}) {
  const g = grid(L), n = g.n, h = spacing(g), F = solver(L);
  const te = teForLength(alpha), D = rigidity(te), Te = new Float64Array(n).fill(te);
  let x0 = 0;
  if (broken) {
    const owner = Int16Array.from({ length: n }, (_, i) => g.pos[3 * i + 2] >= 0 ? 0 : 1);
    const weak = breakAtBoundaries(g, owner, Te);
    let s = 0, a = 0;
    for (let i = 0; i < n; i++) if (weak[i]) { s += R * Math.asin(g.pos[3 * i + 2]) * g.area[i]; a += g.area[i]; }
    x0 = s / a;
  }
  const sig = 0.6 * h, V0 = 1e12;
  const x = Float64Array.from({ length: n }, (_, i) => R * Math.asin(g.pos[3 * i + 2]) - x0);
  const q = Float64Array.from(x, v => V0 * Math.exp(-v * v / (2 * sig * sig)) / (Math.sqrt(2 * Math.PI) * sig));
  const w = Float64Array.from(F.solve(q, Te, { tol: 1e-9, warm: false }));
  // Cell by cell within 2πα: the continuous plate against its solution convolved with the load's Gaussian; the
  // broken plate (whose response isn't translation-invariant) against the line load's, beyond a cell of the hinge.
  const Gf = broken ? brokenG : lineG;
  const w0 = V0 * Gf(0, alpha, D), ref0 = broken ? w0 : V0 * convolved(Gf, 0, alpha, D, sig);
  const refAt = broken ? v => V0 * brokenG(v, alpha, D) : v => V0 * convolved(lineG, v, alpha, D, sig);
  let emax = 0, e2 = 0, a2 = 0;
  for (let i = 0; i < n; i++) {
    if (Math.abs(x[i]) > 2 * Math.PI * alpha || (broken && Math.abs(x[i]) < h)) continue;
    const e = w[i] - refAt(x[i]);
    emax = Math.max(emax, Math.abs(e)); e2 += e * e * g.area[i]; a2 += g.area[i];
  }
  const prof = profile(g, w, x, 0.5 * h, 2.5 * Math.PI * alpha);
  const peak = Math.max(...prof.map(b => b.w));
  return { g, h, alpha, D, w, q, x, w0, ref0, peak, emax: emax / w0, erms: Math.sqrt(e2 / a2) / w0, rise: rise(prof), prof, cycles: F.stats.cycles };
}

test('Tₑ: the ocean by the 450 °C isotherm, continents by age, thickness and suture', () => {
  const c = oceanCoefficient();
  assert.ok(Math.abs(c - 3.42) < 0.03, `ocean ${c.toFixed(3)} km/√Myr`);
  assert.equal(teOceanic(0), 0);
  assert.ok(Math.abs(teOceanic(100) - 10 * c) < 1e-9 && teOceanic(400) === FLEXURE.TE_OCEAN_MAX);
  const craton = teContinental(2500, 40), margin = teContinental(20, 35), orogen = teContinental(1500, 65, 10), rift = teContinental(1500, 22);
  say(`Tₑ: ocean ${c.toFixed(2)} km √(age/Myr) (25 Myr ${teOceanic(25).toFixed(1)}, 100 Myr ${teOceanic(100).toFixed(1)} km); craton ${craton.toFixed(0)}, young margin ${margin.toFixed(0)}, fresh orogen ${orogen.toFixed(0)}, stretched ${rift.toFixed(0)} km`);
  assert.ok(craton > 80 && margin < 25 && orogen < 20 && rift < craton);
  for (const te of [10, 30, 100]) say(`  Tₑ ${te} km: D ${rigidity(te).toExponential(2)} N m, α ${(flexuralLength(rigidity(te)) / 1000).toFixed(0)} km (under the sea ${(flexuralLength(rigidity(te), RM - 1028) / 1000).toFixed(0)})`);
  // Broken at boundaries: every pair of neighbours on two plates has a weak member.
  const g = grid(5), n = g.n;
  const seeds = Array.from({ length: 9 }, (_, k) => [Math.cos(2.4 * k) * Math.sin(1 + 0.3 * k), Math.sin(2.4 * k) * Math.sin(1 + 0.3 * k), Math.cos(1 + 0.3 * k)]);
  const owner = Int16Array.from({ length: n }, (_, i) => {
    let best = 0, bd = -2;
    seeds.forEach((s, k) => { const d = s[0] * g.pos[3 * i] + s[1] * g.pos[3 * i + 1] + s[2] * g.pos[3 * i + 2]; if (d > bd) { bd = d; best = k; } });
    return best;
  });
  const Te = Float64Array.from({ length: n }, (_, i) => 10 + 5 * owner[i]);
  const weak = breakAtBoundaries(g, owner, Te);
  for (let i = 0; i < n; i++) for (let t = g.nbrOff[i]; t < g.nbrOff[i + 1]; t++) {
    const j = g.nbr[t];
    if (owner[i] !== owner[j]) assert.ok(weak[i] || weak[j], `cells ${i} and ${j} meet unbroken`);
  }
});

test('a uniform plate under a line load: w₀ = V₀α³/8D and the profile e^{−x/α}(cos + sin)', () => {
  const r = {};
  for (const L of [6, 7]) {
    const c = r[L] = lineCase(L);
    say(`line load, α 300 km, level ${L} (cells ${(c.h / 1000).toFixed(0)} km, α/h ${(c.alpha / c.h).toFixed(1)}): peak ${(c.peak / c.w0).toFixed(4)} w₀ ` +
      `(the Gaussian-spread solution ${(c.ref0 / c.w0).toFixed(4)}); cells within 2πα off by ${(100 * c.erms).toFixed(2)}% rms, ${(100 * c.emax).toFixed(2)}% at most (of w₀); ` +
      `rise at ${(c.rise.x / c.alpha / Math.PI).toFixed(3)} πα, ${(c.rise.w / c.w0).toFixed(4)} w₀ (−e^{−π} = ${(-Math.exp(-Math.PI)).toFixed(4)}); ${c.cycles} cycles`);
  }
  const c = r[7];
  assert.ok(Math.abs(c.peak - c.ref0) < 0.02 * c.w0, 'peak');
  assert.ok(c.erms < 0.01 && c.emax < 0.03, 'profile');
  assert.ok(Math.abs(c.rise.x - Math.PI * c.alpha) < 0.05 * Math.PI * c.alpha, 'rise position');
  assert.ok(Math.abs(c.rise.w + Math.exp(-Math.PI) * c.w0) < 0.1 * Math.exp(-Math.PI) * c.w0, 'rise height');
  assert.ok(r[7].erms < r[6].erms, 'converging with resolution');
});

test('a point load: w₀ = P l²/8D (l = α/√2) and the profile −(P l²/2πD) kei(r/l)', () => {
  // kei itself: kei(0) = −π/4, and ∫ x kei(x) dx = −1 (the load's balance).
  let s = 0;
  for (let k = 1; k <= 3000; k++) { const x = (k - 0.5) * 0.005; s += x * kei(x) * 0.005; }
  assert.ok(Math.abs(s + 1) < 2e-3, `∫ x kei = ${s.toFixed(5)}`);
  const res = {};
  for (const L of [6, 7]) {
    const g = grid(L), n = g.n, h = spacing(g), F = solver(L), alpha = 3e5;
    const te = teForLength(alpha), D = rigidity(te), l = alpha / Math.SQRT2;
    const lt = 35 * Math.PI / 180, ln = 50 * Math.PI / 180;
    const c = nearest(g, Math.cos(lt) * Math.cos(ln), Math.cos(lt) * Math.sin(ln), Math.sin(lt));
    assert.equal(g.nbrOff[c + 1] - g.nbrOff[c], 6);
    const P = 1e17, Ac = g.area[c] * R * R, q = new Float64Array(n);
    q[c] = P / Ac;
    const w = F.solve(q, new Float64Array(n).fill(te), { tol: 1e-9, warm: false });
    const w0 = P * l * l / (8 * D), Gr = r => -P * l * l / (2 * Math.PI * D) * kei(r / l);
    // The load spread over the cell, as a disc of its area.
    const a = Math.sqrt(Ac / Math.PI);
    let disc = 0;
    for (let k = 0; k < 200; k++) { const rr = (k + 0.5) * a / 200; disc += Gr(rr) * 2 * Math.PI * rr * a / 200; }
    disc /= Math.PI * a * a;
    let emax = 0, rmin = 0, wmin = 0;
    const px = g.pos[3 * c], py = g.pos[3 * c + 1], pz = g.pos[3 * c + 2];
    for (let i = 0; i < n; i++) {
      const r = R * Math.acos(Math.min(1, px * g.pos[3 * i] + py * g.pos[3 * i + 1] + pz * g.pos[3 * i + 2]));
      if (r > 7 * l) continue;
      if (r >= 2 * h) emax = Math.max(emax, Math.abs(w[i] - Gr(r)));
      if (w[i] < wmin) { wmin = w[i]; rmin = r; }
    }
    res[L] = { centre: w[c] / disc, emax: emax / w0 };
    say(`point load, α 300 km (l ${(l / 1000).toFixed(0)} km), level ${L}: centre ${(w[c] / w0).toFixed(4)} w₀ (the cell's disc ${(disc / w0).toFixed(4)}; off ${(100 * (w[c] / disc - 1)).toFixed(2)}%), ` +
      `beyond two cells off by ${(100 * emax / w0).toFixed(2)}% of w₀ at most; deepest rise near ${(rmin / l).toFixed(2)} l (kei's: ~4.9 l), ${(wmin / w0).toFixed(4)} w₀`);
  }
  // The loaded cell itself over-deflects: the discrete Laplacian falls short of k² near the grid's scale, and a
  // point load's centre weighs those wavenumbers (O((h/l)²)); the profile beyond it is the plate's.
  assert.ok(Math.abs(res[7].centre - 1) < 0.08 && Math.abs(res[7].centre - 1) < 0.5 * Math.abs(res[6].centre - 1), 'centre');
  assert.ok(res[7].emax < 0.02 && res[6].emax < 0.02, 'profile');
});

test('a broken plate: twice the deflection at the break, the outer rise at 3πα/4', () => {
  const r = {};
  for (const L of [6, 7]) {
    const cont = lineCase(L), brk = r[L] = lineCase(L, { broken: true });
    brk.ratio = brk.peak / cont.peak;
    say(`broken, α 300 km, level ${L}: peak ${(brk.peak / cont.peak).toFixed(3)}× the continuous plate's; ` +
      `rise at ${(brk.rise.x / brk.alpha / Math.PI).toFixed(3)} πα (0.75), ${(brk.rise.w / brk.w0).toFixed(4)} w₀_broken (−e^{−3π/4}/√2 = ${(-Math.exp(-0.75 * Math.PI) / Math.SQRT2).toFixed(4)}); ` +
      `cells beyond one of the hinge off by ${(100 * brk.erms).toFixed(2)}% rms, ${(100 * brk.emax).toFixed(2)}% at most (of w₀_broken)`);
  }
  const b = r[7];
  assert.ok(Math.abs(b.ratio - 2) < 0.1, `ratio ${b.ratio}`);
  assert.ok(Math.abs(b.rise.x - 0.75 * Math.PI * b.alpha) < 0.06 * Math.PI * b.alpha, 'rise position');
  assert.ok(b.erms < 0.05, 'profile');
  assert.ok(Math.abs(r[7].ratio - 2) < Math.abs(r[6].ratio - 2), 'converging with resolution');
});

test('global balance: ∫Δρ g w dA = ∫q dA, and multigrid agrees with conjugate gradients, on broken, varying plates', () => {
  const L = 6, g = grid(L), n = g.n, F = solver(L);
  // Plates (Voronoi regions of seeds), Tₑ varying within each, broken at the boundaries; a rough load.
  const seeds = Array.from({ length: 12 }, (_, k) => { const z = 1 - 2 * (k + 0.5) / 12, r = Math.sqrt(1 - z * z); return [r * Math.cos(2.4 * k), r * Math.sin(2.4 * k), z]; });
  const owner = new Int16Array(n), Te = new Float64Array(n), q = new Float64Array(n), drho = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const x = g.pos[3 * i], y = g.pos[3 * i + 1], z = g.pos[3 * i + 2];
    let best = 0, bd = -2;
    seeds.forEach((s, k) => { const d = s[0] * x + s[1] * y + s[2] * z; if (d > bd) { bd = d; best = k; } });
    owner[i] = best;
    Te[i] = 15 + 60 * (0.5 + 0.5 * Math.sin(3 * x + 2 * y) * Math.cos(4 * z));
    q[i] = 2.5e7 * (Math.sin(7 * x) * Math.cos(5 * y + z) + (Math.sin(40 * x * y) > 0.95 ? 3 : 0));
    drho[i] = z > 0.3 ? RM : RM - 1028;
  }
  breakAtBoundaries(g, owner, Te);
  let t0 = performance.now();
  const w = Float64Array.from(F.solve(q, Te, { tol: 1e-10, warm: false, drho }));
  const tMG = performance.now() - t0, cyc = F.stats.cycles;
  let lhs = 0, rhs = 0, qa = 0;
  for (let i = 0; i < n; i++) { const A = g.area[i] * R * R; lhs += drho[i] * G * w[i] * A; rhs += q[i] * A; qa += Math.abs(q[i]) * A; }
  t0 = performance.now();
  const wc = F.solveCG(q, null, { tol: 1e-11 });
  const tCG = performance.now() - t0;
  let d = 0, m = 0;
  for (let i = 0; i < n; i++) { d = Math.max(d, Math.abs(w[i] - wc[i])); m = Math.max(m, Math.abs(wc[i])); }
  say(`balance (level 6, 12 broken plates, Tₑ 15–75 km, Δρ two-valued): ∫Δρgw − ∫q = ${((lhs - rhs) / qa).toExponential(2)} of ∫|q|; ` +
    `multigrid ${cyc} cycles (${tMG.toFixed(0)} ms) against CG ${F.cgStats.iterations} iterations (${tCG.toFixed(0)} ms): ${(d / m).toExponential(2)} of max |w|`);
  assert.ok(Math.abs(lhs - rhs) < 1e-7 * qa);
  assert.ok(d < 1e-6 * m);
});

test('convergence and cost at level 7: cold, warm after the load moves, and with new rigidity', () => {
  const L = 7, g = grid(L), n = g.n, F = solver(L);
  const Te = Float64Array.from({ length: n }, (_, i) => 20 + 60 * (0.5 + 0.5 * Math.sin(5 * g.pos[3 * i] + 3 * g.pos[3 * i + 2])));
  const owner = Int16Array.from({ length: n }, (_, i) => (g.pos[3 * i] > 0.2 ? 1 : 0) + (g.pos[3 * i + 1] > -0.3 ? 2 : 0));
  breakAtBoundaries(g, owner, Te);
  const q = Float64Array.from({ length: n }, (_, i) => 3e7 * Math.sin(9 * g.pos[3 * i] + 4 * g.pos[3 * i + 1]) * Math.cos(6 * g.pos[3 * i + 2]));
  F.setRigidity(Te);
  const time = f => { const t0 = performance.now(); f(); return performance.now() - t0; };
  const tCold = time(() => F.solve(q, null, { tol: 1e-6, warm: false }));
  const cold = F.stats.cycles, hist = F.stats.history;
  const rate = (hist[hist.length - 1] / hist[1]) ** (1 / Math.max(1, hist.length - 2));
  // The load moves by ~1%: a plate step's change.
  for (let i = 0; i < n; i++) q[i] *= 1 + 0.01 * Math.sin(20 * g.pos[3 * i + 1]);
  const tWarm = time(() => F.solve(q, null, { tol: 1e-6 }));
  const warm = F.stats.cycles;
  for (let i = 0; i < n; i++) Te[i] *= 1 + 0.02 * Math.cos(11 * g.pos[3 * i]);
  const tSet = time(() => F.setRigidity(Te));
  const tWarm2 = time(() => F.solve(q, null, { tol: 1e-6 }));
  const warm2 = F.stats.cycles;
  const tCycle = time(() => F.solve(q, null, { cycles: 5 })) / 5;
  say(`level 7 (${n} cells), CPU: ${tCycle.toFixed(1)} ms a V-cycle; ${rate.toFixed(3)} a cycle; to 1e-6 cold ${cold} cycles (${tCold.toFixed(0)} ms), ` +
    `warm after a 1% change ${warm} (${tWarm.toFixed(0)} ms), after new rigidity (${tSet.toFixed(0)} ms to set) ${warm2} (${tWarm2.toFixed(0)} ms)`);
  assert.ok(cold <= 14 && rate < 0.5, `rate ${rate}`);
  assert.ok(warm <= 6 && warm2 <= 6);
});

test("an ice sheet on a craton: Airy beneath it, a forebulge beyond (ELRA's target)", () => {
  const L = 7, g = grid(L), n = g.n, F = solver(L), H0 = 3000, Lc = 1.2e6, rhoI = 917;
  const r = Float64Array.from({ length: n }, (_, i) => R * Math.acos(Math.min(1, g.pos[3 * i + 2])));
  const H = Float64Array.from(r, v => v < Lc ? H0 * (1 - (v / Lc) ** (4 / 3)) ** (3 / 8) : 0);      // Vialov's profile
  const q = loadOf(g, { ice: H }, undefined, { zeroMean: false });
  for (const te of [40, 90]) {
    const w = F.solve(q, new Float64Array(n).fill(te), { tol: 1e-8, warm: false }), alpha = flexuralLength(rigidity(te));
    let c = 0, bulge = 0, rb = 0, lhs = 0, rhs = 0;
    for (let i = 0; i < n; i++) {
      if (r[i] < 50e3) c = Math.max(c, w[i]);
      if (r[i] > Lc && w[i] < bulge) { bulge = w[i]; rb = r[i]; }
      lhs += RM * G * w[i] * g.area[i]; rhs += q[i] * g.area[i];
    }
    const airy0 = rhoI * H0 / RM;
    say(`ice sheet, ${H0} m over ${Lc / 1e3} km, Tₑ ${te} km (α ${(alpha / 1e3).toFixed(0)} km), level 7: centre ${c.toFixed(0)} m down (Airy ${airy0.toFixed(0)}), ` +
      `forebulge ${(-bulge).toFixed(1)} m up at ${((rb - Lc) / alpha).toFixed(2)} α beyond the margin; balance ${((lhs - rhs) / rhs).toExponential(1)}`);
    assert.ok(Math.abs(c - airy0) < 0.03 * airy0, 'centre near Airy');
    assert.ok(-bulge > 0.005 * airy0 && rb > Lc, 'forebulge');
    assert.ok(Math.abs(lhs - rhs) < 1e-6 * rhs);
  }
});

// A diagnostic as much as a test: crust.js's whole column flexed. Its continents were made compensated, and a
// stiff craton bearing the continent–ocean step distorts every margin by kilometres, so phase 7 flexes the loads' changes.
test('on the opening planet: Tₑ from the plates, and the whole crust flexed (the margins it distorts)', async () => {
  const { Planet } = await import('../src/engine/planet.js');
  const P = new Planet('earthlike', { level: 6, spinup: 10 }), tec = P.tec, g = tec.grid, n = g.n;
  const Te = elasticThickness(tec);
  const age = Float64Array.from({ length: n }, (_, i) => tec.t - tec.tf[i]);
  const q = loadOf(g, { h: tec.h, felsic: tec.phi, age });
  const F = new Flexure(g, { have: grids.filter(Boolean) });
  const t0 = performance.now();
  const w = F.solve(q, Te, { tol: 1e-6, warm: false });
  const ms = performance.now() - t0;
  const dz = correction(q, w);
  let mean = 0, rms = 0, lo = 0, hi = 0, nb = 0;
  for (let i = 0; i < n; i++) { mean += dz[i] * g.area[i]; rms += dz[i] * dz[i] * g.area[i]; lo = Math.min(lo, dz[i]); hi = Math.max(hi, dz[i]); }
  mean /= 4 * Math.PI; rms = Math.sqrt(rms / (4 * Math.PI));
  const sorted = (f) => { const a = []; for (let i = 0; i < n; i++) if (f(i)) a.push(Te[i]); a.sort((x, y) => x - y); return a; };
  const oc = sorted(i => tec.phi[i] < 0.35 && Te[i] > FLEXURE.TE_BREAK), co = sorted(i => tec.phi[i] > 0.65 && Te[i] > FLEXURE.TE_BREAK);
  for (let i = 0; i < n; i++) if (Te[i] <= FLEXURE.TE_BREAK) nb++;
  const med = a => a[a.length >> 1];
  say(`opening planet (level 6): Tₑ ocean median ${med(oc).toFixed(0)} km (α ${(flexuralLength(rigidity(med(oc))) / 1000).toFixed(0)} km), continents ${med(co).toFixed(0)} km ` +
    `(α ${(flexuralLength(rigidity(med(co))) / 1000).toFixed(0)}); ${(100 * nb / n).toFixed(1)}% of cells broken; ${F.stats.cycles} cycles cold (${ms.toFixed(0)} ms); ` +
    `flexure moves the Airy surface by ${(1000 * rms).toFixed(0)} m rms, ${(1000 * lo).toFixed(0)} to +${(1000 * hi).toFixed(0)} m, mean ${(1000 * mean).toExponential(1)} m`);
  assert.ok(F.stats.residual < 1e-6);
  assert.ok(Math.abs(mean) < 1e-4 * rms);
});
