// The climate on a seeded planet: global means, the zonal profile, the zones' shares.
// usage: node tools/climate-check.mjs [seed] [overrides-json for CLIMATE]
//   env: FIXED=1 the zones' fixed widths, NOLAKES=1 no lakes, NOREG=1 no regolith
import { buildGrid } from '../src/grid/icosphere.js';
import { Tectonics } from '../src/engine/plates.js';
import { Landscape } from '../src/engine/landscape.js';
import { genesis } from '../src/engine/genesis.js';
import { Climate, CLIMATE, ZONES, NZ } from '../src/engine/climate.js';
import { Year } from '../src/engine/year.js';
import { Lakes } from '../src/engine/lakes.js';
import { Regolith } from '../src/engine/regolith.js';
Object.assign(CLIMATE, JSON.parse(process.argv[3] || '{}'));
const g = buildGrid(6), tec = new Tectonics(g), land = new Landscape(tec);
genesis(tec, process.argv[2] || 'earthlike', { spinup: 40, landscape: land });
const clim = new Climate(tec, land);
// The year's spread sets the zones' widths (FIXED=1 in the env: the fixed widths, as before phase 6).
if (!process.env.FIXED) clim.year = new Year(clim);
// The lakes at their balance after each cycle, as at a fast dial (NOLAKES=1: none).
const lakes = process.env.NOLAKES ? null : new Lakes(g);
if (lakes) { clim.lakes = lakes; lakes.reroute(tec.elev, tec.seaLevel); }
// The regolith sets the soil's capacity (NOREG=1: the fixed capacity, as before phase 7); its
// opening layer settles with the climate's third cycle.
const reg = process.env.NOREG ? null : new Regolith(tec, land, clim);
if (reg) { land.preview(); reg.init(); }
const cycle = () => { clim.solve(1); if (reg) reg.update(0); if (lakes) lakes.equilibrium(clim.runoff, clim.peAnn, 1); };
let t0 = performance.now();
cycle();
const cold = performance.now() - t0; t0 = performance.now();
cycle();
const warm = performance.now() - t0;
cycle(); cycle();
const s = clim.stats, z = clim.zonal;
console.log(`cycle ${cold.toFixed(0)} ms cold, ${warm.toFixed(0)} ms warm · mean T ${s.meanT.toFixed(1)} °C · ice line ${s.iceLat.toFixed(0)}° · Hadley ${s.hadley.toFixed(0)}° · P ${s.meanP.toFixed(0)} mm/yr (land ${s.landP.toFixed(0)}) · ITCZ ${z.itczLo.toFixed(0)}..${z.itczHi.toFixed(0)}°`);
for (let b = 0; b < 90; b += 5) console.log(`${(-89 + 2 * b).toString().padStart(4)}°  T ${z.T[b].toFixed(1).padStart(6)} (${z.Tlo[b].toFixed(0).padStart(4)}..${z.Thi[b].toFixed(0).padStart(3)})  P ${z.P[b].toFixed(0).padStart(5)}  land P ${isNaN(z.Pland[b]) ? '   -' : z.Pland[b].toFixed(0).padStart(5)}`);
const share = new Float64Array(NZ); let la = 0;
for (let i = 0; i < g.n; i++) if (clim.landMask[i]) { la += g.area[i]; for (let k = 0; k < NZ; k++) share[k] += clim.zones[NZ * i + k] * g.area[i]; }
console.log(ZONES.map((name, k) => `${name} ${(100 * share[k] / la).toFixed(0)}`).join(' · '));
{
  let run = 0, pl = 0, beta = 0, pf = 0;
  for (let i = 0; i < g.n; i++) if (clim.landMask[i]) { const a = g.area[i]; run += a * clim.runoff[i] * 1000; pl += a * clim.Pf[0][i] * 365.25; beta += a * clim.soil.beta[i]; pf += a * clim.soil.permafrost[i]; }
  const L = lakes ? lakes.stats() : null, R2 = 6371 * 6371;
  console.log(`land: runoff ${(run / la).toFixed(0)} mm/yr (${(100 * run / pl).toFixed(0)}% of rain) · soil β ${(beta / la).toFixed(2)} · permafrost ${(100 * pf / la).toFixed(0)}% · soil's year ${clim.stats.soilYears.toFixed(2)} yr a cell` +
    (reg ? ` · regolith ${reg.stats.mean.toFixed(2)} m (bare ${(100 * reg.stats.bare).toFixed(0)}%)` : '') +
    (L ? ` · lakes ${L.lakes} (${L.closed} closed) ${(L.area / 1e3).toFixed(0)}k km² (${(100 * L.area / (la * R2)).toFixed(2)}% of land), salt ${(L.saltArea / 1e3).toFixed(0)}k km²` : ''));
}
let wmax = 0, wsum = 0; for (let i = 0; i < g.n; i++) { const w = Math.hypot(clim.windPhase[2][3*i], clim.windPhase[2][3*i+1], clim.windPhase[2][3*i+2]); wmax = Math.max(wmax, w); wsum += w * g.area[i]; }
console.log(`wind (Jun–Jul) mean ${(wsum / 4 / Math.PI).toFixed(1)} m/s max ${wmax.toFixed(1)}`);
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
