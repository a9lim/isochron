// The regolith (docs/PLAN.md, phase 7): the weathered layer on the crust, kept
// in each plate's frame (FRAME_EXTRA's `reg`, src/engine/plates.js), so it
// rides with the crust it lies on.
//
//   thickness    m of rock equivalent (its mass as rock's; loosened, it stands
//                thicker), part of the crust's thickness h: weathering turns
//                rock to regolith in place and moves no mass, so only what
//                erosion and till do changes h
//   production   (standard: Heimsath and others' soil production function,
//                from memory) P = P₀ e^{−h/h₀}: fastest on bare rock, slowing
//                as the layer shields the rock beneath. P₀ follows the climate
//                in weathering's form (carbon.js) but more gently, runoff^0.25
//                and e^{(T−15)/30 K} (synthesis: frost and drying break rock in
//                cold and dry places too, and compiled soil production varies
//                with climate far less than chemical weathering does; from
//                memory); none under ice or the sea
//   rivers       strip it before rock: the layer thins at the landscape's
//                erosion rate E (km/Myr; landscape.js removes the thickness
//                itself, the rock beneath only where the layer is gone), so
//                dh/dt = P₀ e^{−h/h₀} − E, solved exactly over any step: with
//                u = e^{h/h₀}, du/dt = (P₀ − E u)/h₀, so u relaxes toward P₀/E
//                over h₀/E. Where E < P₀ the layer settles at h* = h₀ ln(P₀/E)
//                (tested); where E ≥ P₀ the rock stays bare
//   the ice      (src/engine/ice.js, takeGlacial) its erosion takes the layer
//                first and then the rock, the crust thinning by both (the
//                surface follows through isostasy, as for rivers); the till
//                that melts out at its margins is regolith again, less the
//                share its meltwater carries off as the rivers' sediment
//                (OUTWASH, synthesis), which the landscape routes at its next
//                step (lakes, then the sea)
//
// What it sets (synthesis):
//   the ice's bed      softness 1 − e^{−h/H_SOFT}: a few metres of till deform
//                      under the ice and let it slide (ice.js, setSoftness)
//   the soil's water   the capacity CAP_MIN + (CAP_DEEP − CAP_MIN)(1 − e^{−h/H_ROOT})
//                      mm: bare rock holds little, a deep layer as much as roots reach
//   weathering         the supply of fresh rock is the production P (carbon.js,
//                      measure): fresh minerals enter the layer as fast as rock
//                      turns to regolith. At steady state P = E, so it reads as
//                      the rule it replaces (CARBON.E_HALF on erosion); where the
//                      ice has stripped the layer P jumps to P₀ (glacial flour)
//
// Thick regolith makes thin, fast ice; stripped beds make thick, slow ice
// (Clark and Pollard's regolith hypothesis for the mid-Pleistocene transition;
// speculation as a rhythm here: see docs/LOG.md).
//
// The layer is stepped with the fast layers (Planet.fast), at most every
// `minGap` ms of the wall clock (the page) or every call (headless), the years
// between banked: the exact solution takes any step.
export const REGOLITH = {
  P0: 0.1,           // km/Myr (mm/yr) of rock turned to regolith at bare rock, at the reference climate (Heimsath's tens to hundreds of m/Myr, from memory)
  H0: 0.5,           // m: production's e-folding depth (from memory)
  RUNOFF0: 0.3,      // m/yr and °C: the reference climate (P₀ ∝ (runoff/RUNOFF0)^RUNOFF_EXP e^{(T − T0)/TE})
  RUNOFF_EXP: 0.25,
  T0: 15, TE: 30,
  ICE: 10,           // m of ice past which nothing weathers and rivers don't cut
  H_SOFT: 1,         // m: the ice's bed is soft as 1 − e^{−h/H_SOFT}
  CAP_MIN: 40, CAP_DEEP: 260, H_ROOT: 1.2,   // mm, mm, m: the soil's water capacity
  OUTWASH: 0.5,      // share of melted-out till its meltwater carries off as sediment
  OPEN_MYR: 30,      // Myr of weathering at the opening where nothing erodes (the layer grows as h₀ ln(1 + P₀t/h₀))
  START: -1,         // m: the opening's layer on land, if ≥ 0 (the Regolith experiment's knob); else steady state
  SED_FELSIC: 0.9,   // felsic fraction of till (as the rivers' sediment)
};

const R_KM = 6371;

/** h after t years under production P₀ and erosion E (both m/yr) from h (m), and the production rate at the end. */
export function regolithStep(h, P0, E, t) {
  const h0 = REGOLITH.H0;
  if (!(t > 0)) return h;
  if (h > 600 * h0) return Math.max(0, h - E * t);       // production is nil under this much (and e^{h/h₀} would overflow)
  const u0 = Math.exp(h / h0);
  let u;
  if (E > 1e-15) {
    const r = P0 / E, k = Math.exp(-E * t / h0);
    u = r + (u0 - r) * k;
    // Bare rock: u fell through 1 (h = 0) before the step's end, and stays there while E ≥ P₀.
    if (u < 1) u = 1;
  } else u = u0 + P0 * t / h0;
  return h0 * Math.log(u);
}

/** The steady thickness h* = h₀ ln(P₀/E) (m), 0 where E ≥ P₀. */
export const steadyRegolith = (P0, E) => E > 0 ? Math.max(0, REGOLITH.H0 * Math.log(P0 / E)) : Infinity;

export class Regolith {
  constructor(tec, land, climate = null, ice = null) {
    this.tec = tec; this.land = land; this.climate = climate; this.ice = ice;
    const n = this.n = tec.grid.n;
    this.h = new Float32Array(n);          // m, sampled from the frames at the last update
    this.prod = new Float32Array(n);       // km/Myr: production now (weathering's supply)
    this.soft = new Float32Array(n);       // the ice's bed softness
    this.areaKm = Float64Array.from(tec.grid.area, a => a * R_KM * R_KM);
    this.glac = { eroded: new Float64Array(n), till: new Float64Array(n), outwash: new Float64Array(n) };
    this.resid = new Float64Array(n);      // km of the ice's change to the crust that f32 rounding left for later
    this.bank = 0;                         // years not yet stepped
    this.minGap = 0;                       // ms of the wall clock between updates (the page sets it)
    this.lastAt = -Infinity;
    this.settled = false;
    this.aeolian = null;                   // src/engine/aeolian.js, when there is one
    // The budget since the opening (m³ of rock): taken by the ice, melted out as till, carried off as outwash.
    this.budget = { eroded: 0, till: 0, outwash: 0 };
    this.stats = { mean: 0, bare: 0, soft: 0, iceBed: 0, glacial: 0 };   // land's mean (m), bare share, the ice's bed softness, its erosion (mm/yr)
    land.regolith = this;
    if (climate) climate.regolith = this;
  }

  /** P₀ (m/yr) at world cell i, by the climate (the reference before the climate has run). */
  p0(i) {
    const R = REGOLITH, c = this.climate;
    if (!c || !(c.stats && c.stats.cycles > 0)) return R.P0 * 1e-3;
    const run = Math.max(0, c.runoff[i]), T = Math.min(45, c.Tf[0][i] - 6.5 * c.elevPos[i]);   // no faster past a hot wet tropic's (a runaway planet's surface is dry)
    return R.P0 * 1e-3 * Math.pow(run / R.RUNOFF0, R.RUNOFF_EXP) * Math.exp((T - R.T0) / R.TE);
  }

  /** Is world cell i weathering ground (land, not under ice)? */
  ground(i) {
    const t = this.tec;
    return t.elev[i] > t.seaLevel && !(this.ice && this.ice.H[i] > REGOLITH.ICE);
  }

  /**
   * The opening's layer: on land, the thickness OPEN_MYR of production and the landscape's
   * erosion leave (its steady state where the rivers cut, age-limited where nothing does), or
   * START metres if set; nothing at sea.
   */
  init() {
    const t = this.tec, n = this.n, E = this.land.erosion, R = REGOLITH, yrs = R.OPEN_MYR * 1e6;
    for (let i = 0; i < n; i++) {
      const p = t.plates[t.owner[i]], j = t.ref[i];
      let h = 0;
      // The rivers' erosion, and the wind's where dust has been lifted (src/engine/aeolian.js).
      const D = this.aeolian ? this.aeolian.deflation(i) : 0;
      if (t.elev[i] > t.seaLevel) h = R.START >= 0 ? R.START : regolithStep(0, this.p0(i), (E[i] || 0) * 1e-3 + D, yrs);
      p.reg[j] = h;
    }
    this.sample();
    this.settled = !!(this.climate && this.climate.stats.settled);
  }

  /** The world's view of the frames: thickness, production, softness; the ice's bed. */
  sample() {
    const t = this.tec, n = this.n, R = REGOLITH, h = this.h, h0 = R.H0;
    let la = 0, hs = 0, bare = 0, sa = 0, ss = 0;
    for (let i = 0; i < n; i++) {
      h[i] = t.plates[t.owner[i]].reg[t.ref[i]];
      const g = this.ground(i);
      this.prod[i] = g ? this.p0(i) * 1e3 * Math.exp(-h[i] / h0) : 0;
      this.soft[i] = 1 - Math.exp(-h[i] / R.H_SOFT);
      if (t.elev[i] > t.seaLevel) { const a = this.areaKm[i]; la += a; hs += a * h[i]; if (h[i] < 0.05) bare += a; }
      if (this.ice && this.ice.H[i] > R.ICE) { const a = this.areaKm[i]; sa += a; ss += a * this.soft[i]; }
    }
    if (this.ice) this.ice.setSoftness(this.soft);
    const st = this.stats;
    st.mean = la > 0 ? hs / la : 0; st.bare = la > 0 ? bare / la : 0; st.iceBed = sa > 0 ? ss / sa : 0;
  }

  /** The soil's water capacity (mm) at world cell i. */
  capacity(i) {
    const R = REGOLITH;
    return R.CAP_MIN + (R.CAP_DEEP - R.CAP_MIN) * (1 - Math.exp(-this.h[i] / R.H_ROOT));
  }

  /** Bank `years`; step when due (always headless; in the page at most every `minGap` ms). */
  advance(years) {
    this.bank += Math.max(0, years);
    const now = typeof performance !== 'undefined' ? performance.now() : 0;
    if (this.minGap > 0 && now - this.lastAt < this.minGap) return false;
    this.lastAt = now;
    this.update(this.bank);
    this.bank = 0;
    return true;
  }

  /**
   * One update over `years`: the ice's erosion and till since the last (the crust thinned and
   * thickened, the layer stripped and laid down, the outwash banked for the rivers), then
   * production against the rivers' erosion, exactly.
   */
  update(years) {
    const t = this.tec, n = this.n, R = REGOLITH, plates = t.plates, owner = t.owner, ref = t.ref, land = this.land;
    // The opening's layer at its balance with each climate cycle until the climate has settled
    // (its first cycles are a transient: the cover and the rain feed each other).
    const cs = this.climate && this.climate.stats;
    if (!this.settled && cs && cs.cycles > 0 && cs.cycles !== this.initAt) {
      if (!(this.budget.eroded > 0) && R.START < 0) this.init();
      this.initAt = cs.cycles;
      this.settled = !!cs.settled;
    }
    if (this.ice) {
      const G = this.ice.takeGlacial(this.glac), A = this.ice.areaM, keep = 1 - R.OUTWASH, sed = land.sedIn, resid = this.resid;
      // Dust (src/engine/aeolian.js): the outwash plains its source; its budget over these years, m of
      // rock per cell (the sources deflated from their layer, loess and the sea's dust laid down).
      const dust = this.aeolian ? (this.aeolian.glacial(G, years), this.aeolian.budget(years, this.h)) : null;
      for (let i = 0; i < n; i++) {
        const dz = dust ? dust[i] : 0, ero = G.eroded[i] + (dz < 0 ? -dz : 0), till = G.till[i];
        if (!(ero > 0) && !(till > 0) && !(dz > 0) && resid[i] === 0) continue;
        const p = plates[owner[i]], j = ref[i];
        // Erosion: the layer first, then rock; the crust loses both.
        const r = p.reg[j] - ero;
        p.reg[j] = r > 0 ? r : 0;
        // Till: laid down as regolith, less the outwash's share (at sea, all of it stays).
        let lay = till;
        if (till > 0 && t.elev[i] > t.seaLevel && sed) {
          lay = keep * till;
          sed[i] += (till - lay) * A[i] / 1e9;          // km³ for the landscape's next step
          this.budget.outwash += (till - lay) * A[i];
        }
        if (dz > 0) lay += dz;                            // loess on land, the sea's dust on its floor
        if (lay > 0) {
          const d = lay / 1000;
          p.phi[j] = (p.phi[j] * p.h[j] + R.SED_FELSIC * d) / (p.h[j] + d);
          p.reg[j] += lay;
        }
        // The crust's change, km: h is f32, which at 35 km resolves ~4 mm, so what rounding leaves
        // waits in `resid` for the next update. A frame cell two world cells show (rounding) takes
        // both cells' change, and each world cell's sample its own (the world's view keeps the
        // budget, as the landscape's writes do).
        const want = (lay - ero) / 1000 + resid[i], h0 = p.h[j];
        p.h[j] = h0 + want;
        const done = p.h[j] - h0;
        resid[i] = want - done;
        t.h[i] = t.h[i] === h0 ? p.h[j] : t.h[i] + done;
        t.phi[i] = p.phi[j];
        this.budget.eroded += G.eroded[i] * A[i]; this.budget.till += till * A[i];
      }
    }
    const is = this.ice ? this.ice.stats : null;
    this.stats.glacial = is && is.area > 0 ? 1000 * is.erosion / is.area : 0;    // mm/yr under the ice, its rate now
    // Production against the rivers, on weathering ground.
    if (years > 0) {
      const E = land.erosion;
      for (let i = 0; i < n; i++) {
        if (!this.ground(i)) continue;
        const p = plates[owner[i]], j = ref[i];
        p.reg[j] = regolithStep(p.reg[j], this.p0(i), (E[i] || 0) * 1e-3, years);
      }
    }
    this.sample();
  }

  /** The layer's volume (m³ of rock) on the world's cells. */
  volume() {
    let v = 0;
    for (let i = 0; i < this.n; i++) v += this.h[i] * this.areaKm[i] * 1e6;
    return v;
  }
}
