// The people on today's Earth against where people live now (docs/people.md, "On Earth"): runs
// the people from the first hominins to early takeoff on the cached opening, several draws of their
// chances in parallel, and scores each run's population by region against the regions' shares now
// (rough, from memory: national totals of ~2023 split onto the boxes below): Σ share × |ln(model /
// observed)|, a model share floored at 0.1%. Prints each region's mean share against the observed, the
// continents', where farming and industry began (the first six origins by region and zone), and the run's totals.
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
const CONT = { Asia: [4, 5, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24], Europe: [0, 1, 2, 3], Africa: [6, 7, 8, 9, 10, 11, 12, 13], Americas: [28, 29, 30, 31, 32, 33, 34], Oceania: [25, 26, 27] };

async function one(ov, run) {
  const { planetFields } = await import('./planet.mjs');
  const { People } = await import('../../src/engine/people.js');
  const { stream } = await import('../../src/rng.js');
  const pp = new People(await planetFields('earth', 6), ov);
  pp.rng = stream(`earth/${run}`, 'people'); pp.seaRng = stream(`earth/${run}`, 'people:sea');
  const H = pp.H, deg = 180 / Math.PI, regOf = new Int16Array(pp.nL);
  for (let c = 0; c < pp.nL; c++) { const la = H.lat[c] * deg, lo = H.lon[c] * deg; regOf[c] = REGIONS.findIndex(([, a, b, x, y]) => la >= a && la < b && lo >= x && lo < y); }
  const ev = {};
  pp.onEvent = (t, k, s) => { if (!ev[k]) ev[k] = { t, s }; };
  pp.seed();
  while (pp.t < 6e6 && !ev.present) { pp.step(pp.nextDt()); if (ev.industry && pp.t - ev.industry.t > 3000) break; }
  const by = new Float64Array(REGIONS.length);
  let tot = 0;
  for (let c = 0; c < pp.nL; c++) { tot += pp.Ntot[c]; if (regOf[c] >= 0) by[regOf[c]] += pp.Ntot[c]; }
  const at = e => (e ? (/at (-?\d+°, -?\d+°)/.exec(e.s) || [])[1] : null);
  return { shares: Array.from(by, n => n / tot), people: tot, yrs: ev.present && ev.industry ? ev.present.t - ev.industry.t : null,
    farm: ev.farming ? at(ev.farming) : null, ind: ev.industry ? at(ev.industry) : null, farmToInd: ev.farming && ev.industry ? ev.industry.t - ev.farming.t : null, packages: pp.packages.length,
    origins: pp.packages.slice(0, 6).map(q => `${regOf[q.c] >= 0 ? REGIONS[regOf[q.c]][0] : `${Math.round(q.lat * deg)}°, ${Math.round(q.lon * deg)}°`} (${q.zone})`) };
}

if (process.argv[2] === '--one') {
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
  console.log(`score ${mean(sc).toFixed(3)} ± ${Math.sqrt(mean(sc.map(s => (s - mean(sc)) ** 2))).toFixed(3)} over ${draws} draws`);
}
