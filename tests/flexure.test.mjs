// Flexure (src/engine/flexure.js) against the plane's analytic plates (α ≪ R), the global balance, and multigrid
// against CG.
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildGrid } from '../src/grid/icosphere.js';
import { Flexure, FLEXURE, rigidity, teForLength, breakAtBoundaries } from '../src/engine/flexure.js';

const R = 6.371e6, G = FLEXURE.G, RM = FLEXURE.RHO_M;

const grids = [];
const grid = L => { for (let l = 1; l <= L; l++) grids[l] ||= buildGrid(l); return grids[L]; };
const solvers = [];
const solver = L => solvers[L] ||= new Flexure(grid(L), { have: grids.filter(Boolean) });
const spacing = g => Math.sqrt(4 * Math.PI / g.n) * R;          // m: √(mean cell area)

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

test('a uniform plate under a line load: w₀ = V₀α³/8D and the profile e^{−x/α}(cos + sin)', () => {
  const r = {};
  for (const L of [7]) {
    const c = r[L] = lineCase(L);
  }
  const c = r[7];
  assert.ok(Math.abs(c.peak - c.ref0) < 0.02 * c.w0, 'peak');
  assert.ok(c.erms < 0.01 && c.emax < 0.03, 'profile');
  assert.ok(Math.abs(c.rise.x - Math.PI * c.alpha) < 0.05 * Math.PI * c.alpha, 'rise position');
  assert.ok(Math.abs(c.rise.w + Math.exp(-Math.PI) * c.w0) < 0.1 * Math.exp(-Math.PI) * c.w0, 'rise height');
});

test('a broken plate: twice the deflection at the break, the outer rise at 3πα/4', () => {
  const r = {};
  for (const L of [7]) {
    const cont = lineCase(L), brk = r[L] = lineCase(L, { broken: true });
    brk.ratio = brk.peak / cont.peak;
  }
  const b = r[7];
  assert.ok(Math.abs(b.ratio - 2) < 0.1, `ratio ${b.ratio}`);
  assert.ok(Math.abs(b.rise.x - 0.75 * Math.PI * b.alpha) < 0.06 * Math.PI * b.alpha, 'rise position');
  assert.ok(b.erms < 0.05, 'profile');
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
  assert.ok(Math.abs(lhs - rhs) < 1e-7 * qa);
  assert.ok(d < 1e-6 * m);
});
