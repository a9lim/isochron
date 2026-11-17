// The sea's heat transport (src/engine/seaheat.js) on a seeded planet: the overturning's flow is a
// potential flow that conserves water (what leaves each cell is what arrives, less what sinks, plus
// what wells up); the heat it gives the air sums to nothing; a circumpolar channel's westerlies drive
// it and its upwelling lies in the channel; and a zonally open sea carries no gyre heat across it.
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

test('a circumpolar channel: its westerlies drive the overturning, which wells up in it', () => {
  // A sea open all the way round between two latitudes: cut every cell there to sea.
  const lf = c.landFracC, kept = Float64Array.from(lf);
  for (let I = 0; I < nc; I++) { const la = Math.asin(cg.pos[3 * I + 2]) * 180 / Math.PI; if (la > -62 && la < -52) lf[I] = 0; }
  sh.key = null; sh.geometry(); sh.settle();
  try {
    assert.ok(sh.open[90 - 57] === 1, 'the channel\'s circles are open');
    setWind(la => (la < 0 ? 9 : 4) * Math.cos(3 * la) ** 2 * (Math.abs(la) > 0.6 ? 1 : -0.5));
    sh.setFlow();
    assert.ok(sh.ek.S > 1, `the westerlies' Ekman transport out of the channel (${sh.ek.S.toFixed(1)} Sv)`);
    assert.ok(sh.psi.S > 0, 'it drives an overturning');
    let inBand = 0, all = 0;
    for (let I = 0; I < nc; I++) { const la = Math.asin(cg.pos[3 * I + 2]) * 180 / Math.PI; all += sh.pat.S.S[I]; if (la < -52 + SEAHEAT.CHANNEL) inBand += sh.pat.S.S[I]; }
    assert.ok(inBand > 0.999 * all, 'its upwelling lies poleward of the channel\'s band\'s edge');
    let north = 0;
    for (let I = 0; I < nc; I++) if (cg.pos[3 * I + 2] > 0) north += sh.pat.S.K[I];
    assert.ok(north > 0.999, 'and it sinks in the other hemisphere');
  } finally { lf.set(kept); sh.key = null; sh.geometry(); sh.settle(); }
});
