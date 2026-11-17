// The planet: every layer on one grid, stepped together (docs/PLAN.md, "One
// planet, one state, one dial"). The page and the headless tools both drive
// this, so they run the same coupled model.
//
//   per plate step (0.5 Myr)   plates, plumes, landscape, the crust's flexure
//                              (src/engine/crustflex.js)
//   per frame                  the orbit the climate sees (averaged over the
//                              time the dial passes in ~2 s), carbon, ice, the
//                              regolith (src/engine/regolith.js: the ice's
//                              erosion and till applied to it and the crust),
//                              the year (src/engine/year.js): its months
//                              while the dial is below ~100 yr/s (the
//                              anomaly, the veil, the ground's soil water and
//                              snow), the volcanoes' mean forcing at every
//                              dial; and the lakes, stepped below ~10⁴ yr/s
//                              and at their balance above
//   in the background          the climate's cycles; each completed cycle
//                              refreshes weathering's map, the ice's mass
//                              balance and the ground's periodic year
//   after each cycle, too      the plants' cover's climate and the sea's
//                              inputs (src/engine/life.js); the cover itself
//                              steps per frame, its carbon traded with the air
//
// The lakes are routed on the smooth surface, the ground plus its ice (so ice
// dams them), and rebuilt after each landscape step, when the ice has moved
// enough of the sea, and when the sea leaves or reaches a basin below its level
// (src/engine/plates.js, solveSea: a basin it leaves comes with its water). The
// lakes carry their water over, and what they hold is off the sea's.
import { buildGrid } from '../grid/icosphere.js';
import { Tectonics } from './plates.js';
import { Landscape } from './landscape.js';
import { Climate, CLIMATE } from './climate.js';
import { Runaway } from './runaway.js';
import { Ice } from './ice.js';
import { Carbon, CARBON } from './carbon.js';
import { Plumes } from './plumes.js';
import { OrbitCycles } from './orbit.js';
import { Ocean } from './ocean.js';
import { genesis } from './genesis.js';
import { refineTectonics } from './refine.js';
import { Moon } from './tides.js';
import { Volcanoes } from './volcanoes.js';
import { Year, monthIndex } from './year.js';
import { Ground } from './ground.js';
import { Lakes } from './lakes.js';
import { Flexure } from './flexure.js';
import { Regolith } from './regolith.js';
import { CrustFlex, CRUSTFLEX } from './crustflex.js';
import { Life } from './life.js';
import { Aeolian } from './aeolian.js';

export const PLANET = {
  LAKES_LIVE: 1e4,       // yr/s: lakes step below this, and sit at their balance above
  LAKES_SEASON: 1.4,     // yr/s: below this (where the globe shows the season) lakes step by the month, above it by the year
  LAKES_ICE: 3.5e-5,     // km·sr: the ice's water that moves before the lakes are rebuilt for it,
  LAKES_ICE_YEARS: 100,  // and the years of the clock at least between such rebuilds (a rebuild is ~25 ms at level 7)
};

export { Record, SERIES } from './record.js';
import { Record } from './record.js';

export class Planet {
  constructor(seed, opts = {}) {
    this.seed = seed;
    // The plates start from rest and speed up for tens of Myr, so the spin-up runs 80 Myr
    // (the opening is then settled: its activity is the carbon cycle's reference), on level 6
    // at most, then the planet is carried onto finer grids (src/engine/refine.js).
    const level = opts.level ?? 6, spinLevel = Math.min(level, opts.spinLevel ?? 6), spinup = opts.spinup ?? 80;
    let tec = new Tectonics(buildGrid(spinLevel));
    genesis(tec, seed, { spinup, landscape: new Landscape(tec) });
    for (let L = spinLevel + 1; L <= level; L++) tec = refineTectonics(tec, buildGrid(L));
    this.grid = tec.grid;
    this.tec = tec;
    this.land = new Landscape(this.tec);
    this.plumes = new Plumes(this.tec, seed);
    this.tec.swell = this.plumes.swell;
    this.tec.updateElevation();
    this.land.reroute();
    this.climate = new Climate(this.tec, this.land);
    this.ice = new Ice(this.tec, this.climate);
    this.climate.ice = this.ice;
    // The bed bends under the ice by flexure (ELRA), and the crust under its own loads' changes;
    // the two solvers share the coarser grids. In the page both run on the engine's GPU.
    const iceFlex = new Flexure(this.grid);
    this.ice.attachFlexure(iceFlex);
    this.crustFlex = opts.crustFlex === false ? null : new CrustFlex(this.tec, new Flexure(this.grid, { have: iceFlex.levels.map(l => l.g) }));
    // The regolith on the crust, from the rates the rivers would cut at (the opening has no step yet).
    this.land.preview();
    this.regolith = new Regolith(this.tec, this.land, this.climate, this.ice);
    this.regolith.init();
    this.ocean = new Ocean(this.climate, this.climate.coarse);
    this.climate.ocean = this.ocean;
    this.carbon = new Carbon(this.tec, this.land, this.climate, this.plumes);
    // The runaway greenhouse: the outgoing longwave's limit, and the sea boiled past it (src/engine/runaway.js).
    this.runaway = new Runaway(this.tec);
    this.climate.runaway = this.runaway;
    // Minimal life: the plants' cover and its carbon, and the sea's inputs (src/engine/life.js).
    this.life = new Life(this);
    this.orbit = new OrbitCycles(seed);
    // The year: the anomaly, the volcanoes' veil, and (when plugged in) the soil and the lakes.
    this.volcanoes = new Volcanoes(this.tec, this.plumes, this.carbon, seed);
    this.year = new Year(this.climate, this.volcanoes, seed);
    this.climate.year = this.year;
    // The ground, live (src/engine/ground.js; its closure is the climate's), and the lakes.
    this.ground = new Ground(this.climate);
    this.year.soil = this.ground;
    this.climate.ground = this.ground;
    this.lakes = new Lakes(this.grid);
    this.climate.lakes = this.lakes;
    // From here a basin the sea leaves keeps its water for the lakes (the spin-up's went back to the sea).
    this.tec.lakeDepth = this.lakes.depth;
    this.tec.cutWater.fill(0); this.tec.cutHeld = 0; this.tec.lakeWater = 0;
    // Dust (src/engine/aeolian.js): lifted from bare, dry ground, dry lake beds and outwash in the
    // climate's cycle; it darkens snow and ice, feeds the cold sea iron and settles as loess.
    this.aeolian = opts.dust === false ? null : new Aeolian(this);
    this.lakesBank = 0; this.lakesVersion = 0; this.lakesClimate = -1; this.lakesMinGap = 0; this.lakesBuiltAt = -Infinity;
    this.lakeIn = { runoff: new Float32Array(this.grid.n), pe: new Float32Array(this.grid.n) };
    // The Moon and the spin it slows: its tides are solved on the GPU where there is one
    // (src/gpu/tides.js, from the engine's worker); headless, the Moon stays put.
    this.moon = new Moon();
    CLIMATE.OMEGA = this.moon.Omega;
    this.years = this.tec.t * 1e6;
    this.rebuildLakes();
    this.seaLevel0 = this.tec.seaLevel;
    this.record = new Record();
    this.climateVersionSeen = -1;
    this.iceWaterSolved = 0;
    this.loadSince = 0;
    this.setOrbit(1e6);
  }

  /** The sea's depth (m) on the first `n` cells (a coarser level's, which nest first), for the tide. */
  tideDepth(n) {
    const t = this.tec, d = new Float64Array(n);
    for (let i = 0; i < n; i++) d[i] = t.sea[i] ? Math.max(0, (t.seaLevel - t.elev[i]) * 1000) : 0;
    return d;
  }

  /** The orbit the climate sees: averaged over `window` years. */
  setOrbit(window) {
    this.climate.orbit = this.orbit.at(this.years / 1000, window / 1000);
  }

  /** One plate step of dt years: plates and plumes; the landscape every quarter Myr. */
  plateStep(dt) {
    const tec = this.tec;
    tec.step(dt / 1e6);
    this.plumes.step(dt / 1e6);
    this.moon.step(dt);
    CLIMATE.OMEGA = this.moon.Omega;
    tec.updateElevation();
    this.landBank = (this.landBank || 0) + dt;
    if (this.landBank >= 2.5e5) { this.land.step(this.landBank); this.landBank = 0; }
    const flexDt = this.flexDue(dt);
    if (flexDt) { this.crustFlex.step(flexDt); tec.updateElevation(); }
  }

  /**
   * The crust's flexure runs every CRUSTFLEX.EVERY Myr of plate time, on the loads laid down
   * since it last ran (its correction relaxes over tens of Myr, and a load spread over the
   * interval relaxes as one laid down evenly through it): the Myr to step it by, or 0.
   */
  flexDue(dt) {
    if (!this.crustFlex) return 0;
    this.flexBank = (this.flexBank || 0) + dt;
    if (this.flexBank < CRUSTFLEX.EVERY * 1e6 - 1) return 0;
    const d = this.flexBank / 1e6;
    this.flexBank = 0;
    return d;
  }

  /**
   * plateStep with the plates on the GPU (tec.gpu, src/gpu/plates.js, from the engine's worker):
   * the plumes go first, so the crust they build and their swells go up with the step, whose
   * elevation and sea level then need no second solve here.
   */
  async plateStepAsync(dt) {
    const tec = this.tec;
    if (!tec.gpu) return this.plateStep(dt);
    this.plumes.step(dt / 1e6);
    await tec.stepAsync(dt / 1e6);
    this.moon.step(dt);
    CLIMATE.OMEGA = this.moon.Omega;
    this.landBank = (this.landBank || 0) + dt;
    if (this.landBank >= 2.5e5) { this.land.step(this.landBank); this.landBank = 0; }
    const flexDt = this.flexDue(dt);
    if (flexDt && this.crustFlex.gpu) await this.crustFlex.stepAsync(flexDt);
    else if (flexDt) { this.crustFlex.step(flexDt); tec.updateElevation(); }
  }

  /**
   * The fast layers over dt years at `rate` years a second of the dial: carbon, ice within a
   * time budget, and the year (live below ~100 yr/s). Headless, a fast step stands for a
   * tenth of a second of the dial.
   */
  fast(dt, iceMs = 4, rate = 10 * dt) {
    this.runaway.step(dt, this.carbon);
    this.life.fast(dt, rate);
    this.carbon.step(dt);
    CLIMATE.CO2 = this.carbon.pco2;
    if (dt > 0) {
      // On the GPU where there is one (src/gpu/ice.js), else here (headless).
      if (this.iceGpu) this.iceGpu.advance(dt); else this.ice.advance(dt, iceMs);
      // The regolith: the ice's erosion and till into it and the crust, production against the rivers.
      this.regolith.advance(dt);
      // Re-solve the sea only when the ice and the lakes have moved ~10 cm of it (the solve is ~5 ms).
      const held = this.tec.iceWater + this.tec.lakeWater;
      if (Math.abs(held - (this.iceWaterSolved ?? 0)) > 3.5e-6 || this.loadSince++ > 30) {
        this.tec.updateElevation();
        this.iceWaterSolved = this.tec.iceWater + this.tec.lakeWater;
        this.loadSince = 0;
      }
    }
    this.year.advance(this.years, rate);
    // Headless, the live ground's last twelve months are read once a year of the clock (the
    // page reads its GPU's ~10 times a second, src/engine/worker.js).
    const G = this.ground;
    if (G.live && !G.gpu && !(this.years - G.aggYears < 1)) G.sample(G.month, this.years);
    this.stepLakes(dt, rate);
  }

  /**
   * Lakes routed afresh on the ground and its ice to the ocean, carrying their water over, and
   * taking up the water of any basin the sea has left (the plates' `cutWater`).
   */
  rebuildLakes() {
    const tec = this.tec, cut = tec.cutWater, n = this.grid.n, R2 = 6371 * 6371;
    let extra = null;
    if (tec.cutHeld > 0) {
      extra = new Float64Array(n);
      for (let i = 0; i < n; i++) if (cut[i] > 0) { extra[i] = cut[i] * this.grid.area[i] * R2; cut[i] = 0; }
      tec.cutHeld = 0;
    }
    this.lakes.reroute(tec.elev, tec.sea, this.ice.H, extra);
    this.syncLakes();
    this.lakesBasins = tec.basins;
    this.lakesSteps = this.land.steps; this.lakesIce = this.tec.iceWater; this.lakesBuiltYears = this.years;
    this.lakesBuiltAt = typeof performance !== 'undefined' ? performance.now() : 0;
    this.lakesClimate = -1;
    this.lakesVersion++;
  }

  /**
   * The lakes over dt years at `rate` years a second: rebuilt when the landscape has stepped
   * (at most every half `lakesMinGap` ms of the wall clock: at 1 Myr/s it steps four times a
   * second), the ice has moved (at most every LAKES_ICE_YEARS of the clock and `lakesMinGap`
   * ms: ice dams change over centuries) or the sea has left or reached a basin, then stepped
   * (backward Euler, at most 20 times a second of the dial) below LAKES_LIVE, at their balance
   * above (when the climate or the basins change, or a tenth of a second's dial has passed).
   * Where the globe shows the season (below LAKES_SEASON) a step is a month at most, under that
   * month's rain and evaporation, so a closed lake fills in its wet season and shrinks in its
   * dry one; above, a year at least, so the drawn lakes don't flicker through seasons the globe
   * doesn't show.
   */
  stepLakes(dt, rate = 10 * dt) {
    const now = typeof performance !== 'undefined' ? performance.now() : 0;
    const iceMoved = Math.abs(this.tec.iceWater - this.lakesIce) > PLANET.LAKES_ICE && this.years - this.lakesBuiltYears >= PLANET.LAKES_ICE_YEARS && now - this.lakesBuiltAt >= this.lakesMinGap;
    const landStepped = (this.land.steps !== this.lakesSteps || this.tec.basins !== this.lakesBasins) && now - this.lakesBuiltAt >= this.lakesMinGap / 2;
    if (landStepped || iceMoved) this.rebuildLakes();
    this.lakesBank += Math.max(0, dt);
    // The opening's lakes sit at their balance with each climate cycle until the climate has
    // settled, whatever the dial (the first, from a cold start, holds about half the lakes the
    // third does).
    const cs = this.climate.stats, open = this.climate.soilWarm && !(cs.settled && cs.cycles > cs.settled) && this.climate.version !== this.lakesClimate;
    if (!this.seaZeroed && cs.settled && cs.cycles > cs.settled) this.zeroSea();
    const live = rate < PLANET.LAKES_LIVE && !open, due = Math.max(rate < PLANET.LAKES_SEASON ? 1 / 12 : 1, rate / 20);
    if (!open && (live ? this.lakesBank < due : this.lakesBank < due && this.climate.version === this.lakesClimate)) return;
    const { runoff, pe } = this.lakeForcing(live ? this.lakesBank : 0);
    if (live) this.lakes.step(this.lakesBank, runoff, pe); else this.lakes.equilibrium(runoff, pe, this.lakesBank);
    this.syncLakes();
    this.lakesBank = 0; this.lakesClimate = this.climate.version;
    this.lakesVersion++;
  }

  /**
   * The opening over (the climate settled and the lakes at their balance with it, holding ~10 m
   * of the sea): the sea re-solved, and sea level measured from here (`seaLevel0`; the record's
   * and Fig. 2's), so it doesn't start at the lakes' filling.
   */
  zeroSea() {
    this.syncLakes();
    this.tec.updateElevation();
    this.iceWaterSolved = this.tec.iceWater + this.tec.lakeWater;
    if (this.record) this.record.shift('sea', (this.seaLevel0 - this.tec.seaLevel) * 1000);
    this.seaLevel0 = this.tec.seaLevel;
    this.seaZeroed = true;
  }

  /** The lakes' water off the sea's (km·sr), with any basin's the lakes haven't taken up yet. */
  syncLakes() { this.tec.lakeWater = this.lakes.storage() / (6371 * 6371) + this.tec.cutHeld; }

  /**
   * The lakes' forcing (m/yr per cell) over dt years stepped (0 at their balance): runoff off
   * dry ground, the ground's (its closure's, and by the live weight the water the live ground
   * let go over those years, or at their balance its last twelve months', which carry the
   * year's anomaly with its own statistics); and open water's gain, the climate's rain less its
   * potential evaporation, the year's, or over a step within a year the months it covers. (The
   * anomaly on the lakes' own surface is left out: held over the year's steps, a month's anomaly
   * would stand for a season's.)
   */
  lakeForcing(dt = 0) {
    const { runoff, pe } = this.lakeIn;
    this.ground.lakeRunoff(runoff, this.years, dt);
    pe.set(this.climate.peAnn);
    if (dt > 0 && dt < 1 && this.lakes.built) this.monthlyPE(pe, this.years - dt, dt);
    return this.lakeIn;
  }

  /** Open water's gain (m/yr) over [t0, t0 + dt] by the months it covers, on the depressions' cells (the lakes read no others). */
  monthlyPE(pe, t0, dt) {
    const c = this.climate, P12 = c.P12, E12 = c.PET12, L = c.landMask, cells = this.lakes.regCells;
    const w = this.peW || (this.peW = new Float64Array(12)), k = Math.max(1, Math.ceil(24 * dt));
    w.fill(0);
    for (let j = 0; j < k; j++) w[monthIndex((((t0 + (j + 0.5) * dt / k) % 1) + 1) % 1)] += 12 / (1000 * k);   // mm a month → m/yr
    for (let q = 0; q < cells.length; q++) {
      const i = cells[q];
      if (!L[i]) continue;
      let v = 0;
      for (let m = 0; m < 12; m++) if (w[m] > 0) v += w[m] * (P12[12 * i + m] - E12[12 * i + m]);
      pe[i] = v;
    }
  }

  /** Background work on the climate; true when a cycle completed. */
  climateWork(ms) {
    const done = this.climate.work(ms);
    if (done) this.afterClimate();
    return done;
  }
  /**
   * Headless: the opening's closure, climate cycles (each with what follows one) until the
   * climate has settled (`stats.settled`); the references wait for it. Returns the cycles.
   */
  settleClimate() {
    const c = this.climate;
    while (!c.stats.settled) { c.solve(1); this.afterClimate(); }
    return c.stats.settled;
  }
  afterClimate() { const it = this.afterClimateSteps(); while (!it.next().done); }
  /** What follows a climate cycle (the cover, the sea's inputs, weathering's map), in pieces the engine's worker yields between (Life.afterClimateSteps). */
  *afterClimateSteps() {
    yield* this.life.afterClimateSteps();
    this.carbon.measure();
    this.life.afterMeasure();
    this.climateVersionSeen = this.climate.version;
  }

  /** Values for the record. */
  sample() {
    const tec = this.tec, g = this.grid;
    let land = 0;
    for (let i = 0; i < g.n; i++) if (!tec.sea[i]) land += g.area[i];
    return [this.climate.stats.meanT + this.year.meanAt(this.years), this.carbon.pco2, (tec.seaLevel - this.seaLevel0) * 1000,
      this.ice.stats.seaLevel, 100 * land / (4 * Math.PI), this.carbon.ridge / this.carbon.ridge0, this.moon.solarDay];
  }

  /** Headless: run `years` with plate steps, the fast layers each `fastStep`, a climate cycle each `climateEvery`. */
  run(years, { fastStep = 1000, climateEvery = 2000, window = 0 } = {}) {
    let plateBank = 0, sinceClimate = Infinity;
    for (let t = 0; t < years; t += fastStep) {
      this.years += fastStep;
      plateBank += fastStep;
      while (plateBank >= 5e5) { this.plateStep(5e5); plateBank -= 5e5; }
      this.setOrbit(window);
      this.fast(fastStep, 1e9);
      sinceClimate += fastStep;
      if (sinceClimate >= climateEvery) { this.climate.solve(1); this.afterClimate(); sinceClimate = 0; }
      this.record.push(this.years, this.sample());
    }
  }
}

export { CLIMATE, CARBON };
