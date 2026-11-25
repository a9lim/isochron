// Pathogens (batch 4a; docs/MODEL.md, docs/ROADMAP.md): what people catch from their animals and from
// each other. Marks: standard, synthesis, speculation; the whole is synthesis and its values speculation,
// the sources from memory.
//
// A table like the crops' packages (a9): each pathogen is born at an origin, where people meet animals
// (their herds, the wild), with traits drawn broadly at its birth: how well it passes (R0), how long a case
// is infectious (D, a week to a chronic infection's years), how fast immunity wanes (ω), how many of the
// never-exposed it kills (its virulence v), how much of its passing needs a vector that wants warm, wet
// months (x), and how strongly it lives on outside people (its reservoir r) in a host, the herds or the
// wild by what its origin had, whose range is a climate envelope about its origin's (as a crop package's
// suitability is). Nothing names a kind: a crowd disease, a plague and a fever are regions of these
// traits, and the world selects which persist (the stages from an animal's pathogen to a human one:
// Wolfe, Dunavan and Diamond 2007, from memory). Most die out at once.
//
//   passing      at place c, R = R0 κ_c [(1 − x) + x vec_c]: κ the crowding, (ρ/(ρ + RHO_PATH))^Q_PATH ×
//                (1 + K_CITY u), ρ the people a km² and u the city's share of its food (synthesis); vec the
//                vectors' climate (People's H.path, warmth × wetness).
//   immunity     each place's susceptible share s of each pathogen. Births come in susceptible (less the
//                vaccinated, cov), immunity wanes at ω, infection takes them:
//                ds/dt = b (1 − cov − s) + ω (1 − s) − λ Z(R s) s,
//                Z(y) an epidemic's final size at reproduction y, z = 1 − e^{−y z} (Kermack and McKendrick,
//                standard), λ the epidemics' rate. Backward Euler over the step (the steps run from days to
//                2,000 years), exact where λ is none; the step's infections are backward Euler's own flux.
//   persistence  at the endemic balance a pool of N hosts holds I* = N (b + ω)(1 − 1/R) D infectious
//                (standard), and the pathogen persists as p = σ(ln(I*/I_MIN)/W_P): I_MIN from measles'
//                critical community size (~2.5–5 × 10⁵: Bartlett 1957, from memory), so an acute disease
//                needs a great connected people and a chronic one (D long) or one whose immunity wanes
//                persists among fewer. The pool is a trading market (src/engine/routes.js, one with fields)
//                with its trade partners' people by the kernel (faster travel merges the pools: Cliff and
//                Haggett on Iceland's measles, from memory); elsewhere a place and its land neighbours (a
//                band's contacts reach no further). Persisting, λ = Λ_END: s settles near 1/R, children
//                carry it, and its deaths are b (1 − 1/R) v.
//   introduction where it doesn't persist, epidemics come with infectious travellers: λ = Λ_I × Σ contact ×
//                prevalence (infections a person a year × D) over the trade's partners (contact as
//                knowledge's copying reads it, Routes.part, × e^{−T/(D G_TRANS)}: a traveller must arrive while
//                the infection lasts, T the journey by sail or steam and G_TRANS the generations a ship's company
//                or a caravan carries on the way, so an acute disease crosses an ocean only as ships grow fast:
//                Cliff and Haggett's measles reaching the islands with steam, from memory; the partners' hosts in
//                persistence alike) and the land neighbours in other pools (K_LAND
//                κ κ' over the neighbours), the reservoir's spillover Λ_R r env host, and its origin's pool
//                at its birth. Where a pool's introductions are rarer than one a step, each step draws
//                whether one came (a seeded stream, people:pathogens), and an epidemic of final size Z
//                strikes at once; otherwise they're the mean. So plagues come as events, and endemic
//                diseases as rates.
//   naive        each place's share e that has had it (or been vaccinated): births come in naive but for the
//                vaccinated, infection takes the naive at the susceptibles' rate,
//                de/dt = b (cov − e) + λ Z(R s) (1 − e),
//                and the naive are always among the susceptibles (1 − e ≤ s; the rest of them are those
//                whose immunity waned).
//   deaths       v (1 + K_COLL a) a first case and K_RE of that a case again (partial immunity: a waning
//                pathogen's reinfections are milder; synthesis), a the share sick at once (virgin-soil
//                epidemics' excess: the sick nurse the sick, the fields go untended; Crosby, from memory), at
//                most every case; a rate over the step, × medicine. People's `demography` already stood for the
//                diseases a people usually bears (up to F_DIS of its deaths, the well-fed floor's and the
//                density's), so the pathogens' deaths take the place of each place's usual, its own pathogens'
//                deaths over T_USUAL, by a soft maximum: they move the people where they pass it (a plague, a
//                people meeting diseases it never had), and a people whose diseases settle in recovers as its
//                usual rises to meet them. The elites die of it as the commoners do.
//   vaccination  cov = V_COV × medicine's reach (People.modern) × e^{−ω/Ω_VAC}: lasting immunity can be
//                given. Past 1 − 1/R wherever it passes, a pathogen goes (eradication).
//   carried      migrants carry their susceptibility as they carry who they are (People.diffuse, flee,
//                voyages): settlers from where a pathogen is endemic come immune, and those they meet don't.
//   births       a hazard a year at each place, H_SPILL × N × (its herds + K_WILD × its wild hosts) × κ, the
//                wild hosts W_WILD + (1 − W_WILD) vec (the warm, wet tropics hold the most: the pathogens'
//                latitudinal gradient, standard). One that can't pass at its origin (R ≤ 1) with no
//                reservoir there is stillborn. The table holds P_MAX; one with no case for T_IDLE is gone, and
//                when it's full a new one takes the least active's slot if that one held under N_EVICT cases a year.
import { stream } from '../rng.js';

// The final size, tabulated: Z(y) for y from 1 to ZX in steps of (ZX − 1)/ZN, the threshold's series below 1 + ZS.
const ZN = 1 << 15, ZX = 64, ZS = 0.01, ZT = new Float64Array(ZN + 1), ZI = ZN / (ZX - 1);
/** The positive root of z = 1 − e^{−y z} (y > 1; none at or below 1), by Newton from 1 (f is convex: monotone). */
export function finalSizeExact(y) {
  if (!(y > 1)) return 0;
  let z = 1;
  for (let i = 0; i < 200; i++) {
    const e = Math.exp(-y * z), zn = z - (z - 1 + e) / (1 - y * e);
    if (!(Math.abs(zn - z) > 1e-15)) return zn;
    z = zn;
  }
  return z;
}
for (let k = 1; k <= ZN; k++) ZT[k] = finalSizeExact(1 + k / ZI);
/** An epidemic's final size at reproduction y: the share of the susceptibles it infects. */
export function finalSize(y) {
  if (!(y > 1)) return 0;
  if (y >= ZX) return 1 - Math.exp(-y);
  const d = y - 1;
  if (d < ZS) return d * (2 - d * (8 / 3 - d * 28 / 9));   // the threshold's series
  const x = d * ZI, k = x | 0, f = x - k;
  return ZT[k] + f * (ZT[k + 1] - ZT[k]);
}
/** dZ/dy at y, from z (implicit differentiation: z(1 − z)/(1 − y(1 − z)); 2 at the threshold). */
function dFinal(y, z) {
  if (!(z > 1e-6)) return y > 1 ? 2 : 0;
  const d = 1 - y * (1 - z);
  return d > 1e-9 ? z * (1 - z) / d : 2;
}

/**
 * The susceptible share after a step dt: ds/dt = b (1 − cov − s) + ω (1 − s) − λ Z(R s) s. Exact where λ is
 * none or R ≤ 1 (linear), else backward Euler (g(s) = s − s0 − dt (…) is increasing, its root in [0, 1]:
 * Newton within a bracket).
 */
export function susceptible(s0, dt, b, om, cov, lam, R) {
  const a = b + om, src = b * (1 - cov) + om;
  if (!(lam > 0) || !(R > 1)) { if (!(a > 0)) return s0; const se = src / a; return se + (s0 - se) * Math.exp(-a * dt); }
  let lo = 0, hi = 1, s = Math.min(1, Math.max(0, s0));
  for (let i = 0; i < 30; i++) {
    const y = R * s, z = finalSize(y), g = s - s0 - dt * (src - a * s - lam * z * s);
    if (g > 0) hi = s; else lo = s;
    if (Math.abs(g) < 1e-12 || hi - lo < 1e-12) break;
    const gp = 1 + dt * (a + lam * (z + s * R * (y > 1 ? dFinal(y, z) : 0)));
    let sn = s - g / gp;
    if (!(sn > lo && sn < hi)) sn = 0.5 * (lo + hi);
    s = sn;
  }
  return s;
}

/** A pool's chance of keeping a pathogen circulating: σ(ln(I⋆ / I_MIN)/W_P), I⋆ = N (b + ω)(1 − 1/R) D its infectious at the endemic balance. */
export function persistence(N, b, om, R, D, P) {
  if (!(R > 1) || !(N > 0)) return 0;
  const I = N * (b + om) * (1 - 1 / R) * D, x = P.I_MIN / I;
  return 1 / (1 + (P.W_P === 0.5 ? x * x : Math.pow(x, 1 / P.W_P)));
}

const lnU = (r, a, b) => Math.exp(Math.log(a) + (Math.log(b) - Math.log(a)) * r.uniform());

export class Pathogens {
  /** For a People `pp` (src/engine/people.js). */
  constructor(pp) {
    this.pp = pp;
    const nL = pp.nL, K = pp.P.P_MAX;
    this.K = K;
    this.live = [];                              // the table's living pathogens, each with its slot
    this.past = [];                              // those gone (their traits and toll: the surveys')
    this.slots = new Array(K).fill(null);
    this.s = new Float64Array(K * nL).fill(1);   // each slot's susceptible share a place (slot-major: j nL + c)
    this.e = new Float64Array(K * nL);           // its share that has had it or been vaccinated (not naive)
    this.inf = new Float64Array(K * nL);         // its infections a person a year over the last step
    this.d = new Float64Array(nL);               // deaths a person a year, before medicine, over the step
    this.usual = new Float64Array(nL);           // each place's usual: its pathogens' deaths over T_USUAL (People's demography: what its deaths already stood for)
    this.dtLast = 0;
    this.kap = new Float64Array(nL); this.med = new Float64Array(nL); this.wild = new Float64Array(nL); this.anim = new Float64Array(nL); this.hz = new Float64Array(nL); this.lam = new Float64Array(nL); this.Rc = new Float64Array(nL);
    this.acc = 0;                                // the years owed (stepped every DT_PATH at least: their state moves over years)
    this.rng = stream(pp.planet.seed, 'people:pathogens');
    this.n = 0; this.born = 0; this.still = 0; this.full = 0; this.gone = 0;   // ids given, those that took hold, stillborn, with no slot, gone
    this.deaths = 0;                             // the step's deaths (people, before medicine)
    // Migrants' accumulators over a spread's substep (`flow`, `settle`).
    this.inN = new Float64Array(nL); this.outN = new Float64Array(nL); this.inS = new Float64Array(K * nL); this.inE = new Float64Array(K * nL);
    this.mark = new Uint8Array(nL); this.touched = new Int32Array(nL); this.nT = 0;
  }

  /** The herds' and the wild's host here (0–1) for a pathogen whose host is the herds by hw. */
  host(c, hw) { return hw * this.anim[c] + (1 - hw) * this.wild[c]; }
  /** A pathogen's host envelope at c: Gaussian in the climate about its origin's (CLIM_S × ENV_W). */
  env(q, c) {
    const x = this.pp.H.clim, S = this.pp.P.CLIM_S, w = this.pp.P.ENV_W;
    let d2 = 0;
    for (let k = 0; k < 4; k++) { const d = (x[4 * c + k] - q.clim[k]) / (S[k] * w); d2 += d * d; }
    return Math.exp(-0.5 * d2);
  }
  /** R at c, from its crowding. */
  R(q, c) { return q.R0 * this.kap[c] * (1 - q.x + q.x * this.pp.H.path[c]); }

  /** New pathogens over dt: spillovers where people meet animals, each with traits drawn at its birth. */
  births(dt, poolOf) {
    const pp = this.pp, P = pp.P, nL = pp.nL, N = pp.Ntot, hz = this.hz, r = this.rng;
    let Ht = 0;
    for (let c = 0; c < nL; c++) { const h = N[c] > 0 ? P.H_SPILL * N[c] * (this.anim[c] + P.K_WILD * this.wild[c]) * this.kap[c] : 0; hz[c] = h; Ht += h; }
    if (!(Ht > 0)) return;
    // How many over the step (Poisson, at most SPILL_MAX).
    const L = Math.exp(-Ht * dt);
    let n = 0;
    for (let p = r.uniform(); p > L && n < P.SPILL_MAX; p *= r.uniform()) n++;
    for (let i = 0; i < n; i++) {
      let x = r.uniform() * Ht, c = 0;
      for (; c < nL - 1; c++) { x -= hz[c]; if (x <= 0) break; }
      const an = this.anim[c], wl = P.K_WILD * this.wild[c];
      const q = {
        id: this.n++, t: pp.t, c, slot: -1,
        R0: Math.exp(Math.log(P.R0_MED) + P.R0_SIG * r.normal()), D: lnU(r, P.D_PATH[0], P.D_PATH[1]), om: lnU(r, P.OM_PATH[0], P.OM_PATH[1]),
        v: lnU(r, P.V_PATH[0], P.V_PATH[1]), x: r.uniform(), r: r.uniform() < P.F_RES ? lnU(r, P.R_RES, 1) : 0, hw: an + wl > 0 ? an / (an + wl) : 0,
        clim: Float32Array.from(pp.H.clim.subarray(4 * c, 4 * c + 4)), last: pp.t, cases: 0, dead: 0, peak: 0, rate: Infinity,
      };
      if (!(this.R(q, c) > 1) && !(q.r * this.host(c, q.hw) > P.R_EPS)) { this.still++; continue; }
      // A full table gives a new pathogen the slot of its least active, if that one's last step held fewer than N_EVICT cases a year.
      let j = this.slots.indexOf(null);
      if (j < 0) {
        let w = null;
        for (const x of this.live) if (!w || x.rate < w.rate) w = x;
        if (!w || !(w.rate < P.N_EVICT)) { this.full++; continue; }
        this.retire(w); j = w.slot;
      }
      q.slot = j; this.slots[j] = q; this.live.push(q); this.born++;
      q.seed = poolOf(c);   // its origin's pool has its first epidemic this step
    }
  }

  /**
   * The step (People.step, before births and deaths): new pathogens, then each one's susceptibles over dt,
   * its infections and its deaths; `d` the deaths a person a year (before medicine) for `demography`.
   * `rt` the routes (null before any market).
   */
  step(dt0, rt) {
    const pp = this.pp, P = pp.P, nL = pp.nL, N = pp.Ntot, H = pp.H, E = pp.E, b = pp.bR, u = pp.cityShare, kap = this.kap;
    // Every DT_PATH years at least (the takeoff's steps are days): the deaths' rate held between.
    this.acc += dt0;
    if (this.acc < P.DT_PATH) return;
    const dt = this.acc;
    this.acc = 0;
    // The usual moves toward the last step's deaths over T_USUAL (exact), before this step's are found.
    if (this.dtLast > 0) { const k = Math.exp(-this.dtLast / P.T_USUAL), d = this.d, us = this.usual; for (let c = 0; c < nL; c++) us[c] = d[c] + (us[c] - d[c]) * k; }
    this.dtLast = dt;
    for (let c = 0; c < nL; c++) {
      const rho = N[c] / H.area[c];
      kap[c] = N[c] > 0 ? Math.pow(rho / (rho + P.RHO_PATH), P.Q_PATH) * (1 + P.K_CITY * (u ? u[c] : 0)) : 0;
      this.wild[c] = P.W_WILD + (1 - P.W_WILD) * H.path[c];
      this.anim[c] = N[c] > 0 ? pp.animHere(c) : 0;
      this.med[c] = N[c] > 0 && pp.econ.on ? pp.modern(c) : 0;
    }
    // The pools: a trading market's people (src/engine/routes.js: those with fields, Routes.active), and
    // elsewhere each place with its land neighbours (a band's contacts reach no further).
    const routes = !!(rt && rt.part && rt.mN && rt.mF && rt.mN.length === rt.nm), mo = routes ? rt.marketOf : null, off = routes ? rt.nm : 0, np = off + nL;
    const pool = this.pool || (this.pool = new Int32Array(nL));
    for (let c = 0; c < nL; c++) pool[c] = routes && rt.mF[mo[c]] > 0 ? mo[c] : off + c;
    this.births(dt, c => pool[c]);
    this.d.fill(0); this.deaths = 0;
    if (!this.live.length) return;
    const sc = this.sc && this.sc.np === np ? this.sc : (this.sc = { np, N: new Float64Array(np), R: new Float64Array(np), B: new Float64Array(np), A: new Float64Array(np), L: new Float64Array(np), p: new Float64Array(np), pre: new Float64Array(np), ev: new Int8Array(np) });
    const pN = sc.N, pR = sc.R, pB = sc.B, pA = sc.A, pL = sc.L, pP = sc.p, pre = sc.pre, ev = sc.ev, lam = this.lam, s = this.s, e = this.e, inf = this.inf, r = this.rng;
    const KP = routes ? rt.C.K_PART : 0, NM = routes ? rt.C.N_MEET : 0, pk = routes ? rt.part.k : null, pw = routes ? rt.part.w : null, mN = routes ? rt.mN : null;
    // Each place's land neighbours in other pools, and their weights, K_LAND κ κ' over its neighbours (once a step).
    const nbO = this.nbO || (this.nbO = new Int32Array(nL + 1)), nbI = this.nbI || (this.nbI = new Int32Array(E.off[nL])), nbW = this.nbW || (this.nbW = new Float64Array(E.off[nL]));
    let m = 0;
    for (let c = 0; c < nL; c++) {
      nbO[c] = m;
      if (!(N[c] > 0)) continue;
      let dg = 0;
      for (let e = E.off[c]; e < E.off[c + 1]; e++) if (!E.hop[e]) dg++;
      for (let e = E.off[c]; e < E.off[c + 1]; e++) {
        if (E.hop[e]) continue;
        const nb = E.nb[e];
        if (!(N[nb] > 0) || pool[nb] === pool[c]) continue;
        nbI[m] = nb; nbW[m] = P.K_LAND * kap[c] * kap[nb] / dg; m++;
      }
    }
    nbO[nL] = m;
    // Each trading market's partners' journey (years): the route's cost by sail at a ship's speed, by steam where the
    // pair has industry (the trade's own layers, Routes.trade).
    const Tk = routes ? (this.Tk && this.Tk.length === rt.nm * KP ? this.Tk : (this.Tk = new Float64Array(rt.nm * KP))) : null;
    if (routes) {
      const C = rt.C, vS = C.V_SHIP * 86.4 * 365.25, vI = C.V_STEAM * 86.4 * 365.25, mS = rt.mS, RI = rt.R.I;
      for (let k = 0; k < rt.nm; k++) for (let i = 0; i < KP; i++) {
        const j = pk[k * KP + i];
        if (j < 0) break;
        const sI = RI && mS ? Math.max(mS[k], mS[j]) : 0;
        Tk[k * KP + i] = (1 - sI) * rt.cost(k, j, 'S') / vS + (sI > 0 ? sI * rt.cost(k, j, 'I') / vI : 0);
      }
    }
    const Rc = this.Rc, vec = H.path;
    for (const q of this.live) {
      const o = q.slot * nL, D = q.D, om = q.om, R0 = q.R0, x1 = 1 - q.x, x = q.x;
      pN.fill(0); pR.fill(0); pB.fill(0); pA.fill(0); pL.fill(0);
      for (let c = 0; c < nL; c++) {
        if (!(N[c] > 0)) continue;
        const k = pool[c], n = N[c], R = Rc[c] = R0 * kap[c] * (x1 + x * vec[c]);
        pN[k] += n; pR[k] += n * R; pB[k] += n * b[c]; pA[k] += n * inf[o + c];
      }
      // Each pool's persistence (its hosts in contact) and its partners' prevalence.
      for (let k = 0; k < np; k++) {
        if (!(pN[k] > 0)) { pP[k] = 0; pre[k] = 0; continue; }
        let Nc = pN[k], pr = 0;
        if (k < off) {
          for (let i = 0; i < KP; i++) {
            const j = pk[k * KP + i];
            if (j < 0) break;
            // A traveller must arrive while the infection lasts: e^{−T/(D G_TRANS)}, the party carrying G_TRANS generations.
            const w = pw[k * KP + i] * Math.exp(-Tk[k * KP + i] / (D * P.G_TRANS));
            Nc += w * (mN[j] + NM);
            if (pN[j] > 0) pr += w * pA[j] / pN[j] * D;
          }
        } else { const c = k - off; for (let e = E.off[c]; e < E.off[c + 1]; e++) if (!E.hop[e]) Nc += N[E.nb[e]]; }
        pP[k] = persistence(Nc, pB[k] / pN[k], om, pR[k] / pN[k], D, P); pre[k] = pr;
      }
      // Each place's introductions a year from outside its pool: its pool's partners, its land neighbours in
      // other pools, the reservoir.
      for (let c = 0; c < nL; c++) {
        if (!(N[c] > 0)) { lam[c] = 0; continue; }
        const k = pool[c];
        let ln = 0;
        for (let i = nbO[c]; i < nbO[c + 1]; i++) ln += nbW[i] * inf[o + nbI[i]];
        let l = P.L_INTRO * (pre[k] + ln * D);
        if (q.r > 0) { const hs = this.host(c, q.hw); if (hs > 0) l += P.L_RES * q.r * hs * this.env(q, c); }
        lam[c] = l; pL[k] += N[c] * l;
      }
      // Each pool's introductions as events (rarer than one a step) or as their mean.
      for (let k = 0; k < np; k++) {
        ev[k] = -1;
        if (!(pN[k] > 0)) continue;
        const le = (1 - pP[k]) * pL[k] / pN[k];
        if (k === q.seed) ev[k] = 1;
        else if (le * dt < 1) ev[k] = le > 0 && r.uniform() < 1 - Math.exp(-le * dt) ? 1 : 0;
      }
      q.seed = -1;
      // Each place's susceptibles over the step; its infections and deaths.
      let cases = 0, dead = 0;
      for (let c = 0; c < nL; c++) {
        if (!(N[c] > 0)) { inf[o + c] = 0; continue; }
        const k = pool[c], R = Rc[c], p = pP[k], s0 = s[o + c], bc = b[c];
        const lmf = p * P.L_END + (ev[k] < 0 ? (1 - p) * lam[c] : 0), cov = P.V_COV * this.med[c] * Math.exp(-om / P.OM_VAC);
        // The step's infections are backward Euler's own flux, dt λ Z(R s₁) s₁ (vaccination isn't infection),
        // the naive's dt λ Z (1 − e₁) of them; the never-exposed share by backward Euler at the same rate.
        let s1 = susceptible(s0, dt, bc, om, cov, lmf, R), a;
        const lz = lmf > 0 && R > 1 ? lmf * finalSize(R * s1) : 0;
        let e1 = (e[o + c] + dt * (bc * cov + lz)) / (1 + dt * (bc + lz));
        let I = dt * lz * s1, In = dt * lz * (1 - e1);
        if (ev[k] === 1 && R * s1 > 1) { const z = finalSize(R * s1), x = s1 * z, xn = Math.max(0, 1 - e1) * z; s1 -= x; e1 += xn; I += x; In += xn; a = x; } else a = I / Math.max(1, dt);
        if (!(I > 0)) I = 0;
        In = Math.min(Math.max(0, In), I);
        e1 = Math.min(1, Math.max(e1, 1 - s1));
        s[o + c] = s1; e[o + c] = e1; inf[o + c] = I / dt;
        const dd = Math.min(I, q.v * (1 + P.K_COLL * Math.min(1, a)) * (In + P.K_RE * (I - In)));
        this.d[c] += dd / dt; cases += I * N[c]; dead += dd * N[c];
      }
      q.cases += cases; q.dead += dead; this.deaths += dead; q.rate = cases / dt;
      if (q.rate > q.peak) q.peak = q.rate;
      if (cases >= 1) q.last = pp.t + dt;
    }
    // Those with no case for T_IDLE are gone; their slots are cleared for the next.
    for (let i = this.live.length - 1; i >= 0; i--) if (pp.t + dt - this.live[i].last > P.T_IDLE) this.retire(this.live[i]);
  }

  /** A pathogen gone: its slot cleared for the next (its traits and toll kept for the surveys). */
  retire(q) {
    const nL = this.pp.nL, o = q.slot * nL;
    this.s.fill(1, o, o + nL); this.e.fill(0, o, o + nL); this.inf.fill(0, o, o + nL);
    this.slots[q.slot] = null; this.live.splice(this.live.indexOf(q), 1); this.gone++; this.past.push(q);
  }

  /** n migrants from a into b within a spread's substep (People.diffuse): their susceptibility, settled at its end. */
  flow(a, b, n) {
    if (!this.live.length) return;
    const nL = this.pp.nL;
    if (!this.mark[b]) { this.mark[b] = 1; this.touched[this.nT++] = b; }
    if (!this.mark[a]) { this.mark[a] = 1; this.touched[this.nT++] = a; }
    this.inN[b] += n; this.outN[a] += n;
    for (const q of this.live) { const o = q.slot * nL; this.inS[o + b] += n * this.s[o + a]; this.inE[o + b] += n * this.e[o + a]; }
  }
  /** The substep's migrants mixed in, against the people N before it: s = (s (N − out) + in s')/(N − out + in), e alike. */
  settle(N) {
    if (!this.nT) return;
    const nL = this.pp.nL;
    for (let i = 0; i < this.nT; i++) {
      const c = this.touched[i], n = this.inN[c];
      if (n > 0) {
        const st = Math.max(0, N[c] - this.outN[c]);
        for (const q of this.live) {
          const o = q.slot * nL + c;
          this.s[o] = (this.s[o] * st + this.inS[o]) / (st + n); this.e[o] = (this.e[o] * st + this.inE[o]) / (st + n);
          this.inS[o] = 0; this.inE[o] = 0;
        }
      }
      this.inN[c] = 0; this.outN[c] = 0; this.mark[c] = 0;
    }
    this.nT = 0;
  }
  /** n people from a into b, holding Nb, at once (refugees, a voyage's founders). */
  mix(a, b, n, Nb) {
    if (!this.live.length || !(n > 0)) return;
    const nL = this.pp.nL, m = Math.max(0, Nb);
    for (const q of this.live) {
      const o = q.slot * nL;
      this.s[o + b] = (this.s[o + b] * m + n * this.s[o + a]) / (m + n); this.e[o + b] = (this.e[o + b] * m + n * this.e[o + a]) / (m + n);
    }
  }

  /** The pathogens circulating: those with a case in the last step. */
  circulating() { let n = 0; for (const q of this.live) if (q.last > this.pp.t - 1e-9) n++; return n; }
}
