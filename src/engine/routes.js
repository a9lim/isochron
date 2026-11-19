// The routes: one transport cost for every flow between the people's cells (docs/people.md,
// "Routes and trade"; the roadmap's seam rule 2). Food, crops and knowledge run on them now; batch
// 2's deliveries and goods are to run on the same costs.
//
// The graph is the people's grid's parent (level 5 under the people's 6: ~220 km), its nodes the
// coarse cells, land or sea as the people's fields have them, each joined to its ring and the six
// between its ring and the next (`twelve`: twelve directions 30° apart, so paths run near great
// circles). Each directed edge has a cost in sea-km (a cargo carried a km by sea on a fair wind),
// in two layers:
//   sail     by sea, the year's mean speed a sailing ship makes along the edge: through the water
//            a share of the wind's speed by the angle off it (fastest running before it, a beat's
//            G_UP close-hauled), at the year's six points of the planet's own surface wind, plus the
//            gyres' current along the edge, never below an oar's V_ROW, over the open share of the
//            year (sea ice closes it); by land, a road's C_LAND a km × (1 + climb/H_CLIMB), a river
//            boats ply (both ends past Q_NAV) at C_DOWN downstream, C_UP up, a lake's C_DOWN; a port
//            (land to sea) C_PORT. Sea : river : road ≈ 1 : 5 : 30 is the pre-industrial ratio
//            (Diocletian's price edict of 301 as historians read it, from memory); the ship's
//            polar and the port's cost are synthesis. Each leg sails when its wind serves, so where
//            the wind reverses (a monsoon) both ways cost about twice a fair run, and where it
//            doesn't (the trades) the way back is the long way round (the westerlies): the routes
//            out and home differ, as the volta do mar's.
//   steam    industry's: steamships at C_STEAM a km at V_STEAM, the current along the edge and
//            K_STEAM of the wind's adding to it (so the lanes gather where the sea helps, as
//            shipping's do, rather than scattering over equal paths), rail at C_RAIL ×
//            (1 + climb/H_RAIL), barges at C_BARGE, ports at C_PORT_IND.
// Markets are the grandparent grid's land cells (~450 km apart: level 4), with any land the
// sail can't reach from one within C_FILL given its own. Each node belongs to the market nearest it
// by the sail (`owner`); each people's cell to its node. From every market, Dijkstra on each layer
// gives the cost to every other (directed: `D`, and the paths: `pred`).
//
// Trade (`trade`, synthesis on the gravity model of trade, standard: Tinbergen 1962, from memory):
// between active markets (those with fields: trade comes with farming), a kernel e^{−c/reach},
// c the round trip's mean ((out + home)/2) on the layer the pair sails (steam by the more
// industrial end's share; the sail's part by land cheaper by the two markets' roads and canals,
// People's works), reach rising with the more advanced end's knowledge (`reach`).
// Each market buys from the others in proportion to kernel × their food (its supply basket, w):
// a cell's harvest is then (1 − τ) its own and τ the basket's, τ the share of food that goes
// through markets (TAU_AG with fields, toward TAU_IND with industry). The harvest's spread pools as
// a one-factor model of the weather's correlation ρ = e^{−d/L_CORR} (each market's anomaly its
// correlation with the buyer's, plus its own): the basket's variance Σ w²(1 − ρ²) + (Σ w ρ)², its
// covariance with the cell's own Σ w ρ (synthesis). Knowledge and crops are copied from the markets
// met by trade (contact the kernel × N/(N + N_MEET), at most a whole one), and the long-distance flows (τ × food × w,
// between markets over D_DRAW apart) are drawn along the routes as lines as heavy as their flux.
import { buildGrid } from '../grid/icosphere.js';
import { makeTransfer } from '../grid/transfer.js';

const R = 6371;

export const ROUTES = {
  C_SEA: 1, C_DOWN: 5, C_UP: 10, C_LAND: 30, C_PORT: 100,   // sea-km a km by sea, a river down and up, a road; a port's handling (the cost of ~100 km at sea)
  H_CLIMB: 0.5, ICE_LAND: 20,      // km of climb between nodes that doubles a road's cost (passes, synthesis); over an ice sheet ×
  Q_NAV: 300, LAKE_NAV: 0.3,       // m³/s: a river boats ply (at the people's scale); a lake's share that carries boats
  V_SHIP: 2.5, W_REF: 7, W_HALF: 4, G_UP: 0.15, V_ROW: 0.3, ICE_OPEN: 0.05,   // m/s: a merchant sailing ship's speed before a fair wind of W_REF (~5 knots, from memory), the wind's speed that halves it, a beat's share close-hauled, an oar's or a drift's; the least open share of a sea under ice
  C_STEAM: 0.3, C_RAIL: 3, H_RAIL: 1, C_BARGE: 1.5, C_PORT_IND: 30, V_STEAM: 6, K_STEAM: 0.05,   // industry's: steamship, rail (×(1 + climb/H_RAIL)), barge, port (sea-km a km; a ton-km by steam a third of sail's, by rail a tenth of the wagon's: from memory)
  C_FILL: 3000,                    // land whose nearest market costs more is given its own
  R_ROAD: 1, K_CANAL: 5,           // the land's works on the markets' routes: the sail's part by land ÷ (1 + R_ROAD × the pair's roads + K_CANAL × its canals' share of the land), both its two markets' mean (roads at their full room halve it; canals over a fifth of the land halve it, the boats going where the water does: the Grand Canal's, Mesopotamia's; synthesis)
  R_T0: 300, Z_RT: 1.1, R_TMAX: 1e5,   // the trade's reach (sea-km of cost that cuts it e-fold): R_T0 at farming's knowledge, ×e per Z_RT of knowledge past it (grain by sea from Egypt to Rome, ~3,000 sea-km, at ~0.3 of the local market's weight by Rome's; the Atlantic's ~10,000 at ~0.1 by 1600; synthesis), at most R_TMAX
  TAU_AG: 0.15, TAU_IND: 0.9,      // the share of a farming people's food that goes through markets (rents, taxes, the towns' food), and an industrial people's
  L_CORR: 1500,                    // km: the weather's correlation length (a year's harvest anomalies, ρ = e^{−d/L_CORR}; rough, from memory)
  DT_TRADE: 10,                    // years between the trade's kernels (the masses move slowly)
  K_PART: 12, N_MEET: 1e5,         // the markets met by trade each keeps for copying knowledge and crops; the people a market needs to be met at half its kernel (a town's)
  M_CATCH: 48, C_CATCH: 3e4,       // a cell's catchment for its cities' food (`catchments`): its nearest cells by the local routes, at most this many and this cost
  N_FLOW: 600, D_DRAW: 1000,       // the largest flows drawn, between markets at least D_DRAW km apart (the long-distance trade: a neighbour's exchange drew the grid)
};

// A binary heap of (key, node) with lazy deletion.
export class Heap {
  constructor(cap) { this.k = new Float64Array(cap + 1); this.v = new Int32Array(cap + 1); this.n = 0; }
  push(key, v) {
    let i = this.n++;
    const K = this.k, V = this.v;
    while (i > 0) { const p = (i - 1) >> 1; if (K[p] <= key) break; K[i] = K[p]; V[i] = V[p]; i = p; }
    K[i] = key; V[i] = v;
  }
  pop() {   // returns the node; its key in this.top
    const K = this.k, V = this.v, n = --this.n, top = V[0];
    this.top = K[0];
    const key = K[n], v = V[n];
    let i = 0;
    for (;;) {
      let c = 2 * i + 1;
      if (c >= n) break;
      if (c + 1 < n && K[c + 1] < K[c]) c++;
      if (K[c] >= key) break;
      K[i] = K[c]; V[i] = V[c]; i = c;
    }
    K[i] = key; V[i] = v;
    return top;
  }
}

/** Dijkstra over a CSR graph from `src` (or several), into dist and pred (Uint16, 65535 none). */
export function dijkstra(g, cost, src, dist, pred, heap, owner = null, own = null, extra = null, acc = null) {
  dist.fill(Infinity); if (pred) pred.fill(65535); if (acc) acc.fill(0);
  heap.n = 0;
  const srcs = typeof src === 'number' ? [src] : src;
  srcs.forEach((s, k) => { dist[s] = 0; if (owner) owner[s] = own ? own[k] : k; heap.push(0, s); });
  const { nbrOff, nbr } = g;
  while (heap.n) {
    const u = heap.pop(), d = heap.top;
    if (d > dist[u]) continue;
    for (let o = nbrOff[u]; o < nbrOff[u + 1]; o++) {
      const w = nbr[o], nd = d + cost[o];
      if (nd < dist[w]) { dist[w] = nd; if (pred) pred[w] = u; if (owner) owner[w] = owner[u]; if (extra) acc[w] = acc[u] + extra[o]; heap.push(nd, w); }
    }
  }
}

/**
 * A sailing ship's year-mean speed (m/s) along unit heading h (a 3-vector) through winds `w` (six
 * 3-vectors, m/s) and a current `cu` (m/s, a 3-vector), over the open share of the year `open`.
 */
export function sailSpeed(h, w, cu, open, C = ROUTES) {
  const k = (C.W_REF + C.W_HALF) / C.W_REF, along = cu[0] * h[0] + cu[1] * h[1] + cu[2] * h[2];
  let v = 0;
  for (let p = 0; p < 6; p++) {
    const wx = w[3 * p], wy = w[3 * p + 1], wz = w[3 * p + 2], ws = Math.hypot(wx, wy, wz);
    const x = ws > 1e-9 ? (wx * h[0] + wy * h[1] + wz * h[2]) / ws : 0;
    const s = C.V_SHIP * Math.max(C.G_UP, 0.5 * (1 + x)) * ws / (ws + C.W_HALF) * k;
    v += Math.max(C.V_ROW, s + along) / 6;
  }
  return v * Math.max(C.ICE_OPEN, open);
}

/**
 * A grid's graph in twelve directions: each node's ring, and the six nodes between it and its
 * second ring (the far corner of each rhombus u–a–v–b over two adjacent ring nodes a, b). Returns
 * { n, nbrOff, nbr, via } (via: per edge, the ring nodes it passes between; none for the ring's).
 */
export function twelve(g) {
  const n = g.n, lists = Array.from({ length: n }, () => []), vias = Array.from({ length: n }, () => []);
  const ring = u => g.nbr.subarray(g.nbrOff[u], g.nbrOff[u + 1]);
  for (let u = 0; u < n; u++) {
    const R1 = ring(u), seen = new Map();
    for (const a of R1) { lists[u].push(a); vias[u].push([]); }
    for (let x = 0; x < R1.length; x++) for (let y = x + 1; y < R1.length; y++) {
      const a = R1[x], b = R1[y], Ra = ring(a);
      if (!Ra.includes(b)) continue;
      for (const v of Ra) {
        if (v === u || R1.includes(v) || !ring(b).includes(v)) continue;
        if (seen.has(v)) { vias[u][seen.get(v)].push(a, b); continue; }
        seen.set(v, lists[u].length); lists[u].push(v); vias[u].push([a, b]);
      }
    }
  }
  const nbrOff = new Int32Array(n + 1);
  for (let u = 0; u < n; u++) nbrOff[u + 1] = nbrOff[u] + lists[u].length;
  const nbr = new Int32Array(nbrOff[n]), via = new Array(nbrOff[n]);
  for (let u = 0; u < n; u++) lists[u].forEach((v, k) => { nbr[nbrOff[u] + k] = v; via[nbrOff[u] + k] = [...new Set(vias[u][k])]; });
  return { n, nbrOff, nbr, via };
}

export class Routes {
  /** For a People (its grid, land cells and fields `f`, the people's grid's arrays), with ROUTES overrides. */
  constructor(people, f, params = {}) {
    // ROUTES' keys may come with the people's overrides (the tools pass one object).
    const own = Object.fromEntries(Object.keys(ROUTES).filter(k => people.P[k] !== undefined).map(k => [k, people.P[k]]));
    this.C = { ...ROUTES, ...own, ...params };
    this.pp = people;
    this.build(f);
  }

  build(f) {
    const C = this.C, pp = this.pp, g6 = pp.planet.grid, lv = Math.max(2, g6.level - 1);
    const g = this.g = buildGrid(lv), n = g.n, m = g.nbrOff[n], gm = buildGrid(Math.max(1, lv - 1));
    // Nodes: each coarse cell is the fine vertex of the same index (the grids nest).
    const land = this.land = new Uint8Array(n), alive = new Uint8Array(n), ice = new Float32Array(n), elev = new Float32Array(n), Q = new Float32Array(n), lake = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      land[i] = f.elev[i] > 0 ? 1 : 0; elev[i] = Math.max(0, f.elev[i]); Q[i] = f.discharge[i]; lake[i] = f.lake[i];
      ice[i] = land[i] ? (f.ice[i] >= pp.P.ICE_MAX ? 1 : 0) : (f.seaIce ? f.seaIce[i] : 0);
      alive[i] = land[i] && pp.loc[i] >= 0 && pp.H.alive[pp.loc[i]] ? 1 : 0;
    }
    // A coarse node's river is the most of the fine cells about it (a river crossing it waters it).
    const T = g6.level > lv ? makeTransfer(g6, g) : null;
    if (T && !T.chain) for (let k = T.nc; k < g6.n; k++) {
      const a = T.par[2 * (k - T.nc)], b = T.par[2 * (k - T.nc) + 1], q = f.discharge[k], l = f.lake[k];
      if (q > Q[a]) Q[a] = q; if (q > Q[b]) Q[b] = q; if (l > lake[a]) lake[a] = l; if (l > lake[b]) lake[b] = l;
    }
    // Directed costs on both layers.
    const cS = this.cS = new Float32Array(m), cI = this.cI = new Float32Array(m);
    const h = [0, 0, 0], w = new Float64Array(18), cu = [0, 0, 0];
    for (let u = 0; u < n; u++) for (let o = g.nbrOff[u]; o < g.nbrOff[u + 1]; o++) {
      const v = g.nbr[o], km = g.dist[o] * R;
      if (!land[u] && !land[v]) {
        h[0] = g.tan[3 * o]; h[1] = g.tan[3 * o + 1]; h[2] = g.tan[3 * o + 2];
        for (let k = 0; k < 18; k++) w[k] = 0.5 * (f.wind[18 * u + k] + f.wind[18 * v + k]);
        for (let k = 0; k < 3; k++) cu[k] = 0.5 * (f.cur[3 * u + k] + f.cur[3 * v + k]);
        const open = 1 - 0.5 * (ice[u] + ice[v]);
        cS[o] = km * C.C_SEA * C.V_SHIP / sailSpeed(h, w, cu, open, C);
        let wa = 0; for (let p = 0; p < 6; p++) wa += (w[3 * p] * h[0] + w[3 * p + 1] * h[1] + w[3 * p + 2] * h[2]) / 6;
        cI[o] = km * C.C_STEAM * C.V_STEAM / Math.max(0.5 * C.V_STEAM, C.V_STEAM + cu[0] * h[0] + cu[1] * h[1] + cu[2] * h[2] + C.K_STEAM * wa) / Math.max(C.ICE_OPEN, open);
      } else if (land[u] && land[v]) {
        const climb = Math.abs(elev[u] - elev[v]), iced = ice[u] || ice[v] ? C.ICE_LAND : 1;
        let s = km * C.C_LAND * (1 + climb / C.H_CLIMB), r = km * C.C_RAIL * (1 + climb / C.H_RAIL);
        if (Q[u] > C.Q_NAV && Q[v] > C.Q_NAV) { s = Math.min(s, km * (Q[v] >= Q[u] ? C.C_DOWN : C.C_UP)); r = Math.min(r, km * C.C_BARGE); }
        if (lake[u] > C.LAKE_NAV && lake[v] > C.LAKE_NAV) { s = Math.min(s, km * C.C_DOWN); r = Math.min(r, km * C.C_BARGE); }
        cS[o] = s * iced; cI[o] = r * iced;
      } else {   // a port: the coast's half of the edge at sea
        const iced = ice[land[u] ? u : v] ? C.ICE_LAND : 1;
        cS[o] = (C.C_PORT + 0.5 * km * C.C_SEA) * iced; cI[o] = (C.C_PORT_IND + 0.5 * km * C.C_STEAM) * iced;
      }
    }
    // Twelve directions: each node's ring and the six nodes between it and the second ring (the far
    // corner of each rhombus u–a–v–b), each at the cheaper of its two two-step paths scaled to the
    // straight length. On the ring's six alone, the shortest paths ran one straight leg and turned
    // once (a hexagonal grid's metric is ~15% long off its axes), and flows sharing a first leg and
    // parting at the turn drew triangles.
    const G = this.G = twelve(g), m2 = G.nbrOff[n];
    const eS = this.eS = new Float32Array(m2), eI = this.eI = new Float32Array(m2), eL = new Float32Array(m2);
    const edge = (u, v) => { for (let o = g.nbrOff[u]; o < g.nbrOff[u + 1]; o++) if (g.nbr[o] === v) return o; return -1; };
    for (let u = 0; u < n; u++) for (let o = G.nbrOff[u]; o < G.nbrOff[u + 1]; o++) {
      const v = G.nbr[o], d = edge(u, v);
      if (d >= 0) { eS[o] = cS[d]; eI[o] = cI[d]; eL[o] = land[u] && land[v] ? cS[d] : 0; continue; }
      const kmUV = R * Math.acos(Math.min(1, g.pos[3 * u] * g.pos[3 * v] + g.pos[3 * u + 1] * g.pos[3 * v + 1] + g.pos[3 * u + 2] * g.pos[3 * v + 2]));
      let bs = Infinity, bi = Infinity, bl = 0;
      for (const a of G.via[o]) {
        const o1 = edge(u, a), o2 = edge(a, v), r = kmUV / (g.dist[o1] * R + g.dist[o2] * R);
        const s1 = (cS[o1] + cS[o2]) * r, i1 = (cI[o1] + cI[o2]) * r;
        if (s1 < bs) { bs = s1; bl = ((land[u] && land[a] ? cS[o1] : 0) + (land[a] && land[v] ? cS[o2] : 0)) * r; }
        if (i1 < bi) bi = i1;
      }
      eS[o] = bs; eI[o] = bi; eL[o] = bl;
    }
    // Markets: the grandparent's living land, then any land the sail can't reach from one cheaply.
    const heap = this.heap = new Heap(m2 + n + 1), dist = new Float64Array(n), owner = new Int32Array(n).fill(-1);
    const mk = [];
    for (let i = 0; i < gm.n; i++) if (alive[i]) mk.push(i);
    for (;;) {
      if (!mk.length) { for (let i = 0; i < n; i++) if (alive[i]) { mk.push(i); break; } if (!mk.length) break; }
      dijkstra(G, eS, mk, dist, null, heap, owner);
      let far = -1, fd = C.C_FILL;
      for (let i = 0; i < n; i++) if (alive[i] && dist[i] > fd) { fd = dist[i]; far = i; }
      if (far < 0) break;
      mk.push(far);
    }
    const nm = this.nm = mk.length;
    this.mnode = Int32Array.from(mk);
    this.owner = owner; this.ownCost = Float32Array.from(dist);
    this.mpos = new Float64Array(3 * nm);
    for (let k = 0; k < nm; k++) for (let j = 0; j < 3; j++) this.mpos[3 * k + j] = g.pos[3 * mk[k] + j];
    // Each people's cell to its node (its own vertex, else a parent, land first) and market.
    const nL = pp.nL;
    this.nodeOf = new Int32Array(nL); this.marketOf = new Int32Array(nL);
    for (let c = 0; c < nL; c++) {
      const i = pp.cells[c];
      let node = i;
      if (i >= n) {
        const a = T.par[2 * (i - T.nc)], b = T.par[2 * (i - T.nc) + 1];
        node = alive[a] ? a : alive[b] ? b : land[a] ? a : land[b] ? b : a;
      }
      this.nodeOf[c] = node; this.marketOf[c] = owner[node] >= 0 ? owner[node] : 0;
    }
    // Every market's costs to every other, and its paths, on both layers.
    this.D = { S: new Float32Array(nm * nm), I: new Float32Array(nm * nm) };
    this.pred = { S: new Uint16Array(nm * n), I: new Uint16Array(nm * n) };
    // The sail's part by land each way (what roads and canals cheapen, `trade`).
    const DL = new Float32Array(nm * nm), acc = new Float64Array(n);
    for (const [L, cost] of [['S', eS], ['I', eI]]) {
      const D = this.D[L];
      for (let a = 0; a < nm; a++) {
        const pr = this.pred[L].subarray(a * n, (a + 1) * n);
        dijkstra(G, cost, mk[a], dist, pr, heap, null, null, L === 'S' ? eL : null, acc);
        for (let b = 0; b < nm; b++) { D[a * nm + b] = dist[mk[b]]; if (L === 'S') DL[a * nm + b] = acc[mk[b]]; }
      }
    }
    // The round trips' mean costs, both layers (`cost`), and the sail's share of them by land.
    this.R = { S: new Float32Array(nm * nm), I: new Float32Array(nm * nm) };
    for (const L of ['S', 'I']) { const D = this.D[L], Rm = this.R[L]; for (let a = 0; a < nm; a++) for (let b = 0; b < nm; b++) Rm[a * nm + b] = 0.5 * (D[a * nm + b] + D[b * nm + a]); }
    const LS = this.LS = new Float32Array(nm * nm), DS = this.D.S;
    for (let a = 0; a < nm; a++) for (let b = 0; b < nm; b++) { const t = DS[a * nm + b] + DS[b * nm + a]; LS[a * nm + b] = t > 0 && Number.isFinite(t) ? (DL[a * nm + b] + DL[b * nm + a]) / t : 0; }
    // The weather's correlation between markets.
    const rho = this.rho = new Float32Array(nm * nm), P = this.mpos;
    for (let a = 0; a < nm; a++) for (let b = a; b < nm; b++) {
      const dot = P[3 * a] * P[3 * b] + P[3 * a + 1] * P[3 * b + 1] + P[3 * a + 2] * P[3 * b + 2];
      rho[a * nm + b] = rho[b * nm + a] = Math.exp(-R * Math.acos(Math.max(-1, Math.min(1, dot))) / C.L_CORR);
    }
    this.rhoDraw = Math.exp(-C.D_DRAW / C.L_CORR);   // markets farther apart than D_DRAW have ρ below it
    this.catchments(f);
    this.key = this.keyOf(f);
    this.tTrade = null; this.active = null; this.flows = [];
  }

  /**
   * Each people's cell's catchment (synthesis): the cells nearest it by the local routes on the
   * people's own grid (`People.graph`'s edges: roads at C_LAND × (1 + climb/H_CLIMB), a river both
   * cells ply at C_DOWN or C_UP, a short crossing (up to HOPS sea cells) at two ports and the sea's
   * C_SEA a km), up to M_CATCH cells within C_CATCH; with each one's cost by sail and by steam
   * (rail, barge, steamship). Into this.catch = { off, idx, cS, cI }, the cell itself first at none.
   */
  catchments(f) {
    const C = this.C, pp = this.pp, E = pp.E, H = pp.H, nL = pp.nL, cells = pp.cells, P = pp.P;
    const off = new Int32Array(nL + 1), idx = [], cS = [], cI = [];
    const dist = new Float64Array(nL).fill(Infinity), seen = new Int32Array(nL).fill(-1), heap = new Heap(200 * C.M_CATCH + 64);
    const Q = c => f.discharge[cells[c]];
    // Both layers' edge costs (per directed edge of E).
    const m = E.off[nL], eS = new Float32Array(m), eI = new Float32Array(m);
    for (let c = 0; c < nL; c++) for (let o = E.off[c]; o < E.off[c + 1]; o++) {
      const d = E.nb[o], km = E.km[o];
      if (E.hop[o]) {
        if (E.hop[o] > P.HOPS) { eS[o] = eI[o] = Infinity; continue; }
        eS[o] = 2 * C.C_PORT + km * C.C_SEA; eI[o] = 2 * C.C_PORT_IND + km * C.C_STEAM;
      } else {
        const climb = Math.abs(H.elev[c] - H.elev[d]);
        let s = km * C.C_LAND * (1 + climb / C.H_CLIMB), r = km * C.C_RAIL * (1 + climb / C.H_RAIL);
        if (Q(c) > C.Q_NAV && Q(d) > C.Q_NAV) { s = Math.min(s, km * (Q(d) >= Q(c) ? C.C_DOWN : C.C_UP)); r = Math.min(r, km * C.C_BARGE); }
        eS[o] = s; eI[o] = r;
      }
    }
    const dI = new Float64Array(nL);
    for (let a = 0; a < nL; a++) {
      heap.n = 0; dist[a] = 0; dI[a] = 0; seen[a] = a; heap.push(0, a);
      const got = [];
      while (heap.n && got.length < C.M_CATCH) {
        const u = heap.pop(), d = heap.top;
        if (d > dist[u] || d > C.C_CATCH) continue;
        if (got.includes(u)) continue;
        got.push(u);
        for (let o = E.off[u]; o < E.off[u + 1]; o++) {
          const v = E.nb[o], nd = d + eS[o];
          if (seen[v] !== a) { seen[v] = a; dist[v] = Infinity; }
          if (nd < dist[v]) { dist[v] = nd; dI[v] = dI[u] + eI[o]; heap.push(nd, v); }
        }
      }
      for (const v of got) { idx.push(v); cS.push(dist[v]); cI.push(dI[v]); }
      off[a + 1] = idx.length;
      for (const v of got) seen[v] = -1;
      seen[a] = -1;
    }
    this.catch = { off, idx: Int32Array.from(idx), cS: Float32Array.from(cS), cI: Float32Array.from(cI) };
  }

  /** What the graph depends on: which coarse cells are land and living (a sea's rise, an ice sheet). */
  keyOf(f) {
    const pp = this.pp, n = this.g ? this.g.n : buildGrid(Math.max(2, pp.planet.grid.level - 1)).n;
    let h = 0;
    for (let i = 0; i < n; i++) { const a = f.elev[i] > 0 ? (f.ice[i] >= pp.P.ICE_MAX ? 2 : 1) : 0; h = (Math.imul(h, 31) + a + i) | 0; }
    return h;
  }

  /**
   * The round trip's mean cost between markets a and b on a layer ('S' sail, 'I' steam); the sail's
   * part by land cheapened by the pair's roads and canals (`trade` sets them).
   */
  cost(a, b, L = 'S') {
    const o = a * this.nm + b, x = this.R[L][o];
    if (L !== 'S' || !this.mWr) return x;
    const C = this.C, g = 1 / (1 + C.R_ROAD * 0.5 * (this.mWr[a] + this.mWr[b]) + C.K_CANAL * 0.5 * (this.mWc[a] + this.mWc[b]));
    return x * (1 - this.LS[o] * (1 - g));
  }

  /** The nodes from market a's node to node `to` along a layer's path, `to` first. */
  path(a, to, L = 'S') {
    const n = this.g.n, pr = this.pred[L], out = [to];
    let v = to;
    for (let k = 0; k < n && v !== this.mnode[a]; k++) { v = pr[a * n + v]; if (v === 65535) return null; out.push(v); }
    return out;
  }

  /**
   * The trade's kernel among the active markets (every DT_TRADE years): per market its food, people,
   * knowledge and industry from the people's cells; the supply basket's weights `w` (dense, rows the
   * buyers), its variance V and covariance C with the buyer's own harvest (`pool`), the K_PART
   * markets each meets most (contact ∝ kernel × people) with their knowledge and their crops, and the
   * flows for drawing.
   */
  trade(force = false) {
    const C = this.C, pp = this.pp, nm = this.nm, nL = pp.nL;
    if (!force && this.tTrade !== null && pp.t - this.tTrade < C.DT_TRADE) return;
    this.tTrade = pp.t;
    const F = this.mF || (this.mF = new Float64Array(nm)), N = this.mN || (this.mN = new Float64Array(nm)), Z = this.mZ || (this.mZ = new Float64Array(nm)), ZL = this.mZL || (this.mZL = new Float64Array(nm));
    const S = this.mS || (this.mS = new Float64Array(nm)), Fd = this.mFd || (this.mFd = new Float64Array(nm)), A = this.mA || (this.mA = new Float64Array(nm));
    F.fill(0); N.fill(0); Z.fill(0); ZL.fill(0); S.fill(0); Fd.fill(0); A.fill(0);
    const zc = pp.zc, zl = pp.zl, Ntot = pp.Ntot, mo = this.marketOf;
    // Each market's crops: the package on most of its fields.
    const pk = this.mPkg || (this.mPkg = new Int32Array(nm)), byPkg = new Map();
    for (let c = 0; c < nL; c++) {
      const k = mo[c], n = Ntot[c];
      A[k] += pp.H.area[c];
      if (!(n > 0)) continue;
      N[k] += n; Z[k] += n * (zc ? zc[c] : 0); ZL[k] += n * (zl ? zl[c] : 0); S[k] += n * pp.ind[c];
      if (pp.f[c] > 0) {
        F[k] += pp.Out[c] - pp.goods[c];
        const a = pp.f[c] * pp.H.area[c]; Fd[k] += a;
        if (pp.pkg[c] >= 0) { const key = k * 4096 + pp.pkg[c]; byPkg.set(key, (byPkg.get(key) || 0) + a); }
      }
    }
    // Each market's roads (their built share) and canals (the land they water), by area.
    const Wr = this.mWr || (this.mWr = new Float64Array(nm)), Wc = this.mWc || (this.mWc = new Float64Array(nm));
    Wr.fill(0); Wc.fill(0);
    if (pp.wk) for (let c = 0; c < nL; c++) {
      const k = mo[c], a = pp.H.area[c];
      if (pp.wk.R[c] > 0) Wr[k] += a * pp.built(c, 'R');
      if (pp.wk.C[c] > 0) Wc[k] += a * pp.H.irrPot[c] * pp.built(c, 'C');
    }
    for (let k = 0; k < nm; k++) if (A[k] > 0) { Wr[k] /= A[k]; Wc[k] /= A[k]; }
    pk.fill(-1);
    const best = new Float64Array(nm);
    for (const [key, a] of byPkg) { const k = Math.floor(key / 4096); if (a > best[k]) { best[k] = a; pk[k] = key % 4096; } }
    const act = [];
    for (let k = 0; k < nm; k++) { if (N[k] > 0) { Z[k] /= N[k]; ZL[k] /= N[k]; S[k] /= N[k]; } if (F[k] > 0) act.push(k); }
    this.active = act;
    const na = act.length;
    const V = this.V || (this.V = new Float64Array(nm)), Cv = this.Cv || (this.Cv = new Float64Array(nm));
    V.fill(1); Cv.fill(1);
    const W = this.W || (this.W = new Float32Array(nm * nm));
    this.flows = [];
    if (!na) return;
    const reach = act.map(k => this.reach(Z[k]));
    const part = this.part || (this.part = { k: new Int32Array(nm * C.K_PART).fill(-1), w: new Float32Array(nm * C.K_PART) });
    part.k.fill(-1); part.w.fill(0);
    // The kernel, symmetric, once a pair.
    const KM = this.KM && this.KM.length >= na * na ? this.KM : (this.KM = new Float32Array(na * na)), RS = this.R.S, RI = this.R.I, LS = this.LS;
    for (let x = 0; x < na; x++) {
      const i = act[x], ri = reach[x], si = S[i], wri = Wr[i], wci = Wc[i];
      KM[x * na + x] = 1;
      for (let y = x + 1; y < na; y++) {
        const j = act[y], r = ri > reach[y] ? ri : reach[y], s = si > S[j] ? si : S[j], o = i * nm + j;
        const gw = 1 / (1 + C.R_ROAD * 0.5 * (wri + Wr[j]) + C.K_CANAL * 0.5 * (wci + Wc[j])), cs = RS[o] * (1 - LS[o] * (1 - gw));
        const k = !(r > 0) ? 0 : s < 1e-6 ? Math.exp(-cs / r) : s > 1 - 1e-6 ? Math.exp(-RI[o] / r) : (1 - s) * Math.exp(-cs / r) + s * Math.exp(-RI[o] / r);
        KM[x * na + y] = KM[y * na + x] = k;
      }
    }
    // The largest N_FLOW flows, kept in a min-heap (q, i, j) as they come.
    const nf = C.N_FLOW, fq = new Float64Array(nf), fi = new Int32Array(nf), fj = new Int32Array(nf);
    let fn = 0;
    const keep = (q, i, j) => {
      if (fn < nf) { let k = fn++; while (k > 0) { const p = (k - 1) >> 1; if (fq[p] <= q) break; fq[k] = fq[p]; fi[k] = fi[p]; fj[k] = fj[p]; k = p; } fq[k] = q; fi[k] = i; fj[k] = j; return; }
      if (q <= fq[0]) return;
      let k = 0;
      for (;;) { let c = 2 * k + 1; if (c >= nf) break; if (c + 1 < nf && fq[c + 1] < fq[c]) c++; if (fq[c] >= q) break; fq[k] = fq[c]; fi[k] = fi[c]; fj[k] = fj[c]; k = c; }
      fq[k] = q; fi[k] = i; fj[k] = j;
    };
    for (let x = 0; x < na; x++) {
      const i = act[x], kern = KM.subarray(x * na, (x + 1) * na);
      let sF = 0, sN = 0;
      for (let y = 0; y < na; y++) { const j = act[y]; sF += kern[y] * F[j]; sN += kern[y] * N[j]; }
      let v2 = 0, cw = 0;
      const row = i * nm;
      for (let y = 0; y < na; y++) {
        const j = act[y], wj = sF > 0 ? kern[y] * F[j] / sF : (j === i ? 1 : 0), r = this.rho[row + j];
        W[row + j] = wj; v2 += wj * wj * (1 - r * r); cw += wj * r;
        if (j !== i && wj > 1e-4 && r < this.rhoDraw) keep((C.TAU_AG + (C.TAU_IND - C.TAU_AG) * S[i]) * wj * F[i], i, j);
      }
      V[i] = v2 + cw * cw; Cv[i] = cw;
      // The markets met most by trade, for knowledge and crops: each by its kernel × N/(N + N_MEET),
      // as much as a neighbour at most (an isolated market's few dear routes meet it little: shared
      // out among its partners, they had carried Eurasia's ideas to the Americas by the Aleutians).
      const o = i * C.K_PART;
      for (let y = 0; y < na; y++) {
        const j = act[y];
        if (j === i) continue;
        const cj = kern[y] * N[j] / (N[j] + C.N_MEET);
        if (!(cj > 1e-5)) continue;
        if (cj <= part.w[o + C.K_PART - 1]) continue;
        let q = C.K_PART - 1;
        while (q > 0 && part.w[o + q - 1] < cj) { part.w[o + q] = part.w[o + q - 1]; part.k[o + q] = part.k[o + q - 1]; q--; }
        part.w[o + q] = cj; part.k[o + q] = j;
      }
    }
    this.flows = Array.from({ length: fn }, (_, k) => [fi[k], fj[k], fq[k]]).sort((a, b) => b[2] - a[2]);
  }

  /** A domain's knowledge to copy from market k's trade partners against z (their means Z: production's mZ, learning's mZL): Σ contact × the gap where they know more, over at least all of it. */
  gap(k, z, Z = this.mZ) {
    const K = this.C.K_PART, pk = this.part.k, pw = this.part.w;
    let g = 0, w = 0;
    for (let q = 0; q < K; q++) { const j = pk[k * K + q]; if (j < 0) break; w += pw[k * K + q]; if (Z[j] > z) g += pw[k * K + q] * (Z[j] - z); }
    return w > 1 ? g / w : g;
  }

  /** The trade's reach (sea-km) at knowledge z. */
  reach(z) { const C = this.C, x = C.R_T0 * Math.exp(Math.min(60, (z - this.pp.P.Z_FARM) / C.Z_RT)); return x / (1 + x / C.R_TMAX); }

  /** The share of cell c's food that goes through markets. */
  tau(c) { const pp = this.pp; return pp.f[c] > 0 ? this.C.TAU_AG + (this.C.TAU_IND - this.C.TAU_AG) * pp.ind[c] : 0; }

  /**
   * The harvest's pooling at cell c: its spread's divisor 1/√((1 − τ)² + 2τ(1 − τ) C + τ² V), and τ
   * (1 and 0 where its market doesn't trade).
   */
  pool(c, out = this.po || (this.po = { pool: 1, tau: 0, k: -1 })) {
    const k = this.marketOf[c], tau = this.active && this.active.length && this.mF[k] > 0 ? this.tau(c) : 0;
    out.k = k; out.tau = tau;
    out.pool = tau > 0 ? 1 / Math.sqrt(Math.max(1e-6, (1 - tau) ** 2 + 2 * tau * (1 - tau) * this.Cv[k] + tau * tau * this.V[k])) : 1;
    return out;
  }

  /**
   * The routes' flux for drawing: each of the largest flows (food from the seller j to the buyer i:
   * the trade's, and the far cities' food, People.foodshed's `feedFlows`) walked along j's path to i
   * on the layer it sails, summed on the coarse edges. Returns
   * { a, b (nodes), q (flux, people's food a year) } for every edge that carries any.
   */
  flux() {
    const nm = this.nm, S = this.mS, edge = new Map();
    for (const [i, j, q] of this.feedFlows ? this.flows.concat(this.feedFlows) : this.flows) {
      const L = Math.max(S[i], S[j]) > 0.5 ? 'I' : 'S', p = this.path(j, this.mnode[i], L);
      if (!p) continue;
      for (let k = 0; k + 1 < p.length; k++) {
        const u = p[k + 1], v = p[k], key = u < v ? u * 65536 + v : v * 65536 + u;
        edge.set(key, (edge.get(key) || 0) + q);
      }
    }
    const a = new Int32Array(edge.size), b = new Int32Array(edge.size), q = new Float32Array(edge.size);
    let k = 0;
    for (const [key, v] of edge) { a[k] = Math.floor(key / 65536); b[k] = key % 65536; q[k] = v; k++; }
    return { a, b, q, nm };
  }

  /**
   * The routes for drawing (drawn only): the edges carrying at least `rel` of the most flux, their
   * network relaxed toward each node's neighbours (branches too, only its ends held), traced into
   * lines through the nodes where they don't branch, each relaxed again (the grid's zigzag along a
   * coast) and corner-cut on the sphere, its ends held (so lines meeting at a node share it). Returns { P (Float32 3 a point), W (each point's flux: the
   * segment's ending there), sea (1 where the segment ending there is at sea), off (each line's
   * first point; the last is P's length) }.
   */
  lines(rel = 0.01, cuts = 2, relax = 6, net = 8) {
    const { a, b, q } = this.flux(), g = this.g, land = this.land, n = g.n;
    let qm = 0;
    for (let k = 0; k < q.length; k++) qm = Math.max(qm, q[k]);
    const adj = new Map(), qmin = rel * qm;
    const add = (u, v, w) => { if (!adj.has(u)) adj.set(u, []); adj.get(u).push([v, w]); };
    for (let k = 0; k < q.length; k++) if (q[k] >= qmin && q[k] > 0) { add(a[k], b[k], q[k]); add(b[k], a[k], q[k]); }
    const used = new Set(), key = (u, v) => (u < v ? u * n + v : v * n + u), chains = [];
    const walk = (u, v, w) => {
      const nodes = [u, v], ws = [w];
      used.add(key(u, v));
      for (let prev = u, cur = v; ;) {
        const e = adj.get(cur);
        if (!e || e.length !== 2) break;
        const nx = e[0][0] === prev ? e[1] : e[0];
        if (used.has(key(cur, nx[0]))) break;
        used.add(key(cur, nx[0])); nodes.push(nx[0]); ws.push(nx[1]); prev = cur; cur = nx[0];
      }
      chains.push([nodes, ws]);
    };
    for (const [u, e] of adj) if (e.length !== 2) for (const [v, w] of e) if (!used.has(key(u, v))) walk(u, v, w);
    for (const [u, e] of adj) for (const [v, w] of e) if (!used.has(key(u, v))) walk(u, v, w);
    // The whole network relaxed first, its branches too (only its ends held): each node halfway to its
    // neighbours' mean, `net` times. Held at the branches, the lines met there in sharp Vs (a coastal
    // route's dip to the grid's sea node and back) and the network kept the grid's angles.
    const pos = new Map();
    for (const u of adj.keys()) pos.set(u, [g.pos[3 * u], g.pos[3 * u + 1], g.pos[3 * u + 2]]);
    for (let it = 0; it < net; it++) {
      const np = new Map();
      for (const [u, e] of adj) {
        const p = pos.get(u);
        if (e.length < 2) { np.set(u, p); continue; }
        let x = 0, y = 0, z = 0;
        for (const [v] of e) { const q = pos.get(v); x += q[0]; y += q[1]; z += q[2]; }
        x = 0.5 * p[0] + 0.5 * x / e.length; y = 0.5 * p[1] + 0.5 * y / e.length; z = 0.5 * p[2] + 0.5 * z / e.length;
        const r = Math.hypot(x, y, z);
        np.set(u, [x / r, y / r, z / r]);
      }
      for (const [u, p] of np) pos.set(u, p);
    }
    const P = [], W = [], S = [], off = [];
    for (const [nodes, ws] of chains) {
      let pts = nodes.map(i => pos.get(i).slice()), wt = [ws[0], ...ws], sea = [0, ...nodes.slice(1).map((v, k) => (!land[v] && !land[nodes[k]] ? 1 : 0))];
      sea[0] = sea[1] || 0;
      for (let it = 0; it < relax && pts.length > 2; it++) {
        const np = pts.map(p => p.slice());
        for (let k = 1; k + 1 < pts.length; k++) {
          const a = pts[k - 1], b = pts[k], c = pts[k + 1], x = 0.5 * b[0] + 0.25 * (a[0] + c[0]), y = 0.5 * b[1] + 0.25 * (a[1] + c[1]), z = 0.5 * b[2] + 0.25 * (a[2] + c[2]), r = Math.hypot(x, y, z);
          np[k] = [x / r, y / r, z / r];
        }
        pts = np;
      }
      for (let it = 0; it < cuts && pts.length > 2; it++) {
        const np = [pts[0]], nw = [wt[0]], ns = [sea[0]];
        for (let k = 0; k + 1 < pts.length; k++) {
          const p0 = pts[k], p1 = pts[k + 1], m = (t) => { const x = p0[0] + t * (p1[0] - p0[0]), y = p0[1] + t * (p1[1] - p0[1]), z = p0[2] + t * (p1[2] - p0[2]), r = Math.hypot(x, y, z); return [x / r, y / r, z / r]; };
          if (k > 0) { np.push(m(0.25)); nw.push(wt[k + 1]); ns.push(sea[k + 1]); }
          if (k + 2 < pts.length) { np.push(m(0.75)); nw.push(wt[k + 1]); ns.push(sea[k + 1]); }
        }
        np.push(pts[pts.length - 1]); nw.push(wt[wt.length - 1]); ns.push(sea[sea.length - 1]);
        pts = np; wt = nw; sea = ns;
      }
      off.push(P.length / 3);
      for (let k = 0; k < pts.length; k++) { P.push(...pts[k]); W.push(wt[k]); S.push(sea[k]); }
    }
    return { P: Float32Array.from(P), W: Float32Array.from(W), sea: Uint8Array.from(S), off: Int32Array.from(off), max: qm };
  }
}
