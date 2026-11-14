// The planet: every layer on one grid, stepped together (docs/PLAN.md, "One
// planet, one state, one dial"). The page and the headless tools both drive
// this, so they run the same coupled model.
//
//   per plate step (0.5 Myr)   plates, plumes, landscape
//   per frame                  the orbit the climate sees (averaged over the
//                              time the dial passes in ~2 s), carbon, ice
//   in the background          the climate's cycles; each completed cycle
//                              refreshes weathering's map and the ice's
//                              mass balance
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

export { Record, SERIES } from './record.js';
import { Record } from './record.js';

export class Planet {
  constructor(seed, opts = {}) {
    this.seed = seed;
    this.grid = buildGrid(opts.level ?? 6);
    this.tec = new Tectonics(this.grid);
    this.land = new Landscape(this.tec);
    genesis(this.tec, seed, { spinup: opts.spinup ?? 40, landscape: this.land });
    this.plumes = new Plumes(this.tec, seed);
    this.tec.swell = this.plumes.swell;
    this.tec.updateElevation();
    this.land.reroute();
    this.climate = new Climate(this.tec, this.land);
    this.ice = new Ice(this.tec, this.climate);
    this.climate.ice = this.ice;
    this.ocean = new Ocean(this.climate);
    this.climate.ocean = this.ocean;
    this.carbon = new Carbon(this.tec, this.land, this.climate, this.plumes);
    this.orbit = new OrbitCycles(seed);
    this.years = this.tec.t * 1e6;
    this.seaLevel0 = this.tec.seaLevel;
    this.record = new Record();
    this.climateVersionSeen = -1;
    this.iceWaterSolved = 0;
    this.loadSince = 0;
    this.setOrbit(1e6);
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
    tec.updateElevation();
    this.landBank = (this.landBank || 0) + dt;
    if (this.landBank >= 2.5e5) { this.land.step(this.landBank); this.landBank = 0; }
  }

  /** The fast layers over dt years: carbon, and ice within a time budget. */
  fast(dt, iceMs = 4) {
    this.carbon.step(dt);
    CLIMATE.CO2 = this.carbon.pco2;
    if (dt > 0) {
      this.ice.advance(dt, iceMs);
      // Re-solve the sea only when the ice has moved ~10 cm of it (the solve is ~5 ms).
      if (Math.abs(this.tec.iceWater - (this.iceWaterSolved ?? 0)) > 3.5e-6 || this.loadSince++ > 30) {
        this.tec.updateElevation();
        this.iceWaterSolved = this.tec.iceWater;
        this.loadSince = 0;
      }
    }
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
    return [this.climate.stats.meanT, this.carbon.pco2, (tec.seaLevel - this.seaLevel0) * 1000,
      this.ice.stats.seaLevel, 100 * land / (4 * Math.PI), this.carbon.ridge / this.carbon.ridge0];
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
