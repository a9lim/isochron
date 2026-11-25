// The states survey (docs/ROADMAP.md, batch 3): the people on today's Earth to early takeoff, several draws
// in parallel (each the scorer's draw: tools/people/earth-score.mjs), reading what its states and classes
// do rather than where people live. For each draw:
//   great states    those holding GREAT of the world's people at their peak: how many, their median life
//                   (born to gone, or to early takeoff for those still standing, counted apart), their peak
//                   area; the lead's changes in the last 5 kyr before industry (the largest state's, held
//                   two of the Histomap's snapshots at least)
//   secular cycles  each region (earth-score's boxes) with 1% of the people or more at industry: its people
//                   every 25 years over the 3 kyr before it, the log detrended by a 400-year running mean;
//                   its autocorrelation's first peak past 75 years (the period, where the peak is past 0.1)
//                   and the detrended rms (the swing)
//   stress          people-weighted ψ, and the share of the people past ψ 0.3, at 3 and 1 kyr before
//                   industry, at industry and at early takeoff
//   classes         at 1 kyr before industry: each way's elite share of its people, and its two-class Gini
//                   (the elite's share of the way's claims-weighted income less its share of the people: a
//                   floor, with no inequality within a class)
//   secession       the successors founded before industry (a kyr's), and from industry on the two waves of
//                   decolonization: settler colonies breaking away while alike (overseas, likeness to the
//                   parent's capital 0.5 or more) and the nations (likeness under 0.5), each wave's count and
//                   median date (industry's start as 1760)
//   the steppe      the herders' states founded (camps) and those of 100k people at their peak, their median
//                   lives, the largest's peak area (the
//                   Mongols' ~24 M km², the Xiongnu's ~9: from memory), the conquest dynasties (a camp taking a
//                   tributary's city), their median date and the share unlike the city they took; fiscal
//                   capacity κ (people-weighted) and tribute against the states' tax at 3 and 1 kyr before
//                   industry and at industry
//   migration and heat (3d, 3e)  the people at 1 CE, 1870, 1950 and 2000; refugees a kyr before industry and a
//                   year after it; the people-weighted weight of those of an age to migrate against their
//                   stable pyramid's (the emigration hump) at 1870, 1913, 1950 and its most; at industry and early
//                   takeoff the people-weighted hottest month's wet bulb, the share past 28 °C, heat's deaths
//                   a year, cooling's power and Earth's habitability
//   pathogens (4a)  at 3 and 1 kyr before industry, at industry and at early takeoff the pathogens' deaths a
//                   thousand a year and those circulating; the table's births, stillborn and gone; the largest
//                   share of the people the Americas and Europe lost within 150 and 100 years (and when), and
//                   the falls of a region's people by a fifth or more within 50 years a kyr, before industry
//                   (regions with 1% of the people at industry); the most lethal pathogens' traits
//   the industrial era   the share under unlike rulers (state or elite, the unlikest) at 1870, 1913, 1950
//                   (industry's start as 1760), the effective states at early takeoff
//   empires overseas (4b)  the first state holding a million people overseas (on another landmass, joined to its
//                   capital only across the open ocean: Routes.oceanic; the first overseas empires ~1500); at 1913 the share of the people held from overseas, of them those
//                   alike to their rulers (settlers) and those ruled directly (κ), and the share under an unlike
//                   elite; captives taken, carried and landed, and those carried overseas (People.capt) and landed
//                   there (~12.5 M carried across the Atlantic, ~10.7 M landed: Eltis and Richardson, from memory),
//                   and when half of those had sailed; coercion's weight (people-weighted over held places, against
//                   K_COER) falling below a half (abolition 1807–88); the drain's share of capital's income at
//                   1913; balancing (people-weighted over the states) 1 kyr before industry and at 1913
//   classes' economy (3f)  at 1 CE, 1500, 1820, 1913, 1980 and early takeoff: the cities' share of the people
//                   (Cantillon's), the world's Gini over its places' two classes (Bourguignon and Morrisson:
//                   ~0.5 in 1820, ~0.65 late in the twentieth century), the top decile's share of income in the
//                   world and among industrial places (Piketty, the WID: ~0.35–0.5); from industry, K/Y, the
//                   saving rate and railways' built share of their room; where industry began (its knowledge,
//                   learning and elite share)
// usage: node tools/people/states-survey.mjs ['{PEOPLE overrides}'] [draws=8]
//   env: ENGINE=7 as the scorer's
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const GREAT = 0.02, EVERY = 25;

async function one(ov, run) {
  const { planetFields } = await import('./planet.mjs');
  const { People } = await import('../../src/engine/people.js');
  const { stream } = await import('../../src/rng.js');
  const { REGIONS } = await import('./earth-score.mjs');
  const pp = new People(await planetFields('earth', 6), ov);
  pp.rng = stream(`earth/${run}`, 'people'); pp.seaRng = stream(`earth/${run}`, 'people:sea'); pp.ids.rng = stream(`earth/${run}`, 'people:peoples'); pp.pol.rng = stream(`earth/${run}`, 'people:polities'); pp.pathogens.rng = stream(`earth/${run}`, 'people:pathogens');
  const H = pp.H, deg = 180 / Math.PI, nL = pp.nL, regOf = new Int16Array(nL);
  for (let c = 0; c < nL; c++) { const la = H.lat[c] * deg, lo = H.lon[c] * deg; regOf[c] = REGIONS.findIndex(([, a, b, x, y]) => la >= a && la < b && lo >= x && lo < y); }
  const ev = {}, evText = {};
  pp.onEvent = (t, k, x) => { if (!(k in ev)) { ev[k] = t; evText[k] = x; } };
  pp.seed();
  // The regions' people every EVERY years once any state stands; stress and the unlike rule's share alongside.
  const series = [], stress = [], unlike = [], econ = [], dis = [], emp = [], water = [];
  let aHalf = null, aGone = null;   // the archaic peoples (4c): when half of them and 99% are gone
  let next = null;
  const sample = () => {
    const r = new Float64Array(REGIONS.length), N = pp.Ntot, cl = pp.classes;
    let all = 0, ps = 0, hi = 0, un = 0, uE = 0, ovN = 0, ovA = 0, ovD = 0, cw = 0, cn = 0;
    const pol = pp.pol, mass = pol.massOf(), ovK = new Map();
    for (let c = 0; c < nL; c++) {
      const n = N[c]; if (!(n > 0)) continue;
      all += n; if (regOf[c] >= 0) r[regOf[c]] += n;
      ps += n * cl.psi[c]; if (cl.psi[c] > 0.3) hi += n;
      const se = pp.ids.eliteSim(c), k = pol.owner(c);
      if (se < 0.5) uE += n;
      if (k >= 0 && Math.min(se, pp.ids.simX(c, pol.list[k].X)) < 0.5) un += n;
      for (let j = 0; j < 3; j++) {
        const kk = pol.id[3 * c + j]; if (kk < 0) break;
        const q = pol.list[kk], x = pol.s[3 * c + j] * n;
        if (mass[c] === mass[q.cap] || !pp.routes.oceanic(pp.routes.marketOf[q.cap], pp.routes.marketOf[c])) continue;   // overseas: across the open ocean
        ovN += x; ovK.set(kk, (ovK.get(kk) || 0) + x); if (pp.ids.simX(c, q.X) >= 0.5) ovA += x; ovD += x * (q.kap ?? 1);
      }
      if (pol.held(c) > 0) { cw += n * pol.coer(c) / pp.P.K_COER; cn += n; }
    }
    let bw = 0, bn = 0;
    for (const k of pol.live) { const q = pol.list[k]; bw += q.N * (q.bal ?? 1); bn += q.N; }
    emp.push({ t: pp.t, ovN: all > 0 ? ovN / all : 0, ovMax: Math.max(0, ...ovK.values()), alike: ovN > 0 ? ovA / ovN : NaN, direct: ovN > 0 ? ovD / ovN : NaN, uE: all > 0 ? uE / all : 0,
      coer: cn > 0 ? cw / cn : 1, capt: { ...pp.capt }, drain: pp.capY > 0 ? pp.drainY / pp.capY : 0, bal: bn > 0 ? bw / bn : 1 });
    series.push({ t: pp.t, r: Array.from(r) });
    let kw = 0, kn = 0, trib = 0, tax = 0;
    for (const k of pp.pol.live) { const q = pp.pol.list[k]; kw += q.N * q.kap; kn += q.N; }
    if (pp.tribP && pp.uSent) for (let c = 0; c < nL; c++) { const q = pp.uSent[c] * pp.Kown[c]; trib += q * pp.tribP[c]; for (let j = 0; j < 3; j++) tax += q * pp.dlvP[3 * c + j]; }
    let tw = 0, hot = 0, dh = 0, mw = 0, mx = 0;
    for (let c = 0; c < nL; c++) { const n = N[c]; if (!(n > 0)) continue; tw += n * pp.tw[c]; if (pp.tw[c] > 28) hot += n; dh += n * pp.dHeat[c]; const m = pp.migA ? pp.migA[c] : 1; mw += n * m; if (m > mx && n > 1e5) mx = m; }
    stress.push({ t: pp.t, psi: all > 0 ? ps / all : 0, hi: all > 0 ? hi / all : 0, kap: kn > 0 ? kw / kn : 0, trib: tax > 0 ? trib / tax : 0,
      N: all, tw: all > 0 ? tw / all : 0, hot: all > 0 ? hot / all : 0, dh: all > 0 ? dh / all : 0, cool: pp.Ecool || 0, hE: pp.hE, mig: all > 0 ? mw / all : 1, migMax: mx, fled: pp.fled || 0 });
    unlike.push({ t: pp.t, s: all > 0 ? un / all : 0 });
    const hh = pp.history.at(-1);
    dis.push({ t: pp.t, d: all > 0 && hh ? hh.pDeaths / all : 0, n: hh ? hh.nPath : 0 });
    // Classes' economy: the cities' share, the world's Gini and top decile over its places' two classes.
    let city = 0;
    const g = [], gi = [];
    for (let c = 0; c < nL; c++) {
      const n = N[c]; if (!(n > 0)) continue;
      city += pp.city ? pp.city[c] : 0;
      const Y = pp.K[c] + pp.goods[c], sh = cl.shares(c), e = Math.min(0.999, sh.people), sI = Math.min(1, sh.income), ind = pp.ind[c] > 0.5;
      if (e > 0) g.push([sI * Y / (e * n), e * n, ind]);
      g.push([(1 - sI) * Y / ((1 - e) * n), (1 - e) * n, ind]);
    }
    const dist = gs => {
      const a = gs.slice().sort((x, y) => x[0] - y[0]);
      let P = 0, I = 0; for (const [y, n] of a) { P += n; I += y * n; }
      if (!(P > 0) || !(I > 0)) return { gini: NaN, top: NaN };
      let L = 0, G = 1;
      for (const [y, n] of a) { const s = y * n / I; G -= (n / P) * (2 * L + s); L += s; }
      let left = 0.1 * P, top = 0;
      for (let i = a.length - 1; i >= 0 && left > 0; i--) { const take = Math.min(left, a[i][1]); top += take * a[i][0]; left -= take; }
      return { gini: G, top: top / I };
    };
    const E = pp.econ, w = dist(g), wI = dist(g.filter(x => x[2]));
    let rl = 0, rr = 0;
    if (E.on) for (let c = 0; c < nL; c++) { rl += pp.wi.L[c]; rr += pp.railRoom(c); }
    econ.push({ t: pp.t, urb: all > 0 ? city / all : 0, gini: w.gini, top: w.top, topI: wI.top, KY: E.on && E.Y > 0 ? E.Kf / E.Y : NaN, sv: E.on ? E.sReal : NaN, rail: rr > 0 ? rl / rr : NaN });
    // Water control (4c): the watered land past the floodplains (M ha) and the wells' draw on the aquifers (km³ a year).
    let wa = 0, gw = 0, wAs = 0, gS = 0;
    for (let c = 0; c < nL; c++) { const a = H.area[c], x = Math.min(pp.f[c] - Math.min(pp.f[c], H.sfp[c]), pp.watered(c)); if (x > 0) { wa += x * a; if ((regOf[c] >= 14 && regOf[c] <= 24) || regOf[c] === 4 || regOf[c] === 5) wAs += x * a; } gw += pp.wDraw[c] * a * 1e-6; gS += pp.aq[c] * a * 1e-6; }
    water.push({ t: pp.t, wa: wa * 100 / 1e6, asia: wa > 0 ? wAs / wa : 0, gw, gS });
  };
  // Each way's elites at a moment: their share of its people and their two-class Gini.
  const classes = () => {
    const cl = pp.classes, W = pp.ids.W, T = pp.ids.T, N = pp.Ntot, P = pp.P;
    const eN = new Float64Array(5), wN = new Float64Array(5), inc = new Float64Array(5), out = new Float64Array(5);
    for (let c = 0; c < nL; c++) {
      const n = N[c]; if (!(n > 0) || !(T[c] > 0)) continue;
      const y = (pp.K[c] + pp.goods[c]) / n;
      for (let w = 1; w < 5; w++) {
        const nw = n * W[5 * c + w] / T[c], E = cl.e[5 * c + w] * nw;
        eN[w] += E; wN[w] += nw;
        inc[w] += Math.min(cl.claim[5 * c + w], E * P.C_E * y); out[w] += nw * y;
      }
    }
    return Array.from({ length: 5 }, (_, w) => w === 0 ? null : { share: wN[w] > 0 ? eN[w] / wN[w] : 0, gini: wN[w] > 0 && out[w] > 0 ? inc[w] / out[w] - eN[w] / wN[w] : 0, people: wN[w] });
  };
  // The classes every 250 years until industry, the last ten kept (the one nearest 1 kyr before it is read).
  const cls = [];
  let nextC = null;
  while (pp.t < 6e6 && !('present' in ev)) {
    pp.step(pp.nextDt());
    if (aHalf === null && pp.archN < 0.5 * pp.archN0) aHalf = pp.t;
    if (aGone === null && pp.archN < 0.01 * pp.archN0) aGone = pp.t;
    if (next === null && pp.pol.first !== null) next = nextC = pp.t;
    if (next !== null && pp.t >= next) { sample(); next = pp.t + ('industry' in ev ? 5 : EVERY); }
    if (nextC !== null && !('industry' in ev) && pp.t >= nextC) { cls.push({ t: pp.t, v: classes() }); if (cls.length > 10) cls.shift(); nextC = pp.t + 250; }
  }
  sample();
  const tI = ev.industry ?? pp.t, tP = pp.t;
  const c1 = cls.length ? cls.reduce((b, x) => (Math.abs(x.t - (tI - 1000)) < Math.abs(b.t - (tI - 1000)) ? x : b)).v : null;
  const pol = pp.pol, list = pol.list;
  let world = 0;
  for (let c = 0; c < nL; c++) world += pp.Ntot[c];
  const great = list.filter(q => (q.peakS || 0) >= GREAT);
  const lives = great.filter(q => q.died !== null).map(q => q.died - q.born), standing = great.filter(q => q.died === null).map(q => tP - q.born);
  // The lead's changes in the last 5 kyr before industry.
  const hs = pol.hist.filter(s => s.t >= tI - 5000 && s.t <= tI && s.k.length);
  let changes = 0, lead = -1, cand = -1, held = 0;
  for (const s of hs) {
    const k = s.k[0];
    if (k === lead) { cand = -1; held = 0; continue; }
    if (k === cand) { if (++held >= 2) { if (lead >= 0) changes++; lead = k; cand = -1; held = 0; } } else { cand = k; held = 1; }
  }
  // Secular cycles: the regions' detrended log people over the 3 kyr before industry.
  const win = series.filter(s => s.t >= tI - 3000 && s.t <= tI), cycles = [];
  if (win.length > 40) {
    const nR = win[0].r.length, last = win.at(-1).r, tot = last.reduce((a, b) => a + b, 0);
    for (let g = 0; g < nR; g++) {
      if (!(last[g] > 0.01 * tot)) continue;
      const x = win.map(s => Math.log(Math.max(s.r[g], 1)));
      const m = Math.round(200 / EVERY), d = x.map((v, i) => { let a = 0, n = 0; for (let j = Math.max(0, i - m); j <= Math.min(x.length - 1, i + m); j++) { a += x[j]; n++; } return v - a / n; });
      const mu = d.reduce((a, b) => a + b, 0) / d.length, v0 = d.reduce((a, b) => a + (b - mu) ** 2, 0) / d.length;
      if (!(v0 > 1e-8)) continue;
      const ac = L => { let a = 0; for (let i = 0; i + L < d.length; i++) a += (d[i] - mu) * (d[i + L] - mu); return a / (d.length - L) / v0; };
      let period = null;
      for (let L = Math.ceil(75 / EVERY); L <= Math.floor(1000 / EVERY); L++) { const a = ac(L); if (a > 0.1 && a >= ac(L - 1) && a >= ac(L + 1)) { period = L * EVERY; break; } }
      cycles.push({ region: REGIONS[g][0], period, rms: Math.sqrt(v0) });
    }
  }
  const at = t => stress.reduce((b, s) => (Math.abs(s.t - t) < Math.abs(b.t - t) ? s : b), stress[0] || { psi: 0, hi: 0, kap: 0, trib: 0 });
  const camps = list.filter(q => q.steppe), dy = pol.dyns.filter(x => x.t < tI);
  const un = t => unlike.reduce((b, s) => (Math.abs(s.t - t) < Math.abs(b.t - t) ? s : b), unlike[0] || { s: 0 }).s;
  const secs = pol.secs, agr = secs.filter(x => x.t < tI), ind = secs.filter(x => x.t >= tI);
  const span = pol.first !== null ? Math.max(1, tI - pol.first) : 1;
  // Pathogens: the largest fall of a series within `w` years (and when), and the falls by a fifth within 50 years.
  const fall = (xs, w) => {
    let f = 0, when = null;
    for (let i = 0; i < xs.length; i++) for (let j = i + 1; j < xs.length && xs[j].t - xs[i].t <= w; j++) if (xs[i].v > 0) { const x = 1 - xs[j].v / xs[i].v; if (x > f) { f = x; when = 1760 + xs[i].t - tI; } }
    return { f, at: when };
  };
  const sumOf = rs => series.map(x => ({ t: x.t, v: rs.reduce((a, g) => a + x.r[g], 0) }));
  const AM = [28, 29, 30, 31, 32, 33, 34], EU = [0, 1, 2, 3], pre = series.filter(x => x.t <= tI), atI = pre.at(-1);
  let crashes = 0;
  if (atI) {
    const tot = atI.r.reduce((a, b) => a + b, 0);
    for (let g = 0; g < atI.r.length; g++) {
      if (!(atI.r[g] > 0.01 * tot)) continue;
      for (let i = 0; i < pre.length; i++) {
        let hit = -1;
        for (let j = i + 1; j < pre.length && pre[j].t - pre[i].t <= 50; j++) if (pre[i].r[g] > 0 && pre[j].r[g] < 0.8 * pre[i].r[g]) { hit = j; break; }
        if (hit > 0) { crashes++; i = hit; }
      }
    }
  }
  const dAt = t => dis.reduce((b, x) => (Math.abs(x.t - t) < Math.abs(b.t - t) ? x : b), dis[0] || { d: 0, n: 0 });
  const pg = pp.pathogens, worst = pg.live.concat(pg.past).sort((a, b) => b.dead - a.dead).slice(0, 3);
  const wave = xs => ({ n: xs.length, at: xs.length ? xs.map(x => 1760 + x.t - tI).sort((a, b) => a - b)[xs.length >> 1] : null });
  // Empires overseas: the first million held overseas; captives' half-sailed date; abolition's.
  const eAt = t => emp.reduce((b, x) => (Math.abs(x.t - t) < Math.abs(b.t - t) ? x : b), emp[0] || {}), cal = t => (t == null ? null : 1760 + t - tI);
  const e0 = emp.find(x => x.ovMax >= 1e6), cF = emp.at(-1) ? emp.at(-1).capt : pp.capt, half = emp.find(x => x.capt.over >= 0.5 * cF.over && cF.over > 0);
  const peakC = emp.reduce((m, x) => Math.max(m, x.coer), 0), ab = emp.find(x => x.t > tI - 2000 && x.coer < 0.5);
  const e13 = eAt(tI + 153);
  const empire = { first: e0 ? cal(e0.t) : null, ov13: e13.ovN, alike13: e13.alike, direct13: e13.direct, uE13: e13.uE, made: cF.made, carried: cF.carried, landed: cF.landed, over: cF.over, overLanded: cF.overLanded,
    half: half ? cal(half.t) : null, abolition: ab ? cal(ab.t) : null, coerPeak: peakC, drain13: e13.drain, bal: [eAt(tI - 1000).bal, e13.bal] };
  // The continents' shares of the people at industry and at early takeoff (earth-score's continents).
  const CONTS = { Africa: [6, 7, 8, 9, 10, 11, 12, 13], Asia: [4, 5, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24], India: [19], China: [20, 21, 22], Europe: [0, 1, 2, 3], Americas: [28, 29, 30, 31, 32, 33, 34], Oceania: [25, 26, 27] };
  const shareAt = x => { const tot = x ? x.r.reduce((a, b) => a + b, 0) : 0; return Object.fromEntries(Object.entries(CONTS).map(([k, gs]) => [k, tot > 0 ? gs.reduce((a, g) => a + x.r[g], 0) / tot : NaN])); };
  const shares = [shareAt(series.filter(x => x.t <= tI).at(-1)), shareAt(series.at(-1))];
  const wAt = t => water.reduce((b, x) => (Math.abs(x.t - t) < Math.abs(b.t - t) ? x : b), water[0] || { wa: 0, asia: 0, gw: 0 });
  const kyr = t => (t == null ? null : (tP - t) / 1e3);
  return {
    shares,
    water: { w00: wAt(tI + 140), w2k: wAt(tI + 240), wI: wAt(tI), dep2k: (wAt(tI + 230).gS - wAt(tI + 240).gS) / 10, arch0: pp.archN0, half: kyr(aHalf), gone: kyr(aGone), assim: pp.assim },
    empire,
    sec: { agrKyr: 1000 * agr.length / span, settler: wave(ind.filter(x => x.overseas && x.alike >= 0.5)), nation: wave(ind.filter(x => x.alike < 0.5)), other: ind.filter(x => !x.overseas && x.alike >= 0.5).length },
    great: great.length, life: lives.sort((a, b) => a - b), standing: standing.length, peakA: great.map(q => q.peakA).sort((a, b) => a - b),
    changes, cycles, stress: [tI - 3000, tI - 1000, tI, tP].map(t => { const s = at(t); return [s.psi, s.hi]; }),
    steppe: { n: camps.length, big: camps.filter(q => q.peakN >= 1e5).length, bigLife: camps.filter(q => q.peakN >= 1e5 && q.died !== null).map(q => q.died - q.born), life: camps.filter(q => q.died !== null).map(q => q.died - q.born).sort((a, b) => a - b), peakA: camps.reduce((m, q) => Math.max(m, q.peakA), 0), dyn: dy.length, dynAt: dy.length ? dy.map(x => 1760 + x.t - tI).sort((a, b) => a - b)[dy.length >> 1] : null, dynUnlike: dy.length ? dy.filter(x => x.alike < 0.5).length / dy.length : null },
    fiscal: [tI - 3000, tI - 1000, tI].map(t => { const s = at(t); return [s.kap, s.trib]; }),
    mig: 'industry' in ev ? { N: [-1760, 110, 190, 240].map(d => at(tI + d).N), hump: [110, 153, 190].map(d => at(tI + d).mig), humpMax: Math.max(...stress.filter(s => s.t >= tI).map(s => s.migMax)),
      fledAgr: 1000 * (at(tI).fled || 0) / span, fledInd: Math.max(0, (at(tP).fled || 0) - (at(tI).fled || 0)) / Math.max(1, tP - tI) } : null,
    heat: [tI, tP].map(t => { const s = at(t); return { tw: s.tw, hot: s.hot, dh: s.dh, cool: s.cool, hE: s.hE }; }),
    econ: [-1759, -260, 60, 153, 220].map(d => econ.reduce((b, s) => (Math.abs(s.t - (tI + d)) < Math.abs(b.t - (tI + d)) ? s : b), econ[0] || {})).concat([econ.at(-1) || {}]), spark: evText.industry || null,
    disease: { d: [tI - 3000, tI - 1000, tI, tP].map(t => dAt(t).d), n: [tI - 3000, tI - 1000, tI, tP].map(t => dAt(t).n), born: pg.born, still: pg.still, gone: pg.gone,
      americas: fall(sumOf(AM), 150), europe: fall(sumOf(EU).filter(x => x.t <= tI), 100), crashes: 1000 * crashes / span,
      worst: worst.map(q => `R0 ${q.R0.toFixed(1)}, ${(52 * q.D).toFixed(0)} wk, immunity ${q.om < 0.01 ? 'lifelong' : `${(1 / q.om).toFixed(0)} yr`}, v ${q.v.toFixed(3)}, vector ${q.x.toFixed(2)}, reservoir ${q.r.toFixed(3)}: ${(q.dead / 1e6).toPrecision(2)} M dead`) },
    classes: c1, unlike: 'industry' in ev ? [110, 153, 190].map(d => un(tI + d)) : null, states: pol.nStates, yrs: 'industry' in ev ? tP - tI : null,
  };
}

if (process.argv[1] !== fileURLToPath(import.meta.url)) {
  // imported: nothing to run
} else if (process.argv[2] === '--one') {
  process.stdout.write(JSON.stringify(await one(JSON.parse(process.argv[3]), process.argv[4])));
} else {
  const ov = process.argv[2] || '{}', draws = +(process.argv[3] || 8), self = fileURLToPath(import.meta.url);
  const runs = await Promise.all(Array.from({ length: draws }, (_, k) => new Promise((ok, fail) => {
    const p = spawn(process.execPath, [self, '--one', ov, String(k)], { env: process.env });
    let out = '', err = '';
    p.stdout.on('data', d => (out += d)); p.stderr.on('data', d => (err += d));
    p.on('close', code => (code ? fail(new Error(err)) : ok(JSON.parse(out))));
  })));
  const md = a => { const b = a.filter(v => v != null && Number.isFinite(v)).sort((p, q) => p - q); return b.length ? b[b.length >> 1] : NaN; };
  const f0 = x => (Number.isFinite(x) ? x.toFixed(0) : '–'), f2 = x => (Number.isFinite(x) ? x.toFixed(2) : '–'), pc = x => (Number.isFinite(x) ? `${(100 * x).toFixed(1)}%` : '–');
  for (const [k, r] of runs.entries()) console.log(`draw ${k}: ${r.great} great states (median life ${f0(md(r.life))} yr, ${r.standing} standing), the lead changed ${r.changes}× in the last 5 kyr; regions' periods ${r.cycles.map(c => c.period ?? '–').join(' ')}; effective states at early takeoff ${f2(r.states)}`);
  const lives = runs.flatMap(r => r.life), periods = runs.flatMap(r => r.cycles.map(c => c.period)), rms = runs.flatMap(r => r.cycles.map(c => c.rms));
  console.log(`great states (≥${100 * GREAT}% of the world at their peak): ${md(runs.map(r => r.great))} a draw, median life ${f0(md(lives))} yr (history ~200–500), peak area ${f0(md(runs.flatMap(r => r.peakA)) / 1e6)} M km²; the lead's changes in the last 5 kyr before industry ${md(runs.map(r => r.changes))} (~15–20)`);
  console.log(`secular cycles: the regions' period ${f0(md(periods))} yr (${periods.filter(p => p != null).length} of ${periods.length} with a peak; Turchin and Nefedov ~200–300), swing ${pc(md(rms))} rms`);
  const WN = ['', 'herders', 'fishers', 'farmers', 'city'], cr = runs.filter(r => r.classes);
  if (cr.length) console.log(`classes 1 kyr before industry, each way's elite share of its people · its two-class Gini (Borgerhoff Mulder and others: pastoralists ~0.42, farmers ~0.48, wealth): ${[1, 2, 3, 4].map(w => `${WN[w]} ${pc(md(cr.map(r => r.classes[w].share)))} · ${f2(md(cr.map(r => r.classes[w].gini)))}`).join(', ')}`);
  console.log(`stress (ψ · past 0.3) at 3 kyr and 1 kyr before industry, at industry, at early takeoff: ${[0, 1, 2, 3].map(i => `${f2(md(runs.map(r => r.stress[i][0])))} · ${pc(md(runs.map(r => r.stress[i][1])))}`).join('  ')}`);
  const st = runs.map(r => r.steppe);
  console.log(`the steppe: ${md(st.map(x => x.n))} herders' states a draw (median life ${f0(md(st.flatMap(x => x.life)))} yr), ${md(st.map(x => x.big))} of 100k people at their peak (median life ${f0(md(st.flatMap(x => x.bigLife)))} yr), the largest's peak area ${f2(md(st.map(x => x.peakA)) / 1e6)} M km² (the Mongols' ~24, the Xiongnu's ~9); conquest dynasties ${md(st.map(x => x.dyn))} a draw before industry, median ${f0(md(st.map(x => x.dynAt)))}, ${pc(md(st.map(x => x.dynUnlike)))} unlike the city they took`);
  console.log(`fiscal capacity κ · tribute against the states' tax, at 3 and 1 kyr before industry and at industry: ${[0, 1, 2].map(i => `${f2(md(runs.map(r => r.fiscal[i][0])))} · ${pc(md(runs.map(r => r.fiscal[i][1])))}`).join('  ')}`);
  const mr = runs.filter(r => r.mig), gB = x => (Number.isFinite(x) ? (x / 1e9).toFixed(2) : '–');
  if (mr.length) {
    console.log(`migration: people at 1 CE, 1870, 1950, 2000 ${[0, 1, 2, 3].map(i => gB(md(mr.map(r => r.mig.N[i])))).join(', ')} B (0.17–0.26, 1.27, 2.52, 6.07); refugees ${f0(md(mr.map(r => r.mig.fledAgr)))} a kyr before industry, ${f0(md(mr.map(r => r.mig.fledInd)))} a year after it; the hump (those of an age to migrate against the stable pyramid's, people-weighted) at 1870, 1913, 1950 ${[0, 1, 2].map(i => f2(md(mr.map(r => r.mig.hump[i])))).join(', ')}, its most ${f2(md(mr.map(r => r.mig.humpMax)))}`);
  }
  console.log(`heat at industry · at early takeoff: the people's hottest month's wet bulb ${[0, 1].map(i => f2(md(runs.map(r => r.heat[i].tw)))).join(' · ')} °C, past 28 °C ${[0, 1].map(i => pc(md(runs.map(r => r.heat[i].hot)))).join(' · ')}, heat's deaths ${[0, 1].map(i => (1e6 * md(runs.map(r => r.heat[i].dh))).toFixed(1)).join(' · ')} a million a year, cooling ${[0, 1].map(i => (md(runs.map(r => r.heat[i].cool)) / 1e9).toFixed(0)).join(' · ')} GW, Earth's habitability ${[0, 1].map(i => f2(md(runs.map(r => r.heat[i].hE)))).join(' · ')}`);
  const sr = runs.filter(r => r.sec);
  if (sr.length) console.log(`secession: ${f2(md(sr.map(r => r.sec.agrKyr)))} successors a kyr before industry; from industry, settler colonies (overseas, alike) ${md(sr.map(r => r.sec.settler.n))} a draw, median ${f0(md(sr.map(r => r.sec.settler.at)))} (the Americas' 1776–1825), nations (unlike) ${md(sr.map(r => r.sec.nation.n))}, median ${f0(md(sr.map(r => r.sec.nation.at)))} (Asia's and Africa's 1945–75), others ${md(sr.map(r => r.sec.other))}`);
  const ec = runs.map(r => r.econ), EY = ['1 CE', '1500', '1820', '1913', '1980', 'early takeoff'], col = (i, k, f) => f(md(ec.map(e => e[i] && e[i][k])));
  console.log(`classes' economy at ${EY.join(', ')}: the cities' share ${EY.map((_, i) => col(i, 'urb', pc)).join(', ')}; the world's Gini ${EY.map((_, i) => col(i, 'gini', f2)).join(', ')} (~0.5 in 1820, ~0.65 late in the twentieth century); the top decile's share ${EY.map((_, i) => col(i, 'top', pc)).join(', ')}, among industrial places ${EY.slice(3).map((_, j) => col(j + 3, 'topI', pc)).join(', ')} (~35–50%)`);
  console.log(`capital at 1913, 1980, early takeoff: K/Y ${[3, 4, 5].map(i => col(i, 'KY', f2)).join(', ')} (Earth's ~3–4), saving ${[3, 4, 5].map(i => col(i, 'sv', pc)).join(', ')}, railways built ${[3, 4, 5].map(i => col(i, 'rail', pc)).join(', ')} of their room`);
  const dz = runs.map(r => r.disease), pm = x => (Number.isFinite(x) ? (1e3 * x).toFixed(2) : '–');
  console.log(`pathogens at 3 and 1 kyr before industry, at industry, at early takeoff: deaths ${[0, 1, 2, 3].map(i => pm(md(dz.map(x => x.d[i])))).join(', ')} a thousand a year, circulating ${[0, 1, 2, 3].map(i => f0(md(dz.map(x => x.n[i])))).join(', ')}; born ${f0(md(dz.map(x => x.born)))} a draw (stillborn ${f0(md(dz.map(x => x.still)))}, gone ${f0(md(dz.map(x => x.gone)))}); the Americas' largest fall within 150 yr ${pc(md(dz.map(x => x.americas.f)))} (median ${f0(md(dz.map(x => x.americas.at)))}; history ~50–90% after 1492), Europe's before industry within 100 yr ${pc(md(dz.map(x => x.europe.f)))} (median ${f0(md(dz.map(x => x.europe.at)))}; the Black Death ~30–50%); a region's people falling a fifth within 50 yr ${f2(md(dz.map(x => x.crashes)))} times a kyr before industry`);
  for (const [k, r] of runs.entries()) console.log(`draw ${k}'s most lethal pathogens: ${r.disease.worst.join(' · ')}`);
  for (const [k, r] of runs.entries()) if (r.spark) console.log(`draw ${k}: ${r.spark}`);
  const em = runs.map(r => r.empire), mM = x => (Number.isFinite(x) ? (x / 1e6).toFixed(1) : '–');
  console.log(`empires overseas: the first million held overseas ${f0(md(em.map(x => x.first)))} (~1500); at 1913 ${pc(md(em.map(x => x.ov13)))} of the people held from overseas, ${pc(md(em.map(x => x.alike13)))} of them alike to their rulers, ${pc(md(em.map(x => x.direct13)))} ruled directly; under an unlike elite ${pc(md(em.map(x => x.uE13)))}; balancing 1 kyr before industry and at 1913 ${[0, 1].map(i => f2(md(em.map(x => x.bal[i])))).join(', ')}; the drain ${pc(md(em.map(x => x.drain13)))} of capital's income at 1913`);
  const shK = Object.keys(runs[0].shares[0]);
  console.log(`shares of the people at industry · at early takeoff: ${shK.map(k => `${k} ${pc(md(runs.map(r => r.shares[0][k])))} · ${pc(md(runs.map(r => r.shares[1][k])))}`).join(', ')}`);
  const wt = runs.map(r => r.water);
  console.log(`water and the first peoples: watered land past the floodplains at industry, 1900, 2000 ${[0, 1, 2].map(i => md(wt.map(x => [x.wI, x.w00, x.w2k][i].wa)).toFixed(0)).join(', ')} M ha (~40 in 1900, ~280 in 2000), Asia's share in 2000 ${pc(md(wt.map(x => x.w2k.asia)))}; the wells' draw in 2000 ${md(wt.map(x => x.w2k.gw)).toFixed(0)} km³ a year (withdrawals ~900), the aquifers' depletion ${md(wt.map(x => x.dep2k)).toFixed(0)} (~150–300); the archaic peoples ${(md(wt.map(x => x.arch0)) / 1e6).toFixed(2)} M at the start, half gone ${f0(md(wt.map(x => x.half)))} and 99% ${f0(md(wt.map(x => x.gone)))} kyr before early takeoff (~40–30), ${(md(wt.map(x => x.assim)) / 1e6).toFixed(2)} M passing into the moderns`);
  console.log(`captives: ${mM(md(em.map(x => x.made)))} M taken a draw, ${mM(md(em.map(x => x.carried)))} M carried, ${mM(md(em.map(x => x.landed)))} M landed; overseas ${mM(md(em.map(x => x.over)))} M carried, ${mM(md(em.map(x => x.overLanded)))} M landed (the Atlantic's ~12.5, ~10.7), half sailed by ${f0(md(em.map(x => x.half)))}; coercion's weight below half its own by ${f0(md(em.map(x => x.abolition)))} (abolition 1807–88)`);
  console.log(`the industrial era: under unlike rulers at 1870, 1913, 1950 ${[0, 1, 2].map(i => pc(md(runs.filter(r => r.unlike).map(r => r.unlike[i])))).join(', ')} (~31% in 1913); effective states at early takeoff ${f2(md(runs.map(r => r.states)))} (~14); early takeoff ${f0(md(runs.map(r => r.yrs)))} yr after industry`);
}
