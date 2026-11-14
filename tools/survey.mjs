// Long headless runs of the coupled planet (plates + landscape): continental
// area and thickness, sea level, plates, land, seafloor age, speeds, erosion
// and sediment, every 10 Myr.
// usage: node tools/survey.mjs [overrides-json] [steps of 0.5 Myr] [seed]
//   overrides: { "PARAMS": {...plates}, "LAND": {...landscape} }

import { buildGrid } from '../src/grid/icosphere.js';
import { Tectonics, CM_PER_YR, PARAMS } from '../src/engine/plates.js';
import { Landscape, LAND } from '../src/engine/landscape.js';
import { genesis } from '../src/engine/genesis.js';

const over = JSON.parse(process.argv[2] || '{}');
Object.assign(PARAMS, over.PARAMS || {});
Object.assign(LAND, over.LAND || {});
const steps = +(process.argv[3] || 400);
const seed = process.argv[4] || 'earthlike';
const g = buildGrid(6);
const tec = new Tectonics(g);
const land = new Landscape(tec);
genesis(tec, seed, { spinup: 40, landscape: land });
let tl = 0, tp = 0;
for (let s = 1; s <= steps; s++) {
  let t0 = performance.now();
  tec.step(0.5);
  tp += performance.now() - t0; t0 = performance.now();
  land.step(5e5);
  tl += performance.now() - t0;
  if (s % 20 === 0) {
    const st = tec.stats();
    const sp = tec.alivePlates().map(p => (Math.hypot(...p.w) * CM_PER_YR).toFixed(1)).join(' ');
    let cont = 0, hsum = 0, hmax = 0, emax = 0, lake = 0;
    for (let i = 0; i < g.n; i++) {
      if (tec.phi[i] >= 0.5) { cont += g.area[i]; hsum += g.area[i] * tec.h[i]; hmax = Math.max(hmax, tec.h[i]); }
      if (tec.elev[i] > tec.seaLevel) emax = Math.max(emax, tec.elev[i] - tec.seaLevel);
      if (land.lake[i] > 0) lake++;
    }
    const f = land.flux;
    console.log(`t ${tec.t.toFixed(0).padStart(4)} cont ${(cont / (4 * Math.PI) * 100).toFixed(0)}% h ${(hsum / cont).toFixed(1)}/${hmax.toFixed(0)} top ${emax.toFixed(1)}km sl ${(tec.seaLevel * 1000).toFixed(0)}m plates ${st.plates} land ${(st.land * 100).toFixed(0)}% age ${st.meanOceanAge.toFixed(0)} erode ${f.eroded.toFixed(2)} lakes ${lake} | ${sp} | ${(tp / s).toFixed(1)}+${(tl / s).toFixed(1)}ms`);
  }
}
