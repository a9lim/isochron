// Volcanoes and the stratospheric veil (docs/PLAN.md, phase 6, "Volcanic
// winters"). The effects are standard; the process is synthesis.
//
// Eruptions. A seeded Poisson process at three kinds of source:
//   arcs       where ocean sinks (the plates' arc memory, `tec.arc`), at a rate
//              that follows the convergence the carbon cycle reads (consumption
//              against the opening's: carbon.arc / carbon.arc0);
//   hotspots   each plume tail, rarer and smaller (mostly effusive);
//   floods     a large igneous province while it erupts: pulses ten times the
//              arcs' size floor, so a flood cools in pulses before its CO₂ warms.
// Sizes are a power law in sulfate, N(>M) ∝ M⁻¹: each decade of size (a size
// class) is ten times rarer than the one below. Sizes are in Pinatubos (one is
// ~15–20 Tg SO₂, from memory), from 0.1 (the smallest that reach the
// stratosphere and register, ~2 Tg) to a cap.
//
// The veil (standard, simplified). Sulfate aerosol in 5° latitude bands: an
// eruption injects optical depth into its band, which spreads in latitude
// (diffusion standing for the Brewer–Dobson circulation's poleward drift: a
// tropical veil covers both hemispheres within months, a high-latitude one
// stays in its own) and decays with an e-folding time of ~1 yr (Pinatubo's,
// from memory). The global-mean optical depth one Pinatubo makes is ~0.15
// (from memory); optical depth is taken as linear in sulfate, which overstates
// the largest eruptions (their particles grow and settle faster, from memory).
// The forcing is −25 W/m² per unit optical depth (Hansen and others' value,
// from memory), the same at every latitude and season: the veil reflects
// sunlight, so the polar night should be spared, but weighting by sunlight
// would make the forcing's mean depend on where the veil happens to be, and
// the closure's mean (below) is then no longer the live veil's.
//
// The dial. The live veil forces the year's anomaly (src/engine/year.js) by
// its departure from the eruption rate's mean, and the mean is folded into the
// climate's forcing (CLIMATE.F_VOLC) against the opening's, at every dial, so
// nothing switches when the year is outrun: the closure is the mean, and the
// opening's mean is already in the climate's tuning (North's fit is Earth's).
import { stream } from '../rng.js';

export const VOLC = {
  NB: 36,                // latitude bands (5°)
  TAU: 1,                // yr, the veil's e-folding time
  SPREAD: 0.5,           // rad²/yr, its diffusion in latitude
  INJECT_W: 4,           // ° of latitude, the injection's half-width
  AOD_P: 0.15,           // global-mean optical depth per Pinatubo
  FORCE: 25,             // W/m² per unit optical depth
  M_MIN: 0.1,            // Pinatubos, the smallest stratospheric eruption
  ARC_RATE: 1 / 10,      // per yr at least M_MIN, from all arcs, at the opening's convergence (≥ 1 P a century)
  ARC_MAX: 30,           // Pinatubos, the arcs' largest
  HOT_RATE: 1 / 400,     // per yr per hotspot, at least M_MIN
  HOT_MAX: 3,
  FLOOD_RATE: 1 / 60,    // per yr from an erupting province, at least FLOOD_MIN
  FLOOD_MIN: 1,
  FLOOD_MAX: 30,
  BACKGROUND: true,      // the stochastic eruptions (an experiment may hold them)
};

const DEG = Math.PI / 180;
// Area share of each band: (sin φ₂ − sin φ₁) / 2.
const bandArea = Float64Array.from({ length: VOLC.NB }, (_, b) => 0.5 * (Math.sin((-90 + 5 * (b + 1)) * DEG) - Math.sin((-90 + 5 * b) * DEG)));
const bandLat = b => (-87.5 + 5 * b) * DEG;

/** Mean of a power law N(>M) ∝ M⁻¹ on [lo, hi] (the atom at hi included). */
const plMean = (lo, hi) => lo * (1 + Math.log(hi / lo));
/** A size from it: M = lo / u, capped. */
const plDraw = (u, lo, hi) => Math.min(hi, lo / Math.max(1e-12, u));

export class Volcanoes {
  constructor(tec, plumes, carbon, seed) {
    this.tec = tec; this.plumes = plumes; this.carbon = carbon;
    this.rng = stream(seed, 'volcanoes');
    this.aod = new Float64Array(VOLC.NB);     // optical depth per band
    this.tag = new Float64Array(VOLC.NB);     // a tagged eruption's own veil (the Eruption experiment), part of `aod`
    this.recent = [];                          // { p: [x,y,z], M, t, kind } of the last few years
    this.cum = null; this.cumAt = -1;          // the arcs' cumulative activity, rebuilt each plate step
    this.F_ref = this.meanForcing();           // the opening's mean (in the climate's tuning)
    this.scratch = { a: new Float64Array(VOLC.NB), b: new Float64Array(VOLC.NB), c: new Float64Array(VOLC.NB), d: new Float64Array(VOLC.NB) };
  }

  /** Eruption rates (per yr at their size floors) by source. */
  rates() {
    if (!VOLC.BACKGROUND) return { arcs: 0, hot: 0, flood: 0 };
    const c = this.carbon, arcs = VOLC.ARC_RATE * (c && c.arc0 > 0 ? c.arc / c.arc0 : 1);
    const hot = VOLC.HOT_RATE * (this.plumes ? this.plumes.hot.length : 0);
    const floods = this.plumes ? this.plumes.lips.filter(L => { const a = this.tec.t - L.t0; return a >= 0 && a < 1; }).length : 0;
    return { arcs, hot, flood: VOLC.FLOOD_RATE * floods };
  }

  /** The eruption rate's mean forcing (W/m², global, ≤ 0): rate × mean size × the forcing a Pinatubo integrates. */
  meanForcing() {
    const r = this.rates(), perP = VOLC.FORCE * VOLC.AOD_P * VOLC.TAU;
    const so2 = r.arcs * plMean(VOLC.M_MIN, VOLC.ARC_MAX) + r.hot * plMean(VOLC.M_MIN, VOLC.HOT_MAX) + r.flood * plMean(VOLC.FLOOD_MIN, VOLC.FLOOD_MAX);
    return -perP * so2;
  }

  /** Global-mean optical depth (of the whole veil, or the tag's). */
  global(a = this.aod) { let s = 0; for (let b = 0; b < VOLC.NB; b++) s += a[b] * bandArea[b]; return s; }

  /** The optical depth per band (into `out`) of M Pinatubos injected at unit vector p: the band shares carry the global-mean M · AOD_P. */
  shares(p, M, out) {
    const lat = Math.asin(Math.max(-1, Math.min(1, p[2]))), w = VOLC.INJECT_W * DEG;
    let s = 0;
    for (let b = 0; b < VOLC.NB; b++) { const d = (bandLat(b) - lat) / w; out[b] = Math.exp(-0.5 * d * d) * bandArea[b]; s += out[b]; }
    for (let b = 0; b < VOLC.NB; b++) out[b] = M * VOLC.AOD_P * out[b] / s / bandArea[b];
    return out;
  }

  /** Inject M Pinatubos at unit vector p (into `tag` too, when tagged). */
  inject(p, M, t, kind = 'arc', tagged = false) {
    const v = this.shares(p, M, this.scratch.a);
    for (let b = 0; b < VOLC.NB; b++) { this.aod[b] += v[b]; if (tagged) this.tag[b] += v[b]; }
    this.recent.push({ p, M, t, kind });
  }

  /** The veil over dt years: decay (unless `decay` is false), and spreading in latitude (implicit, conservative on the sphere). */
  spread(a, dt, decay = true) {
    if (!(dt > 0)) return;
    const NB = VOLC.NB, k = decay ? Math.exp(-dt / VOLC.TAU) : 1, { b: lo, c: di, d: hi } = this.scratch, x = this.scratch.a;
    // ∂τ/∂t = (1/cos φ) ∂/∂φ (K cos φ ∂τ/∂φ), in band areas: flux across each edge ∝ K cos φₑ / Δφ.
    const dphi = 5 * DEG;
    for (let b = 0; b < NB; b++) {
      const cs = b > 0 ? Math.cos((-90 + 5 * b) * DEG) : 0, cn = b < NB - 1 ? Math.cos((-90 + 5 * (b + 1)) * DEG) : 0;
      const A = 2 * bandArea[b];   // ∝ cos φ Δφ
      const fs = VOLC.SPREAD * dt * cs / dphi / A, fn = VOLC.SPREAD * dt * cn / dphi / A;
      lo[b] = -fs; hi[b] = -fn; di[b] = 1 + fs + fn; x[b] = a[b] * k;
    }
    // Thomas' algorithm.
    for (let b = 1; b < NB; b++) { const m = lo[b] / di[b - 1]; di[b] -= m * hi[b - 1]; x[b] -= m * x[b - 1]; }
    a[NB - 1] = x[NB - 1] / di[NB - 1];
    for (let b = NB - 2; b >= 0; b--) a[b] = (x[b] - hi[b] * a[b + 1]) / di[b];
  }

  /** Arc cells' activity, as a cumulative sum to draw from (after each plate step). */
  arcTable() {
    const tec = this.tec;
    if (this.cumAt === tec.t && this.cum) return this.cum;
    const n = tec.grid.n, cum = this.cum && this.cum.length === n ? this.cum : new Float64Array(n);
    let s = 0;
    for (let i = 0; i < n; i++) { s += tec.arc[i] > 0.05 ? tec.arc[i] : 0; cum[i] = s; }
    this.cum = cum; this.cumAt = tec.t;
    return cum;
  }
  arcCell(u) {
    const cum = this.arcTable(), n = cum.length, tot = cum[n - 1];
    if (!(tot > 0)) return -1;
    let lo = 0, hi = n - 1;
    const x = u * tot;
    while (lo < hi) { const m = (lo + hi) >> 1; if (cum[m] < x) lo = m + 1; else hi = m; }
    return lo;
  }
  /** The most active arc cell within `maxLat` of the equator (for the experiment's eruption). */
  topArc(maxLat = 25) {
    const tec = this.tec, g = tec.grid, s = Math.sin(maxLat * DEG);
    let best = -1, bv = 0, any = -1, av = 0;
    for (let i = 0; i < g.n; i++) {
      const a = tec.arc[i];
      if (a > av) { av = a; any = i; }
      if (a > bv && Math.abs(g.pos[3 * i + 2]) < s) { bv = a; best = i; }
    }
    return best >= 0 ? best : any;
  }
  cellPos(i) { const p = this.tec.grid.pos; return [p[3 * i], p[3 * i + 1], p[3 * i + 2]]; }

  /**
   * Stochastic eruptions over (t0, t0 + dt] years, in time order: [{ t, M, p, kind }]. Each
   * source's arrivals are unit exponentials of its own hazard (rate × time), and the hazard left
   * to the next one is carried across calls, so a rate that changes between calls is taken at
   * each call's own, and time the eruptions don't see (the closure, which doesn't call this)
   * neither stores arrivals nor replays them: the process resumes where it stood.
   */
  erupt(t0, dt) {
    const ev = [];
    if (!VOLC.BACKGROUND || !(dt > 0)) return ev;
    const r = this.rates(), rng = this.rng;
    const src = [
      [r.arcs, VOLC.M_MIN, VOLC.ARC_MAX, 'arc'],
      [r.hot, VOLC.M_MIN, VOLC.HOT_MAX, 'hotspot'],
      [r.flood, VOLC.FLOOD_MIN, VOLC.FLOOD_MAX, 'flood'],
    ];
    for (const [rate, lo, hi, kind] of src) {
      if (!(rate > 0)) continue;
      const key = `hazard_${kind}`;
      if (this[key] === undefined) this[key] = rng.exponential(1);
      let t = t0;
      while (this[key] <= rate * (t0 + dt - t)) {
        t += this[key] / rate;
        const M = plDraw(rng.uniform(), lo, hi);
        let p = null;
        if (kind === 'arc') { const i = this.arcCell(rng.uniform()); if (i >= 0) p = this.cellPos(i); }
        else if (kind === 'hotspot') { const h = this.plumes.hot[rng.int(this.plumes.hot.length)]; if (h) p = h.p; }
        else { const L = this.plumes.lips.filter(L => { const a = this.tec.t - L.t0; return a >= 0 && a < 1; }); if (L.length) p = L[rng.int(L.length)].p; }
        if (p) ev.push({ t, M, p, kind });
        this[key] = rng.exponential(1);
      }
      this[key] -= rate * (t0 + dt - t);
    }
    return ev.sort((a, b) => a.t - b.t);
  }
  /** The forcing per band (W/m²) of the veil, or of `a`: −FORCE · τ_b. */
  forcing(out, a = this.aod) {
    for (let b = 0; b < VOLC.NB; b++) out[b] = -VOLC.FORCE * a[b];
    return out;
  }

  /**
   * Over dt years: the veil's decay and spread, and (while live) the eruptions in it, each
   * injected when it happens (the veil is stepped to it first), so a step of any length is
   * exact in the decay. Returns the eruptions (the year reads them: src/engine/year.js).
   */
  step(t0, dt, live) {
    const ev = live ? this.erupt(t0, dt) : [];
    let t = t0;
    for (const e of ev) {
      this.spread(this.aod, e.t - t); this.spread(this.tag, e.t - t); t = e.t;
      this.inject(e.p, e.M, e.t, e.kind);
    }
    this.spread(this.aod, t0 + dt - t); this.spread(this.tag, t0 + dt - t);
    this.recent = this.recent.filter(e => t0 + dt - e.t < 5);
    return ev;
  }
}

export { bandArea, bandLat, plMean };
