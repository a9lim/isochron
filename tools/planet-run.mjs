// The coupled planet, headless: global values every so often.
// usage: node tools/planet-run.mjs [seed] [kyr] [fastStep yr] [print every kyr] [overrides json {CLIMATE, CARBON, ICE, REGOLITH, CRUSTFLEX}]
import { Planet, CLIMATE, CARBON } from '../src/engine/planet.js';
import { ICE } from '../src/engine/ice.js';
import { REGOLITH } from '../src/engine/regolith.js';
import { CRUSTFLEX } from '../src/engine/crustflex.js';
const [seed = 'earthlike', kyr = '200', fast = '1000', every = '20', ov = '{}'] = process.argv.slice(2);
const o = JSON.parse(ov); Object.assign(CLIMATE, o.CLIMATE || {}); Object.assign(CARBON, o.CARBON || {});
Object.assign(ICE, o.ICE || {}); Object.assign(REGOLITH, o.REGOLITH || {}); Object.assign(CRUSTFLEX, o.CRUSTFLEX || {});
let t0 = performance.now();
const P = new Planet(seed);
console.log(`built in ${(performance.now() - t0).toFixed(0)} ms`);
t0 = performance.now();
P.settleClimate();   // the opening's closure: until the climate has settled
console.log(`settled after ${P.climate.stats.settled} cycles (${(performance.now() - t0).toFixed(0)} ms) · T ${P.climate.stats.meanT.toFixed(1)} · CO2 ${P.carbon.pco2.toFixed(0)} · P ${P.climate.stats.meanP.toFixed(0)} mm/yr (land ${P.climate.stats.landP.toFixed(0)})`);
for (let k = 0; k < +kyr; k += +every) {
  t0 = performance.now();
  P.run(+every * 1000, { fastStep: +fast, climateEvery: Math.max(+fast, 2000) });
  const [T, co2, sea, ice, land, ridge] = P.sample();
  const I = P.ice.stats, R = P.regolith.stats, F = P.crustFlex ? P.crustFlex.stats : null;
  console.log(`${((P.years - P.tec.t0 * 1e6) / 1e3).toFixed(0).padStart(6)} kyr · T ${T.toFixed(1)} · CO2 ${co2.toFixed(0)} · sea ${sea.toFixed(0)} m · ice ${ice.toFixed(0)} m · land ${land.toFixed(1)}% · ridge ${ridge.toFixed(2)} · out ${P.carbon.flux.out.toFixed(3)} w ${P.carbon.flux.weather.toFixed(3)} · ` +
    `ice ${(I.volume / 1e15).toFixed(2)} M km³ thawed ${(100 * I.thawed).toFixed(0)}% slide ${I.sliding.toFixed(0)} m/yr streaming ${(100 * I.streaming).toFixed(0)}% erosion ${(1000 * I.erosion / Math.max(1, I.area)).toFixed(3)} mm/yr · ` +
    `regolith ${R.mean.toFixed(2)} m bare ${(100 * R.bare).toFixed(0)}% bed ${R.iceBed.toFixed(2)}${F ? ` · flex ${F.rms.toFixed(0)}/${F.max.toFixed(0)} m` : ''} · ${(performance.now() - t0).toFixed(0)} ms`);
}
