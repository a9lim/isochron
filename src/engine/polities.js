// States (batch 2a, landing 1; docs/MODEL.md): who people deliver to. Marks:
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
//               uniting its region: the free share of its catchment, e-fold over its reach, its
//               founders' cohesion COH0 brought to the places it takes (Ibn Khaldun's dynasty).
//               A polity that loses its capital moves it to its largest city held, its cohesion ×
//               CAP_LOSS; one holding fewer than N_DIE people is gone.
// Empires (batch 2b, landing 1; synthesis):
//   projection  a state's power at a place adds F_PROJ of the place's region's arms (garrisons and the
//               troops raised there, armed at the state's wealth: × (1 + K_ARM y_state/ȳ)/(1 + K_ARM y_place/ȳ))
//               × e^{−cost/LP}, LP = L_PROJ × i/(i + I_PROJ), i its core's industry (steam navies, which
//               a little industry builds; steam cheapens the routes too), so a small state far ahead in
//               knowledge, wealth or
//               cohesion holds a large region far away (Headrick's Tools of Empire, from memory). Arms
//               everywhere × (1 + K_ARM × industrial income a person over the world's mean ȳ): a great
//               power's is its wealth against the others' (Kennedy), the gap widest while industry is young.
//   settlers    carry their allegiance across the sea (`carry`), so a colony of settlers holds to their
//               state; a conquered one holds by projection.
//   nationalism once a place is schooled (its learning past Z_NAT), its people resist strangers' rule
//               × e^{−K_SELF (1 − likeness)} (Gellner's congruence of state and nation): decolonization,
//               and the breakup of empires by nation.
//   core        a state's cohesion is its people's by how alike they are to its capital's (Turchin's
//               core): subjects decaying behind no frontier of their own don't drain their rulers'.
// What states do (landing 2): each place's national share of its cities' food goes to its states'
// capitals and the capitals' works labour back to it (People.foodshed, feed: roads and works out from
// the centre); the state's granaries widen its places' stores (G_STATE); a border in trade's kernel
// (B_TRADE, `border`); war's costs where allegiance moves (W_DEATH of the people changing hands,
// W_WORKS of the works by the share moved); rivalry with peer states lifts new ideas (K_RIVAL, `rv`;
// contested, so weak, beside the border's cut in trade and the copying that rides on it).
// Read back: each place's identity pulled toward its capital's (src/engine/peoples.js; a9: softly).
// Drawn on the States map (`drawn`): each polity a hue, free on the peoples' wheel and measured along its
// path in OKLab so that equal steps look equally different (`HUE`), picked where it least resembles the
// hues of the states it meets, then of those near, then of the world's (`pick`: a sum of Gaussians in the
// hues' distance), at its founding and again when it meets a larger state of nearly its hue (`recolour`;
// states outgrow the region they were founded in). A contested place is striped equally in both states'
// hues. The capitals as marks (`capitals`); counted (`count`): the effective number of states.
import { stream } from '../rng.js';
import { CITY } from './peoples.js';

export const KP = 3;      // the polities a place keeps
const KC = 4;             // the candidates a place weighs a step
const SEA_TOUCH = 300;    // km: states facing each other across less sea than this meet, for their hues
// The States map's hues, each a place u on the wheel's path (0–1 round it, the accent at 0):
const HUE_SIG = 0.09;     // how near two hues look alike: e^{−(Δu/σ)²}
const HUE_NEAR = 0.3;     // a state not met: its weight, e-fold over HUE_L of arc between the capitals
const HUE_L = 0.25;       // rad (~1,600 km on Earth)
const HUE_ALL = 0.3;      // the world's hues: this weight spread over them all
const HUE_RED = 0.5;      // the accent, weighed as a state met by half: the people's red stays theirs
const HUE_CLASH = 0.06;   // a state this near in hue to a larger one it meets takes another
const HUE_N = 240;        // the hues a pick weighs
const MARCH = [0.2, 0.4]; // the second state's share over which a place turns to equal stripes

/**
 * A hue's angle on the peoples' wheel (src/render/globe.js, idWheel, which reads v = h/2π + ½) from its
 * place u along the wheel's path in OKLab. The wheel warps its hue by 0.35 sin and halves its chroma
 * toward the accent, so equal steps in v were ~60° of hue apart beside the accent and ~30° across from it,
 * where two teals looked alike; equal steps in u look equally different. The path's shape in v is the
 * same in both themes.
 */
const HUE = (() => {
  const M = 4096, sp = new Float64Array(M + 1), TAU = 2 * Math.PI;
  const ab = v => {
    const t = TAU * v + 0.35 * Math.sin(TAU * v), dh = Math.abs(Math.atan2(Math.sin(t), Math.cos(t)));
    const C = 1 - 0.5 * Math.exp(-((dh / 0.5236) ** 2));
    return [C * Math.cos(t), C * Math.sin(t)];
  };
  let [a0, b0] = ab(0);
  for (let i = 1; i <= M; i++) { const [a, b] = ab(i / M); sp[i] = sp[i - 1] + Math.hypot(a - a0, b - b0); a0 = a; b0 = b; }
  const N = 1024, tab = new Float64Array(N + 1);
  for (let k = 0, i = 0; k <= N; k++) {
    const g = k / N * sp[M];
    while (i < M - 1 && sp[i + 1] < g) i++;
    tab[k] = TAU * ((i + (g - sp[i]) / (sp[i + 1] - sp[i])) / M - 0.5);
  }
  return u => { const x = (u - Math.floor(u)) * N, k = Math.min(N - 1, x | 0); return tab[k] + (x - k) * (tab[k + 1] - tab[k]); };
})();
/** How far apart two hues are round the wheel (0–½). */
const hueGap = (a, b) => { const d = Math.abs(a - b) % 1; return Math.min(d, 1 - d); };
const smooth = x => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));

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
    this.rA = new Float64Array(nL);               // its region's arms (the kernel's sum)
    this.rY = new Float64Array(nL);               // its region's industrial income a person
    this.nat = new Float64Array(nL);              // how far its people are schooled into a nation (0–1)
    this.S = new Float64Array(nL).fill(pp.P.COH0); // each place's cohesion (asabiya)
    this.ex = new Float64Array(nL);               // the spare room among its land neighbours (its people's exit; src/engine/classes.js reads it too)
    this.fr = new Float64Array(nL);               // its metaethnic frontier's weight
    this.rv = new Float64Array(nL).fill(1);       // its new ideas' lift by its states' rivals
    this.cid = new Int32Array(KC * nL); this.cpi = new Float64Array(KC * nL);
    this.list = [];                               // every polity yet: { cap, coh, born, died, hue, N, A, P, L, f; peakN, peakT, peakA, parent; O, pos, rev (office: src/engine/classes.js) }
    this.hist = []; this.tHist = null;            // the Histomap's record: each state's people every DT_HIST years (`snapshot`)
    this.live = [];
    this.rng = stream(pp.planet.seed, 'people:polities');
    this.owed = 0; this.nStates = 0; this.topShare = 0; this.heldN = 0; this.topN = 0; this.topArea = 0; this.first = null;
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
    // Each place: what it can deliver, its arms, its own resistance. With industry arms follow wealth
    // against the world's (Kennedy's great powers, from memory): × (1 + K_ARM × its income a person over
    // the world's mean), so the gap is widest while industry is young and closes as it spreads.
    let gs = 0, ns = 0;
    for (let c = 0; c < nL; c++) { gs += pp.goods[c]; ns += N[c]; }
    const yW = this.yW = gs > 0 && ns > 0 ? gs / ns : 0, ky = yW > 0 ? P.K_ARM / yW : 0;
    for (let c = 0; c < nL; c++) {
      const n = N[c], t = T[c];
      if (!(n > 0) || !(t > 0)) { d[c] = 0; arm[c] = 1; pi0[c] = 0; continue; }
      const o = 5 * c;
      let dc = (W[o + 3] + W[o + CITY] + P.DL_HERD * W[o + 1] + P.DL_FISH * W[o + 2]) / t;
      dc = Math.min(1, dc + (1 - dc) * ind[c]);
      d[c] = dc; arm[c] = (1 + P.M_HERD * W[o + 1] / t) * (1 + ky * pp.goods[c] / n);
      let ex = 0, deg = 0;
      for (let e = E.off[c]; e < E.off[c + 1]; e++) {
        if (E.hop[e]) continue;
        const b = E.nb[e]; deg++;
        if (K[b] > 0) ex += Math.max(0, 1 - N[b] / K[b]);
      }
      ex = deg ? ex / deg : 0;
      this.ex[c] = ex;
      pi0[c] = P.B_LOC * Math.exp(Math.min(zc[c] / P.Z_MIL, 600)) * (1 + P.K_RUG * H.slope[c] / 0.01) * (1 + P.K_EXIT * ex);
    }
    // Classes (src/engine/classes.js): the claims, positions and elites' numbers, and the stress cohesion reads below.
    if (pp.classes) pp.classes.advance(dt);
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
      let r = 0, ry = 0, rn = 0;
      for (let e = cof[c]; e < cof[c + 1]; e++) {
        const b = cix[e], w = N[b] > 0 ? Math.exp(-((1 - si) * cS[e] + si * cI[e]) / Lc) : 0;
        wE[e] = w; r += w * N[b] * arm[b]; ry += w * pp.goods[b]; rn += w * N[b];
      }
      pi0[c] *= r; this.rA[c] = r; this.rY[c] = rn > 0 ? ry / rn : 0;
      this.nat[c] = 1 / (1 + Math.exp(-(pp.zl[c] - P.Z_NAT) / P.W_NAT));
    }
    // Each polity: its cohesion's weight, its reach, and the costs from its capital (its catchment's
    // near it, else the capital to its market, the markets' route, the market to the place).
    const live = this.live, own = rt.ownCost, node = rt.nodeOf, mo = rt.marketOf;
    for (const k of live) {
      const q = list[k], cap = q.cap, zk = zc[cap];
      q.w = q.coh * Math.exp(Math.min(zk / P.Z_MIL, 600));
      q.L = this.reachAt(zk); q.sI = ind[cap]; q.m0 = mo[cap]; q.o0 = own[node[cap]];
      q.LP = P.F_PROJ > 0 ? P.L_PROJ * (q.ind || 0) / ((q.ind || 0) + P.I_PROJ) : 0;   // steam navies: some industry builds them
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
    // The polities projecting power past their own people (landing 1 of batch 2b; synthesis): those whose
    // core has industry (steam navies).
    const proj = live.filter(k => list[k].LP > 1e-3 * P.L_PROJ), rA = this.rA, nat = this.nat;
    // The candidates: the polities holding among each place's region, each by its arms there × its
    // cohesion × its capital's reach (Boulding's gradient), and those projecting power to it: F_PROJ of
    // the region's own arms (garrisons and the troops raised there, the sepoys) × its cohesion × e^{−cost/LP}
    // by the routes from its capital, the sea's cheap legs first. Knowledge lifts both, as its own arms:
    // the capital's e^{z/Z_MIL} against the place's resistance at its own, so a small state far ahead
    // holds a large region far away (Headrick's Tools of Empire, from memory). Each × how alike the
    // place is to its capital's people, and a schooled place resists strangers' rule × e^{−K_SELF (1 −
    // likeness)} (Gellner's principle that the political and the national unit be one; decolonization
    // and the breakup of empires by nation). The strongest KC a place.
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
      for (const k of proj) {
        let h = 0;
        while (h < nk && lk[h] !== k) h++;
        if (h === nk && nk < 64) { lk[nk] = k; la[nk] = 0; nk++; }
      }
      const o = KC * c;
      for (let h = 0; h < nk; h++) {
        const q = list[lk[h]], sm = ids.sim(c, q.cap), x = capCost(q, c);
        // The troops raised there are armed as their rulers are: the region's arms at the state's wealth
        // against the region's (a place's own, a city's or a village's, flipped neighbours apart).
        const lift = (1 + ky * (q.y || 0)) / (1 + ky * this.rY[c]);
        const arms = la[h] * Math.exp(-x / q.L) + (q.LP > 1e-3 * P.L_PROJ ? P.F_PROJ * rA[c] * lift * Math.exp(-x / q.LP) : 0);
        const v = q.w * arms * (1 + kin * sm) / (1 + kin) * Math.exp(-P.K_SELF * nat[c] * (1 - sm));
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
      // Stress (src/engine/classes.js, ψ) spends it too, frontier or not: the elites' quarrels and the commoners' risings.
      const psi = pp.classes ? pp.classes.psi[c] : 0;
      Sc[c] = Math.max(floor, asabiya(Sc[c], P.R_ASA * fr[c], P.D_ASA * (1 - fr[c]) + P.D_PSI * psi, dt));
    }
    // A state's cohesion is its people's, each by how alike they are to its capital's: the ruling
    // people's asabiya, not its subjects' (Turchin's core; an empire's colonies, subjects decaying
    // behind no frontier of their own, had drained its home's).
    for (const k of live) { const q = list[k]; q.area = 0; q.cw = 0; q.y = 0; q.ind = 0; }
    for (let c = 0; c < nL; c++) {
      if (own2[c] >= 0) list[own2[c]].area += H.area[c];
      for (let j = 0; j < KP; j++) {
        const k = id[KP * c + j];
        if (k < 0) break;
        const q = list[k], w = s[KP * c + j] * N[c], wk = w * ids.sim(c, q.cap);
        q.N += w; q.A += w * arm[c]; q.coh += wk * Sc[c]; q.cw += wk; q.f += w * fr[c]; q.y += wk * pp.goods[c] / Math.max(N[c], 1e-9); q.ind += wk * ind[c];
      }
    }
    for (const k of live) {
      const q = list[k];
      q.coh = q.cw > 0 ? q.coh / q.cw : P.COH0; q.f = q.N > 0 ? q.f / q.N : 0; q.y = q.cw > 0 ? q.y / q.cw : 0; q.ind = q.cw > 0 ? q.ind / q.cw : 0;   // its core's income a person, its industry
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
    this.recolour();
    this.snapshot();
  }

  /**
   * The Histomap's record (Fig. 9): every DT_HIST years (DT_HIST_IND with industry), the world's people, those
   * the states hold, and each state's holding at least HIST_MIN of them, at most HIST_K. Thinned to every other entry past
   * HIST_MAX entries (the oldest half), so the record stays bounded over any run.
   */
  snapshot() {
    const pp = this.pp, P = pp.P, t = pp.t, every = pp.econ && pp.econ.on ? P.DT_HIST_IND : P.DT_HIST;
    if (this.tHist !== null && t - this.tHist < every) return;
    this.tHist = t;
    let all = 0;
    for (let c = 0; c < pp.nL; c++) all += pp.Ntot[c];
    const rows = this.live.map(k => [k, this.list[k].N]).filter(([, n]) => n >= P.HIST_MIN * all).sort((a, b) => b[1] - a[1]).slice(0, P.HIST_K);
    this.hist.push({ t, all, held: this.heldN, k: Int32Array.from(rows, r => r[0]), n: Float32Array.from(rows, r => r[1]) });
    if (this.hist.length > P.HIST_MAX) { const h = this.hist, half = h.length >> 1; this.hist = h.slice(0, half).filter((_, i) => i % 2 === 0).concat(h.slice(half)); this.histThin = (this.histThin || 0) + 1; }
  }

  /** The Histomap's states: each one recorded, its hue's angle on the peoples' wheel and its capital's longitude (rad), for the figure's colours and order. */
  histStates() {
    const pp = this.pp, H = pp.H, out = {};
    for (const s of this.hist) for (const k of s.k) if (!(k in out)) { const q = this.list[k]; out[k] = { h: HUE(q.hue), lon: q.lon0 ?? (H.lon ? H.lon[q.cap] : 0), born: q.born, died: q.died }; }
    return out;
  }

  /**
   * The hue where a state seated at place c least resembles the others: the least of HUE_N hues from u0
   * of Σ w e^{−(Δu/HUE_SIG)²} over the live states but `self`, each weighed by its weight in `meet` (those
   * it meets), HUE_NEAR e^{−θ/HUE_L} by the arc θ between their capitals and HUE_ALL over the number
   * live, and the accent by HUE_RED.
   */
  pick(c, meet, self, u0) {
    const pp = this.pp, g = pp.planet.grid, cells = pp.cells, list = this.list, live = this.live;
    const hs = [0], ws = [HUE_RED], all = HUE_ALL / Math.max(1, live.length), a = g && cells ? 3 * cells[c] : -1;
    for (const o of live) {
      if (o === self) continue;
      const q = list[o];
      let w = (meet.get(o) || 0) + all;
      if (a >= 0) {
        const b = 3 * cells[q.cap], x = g.pos[a] * g.pos[b] + g.pos[a + 1] * g.pos[b + 1] + g.pos[a + 2] * g.pos[b + 2];
        w += HUE_NEAR * Math.exp(-Math.acos(Math.max(-1, Math.min(1, x))) / HUE_L);
      }
      hs.push(q.hue); ws.push(w);
    }
    let best = u0, bv = Infinity;
    for (let n = 0; n < HUE_N; n++) {
      const u = (u0 + n / HUE_N) % 1;
      let v = 0;
      for (let m = 0; m < hs.length; m++) { const x = hueGap(u, hs[m]) / HUE_SIG; v += ws[m] * Math.exp(-x * x); }
      if (v < bv - 1e-12) { bv = v; best = u; }
    }
    return best;
  }

  /**
   * Keep states that meet apart in hue. Two meet across a border, in a place both hold (a contested
   * march, drawn striped) or across less than SEA_TOUCH km of sea; largest first, each state within
   * HUE_CLASH of a larger one it meets takes the hue where it least resembles the others (`pick`, those it
   * meets weighed 1 if larger and ½ if smaller), so the large keep theirs and a change lands where it's
   * smallest. Drawing only: it draws nothing from the stream, so the run is the same.
   */
  recolour() {
    const pp = this.pp, nL = pp.nL, E = pp.E, id = this.id, s = this.s, d = this.d, list = this.list;
    const meet = new Map(this.live.map(k => [k, new Set()]));
    const tie = (a, b) => { if (a !== b && a >= 0 && b >= 0) { meet.get(a).add(b); meet.get(b).add(a); } };
    const own = new Int32Array(nL);
    for (let c = 0; c < nL; c++) own[c] = this.owner(c);
    for (let c = 0; c < nL; c++) {
      if (id[KP * c + 1] >= 0 && s[KP * c + 1] >= 0.2 * d[c]) tie(id[KP * c], id[KP * c + 1]);
      if (own[c] < 0) continue;
      for (let e = E.off[c]; e < E.off[c + 1]; e++) if (!E.hop[e] || E.km[e] < SEA_TOUCH) tie(own[c], own[E.nb[e]]);
    }
    const order = [...this.live].sort((a, b) => list[b].N - list[a].N || list[a].born - list[b].born);
    const rank = new Map(order.map((k, i) => [k, i]));
    for (const k of order) {
      const q = list[k], near = meet.get(k), rk = rank.get(k);
      let clash = false;
      for (const o of near) if (rank.get(o) < rk && hueGap(list[o].hue, q.hue) < HUE_CLASH) { clash = true; break; }
      if (!clash) continue;
      const w = new Map();
      for (const o of near) w.set(o, rank.get(o) < rk ? 1 : 0.5);
      q.hue = this.pick(q.cap, w, k, q.hue);
    }
  }

  /** A polity founded at c, holding its free share; its hue apart from those in its catchment's. */
  found(c, free) {
    const pp = this.pp, P = pp.P, rt = pp.routes, id = this.id, s = this.s, k = this.list.length;
    const meet = new Map();
    if (rt) for (let e = rt.catch.off[c]; e < rt.catch.off[c + 1]; e++) {
      const b = rt.catch.idx[e];
      for (let j = 0; j < KP; j++) { const q = id[KP * b + j]; if (q < 0) break; meet.set(q, 1); }
    }
    // Two draws a founding, the stream's count from when a look was a hue and an angle, so the run is the
    // same: the first starts the search.
    const u0 = this.rng.uniform(); this.rng.uniform();
    const hue = this.pick(c, meet, -1, u0);
    if (this.first === null) this.first = pp.t;
    this.list.push({ cap: c, coh: this.S[c], born: pp.t, died: null, hue, N: 0, A: 0, P: 0, L: 0, f: 0, sI: 0, area: 0, peakN: 0, peakT: pp.t, peakA: 0, parent: null, lon0: pp.H.lon ? pp.H.lon[c] : 0, lat0: pp.H.lat ? pp.H.lat[c] : 0 });
    this.live.push(k);
    // It unites its region: the free share of each place in its catchment, e-fold over its reach (a
    // chiefdom's confederation; from one place, the region's resistance stopped every founding). Its
    // founders bring their own cohesion, COH0, to the places they take by the share taken (Ibn Khaldun's
    // dynasty, its asabiya spent over a few generations; founded at a decayed core's, successor states
    // died young, and a collapse's gaps stood stateless for centuries).
    const S = this.S, d0 = this.d[c];
    this.claim(c, k, free);
    if (d0 > 0) S[c] += Math.max(0, P.COH0 - S[c]) * Math.min(1, free / d0);
    if (rt) {
      const L = this.reachAt(pp.zc[c]), si = pp.ind[c], { off, idx, cS, cI } = rt.catch;
      for (let e = off[c] + 1; e < off[c + 1]; e++) {
        const b = idx[e], d = this.d[b];
        if (!(d > 0)) continue;
        let h = 0;
        for (let j = 0; j < KP; j++) { if (id[KP * b + j] < 0) break; h += s[KP * b + j]; }
        const f = (d - h) * Math.exp(-((1 - si) * cS[e] + si * cI[e]) / L);
        if (f > 0.05 * d) { this.claim(b, k, f); S[b] += Math.max(0, P.COH0 - S[b]) * Math.min(1, f / d); }
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

  /**
   * n settlers from place a into b across the sea (People.diffuse's crossings, voyages): b's allegiance
   * mixes with theirs by people, so a colony of settlers holds to their state (synthesis: settler
   * colonies, against the conquered). Allegiance then relaxes toward power as everywhere.
   */
  carry(a, b, n) {
    const N = this.pp.Ntot, f = n / Math.max(N[b] + n, 1e-12), id = this.id, s = this.s;
    if (!(f > 0) || id[KP * a] < 0 && id[KP * b] < 0) return;
    for (let j = 0; j < KP; j++) { if (id[KP * b + j] < 0) break; s[KP * b + j] *= 1 - f; }
    for (let j = 0; j < KP; j++) {
      const k = id[KP * a + j];
      if (k < 0) break;
      let cur = 0, has = false;
      for (let i = 0; i < KP; i++) if (id[KP * b + i] === k) { cur = s[KP * b + i]; has = true; break; }
      const v = cur + f * s[KP * a + j];
      if (v > this.pp.P.S_MIN && (has || id[KP * b + KP - 1] < 0 || v > s[KP * b + KP - 1])) this.claim(b, k, v);
    }
  }

  /** The effective number of states (Hill's order 2 over the people each holds), the largest's share of them, the people held, and the largest's people and area (km², the places it owns). */
  count() {
    let all = 0, sq = 0, top = 0, area = 0;
    for (const k of this.live) {
      const q = this.list[k], n = q.N;
      all += n; sq += n * n; if (n > top) top = n; if (q.area > area) area = q.area;
      if (n > q.peakN) { q.peakN = n; q.peakT = this.pp.t; }
      if (q.area > q.peakA) q.peakA = q.area;
    }
    // Each state's peak share of the world's people (the states survey's great states: tools/people/states-survey.mjs).
    let world = 0;
    for (let c = 0; c < this.pp.nL; c++) world += this.pp.Ntot[c];
    if (world > 0) for (const k of this.live) { const q = this.list[k]; q.peakS = Math.max(q.peakS || 0, q.N / world); }
    this.nStates = all > 0 ? all * all / sq : 0;
    this.topShare = all > 0 ? top / all : 0;
    this.heldN = all; this.topN = top; this.topArea = area;
    return this.nStates;
  }

  /** The share of place c's deliverers its states hold (0–1). */
  held(c) { const d = this.d[c]; if (!(d > 0)) return 0; let h = 0; for (let j = 0; j < KP; j++) { if (this.id[KP * c + j] < 0) break; h += this.s[KP * c + j]; } return Math.min(1, h / d); }
  /** How much of trade (or, at B, of another flow) between places a and b a border leaves: 1 within one state or between the stateless, B across one, mixed by their shares. */
  border(a, b, B = this.pp.P.B_TRADE) {
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
   * The States map's fields, three vec4s a cell of the people's grid (as the Culture map's,
   * src/engine/peoples.js, `drawn`): the first the hues of the place's two bands, each (cos, sin) of its
   * wheel angle × the share F its two largest states hold of those who deliver; the second's x F alone (so
   * the shader can tell a band's hue turning from its share falling). A place one state holds is one hue
   * in both bands; where the second holds past MARCH its band turns to the second's hue, so a contested
   * place is striped equally in both. The bands go by the states' order, not their shares, so a march's
   * stripes keep their colours across it while the larger flickers place by place. The third's x the
   * fishers' parcels (Settlement, Density).
   */
  drawn(out = null) {
    const pp = this.pp, n = pp.planet.grid.n, id = this.id, s = this.s, list = this.list;
    out = out || new Float32Array(12 * n); out.fill(0);
    for (let c = 0; c < pp.nL; c++) {
      const o = 12 * pp.cells[c], d = Math.max(this.d[c], 1e-9), k0 = id[KP * c], k1 = id[KP * c + 1];
      out[o + 8] = pp.fishU ? pp.fishU[c] : 0;
      if (k0 < 0) continue;
      const f1 = k1 >= 0 ? Math.min(1, s[KP * c + 1] / d) : 0, F = Math.min(1, s[KP * c] / d + f1);
      const h0 = HUE(list[k0].hue), x0 = Math.cos(h0), y0 = Math.sin(h0);
      let x1 = x0, y1 = y0;
      if (k1 >= 0) {
        const t = smooth((f1 - MARCH[0]) / (MARCH[1] - MARCH[0])), h1 = HUE(list[k1].hue);
        x1 = (1 - t) * x0 + t * Math.cos(h1); y1 = (1 - t) * y0 + t * Math.sin(h1);
      }
      const sw = k1 >= 0 && k1 < k0;
      out[o] = F * (sw ? x1 : x0); out[o + 1] = F * (sw ? y1 : y0);
      out[o + 2] = F * (sw ? x0 : x1); out[o + 3] = F * (sw ? y0 : y1);
      out[o + 4] = F;
    }
    return out;
  }

  /** Each place's strongest polity where it holds most of those who deliver, else −1. */
  owner(c) { const k = this.id[KP * c]; return k >= 0 && this.s[KP * c] >= 0.5 * this.d[c] && this.d[c] > 0 ? k : -1; }

  /** The capitals of the states holding at least N_MARK people, for drawing: position and people, four a capital. */
  capitals() {
    const pp = this.pp, g = pp.planet.grid, caps = [];
    for (const k of this.live) {
      const q = this.list[k];
      if (!(q.N >= pp.P.N_MARK)) continue;
      const i = pp.cells[q.cap];
      caps.push(g.pos[3 * i], g.pos[3 * i + 1], g.pos[3 * i + 2], q.N);
    }
    return Float32Array.from(caps);
  }
}
