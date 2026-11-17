// The Eruption experiment, headless: one tagged eruption at the most active tropical arc
// of a warm planet, then its own global cooling month by month (the anomaly model is
// linear, so the tag's response is the eruption's alone), against the analytic response
// of independent boxes under the veil's decaying forcing.
// usage: node tools/eruption-run.mjs [seed] [Pinatubos...]
import { openPlanet } from '../src/engine/planet.js';

const seed = process.argv[2] || 'earthlike', sizes = process.argv.slice(3).map(Number);
const P = await openPlanet(seed, { level: 6 });
P.settleClimate();   // the opening's closure: until the climate has settled
const yr = v => v == null ? '—' : `${v.toFixed(2)} yr`, K = v => `${v.toFixed(3)} K`;
for (const M of sizes.length ? sizes : [1, 10, 30]) {
  const I = P.year.eruptTagged(M, P.years), lat = Math.asin(I.p[2]) * 180 / Math.PI;
  let lowest = 0;
  for (let k = 0; k < 20 * 12; k++) { P.run(1 / 12, { fastStep: 1 / 12, climateEvery: 1e9 }); lowest = Math.min(lowest, P.year.stats.meanT); }
  const th = I.theory;
  console.log(`${seed} · ${M} P at ${lat.toFixed(0)}° · F₀ ${I.F0.toFixed(1)} W/m² · peak ${K(I.peak)} at ${yr(I.tPeak)}, e-folding ${yr(I.efold)} · theory ${K(th.peak)} at ${yr(th.tPeak)}, ${yr(th.efold)} · ratio ${(I.peak / th.peak).toFixed(2)} · with noise and the rest, the anomaly's lowest ${K(lowest)}`);
}
