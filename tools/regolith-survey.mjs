// The Regolith experiment's survey (docs/PLAN.md, Experiments): does the ice's rhythm change
// as its beds are stripped? From the opening with CO₂ held and the regolith started at a given
// depth on all land, the coupled planet runs at the Ice ages experiment's pace (the orbit seen
// through a 20 kyr window, as at 10 kyr/s), and the ice's volume is read for its dominant period
// in successive windows, with the bed's softness and the regolith under the ice.
// usage: node tools/regolith-survey.mjs [seed] [CO₂ ppm] [start m] [kyr] [periodogram window kyr] [orbit window kyr]
import { openPlanet, CARBON } from '../src/engine/planet.js';
import { REGOLITH } from '../src/engine/regolith.js';
const [seed = 'earthlike', co2 = '220', start = '-1', kyr = '800', win = '200', orbitWin = '20'] = process.argv.slice(2);
CARBON.FIXED = +co2; REGOLITH.START = +start;
const P = await openPlanet(seed, { level: 6 });
P.settleClimate();   // the opening's closure: until the climate has settled
if (+start >= 0) P.regolith.init();
const vol = [], soft = [], t0 = performance.now();
let plateBank = 0, since = 0;
for (let k = 0; k < +kyr; k++) {
  P.years += 1000; plateBank += 1000;
  while (plateBank >= 5e5) { P.plateStep(5e5); plateBank -= 5e5; }
  P.setOrbit(1000 * +orbitWin);
  P.fast(1000, 1e9);
  if ((since += 1000) >= 2000) { P.climate.solve(1); P.afterClimate(); since = 0; }
  vol.push(P.ice.stats.volume / 1e15); soft.push(P.regolith.stats.iceBed);
}
/** The dominant period (kyr) of a series (1 kyr apart) between 15 and 150 kyr, after removing its linear trend, and its share of the variance there. */
function dominant(x) {
  const n = x.length, m = x.reduce((s, v) => s + v, 0) / n;
  let sx = 0, sxx = 0, sxy = 0;
  x.forEach((v, i) => { sx += i; sxx += i * i; sxy += i * (v - m); });
  const b = sxy / (sxx - sx * sx / n), y = x.map((v, i) => v - m - b * (i - sx / n));
  let best = 0, bestP = 0, tot = 0;
  for (let p = 15; p <= 150; p += 1) {
    let c = 0, s = 0;
    y.forEach((v, i) => { c += v * Math.cos(2 * Math.PI * i / p); s += v * Math.sin(2 * Math.PI * i / p); });
    const pw = c * c + s * s;
    tot += pw;
    if (pw > best) { best = pw; bestP = p; }
  }
  const sd = Math.sqrt(y.reduce((s, v) => s + v * v, 0) / n);
  return { period: bestP, share: best / tot, sd, mean: m };
}
const W = +win, rows = [];
for (let a = 0; a + W <= vol.length; a += W) {
  const d = dominant(vol.slice(a, a + W)), s = soft.slice(a, a + W).reduce((q, v) => q + v, 0) / W;
  rows.push(`${a}–${a + W} kyr: ice ${d.mean.toFixed(2)} ± ${d.sd.toFixed(2)} M km³ (${(100 * d.sd / d.mean).toFixed(1)}%), period ${d.period} kyr (${(100 * d.share).toFixed(0)}% of the power), bed ${s.toFixed(2)}`);
}
console.log(`${seed} ${co2} ppm, regolith from ${+start >= 0 ? start + ' m' : 'its steady state'}, the orbit through ${orbitWin} kyr · ${((performance.now() - t0) / 1000).toFixed(0)} s\n  ` + rows.join('\n  '));
