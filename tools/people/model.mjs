// People, from the first hominins to the takeoff: the headless prototype of Roadmap 2.0
// (docs/PLAN.md). It reads a settled planet's fields (./planet.mjs) and holds them fixed; nothing
// writes back yet. Marks as in the plan: standard, synthesis, speculation.
//
// One loop (Kremer's, standard; Kremer 1993, from memory): minds make ideas, ideas raise what the
// land carries, and what it carries makes minds. Here:
//
//   culture   z, in e-folds of productivity, per lineage and cell. Ideas come from the minds a cell
//             can learn from, M (the collective brain: Henrich 2004, from memory), at A e^g M^ψ a
//             year, and are lost at λ z (imperfect copying; Tasmania's loss over ~10 kyr sets λ).
//             A is Kremer's constant (von Foerster's C = 1/(θA)). Social reach g is a lineage's
//             trait, rising as a clock (speculation): it lengthens contact and raises foraging's
//             yield (e^{K_G g}). With ψ = 1 and a capacity ∝ e^{θz}, the
//             loop's population runs as 1/(t* − t), von Foerster's hyperbola (standard algebra).
//             Below a threshold in A e^g M/λ the loop has a low fixed point (a saddle-node's: a
//             M₀ θ e > λ is where it vanishes, synthesis), so a branch "tips" when the minds within
//             its reach pass ~λ/(Aθe), about a million: Henrich's collective brain as a threshold.
//   minds     M: the minds within reach. People pass ideas over a contact length ℓ, which the
//             trait and culture lengthen (ℓ = L_C0 e^{(g + z)/Z_L}: band networks, exchange networks,
//             then the world), within the connected body they live in (inhabited land, and with
//             boats narrow seas; deserts, ice and the open sea cut it): M = N_C (1 − e^{−πℓ²ρ/N_C}),
//             the local minds' density ρ over a disc of radius ℓ, saturating at the body's total N_C
//             (synthesis). Minds are people × research intensity (rising with income), the other
//             lineages' at η, and compute's (stage 14).
//   people    a density per lineage, Lotka–Volterra competition in one niche, r N_k (1 − N_all/K_k),
//             solved exactly (the cell's total logistic to the harmonic mean of the capacities, the
//             shares by replicator dynamics), so the higher capacity excludes the lower (standard);
//             income y = K/N above or below subsistence; Fisher–KPP spread (standard: a front at
//             ~2√(rD), less Bramson's delay) with
//             slope, the sea's width and the capacity's zero as barriers. Growth falls with the
//             income industry brings (the demographic transition: Galor and Weil, from memory;
//             synthesis here): once productivity outruns r, income rises and the loop breaks.
//   capacity  K = area × cold limit(z) × [(1 − f) b P_F(z) + f a s P_A(z)]: foraging's base density
//             b from the accessible NPP, water and the coast, its productivity P_F capped at CAP_F
//             (the land's wild food); farming's a from the crops' Miami NPP and the arable share,
//             its P_A capped by the organic economy (Wrigley, from memory) until fossil energy
//             lifts it; f the farmed share, s the package's suitability.
//   farming   an origin hazard where people are settled near foraging's ceiling, know enough
//             (z ≥ Z_FARM) and have domesticates (the zones' seasonally dry climates: after
//             Blumler via Diamond, from memory); packages spread by contact, slowed by the climate's
//             distance from where they began (so east–west axes may or may not win: a test).
//   industry  where z passes Z_IND near coal, the organic ceiling lifts; fossil carbon comes from a
//             map seeded on the opening's lowland basins and shelves (a9, 2026-11-15); energy is
//             E_SUB per subsistence unit of output; emissions go to the air through a three-
//             exponential response fitted to the Pulse experiment's shares (synthesis).
//   compute   past Z_AI, output buys minds at χ(z) per unit, rising e-fold per unit of z up to a
//             physical ceiling X_MAX (speculation); total energy is capped at F_SUN of absorbed
//             sunlight (output scaled to fit), and its waste heat over B is the radiator's warming
//             (the energy balance's B; standard). Both ceilings are inputs: the radiator's 5.6 K is
//             F_SUN read back, not a result.
//   lineages  a lineage whose range stays broken into isolated pieces for T_SPLIT splits; gene flow
//             where lineages meet mixes their traits and ancestry, and two that keep sharing most of
//             the smaller's range for T_MERGE become one (soft species, synthesis). The first
//             hominins are placed in the best tree–grass mosaic on the landmass that can hold the
//             most of them (speculation).
//
// Units: years, km, people, z in e-folds; energy in W; carbon in Pg C.
import { NZ } from '../../src/engine/climate.js';
import { miami } from '../../src/engine/vegetation.js';
import { stream } from '../../src/rng.js';

export const PEOPLE = {
  // Habitat (synthesis)
  B0: 0.03, NPP_REF: 0.4,          // foragers per km² at NPP_REF kg C m⁻² yr⁻¹ of accessible NPP (Binford's order, from memory)
  TREE_EDIBLE: 0.4,                // trees' NPP's share a forager reaches, against grass's
  COAST: 0.5, P_DRY: 250, Q_RIVER: 200, ICE_MAX: 10,   // the coast's bonus; rain (mm) below which water limits; a river (m³/s); ice (m)
  T_COLD0: 2, K_COLD: 5, W_COLD: 3, // coldest month (°C) a culture of z holds: T_COLD0 − K_COLD z, over W_COLD
  CAP_F: 8,                        // foraging's ceiling on the base density
  F0: 1.5, CAP_A: 40,              // farmers per km² at adoption (at NPP_REF), and the organic economy's ceiling on its growth
  // People
  R0: 0.02,                        // logistic rate (/yr)
  D0: 4, D_Z: 0.35, D_MAX: 3000, H_SLOPE: 1.5,   // dispersal km²/yr, its rise per unit z, cap; relief's cost (km)
  Y_DT: 2,                         // income (in subsistence) over which growth fades: the demographic transition
  // Ideas
  THETA: 1, A_INV: 6e-12, PSI: 1, LAMBDA: 1e-5, ETA: 0.3,   // A: von Foerster's C = 1/(θA) ≈ 1.7e11 person-years; λ: Tasmania's loss (~10% in 10 kyr)
  L_C0: 50, Z_L: 1.5, L_CMAX: 2e4,  // contact length (km) at g + z = 0, ×e per Z_L, at most
  V0: 1, Z_V: 1.5,                  // copying's pace ×e per Z_V of culture
  COPY: 2e-3, ACC: 2e-3,           // copying better neighbours, and other lineages in the cell (/yr at z = 0)
  RHO_R: 0.5, S_R_MAX: 3,          // research intensity ∝ y^ρ, capped
  Z_BOAT: 1.5, L_SEA: 300, HOPS: 6, // sea crossings: the reach (km per unit z past Z_BOAT); cells of sea a crossing spans at most
  // The trait (speculation: learning capacity as a clock)
  V_G: 2e-3, T_GEN: 25, S_BG: 0.04, NE_SHARE: 0.1, G_MAX: 9,   // the trait lengthens contact (social reach), up to G_MAX (ℓ at L_CMAX)
  K_G: 0.1,                        // … and raises foraging's yield, e^{K_G g} (cooking, hunting: speculation)
  // Lineages
  L_MAX: 12, CHECK: 10e3, T_SPLIT: 200e3, P_MIN: 3000, N_MIN: 0.003, P_EXT: 100, GENE_FLOW: 2e-3,   // N_MIN per km²
  MERGE: 0.5, T_MERGE: 50e3,       // lineages sharing this much of the smaller's range for T_MERGE become one
  // Farming
  Z_FARM: 3, W_FARM: 0.25, H_FARM: 2e-6, SED: 0.6, R_ADOPT: 0.02, C_FARM: 4e-3, W_PKG: 2,
  DOMESTIC: { Af: 0.1, Am: 0.2, Aw: 0.5, As: 0.5, BS: 0.5, Cf: 0.3, Cs: 1, Cw: 0.7, Df: 0.1, Ds: 0.2, Dw: 0.2 },
  // Industry
  Z_IND: 7, COAL_MIN: 5, C_IND: 4e-3, R_IND: 0.05, FOSSIL: 5000, COAL_SHARE: 0.6,
  E_SUB: 200, J_PGC: 4e19, Z_REN: 10, W_REN: 1, CO2_0: 280,
  // Compute (speculation)
  Z_AI: 11, X_AI: 1e-3, THETA_AI: 1, X_MAX: 1e3,
  // Energy and heat
  B_EBM: 2.09, SUN_ABS: 1.2e17, F_SUN: 0.05,
  // Stepping
  DT_MAX: 500, DZ_MAX: 0.05, DT_MIN: 1e-5, NSUB_MAX: 4,
};
const ZN = ['Af', 'Am', 'Aw', 'As', 'BW', 'BS', 'Cf', 'Cs', 'Cw', 'Df', 'Ds', 'Dw', 'ET', 'EF'];
const R = 6371, YEAR_S = 3.156e7;
const sig = x => 1 / (1 + Math.exp(-x));
const deg = r => r * 180 / Math.PI;

export class People {
  constructor(planet, params = {}) {
    this.P = { ...PEOPLE, ...params };
    this.planet = planet;
    this.rng = stream(planet.seed, 'people');
    this.t = 0; this.events = []; this.history = []; this.lineages = []; this.nextId = 0;
    this.habitat(); this.graph(); this.fossilMap();
    const nL = this.nL;
    this.f = new Float32Array(nL); this.pkg = new Int16Array(nL).fill(-1); this.packages = [];
    this.ind = new Float32Array(nL);
    this.Ntot = new Float64Array(nL); this.Out = new Float64Array(nL); this.AI = new Float64Array(nL);
    this.fossil = this.P.FOSSIL; this.emitted = 0; this.co2Box = [0, 0, 0];
    this.energy = 0; this.capFactor = 1; this.flags = {}; this.supply = 1; this.ren = 0; this.co2 = this.P.CO2_0; this.O = 0; this.people = 0; this.carbonRate = 0;
    this.lastRate = 0;
  }

  // ---- The planet, read once -------------------------------------------------------------
  habitat() {
    const P = this.P, pl = this.planet, g = pl.grid, n = g.n;
    const loc = new Int32Array(n).fill(-1), cells = [];
    for (let i = 0; i < n; i++) if (pl.elev[i] > 0 && pl.ice[i] < P.ICE_MAX) { loc[i] = cells.length; cells.push(i); }
    const nL = cells.length;
    Object.assign(this, { loc, cells: Int32Array.from(cells), nL });
    const H = this.H = {
      area: new Float64Array(nL), b: new Float64Array(nL), a: new Float64Array(nL), Tc: new Float64Array(nL),
      D: new Float64Array(nL), coast: new Uint8Array(nL), lat: new Float64Array(nL), lon: new Float64Array(nL),
      elev: new Float64Array(nL), zv: new Float32Array(14 * nL), deg: new Uint8Array(nL), mosaic: new Float64Array(nL),
    };
    const dw = ZN.map(z => P.DOMESTIC[z] || 0);
    for (let c = 0; c < nL; c++) {
      const i = cells[c];
      H.area[c] = g.area[i] * R * R;
      let Ta = 0, Pa = 0, Tc = 99;
      for (let m = 0; m < 12; m++) { const T = pl.T12[12 * i + m]; Ta += T / 12; Pa += pl.P12[12 * i + m]; Tc = Math.min(Tc, T); }
      const ft = pl.ft[i], fg = pl.fg[i];
      const river = pl.discharge[i] > P.Q_RIVER || pl.lake[i] > 0.05;
      const water = river ? 1 : Math.min(1, Pa / P.P_DRY);
      let coast = 0;
      for (let o = g.nbrOff[i]; o < g.nbrOff[i + 1]; o++) if (!(pl.elev[g.nbr[o]] > 0)) coast = 1;
      const acc = pl.npp[i] * (fg + P.TREE_EDIBLE * ft);
      H.b[c] = P.B0 * acc / P.NPP_REF * water * (1 + P.COAST * coast);
      const nppPot = 0.45e-3 * miami(Ta, Pa);
      const arable = (1 - pl.perma[i]) * (pl.elev[i] < 3 ? 1 : 0.3) * (river ? 1 : Math.min(1, Pa / 400));
      H.a[c] = P.F0 * nppPot / P.NPP_REF * arable;
      H.Tc[c] = Tc; H.coast[c] = coast; H.elev[c] = pl.elev[i];
      H.deg[c] = g.nbrOff[i + 1] - g.nbrOff[i];
      let D = 0, zz = 0;
      for (let k = 0; k < 14; k++) { const p = pl.zones[NZ * i + k]; D += dw[k] * p; zz += p * p; }
      H.D[c] = D;
      zz = Math.sqrt(zz) || 1;
      for (let k = 0; k < 14; k++) H.zv[14 * c + k] = pl.zones[NZ * i + k] / zz;
      const x = g.pos[3 * i], y = g.pos[3 * i + 1], z = g.pos[3 * i + 2];
      H.lat[c] = Math.asin(z); H.lon[c] = Math.atan2(y, x);
      H.mosaic[c] = H.b[c] * 4 * ft * fg * sig((Tc - P.T_COLD0 - 10) / P.W_COLD);
    }
  }

  // Edges between land cells (with the relief's cost) and crossings of up to HOPS sea cells (with
  // their length), in one CSR.
  graph() {
    const P = this.P, pl = this.planet, g = pl.grid, { loc, cells, nL } = this;
    const lists = Array.from({ length: nL }, () => []);
    for (let c = 0; c < nL; c++) {
      const i = cells[c];
      for (let o = g.nbrOff[i]; o < g.nbrOff[i + 1]; o++) {
        const j = g.nbr[o], d = loc[j];
        if (d < 0) continue;
        lists[c].push([d, g.ell[o] / g.dist[o], Math.exp(-Math.abs(pl.elev[i] - pl.elev[j]) / P.H_SLOPE), g.dist[o] * R, 0]);
      }
    }
    // Crossings: a breadth-first walk through open sea from each coastal cell.
    const seen = new Int32Array(g.n).fill(-1), dkm = new Float64Array(g.n);
    let hopEdges = 0;
    for (let c = 0; c < nL; c++) {
      if (!this.H.coast[c]) continue;
      const i = cells[c], best = new Map();
      let front = [i]; seen[i] = c; dkm[i] = 0;
      for (let h = 1; h <= P.HOPS + 1 && front.length; h++) {
        const next = [];
        for (const u of front) for (let o = g.nbrOff[u]; o < g.nbrOff[u + 1]; o++) {
          const v = g.nbr[o];
          if (seen[v] === c) continue;
          const isLand = pl.elev[v] > 0;
          if (isLand) {
            if (u === i) continue;   // a neighbour by land: already an edge
            const d = loc[v];
            if (d >= 0 && d !== c) { const L = dkm[u] + g.dist[o] * R; if (!best.has(d) || best.get(d)[1] > L) best.set(d, [h - 1, L]); }
            continue;
          }
          if (h > P.HOPS) continue;
          seen[v] = c; dkm[v] = dkm[u] + g.dist[o] * R; next.push(v);
        }
        front = next;
      }
      for (const [d, [hops, L]] of best) if (hops >= 1) { lists[c].push([d, 1, 1, L, hops]); hopEdges++; }
    }
    const off = new Int32Array(nL + 1);
    for (let c = 0; c < nL; c++) off[c + 1] = off[c] + lists[c].length;
    const m = off[nL], E = { off, nb: new Int32Array(m), cond: new Float64Array(m), slope: new Float64Array(m), km: new Float64Array(m), hop: new Uint8Array(m) };
    for (let c = 0; c < nL; c++) lists[c].forEach(([d, cd, s, km, hop], k) => { const o = off[c] + k; E.nb[o] = d; E.cond[o] = cd; E.slope[o] = s; E.km[o] = km; E.hop[o] = hop; });
    this.E = E; this.hopEdges = hopEdges;
    // The same edges once each, flat, for the spread.
    const fa = [], fb = [], fk = [], fh = [];
    for (let c = 0; c < nL; c++) for (let o = off[c]; o < off[c + 1]; o++) if (E.nb[o] > c) {
      fa.push(c); fb.push(E.nb[o]); fh.push(E.hop[o]); fk.push(E.hop[o] ? E.km[o] : E.cond[o] * E.slope[o]);
    }
    this.F = { a: Int32Array.from(fa), b: Int32Array.from(fb), k: Float64Array.from(fk), hop: Uint8Array.from(fh), m: fa.length };
    // Each cell's one ring by land (itself and its land neighbours): its area, for the minds' density.
    this.ringArea = new Float64Array(nL);
    for (let c = 0; c < nL; c++) { let A = this.H.area[c]; for (let o = off[c]; o < off[c + 1]; o++) if (!E.hop[o]) A += this.H.area[E.nb[o]]; this.ringArea[c] = A; }
    this.dx = 0; let k = 0;
    for (let o = 0; o < m; o++) if (!E.hop[o]) { this.dx += E.km[o]; k++; }
    this.dx /= k;
  }

  // The seeded fossil carbon (a9, 2026-11-15): coal in wet, forested lowlands, oil on the shelves,
  // each cell's share lognormal about its setting's weight (synthesis). Coal within reach of a land
  // cell is the resolvent of the coal over the land at τ 0.85 (a few cells).
  fossilMap() {
    const P = this.P, pl = this.planet, g = pl.grid, { nL, cells, E } = this, r = stream(pl.seed, 'people:fossil');
    const coal = this.coal = new Float64Array(nL);
    let cs = 0, os = 0;
    for (let c = 0; c < nL; c++) {
      const i = cells[c], e = pl.elev[i];
      if (e < 0.6) coal[c] = pl.ft[i] * pl.npp[i] * (0.6 - e) * Math.exp(1.2 * r.normal());
      cs += coal[c];
    }
    for (let i = 0; i < g.n; i++) if (pl.elev[i] <= 0 && pl.elev[i] > -0.25) os += Math.exp(1.2 * r.normal());
    for (let c = 0; c < nL; c++) coal[c] *= P.FOSSIL * P.COAL_SHARE / cs;
    this.oilTotal = P.FOSSIL * (1 - P.COAL_SHARE); this.shelfCells = os;
    const reach = this.coalReach = Float64Array.from(coal);
    for (let s = 0; s < 40; s++) for (let c = 0; c < nL; c++) {
      let acc = coal[c];
      for (let o = E.off[c]; o < E.off[c + 1]; o++) if (!E.hop[o]) acc += 0.85 / this.H.deg[c] * reach[E.nb[o]];
      reach[c] = acc;
    }
  }

  // ---- Lineages ---------------------------------------------------------------------------
  newLineage(parent, born, g) {
    const nL = this.nL, id = this.nextId++;
    const L = { id, parent: parent ? parent.id : -1, born, died: null, g, anc: new Map([[id, 1]]),
      N: new Float64Array(nL), Z: new Float64Array(nL), M: new Float64Array(nL), K: new Float64Array(nL),
      total: 0, zbar: 0, zmax: 0, peak: 0, multiSince: null, tipped: null, lat: 0, lon: 0 };
    this.lineages.push(L);
    return L;
  }
  // The first hominins: the best tree–grass mosaic on the landmass that can hold the most of them
  // (a radiation of apes lives on a continent, not an islet).
  seed() {
    const H = this.H, nL = this.nL, body = this.components(() => true, 0);
    const room = new Float64Array(body.count);
    for (let c = 0; c < nL; c++) room[body.id[c]] += H.area[c] * H.b[c] * this.coldOK(c, 0);
    let home = 0; for (let k = 1; k < body.count; k++) if (room[k] > room[home]) home = k;
    let best = -1;
    for (let c = 0; c < nL; c++) if (body.id[c] === home && (best < 0 || H.mosaic[c] > H.mosaic[best])) best = c;
    const L = this.newLineage(null, 0, 0);
    L.lat = H.lat[best]; L.lon = H.lon[best];
    const E = this.E, seedCells = [best];
    for (let o = E.off[best]; o < E.off[best + 1]; o++) if (!E.hop[o]) seedCells.push(E.nb[o]);
    for (const c of seedCells) L.N[c] = 0.5 * H.area[c] * H.b[c];
    this.event('origin', `the first hominins at ${deg(L.lat).toFixed(0)}°, ${deg(L.lon).toFixed(0)}° (b ${H.b[best].toFixed(3)}/km²)`);
    return L;
  }
  event(kind, text) { this.events.push({ t: this.t, kind, text }); if (this.onEvent) this.onEvent(this.t, kind, text); }

  // ---- The step ---------------------------------------------------------------------------
  coldOK(c, z) { const P = this.P; return sig((this.H.Tc[c] - (P.T_COLD0 - P.K_COLD * z)) / P.W_COLD); }
  capacity(L) {
    const P = this.P, H = this.H, nL = this.nL, K = L.K, f = this.f, ind = this.ind, eg = Math.exp(P.K_G * L.g);
    for (let c = 0; c < nL; c++) {
      const z = L.Z[c], ez = Math.exp(Math.min(P.THETA * z, 300));
      const PF = ez / (1 + (ez - 1) / P.CAP_F);
      let farm = 0;
      if (f[c] > 0) {
        const x = Math.exp(Math.min(P.THETA * (z - P.Z_FARM), 300)), cap = x / (1 + (x - 1) / P.CAP_A);
        const PA = (1 - ind[c]) * cap + ind[c] * (cap + (x - cap) * this.supply);
        farm = f[c] * H.a[c] * this.suit(this.pkg[c], c) * PA;
      }
      K[c] = H.area[c] * this.coldOK(c, z) * ((1 - f[c]) * H.b[c] * PF * eg + farm) * this.capFactor;
    }
  }
  suit(q, c) {
    if (q < 0) return 0;
    const o = this.packages[q].zv, zv = this.H.zv; let s = 0;
    for (let k = 0; k < 14; k++) s += o[k] * zv[14 * c + k];
    return Math.pow(Math.max(0, s), this.P.W_PKG);
  }
  reachL(gz) { const P = this.P; return Math.min(P.L_CMAX, P.L_C0 * Math.exp(Math.max(0, gz) / P.Z_L)); }
  speed(z) { const P = this.P; return P.V0 * Math.exp(Math.min(z, 60) / P.Z_V); }
  Dz(z) { const P = this.P; return Math.min(P.D_MAX, P.D0 * Math.exp(P.D_Z * z)); }
  seaReach(z) { const P = this.P; return z > P.Z_BOAT ? P.L_SEA * (z - P.Z_BOAT) : 0; }

  step(dtWanted) {
    const P = this.P, H = this.H, E = this.E, nL = this.nL, live = this.lineages.filter(L => L.died === null);
    const Ntot = this.Ntot, prof = this.prof || (this.prof = {});
    let tq = performance.now();
    const lap = k => { const t1 = performance.now(); prof[k] = (prof[k] || 0) + t1 - tq; tq = t1; };
    this.compCache = new Map();
    // Capacity and the cells' totals.
    Ntot.fill(0);
    for (const L of live) { this.capacity(L); for (let c = 0; c < nL; c++) Ntot[c] += L.N[c]; }
    const dt = dtWanted;
    // People: Lotka–Volterra competition with α = 1 (one niche), dN_k/dt = r N_k (1 − N_all/K_k).
    // Exactly: the cell's total is logistic toward the harmonic mean of its lineages' capacities,
    // and each lineage's share moves as d ln(N_k/N_l)/dt = r N_all (1/K_l − 1/K_k), so the higher
    // capacity excludes the lower (standard). Growth fades past the transition by income y = K/N_all
    // where industry lifted it (an empty frontier's high income is land, and frontiers grow fast;
    // Galor and Weil tie the transition to industry's demand for skill, from memory).
    const lw = this.lw || (this.lw = new Float64Array(live.length * 0 + 64));
    for (let c = 0; c < nL; c++) {
      const Nt = Ntot[c];
      if (!(Nt > 1e-6)) { for (const L of live) L.N[c] = 0; continue; }
      let inv = 0;
      for (const L of live) if (L.N[c] > 0) inv += L.N[c] / Nt / Math.max(L.K[c], 1e-12);
      const Kh = 1 / inv, y = Kh / Nt;
      const r = P.R0 * (y > 1 ? Math.exp(-this.ind[c] * (y - 1) / P.Y_DT) : 1);
      let Nn;
      if (Kh > 1e-9) { const e = Math.exp(Math.min(50, r * dt)); Nn = Kh * Nt * e / (Kh + Nt * (e - 1)); }
      else Nn = Nt * Math.exp(-dt / 20);
      const Nbar = 0.5 * (Nt + Nn);
      let mx = -Infinity;
      live.forEach((L, k) => { lw[k] = L.N[c] > 0 ? Math.log(L.N[c]) - r * Nbar * dt / Math.max(L.K[c], 1e-12) : -Infinity; if (lw[k] > mx) mx = lw[k]; });
      let sw = 0;
      live.forEach((L, k) => { lw[k] = lw[k] === -Infinity ? 0 : Math.exp(lw[k] - mx); sw += lw[k]; });
      live.forEach((L, k) => { const v = Nn * lw[k] / sw; L.N[c] = v > 1e-6 ? v : 0; });
    }
    lap('growth');
    // Spread: Fisher–KPP, culture carried with the migrants (upwind).
    if (this.debug) this.check('growth', live);
    for (const L of live) this.diffuse(L, dt);
    if (this.debug) this.check('spread', live);
    lap('spread');
    Ntot.fill(0);
    for (const L of live) for (let c = 0; c < nL; c++) Ntot[c] += L.N[c];
    // Output, income and compute's minds.
    this.economy(live, dt);
    if (this.debug) this.check('economy', live);
    lap('economy');
    // Minds within reach, and culture.
    let rate = 0;
    for (const L of live) rate = Math.max(rate, this.culture(L, live, dt));
    this.lastRate = rate;
    if (this.debug) this.check('culture', live);
    lap('culture');
    // The trait, gene flow, farming, industry, the books.
    this.trait(live, dt); lap('trait');
    this.farming(live, dt); lap('farming');
    this.industry(live, dt);
    this.t += dt;
    if (Math.floor(this.t / P.CHECK) !== Math.floor((this.t - dt) / P.CHECK)) this.books();
    this.record(live, dt); lap('books');
    return dt;
  }

  check(phase, live) {
    const bad = a => { for (let i = 0; i < a.length; i++) if (!Number.isFinite(a[i])) return i; return -1; };
    for (const L of live) for (const k of ['N', 'Z', 'M', 'K']) { const i = bad(L[k]); if (i >= 0) throw new Error(`${phase}: lineage ${L.id} ${k}[${i}] = ${L[k][i]} (N ${L.N[i]}, Z ${L.Z[i]}, K ${L.K[i]}, M ${L.M[i]}, g ${L.g}) at t ${this.t}`); }
    for (const L of live) if (!Number.isFinite(L.g)) throw new Error(`${phase}: g of ${L.id}`);
  }
  diffuse(L, dt) {
    const H = this.H, F = this.F, nL = this.nL, N = L.N, Z = L.Z;
    let zmax = 0;
    for (let c = 0; c < nL; c++) if (N[c] > 0 && Z[c] > zmax) zmax = Z[c];
    const Dm = this.Dz(zmax), reach = this.seaReach(zmax);
    const row = this.row || (this.row = new Float64Array(nL));
    row.fill(0);
    for (let e = 0; e < F.m; e++) {
      const k = F.hop[e] ? (reach > 0 ? Math.exp(-F.k[e] / reach) : 0) : F.k[e];
      row[F.a[e]] += k; row[F.b[e]] += k;
    }
    let worst = 0;
    for (let c = 0; c < nL; c++) worst = Math.max(worst, Dm * row[c] / H.area[c]);
    // At most NSUB_MAX substeps: past that, migration is held to what the step can carry stably
    // (people then track capacity faster than they could walk, which is the case it matters).
    const need = dt * worst / 0.4, nsub = Math.max(1, Math.min(this.P.NSUB_MAX, Math.ceil(need))), h = dt / nsub;
    const kScale = need > nsub ? nsub / need : 1;
    const dN = this.dN || (this.dN = new Float64Array(nL)), dZ = this.dZ || (this.dZ = new Float64Array(nL));
    const n = this.dens || (this.dens = new Float64Array(nL));
    for (let s = 0; s < nsub; s++) {
      dN.fill(0); dZ.fill(0);
      for (let c = 0; c < nL; c++) n[c] = N[c] / H.area[c];
      for (let e = 0; e < F.m; e++) {
        const c = F.a[e], d = F.b[e], nc = n[c], nd = n[d];
        if (nc === nd) continue;
        const ze = 0.5 * (Z[c] + Z[d]);
        let k;
        if (F.hop[e]) { const r = this.seaReach(ze); if (!(r > 0)) continue; k = this.Dz(ze) * Math.exp(-F.k[e] / r); }
        else k = this.Dz(ze) * F.k[e];
        const flux = kScale * k * (nd - nc) * h;          // people from d to c
        const zc = flux > 0 ? Z[d] : Z[c];
        dN[c] += flux; dN[d] -= flux; dZ[c] += flux * zc; dZ[d] -= flux * zc;
      }
      for (let c = 0; c < nL; c++) {
        if (dN[c] === 0) continue;
        let Nn = N[c] + dN[c];
        const zz = N[c] * Z[c] + dZ[c];
        if (Nn > 1e-6) Z[c] = Math.max(0, zz / Nn); else Nn = 0;
        N[c] = Nn;
      }
    }
  }

  // Output (subsistence units a year), energy, compute's minds; the energy cap.
  economy(live, dt) {
    const P = this.P, nL = this.nL, Out = this.Out, AI = this.AI, Ntot = this.Ntot;
    Out.fill(0); AI.fill(0);
    let O = 0, Oexcess = 0, people = 0, zf = 0;
    for (const L of live) for (let c = 0; c < nL; c++) {
      if (!(L.N[c] > 0)) continue;
      const o = L.K[c] * L.N[c] / Math.max(Ntot[c], 1e-12);
      Out[c] += o; O += o; people += L.N[c];
      zf = Math.max(zf, L.Z[c]);
    }
    // Compute: minds bought with output, χ(z) per unit, past Z_AI (speculation).
    for (const L of live) for (let c = 0; c < nL; c++) {
      if (!(L.N[c] > 0)) continue;
      const x = P.X_AI * Math.exp(Math.min(P.THETA_AI * (L.Z[c] - P.Z_AI), 300));
      AI[c] += (L.K[c] * L.N[c] / Math.max(Ntot[c], 1e-12)) * x / (1 + x / P.X_MAX);
    }
    // Energy: E_SUB a subsistence unit; the fossil share is industry's lift above the organic
    // ceiling, falling as renewables come (z past Z_REN). Capped at F_SUN of absorbed sunlight.
    this.ren = sig((zf - P.Z_REN) / P.W_REN);
    let indOut = 0;
    for (let c = 0; c < nL; c++) indOut += Out[c] * this.ind[c];
    const Ew = P.E_SUB * O, Efos = P.E_SUB * indOut * (1 - this.ren);
    const cap = P.F_SUN * P.SUN_ABS;
    // Fossil fuel burned this step, and what's left.
    const burn = this.fossil > 0 ? Efos * YEAR_S * dt / P.J_PGC : 0;
    const used = Math.min(burn, this.fossil);
    this.fossil -= used; this.emitted += used;
    if (this.fossil <= 0 && !this.flags.fossilOut && this.emitted > 0) { this.flags.fossilOut = true; this.event('fossil', `the fossil carbon is spent (${this.emitted.toFixed(0)} Pg C)`); }
    // Supply for industry's lift: fossil while it lasts, then renewables up to the cap.
    this.supply = this.fossil > 0 ? 1 : Math.min(1, this.ren * cap / Math.max(1, Efos));
    // The ceiling: output scaled so its energy is at most the cap, from this step's potential
    // (output before the last scaling), applied to the next step's capacity.
    const Epot = Ew / Math.max(this.capFactor, 1e-300);
    this.capFactor = Math.min(1, cap / Math.max(Epot, 1e-300));
    if (Ew > cap && !this.flags.cap) { this.flags.cap = true; this.event('cap', `energy reaches ${(cap / 1e12).toFixed(0)} TW, ${(100 * P.F_SUN).toFixed(0)}% of absorbed sunlight`); }
    // CO₂: the Pulse's shares as a response (synthesis): 0.807 at 150 yr, 0.14 at 5 kyr, 0.053 at 140 kyr.
    const a = [0.807, 0.14, 0.053], tauB = [150, 5000, 140000], add = used;
    for (let k = 0; k < 3; k++) this.co2Box[k] = this.co2Box[k] * Math.exp(-dt / tauB[k]) + a[k] * add;
    this.co2 = P.CO2_0 + (this.co2Box[0] + this.co2Box[1] + this.co2Box[2]) / 2.12;
    this.energy = Math.min(Ew, cap); this.O = O; this.people = people;
    this.carbonRate = used / dt;
  }

  culture(L, live, dt) {
    const P = this.P, H = this.H, E = this.E, nL = this.nL, N = L.N, Z = L.Z, M = L.M, Ntot = this.Ntot, Out = this.Out;
    // Minds in each cell: this lineage's people × research intensity, the others' at η, compute's.
    const m = new Float64Array(nL);
    let zmax = 0;
    for (let c = 0; c < nL; c++) {
      if (!(Ntot[c] > 0)) continue;
      const y = Out[c] / Ntot[c], sR = Math.min(P.S_R_MAX, Math.pow(Math.max(y, 1e-3), P.RHO_R));
      m[c] = sR * (N[c] + P.ETA * (Ntot[c] - N[c])) + this.AI[c];
      if (N[c] > 0) zmax = Math.max(zmax, Z[c]);
    }
    // Minds within reach: the body's total, or a disc of radius ℓ of the local density.
    const reach = this.seaReach(zmax), ell = this.reachL(L.g + zmax);
    const key = reach.toPrecision(2);
    let comp = this.compCache.get(key);
    if (!comp) this.compCache.set(key, comp = this.components(c => Ntot[c] >= P.N_MIN * H.area[c], reach));
    const tot = new Float64Array(comp.count);
    for (let c = 0; c < nL; c++) if (comp.id[c] >= 0) tot[comp.id[c]] += m[c];
    const disc = Math.PI * ell * ell;
    for (let c = 0; c < nL; c++) {
      let ring = m[c];
      for (let o = E.off[c]; o < E.off[c + 1]; o++) if (!E.hop[o]) ring += m[E.nb[o]];
      const loc = disc * ring / this.ringArea[c], body = comp.id[c] >= 0 ? tot[comp.id[c]] : m[c];
      M[c] = body > 0 ? body * (1 - Math.exp(-loc / body)) : 0;
    }
    // Culture: ideas in, losses out, exact over the step; copying better neighbours and others.
    const lam = P.LAMBDA, eL = Math.exp(-lam * dt), fL = lam * dt > 1e-9 ? (1 - eL) / lam : dt, gain = P.A_INV;
    let rate = 0;
    const others = live.filter(o => o !== L);
    for (let c = 0; c < nL; c++) {
      if (!(N[c] > 0)) continue;
      const z0 = Z[c];
      let wsum = 0, up = 0;
      for (let o = E.off[c]; o < E.off[c + 1]; o++) {
        const d = E.nb[o];
        if (!(N[d] > 0) || Z[d] <= z0) { if (N[d] > 0) wsum += E.hop[o] ? 0 : E.slope[o]; continue; }
        const e = E.hop[o] ? (reach > 0 ? Math.exp(-E.km[o] / reach) : 0) : E.slope[o];
        up += e * (Z[d] - z0); wsum += e;
      }
      const copy = P.COPY * this.speed(z0) / P.V0;
      let accGap = 0;
      for (const o of others) if (o.N[c] > 0 && o.Z[c] > z0) accGap += (o.Z[c] - z0) * o.N[c] / Ntot[c];
      let z = z0 * eL + gain * Math.pow(M[c], P.PSI) * fL;
      if (wsum > 0) z += (1 - Math.exp(-copy * dt)) * up / wsum;
      z += (1 - Math.exp(-P.ACC * dt)) * accGap;
      Z[c] = z;
      rate = Math.max(rate, Math.abs(z - z0) / dt);
    }
    return rate;
  }

  // Connected bodies of cells that pass `ok`, by land and by crossings within `reach`.
  components(ok, reach) {
    const E = this.E, nL = this.nL, id = new Int32Array(nL).fill(-1);
    let count = 0;
    const stack = [];
    for (let c = 0; c < nL; c++) {
      if (id[c] >= 0 || !ok(c)) continue;
      id[c] = count; stack.push(c);
      while (stack.length) {
        const u = stack.pop();
        for (let o = E.off[u]; o < E.off[u + 1]; o++) {
          const d = E.nb[o];
          if (id[d] >= 0 || !ok(d)) continue;
          if (E.hop[o] && !(reach > 0 && Math.exp(-E.km[o] / reach) > 0.05)) continue;
          id[d] = count; stack.push(d);
        }
      }
      count++;
    }
    return { id, count };
  }

  trait(live, dt) {
    const P = this.P, nL = this.nL, Ntot = this.Ntot;
    for (const L of live) {
      let tot = 0;
      for (let c = 0; c < nL; c++) tot += L.N[c];
      const Ne = Math.max(10, P.NE_SHARE * tot), gens = dt / P.T_GEN;
      L.g = Math.min(P.G_MAX, L.g + P.V_G * P.S_BG * gens + Math.sqrt(P.V_G * gens / Ne) * this.rng.normal());
    }
    // Gene flow where lineages meet: traits and ancestry mix by the contact (soft species).
    for (let a = 0; a < live.length; a++) for (let b = a + 1; b < live.length; b++) {
      const A = live[a], B = live[b];
      let C = 0;
      for (let c = 0; c < nL; c++) if (A.N[c] > 0 && B.N[c] > 0) C += A.N[c] * B.N[c] / Ntot[c];
      if (C <= 0) continue;
      const ta = A.total || 1, tb = B.total || 1;
      const pa = Math.min(0.5, P.GENE_FLOW * C / ta * dt), pb = Math.min(0.5, P.GENE_FLOW * C / tb * dt);
      const ga = A.g, gb = B.g, aa = new Map(A.anc), ab = new Map(B.anc);
      A.g = (1 - pa) * ga + pa * gb; B.g = (1 - pb) * gb + pb * ga;
      const mix = (dst, src, p, keep) => { for (const [k, v] of dst) dst.set(k, v * (1 - p)); for (const [k, v] of src) dst.set(k, (dst.get(k) || 0) + p * v); };
      mix(A.anc, ab, pa); mix(B.anc, aa, pb);
    }
  }

  farming(live, dt) {
    const P = this.P, H = this.H, E = this.E, nL = this.nL, f = this.f, pkg = this.pkg, Ntot = this.Ntot;
    // The culture each cell's people hold (the highest lineage's).
    const zc = this.zc || (this.zc = new Float64Array(nL));
    zc.fill(0);
    for (const L of live) for (let c = 0; c < nL; c++) if (L.N[c] > 0 && L.Z[c] > zc[c]) zc[c] = L.Z[c];
    // Origins: settled near foraging's ceiling, knowing enough, with domesticates.
    for (let c = 0; c < nL; c++) {
      if (f[c] > 0 || !(Ntot[c] > 0) || H.D[c] <= 0) continue;
      const Kf = H.area[c] * this.coldOK(c, zc[c]) * H.b[c] * P.CAP_F;
      const haz = P.H_FARM * H.D[c] * sig((zc[c] - P.Z_FARM) / P.W_FARM) * sig((Ntot[c] / Math.max(Kf, 1e-9) - P.SED) / 0.1);
      if (haz <= 0 || this.rng.uniform() > 1 - Math.exp(-haz * dt)) continue;
      let near = false;
      for (let o = E.off[c]; o < E.off[c + 1]; o++) if (f[E.nb[o]] > 0) near = true;
      if (near) continue;
      const q = this.packages.length, zv = Float32Array.from(H.zv.subarray(14 * c, 14 * c + 14));
      this.packages.push({ c, t: this.t, lat: H.lat[c], lon: H.lon[c], zv, zone: ZN[zv.indexOf(Math.max(...zv))] });
      pkg[c] = q; f[c] = 0.01 * this.suit(q, c) + 1e-4;
      this.event('farming', `farming begins (package ${q}) at ${deg(H.lat[c]).toFixed(0)}°, ${deg(H.lon[c]).toFixed(0)}° in ${this.packages[q].zone} (z ${zc[c].toFixed(2)})`);
    }
    // Spread and growth within cells.
    const f0 = Float32Array.from(f), p0 = Int16Array.from(pkg);
    for (let c = 0; c < nL; c++) {
      if (!(Ntot[c] > 0)) continue;
      if (p0[c] >= 0) {
        const s = this.suit(p0[c], c) * Math.min(1, H.a[c] / Math.max(H.a[c], 1e-9));
        f[c] = Math.min(s, f0[c] + P.R_ADOPT * f0[c] * (1 - f0[c] / Math.max(s, 1e-6)) * dt);
      }
      if (zc[c] < P.Z_FARM - 0.5) continue;
      let bestQ = -1, bestIn = 0;
      for (let o = E.off[c]; o < E.off[c + 1]; o++) {
        const d = E.nb[o];
        if (p0[d] < 0 || f0[d] <= f0[c]) continue;
        const v = (E.hop[o] ? 0.3 : E.slope[o]) * (f0[d] - f0[c]) * this.suit(p0[d], c);
        if (v > bestIn) { bestIn = v; bestQ = p0[d]; }
      }
      if (bestQ >= 0) {
        if (p0[c] < 0 || this.suit(bestQ, c) > this.suit(p0[c], c)) pkg[c] = bestQ;
        f[c] = Math.min(this.suit(pkg[c], c), f[c] + P.C_FARM * bestIn * dt);
      }
    }
  }

  industry(live, dt) {
    const P = this.P, E = this.E, nL = this.nL, ind = this.ind, zc = this.zc;
    if (!this.flags.industry) {
      for (let c = 0; c < nL; c++) if (zc[c] >= P.Z_IND && this.f[c] > 0.2 && this.coalReach[c] >= P.COAL_MIN) {
        ind[c] = 0.01; this.flags.industry = true;
        this.event('industry', `industry begins at ${deg(this.H.lat[c]).toFixed(0)}°, ${deg(this.H.lon[c]).toFixed(0)}° (z ${zc[c].toFixed(2)}, coal within reach ${this.coalReach[c].toFixed(0)} Pg C)`);
        break;
      }
      return;
    }
    const i0 = Float32Array.from(ind);
    for (let c = 0; c < nL; c++) {
      if (!(this.Ntot[c] > 0)) continue;
      let v = i0[c] > 0 ? P.R_IND * i0[c] * (1 - i0[c]) : 0;
      if (zc[c] >= P.Z_IND - 1) for (let o = E.off[c]; o < E.off[c + 1]; o++) {
        const d = E.nb[o];
        if (i0[d] > i0[c]) v += P.C_IND * (E.hop[o] ? 0.5 : 1) * (i0[d] - i0[c]) * this.speed(zc[c]) / P.V0;
      }
      ind[c] = Math.min(1, i0[c] + v * dt);
    }
  }

  // Splits, extinctions, tipping (every CHECK years).
  books() {
    const P = this.P, H = this.H, nL = this.nL;
    // Merges: two lineages living on in the same cells (neither excluding the other) for T_MERGE
    // become one, its traits and ancestry weighted by their numbers (soft species; as a stray
    // piece of a plate joins the plate it borders).
    this.mergeSince = this.mergeSince || new Map();
    const alive = this.lineages.filter(L => L.died === null);
    for (let a = 0; a < alive.length; a++) for (let b = a + 1; b < alive.length; b++) {
      const A = alive[a], B = alive[b];
      if (A.died !== null || B.died !== null) continue;
      let shared = 0;
      for (let c = 0; c < nL; c++) if (A.N[c] > 0 && B.N[c] > 0) shared += Math.min(A.N[c], B.N[c]);
      const key = `${A.id}:${B.id}`;
      if (shared < P.MERGE * Math.min(A.total, B.total)) { this.mergeSince.delete(key); continue; }
      if (!this.mergeSince.has(key)) { this.mergeSince.set(key, this.t); continue; }
      if (this.t - this.mergeSince.get(key) < P.T_MERGE) continue;
      const [big, small] = A.total >= B.total ? [A, B] : [B, A];
      const wb = big.total / (big.total + small.total), ws = 1 - wb;
      for (let c = 0; c < nL; c++) {
        const n = big.N[c] + small.N[c];
        if (n > 0) big.Z[c] = (big.N[c] * big.Z[c] + small.N[c] * small.Z[c]) / n;
        big.N[c] = n; small.N[c] = 0;
      }
      big.g = wb * big.g + ws * small.g;
      const anc = new Map();
      for (const [k, v] of big.anc) anc.set(k, wb * v);
      for (const [k, v] of small.anc) anc.set(k, (anc.get(k) || 0) + ws * v);
      big.anc = anc; big.total += small.total;
      small.died = this.t; small.into = big.id; small.total = 0;
      this.mergeSince.delete(key);
      this.event('merge', `lineage ${small.id} merges into ${big.id} (${(100 * ws).toFixed(0)}% of the whole)`);
    }
    for (const L of this.lineages.filter(L => L.died === null)) {
      if (L.total < P.P_EXT) { L.died = this.t; L.N.fill(0); this.event('extinct', `lineage ${L.id} dies out`); continue; }
      const comp = this.components(c => L.N[c] >= P.N_MIN * H.area[c], this.seaReach(L.zmax));
      const pops = new Float64Array(comp.count);
      for (let c = 0; c < nL; c++) if (comp.id[c] >= 0) pops[comp.id[c]] += L.N[c];
      const big = [...pops.keys()].filter(k => pops[k] >= P.P_MIN).sort((a, b) => pops[b] - pops[a]);
      if (big.length < 2) { L.multiSince = null; continue; }
      if (L.multiSince === null) { L.multiSince = this.t; continue; }
      if (this.t - L.multiSince < P.T_SPLIT) continue;
      for (const k of big.slice(1)) {
        if (this.lineages.filter(x => x.died === null).length >= P.L_MAX) break;
        const C = this.newLineage(L, this.t, L.g);
        let la = 0, lo = 0, w = 0;
        for (let c = 0; c < nL; c++) if (comp.id[c] === k) {
          C.N[c] = L.N[c]; C.Z[c] = L.Z[c]; L.N[c] = 0;
          la += H.lat[c] * C.N[c]; lo += H.lon[c] * C.N[c]; w += C.N[c];
        }
        C.lat = la / w; C.lon = lo / w;
        this.event('split', `lineage ${C.id} splits from ${L.id} at ${deg(C.lat).toFixed(0)}°, ${deg(C.lon).toFixed(0)}° (${pops[k].toFixed(0)} people; g ${L.g.toFixed(2)})`);
      }
      L.multiSince = null;
    }
  }

  record(live, dt) {
    const P = this.P, nL = this.nL;
    let minds = 0, people = 0, farm = 0, indp = 0, zmax = 0;
    for (let c = 0; c < nL; c++) {
      const y = this.Ntot[c] > 0 ? this.Out[c] / this.Ntot[c] : 0;
      minds += Math.min(P.S_R_MAX, Math.pow(Math.max(y, 1e-3), P.RHO_R)) * this.Ntot[c] + this.AI[c];
      people += this.Ntot[c]; farm += this.Ntot[c] * this.f[c]; indp += this.Ntot[c] * this.ind[c];
    }
    for (const L of live) {
      let tot = 0, zs = 0, zm = 0;
      for (let c = 0; c < nL; c++) if (L.N[c] > 0) { tot += L.N[c]; zs += L.N[c] * L.Z[c]; zm = Math.max(zm, L.Z[c]); }
      L.total = tot; L.zbar = tot > 0 ? zs / tot : 0; L.zmax = zm; L.peak = Math.max(L.peak, tot);
      zmax = Math.max(zmax, zm);
      if (L.tipped === null && L.zbar > 1) {
        L.tipped = this.t;
        let best = 0; for (let c = 0; c < nL; c++) if (L.N[c] > 0 && L.Z[c] > L.Z[best]) best = c;
        this.event('tip', `lineage ${L.id} tips: mean culture past 1 (g ${L.g.toFixed(2)}, ${tot.toFixed(0)} people, frontier at ${deg(this.H.lat[best]).toFixed(0)}°, ${deg(this.H.lon[best]).toFixed(0)}°)`);
      }
    }
    const y = people > 0 ? this.O / people : 0;
    if (!this.flags.transition && y > 2 && people > 1e8) { this.flags.transition = true; this.event('transition', `income passes twice subsistence: the demographic transition (${(people / 1e9).toFixed(2)} billion)`); }
    if (!this.flags.ai && zmax > P.Z_AI) { this.flags.ai = true; this.event('compute', `culture passes Z_AI: compute's minds (${(this.people / 1e9).toFixed(2)} billion people)`); }
    if (!this.flags.ren && this.ren > 0.5) { this.flags.ren = true; this.event('renewables', 'renewables carry half of industry\'s energy'); }
    this.history.push({ t: this.t, dt, people, minds, O: this.O, zmax, farm: people > 0 ? farm / people : 0, ind: people > 0 ? indp / people : 0,
      energy: this.energy, co2: this.co2, fossil: this.fossil, lineages: live.length, heat: this.energy / (4 * Math.PI * R * R * 1e6) / P.B_EBM });
  }

  /** Run until `stop` says so; dt from the culture's pace and the minds' doubling. */
  run({ tMax = 5e6, stop = () => false, onStep = null } = {}) {
    const P = this.P;
    let dt = P.DT_MAX, last = null;
    while (this.t < tMax) {
      const h = this.history, n = h.length;
      let grow = 0;
      if (n >= 2 && h[n - 1].minds > 0 && h[n - 2].minds > 0) grow = Math.log(h[n - 1].minds / h[n - 2].minds) / h[n - 1].dt;
      dt = Math.min(P.DT_MAX, P.DZ_MAX / Math.max(this.lastRate, 1e-12), grow > 0 ? 0.05 / grow : Infinity, 2 * dt);
      dt = Math.max(dt, P.DT_MIN);
      this.step(dt);
      if (onStep) onStep(this);
      if (stop(this)) break;
    }
  }
}
