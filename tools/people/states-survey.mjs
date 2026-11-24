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
//   the industrial era   the share under unlike rulers at 1870, 1913, 1950 (industry's start as 1760),
//                   the effective states at early takeoff
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
  pp.rng = stream(`earth/${run}`, 'people'); pp.seaRng = stream(`earth/${run}`, 'people:sea'); pp.ids.rng = stream(`earth/${run}`, 'people:peoples'); pp.pol.rng = stream(`earth/${run}`, 'people:polities');
  const H = pp.H, deg = 180 / Math.PI, nL = pp.nL, regOf = new Int16Array(nL);
  for (let c = 0; c < nL; c++) { const la = H.lat[c] * deg, lo = H.lon[c] * deg; regOf[c] = REGIONS.findIndex(([, a, b, x, y]) => la >= a && la < b && lo >= x && lo < y); }
  const ev = {};
  pp.onEvent = (t, k) => { if (!(k in ev)) ev[k] = t; };
  pp.seed();
  // The regions' people every EVERY years once any state stands; stress and the unlike rule's share alongside.
  const series = [], stress = [], unlike = [];
  let next = null;
  const sample = () => {
    const r = new Float64Array(REGIONS.length), N = pp.Ntot, cl = pp.classes;
    let all = 0, ps = 0, hi = 0, un = 0;
    for (let c = 0; c < nL; c++) {
      const n = N[c]; if (!(n > 0)) continue;
      all += n; if (regOf[c] >= 0) r[regOf[c]] += n;
      ps += n * cl.psi[c]; if (cl.psi[c] > 0.3) hi += n;
      const k = pp.pol.owner(c); if (k >= 0 && pp.ids.simX(c, pp.pol.list[k].X) < 0.5) un += n;
    }
    series.push({ t: pp.t, r: Array.from(r) });
    let kw = 0, kn = 0, trib = 0, tax = 0;
    for (const k of pp.pol.live) { const q = pp.pol.list[k]; kw += q.N * q.kap; kn += q.N; }
    if (pp.tribP && pp.uSent) for (let c = 0; c < nL; c++) { const q = pp.uSent[c] * pp.Kown[c]; trib += q * pp.tribP[c]; for (let j = 0; j < 3; j++) tax += q * pp.dlvP[3 * c + j]; }
    stress.push({ t: pp.t, psi: all > 0 ? ps / all : 0, hi: all > 0 ? hi / all : 0, kap: kn > 0 ? kw / kn : 0, trib: tax > 0 ? trib / tax : 0 });
    unlike.push({ t: pp.t, s: all > 0 ? un / all : 0 });
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
  const wave = xs => ({ n: xs.length, at: xs.length ? xs.map(x => 1760 + x.t - tI).sort((a, b) => a - b)[xs.length >> 1] : null });
  return {
    sec: { agrKyr: 1000 * agr.length / span, settler: wave(ind.filter(x => x.overseas && x.alike >= 0.5)), nation: wave(ind.filter(x => x.alike < 0.5)), other: ind.filter(x => !x.overseas && x.alike >= 0.5).length },
    great: great.length, life: lives.sort((a, b) => a - b), standing: standing.length, peakA: great.map(q => q.peakA).sort((a, b) => a - b),
    changes, cycles, stress: [tI - 3000, tI - 1000, tI, tP].map(t => { const s = at(t); return [s.psi, s.hi]; }),
    steppe: { n: camps.length, big: camps.filter(q => q.peakN >= 1e5).length, bigLife: camps.filter(q => q.peakN >= 1e5 && q.died !== null).map(q => q.died - q.born), life: camps.filter(q => q.died !== null).map(q => q.died - q.born).sort((a, b) => a - b), peakA: camps.reduce((m, q) => Math.max(m, q.peakA), 0), dyn: dy.length, dynAt: dy.length ? dy.map(x => 1760 + x.t - tI).sort((a, b) => a - b)[dy.length >> 1] : null, dynUnlike: dy.length ? dy.filter(x => x.alike < 0.5).length / dy.length : null },
    fiscal: [tI - 3000, tI - 1000, tI].map(t => { const s = at(t); return [s.kap, s.trib]; }),
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
  const sr = runs.filter(r => r.sec);
  if (sr.length) console.log(`secession: ${f2(md(sr.map(r => r.sec.agrKyr)))} successors a kyr before industry; from industry, settler colonies (overseas, alike) ${md(sr.map(r => r.sec.settler.n))} a draw, median ${f0(md(sr.map(r => r.sec.settler.at)))} (the Americas' 1776–1825), nations (unlike) ${md(sr.map(r => r.sec.nation.n))}, median ${f0(md(sr.map(r => r.sec.nation.at)))} (Asia's and Africa's 1945–75), others ${md(sr.map(r => r.sec.other))}`);
  console.log(`the industrial era: under unlike rulers at 1870, 1913, 1950 ${[0, 1, 2].map(i => pc(md(runs.filter(r => r.unlike).map(r => r.unlike[i])))).join(', ')} (~31% in 1913); effective states at early takeoff ${f2(md(runs.map(r => r.states)))} (~14); early takeoff ${f0(md(runs.map(r => r.yrs)))} yr after industry`);
}
