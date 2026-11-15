// The page's view of the planet, kept from the engine worker's snapshots
// (src/engine/worker.js). Each mirror has the shape the page and its figures
// read from the engine itself, so drawing code doesn't know which thread the
// model runs on.
import { Climate, NZ } from './climate.js';

/** The climate's harmonics, zones and ocean as of its last completed cycle. */
export class ClimateView {
  constructor(grid) {
    const n = grid.n, f = v => new Float32Array(n).fill(v);
    this.grid = grid;
    this.version = -1;
    this.stats = { meanT: 14, iceLat: 90, cycles: 0, hadley: 30 };
    this.zonal = null;
    this.Tf = [f(14), f(0), f(0), f(0), f(0)];
    this.Pf = [f(2.5), f(0), f(0), f(0), f(0)];
    this.presPhase = Array.from({ length: 6 }, () => f(0));
    this.W = Array.from({ length: 6 }, () => f(20));
    this.snowAnn = f(0); this.elevPos = f(0); this.landMask = new Uint8Array(n);
    this.zones = new Float32Array(NZ * n);
    this.ocean = { sst: f(0), psi: f(0), stats: { maxSv: 0 } };
    this.dust = null;      // the dust's stats (src/engine/aeolian.js)
    this.permafrost = f(0);   // the ground's share frozen all year, as drawn (the worker's drawnPermafrost)
  }
  update(m) {
    for (const k of ['version', 'stats', 'zonal', 'Tf', 'Pf', 'presPhase', 'W', 'snowAnn', 'landMask', 'elevPos', 'zones']) this[k] = m[k];
    this.ocean = { sst: m.sst, psi: m.psi, stats: m.oceanStats };
    // The sea's export production (g C m⁻² yr⁻¹) rides in the zones' first free slot, which the globe draws.
    if (m.prod) for (let i = 0, n = m.prod.length; i < n; i++) this.zones[NZ * i + 14] = m.prod[i];
    // The dust's load (kg/m², the year's mean) in the second.
    if (m.dust) for (let i = 0, n = m.dust.length; i < n; i++) this.zones[NZ * i + 15] = m.dust[i];
    this.dust = m.dustStats || null;
    if (m.permafrost) this.permafrost = m.permafrost;
  }
}
for (const k of ['tAt', 'pAt', 'presAt', 'surfaceT']) ClimateView.prototype[k] = Climate.prototype[k];

/**
 * The year (src/engine/year.js) as of its last step: the step's two ends (the anomaly is
 * drawn between them by the page's clock), the veil's bands at both, the eruptions of the
 * last few years, and the stats the figures and the caption read.
 */
export class YearView {
  constructor() {
    Object.assign(this, { live: 0, t0: 0, t1: 0, meanT: 0, meanPrev: 0, sigma: 0, F: 0, Fmean: 0, Frate: 0, aod: 0, rates: null, tag: null,
      bands: new Float32Array(36), bandsPrev: new Float32Array(36), eruptions: [] });
  }
  /** A 'year' message: a new step. */
  step(m) {
    for (const k of ['live', 't0', 't1', 'meanT', 'meanPrev', 'bands', 'bandsPrev', 'eruptions']) this[k] = m[k];
  }
  /** The 'fast' message's year: rates, forcing, spread, the tagged eruption (its mean is the step's). */
  stats(s) { const { meanT, ...rest } = s; Object.assign(this, rest); }
  /** How far `years` is between the step's two ends. */
  phase(years) { return this.t1 > this.t0 ? Math.min(1, Math.max(0, (years - this.t0) / (this.t1 - this.t0))) : 1; }
  /** The anomaly's global mean at `years`, as live as the year is. */
  meanAt(years) { return this.live * (this.meanPrev + this.phase(years) * (this.meanT - this.meanPrev)); }
}
