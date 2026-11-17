// The climate on a seeded planet (or today's Earth: `earth`), converged: global means, the zonal profile, the zones' shares.
// It runs cycles until the climate has settled (the engine's criterion, `stats.settled`: two
// cycles running that moved the mean temperature less than CLIMATE.SETTLE_T and rain, global and
// on land, less than SETTLE_P), with the moisture converged each cycle; the opening's first
// cycles are a transient (the cover and the rain feed each other), so the numbers to tune to are
// these, not cycle 4's.
// usage: node tools/climate-check.mjs [seed] [overrides-json for CLIMATE]
//   env: FIXED=1 the zones' fixed widths, NOLAKES=1 no lakes, NOREG=1 no regolith, NOVEG=1 no cover,
//        NOOCEAN=1 no gyres, LEVEL=n the grid (6), MAX=n cycles at most (40), TRACE=1 each cycle's means
import { buildGrid } from '../src/grid/icosphere.js';
import { Tectonics, channel } from '../src/engine/plates.js';
import { Landscape } from '../src/engine/landscape.js';
import { genesis } from '../src/engine/genesis.js';
import { isEarth, loadEarth, earthGenesis, earthIce } from '../src/engine/earth.js';
import { Ice } from '../src/engine/ice.js';
import { Climate, CLIMATE, ZONES, NZ } from '../src/engine/climate.js';
import { Year } from '../src/engine/year.js';
import { Lakes } from '../src/engine/lakes.js';
import { Regolith } from '../src/engine/regolith.js';
import { Vegetation } from '../src/engine/vegetation.js';
import { coverClimate } from '../src/engine/life.js';
import { Ocean } from '../src/engine/ocean.js';
Object.assign(CLIMATE, JSON.parse(process.argv[3] || '{}'));
const seed = process.argv[2] || 'earthlike';
const g = buildGrid(+(process.env.LEVEL || 6)), tec = new Tectonics(g), land = new Landscape(tec);
// Today's Earth (`earth`) from its data, with its ice sheets held as they are (src/engine/earth.js).
const earth = isEarth(seed) ? earthGenesis(tec, seed, await loadEarth()) : null;
if (!earth) genesis(tec, seed, { spinup: 40, landscape: land });
const clim = new Climate(tec, land);
if (earth) { clim.ice = new Ice(tec, clim); earthIce({ tec, ice: clim.ice, grid: g }, earth); land.reroute(); }
// The gyres, as the planet has them (NOOCEAN=1: none, as before the retune).
if (!process.env.NOOCEAN) clim.ocean = new Ocean(clim, clim.coarse);
// The year's spread sets the zones' widths (FIXED=1 in the env: the fixed widths, as before phase 6).
if (!process.env.FIXED) clim.year = new Year(clim);
// The lakes at their balance after each cycle, as at a fast dial (NOLAKES=1: none).
const lakes = process.env.NOLAKES ? null : new Lakes(g);
if (lakes) { clim.lakes = lakes; lakes.reroute(tec.elev, tec.sea, null, null, channel(tec, new Float64Array(g.n))); }
// The regolith sets the soil's capacity (NOREG=1: the fixed capacity, as before phase 7); its
// opening layer sits at its balance with the climate until the climate has settled.
const reg = process.env.NOREG ? null : new Regolith(tec, land, clim);
if (reg) { land.preview(); reg.init(); }
// The plants' cover at its balance after each cycle, as at the opening (NOVEG=1: none, the zones' albedo).
const veg = process.env.NOVEG ? null : new Vegetation(g.n, g.area);
const cycle = () => {
  clim.solve(1);
  if (reg) reg.update(0);
  if (lakes) lakes.equilibrium(clim.runoff, clim.peAnn, 1);
  if (veg) { coverClimate(veg, clim, CLIMATE.CO2); veg.equilibrate(); clim.cover = { ft: veg.ft, fg: veg.fg }; }
};
const seaIce = () => {
  let sa = 0, si = 0;
  for (let i = 0; i < g.n; i++) if (!clim.landMask[i]) { sa += g.area[i]; si += g.area[i] * clim.snowAnn[i]; }
  return si / sa;
};
const MAX = +(process.env.MAX || 40), first = [];
let cold = 0, warm = 0, last = 0;
for (let k = 1; k <= MAX; k++) {
  const t0 = performance.now();
  cycle();
  const ms = performance.now() - t0, s = clim.stats;
  if (k === 1) cold = ms; else if (k === 2) warm = ms;
  last = ms;
  if (k === 4) first.push(s.meanT, s.meanP, s.landP);
  if (process.env.TRACE) console.log(`  ${String(k).padStart(2)}  T ${s.meanT.toFixed(2)} · P ${s.meanP.toFixed(0)} (land ${s.landP.toFixed(0)}) · ice line ${s.iceLat.toFixed(1)}° · sea ice ${(100 * seaIce()).toFixed(1)}% · energy balance ${s.ebmSteps} step${s.ebmSteps > 1 ? 's' : ''} (${s.ebmRes.toFixed(3)} K) · sweeps ${s.sweeps} · ${ms.toFixed(0)} ms`);
  if (s.settled) break;
}
const s = clim.stats, z = clim.zonal;
console.log(s.settled ? `settled after ${s.settled} cycles` : `not settled after ${MAX} cycles (ΔT ${s.dT.toFixed(3)} K, ΔP ${(100 * s.dP).toFixed(2)}%, land ${(100 * s.dPland).toFixed(2)}%)`,
  `(cycle 4: ${first.length ? `${first[0].toFixed(1)} °C, ${first[1].toFixed(0)} mm/yr, land ${first[2].toFixed(0)}` : '-'}) · cycle ${cold.toFixed(0)} ms cold, ${warm.toFixed(0)} ms the second, ${last.toFixed(0)} ms settled`);
console.log(`mean T ${s.meanT.toFixed(1)} °C · ice line ${s.iceLat.toFixed(0)}° · sea ice ${(100 * seaIce()).toFixed(1)}% of the sea · Hadley ${s.hadley.toFixed(0)}° · P ${s.meanP.toFixed(0)} mm/yr (land ${s.landP.toFixed(0)}) · ITCZ ${z.itczLo.toFixed(0)}..${z.itczHi.toFixed(0)}°`);
for (let b = 0; b < 90; b += 5) console.log(`${(-89 + 2 * b).toString().padStart(4)}°  T ${z.T[b].toFixed(1).padStart(6)} (${z.Tlo[b].toFixed(0).padStart(4)}..${z.Thi[b].toFixed(0).padStart(3)})  P ${z.P[b].toFixed(0).padStart(5)}  land P ${isNaN(z.Pland[b]) ? '   -' : z.Pland[b].toFixed(0).padStart(5)}`);
const share = new Float64Array(NZ); let la = 0;
for (let i = 0; i < g.n; i++) if (clim.landMask[i]) { la += g.area[i]; for (let k = 0; k < NZ; k++) share[k] += clim.zones[NZ * i + k] * g.area[i]; }
console.log(ZONES.map((name, k) => `${name} ${(100 * share[k] / la).toFixed(0)}`).join(' · '));
{
  const grp = [[0, 4, 'A'], [4, 6, 'B'], [6, 9, 'C'], [9, 12, 'D'], [12, 14, 'E']];
  console.log('groups: ' + grp.map(([a, b, nm]) => { let v = 0; for (let k = a; k < b; k++) v += share[k]; return `${nm} ${(100 * v / la).toFixed(0)}`; }).join(' · ') + '  (Earth, Peel and others, from memory: A 19 · B 30 · C 13 · D 25 · E 13)');
}
{
  let run = 0, pl = 0, beta = 0, pf = 0;
  const zon = new Float64Array(3);   // land by its permafrost's share: continuous (> 0.9), discontinuous (0.5–0.9), sporadic (0.1–0.5)
  for (let i = 0; i < g.n; i++) if (clim.landMask[i]) {
    const a = g.area[i], p = clim.soil.permafrost[i];
    run += a * clim.runoff[i] * 1000; pl += a * clim.Pf[0][i] * 365.25; beta += a * clim.soil.beta[i]; pf += a * p;
    if (p > 0.9) zon[0] += a; else if (p > 0.5) zon[1] += a; else if (p > 0.1) zon[2] += a;
  }
  const L = lakes ? lakes.stats() : null, R2 = 6371 * 6371;
  console.log(`land: runoff ${(run / la).toFixed(0)} mm/yr (${(100 * run / pl).toFixed(0)}% of rain) · soil β ${(beta / la).toFixed(2)} · permafrost ${(100 * pf / la).toFixed(0)}% (land continuous ${(100 * zon[0] / la).toFixed(1)}%, discontinuous ${(100 * zon[1] / la).toFixed(1)}, sporadic ${(100 * zon[2] / la).toFixed(1)}) · soil's year ${clim.stats.soilYears.toFixed(2)} yr a cell` +
    (reg ? ` · regolith ${reg.stats.mean.toFixed(2)} m (bare ${(100 * reg.stats.bare).toFixed(0)}%)` : '') +
    (L ? ` · lakes ${L.lakes} (${L.closed} closed) ${(L.area / 1e3).toFixed(0)}k km² (${(100 * L.area / (la * R2)).toFixed(2)}% of land), salt ${(L.saltArea / 1e3).toFixed(0)}k km²` : ''));
}
let wmax = 0, wsum = 0; for (let i = 0; i < g.n; i++) { const w = Math.hypot(clim.windPhase[2][3*i], clim.windPhase[2][3*i+1], clim.windPhase[2][3*i+2]); wmax = Math.max(wmax, w); wsum += w * g.area[i]; }
console.log(`wind (Jun–Jul) mean ${(wsum / 4 / Math.PI).toFixed(1)} m/s max ${wmax.toFixed(1)}`);
if (veg) {
  const land = new Uint8Array(g.n); for (let i = 0; i < g.n; i++) land[i] = clim.landMask[i];
  const t = veg.totals(land);
  console.log(`cover: trees ${(100 * t.trees).toFixed(0)}% · grass ${(100 * t.grass).toFixed(0)}% · bare ${(100 * t.bare).toFixed(0)}% of land · land carbon ${t.veg.toFixed(0)} Pg in plants, ${t.soil.toFixed(0)} in soil`);
}
// Land-only seasonal range (warmest − coldest month) by 10° band.
{
  const { monthPhase } = await import('../src/engine/orbit.js');
  const mph = Array.from({ length: 12 }, (_, m) => monthPhase(m));
  const rng = new Float64Array(18), hot = new Float64Array(18), coldm = new Float64Array(18), A = new Float64Array(18);
  for (let i = 0; i < g.n; i++) {
    if (!clim.landMask[i]) continue;
    let lo = 99, hi = -99; for (const t of mph) { const v = clim.surfaceT(i, t); lo = Math.min(lo, v); hi = Math.max(hi, v); }
    const b = Math.min(17, Math.floor((clim.lat[i] * 180 / Math.PI + 90) / 10)), a = g.area[i];
    rng[b] += a * (hi - lo); hot[b] += a * hi; coldm[b] += a * lo; A[b] += a;
  }
  console.log('land, by 10°: ' + Array.from(A, (a, b) => a > 0 ? `${b * 10 - 85}° ${(coldm[b] / a).toFixed(0)}..${(hot[b] / a).toFixed(0)} (${(100 * a / (2 * Math.PI * (Math.sin((b + 1) * Math.PI / 18 - Math.PI / 2) - Math.sin(b * Math.PI / 18 - Math.PI / 2)))).toFixed(0)}% land)` : '').filter(Boolean).join(' · '));
}
// The seasons: the seasonal range (warmest − coldest month) at 45°, zonal and on land, and land's summer at 60–70° N.
{
  const { monthPhase } = await import('../src/engine/orbit.js');
  const mph = Array.from({ length: 12 }, (_, m) => monthPhase(m));
  const band = (a, b, land) => {
    const zon = new Float64Array(12); let A = 0, rng = 0, jja = 0;
    for (let i = 0; i < g.n; i++) {
      const la = clim.lat[i] * 180 / Math.PI;
      if (la < a || la > b || (land && !clim.landMask[i])) continue;
      const w = g.area[i]; let lo = 99, hi = -99;
      mph.forEach((t, m) => { const v = clim.surfaceT(i, t); zon[m] += w * v; lo = Math.min(lo, v); hi = Math.max(hi, v); if (m >= 5 && m <= 7) jja += w * v / 3; });
      rng += w * (hi - lo); A += w;
    }
    return { zonal: (Math.max(...zon) - Math.min(...zon)) / A, cell: rng / A, jja: jja / A };
  };
  const n45 = band(43, 47, false), s45 = band(-47, -43, false), l45 = band(40, 50, true), ls45 = band(-50, -40, true), l65 = band(60, 70, true);
  console.log(`seasons: 45° zonal range ${n45.zonal.toFixed(1)} K N, ${s45.zonal.toFixed(1)} S · land 40–50° range ${l45.cell.toFixed(1)} N, ${ls45.cell.toFixed(1)} S · land 60–70° N range ${l65.cell.toFixed(1)}, JJA ${l65.jja.toFixed(1)} °C`);
}
