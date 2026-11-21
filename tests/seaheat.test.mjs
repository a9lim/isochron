// The sea's heat transport (src/engine/seaheat.js): water kept through every cell, and the heat it gives the air
// summing to nothing.
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildGrid } from '../src/grid/icosphere.js';
import { Tectonics } from '../src/engine/plates.js';
import { genesis } from '../src/engine/genesis.js';
import { Climate } from '../src/engine/climate.js';
import { SEAHEAT } from '../src/engine/seaheat.js';

const g = buildGrid(5), tec = new Tectonics(g);
genesis(tec, 'earthlike', { spinup: 10 });
const c = new Climate(tec);
c.geography();
const cg = c.coarse, nc = cg.n, sh = c.seaHeat;
sh.settle();
/** Every phase's wind: u east (m/s) by latitude. */
function setWind(u) {
  for (const w of c.windPhase) for (let i = 0; i < g.n; i++) {
    const lo = c.lon[i], s = u(c.lat[i]);
    w[3 * i] = -Math.sin(lo) * s; w[3 * i + 1] = Math.cos(lo) * s; w[3 * i + 2] = 0;
  }
}

test('the sea\'s water: kept through every cell, and the heat it gives the air sums to nothing', () => {
  setWind(la => 8 * Math.sin(2 * la));
  sh.setFlow();
  assert.ok(sh.on && sh.stats.sv >= SEAHEAT.MIX - 1e-9, `the overturning runs (${sh.stats.sv.toFixed(1)} Sv)`);
  let worst = 0, total = 0;
  for (let I = 0; I < nc; I++) {
    if (!sh.sea[I]) continue;
    let net = sh.K[I] - sh.S[I];
    for (let t = cg.nbrOff[I]; t < cg.nbrOff[I + 1]; t++) net += sh.F[t];
    worst = Math.max(worst, Math.abs(net)); total += sh.S[I];
  }
  assert.ok(worst < 1e-6 * total, `water kept to ${(worst / total).toExponential(1)} of the flow`);
  // A made-up state: warm at the equator, cold at the poles; the heat, swept to convergence.
  const T = Float64Array.from({ length: nc }, (_, I) => 28 - 30 * cg.pos[3 * I + 2] ** 2);
  const keep = { ...SEAHEAT };
  Object.assign(SEAHEAT, { SWEEPS: 4000, TOL: 1e-10 });
  try { sh.terms(T); sh.terms(T); } finally { Object.assign(SEAHEAT, keep); }
  let Q = 0, up = 0;
  for (let I = 0; I < nc; I++) { const q = sh.rhs[I] - sh.diag[I] * T[I]; Q += q; up += Math.abs(q); }
  assert.ok(Math.abs(Q) < 1e-6 * up, `the heat sums to ${(Q / up).toExponential(1)} of what it moves`);
  const [eq, mid] = sh.transport([0, 45]);
  assert.ok(Number.isFinite(eq) && Number.isFinite(mid), 'its transport is measured');
});
