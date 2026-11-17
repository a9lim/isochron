// The multigrid-preconditioned CG (src/grid/multigrid.js): against the sphere's Laplacian's
// eigenfunction P₂, and on a masked domain against plain CG.
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildGrid } from '../src/grid/icosphere.js';
import { LaplaceMG, mgcg } from '../src/grid/multigrid.js';

const solve = (mg, b, x, opts) => { const it = mgcg(mg, b, x, opts); let r; do { r = it.next(); } while (!r.done); return r.value; };

test('the multigrid CG solves ∇²ψ = −6 P₂ to P₂ in a few iterations', () => {
  const g = buildGrid(5), n = g.n;
  const mg = new LaplaceMG(g);
  mg.setOperator(Float64Array.from(g.ell, (l, t) => l / g.dist[t]));
  // Σ w (x_I − x_J) ≈ −A ∇²x, so b = 6 A P₂ for x = P₂ (its mean is 0 over the sphere).
  const Y = Float64Array.from({ length: n }, (_, i) => { const z = g.pos[3 * i + 2]; return 1.5 * z * z - 0.5; });
  const b = Float64Array.from(Y, (y, i) => 6 * g.area[i] * y);
  let m = 0; for (let i = 0; i < n; i++) m += b[i]; for (let i = 0; i < n; i++) b[i] -= m / n;
  const x = new Float64Array(n), it = solve(mg, b, x, { tol: 1e-10, maxIt: 50 });
  assert.ok(it <= 12, `${it} iterations`);
  let xm = 0; for (let i = 0; i < n; i++) xm += x[i] * g.area[i]; xm /= 4 * Math.PI;
  let e = 0, s = 0;
  for (let i = 0; i < n; i++) { e += g.area[i] * (x[i] - xm - Y[i]) ** 2; s += g.area[i] * Y[i] ** 2; }
  assert.ok(Math.sqrt(e / s) < 0.01, `rel error ${Math.sqrt(e / s)}`);
});

test('on a masked domain (a sea, depth-weighted) it agrees with plain CG', () => {
  const g = buildGrid(4), n = g.n, m = g.nbrOff[n];
  const sea = Uint8Array.from({ length: n }, (_, i) => (g.pos[3 * i + 2] + 0.3 * Math.sin(4 * g.pos[3 * i]) < 0.35 ? 1 : 0));
  const w = new Float64Array(m), d = new Float64Array(n);
  for (let i = 0; i < n; i++) if (sea[i]) for (let t = g.nbrOff[i]; t < g.nbrOff[i + 1]; t++) if (sea[g.nbr[t]]) { w[t] = g.ell[t] / g.dist[t] * (1 + ((i * 7 + g.nbr[t] * 7) % 5)); d[i] += w[t]; }
  const b = new Float64Array(n);
  let sm = 0, cnt = 0;
  for (let i = 0; i < n; i++) if (sea[i]) { b[i] = Math.sin(3 * i) * g.area[i]; sm += b[i]; cnt++; }
  for (let i = 0; i < n; i++) if (sea[i]) b[i] -= sm / cnt;
  const mg = new LaplaceMG(g);
  mg.setOperator(w, d);
  const x = new Float64Array(n), it = solve(mg, b, x, { tol: 1e-10, maxIt: 100 });
  assert.ok(it <= 20, `${it} iterations`);
  // Plain CG on the same operator.
  const A = (u, o) => { for (let i = 0; i < n; i++) { let s = d[i] * u[i]; for (let t = g.nbrOff[i]; t < g.nbrOff[i + 1]; t++) s -= w[t] * u[g.nbr[t]]; o[i] = s; } };
  const y = new Float64Array(n), r = Float64Array.from(b), p = Float64Array.from(b), q = new Float64Array(n);
  let rr = r.reduce((s, v) => s + v * v, 0);
  for (let k = 0; k < 5000 && rr > 1e-26; k++) {
    A(p, q); let pq = 0; for (let i = 0; i < n; i++) pq += p[i] * q[i];
    const a = rr / pq; let r2 = 0;
    for (let i = 0; i < n; i++) { y[i] += a * p[i]; r[i] -= a * q[i]; r2 += r[i] * r[i]; }
    for (let i = 0; i < n; i++) p[i] = r[i] + r2 / rr * p[i];
    rr = r2;
  }
  // Each component's constant is free: compare differences across the sea's edges.
  let e = 0, s = 0;
  for (let i = 0; i < n; i++) if (sea[i]) for (let t = g.nbrOff[i]; t < g.nbrOff[i + 1]; t++) { const j = g.nbr[t]; if (sea[j]) { e += ((x[i] - x[j]) - (y[i] - y[j])) ** 2; s += (y[i] - y[j]) ** 2; } }
  assert.ok(Math.sqrt(e / s) < 1e-6, `rel difference ${Math.sqrt(e / s)}`);
  for (let i = 0; i < n; i++) if (!sea[i]) assert.equal(x[i], 0);
});
