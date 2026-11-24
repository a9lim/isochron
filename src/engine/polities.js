// States (batch 2a, landing 1; docs/MODEL.md): who people deliver to. Marks:
// standard, synthesis, speculation; the whole is synthesis and its values speculation.
//
// A polity is the places still delivering grain, labour or tax along the routes to a centre. It isn't an
// agent: it decides nothing, and everything it does is a flux. The table holds each polity's capital,
// cohesion and colours; each cell holds its allegiance to its KP strongest, a share of its people each,
// the rest stateless. Territory is soft (a contested march is a split cell); borders are where it turns.
//
//   power       P = cohesion × arms, the people delivering × the horse (M_HERD a herder, fading with gunpowder) × e^{z/Z_MIL}
//               at the capital's production, projected to each place as P e^{−cost/L} (Boulding's
//               loss-of-strength gradient, 1962, standard, from memory), cost by the routes from the
//               capital (src/engine/routes.js: the markets' costs, the catchment's near the capital),
//               L = C_POL0 + K_POL × the trade's reach at production, softly at most
//               L_POLMAX (a state's hold reaches less far than its trade: steam made the world one
//               market, not one state); × (1 + K_KIN sim)/(1 + K_KIN) by how alike the place's people
//               are to the state's own identity, its rulers' (strangers resist).
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
//   core        a state's cohesion is its people's by how alike they are to its rulers (Turchin's
//               core): subjects decaying behind no frontier of their own don't drain their rulers'.
// Secession (batch 3b; synthesis, the values speculation): a held city in a region its state is losing (its
// resistance π₀ against the state's candidate power v there, as allegiance weighs them: ρ = π₀/v) may, as far
// as the region is organized (its cohesion A: a province's elite, a settler frontier, a schooled nation,
// whose floor rises to A_NAT), found a successor instead of drifting stateless, at R_SEC × x²/(1 + x²) ×
// ρ^G/(1 + ρ^G) × A²/(A² + A_ORG²) × (1 + K_SECP ψ) a year (G = SEC_G), x its city's people (or, once
// schooled, its nation's) over N_STATE, ψ its stress (src/engine/classes.js). ρ grows with the cost from the
// capital, the place's unlikeness and schooling (kin and K_SELF cut v) and the state's loss of heart; a
// subject people with no cohesion of its own only slips toward statelessness, as before. The successor takes its parent's holdings in
// its region, each place's by how much nearer it lies to the new seat than to the old capital, e^{−x_new/L} /
// (e^{−x_new/L} + e^{−x_old/L_old}) (uti possidetis: the parent's borders, not the nation's), with its founders'
// cohesion. One rule for a dynasty broken into its provinces, settler colonies breaking away while alike, and
// a schooled colony founding its own state. A schooled stateless place founds as its nation's people stand in
// for a city, × (1 + K_NATF × its schooling). The border norm (a9; Zacher's territorial integrity, from memory;
// speculation as a mechanism): once the media span the world, a state gains a place it doesn't hold at
// T_WAR × (1 + K_NORM × the media's span, the people's mean), so conquest slows and borders freeze.
// Capacity and tribute (batch 3c; synthesis, the values speculation):
//   identity    each state's own point on the torus, its rulers' (conquest elites, a9): its capital's people's
//               at founding, kept when its capital moves, drawn toward its capital's people over T_DYN
//               whatever the distance (a ruling few among many take their ways), and read wherever a state's
//               identity is (kin's welcome, the schooled's resistance, its core, its pull on its people and
//               its media's: src/engine/peoples.js), so a dynasty in a conquered city rules as strangers.
//   capacity    κ, a state's: of what it holds, the share it administers. From KAP0 at founding, war's
//               pressure (its borders' parity with peer states, as rivalry's) raises it over T_KUP toward a
//               ceiling rising with its capital's learning, KAP0 + (1 − KAP0) σ((z − Z_KAP)/W_KAP); peace lets it
//               fall over T_KDN toward KAP0, or once its people are schooled toward the ceiling (a written,
//               schooled bureaucracy holds: Weber's). Tilly's war made the state; Besley and Persson's capacity
//               as an investment (from memory). A successor keeps its parent's.
//   tribute     one flow (a9): a place sends its states' capitals what direct rule takes where they
//               administer it (κ) and F_TRIB of it where they don't (`take`: vassals keep their rent and pay
//               tribute), the rest of the vassals' share kept in the region (People.foodshed); where they
//               administer, K_RENT of the land elites' rent is tax (src/engine/classes.js: centralization).
//   the steppe  a place where herders are most of the people founds a herders' state, its capital a camp,
//               where their arms gather beside settled wealth in reach: x² = (1 + the horse) × the region's
//               herders × its settled people / N_CAMP² (Barfield's nomads, who needed the sown to milk), where
//               no state already rules them (× π₀^γ against the states' powers there), uniting
//               its region's herders. Herders deliver wholly to it, DL_HERD to a settled state; it reaches
//               as its riders do (× (1 + the horse × its camp's herders' share)), masses F_RIDE of its riders'
//               arms anywhere in reach (Barfield's imperial confederacy: the steppe fielded its men), and
//               administers its herders alone: it holds at most their share of a place, by that share of its
//               power, the riders and the sown two pools in allegiance (its herders first, the settled
//               sharing the rest). Its power past them is tribute: T_TRIB × ρ^γ/(1 + ρ^γ) of what a place's
//               administrators take, ρ^γ that power's against the others' and the place's own as allegiance
//               weighs them, to its camp and its office (goods and lives move, allegiance doesn't); the
//               stateless share, with no one to pay, is raided, W_RAID × the tribute's share of its people a
//               year dying. Its camp is its herders' most armed place held. Conquest: a settled state's city
//               of N_STATE or more paying it tribute falls at R_SEC × ψ × ρ^γ/(1 + ρ^γ) a year, where stress
//               breaks the settled (Turchin's mirror empires; the factions that let the riders in): it takes
//               the state's holdings nearer the city as a successor does and its administration (the larger
//               κ), and moves its seat there, a settled state ruled by a dynasty from the steppe (Ibn
//               Khaldun's cycle with its actors). Gunpowder closes the steppe: the horse's edge M_HERD fades as
//               the world's best production passes Z_GUN over W_GUN (Perdue, from memory).
// What states do (landing 2): each place's national share of its cities' food goes to its states'
// capitals and the capitals' works labour back to it (People.foodshed, feed: roads and works out from
// the centre); the state's granaries widen its places' stores (G_STATE); a border in trade's kernel
// (B_TRADE, `border`); war's costs where allegiance moves (W_DEATH of the people changing hands,
// W_WORKS of the works, the land's and industry's, by the share moved); rivalry with peer states lifts new ideas (K_RIVAL, `rv`;
// contested, so weak, beside the border's cut in trade and the copying that rides on it).
// Read back: each place's identity pulled toward its state's (src/engine/peoples.js; a9: softly).
// Drawn on the States map (`drawn`): each polity a hue, free on the peoples' wheel and measured along its
// path in OKLab so that equal steps look equally different (`HUE`), picked where it least resembles the
// hues of the states it meets, then of those near, then of the world's (`pick`: a sum of Gaussians in the
// hues' distance), at its founding and again when it meets a larger state of nearly its hue (`recolour`;
// states outgrow the region they were founded in). A contested place is striped equally in both states'
// hues. The capitals as marks (`capitals`); counted (`count`): the effective number of states.
import { stream } from '../rng.js';
import { CITY, wrap } from './peoples.js';

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
    this.dH = new Float64Array(nL);               // the share with something to deliver to a herders' state (its herders wholly)
    this.dK = new Float64Array(nL);               // the share a herders' state can administer: its herders
    this.rH = new Float64Array(nL); this.rSo = new Float64Array(nL);   // its region's herders and settled people (farmers and cities), by the kernel
    this.tribK = new Int32Array(nL).fill(-1);     // the herders' state its tribute goes to, or −1
    this.tribT = new Float64Array(nL);            // the share of what its administrators take that goes to it
    this.mH = pp.P.M_HERD;                        // the horse's edge now (M_HERD, fading with gunpowder)
    this.S = new Float64Array(nL).fill(pp.P.COH0); // each place's cohesion (asabiya)
    this.ex = new Float64Array(nL);               // the spare room among its land neighbours (its people's exit; src/engine/classes.js reads it too)
    this.fr = new Float64Array(nL);               // its metaethnic frontier's weight
    this.rv = new Float64Array(nL).fill(1);       // its new ideas' lift by its states' rivals
    this.cid = new Int32Array(KC * nL); this.cpi = new Float64Array(KC * nL);
    this.list = [];                               // every polity yet: { cap, coh, born, died, hue, N, A, P, L, f; X (its identity), kap (its fiscal capacity), camp (a herders' state), steppe (founded as one); peakN, peakT, peakA, parent; O, pos, rev (office: src/engine/classes.js) }
    this.hist = []; this.tHist = null;            // the Histomap's record: each state's people every DT_HIST years (`snapshot`)
    this.secs = [];                               // every secession: { t, parent, child, c, alike, overseas, nat, ind } (the states survey)
    this.dyns = [];                               // every conquest dynasty, a herders' state moving into a city it took: { t, k, from, c, alike, N, area } (the survey)
    this.mass = null;                             // each place's landmass by land alone (`massOf`)
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
    // Gunpowder closes the steppe (Perdue's China Marches West, from memory): the horse's edge fades as the
    // world's best production passes Z_GUN (firearms, and the logistics that carry them onto the steppe).
    let gs = 0, ns = 0, zt = 0;
    for (let c = 0; c < nL; c++) { gs += pp.goods[c]; ns += N[c]; if (N[c] > 0 && zc[c] > zt) zt = zc[c]; }
    const yW = this.yW = gs > 0 && ns > 0 ? gs / ns : 0, ky = yW > 0 ? P.K_ARM / yW : 0;
    const mH = this.mH = P.M_HERD / (1 + Math.exp(Math.min(60, (zt - P.Z_GUN) / P.W_GUN))), dH = this.dH;
    for (let c = 0; c < nL; c++) {
      const n = N[c], t = T[c];
      if (!(n > 0) || !(t > 0)) { d[c] = 0; dH[c] = 0; arm[c] = 1; pi0[c] = 0; continue; }
      const o = 5 * c;
      let dc = (W[o + 3] + W[o + CITY] + P.DL_HERD * W[o + 1] + P.DL_FISH * W[o + 2]) / t;
      dc = Math.min(1, dc + (1 - dc) * ind[c]);
      // Herders deliver wholly to a herders' state (every herder a rider), DL_HERD to a settled one.
      d[c] = dc; dH[c] = Math.min(1, dc + (1 - P.DL_HERD) * W[o + 1] / t * (1 - ind[c]));
      arm[c] = (1 + mH * W[o + 1] / t) * (1 + ky * pp.goods[c] / n);
      // Exit: the spare room among its land neighbours by the one potential (People.diffuse: crowding
      // against real income, N/(K + goods); before industry the land's room): Domar's free land, Carneiro's.
      let ex = 0, deg = 0;
      const gd = pp.goods;
      for (let e = E.off[c]; e < E.off[c + 1]; e++) {
        if (E.hop[e]) continue;
        const b = E.nb[e], Yb = K[b] + (gd ? Math.max(0, gd[b]) : 0); deg++;
        if (Yb > 0) ex += Math.max(0, 1 - N[b] / Yb);
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
    const rH = this.rH, rSo = this.rSo;
    for (let c = 0; c < nL; c++) {
      const Lc = this.reachAt(zc[c]), si = ind[c];
      let r = 0, ry = 0, rn = 0, rh = 0, rs = 0;
      for (let e = cof[c]; e < cof[c + 1]; e++) {
        const b = cix[e], w = N[b] > 0 ? Math.exp(-((1 - si) * cS[e] + si * cI[e]) / Lc) : 0;
        wE[e] = w; r += w * N[b] * arm[b]; ry += w * pp.goods[b]; rn += w * N[b];
        if (w > 0 && T[b] > 0) { rh += w * N[b] * W[5 * b + 1] / T[b]; rs += w * N[b] * (W[5 * b + 3] + W[5 * b + CITY]) / T[b]; }
      }
      pi0[c] *= r; this.rA[c] = r; this.rY[c] = rn > 0 ? ry / rn : 0; rH[c] = rh; rSo[c] = rs;
      this.nat[c] = 1 / (1 + Math.exp(-(pp.zl[c] - P.Z_NAT) / P.W_NAT));
    }
    // Each polity: its cohesion's weight, its reach, and the costs from its capital (its catchment's
    // near it, else the capital to its market, the markets' route, the market to the place).
    // A herders' state's reach is its riders': × (1 + the horse's edge × its camp's herders' share).
    // Each state's identity, its rulers' (conquest elites, a9): drawn toward its capital's people's
    // over T_DYN, whatever the distance (a ruling few among many take their subjects' ways: the
    // conformist case), so a dynasty that moves into a conquered city rules as strangers until it
    // assimilates.
    const live = this.live, own = rt.ownCost, node = rt.nodeOf, mo = rt.marketOf, TOR = P.TOR, fX = 1 - Math.exp(-dt / P.T_DYN), X = ids.X;
    for (const k of live) {
      const q = list[k], cap = q.cap, zk = zc[cap];
      q.w = q.coh * Math.exp(Math.min(zk / P.Z_MIL, 600));
      q.L = this.reachAt(zk) * (q.camp && T[cap] > 0 ? 1 + mH * W[5 * cap + 1] / T[cap] : 1); q.sI = ind[cap]; q.m0 = mo[cap]; q.o0 = own[node[cap]];
      const a = T[cap] > 0 ? (ids.lead[cap] >= 0 ? ids.lead[cap] : ids.main(cap)) : -1;
      if (a >= 0) for (let i = 0; i < 2; i++) { const x = q.X[i] + fX * wrap(X[2 * a + i] - q.X[i], TOR); q.X[i] = ((x % TOR) + TOR) % TOR; }
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
    // And the herders' states, whose riders mass: F_RIDE of a camp's riders' arms (its herders held × their
    // arms) reach any place by its reach as its own arms there do (Barfield's imperial confederacy, from
    // memory: the steppe's armies were its men, mobile and massed, so a thin steppe could field what a
    // crowded plain did). Bounded by the herders it holds, and ruling the settled only where stress lets it in.
    const proj = live.filter(k => list[k].LP > 1e-3 * P.L_PROJ || (list[k].camp && list[k].R > 0)), rA = this.rA, nat = this.nat;
    // The candidates: the polities holding among each place's region, each by its arms there × its
    // cohesion × its capital's reach (Boulding's gradient), and those projecting power to it: F_PROJ of
    // the region's own arms (garrisons and the troops raised there, the sepoys) × its cohesion × e^{−cost/LP}
    // by the routes from its capital, the sea's cheap legs first. Knowledge lifts both, as its own arms:
    // the capital's e^{z/Z_MIL} against the place's resistance at its own, so a small state far ahead
    // holds a large region far away (Headrick's Tools of Empire, from memory). Each × how alike the
    // place is to its rulers (the state's own identity), and a schooled place resists strangers' rule × e^{−K_SELF (1 −
    // likeness)} (Gellner's principle that the political and the national unit be one; decolonization
    // and the breakup of empires by nation). The strongest KC a place.
    // A herders' state administers its herders alone: it holds at most their share of a place (`dK`), by
    // that share of its power, and allegiance doesn't move where it can't rule. Its power past what it
    // administers is tribute (`tribK`, `tribT`): T_TRIB × ρ^γ/(1 + ρ^γ) of what the place's administrators
    // take, ρ^γ that power's against the others' and the place's own as allegiance weighs them (Barfield's
    // outer frontier, from memory). The stateless share, with no one to pay, is raided: W_RAID × the
    // tribute's share of its people a year die. It takes the settled only by conquest (`conquer`, below).
    const cid = this.cid, cpi = this.cpi, kin = P.K_KIN, lk = new Int32Array(64), la = new Float64Array(64), psi = pp.classes ? pp.classes.psi : null;
    const tribK = this.tribK, tribT = this.tribT;
    cid.fill(-1); cpi.fill(0); tribK.fill(-1); tribT.fill(0);
    for (let c = 0; c < nL; c++) {
      if (!(d[c] > 0)) continue;
      const hd = this.dK[c] = T[c] > 0 ? W[5 * c + 1] / T[c] * (1 - ind[c]) : 0, adm = dH[c] > 0 ? hd / dH[c] : 1;
      let tv = 0;
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
        const q = list[lk[h]], sm = ids.simX(c, q.X), x = capCost(q, c);
        // The troops raised there are armed as their rulers are: the region's arms at the state's wealth
        // against the region's (a place's own, a city's or a village's, flipped neighbours apart).
        const lift = (1 + ky * (q.y || 0)) / (1 + ky * this.rY[c]);
        const arms = (la[h] + (q.camp ? P.F_RIDE * (q.R || 0) : 0)) * Math.exp(-x / q.L) + (q.LP > 1e-3 * P.L_PROJ ? P.F_PROJ * rA[c] * lift * Math.exp(-x / q.LP) : 0);
        let v = q.w * arms * (1 + kin * sm) / (1 + kin) * Math.exp(-P.K_SELF * nat[c] * (1 - sm));
        if (q.camp) { if ((1 - adm) * v > tv) { tv = (1 - adm) * v; tribK[c] = lk[h]; } v *= adm; }
        if (!(v > cpi[o + KC - 1])) continue;
        let r = KC - 1;
        while (r > 0 && cpi[o + r - 1] < v) { cpi[o + r] = cpi[o + r - 1]; cid[o + r] = cid[o + r - 1]; r--; }
        cpi[o + r] = v; cid[o + r] = lk[h];
      }
      if (tribK[c] >= 0) {
        let den = Math.pow(pi0[c], P.POL_G);
        for (let j = 0; j < KC; j++) { const k = cid[o + j]; if (k < 0) break; if (k !== tribK[c]) den += Math.pow(cpi[o + j], P.POL_G); }
        const rg = den > 0 ? Math.pow(tv, P.POL_G) / den : Infinity;
        tribT[c] = P.T_TRIB * (rg === Infinity ? 1 : rg / (1 + rg));
      }
    }
    // Allegiance: each place's shares toward their targets over T_WAR; gains by a state that doesn't hold the
    // place over T_WAR × (1 + K_NORM × the media's span: the border norm).
    let mw = 0, mn = 0;
    if (P.K_NORM > 0) for (let c = 0; c < nL; c++) { if (!(N[c] > 0)) continue; const l = ids.idL(pp.zl[c]) / P.L_WORLD; mw += N[c] * (1 - Math.exp(-l * l)); mn += N[c]; }
    this.norm = mn > 0 ? mw / mn : 0;
    const g = P.POL_G, a = 1 - Math.exp(-dt / P.T_WAR), aN = 1 - Math.exp(-dt / (P.T_WAR * (1 + P.K_NORM * this.norm))), flux = this.flux;
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
      // The herders' states first, by everyone's powers, together at most the place's herders (`dK`); the
      // settled states share the rest, d less what those herders would have delivered them, by their powers
      // against the place's own (the riders and the sown are two pools: with no herders' state, one).
      let den = Math.pow(pi0[c], g), den2 = den, U = 0;
      for (let i = 0; i < n; i++) { const p = Math.pow(up[i], g); den += p; if (!list[uk[i]].camp) den2 += p; }
      if (den > 0) for (let i = 0; i < n; i++) if (list[uk[i]].camp) U += dH[c] * Math.pow(up[i], g) / den;
      const sk = U > this.dK[c] ? this.dK[c] / U : 1, pool = Math.max(0, d[c] - P.DL_HERD * U * sk);
      let moved = 0;
      const own0 = id[o] >= 0 && s[o] >= 0.5 * d[c] ? id[o] : -1;
      for (let i = 0; i < n; i++) {
        const tg = den > 0 && d[c] > 0 ? (list[uk[i]].camp ? sk * dH[c] * Math.pow(up[i], g) / den : den2 > 0 ? pool * Math.pow(up[i], g) / den2 : 0) : 0;
        un[i] = us[i] + (tg - us[i]) * (tg > us[i] && uk[i] !== own0 ? aN : a);
        moved += Math.abs(un[i] - us[i]);
      }
      flux[c] = 0.5 * moved * N[c] / dt;
      // War's costs where allegiance moves (speculation): W_DEATH of the people changing hands (war's
      // deaths and flight), W_WORKS of the place's works by the share moved (canals breached, terraces
      // let go, the libraries burned).
      const mv = d[c] > 0 ? Math.min(1, 0.5 * moved / d[c]) : 0;
      if (mv > 1e-6) {
        // (F_FLEE of the toll flee to the neighbours' room, carrying who they are, not their state: People.flee)
        const lost = N[c] * P.W_DEATH * 0.5 * moved, fled = P.F_FLEE > 0 && pp.flee ? pp.flee(c, P.F_FLEE * lost) : 0;
        N[c] -= lost - fled;
        const kw = 1 - P.W_WORKS * mv;
        pp.works[c] *= kw;
        for (const kind of Object.values(pp.wk)) kind[c] *= kw;
        for (const kind of Object.values(pp.wi)) kind[c] *= kw;   // industry's works too: a city fought over loses its factories (batch 3f)
        if (pp.classes && pp.classes.e) for (let w = 1; w < 5; w++) pp.classes.e[5 * c + w] *= kw;   // and its organizers (coordination, batch 3f: war's toll on works has an organizational half)
      }
      // Keep the strongest KP.
      for (let j = 0; j < KP; j++) {
        let b = -1;
        for (let i = 0; i < n; i++) if (uk[i] >= 0 && un[i] > P.S_MIN && (b < 0 || un[i] > un[b])) b = i;
        if (b < 0) { for (let r = j; r < KP; r++) { id[o + r] = -1; s[o + r] = 0; } break; }
        id[o + j] = uk[b]; s[o + j] = un[b]; uk[b] = -1;
      }
      // Raids on the stateless share, which no state pays for.
      if (tribT[c] > 0 && P.W_RAID > 0) N[c] *= Math.exp(-P.W_RAID * tribT[c] * (1 - this.held(c)) * dt);
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
    // A state's cohesion is its people's, each by how alike they are to its rulers: the ruling
    // people's asabiya, not its subjects' (Turchin's core; an empire's colonies, subjects decaying
    // behind no frontier of their own, had drained its home's).
    // A herders' state's herders held and their arms (its riders), and its camp's place: the herders'
    // most armed place it holds.
    const city = pp.city;
    for (const k of live) { const q = list[k]; q.area = 0; q.cw = 0; q.y = 0; q.ind = 0; q.hN = 0; q.R = 0; q.bH = -1; q.vH = 0; }
    for (let c = 0; c < nL; c++) {
      const ko = own2[c];
      if (ko >= 0) {
        const q = list[ko];
        q.area += H.area[c];
        if (q.camp && T[c] > 0) { const vh = s[KP * c] * N[c] * W[5 * c + 1] / T[c] * arm[c]; if (vh > q.vH) { q.vH = vh; q.bH = c; } }
      }
      for (let j = 0; j < KP; j++) {
        const k = id[KP * c + j];
        if (k < 0) break;
        const q = list[k], w = s[KP * c + j] * N[c], wk = w * ids.simX(c, q.X);
        q.N += w; q.A += w * arm[c]; q.coh += wk * Sc[c]; q.cw += wk; q.f += w * fr[c]; q.y += wk * pp.goods[c] / Math.max(N[c], 1e-9); q.ind += wk * ind[c];
        if (q.camp && T[c] > 0) { const h = Math.min(s[KP * c + j], W[5 * c + 1] / T[c]) * N[c]; q.hN += h; q.R += h * arm[c]; }
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
    // Fiscal capacity, each state's (Tilly's war made the state; Besley and Persson's investment in it,
    // from memory): war's pressure on its borders, w their parity's share (as rivalry's), raises it over
    // T_KUP toward a ceiling rising with its capital's learning, KAP0 + (1 − KAP0) σ((z − Z_KAP)/W_KAP);
    // peace lets it fall over T_KDN toward a floor, KAP0 until its people are schooled and then the
    // ceiling's (a written, schooled bureaucracy holds: Weber's). Stepped exactly (linear in κ).
    for (const k of live) {
      const q = list[k], w = q.ra > 0 ? q.rb / q.ra : 0, zk = zc[q.cap];
      const top = P.KAP0 + (1 - P.KAP0) / (1 + Math.exp(-(zk - P.Z_KAP) / P.W_KAP)), lo = P.KAP0 + (top - P.KAP0) * nat[q.cap];
      const ru = w / P.T_KUP, rd = (1 - w) / P.T_KDN, r = ru + rd, tg = r > 0 ? (ru * top + rd * lo) / r : q.kap;
      q.kap = tg + (q.kap - tg) * Math.exp(-r * dt);
    }
    // A herders' state's camp is at its centre of arms, the herders' most armed place it holds (a camp
    // lost, × CAP_LOSS). Capitals lost move to the largest city held; polities too small are gone.
    for (const k of live) {
      const q = list[k];
      if (q.camp && q.N >= P.N_DIE) {
        if (q.bH >= 0) { if (own2[q.cap] !== k) q.coh *= P.CAP_LOSS; q.cap = q.bH; continue; }
        q.camp = false;   // no herders held: settled where it can be, as any state
      }
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
    // Secession: each held city's region against its state's hold there, the likeliest first.
    if (city && P.R_SEC > 0) {
      const sec = [], cl = pp.classes;
      for (let c = 0; c < nL; c++) {
        const k = this.owner(c);
        if (k < 0 || c === list[k].cap) continue;
        const x = Math.max(city[c], nat[c] * N[c]) / P.N_STATE;
        if (!(x > 0)) continue;
        let v = 0;
        for (let j = 0; j < KC; j++) if (cid[KC * c + j] === k) { v = cpi[KC * c + j]; break; }
        const rg = v > 0 ? Math.pow(pi0[c] / v, P.SEC_G) : Infinity, A2 = Sc[c] * Sc[c];
        const r = P.R_SEC * x * x / (1 + x * x) * (rg === Infinity ? 1 : rg / (1 + rg)) * A2 / (A2 + P.A_ORG * P.A_ORG) * (1 + P.K_SECP * (cl ? cl.psi[c] : 0));
        if (r > 1e-9) sec.push([c, k, r]);
      }
      sec.sort((p, q) => q[2] - p[2]);
      for (const [c, k, r] of sec) {
        if (this.owner(c) !== k || list[k].died !== null || c === list[k].cap) continue;   // taken by a successor already
        if (this.rng.uniform() < 1 - Math.exp(-r * dt)) this.secede(c, k, capCost);
      }
    }
    // Conquest: a settled state's city that could seat a state (N_STATE's) and pays a herders' state tribute
    // falls to it at R_SEC × ψ × the tribute's saturation (ρ^γ/(1 + ρ^γ)) a year, the likeliest first: where
    // stress breaks the settled frontier the riders take it (the factions and risings that let them in).
    // The herders' state takes its holdings nearer the city (as a successor takes its parent's) and moves
    // its seat there: a settled state ruled by a dynasty from the steppe, its identity the steppe's and its
    // cohesion its core's (Ibn Khaldun's cycle with its actors).
    if (city && P.R_SEC > 0 && psi) {
      const cq = [];
      for (let c = 0; c < nL; c++) {
        const kc = tribK[c], ks = this.owner(c);
        if (kc < 0 || ks < 0 || list[ks].camp || !(city[c] >= P.N_STATE) || list[kc].died !== null || !list[kc].camp) continue;
        const r = P.R_SEC * Math.min(1, psi[c]) * tribT[c] / P.T_TRIB;
        if (r > 1e-9) cq.push([c, kc, ks, r]);
      }
      cq.sort((p, q) => q[3] - p[3]);
      for (const [c, kc, ks, r] of cq) {
        if (!list[kc].camp || this.owner(c) !== ks || list[ks].died !== null) continue;
        if (this.rng.uniform() < 1 - Math.exp(-r * dt)) this.conquer(c, kc, ks, capCost);
      }
    }
    // Founding: a place mostly stateless with a fed city, or once schooled its nation's people; or, where
    // herders are most of the people, a herders' state where their arms gather beside settled wealth in
    // reach, x² = (1 + the horse's edge) × the region's herders × its settled people / N_CAMP² (both needed:
    // Barfield's nomads, who needed the sown to milk), its capital a camp, where no state already rules
    // them (× π₀^γ against its own and the states' powers there: herders count free to a herders' state
    // where a settled one holds all it can of them).
    // (A herders' place founds by whichever of the two gathers more, its city or its riders.)
    if (city) for (let c = 0; c < nL; c++) {
      if (!(d[c] > 0)) continue;
      const xc = (Math.max(city[c], nat[c] * N[c]) / P.N_STATE) ** 2;
      const xh = P.N_CAMP > 0 && nat[c] <= 0.5 && T[c] > 0 && W[5 * c + 1] >= 0.5 * T[c] ? (1 + mH) * rH[c] * rSo[c] / (P.N_CAMP * P.N_CAMP) : 0;
      const herd = xh > xc;
      if (!herd && !(city[c] > 0 || nat[c] > 0.5)) continue;
      const dd = herd ? W[5 * c + 1] / T[c] * (1 - ind[c]) : d[c];   // a herders' state's founders are its herders
      let held = 0;
      for (let j = 0; j < KP; j++) { if (id[KP * c + j] < 0) break; held += s[KP * c + j]; }
      const free = Math.min(dd, (herd ? dH[c] : d[c]) - held);
      if (!(free > 0.5 * dd)) continue;
      let ride = 1;
      if (herd) { let pc = 0; for (let j = 0; j < KC; j++) { const k = cid[KC * c + j]; if (k < 0) break; pc += Math.pow(cpi[KC * c + j], P.POL_G); } const p0 = Math.pow(pi0[c], P.POL_G); ride = p0 + pc > 0 ? p0 / (p0 + pc) : 1; }
      const x2 = herd ? xh : xc, r = P.R_FORM * (herd ? ride : 1 + P.K_NATF * nat[c]) * x2 / (1 + x2) * free / dd;
      if (this.rng.uniform() < 1 - Math.exp(-r * dt)) this.found(c, free, herd);
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

  /**
   * A polity founded at c, holding its free share; its hue apart from those in its catchment's, its identity
   * its capital's people's, its fiscal capacity KAP0's. A herders' state (`camp`) holds its herders wholly,
   * reaches as its riders do and unites only its region's herders.
   */
  found(c, free, camp = false) {
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
    const ids = pp.ids, a = ids.T[c] > 0 ? (ids.lead[c] >= 0 ? ids.lead[c] : ids.main(c)) : -1;
    const X = a >= 0 ? [ids.X[2 * a], ids.X[2 * a + 1]] : [0, 0];
    this.list.push({ cap: c, coh: this.S[c], born: pp.t, died: null, hue, N: 0, A: 0, P: 0, L: 0, f: 0, sI: 0, area: 0, peakN: 0, peakT: pp.t, peakA: 0, parent: null, lon0: pp.H.lon ? pp.H.lon[c] : 0, lat0: pp.H.lat ? pp.H.lat[c] : 0, X, kap: P.KAP0, camp, steppe: camp });
    this.live.push(k);
    // It unites its region: the free share of each place in its catchment, e-fold over its reach (a
    // chiefdom's confederation; from one place, the region's resistance stopped every founding). Its
    // founders bring their own cohesion, COH0, to the places they take by the share taken (Ibn Khaldun's
    // dynasty, its asabiya spent over a few generations; founded at a decayed core's, successor states
    // died young, and a collapse's gaps stood stateless for centuries).
    const S = this.S, dd = camp ? this.dH : this.d, d0 = dd[c];
    this.claim(c, k, free);
    if (d0 > 0) S[c] += Math.max(0, P.COH0 - S[c]) * Math.min(1, free / d0);
    if (rt) {
      const L = this.reachAt(pp.zc[c]) * (camp && ids.T[c] > 0 ? 1 + this.mH * ids.W[5 * c + 1] / ids.T[c] : 1), si = pp.ind[c], { off, idx, cS, cI } = rt.catch;
      for (let e = off[c] + 1; e < off[c + 1]; e++) {
        const b = idx[e], d = dd[b];
        if (!(d > 0)) continue;
        let h = 0;
        for (let j = 0; j < KP; j++) { if (id[KP * b + j] < 0) break; h += s[KP * b + j]; }
        const fr = camp ? Math.min(d - h, ids.T[b] > 0 ? ids.W[5 * b + 1] / ids.T[b] * (1 - pp.ind[b]) : 0) : d - h;   // a herders' state unites its region's herders
        const f = fr * Math.exp(-((1 - si) * cS[e] + si * cI[e]) / L);
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
   * A successor founded at c out of polity k (secession, `advance`): a polity with k as its parent, its hue
   * apart from those it meets, holding each place of k's in its region by how much nearer the new seat is
   * than k's capital (`capCost`, the step's), its founders' cohesion brought to them. Recorded for the survey.
   */
  secede(c, k, capCost) {
    const pp = this.pp, P = pp.P, rt = pp.routes, id = this.id, s = this.s, S = this.S, q0 = this.list[k];
    const k2 = this.list.length;
    this.found(c, 0);
    const q = this.list[k2];
    q.parent = k; q.kap = q0.kap;   // its province's administration carried over
    const L = this.reachAt(pp.zc[c]), si = pp.ind[c], { off, idx, cS, cI } = rt.catch;
    for (let e = off[c]; e < off[c + 1]; e++) {
      const b = idx[e], db = this.d[b];
      if (!(db > 0)) continue;
      let j0 = -1;
      for (let j = 0; j < KP; j++) { if (id[KP * b + j] < 0) break; if (id[KP * b + j] === k) { j0 = j; break; } }
      if (j0 < 0) continue;
      const wn = Math.exp(-((1 - si) * cS[e] + si * cI[e]) / L), wo = Math.exp(-capCost(q0, b) / (q0.L || L)), f = s[KP * b + j0] * wn / (wn + wo);
      if (!(f > 0.05 * db)) continue;
      s[KP * b + j0] -= f;
      this.claim(b, k2, f);
      this.sortSlots(b);
      S[b] += Math.max(0, P.COH0 - S[b]) * Math.min(1, f / db);
    }
    const ids = pp.ids, m = this.massOf(), cap0 = q0.cap;
    this.secs.push({ t: pp.t, parent: k, child: k2, c, alike: ids.simX(c, q0.X), overseas: m[c] !== m[cap0], nat: this.nat[c], ind: pp.econ && pp.econ.on ? 1 : 0 });
  }

  /**
   * Herders' state kc conquers place c, a city of settled state ks (`advance`): it takes each place of ks's in
   * c's region by how much nearer c is than ks's capital (`capCost`, as `secede` splits), takes over its
   * administration (the larger fiscal capacity) and moves its seat to c, no longer a camp. Recorded for the survey.
   */
  conquer(c, kc, ks, capCost) {
    const pp = this.pp, rt = pp.routes, id = this.id, s = this.s, q = this.list[kc], q0 = this.list[ks];
    const L = this.reachAt(pp.zc[c]), si = pp.ind[c], { off, idx, cS, cI } = rt.catch;
    for (let e = off[c]; e < off[c + 1]; e++) {
      const b = idx[e], db = this.d[b];
      if (!(db > 0)) continue;
      let j0 = -1;
      for (let j = 0; j < KP; j++) { if (id[KP * b + j] < 0) break; if (id[KP * b + j] === ks) { j0 = j; break; } }
      if (j0 < 0) continue;
      const wn = Math.exp(-((1 - si) * cS[e] + si * cI[e]) / L), wo = Math.exp(-capCost(q0, b) / (q0.L || L)), f = s[KP * b + j0] * wn / (wn + wo);
      if (!(f > 0.05 * db)) continue;
      s[KP * b + j0] -= f;
      let cur = 0;
      for (let j = 0; j < KP; j++) if (id[KP * b + j] === kc) { cur = s[KP * b + j]; break; }
      this.claim(b, kc, cur + f);
      this.sortSlots(b);
    }
    this.dyns.push({ t: pp.t, k: kc, ks, from: q.cap, c, alike: pp.ids.simX(c, q.X), N: q.N, area: q.area, ind: pp.econ && pp.econ.on ? 1 : 0 });
    q.cap = c; q.camp = false; q.kap = Math.max(q.kap, q0.kap);
  }

  /** Place b's polities strongest first (a secession's split can leave them out of order). */
  sortSlots(b) {
    const id = this.id, s = this.s, o = KP * b;
    for (let i = 1; i < KP && id[o + i] >= 0; i++) for (let j = i; j > 0 && s[o + j] > s[o + j - 1]; j--) {
      [id[o + j], id[o + j - 1]] = [id[o + j - 1], id[o + j]]; [s[o + j], s[o + j - 1]] = [s[o + j - 1], s[o + j]];
    }
  }

  /** Each place's landmass by land alone (the land graph's edges that aren't sea crossings), made once. */
  massOf() {
    if (this.mass) return this.mass;
    const E = this.pp.E, nL = this.pp.nL, p = Int32Array.from({ length: nL }, (_, k) => k);
    const root = k => { while (p[k] !== k) k = p[k] = p[p[k]]; return k; };
    for (let c = 0; c < nL; c++) for (let e = E.off[c]; e < E.off[c + 1]; e++) if (!E.hop[e]) { const a = root(c), b = root(E.nb[e]); if (a !== b) p[a] = b; }
    return (this.mass = Int32Array.from({ length: nL }, (_, c) => root(c)));
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

  /** What a state's places send its capital of what direct rule would (`People.foodshed`, N_TAX): its fiscal capacity κ as tax, the rest as its vassals' tribute at F_TRIB. */
  take(k) { const q = this.list[k], kap = q.kap ?? 1; return kap + this.pp.P.F_TRIB * (1 - kap); }

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
