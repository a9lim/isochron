// The nested geodesic grids packed for the GPU, for multigrid on the sphere.
// Levels lo..top lie end to end in every buffer (level ℓ's cells at offset
// off[ℓ]); a level's cells are the next level's first cells, and each other
// fine cell is the midpoint of a coarse edge, so transfer needs no tables:
// prolongation averages a midpoint's two coarse neighbours, and restriction
// gathers a coarse cell's six midpoints (src/grid/transfer.js, transposed).
//
// Per cell, 12 u32 (topo): six neighbours (level-local; a pentagon's sixth is
// itself) and six Voronoi corners (a pentagon's sixth repeats its fifth, so
// the padded edge carries no flux). Per cell, 8 f32 (geo): the six edge
// weights ℓ/d (0 for the pad), the area (sr) and z.
import { buildGrid } from '../grid/icosphere.js';

export const A_M = 6.371e6;

export function hierarchy(top, lo = 2, have = []) {
  const levels = [];
  let off = 0;
  for (let L = lo; L <= top.level; L++) {
    const g = L === top.level ? top : have.find(h => h.level === L) || buildGrid(L);
    levels.push({ L, g, n: g.n, off });
    off += g.n;
  }
  const N = off, topo = new Uint32Array(12 * N), geo = new Float32Array(8 * N);
  for (const { g, off } of levels) {
    for (let i = 0; i < g.n; i++) {
      const o = g.nbrOff[i], d = g.nbrOff[i + 1] - o, c = off + i;
      for (let k = 0; k < 6; k++) {
        topo[12 * c + k] = k < d ? g.nbr[o + k] : i;
        topo[12 * c + 6 + k] = g.corner[o + Math.min(k, d - 1)];
        geo[8 * c + k] = k < d ? g.ell[o + k] / g.dist[o + k] : 0;
      }
      geo[8 * c + 6] = g.area[i];
      geo[8 * c + 7] = g.pos[3 * i + 2];
    }
  }
  return { levels, N, topo, geo, lo, top: top.level };
}

/**
 * The inverse of the integrated operator Σ w (x_i − x_j) + A_i a² k² x_i on the
 * coarsest level, for each k² of a pair, as two row-major n×n blocks (f32),
 * from the same f32 weights the GPU uses. Gauss–Jordan in f64.
 */
export function coarseInverse(H, k2) {
  const { g, off } = H.levels[0], n = g.n, out = new Float32Array(2 * n * n);
  for (let c = 0; c < 2; c++) {
    const M = new Float64Array(n * n), I = new Float64Array(n * n);
    for (let i = 0; i < n; i++) {
      const o = 8 * (off + i);
      let s = 0;
      for (let k = 0; k < 6; k++) {
        const w = H.geo[o + k], j = H.topo[12 * (off + i) + k];
        if (w === 0) continue;
        s += w; M[i * n + j] -= w;
      }
      M[i * n + i] += s + H.geo[o + 6] * A_M * A_M * k2[c];
      I[i * n + i] = 1;
    }
    for (let p = 0; p < n; p++) {
      let piv = p;
      for (let r = p + 1; r < n; r++) if (Math.abs(M[r * n + p]) > Math.abs(M[piv * n + p])) piv = r;
      if (piv !== p) for (let k = 0; k < n; k++) { [M[p * n + k], M[piv * n + k]] = [M[piv * n + k], M[p * n + k]]; [I[p * n + k], I[piv * n + k]] = [I[piv * n + k], I[p * n + k]]; }
      const d = 1 / M[p * n + p];
      for (let k = 0; k < n; k++) { M[p * n + k] *= d; I[p * n + k] *= d; }
      for (let r = 0; r < n; r++) {
        if (r === p) continue;
        const f = M[r * n + p];
        if (f === 0) continue;
        for (let k = 0; k < n; k++) { M[r * n + k] -= f * M[p * n + k]; I[r * n + k] -= f * I[p * n + k]; }
      }
    }
    out.set(I, c * n * n);
  }
  return out;
}
