// Dust wired into the planet (docs/PLAN.md, phase 9). The balance itself is
// src/engine/dust.js (emission, transport, deposition; tested alone); this is
// where it takes its sources from the rest of the planet and where what it
// deposits goes. It runs inside the climate's cycle: each of the six points
// of the year packs its sources after that point's winds and rain
// (`phase`), and after the six the balance is solved (on the engine's GPU in
// the page, src/gpu/dust.js; by Gauss–Seidel headless) and routed (`route`).
//
//   sources      (synthesis) the source strength S of a land cell is the union
//                of three shares, each a share of the cell:
//                  bare, dry ground: the plants' bare share (src/engine/
//                  vegetation.js, `dust`; the zones' arid share before the
//                  cover is known) × its dryness, a taper on the soil's
//                  relative water at that point of the year from 0.35 to 0.55
//                  (GOCART's cutoff at a surface wetness of 0.5, softened:
//                  standard form, the root zone's bucket standing in for the
//                  surface's few centimetres);
//                  dry lake beds: the lakes' salt flats (src/engine/lakes.js),
//                  weighted SALT× (Earth's largest sources are dry lakes and
//                  the alluvium of closed basins, Prospero and others 2002,
//                  from memory; the weight is speculation);
//                  glacial outwash: the share 1 − e^{−q/OUT_Q} of a cell where
//                  the ice's meltwater leaves it at q m/yr (src/engine/ice.js,
//                  `outwash`, eased over OUT_TAU), whatever the soil's water
//                  (an outwash plain's silt dries between its floods).
//                All of it is zero at sea, under ice, under the snow of that
//                point of the year (the albedo's snow share) and on a lake's
//                open water, and it needs loose grains: × 1 − e^{−h/LOOSE},
//                h the regolith (src/engine/regolith.js), so bare rock gives
//                nothing and a source the wind has stripped is held to what
//                weathering makes (the top level-7 sources lift 20–40× it). The soil's water raises the threshold too, as
//                GOCART's u_t(w) = u_t0 (1.2 + 0.2 log₁₀ w), held at u_t0 for
//                ground drier than w = 0.1 (from memory).
//   gusts        (speculation) the gusts stand for the weather the climate's
//                template doesn't have, so their rms scales with each
//                hemisphere's equator-to-60° contrast at that point of the
//                year against GUST_DT: storms grow as the meridional gradient
//                (Eady's rate, standard). The template's highs and lows have
//                fixed depths, so without this a glacial would be no windier.
//   snow, ice    (from memory, rough) dust in snow darkens it: the surface's
//                albedo falls by DARK_A (c/DARK_C)^DARK_P at a concentration c
//                of the year's deposition over its snowfall (~0.02 at 100 ppm,
//                ~0.1 at 1,000 ppm; at most DARK_MAX), and the climate's
//                planetary albedo sees half a surface contrast (VEG.PLANETARY,
//                as the cover's), on snow, sea ice and the ice sheets alike.
//   ice melt     (synthesis) the ice's degree-day factors carry the shortwave's
//                share of the melt energy (SW_SHARE): a surface darker by Δα
//                absorbs (1 − α + Δα)/(1 − α) of it, so each factor rises by
//                SW_SHARE·Δα/(1 − α), snow's at α = 0.8 and ice's at 0.5. Dirty
//                margins melt faster.
//   iron         (Martin's hypothesis; the form synthesis) dust is ~3.5% iron,
//                ~2% of it soluble (from memory). The sea's cold box is its
//                high-nutrient, low-chlorophyll water (src/engine/
//                oceancarbon.js: it keeps a preformed ~0.8 of its phosphate),
//                so iron raises its uptake: × (1 + K) r/(r + K), r the iron
//                reaching the cold box's water against the opening's and K =
//                IRON_K (at the opening the uptake runs at 1/(1 + K) of its
//                iron-replete rate: speculation). The warm box strips its
//                nutrients whatever the iron, so iron there changes nothing.
//   loess        what settles on land is loess, laid into the regolith (src/
//                engine/regolith.js) and the crust; what lands at sea is
//                pelagic sediment on the crust; the sources lose their net
//                deflation from their regolith, at most what it holds, and
//                what was taken is what is laid down, so the crust's mass is
//                kept whether or not the balance has converged (`budget`).
//                The regolith's opening counts the deflation (`deflation`).
//   forcing      dust.js's top-of-atmosphere forcing, at each cell's albedo,
//                into the energy balance's absorbed sunlight.
//
// Everything routed is the last cycle's: the climate reads its darkening and
// forcing at the next cycle, the ice's mass balance when the climate's version
// moves, the sea its iron after the cycle.
import { Dust, NP, DUST } from './dust.js';
import { CLIMATE } from './climate.js';
import { VEG, dust as bareShare } from './vegetation.js';
import { monthPhase } from './orbit.js';

export const AEOLIAN = {
  W_DRY: [0.35, 0.55],    // the soil's relative water over which emission tapers out
  SALT: 3,                // a salt flat's weight against bare, dry ground
  OUT_Q: 1,               // m/yr of meltwater over a cell at which outwash covers 1 − 1/e of it
  OUT_TAU: 1000,          // yr: the outwash's rates eased over this
  ICE: 10,                // m of ice past which nothing is lifted
  LOOSE: 0.05,            // m: the regolith over which a source has loose grains to give (1 − e^{−h/LOOSE})
  GUST_DT: 26,            // K: the equator-to-60° contrast at which the gusts' rms is DUST.GUST (the settled opening's, ~26 K)
  GUST_EXP: 1,
  DARK_A: 0.02, DARK_C: 100e-6, DARK_P: 0.7, DARK_MAX: 0.2,   // the snow's darkening by its dust (surface albedo)
  SNOW_MIN: 20,           // mm/yr: the least snowfall a concentration is taken over
  SW_SHARE: 0.5, ALB_SNOW: 0.8, ALB_ICE: 0.5,                 // the degree-day factors' shortwave share; clean surfaces' albedos
  FE: 0.035, FE_SOL: 0.02, // iron's share of dust, and its soluble share
  IRON_K: 1,              // the cold box's iron limitation (see the header)
  RHO_ROCK: 2700,         // kg/m³: the regolith's metres are rock's
  RHO_LOESS: 1500,        // kg/m³: loess as it stands (reported)
  CPU_SWEEPS: 32, CPU_TOL: 1e-4,   // headless: Gauss–Seidel sweeps warm (×4 cold), and the change to stop at
};

const R_M = 6.371e6, R2 = R_M * R_M;
const ramp = (x, a, b) => { const t = (x - a) / (b - a); return t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t); };

export class Aeolian {
  /** On the planet's layers: { grid, tec, climate, ice, lakes, regolith, life }; opts override AEOLIAN and (DUST) the balance's. */
  constructor({ grid, tec, climate, ice = null, lakes = null, regolith = null, life = null }, opts = {}) {
    Object.assign(this, { grid, tec, climate, ice, lakes, regolith, life });
    const A = this.A = { ...AEOLIAN, ...(opts.AEOLIAN || {}) };
    this.dust = new Dust(grid, opts.DUST || {});     // its emission constant DUST.C is the calibration
    const n = this.n = grid.n;
    this.areaM = Float64Array.from(grid.area, a => a * R2);
    this.source = new Float32Array(n);        // S at the point of the year being packed
    this.ut = new Float32Array(n);            // m/s
    this.gust = new Float32Array(n);          // m/s
    this.sourceAnn = new Float32Array(n);     // the year's mean S (figures, tests)
    this.parts = new Float32Array(3 * n);     // the year's mean of each share: bare and dry, salt flats, outwash (the figure's attribution)
    this.outRate = new Float32Array(n);       // m/yr of the ice's meltwater leaving it at each cell, eased
    this.dark = new Float32Array(n);          // the climate's planetary albedo change on snow and ice (≤ 0)
    this.forcing = new Float32Array(n);       // W/m², into the energy balance
    this.ddf = new Float32Array(2 * n).fill(1);   // the ice's degree-day factors' scale: snow, ice
    this.conc = new Float32Array(n);          // dust in the year's snow, kg/kg
    this.load = new Float32Array(n);          // kg/m², the year's mean load (drawn)
    this.net = new Float32Array(n);           // kg m⁻² yr⁻¹: deposition less emission (the crust's budget)
    this.gpu = null;                          // src/gpu/dust.js on the engine's device, in the page
    this.solved = 0;                          // balances solved
    this.ref = null;                          // the opening's iron to the cold box
    this.iron = 1;                            // the cold box's uptake factor
    this.ironFlux = 0;                        // mol/yr of soluble iron to the sea
    this.monthPh = Array.from({ length: 12 }, (_, m) => Math.floor(((monthPhase(m) % 1) + 1) % 1 * NP) % NP);
    this.stats = { emission: 0, deposition: 0, lifetime: 0, burden: 0, tau: 0, forcing: 0, land: 0, sea: 0, ice: 0, iron: 1, source: 0, loess: 0, dark: 0, gust: DUST.GUST };
    climate.dust = this;
    if (regolith) regolith.aeolian = this;
    if (life) life.dust = this;
  }

  /** The ice's glacial integrals from the regolith's update (src/engine/regolith.js): the outwash's rate, eased. */
  glacial(G, years) {
    if (!(years > 0) || !G || !G.outwash) return;
    const k = 1 - Math.exp(-years / this.A.OUT_TAU), r = this.outRate, A = this.areaM, w = G.outwash;
    for (let i = 0; i < this.n; i++) r[i] += (w[i] / A[i] / years - r[i]) * k;
  }

  /**
   * The sources at point p of the year, after the climate's winds and rain there (Climate.phase):
   * T is the sea-level temperature at that point (the climate's), and the climate's carrying
   * wind (`carry`) is valid only now.
   */
  phase(p, T) {
    const c = this.climate, A = this.A, n = this.n, g = this.grid, S = this.source, ut = this.ut, gust = this.gust;
    const L = c.landMask, elev = c.elevPos, H = this.ice ? this.ice.H : null, cv = c.cover, z = c.zones, NZ = 16;
    const soil = c.soil, Sm = soil.out.S, Smax = soil.Smax, wetL = c.lakeWet, salt = this.lakes ? this.lakes.salt : null;
    const lapse = CLIMATE.LAPSE, ph = this.monthPh;
    // Each hemisphere's equator-to-60° contrast at this point of the year, for the gusts.
    const zs = new Float64Array(6), za = new Float64Array(6);   // bands: |lat| < 10°, 55–65° N, 55–65° S
    for (let i = 0; i < n; i++) {
      const la = c.lat[i] * 180 / Math.PI, a = g.area[i];
      const b = Math.abs(la) < 10 ? 0 : la > 55 && la < 65 ? 1 : la < -55 && la > -65 ? 2 : -1;
      if (b >= 0) { zs[b] += a * T[i]; za[b] += a; }
    }
    const eq = zs[0] / za[0], dN = Math.max(5, eq - zs[1] / za[1]), dS = Math.max(5, eq - zs[2] / za[2]);
    const sN = DUST.GUST * Math.pow(dN / A.GUST_DT, A.GUST_EXP), sS = DUST.GUST * Math.pow(dS / A.GUST_DT, A.GUST_EXP);
    let gs = 0, gw = 0;
    const pt = this.parts;
    if (p === 0) pt.fill(0);
    for (let i = 0; i < n; i++) {
      // The gust's rms: each hemisphere's, blended across the tropics.
      const w = ramp(c.lat[i] * 180 / Math.PI, -15, 15);
      gust[i] = sS + (sN - sS) * w;
      ut[i] = DUST.U_T;
      S[i] = 0;
      if (!L[i] || (H && H[i] > A.ICE)) continue;
      const Ts = T[i] - lapse * elev[i], open = (1 - ramp(-Ts, -1, 5)) * (1 - (wetL[i] || 0));
      if (!(open > 0)) continue;
      // The soil's relative water at this point of the year (the closure's months in it).
      let w0 = 0, wn = 0;
      if (Smax[i] > 0) for (let m = 0; m < 12; m++) if (ph[m] === p) { w0 += Sm[12 * i + m]; wn++; }
      const wet = wn > 0 ? w0 / wn / Smax[i] : 0;
      const bare = cv ? bareShare(cv.ft[i], cv.fg[i]) : z[NZ * i + 4] + 0.5 * z[NZ * i + 5];
      const dry = bare * (1 - ramp(wet, A.W_DRY[0], A.W_DRY[1]));
      const flat = salt ? Math.min(1, A.SALT * salt[i]) : 0;
      const out = 1 - Math.exp(-this.outRate[i] / A.OUT_Q);
      const loose = this.regolith ? 1 - Math.exp(-this.regolith.h[i] / A.LOOSE) : 1;
      S[i] = open * loose * (1 - (1 - dry) * (1 - flat) * (1 - out));
      const w6 = open * loose / NP;
      pt[3 * i] += w6 * dry; pt[3 * i + 1] += w6 * flat; pt[3 * i + 2] += w6 * out;
      ut[i] = DUST.U_T * Math.max(1, 1.2 + 0.2 * Math.log10(Math.max(wet, 1e-3)));
      if (S[i] > 0) { gs += S[i] * gust[i]; gw += S[i]; }
    }
    this.stats.gust = gw > 0 ? gs / gw : DUST.GUST;
    for (let i = 0; i < n; i++) this.sourceAnn[i] = p === 0 ? S[i] / NP : this.sourceAnn[i] + S[i] / NP;
    this.dust.phase(p, { wind: c.windPhase[p], carry: c.carry, rain: c.Pph[p], source: S, ut, gust });
  }

  /** The balance after the six points of the year (a generator in the climate's cycle), then the routing. */
  *solve() {
    const d = this.dust;
    if (this.gpu) yield this.gpu.solve();
    else {
      // Headless, Gauss–Seidel: CPU_SWEEPS warm (four times as many cold), or until the loads move
      // less than CPU_TOL of the largest (a sweep is ~5 ms at level 6).
      const A = this.A, sweeps = d.warm ? A.CPU_SWEEPS : 4 * A.CPU_SWEEPS;
      for (let s = 0; s < sweeps; s += 8) { const r = d.solve(Math.min(8, sweeps - s), A.CPU_TOL); if (r.change < A.CPU_TOL) break; yield; }
      d.warm = true;
    }
    yield;
    this.route();
    this.solved++;
  }

  /** The balance's outputs (at the albedo the forcing's sign reads: the climate's at each cell's annual mean), routed. */
  route() {
    const c = this.climate, n = this.n, alb = this.alb || (this.alb = new Float32Array(n));
    for (let i = 0; i < n; i++) alb[i] = c.albedo(i, c.Tf[0][i]);
    this.dust.finish(alb);
    this.effects();
  }

  /** The deposition routed: the snow's darkening, the ice's melt, the forcing; the stats. */
  effects() {
    const c = this.climate, A = this.A, n = this.n, L = c.landMask, H = this.ice ? this.ice.H : null;
    const o = this.dust.out, s = this.dust.stats;
    this.forcing.set(o.forcing);
    this.load.set(o.loadAnn);
    let land = 0, sea = 0, ice = 0, dsum = 0, dA = 0, src = 0, eb = 0, es = 0, eo = 0;
    for (let i = 0; i < n; i++) {
      const a = this.areaM[i], dep = o.depAnn[i];
      // Dust in the year's snow: the deposition over the snowfall (mm/yr = kg m⁻² yr⁻¹).
      let snow = 0;
      for (let m = 0; m < 12; m++) { const T = c.T12[12 * i + m]; snow += c.P12[12 * i + m] * (T <= -2 ? 1 : T >= 2 ? 0 : (2 - T) / 4); }
      const conc = this.conc[i] = dep / Math.max(A.SNOW_MIN, snow);
      const da = Math.min(A.DARK_MAX, A.DARK_A * Math.pow(conc / A.DARK_C, A.DARK_P));
      this.dark[i] = -VEG.PLANETARY * da;
      this.ddf[2 * i] = 1 + A.SW_SHARE * da / (1 - A.ALB_SNOW);
      this.ddf[2 * i + 1] = 1 + A.SW_SHARE * da / (1 - A.ALB_ICE);
      this.net[i] = dep - o.emitAnn[i];
      const iced = H && H[i] > A.ICE;
      if (iced) { ice += a * dep; dsum += a * da; dA += a; } else if (L[i]) land += a * dep; else sea += a * dep;
      src += a * this.sourceAnn[i] * (L[i] ? 1 : 0);
      // The emission by source, in proportion to each share.
      const pt = this.parts, ps = pt[3 * i] + pt[3 * i + 1] + pt[3 * i + 2], e = a * o.emitAnn[i];
      if (e > 0 && ps > 0) { eb += e * pt[3 * i] / ps; es += e * pt[3 * i + 1] / ps; eo += e * pt[3 * i + 2] / ps; }
    }
    c.dustDark = this.dark; c.dustForcing = this.forcing;
    if (this.ice) this.ice.dustDDF = this.ddf;
    const Tg = 1e-9;
    Object.assign(this.stats, {
      emission: s.emission, deposition: s.deposition, lifetime: s.lifetime, burden: s.burden, tau: s.tau, forcing: s.forcing,
      wet: s.wet, land: land * Tg, sea: sea * Tg, ice: ice * Tg, dark: dA > 0 ? dsum / dA : 0, source: src / 1e12,
      fromBare: eb * Tg, fromSalt: es * Tg, fromOutwash: eo * Tg,
    });
  }

  /**
   * The dust's budget over `years` (m of rock per cell, signed): each source loses its net
   * deflation (emission less what lands back on it) from its layer `h` (m), at most the layer
   * (the wind doesn't abrade rock: a source whose layer is gone is held to its weathering, see
   * LOOSE), and what was taken is laid down where the dust settled, in proportion to the
   * deposition (loess on land, the sea's dust on its floor). The balance's emission and
   * deposition agree once it has converged; this keeps the crust's mass exactly either way.
   */
  budget(years, h) {
    const n = this.n, out = this.dz || (this.dz = new Float64Array(n)), o = this.dust.out, A = this.areaM, rho = this.A.RHO_ROCK;
    out.fill(0);
    if (!o || !(years > 0)) return out;
    let taken = 0, laid = 0;
    for (let i = 0; i < n; i++) {
      const net = o.depAnn[i] - o.emitAnn[i];
      if (net < 0) { const d = Math.min(-net * years / rho, Math.max(0, h[i])); out[i] = -d; taken += d * A[i]; }
      else laid += net * A[i];
    }
    const k = laid > 0 ? taken / laid : 0;
    for (let i = 0; i < n; i++) { const net = o.depAnn[i] - o.emitAnn[i]; if (net > 0) out[i] = net * k; }
    this.stats.loess = taken / Math.max(1e-30, years) * rho * 1e-9;   // Tg/yr moved
    return out;
  }

  /** The net deflation at cell i (m of rock a year) the last balance gave, for the regolith's opening. */
  deflation(i) {
    const o = this.dust.out;
    return o ? Math.max(0, o.emitAnn[i] - o.depAnn[i]) / this.A.RHO_ROCK : 0;
  }

  /**
   * Iron to the sea's cold box (cells at or below the cold box's edge temperature `edge`, sst
   * per cell), against the opening's: the cold box's uptake factor. Until the sea settles
   * (`opening`), what reaches it is the reference and the factor is 1.
   */
  ironTo(sst, edge, opening) {
    const A = this.A, n = this.n, L = this.climate.landMask, dep = this.dust.out ? this.dust.out.depAnn : null;
    if (!dep) return this.iron;
    let cold = 0, all = 0;
    for (let i = 0; i < n; i++) {
      if (L[i]) continue;
      const m = this.areaM[i] * dep[i];
      all += m; if (sst[i] <= edge) cold += m;
    }
    this.ironFlux = all * A.FE * A.FE_SOL / 0.055845;     // mol/yr of soluble iron to the sea
    if ((opening || !this.ref) && cold > 0) this.ref = { cold };
    const r = this.ref ? cold / this.ref.cold : 1, K = A.IRON_K;
    this.iron = (1 + K) * r / (r + K);
    this.stats.iron = this.iron; this.stats.ironCold = r;
    return this.iron;
  }
}
