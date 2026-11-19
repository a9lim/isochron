// Peoples (batch 1c, landing 4; docs/people.md, "Peoples"): who people are, beside what they know.
// Marks as in the plan: standard, synthesis, speculation.
//
// Each cell's identity is a few weighted points ("atoms") in a continuous space of D_ID dimensions,
// kept by way of life: foragers, herders, fishers, farmers and city people, two atoms each (Barth's
// groups that last side by side by living differently, 1969, from memory). So a continuum (atoms
// varying smoothly over the land: a dialect chain) and a mosaic (several atoms in one cell: herders
// among farmers, a city's quarters) both hold. A people isn't an object: it's a region where atoms
// are close, and a boundary is where the field tears. The atoms are a numerical sampling of each
// cell's distribution, so their discreteness is resolution, not a claim about peoples (synthesis).
//
//   drift       each atom random-walks, ID_SIG2 a dimension a year, so two peoples parted drift
//               apart as E d² = 2 D_ID σ² t: a language apart (d 1) in ~1.25 kyr (Romance's), a family
//               (d ~2.3) in ~6.5 kyr (Bantu's, Austronesian's; both from memory).
//   contact     each atom is pulled toward the atoms its people meet, at R_CONT a year × g(d), g =
//               G_FLOOR + (1 − G_FLOOR)/(1 + (d/D_CONT)²): dialects level fast, unlike languages
//               converge slowly (a Sprachbund: borrowing, intermarriage), never not at all (the
//               floor), so neighbours settle a dialect or a language apart and peoples a family apart
//               only where contact thins (a sea, a desert, sparse land: synthesis). Without the floor
//               a pair once past D_CONT drifted apart for good, as √t, and the foragers' 100 kyr
//               shattered into isolates ~9 apart (falling as (d/D)⁴, faster still). Its people meet their own cell's (all its ways)
//               and their ring's, as far as identity's contact length ℓ_id reaches (the ring's share
//               1 − e^{−(ℓ_id/dx)²}, by the ring's people and the land's ease; across a strait as
//               e^{−km/ℓ_id}); ℓ_id grows with learning past writing's (Z_ID0), e-fold per Z_IDL
//               (a band's marriages and a village's, then writing's, print's and broadcast's reach:
//               speculation). Past it the media pull every atom toward the
//               world's mean, R_MEDIA × the share of the world ℓ_id spans (1 − e^{−(ℓ_id/L_WORLD)²}),
//               whatever the distance: the world blends once learning spans it (a9). With drift, the
//               nearest-neighbour pull is a stepping-stone model, whose identity distance grows as the
//               log of the distance between places in two dimensions (Séguy's curve for dialects,
//               1971; Nerbonne; from memory).
//   ways        each cell's ways of life follow its food (`People.capAt`: the land's foraging or
//               herding, the sea's, the fields', what energy buys, and the cities' share), and people
//               change their way as the mix changes and keep who they are (foragers who farm stay
//               themselves; the farmers' larger numbers then win the fields by conformity).
//   migrants    carry their atoms by way of life (`carry`, from the spread and the voyages), so
//               farming's dispersals carry language families.
//   conformity  within a way of life only (Boyd and Richerson's conformist transmission, standard):
//               the majority's share p rises as dp/dt = r p(1 − p)(2p − 1), stepped exactly
//               (`conform`). Across ways there is only contact's slow pull, so herders beside
//               farmers stay a people of their own while two farming peoples sharing fields merge.
//               Contact itself runs at X_WAY between two ways of life (people meet across them, and
//               trade, but seldom marry: Barth), whole within one, between foragers and fishers (both
//               forage: a coast's people aren't another people), and with the cities, where ways meet.
//   merging     a way's two atoms merge once within D_MERGE (one dialect), and when a third arrives
//               the nearest pair merges (`add`), keeping people and their mean identity.
//
// Read back: learning's copying by how alike two places are (texts need a shared language: each
// cell's learned identity its city's main atom, else its main atom, once learning is written; `copyW`), and a common
// language in trade's kernel (`tradeW`; standard in gravity models of trade, its size from memory).
// Drawn: the tears (`tears`), lines where adjacent cells' identities differ (an energy distance),
// heavier the further apart; counted: the effective number of peoples (`count`: Leinster and
// Cobbold's similarity-sensitive Hill number of order 2, 2012, from memory).
import { stream } from '../rng.js';

export const D_ID = 8, WAYS = 5, SLOTS = 2, PER = WAYS * SLOTS;   // dimensions; ways of life; atoms a way; atoms a cell
export const WAY = ['foragers', 'herders', 'fishers', 'farmers', 'city'];

/**
 * Conformity's closed form: the majority's share after dt at rate r, dp/dt = r p(1 − p)(2p − 1).
 * With s = 2p − 1, 4s²/(1 − s²) = Q grows as e^{r t}, so s² = Q/(4 + Q) (standard algebra).
 */
export function conform(p, r, dt) {
  const s0 = 2 * p - 1;
  if (s0 === 0 || !(r * dt > 0) || !(p > 0 && p < 1)) return p;
  const lq = Math.log(4 * s0 * s0 / (1 - s0 * s0)) + r * dt;
  const s2 = lq > 40 ? 1 : Math.exp(lq) / (4 + Math.exp(lq));
  return 0.5 * (1 + Math.sign(s0) * Math.sqrt(s2));
}

/** Contact's rate's falloff with identity distance d (squared: d2). */
export const pull = (d2, D, g0 = 0) => g0 + (1 - g0) / (1 + d2 / (D * D));
/**
 * Contact between two ways of life: whole within one, between foragers and fishers (both forage), and with
 * the cities (where ways meet); X_WAY between two others (Barth's boundary).
 */
export const across = (a, b, x) => (a === b || a === 4 || b === 4 || a + b === 2 && a !== 1 ? 1 : x);

export class Peoples {
  /** For a People `pp` (src/engine/people.js): its cells, land graph and parameters. */
  constructor(pp) {
    this.pp = pp;
    const nL = pp.nL;
    this.W = new Float64Array(PER * nL);            // people an atom
    this.X = new Float64Array(PER * nL * D_ID);     // an atom's identity
    this.T = new Float64Array(nL);                  // people a cell, as its atoms hold them
    this.Xn = new Float64Array(PER * nL * D_ID);    // contact's scratch
    this.rate = new Float64Array(PER * nL);           // each atom's pull this step (/yr): drift's spread over a step under it
    this.occ = new Int32Array(PER * nL); this.nOcc = new Uint8Array(nL);   // each cell's atoms with people
    this.lead = new Int32Array(nL).fill(-1);        // each cell's learned identity (an atom)
    this.mu = new Float64Array(D_ID);               // the world's mean identity
    this.rng = stream(pp.planet.seed, 'people:peoples');
    this.nPeoples = 0;
  }

  /** The first people: one atom at the space's origin, foragers. */
  seed(cells) {
    const N = this.pp.Ntot;
    for (const c of cells) { this.W[c * PER] = N[c]; this.T[c] = N[c]; }
  }

  d2(a, b) {
    const X = this.X, oa = a * D_ID, ob = b * D_ID;
    let s = 0;
    for (let i = 0; i < D_ID; i++) { const x = X[oa + i] - X[ob + i]; s += x * x; }
    return s;
  }
  copy(s, t) { this.X.copyWithin(t * D_ID, s * D_ID, (s + 1) * D_ID); }
  /** Atom t takes w people at atom s's identity: the people-weighted mean. */
  merge(t, w, s) {
    const W = this.W, X = this.X, f = w / (W[t] + w), ot = t * D_ID, os = s * D_ID;
    for (let i = 0; i < D_ID; i++) X[ot + i] += f * (X[os + i] - X[ot + i]);
    W[t] += w;
  }
  /** w people at atom s's identity into cell c's way k: an empty slot, else the nearest (or, past both, the nearest pair merges). */
  add(c, k, w, s) {
    if (!(w > 0)) return;
    const W = this.W, a = c * PER + SLOTS * k, b = a + 1, M2 = this.pp.P.D_MERGE ** 2;
    const wa = W[a], wb = W[b];
    if (!(wa > 0)) { if (wb > 0 && this.d2(b, s) < M2) this.merge(b, w, s); else { W[a] = w; this.copy(s, a); } return; }
    if (!(wb > 0)) { if (this.d2(a, s) < M2) this.merge(a, w, s); else { W[b] = w; this.copy(s, b); } return; }
    const da = this.d2(a, s), db = this.d2(b, s);
    if (Math.min(da, db) <= this.d2(a, b)) { this.merge(da <= db ? a : b, w, s); return; }
    this.merge(a, wb, b); W[b] = w; this.copy(s, b);
  }
  /** q migrants from cell a to cell b, each way of life's atoms in their share (the spread, the voyages). */
  carry(a, b, q) {
    const W = this.W, oa = a * PER, s = this.T[a];
    if (!(s > 0) || !(q > 0)) return;
    const f = Math.min(1, q / s);
    let moved = 0;
    for (let k = 0; k < PER; k++) {
      const w = W[oa + k];
      if (!(w > 0)) continue;
      const m = w * f;
      W[oa + k] = w - m; moved += m;
      this.add(b, k >> 1, m, oa + k);
    }
    this.T[a] -= moved; this.T[b] += moved;
  }
  /** Whether migrants into c are carried: always into a cell with no atoms, else past ID_EPS of its people. */
  carries(c, q) { return q > this.pp.P.ID_EPS * this.T[c] || !(this.T[c] > 0); }

  /** Identity's contact length at learning z (km): ID_L0, then e-fold per Z_IDL past Z_ID0, to ID_LMAX. */
  idL(z) { const P = this.pp.P, x = P.ID_L0 * Math.exp(Math.min(Math.max(0, z - P.Z_ID0) / P.Z_IDL, 60)); return x / Math.pow(1 + Math.pow(x / P.ID_LMAX, 4), 0.25); }

  /**
   * The step, every DT_ID years at least (identity moves over generations; the takeoff's steps are
   * days): each cell's atoms to its people; ways of life to its food; conformity; contact and the
   * media; drift; merging. Each part is exact over a long step.
   */
  step(dt) {
    this.owed = (this.owed || 0) + dt;
    if (this.owed < this.pp.P.DT_ID) return;
    const due = this.owed;
    this.owed = 0;
    this.advance(due);
  }
  advance(dt) {
    const pp = this.pp, P = pp.P, nL = pp.nL, N = pp.Ntot, E = pp.E, W = this.W, X = this.X, T = this.T;
    // The people as the step left them: each cell's atoms scaled to its people (births, deaths and
    // migrants not carried scale every atom alike); a cell peopled with no atoms takes its most
    // peopled neighbour's main atom.
    for (let c = 0; c < nL; c++) {
      const o = c * PER;
      if (!(N[c] > 0)) { if (T[c] !== 0) { W.fill(0, o, o + PER); T[c] = 0; } continue; }
      let s = 0;
      for (let k = 0; k < PER; k++) s += W[o + k];
      if (s > 0) { const f = N[c] / s; for (let k = 0; k < PER; k++) W[o + k] *= f; }
      else {
        let best = -1, bn = 0;
        for (let e = E.off[c]; e < E.off[c + 1]; e++) { const d = E.nb[e]; if (T[d] > 0 && N[d] > bn) { bn = N[d]; best = d; } }
        if (best >= 0) { const sl = this.main(best); W[o + (sl - best * PER)] = N[c]; this.copy(sl, o + (sl - best * PER)); }
        else W[o] = N[c];
      }
      T[c] = N[c];
    }
    // Ways of life: each cell's people shared by its food (`People.capAt`) and its city's share;
    // those whose way shrinks take up the ways that grow, keeping who they are.
    const wol = pp.wol, u = pp.cityShare, tgt = [0, 0, 0, 0, 0], cur = [0, 0, 0, 0, 0];
    for (let c = 0; c < nL; c++) {
      if (!(N[c] > 0)) continue;
      const o = c * PER, f = 5 * c;
      let tot = 0;
      for (let k = 0; k < 5; k++) tot += wol[f + k];
      if (!(tot > 0)) continue;
      const uc = u ? u[c] : 0;
      for (let k = 0; k < 4; k++) tgt[k] = N[c] * (1 - uc) * wol[f + k] / tot;
      tgt[4] = N[c] * (uc + (1 - uc) * wol[f + 4] / tot);
      let def = 0;
      for (let k = 0; k < WAYS; k++) { cur[k] = W[o + 2 * k] + W[o + 2 * k + 1]; def += Math.max(0, tgt[k] - cur[k]); }
      if (!(def > 1e-9 * N[c])) continue;
      for (let j = 0; j < WAYS; j++) {
        const give = cur[j] - tgt[j];
        if (!(give > 1e-12 * N[c])) continue;
        const fr = give / cur[j];
        for (let sl = o + 2 * j; sl < o + 2 * j + 2; sl++) {
          const w = W[sl];
          if (!(w > 0)) continue;
          const m = w * fr;
          W[sl] = w - m;
          for (let k = 0; k < WAYS; k++) { const dk = tgt[k] - cur[k]; if (dk > 0) this.add(c, k, m * dk / def, sl); }
        }
      }
    }
    // Conformity within each way: its minority shifts to its majority, exactly.
    const tiny = 1e-9;
    for (let c = 0; c < nL; c++) {
      if (!(N[c] > 0)) continue;
      for (let k = 0; k < WAYS; k++) {
        const a = c * PER + 2 * k, b = a + 1, wa = W[a], wb = W[b];
        if (!(wa > 0) || !(wb > 0)) continue;
        const p = conform(wa / (wa + wb), P.R_CONF, dt), n = wa + wb;
        if (p > 1 - tiny) { W[a] = n; W[b] = 0; } else if (p < tiny) { W[a] = 0; W[b] = n; } else { W[a] = p * n; W[b] = (1 - p) * n; }
      }
    }
    // Each cell's atoms with people, and the world's mean identity.
    const occ = this.occ, nOcc = this.nOcc, mu = this.mu;
    mu.fill(0);
    let all = 0;
    for (let c = 0; c < nL; c++) {
      let k = 0;
      const o = c * PER;
      if (N[c] > 0) for (let s = o; s < o + PER; s++) if (W[s] > 1e-12 * N[c]) { occ[o + k++] = s; all += W[s]; for (let i = 0; i < D_ID; i++) mu[i] += W[s] * X[s * D_ID + i]; }
      nOcc[c] = k;
    }
    if (all > 0) for (let i = 0; i < D_ID; i++) mu[i] /= all;
    // Contact, each atom toward those its people meet (as the step found them), and the media.
    const Xn = this.Xn, dx = pp.dx || 120, Dc = P.D_CONT, g0 = P.G_FLOOR, zl = pp.zl, xw = P.X_WAY;
    for (let c = 0; c < nL; c++) {
      const no = nOcc[c];
      if (!no) continue;
      const o = c * PER, l = this.idL(zl[c]), kap = 1 - Math.exp(-(l / dx) * (l / dx)), gam = P.R_MEDIA * (1 - Math.exp(-(l / P.L_WORLD) * (l / P.L_WORLD)));
      // The ring's share of contact, by its people and the land's ease (a strait's by e^{−km/ℓ_id}).
      // (Averaged over its land edges, the crossings added: averaged over all, a coast's many crossings had
      // thinned its contact with the land beside it, and every coastal cell drifted a family from the next.)
      let ring = 0, deg = 0;
      for (let e = E.off[c]; e < E.off[c + 1]; e++) { const d = E.nb[e]; if (!E.hop[e]) deg++; if (nOcc[d]) ring += N[d] * (E.hop[e] ? Math.exp(-E.km[e] / l) : E.slope[e]); }
      ring /= Math.max(1, deg);
      const kr = ring > 0 ? kap * ring / (ring + N[c]) : 0, ko = 1 - kr;
      for (let q = 0; q < no; q++) {
        const a = occ[o + q], oa = a * D_ID;
        let r = 0;
        const t = this.tgt || (this.tgt = new Float64Array(D_ID));
        t.fill(0);
        const wa = (a - o) >> 1;
        for (let qq = 0; qq < no; qq++) {
          const b = occ[o + qq];
          if (b === a) continue;
          const w = ko * W[b] / N[c] * pull(this.d2(a, b), Dc, g0) * across(wa, (b - o) >> 1, xw);
          r += w; for (let i = 0; i < D_ID; i++) t[i] += w * X[b * D_ID + i];
        }
        if (kr > 0) for (let e = E.off[c]; e < E.off[c + 1]; e++) {
          const d = E.nb[e], nd = nOcc[d];
          if (!nd) continue;
          const ew = kr * N[d] * (E.hop[e] ? Math.exp(-E.km[e] / l) : E.slope[e]) / Math.max(1, deg) / ring / N[d];
          if (!(ew > 0)) continue;
          for (let qq = 0; qq < nd; qq++) {
            const b = occ[d * PER + qq];
            if (W[b] < 0.05 * N[d]) continue;   // a neighbour's few (the cost: ~10 atoms against ~60 a cell)
            const w = ew * W[b] * pull(this.d2(a, b), Dc, g0) * across(wa, (b - d * PER) >> 1, xw);
            r += w; for (let i = 0; i < D_ID; i++) t[i] += w * X[b * D_ID + i];
          }
        }
        // Toward the weighted mean of those met at R_CONT × their weight, and the world's at the media's rate.
        const rc = P.R_CONT * r, rt = rc + gam;
        this.rate[a] = rt;
        if (!(rt > 0)) { for (let i = 0; i < D_ID; i++) Xn[oa + i] = X[oa + i]; continue; }
        const k = 1 - Math.exp(-rt * dt);
        for (let i = 0; i < D_ID; i++) {
          const target = ((r > 0 ? P.R_CONT * t[i] : 0) + gam * mu[i]) / rt;
          Xn[oa + i] = X[oa + i] + (target - X[oa + i]) * k;
        }
      }
    }
    // Drift: each atom's own random walk, its spread over the step what the pull lets accumulate (an
    // Ornstein–Uhlenbeck process's exact step: σ²(1 − e^{−2r dt})/2r a dimension; σ² dt unpulled). Added
    // whole after the pull, a 500-year step's walk had left neighbours a step's kick apart however
    // strongly they were held.
    const rng = this.rng, rate = this.rate;
    for (let c = 0; c < nL; c++) for (let q = 0; q < nOcc[c]; q++) {
      const a = occ[c * PER + q], oa = a * D_ID, x = 2 * rate[a] * dt;
      const sd = Math.sqrt(P.ID_SIG2 * (x > 1e-6 ? (1 - Math.exp(-x)) / (2 * rate[a]) : dt));
      for (let i = 0; i < D_ID; i++) X[oa + i] = Xn[oa + i] + sd * rng.normal();
    }
    // A way's two atoms merge once within a dialect; each cell's learned identity.
    const M2 = P.D_MERGE ** 2;
    for (let c = 0; c < nL; c++) {
      if (!nOcc[c]) { this.lead[c] = -1; continue; }
      const o = c * PER;
      for (let k = 0; k < WAYS; k++) { const a = o + 2 * k, b = a + 1; if (W[a] > 0 && W[b] > 0 && this.d2(a, b) < M2) { this.merge(a, W[b], b); W[b] = 0; } }
      const ca = o + 8, cb = o + 9;
      this.lead[c] = W[ca] > 0 || W[cb] > 0 ? (W[ca] >= W[cb] ? ca : cb) : this.main(c);
    }
  }

  /** Cell c's most peopled atom. */
  main(c) {
    const W = this.W, o = c * PER;
    let best = o;
    for (let s = o + 1; s < o + PER; s++) if (W[s] > W[best]) best = s;
    return best;
  }
  /** How alike two cells' learned identities are, 1 at none apart, 1/(1 + (d/D_SIM)²). */
  sim(c, d) {
    const a = this.lead[c], b = this.lead[d];
    return a < 0 || b < 0 ? 1 : 1 / (1 + this.d2(a, b) / (this.pp.P.D_SIM * this.pp.P.D_SIM));
  }
  /**
   * Learning's copying from d into c, by how alike they are (ID_COPY of the way to none), as c's learning
   * comes to texts (past writing's Z_ID0): before them it's oral, and bilingual neighbours carry it as
   * production's tacit copying is carried. (From the first, it held the foragers' mosaic apart and
   * farming came ~10 kyr later.)
   */
  copyW(c, d) {
    const P = this.pp.P, k = P.ID_COPY * (1 / (1 + Math.exp(-(this.pp.zl[c] - P.Z_ID0) / 0.25)));
    return k > 1e-6 ? 1 - k * (1 - this.sim(c, d)) : 1;
  }
  /** Trade's kernel between two places, by a common language: × (1 + CL sim)/(1 + CL). */
  tradeW(c, d) { const k = this.pp.P.CL_TRADE; return k > 0 ? (1 + k * this.sim(c, d)) / (1 + k) : 1; }

  /**
   * The distance across between two cells' identities (an energy distance: E|X − Y| less the mean
   * of E|X − X'| and E|Y − Y'|, each over the cells' people; a single atom each is their distance).
   */
  across(c, d) {
    const W = this.W, occ = this.occ, oc = c * PER, od = d * PER, nc = this.nOcc[c], nd = this.nOcc[d], Tc = this.T[c], Td = this.T[d];
    let xy = 0, xx = 0, yy = 0;
    for (let i = 0; i < nc; i++) {
      const a = occ[oc + i], pa = W[a] / Tc;
      for (let j = 0; j < nd; j++) { const b = occ[od + j]; xy += pa * W[b] / Td * Math.sqrt(this.d2(a, b)); }
      for (let j = i + 1; j < nc; j++) { const b = occ[oc + j]; xx += 2 * pa * W[b] / Tc * Math.sqrt(this.d2(a, b)); }
    }
    for (let i = 0; i < nd; i++) for (let j = i + 1; j < nd; j++) { const a = occ[od + i], b = occ[od + j]; yy += 2 * W[a] / Td * W[b] / Td * Math.sqrt(this.d2(a, b)); }
    return Math.max(0, xy - 0.5 * (xx + yy));
  }

  /**
   * The effective number of peoples: Leinster and Cobbold's similarity-sensitive diversity of order 2,
   * ²D = 1/Σᵢⱼ pᵢ pⱼ Zᵢⱼ over every atom (pᵢ its share of the world's people), Zᵢⱼ = e^{−d²/(2 D_HILL²)};
   * the sum estimated from N_HILL pairs drawn by people (unbiased; ~3% at a thousand peoples), from the
   * same seeded draws each time so the count moves only as the peoples do. (Exact, over bins of
   * D_HILL a dimension, it took ~2 s: in eight dimensions nearly every atom is its own bin.)
   */
  count(pairs = 4e5) {
    const nL = this.pp.nL, W = this.W, h = this.pp.P.D_HILL, cum = this.cum || (this.cum = new Float64Array(PER * nL)), id = this.cid || (this.cid = new Int32Array(PER * nL));
    let k = 0, all = 0;
    for (let c = 0; c < nL; c++) for (let q = 0; q < this.nOcc[c]; q++) { const s = this.occ[c * PER + q]; if (W[s] > 0) { all += W[s]; cum[k] = all; id[k++] = s; } }
    if (!(all > 0)) return (this.nPeoples = 0);
    const pick = u => { let lo = 0, hi = k - 1; const x = u * all; while (lo < hi) { const m = (lo + hi) >> 1; if (cum[m] < x) lo = m + 1; else hi = m; } return id[lo]; };
    const r = stream(this.pp.planet.seed, 'people:peoples:count'), s2 = 2 * h * h;
    let z = 0;
    for (let n = 0; n < pairs; n++) z += Math.exp(-this.d2(pick(r.uniform()), pick(r.uniform())) / s2);
    return (this.nPeoples = pairs / z);
  }

  /**
   * The tears, for drawing: the Voronoi edges between peopled land cells whose identities differ by
   * more than T_TEAR across (`across`), chained into lines between their junctions and smoothed (as
   * the routes', src/engine/routes.js `lines`); each point's weight the distance across.
   */
  tears(relax = 4, cuts = 2, net = 6) {
    const pp = this.pp, P = pp.P, g = pp.planet.grid, loc = pp.loc, cells = pp.cells, N = pp.Ntot, A = pp.H.area;
    const adj = new Map(), add = (u, v, w) => { if (!adj.has(u)) adj.set(u, []); adj.get(u).push([v, w]); };
    let max = 0;
    for (let c = 0; c < pp.nL; c++) {
      if (!this.nOcc[c] || N[c] < P.RHO_TEAR * A[c]) continue;   // where people live (the empty land's few wander, their identity a noise)
      const i = cells[c], o = g.nbrOff[i], deg = g.nbrOff[i + 1] - o;
      for (let k = 0; k < deg; k++) {
        const d = loc[g.nbr[o + k]];
        if (d <= c || !this.nOcc[d] || N[d] < P.RHO_TEAR * A[d]) continue;
        const e = this.across(c, d);
        if (!(e > P.T_TEAR)) continue;
        const f0 = g.corner[o + (k + deg - 1) % deg], f1 = g.corner[o + k];
        add(f0, f1, e); add(f1, f0, e); if (e > max) max = e;
      }
    }
    const used = new Set(), key = (u, v) => (u < v ? u * g.nf + v : v * g.nf + u), chains = [];
    const walk = (u, v, w) => {
      const nodes = [u, v], ws = [w];
      used.add(key(u, v));
      for (let prev = u, cur = v; ;) {
        const e = adj.get(cur);
        if (!e || e.length !== 2) break;
        const nx = e[0][0] === prev ? e[1] : e[0];
        if (used.has(key(cur, nx[0]))) break;
        used.add(key(cur, nx[0])); nodes.push(nx[0]); ws.push(nx[1]); prev = cur; cur = nx[0];
      }
      chains.push([nodes, ws]);
    };
    for (const [u, e] of adj) if (e.length !== 2) for (const [v, w] of e) if (!used.has(key(u, v))) walk(u, v, w);
    for (const [u, e] of adj) for (const [v, w] of e) if (!used.has(key(u, v))) walk(u, v, w);
    // The whole network relaxed first, its junctions too (only its ends held), each node halfway to its
    // neighbours' mean `net` times: held at the junctions, a mosaic of small peoples drew the grid's hexagons.
    const C = g.centre, pos = new Map();
    for (const u of adj.keys()) pos.set(u, [C[3 * u], C[3 * u + 1], C[3 * u + 2]]);
    for (let it = 0; it < net; it++) {
      const np = new Map();
      for (const [u, e] of adj) {
        const p = pos.get(u);
        if (e.length < 2) { np.set(u, p); continue; }
        let x = 0, y = 0, z = 0;
        for (const [v] of e) { const q = pos.get(v); x += q[0]; y += q[1]; z += q[2]; }
        x = 0.5 * p[0] + 0.5 * x / e.length; y = 0.5 * p[1] + 0.5 * y / e.length; z = 0.5 * p[2] + 0.5 * z / e.length;
        const r = Math.hypot(x, y, z);
        np.set(u, [x / r, y / r, z / r]);
      }
      for (const [u, p] of np) pos.set(u, p);
    }
    const Pt = [], Wt = [], off = [];
    for (const [nodes, ws] of chains) {
      let pts = nodes.map(f => pos.get(f).slice()), wt = [ws[0], ...ws];
      for (let it = 0; it < relax && pts.length > 2; it++) {
        const np = pts.map(p => p.slice());
        for (let k = 1; k + 1 < pts.length; k++) {
          const a = pts[k - 1], b = pts[k], c = pts[k + 1], x = 0.5 * b[0] + 0.25 * (a[0] + c[0]), y = 0.5 * b[1] + 0.25 * (a[1] + c[1]), z = 0.5 * b[2] + 0.25 * (a[2] + c[2]), r = Math.hypot(x, y, z);
          np[k] = [x / r, y / r, z / r];
        }
        pts = np;
      }
      for (let it = 0; it < cuts && pts.length > 2; it++) {
        const np = [pts[0]], nw = [wt[0]];
        for (let k = 0; k + 1 < pts.length; k++) {
          const p0 = pts[k], p1 = pts[k + 1], m = t => { const x = p0[0] + t * (p1[0] - p0[0]), y = p0[1] + t * (p1[1] - p0[1]), z = p0[2] + t * (p1[2] - p0[2]), r = Math.hypot(x, y, z); return [x / r, y / r, z / r]; };
          if (k > 0) { np.push(m(0.25)); nw.push(wt[k + 1]); }
          if (k + 2 < pts.length) { np.push(m(0.75)); nw.push(wt[k + 1]); }
        }
        np.push(pts[pts.length - 1]); nw.push(wt[wt.length - 1]);
        pts = np; wt = nw;
      }
      off.push(Pt.length / 3);
      for (let k = 0; k < pts.length; k++) { Pt.push(...pts[k]); Wt.push(wt[k]); }
    }
    return { P: Float32Array.from(Pt), W: Float32Array.from(Wt), off: Int32Array.from(off), max };
  }
}
