// Mantle plumes (docs/MODEL.md): hotspots fixed in the mantle's
// frame, and the large igneous provinces that plume heads make.
//
//   hotspot   a plume tail. It builds volcanic crust on whatever passes over
//             it, so a plate moving across it carries off a chain of
//             seamounts and islands, oldest farthest away, and it lifts a
//             swell of hot mantle around itself (dynamic topography).
//   LIP       a plume head arriving: a flood of basalt over a disc ~1,000 km
//             across within a million years, a pulse of CO₂, and, under a
//             continent, the rift that splits it. Its tail stays as a hotspot.
// Arrivals are a seeded Poisson process. Times in Myr.
import { MANTLE } from './mantle.js';
import { stream } from '../rng.js';
import { nearest } from '../grid/icosphere.js';

export const PLUMES = {
  HOTSPOTS: 10,
  BUILD: 1.2,        // km of crust a hotspot adds per Myr at its centre
  SWELL: 0.8,        // km of uplift at a hotspot, falling off over SWELL_R
  SWELL_R: 0.06,     // rad (~400 km)
  LIP_EVERY: 30,     // Myr between plume heads, on average
  LIP_R: 0.09,       // rad (~570 km): the flood's radius
  LIP_DH: 4,         // km of basalt at the centre
  LIP_TIME: 1,       // Myr the flood lasts
  LIP_CO2: 8000,     // Pg C released
  MAX_HOTSPOTS: 16,
};

export class Plumes {
  /** `at`: the hotspots' places ({ lat, lon } in degrees: today's Earth's, src/engine/earth.js), else seeded. */
  constructor(tec, seed, at = null) {
    this.tec = tec;
    this.rng = stream(seed, 'plumes');
    this.hot = [];        // { p: [x,y,z], born }
    this.lips = [];       // { p, t0, cell, released }
    // Seeded hotspots rise where plume heads do, on the mantle's piles' edges (src/engine/mantle.js).
    for (let k = 0; k < PLUMES.HOTSPOTS; k++) {
      let p = tec.mantle && !at ? tec.mantle.plumeSite(this.rng) : this.rng.unitVector();
      if (at && at[k]) { const la = at[k].lat * Math.PI / 180, lo = at[k].lon * Math.PI / 180; p = [Math.cos(la) * Math.cos(lo), Math.cos(la) * Math.sin(lo), Math.sin(la)]; }
      this.hot.push({ p, born: tec.t - this.rng.range(0, 150) });
    }
    this.nextLip = tec.t + this.rng.exponential(PLUMES.LIP_EVERY);
    this.swell = new Float32Array(tec.grid.n);
    this.drifted = 0;     // rad the hotspots have drifted since the swell was last laid
    this.updateSwell();
    this.co2Rate = 0;     // Pg C per Myr from active provinces
    this.events = [];     // recent arrivals, for the caption and the record
  }

  /** The swell around each hotspot (km), in the mantle's frame. */
  updateSwell() {
    const g = this.tec.grid, pos = g.pos, n = g.n, r2 = PLUMES.SWELL_R ** 2;
    this.swell.fill(0);
    for (const h of this.hot) {
      const [hx, hy, hz] = h.p;
      for (let i = 0; i < n; i++) {
        const d = pos[3 * i] * hx + pos[3 * i + 1] * hy + pos[3 * i + 2] * hz;
        if (d < 0.97) continue;
        const a2 = 2 * (1 - d);           // chord² ≈ angle²
        this.swell[i] += PLUMES.SWELL * Math.exp(-a2 / (2 * r2));
      }
    }
  }

  /** Thicken the crust under cell i's owner by dh km (basalt: the felsic fraction falls). */
  build(i, dh) {
    const tec = this.tec, p = tec.plates[tec.owner[i]], j = tec.ref[i];
    if (!p || !p.mask[j]) return;
    p.phi[j] = p.phi[j] * p.h[j] / (p.h[j] + dh);
    p.h[j] = Math.min(72, p.h[j] + dh);
    tec.h[i] = p.h[j]; tec.phi[i] = p.phi[j];
  }

  step(dt) {
    const tec = this.tec, g = tec.grid, pos = g.pos, nbrOff = g.nbrOff, nbr = g.nbr;
    // Hotspots drift in the mantle's flow (MANTLE.DRIFT of it: the conduit leans in the mantle wind), the
    // swell laid again once they've moved a fifth of its radius.
    if (tec.mantle) {
      let most = 0;
      for (const h of this.hot) {
        const u = tec.mantle.flowAt(h.p), p = h.p;
        let x = p[0] + MANTLE.DRIFT * u[0] * dt, y = p[1] + MANTLE.DRIFT * u[1] * dt, z = p[2] + MANTLE.DRIFT * u[2] * dt;
        const r = Math.hypot(x, y, z);
        h.p = [x / r, y / r, z / r];
        most = Math.max(most, MANTLE.DRIFT * Math.hypot(u[0], u[1], u[2]) * dt);
      }
      this.drifted += most;
      if (this.drifted > 0.2 * PLUMES.SWELL_R) { this.drifted = 0; this.updateSwell(); }
    }
    // Hotspots build their chains.
    for (const h of this.hot) {
      const i = nearest(g, h.p[0], h.p[1], h.p[2], h.cell ?? -1);
      h.cell = i;
      this.build(i, PLUMES.BUILD * dt);
      for (let t = nbrOff[i], e = nbrOff[i + 1]; t < e; t++) this.build(nbr[t], 0.3 * PLUMES.BUILD * dt);
    }
    // Plume heads.
    while (tec.t >= this.nextLip) {
      this.arrive(tec.mantle ? tec.mantle.plumeSite(this.rng) : this.rng.unitVector(), this.nextLip);
      this.nextLip += this.rng.exponential(PLUMES.LIP_EVERY);
    }
    // Floods in progress: basalt and CO₂ through their first LIP_TIME.
    this.co2Rate = 0;
    for (const L of this.lips) {
      const age = tec.t - L.t0;
      if (age < 0 || age > PLUMES.LIP_TIME + dt) continue;
      const share = Math.min(dt, PLUMES.LIP_TIME - Math.max(0, age - dt)) / PLUMES.LIP_TIME;
      if (share <= 0) continue;
      this.co2Rate += PLUMES.LIP_CO2 * share / dt;
      const r2 = PLUMES.LIP_R ** 2;
      const [lx, ly, lz] = L.p;
      for (let i = 0; i < g.n; i++) {
        const d = pos[3 * i] * lx + pos[3 * i + 1] * ly + pos[3 * i + 2] * lz;
        if (d < 0.98) continue;
        const a2 = 2 * (1 - d);
        this.build(i, PLUMES.LIP_DH * share * Math.exp(-a2 / (2 * r2)));
      }
    }
    this.lips = this.lips.filter(L => tec.t - L.t0 < 40);
    this.events = this.events.filter(e => tec.t - e.t < 40);
  }

  /** A plume head arrives at p: a flood, a hotspot, and maybe a rift. */
  arrive(p, t) {
    const tec = this.tec, g = tec.grid;
    const i = nearest(g, p[0], p[1], p[2]);
    this.lips.push({ p, t0: t, cell: i });
    this.hot.push({ p, born: t, cell: i });
    if (this.hot.length > PLUMES.MAX_HOTSPOTS) this.hot.shift();
    this.updateSwell();
    const k = tec.owner[i];
    const onLand = tec.phi[i] >= 0.5;
    this.events.push({ t, p, onLand });
    // Under a continent, the plume head splits its plate through itself.
    if (onLand && tec.plates[k] && tec.plates[k].area > 0.04 * 4 * Math.PI && tec.alivePlates().length < 16) tec.rift(k, p);
  }

  /** Is a province erupting now? Its age in Myr, for drawing. */
  active() { return this.lips.filter(L => this.tec.t - L.t0 >= 0 && this.tec.t - L.t0 < 3); }
}
