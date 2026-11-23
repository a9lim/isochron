// The geodesic grid: counts and the Euler characteristic, symmetric counter-clockwise rings, areas, nesting, the Laplacian;
// the drawn globe's patches (src/render/patches.js) cull no triangle that shows.
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildGrid, cellCount, laplacian } from '../src/grid/icosphere.js';
import { patchesOf, visibleRuns } from '../src/render/patches.js';

for (const level of [1, 4]) {
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

test(`the globe's patches: every triangle with a corner facing the viewer and on screen is drawn, the far side is not`, () => {
  const mesh = buildGrid(5), pt = patchesOf(mesh), nt = pt.tris.length / 3, drawn = new Uint8Array(nt);
  // Each triangle once, wound as the mesh's (counter-clockwise from outside: the globe culls back faces).
  const seen = new Set();
  for (let t = 0; t < nt; t++) { const a = pt.tris[3 * t], b = pt.tris[3 * t + 1], c = pt.tris[3 * t + 2]; seen.add([a, b, c].sort((x, y) => x - y).join()); }
  assert.equal(seen.size, nt);
  assert.equal(nt, mesh.tris.length / 3);
  let s = 7;
  const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  for (let k = 0; k < 40; k++) {
    let [w, x, y, z] = [rnd() - 0.5, rnd() - 0.5, rnd() - 0.5, rnd() - 0.5];
    const r = Math.hypot(w, x, y, z); w /= r; x /= r; y /= r; z /= r;
    const m = [1 - 2 * (y * y + z * z), 2 * (x * y - w * z), 2 * (x * z + w * y), 2 * (x * y + w * z), 1 - 2 * (x * x + z * z), 2 * (y * z - w * x), 2 * (x * z - w * y), 2 * (y * z + w * x), 1 - 2 * (x * x + y * y)];
    const zoom = [1, 1.5, 4][k % 3], hx = 1.4 / zoom, hy = 1 / zoom, runs = visibleRuns(pt, m, hx, hy);
    drawn.fill(0);
    let far = 0;
    for (let j = 0; j < runs.k; j++) for (let i = runs.first[j]; i < runs.first[j] + runs.count[j]; i += 3) drawn[i / 3] = 1;
    for (let t = 0; t < nt; t++) {
      let front = false, back = 0;
      for (let c = 0; c < 3; c++) {
        const i = 3 * pt.tris[3 * t + c], px = mesh.pos[i], py = mesh.pos[i + 1], pz = mesh.pos[i + 2];
        const vx = m[0] * px + m[1] * py + m[2] * pz, vy = m[3] * px + m[4] * py + m[5] * pz, vz = m[6] * px + m[7] * py + m[8] * pz;
        if (vz > 0 && Math.abs(vx) <= hx && Math.abs(vy) <= hy) front = true;
        if (vz < -0.3) back++;
      }
      assert.ok(!front || drawn[t], `view ${k}: triangle ${t} shows but isn't drawn`);
      if (back === 3 && drawn[t]) far++;
    }
    assert.ok(far < 0.05 * nt, `view ${k}: ${far} triangles drawn well behind the globe`);
  }
});
