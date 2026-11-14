// Rivers for drawing: the landscape's drainage traced into polylines, from
// each source (where discharge first passes a threshold) down to the sea or
// to a larger river. Each point keeps its discharge, which sets line weight
// (docs/PLAN.md, "Depict, don't decorate": line weight on rivers is discharge).
// Lines are smoothed on the sphere by corner-cutting, ends held fixed.

export const RIVER_MIN = 1500;   // m³/s: a river worth drawing at this grid's scale

export function traceRivers(grid, land, qmin = RIVER_MIN) {
  const n = grid.n, pos = grid.pos, r = land.r;
  if (!r) return [];
  const Q = land.discharge, rcv = r.rcv, base = land.base, lake = land.lake;
  const big = new Uint8Array(n), donors = new Uint8Array(n), seen = new Uint8Array(n);
  for (let i = 0; i < n; i++) if (Q[i] >= qmin && rcv[i] >= 0) big[i] = 1;
  for (let i = 0; i < n; i++) if (big[i] && rcv[i] >= 0 && big[rcv[i]]) donors[rcv[i]] = 1;
  const lines = [];
  for (let s = 0; s < n; s++) {
    if (!big[s] || donors[s]) continue;            // sources: big, with no big donor
    let P = [], W = [];
    let i = s;
    const keep = () => { if (W.length >= 4 || (W.length >= 2 && W[W.length - 1] > 4 * qmin)) lines.push(smooth({ P, W })); };
    for (;;) {
      // Through a lake the river is the lake: end the line, start again at the outlet.
      if (lake[i] > 0.03) { keep(); P = []; W = []; seen[i] = 1; const j = rcv[i]; if (j < 0 || base[j]) break; i = j; continue; }
      P.push(pos[3 * i], pos[3 * i + 1], pos[3 * i + 2]); W.push(Q[i]);
      if (seen[i]) break;                          // joined a river already traced
      seen[i] = 1;
      const j = rcv[i];
      if (j < 0) break;
      if (base[j]) {                               // the mouth: halfway to the sea's cell
        const x = pos[3 * i] + pos[3 * j], y = pos[3 * i + 1] + pos[3 * j + 1], z = pos[3 * i + 2] + pos[3 * j + 2], m = Math.hypot(x, y, z);
        P.push(x / m, y / m, z / m); W.push(Q[i]);
        break;
      }
      i = j;
    }
    // A river is at least three cells long, or a large one: wet coasts otherwise
    // sprout a comb of one-cell streams.
    keep();
  }
  return lines;
}

function smooth(line) {
  let { P, W } = line;
  for (let pass = 0; pass < 2; pass++) {
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
