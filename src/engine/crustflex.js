// The crust's flexure (docs/surface.md): loads bend the lithosphere over
// the flexural length instead of only beneath themselves (src/engine/flexure.js
// has the plate and its solver).
//
// The columns crust.js builds are compensated as they were made (Airy, on the
// crust's thickness and density), and flexing them whole moves the opening's
// margins by kilometres (tests/flexure.test.mjs). What bends the plate is a
// column's change of load since: erosion and deposition, stacked and arc crust,
// basalt from the plumes, the ice's till. So the flexure is an incremental
// correction to the Airy elevation (synthesis), kept in each plate's frame as
// the crust is (FRAME_EXTRA's `cf`, m, up), with the column's mass it last saw
// (`mq`, ρh in g/cm³·km):
//
//   Δq = g (ρh − mq)            the column's own change of load since the last
//                               solve, per world cell (crust moving between
//                               cells carries mq with it, so motion is no load;
//                               new crust starts unseen)
//   c ← c e^{−dt/τ} + (Δq/(ρ_m g) − w(Δq, Tₑ)) (τ/dt)(1 − e^{−dt/τ})
//                               the Airy deflection less the plate's: under a
//                               narrow load the plate holds it up, beside it the
//                               plate bends down (foreland basins, moats round
//                               volcanic islands), and beyond that up (bulges);
//                               the step's own change relaxes as a load laid
//                               down evenly through the step would
//   elevation += c              (plates.js, updateElevation and the GPU's step)
//
// At Tₑ → 0 or τ → 0 this is the model without flexure (tested). Tₑ is the
// plates' (flexure.js, elasticThickness: the ocean's by age, continents' by
// age and thickness, broken at plate boundaries), refreshed every TE_EVERY
// Myr. Oceanic loads stay elastic (τ = ∞, standard: no relaxation is seen
// under seamounts); continental ones relax toward Airy over TAU_CONT
// (speculation: a viscoelastic lithosphere, tens of Myr). A trench's outer rise
// needs the slab's bending moment, which no load here carries, so it isn't
// made. The ice's own load bends the bed by ELRA in ice.js.
//
// Solved every EVERY Myr of plate steps (Planet.flexDue; the loads since the last solve are one
// load, laid down through the interval, so a lag under 1 Myr is under 2% of TAU_CONT): on the
// engine's GPU where there is one (src/gpu/flexure.js, eight V-cycles from
// cold, Tₑ's refresh overlapping the solve), on the CPU headless (to a
// tolerance, warm). Tₑ is computed once per plate time for this and the ice's
// bed (flexure.js, sharedElasticThickness).
//
// The plate's strength (synthesis): where the correction would hold a column
// more than C_MAX off Airy's, the plate has failed there and the rest is
// compensated locally. Isostatic anomalies on Earth rarely pass ~±200 mGal, ~2
// km of rock (from memory); and the grid gathers a collision's stacking into
// one cell (55–110 km) where an orogen spreads it over its thrust belt, which
// an elastic plate alone would hold up as a needle 15–20 km high.
import { sharedElasticThickness } from './flexure.js';
import { RHO_OCEANIC, RHO_CONTINENTAL, RHO_MANTLE } from './crust.js';

export const CRUSTFLEX = {
  TAU_CONT: 50,      // Myr: continental loads relax toward Airy over this (speculation)
  TAU_OCEAN: Infinity,
  TE_EVERY: 0.5,     // Myr between refreshes of Tₑ
  EVERY: 1,          // Myr of plate time between updates (Planet.flexDue): every other step at the dial's top, every tenth at 1 Myr/s
  CYCLES: 8,         // V-cycles a solve on the GPU, cold (each step's load is new, so a warm start gains nothing): 8e-5 of the deflection at level 7, ~2.3 ms (12: 6e-6, 3.3 ms)
  TOL: 1e-4,         // the CPU solve's tolerance on the residual
  C_MAX: 2000,       // m: the most the plate holds a column above or below Airy's (its strength; synthesis)
};

const G = 9.81;
const smoothstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
// ρh, rounded as the frames keep it (f32), so unchanged crust is no load.
const massOf = (h, phi) => Math.fround((RHO_OCEANIC + (RHO_CONTINENTAL - RHO_OCEANIC) * phi) * h);

export class CrustFlex {
  /**
   * On a Tectonics, with `flex` a Flexure (src/engine/flexure.js) or a GpuFlexure (src/gpu/
   * flexure.js) on its grid. Tₑ (km per cell) fixed if given, else the plates'.
   */
  constructor(tec, flex, { Te = null } = {}) {
    this.tec = tec; this.flex = flex;
    const n = this.n = tec.grid.n;
    this.q = new Float64Array(n);          // Pa: the load's change this solve
    this.Te = Te ? Float32Array.from(Te) : new Float32Array(n);
    this.teFixed = !!Te;
    this.teAt = -Infinity;
    this.gpu = typeof flex.encode === 'function';     // a GpuFlexure (solve is async)
    if (!tec.flexc) tec.flexc = new Float32Array(n);
    this.stats = { rms: 0, max: 0, load: 0, solves: 0, ms: 0 };   // c over land (m), the last load's rms (Pa), solves, ms a solve
    this.gather();                         // the opening's columns, as built, bend nothing
  }

  /** Solve on another solver from here on (the engine's worker hands it the GPU's). */
  useSolver(flex) { this.flex = flex; this.gpu = typeof flex.encode === 'function'; this.teAt = -Infinity; }

  /** Tₑ from the plates every TE_EVERY Myr (or fixed); true if the rigidity was reset. */
  rigidity() {
    const t = this.tec;
    if (this.teFixed ? this.teAt > -Infinity : !(Math.abs(t.t - this.teAt) >= CRUSTFLEX.TE_EVERY)) return false;
    this.teAt = t.t;
    if (!this.teFixed) this.Te.set(sharedElasticThickness(t));
    this.flex.setRigidity(this.Te);
    return true;
  }

  /**
   * The load's change (Pa) at each world cell since its column was last seen, the frames'
   * memory moved on; a frame cell two world cells show (rounding) counts once. Returns the
   * load's rms (Pa).
   */
  gather() {
    const t = this.tec, n = this.n, plates = t.plates, owner = t.owner, ref = t.ref, q = this.q;
    let s = 0;
    for (let i = 0; i < n; i++) {
      const p = plates[owner[i]], j = ref[i], m = massOf(p.h[j], p.phi[j]), m0 = p.mq[j];
      const d = m0 < 0 ? 0 : m - m0;
      q[i] = G * 1e6 * d;
      p.mq[j] = m;
      s += q[i] * q[i];
    }
    return Math.sqrt(s / n);
  }

  /** c ← c e^{−dt/τ} + (q/(ρ_m g) − w)(τ/dt)(1 − e^{−dt/τ}) in the frames, each frame cell once; then the world's sample. */
  apply(w, dt) {
    const t = this.tec, g = t.grid, n = this.n, plates = t.plates, owner = t.owner, ref = t.ref, q = this.q, nbrOff = g.nbrOff, nbr = g.nbr;
    const rm = 1000 * RHO_MANTLE * G, decay = tau => { const k = Math.exp(-dt / tau); return [k, tau === Infinity || !(dt > 0) ? 1 : -Math.expm1(-dt / tau) * tau / dt]; };
    const [kc, dc] = decay(CRUSTFLEX.TAU_CONT), [ko, d0] = decay(CRUSTFLEX.TAU_OCEAN), cm = CRUSTFLEX.C_MAX;
    let s = 0, a = 0, mx = 0;
    for (let i = 0; i < n; i++) {
      const k = owner[i], j = ref[i];
      let dup = false;
      for (let e = nbrOff[i], f = nbrOff[i + 1]; e < f; e++) { const o = nbr[e]; if (o < i && owner[o] === k && ref[o] === j) { dup = true; break; } }
      if (dup) continue;
      const p = plates[k], f = smoothstep(0.35, 0.65, p.phi[j]);
      let c = p.cf[j] * ((1 - f) * ko + f * kc) + (q[i] / rm - w[i]) * ((1 - f) * d0 + f * dc);
      c = c > cm ? cm : c < -cm ? -cm : c;
      p.cf[j] = c;
      if (!t.sea[i]) { const ar = g.area[i]; s += c * c * ar; a += ar; mx = Math.max(mx, Math.abs(c)); }
    }
    this.stats.rms = a > 0 ? Math.sqrt(s / a) : 0; this.stats.max = mx;
    t.sampleFlex(false);
  }

  /** One update over dt Myr of plate time, on the CPU's solver; the caller re-solves the elevation. */
  step(dt) {
    const t0 = performance.now();
    this.rigidity();
    this.stats.load = this.gather();
    const w = this.stats.load > 0 ? this.flex.solve(this.q, null, { tol: CRUSTFLEX.TOL }) : new Float64Array(this.n);
    this.apply(w, dt);
    this.done(t0);
  }

  /** The same on the GPU's solver; the elevation is patched by the change (the sea is re-solved at the next step). */
  async stepAsync(dt) {
    const t0 = performance.now(), old = this.oldC || (this.oldC = new Float32Array(this.n)), fc = this.tec.flexc;
    old.set(fc);
    // Tₑ's refresh is computed while the solve runs (the queue's writes land after it), so a solve
    // bends on the rigidity of the refresh before it: Tₑ moves over Myr, refreshed every TE_EVERY.
    if (!this.flex.ready) this.rigidity();
    this.stats.load = this.gather();
    const solving = this.stats.load > 0 ? this.flex.solve(this.q, null, { cycles: CRUSTFLEX.CYCLES, warm: false }) : null;
    this.rigidity();
    const w = solving ? await solving : new Float32Array(this.n);
    this.apply(w, dt);
    const e = this.tec.elev;
    for (let i = 0; i < this.n; i++) e[i] += fc[i] - old[i];
    this.done(t0);
  }

  done(t0) { this.stats.solves++; this.stats.ms = 0.8 * this.stats.ms + 0.2 * (performance.now() - t0); }
}
