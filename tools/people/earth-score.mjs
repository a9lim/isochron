// The people on today's Earth against where people live now (docs/MODEL.md): runs
// the people from the first of them to early takeoff on the cached opening, several draws of their
// chances in parallel, and scores each run's population by region against the regions' shares now
// (rough, from memory: national totals of ~2023 split onto the boxes below): Σ share × |ln(model /
// observed)|, a model share floored at 0.1%. Prints each region's mean share against the observed, the
// continents', where farming and industry began (the first six origins by region and zone), the run's totals, the
// states, the agrarian era's timeline (in kyr before early takeoff, history's before-present) and the industrial
// era against history's dates, industry's start read as 1760; then on to the dial (the minds doubling in under a day:
// the singularity), dated by industry's start and by the world's passing 6 billion (1999), with the world's
// milestones between (its people passing 1, 1.5, 2, 3, 4, 5, 6 billion) against history's.
// usage: node tools/people/earth-score.mjs ['{PEOPLE overrides}'] [draws=4]
//   env: ENGINE=7 the page's desktop engine restricted to the people's grid (tools/people/planet.mjs)
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// [name, lat0, lat1, lon0, lon1, observed % of the world's people]; the first box that holds a cell has it
export const REGIONS = [
  ['Britain/Ireland', 50, 59, -11, 2, 0.9], ['W Europe', 36, 56, -10, 16, 4.0], ['E Europe', 44, 60, 16, 40, 3.3], ['Scandinavia', 56, 71, 4, 32, 0.3],
  ['Iran/Mesopotamia', 28, 42, 32, 62, 2.3], ['Arabia', 12, 30, 34, 60, 1.1], ['Egypt/Nile', 22, 32, 28, 34, 1.4], ['N Africa', 20, 37, -17, 32, 1.7],
  ['Sahel', 10, 20, -17, 40, 3.8], ['W Africa', 4, 10, -17, 10, 3.1], ['Congo', -6, 4, 8, 30, 1.9], ['E Africa', -12, 10, 30, 52, 4.2], ['S Africa', -35, -12, 10, 42, 2.4], ['Madagascar', -26, -12, 43, 51, 0.4],
  ['Steppe', 44, 56, 40, 90, 0.8], ['C Asia', 35, 44, 50, 80, 0.7], ['Siberia', 56, 78, 40, 180, 0.3], ['Mongolia', 40, 52, 90, 120, 0.3], ['Tibet', 28, 40, 78, 102, 0.15],
  ['India', 6, 30, 66, 92, 24], ['N China', 33, 42, 104, 122, 5], ['Manchuria', 42, 54, 118, 135, 1.4], ['S China', 20, 33, 100, 122, 8], ['Korea/Japan', 30, 46, 124, 146, 2.2],
  ['SE Asia', -11, 20, 92, 128, 8.5], ['New Guinea', -11, 0, 130, 152, 0.15], ['Australia', -45, -11, 112, 155, 0.33], ['NZ', -48, -34, 165, 179, 0.06],
  ['E N America', 25, 50, -100, -60, 3.5], ['W N America', 30, 50, -125, -100, 1.0], ['Canada/Alaska', 50, 75, -170, -50, 0.2], ['Mesoamerica', 7, 25, -118, -77, 2.8],
  ['Andes', -40, 12, -82, -69, 1.3], ['Amazon', -15, 7, -69, -44, 0.5], ['S Am SE', -56, -15, -69, -34, 2.9],
];
const marks0 = [110, 153, 190, 213, 240];
const CONT = { Asia: [4, 5, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24], Europe: [0, 1, 2, 3], Africa: [6, 7, 8, 9, 10, 11, 12, 13], Americas: [28, 29, 30, 31, 32, 33, 34], Oceania: [25, 26, 27] };

async function one(ov, run) {
  const { planetFields } = await import('./planet.mjs');
  const { People } = await import('../../src/engine/people.js');
  const { stream } = await import('../../src/rng.js');
  const pp = new People(await planetFields('earth', 6), ov);
  pp.rng = stream(`earth/${run}`, 'people'); pp.seaRng = stream(`earth/${run}`, 'people:sea'); pp.ids.rng = stream(`earth/${run}`, 'people:peoples'); pp.pol.rng = stream(`earth/${run}`, 'people:polities');
  const H = pp.H, deg = 180 / Math.PI, regOf = new Int16Array(pp.nL);
  for (let c = 0; c < pp.nL; c++) { const la = H.lat[c] * deg, lo = H.lon[c] * deg; regOf[c] = REGIONS.findIndex(([, a, b, x, y]) => la >= a && la < b && lo >= x && lo < y); }
  const ev = {};
  pp.onEvent = (t, k, s) => { if (!ev[k]) ev[k] = { t, s }; };
  pp.seed();
  // The industrial era at history's dates (industry's start as 1760: +110 is 1870, +153 1913, +190 1950, +213
  // 1973, +240 2000): the people, the world's income a person (food and goods, sy), the richest region's
  // against the poorest's (regions with 1% of the people or more), industry's share of the people, and the
  // share held by a state whose capital's people are unlike them (likeness under 0.5).
  const marks = marks0.slice(), emp = [];
  const empire = () => {
    const pol = pp.pol, N = pp.Ntot, inc = new Float64Array(REGIONS.length), pop = new Float64Array(REGIONS.length);
    let all = 0, unl = 0, out = 0, ind = 0;
    for (let c = 0; c < pp.nL; c++) {
      all += N[c]; out += pp.Out[c]; ind += N[c] * pp.ind[c];
      if (regOf[c] >= 0) { inc[regOf[c]] += pp.Out[c]; pop[regOf[c]] += N[c]; }
      const k = pol.owner(c), sm = k >= 0 ? pp.ids.simX(c, pol.list[k].X) : 1;
      if (sm < 0.5) unl += N[c];
    }
    const y = [...pop.keys()].filter(r => pop[r] > 0.01 * all).map(r => inc[r] / pop[r]);
    return [all, out / all, Math.max(...y) / Math.max(Math.min(...y), 1e-9), ind / all, unl / all];
  };
  // When each continent is first peopled (its first 10,000 people), checked every 500 years.
  const CN = Object.keys(CONT), contOf = Int8Array.from(regOf, r => CN.findIndex(n => CONT[n].includes(r))), peopled = {};
  let chk = -1e9, by = null;
  // The world's milestones (its people passing 1, 1.5, 2, 3, 4, 5 and 6 billion), and the regions' shares at early takeoff.
  const MILE = [1, 1.5, 2, 3, 4, 5, 6], mile = {};
  const shares = () => { const b = new Float64Array(REGIONS.length); let tot = 0; for (let c = 0; c < pp.nL; c++) { tot += pp.Ntot[c]; if (regOf[c] >= 0) b[regOf[c]] += pp.Ntot[c]; } return { b, tot }; };
  while (pp.t < 6e6 && !ev.dial) {
    pp.step(pp.nextDt());
    const N = pp.history[pp.history.length - 1].people;
    for (const x of MILE) if (mile[x] == null && N >= x * 1e9) mile[x] = pp.t;
    if (ev.present && !by) by = shares();
    if (pp.t - chk >= 500) {
      chk = pp.t;
      const bc = new Float64Array(CN.length);
      for (let c = 0; c < pp.nL; c++) if (contOf[c] >= 0) bc[contOf[c]] += pp.Ntot[c];
      CN.forEach((n, i) => { if (peopled[n] == null && bc[i] > 1e4) peopled[n] = pp.t; });
    }
    if (ev.industry && marks.length && pp.t >= ev.industry.t + marks[0]) { marks.shift(); emp.push(empire()); }
    if (ev.industry && pp.t - ev.industry.t > 3000) break;
  }
  if (!by) by = shares();
  const tot = by.tot;
  by = by.b;
  const at = e => (e ? (/at (-?\d+°, -?\d+°)/.exec(e.s) || [])[1] : null);
  // The states (src/engine/polities.js) at 3 and 1 kyr before industry, at it, and at early takeoff: the
  // effective number, the largest's share of the people held, and the share of the people held.
  const h = pp.history, near = t => h.reduce((b, x) => (Math.abs(x.t - t) < Math.abs(b.t - t) ? x : b), h[0]);
  const tP = ev.present ? ev.present.t : pp.t, s1 = h.find(x => (x.states || 0) > 0.5);
  const agr = ev.industry ? { fields: ev.farming ? (tP - ev.farming.t) / 1e3 : null, state: s1 ? (tP - s1.t) / 1e3 : null, europe: peopled.Europe != null ? (tP - peopled.Europe) / 1e3 : null,
    sahul: peopled.Oceania != null ? (tP - peopled.Oceania) / 1e3 : null, americas: peopled.Americas != null ? (tP - peopled.Americas) / 1e3 : null,
    pop: [11.76e3, 1.76e3, 0.26e3].map(b => near(ev.industry.t - b).people) } : null;
  const states = ev.industry ? [ev.industry.t - 3000, ev.industry.t - 1000, ev.industry.t, ev.present ? ev.present.t : pp.t].map(t => { const x = near(t); return [x.states || 0, x.stTop || 0, x.stHeld || 0]; }) : null;
  const dialN = ev.dial ? near(ev.dial.t).people : null;
  return { agr, states, emp, shares: Array.from(by, n => n / tot), people: tot, yrs: ev.present && ev.industry ? ev.present.t - ev.industry.t : null,
    dial: ev.dial && ev.industry ? { ind: ev.dial.t - ev.industry.t, six: mile[6] != null ? ev.dial.t - mile[6] : null, people: dialN, after: ev.present ? ev.dial.t - ev.present.t : null } : null,
    miles: MILE.slice(1).map((x, i) => mile[x] != null && mile[MILE[i]] != null ? mile[x] - mile[MILE[i]] : null), lead: mile[1] != null && ev.industry ? mile[1] - ev.industry.t : null,
    farm: ev.farming ? at(ev.farming) : null, ind: ev.industry ? at(ev.industry) : null, farmToInd: ev.farming && ev.industry ? ev.industry.t - ev.farming.t : null, packages: pp.packages.length,
    origins: pp.packages.slice(0, 6).map(q => `${regOf[q.c] >= 0 ? REGIONS[regOf[q.c]][0] : `${Math.round(q.lat * deg)}°, ${Math.round(q.lon * deg)}°`} (${q.zone})`) };
}

if (process.argv[1] !== fileURLToPath(import.meta.url)) {
  // imported (for REGIONS): nothing to run
} else if (process.argv[2] === '--one') {
  process.stdout.write(JSON.stringify(await one(JSON.parse(process.argv[3]), process.argv[4])));
} else {
  const ov = process.argv[2] || '{}', draws = +(process.argv[3] || 4), self = fileURLToPath(import.meta.url);
  const runs = await Promise.all(Array.from({ length: draws }, (_, k) => new Promise((ok, fail) => {
    const p = spawn(process.execPath, [self, '--one', ov, String(k)], { env: process.env });
    let out = '', err = '';
    p.stdout.on('data', d => (out += d)); p.stderr.on('data', d => (err += d));
    p.on('close', code => (code ? fail(new Error(err)) : ok(JSON.parse(out))));
  })));
  const obs = REGIONS.map(r => r[5]), os = obs.reduce((a, b) => a + b, 0);
  const score = r => r.shares.reduce((s, m, k) => s + obs[k] / os * Math.abs(Math.log(Math.max(m, 1e-3) / (obs[k] / os))), 0);
  const sc = runs.map(score), mean = a => a.reduce((x, y) => x + y, 0) / a.length;
  const sh = REGIONS.map((_, k) => mean(runs.map(r => r.shares[k])));
  console.log('region'.padEnd(18) + 'model %'.padStart(8) + '  now %');
  REGIONS.forEach((r, k) => console.log(r[0].padEnd(18) + (100 * sh[k]).toFixed(1).padStart(8) + (100 * obs[k] / os).toFixed(1).padStart(7)));
  console.log(Object.entries(CONT).map(([n, ks]) => `${n} ${(100 * ks.reduce((a, k) => a + sh[k], 0)).toFixed(0)}% (now ${(100 * ks.reduce((a, k) => a + obs[k], 0) / os).toFixed(0)}%)`).join(' · '));
  for (const [k, r] of runs.entries()) console.log(`draw ${k}: score ${sc[k].toFixed(3)} · farming first at ${r.farm} (${r.packages} origins), industry ${r.farmToInd ? (r.farmToInd / 1e3).toFixed(1) : '-'} kyr later at ${r.ind} · early takeoff ${r.yrs ? r.yrs.toFixed(0) : '-'} yr after industry, ${(r.people / 1e9).toFixed(2)} billion people\n         origins in order: ${r.origins.join(', ')}`);
  const st = runs.filter(r => r.states);
  if (st.length) console.log('states (effective number · the largest\'s share · the people held) at ' + ['3 kyr before industry', '1 kyr before', 'industry', 'early takeoff'].map((w, i) => `${w} ${mean(st.map(r => r.states[i][0])).toFixed(1)} · ${(100 * mean(st.map(r => r.states[i][1]))).toFixed(0)}% · ${(100 * mean(st.map(r => r.states[i][2]))).toFixed(0)}%`).join('; '));
  // History: Europe ~45 kyr (Ranis), Sahul 47–65 (the short and long chronologies), the Americas by ~21–23 (White
  // Sands); the first fields ~11.4 (the Fertile Crescent), the first state ~5.45 (Uruk); people as McEvedy and Jones
  // (Kremer's table) to HYDE 3.3 and the Census Bureau's range.
  const ag = runs.filter(r => r.agr), md = a => { const b = a.filter(v => v != null).sort((p, q) => p - q); return b.length ? b[b.length >> 1] : NaN; };
  if (ag.length) console.log(`the agrarian era, medians in kyr before early takeoff (history's before-present): people reach Europe ${md(ag.map(r => r.agr.europe)).toFixed(0)} (~45), Sahul ${md(ag.map(r => r.agr.sahul)).toFixed(0)} (47–65), the Americas ${md(ag.map(r => r.agr.americas)).toFixed(0)} (≥21–23) · the first fields ${md(ag.map(r => r.agr.fields)).toFixed(1)} (~11.4) · the first state ${md(ag.map(r => r.agr.state)).toFixed(1)} (~5.45) · people at 10,000 BCE ${(md(ag.map(r => r.agr.pop[0])) / 1e6).toFixed(0)} M (1–10), 1 CE ${(md(ag.map(r => r.agr.pop[1])) / 1e6).toFixed(0)} M (170–255), 1500 ${(md(ag.map(r => r.agr.pop[2])) / 1e6).toFixed(0)} M (425–503)`);
  // History (Maddison 2003: people, and income at $400 1990 GK$ a sy; the richest against the poorest as the US's
  // against Africa's; Eloranta and Harrison: ~31% of the world's people in dependencies in 1913).
  const HIST = [[1870, 1.27, 2.19, 4.9], [1913, 1.79, 3.81, 8.3], [1950, 2.52, 5.28, 10.7], [1973, 3.92, 10.2, 11.8], [2000, 6.07, 15.0, 19.2]];
  const em = runs.filter(r => r.emp && r.emp.length === HIST.length), med = a => [...a].sort((p, q) => p - q)[a.length >> 1];
  if (em.length) console.log('the industrial era, median of the draws (history) — people · income a person · the richest region against the poorest · industrial · under unlike rulers:\n' + HIST.map(([yr, n, y, r], i) => `  ${yr} (+${marks0[i]}): ${(med(em.map(q => q.emp[i][0])) / 1e9).toFixed(2)} B (${n}) · ${med(em.map(q => q.emp[i][1])).toFixed(1)} sy (${y}) · ${med(em.map(q => q.emp[i][2])).toFixed(1)}× (${r}) · ${(100 * med(em.map(q => q.emp[i][3]))).toFixed(0)}% · ${(100 * med(em.map(q => q.emp[i][4]))).toFixed(0)}%${yr === 1913 ? ' (~31%)' : ''}`).join('\n'));
  // History's milestones (from memory: the UN's and the Census Bureau's estimates): 1 billion ~1804, 1.5 ~1890, 2 in
  // 1927, 3 in 1960, 4 in 1974, 5 in 1987, 6 in 1999; the dial wanted in late 2027 (a9), ~8.3 billion then.
  const dl = runs.filter(r => r.dial);
  if (dl.length) {
    const HM = [86, 37, 33, 14, 13, 12], NM = ['1→1.5', '1.5→2', '2→3', '3→4', '4→5', '5→6'];
    console.log(`the takeoff, medians: early takeoff ${md(runs.map(r => r.yrs)).toFixed(0)} yr after industry · the dial ${md(dl.map(r => r.dial.after)).toFixed(1)} yr after it: ${(1760 + md(dl.map(r => r.dial.ind))).toFixed(1)} by industry's start as 1760 (the draws ${Math.min(...dl.map(r => 1760 + r.dial.ind)).toFixed(0)}–${Math.max(...dl.map(r => 1760 + r.dial.ind)).toFixed(0)}), ${(1999 + md(dl.map(r => r.dial.six))).toFixed(1)} by the world's 6 billion as 1999 (late 2027), ${(md(dl.map(r => r.dial.people)) / 1e9).toFixed(2)} billion people (~8.3)\n  the world's milestones, years between (history's): ${NM.map((nm, i) => `${nm} ${md(runs.map(r => r.miles[i])).toFixed(0)} (${HM[i]})`).join(' · ')} · industry to 1 billion ${md(runs.map(r => r.lead)).toFixed(0)} (~44)`);
  }
  console.log(`score ${mean(sc).toFixed(3)} ± ${Math.sqrt(mean(sc.map(s => (s - mean(sc)) ** 2))).toFixed(3)} over ${draws} draws`);
}
