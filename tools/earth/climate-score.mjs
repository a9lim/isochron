// Today's Earth's climate against Earth's (tools/earth/obs.py's observations on the grid): the climate
// as tools/climate-check.mjs runs it (the cover, the lakes, the regolith, the gyres, the year's
// spread; the ice sheets held), settled, then scored over land by region (January, July and the
// year's temperature, the year's rain, the Köppen groups), the sea's surface and its ice by latitude,
// and the Köppen classes (the observations classified with the sim's own thresholds, hard, as the
// sim's months are).
// usage: node tools/earth/climate-score.mjs [overrides-json for CLIMATE]   env: MAR and VEGO (overrides-json for MARITIME and VEG), LEVEL (6), MAX (40), QUIET=1 (summary only)
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { buildGrid } from '../../src/grid/icosphere.js';
import { Tectonics } from '../../src/engine/plates.js';
import { Landscape } from '../../src/engine/landscape.js';
import { Climate, CLIMATE } from '../../src/engine/climate.js';
import { Year } from '../../src/engine/year.js';
import { Lakes } from '../../src/engine/lakes.js';
import { Regolith } from '../../src/engine/regolith.js';
import { Vegetation, VEG } from '../../src/engine/vegetation.js';
import { coverClimate } from '../../src/engine/life.js';
import { Ocean } from '../../src/engine/ocean.js';
import { Ice } from '../../src/engine/ice.js';
import { loadEarth, earthGenesis, earthIce } from '../../src/engine/earth.js';
import { MARITIME } from '../../src/engine/maritime.js';

Object.assign(CLIMATE, JSON.parse(process.argv[2] || '{}'));
Object.assign(MARITIME, JSON.parse(process.env.MAR || '{}'));
Object.assign(VEG, JSON.parse(process.env.VEGO || '{}'));
const LEVEL = +(process.env.LEVEL || 6), QUIET = !!process.env.QUIET;
const cache = fileURLToPath(new URL('./.cache/', import.meta.url));
const meta = JSON.parse(readFileSync(`${cache}obs-${LEVEL}.json`, 'utf8'));
const raw = readFileSync(`${cache}obs-${LEVEL}.f32`);
const obsArr = new Float32Array(raw.buffer, raw.byteOffset, raw.byteLength / 4);
const O = {};
meta.fields.forEach((k, f) => { O[k] = obsArr.subarray(f * meta.n * 12, (f + 1) * meta.n * 12); });

// ── The climate, settled ──
const g = buildGrid(LEVEL), tec = new Tectonics(g), land = new Landscape(tec);
const earth = earthGenesis(tec, 'earth', await loadEarth());
const clim = new Climate(tec, land);
clim.ice = new Ice(tec, clim); earthIce({ tec, ice: clim.ice, grid: g }, earth); land.reroute();
clim.ocean = new Ocean(clim, clim.coarse);
clim.year = new Year(clim);
const lakes = new Lakes(g); clim.lakes = lakes; lakes.reroute(tec.elev, tec.sea);
const reg = new Regolith(tec, land, clim); land.preview(); reg.init();
const veg = new Vegetation(g.n, g.area);
const t0 = performance.now();
for (let k = 1; k <= +(process.env.MAX || 40); k++) {
  clim.solve(1); reg.update(0); lakes.equilibrium(clim.runoff, clim.peAnn, 1);
  coverClimate(veg, clim, CLIMATE.CO2); veg.equilibrate(); clim.cover = { ft: veg.ft, fg: veg.fg };
  if (clim.stats.settled) break;
}
const s = clim.stats, n = g.n, R2 = 6371 * 6371;
const lat = i => Math.asin(g.pos[3 * i + 2]) * 180 / Math.PI, lon = i => Math.atan2(g.pos[3 * i + 1], g.pos[3 * i]) * 180 / Math.PI;

// ── Köppen, hard, as the sim's thresholds have them (climate.js, finishSteps) ──
const GROUP = 'AAAABBCCCDDDEE';
function koppen(tm, pm, north) {
  let mat = 0, map = 0, th = -99, tc = 99, pdry = 1e9, ps = 0, pw = 0, psd = 1e9, pwd = 1e9, psw = 0, pww = 0;
  for (let m = 0; m < 12; m++) {
    mat += tm[m] / 12; map += pm[m]; th = Math.max(th, tm[m]); tc = Math.min(tc, tm[m]); pdry = Math.min(pdry, pm[m]);
    if ((m >= 3 && m <= 8) === north) { ps += pm[m]; psd = Math.min(psd, pm[m]); psw = Math.max(psw, pm[m]); }
    else { pw += pm[m]; pwd = Math.min(pwd, pm[m]); pww = Math.max(pww, pm[m]); }
  }
  if (th < 10) return th < 0 ? 13 : 12;
  const pth = 2 * mat + (ps >= 0.7 * map ? 28 : pw >= 0.7 * map ? 0 : 14);
  if (map < 10 * pth) return map < 5 * pth ? 4 : 5;
  const dryS = psd < 40 && psd < pww / 3, dryW = pwd < psw / 10;
  const second = dryS ? 1 : dryW ? 2 : 0;
  if (tc >= 18) return pdry >= 60 ? 0 : pdry >= 100 - map / 25 ? 1 : psd < pwd ? 3 : 2;
  return (tc > 0 ? 6 : 9) + second;
}

// ── Per cell: the sim's months and the observations' ──
const REGIONS = [
  ['W Europe', 40, 60, -10, 30], ['E Europe', 45, 60, 30, 60], ['Siberia', 55, 70, 60, 140], ['C Asia', 35, 50, 50, 80],
  ['Mid East', 25, 40, 35, 60], ['Tibet', 28, 38, 80, 100], ['India', 8, 28, 68, 90], ['E China', 22, 40, 100, 122],
  ['SE Asia', -10, 20, 95, 125], ['Sahara', 18, 32, -15, 30], ['Sahel', 10, 18, -15, 35], ['Congo', -5, 5, 12, 30],
  ['E Africa', -12, 5, 30, 42], ['S Africa', -35, -15, 15, 35], ['N Australia', -20, -10, 120, 150], ['Aus interior', -32, -20, 120, 145],
  ['E N America', 30, 50, -95, -70], ['W N America', 30, 50, -125, -105], ['Canada', 50, 65, -120, -70], ['Amazon', -10, 3, -72, -50],
  ['S S America', -45, -25, -70, -55], ['Greenland', 65, 82, -55, -20], ['Antarctica', -90, -65, -180, 180],
];
const reg0 = () => ({ a: 0, tj: [0, 0], tl: [0, 0], ty: [0, 0], py: [0, 0], gs: new Float64Array(5), go: new Float64Array(5) });
const R = REGIONS.map(reg0), ALL = reg0();
const conf = Array.from({ length: 5 }, () => new Float64Array(5));
let agree = 0, agreeG = 0, la = 0, e2y = 0, e2j = 0, e2l = 0, bias = 0, lp2 = 0;
const tm = new Float64Array(12), pm = new Float64Array(12), to = new Float64Array(12), po = new Float64Array(12);
const zband = Array.from({ length: 18 }, () => ({ la: 0, lt: 0, lo: 0, sa: 0, st: 0, so: 0, ia: 0, is: 0, io: 0 }));
for (let i = 0; i < n; i++) {
  const a = g.area[i] * R2, b = Math.min(17, Math.floor((lat(i) + 90) / 10));
  if (clim.landMask[i] && O.landw[12 * i] > 0.5 && Number.isFinite(O.tland[12 * i])) {
    let ty = 0, yo = 0, py = 0, pyo = 0;
    for (let m = 0; m < 12; m++) {
      tm[m] = clim.T12[12 * i + m]; pm[m] = clim.P12[12 * i + m]; to[m] = O.tland[12 * i + m]; po[m] = O.pland[12 * i + m];
      ty += tm[m] / 12; yo += to[m] / 12; py += pm[m]; pyo += po[m];
    }
    const north = lat(i) >= 0, ks = koppen(tm, pm, north), ko = koppen(to, po, north), gs = 'ABCDE'.indexOf(GROUP[ks]), go = 'ABCDE'.indexOf(GROUP[ko]);
    la += a; if (ks === ko) agree += a; if (gs === go) agreeG += a; conf[go][gs] += a;
    const jan = north ? 0 : 6, jul = north ? 6 : 0;
    e2y += a * (ty - yo) ** 2; e2j += a * (tm[jan] - to[jan]) ** 2; e2l += a * (tm[jul] - to[jul]) ** 2; bias += a * (ty - yo);
    lp2 += a * Math.log((py + 50) / (pyo + 50)) ** 2;
    const add = r => { r.a += a; r.tj[0] += a * tm[0]; r.tj[1] += a * to[0]; r.tl[0] += a * tm[6]; r.tl[1] += a * to[6]; r.ty[0] += a * ty; r.ty[1] += a * yo; r.py[0] += a * py; r.py[1] += a * pyo; r.gs[gs] += a; r.go[go] += a; };
    add(ALL);
    REGIONS.forEach(([, l0, l1, o0, o1], k) => { const L = lat(i), Lo = lon(i); if (L >= l0 && L < l1 && Lo >= o0 && Lo < o1) add(R[k]); });
    zband[b].la += a; zband[b].lt += a * ty; zband[b].lo += a * yo;
  } else if (!clim.landMask[i] && Number.isFinite(O.sst[12 * i])) {
    let ty = 0, yo = 0, ice = 0, iceO = 0;
    for (let m = 0; m < 12; m++) {
      ty += (clim.T12[12 * i + m] + (clim.ocean ? clim.ocean.fine.sst[i] : 0)) / 12; yo += O.sst[12 * i + m] / 12;
      iceO += (O.icec[12 * i + m] > 0.15 ? 1 : 0) / 12;
    }
    ice = clim.snowAnn[i];
    zband[b].sa += a; zband[b].st += a * Math.max(-1.8, ty); zband[b].so += a * yo;
    zband[b].ia += a; zband[b].is += a * ice; zband[b].io += a * iceO;
  }
}
// Machine-readable (JSON=1): the summary, the zonal sea surface and sea ice errors, and each region's.
{
  let se = 0, sw = 0, ie = 0, iw = 0;
  for (const z of zband) {
    if (z.sa) { se += z.sa * (z.st / z.sa - z.so / z.sa) ** 2; sw += z.sa; }
    if (z.ia) { ie += z.ia * (z.is / z.ia - z.io / z.ia) ** 2; iw += z.ia; }
  }
  var J = {
    settled: s.settled, meanT: s.meanT, meanP: s.meanP, landP: s.landP,
    rmsY: Math.sqrt(e2y / la), rmsJ: Math.sqrt(e2j / la), rmsL: Math.sqrt(e2l / la), bias: bias / la, rain: Math.sqrt(lp2 / la),
    sea: Math.sqrt(se / sw), ice: Math.sqrt(ie / iw), koppen: agree / la, group: agreeG / la,
    groups: [...'ABCDE'].map((c, k) => [ALL.gs[k] / ALL.a, ALL.go[k] / ALL.a]),
    regions: Object.fromEntries(REGIONS.map(([name], k) => { const r = R[k]; return r.a ? [name, { jan: (r.tj[0] - r.tj[1]) / r.a, jul: (r.tl[0] - r.tl[1]) / r.a, year: (r.ty[0] - r.ty[1]) / r.a, rain: r.py[0] / Math.max(1, r.py[1]) }] : [name, null]; })),
  };
}
if (process.env.JSON) { console.log(JSON.stringify(J)); process.exit(0); }
const f1 = (v, d = 1) => (Number.isFinite(v) ? v.toFixed(d) : '—');
const groups = r => [...'ABCDE'].map((c, k) => `${c}${Math.round(100 * r.gs[k] / r.a)}/${Math.round(100 * r.go[k] / r.a)}`).join(' ');
const sum = `land T rms: year ${f1(Math.sqrt(e2y / la))} K (bias ${f1(bias / la)}), Jan ${f1(Math.sqrt(e2j / la))}, Jul ${f1(Math.sqrt(e2l / la))} · rain log-ratio rms ${f1(Math.sqrt(lp2 / la), 2)} · Köppen class ${f1(100 * agree / la, 0)}%, group ${f1(100 * agreeG / la, 0)}%`;
console.log(`settled ${s.settled || 'not'} (${((performance.now() - t0) / 1000).toFixed(0)} s) · mean ${f1(s.meanT)} °C · rain ${f1(s.meanP, 0)} mm/yr (land ${f1(s.landP, 0)}) · lakes ${f1(lakes.stats ? lakes.stats.area / 1e6 : NaN, 2)} M km²`);
console.log(sum);
console.log(`groups (sim/obs % of land): ${groups(ALL)}`);
if (!QUIET) {
  console.log('region          Jan sim/obs     Jul sim/obs     year sim/obs   rain sim/obs mm   groups sim/obs %');
  REGIONS.forEach(([name], k) => {
    const r = R[k]; if (!r.a) return;
    const v = x => x / r.a;
    console.log(`${name.padEnd(14)} ${f1(v(r.tj[0])).padStart(6)} ${f1(v(r.tj[1])).padStart(6)}   ${f1(v(r.tl[0])).padStart(6)} ${f1(v(r.tl[1])).padStart(6)}   ${f1(v(r.ty[0])).padStart(6)} ${f1(v(r.ty[1])).padStart(6)}   ${f1(v(r.py[0]), 0).padStart(5)} ${f1(v(r.py[1]), 0).padStart(5)}    ${groups(r)}`);
  });
  console.log('zonal (10°)     land year sim/obs   sea surface sim/obs   sea ice share sim/obs');
  zband.forEach((z, b) => {
    const l = -90 + 10 * b;
    console.log(`${String(l).padStart(4)}..${String(l + 10).padStart(3)}      ${z.la ? `${f1(z.lt / z.la).padStart(6)} ${f1(z.lo / z.la).padStart(6)}` : '     —      —'}       ${z.sa ? `${f1(z.st / z.sa).padStart(6)} ${f1(z.so / z.sa).padStart(6)}` : '     —      —'}        ${z.ia ? `${f1(100 * z.is / z.ia, 0).padStart(4)} ${f1(100 * z.io / z.ia, 0).padStart(4)}` : ''}`);
  });
  console.log('Köppen groups, observed (rows) as simulated (columns), % of the row:');
  conf.forEach((row, k) => { const t = row.reduce((x, y) => x + y, 0); if (t) console.log(`  ${"ABCDE"[k]}  ` + Array.from(row, v => f1(100 * v / t, 0).padStart(4)).join("")); });
}
