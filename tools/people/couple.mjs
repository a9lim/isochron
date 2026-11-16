// The people beside a live Planet, headless (docs/PLAN.md, Roadmap 2.0): the planet stepped on the
// people's clock from the first farming origin on, the write-back through its own inputs as the
// page does it (src/engine/peoplelink.js: emissions, land use, tillage, heat and sulfate). After
// each climate cycle the people re-read the climate, the cover, the soil, the sea level and the
// ice. The planet steps at most every PLANET_DT years of the people's clock (and at least a
// year), its climate every CLIMATE_MAX years or sooner when the forcing, CO₂ or land use has moved.
import { fieldsOf, PeopleLink } from '../../src/engine/peoplelink.js';

export const COUPLE = {
  PLANET_DT: 50, PLANET_MIN: 1,      // years: the planet's step at most, at least
  CLIMATE_MAX: 500, CLIMATE_MIN: 5,  // years between climate cycles: at most, and at least when something moved (a cycle is ~1 s at level 6)
  D_F: 0.25, D_CO2: 10, D_FARM: 0.005,   // what counts as moved: W/m², ppm, the farmed share of land
};

export class Live {
  constructor(P, people) {
    this.P = P; this.p = people; this.live = true;
    // The regolith re-makes its opening layer once more after the climate settles; let it do so
    // before any tillage is added (inside the first fast step it would take tillage as its balance).
    P.regolith.advance(0);
    this.link = new PeopleLink(P);
    this.T0 = P.climate.stats.meanT;
    this.f = fieldsOf(P);
    this.bank = 0; this.carbonBank = 0; this.plateBank = 0; this.since = 0;
    this.last = { F: 0, co2: P.carbon.pco2, farm: 0 };
    this.stats = { steps: 0, cycles: 0, msFast: 0, msClimate: 0, pulsed: 0 };
    people.env = this;
    people.rates(this.f);
    for (let c = 0; c < people.nL; c++) people.soil[c] = P.regolith.h[people.cells[c]];
  }

  // The people's environment: the planet's CO₂, its sea's boiled share, its warming since the people began.
  co2() { return this.P.carbon.pco2; }
  get boiled() { return this.P.runaway.b; }
  get dT() { return this.P.climate.stats.meanT - this.T0; }
  emit(PgC) { this.carbonBank += PgC; }
  soil() {}   // tillage's erosion goes in at the planet's next fast step

  /** After each step of the people: the planet steps when enough time has banked. */
  advance(dt) {
    this.bank += dt;
    const due = Math.min(COUPLE.PLANET_DT, Math.max(COUPLE.PLANET_MIN, 4 * dt));
    if (this.bank >= due) { this.step(this.bank); this.bank = 0; }
  }

  step(h) {
    const P = this.P, p = this.p, t0 = performance.now();
    P.years += h; this.plateBank += h;
    while (this.plateBank >= 5e5) { P.plateStep(5e5); this.plateBank -= 5e5; }
    P.setOrbit(0);
    // The people's forcing, whatever it is (past the limit the planet's runaway boils the sea: src/engine/runaway.js).
    const F = p.forcing.heat + p.forcing.aer;
    this.link.receive({ ...p.writeBack(), carbon: this.carbonBank, F });
    this.carbonBank = 0;
    this.link.beforeFast();
    try { P.fast(h, 1e9, 10 * h); }
    catch (e) {
      const sea = P.carbon.sea;
      console.error(`the planet failed a ${h.toFixed(2)}-yr step at the people's ${this.p.t.toFixed(0)} yr: ${e.message}\n  sea inputs ${JSON.stringify(sea.in)}\n  air ${P.carbon.pco2} · land flux ${P.carbon.landFlux} · life ${JSON.stringify(P.life.stats)} · cycles ${this.stats.cycles} · last ${JSON.stringify(this.last)}`);
      throw e;
    }
    this.link.afterFast();
    this.stats.pulsed = this.link.stats.pulsed;
    for (let c = 0; c < p.nL; c++) p.soil[c] = P.regolith.h[p.cells[c]];
    this.stats.steps++; this.stats.msFast += performance.now() - t0;
    // A climate cycle when due.
    this.since += h;
    const farm = this.farmShare(), L = this.last;
    const moved = Math.abs(F - L.F) > COUPLE.D_F || Math.abs(P.carbon.pco2 - L.co2) > COUPLE.D_CO2 || Math.abs(farm - L.farm) > COUPLE.D_FARM;
    if (this.since >= COUPLE.CLIMATE_MAX || (this.since >= COUPLE.CLIMATE_MIN && moved)) this.cycle(F, farm);
  }

  cycle(F, farm) {
    const P = this.P, p = this.p, t0 = performance.now();
    P.climate.solve(1);
    P.afterClimate();          // the cover's new balance, scaled by the farmed shares (Life.onCover)
    fieldsOf(P, this.f);
    p.rates(this.f);
    this.since = 0;
    this.last = { F, co2: P.carbon.pco2, farm };
    this.stats.cycles++; this.stats.msClimate += performance.now() - t0;
    if (this.onCycle) this.onCycle(this);
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
