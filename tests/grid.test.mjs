// The geodesic grid: counts, rings, areas, symmetry, point location, operators.
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildGrid, cellCount, nearest, laplacian, gradient } from '../src/grid/icosphere.js';

for (const level of [0, 1, 3, 5]) {
  test(`level ${level}: counts, rings, Euler characteristic`, () => {
    const g = buildGrid(level);
    assert.equal(g.n, cellCount(level));
    assert.equal(g.nf, 20 * 4 ** level);
    let five = 0, edges = 0;
    for (let i = 0; i < g.n; i++) {
      const d = g.nbrOff[i + 1] - g.nbrOff[i];
      assert.ok(d === 5 || d === 6, `cell ${i} has ${d} neighbours`);
      if (d === 5) five++;
      edges += d;
    }
    assert.equal(five, 12);
    // V − E + F = 2 for the triangulation.
    assert.equal(g.n - edges / 2 + g.nf, 2);
  });

  test(`level ${level}: neighbour symmetry and CCW rings`, () => {
    const g = buildGrid(level);
    for (let i = 0; i < g.n; i++) {
      const o = g.nbrOff[i], d = g.nbrOff[i + 1] - o;
      const px = g.pos[3 * i], py = g.pos[3 * i + 1], pz = g.pos[3 * i + 2];
      for (let k = 0; k < d; k++) {
        const j = g.nbr[o + k];
        let back = false;
        for (let t = g.nbrOff[j]; t < g.nbrOff[j + 1]; t++) if (g.nbr[t] === i) back = true;
        assert.ok(back, `${j} does not list ${i}`);
        // CCW: (t_k × t_{k+1}) points outward.
        const a = 3 * (o + k), b = 3 * (o + (k + 1) % d);
        const cx = g.tan[a + 1] * g.tan[b + 2] - g.tan[a + 2] * g.tan[b + 1];
        const cy = g.tan[a + 2] * g.tan[b] - g.tan[a] * g.tan[b + 2];
        const cz = g.tan[a] * g.tan[b + 1] - g.tan[a + 1] * g.tan[b];
        assert.ok(cx * px + cy * py + cz * pz > 0, `ring of ${i} is not counter-clockwise`);
      }
    }
  });

  test(`level ${level}: Voronoi areas sum to 4π`, () => {
    const g = buildGrid(level);
    let s = 0, lo = Infinity, hi = 0;
    for (let i = 0; i < g.n; i++) { s += g.area[i]; lo = Math.min(lo, g.area[i]); hi = Math.max(hi, g.area[i]); }
    assert.ok(Math.abs(s - 4 * Math.PI) < 1e-9, `sum ${s}`);
    if (level >= 3) assert.ok(hi / lo < 1.6, `area ratio ${hi / lo}`);
  });
}

test('nests: a level\'s cells are the first cells of the next', () => {
  const a = buildGrid(3), b = buildGrid(4);
  for (let i = 0; i < 3 * a.n; i++) assert.ok(Math.abs(a.pos[i] - b.pos[i]) < 1e-12);
});

test('nearest agrees with brute force', () => {
  const g = buildGrid(5);
  let seed = 7;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 4294967296);
  for (let s = 0; s < 2000; s++) {
    const z = 2 * rnd() - 1, th = 2 * Math.PI * rnd(), r = Math.sqrt(1 - z * z);
    const x = r * Math.cos(th), y = r * Math.sin(th);
    let best = -1, bd = -2;
    for (let i = 0; i < g.n; i++) {
      const d = g.pos[3 * i] * x + g.pos[3 * i + 1] * y + g.pos[3 * i + 2] * z;
      if (d > bd) { bd = d; best = i; }
    }
    const got = nearest(g, x, y, z);
    const gd = g.pos[3 * got] * x + g.pos[3 * got + 1] * y + g.pos[3 * got + 2] * z;
    assert.ok(got === best || Math.abs(gd - bd) < 1e-12, `sample ${s}: ${got} vs ${best}`);
  }
});

test('laplacian of Y_1 and Y_2 harmonics: eigenvalues −2 and −6', () => {
  const g = buildGrid(5);
  const f1 = new Float64Array(g.n), f2 = new Float64Array(g.n), out = new Float64Array(g.n);
  for (let i = 0; i < g.n; i++) {
    const z = g.pos[3 * i + 2];
    f1[i] = z;
    f2[i] = 1.5 * z * z - 0.5;
  }
  for (const [f, l] of [[f1, -2], [f2, -6]]) {
    laplacian(g, f, out);
    let num = 0, den = 0;
    for (let i = 0; i < g.n; i++) { num += out[i] * f[i] * g.area[i]; den += f[i] * f[i] * g.area[i]; }
    assert.ok(Math.abs(num / den - l) / -l < 0.01, `Rayleigh quotient ${num / den} vs ${l}`);
  }
});

test('gradient of z is the tangent part of ẑ', () => {
  const g = buildGrid(5);
  const f = new Float64Array(g.n), out = new Float64Array(3 * g.n);
  for (let i = 0; i < g.n; i++) f[i] = g.pos[3 * i + 2];
  gradient(g, f, out);
  let err = 0;
  for (let i = 0; i < g.n; i++) {
    const z = g.pos[3 * i + 2];
    const ex = -z * g.pos[3 * i], ey = -z * g.pos[3 * i + 1], ez = 1 - z * z;
    err = Math.max(err, Math.hypot(out[3 * i] - ex, out[3 * i + 1] - ey, out[3 * i + 2] - ez));
  }
  assert.ok(err < 0.01, `max error ${err}`);
});

test('level 7 builds in reasonable time', () => {
  const t0 = performance.now();
  const g = buildGrid(7);
  const ms = performance.now() - t0;
  assert.equal(g.n, 163842);
  console.log(`  level 7: ${ms.toFixed(0)} ms`);
});
