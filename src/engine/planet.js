// The planet: every layer on one grid, stepped together (docs/PLAN.md, "One
// planet, one state, one dial"). The page and the headless tools both drive
// this, so they run the same coupled model.
//
//   per plate step (0.5 Myr)   plates, plumes, landscape
//   per frame                  the orbit the climate sees (averaged over the
//                              time the dial passes in ~2 s), carbon, ice,
//                              the year (src/engine/year.js): its months
//                              while the dial is below ~100 yr/s (the
//                              anomaly, the veil, the ground's soil water and
//                              snow), the volcanoes' mean forcing at every
//                              dial; and the lakes, stepped below ~10⁴ yr/s
//                              and at their balance above
//   in the background          the climate's cycles; each completed cycle
//                              refreshes weathering's map, the ice's mass
//                              balance and the ground's periodic year
//
// The lakes are routed on the smooth surface, the ground plus its ice (so ice
// dams them), and rebuilt after each landscape step and when the ice has
// moved enough of the sea (src/engine/lakes.js carries their water over).
import { buildGrid } from '../grid/icosphere.js';
import { Tectonics } from './plates.js';
import { Landscape } from './landscape.js';
import { Climate, CLIMATE } from './climate.js';
import { Ice } from './ice.js';
import { Carbon, CARBON } from './carbon.js';
import { Plumes } from './plumes.js';
import { OrbitCycles } from './orbit.js';
import { Ocean } from './ocean.js';
import { genesis } from './genesis.js';
import { refineTectonics } from './refine.js';
import { Moon } from './tides.js';
import { Volcanoes } from './volcanoes.js';
import { Year } from './year.js';
import { Ground } from './ground.js';
import { Lakes } from './lakes.js';

export const PLANET = {
  LAKES_LIVE: 1e4,       // yr/s: lakes step below this, and sit at their balance above
  LAKES_ICE: 3.5e-5,     // km·sr: the ice's water that moves before the lakes are rebuilt for it,
  LAKES_ICE_YEARS: 100,  // and the years of the clock at least between such rebuilds (a rebuild is ~25 ms at level 7)
  LAKES_SETTLE: 4,       // climate cycles: the opening's lakes sit at their balance until the climate has settled
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
    this.ocean = new Ocean(this.climate, this.climate.coarse);
    this.climate.ocean = this.ocean;
    this.carbon = new Carbon(this.tec, this.land, this.climate, this.plumes);
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
    for (let i = 0; i < n; i++) d[i] = Math.max(0, (t.seaLevel - t.elev[i]) * 1000);
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
  }

  /**
   * The fast layers over dt years at `rate` years a second of the dial: carbon, ice within a
   * time budget, and the year (live below ~100 yr/s). Headless, a fast step stands for a
   * tenth of a second of the dial.
   */
  fast(dt, iceMs = 4, rate = 10 * dt) {
    this.carbon.step(dt);
    CLIMATE.CO2 = this.carbon.pco2;
    if (dt > 0) {
      // On the GPU where there is one (src/gpu/ice.js), else here (headless).
      if (this.iceGpu) this.iceGpu.advance(dt); else this.ice.advance(dt, iceMs);
      // Re-solve the sea only when the ice has moved ~10 cm of it (the solve is ~5 ms).
      if (Math.abs(this.tec.iceWater - (this.iceWaterSolved ?? 0)) > 3.5e-6 || this.loadSince++ > 30) {
        this.tec.updateElevation();
        this.iceWaterSolved = this.tec.iceWater;
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

  /** Lakes routed afresh on the ground and its ice (the water carried over). */
  rebuildLakes() {
    this.lakes.reroute(this.tec.elev, this.tec.seaLevel, this.ice.H);
    this.lakesSteps = this.land.steps; this.lakesIce = this.tec.iceWater; this.lakesBuiltYears = this.years;
    this.lakesBuiltAt = typeof performance !== 'undefined' ? performance.now() : 0;
    this.lakesClimate = -1;
    this.lakesVersion++;
  }

  /**
   * The lakes over dt years at `rate` years a second: rebuilt when the landscape has stepped
   * (at most every half `lakesMinGap` ms of the wall clock: at 1 Myr/s it steps four times a
   * second) or the ice has moved (at most every LAKES_ICE_YEARS of the clock and `lakesMinGap`
   * ms: ice dams change over centuries), then stepped
   * (backward Euler, at most 20 times a second of the dial and at least a quarter year a
   * step) below LAKES_LIVE, at their balance above (when the climate or the basins change,
   * or a tenth of a second's dial has passed).
   */
  stepLakes(dt, rate = 10 * dt) {
    const now = typeof performance !== 'undefined' ? performance.now() : 0;
    const iceMoved = Math.abs(this.tec.iceWater - this.lakesIce) > PLANET.LAKES_ICE && this.years - this.lakesBuiltYears >= PLANET.LAKES_ICE_YEARS && now - this.lakesBuiltAt >= this.lakesMinGap;
    const landStepped = this.land.steps !== this.lakesSteps && now - this.lakesBuiltAt >= this.lakesMinGap / 2;
    if (landStepped || iceMoved) this.rebuildLakes();
    this.lakesBank += Math.max(0, dt);
    // The opening's lakes sit at their balance with each of its first climate cycles, whatever
    // the dial (the first, from a cold start, holds about half the lakes the third does).
    const open = this.climate.soilWarm && this.climate.stats.cycles <= PLANET.LAKES_SETTLE && this.climate.version !== this.lakesClimate;
    const live = rate < PLANET.LAKES_LIVE && !open, due = Math.max(0.25, rate / 20);
    if (!open && (live ? this.lakesBank < due : this.lakesBank < due && this.climate.version === this.lakesClimate)) return;
    const { runoff, pe } = this.lakeForcing();
    if (live) this.lakes.step(this.lakesBank, runoff, pe); else this.lakes.equilibrium(runoff, pe, this.lakesBank);
    this.lakesBank = 0; this.lakesClimate = this.climate.version;
    this.lakesVersion++;
  }

  /**
   * The lakes' forcing (m/yr per cell): runoff off dry ground, the ground's (its closure's,
   * and the live ground's last twelve months by the live weight, which carry the year's
   * anomaly with its own statistics); and open water's gain, the climate's rain less its
   * potential evaporation. (The anomaly on the lakes' own surface is left out: held over the
   * year's steps, a month's anomaly would stand for a season's.)
   */
  lakeForcing() {
    const { runoff, pe } = this.lakeIn;
    this.ground.runoff(runoff);
    pe.set(this.climate.peAnn);
    return this.lakeIn;
  }

  /** Background work on the climate; true when a cycle completed. */
  climateWork(ms) {
    const done = this.climate.work(ms);
    if (done) this.afterClimate();
    return done;
  }
  afterClimate() {
    this.carbon.measure();
    this.climateVersionSeen = this.climate.version;
  }

  /** Values for the record. */
  sample() {
    const tec = this.tec, g = this.grid;
    let land = 0;
    for (let i = 0; i < g.n; i++) if (tec.elev[i] > tec.seaLevel) land += g.area[i];
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
