// The deep sea's heat (docs/MODEL.md): the slow part of the climate's response to a forcing, the
// heat the ocean below its mixed layer takes up while the surface warms and gives back while it
// cools. Without it the energy balance is the periodic year of its forcing at every cycle, so
// warming kept pace with CO₂; with it a forcing is realised over centuries.
//
//   the form     (standard: the two-layer energy balance; Held and others 2010, Geoffroy and others
//                2013) beneath the energy balance's mixed layer each column of sea has a deep layer
//                of heat capacity C_D, exchanging with the surface at γ:
//                    C_D dθ/dt = γ (T − θ),   and the annual mean's balance loses γ (T − θ),
//                T the energy balance's annual mean (the coarse grid's). The mixed layer is the
//                model's own (CLIMATE.C_OCEAN 7.9 W yr m⁻² K⁻¹ of sea against the two-layer's
//                upper layer, 7.3 of the planet). θ stands for the deep layer's departure as the
//                two-layer model's does: at equilibrium θ = T and nothing flows, so the deep holds
//                only the lag, and the climate at its balance is the energy balance's as before.
//   the values   Geoffroy and others' CMIP5 mean (their Table 4: γ 0.73 W m⁻² K⁻¹, C_D 106 W yr
//                m⁻² K⁻¹, per m² of the planet), over Earth's sea's 71%: per m² of sea, as the
//                columns take them. Their slow time scale is 249 yr, their fast 4.1.
//   the columns  (synthesis) the global model's two layers on each coarse cell's sea, with no deep
//                exchange between cells; Earth's uptake is concentrated where the sea ventilates,
//                the Southern Ocean and the North Atlantic (from memory), which a uniform γ spreads
//                over every sea. Under sea ice γ × (1 − (1 − SEAHEAT.ICE) × the year's share under
//                ice), as the sea heat's exchange with the air (src/engine/seaheat.js): the air's
//                warming there isn't the water's.
//   the step     exact for T held: θ ← T + (θ − T) e^{−k dt}, k = γ/C_D, each frame of the dial
//                (Planet.fast) toward the last cycle's T.
//   the closure  a cycle's T stands until the next (on the page ~0.5 s of the dial, headless the
//                caller's years), so the energy balance is charged the uptake's mean over that span
//                s with T held: C_D (1 − e^{−ks}) (T − θ) / s, γ (1 − e^{−x})/x with x = ks, which is
//                what the deep's own steps then take, to rounding. Live (s ≪ 1/k, the people's dials)
//                it is γ (T − θ); at a dial whose cycles are centuries apart it falls as C_D/s, the
//                deep at its balance, and the climate is the energy balance's as without it. The span
//                is the last cycle's (the next one's isn't known).
//   the opening  the deep at its balance (θ = T after each cycle, no uptake) until the climate has
//                settled, so the opening's cycles back to back (today's Earth's, which pass no years)
//                don't hold the opening's first guess.
import { restrict } from '../grid/transfer.js';
import { SEAHEAT } from './seaheat.js';

/** Tunable; tools and tests may change them. */
export const DEEP = {
  ON: true,
  GAMMA: 1.03,     // W m⁻² K⁻¹ per m² of sea: Geoffroy and others' 0.73 over Earth's sea's 71%
  C_D: 149,        // W yr m⁻² K⁻¹ per m² of sea: their 106 over 71% (~1.15 km of water)
};

export class DeepSea {
  constructor(climate) {
    this.c = climate;
    const nc = climate.coarse.n, n = climate.grid.n;
    this.theta = new Float64Array(nc).fill(NaN);   // the deep layer's temperature, °C (NaN: no sea there yet)
    this.T = new Float64Array(nc);                 // the last cycle's annual mean, which the frames step toward
    this.share = new Float64Array(nc);             // each coarse cell's sea
    this.k = new Float64Array(nc);                 // its exchange's rate, per yr (γ/C_D, less under ice)
    this.diag = new Float64Array(nc); this.rhs = new Float64Array(nc);   // the annual mean's terms (W K⁻¹ and W, over R²)
    this.f = new Float64Array(n); this.fc = new Float64Array(nc);
    this.since = Infinity;                         // years since this cycle's start
    this.span = Infinity;                          // the years the last cycle's T stood
    this.seen = false;                             // a cycle has given T
    this.stats = { uptake: 0, lag: 0, heat: 0, span: Infinity };
  }

  /**
   * A cycle's start (after its geography): the span the last cycle's T stood, and each coarse cell's sea
   * and its exchange's rate under the last cycle's sea ice.
   */
  begin() {
    const c = this.c, n = c.grid.n, nc = c.coarse.n, L = c.landMask, f = this.f, fc = this.fc, C = DEEP;
    this.span = this.since; this.since = 0; this.stats.span = this.span;
    for (let i = 0; i < n; i++) f[i] = L[i] ? 0 : c.snowAnn[i];
    restrict(c.T, f, fc);
    for (let I = 0; I < nc; I++) {
      const s = Math.max(0, 1 - c.landFracC[I]), si = s > 1e-6 ? Math.min(1, fc[I] / s) : 0;
      this.share[I] = s;
      this.k[I] = s > 0 ? C.GAMMA * (1 - (1 - SEAHEAT.ICE) * si) / C.C_D : 0;
      if (!(s > 0)) this.theta[I] = NaN;
    }
  }

  /** The years the dial passes: each column toward the last cycle's T, exactly. */
  step(dt) {
    if (!(dt > 0)) return;
    this.since += dt;
    if (!this.seen) return;
    const th = this.theta, T = this.T, k = this.k;
    for (let I = 0; I < th.length; I++) if (k[I] > 0 && th[I] === th[I]) th[I] = T[I] + (th[I] - T[I]) * Math.exp(-k[I] * dt);
  }

  /**
   * The annual mean's terms against the state T (coarse, °C): the uptake's mean over the span, its own
   * cell's share on the diagonal, as `diag` and `rhs`. False at the opening or with nothing to take.
   */
  terms(T) {
    const c = this.c, A = c.coarse.area, nc = A.length, C = DEEP, th = this.theta, d = this.diag, r = this.rhs;
    d.fill(0); r.fill(0);
    if (!C.ON || !c.stats.settled || !(this.span < Infinity)) return false;
    let any = false;
    for (let I = 0; I < nc; I++) {
      const k = this.k[I];
      if (!(k > 0)) continue;
      if (th[I] !== th[I]) th[I] = T[I];   // new sea: at its balance
      const x = k * this.span, w = x < 1e-6 ? 1 - 0.5 * x : -Math.expm1(-x) / x;
      d[I] = A[I] * this.share[I] * C.C_D * k * w; r[I] = d[I] * th[I];
      any = any || d[I] > 0;
    }
    return any;
  }

  /**
   * A cycle's end, its energy balance solved: the T the frames step toward; at the opening each column at
   * its balance with it. The uptake (W/m² of the planet), the lag (θ − T over the sea, K) and the heat
   * the deep holds against its balance (W yr per m² of the planet).
   */
  end() {
    const c = this.c, A = c.coarse.area, nc = A.length, th = this.theta, T = this.T, C = DEEP;
    T.set(c.Tc[0]); this.seen = true;
    const open = !c.stats.settled;
    let up = 0, lag = 0, sea = 0;
    for (let I = 0; I < nc; I++) {
      if (!(this.share[I] > 0)) continue;
      if (open || th[I] !== th[I]) th[I] = T[I];
      const a = A[I] * this.share[I];
      up += this.diag[I] * T[I] - this.rhs[I]; lag += a * (th[I] - T[I]); sea += a;
    }
    this.stats.uptake = up / (4 * Math.PI);
    this.stats.lag = sea > 0 ? lag / sea : 0;
    this.stats.heat = C.C_D * lag / (4 * Math.PI);
  }
}
