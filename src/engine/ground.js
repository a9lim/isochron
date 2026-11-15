// The ground, live (docs/PLAN.md, phase 6): the year's member for soil water,
// the snowpack and the ground's heat (src/engine/soil.js has the physics).
// Two states:
//
//   the closure   the periodic year under the climate's months, which the
//                 climate solves each cycle (Climate.groundYear) and reads at
//                 every dial: its runoff by month and in the year, and its
//                 evaporative efficiency through the year;
//   the live      the same ground stepped month by month by the year (src/
//                 engine/year.js), with the interannual anomaly on top (held
//                 over each of the year's steps), so a wet year fills the soil
//                 and the rivers drain it over the months after, and a snowy
//                 winter swells the spring's melt. On the engine's GPU where
//                 there is one (src/gpu/soil.js: a dispatch per step, the
//                 climate's months resident, only the anomaly uploaded), else
//                 on the CPU (headless; ~13 ms a month at level 7).
//
// Its calendar runs on from the handover month after month, so it never skips
// or repeats one (the stepper's months are twelfths of the year; the calendar's
// aren't).
//   handover     closure → live: the periodic year's state at the step's first
//                month, then a year of the climate's months alone (the GPU's
//                twelve-month record fills with the periodic year, which that
//                year repeats), then the step. So the switch is continuous, and
//                the rivers and the lakes read a whole year from the start.
//                Live → closure: the live state is dropped; the next handover
//                starts again from the periodic year.
//   read back    (GPU, the engine's worker asks ~10 times a second) the last
//                twelve months' runoff and evaporative efficiency, and the
//                rivers' month's runoff. Each handover and each drop of the
//                live state is a new epoch, and a read from an earlier one is
//                discarded when it lands.
//   the bank     the water the live ground has discharged (mm per cell, every
//                month it steps: on the GPU summed there and taken with each
//                read), with the span of the clock it covers. The lakes take
//                the share of it up to the clock each time they step, so they
//                receive the volumes the soil let go, when it let them go (the
//                last twelve months' total read as a rate, integrated over the
//                lakes' own steps, lost ~16% of it).
//   slow mean    (synthesis) β over ~5 years of the clock, against the
//                closure's: the climate's next cycle evaporates by that ratio,
//                weighed by the live weight (the soil's memory of a drought
//                dries the air downwind).
import { Soil } from './soil.js';

export const GROUND = {
  SLOW: 5,            // years: the slow mean's e-folding
  RATIO_MAX: 3,       // the live β against the closure's, at most
};

export class Ground {
  constructor(climate, { gpu = null, cpuLive = true } = {}) {
    this.climate = climate;
    this.n = climate.grid.n;
    this.gpu = gpu;            // src/gpu/soil.js, where there's a device
    this.cpuLive = cpuLive;    // step on the CPU when there's no GPU (headless)
    this.cpu = null;
    this.live = false;         // stepping (the year is live and the ground has handed over)
    this.weight = 0;           // the year's live weight, last seen
    this.month = 0;            // the next calendar month to step
    this.t = null;             // the clock at the last step's end
    this.version = -1;         // the climate's version whose months the live state is forced by
    this.stepped = 0;
    this.agg = null;           // the last twelve live months: runoff (mm a year), beta, wet, …
    this.aggYears = 0;
    this.monthRunoff = null;   // one calendar month's live runoff (mm), for the rivers
    this.monthOf = -1;
    this.betaSlow = null;      // the slow mean of β, and its ratio to the closure's
    this.betaRatio = new Float32Array(this.n).fill(1);
    this.slowYears = null;
    this.handovers = 0;
    this.epoch = 0;            // a new one at each handover and each drop of the live state
    this.bank = new Float64Array(this.n);   // mm discharged and not yet taken by the lakes
    this.bankFrom = 0;         // the clock span the bank covers (years)
    this.bankTo = 0;
  }

  /** The year's hook: one step of `months` months from the step's start (see Year.stepInputs). */
  step({ years, m0, months, live, dT, rf }) {
    this.weight = live;
    const c = this.climate;
    if (!c.soilWarm || (!this.gpu && !this.cpuLive)) return;
    if (!this.live) this.handover(m0, years);
    this.refresh();
    if (this.gpu) {
      this.gpu.setAnomaly(dT, rf, 1, { hold: true });
      this.gpu.step(this.month, months);
    } else {
      const s = this.cpu, o = s.out, B = this.bank, n = this.n;
      for (let k = 0; k < months; k++) {
        const m = (this.month + k) % 12;
        s.stepMonth(m, c.T12, c.P12, c.PET12, dT, rf);
        for (let i = 0; i < n; i++) if (s.Smax[i] > 0) B[i] += o.quick[12 * i + m] + o.base[12 * i + m];
      }
    }
    this.month = (this.month + months) % 12;
    this.t = years + months / 12;
    if (!this.gpu) this.bankTo = this.t;
    this.stepped += months;
  }

  /** The year's hook while it isn't wholly live: outrun, the live state is dropped. */
  closure({ live }) {
    this.weight = live;
    if (live <= 0 && this.live) { this.live = false; this.agg = null; this.monthRunoff = null; this.betaSlow = null; this.betaRatio.fill(1); this.bank.fill(0); this.epoch++; }
  }

  /** From the closure's periodic year, at the start of calendar month m0 (the clock at `years`). */
  handover(m0, years = 0) {
    const c = this.climate, s = c.soil, o = s.out, n = this.n, p = (m0 + 11) % 12;
    const S = new Float64Array(n), W = new Float64Array(n), G = new Float64Array(n), Gw = new Float64Array(n);
    for (let i = 0; i < n; i++) { if (!(s.Smax[i] > 0)) continue; const k = 12 * i + p; S[i] = o.S[k]; W[i] = o.SWE[k]; G[i] = o.Tg[k]; Gw[i] = o.G[k]; }
    if (this.gpu) {
      const g = this.gpu;
      g.setCapacity(s.Smax); g.setForcing(c.T12, c.P12, c.PET12); g.setState(S, W, G, Gw);
      g.setAnomaly(null);
      g.step(m0, 12);
      g.clearBank();               // that year was the closure's (the rivers' record), not water let go now
    } else {
      const cpu = this.cpu || (this.cpu = new Soil(n, 0));
      cpu.setCapacity(s.Smax); cpu.S.set(S); cpu.SWE.set(W); cpu.Tg.set(G); cpu.G.set(Gw);
      for (const k in o) cpu.out[k].set(o[k]);
    }
    this.version = c.version;
    this.month = m0;
    this.live = true;
    this.handovers++;
    this.epoch++;
    this.bank.fill(0); this.bankFrom = this.bankTo = years;
  }

  /** A new climate cycle: its months (and the soil's capacity) become the live state's forcing. */
  refresh() {
    const c = this.climate;
    if (c.version === this.version) return;
    this.version = c.version;
    if (this.gpu) { this.gpu.setCapacity(c.soil.Smax); this.gpu.setForcing(c.T12, c.P12, c.PET12); }
    else this.cpu.setCapacity(c.soil.Smax);
  }

  /**
   * GPU: read the live aggregates, calendar month m's runoff and the bank back (one read at a
   * time); the clock at `years`. A read that lands in a later epoch is discarded.
   */
  async readBack(m, years) {
    if (!this.gpu || !this.live || this.gpu.reading) return false;
    const epoch = this.epoch, to = this.t;
    const r = await this.gpu.read({ month: m, bank: true });
    if (!this.live || this.epoch !== epoch) return false;
    if (r.bank) { const B = this.bank; for (let i = 0; i < this.n; i++) B[i] += r.bank[i]; this.bankTo = Math.max(this.bankTo, to); }
    this.take(r, r.runoffMonth, m, years);
    return true;
  }

  /** CPU: the same, from the live soil's record (headless). */
  sample(m, years) {
    if (!this.live || !this.cpu) return false;
    const s = this.cpu, n = this.n, o = s.out, rm = this.cpuMonth || (this.cpuMonth = new Float32Array(n));
    s.aggregate();
    for (let i = 0; i < n; i++) rm[i] = o.quick[12 * i + m] + o.base[12 * i + m];
    this.take({ runoff: s.runoff, evap: s.evap, wet: s.wet, beta: s.beta, tg: s.tgMean, permafrost: s.permafrost }, rm, m, years);
    return true;
  }

  take(r, month, m, years) {
    const n = this.n, cb = this.climate.soil.beta;
    this.agg = r; this.aggYears = years;
    this.monthRunoff = month; this.monthOf = m;
    if (!this.betaSlow || this.slowYears === null) { this.betaSlow = Float32Array.from(r.beta); this.slowYears = years; }
    else {
      const a = 1 - Math.exp(-Math.max(0, years - this.slowYears) / GROUND.SLOW), b = this.betaSlow;
      for (let i = 0; i < n; i++) b[i] += a * (r.beta[i] - b[i]);
      this.slowYears = years;
    }
    const b = this.betaSlow, q = this.betaRatio;
    for (let i = 0; i < n; i++) q[i] = cb[i] > 0.02 ? Math.min(GROUND.RATIO_MAX, b[i] / cb[i]) : 1;
  }

  /**
   * The lakes' runoff (m/yr per cell) over the dt years to the clock at `years`: the closure's,
   * and by the live weight the bank's share up to the clock (its span is the soil's months, so
   * the share is the water discharged by then), taken from it.
   */
  lakeRunoff(out, years, dt) {
    const c = this.climate, n = this.n, w = this.live ? this.weight : 0, B = this.bank;
    if (!(w > 0) || !(dt > 0)) { this.drain(years); return this.runoff(out); }
    const span = this.bankTo - this.bankFrom, f = span > 0 ? Math.min(1, Math.max(0, (years - this.bankFrom) / span)) : 0;
    for (let i = 0; i < n; i++) { const v = f * B[i]; B[i] -= v; out[i] = (1 - w) * c.runoff[i] + w * v / (1000 * dt); }
    this.bankFrom += f * span;
    return out;
  }
  /** The bank up to the clock let go unseen (the lakes at their balance read the runoff as a rate). */
  drain(years) {
    const span = this.bankTo - this.bankFrom, f = span > 0 ? Math.min(1, Math.max(0, (years - this.bankFrom) / span)) : 0;
    if (f > 0) { for (let i = 0; i < this.n; i++) this.bank[i] *= 1 - f; this.bankFrom += f * span; }
  }

  /** Runoff (m/yr) per cell: the closure's, and the live last twelve months' by the live weight. */
  runoff(out) {
    const c = this.climate, n = this.n, w = this.live && this.agg ? this.weight : 0, R = this.agg ? this.agg.runoff : null;
    for (let i = 0; i < n; i++) out[i] = w > 0 ? (1 - w) * c.runoff[i] + w * R[i] / 1000 : c.runoff[i];
    return out;
  }
}
