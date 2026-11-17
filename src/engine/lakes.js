// Lakes that breathe (docs/surface.md): the priority flood's depressions
// hold water, which fills them, spills from them and dries out of them.
//
//   basins       (standard: Barnes, Callaghan and Wickert's depression
//                hierarchy and fill–spill–merge, 2020–21, from memory). Each
//                connected region the flood filled is one depression complex
//                with one spill level (two filled cells side by side share
//                their level). Inside it each pit, a cell with no lower
//                neighbour in the region, is a leaf, and the region's other
//                cells join the pit they descend to. Leaves merge into a
//                parent at their lowest pass (Kruskal over the passes), up to
//                the region's root, which spills where the filled surface
//                leaves it. A full child overflows across its pass into its
//                sibling; when both are full they are one lake, the parent. A
//                full root overflows down the drainage into the next region's
//                leaf, or the sea.
//   catchments   (standard) each cell's water runs down the routing to the
//                first filled cell it meets, and so into that cell's leaf.
//   hypsometry   (synthesis) a cell's ground spans [z, z + ramp] below the
//                grid's scale: z, the routed height, is its lowest point,
//                where water runs (its mean, or its channel where the data has
//                one: a gorge's floor, the span then at least twice its depth
//                below the mean). A cell's wet share then rises linearly with
//                the level, so a lake's area is continuous in its volume, and a
//                fully wet cell's mean depth is level − z − ramp/2. The ramp is
//                the cell's relief, its mean height difference to its
//                neighbours, within [RAMP_MIN, RAMP]: a flat floor holds a
//                shallow lake that spreads and shrinks with a metre of level (a
//                Chad, an Eyre), a steep basin a lake whose shore barely moves.
//                (A fixed 50 m, the routing's roughness's full range, drew a
//                closed lake's seasons as ~1% of its area.)
//   the year     (standard water balance) dV/dt = the catchment's runoff off
//                dry ground + (P − E) on the wet ground, by backward Euler in
//                the lake's level, so any step is stable and a closed lake
//                settles where its evaporation balances its inflow,
//                A (E − P) = Q, rather than ringing about it. Overflow then
//                cascades from upstream regions to downstream ones.
//   equilibrium  (the closure at fast dials) every lake at the level where its
//                balance is zero, or full and passing its surplus on; region by
//                region from upstream, children before parents, a full child's
//                surplus re-solving its sibling.
//   salt flats   (synthesis) a dry floor that held water lately is an evaporite
//                pan, in a closed basin only (a lake that drains, by its spill
//                or an outburst, leaves mud, not salt). Each cell remembers its
//                wet share, decaying over SALT_TAU (~3 kyr: the crust's life
//                before it's blown off or buried); salt is the share it has lost,
//                memory − wet.
//                At fast dials, where a frame outlasts the memory, a closed
//                lake's level stands for a spread from year to year: the floor
//                its level would reach with WET more inflow is salt as well
//                (speculation: WET = 50%, a guess at the spread of a dry
//                basin's inflow, until the year's anomalies give it).
//   rivers       each depression region's inflow and outflow over the last
//                call (`regIn`, `regOut`, km³/yr), and over about the last year
//                (`regInY`, `regOutY`: a lake that sinks below its sill in the
//                dry season still spills in the year): a river below a closed
//                lake carries nothing, below a spilling one its overflow's share
//                (src/render/rivers.js, `drainage`, by the year's). The climate
//                reads each cell's wet share over the year too (`wetY`), as it
//                reads everything else as a climatology.
//   reroutes     a new routing (the landscape every 0.25 Myr, or the ice) is
//                a new hierarchy. The old lakes' water is laid on their cells
//                and each cell's share goes to the new leaf there, or down the
//                new drainage; filled in order, what overflows goes on, so
//                water is conserved. An ice dam that thins is a reroute too: its
//                basin is gone, and the water above the new spill leaves in
//                that step (an outburst), counted in `released`.
//   the sea      the outlets are the ocean the plates solve (src/engine/plates.js,
//                solveSea), not every cell below sea level: a basin below it
//                that the sea doesn't reach is a depression like any other,
//                holding a lake at its balance or lying dry (a Caspian, a Dead
//                Sea, a Qattara). A basin the sea leaves comes with its water
//                (`extra` in a rebuild), and one the sea reaches gives its
//                lakes to the sea.
//
// Lengths and levels in km, areas in km², volumes in km³, time in years,
// runoff and P − E in m/yr.
import { LAND, route } from './landscape.js';

export const LAKES = {
  RAMP: 2 * LAND.ROUGH,   // km: a cell's ground below the grid's scale, at most (the roughness's full range)
  RAMP_MIN: 0.005,        // km: at least (a floodplain's relief across a cell)
  RAMP_CUT: 2,            // km: at most, where a cell's channel lies below its mean (a gorge: its ground spans twice the depth)
  TOL: 1e-5,              // km: filled by more than this is in a depression
  SALT_TAU: 3000,         // yr: a dry bed's memory of its water
  WET: 0.5,               // the closure's spread of inflow from year to year (salt flats at fast dials)
  YEAR: 1,                // yr: the rivers' memory of each basin's inflow and outflow (regInY, regOutY)
  // The lakes' algae (`production`; synthesis on standard forms)
  V_SETTLE: 10,           // m/yr: phosphorus settling to the bed (Vollenweider's σz, from memory)
  P_DEP: 30,              // mg P m⁻² yr⁻¹ falling on the water from the air (dust and smoke; from memory, its order)
  PP_MAX: 700,            // g C m⁻² yr⁻¹: a warm lake's production, rich in phosphorus, year-round
  K_TP: 15,               // µg/L: the phosphorus at which production is half its most
  EPPLEY: 1.066,          // growth's rise a degree (Eppley 1972, standard, from memory), about 20 °C
};

const R_KM = 6371;

export class Lakes {
  constructor(grid) {
    const n = grid.n;
    this.grid = grid;
    this.n = n;
    this.areaKm = Float64Array.from(grid.area, a => a * R_KM * R_KM);
    // Per cell.
    this.depth = new Float32Array(n);     // km: mean water depth over the cell
    this.wet = new Float32Array(n);       // share of the cell under water
    this.under = new Uint8Array(n);       // its mean floor is under water (wet > ½)
    this.wetY = new Float32Array(n);      // the wet share over about the last year (the climate's)
    this.salt = new Float32Array(n);      // share of the cell that is salt flat
    this.lakeId = new Int32Array(n).fill(-1);   // the lake node over the cell (state, level, area, volume), or −1
    this.mem = new Float32Array(n);       // recent wet share, decaying over SALT_TAU
    this.leafOf = new Int32Array(n).fill(-1);   // the leaf whose depression holds the cell, or −1
    this.catch = new Int32Array(n).fill(-1);    // the leaf the cell's water reaches, or −1 (the sea)
    this.regOf = new Int32Array(n).fill(-1);
    this.z = new Float64Array(n);
    this.ramp = new Float64Array(n).fill(LAKES.RAMP);   // km: each cell's ground below the grid's scale (hypsometry)
    this.cut = new Float64Array(n);                      // km: each cell's channel below its mean (`reroute`'s chan)
    this.wts = new Float64Array(n);       // km³/yr: A (R − (P − E)), what wetting the cell costs its lake
    this.nb = 0;
    this.nr = 0;
    this.built = false;
    this.flux = { runoff: 0, vertical: 0, toSea: 0 };    // km³ in the last call
    this.total = { runoff: 0, vertical: 0, toSea: 0 };   // km³ since construction
    this._V = 0; this._A = 0; this._L = 0; this._dL = 0;
  }

  /**
   * Build the basins from a routing result `r` (route() in landscape.js) over the
   * surface `z` it routed (km: the ground, plus the ice where ice may dam). `dry`
   * (optional, per cell) marks ground that holds no water though it lies in a
   * depression: grounded ice, which dams a lake but isn't under it. When basins
   * already hold water, it is carried onto the new ones. Returns { released }: km³
   * that went to the sea in the change.
   */
  rebuild(r, z, dry = null, extra = null) {
    let carried = this.built ? this.cellWater() : null;
    if (extra) { carried = carried || new Float64Array(this.n); for (let i = 0; i < this.n; i++) carried[i] += extra[i]; }
    this.build(r, z, dry);
    const released = carried ? this.carry(carried) : 0;
    this.total.toSea += released;
    this.refresh(0, false);
    return { released };
  }

  build(r, z, dry) {
    const g = this.grid, n = this.n, nbrOff = g.nbrOff, nbr = g.nbr;
    const zf = r.zf, rcv = r.rcv, order = r.order, count = r.count, TOL = LAKES.TOL;
    this.z.set(z);
    for (let i = 0; i < n; i++) {
      if (!(zf[i] - z[i] > TOL)) continue;
      let d = 0;
      for (let t = nbrOff[i], e = nbrOff[i + 1]; t < e; t++) d += Math.abs(z[nbr[t]] - z[i]);
      this.ramp[i] = Math.max(Math.min(LAKES.RAMP, Math.max(LAKES.RAMP_MIN, d / (nbrOff[i + 1] - nbrOff[i]))), Math.min(LAKES.RAMP_CUT, 2 * this.cut[i]));
    }
    this.depth.fill(0); this.wet.fill(0); this.under.fill(0); this.salt.fill(0); this.lakeId.fill(-1);
    // Regions: connected filled cells.
    const reg = this.regOf;
    reg.fill(-1);
    const rc = [], rcOff = [0], stack = [];
    let nr = 0;
    for (let i = 0; i < n; i++) {
      if (reg[i] >= 0 || !(zf[i] - z[i] > TOL) || rcv[i] < 0) continue;
      reg[i] = nr; stack.push(i);
      while (stack.length) {
        const c = stack.pop();
        rc.push(c);
        for (let t = nbrOff[c], e = nbrOff[c + 1]; t < e; t++) {
          const j = nbr[t];
          if (reg[j] < 0 && zf[j] - z[j] > TOL && rcv[j] >= 0) { reg[j] = nr; stack.push(j); }
        }
      }
      nr++; rcOff.push(rc.length);
    }
    const m = rc.length, cap = 2 * m + 1;
    const parent = new Int32Array(cap).fill(-1), c0 = new Int32Array(cap).fill(-1), c1 = new Int32Array(cap).fill(-1);
    const link = new Int32Array(cap).fill(-1), region = new Int32Array(cap);
    const spill = new Float64Array(cap), merge = new Float64Array(cap).fill(-Infinity);
    const leafOf = this.leafOf;
    leafOf.fill(-1);
    const regRoot = new Int32Array(nr), regNode0 = new Int32Array(nr + 1), regLow = new Int32Array(nr);
    const regSpill = new Float64Array(nr);
    const sorted = new Int32Array(m);
    let nb = 0;
    for (let q = 0; q < nr; q++) {
      const o = rcOff[q], e = rcOff[q + 1];
      const cells = rc.slice(o, e).sort((a, b) => z[a] - z[b]);
      sorted.set(cells, o);
      regNode0[q] = nb;
      regLow[q] = cells[0];
      let S = Infinity;
      for (const c of cells) S = Math.min(S, zf[c]);
      regSpill[q] = S;
      // Leaves: each cell joins the pit its steepest descent inside the region reaches.
      const leaf0 = nb;
      for (const c of cells) {
        let best = -1, bz = z[c];
        for (let t = nbrOff[c], te = nbrOff[c + 1]; t < te; t++) {
          const j = nbr[t];
          if (reg[j] === q && z[j] < bz) { bz = z[j]; best = j; }
        }
        if (best < 0) { leafOf[c] = nb; region[nb] = q; nb++; } else leafOf[c] = leafOf[best];
      }
      const nl = nb - leaf0;
      // The passes between leaves: the lowest crossing of each pair.
      const passes = new Map();
      for (const c of cells) {
        const a = leafOf[c];
        for (let t = nbrOff[c], te = nbrOff[c + 1]; t < te; t++) {
          const j = nbr[t];
          if (j < c || reg[j] !== q) continue;
          const b = leafOf[j];
          if (a === b) continue;
          const s = Math.max(z[c], z[j]), key = a < b ? a * cap + b : b * cap + a;
          const p = passes.get(key);
          if (!p || s < p[0]) passes.set(key, [s, a, b]);
        }
      }
      // Kruskal: leaves merge at their passes, lowest first.
      const uf = new Int32Array(nl), top = new Int32Array(nl);
      for (let k = 0; k < nl; k++) { uf[k] = k; top[k] = leaf0 + k; }
      const find = k => { while (uf[k] !== k) { uf[k] = uf[uf[k]]; k = uf[k]; } return k; };
      for (const [s0, a, b] of [...passes.values()].sort((x, y) => x[0] - y[0])) {
        const ra = find(a - leaf0), rb = find(b - leaf0);
        if (ra === rb) continue;
        const s = Math.min(s0, S), M = nb++, na = top[ra], nn = top[rb];
        region[M] = q;
        c0[M] = na; c1[M] = nn; parent[na] = M; parent[nn] = M;
        merge[M] = s; spill[na] = s; spill[nn] = s;
        link[na] = b; link[nn] = a;
        uf[ra] = rb; top[rb] = M;
      }
      const root = top[find(0)];
      regRoot[q] = root;
      spill[root] = S;
    }
    regNode0[nr] = nb;
    // Catchments: down the routing to the first filled cell (receivers come first in `order`).
    const ca = this.catch;
    ca.fill(-1);
    for (let k = 0; k < count; k++) {
      const i = order[k];
      ca[i] = leafOf[i] >= 0 ? leafOf[i] : rcv[i] < 0 ? -1 : ca[rcv[i]];
    }
    // Each root spills where the filled surface leaves its region, into the next region or the sea.
    for (let q = 0; q < nr; q++) {
      let c = regLow[q];
      for (let hop = 0; hop <= count; hop++) {
        if (rcv[c] < 0) { c = -1; break; }
        if (reg[c] !== q && (ca[c] < 0 || region[ca[c]] !== q)) break;
        c = rcv[c];
      }
      link[regRoot[q]] = c < 0 ? -1 : ca[c];
    }
    // Each node's cells below its spill, by height (a node's cells are its leaves' cells).
    const cnt = new Int32Array(nb + 1);
    for (let k = 0; k < m; k++) {
      const c = sorted[k];
      if (dry && dry[c]) continue;
      for (let b = leafOf[c]; b >= 0; b = parent[b]) if (z[c] < spill[b]) cnt[b + 1]++;
    }
    for (let b = 0; b < nb; b++) cnt[b + 1] += cnt[b];
    const cellOff = cnt.slice(), cells = new Int32Array(cnt[nb]), fillp = cnt.slice(0, nb);
    for (let k = 0; k < m; k++) {
      const c = sorted[k];
      if (dry && dry[c]) continue;
      for (let b = leafOf[c]; b >= 0; b = parent[b]) if (z[c] < spill[b]) cells[fillp[b]++] = c;
    }
    Object.assign(this, { nb, nr, parent, c0, c1, link, region, spill, merge, cellOff, cells, regRoot, regNode0, regSpill, regCells: sorted, regCellOff: Int32Array.from(rcOff) });
    // Capacities at the spill.
    this.cap = new Float64Array(nb); this.capOwn = new Float64Array(nb); this.capArea = new Float64Array(nb);
    this.hmin = new Float64Array(nb);
    for (let b = 0; b < nb; b++) {
      this.hmin[b] = cellOff[b + 1] > cellOff[b] ? z[cells[cellOff[b]]] : spill[b];
      this.eval(b, spill[b], null);
      this.cap[b] = this._V; this.capArea[b] = this._A;
      this.capOwn[b] = c0[b] < 0 ? this._V : Math.max(0, this._V - this.cap[c0[b]] - this.cap[c1[b]]);
    }
    // Upstream regions first: a region spills only into regions below its own spill.
    this.regOrder = Int32Array.from({ length: nr }, (_, q) => q).sort((a, b) => regSpill[b] - regSpill[a]);
    // State: a leaf's volume, a parent's pool above its children's pass.
    this.W = new Float64Array(nb);
    this.level = Float64Array.from(this.hmin);
    // Per node, after each refresh: a lake node's level (km), area (km²), volume (km³), and
    // state (0 not a lake of its own, 1 closed, 2 full and spilling).
    this.areaB = new Float64Array(nb); this.volume = new Float64Array(nb); this.state = new Uint8Array(nb);
    this.I = new Float64Array(nb); this.inb = new Float64Array(nb); this.S = new Float64Array(nb);
    this.fullF = new Uint8Array(nb); this.mergedF = new Uint8Array(nb);
    this.closedFringe = new Float64Array(nb).fill(-Infinity);
    this.regIn = new Float64Array(nr); this.regOut = new Float64Array(nr);
    this.regInY = new Float64Array(nr); this.regOutY = new Float64Array(nr); this.yFresh = true;
    this.builds = (this.builds || 0) + 1;
    this.built = true;
  }

  /**
   * Route the smooth surface and rebuild: the ground (km, `elev`) plus its ice (m, `iceH`),
   * so ice dams lakes but holds none (it's dry); the ocean (`sea`, the plates' mask) is the
   * outlet. Not the landscape's rough routing, whose roughness makes one-cell ponds. `extra`
   * (km³ per cell) is water to lay down with the lakes' own: a basin the sea has left. `chan`
   * (km), where it's given, is each cell's channel (src/engine/plates.js's `channel`): the
   * ground's lowest land, routed on where no ice fills it, its ground then spanning at least
   * twice its depth below the mean. Returns rebuild's.
   */
  reroute(elev, sea, iceH = null, extra = null, chan = null) {
    const n = this.n, z = this.zr || (this.zr = new Float64Array(n)), base = this.baseR || (this.baseR = new Uint8Array(n)), dry = this.dryR || (this.dryR = new Uint8Array(n));
    const cut = this.cut;
    for (let i = 0; i < n; i++) {
      const h = iceH ? iceH[i] : 0, c = chan && !(h > 1) ? Math.min(elev[i], chan[i]) : elev[i];
      z[i] = c + h / 1000; cut[i] = elev[i] - c; base[i] = sea[i] ? 1 : 0; dry[i] = h > 1 ? 1 : 0;
    }
    this.routeR = route(this.grid, z, base, this.routeR);
    return this.rebuild(this.routeR, z, dry, extra);
  }

  /** Node b's pool at level h: volume, area, and (with weights) the cost of its wet ground and its slope. */
  eval(b, h, wts) {
    const z = this.z, A = this.areaKm, cells = this.cells, ramp = this.ramp;
    let V = 0, Ar = 0, L = 0, dL = 0;
    for (let k = this.cellOff[b], e = this.cellOff[b + 1]; k < e; k++) {
      const i = cells[k], x = h - z[i], R = ramp[i];
      if (!(x > 0)) break;
      if (x >= R) { V += A[i] * (x - R / 2); Ar += A[i]; if (wts) L += wts[i]; }
      else { const f = x / R; V += A[i] * x * f / 2; Ar += A[i] * f; if (wts) { L += wts[i] * f; dL += wts[i] / R; } }
    }
    this._V = V; this._A = Ar; this._L = L; this._dL = dL;
  }

  /**
   * The level h in [lo, hi] where a·V(h) + dtv·L(h) = c (F rising in h): backward Euler's
   * level for a = 1, the closure's for a = 0, a volume's level for dtv = 0.
   * Returns lo or hi when the root lies outside.
   */
  solveLevel(b, a, c, dtv, lo, hi, guess) {
    const wts = dtv ? this.wts : null;
    this.eval(b, lo, wts);
    if (a * this._V + dtv * this._L - c >= 0) return lo;
    this.eval(b, hi, wts);
    if (a * this._V + dtv * this._L - c <= 0) return hi;
    let h = guess > lo && guess < hi ? guess : 0.5 * (lo + hi);
    for (let it = 0; it < 80; it++) {
      this.eval(b, h, wts);
      const f = a * this._V + dtv * this._L - c, d = a * this._A + dtv * this._dL;
      if (f > 0) hi = h; else lo = h;
      if (Math.abs(f) <= 1e-14 * (Math.abs(c) + 1) || hi - lo < 1e-13) break;
      let hn = d > 0 ? h - f / d : NaN;
      if (!(hn > lo && hn < hi)) hn = 0.5 * (lo + hi);
      h = hn;
    }
    return h;
  }

  /** Which nodes are full, and which hold one lake (leaves, and parents whose children are full). */
  flags() {
    const { nb, c0, c1, W, cap, capOwn, fullF, mergedF } = this;
    for (let b = 0; b < nb; b++) {
      const tol = 1e-12 * (cap[b] + 1);
      if (c0[b] < 0) { mergedF[b] = 1; fullF[b] = W[b] >= cap[b] - tol ? 1 : 0; }
      else {
        mergedF[b] = W[b] > 0 || (fullF[c0[b]] && fullF[c1[b]]) ? 1 : 0;
        fullF[b] = mergedF[b] && W[b] >= capOwn[b] - tol ? 1 : 0;
      }
    }
  }

  /** The water in node b's subtree, when b holds one lake. */
  held(b) { return this.c0[b] < 0 ? this.W[b] : this.cap[this.c0[b]] + this.cap[this.c1[b]] + this.W[b]; }

  /** Add q at leaf L; overflow climbs no higher than `top`. Returns what overflows `top`. */
  rise(L, q, top) {
    const room = this.cap[L] - this.W[L];
    if (q < room) { this.W[L] += q; return 0; }
    this.W[L] = this.cap[L];
    return this.climb(L, q - room, top);
  }

  /** Node b is full with q to spare: across its pass into its sibling, then into the parent's pool, up to `top`. */
  climb(b, q, top) {
    while (q > 0 && b !== top) {
      const P = this.parent[b], o = this.c0[P] === b ? this.c1[P] : this.c0[P];
      q = this.rise(this.link[b], q, o);
      if (q > 0) {
        const room = this.capOwn[P] - this.W[P];
        if (q < room) { this.W[P] += q; q = 0; } else { this.W[P] = this.capOwn[P]; q -= room; }
      }
      b = P;
    }
    return q;
  }

  /** Take up to q from node b's water: its own pool first, then its children by their areas. Returns what it couldn't. */
  remove(b, q) {
    const W = this.W, d = Math.min(q, W[b]);
    W[b] -= d; q -= d;
    if (!(q > 0) || this.c0[b] < 0) return Math.max(0, q);
    const a = this.c0[b], c = this.c1[b], aa = this.capArea[a], ac = this.capArea[c];
    const qa = aa + ac > 0 ? q * aa / (aa + ac) : q / 2;
    let u = this.remove(a, qa) + this.remove(c, q - qa);
    if (u > 0) u = this.remove(a, u);
    if (u > 0) u = this.remove(c, u);
    return u;
  }

  /** Set the water a lake node holds; below its children's pass it splits into them. Returns the shortfall. */
  setHeld(b, V) {
    if (this.c0[b] < 0) { this.W[b] = Math.max(0, V); return Math.max(0, -V); }
    const base = this.cap[this.c0[b]] + this.cap[this.c1[b]];
    if (V >= base) { this.W[b] = Math.min(this.capOwn[b], V - base); return 0; }
    this.W[b] = 0;
    return this.remove(b, base - V);
  }

  /** Runoff (m/yr) into each leaf from its catchment as dry ground, and each depression cell's cost when wet. */
  forcing(runoff, pe) {
    const n = this.n, A = this.areaKm, ca = this.catch, I = this.I, wts = this.wts, rcl = this.regCells;
    I.fill(0);
    for (let i = 0; i < n; i++) { const t = ca[i]; if (t >= 0) I[t] += A[i] * runoff[i] * 1e-3; }
    for (let k = 0; k < rcl.length; k++) { const i = rcl[k]; wts[i] = A[i] * (runoff[i] - pe[i]) * 1e-3; }
  }

  /** The lake nodes of region q (each leaf under exactly one). */
  activeIn(q, out) {
    out.length = 0;
    const st = [this.regRoot[q]];
    while (st.length) {
      const b = st.pop();
      if (this.mergedF[b]) out.push(b); else { st.push(this.c0[b]); st.push(this.c1[b]); }
    }
    return out;
  }

  /** One step of dt years: runoff (m/yr, as land) and P − E (m/yr, as open water) per cell. */
  step(dt, runoff, pe) {
    if (!this.built) return;
    this.forcing(runoff, pe);
    this.flags();
    const { I, inb, S, c0, c1, parent, link, spill, hmin, cap } = this;
    inb.fill(0);
    let runIn = 0, vert = 0, toSea = 0;
    const act = [];
    const rin = this.regIn, rout = this.regOut, idt = dt > 0 ? 1 / dt : 0;
    for (const q of this.regOrder) {
      const b0 = this.regNode0[q], b1 = this.regNode0[q + 1];
      let qin = 0, qout = 0;
      for (let b = b0; b < b1; b++) {
        if (c0[b] < 0) { S[b] = I[b] * dt + inb[b]; runIn += I[b] * dt; qin += S[b]; } else S[b] = S[c0[b]] + S[c1[b]];
      }
      const root = this.regRoot[q];
      for (const b of this.activeIn(q, act)) {
        // A lake an overflow merged into its parent this step: its inflow joins the parent's pool.
        let joined = false;
        for (let p = parent[b]; p >= 0; p = parent[p]) if (this.W[p] > 0) { joined = true; break; }
        if (joined) {
          const left = this.climb(b, S[b], root);
          if (left > 0) { const t = link[root]; qout += left; if (t < 0) toSea += left; else inb[t] += left; }
          continue;
        }
        const V0 = this.held(b), c = V0 + S[b];
        if (!(c > 0)) { this.level[b] = hmin[b]; continue; }
        const h = this.solveLevel(b, 1, c, dt, hmin[b], spill[b], this.level[b]);
        let ex = 0;
        if (h >= spill[b]) {
          this.eval(b, spill[b], this.wts);
          ex = Math.max(0, c - dt * this._L - cap[b]);
          this.setHeld(b, cap[b]);
        } else {
          this.eval(b, h, null);
          this.setHeld(b, this._V);
        }
        this.level[b] = h;
        vert += this.heldNow(b) + ex - c;
        if (ex > 0) {
          const left = parent[b] < 0 ? ex : this.climb(b, ex, root);
          if (left > 0) { const t = link[root]; qout += left; if (t < 0) toSea += left; else inb[t] += left; }
        }
      }
      rin[q] = qin * idt; rout[q] = qout * idt;
    }
    this.account(runIn, vert, toSea);
    this.refresh(dt, false);
    const k = 1 - Math.exp(-dt / LAKES.YEAR);
    this.remember(this.yFresh ? 1 : k, k);
  }

  stepYear(runoff, pe) { this.step(1, runoff, pe); }

  /** The year's inflow and outflow per region (k of the way to the last call's), and wet share per cell (kc of the way: cells outlast a rebuild). */
  remember(k, kc) {
    const I = this.regInY, O = this.regOutY, W = this.wetY, w = this.wet;
    for (let q = 0; q < this.nr; q++) { I[q] += k * (this.regIn[q] - I[q]); O[q] += k * (this.regOut[q] - O[q]); }
    for (let i = 0; i < this.n; i++) W[i] += kc * (w[i] - W[i]);
    this.yFresh = false;
  }

  /** The water now in node b's subtree (whether or not it is one lake). */
  heldNow(b) {
    let s = 0;
    const st = [b];
    while (st.length) { const x = st.pop(); s += this.W[x]; if (this.c0[x] >= 0) { st.push(this.c0[x]); st.push(this.c1[x]); } }
    return s;
  }

  account(runIn, vert, toSea) {
    this.flux.runoff = runIn; this.flux.vertical = vert; this.flux.toSea = toSea;
    this.total.runoff += runIn; this.total.vertical += vert; this.total.toSea += toSea;
  }

  /**
   * The closure: every lake at its balance, full ones passing their surplus on, over the
   * dt years the call stands for (the salt flats' memory decays over it). In `flux`, the
   * runoff in and the overflow to the sea are over dt, and `vertical` closes the books:
   * the lakes' evaporation less rain over dt, plus the jump in storage to the balance.
   */
  equilibrium(runoff, pe, dt = 0) {
    if (!this.built) return;
    this.forcing(runoff, pe);
    const before = this.storage();
    this.inb.fill(0);
    if (!this.J || this.J.length < this.nb) this.J = new Float64Array(this.nb);
    // Each node's subtree, in nodes (a merge's node comes after its children's).
    if (!this.nsub || this.nsub.length < this.nb) this.nsub = new Int32Array(this.c0.length);
    for (let b = 0; b < this.nb; b++) this.nsub[b] = this.c0[b] < 0 ? 1 : 1 + this.nsub[this.c0[b]] + this.nsub[this.c1[b]];
    let toSea = 0, runIn = 0;
    for (const q of this.regOrder) {
      const root = this.regRoot[q], o = this.eqSolve(root);
      if (o > 0) { const t = this.link[root]; if (t < 0) toSea += o; else this.inb[t] += o; }
      this.regIn[q] = this.J[root]; this.regOut[q] = Math.max(0, o);
    }
    for (let b = 0; b < this.nb; b++) if (this.c0[b] < 0) runIn += this.I[b];
    this.account(runIn * dt, (toSea - runIn) * dt + this.storage() - before, toSea * dt);
    this.refresh(dt, true);
    this.remember(1, 1);
  }

  /** Node b at balance under the leaves' inflows I + inb (km³/yr). Returns its overflow (km³/yr). */
  eqSolve(b) {
    const { c0, c1, link, spill, inb, J, wts } = this;
    if (c0[b] < 0) {
      J[b] = this.I[b] + inb[b];
      if (!(J[b] > 0)) { this.W[b] = 0; this.level[b] = this.hmin[b]; return 0; }
      this.eval(b, spill[b], wts);
      if (J[b] - this._L >= 0) { this.W[b] = this.cap[b]; this.level[b] = spill[b]; return J[b] - this._L; }
      const h = this.solveLevel(b, 0, J[b], 1, this.hmin[b], spill[b], this.level[b]);
      this.eval(b, h, null);
      this.W[b] = Math.min(this.cap[b], this._V); this.level[b] = h;
      return 0;
    }
    // The smaller child first, and the other solved with its overflow if it has one; the smaller is
    // solved again only when the larger overflows into it. (Solving both and then one again took
    // 2^depth solves down a chain of nested basins: 78 deep, the engine hung.) A child that
    // overflows without the other's water overflows with it too, full throughout either way, so
    // only its inflow J counts the extra, which J[b] (the children's own inflows) takes back out.
    let a = c0[b], c = c1[b];
    if (this.nsub[a] > this.nsub[c]) { const t = a; a = c; c = t; }
    let oa = this.eqSolve(a), oc, Jb;
    if (oa > 0) { inb[link[a]] += oa; oc = this.eqSolve(c); inb[link[a]] -= oa; Jb = J[a] + (J[c] - oa); }
    else {
      oc = this.eqSolve(c);
      if (oc > 0) { inb[link[c]] += oc; oa = this.eqSolve(a); inb[link[c]] -= oc; Jb = (J[a] - oc) + J[c]; }
      else Jb = J[a] + J[c];
    }
    J[b] = Jb;
    if (!(oa > 0 && oc > 0)) { this.W[b] = 0; return 0; }
    this.eval(b, spill[b], wts);
    if (Jb - this._L >= 0) { this.W[b] = this.capOwn[b]; this.level[b] = spill[b]; return Jb - this._L; }
    const h = this.solveLevel(b, 0, Jb, 1, this.merge[b], spill[b], this.level[b]);
    this.eval(b, h, null);
    this.W[b] = Math.min(this.capOwn[b], Math.max(0, this._V - this.cap[a] - this.cap[c]));
    this.level[b] = h;
    return 0;
  }

  /** km³ held in every lake. */
  storage() { let s = 0; for (let b = 0; b < this.nb; b++) s += this.W[b]; return s; }

  /**
   * Per-cell fields and per-node outputs from the state: each lake's level, its cells' wet
   * share and depth, the salt flats' memory over dt years (and, in the closure, the
   * fringe a wetter year would flood).
   */
  refresh(dt, closure) {
    const { z, areaKm: A, cells, cellOff, depth, wet, under, salt, mem, regCells } = this;
    const ramp = this.ramp, decay = Math.exp(-dt / LAKES.SALT_TAU);
    const lakeId = this.lakeId;
    for (let k = 0; k < regCells.length; k++) { const i = regCells[k]; depth[i] = 0; wet[i] = 0; under[i] = 0; salt[i] = 0; lakeId[i] = -1; }
    this.flags();
    this.state.fill(0);
    const act = [], lakes = [];
    for (let q = 0; q < this.nr; q++) for (const b of this.activeIn(q, act)) lakes.push(b);
    const fringe = this.fringe || (this.fringe = new Float32Array(this.n));
    for (const b of lakes) {
      const V = this.held(b);
      const lo = this.c0[b] < 0 ? this.hmin[b] : this.merge[b];
      const h = V > 0 ? (this.fullF[b] ? this.spill[b] : this.solveLevel(b, 1, V, 0, this.hmin[b], this.spill[b], this.level[b])) : lo;
      this.level[b] = Math.max(h, this.hmin[b]);
      this.eval(b, h, null);
      this.volume[b] = V; this.areaB[b] = this._A;
      this.state[b] = this.fullF[b] ? 2 : 1;
      for (let k = cellOff[b], e = cellOff[b + 1]; k < e; k++) {
        const i = cells[k], x = h - z[i];
        if (!(x > 0)) break;
        const R = ramp[i], f = Math.min(1, x / R);
        wet[i] = f; depth[i] = x >= R ? x - R / 2 : x * f / 2; under[i] = f > 0.5 ? 1 : 0; lakeId[i] = b;
      }
      // The closure's spread: the level a closed lake would hold with WET more inflow.
      if (closure && !this.fullF[b] && this.J && this.J[b] > 0) {
        const hw = this.solveLevel(b, 0, this.J[b] * (1 + LAKES.WET), 1, this.hmin[b], this.spill[b], h);
        for (let k = cellOff[b], e = cellOff[b + 1]; k < e; k++) {
          const i = cells[k], x = hw - z[i];
          if (!(x > 0)) break;
          fringe[i] = Math.min(1, x / ramp[i]);
        }
      }
    }
    // Memory, and salt where a closed basin's floor has dried.
    for (let k = 0; k < regCells.length; k++) {
      const i = regCells[k];
      mem[i] = Math.max(wet[i], mem[i] * decay);
    }
    for (const b of lakes) {
      if (this.fullF[b]) continue;
      for (let k = cellOff[b], e = cellOff[b + 1]; k < e; k++) {
        const i = cells[k];
        salt[i] = Math.max(0, Math.max(mem[i], fringe[i]) - wet[i]);
        fringe[i] = 0;
      }
    }
    this.lakeNodes = lakes;
  }

  /** km³ of water on each cell, from the current lakes. */
  cellWater() {
    const w = new Float64Array(this.n), { z, areaKm: A, cells, cellOff } = this;
    const ramp = this.ramp;
    for (const b of this.lakeNodes || []) {
      if (!(this.held(b) > 0)) continue;
      const h = this.level[b];
      let sum = 0, m = cellOff[b];
      for (let k = cellOff[b], e = cellOff[b + 1]; k < e; k++, m++) {
        const i = cells[k], x = h - z[i];
        if (!(x > 0)) break;
        const R = ramp[i];
        sum += A[i] * (x >= R ? x - R / 2 : x * x / (2 * R));
      }
      // The level is solved to rounding; scale so the cells carry exactly what the lake held (this
      // lake's share only: scaling a cell's whole sum had also scaled another lake's water on it).
      const s = sum > 0 ? this.held(b) / sum : 0;
      for (let k = cellOff[b]; k < m; k++) {
        const i = cells[k], x = h - z[i], R = ramp[i];
        w[i] += s * A[i] * (x >= R ? x - R / 2 : x * x / (2 * R));
      }
    }
    return w;
  }

  /** Lay carried water (km³ per cell) into the new basins, upstream first. Returns km³ to the sea. */
  carry(w) {
    const add = new Float64Array(this.nb), n = this.n;
    let toSea = 0;
    for (let i = 0; i < n; i++) {
      if (!(w[i] > 0)) continue;
      const t = this.leafOf[i] >= 0 ? this.leafOf[i] : this.catch[i];
      if (t < 0) toSea += w[i]; else add[t] += w[i];
    }
    for (const q of this.regOrder) {
      const root = this.regRoot[q];
      for (let b = this.regNode0[q], e = this.regNode0[q + 1]; b < e; b++) {
        if (!(add[b] > 0)) continue;
        const left = this.rise(b, add[b], root);
        add[b] = 0;
        if (left > 0) { const t = this.link[root]; if (t < 0) toSea += left; else add[t] += left; }
      }
    }
    // Cells that left every depression forget their water.
    for (let i = 0; i < n; i++) if (this.regOf[i] < 0) this.mem[i] = 0;
    return toSea;
  }

  /**
   * The lakes' algae (synthesis on standard forms): each region's phosphorus by Vollenweider's mass
   * balance, TP = (load + P_DEP) / (q_out + V_SETTLE), the load what its catchment's runoff carries
   * (cIn, µg/L per cell, from the rocks' weathering) over its water's area (mg m⁻² yr⁻¹), q_out
   * its outflow over its area (m/yr): flushed lakes keep little of it, closed ones all but what
   * settles (a soda lake is rich). Production PP_MAX × TP/(TP + K_TP) × the open, warm season
   * (each month's share of open water, by its mean above 0 °C, × EPPLEY^{T − 20}). Writes g C m⁻²
   * yr⁻¹ on each wet cell into out (0 elsewhere); returns the lakes' total (Pg C/yr).
   */
  production(cIn, runoff, T12, out = new Float32Array(this.n)) {
    const n = this.n, A = this.areaKm, ca = this.catch, P = LAKES;
    out.fill(0);
    if (!this.built || !this.lakeNodes || !this.lakeNodes.length) return 0;
    const nr = this.nr, load = this.pLoad && this.pLoad.length === nr ? this.pLoad.fill(0) : (this.pLoad = new Float64Array(nr));
    const area = this.pArea && this.pArea.length === nr ? this.pArea.fill(0) : (this.pArea = new Float64Array(nr));
    for (let i = 0; i < n; i++) { const t = ca[i]; if (t >= 0 && runoff[i] > 0) load[this.region[t]] += A[i] * runoff[i] * 1e-3 * cIn[i]; }   // km³/yr × µg/L
    for (const b of this.lakeNodes) if (this.volume[b] > 0) area[this.region[b]] += this.areaB[b];
    let total = 0;
    for (const b of this.lakeNodes) {
      if (!(this.volume[b] > 0) || !(this.areaB[b] > 0)) continue;
      const q = this.region[b], a = area[q];
      const tp = (1e3 * load[q] / a + P.P_DEP) / (1e3 * Math.max(0, this.regOutY[q]) / a + P.V_SETTLE);
      // The season over the lake's wet cells.
      let s = 0, w = 0;
      for (let k = this.cellOff[b], e = this.cellOff[b + 1]; k < e; k++) {
        const i = this.cells[k];
        if (this.lakeId[i] !== b || !(this.wet[i] > 0)) continue;
        let m12 = 0;
        for (let m = 0; m < 12; m++) { const T = T12[12 * i + m]; m12 += Math.max(0, Math.min(1, T / 2)) * Math.pow(P.EPPLEY, T - 20); }
        s += A[i] * this.wet[i] * m12 / 12; w += A[i] * this.wet[i];
      }
      if (!(w > 0)) continue;
      const pp = P.PP_MAX * (s / w) * tp / (tp + P.K_TP);
      for (let k = this.cellOff[b], e = this.cellOff[b + 1]; k < e; k++) { const i = this.cells[k]; if (this.lakeId[i] === b && this.wet[i] > 0) out[i] = pp; }
      total += pp * w * 1e6 * 1e-15;   // g C/yr over km² → Pg C/yr
    }
    return total;
  }

  /** The lakes now: node, level (km), area (km²), volume (km³), spilling, and the wet cells. */
  list() {
    const out = [];
    for (const b of this.lakeNodes || []) {
      if (!(this.volume[b] > 0)) continue;
      out.push({ node: b, level: this.level[b], area: this.areaB[b], volume: this.volume[b], spilling: this.state[b] === 2, region: this.region[b] });
    }
    return out;
  }

  /** Counts for figures and tests: lakes with water, their area, how many are closed, the largest. */
  stats(minArea = 0) {
    const L = this.list().filter(l => l.area > minArea);
    let area = 0, volume = 0, closed = 0, big = null;
    for (const l of L) { area += l.area; volume += l.volume; if (!l.spilling) closed++; if (!big || l.area > big.area) big = l; }
    let saltArea = 0;
    for (let k = 0; k < this.regCells.length; k++) { const i = this.regCells[k]; saltArea += this.salt[i] * this.areaKm[i]; }
    return { lakes: L.length, area, volume, closed, largest: big, saltArea, basins: this.nb, regions: this.nr };
  }
}
