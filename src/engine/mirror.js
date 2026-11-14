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
  }
  update(m) {
    for (const k of ['version', 'stats', 'zonal', 'Tf', 'Pf', 'presPhase', 'W', 'snowAnn', 'landMask', 'elevPos', 'zones']) this[k] = m[k];
    this.ocean = { sst: m.sst, psi: m.psi, stats: m.oceanStats };
  }
}
for (const k of ['tAt', 'pAt', 'presAt', 'surfaceT']) ClimateView.prototype[k] = Climate.prototype[k];
