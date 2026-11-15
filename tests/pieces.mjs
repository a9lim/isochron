// Helpers for the tests of a plate as one body (Tectonics.resolveFragments): counting a plate's
// pieces, and stranding a piece of one plate inside another.
import { nearest } from '../src/grid/icosphere.js';

/** The largest number of connected pieces any plate's world cells fall into. */
export function mostPieces(tec) {
  const g = tec.grid, n = g.n, comp = new Int32Array(n).fill(-1), per = new Map();
  for (let i = 0; i < n; i++) {
    if (comp[i] >= 0) continue;
    const k = tec.owner[i], st = [i];
    comp[i] = i;
    while (st.length) { const q = st.pop(); for (let t = g.nbrOff[q]; t < g.nbrOff[q + 1]; t++) { const j = g.nbr[t]; if (comp[j] < 0 && tec.owner[j] === k) { comp[j] = i; st.push(j); } } }
    per.set(k, (per.get(k) || 0) + 1);
  }
  return Math.max(...per.values());
}

/** A cell of plate k at least `rings` + 2 cells from its edge, or −1. */
export function deepCell(tec, k, rings) {
  const g = tec.grid;
  for (let i = 0; i < g.n; i++) {
    if (tec.owner[i] !== k) continue;
    const disc = new Set([i]);
    let ok = true;
    for (let r = 0; r <= rings + 1 && ok; r++) for (const q of [...disc]) for (let t = g.nbrOff[q]; t < g.nbrOff[q + 1]; t++) { const j = g.nbr[t]; if (tec.owner[j] !== k) ok = false; disc.add(j); }
    if (ok) return i;
  }
  return -1;
}

/** Plate b's crust where the world cells within `rings` of cell c are: a piece of b inside the plate around it. */
export function strand(tec, c, rings, b) {
  const g = tec.grid, cells = new Set([c]), pos = g.pos;
  for (let r = 0; r < rings; r++) for (const i of [...cells]) for (let t = g.nbrOff[i]; t < g.nbrOff[i + 1]; t++) cells.add(g.nbr[t]);
  const a = tec.owner[c], A = tec.plates[a], B = tec.plates[b], R = B.R;
  for (const i of cells) {
    const x = pos[3 * i], y = pos[3 * i + 1], z = pos[3 * i + 2], jf = tec.ref[i];
    const j = nearest(g, R[0] * x + R[3] * y + R[6] * z, R[1] * x + R[4] * y + R[7] * z, R[2] * x + R[5] * y + R[8] * z);
    B.mask[j] = 1; B.h[j] = A.h[jf]; B.phi[j] = A.phi[jf]; B.tf[j] = A.tf[jf]; B.sut[j] = A.sut[jf];
    A.mask[jf] = 0;
    tec.owner[i] = b; tec.ref[i] = j;
  }
  tec.dirty.plates.add(a); tec.dirty.plates.add(b); tec.dirty.owner = true;
  return [...cells];
}
