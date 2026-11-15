// The write-back (docs/PLAN.md, Roadmap 2.0, v1): a live Planet stepped beside the people, from the
// first farming origin on. Nothing in src/ changes; the coupler goes through the planet's own
// inputs:
//   emissions   fossil carbon burned goes to `carbon.pulse` at the next planet step: the sea's
//               chemistry takes it from there (OceanCarbon, the Pulse's physics).
//   land use    each farmed share scales the cover's tree equilibrium (its base, as the last climate
//               cycle set it) and clips its trees at once; the cover's own carbon (wood to litter to
//               soil to the air), albedo and evaporation do the rest.
//   soil        tillage's erosion (mm/yr) is added to the landscape's erosion field around each fast
//               step, so the regolith's exact step strips it (and with it the soil's water); the
//               people read the regolith back.
//   forcing     waste heat and sulfate (W/m²) are added to CLIMATE.F_VOLC around each climate cycle
//               the coupler drives; CO₂'s own forcing comes with the carbon.
// After each cycle the people re-read the climate, the cover, the soil, the sea level and the ice.
// The planet steps at most every PLANET_DT years of the people's clock (and at least a year), its
// climate every CLIMATE_MAX years or sooner when the forcing, CO₂ or land use has moved.
import { CLIMATE } from '../../src/engine/climate.js';
import { fieldsOf } from './planet.mjs';

export const COUPLE = {
  PLANET_DT: 50, PLANET_MIN: 1,      // years: the planet's step at most, at least
  CLIMATE_MAX: 500, CLIMATE_MIN: 5,  // years between climate cycles: at most, and at least when something moved (a cycle is ~1 s at level 6)
  D_F: 0.25, D_CO2: 10, D_FARM: 0.005,   // what counts as moved: W/m², ppm, the farmed share of land
};

export class Live {
  constructor(P, people) {
    this.P = P; this.p = people;
    // The regolith re-makes its opening layer once more after the climate settles; let it do so
    // before any tillage is added (inside the first fast step it would take tillage as its balance).
    P.regolith.advance(0);
    this.f = fieldsOf(P);
    this.bank = 0; this.carbonBank = 0; this.plateBank = 0; this.since = 0;
    this.sEq0 = Float64Array.from(P.life.veg.sEq);
    this.last = { F: 0, co2: P.carbon.pco2, farm: 0 };
    this.stats = { steps: 0, cycles: 0, msFast: 0, msClimate: 0, pulsed: 0 };
    people.env = this;
    people.rates(this.f);
    for (let c = 0; c < people.nL; c++) people.soil[c] = P.regolith.h[people.cells[c]];
  }

  // The people's environment.
  co2() { return this.P.carbon.pco2; }
  emit(PgC) { this.carbonBank += PgC; }
  soil() {}   // tillage's erosion (people.Ef) goes in at the planet's next fast step

  /** After each step of the people: the planet steps when enough time has banked. */
  advance(dt) {
    this.bank += dt;
    const due = Math.min(COUPLE.PLANET_DT, Math.max(COUPLE.PLANET_MIN, 4 * dt));
    if (this.bank >= due) { this.step(this.bank); this.bank = 0; }
  }

  step(h) {
    const P = this.P, p = this.p, cells = p.cells, ero = P.land.erosion, t0 = performance.now();
    P.years += h; this.plateBank += h;
    while (this.plateBank >= 5e5) { P.plateStep(5e5); this.plateBank -= 5e5; }
    P.setOrbit(0);
    if (this.carbonBank > 0) { P.carbon.pulse(this.carbonBank); this.stats.pulsed += this.carbonBank; this.carbonBank = 0; }
    for (let c = 0; c < p.nL; c++) if (p.Ef[c] > 0) ero[cells[c]] += p.Ef[c];
    try { P.fast(h, 1e9, 10 * h); }
    catch (e) {
      const sea = P.carbon.sea;
      console.error(`the planet failed a ${h.toFixed(2)}-yr step at the people's ${this.p.t.toFixed(0)} yr: ${e.message}\n  sea inputs ${JSON.stringify(sea.in)}\n  air ${P.carbon.pco2} · land flux ${P.carbon.landFlux} · life ${JSON.stringify(P.life.stats)} · cycles ${this.stats.cycles} · last ${JSON.stringify(this.last)}`);
      throw e;
    }
    for (let c = 0; c < p.nL; c++) if (p.Ef[c] > 0) ero[cells[c]] -= p.Ef[c];
    this.landUse();
    for (let c = 0; c < p.nL; c++) p.soil[c] = P.regolith.h[cells[c]];
    this.stats.steps++; this.stats.msFast += performance.now() - t0;
    // A climate cycle when due.
    this.since += h;
    const F = p.forcing.heat + p.forcing.aer, farm = this.farmShare(), L = this.last;
    const moved = Math.abs(F - L.F) > COUPLE.D_F || Math.abs(P.carbon.pco2 - L.co2) > COUPLE.D_CO2 || Math.abs(farm - L.farm) > COUPLE.D_FARM;
    if (this.since >= COUPLE.CLIMATE_MAX || (this.since >= COUPLE.CLIMATE_MIN && moved)) this.cycle(F, farm);
  }

  cycle(F, farm) {
    const P = this.P, p = this.p, t0 = performance.now(), f0 = CLIMATE.F_VOLC;
    CLIMATE.F_VOLC = f0 + F;
    P.climate.solve(1);
    P.afterClimate();
    CLIMATE.F_VOLC = f0;
    this.sEq0.set(P.life.veg.sEq);
    this.landUse();
    fieldsOf(P, this.f);
    p.rates(this.f);
    this.since = 0;
    this.last = { F, co2: P.carbon.pco2, farm };
    this.stats.cycles++; this.stats.msClimate += performance.now() - t0;
    if (this.onCycle) this.onCycle(this);
  }

  /** The farmed shares on the cover: the tree equilibrium scaled, the trees clipped to it. */
  landUse() {
    const veg = this.P.life.veg, p = this.p, cells = p.cells;
    for (let c = 0; c < p.nL; c++) {
      const i = cells[c], u = Math.min(1, Math.max(0, p.f[c]));
      veg.sEq[i] = this.sEq0[i] * (1 - u);
      if (u > 0 && veg.share[i] > veg.sEq[i]) {
        veg.share[i] = veg.sEq[i];
        veg.ft[i] = veg.veg[i] * veg.share[i]; veg.fg[i] = veg.veg[i] - veg.ft[i];
      }
    }
  }

  farmShare() {
    const p = this.p; let a = 0, A = 0;
    for (let c = 0; c < p.nL; c++) { a += p.H.area[c] * p.f[c]; A += p.H.area[c]; }
    return a / A;
  }

  /** The planet's state for the log. */
  sample() {
    const P = this.P, veg = P.life.veg, cells = this.p.cells;
    let A = 0, trees = 0;
    for (let c = 0; c < cells.length; c++) { const i = cells[c], a = P.grid.area[i]; A += a; trees += a * veg.ft[i]; }
    const land = new Uint8Array(P.grid.n); for (const i of cells) land[i] = 1;
    const tot = veg.totals(land);
    return { T: P.climate.stats.meanT, co2: P.carbon.pco2, sea: (P.tec.seaLevel - P.seaLevel0) * 1000, ice: P.ice.stats.volume / 1e15,
      trees: trees / A, landC: tot.veg + tot.soil, soil: P.regolith.stats.mean };
  }
}
