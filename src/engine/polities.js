// States (batch 2a, landing 1; docs/people.md, "States"): who people deliver to. Marks as in the plan:
// standard, synthesis, speculation; the whole is synthesis and its values speculation.
//
// A polity is the places still delivering grain, labour or tax along the routes to a centre. It isn't an
// agent: it decides nothing, and everything it does is a flux. The table holds each polity's capital,
// cohesion and colours; each cell holds its allegiance to its KP strongest, a share of its people each,
// the rest stateless. Territory is soft (a contested march is a split cell); borders are where it turns.
//
//   power       P = cohesion × arms, the people delivering × the horse (M_HERD a herder) × e^{z/Z_MIL}
//               at the capital's production, projected to each place as P e^{−cost/L} (Boulding's
//               loss-of-strength gradient, 1962, standard, from memory), cost by the routes from the
//               capital (src/engine/routes.js: the markets' costs, the catchment's near the capital),
//               L = C_POL0 + K_POL × the trade's reach at production, softly at most
//               L_POLMAX (a state's hold reaches less far than its trade: steam made the world one
//               market, not one state); × (1 + K_KIN
//               sim)/(1 + K_KIN) by how alike the place's people are to the capital's (strangers resist).
//   allegiance  relaxes over T_WAR toward d π^γ/(Σ π^γ + π₀^γ), so borders are sharp (γ > 1), sit
//               where two states' projected powers are equal and move toward the weaker, and stick
//               where the cost jumps (a strait, a range, a desert: the ratio jumps across it), d the share of the place's people with something to
//               deliver: farmers and cities wholly, herders DL_HERD and fishers DL_FISH, foragers not
//               (states tax grain: Scott's Against the Grain, from memory); with industry everyone.
//               Its rate of change is war (`flux`).
//   resistance  π₀ = B_LOC × the region's arms (by the same kernel: a province rises together) × (1 + K_RUG slope/0.01) × (1 + K_EXIT exit), exit
//               the spare room among its land neighbours: Scott's Zomia (the hills resist), and
//               Carneiro's circumscription (1970) made soft: a fertile pocket in a desert submits to a
//               weak power, an open frontier doesn't (both from memory).
//   cohesion    Turchin's asabiya (Historical Dynamics, 2003, from memory), each place's: dA/dt = R_ASA
//               f A(1 − A) − D_ASA (1 − f) A, at least A_MIN, f its metaethnic frontier (neighbours
//               outside its state whose identity is a family apart, D_META, or whose way of life is
//               another, mobile against settled; another state's at W_RIVAL), each neighbour by its
//               arms against the place's; stepped exactly (a logistic). A state's is the mean over
//               the people it holds, so one that expands turns its marches into a core that slowly
//               loses heart. At least the nation's, A_NAT, as learning passes Z_NAT (Gellner).
//               Collapse and secession need no rule of their own: the periphery falls below π₀ and
//               goes stateless, and successor states found themselves at its cities.
//   founding    a place mostly stateless with a fed city founds a polity, at R_FORM × x²/(1 + x²) a
//               year, x its city's people over N_STATE (Carneiro's circumscription is in π₀'s exit),
//               uniting its region: the free share of its catchment, e-fold over its reach.
//               A polity that loses its capital moves it to its largest city held, its cohesion ×
//               CAP_LOSS; one holding fewer than N_DIE people is gone.
// What states do (landing 2): each place's national share of its cities' food goes to its states'
// capitals and the capitals' works labour back to it (People.foodshed, feed: roads and works out from
// the centre); the state's granaries widen its places' stores (G_STATE); a border in trade's kernel
// (B_TRADE, `border`); war's costs where allegiance moves (W_DEATH of the people changing hands,
// W_WORKS of the works by the share moved); rivalry with peer states lifts new ideas (K_RIVAL, `rv`;
// contested, so weak, beside the border's cut in trade and the copying that rides on it).
// Read back: each place's identity pulled toward its capital's (src/engine/peoples.js; a9: softly).
// Drawn on the States map (`drawn`): each polity a hue and a hatch angle apart from its neighbours'; the
// borders (`borders`) and capitals as marks; counted (`count`): the effective number of states.
import { stream } from '../rng.js';
import { CITY } from './peoples.js';

export const KP = 3;      // the polities a place keeps
const KC = 4;             // the candidates a place weighs a step
const HUES = 8, ANGS = 3; // the States map's colours: hues round the peoples' wheel × hatch angles 60° apart

/** The cohesion's logistic with decay over dt: dA/dt = a A (1 − A) − b A, exactly. */
export function asabiya(A, a, b, dt) {
  const r = a - b;
  if (!(A > 0)) return 0;
  if (Math.abs(r) < 1e-12) return A / (1 + a * A * dt);
  const e = Math.exp(Math.max(-60, Math.min(60, r * dt)));
  return r * A * e / (r + a * A * (e - 1));
}

export class Polities {
  /** For a People `pp` (src/engine/people.js). */
  constructor(pp) {
    this.pp = pp;
    const nL = pp.nL;
    this.id = new Int32Array(KP * nL).fill(-1);   // each place's polities, strongest first
    this.s = new Float64Array(KP * nL);           // their shares of its people
    this.flux = new Float64Array(nL);             // people changing hands a year (war), the last step's
    this.d = new Float64Array(nL);                // the share of each place's people with something to deliver
    this.arm = new Float64Array(nL);              // its arms a person (the horse)
    this.pi0 = new Float64Array(nL);              // its own resistance
    this.S = new Float64Array(nL).fill(pp.P.COH0); // each place's cohesion (asabiya)
    this.fr = new Float64Array(nL);               // its metaethnic frontier's weight
    this.rv = new Float64Array(nL).fill(1);       // its new ideas' lift by its states' rivals
    this.cid = new Int32Array(KC * nL); this.cpi = new Float64Array(KC * nL);
    this.list = [];                               // every polity yet: { cap, coh, born, died, hue, ang, N, A, P, L, f }
    this.live = [];
    this.rng = stream(pp.planet.seed, 'people:polities');
    this.owed = 0; this.nStates = 0; this.topShare = 0; this.heldN = 0;
    this.ver = 0;                                 // bumped each step (for drawing)
  }

  /** The polities over a step, every DT_POL years at least (borders move over generations). */
  step(dt) {
    this.owed += dt;
    if (this.owed < this.pp.P.DT_POL) return;
    const due = this.owed;
    this.owed = 0;
    this.advance(due);
  }

  /** A state's reach at production z (sea-km of route cost, e-fold): C_POL0 + K_POL × the trade's, softly at most L_POLMAX. */
  reachAt(z) { const P = this.pp.P, x = P.C_POL0 + P.K_POL * this.pp.routes.reach(z); return x / (1 + x / P.L_POLMAX); }

  advance(dt) {
    const pp = this.pp, P = pp.P, nL = pp.nL, N = pp.Ntot, rt = pp.routes, ids = pp.ids;
    if (!rt || !pp.packages.length) return;
    this.ver++;
    const W = ids.W, T = ids.T, E = pp.E, H = pp.H, ind = pp.ind, zc = pp.zc, K = pp.K;
    const d = this.d, arm = this.arm, pi0 = this.pi0, id = this.id, s = this.s, list = this.list;
    // Each place: what it can deliver, its arms, its own resistance.
    for (let c = 0; c < nL; c++) {
      const n = N[c], t = T[c];
      if (!(n > 0) || !(t > 0)) { d[c] = 0; arm[c] = 1; pi0[c] = 0; continue; }
      const o = 5 * c;
      let dc = (W[o + 3] + W[o + CITY] + P.DL_HERD * W[o + 1] + P.DL_FISH * W[o + 2]) / t;
      dc = Math.min(1, dc + (1 - dc) * ind[c]);
      d[c] = dc; arm[c] = 1 + P.M_HERD * W[o + 1] / t;
      let ex = 0, deg = 0;
      for (let e = E.off[c]; e < E.off[c + 1]; e++) {
        if (E.hop[e]) continue;
        const b = E.nb[e]; deg++;
        if (K[b] > 0) ex += Math.max(0, 1 - N[b] / K[b]);
      }
      ex = deg ? ex / deg : 0;
      pi0[c] = P.B_LOC * Math.exp(Math.min(zc[c] / P.Z_MIL, 600)) * (1 + P.K_RUG * H.slope[c] / 0.01) * (1 + P.K_EXIT * ex);
    }
    // The region about each place, by one kernel: each place of its catchment by the local routes (roads,
    // rivers, short crossings) e-fold over the reach a state would have there. Its people's arms are the
    // stateless resistance (a province rises together), and a state's arms among them its power there.
    // (A state's whole power projected to its frontier had fed on its own size: one at a twentieth of
    // its cohesion held most of the world. Counted across the markets' sea routes, a coast's region took
    // in a whole sea's people, and no coastal state could stand.)
    const { off: cof, idx: cix, cS, cI } = rt.catch;
    const wE = this.wE && this.wE.length === cix.length ? this.wE : (this.wE = new Float64Array(cix.length));
    for (let c = 0; c < nL; c++) {
      const Lc = this.reachAt(zc[c]), si = ind[c];
      let r = 0;
      for (let e = cof[c]; e < cof[c + 1]; e++) {
        const b = cix[e], w = N[b] > 0 ? Math.exp(-((1 - si) * cS[e] + si * cI[e]) / Lc) : 0;
        wE[e] = w; r += w * N[b] * arm[b];
      }
      pi0[c] *= r;
    }
    // Each polity: its cohesion's weight, its reach, and the costs from its capital (its catchment's
    // near it, else the capital to its market, the markets' route, the market to the place).
    const live = this.live, own = rt.ownCost, node = rt.nodeOf, mo = rt.marketOf;
    for (const k of live) {
      const q = list[k], cap = q.cap, zk = zc[cap];
      q.w = q.coh * Math.exp(Math.min(zk / P.Z_MIL, 600));
      q.L = this.reachAt(zk); q.sI = ind[cap]; q.m0 = mo[cap]; q.o0 = own[node[cap]];
      const near = q.near || (q.near = new Map());
      near.clear();
      for (let e = cof[cap]; e < cof[cap + 1]; e++) near.set(cix[e], (1 - q.sI) * cS[e] + q.sI * cI[e]);
    }
    const capCost = (q, c) => {
      const nx = q.near.get(c);
      if (nx !== undefined) return nx;
      const m = mo[c], sI = q.sI, xm = m === q.m0 ? 0 : (sI < 1e-6 ? rt.cost(q.m0, m, 'S') : (1 - sI) * rt.cost(q.m0, m, 'S') + sI * rt.cost(q.m0, m, 'I'));
      return q.o0 + xm + own[node[c]];
    };
    // The candidates: the polities holding among each place's region, each by its arms there × its
    // cohesion × its capital's reach (Boulding's gradient) × how alike the place is to its capital's
    // people; the strongest KC a place.
    const cid = this.cid, cpi = this.cpi, kin = P.K_KIN, lk = new Int32Array(64), la = new Float64Array(64);
    cid.fill(-1); cpi.fill(0);
    for (let c = 0; c < nL; c++) {
      if (!(d[c] > 0)) continue;
      let nk = 0;
      for (let e = cof[c]; e < cof[c + 1]; e++) {
        const w = wE[e];
        if (!(w > 0)) continue;
        const b = cix[e], nb = w * N[b] * arm[b];
        for (let j = 0; j < KP; j++) {
          const k = id[KP * b + j];
          if (k < 0) break;
          let h = 0;
          while (h < nk && lk[h] !== k) h++;
          if (h === nk) { if (nk === 64) continue; lk[nk] = k; la[nk] = 0; nk++; }
          la[h] += s[KP * b + j] * nb;
        }
      }
      const o = KC * c;
      for (let h = 0; h < nk; h++) {
        const q = list[lk[h]], v = q.w * la[h] * Math.exp(-capCost(q, c) / q.L) * (1 + kin * ids.sim(c, q.cap)) / (1 + kin);
        if (!(v > cpi[o + KC - 1])) continue;
        let r = KC - 1;
        while (r > 0 && cpi[o + r - 1] < v) { cpi[o + r] = cpi[o + r - 1]; cid[o + r] = cid[o + r - 1]; r--; }
        cpi[o + r] = v; cid[o + r] = lk[h];
      }
    }
    // Allegiance: each place's shares toward their targets over T_WAR.
    const g = P.POL_G, a = 1 - Math.exp(-dt / P.T_WAR), flux = this.flux;
    const uk = new Int32Array(KP + KC), us = new Float64Array(KP + KC), up = new Float64Array(KP + KC), un = new Float64Array(KP + KC);
    for (let c = 0; c < nL; c++) {
      const o = KP * c, oc = KC * c;
      let n = 0;
      for (let j = 0; j < KP; j++) { const k = id[o + j]; if (k < 0) break; uk[n] = k; us[n] = s[o + j]; up[n] = 0; n++; }
      for (let j = 0; j < KC; j++) {
        const k = cid[oc + j];
        if (k < 0) break;
        let h = -1;
        for (let i = 0; i < n; i++) if (uk[i] === k) { h = i; break; }
        if (h < 0) { uk[n] = k; us[n] = 0; up[n] = cpi[oc + j]; n++; } else up[h] = cpi[oc + j];
      }
      flux[c] = 0;
      if (!n) continue;
      let den = Math.pow(pi0[c], g);
      for (let i = 0; i < n; i++) den += Math.pow(up[i], g);
      let moved = 0;
      for (let i = 0; i < n; i++) {
        const tg = den > 0 && d[c] > 0 ? d[c] * Math.pow(up[i], g) / den : 0;
        un[i] = us[i] + (tg - us[i]) * a;
        moved += Math.abs(un[i] - us[i]);
      }
      flux[c] = 0.5 * moved * N[c] / dt;
      // War's costs where allegiance moves (speculation): W_DEATH of the people changing hands (war's
      // deaths and flight), W_WORKS of the place's works by the share moved (canals breached, terraces
      // let go, the libraries burned).
      const mv = d[c] > 0 ? Math.min(1, 0.5 * moved / d[c]) : 0;
      if (mv > 1e-6) {
        N[c] *= 1 - P.W_DEATH * 0.5 * moved;
        const kw = 1 - P.W_WORKS * mv;
        pp.works[c] *= kw;
        for (const kind of Object.values(pp.wk)) kind[c] *= kw;
      }
      // Keep the strongest KP.
      for (let j = 0; j < KP; j++) {
        let b = -1;
        for (let i = 0; i < n; i++) if (uk[i] >= 0 && un[i] > P.S_MIN && (b < 0 || un[i] > un[b])) b = i;
        if (b < 0) { for (let r = j; r < KP; r++) { id[o + r] = -1; s[o + r] = 0; } break; }
        id[o + j] = uk[b]; s[o + j] = un[b]; uk[b] = -1;
      }
    }
    // Cohesion, each place's (Turchin's asabiya, kept by place as his model keeps it): growing on a
    // metaethnic frontier, decaying behind one; a polity's is the mean over the people it holds, so a
    // state that expands turns its old marches into a core that slowly loses heart (with one number a
    // state, cohesion followed its shape without lag, and states sat at their balance for 10 kyr).
    const main = this.mainBuf || (this.mainBuf = new Int32Array(nL)), own2 = this.ownBuf || (this.ownBuf = new Int32Array(nL)), Sc = this.S;
    for (let c = 0; c < nL; c++) { main[c] = T[c] > 0 ? ids.main(c) : -1; own2[c] = this.owner(c); }
    for (const k of live) { const q = list[k]; q.f = 0; q.N = 0; q.A = 0; q.coh = 0; }
    const D2 = P.D_META * P.D_META, fr = this.fr;
    for (let c = 0; c < nL; c++) {
      fr[c] = 0;
      if (main[c] < 0) continue;
      const wc = main[c] % 5, mc = N[c] * arm[c], oc = own2[c];
      let deg = 0, f = 0;
      for (let e = E.off[c]; e < E.off[c + 1]; e++) {
        if (E.hop[e]) continue;
        deg++;
        const b = E.nb[e], ob = own2[b];
        if (main[b] < 0 || (oc >= 0 && ob === oc)) continue;
        const wb = main[b] % 5, way = ((wb === 0 || wb === 1) && wc >= 3) || ((wc === 0 || wc === 1) && wb >= 3) ? 1 : 0;
        const meta = Math.max(way, ob >= 0 && ob !== oc ? P.W_RIVAL : 0, 1 - 1 / (1 + ids.d2(main[c], main[b]) / D2)), mb = N[b] * arm[b];
        f += meta * mb / (mb + mc);
      }
      fr[c] = deg ? f / deg : 0;
      // At least the nation's: schooling makes cohesion everyone's, not only the marches' (Gellner's
      // Nations and Nationalism, 1983, from memory), as learning passes Z_NAT (without it, an industrial
      // world of one people and few frontiers let its states' cores lose heart, and a third of it was
      // stateless at the takeoff).
      const floor = P.A_MIN + (P.A_NAT - P.A_MIN) / (1 + Math.exp(-(pp.zl[c] - P.Z_NAT) / P.W_NAT));
      Sc[c] = Math.max(floor, asabiya(Sc[c], P.R_ASA * fr[c], P.D_ASA * (1 - fr[c]), dt));
    }
    for (let c = 0; c < nL; c++) for (let j = 0; j < KP; j++) {
      const k = id[KP * c + j];
      if (k < 0) break;
      const q = list[k], w = s[KP * c + j] * N[c];
      q.N += w; q.A += w * arm[c]; q.coh += w * Sc[c]; q.f += w * fr[c];
    }
    for (const k of live) {
      const q = list[k];
      q.coh = q.N > 0 ? q.coh / q.N : P.COH0; q.f = q.N > 0 ? q.f / q.N : 0;
      q.P = q.coh * q.A; q.rb = 0; q.ra = 0;
    }
    // Rivalry (a9; contested, so weak: Hoffman's tournament, the fragmented Europe of Jones, Mokyr and
    // Scheidel, from memory): each state's share of its border facing peer states, by their parity in
    // power; its places' new ideas × (1 + K_RIVAL × it × the share held).
    for (let c = 0; c < nL; c++) {
      const k = own2[c];
      if (k < 0) continue;
      const q = list[k];
      for (let e = E.off[c]; e < E.off[c + 1]; e++) {
        if (E.hop[e]) continue;
        const b = own2[E.nb[e]];
        if (b === k) continue;
        q.ra++;
        if (b >= 0) { const r = list[b]; q.rb += Math.min(q.P, r.P) / Math.max(q.P, r.P, 1e-30); }
      }
    }
    const rv = this.rv;
    for (let c = 0; c < nL; c++) {
      let x = 0;
      for (let j = 0; j < KP; j++) { const k = id[KP * c + j]; if (k < 0) break; const q = list[k]; if (q.ra > 0 && d[c] > 0) x += s[KP * c + j] / d[c] * q.rb / q.ra; }
      rv[c] = 1 + P.K_RIVAL * x;
    }
    // Capitals lost move to the largest city held; polities too small are gone.
    const city = pp.city;
    for (const k of live) {
      const q = list[k];
      let sc = 0;
      for (let j = 0; j < KP; j++) if (id[KP * q.cap + j] === k) { sc = s[KP * q.cap + j]; break; }
      if (q.N >= P.N_DIE && sc >= 0.5 * d[q.cap] && sc > 0) continue;
      if (q.N >= P.N_DIE) {
        let best = -1, bv = 0;
        for (let c = 0; c < nL; c++) for (let j = 0; j < KP; j++) {
          if (id[KP * c + j] !== k) continue;
          const v = s[KP * c + j] * (city ? city[c] : 0) + 1e-9 * s[KP * c + j] * N[c];
          if (s[KP * c + j] >= 0.5 * d[c] && v > bv) { bv = v; best = c; }
        }
        if (best >= 0) { q.cap = best; q.coh *= P.CAP_LOSS; continue; }
      }
      q.died = pp.t;
    }
    if (live.some(k => list[k].died !== null)) {
      for (let c = 0; c < nL; c++) {
        const o = KP * c;
        let w = 0;
        for (let j = 0; j < KP; j++) { const k = id[o + j]; if (k >= 0 && list[k].died === null) { id[o + w] = k; s[o + w] = s[o + j]; w++; } }
        for (let j = w; j < KP; j++) { id[o + j] = -1; s[o + j] = 0; }
      }
      this.live = live.filter(k => list[k].died === null);
    }
    // Founding: a place mostly stateless with a fed city.
    if (city) for (let c = 0; c < nL; c++) {
      if (!(d[c] > 0) || !(city[c] > 0)) continue;
      let held = 0;
      for (let j = 0; j < KP; j++) { if (id[KP * c + j] < 0) break; held += s[KP * c + j]; }
      const free = d[c] - held;
      if (!(free > 0.5 * d[c])) continue;
      const x = city[c] / P.N_STATE, r = P.R_FORM * x * x / (1 + x * x) * free / d[c];
      if (this.rng.uniform() < 1 - Math.exp(-r * dt)) this.found(c, free);
    }
    this.count();
  }

  /** A polity founded at c, holding its free share; its colours apart from its neighbours'. */
  found(c, free) {
    const pp = this.pp, P = pp.P, rt = pp.routes, id = this.id, s = this.s, k = this.list.length;
    const near = new Set();
    if (rt) for (let e = rt.catch.off[c]; e < rt.catch.off[c + 1]; e++) {
      const b = rt.catch.idx[e];
      for (let j = 0; j < KP; j++) { const q = id[KP * b + j]; if (q < 0) break; near.add(q); }
    }
    let best = 0, bv = -1;
    const h0 = this.rng.uniform() * HUES | 0, a0 = this.rng.uniform() * ANGS | 0;
    for (let i = 0; i < HUES * ANGS; i++) {
      const h = (h0 + i) % HUES, an = (a0 + Math.floor(i / HUES)) % ANGS;
      let v = Infinity;
      for (const q of near) {
        const o = this.list[q], dh = Math.min(Math.abs(o.hue - h), HUES - Math.abs(o.hue - h)) / (HUES / 2);
        v = Math.min(v, dh + (o.ang === an ? 0 : 0.6));
      }
      if (v > bv + 1e-9) { bv = v; best = h * ANGS + an; }
      if (v === Infinity) break;
    }
    this.list.push({ cap: c, coh: this.S[c], born: pp.t, died: null, hue: Math.floor(best / ANGS), ang: best % ANGS, N: 0, A: 0, P: 0, L: 0, f: 0, sI: 0 });
    this.live.push(k);
    // It unites its region: the free share of each place in its catchment, e-fold over its reach (a
    // chiefdom's confederation; from one place, the region's resistance stopped every founding).
    this.claim(c, k, free);
    if (rt) {
      const L = this.reachAt(pp.zc[c]), si = pp.ind[c], { off, idx, cS, cI } = rt.catch;
      for (let e = off[c] + 1; e < off[c + 1]; e++) {
        const b = idx[e], d = this.d[b];
        if (!(d > 0)) continue;
        let h = 0;
        for (let j = 0; j < KP; j++) { if (id[KP * b + j] < 0) break; h += s[KP * b + j]; }
        const f = (d - h) * Math.exp(-((1 - si) * cS[e] + si * cI[e]) / L);
        if (f > 0.05 * d) this.claim(b, k, f);
      }
    }
  }

  /** Polity k takes share f of place c (its own share if it holds some, else the first free slot or the weakest's), strongest first. */
  claim(c, k, f) {
    const id = this.id, s = this.s, o = KP * c;
    let j = 0;
    while (j < KP && id[o + j] >= 0 && id[o + j] !== k) j++;
    if (j === KP) j = KP - 1;
    id[o + j] = k; s[o + j] = f;
    for (let i = j; i > 0 && s[o + i] > s[o + i - 1]; i--) {
      [id[o + i], id[o + i - 1]] = [id[o + i - 1], id[o + i]]; [s[o + i], s[o + i - 1]] = [s[o + i - 1], s[o + i]];
    }
  }

  /** The effective number of states (Hill's order 2 over the people each holds), the largest's share of them, and the people held. */
  count() {
    let all = 0, sq = 0, top = 0;
    for (const k of this.live) { const n = this.list[k].N; all += n; sq += n * n; if (n > top) top = n; }
    this.nStates = all > 0 ? all * all / sq : 0;
    this.topShare = all > 0 ? top / all : 0;
    this.heldN = all;
    return this.nStates;
  }

  /** The share of place c's deliverers its states hold (0–1). */
  held(c) { const d = this.d[c]; if (!(d > 0)) return 0; let h = 0; for (let j = 0; j < KP; j++) { if (this.id[KP * c + j] < 0) break; h += this.s[KP * c + j]; } return Math.min(1, h / d); }
  /** How much of trade between places a and b a border leaves: 1 within one state or between the stateless, B_TRADE across one, mixed by their shares. */
  border(a, b) {
    const B = this.pp.P.B_TRADE;
    if (!(B < 1)) return 1;
    const id = this.id, s = this.s, da = this.d[a], db = this.d[b];
    let same = 0, ha = 0, hb = 0;
    for (let i = 0; i < KP; i++) {
      const k = id[KP * a + i];
      if (k < 0) break;
      const x = da > 0 ? s[KP * a + i] / da : 0;
      ha += x;
      for (let j = 0; j < KP; j++) { if (id[KP * b + j] === k) { same += x * (db > 0 ? s[KP * b + j] / db : 0); break; } if (id[KP * b + j] < 0) break; }
    }
    for (let j = 0; j < KP; j++) { if (id[KP * b + j] < 0) break; hb += db > 0 ? s[KP * b + j] / db : 0; }
    same += Math.max(0, 1 - ha) * Math.max(0, 1 - hb);
    return B + (1 - B) * Math.min(1, same);
  }

  /** The capital's identity slot (src/engine/peoples.js) of polity k, or −1. */
  capSlot(k) { return this.pp.ids.lead[this.list[k].cap]; }

  /**
   * The States map's fields, three vec4s a cell of the people's grid, as the Culture map's
   * (src/engine/peoples.js, `drawn`): the largest polity's hatch angle (2θ) and hue as cosines and
   * sines × its share of the place's people, the second's alike.
   */
  drawn(out = null) {
    const pp = this.pp, n = pp.planet.grid.n, id = this.id, s = this.s;
    out = out || new Float32Array(12 * n); out.fill(0);
    for (let c = 0; c < pp.nL; c++) {
      const o = 12 * pp.cells[c];
      out[o + 8] = pp.fishU ? pp.fishU[c] : 0;
      for (let j = 0; j < 2; j++) {
        const k = id[KP * c + j];
        if (k < 0) break;
        const q = this.list[k], f = Math.min(1, s[KP * c + j] / Math.max(this.d[c], 1e-9)), a2 = 2 * Math.PI * q.ang / ANGS, h = 2 * Math.PI * (q.hue + 0.5) / HUES;
        out[o + 4 * j] = f * Math.cos(a2); out[o + 4 * j + 1] = f * Math.sin(a2); out[o + 4 * j + 2] = f * Math.cos(h); out[o + 4 * j + 3] = f * Math.sin(h);
      }
    }
    return out;
  }

  /** Each place's strongest polity where it holds most of those who deliver, else −1. */
  owner(c) { const k = this.id[KP * c]; return k >= 0 && this.s[KP * c] >= 0.5 * this.d[c] && this.d[c] > 0 ? k : -1; }

  /**
   * The borders, for drawing: the Voronoi edges between peopled places whose owners differ, as chains
   * relaxed as the peoples' tears were (a network smoothed with its ends held, then each chain cut):
   * weight 1 between two states, 0 between a state and the stateless. And the capitals of the states
   * holding at least N_MARK people (positions, people).
   */
  borders(relax = 4, cuts = 2, net = 6) {
    const pp = this.pp, P = pp.P, g = pp.planet.grid, loc = pp.loc, cells = pp.cells, N = pp.Ntot;
    const adj = new Map(), add = (u, v, w) => { if (!adj.has(u)) adj.set(u, []); adj.get(u).push([v, w]); };
    for (let c = 0; c < pp.nL; c++) {
      if (!(N[c] > 0)) continue;
      const kc = this.owner(c), i = cells[c], o = g.nbrOff[i], deg = g.nbrOff[i + 1] - o;
      for (let k = 0; k < deg; k++) {
        const b = loc[g.nbr[o + k]];
        if (b < 0 || b <= c || !(N[b] > 0)) continue;
        const kb = this.owner(b);
        if (kb === kc) continue;
        const w = kb >= 0 && kc >= 0 ? 1 : 0;
        const f0 = g.corner[o + (k + deg - 1) % deg], f1 = g.corner[o + k];
        add(f0, f1, w); add(f1, f0, w);
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
    // The network relaxed first, its junctions too (only its ends held): held at the junctions, a
    // mosaic of small states drew the grid's hexagons.
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
    const caps = [];
    for (const k of this.live) {
      const q = this.list[k];
      if (!(q.N >= P.N_MARK)) continue;
      const i = cells[q.cap];
      caps.push(g.pos[3 * i], g.pos[3 * i + 1], g.pos[3 * i + 2], q.N);
    }
    return { P: Float32Array.from(Pt), W: Float32Array.from(Wt), off: Int32Array.from(off), caps: Float32Array.from(caps) };
  }
}
