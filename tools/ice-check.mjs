// Ice on a seeded planet: grow ice under a fixed climate (or an orbit), and
// report volume, area, sea-level equivalent and the ice line.
// usage: node tools/ice-check.mjs [seed] [kyr] [climate overrides json]
import { buildGrid } from '../src/grid/icosphere.js';
import { Tectonics } from '../src/engine/plates.js';
import { Landscape } from '../src/engine/landscape.js';
import { genesis } from '../src/engine/genesis.js';
import { Climate, CLIMATE } from '../src/engine/climate.js';
import { Ice } from '../src/engine/ice.js';
import { OrbitCycles } from '../src/engine/orbit.js';
const seed = process.argv[2] || 'earthlike', kyr = +(process.argv[3] || 100);
Object.assign(CLIMATE, JSON.parse(process.argv[4] || '{}'));
const g = buildGrid(6), tec = new Tectonics(g), land = new Landscape(tec);
genesis(tec, seed, { spinup: 40, landscape: land });
const clim = new Climate(tec, land), ice = new Ice(tec, clim);
clim.ice = ice;
const orbit = new OrbitCycles(seed);
clim.solve(3);
let t = 0, wall = 0;
for (let k = 1; k <= kyr; k++) {
  const t0 = performance.now();
  clim.orbit = orbit.at(k, 0);
  const done = ice.advance(1000, 1e9);
  tec.updateElevation();
  if (k % 2 === 0) clim.solve(1);
  wall += performance.now() - t0;
  if (k % 10 === 0) console.log(`${k} kyr · ice ${(ice.stats.volume / 1e15).toFixed(2)} M km³ · ${(ice.stats.area / 1e12).toFixed(2)} M km² · sea ${(-ice.stats.seaLevel).toFixed(0)} m · mean T ${clim.stats.meanT.toFixed(1)} · ice line ${clim.stats.iceLat.toFixed(0)}° · max H ${Math.max(...ice.H).toFixed(0)} m · ${(wall / k).toFixed(0)} ms/kyr`);
}
