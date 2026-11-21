// The multigrid-preconditioned CG (src/grid/multigrid.js) against the sphere's eigenfunction P₂.
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
