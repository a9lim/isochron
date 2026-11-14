// Long headless plate runs: plates, land, seafloor age, slabs, collision fronts,
// speeds (cm/yr) and event counters every 10 Myr.
// usage: node tools/plates-survey.mjs [PARAMS-overrides-json] [steps of 0.5 Myr] [seed]

import { buildGrid } from '../src/grid/icosphere.js';
import { Tectonics, CM_PER_YR, PARAMS } from '../src/engine/plates.js';
import { genesis } from '../src/engine/genesis.js';
const g = buildGrid(6);
const base = { ...PARAMS };
const over = JSON.parse(process.argv[2] || '{}');
const steps = +(process.argv[3] || 400);
Object.assign(PARAMS, base, over);
const tec = new Tectonics(g); genesis(tec, process.argv[4] || 'earthlike', {});
for (let s = 1; s <= steps; s++) {
  tec.step(0.5);
  if (s % 20 === 0) {
    const st = tec.stats();
    let slab = 0, col = 0; for (let i = 0; i < g.n; i++) { if (tec.slab[i] > 0.01) slab++; if (tec.col[i] > 0.05) col++; }
    const sp = tec.alivePlates().map(p => (Math.hypot(...p.w) * CM_PER_YR).toFixed(1)).join(' ');
    let cont = 0, hsum = 0; for (let i = 0; i < g.n; i++) if (tec.phi[i] >= 0.5) { cont += g.area[i]; hsum += g.area[i] * tec.h[i]; }
    console.log(`cont ${(cont / (4 * Math.PI) * 100).toFixed(0)}% h ${(hsum / cont).toFixed(1)} sl ${(tec.seaLevel*1000).toFixed(0)}m t ${tec.t.toFixed(0).padStart(4)} plates ${st.plates} land ${(st.land*100).toFixed(0)}% age ${st.meanOceanAge.toFixed(0)} slab ${slab} col ${col} | ${sp} | ${JSON.stringify(tec.counters)}`);
  }
}
