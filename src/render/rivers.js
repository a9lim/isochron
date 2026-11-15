// Rivers for drawing: the landscape's drainage traced into continuous lines.
// At each confluence the larger river runs on and the smaller ends there, so
// a main stem is one line from its source to the sea, and each tributary is
// its own line that joins it. Lines are smoothed on the sphere (relaxed toward
// their neighbours, then corner-cutting, ends held: cut corners alone kept the
// grid's straight runs between them), and a tributary's last point is moved
// onto its main stem's smoothed course, so the joins stay joined. A river
// reaches the sea where the drawn relief crosses sea level along its course,
// so it ends on the coast the globe draws. Each point keeps its discharge,
// which sets line weight (docs/PLAN.md, "Depict, don't decorate"). Rivers stop
// at lakes and start again at their outlets. With the climate's months (`Q12`),
// each point also keeps its discharge month by month, and rivers big enough only
// in their wet season are traced too (the page draws their beds dry the rest of
// the year).
//
// They run on their own drainage (`drainage`): the landscape's, except that in a
// closed lake's basin water runs down the basin's floor to the lake and ends
// there, and a spilling lake passes on only its overflow (its evaporation
// taken), so a river below a closed lake is dry.

export const RIVER_MIN = 1500;   // m³/s: a river worth drawing at this grid's scale

/**
 * The drainage rivers are drawn on, from the landscape's routing (`land.r`) and the lakes
 * (src/engine/lakes.js): in a closed lake's depression each cell drains to its lowest
 * neighbour in the depression (on the lakes' own surface) and the lake's cells are sinks;
 * where the drainage leaves a spilling lake's depression, what it carries is scaled by the
 * lake's outflow against its inflow (`pass`). Returns { rcv, order (receivers first), count,
 * pass, lake (cells under a lake's water), key (changes when a lake opens or closes) }.
 */
/** What `drainage` depends on in the lakes: their basins, and which of them spill. */
export function lakesKey(lakes) {
  if (!lakes || !lakes.built) return '';
  let key = `${lakes.builds}:`;
  for (let q = 0; q < lakes.nr; q++) key += lakes.regOut[q] > 0 ? 's' : 'c';
  return key;
}

export function drainage(grid, land, lakes) {
  const n = grid.n, r = land.r, nbrOff = grid.nbrOff, nbr = grid.nbr;
  const rcv = Int32Array.from(r.rcv), pass = new Float32Array(n).fill(1), lake = new Uint8Array(n);
  const key = lakesKey(lakes);
  if (lakes && lakes.built) {
    const reg = lakes.regOf, z = lakes.z, under = lakes.under, nr = lakes.nr;
    const closed = new Uint8Array(nr), f = new Float32Array(nr);
    for (let q = 0; q < nr; q++) {
      closed[q] = lakes.regOut[q] > 0 ? 0 : 1;
      f[q] = lakes.regIn[q] > 0 ? Math.min(1, lakes.regOut[q] / lakes.regIn[q]) : 1;
    }
    for (let i = 0; i < n; i++) {
      const q = reg[i];
      if (q < 0) continue;
      if (under[i]) lake[i] = 1;
      if (closed[q]) {
        if (under[i]) { rcv[i] = -1; continue; }
        let best = z[i], to = -1;
        for (let t = nbrOff[i], e = nbrOff[i + 1]; t < e; t++) { const j = nbr[t]; if (reg[j] === q && z[j] < best) { best = z[j]; to = j; } }
        rcv[i] = to;
      } else if (rcv[i] >= 0 && reg[rcv[i]] !== q) pass[i] = f[q];
    }
  }
  // Receivers before donors: breadth first from the sinks and outlets.
  const cnt = new Int32Array(n + 1);
  for (let i = 0; i < n; i++) if (rcv[i] >= 0) cnt[rcv[i] + 1]++;
  for (let i = 0; i < n; i++) cnt[i + 1] += cnt[i];
  const don = new Int32Array(cnt[n]), fill = cnt.slice(0, n);
  for (let i = 0; i < n; i++) if (rcv[i] >= 0) don[fill[rcv[i]]++] = i;
  const order = new Int32Array(n);
  let head = 0, tail = 0;
  for (let i = 0; i < n; i++) if (rcv[i] < 0) order[tail++] = i;
  while (head < tail) { const c = order[head++]; for (let t = cnt[c]; t < cnt[c + 1]; t++) order[tail++] = don[t]; }
  return { rcv, order, count: tail, pass, lake, key };
}

/**
 * `drawn`: the relief as the globe draws it (surface.js, metres over the sea ÷ 1000), whose
 * zero is the coast; `Q12`: discharge by month (landscape.js, `monthly`), whose mean is the
 * year's; `rt`: the drainage it was routed down (`drainage`), else the landscape's.
 */
export function traceRivers(grid, land, drawn = null, Q12 = null, qmin = RIVER_MIN, rt = null) {
  const n = grid.n, pos = grid.pos, r = land.r;
  if (!r) return [];
  const rcv = rt ? rt.rcv : r.rcv, base = land.base;
  // The year's mean, and the wettest month's discharge, where the months are known.
  let Q = land.discharge, peak = null;
  if (Q12) {
    Q = new Float32Array(n); peak = new Float32Array(n);
    for (let i = 0; i < n; i++) { let s = 0, m = 0; for (let k = 0, o = 12 * i; k < 12; k++) { const v = Q12[o + k]; s += v; if (v > m) m = v; } Q[i] = s / 12; peak[i] = m; }
  }
  // A lake of one cell isn't drawn (it would be a hexagon), so rivers run through it.
  const wet = rt ? i => rt.lake[i] === 1 : i => land.lake[i] > 0.03;
  const isLake = i => {
    if (!wet(i)) return false;
    for (let t = grid.nbrOff[i], e = grid.nbrOff[i + 1]; t < e; t++) if (wet(grid.nbr[t])) return true;
    return false;
  };
  const big = new Uint8Array(n);
  const onLand = i => !drawn || drawn[i] > 0;
  for (let i = 0; i < n; i++) if ((Q[i] >= qmin || (peak && peak[i] >= 1.5 * qmin)) && rcv[i] >= 0 && !isLake(i) && onLand(i)) big[i] = 1;
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
      if (base[j] || !onLand(j)) {                 // the mouth: where the drawn coast crosses i → j
        const f = drawn ? Math.min(0.95, Math.max(0.05, drawn[i] / (drawn[i] - drawn[j]))) : 0.5;
        const x = pos[3 * i] + f * (pos[3 * j] - pos[3 * i]), y = pos[3 * i + 1] + f * (pos[3 * j + 1] - pos[3 * i + 1]), z = pos[3 * i + 2] + f * (pos[3 * j + 2] - pos[3 * i + 2]), m = Math.sqrt(x * x + y * y + z * z);
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
    const P = [], W = [], M = [];
    const month = i => { for (let k = 0; k < 12; k++) M.push(Q12 ? Q12[12 * i + k] : Q[i]); };
    for (const i of c.cells) { P.push(pos[3 * i], pos[3 * i + 1], pos[3 * i + 2]); W.push(Q[i]); month(i); }
    const last = c.cells[c.cells.length - 1];
    if (c.mouth) { P.push(...c.mouth); W.push(W[W.length - 1]); month(last); }
    if (c.end >= 0) { P.push(pos[3 * c.end], pos[3 * c.end + 1], pos[3 * c.end + 2]); W.push(Q[last]); month(last); }
    if (W.length < 2) continue;
    const line = smooth(relax({ P, W, M }, Math.round(4 * Math.sqrt(n / 40962))), 3);
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
    line.cells = Int32Array.from(c.cells);   // the chain's cells, source to mouth (the year's anomaly reads them)
    out[k] = line;
  }
  // Short streams on wet coasts are dropped: a river is three cells long at level 6, or a large one.
  const minCells = Math.round(3 * Math.sqrt(n / 40962));   // ~330 km at any level
  return out.filter((l, k) => l && (chains[k].cells.length >= minCells || chains[k].q > 4 * qmin));
}

/** Each inner point pulled halfway toward its neighbours' mean, `passes` times; the ends held. */
function relax(line, passes) {
  const P = Float64Array.from(line.P), m = P.length / 3, Q = new Float64Array(P.length);
  for (let pass = 0; pass < passes && m > 2; pass++) {
    Q.set(P);
    for (let k = 1; k < m - 1; k++) {
      const x = 0.5 * Q[3 * k] + 0.25 * (Q[3 * k - 3] + Q[3 * k + 3]), y = 0.5 * Q[3 * k + 1] + 0.25 * (Q[3 * k - 2] + Q[3 * k + 4]), z = 0.5 * Q[3 * k + 2] + 0.25 * (Q[3 * k - 1] + Q[3 * k + 5]);
      const r = Math.sqrt(x * x + y * y + z * z);
      P[3 * k] = x / r; P[3 * k + 1] = y / r; P[3 * k + 2] = z / r;
    }
  }
  return { P, W: line.W, M: line.M };
}

/** Corner-cutting `passes` times: each segment gives points at ¼ and ¾, the ends held (m points become 2m). */
function smooth(line, passes) {
  let P = line.P, W = Float64Array.from(line.W), M = Float64Array.from(line.M), m = W.length;
  for (let pass = 0; pass < passes && m >= 3; pass++) {
    const m2 = 2 * m, P2 = new Float64Array(3 * m2), W2 = new Float64Array(m2), M2 = new Float64Array(12 * m2);
    P2[0] = P[0]; P2[1] = P[1]; P2[2] = P[2]; W2[0] = W[0];
    for (let q = 0; q < 12; q++) M2[q] = M[q];
    let o = 1;
    for (let k = 0; k < m - 1; k++) {
      for (let s = 0; s < 2; s++, o++) {
        const f = s ? 0.75 : 0.25, g = 1 - f;
        const x = P[3 * k] * g + P[3 * k + 3] * f, y = P[3 * k + 1] * g + P[3 * k + 4] * f, z = P[3 * k + 2] * g + P[3 * k + 5] * f;
        const r = Math.sqrt(x * x + y * y + z * z);
        P2[3 * o] = x / r; P2[3 * o + 1] = y / r; P2[3 * o + 2] = z / r;
        W2[o] = W[k] * g + W[k + 1] * f;
        for (let q = 0, a = 12 * k, b = 12 * o; q < 12; q++) M2[b + q] = M[a + q] * g + M[a + 12 + q] * f;
      }
    }
    P2[3 * o] = P[3 * m - 3]; P2[3 * o + 1] = P[3 * m - 2]; P2[3 * o + 2] = P[3 * m - 1]; W2[o] = W[m - 1];
    for (let q = 0; q < 12; q++) M2[12 * o + q] = M[12 * (m - 1) + q];
    P = P2; W = W2; M = M2; m = m2;
  }
  return { P: Float32Array.from(P), W: Float32Array.from(W), M: Float32Array.from(M) };
}
