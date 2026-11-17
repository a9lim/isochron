// Minimal life (docs/PLAN.md, phase 8): the plants' cover and the sea's
// carbon wired into the planet. The two models are their own files
// (src/engine/vegetation.js, src/engine/oceancarbon.js, each tested alone);
// this is what each takes from the rest and gives back.
//
//   cover's climate   once per climate cycle (before weathering's map is
//                     measured): degree-days above 0 °C from the climate's
//                     twelve monthly surface temperatures (each month's days
//                     spread by 4 K), the year's rain and mean temperature,
//                     CO₂, and the land that is free of ice. Not the soil's
//                     water (the module's option): the ground's water follows
//                     the rain, so scaling the rain by it counted aridity
//                     twice, and over ~40 cycles the bare share grew to 42%
//                     of land on the default seed (25% without) and the
//                     planet cooled 0.8 K more; the ground still sets the
//                     plants' transpiration, through β. At the
//                     opening the cover and its carbon sit at their balance
//                     with each cycle until the climate has settled (the
//                     closure: the cover and the rain feed each other, ~10
//                     cycles from a cold start), so the land's store is full
//                     before weathering's reference is taken, with the air
//                     held at the opening's CO₂; after that they relax live.
//   cover, live       the cover steps from Planet.fast, at most ten times a
//                     second of the dial and at least a year at a time (it is
//                     exact at any step, so past τ it is the closure); its
//                     carbon's trade with the air goes to the carbon cycle's
//                     next step, so land, air and sea conserve carbon.
//   cover's feedbacks the climate reads `climate.cover` (trees' and grass's
//                     shares): land's albedo (VECODE's surface albedos, and
//                     snow masked by trees), land's evaporation (bare ground
//                     and grass at the ground's β, trees at √β: their roots
//                     reach deeper), and weathering's map (bare rock a quarter
//                     of forest's).
//   the sea's inputs  once per climate cycle (synthesis, from the module's
//                     author's notes): the cold box is the coldest 15% of the
//                     sea's area by annual surface temperature (the climate's
//                     plus the gyres' anomaly), the warm box the rest, each
//                     at its mean; the cold box's open water is its share not
//                     under sea ice; warm shallow shelves are sea under ~200 m
//                     (soft, 100–300 m) with water above ~18 °C (soft, 1.5 K);
//                     the seafloor's hypsometry in the module's fixed 150 m
//                     bins; productivity (`bio`) is the rivers' sediment and
//                     the coasts' upwelling against the opening's, half each;
//                     iron (`iron`) is the dust reaching the cold box's water
//                     against the opening's (src/engine/aeolian.js);
//                     carbonate weathering goes with land's runoff against
//                     the opening's.
//   export, drawn     the boxes' export production spread over the sea by
//                     what feeds it (synthesis): the warm box's over its
//                     water by its nutrients' supply (a background, the
//                     coasts' upwelling, the rivers' mouths), the cold box's
//                     evenly over its open water, the two blended across the
//                     cold box's edge (1.5 K). Per cell, g C m⁻² yr⁻¹.
//
// Units: years, Pg C; per cell as noted.
import { Vegetation, gdd } from './vegetation.js';
import { OC } from './oceancarbon.js';
import { prolong } from '../grid/transfer.js';

export const LIFE = {
  // The opening's cover sits at its balance with each climate cycle until the climate has settled
  // (`stats.settled`, src/engine/climate.js), and the sea settles then.
  ICE: 10,                // m: grounded ice past which land carries no cover (the climate's own threshold)
  COLD: 0.15,             // the cold box's share of the sea's area
  COLD_W: 1.5,            // K: the blend across the cold box's edge, for the drawn export
  SHELF_Z: [100, 300],    // m: the warm shelves' depth, from all to none
  SHELF_T: 18, SHELF_W: 1.5,   // °C: the warm shelves' water, soft
  BIN0: 200, BIN: 150, BINS: 50,   // the module's hypsometry: 150 m bins below 200 m
  BIO_RIVERS: 0.5,        // productivity's share from the rivers (the rest from the upwelling)
  BIO_MIN: 0.5, BIO_MAX: 2, BIO_EASE: 0.3,
  BG: 0.15,               // the warm sea's background nutrient supply against a strong upwelling's
  RIVER: 2e4,             // m³/s: a river mouth's supply at which it saturates
};

const sigmoid = x => 1 / (1 + Math.exp(-x));
const R2 = 6.371e6 * 6.371e6;

/**
 * Vegetation's climate from a climate's last cycle into `veg` (also for the tools, which have
 * no planet): ice-free land, degree-days, rain and mean temperature.
 */
export function coverClimate(veg, climate, co2, scratch = {}) {
  const n = climate.grid.n, T12 = climate.T12, P12 = climate.P12, L = climate.landMask, H = climate.ice ? climate.ice.H : null;
  const land = scratch.land || (scratch.land = new Uint8Array(n));
  const G = scratch.gdd || (scratch.gdd = new Float32Array(n)), P = scratch.P || (scratch.P = new Float32Array(n));
  const T = scratch.T || (scratch.T = new Float32Array(n));
  const tm = new Float64Array(12);
  for (let i = 0; i < n; i++) {
    let p = 0, t = 0;
    for (let m = 0; m < 12; m++) { tm[m] = T12[12 * i + m]; p += P12[12 * i + m]; t += tm[m]; }
    land[i] = L[i] && !(H && H[i] > LIFE.ICE) ? 1 : 0;
    G[i] = land[i] ? gdd(tm) : 0; P[i] = p; T[i] = t / 12;
  }
  veg.setClimate({ land, gdd: G, precip: P, temp: T, co2 });
  return land;
}

export class Life {
  /** On the planet's layers: { grid, tec, land, climate, ocean, carbon }. */
  constructor({ grid, tec, land, climate, ocean, carbon }) {
    Object.assign(this, { grid, tec, landscape: land, climate, ocean, carbon });
    this.closed = false;                   // the opening's closure is done (the climate has settled)
    if (carbon) carbon.holdOpening = true;   // the air held at the opening's CO₂ until the sea settles
    const n = grid.n;
    this.veg = new Vegetation(n, grid.area);
    this.scratch = {};
    this.landMask = new Uint8Array(n);
    this.export = new Float32Array(n);     // g C m⁻² yr⁻¹ per sea cell (drawn)
    this.upFine = ocean && ocean.coarse ? new Float64Array(n) : null;
    this.bank = 0;
    this.version = 0;                      // bumps when the cover changes
    this.cycles = 0;
    this.ref = null;                       // the opening's rivers, upwelling and runoff
    this.bio = 1;
    this.dust = null;                      // src/engine/aeolian.js, when there is one: iron to the cold box
    this.toAir = 0;                        // Pg C the land's store has given the air since the sea settled
    this.stats = { trees: 0, grass: 0, bare: 1, landC: 0, air: 0, npp: 0, export: 0, ccd: 0, shelf: 0 };
  }

  /** After each climate cycle, before weathering's map: the cover's climate, and the sea's inputs. */
  afterClimate() { const it = this.afterClimateSteps(); while (!it.next().done); }
  /**
   * `afterClimate` in two pieces (the engine's worker yields between them): the cover's climate,
   * then the rest. The sea's inputs and what follows them (Planet.afterClimateSteps: weathering's
   * map, and at the opening's end the sea settled on them) stay in one piece, so the sea never
   * steps on inputs it hasn't settled to.
   */
  *afterClimateSteps() {
    const c = this.climate, co2 = c.co2Seen || 280;
    this.cycles++;
    this.landMask = coverClimate(this.veg, c, co2, this.scratch);
    // People's land use, on the cover's new balance (src/engine/peoplelink.js).
    if (this.onCover) this.onCover();
    yield;
    // The opening's closure, through the cycle the climate settles in (the sea settles after it,
    // so nothing it moves is lost).
    if (!this.closed) { this.veg.equilibrate(); this.closed = !!c.stats.settled; }
    c.cover = { ft: this.veg.ft, fg: this.veg.fg };
    this.version++;
    this.seaInputs();
    this.totals();
  }

  /**
   * Once weathering's map is measured: at the end of the opening's closure the sea settles on
   * this planet's (its temperatures, shelves and seafloor), with the air held where it is.
   */
  afterMeasure() {
    if (!this.carbon.settled && this.closed) { this.carbon.settle(); this.toAir = 0; }
  }

  /** The fast step: the cover over the banked years, its carbon's trade to the carbon cycle's next step. */
  fast(dt, rate = 10 * dt) {
    if (!this.veg.climate || !(dt > 0)) return;
    this.bank += dt;
    if (this.bank < Math.max(1, rate / 10)) return;
    const f = this.veg.step(this.bank);
    this.carbon.landFlux += f.air * this.bank / dt;
    this.toAir += f.air * this.bank;
    this.stats.air = f.air; this.stats.npp = f.npp;
    this.bank = 0;
    this.version++;
  }

  /** The sea's inputs from the climate, the gyres, the seafloor and the rivers. */
  seaInputs() {
    // A sea boiling away (the People scenario's runaway, src/engine/peoplelink.js) keeps the inputs
    // it had: the boxes are the sea as it was (measured off its remnant, they fail the implicit step).
    if (this.tec.boiled > 0 && this.seaIn) return;
    const c = this.climate, g = this.grid, n = g.n, tec = this.tec, o = this.ocean;
    const sstA = o ? o.fine.sst : null, T0 = c.Tf[0], L = c.landMask;
    // SSTs: a histogram by 0.1 K for the coldest share.
    const NB = 400, hist = new Float64Array(NB), hT = new Float64Array(NB);
    const sst = this.scratch.sst || (this.scratch.sst = new Float64Array(n));
    let seaA = 0, shelf = 0;
    const hy = new Float64Array(LIFE.BINS), depth = [];
    for (let k = 0; k < LIFE.BINS; k++) depth.push(LIFE.BIN0 + LIFE.BIN * (k + 0.5));
    for (let i = 0; i < n; i++) {
      if (L[i]) continue;
      const a = g.area[i], T = Math.max(-1.8, T0[i] + (sstA ? sstA[i] : 0));
      sst[i] = T; seaA += a;
      const b = Math.min(NB - 1, Math.max(0, Math.floor((T + 2) * 10)));
      hist[b] += a; hT[b] += a * T;
      const z = (tec.seaLevel - tec.elev[i]) * 1000;
      if (z > LIFE.BIN0) hy[Math.min(LIFE.BINS - 1, Math.floor((z - LIFE.BIN0) / LIFE.BIN))] += a;
      const [z0, z1] = LIFE.SHELF_Z;
      shelf += a * Math.min(1, Math.max(0, (z1 - z) / (z1 - z0))) * sigmoid((T - LIFE.SHELF_T) / LIFE.SHELF_W);
    }
    let acc = 0, cT = 0, cA = 0, wT = 0, wA = 0, edge = -2;
    for (let b = 0; b < NB; b++) {
      if (acc < LIFE.COLD * seaA) { cT += hT[b]; cA += hist[b]; edge = -2 + (b + 1) / 10; } else { wT += hT[b]; wA += hist[b]; }
      acc += hist[b];
    }
    const sstCold = cA > 0 ? cT / cA : 1.5, sstWarm = wA > 0 ? wT / wA : 21;
    // The cold box's open water; the coasts' upwelling on this grid; the rivers' mouths.
    const up = this.upFine ? (prolong(c.T, o.upwell || new Float64Array(o.grid.n), this.upFine), this.upFine) : (o && o.upwell) || null;
    const Q = this.landscape ? this.landscape.discharge : null;
    let iceA = 0, upS = 0, runS = 0;
    for (let i = 0; i < n; i++) {
      const a = g.area[i];
      if (L[i]) { if (this.landMask[i]) runS += a * c.runoff[i]; continue; }
      if (sst[i] <= edge) iceA += a * c.snowAnn[i];
      if (up) upS += a * Math.abs(up[i]);
    }
    const river = this.landscape ? this.landscape.flux.toSea : 0;
    // The references are the opening's, at the end of its closure (where the sea settles);
    // the rivers' once the landscape has stepped.
    if (!this.ref && this.closed) this.ref = { up: upS, run: runS, river: 0 };
    if (this.ref && !(this.ref.river > 0) && river > 0) this.ref.river = river;
    const R = this.ref || {}, rel = (v, r) => (r > 0 ? v / r : 1);
    const want = Math.min(LIFE.BIO_MAX, Math.max(LIFE.BIO_MIN, LIFE.BIO_RIVERS * rel(river, R.river) + (1 - LIFE.BIO_RIVERS) * rel(upS, R.up)));
    this.bio += (want - this.bio) * LIFE.BIO_EASE;
    // The sea takes this planet's inputs from the end of the closure, where it settles on them
    // (before, it keeps the steady state it was built in).
    // Dust's iron to the cold box's water (src/engine/aeolian.js), against what reaches it when the sea settles.
    const iron = this.dust ? this.dust.ironTo(sst, edge, !this.carbon.settled) : 1;
    this.seaIn = {
      sstWarm, sstCold, iceFree: cA > 0 ? Math.max(0.05, 1 - iceA / cA) : 1, shelf: shelf * R2,
      hyps: { depth, area: Array.from(hy) }, bio: this.bio, carbW: rel(runS, R.run), iron,
    };
    if (this.carbon.settled || this.closed) this.carbon.sea.set(this.seaIn);
    // The export, drawn: each box's spread over the sea by its supply.
    const s = this.carbon.sea, mol = OC.RCP * s.in.bio, eW = mol / OC.TAU_W * s.P[0], eC = mol * s.in.iron / OC.TAU_C * s.P[1];
    const wt = this.scratch.wt || (this.scratch.wt = new Float32Array(2 * n));
    let sW = 0, sC = 0;
    for (let i = 0; i < n; i++) {
      wt[2 * i] = wt[2 * i + 1] = 0;
      if (L[i]) continue;
      let r = 0;
      if (Q) for (let t = g.nbrOff[i], e = g.nbrOff[i + 1]; t < e; t++) { const j = g.nbr[t]; if (L[j]) r = Math.max(r, Q[j]); }
      const cold = sigmoid((edge - sst[i]) / LIFE.COLD_W), a = g.area[i];
      const supply = LIFE.BG + (up ? Math.min(1, Math.abs(up[i]) / 6) : 0) + Math.tanh(r / LIFE.RIVER);
      wt[2 * i] = (1 - cold) * supply; wt[2 * i + 1] = cold * Math.max(0, 1 - c.snowAnn[i]);
      sW += a * wt[2 * i]; sC += a * wt[2 * i + 1];
    }
    const kW = sW > 0 ? eW * 12.011 / (sW * R2) : 0, kC = sC > 0 ? eC * 12.011 / (sC * R2) : 0;   // g C m⁻² yr⁻¹ per unit weight
    for (let i = 0; i < n; i++) this.export[i] = L[i] ? 0 : kW * wt[2 * i] + kC * wt[2 * i + 1];
    this.stats.sstWarm = sstWarm; this.stats.sstCold = sstCold; this.stats.shelf = shelf * R2 / 1e12;
  }

  /** Totals for the figures and captions. */
  totals() {
    const t = this.veg.totals(this.landMask), s = this.carbon.sea.stats;
    Object.assign(this.stats, { trees: t.trees, grass: t.grass, bare: t.bare, landC: t.veg + t.soil, air: this.veg.flux.air, npp: this.veg.flux.npp,
      export: this.carbon.flux.export || 0, ccd: s.ccd || 0, bio: this.bio });
  }

  /** The Relief view's eight colour weights a cell (src/engine/vegetation.js, COLOURS), none off the cover's land. */
  colours(out = new Float32Array(8 * this.grid.n)) {
    this.veg.colours(out);
    const L = this.landMask;
    for (let i = 0; i < this.grid.n; i++) if (!L[i]) out.fill(0, 8 * i, 8 * i + 8);
    return out;
  }
}
