// The Pulse experiment headless: each size's share left in the air after 1, 10 and 100 kyr,
// against the theory (src/engine/pulse.js), driven as the page drives it at its dial
// (3.2 kyr/s: the climate every ~3 kyr, the carbon each ~200 years).
// usage: node tools/pulse-run.mjs [seed] [Pg C ...]
import { openPlanet } from '../src/engine/planet.js';

const [seed = 'earthlike', ...sizes] = process.argv.slice(2);
const pct = v => (v == null ? '  —' : `${(100 * v).toFixed(1)}%`.padStart(6));
for (const PgC of (sizes.length ? sizes : ['1000', '5000']).map(Number)) {
  const t0 = performance.now();
  const P = await openPlanet(seed);
  P.settleClimate();   // the opening's closure: until the climate has settled (the sea settles then)
  const fast = 200, climateEvery = 3200;
  const p0 = P.carbon.pco2, tag = P.carbon.startPulse(PgC);
  let since = 0, peak = p0;
  for (let t = 0; t < 1e5; t += fast) {
    P.years += fast;
    P.setOrbit(6400);
    P.fast(fast, 1e9, 3200);
    peak = Math.max(peak, P.carbon.pco2);
    since += fast;
    if (since >= climateEvery) { P.climate.solve(1); P.afterClimate(); since = 0; }
  }
  const i = tag.info, th = i.theory;
  console.log(`${seed} · ${PgC} Pg C · CO₂ ${Math.round(p0)} → ${Math.round(peak)} → ${Math.round(P.carbon.pco2)} ppm · left after 1, 10, 100 kyr ${pct(i.at[0])} ${pct(i.at[1])} ${pct(i.at[2])}` +
    ` · theory ${pct(th.s1)} ${pct(th.s10)} ${pct(th.s100)} (closed ${pct(th.closed)}, compensated ${pct(th.compensated)}, e-folding ${(th.tau / 1e3).toFixed(0)} kyr)` +
    ` · ${((performance.now() - t0) / 1000).toFixed(0)} s`);
}
