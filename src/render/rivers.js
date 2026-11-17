// Rivers for drawing: the landscape's drainage traced into lines, as the edges
// of a graph of the flow. Where two inflows to a confluence are comparable
// (the second carries at least NODE of the first's discharge), the confluence
// is a node: every inflow ends there and a new river starts there, so two
// rivers meeting read as a Y. Where one dominates, it runs on through and the
// smaller ends there, its last point moved onto the larger's smoothed course.
// Lines are smoothed on the sphere (relaxed toward their neighbours, then
// corner-cutting, ends held: cut corners alone kept the grid's straight runs
// between them), so every line meeting at a node shares its point exactly. A
// river reaches the sea where the drawn coast crosses zero along its
// course, so it ends on the coast the globe draws. Each point keeps its
// discharge, which sets line weight (the parent AGENTS.md's "Depict, don't decorate").
// Rivers stop at lakes and start again at their outlets. With the climate's
// months (`Q12`), each point also keeps its discharge month by month, and
// rivers big enough only in their wet season are traced too (the page draws
// their beds dry the rest of the year).
//
// They run on their own drainage (`drainage`): the landscape's, except that in a
// closed lake's basin water runs down the basin's floor to the lake and ends
// there, and a spilling lake passes on only its overflow (its evaporation
// taken), so a river below a closed lake is dry.

export const RIVER_MIN = 1500;   // m³/s: a river worth drawing at this grid's scale
// A confluence is a node where its second inflow carries at least this share of the first's: two
// rivers within about one step of line weight of each other (a step is ×2.85 in discharge), so
// that neither reads as the one running on.
export const NODE = 0.4;

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
  for (let q = 0; q < lakes.nr; q++) key += spills(lakes, q) ? 's' : 'c';
  return key;
}
/** Does region q spill over the year (more than a hundredth of what reaches it)? The year's memory decays toward closed, never to it. */
const spills = (lakes, q) => lakes.regOutY[q] > 0.01 * lakes.regInY[q] && lakes.regOutY[q] > 0;

export function drainage(grid, land, lakes) {
  const n = grid.n, r = land.r, nbrOff = grid.nbrOff, nbr = grid.nbr;
  const rcv = Int32Array.from(r.rcv), pass = new Float32Array(n).fill(1), lake = new Uint8Array(n);
  const key = lakesKey(lakes);
  if (lakes && lakes.built) {
    const reg = lakes.regOf, z = lakes.z, under = lakes.under, nr = lakes.nr;
    const closed = new Uint8Array(nr), f = new Float32Array(nr);
    for (let q = 0; q < nr; q++) {
      closed[q] = spills(lakes, q) ? 0 : 1;
      f[q] = lakes.regInY[q] > 0 ? Math.min(1, lakes.regOutY[q] / lakes.regInY[q]) : 1;
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
 * `drawn`: the coast as the globe draws it (surface.js, coastField: km, negative on the ocean), whose
 * zero is the coast; `Q12`: discharge by month (landscape.js, `monthly`), whose mean is the
 * year's; `rt`: the drainage it was routed down (`drainage`), else the landscape's.
 */
export function traceRivers(grid, land, drawn = null, Q12 = null, qmin = RIVER_MIN, rt = null, lakeDraw = null) {
  const n = grid.n, pos = grid.pos, r = land.r;
  if (!r) return [];
  const rcv = rt ? rt.rcv : r.rcv, base = land.base, { order, count } = rt || r;
  // The year's mean, and the wettest month's discharge, where the months are known.
  let Q = land.discharge, peak = null;
  if (Q12) {
    Q = new Float32Array(n); peak = new Float32Array(n);
    for (let i = 0; i < n; i++) { let s = 0, m = 0; for (let k = 0, o = 12 * i; k < 12; k++) { const v = Q12[o + k]; s += v; if (v > m) m = v; } Q[i] = s / 12; peak[i] = m; }
  }
  // A river stops at a lake as the globe draws it (`lakeDraw`, src/render/surface.js's lakeFields:
  // water where it is above zero), so it runs on through a lake too small or shallow to be drawn,
  // and stops at one that is, running into the lake's cell (and a river leaving a lake starts at
  // its cell) for the page to cut where the drawn shore crosses it (overlay.js, lakeAlong).
  // Without the drawn field, the drainage's lakes of two cells and more (one would draw as a hexagon).
  const wet = rt ? i => rt.lake[i] === 1 : i => land.lake[i] > 0.03;
  const isLake = lakeDraw ? i => lakeDraw[i] > 0 : i => {
    if (!wet(i)) return false;
    for (let t = grid.nbrOff[i], e = grid.nbrOff[i + 1]; t < e; t++) if (wet(grid.nbr[t])) return true;
    return false;
  };
  const big = new Uint8Array(n);
  const onLand = i => !drawn || drawn[i] > 0;
  for (let i = 0; i < n; i++) if ((Q[i] >= qmin || (peak && peak[i] >= 1.5 * qmin)) && rcv[i] >= 0 && !isLake(i) && onLand(i)) big[i] = 1;
  // Each cell's largest and second-largest big donors.
  const d1 = new Int32Array(n).fill(-1), d2 = new Int32Array(n).fill(-1);
  const donors = () => {
    d1.fill(-1); d2.fill(-1);
    for (let i = 0; i < n; i++) {
      if (!big[i]) continue;
      const j = rcv[i];
      if (j < 0 || !big[j]) continue;
      if (d1[j] < 0 || Q[i] > Q[d1[j]]) { d2[j] = d1[j]; d1[j] = i; }
      else if (d2[j] < 0 || Q[i] > Q[d2[j]]) d2[j] = i;
    }
  };
  donors();
  // Short streams on wet coasts are dropped: a river is three cells long at level 6 (~330 km at
  // any level), or a large one. Each branch (a run along the largest donors, ending where it
  // meets a larger one, a lake or the sea) is kept by its last cell's longest path upstream or
  // its discharge, so a stream kept never flows into one dropped.
  const minCells = Math.round(3 * Math.sqrt(n / 40962)), up = new Int32Array(n), keep = new Uint8Array(n);
  for (let k = count - 1; k >= 0; k--) {
    const i = order[k];
    if (!big[i]) continue;
    if (!up[i]) up[i] = 1;
    const j = rcv[i];
    if (j >= 0 && big[j] && up[j] < up[i] + 1) up[j] = up[i] + 1;
  }
  for (let k = 0; k < count; k++) {
    const i = order[k];
    if (!big[i]) continue;
    const j = rcv[i];
    keep[i] = j >= 0 && big[j] && d1[j] === i ? keep[j] : up[i] >= minCells || Q[i] > 4 * qmin ? 1 : 0;
  }
  for (let i = 0; i < n; i++) if (!keep[i]) big[i] = 0;
  donors();
  // Nodes: confluences whose second inflow is comparable to the first.
  const node = new Uint8Array(n);
  for (let j = 0; j < n; j++) if (d2[j] >= 0 && Q[d2[j]] >= NODE * Q[d1[j]]) node[j] = 1;
  // Chains: start where no big river flows in, or at a node; follow the largest donor's links
  // downstream to the sea, a lake, a node, or a larger river.
  const chainOf = new Int32Array(n).fill(-1), chains = [];
  for (let h = 0; h < n; h++) {
    if (!big[h] || (d1[h] >= 0 && !node[h])) continue;
    const cells = [];
    let i = h, end = -1, atNode = false, mouth = null, into = -1, from = -1;
    // A source below a lake leaves it: the lake's cell that drains here (the largest).
    if (d1[h] < 0) for (let t = grid.nbrOff[h], e = grid.nbrOff[h + 1]; t < e; t++) {
      const d = grid.nbr[t];
      if (rcv[d] === h && isLake(d) && (from < 0 || Q[d] > Q[from])) from = d;
    }
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
      if (!big[j]) { if (isLake(j) || rcv[j] < 0) into = j; break; }   // into a lake (or a closed depression's sink): on to its cell
      if (node[j]) { end = j; atNode = true; break; }   // into a node: a new river starts there
      if (d1[j] !== i) { end = j; break; }          // a tributary: it ends on the larger river
      i = j;
    }
    chains.push({ cells, end, atNode, mouth, into, from, q: Q[cells[cells.length - 1]] });
  }
  // Smooth the larger rivers first, then move each tributary's end onto its river's course (a
  // node's point is the node's cell, which every line meeting there holds as its end).
  const byQ = chains.map((_, k) => k).sort((a, b) => chains[b].q - chains[a].q);
  const relaxes = Math.round(4 * Math.sqrt(n / 40962)), cuts = Math.max(1, Math.round(3 - Math.log2(n / 40962) / 2));
  const out = new Array(chains.length);
  for (const k of byQ) {
    const c = chains[k];
    const P = [], W = [], M = [];
    const month = i => { for (let k = 0; k < 12; k++) M.push(Q12 ? Q12[12 * i + k] : Q[i]); };
    if (c.from >= 0) { P.push(pos[3 * c.from], pos[3 * c.from + 1], pos[3 * c.from + 2]); W.push(Q[c.cells[0]]); month(c.cells[0]); }
    for (const i of c.cells) { P.push(pos[3 * i], pos[3 * i + 1], pos[3 * i + 2]); W.push(Q[i]); month(i); }
    const last = c.cells[c.cells.length - 1];
    if (c.into >= 0) { P.push(pos[3 * c.into], pos[3 * c.into + 1], pos[3 * c.into + 2]); W.push(Q[last]); month(last); }
    if (c.mouth) { P.push(...c.mouth); W.push(W[W.length - 1]); month(last); }
    if (c.end >= 0) { P.push(pos[3 * c.end], pos[3 * c.end + 1], pos[3 * c.end + 2]); W.push(Q[last]); month(last); }
    if (W.length < 2) continue;
    // Corner-cut three times at level 6 (~14 km apart), twice at level 7 (its points start twice as close).
    const line = smooth(relax({ P, W, M }, relaxes), cuts);
    if (c.end >= 0 && !c.atNode) {
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
    line.cells = Int32Array.from(c.cells);   // the chain's cells, source (or node) to mouth (the year's anomaly reads them)
    out[k] = line;
  }
  return out.filter(Boolean);
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

// A course within this many cells of one drawn hasn't visibly moved (at level 7, ~8 km: half a
// pixel at the usual zoom).
export const SAME = 0.15;

/**
 * The page's rivers across a retrace. Nothing morphs (a course sliding from the old to the new
 * wiggled as rivers meandered): each point of the new rivers within SAME cells of a course drawn
 * now takes that course's alpha there, and the drawn points it covers go; the rest of the old
 * fades out and the rest of the new fades in over the fade that follows, so a river whose course
 * is unchanged simply stays and one that changed crossfades only where it did. `drawn`: the lines
 * drawn now (each with `fa0`/`fa1`, its alpha per point at the last fade's start and end, or none
 * when wholly drawn), at `phi` of that fade; `cur`: the new rivers, given `fa0`/`fa1` (none where
 * they stay whole); `spacing`: the grid's (rad). Returns the old lines still fading out.
 */
export function succeedRivers(drawn, cur, phi, spacing) {
  const eps = SAME * spacing, eps2 = eps * eps;
  const now = drawn.map(l => {
    if (!l.fa0) return null;
    const a = new Float32Array(l.fa0.length);
    for (let k = 0; k < a.length; k++) a[k] = l.fa0[k] + (l.fa1[k] - l.fa0[k]) * phi;
    return a;
  });
  // Most rivers come back exactly (the same cells give the same points): those stay as drawn.
  const same = (a, b) => { if (a.length !== b.length) return false; for (let k = 0; k < a.length; k++) if (a[k] !== b[k]) return false; return true; };
  const whole = new Map(), kept = new Uint8Array(drawn.length), stays = new Uint8Array(cur.length);
  drawn.forEach((l, li) => { if (!now[li]) { const k = l.P[0] + 3 * l.P[1] + 7 * l.P[2] + l.P.length; const b = whole.get(k); if (b) b.push(li); else whole.set(k, [li]); } });
  cur.forEach((r, ri) => {
    const b = whole.get(r.P[0] + 3 * r.P[1] + 7 * r.P[2] + r.P.length);
    const li = b ? b.find(li => !kept[li] && same(drawn[li].P, r.P) && same(drawn[li].cells, r.cells)) : undefined;
    if (li !== undefined) { kept[li] = 1; stays[ri] = 1; r.fa0 = r.fa1 = null; }
  });
  const Hd = new Courses(drawn, null, eps), Hc = new Courses(cur, stays, eps);
  cur.forEach((r, ri) => {
    if (stays[ri]) return;
    const P = r.P, m = P.length / 3, a0 = new Float32Array(m);
    let all = true;
    for (let k = 0; k < m; k++) { a0[k] = Math.max(0, Hd.near(P[3 * k], P[3 * k + 1], P[3 * k + 2], eps2, now)); if (a0[k] < 0.999) all = false; }
    if (all) r.fa0 = r.fa1 = null;
    else { r.fa0 = a0; r.fa1 = new Float32Array(m).fill(1); }
  });
  const gone = [];
  drawn.forEach((l, li) => {
    if (kept[li]) return;
    const P = l.P, m = P.length / 3, A = now[li], a0 = new Float32Array(m);
    let any = false;
    for (let k = 0; k < m; k++) {
      const a = A ? A[k] : 1;
      if (a > 0 && Hc.near(P[3 * k], P[3 * k + 1], P[3 * k + 2], eps2, null) < 0) { a0[k] = a; any = true; }
    }
    if (any) { l.fa0 = a0; l.fa1 = new Float32Array(m); gone.push(l); }
  });
  return gone;
}

/**
 * Lines' points in cubes (open addressing on typed arrays), for the segments near a point. A
 * segment longer than `cap` is also entered at points along it, so a search reaches every
 * segment within eps of a point from the cubes within eps + cap.
 */
class Courses {
  constructor(lines, skip, eps, cap = 2 * eps) {
    let np = 0;
    const extra = (P, k) => k + 3 < P.length ? Math.floor(Math.sqrt((P[k + 3] - P[k]) ** 2 + (P[k + 4] - P[k + 1]) ** 2 + (P[k + 5] - P[k + 2]) ** 2) / cap) : 0;
    lines.forEach((l, li) => {
      if (skip && skip[li]) return;
      const P = l.P;
      for (let k = 0; k < P.length; k += 3) np += 1 + extra(P, k);
    });
    this.r = eps + cap; this.inv = 1 / (2 * this.r);
    let size = 16;
    while (size < 2 * np) size *= 2;
    this.mask = size - 1; this.keys = new Int32Array(size).fill(-1); this.head = new Int32Array(size).fill(-1);
    this.next = new Int32Array(np); this.line = new Int32Array(np); this.pt = new Int32Array(np); this.lines = lines;
    let q = 0;
    const put = (li, k, x, y, z) => {
      const s = this.slot(this.key(Math.floor(x * this.inv), Math.floor(y * this.inv), Math.floor(z * this.inv)), true);
      this.line[q] = li; this.pt[q] = k; this.next[q] = this.head[s]; this.head[s] = q++;
    };
    lines.forEach((l, li) => {
      if (skip && skip[li]) return;
      const P = l.P;
      for (let k = 0; k < P.length; k += 3) {
        put(li, k / 3, P[k], P[k + 1], P[k + 2]);
        const e = extra(P, k);
        for (let j = 1; j <= e; j++) { const f = j / (e + 1); put(li, k / 3, P[k] + f * (P[k + 3] - P[k]), P[k + 1] + f * (P[k + 4] - P[k + 1]), P[k + 2] + f * (P[k + 5] - P[k + 2])); }
      }
    });
  }
  key(ix, iy, iz) { return ((ix + 512) * 1024 + iy + 512) * 1024 + iz + 512; }
  slot(key, add) {
    let s = Math.imul(key, 0x9E3779B1) >>> 0 & this.mask;
    for (;;) {
      const k = this.keys[s];
      if (k === key) return s;
      if (k === -1) { if (add) { this.keys[s] = key; return s; } return -1; }
      s = (s + 1) & this.mask;
    }
  }
  /** The largest alpha (A per line, null: 1) of the segments within √eps2 of a point, or -1. */
  near(x, y, z, eps2, A) {
    const r = this.r, inv = this.inv, lines = this.lines;
    const x0 = Math.floor((x - r) * inv), y0 = Math.floor((y - r) * inv), z0 = Math.floor((z - r) * inv);
    const x1 = Math.floor((x + r) * inv), y1 = Math.floor((y + r) * inv), z1 = Math.floor((z + r) * inv);
    let best = -1;
    for (let ix = x0; ix <= x1; ix++) for (let iy = y0; iy <= y1; iy++) for (let iz = z0; iz <= z1; iz++) {
      const s = this.slot(this.key(ix, iy, iz), false);
      if (s < 0) continue;
      for (let q = this.head[s]; q >= 0; q = this.next[q]) {
        const li = this.line[q], k = this.pt[q], P = lines[li].P, m = P.length / 3, a = A ? A[li] : null;
        if (k > 0) { const al = a ? Math.max(a[k], a[k - 1]) : 1; if (al > best && al > 0 && segment2(P, k, k - 1, x, y, z) < eps2) best = al; }
        if (k < m - 1) { const al = a ? Math.max(a[k], a[k + 1]) : 1; if (al > best && al > 0 && segment2(P, k, k + 1, x, y, z) < eps2) best = al; }
        if (best >= 1) return best;
      }
    }
    return best;
  }
}

/** Distance² from (x, y, z) to the segment of P from point a to point b. */
function segment2(P, a, b, x, y, z) {
  const ax = P[3 * a], ay = P[3 * a + 1], az = P[3 * a + 2], ux = P[3 * b] - ax, uy = P[3 * b + 1] - ay, uz = P[3 * b + 2] - az;
  const uu = ux * ux + uy * uy + uz * uz, t = uu > 0 ? Math.max(0, Math.min(1, ((x - ax) * ux + (y - ay) * uy + (z - az) * uz) / uu)) : 0;
  return (x - ax - t * ux) ** 2 + (y - ay - t * uy) ** 2 + (z - az - t * uz) ** 2;
}
