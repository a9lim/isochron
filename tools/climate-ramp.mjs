// The climate's transient response, headless: CO₂ rising 1% a year from a settled planet's (the carbon cycle
// held off: the climate's cycles and the deep sea's steps alone), its warming at doubling (year 70: the
// transient climate response) against its balance at 2× (the deep caught up), and κ, the heat the deep sea
// takes a kelvin of that warming (src/engine/deepsea.js). Geoffroy and others' two layers (2013, Table 4:
// γ 0.73, C 7.3, C_D 106) give 0.67 of the balance at doubling for this model's λ, and κ 0.59.
// usage: node tools/climate-ramp.mjs [seed] [years a cycle] [overrides json for DEEP]
//   env: LEVEL=n (6)
import { openPlanet, CLIMATE } from '../src/engine/planet.js';
import { DEEP } from '../src/engine/deepsea.js';

const [seed = 'earth', dts = '2', ov = '{}'] = process.argv.slice(2);
Object.assign(DEEP, JSON.parse(ov));
const dt = +dts;
const P = await openPlanet(seed, { level: +(process.env.LEVEL || 6) });
P.settleClimate();
const c = P.climate, d = c.deep, c0 = CLIMATE.CO2;
console.log(`settled: ${c.stats.meanT.toFixed(2)} °C at ${c0.toFixed(0)} ppm`);
// One live cycle without a forcing's change: the deep holds still.
d.step(dt); c.solve(1);
const base = c.stats.meanT;
console.log(`a live cycle, unforced: ${base.toFixed(3)} °C, the deep taking ${d.stats.uptake.toFixed(3)} W/m²`);
let tcr = NaN, N70 = NaN;
for (let t = dt; t <= 140 + 1e-9; t += dt) {
  d.step(dt);
  CLIMATE.CO2 = c0 * Math.pow(1.01, t);
  c.solve(1);
  if (Math.abs(t % 10) < 1e-9) console.log(`${t.toFixed(0).padStart(4)} yr  ${CLIMATE.CO2.toFixed(0).padStart(5)} ppm  warmer ${(c.stats.meanT - base).toFixed(2)} K  the deep taking ${d.stats.uptake.toFixed(2)} W/m², lagging ${(-d.stats.lag).toFixed(2)} K`);
  if (Math.abs(t - 70) < 1e-9) { tcr = c.stats.meanT - base; N70 = d.stats.uptake; }
}
// The balance at 2×: the deep caught up (a cycle's span of 10⁵ yr).
CLIMATE.CO2 = 2 * c0;
for (let k = 0; k < 10; k++) { d.step(1e5); c.solve(1); }
const ecs = c.stats.meanT - base;
console.log(`at doubling ${tcr.toFixed(2)} K against ${ecs.toFixed(2)} K at its balance (${(tcr / ecs).toFixed(2)}) · κ ${(N70 / tcr).toFixed(2)} W m⁻² K⁻¹`);
