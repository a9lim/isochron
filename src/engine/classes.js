// Classes (batch 3a; docs/MODEL.md, docs/ROADMAP.md): who takes, beside who people are and whom they
// deliver to. Marks: the whole is synthesis and its values speculation; the sources from memory.
//
// Each way of life's people (src/engine/peoples.js, W) are commoners and an elite, the elite named by
// the claim it lives on (a9's axis, orthogonal to the way): the herders' nobility on the herds'
// increase, the fishers' chiefs on the catch, the farmers' aristocracy on the land's rent, and in the
// cities those who hold capital, merchants on the food the city takes in and, with industry, the
// bourgeoisie on capital's share of the place's goods (later the owners of compute and robots).
// Foragers hold no storable surplus, so no elite (Boehm's reverse dominance; Mattison and others on
// inequality's origins). Office is each state's own elite (a9): a stock in the polity table, spread
// across its places by where its take is gathered.
//
// In 3a the claims are accounts. The agrarian economy is a capacity (People.capAt: the people its food
// keeps), and its people settle where food a person is one, so a claim sets how many elite
// livelihoods it supports, not what anyone eats; the elites' consumption is made physical in 3f, when
// the economy reads the classes. What the classes do here is stress, and famine's split.
//
//   claims      each way's output, its food by source (People.wol: foraging, herding, the sea's, the
//               fields'), the city's what it takes in (People.imp) and, with industry, the place's
//               goods: a share θ_w of it the elite's, θ_w = TH_W × 1/(1 + exit/(X_EXIT (1 + K_COER h))),
//               exit the spare room among the place's land neighbours (Polities.ex) and h its states'
//               hold. Domar's hypothesis (1970): free land, free peasants and idle landlords can't all
//               three stand, so open land keeps the take low unless a state backs the landlords
//               (serfdom). The city's elite takes TH_W of its food and capital's ALPHA of its goods.
//               Where a state administers the place (its fiscal capacity κ, src/engine/polities.js), K_RENT
//               of the land elites' rent is its tax instead (centralization); its vassals keep theirs.
//   positions   the livelihoods a claim keeps: claim/(C_E ȳ), an elite living at C_E times the place's
//               mean income ȳ (status is relative, so the elite's share holds as incomes grow). Office's
//               are its state's revenue over C_E × the state's mean: the food its places deliver to its
//               capitals (People.foodshed's national share: tax where it administers, its vassals'
//               tribute where it doesn't), with industry N_TAX of their goods, and a herders' state's
//               tribute from the settled.
//   numbers     each way's elite share ε of its people, d ε/dt = (δ − K_CULL ψ) ε − μ (ε − p), p the
//               positions' share of the way's people, μ = 1/T_DOWN above it (elites past their positions
//               fall back over a generation and more) and 1/T_UP below (positions empty fill fast),
//               stepped exactly on each side of p (linear in ε). δ is the elites' growth past the
//               commoners': the cell's deaths past its well-fed floor (demography's density and famine
//               deaths, which the well-fed escape: Clark's survival of the richest, ~2%/yr at the
//               Malthusian ceiling), so famine falls on the commoners and raises the elite's share
//               (Sen's entitlements). Office the same, in people, its δ and ψ its places'.
//   stress      ψ = (1 − e^{−MMP/M0}) (1 − e^{−EMP/E0}) (1 + K_SFD SFD), soft in each: immiseration MMP
//               = ln⁺(Y_COMF/y) + K_FAM × famine, y the place's food and goods a person and famine its
//               deaths' rate; the elites' overproduction EMP = ln⁺ of the place's elite (its ways' and its
//               share of its state's office) over their positions; the state's fiscal strain SFD = ln⁺ of
//               its office over office's positions (Goldstone's political stress indicator; Turchin and
//               Nefedov's secular cycles). It speeds the place's loss of cohesion (Polities, D_PSI ψ),
//               and internal war kills W_IW ψ of its people a year and breaks W_IWW ψ of its works, where
//               no border moves, and culls the elites (K_CULL ψ), which resets the cycle. Where the dial
//               resolves the year, a bad harvest is a famine where it falls (People.realYears), and so a
//               revolt there.
import { WAYS, CITY } from './peoples.js';
import { KP } from './polities.js';

/** One elite share's exact step over h: dε/dt = (g − μ) ε + μ p, μ by ε's side of p, crossing p once at most. */
export function eliteStep(e, p, g, mUp, mDown, h, eMax = 0.5) {
  const run = (x, m, t) => {
    const a = g - m;
    if (Math.abs(a) < 1e-12) return x + m * p * t;
    const s = -m * p / a;
    return s + (x - s) * Math.exp(Math.max(-50, Math.min(50, a * t)));
  };
  const m = e > p ? mDown : mUp;
  let x = run(e, m, h);
  if ((e - p) * (x - p) < 0) {
    // Crossed p: the time to it on this side, then the other side's law from p for the rest.
    const a = g - m, s = Math.abs(a) < 1e-12 ? null : -m * p / a;
    const tc = s === null ? (p - e) / (m * p || 1e-30) : Math.log((p - s) / (e - s)) / a;
    x = Number.isFinite(tc) && tc > 0 && tc < h ? run(p, e > p ? mUp : mDown, h - tc) : p;
  }
  return Math.min(eMax, Math.max(0, x));
}

export class Classes {
  /** For a People `pp` (src/engine/people.js). */
  constructor(pp) {
    this.pp = pp;
    const nL = pp.nL;
    this.e = new Float64Array(WAYS * nL);     // each way's elite share of its people
    this.pos = new Float64Array(WAYS * nL);   // its positions (people)
    this.claim = new Float64Array(WAYS * nL); // its claim (sy/yr)
    this.psi = new Float64Array(nL);          // stress
    this.mmp = new Float64Array(nL); this.emp = new Float64Array(nL);
    this.rev = new Float64Array(nL);          // what the place's states take from it (sy/yr)
    this.dAcc = new Float64Array(nL); this.fAcc = new Float64Array(nL); this.tAcc = 0;   // the elites' growth past the commoners' and famine's rate, time-summed since the last step (People.step)
  }

  /** People.step's per-cell rates over its step: deaths past the well-fed floor, and famine's. */
  accrue(c, dEx, famine, dt) { this.dAcc[c] += dEx * dt; this.fAcc[c] += famine * dt; }

  /** Over a states' step (Polities.advance, before cohesion reads ψ): claims, positions, stress, numbers, internal war. */
  advance(dt) {
    const pp = this.pp, P = pp.P, nL = pp.nL, pol = pp.pol, ids = pp.ids, W = ids.W, T = ids.T, N = pp.Ntot;
    const K = pp.K, goods = pp.goods, wol = pp.wol, imp = pp.imp, e = this.e, pos = this.pos, claim = this.claim, list = pol.list;
    const tA = Math.max(this.tAcc, 1e-9), TH = P.TH_W;
    // Office's revenue: each place's food sent to its states' capitals (People.foodshed: the national
    // share of its cities' food, by the share each holds, less the way's loss), and N_TAX of its goods.
    for (const k of pol.live) { const q = list[k]; q.rev = 0; q.yN = 0; q.yY = 0; q.dN = 0; q.dD = 0; q.pN = 0; q.pS = 0; }
    const rev = this.rev, u = pp.uSent, dP = pp.dlvP, kP = pp.kP, Kown = pp.Kown;
    rev.fill(0);
    const take = this.takeBuf || (this.takeBuf = new Float64Array(nL * KP));   // each place's revenue to its KP states (by slot)
    take.fill(0);
    for (let c = 0; c < nL; c++) {
      if (!(N[c] > 0)) continue;
      for (let j = 0; j < KP; j++) {
        const k = pol.id[KP * c + j];
        if (k < 0) break;
        let r = 0;
        if (u && dP && kP) for (let i = 0; i < KP; i++) if (kP[KP * c + i] === k) r += u[c] * Kown[c] * dP[KP * c + i];
        if (pp.econ.on && pol.d[c] > 0) r += P.N_TAX * pol.take(k) * goods[c] * Math.min(1, pol.s[KP * c + j] / pol.d[c]);
        take[KP * c + j] = r; rev[c] += r; list[k].rev += r;
      }
      // A herders' state's tribute from the place (People.foodshed), to its office alone.
      const kt = pp.tribKk ? pp.tribKk[c] : -1;
      if (kt >= 0 && u && list[kt].died === null) { const r = u[c] * Kown[c] * pp.tribP[c]; rev[c] += r; list[kt].rev += r; }
    }
    // Each place: its ways' claims and positions, its income a person, its stress.
    const psi = this.psi, mmp = this.mmp, emp = this.emp;
    for (let c = 0; c < nL; c++) {
      const n = N[c], t = T[c], o = WAYS * c;
      if (!(n > 0) || !(t > 0)) { psi[c] = 0; mmp[c] = 0; emp[c] = 0; for (let w = 0; w < WAYS; w++) { e[o + w] = 0; pos[o + w] = 0; claim[o + w] = 0; } continue; }
      const y = (K[c] + goods[c]) / n, h = pol.held(c);
      const tk = 1 / (1 + (pol.ex ? pol.ex[c] : 0) / (P.X_EXIT * (1 + P.K_COER * h)));
      // Where its states administer it (their fiscal capacity κ by their shares), K_RENT of the land's rent is tax.
      let dr = 0;
      if (pol.d[c] > 0) for (let j = 0; j < KP; j++) { const k = pol.id[KP * c + j]; if (k < 0) break; dr += Math.min(1, pol.s[KP * c + j] / pol.d[c]) * (list[k].kap ?? 1); }
      const rent = 1 - P.K_RENT * Math.min(1, dr);
      let E = 0, Pw = 0;
      for (let w = 1; w < WAYS; w++) {
        const out = w === CITY ? (imp ? imp[c] : 0) : wol[o + w];
        const cl = TH[w] * tk * (w === CITY ? 1 : rent) * out + (w === CITY && pp.econ.on ? P.ALPHA * goods[c] : 0);
        claim[o + w] = cl; pos[o + w] = cl / (P.C_E * Math.max(y, 1e-6));
        const nw = n * W[o + w] / t;
        E += e[o + w] * nw; Pw += pos[o + w];
      }
      // Its share of its states' office, by the revenue it sends each.
      let Eo = 0, Po = 0, sfd = 0;
      for (let j = 0; j < KP; j++) {
        const k = pol.id[KP * c + j];
        if (k < 0) break;
        const q = list[k], f = q.rev > 0 ? take[KP * c + j] / q.rev : 0;
        Eo += f * (q.O || 0); Po += f * (q.pos || 0);
        const sh = pol.d[c] > 0 ? pol.s[KP * c + j] / pol.d[c] : 0;
        if (q.pos > 0 && q.O > q.pos) sfd += sh * Math.log(q.O / q.pos);
      }
      const fam = this.fAcc[c] / tA;
      mmp[c] = Math.max(0, Math.log(P.Y_COMF / Math.max(y, 1e-6))) + P.K_FAM * fam;
      emp[c] = Pw + Po > 0 ? Math.max(0, Math.log((E + Eo) / (Pw + Po))) : 0;
      psi[c] = (1 - Math.exp(-mmp[c] / P.M0)) * (1 - Math.exp(-emp[c] / P.E0)) * (1 + P.K_SFD * sfd);
      // The states' means over the people they hold: income, the elites' growth, stress.
      const dEx = this.dAcc[c] / tA;
      for (let j = 0; j < KP; j++) {
        const k = pol.id[KP * c + j];
        if (k < 0) break;
        const q = list[k], m = pol.s[KP * c + j] * n;
        q.yN += m; q.yY += m * y; q.dN += m; q.dD += m * dEx; q.pN += m; q.pS += m * psi[c];
      }
    }
    // The elites' numbers, each way's share stepped exactly over the step (in steps of at most H_CLS years).
    const nsub = Math.max(1, Math.ceil(dt / P.H_CLS)), hh = dt / nsub, mU = 1 / P.T_UP, mD = 1 / P.T_DOWN;
    for (let c = 0; c < nL; c++) {
      const n = N[c], t = T[c], o = WAYS * c;
      if (!(n > 0) || !(t > 0)) continue;
      const g = this.dAcc[c] / tA - P.K_CULL * psi[c];
      for (let w = 1; w < WAYS; w++) {
        const nw = n * W[o + w] / t;
        if (!(nw > 1e-9)) { e[o + w] = 0; continue; }
        const p = Math.min(0.5, pos[o + w] / nw);
        let x = e[o + w];
        for (let s = 0; s < nsub; s++) x = eliteStep(x, p, g, mU, mD, hh);
        e[o + w] = x;
      }
    }
    // Office: each state's, in people, by the same law at its places' means; filled at its positions when founded.
    for (const k of pol.live) {
      const q = list[k], ym = q.yN > 0 ? q.yY / q.yN : 1;
      q.pos = q.rev / (P.C_E * Math.max(ym, 1e-6));
      if (q.O === undefined) { q.O = q.pos; continue; }
      const g = (q.dN > 0 ? q.dD / q.dN : 0) - P.K_CULL * (q.pN > 0 ? q.pS / q.pN : 0);
      const n = Math.max(q.N, 1);
      let x = q.O / n;
      for (let s = 0; s < nsub; s++) x = eliteStep(x, q.pos / n, g, mU, mD, hh);
      q.O = x * n;
    }
    // Internal war: deaths and works lost where the stress is, though no border moves.
    const works = pp.works, wk = Object.values(pp.wk);
    for (let c = 0; c < nL; c++) {
      if (!(psi[c] > 0) || !(N[c] > 0)) continue;
      N[c] *= Math.exp(-P.W_IW * psi[c] * dt);
      const kw = Math.exp(-P.W_IWW * psi[c] * dt);
      works[c] *= kw;
      for (const a of wk) a[c] *= kw;
    }
    this.dAcc.fill(0); this.fAcc.fill(0); this.tAcc = 0;
  }

  /** The elite's share of a place's people (all its ways), and of its income (its claims' share of its food and goods). */
  shares(c) {
    const pp = this.pp, n = pp.Ntot[c], t = pp.ids.T[c], o = WAYS * c, W = pp.ids.W;
    if (!(n > 0) || !(t > 0)) return { people: 0, income: 0 };
    let E = 0, cl = 0;
    for (let w = 1; w < WAYS; w++) { E += this.e[o + w] * n * W[o + w] / t; cl += Math.min(this.claim[o + w], this.e[o + w] * n * W[o + w] / t * this.pp.P.C_E * (pp.K[c] + pp.goods[c]) / n); }
    const Y = pp.K[c] + pp.goods[c];
    return { people: E / n, income: Y > 0 ? Math.min(1, cl / Y) : 0 };
  }
}
