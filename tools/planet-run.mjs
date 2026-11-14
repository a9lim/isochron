// The coupled planet, headless: global values every so often.
// usage: node tools/planet-run.mjs [seed] [kyr] [fastStep yr] [print every kyr] [overrides json {CLIMATE, CARBON}]
import { Planet, CLIMATE, CARBON } from '../src/engine/planet.js';
const [seed = 'earthlike', kyr = '200', fast = '1000', every = '20', ov = '{}'] = process.argv.slice(2);
const o = JSON.parse(ov); Object.assign(CLIMATE, o.CLIMATE || {}); Object.assign(CARBON, o.CARBON || {});
let t0 = performance.now();
const P = new Planet(seed);
console.log(`built in ${(performance.now() - t0).toFixed(0)} ms`);
P.climate.solve(3); P.afterClimate();
for (let k = 0; k < +kyr; k += +every) {
  t0 = performance.now();
  P.run(+every * 1000, { fastStep: +fast, climateEvery: Math.max(+fast, 2000) });
  const [T, co2, sea, ice, land, ridge] = P.sample();
  console.log(`${((P.years - P.tec.t0 * 1e6) / 1e3).toFixed(0).padStart(6)} kyr · T ${T.toFixed(1)} · CO2 ${co2.toFixed(0)} · sea ${sea.toFixed(0)} m · ice ${ice.toFixed(0)} m · land ${land.toFixed(1)}% · ridge ${ridge.toFixed(2)} · out ${P.carbon.flux.out.toFixed(3)} w ${P.carbon.flux.weather.toFixed(3)} · ${(performance.now() - t0).toFixed(0)} ms`);
}
