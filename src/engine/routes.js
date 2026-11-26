// The routes: one transport cost for every flow between the people's cells (docs/MODEL.md,
// seam rule 2). Food, crops and knowledge run on them now; batch
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
//            year (sea ice closes it); by land, a road's C_LAND a km × (1 + climb/H_CLIMB) ÷ (1 +
//            R_ROAD × the roads built at its ends + K_CANAL × the land their canals water: routes follow
//            works, batch 3f), a river boats ply (both ends past Q_NAV) at C_DOWN downstream, C_UP up, a
//            lake's C_DOWN; a port (land to sea) C_PORT. Sea : river : road ≈ 1 : 5 : 30 is the pre-industrial ratio
//            (Diocletian's price edict of 301 as historians read it, from memory); the ship's
//            polar and the port's cost are synthesis. Each leg sails when its wind serves, so where
//            the wind reverses (a monsoon) both ways cost about twice a fair run, and where it
//            doesn't (the trades) the way back is the long way round (the westerlies): the routes
//            out and home differ, as the volta do mar's. Two sail layers: the coasting craft's
//            (`S`), on which an open-ocean leg (a sea edge whose ends lie past D_COAST from land, soft
//            over W_COAST) costs (1 + K_OPEN)-fold, its stores and its risk (a road's: synthesis), and
//            the ocean-going ship's (`O`), as the sail is. Navigation (People.nav, the voyages' own
//            logistic past Z_OCEAN) mixes them, so the long-parted worlds stay parted until ships come.
//   steam    industry's: steamships at C_STEAM a km at V_STEAM, the current along the edge and
//            K_STEAM of the wind's adding to it (so the lanes gather where the sea helps, as
//            shipping's do, rather than scattering over equal paths), rail at C_RAIL ×
//            (1 + climb/H_RAIL) only as far as railways were built at the edge's ends (People.railShare;
//            the rest as by sail), barges at C_BARGE, ports at C_PORT_IND.
// Reread with the world (`reprice`, at most every People's T_ROUTES, T_ROUTES_IND with industry): every
// edge re-costed from the winds, currents, sea ice, rivers and works as they are, each layer solved again
// where TOL_ROUTES of its edges have moved by TOL_EDGE in log, the markets kept unless the land moved.
// Markets are the grandparent grid's land cells (~450 km apart: level 4), with any land the
// sail can't reach from one within C_FILL given its own. Each node belongs to the market nearest it
// by the sail (`owner`); each people's cell to its node. From every market, Dijkstra on each layer
// gives the cost to every other (directed: `D`, and the paths: `pred`).
//
// Trade (`trade`, synthesis on the gravity model of trade, standard: Tinbergen 1962, from memory):
// between active markets (those with fields: trade comes with farming), a kernel e^{−c/reach},
// c the round trip's mean ((out + home)/2) on the layer the pair sails (the coasting's and the
// ocean's kernels mixed by the more advanced end's navigation ν, steam by the more industrial end's
// share), reach rising with the more advanced end's knowledge (`reach`), and eased by a
// common language (the markets' towns' learned identities, src/engine/peoples.js `tradeW`) and cut by
// a border between their states (src/engine/polities.js `border`).
// Each market buys from the others in proportion to kernel × their food (its supply basket, w):
// a cell's harvest is then (1 − τ) its own and τ the basket's, τ the share of food that goes
// through markets (TAU_AG with fields, toward TAU_IND with industry). The harvest's spread pools as
// a one-factor model of the weather's correlation ρ = e^{−d/L_CORR} (each market's anomaly its
// correlation with the buyer's, plus its own): the basket's variance Σ w²(1 − ρ²) + (Σ w ρ)², its
// covariance with the cell's own Σ w ρ (synthesis). Knowledge and crops are copied from the K_PART markets
// met most by trade (contact the kernel × N/(N + N_MEET), at most a whole one), pathogens carried from the K_PATH
// met most (`ppart`), and the long-distance flows (τ × food × w,
// between markets over D_DRAW apart) are drawn along the routes as lines as heavy as their flux.
import { buildGrid } from '../grid/icosphere.js';
import { makeTransfer } from '../grid/transfer.js';
import { shared, toShared } from './shared.js';
import { parallelSync } from './pool.js';

const R = 6371;
const OPEN_X = 1.5;   // a pair joined only across the open ocean: the coasting way this much dearer (`oceanic`, the counts)

export const ROUTES = {
  C_SEA: 1, C_DOWN: 5, C_UP: 10, C_LAND: 30, C_PORT: 100,   // sea-km a km by sea, a river down and up, a road; a port's handling (the cost of ~100 km at sea)
  H_CLIMB: 0.5, ICE_LAND: 20,      // km of climb between nodes that doubles a road's cost (passes, synthesis); over an ice sheet ×
  Q_NAV: 300, LAKE_NAV: 0.3,       // m³/s: a river boats ply (at the people's scale); a lake's share that carries boats
  V_SHIP: 2.5, W_REF: 7, W_HALF: 4, G_UP: 0.15, V_ROW: 0.3, ICE_OPEN: 0.05,   // m/s: a merchant sailing ship's speed before a fair wind of W_REF (~5 knots, from memory), the wind's speed that halves it, a beat's share close-hauled, an oar's or a drift's; the least open share of a sea under ice
  C_STEAM: 0.3, C_RAIL: 3, H_RAIL: 1, C_BARGE: 1.5, C_PORT_IND: 30, V_STEAM: 6, K_STEAM: 0.05,   // industry's: steamship, rail (×(1 + climb/H_RAIL)), barge, port (sea-km a km; a ton-km by steam a third of sail's, by rail a tenth of the wagon's: from memory)
  D_COAST: 350, W_COAST: 50, K_OPEN: 30,   // km from land past which a sea leg is the open ocean, its softness; such a leg's cost to coasting craft, (1 + K_OPEN)-fold (a road's: its stores, its risk; the Atlantic's ~3,000 km crossing ~10⁵ sea-km before navigation, the Mediterranean's and the monsoon coasts' within reach: synthesis)
  NU_MIN: 1e-4,                    // navigation below which the ocean's layer isn't read
  V_COAST: 1,                      // m/s: coasting craft's mean over a voyage, its nights ashore and its seasons' waits counted (the journey's time, for the pathogens' travellers: src/engine/pathogens.js; synthesis)
  C_FILL: 3000,                    // land whose nearest market costs more is given its own
  R_ROAD: 1, K_CANAL: 5,           // the land's works on each edge by land (batch 3f: routes follow works): its cost ÷ (1 + R_ROAD × its ends' roads + K_CANAL × the land their canals water), roads at their full room halving it, canals over a fifth of the land halving it, the boats going where the water does (the Grand Canal's, Mesopotamia's; synthesis); railways carry steam's share of it by their built share
  TOL_EDGE: 0.1, TOL_ROUTES: 1e-3, // a layer is solved again once this share of its edges have moved this far in log since it was (`reprice`: ~120 edges at level 5, a region of ~10 nodes; a share of a percent waited on a continent's railways)
  R_T0: 300, Z_RT: 1.1, R_TMAX: 1e5,   // the trade's reach (sea-km of cost that cuts it e-fold): R_T0 at farming's knowledge, ×e per Z_RT of knowledge past it (grain by sea from Egypt to Rome, ~3,000 sea-km, at ~0.3 of the local market's weight by Rome's; the Atlantic's ~10,000 at ~0.1 by 1600; synthesis), at most R_TMAX
  TAU_AG: 0.15, TAU_IND: 0.9,      // the share of a farming people's food that goes through markets (rents, taxes, the towns' food), and an industrial people's
  L_CORR: 1500,                    // km: the weather's correlation length (a year's harvest anomalies, ρ = e^{−d/L_CORR}; rough, from memory)
  DT_TRADE: 10,                    // years between the trade's kernels (the masses move slowly)
  K_PART: 12, N_MEET: 1e5,         // the markets met by trade each keeps for copying knowledge and crops; the people a market needs to be met at half its kernel (a town's)
  K_PATH: 48,                      // … and for the travellers carrying pathogens (src/engine/pathogens.js), more: a populous region's markets fill a dozen with their own, and a dozen had parted Australia from Asia's diseases
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
 * Markets [a, b)'s Dijkstras on a layer's edge costs (Routes.layer, and the pool's kernel): each one's
 * paths into its row of pred (n each) and its costs to every market into its row of D (nm each).
 */
export function layerCells(x, a, b) {
  const { off, nbr, cost, mk, D, pred, n, nm } = x, g = { nbrOff: off, nbr }, dist = new Float64Array(n), heap = new Heap(off[n] + n + 1);
  for (let s = a; s < b; s++) {
    dijkstra(g, cost, mk[s], dist, pred.subarray(s * n, (s + 1) * n), heap);
    for (let t = 0; t < nm; t++) D[s * nm + t] = dist[mk[t]];
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

/** o[key] as a typed array T of n, made anew where it isn't that long (the markets' count changes with a rebuild). */
export function sized(o, key, T, n) { const a = o[key]; return a && a.length === n ? a : (o[key] = new T(n)); }

export class Routes {
  /** For a People (its grid, land cells and fields `f`, the people's grid's arrays), with ROUTES overrides. */
  constructor(people, f, params = {}) {
    // ROUTES' keys may come with the people's overrides (the tools pass one object).
    const own = Object.fromEntries(Object.keys(ROUTES).filter(k => people.P[k] !== undefined).map(k => [k, people.P[k]]));
    this.C = { ...ROUTES, ...own, ...params };
    this.pp = people;
    this.build(f);
  }

  /**
   * The whole graph anew (the first time, and when the land under it has changed, `keyOf`): its nodes,
   * the markets on them, then the costs and the paths (`price`, `solve`).
   */
  build(f) {
    const C = this.C, pp = this.pp, g6 = pp.planet.grid, lv = Math.max(2, g6.level - 1);
    const g = this.g = buildGrid(lv), n = g.n, gm = buildGrid(Math.max(1, lv - 1));
    // Nodes: each coarse cell is the fine vertex of the same index (the grids nest).
    const land = this.land = new Uint8Array(n), alive = new Uint8Array(n), sheet = this.sheet = new Uint8Array(n), elev = this.elev = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      land[i] = f.elev[i] > 0 ? 1 : 0; elev[i] = Math.max(0, f.elev[i]); sheet[i] = land[i] && f.ice[i] >= pp.P.ICE_MAX ? 1 : 0;
      alive[i] = land[i] && pp.loc[i] >= 0 && pp.H.alive[pp.loc[i]] ? 1 : 0;
    }
    const T = this.T = g6.level > lv ? makeTransfer(g6, g) : null;
    this.G = twelve(g); this.G.nbrOff = toShared(this.G.nbrOff); this.G.nbr = toShared(this.G.nbr);
    // Each sea node's distance to land (km, along the ring's edges), for the open ocean's legs.
    {
      const km = new Float64Array(g.nbrOff[n]), lands = [];
      for (let o = 0; o < km.length; o++) km[o] = g.dist[o] * R;
      for (let i = 0; i < n; i++) if (land[i]) lands.push(i);
      const dL = this.dLand = new Float64Array(n);
      if (lands.length) dijkstra(g, km, lands, dL, null, new Heap(g.nbrOff[n] + n + 1)); else dL.fill(Infinity);
    }
    // Each people's cell to its node (its own vertex, else a parent, land first).
    const nL = pp.nL;
    this.nodeOf = new Int32Array(nL);
    for (let c = 0; c < nL; c++) {
      const i = pp.cells[c];
      let node = i;
      if (i >= n) {
        const a = T.par[2 * (i - T.nc)], b = T.par[2 * (i - T.nc) + 1];
        node = alive[a] ? a : alive[b] ? b : land[a] ? a : land[b] ? b : a;
      }
      this.nodeOf[c] = node;
    }
    this.price(f);
    // Markets: the grandparent's living land, then any land the sail can't reach from one cheaply.
    const m2 = this.G.nbrOff[n], heap = this.heap = new Heap(m2 + n + 1), dist = new Float64Array(n), owner = new Int32Array(n).fill(-1);
    const mk = [];
    for (let i = 0; i < gm.n; i++) if (alive[i]) mk.push(i);
    for (;;) {
      if (!mk.length) { for (let i = 0; i < n; i++) if (alive[i]) { mk.push(i); break; } if (!mk.length) break; }
      dijkstra(this.G, this.eS, mk, dist, null, heap, owner);
      let far = -1, fd = C.C_FILL;
      for (let i = 0; i < n; i++) if (alive[i] && dist[i] > fd) { fd = dist[i]; far = i; }
      if (far < 0) break;
      mk.push(far);
    }
    const nm = this.nm = mk.length;
    this.mnode = toShared(Int32Array.from(mk));
    this.owner = owner; this.ownCost = Float32Array.from(dist);
    this.mpos = new Float64Array(3 * nm);
    for (let k = 0; k < nm; k++) for (let j = 0; j < 3; j++) this.mpos[3 * k + j] = g.pos[3 * mk[k] + j];
    this.marketOf = new Int32Array(nL);
    for (let c = 0; c < nL; c++) { const o = owner[this.nodeOf[c]]; this.marketOf[c] = o >= 0 ? o : 0; }
    // The weather's correlation between markets.
    const rho = this.rho = new Float32Array(nm * nm), P = this.mpos;
    for (let a = 0; a < nm; a++) for (let b = a; b < nm; b++) {
      const dot = P[3 * a] * P[3 * b] + P[3 * a + 1] * P[3 * b + 1] + P[3 * a + 2] * P[3 * b + 2];
      rho[a * nm + b] = rho[b * nm + a] = Math.exp(-R * Math.acos(Math.max(-1, Math.min(1, dot))) / C.L_CORR);
    }
    this.rhoDraw = Math.exp(-C.D_DRAW / C.L_CORR);   // markets farther apart than D_DRAW have ρ below it
    // Every market's costs to every other (D), its paths (pred) and the round trips' mean costs (R, `cost`),
    // by the coasting sail now, and by the ocean's sail and by steam when first read (D.O, D.I and their
    // pred, R: read only where navigation or industry is, so the early world's rebuilds run a third of the
    // Dijkstras, ~1 s of 3.4 at level 6, and hold a third of the paths).
    this.D = {}; this.pred = {}; this.R = {}; this.st = null; this.oc = null;
    for (const k of ['D', 'pred', 'R']) {
      Object.defineProperty(this[k], 'I', { get: () => this.steam()[k], enumerable: true, configurable: true });
      Object.defineProperty(this[k], 'O', { get: () => this.ocean()[k], enumerable: true, configurable: true });
    }
    this.solve('S');
    this.catchments(f);
    this.key = this.keyOf(f);
    this.tTrade = null; this.active = null; this.flows = [];
  }

  /**
   * Each node's works (`People.wk`, `People.wi`), its people's cells' by area: the roads' built share, the
   * canals' (the land they water) and the railways'. Zero before anyone builds.
   */
  nodeWorks() {
    const pp = this.pp, n = this.g.n, nL = pp.nL, A = pp.H.area;
    const rd = this.nRd = sized(this, 'nRd', Float32Array, n), cn = this.nCn = sized(this, 'nCn', Float32Array, n), rl = this.nRl = sized(this, 'nRl', Float32Array, n), a = new Float64Array(n);
    rd.fill(0); cn.fill(0); rl.fill(0);
    if (!pp.wk) return;
    for (let c = 0; c < nL; c++) {
      const u = this.nodeOf[c], w = A[c];
      a[u] += w; rd[u] += w * pp.built(c, 'R'); cn[u] += w * pp.H.irrQ[c] * pp.built(c, 'C'); rl[u] += w * pp.railShare(c);
    }
    for (let u = 0; u < n; u++) if (a[u] > 0) { rd[u] /= a[u]; cn[u] /= a[u]; rl[u] /= a[u]; }
  }

  /**
   * One land edge's costs, sail's and steam's, km long, climbing `climb` km, between ends with roads r,
   * canals' share c and railways l (each their two ends' mean), boats where both ends ply a river
   * (`river`: 1 downstream, −1 up, 0 none) or a lake: the road's cost ÷ (1 + R_ROAD r + K_CANAL c), and
   * by steam the railways' share l at C_RAIL and the rest as by sail, barges where the boats go.
   */
  landCost(km, climb, r, c, l, river, lake, out) {
    const C = this.C;
    let s = km * C.C_LAND * (1 + climb / C.H_CLIMB) / (1 + C.R_ROAD * r + C.K_CANAL * c);
    if (river) s = Math.min(s, km * (river > 0 ? C.C_DOWN : C.C_UP));
    if (lake) s = Math.min(s, km * C.C_DOWN);
    let i = l * km * C.C_RAIL * (1 + climb / C.H_RAIL) + (1 - l) * s;
    if (river || lake) i = Math.min(i, km * C.C_BARGE);
    out[0] = s; out[1] = i;
    return out;
  }

  /**
   * Every edge's cost on the layers from the planet's fields as they are (the winds, the currents, the
   * sea ice, the rivers and lakes boats ply) and the works people have built (`nodeWorks`): the coasting
   * sail's, the ocean's and the steam's. Into eS, eO, eI.
   */
  price(f) {
    const C = this.C, pp = this.pp, g = this.g, n = g.n, m = g.nbrOff[n], land = this.land, sheet = this.sheet, elev = this.elev, T = this.T;
    const ice = new Float32Array(n), Q = new Float32Array(n), lake = new Float32Array(n);
    for (let i = 0; i < n; i++) { Q[i] = f.discharge[i]; lake[i] = f.lake[i]; ice[i] = land[i] ? sheet[i] : (f.seaIce ? f.seaIce[i] : 0); }
    // A coarse node's river is the most of the fine cells about it (a river crossing it waters it).
    if (T && !T.chain) for (let k = T.nc; k < pp.planet.grid.n; k++) {
      const a = T.par[2 * (k - T.nc)], b = T.par[2 * (k - T.nc) + 1], q = f.discharge[k], l = f.lake[k];
      if (q > Q[a]) Q[a] = q; if (q > Q[b]) Q[b] = q; if (l > lake[a]) lake[a] = l; if (l > lake[b]) lake[b] = l;
    }
    this.nodeWorks();
    const rd = this.nRd, cn = this.nCn, rl = this.nRl;
    // Directed costs on the layers: the ocean-going sail's (cO), the coasting craft's (cS: an open-ocean leg
    // (1 + K_OPEN o)-fold, o its ends' mean distance from land past D_COAST, soft over W_COAST), steam's.
    const cS = new Float32Array(m), cO = new Float32Array(m), cI = new Float32Array(m), dL = this.dLand;
    const h = [0, 0, 0], w = new Float64Array(18), cu = [0, 0, 0], lc = [0, 0];
    for (let u = 0; u < n; u++) for (let o = g.nbrOff[u]; o < g.nbrOff[u + 1]; o++) {
      const v = g.nbr[o], km = g.dist[o] * R;
      if (!land[u] && !land[v]) {
        h[0] = g.tan[3 * o]; h[1] = g.tan[3 * o + 1]; h[2] = g.tan[3 * o + 2];
        for (let k = 0; k < 18; k++) w[k] = 0.5 * (f.wind[18 * u + k] + f.wind[18 * v + k]);
        for (let k = 0; k < 3; k++) cu[k] = 0.5 * (f.cur[3 * u + k] + f.cur[3 * v + k]);
        const open = 1 - 0.5 * (ice[u] + ice[v]);
        cO[o] = km * C.C_SEA * C.V_SHIP / sailSpeed(h, w, cu, open, C);
        cS[o] = cO[o] * (1 + C.K_OPEN / (1 + Math.exp(-(0.5 * (dL[u] + dL[v]) - C.D_COAST) / C.W_COAST)));
        let wa = 0; for (let p = 0; p < 6; p++) wa += (w[3 * p] * h[0] + w[3 * p + 1] * h[1] + w[3 * p + 2] * h[2]) / 6;
        cI[o] = km * C.C_STEAM * C.V_STEAM / Math.max(0.5 * C.V_STEAM, C.V_STEAM + cu[0] * h[0] + cu[1] * h[1] + cu[2] * h[2] + C.K_STEAM * wa) / Math.max(C.ICE_OPEN, open);
      } else if (land[u] && land[v]) {
        const iced = ice[u] || ice[v] ? C.ICE_LAND : 1, nav = Q[u] > C.Q_NAV && Q[v] > C.Q_NAV ? (Q[v] >= Q[u] ? 1 : -1) : 0;
        this.landCost(km, Math.abs(elev[u] - elev[v]), 0.5 * (rd[u] + rd[v]), 0.5 * (cn[u] + cn[v]), 0.5 * (rl[u] + rl[v]), nav, lake[u] > C.LAKE_NAV && lake[v] > C.LAKE_NAV, lc);
        cS[o] = cO[o] = lc[0] * iced; cI[o] = lc[1] * iced;
      } else {   // a port: the coast's half of the edge at sea
        const iced = ice[land[u] ? u : v] ? C.ICE_LAND : 1;
        cS[o] = cO[o] = (C.C_PORT + 0.5 * km * C.C_SEA) * iced; cI[o] = (C.C_PORT_IND + 0.5 * km * C.C_STEAM) * iced;
      }
    }
    // Twelve directions: each node's ring and the six nodes between it and the second ring (the far
    // corner of each rhombus u–a–v–b), each at the cheaper of its two two-step paths scaled to the
    // straight length. On the ring's six alone, the shortest paths ran one straight leg and turned
    // once (a hexagonal grid's metric is ~15% long off its axes), and flows sharing a first leg and
    // parting at the turn drew triangles.
    const G = this.G, m2 = G.nbrOff[n];
    const eS = this.eS = shared(Float32Array, m2), eO = this.eO = shared(Float32Array, m2), eI = this.eI = shared(Float32Array, m2);
    const edge = this.edgeOf || (this.edgeOf = (u, v) => { for (let o = g.nbrOff[u]; o < g.nbrOff[u + 1]; o++) if (g.nbr[o] === v) return o; return -1; });
    for (let u = 0; u < n; u++) for (let o = G.nbrOff[u]; o < G.nbrOff[u + 1]; o++) {
      const v = G.nbr[o], d = edge(u, v);
      if (d >= 0) { eS[o] = cS[d]; eO[o] = cO[d]; eI[o] = cI[d]; continue; }
      const kmUV = R * Math.acos(Math.min(1, g.pos[3 * u] * g.pos[3 * v] + g.pos[3 * u + 1] * g.pos[3 * v + 1] + g.pos[3 * u + 2] * g.pos[3 * v + 2]));
      let bs = Infinity, bo = Infinity, bi = Infinity;
      for (const a of G.via[o]) {
        const o1 = edge(u, a), o2 = edge(a, v), r = kmUV / (g.dist[o1] * R + g.dist[o2] * R);
        bs = Math.min(bs, (cS[o1] + cS[o2]) * r); bo = Math.min(bo, (cO[o1] + cO[o2]) * r); bi = Math.min(bi, (cI[o1] + cI[o2]) * r);
      }
      eS[o] = bs; eO[o] = bo; eI[o] = bi;
    }
  }

  /**
   * One layer's Dijkstras from every market on edge costs `cost`: { D, pred, R (the round trips' mean) }. Each
   * market's alone (layerCells, by chunk of the markets on the people's worker's pool where there is one).
   */
  layer(cost) {
    const n = this.g.n, nm = this.nm, mk = this.mnode;
    const D = shared(Float32Array, nm * nm), pred = shared(Uint16Array, nm * n), Rm = new Float32Array(nm * nm);
    parallelSync('routeLayer', layerCells, { off: this.G.nbrOff, nbr: this.G.nbr, cost: toShared(cost), mk, D, pred, n, nm }, nm);
    for (let a = 0; a < nm; a++) for (let b = 0; b < nm; b++) Rm[a * nm + b] = 0.5 * (D[a * nm + b] + D[b * nm + a]);
    return { D, pred, R: Rm };
  }

  /** The coasting sail's layer solved on its costs as they are ('S'), or the ocean's or the steam's dropped, to be solved when next read ('O', 'I'). */
  solve(L) {
    if (L === 'S') { const s = this.layer(this.eS); this.D.S = s.D; this.pred.S = s.pred; this.R.S = s.R; this.eS0 = this.eS.slice(); }
    else if (L === 'O') this.oc = null;
    else this.st = null;
  }
  /** The steam's layer, solved on its costs the first time it's read after they've moved. */
  steam() { if (!this.st) { this.st = this.layer(this.eI); this.eI0 = this.eI.slice(); } return this.st; }
  /** The ocean-going sail's layer, alike. */
  ocean() { if (!this.oc) { this.oc = this.layer(this.eO); this.eO0 = this.eO.slice(); } return this.oc; }

  /**
   * The routes reread with the world (batch 3f; synthesis): the land changed under them (`keyOf`), built
   * anew; else every edge re-costed from the fields and the works as they are (`price`), and each layer
   * solved again where TOL_ROUTES of its edges have moved by TOL_EDGE in log since it was solved, the
   * markets kept. The catchments follow the costs. True where anything was solved again.
   */
  reprice(f) {
    if (this.keyOf(f) !== this.key) { this.build(f); return true; }
    this.price(f);
    const C = this.C, moved = (a, b) => {
      if (!b) return 0;
      let k = 0;
      for (let o = 0; o < a.length; o++) { const x = a[o], y = b[o]; if (x === y) continue; if (!(Math.abs(Math.log(x / y)) <= C.TOL_EDGE)) k++; }
      return k / a.length;
    };
    let did = false;
    if (moved(this.eS, this.eS0) > C.TOL_ROUTES) { this.solve('S'); did = true; }
    if (this.oc && moved(this.eO, this.eO0) > C.TOL_ROUTES) { this.solve('O'); did = true; }
    if (this.st && moved(this.eI, this.eI0) > C.TOL_ROUTES) { this.solve('I'); did = true; }
    if (did) { this.catchments(f); this.tTrade = null; }
    return did;
  }

  /**
   * Each people's cell's catchment (synthesis): the cells nearest it by the local routes on the
   * people's own grid (`People.graph`'s edges: roads at C_LAND × (1 + climb/H_CLIMB), cheaper by the
   * roads and canals built at their ends and by steam by their railways (`landCost`), a river both
   * cells ply at C_DOWN or C_UP, a short crossing (up to HOPS sea cells) at two ports and the sea's
   * C_SEA a km), up to M_CATCH cells within C_CATCH; with each one's cost by sail and by steam
   * (rail, barge, steamship). Into this.catch = { off, idx, cS, cI }, the cell itself first at none; the edges' costs
   * into this.edgeS and this.edgeI.
   */
  catchments(f) {
    const C = this.C, pp = this.pp, E = pp.E, H = pp.H, nL = pp.nL, cells = pp.cells, P = pp.P;
    const off = new Int32Array(nL + 1), idx = [], cS = [], cI = [];
    const dist = new Float64Array(nL).fill(Infinity), seen = new Int32Array(nL).fill(-1), heap = new Heap(200 * C.M_CATCH + 64);
    const Q = c => f.discharge[cells[c]];
    // Each cell's works: roads' built share, the land canals water, railways'.
    const rd = new Float32Array(nL), cn = new Float32Array(nL), rl = new Float32Array(nL), lc = [0, 0];
    if (pp.wk) for (let c = 0; c < nL; c++) { rd[c] = pp.built(c, 'R'); cn[c] = H.irrQ[c] * pp.built(c, 'C'); rl[c] = pp.railShare(c); }
    // Both layers' edge costs (per directed edge of E).
    const m = E.off[nL], eS = new Float32Array(m), eI = new Float32Array(m);
    for (let c = 0; c < nL; c++) for (let o = E.off[c]; o < E.off[c + 1]; o++) {
      const d = E.nb[o], km = E.km[o];
      if (E.hop[o]) {
        if (E.hop[o] > P.HOPS) { eS[o] = eI[o] = Infinity; continue; }
        eS[o] = 2 * C.C_PORT + km * C.C_SEA; eI[o] = 2 * C.C_PORT_IND + km * C.C_STEAM;
      } else {
        const nav = Q(c) > C.Q_NAV && Q(d) > C.Q_NAV ? (Q(d) >= Q(c) ? 1 : -1) : 0;
        this.landCost(km, Math.abs(H.elev[c] - H.elev[d]), 0.5 * (rd[c] + rd[d]), 0.5 * (cn[c] + cn[d]), 0.5 * (rl[c] + rl[d]), nav, false, lc);
        eS[o] = lc[0]; eI[o] = lc[1];
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
    this.edgeS = eS; this.edgeI = eI;   // the local routes' costs, each directed edge of the people's graph (a herders' state's riders: Polities.ridden)
  }

  /** What the graph depends on: which coarse cells are land and living (a sea's rise, an ice sheet). */
  keyOf(f) {
    const pp = this.pp, n = this.g ? this.g.n : buildGrid(Math.max(2, pp.planet.grid.level - 1)).n;
    let h = 0;
    for (let i = 0; i < n; i++) { const a = f.elev[i] > 0 ? (f.ice[i] >= pp.P.ICE_MAX ? 2 : 1) : 0; h = (Math.imul(h, 31) + a + i) | 0; }
    return h;
  }

  /** The round trip's mean cost between markets a and b on a layer ('S' the coasting sail, 'O' the ocean's, 'I' steam). */
  cost(a, b, L = 'S') { return (L === 'S' ? this.R.S : L === 'O' ? (this.oc || this.ocean()).R : (this.st || this.steam()).R)[a * this.nm + b]; }

  /**
   * The cost between markets a and b for a carrier with navigation ν and industry's share sI, its reach L
   * (sea-km, e-fold): the sail's two layers as their kernels mix, −L ln((1 − ν) e^{−c_S/L} + ν e^{−c_O/L}), and
   * steam's share sI of the rest (as the layers' costs mix where industry is: People.foodshed, Polities).
   */
  between(a, b, nu, sI, L) {
    if (a === b) return 0;
    let x = this.cost(a, b, 'S');
    if (nu > this.C.NU_MIN) {
      const y = this.cost(a, b, 'O'), m = Math.min(x, y);
      x = m - L * Math.log((1 - nu) * Math.exp(-(x - m) / L) + nu * Math.exp(-(y - m) / L));
    }
    return sI > 1e-6 ? (1 - sI) * x + sI * this.cost(a, b, 'I') : x;
  }

  /**
   * The journey's years between markets a and b for a carrier with navigation ν and industry's share sI, its
   * reach L: the sail's two layers each at its own speed (coasting craft's V_COAST over a voyage, the ocean-going
   * ship's V_SHIP), weighed as their kernels mix, and steam's share sI at V_STEAM.
   */
  years(a, b, nu, sI, L) {
    if (a === b) return 0;
    const C = this.C, y = 86.4 * 365.25, cS = this.cost(a, b, 'S');
    let t = cS / (C.V_COAST * y);
    if (nu > C.NU_MIN) {
      const cO = this.cost(a, b, 'O'), m = Math.min(cS, cO), wS = (1 - nu) * Math.exp(-(cS - m) / L), wO = nu * Math.exp(-(cO - m) / L);
      t = (wS * t + wO * cO / (C.V_SHIP * y)) / (wS + wO);
    }
    return sI > 1e-6 ? (1 - sI) * t + sI * this.cost(a, b, 'I') / (C.V_STEAM * y) : t;
  }

  /**
   * Whether markets a and b are joined only across the open ocean (for the counts: captives carried overseas,
   * the states survey's empires): the ocean's layer read (navigation has come) and the coasting craft's way
   * OPEN_X dearer than the ocean-going ship's.
   */
  oceanic(a, b) { return !!this.oc && a !== b && this.cost(a, b, 'S') > OPEN_X * this.cost(a, b, 'O'); }

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
    // (Each market's array at the markets' count, which a rebuild changes: one left at the old count read
    // a new market's entries as undefined, NaN in every sum, and the weights' rows i × nm as the wrong pairs.)
    const F = sized(this, 'mF', Float64Array, nm), N = sized(this, 'mN', Float64Array, nm), Z = sized(this, 'mZ', Float64Array, nm), ZL = sized(this, 'mZL', Float64Array, nm);
    const S = sized(this, 'mS', Float64Array, nm), Fd = sized(this, 'mFd', Float64Array, nm), A = sized(this, 'mA', Float64Array, nm);
    F.fill(0); N.fill(0); Z.fill(0); ZL.fill(0); S.fill(0); Fd.fill(0); A.fill(0);
    const zc = pp.zc, zl = pp.zl, Ntot = pp.Ntot, mo = this.marketOf;
    // Each market's most peopled cell (its town), whose learned identity is the market's language.
    const lead = sized(this, 'mLead', Int32Array, nm), leadN = sized(this, 'mLeadN', Float64Array, nm);
    lead.fill(-1); leadN.fill(0);
    // Each market's crops: the package on most of its fields.
    const pk = sized(this, 'mPkg', Int32Array, nm), byPkg = new Map();
    for (let c = 0; c < nL; c++) {
      const k = mo[c], n = Ntot[c];
      A[k] += pp.H.area[c];
      if (!(n > 0)) continue;
      if (n > leadN[k]) { leadN[k] = n; lead[k] = c; }
      N[k] += n; Z[k] += n * (zc ? zc[c] : 0); ZL[k] += n * (zl ? zl[c] : 0); S[k] += n * pp.ind[c];
      if (pp.f[c] > 0) {
        F[k] += pp.Out[c] - pp.goods[c];
        const a = pp.f[c] * pp.H.area[c]; Fd[k] += a;
        if (pp.pkg[c] >= 0) { const key = k * 4096 + pp.pkg[c]; byPkg.set(key, (byPkg.get(key) || 0) + a); }
      }
    }
    pk.fill(-1);
    const best = new Float64Array(nm);
    for (const [key, a] of byPkg) { const k = Math.floor(key / 4096); if (a > best[k]) { best[k] = a; pk[k] = key % 4096; } }
    const act = [], nu = sized(this, 'mNu', Float64Array, nm);
    for (let k = 0; k < nm; k++) { if (N[k] > 0) { Z[k] /= N[k]; ZL[k] /= N[k]; S[k] /= N[k]; } nu[k] = N[k] > 0 && pp.nav ? pp.nav(Z[k]) : 0; if (F[k] > 0) act.push(k); }
    this.active = act;
    const na = act.length;
    const V = sized(this, 'V', Float64Array, nm), Cv = sized(this, 'Cv', Float64Array, nm);
    V.fill(1); Cv.fill(1);
    const W = sized(this, 'W', Float32Array, nm * nm);
    this.flows = [];
    if (!na) return;
    const reach = act.map(k => this.reach(Z[k]));
    const part = this.part && this.part.k.length === nm * C.K_PART ? this.part : (this.part = { k: new Int32Array(nm * C.K_PART), w: new Float32Array(nm * C.K_PART) });
    const pp2 = this.ppart && this.ppart.k.length === nm * C.K_PATH ? this.ppart : (this.ppart = { k: new Int32Array(nm * C.K_PATH), w: new Float32Array(nm * C.K_PATH) });
    part.k.fill(-1); part.w.fill(0); pp2.k.fill(-1); pp2.w.fill(0);
    // The kernel, symmetric, once a pair.
    const KM = this.KM && this.KM.length >= na * na ? this.KM : (this.KM = new Float32Array(na * na)), RS = this.R.S, ids = pp.ids;
    let RI = null, RO = null;   // the steam's, where a pair has industry; the ocean's, where it navigates
    for (let x = 0; x < na; x++) {
      const i = act[x], ri = reach[x], si = S[i], ni = nu[i];
      KM[x * na + x] = 1;
      for (let y = x + 1; y < na; y++) {
        const j = act[y], r = ri > reach[y] ? ri : reach[y], s = si > S[j] ? si : S[j], o = i * nm + j, v = ni > nu[j] ? ni : nu[j];
        // The sail's: the coasting craft's kernel and the ocean-going ship's, mixed by the pair's navigation.
        let ks = r > 0 && s < 1 - 1e-6 ? Math.exp(-RS[o] / r) : 0;
        if (v > C.NU_MIN && r > 0 && s < 1 - 1e-6) ks = (1 - v) * ks + v * Math.exp(-(RO || (RO = this.R.O))[o] / r);
        const k0 = !(r > 0) ? 0 : s < 1e-6 ? ks : s > 1 - 1e-6 ? Math.exp(-(RI || (RI = this.R.I))[o] / r) : (1 - s) * ks + s * Math.exp(-(RI || (RI = this.R.I))[o] / r);
        // A common language eases trade (src/engine/peoples.js, `tradeW`).
        // And a border between their towns' states (src/engine/polities.js, `border`).
        const k = ids && k0 > 0 && lead[i] >= 0 && lead[j] >= 0 ? k0 * ids.tradeW(lead[i], lead[j]) * (pp.pol ? pp.pol.border(lead[i], lead[j]) : 1) : k0;
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
      // And the K_PATH met most, for the pathogens' travellers (the same contact, a longer list).
      const o = i * C.K_PART, o2 = i * C.K_PATH, KH = C.K_PATH;
      for (let y = 0; y < na; y++) {
        const j = act[y];
        if (j === i) continue;
        const cj = kern[y] * N[j] / (N[j] + C.N_MEET);
        if (!(cj > 1e-5)) continue;
        if (cj > pp2.w[o2 + KH - 1]) {
          let q = KH - 1;
          while (q > 0 && pp2.w[o2 + q - 1] < cj) { pp2.w[o2 + q] = pp2.w[o2 + q - 1]; pp2.k[o2 + q] = pp2.k[o2 + q - 1]; q--; }
          pp2.w[o2 + q] = cj; pp2.k[o2 + q] = j;
        }
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
      const nv = this.mNu ? Math.max(this.mNu[i] || 0, this.mNu[j] || 0) : 0, L = Math.max(S[i], S[j]) > 0.5 ? 'I' : nv > 0.5 ? 'O' : 'S', p = this.path(j, this.mnode[i], L);
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
    const P = [], W = [], off = [];
    for (const [nodes, ws] of chains) {
      let pts = nodes.map(i => pos.get(i).slice()), wt = [ws[0], ...ws];
      for (let it = 0; it < relax && pts.length > 2; it++) {
        const np = pts.map(p => p.slice());
        for (let k = 1; k + 1 < pts.length; k++) {
          const a = pts[k - 1], b = pts[k], c = pts[k + 1], x = 0.5 * b[0] + 0.25 * (a[0] + c[0]), y = 0.5 * b[1] + 0.25 * (a[1] + c[1]), z = 0.5 * b[2] + 0.25 * (a[2] + c[2]), r = Math.hypot(x, y, z);
          np[k] = [x / r, y / r, z / r];
        }
        pts = np;
      }
      for (let it = 0; it < cuts && pts.length > 2; it++) {
        const np = [pts[0]], nw = [wt[0]];
        for (let k = 0; k + 1 < pts.length; k++) {
          const p0 = pts[k], p1 = pts[k + 1], m = (t) => { const x = p0[0] + t * (p1[0] - p0[0]), y = p0[1] + t * (p1[1] - p0[1]), z = p0[2] + t * (p1[2] - p0[2]), r = Math.hypot(x, y, z); return [x / r, y / r, z / r]; };
          if (k > 0) { np.push(m(0.25)); nw.push(wt[k + 1]); }
          if (k + 2 < pts.length) { np.push(m(0.75)); nw.push(wt[k + 1]); }
        }
        np.push(pts[pts.length - 1]); nw.push(wt[wt.length - 1]);
        pts = np; wt = nw;
      }
      off.push(P.length / 3);
      for (let k = 0; k < pts.length; k++) { P.push(...pts[k]); W.push(wt[k]); }
    }
    return { P: Float32Array.from(P), W: Float32Array.from(W), off: Int32Array.from(off), max: qm };
  }
}
