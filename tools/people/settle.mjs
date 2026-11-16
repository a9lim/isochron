// When each landmass is settled, against farming's first origin (a9, 2026-11-16: "they reached
// farming before they settled most of the world"). Landmasses by land alone; for each, the share
// of its cells holding people (N ≥ N_MIN per km²) through time, the first crossing that reaches it
// (sea cells and km from another landmass), and when it passed 10% and 50%.
// usage: node tools/people/settle.mjs [seed] [tMax] [overrides json]
import { planetFields } from './planet.mjs';
import { People } from '../../src/engine/people.js';
import { fmtYears } from './fit.mjs';

const [seed = 'earthlike', tMax = '4e6', ov = '{}'] = process.argv.slice(2);
const planet = await planetFields(seed, 6);
const pp = new People(planet, JSON.parse(ov));
const body = pp.components(() => true, 0), E = pp.E, H = pp.H, nL = pp.nL;
const A = new Float64Array(body.count), cnt = new Int32Array(body.count);
for (let c = 0; c < nL; c++) { A[body.id[c]] += H.area[c]; cnt[body.id[c]]++; }
const big = [...A.keys()].filter(k => A[k] > 2e5).sort((a, b) => A[b] - A[a]);
// The shortest crossing into each landmass from any other: hops and km.
const gap = new Map(big.map(k => [k, { hops: 99, km: Infinity }]));
for (let c = 0; c < nL; c++) for (let o = E.off[c]; o < E.off[c + 1]; o++) if (E.hop[o]) {
  const k = body.id[E.nb[o]];
  if (k === body.id[c] || !gap.has(k)) continue;
  const g = gap.get(k); if (E.km[o] < g.km) { g.km = E.km[o]; g.hops = E.hop[o]; }
}
const at = new Map(big.map(k => [k, { p0: null, p10: null, p50: null }]));
pp.onEvent = (t, kind, text) => { if (['origin', 'farming', 'tip', 'industry', 'present', 'split', 'merge'].includes(kind) && !(kind === 'farming' && pp.packages.length > 1)) console.log(`${fmtYears(t).padStart(12)}  ${kind.padEnd(9)} ${text.slice(0, 110)}`); };
pp.seed();
let lastPrint = 0;
pp.run({ tMax: +tMax, onStep(p) {
  const occ = new Float64Array(body.count), zb = new Float64Array(body.count), nb = new Float64Array(body.count);
  for (let c = 0; c < nL; c++) { const k = body.id[c]; if (p.Ntot[c] >= p.P.N_MIN * H.area[c]) occ[k] += H.area[c]; nb[k] += p.Ntot[c]; zb[k] += p.Ntot[c] * (p.zc ? p.zc[c] : 0); }
  for (const k of big) {
    const s = occ[k] / A[k], a = at.get(k);
    if (a.p0 === null && s > 0) a.p0 = p.t;
    if (a.p10 === null && s >= 0.1) a.p10 = p.t;
    if (a.p50 === null && s >= 0.5) a.p50 = p.t;
  }
  if (p.t - lastPrint > 100e3) {
    lastPrint = p.t;
    console.log(`${fmtYears(p.t).padStart(12)}  ` + big.slice(0, 10).map(k => `${(100 * occ[k] / A[k]).toFixed(0)}%${nb[k] > 0 ? '(z' + (zb[k] / nb[k]).toFixed(1) + ')' : ''}`).join(' '));
  }
}, stop: p => !!p.econ.on });
const farm = pp.packages.length ? pp.packages[0].t : null;
console.log(`\nfarming's first origin ${farm === null ? '-' : fmtYears(farm)}; landmasses (M km², shortest crossing in, first settled, 10% and 50% of it):`);
for (const k of big) { const g = gap.get(k), a = at.get(k); console.log(`  ${(A[k] / 1e6).toFixed(2).padStart(6)}  ${g.km === Infinity ? 'none' : g.hops + ' cells, ' + g.km.toFixed(0) + ' km'}  ${[a.p0, a.p10, a.p50].map(x => x === null ? '-' : fmtYears(x)).join(' / ')}`); }
