// Transfer between nested levels of the geodesic grid. A level's cells are the
// first cells of the next level, and every other fine cell is the midpoint of
// a coarse edge: its two parents are its only neighbours that are coarse.
//   prolong   coarse → fine: copy, and average the parents at midpoints
//   restrict  fine → coarse: the area-weighted transpose (full weighting), so
//             a flux per unit area keeps its integral

/** Parent pairs for the fine cells past the coarse count: Int32Array(2 (nf − nc)). */
export function parents(fine, nc) {
  const { n, nbrOff, nbr } = fine;
  const par = new Int32Array(2 * (n - nc));
  for (let i = nc; i < n; i++) {
    let k = 0;
    for (let t = nbrOff[i], e = nbrOff[i + 1]; t < e; t++) {
      const j = nbr[t];
      if (j < nc) { if (k < 2) par[2 * (i - nc) + k] = j; k++; }
    }
    if (k !== 2) throw new Error(`transfer: cell ${i} has ${k} coarse neighbours`);
  }
  return par;
}

/** A pair of levels: fine grid, coarse count, parents and restriction weights. */
export function makeTransfer(fine, coarse) {
  const nc = coarse.n, par = parents(fine, nc);
  const wsum = new Float64Array(nc);
  for (let i = 0; i < nc; i++) wsum[i] = fine.area[i];
  for (let i = nc; i < fine.n; i++) {
    const a = 0.5 * fine.area[i];
    wsum[par[2 * (i - nc)]] += a; wsum[par[2 * (i - nc) + 1]] += a;
  }
  return { fine, coarse, nc, par, wsum };
}

export function prolong(T, c, f) {
  const { nc, par, fine } = T;
  for (let i = 0; i < nc; i++) f[i] = c[i];
  for (let i = nc; i < fine.n; i++) f[i] = 0.5 * (c[par[2 * (i - nc)]] + c[par[2 * (i - nc) + 1]]);
  return f;
}

export function restrict(T, f, c) {
  const { nc, par, fine, wsum } = T;
  const A = fine.area;
  for (let i = 0; i < nc; i++) c[i] = A[i] * f[i];
  for (let i = nc; i < fine.n; i++) {
    const v = 0.5 * A[i] * f[i];
    c[par[2 * (i - nc)]] += v; c[par[2 * (i - nc) + 1]] += v;
  }
  for (let i = 0; i < nc; i++) c[i] /= wsum[i];
  return c;
}
