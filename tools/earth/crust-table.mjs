// Today's Earth's continental crust as the sim stands it (src/engine/earth.js's fit, with the trenches and
// the mantle's dynamic topography, the ice's load off), by distance from the ocean: each distance band's lower edge and mean distance (km), the crust's distance at each twentieth of its area (km), and each band's quantiles of the crust's elevation above a
// new ridge (km). Prints `EARTH_CRUST` for src/engine/genesis.js, which builds a seeded planet's
// continents to the same statistics.
// usage: node tools/earth/crust-table.mjs [level]
import { openPlanet } from '../../src/engine/planet.js';
import { elevation, H_OCEANIC } from '../../src/engine/crust.js';
import { coastDistance } from '../../src/engine/genesis.js';

const level = +(process.argv[2] || 6);
const P = await openPlanet('earth', { level }), tec = P.tec, g = P.grid;   // the crust refitted under the ice (earthIce)
const n = g.n, cont = Uint8Array.from(tec.phi, f => f >= 0.5), d = coastDistance(g, cont);
const ridge = elevation(H_OCEANIC, 0, 0);
const EDGES = [0, 100, 200, 400, 800, 1600, Infinity];
const U = [0, 0.02, 0.05, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 0.95, 0.98, 0.995, 1];
const D = [], E = [];
let total = 0;
for (let b = 0; b + 1 < EDGES.length; b++) {
  const rows = [];
  let A = 0, Ad = 0;
  for (let i = 0; i < n; i++) {
    if (!cont[i] || d[i] < EDGES[b] || d[i] >= EDGES[b + 1]) continue;
    rows.push([elevation(tec.h[i], tec.phi[i], tec.t - tec.tf[i]) + tec.trench[i] + tec.dyn[i] - ridge, g.area[i]]);   // as measured: with the trenches and the mantle's topography
    A += g.area[i]; Ad += g.area[i] * d[i];
  }
  rows.sort((p, q) => p[0] - q[0]);
  const q = u => { let acc = 0; for (const [e, a] of rows) { acc += a; if (acc >= u * A - 1e-15) return e; } return rows[rows.length - 1][0]; };
  D.push(Math.round(Ad / A)); E.push(U.map(u => +q(u).toFixed(2)));
  total += A;
  console.error(`${EDGES[b]}–${EDGES[b + 1]} km: ${(100 * A / (4 * Math.PI)).toFixed(1)}% of the sphere`);
}
console.error(`continental crust ${(100 * total / (4 * Math.PI)).toFixed(1)}% of the sphere`);
// The continental crust's distance from the ocean (km) at each twentieth of its area.
const all = [];
for (let i = 0; i < n; i++) if (cont[i]) all.push([d[i], g.area[i]]);
all.sort((p, q) => p[0] - q[0]);
const Q = [];
for (let k = 0; k <= 20; k++) { let acc = 0, v = all[all.length - 1][0]; for (const [x, a] of all) { acc += a; if (acc >= k / 20 * total - 1e-15) { v = x; break; } } Q.push(Math.round(v)); }
console.log(`export const EARTH_CRUST = {\n  B: [${EDGES.slice(0, -1).join(', ')}],\n  D: [${D.join(', ')}],\n  Q: [${Q.join(', ')}],\n  U: [${U.join(', ')}],\n  E: [\n${E.map(r => `    [${r.join(', ')}],`).join('\n')}\n  ],\n};`);
