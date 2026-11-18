// A planet spun up on a coarser grid, carried onto the next finer one. The
// spin-up is the planet's first ~80 Myr: long enough for the plates to settle
// (they start from rest and speed up for tens of Myr), and four times cheaper
// a level down. The world and each plate's frame share the icosphere's
// geometry, so the state prolongs: a level's cells are the next's first cells,
// and every other fine cell is the midpoint of a coarse edge.
//   plate frames   crust copies onto the coarse cells; a midpoint is in a plate
//                  when both its parents are, with their mean if they're of one
//                  kind, else one parent's crust whole (taking it when
//                  either was would push every plate half a coarse cell past
//                  its edge, and that hidden margin surfaces as the plates move:
//                  continents spread and the sea rose 70 m in 2.5 Myr)
//   world cells    each finds its plate's frame cell as the step does, by
//                  turning into the frame and taking the nearest cell; a
//                  midpoint between two plates goes to the more buoyant, with
//                  the crust of its own parent
//   memory         slabs, arcs and collision fronts average; whose they are
//                  comes from the first parent
//   counts         of cells scale by the cells' ratio
import { Tectonics, FRAME_EXTRA, copyCell } from './plates.js';
import { makeTransfer } from '../grid/transfer.js';
import { nearest } from '../grid/icosphere.js';

const EXTRA = Object.keys(FRAME_EXTRA);
const FRAME = ['mask', 'h', 'phi', 'tf', 'sut', ...EXTRA];

export function refineTectonics(c, fine) {
  const T = makeTransfer(fine, c.grid), nc = T.nc, par = T.par, n = fine.n, ratio = n / nc;
  const f = new Tectonics(fine);
  const pa = i => par[2 * (i - nc)], pb = i => par[2 * (i - nc) + 1];
  // Scalars and objects as they are; per-cell arrays prolonged.
  for (const [k, v] of Object.entries(c)) {
    if (k === 'grid' || k === 'res' || k === 'plates' || k === 'maskScratch') continue;
    if (ArrayBuffer.isView(v) && (v.length === nc || v.length === 3 * nc)) {
      const w = v.length / nc, out = f[k] && f[k].length === w * n ? f[k] : new v.constructor(w * n);
      const cat = !(v instanceof Float32Array || v instanceof Float64Array);
      out.set(v);
      if (cat) for (let i = nc; i < n; i++) { const a = w * par[2 * (i - nc)]; for (let d = 0; d < w; d++) out[w * i + d] = v[a + d]; }
      else for (let i = nc; i < n; i++) { const a = w * par[2 * (i - nc)], b = w * par[2 * (i - nc) + 1]; for (let d = 0; d < w; d++) out[w * i + d] = 0.5 * (v[a + d] + v[b + d]); }
      f[k] = out;
    } else if (!ArrayBuffer.isView(v)) f[k] = v;
  }
  for (const k of ['made', 'consumed', 'opened', 'closed']) f.counters[k] *= ratio;
  if (c.spinRate) f.spinRate = { made: c.spinRate.made * ratio, consumed: c.spinRate.consumed * ratio };
  f.pairs = new Map([...c.pairs].map(([k, v]) => [k, v * ratio]));
  // Plate frames.
  f.plates = c.plates.map(p => {
    const q = { ...p, q: Float64Array.from(p.q), R: Float64Array.from(p.R), w: Float64Array.from(p.w), torqueExt: Float64Array.from(p.torqueExt) };
    for (const k of FRAME) { q[k] = new p[k].constructor(n); q[k].set(p[k]); }
    q.sut.fill(-1e9, nc);
    for (const k of EXTRA) q[k].fill(FRAME_EXTRA[k], nc);
    const pm = p.mask, pphi = p.phi, psut = p.sut, qm = q.mask, qsut = q.sut;
    const mean = ['h', 'phi', 'tf', ...EXTRA].map(k => [q[k], p[k]]), whole = mean.concat([[qsut, psut]]);
    for (let i = nc; i < n; i++) {
      const a = par[2 * (i - nc)], b = par[2 * (i - nc) + 1];
      if (!pm[a] || !pm[b]) continue;
      qm[i] = 1;
      // Crust of one kind averages; of two (a coast) a midpoint is one parent's whole: the mean
      // of a continent's formation time and the sea floor's would make very old ocean.
      if ((pphi[a] >= 0.5) === (pphi[b] >= 0.5)) { for (const [qa, pa] of mean) qa[i] = 0.5 * (pa[a] + pa[b]); qsut[i] = Math.max(psut[a], psut[b]); }
      else { const s = (a + b) & 1 ? a : b; for (const [qa, pa] of whole) qa[i] = pa[s]; }
    }
    return q;
  });
  // Each world cell's plate and frame cell, the walk starting from the coarse cell's own frame
  // cell (the grids nest, so it is the same fine cell, a cell or so away).
  const pos = fine.pos;
  const frameCell = (k, i, guess) => {
    const R = f.plates[k].R, x = pos[3 * i], y = pos[3 * i + 1], z = pos[3 * i + 2];
    return nearest(fine, R[0] * x + R[3] * y + R[6] * z, R[1] * x + R[4] * y + R[7] * z, R[2] * x + R[5] * y + R[8] * z, guess);
  };
  for (let i = 0; i < n; i++) {
    // Candidates, the more buoyant first: the coarse cell's plate, or the two parents'.
    let src = i < nc ? [i] : [pa(i), pb(i)];
    if (src.length === 2 && c.buoyancyAt(src[1]) > c.buoyancyAt(src[0])) src = [src[1], src[0]];
    let k = c.owner[src[0]], j = frameCell(k, i, c.ref[src[0]]), from = src[0];
    for (const s of src) {
      const kk = c.owner[s], jj = frameCell(kk, i, c.ref[s]);
      if (f.plates[kk].mask[jj]) { k = kk; j = jj; from = s; break; }
    }
    const p = f.plates[k];
    if (!p.mask[j]) {
      // Between two plates: the frame cell joins the plate, with its own parent's crust.
      copyCell(c.plates[k], c.ref[from], p, j);
    }
    f.owner[i] = k; f.ref[i] = j;
    f.h[i] = p.h[j]; f.phi[i] = p.phi[j]; f.tf[i] = p.tf[j]; f.sut[i] = p.sut[j];
  }
  f.prevOwner.set(f.owner); f.prevRef.set(f.ref);
  f.trenches();
  f.updateElevation();
  f.balance(1e-6);
  return f;
}
