// The sea's heat transport (synthesis on standard pieces): the heat the ocean's currents carry,
// which the energy balance's diffusion can't. Diffusion carries heat down the gradient and alike in
// every direction, so it would warm both hemispheres' subpolar seas, and every basin at a latitude,
// alike; Earth's ocean carries heat north through the whole Atlantic, across the equator and up to
// the Nordic Seas, warms the eastern sides of its subpolar basins and chills their western ones, and
// carries next to nothing poleward across the Southern Ocean.
//
//   the water        (standard: advection, and a bulk exchange with the air) the water has a
//                    temperature θ of its own, carried by the currents on the energy balance's
//                    grid and exchanging with the air over it at LAMBDA (×ICE under sea ice, which
//                    insulates it): in each cell, steady, ρc_p (Σ F_in θ_in − F_out θ) = λ A (θ − T),
//                    so a current keeps its heat ~ρc_p q/λ downstream and gives it up where it
//                    turns cold. T is the energy balance's annual mean; θ at least freezing.
//   the gyres        (standard: Stommel's, src/engine/ocean.js) the wind-driven circulation's
//                    transport, its share at the water's temperature GYRE (the rest flows below
//                    the warm layer), between cells as differences of ψ at the Voronoi corners, so
//                    it runs up the western boundaries and back through the interiors, north up
//                    a subpolar basin's eastern side and south down its western.
//   the overturning  (standard: Toggweiler and Samuels' Drake Passage effect, 1995) a sea whose
//                    latitude circle runs all the way round over water (`channels`) can't hold a
//                    zonal pressure gradient above its sills, so the westerlies' equatorward
//                    Ekman transport out of it isn't returned there: it upwells in the channel and
//                    sinks in the other hemisphere's deep subpolar seas, between SINK0–SINK1 and
//                    SINK2–SINK3, by depth (on Earth the Nordic, Labrador and Irminger Seas; Earth's
//                    North Pacific is too fresh to sink, which this model, without salt, can't
//                    know: here its deep basins lie south of SINK1 and the Bering Sea's shelf is
//                    shallow). Its strength is EKMAN × that
//                    transport, ∮ τₓ dx / ρ|f| over the sea at its strongest across the channel's
//                    band (CHANNEL degrees either side of its open circles), from the climate's
//                    mean winds (fitted to Earth's ~15–17 Sv: mean winds lack the storms' stress,
//                    and eddies return a share). Mixing drives MIX on any planet, upwelling everywhere and
//                    sinking in both hemispheres' polar seas. Its upper limb is the potential flow
//                    from where it upwells to where it sinks, through the connected sea, each edge
//                    conducting as its water's depth up to DEPTH (the limb's thickness), so shelves
//                    and shallow straits carry little (Bering Strait, 50 m deep, ~1 Sv on Earth);
//                    the deep return carries what sank back to the upwelling, so the loop makes no
//                    heat.
//   the solve        the water's temperature by Gauss–Seidel sweeps from the last T; the heat it
//                    gives each cell, λA(θ − T), linearized about that T: its own cell's share on
//                    the annual mean's diagonal (implicit), the rest its forcing (lagged), so the
//                    solvers keep their symmetric form (src/engine/climate.js's `ebm`,
//                    src/gpu/ebm.js).
import { nearest } from '../grid/icosphere.js';
import { restrict } from '../grid/transfer.js';
import { CLIMATE } from './climate.js';

/** Tunable; tools and tests may change them. */
export const SEAHEAT = {
  LAMBDA: 15,            // W m⁻² K⁻¹: the water's exchange with the air (the bulk fluxes and the radiation's, ~15–40, from memory; held at 15: Earth's tuning pressed it to 5, sending the overturning's heat down with the sinking water instead of fixing the air's missing advection)
  ICE: 0.08,             // its share under sea ice (~2 m of ice conducts ~1 W m⁻² K⁻¹), by the year's share under ice
  GYRE: 0.7,             // the gyres' transport's share at the water's temperature (Earth)
  EKMAN: 0.6,            // the overturning per unit of a channel's equatorward Ekman transport: Earth's ~13 Sv and ~1.2 PW north across 26° N (the Atlantic's measured ~17 Sv and ~1.25 PW, from memory)
  MIX: 3,                // Sv: the overturning mixing drives on any planet
  SINK0: 55, SINK1: 68, SINK2: 78, SINK3: 88,   // degrees: a sea cell's share of the sinking rises over SINK0–SINK1 and falls over SINK2–SINK3 (smoothsteps), by its area and depth
  CHANNEL: 10,           // degrees either side of a channel's open circles: its upwelling's band
  DEPTH: 1000,           // m: the overturning's upper limb, the depth an edge's water conducts it to
  THETA_F: -1.8,         // °C: the water's freezing point
  THETA_MAX: 60,         // °C: at most (a guard: the flows balance water in every cell, so θ is a mean of what flows in and the air's)
  RHO_CP: 4.1e6,         // J m⁻³ K⁻¹
  RHO_W: 1025, RHO_A: 1.2, CD: 1.3e-3,   // the wind's stress on the sea
  MAX: 40,               // Sv: the overturning at most, per hemisphere's channel
  SWEEPS: 96, TOL: 1e-3, // the water's sweeps at most, until no cell's θ moves by TOL (K)
};

const R = 6.371e6, SV = 1e6;
const smooth = (x, a, b) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

export class SeaHeat {
  constructor(climate) {
    this.c = climate;
    const cg = climate.coarse, nc = cg.n, m = cg.nbrOff[nc];
    this.sea = new Uint8Array(nc);          // the connected ocean the currents run in
    this.key = null;
    this.open = new Uint8Array(180);        // by 1° of latitude: the circle runs all the way round over sea
    this.pat = null;                        // the overturning's unit patterns: { S, K, F, x } (sources, sinks, edge flows, potential; each summing to 1)
    this.psi = { S: 0, N: 0, mix: 0 };      // Sv: the overturning's parts
    this.ek = { S: 0, N: 0 };               // Sv: the channels' equatorward Ekman transport
    this.S = new Float64Array(nc); this.K = new Float64Array(nc);   // the overturning's upwelling and sinking now, m³/s
    this.F = new Float64Array(m);           // per coarse edge: the water's flow, outward, m³/s
    this.lam = new Float64Array(nc);        // per cell: λA (W/K)
    this.theta = new Float64Array(nc);      // the water's temperature, °C
    this.diag = new Float64Array(nc); this.rhs = new Float64Array(nc);   // the annual mean's terms (the solve's units: W K⁻¹ and W, over R²)
    this.deep = 2;
    this.on = false;
    this.stats = { sv: 0, gyre: 0, sweeps: 0 };
    const lon = new Float64Array(nc);
    for (let I = 0; I < nc; I++) lon[I] = Math.atan2(cg.pos[3 * I + 1], cg.pos[3 * I]);
    this.own = new Int32Array(m);           // each coarse edge's own cell
    for (let I = 0; I < nc; I++) for (let t = cg.nbrOff[I]; t < cg.nbrOff[I + 1]; t++) this.own[t] = I;
    const idx = () => Int32Array.from({ length: nc }, (_, I) => I);
    this.byLon = [idx().sort((a, b) => lon[a] - lon[b]), idx().sort((a, b) => lon[b] - lon[a])];
  }

  /** Each 1° of latitude whose circle runs all the way round over sea (the coarse grid's land share under ½). */
  channels() {
    const cg = this.c.coarse, lf = this.c.landFracC, open = this.open;
    let guess = 0;
    for (let b = 0; b < 180; b++) {
      const la = (b + 0.5 - 90) * Math.PI / 180, c = Math.cos(la), z = Math.sin(la), m = Math.max(16, Math.ceil(2 * Math.PI * c / 0.01));
      let all = 1;
      for (let k = 0; k < m; k++) {
        const lo = 2 * Math.PI * k / m;
        guess = nearest(cg, c * Math.cos(lo), c * Math.sin(lo), z, guess);
        if (lf[guess] >= 0.5) { all = 0; break; }
      }
      open[b] = all;
    }
  }

  /**
   * After the geography: the ocean, the channels and the overturning's sources and sinks, when the
   * sea has moved; its flows follow (`solveSteps`), the last ones in use until they're done.
   */
  geometry() {
    const c = this.c, cg = c.coarse, nc = cg.n, lf = c.landFracC, C = SEAHEAT;
    const wet = new Uint8Array(nc);
    for (let I = 0; I < nc; I++) wet[I] = lf[I] < 0.5 ? 1 : 0;
    // Each cell's depth over its sea (m), to DEPTH: the conductance of the overturning's limb.
    const tec = c.tec, g = c.grid, f6 = c.scratch.f6, dc = new Float64Array(nc), sw = new Float64Array(nc);
    for (let i = 0; i < g.n; i++) f6[i] = c.landMask[i] ? 0 : Math.min(C.DEPTH, Math.max(0, 1000 * (tec.seaLevel - tec.elev[i])));
    restrict(c.T, f6, dc);
    for (let i = 0; i < g.n; i++) f6[i] = c.landMask[i] ? 0 : 1;
    restrict(c.T, f6, sw);
    const depth = new Float64Array(nc);
    for (let I = 0; I < nc; I++) depth[I] = sw[I] > 1e-6 ? dc[I] / sw[I] / C.DEPTH : 0;
    let key = 0;
    for (let I = 0; I < nc; I++) key = (Math.imul(key, 31) + wet[I] + 2 * Math.round(10 * depth[I])) | 0;
    if (key === this.key) return;
    this.key = key;
    this.channels();
    // The largest connected body of sea.
    const comp = new Int32Array(nc).fill(-1), area = [];
    for (let I = 0; I < nc; I++) {
      if (!wet[I] || comp[I] >= 0) continue;
      const k = area.length; let a = 0; const st = [I]; comp[I] = k;
      while (st.length) {
        const J = st.pop(); a += cg.area[J];
        for (let t = cg.nbrOff[J]; t < cg.nbrOff[J + 1]; t++) { const L = cg.nbr[t]; if (wet[L] && comp[L] < 0) { comp[L] = k; st.push(L); } }
      }
      area.push(a);
    }
    const big = area.length ? area.indexOf(Math.max(...area)) : -1, sea = new Uint8Array(nc);
    for (let I = 0; I < nc; I++) sea[I] = comp[I] === big && big >= 0 ? 1 : 0;
    const z = I => cg.pos[3 * I + 2], deg = I => Math.asin(Math.max(-1, Math.min(1, z(I)))) * 180 / Math.PI;
    // Sinks: each hemisphere's deep subpolar seas, by area and depth, in a belt from SINK0–SINK1 to
    // SINK2–SINK3 (deep water forms where winter cools open water at the ice's margin, not on shelves
    // or under the polar cap's perennial ice: the Nordic, Labrador and Irminger Seas, the Weddell and
    // Ross); where a hemisphere has no sea past SINK0, its most poleward.
    const sinks = h => {
      const K = new Float64Array(nc);
      let s = 0, top = 0;
      for (let I = 0; I < nc; I++) if (sea[I] && h * z(I) > 0) top = Math.max(top, Math.abs(deg(I)));
      const a = Math.min(C.SINK0, top - 20), b = Math.min(C.SINK1, top);
      for (let I = 0; I < nc; I++) if (sea[I] && h * z(I) > 0) {
        const la = Math.abs(deg(I));
        K[I] = cg.area[I] * depth[I] * smooth(la, a, b) * (1 - (top > C.SINK3 ? smooth(la, C.SINK2, C.SINK3) : 0));
        s += K[I];
      }
      return s > 0 ? K.map(v => v / s) : null;
    };
    const KS = sinks(-1), KN = sinks(1);
    // A channel's upwelling: the sea within CHANNEL degrees of its open circles, by area, tapered.
    const wb = new Float64Array(181);   // by 1° of latitude: the taper to the nearest open circle
    for (let d = 0; d <= 180; d++) for (let b = 0; b < 180; b++) if (this.open[b]) { const x = Math.abs(d - (b + 0.5)) / C.CHANNEL; if (x < 1) wb[d] = Math.max(wb[d], Math.cos(0.5 * Math.PI * x) ** 2); }
    const band = h => {
      const S = new Float64Array(nc); let s = 0;
      for (let I = 0; I < nc; I++) {
        if (!sea[I] || !(h * z(I) > 0)) continue;
        const x = deg(I) + 90, d = Math.min(179, Math.floor(x)), u = x - d, w = wb[d] * (1 - u) + wb[d + 1] * u;
        if (w > 0) { S[I] = cg.area[I] * w; s += S[I]; }
      }
      return s > 0 ? S.map(v => v / s) : null;
    };
    const BS = band(-1), BN = band(1), pat = {};
    if (BS && KN) pat.S = { S: BS, K: KN };
    if (BN && KS) pat.N = { S: BN, K: KS };
    if (KS || KN) {
      const S = new Float64Array(nc), K = new Float64Array(nc); let s = 0;
      for (let I = 0; I < nc; I++) if (sea[I]) { S[I] = cg.area[I]; s += S[I]; }
      for (let I = 0; I < nc; I++) S[I] /= s;
      const parts = [KS, KN].filter(Boolean);
      for (const k of parts) for (let I = 0; I < nc; I++) K[I] += k[I] / parts.length;
      pat.mix = { S, K };
    }
    this.next = { sea, depth, pat };
  }

  /**
   * The overturning's unit flows for the sea `geometry` found, each warm-started from its last
   * potential, a slice at a time; then they and that sea are the ones in use.
   */
  *solveSteps() {
    const nx = this.next;
    if (!nx) return;
    const warm = this.warmX || (this.warmX = {});
    for (const [k, p] of Object.entries(nx.pat)) {
      Object.assign(p, yield* this.potentialSteps(p.S, p.K, nx.sea, nx.depth, warm[k]));
      warm[k] = p.x;
    }
    if (this.next !== nx) return;   // the sea moved again meanwhile: its own solve follows
    this.sea = nx.sea; this.depth = nx.depth; this.pat = nx.pat; this.next = null; this.gyreKey = null;
  }

  /** `geometry`'s flows solved now (tools and tests). */
  settle() { for (const _ of this.solveSteps()); }

  /**
   * The potential flow through the ocean `sea` (depths `dep`, in DEPTH) with divergence b = S − K
   * (each summing to the same): its potential x and its flux F on each coarse edge, outward.
   * Conjugate gradients (Jacobi's preconditioner) on the sea's singular Laplacian, from x0, to a
   * relative residual of 1e-7, yielding every 16 iterations (~3 ms at 220 km).
   */
  *potentialSteps(S, K, sea, dep, x0 = null) {
    const cg = this.c.coarse, nc = cg.n, m = cg.nbrOff[nc];
    const b = new Float64Array(nc), d = new Float64Array(nc), x = x0 ? Float64Array.from(x0) : new Float64Array(nc);
    const r = new Float64Array(nc), p = new Float64Array(nc), q = new Float64Array(nc), zz = new Float64Array(nc);
    const own = this.own, cond = t => cg.ell[t] / cg.dist[t] * Math.max(0.01, Math.min(dep[own[t]], dep[cg.nbr[t]]));
    let mean = 0, cnt = 0;
    for (let I = 0; I < nc; I++) if (sea[I]) { b[I] = S[I] - (K ? K[I] : 0); mean += b[I]; cnt++; }
    for (let I = 0; I < nc; I++) if (sea[I]) b[I] -= mean / cnt; else x[I] = 0;
    for (let I = 0; I < nc; I++) if (sea[I]) for (let t = cg.nbrOff[I]; t < cg.nbrOff[I + 1]; t++) if (sea[cg.nbr[t]]) d[I] += cond(t);
    const apply = (u, out) => {
      for (let I = 0; I < nc; I++) {
        if (!sea[I]) { out[I] = 0; continue; }
        let s = 0;
        for (let t = cg.nbrOff[I]; t < cg.nbrOff[I + 1]; t++) { const J = cg.nbr[t]; if (sea[J]) s += cond(t) * (u[I] - u[J]); }
        out[I] = s;
      }
    };
    apply(x, q);
    let bn = 0;
    for (let I = 0; I < nc; I++) { r[I] = b[I] - q[I]; zz[I] = d[I] > 0 ? r[I] / d[I] : 0; p[I] = zz[I]; bn += b[I] * b[I]; }
    let rz = 0; for (let I = 0; I < nc; I++) rz += r[I] * zz[I];
    const tol = 1e-14 * bn;
    let it = 0;
    for (; it < 4000 && bn > 0; it++) {
      apply(p, q);
      let pq = 0; for (let I = 0; I < nc; I++) pq += p[I] * q[I];
      if (!(pq > 0)) break;
      const a = rz / pq;
      let rr = 0;
      for (let I = 0; I < nc; I++) { x[I] += a * p[I]; r[I] -= a * q[I]; rr += r[I] * r[I]; }
      if (rr < tol) break;
      let rz2 = 0;
      for (let I = 0; I < nc; I++) { zz[I] = d[I] > 0 ? r[I] / d[I] : 0; rz2 += r[I] * zz[I]; }
      const beta = rz2 / rz; rz = rz2;
      for (let I = 0; I < nc; I++) p[I] = zz[I] + beta * p[I];
      if (it % 16 === 15) yield;
    }
    this.stats.iters = it;
    const F = new Float64Array(m);
    for (let I = 0; I < nc; I++) if (sea[I]) for (let t = cg.nbrOff[I]; t < cg.nbrOff[I + 1]; t++) { const J = cg.nbr[t]; if (sea[J]) F[t] = cond(t) * (x[I] - x[J]); }
    return { F, x };
  }

  /**
   * The gyres' flow between sea cells from Stommel's ψ (m³/s on the coarse grid): across the Voronoi
   * edge from corner k−1 to corner k, ψ(k−1) − ψ(k) (u = k̂ × ∇ψ), ψ at a corner its three cells'
   * mean; edges onto land carry nothing, and what that leaves diverging at the coasts is projected
   * out (the potential flow of it subtracted, warm-started from the last).
   */
  *gyreSteps(psi) {
    const cg = this.c.coarse, nc = cg.n, sea = this.sea, m = cg.nbrOff[nc], tris = cg.tris, cor = cg.corner;
    const pc = f => (psi[tris[3 * f]] + psi[tris[3 * f + 1]] + psi[tris[3 * f + 2]]) / 3;
    const F = new Float64Array(m), div = new Float64Array(nc);
    for (let I = 0; I < nc; I++) {
      if (!sea[I]) continue;
      const o = cg.nbrOff[I], d = cg.nbrOff[I + 1] - o;
      for (let k = 0; k < d; k++) {
        if (!sea[cg.nbr[o + k]]) continue;
        F[o + k] = pc(cor[o + (k + d - 1) % d]) - pc(cor[o + k]);
        div[I] += F[o + k];
      }
    }
    const fix = yield* this.potentialSteps(div, null, sea, this.depth, this.gyreX);
    this.gyreX = fix.x;
    for (let t = 0; t < m; t++) F[t] -= fix.F[t];
    return F;
  }

  /**
   * After a cycle's winds and gyres: the overturning's strength (each channel's equatorward Ekman
   * transport under the year's mean stress of the climate's winds round its open circles, at its
   * strongest), the gyres' flow (when ψ or the sea has moved), the water's flow from both, and its
   * exchange with the air.
   */
  setFlow() { for (const _ of this.flowSteps()); }

  *flowSteps() {
    const c = this.c, C = SEAHEAT, g = c.grid, n = g.n, cg = c.coarse, nc = cg.n, np = c.windPhase.length;
    if (!this.pat) return;
    const tx = new Float64Array(n), tc = new Float64Array(nc);
    for (const w of c.windPhase) for (let i = 0; i < n; i++) {
      const u = w[3 * i], v = w[3 * i + 1], s = w[3 * i + 2], sp = Math.hypot(u, v, s);
      const x = g.pos[3 * i], y = g.pos[3 * i + 1], h = Math.hypot(x, y) || 1;
      tx[i] += C.RHO_A * C.CD * sp * (-y * u + x * v) / h / np;   // the stress's eastward part
    }
    restrict(c.T, tx, tc);
    // Over the channel's band (its open circles ± CHANNEL, the current's width: Earth's westerlies peak
    // at 50–55° S, over the current but north of Drake Passage's own latitudes), the stress on its sea.
    const ek = { S: 0, N: 0 }, lf = c.landFracC, inBand = new Uint8Array(180);
    for (let b = 0; b < 180; b++) if (this.open[b]) for (let d = -C.CHANNEL; d <= C.CHANNEL; d++) { const k = b + d; if (k >= 0 && k < 180 && (k < 90) === (b < 90)) inBand[k] = 1; }
    let guess = 0;
    for (let b = 0; b < 180; b++) {
      if (!inBand[b]) continue;
      const la = (b + 0.5 - 90) * Math.PI / 180, cs = Math.cos(la), z = Math.sin(la), m = Math.max(16, Math.ceil(2 * Math.PI * cs / 0.01));
      const f = Math.abs(2 * CLIMATE.OMEGA * z);
      if (f < 1e-6) continue;
      let s = 0;
      for (let k = 0; k < m; k++) { const lo = 2 * Math.PI * k / m; guess = nearest(cg, cs * Math.cos(lo), cs * Math.sin(lo), z, guess); s += tc[guess] * (1 - lf[guess]); }
      const M = 2 * Math.PI * R * cs * (s / m) / (C.RHO_W * f) / SV, h = z < 0 ? 'S' : 'N';
      ek[h] = Math.max(ek[h], M);
    }
    this.ek = ek;
    this.psi = { S: Math.min(C.MAX, C.EKMAN * ek.S), N: Math.min(C.MAX, C.EKMAN * ek.N), mix: C.MIX };
    const S = this.S.fill(0), K = this.K.fill(0), F = this.F.fill(0), X = this.X || (this.X = new Float64Array(nc));
    X.fill(0);
    let sv = 0;
    for (const [k, p] of Object.entries(this.pat)) {
      const v = this.psi[k] * SV;
      if (!(v > 0)) continue;
      sv += v;
      for (let I = 0; I < nc; I++) { S[I] += v * p.S[I]; K[I] += v * p.K[I]; X[I] += v * p.x[I]; }
      for (let t = 0; t < F.length; t++) F[t] += v * p.F[t];
    }
    let gy = 0;
    const oc = c.ocean;
    if (oc && oc.grid === cg && C.GYRE > 0) {
      let ps = 0;
      for (let I = 0; I < nc; I += 7) ps += oc.psi[I];
      const gk = this.key + '|' + ps;
      if (gk !== this.gyreKey) { this.gyreF = yield* this.gyreSteps(oc.psi); this.gyreKey = gk; }
      const Fg = this.gyreF;
      for (let t = 0; t < F.length; t++) { F[t] += C.GYRE * Fg[t]; gy = Math.max(gy, Math.abs(Fg[t])); }
    }
    // The exchange: λA, by the year's share under sea ice (the sea's own, restricted).
    const f6 = c.scratch.f6, ice = new Float64Array(nc), sw = new Float64Array(nc);
    for (let i = 0; i < n; i++) f6[i] = c.landMask[i] ? 0 : c.snowAnn[i];
    restrict(c.T, f6, ice);
    for (let i = 0; i < n; i++) f6[i] = c.landMask[i] ? 0 : 1;
    restrict(c.T, f6, sw);
    for (let I = 0; I < nc; I++) {
      const si = sw[I] > 1e-6 ? Math.min(1, ice[I] / sw[I]) : 0;
      this.lam[I] = this.sea[I] ? C.LAMBDA * (1 - (1 - C.ICE) * si) * cg.area[I] * R * R : 0;
    }
    // Sweep orders: down the overturning's potential, and by longitude both ways (the gyres' loops).
    const idx = [];
    for (let I = 0; I < nc; I++) if (this.sea[I]) idx.push(I);
    const down = Int32Array.from(idx.sort((a, b) => X[b] - X[a]));
    const keep = o => o.filter(I => this.sea[I]);
    this.orders = [down, keep(this.byLon[0]), down, keep(this.byLon[1])];
    this.flowSea = this.sea;   // the sea these flows balance on, until the next flows (a new sea swaps in at a cycle's start, its flows at its end)
    this.on = sv > 0 || gy > 0;
    this.stats.sv = sv / SV; this.stats.gyre = gy / SV;
  }

  /**
   * The annual mean's terms from its last state T (coarse, °C), in the solve's units: the heat the
   * water gives each cell, λA(θ − T), linearized about T, as `diag` and `rhs`; the water's
   * temperature `theta` carried down the flow from T as it stands. False when off.
   */
  terms(T) {
    const c = this.c, cg = c.coarse, nc = cg.n, C = SEAHEAT, rc = C.RHO_CP, R2 = R * R, sea = this.flowSea, F = this.F, lam = this.lam;
    const diag = this.diag.fill(0), rhs = this.rhs.fill(0), th = this.theta;
    if (!this.on) return false;
    const out = this.outF || (this.outF = new Float64Array(nc));
    for (let I = 0; I < nc; I++) {
      if (!sea[I]) continue;
      let o = this.K[I];
      for (let t = cg.nbrOff[I]; t < cg.nbrOff[I + 1]; t++) if (F[t] > 0) o += F[t];
      out[I] = rc * o;
      if (!this.warm) th[I] = Math.max(C.THETA_F, T[I]);
    }
    this.warm = true;
    let s = 0;
    for (; s < C.SWEEPS; s++) {
      let moved = 0, ks = 0, kt = 0;
      for (const I of this.orders[s & 3]) {
        let a = rc * this.S[I] * this.deep;
        for (let t = cg.nbrOff[I]; t < cg.nbrOff[I + 1]; t++) if (F[t] < 0) a -= rc * F[t] * th[cg.nbr[t]];
        const q = Math.min(C.THETA_MAX, Math.max(C.THETA_F, (a + lam[I] * T[I]) / (out[I] + lam[I] || 1)));
        moved = Math.max(moved, Math.abs(q - th[I]));
        th[I] = q;
        if (this.K[I] > 0) { ks += this.K[I]; kt += this.K[I] * q; }
      }
      if (ks > 0) this.deep = kt / ks;
      if (moved < C.TOL) { s++; break; }
    }
    this.stats.sweeps = s;
    // The heat each cell gets is the water's own budget, what flows in less what flows out (so the
    // sum is exactly nothing: λA(θ − T) where θ is above freezing; where it has cooled to freezing,
    // what it brought down to freezing, not λA(θ − T) against colder air above the ice).
    for (let I = 0; I < nc; I++) {
      if (!sea[I]) continue;
      let a = rc * this.S[I] * this.deep;
      for (let t = cg.nbrOff[I]; t < cg.nbrOff[I + 1]; t++) if (F[t] < 0) a -= rc * F[t] * th[cg.nbr[t]];
      const la = lam[I], b = out[I], Q = a - b * th[I], free = th[I] > C.THETA_F;
      const d = free ? la * b / (b + la || 1) : 0;
      diag[I] = d / R2; rhs[I] = (Q + d * T[I]) / R2;
    }
    return true;
  }

  /** The northward heat the water carries across each latitude in `lats` (degrees), PW, as last solved. */
  transport(lats) {
    const cg = this.c.coarse, nc = cg.n, C = SEAHEAT, th = this.theta, deep = this.deep, sea = this.flowSea || this.sea;
    return lats.map(la => {
      const z0 = Math.sin(la * Math.PI / 180);
      let h = 0;
      for (let I = 0; I < nc; I++) {
        if (!sea[I] || cg.pos[3 * I + 2] >= z0) continue;
        for (let t = cg.nbrOff[I]; t < cg.nbrOff[I + 1]; t++) {
          const J = cg.nbr[t], f = this.F[t];
          if (!sea[J] || cg.pos[3 * J + 2] < z0) continue;
          h += f * ((f > 0 ? th[I] : th[J]) - deep);   // from south (I) to north (J); the deep return at the sinking's temperature
        }
      }
      return h * C.RHO_CP / 1e15;
    });
  }
}
