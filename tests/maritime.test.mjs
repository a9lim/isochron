// Maritime air (src/engine/maritime.js) and descent (src/engine/climate.js, `descent`), on a seeded
// planet under a made-up wind: with no wind there is none; under a westerly the sea's air reaches
// the land from its windward coast and fades inland (more slowly for a longer L), carrying the sea's
// seasons; the exchange enters only land's seasonal harmonics. Descent is the wind's equatorward
// share, nothing for poleward air or at the equator.
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildGrid } from '../src/grid/icosphere.js';
import { Tectonics } from '../src/engine/plates.js';
import { genesis } from '../src/engine/genesis.js';
import { Climate, CLIMATE } from '../src/engine/climate.js';
import { MARITIME } from '../src/engine/maritime.js';

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
/** Coarse state: the sea's seasons at amplitude 1 (harmonic 1, real), the land's at 0. */
const Tc = Array.from({ length: 5 }, () => new Float64Array(c.coarse.n));
for (let I = 0; I < c.coarse.n; I++) if (!(c.landFracC[I] >= 0.5)) Tc[1][I] = 1;

test('maritime air: none without wind; under a westerly it fades inland, slower for a longer reach', () => {
  setWind(0, 0); c.maritime.setWind();
  assert.equal(c.maritime.carry(Tc), false, 'no wind, no maritime air');
  setWind(8, 0); c.maritime.setWind();
  const keep = { ...MARITIME };
  const share = L => { Object.assign(MARITIME, keep, { L, KAPPA: 0 }); c.maritime.carry(Tc); return Float64Array.from(c.maritime.q[0]); };
  try {
    const short = share(800), long = share(3000);
    const land = [...Array(c.coarse.n).keys()].filter(I => c.landFracC[I] >= 0.5);
    const mean = q => land.reduce((s, I) => s + q[I], 0) / land.length;
    assert.ok(land.every(I => short[I] >= 0 && short[I] <= 1 + 1e-9), 'a share between 0 and 1');
    assert.ok(mean(long) > mean(short) + 0.05, `longer reach, more of the sea's air inland (${mean(short).toFixed(2)} → ${mean(long).toFixed(2)})`);
    // The carried temperature is the sea's: m T_mar / m = 1 wherever the share is appreciable.
    Object.assign(MARITIME, keep, { L: 1500, KAPPA: 0 }); c.maritime.carry(Tc);
    const q = c.maritime.q;
    for (const I of land) if (q[0][I] > 0.05) assert.ok(Math.abs(q[2][I] / q[0][I] - 1) < 1e-6, 'the sea\'s seasons carried unchanged');
    // Only land's seasonal harmonics: nothing at sea, nothing on the annual mean.
    for (let i = 0; i < n; i++) if (!c.landMask[i]) assert.equal(c.maritime.km[i], 0);
    assert.ok(c.maritime.F[0].every(v => v === 0), 'the annual mean untouched');
  } finally { Object.assign(MARITIME, keep); }
});

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
