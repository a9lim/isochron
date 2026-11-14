// Rivers for drawing: the landscape's drainage traced into continuous lines.
// At each confluence the larger river runs on and the smaller ends there, so
// a main stem is one line from its source to the sea, and each tributary is
// its own line that joins it. Lines are smoothed on the sphere (corner-cutting,
// ends held), and a tributary's last point is moved onto its main stem's
// smoothed course, so the joins stay joined. Each point keeps its discharge,
// which sets line weight (docs/PLAN.md, "Depict, don't decorate"). Rivers
// stop at lakes and start again at their outlets.

export const RIVER_MIN = 1500;   // m³/s: a river worth drawing at this grid's scale

export function traceRivers(grid, land, qmin = RIVER_MIN) {
  const n = grid.n, pos = grid.pos, r = land.r;
  if (!r) return [];
  const Q = land.discharge, rcv = r.rcv, base = land.base, lake = land.lake;
  // A lake of one cell isn't drawn (it would be a hexagon), so rivers run through it.
  const isLake = i => {
    if (!(lake[i] > 0.03)) return false;
    for (let t = grid.nbrOff[i], e = grid.nbrOff[i + 1]; t < e; t++) if (lake[grid.nbr[t]] > 0.03) return true;
    return false;
  };
  const big = new Uint8Array(n);
  for (let i = 0; i < n; i++) if (Q[i] >= qmin && rcv[i] >= 0 && !isLake(i)) big[i] = 1;
  // Each cell's main donor: its largest big donor.
  const main = new Int32Array(n).fill(-1);
  for (let i = 0; i < n; i++) {
    if (!big[i]) continue;
    const j = rcv[i];
    if (j < 0 || !big[j]) continue;
    if (main[j] < 0 || Q[i] > Q[main[j]]) main[j] = i;
  }
  // Chains: start where no big river flows in, follow main-donor links downstream.
  const chainOf = new Int32Array(n).fill(-1), chains = [];
  for (let h = 0; h < n; h++) {
    if (!big[h] || main[h] >= 0) continue;
    const cells = [];
    let i = h, end = -1, mouth = null;
    for (;;) {
      cells.push(i);
      chainOf[i] = chains.length;
      const j = rcv[i];
      if (j < 0) break;
      if (base[j]) {                               // the mouth: halfway to the sea's cell
        const x = pos[3 * i] + pos[3 * j], y = pos[3 * i + 1] + pos[3 * j + 1], z = pos[3 * i + 2] + pos[3 * j + 2], m = Math.hypot(x, y, z);
        mouth = [x / m, y / m, z / m];
        break;
      }
      if (!big[j]) break;                          // into a lake
      if (main[j] !== i) { end = j; break; }        // a tributary: it ends at the confluence
      i = j;
    }
    chains.push({ cells, end, mouth, q: Q[cells[cells.length - 1]] });
  }
  // Smooth the main stems first, then snap each tributary's end onto its stem.
  const order = chains.map((_, k) => k).sort((a, b) => chains[b].q - chains[a].q);
  const out = new Array(chains.length);
  for (const k of order) {
    const c = chains[k];
    const P = [], W = [];
    for (const i of c.cells) { P.push(pos[3 * i], pos[3 * i + 1], pos[3 * i + 2]); W.push(Q[i]); }
    if (c.mouth) { P.push(...c.mouth); W.push(W[W.length - 1]); }
    if (c.end >= 0) { P.push(pos[3 * c.end], pos[3 * c.end + 1], pos[3 * c.end + 2]); W.push(Q[c.cells[c.cells.length - 1]]); }
    if (W.length < 2) continue;
    const line = smooth({ P, W }, 3);
    if (c.end >= 0) {
      const stem = out[chainOf[c.end]];
      if (stem) {
        const m = line.W.length - 1;
        let best = 0, bd = -2;
        for (let q = 0; q < stem.W.length; q++) {
          const d = stem.P[3 * q] * line.P[3 * m] + stem.P[3 * q + 1] * line.P[3 * m + 1] + stem.P[3 * q + 2] * line.P[3 * m + 2];
          if (d > bd) { bd = d; best = q; }
        }
        line.P[3 * m] = stem.P[3 * best]; line.P[3 * m + 1] = stem.P[3 * best + 1]; line.P[3 * m + 2] = stem.P[3 * best + 2];
      }
    }
    line.plate = land.tec.owner[c.cells[0]];
    out[k] = line;
  }
  // Short streams on wet coasts are dropped: a river is three cells long at level 6, or a large one.
  const minCells = Math.round(3 * Math.sqrt(n / 40962));   // ~330 km at any level
  return out.filter((l, k) => l && (chains[k].cells.length >= minCells || chains[k].q > 4 * qmin));
}

function smooth(line, passes) {
  let { P, W } = line;
  for (let pass = 0; pass < passes; pass++) {
    const m = W.length;
    if (m < 3) break;
    const P2 = [P[0], P[1], P[2]], W2 = [W[0]];
    for (let k = 0; k < m - 1; k++) {
      for (const f of [0.25, 0.75]) {
        let x = P[3 * k] * (1 - f) + P[3 * k + 3] * f, y = P[3 * k + 1] * (1 - f) + P[3 * k + 4] * f, z = P[3 * k + 2] * (1 - f) + P[3 * k + 5] * f;
        const r = Math.hypot(x, y, z);
        P2.push(x / r, y / r, z / r);
        W2.push(W[k] * (1 - f) + W[k + 1] * f);
      }
    }
    P2.push(P[3 * m - 3], P[3 * m - 2], P[3 * m - 1]); W2.push(W[m - 1]);
    P = P2; W = W2;
  }
  return { P: Float32Array.from(P), W: Float32Array.from(W) };
}
