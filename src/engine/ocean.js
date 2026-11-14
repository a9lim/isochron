// The wind-driven ocean (docs/PLAN.md, layer 7).
//
// Gyres. The depth-integrated circulation under the annual-mean wind stress,
// steady, in Stommel's form on the sphere (standard):
//     r ∇²ψ + β ∂ψ/∂x = curl τ / ρ₀,   ψ = 0 on every coast,
// which on the unit sphere is ε ∇²ψ + ∂ψ/∂λ = a² curl τ / (2Ω ρ₀), ε = r/2Ω.
// Away from the western shores it is Sverdrup's balance, β V = curl τ/ρ₀;
// along them a boundary layer ε wide carries the return flow, so western
// boundary currents appear in whatever basins the plates have made. (The
// plan named Munk's layer; Stommel's bottom friction makes the same
// intensification with one boundary condition.) ε is set so the layer spans
// two cells. Solved by BiCGSTAB, warm-started, whenever the climate cycles.
//
// Sea-surface temperature. The energy balance gives the ocean's temperature;
// the currents then carry it: steady u·∇(T + T′) + λT′ = κ∇²T′ + upwelling,
// for an anomaly T′ relaxed to the air over half a year. Poleward western
// currents run warm and equatorward eastern ones cold, and where the wind
// drives surface water off a coast (Ekman transport) cold water wells up.
// T′ feeds evaporation, rain and sea ice: the cold coasts make coastal
// deserts.

const R_M = 6.371e6, OMEGA = 7.292e-5, RHO_W = 1025, RHO_A = 1.2, CD = 1.3e-3;

export const OCEAN = {
  LAYER_CELLS: 2,     // the western boundary layer's width, in cells
  H_SURF: 400,        // m: the layer the surface currents fill
  RELAX: 180,         // days: SST anomalies against the air
  KAPPA: 170,         // km²/day of eddy mixing
  UPWELL: 6,          // K of cooling where the Ekman drift leaves a coast at 1 m²/s
  MAX_ANOM: 8,        // K
};

export class Ocean {
  constructor(climate) {
    this.climate = climate;
    const g = this.grid = climate.grid, n = g.n;
    this.psi = new Float64Array(n);       // m³/s
    this.sst = new Float32Array(n);       // the anomaly T′, K
    this.vel = new Float32Array(3 * n);   // surface current, m/s
    this.tau = new Float64Array(3 * n);   // annual-mean wind stress, N/m²
    this.curl = new Float64Array(n);
    this.sea = new Uint8Array(n);
    this.ws = {};
    this.stats = { maxSv: 0 };
    const nbrOff = g.nbrOff, pos = g.pos, gw = g.gw;
    // ∂/∂λ by the least-squares gradient along ẑ × r.
    this.dl = new Float64Array(nbrOff[n]);
    for (let i = 0; i < n; i++) {
      const x = pos[3 * i], y = pos[3 * i + 1];
      for (let t = nbrOff[i], e = nbrOff[i + 1]; t < e; t++) this.dl[t] = -y * gw[3 * t] + x * gw[3 * t + 1];
    }
    this.eps = OCEAN.LAYER_CELLS * Math.sqrt(4 * Math.PI / n) / 2;
  }

  /** Annual-mean wind stress and its curl, from the climate's last winds. */
  forcing() {
    const c = this.climate, g = this.grid, n = g.n, W = c.windPhase, np = W.length;
    for (let i = 0; i < n; i++) {
      let tx = 0, ty = 0, tz = 0;
      for (let p = 0; p < np; p++) {
        const u = W[p][3 * i], v = W[p][3 * i + 1], w = W[p][3 * i + 2], s = Math.hypot(u, v, w);
        tx += RHO_A * CD * s * u; ty += RHO_A * CD * s * v; tz += RHO_A * CD * s * w;
      }
      this.tau[3 * i] = tx / np; this.tau[3 * i + 1] = ty / np; this.tau[3 * i + 2] = tz / np;
      this.sea[i] = c.landMask[i] ? 0 : 1;
    }
    // Curl: circulation round each Voronoi cell over its area (corners are the faces' centres).
    const nbrOff = g.nbrOff, nbr = g.nbr, corner = g.corner, C = g.centre, tau = this.tau;
    for (let i = 0; i < n; i++) {
      const o = nbrOff[i], d = nbrOff[i + 1] - o;
      let circ = 0;
      for (let k = 0; k < d; k++) {
        const j = nbr[o + k];
        const a = corner[o + (k + d - 1) % d], b = corner[o + k];
        const ex = C[3 * b] - C[3 * a], ey = C[3 * b + 1] - C[3 * a + 1], ez = C[3 * b + 2] - C[3 * a + 2];
        circ += 0.5 * ((tau[3 * i] + tau[3 * j]) * ex + (tau[3 * i + 1] + tau[3 * j + 1]) * ey + (tau[3 * i + 2] + tau[3 * j + 2]) * ez);
      }
      this.curl[i] = circ / (g.area[i] * R_M);   // N/m³
    }
  }

  /** The gyres: BiCGSTAB on the sea's cells, coasts at ψ = 0. */
  *gyres() {
    const g = this.grid, n = g.n, nbrOff = g.nbrOff, nbr = g.nbr, ell = g.ell, dist = g.dist, A = g.area, dl = this.dl, sea = this.sea, eps = this.eps;
    const scale = R_M * R_M / (2 * OMEGA * RHO_W);
    const ws = this.ws;
    for (const k of ['r', 'r0', 'p', 'v', 's', 't', 'b', 'diag']) if (!ws[k]) ws[k] = new Float64Array(n);
    const { r, r0, p, v, s, t, b, diag } = ws;
    const x = this.psi;
    const apply = (u, out) => {
      for (let i = 0; i < n; i++) {
        if (!sea[i]) { out[i] = u[i]; continue; }
        let lap = 0, adv = 0;
        const ui = u[i];
        for (let k = nbrOff[i], e = nbrOff[i + 1]; k < e; k++) {
          const j = nbr[k], uj = sea[j] ? u[j] : 0;
          lap += (ell[k] / dist[k]) * (uj - ui);
          adv += dl[k] * (uj - ui);
        }
        out[i] = eps * lap / A[i] + adv;
      }
    };
    for (let i = 0; i < n; i++) {
      b[i] = sea[i] ? scale * this.curl[i] : 0;
      if (!sea[i]) x[i] = 0;
      let sw = 0;
      for (let k = nbrOff[i], e = nbrOff[i + 1]; k < e; k++) sw += ell[k] / dist[k];
      diag[i] = sea[i] ? -eps * sw / A[i] : 1;
    }
    // BiCGSTAB with a Jacobi preconditioner (right-preconditioned).
    apply(x, r);
    let bn = 0;
    for (let i = 0; i < n; i++) { r[i] = b[i] - r[i]; r0[i] = r[i]; p[i] = 0; v[i] = 0; bn += b[i] * b[i]; }
    bn = Math.sqrt(bn) || 1;
    let rho = 1, alpha = 1, omega = 1;
    const ph = ws.ph || (ws.ph = new Float64Array(n)), sh = ws.sh || (ws.sh = new Float64Array(n));
    // Warm-started, at most 120 iterations a cycle: the basins change slowly, and the
    // next cycle carries on from here.
    const maxIt = this.solvedOnce ? 120 : 600;
    this.solvedOnce = true;
    for (let it = 0; it < maxIt; it++) {
      let rn = 0;
      for (let i = 0; i < n; i++) rn += r0[i] * r[i];
      const beta = (rn / rho) * (alpha / omega);
      rho = rn;
      for (let i = 0; i < n; i++) { p[i] = r[i] + beta * (p[i] - omega * v[i]); ph[i] = p[i] / diag[i]; }
      apply(ph, v);
      let rv = 0;
      for (let i = 0; i < n; i++) rv += r0[i] * v[i];
      alpha = rho / rv;
      for (let i = 0; i < n; i++) { s[i] = r[i] - alpha * v[i]; sh[i] = s[i] / diag[i]; }
      apply(sh, t);
      let ts = 0, tt = 0;
      for (let i = 0; i < n; i++) { ts += t[i] * s[i]; tt += t[i] * t[i]; }
      omega = tt > 0 ? ts / tt : 0;
      let res = 0;
      for (let i = 0; i < n; i++) { x[i] += alpha * ph[i] + omega * sh[i]; r[i] = s[i] - omega * t[i]; res += r[i] * r[i]; }
      this.iters = it + 1;
      if (!(Math.sqrt(res) / bn > 1e-5) || !(omega !== 0)) break;
      if (it % 40 === 39) yield;
    }
    let mx = 0;
    for (let i = 0; i < n; i++) { if (!Number.isFinite(x[i])) x[i] = 0; if (Math.abs(x[i]) > mx) mx = Math.abs(x[i]); }
    this.stats.maxSv = mx / 1e6;
  }

  /** Surface currents from ψ, and the SST anomaly they carry. */
  *temperature() {
    const c = this.climate, g = this.grid, n = g.n, nbrOff = g.nbrOff, nbr = g.nbr, pos = g.pos, gw = g.gw, tan = g.tan, ell = g.ell, dist = g.dist, sea = this.sea;
    const vel = this.vel, H = OCEAN.H_SURF;
    for (let i = 0; i < n; i++) {
      if (!sea[i]) { vel[3 * i] = vel[3 * i + 1] = vel[3 * i + 2] = 0; continue; }
      let gx = 0, gy = 0, gz = 0;
      for (let t = nbrOff[i], e = nbrOff[i + 1]; t < e; t++) {
        const j = nbr[t], d = (sea[j] ? this.psi[j] : 0) - this.psi[i];
        gx += d * gw[3 * t]; gy += d * gw[3 * t + 1]; gz += d * gw[3 * t + 2];
      }
      // u = k × ∇ψ / H (∇ on the sphere of radius a).
      const x = pos[3 * i], y = pos[3 * i + 1], z = pos[3 * i + 2];
      vel[3 * i] = (y * gz - z * gy) / (R_M * H); vel[3 * i + 1] = (z * gx - x * gz) / (R_M * H); vel[3 * i + 2] = (x * gy - y * gx) / (R_M * H);
    }
    // Upwelling: where the Ekman drift (τ × k / ρf) leaves a coast.
    const up = this.upwell || (this.upwell = new Float32Array(n));
    for (let i = 0; i < n; i++) {
      up[i] = 0;
      if (!sea[i]) continue;
      const x = pos[3 * i], y = pos[3 * i + 1], z = pos[3 * i + 2];
      const f = 2 * OMEGA * z;
      if (Math.abs(f) < 1.5e-5) continue;
      const tx = this.tau[3 * i], ty = this.tau[3 * i + 1], tz = this.tau[3 * i + 2];
      // τ × r̂ / (ρ f): to the right of the wind in the north, left in the south.
      const mx = (ty * z - tz * y) / (RHO_W * f), my = (tz * x - tx * z) / (RHO_W * f), mz = (tx * y - ty * x) / (RHO_W * f);
      let off = 0;
      for (let t = nbrOff[i], e = nbrOff[i + 1]; t < e; t++) {
        if (sea[nbr[t]]) continue;
        off = Math.max(off, -(mx * tan[3 * t] + my * tan[3 * t + 1] + mz * tan[3 * t + 2]));   // away from the land
      }
      up[i] = -OCEAN.UPWELL * Math.tanh(off);
    }
    // The steady anomaly, by sweeps (as the moisture's).
    const T = c.Tf[0], Tp = this.sst, lam = 1 / OCEAN.RELAX, kap = OCEAN.KAPPA, Akm = R_M * R_M / 1e6;
    const order = c.orders;
    for (let sweep = 0; sweep < 12; sweep++) {
      const ord = order[sweep & 3];
      for (let k = 0; k < n; k++) {
        const i = ord[k];
        if (!sea[i]) { Tp[i] = 0; continue; }
        const Ai = g.area[i] * Akm;
        let a = Ai * lam, b = Ai * lam * up[i];
        for (let t = nbrOff[i], e = nbrOff[i + 1]; t < e; t++) {
          const j = nbr[t];
          const u = 0.5 * ((vel[3 * i] + vel[3 * j]) * tan[3 * t] + (vel[3 * i + 1] + vel[3 * j + 1]) * tan[3 * t + 1] + (vel[3 * i + 2] + vel[3 * j + 2]) * tan[3 * t + 2]) * 86.4;
          const L = ell[t] * R_M / 1000, kd = kap * ell[t] / dist[t];
          const Tj = sea[j] ? T[j] + Tp[j] : T[i] + Tp[i];
          if (u < 0) b += -u * L * (Tj - T[i]);           // upwind: inflow brings its water's temperature
          if (sea[j]) { a += kd; b += kd * Tp[j]; }
        }
        // Upwind u·∇(T + T′) = Σ_in |u|L (T_i + T′_i − T_j − T′_j)/A: the T′_i part goes to a.
        let inflow = 0;
        for (let t = nbrOff[i], e = nbrOff[i + 1]; t < e; t++) {
          const j = nbr[t];
          const u = 0.5 * ((vel[3 * i] + vel[3 * j]) * tan[3 * t] + (vel[3 * i + 1] + vel[3 * j + 1]) * tan[3 * t + 1] + (vel[3 * i + 2] + vel[3 * j + 2]) * tan[3 * t + 2]) * 86.4;
          if (u < 0) inflow += -u * ell[t] * R_M / 1000;
        }
        a += inflow;
        Tp[i] = Math.max(-OCEAN.MAX_ANOM, Math.min(OCEAN.MAX_ANOM, b / a));
      }
      if (sweep % 4 === 3) yield;
    }
  }

  /** Every climate cycle: SST; every third, the wind's forcing and the gyres too. */
  *solve() {
    if ((this.cycles = (this.cycles || 0) + 1) % 3 === 1) {
      this.forcing();
      yield;
      yield* this.gyres();
    }
    yield* this.temperature();
  }
}
