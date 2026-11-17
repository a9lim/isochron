// Maritime air (synthesis): the energy balance's westerly half. A diffusive balance spreads heat
// alike in every direction, so a continent's interior and its windward coast get the same seasons,
// and the large continents' were far too wide (on today's Earth, eastern Europe's January ~26 K
// colder and its July ~18 K hotter than observed). Air off the sea keeps the sea's temperature for
// days as the wind carries it inland, warming the land in winter and cooling it in summer, more on
// the windward side (Europe's mild winters against eastern Asia's).
//
// Here each land cell exchanges heat with the maritime air over it, K m (T_mar − T), m the share of
// its air that came off the sea and T_mar that air's temperature: the sea's where it left it. Both
// come from a steady upwind transport of the sea's air on the energy balance's grid by the year's
// mean surface wind (the climate's template, from the last cycle), with eddy mixing, decaying
// inland as the air takes the land's temperature (over L at a reference speed U):
//   ∇·(u q) − ∇·(κ∇q) + λ q = 0 on land,  q = (1, T̄, T̂₁, T̂₂) at sea,  λ = U/L,
// m = q₀ and T_mar = q/q₀ for each harmonic (the operator is linear and steady). The exchange enters each land cell's seasonal harmonics as K m on the diagonal and
// K m T_mar in the forcing, so the energy balance's solvers keep their form (src/engine/climate.js's
// `continentalSeasons`, src/gpu/ebm.js); the annual mean is left to the diffusion.
import { restrict, prolong } from '../grid/transfer.js';

/** Tunable; tools and tests may change them. */
export const MARITIME = {
  K: 2,                  // W m⁻² K⁻¹: the exchange between a land cell and the sea's air over it (0: none). Earth: 10 at first, 2 with the seasons' diffusion at 0.49 and the sea's heat transport beside it
  L: 2000,               // km: how far the sea's air carries inland at U before it takes the land's temperature
  U: 5,                  // m/s: the reference speed for L
  KAPPA: 1e6,            // m²/s: eddy mixing of the air (the storms that carry it off the mean wind)
  SWEEPS: 48,            // Gauss–Seidel sweeps at most (four orders), until no cell's share moves by TOL
  TOL: 1e-4,
};

export class Maritime {
  constructor(climate) {
    this.c = climate;
    const cg = climate.coarse, nc = cg.n, n = climate.grid.n;
    this.flow = null;                                     // per coarse edge: u·n ℓ (m²/s), outward
    this.q = Array.from({ length: 6 }, () => new Float64Array(nc));   // m, then m T for the mean and the harmonics (re, im)
    this.km = new Float64Array(n);                        // per fine cell: K m (land), 0 at sea
    this.F = Array.from({ length: 5 }, () => new Float64Array(n));    // per fine cell: K m T_mar for the harmonics (land; 0 at sea, and [0] unused)
    this.on = false;
    // Sweep orders: by longitude both ways, then by latitude both ways.
    const lon = new Float64Array(nc), lat = new Float64Array(nc);
    for (let I = 0; I < nc; I++) { lat[I] = cg.pos[3 * I + 2]; lon[I] = Math.atan2(cg.pos[3 * I + 1], cg.pos[3 * I]); }
    const idx = () => Int32Array.from({ length: nc }, (_, I) => I);
    this.orders = [idx().sort((a, b) => lon[a] - lon[b]), idx().sort((a, b) => lon[b] - lon[a]), idx().sort((a, b) => lat[a] - lat[b]), idx().sort((a, b) => lat[b] - lat[a])];
    this.tmp = [new Float64Array(n), new Float64Array(n)];
  }

  /** The year's mean surface wind from the climate's phases, as edge flows on the coarse grid. */
  setWind() {
    const c = this.c, g = c.grid, n = g.n, cg = c.coarse, nc = cg.n, np = c.windPhase.length;
    const u = [0, 1, 2].map(() => new Float64Array(n)), uc = [0, 1, 2].map(() => new Float64Array(nc));
    for (const w of c.windPhase) for (let i = 0; i < n; i++) { u[0][i] += w[3 * i] / np; u[1][i] += w[3 * i + 1] / np; u[2][i] += w[3 * i + 2] / np; }
    for (let d = 0; d < 3; d++) restrict(c.T, u[d], uc[d]);
    const m = cg.nbrOff[nc], R = 6.371e6;
    const flow = this.flow || (this.flow = new Float64Array(m));
    let any = 0;
    for (let I = 0; I < nc; I++) for (let t = cg.nbrOff[I]; t < cg.nbrOff[I + 1]; t++) {
      const J = cg.nbr[t];
      const un = 0.5 * ((uc[0][I] + uc[0][J]) * cg.tan[3 * t] + (uc[1][I] + uc[1][J]) * cg.tan[3 * t + 1] + (uc[2][I] + uc[2][J]) * cg.tan[3 * t + 2]);
      flow[t] = un * cg.ell[t] * R;
      any += Math.abs(un);
    }
    this.on = any > 0;
  }

  /**
   * The sea's air carried over the land from the coarse state Tc (5 harmonic fields), and the
   * exchange's terms on the fine cells for the energy balance's step (`km`, `F`).
   */
  carry(Tc) {
    const C = MARITIME, c = this.c, cg = c.coarse, nc = cg.n, g = c.grid, n = g.n, R = 6.371e6;
    this.km.fill(0); for (const f of this.F) f.fill(0);
    if (!this.on || !(C.K > 0)) return false;
    const land = c.landFracC, q = this.q, flow = this.flow, lam = C.U / (C.L * 1000);
    // The sea: its own air (m = 1) at its own temperature.
    for (let I = 0; I < nc; I++) if (!(land[I] >= 0.5)) { q[0][I] = 1; for (let k = 0; k < 5; k++) q[k + 1][I] = Tc[k][I]; }
    const v = new Float64Array(6);
    for (let s = 0; s < C.SWEEPS; s++) {
      let moved = 0;
      for (const I of this.orders[s & 3]) {
        if (!(land[I] >= 0.5)) continue;
        let a = lam * cg.area[I] * R * R;
        v.fill(0);
        for (let t = cg.nbrOff[I]; t < cg.nbrOff[I + 1]; t++) {
          const J = cg.nbr[t], f = flow[t], kd = C.KAPPA * cg.ell[t] / cg.dist[t];
          a += kd + (f > 0 ? f : 0);
          const w = kd + (f < 0 ? -f : 0);
          for (let k = 0; k < 6; k++) v[k] += w * q[k][J];
        }
        const m0 = v[0] / a;
        moved = Math.max(moved, Math.abs(m0 - q[0][I]));
        for (let k = 0; k < 6; k++) q[k][I] = v[k] / a;
      }
      if (s % 4 === 3 && moved < C.TOL) break;
    }
    // On the fine cells: K m and K m T_mar on land, the coarse fields prolonged, for the seasonal
    // harmonics only. The sea doesn't give back what the land gains: its mixed layer holds ~25 times
    // the land's heat a kelvin, so its seasons barely notice the air it lends, and a harmonic's
    // budget doesn't touch the year's mean. (Paid back by the sea in its band, and on the annual
    // mean too, the exchange ran away within ten cycles: where land outweighs sea, as at 60–70° N,
    // the lagged payment fed the sea's air back on the land at a gain past one.)
    const ff = this.tmp[0], km = this.km, F = this.F, mask = c.landMask;
    prolong(c.T, q[0], ff);
    for (let i = 0; i < n; i++) km[i] = mask[i] ? C.K * Math.min(1, Math.max(0, ff[i])) : 0;
    for (let k = 1; k < 5; k++) {
      prolong(c.T, q[k + 1], ff);   // m T_mar
      const Fk = F[k];
      for (let i = 0; i < n; i++) Fk[i] = mask[i] ? C.K * ff[i] : 0;
    }
    return true;
  }
}
