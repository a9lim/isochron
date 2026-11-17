// The air's heat carried by the winds (synthesis on standard pieces): the energy balance's
// westerlies. Its diffusion carries heat down the gradient and alike in every direction, so a warm
// sea's heat spreads upwind onto the continent behind it as readily as downwind onto the one ahead,
// and nothing makes a continent's eastern side colder than its latitude: on today's Earth eastern
// North America absorbs as much sunlight as the west and imported heat from the Atlantic, its year
// ~6 K warm and its January ~10 K. Earth's westerlies carry the sea's heat east, and in winter its
// stationary waves bring the continents' polar air down their eastern sides (Seager and others 2002
// put most of Europe's mild winters on the air's transport, from memory).
//
//   the wind         the climate's surface wind at its six points of the year (the template, from
//                    the last cycle) as the year's mean and two harmonics, each's rotational part
//                    alone: a stream function ψ from its vorticity (∇²ψ = ζ, the circulation round
//                    each cell), the flow across each edge the difference of ψ at the edge's two
//                    Voronoi corners, so it carries no divergence, cell by cell. The divergent part
//                    (the trades converging on the ITCZ, the drift into the lows) is the lower
//                    branch of overturning cells whose heat goes the other way aloft: the diffusion
//                    stands for those. The rotational part carries no heat across a latitude in
//                    the zonal mean; only its waves do (the stationary eddies).
//   the heat         the air carried across each edge, c F T, c = ρc_p H the heat a column of air at
//                    the surface's temperature holds per kelvin, H its depth (tuned on Earth: the
//                    surface's anomalies thin out aloft, where the wind is stronger). The wind and
//                    the temperature are each a mean and two harmonics, so their product is too:
//                    the year's mean wind carries each harmonic (ū·∇T̄, ū·∇T̂ₖ: upwind, implicit:
//                    the inflow from each neighbour an edge weight beside the diffusion's, so each
//                    harmonic's balance stays an M-matrix), and the seasons' winds the rest (ûₖ·∇T̄
//                    into the seasons, the product of the seasons' winds and temperatures into the
//                    mean and the second harmonic: centred, lagged from the last state, `cross`),
//                    so winter's northwesterlies over a continent's eastern side, its gradient at
//                    its steepest, cool it more than summer's southwesterlies warm it. The flows are
//                    divergence-free and the fluxes antisymmetric, so the transport sums to nothing.
//                    The operator is lopsided, so it's solved by BiCGSTAB on the CPU (`bicgstab` in
//                    src/engine/climate.js) and by the GPU's multigrid with the inflow on each
//                    level's edges (src/gpu/ebm.js), each level's flow from ψ̄ at its own corners.
import { restrict } from '../grid/transfer.js';
import { LaplaceMG, mgcg } from '../grid/multigrid.js';

/** Tunable; tools and tests may change them. */
export const AIRHEAT = {
  H: 1,                  // km: the depth of air at the surface's temperature the wind carries (0: none). Earth (tuned: 3–8 km warmed Eurasia's interior 2–6 K)
  SEASONS: 1,            // the year's mean wind carries the seasons' harmonics too (1), or the mean alone (0)
  CROSS: 1,              // the seasons' winds carry heat (1), or the year's mean wind alone (0)
  RHO_CP: 1206,          // J m⁻³ K⁻¹: air's, at the surface
  CG: [1e-7, 60, 4],     // ψ's Poisson solves: relative residual, iterations at most (warm-started), a slice's (the flows are ψ's differences, so free of divergence whatever ψ's error; their strength isn't)
};

const R = 6.371e6;

export class AirHeat {
  constructor(climate) {
    this.c = climate;
    const cg = climate.coarse, nc = cg.n, m = cg.nbrOff[nc];
    // The rotational wind's stream function, m/s × the unit sphere's length, on the energy balance's
    // cells: the year's mean (real) and two harmonics (re, im).
    this.psi = Array.from({ length: 5 }, () => new Float64Array(nc));
    this.F = Array.from({ length: 5 }, () => new Float64Array(m));   // per coarse edge: the flows, outward, Δψ (the same units)
    this.a = new Float64Array(m);      // per coarse edge: the mean wind's inflow weight in the solve's units, c max(−F̄, 0)/R
    this.X = Array.from({ length: 5 }, () => new Float64Array(nc));   // the seasons' winds' heat per coarse cell, the solve's units (`cross`)
    this.on = false;
    this.version = 0;                  // bumped with each new wind (the GPU's levels follow it)
    this.stats = { urms: 0, it: 0 };   // the year's mean rotational wind's rms speed (m/s); ψ's iterations
  }

  /** c/R: a flow in Δψ times a temperature to the solve's units (W over R²). */
  get k0() { return AIRHEAT.RHO_CP * AIRHEAT.H * 1000 / R; }

  /** The wind at the climate's points of the year as the mean and two harmonics, each's rotational part as ψ, and the edges' flows and weights. */
  setWind() { for (const _ of this.windSteps()); }

  *windSteps() {
    const c = this.c, g = c.grid, n = g.n, cg = c.coarse, nc = cg.n, np = c.windPhase.length, C = AIRHEAT;
    this.on = false;
    this.a.fill(0);
    if (!(C.H > 0) || !np) return;
    // Each point's wind on the coarse grid, then its harmonics: (2/np) Σ u e^{−ikθ}, θ at (p + ½)/np of the year.
    const f6 = c.scratch.f6, uc = new Float64Array(3 * nc), tmp = new Float64Array(nc);
    const U = Array.from({ length: 5 }, () => new Float64Array(3 * nc));
    let any = 0;
    for (let p = 0; p < np; p++) {
      const w = c.windPhase[p], th = 2 * Math.PI * (p + 0.5) / np;
      for (let d = 0; d < 3; d++) {
        for (let i = 0; i < n; i++) f6[i] = w[3 * i + d];
        restrict(c.T, f6, tmp);
        for (let I = 0; I < nc; I++) uc[3 * I + d] = tmp[I];
      }
      const cf = [1 / np, 2 * Math.cos(th) / np, -2 * Math.sin(th) / np, 2 * Math.cos(2 * th) / np, -2 * Math.sin(2 * th) / np];
      for (let k = 0; k < 5; k++) { const Uk = U[k], s = cf[k]; for (let j = 0; j < 3 * nc; j++) Uk[j] += s * uc[j]; }
      for (let j = 0; j < 3 * nc; j++) any += Math.abs(uc[j]);
    }
    if (!(any > 0)) return;
    yield;
    // The circulation round each cell along its Voronoi edges (corner k−1 to corner k, the edge's
    // velocity the mean of its two cells'): exactly opposite from the cell across, so it sums to nothing.
    const ctr = cg.centre, zA = Array.from({ length: 5 }, () => new Float64Array(nc));
    for (let I = 0; I < nc; I++) {
      const o = cg.nbrOff[I], d = cg.nbrOff[I + 1] - o;
      for (let k = 0; k < d; k++) {
        const J = cg.nbr[o + k], c0 = cg.corner[o + (k + d - 1) % d], c1 = cg.corner[o + k];
        const ex = ctr[3 * c1] - ctr[3 * c0], ey = ctr[3 * c1 + 1] - ctr[3 * c0 + 1], ez = ctr[3 * c1 + 2] - ctr[3 * c0 + 2];
        for (let h = 0; h < 5; h++) { const u = U[h]; zA[h][I] += 0.5 * ((u[3 * I] + u[3 * J]) * ex + (u[3 * I + 1] + u[3 * J + 1]) * ey + (u[3 * I + 2] + u[3 * J + 2]) * ez); }
      }
    }
    // ∇²ψ = ζ: Σ w (ψ_I − ψ_J) = −ζ_I A_I for the mean and each harmonic's two parts, warm-started
    // from the last, each solve's state kept across slices (restarting every slice, the harmonics'
    // solves wandered: one came back ten times too strong, and its lagged heat ran the energy balance
    // away), the constant (the operator's null space) taken out.
    const K = C.CROSS ? 5 : 1, b = zA.slice(0, K).map(z => { let m = 0; for (let I = 0; I < nc; I++) m += z[I]; m /= nc; return Float64Array.from(z, v => -(v - m)); });
    for (let h = K; h < 5; h++) this.psi[h].fill(0);
    // By CG preconditioned with the coarse grid's multigrid (src/grid/multigrid.js), warm from the last.
    if (!this.mg) { this.mg = new LaplaceMG(cg); this.mg.setOperator(this.c.ws.w); }
    const work = this.cgWork || (this.cgWork = Array.from({ length: 3 }, () => new Float64Array(nc)));
    let it = 0;
    for (let h = 0; h < K; h++) {
      it += yield* mgcg(this.mg, b[h], this.psi[h], { tol: C.CG[0], maxIt: C.CG[1], slice: C.CG[2], work });
      const x = this.psi[h];
      let m = 0;
      for (let I = 0; I < nc; I++) m += x[I];
      m /= nc;
      for (let I = 0; I < nc; I++) x[I] -= m;
    }
    this.stats.it = it;
    for (let h = 0; h < 5; h++) flows(cg, this.psi[h], this.F[h]);
    const k0 = this.k0, F0 = this.F[0];
    let u2 = 0, w2 = 0;
    for (let t = 0; t < F0.length; t++) {
      this.a[t] = Math.max(0, -F0[t]) * k0;
      const s = F0[t] / cg.ell[t], w = cg.ell[t] * cg.dist[t];   // the edge's normal speed, weighted by its diamond
      u2 += w * s * s; w2 += w;
    }
    this.stats.urms = Math.sqrt(2 * u2 / w2);   // both components: the normal speeds hold half the square
    this.on = true;
    this.version++;
  }

  /**
   * The seasons' winds' heat from the coarse state Tc (5 harmonic fields), lagged: per cell, the net
   * inflow of c F T at each edge's mean temperature, for each harmonic of the product the year's mean
   * wind doesn't carry (`X`, the solve's units). Each edge's flux leaves one cell as it enters the
   * other, so each harmonic sums to nothing. False when off.
   */
  cross(Tc) {
    const cg = this.c.coarse, nc = cg.n, X = this.X;
    for (const x of X) x.fill(0);
    if (!this.on || !AIRHEAT.CROSS) return false;
    const k0 = this.k0, [, f1r, f1i, f2r, f2i] = this.F, [T0, T1r, T1i, T2r, T2i] = Tc;
    for (let I = 0; I < nc; I++) for (let t = cg.nbrOff[I]; t < cg.nbrOff[I + 1]; t++) {
      const J = cg.nbr[t];
      if (J < I) continue;   // each edge once, from its lower cell
      const t0 = 0.5 * (T0[I] + T0[J]), ar = 0.5 * (T1r[I] + T1r[J]), ai = 0.5 * (T1i[I] + T1i[J]), br = 0.5 * (T2r[I] + T2r[J]), bi = 0.5 * (T2i[I] + T2i[J]);
      const ur = f1r[t], ui = f1i[t], vr = f2r[t], vi = f2i[t];
      // The product's harmonics less what ū carries: mean ½Re(û₁T̂₁* + û₂T̂₂*); first û₁T̄ + ½(û₁*T̂₂ + û₂T̂₁*); second û₂T̄ + ½û₁T̂₁.
      const m = 0.5 * (ur * ar + ui * ai + vr * br + vi * bi);
      const p1r = ur * t0 + 0.5 * (ur * br + ui * bi + vr * ar + vi * ai), p1i = ui * t0 + 0.5 * (ur * bi - ui * br + vi * ar - vr * ai);
      const p2r = vr * t0 + 0.5 * (ur * ar - ui * ai), p2i = vi * t0 + 0.5 * (ur * ai + ui * ar);
      const q = [m, p1r, p1i, p2r, p2i];
      for (let h = 0; h < 5; h++) { const f = k0 * q[h]; X[h][I] -= f; X[h][J] += f; }
    }
    return true;
  }

  /**
   * The mean wind's inflow weights on a nested grid g (its cells the first of the energy balance's,
   * at the same places), from ψ̄ at its own corners, per cell padded to six (a pentagon's sixth 0):
   * for the GPU's multigrid (src/gpu/ebm.js), each level the same physics on its own cells.
   */
  levelWeights(g, out, off) {
    const k0 = this.k0, fl = flows(g, this.psi[0], new Float64Array(g.nbrOff[g.n]));
    for (let i = 0; i < g.n; i++) {
      const o = g.nbrOff[i], d = g.nbrOff[i + 1] - o;
      for (let k = 0; k < 6; k++) out[6 * (off + i) + k] = k < d ? Math.max(0, -fl[o + k]) * k0 : 0;
    }
  }
}

/** Each edge's outward flow from ψ on g's cells (the first g.n of ψ), into out: ψ at the corners as their triangles' means. */
function flows(g, psi, out) {
  const n = g.n, tris = g.tris, cor = g.corner;
  const pc = f => (psi[tris[3 * f]] + psi[tris[3 * f + 1]] + psi[tris[3 * f + 2]]) / 3;
  for (let I = 0; I < n; I++) {
    const o = g.nbrOff[I], d = g.nbrOff[I + 1] - o;
    for (let k = 0; k < d; k++) out[o + k] = pc(cor[o + (k + d - 1) % d]) - pc(cor[o + k]);
  }
  return out;
}
