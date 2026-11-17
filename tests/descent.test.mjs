// Descent (src/engine/climate.js, `descent`) on a seeded planet under a made-up wind: the wind's
// equatorward share, nothing for poleward air or at the equator.
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildGrid } from '../src/grid/icosphere.js';
import { Tectonics } from '../src/engine/plates.js';
import { genesis } from '../src/engine/genesis.js';
import { Climate, CLIMATE } from '../src/engine/climate.js';

const g = buildGrid(5), tec = new Tectonics(g);
genesis(tec, 'earthlike', { spinup: 10 });
const c = new Climate(tec);
c.geography();
const n = g.n;
/** Every phase's wind: u east and v north (m/s) at each cell. */
function setWind(u, v) {
  for (const w of c.windPhase) for (let i = 0; i < n; i++) {
    const la = c.lat[i], lo = c.lon[i];
    const e = [-Math.sin(lo), Math.cos(lo), 0], nn = [-Math.sin(la) * Math.cos(lo), -Math.sin(la) * Math.sin(lo), Math.cos(la)];
    for (let d = 0; d < 3; d++) w[3 * i + d] = u * e[d] + v * nn[d];
  }
}

test('descent: the equatorward share of the wind, none poleward or at the equator', () => {
  const keep = CLIMATE.SUB_V;
  CLIMATE.SUB_V = 5;
  try {
    setWind(0, -10);   // southward everywhere: equatorward in the north, poleward in the south
    const d = c.descent(c.windPhase[0]);
    for (let i = 0; i < n; i++) {
      const la = c.lat[i] * 180 / Math.PI;
      if (la > 20) assert.ok(d[i] > 0.99, `equatorward at ${la.toFixed(0)}°: ${d[i]}`);
      if (la < -1) assert.equal(d[i], 0);
      if (Math.abs(la) < 0.5) assert.ok(d[i] < 0.05, 'none at the equator');
    }
  } finally { CLIMATE.SUB_V = keep; }
});
