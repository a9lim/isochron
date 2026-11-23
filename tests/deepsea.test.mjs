// The deep sea's heat (src/engine/deepsea.js): what the energy balance is charged over a span is what the
// deep's exact steps take over it, however the frames split it; live the charge is γ (T − θ), and at a
// span of centuries the deep is at its balance and the charge falls away; at the opening there is none.
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildGrid } from '../src/grid/icosphere.js';
import { Tectonics } from '../src/engine/plates.js';
import { genesis } from '../src/engine/genesis.js';
import { Climate } from '../src/engine/climate.js';
import { DEEP } from '../src/engine/deepsea.js';

const g = buildGrid(5), tec = new Tectonics(g);
genesis(tec, 'earthlike', { spinup: 10 });
const c = new Climate(tec);
c.geography();
const cg = c.coarse, nc = cg.n, d = c.deep;

test('the deep takes what the energy balance charged it, live and at its balance; none at the opening', () => {
  const T0 = Float64Array.from({ length: nc }, (_, I) => 28 - 30 * cg.pos[3 * I + 2] ** 2);
  // The opening: no charge, and the deep at its balance with each cycle.
  c.stats.settled = 0; c.Tc[0].set(T0);
  d.begin(); d.end();
  assert.equal(d.terms(T0), false, 'no charge before the climate has settled');
  c.stats.settled = 1;
  const heat = () => { let h = 0; for (let I = 0; I < nc; I++) if (d.share[I] > 0) h += DEEP.C_D * cg.area[I] * d.share[I] * d.theta[I]; return h; };
  const charges = [];
  for (const span of [0.5, 1e4]) for (const frames of [1, 7]) {
    // The deep at its balance with T0, then the surface 2 K warmer, standing for `span` years.
    c.Tc[0].set(T0); d.begin(); d.end();
    for (let I = 0; I < nc; I++) if (d.share[I] > 0) d.theta[I] = T0[I];
    const T = Float64Array.from(T0, v => v + 2);
    c.Tc[0].set(T);
    d.since = span; d.begin();
    assert.ok(d.terms(T), 'a charge once settled');
    let Q = 0;
    for (let I = 0; I < nc; I++) Q += (d.diag[I] * T[I] - d.rhs[I]) * span;
    d.end();
    const h0 = heat();
    for (let f = 0; f < frames; f++) d.step(span / frames);
    const got = heat() - h0;
    assert.ok(Math.abs(got - Q) < 1e-9 * Q, `span ${span} yr in ${frames} frames: the deep took ${(got / Q - 1).toExponential(1)} more than charged`);
    let sea = 0;
    for (let I = 0; I < nc; I++) sea += cg.area[I] * d.share[I];
    charges.push(Q / span / sea);
  }
  // Live, the charge is γ (T − θ) per m² of sea (less under ice: none here); at a span of 10⁴ yr, C_D/span of it.
  assert.ok(Math.abs(charges[0] / (2 * DEEP.GAMMA) - 1) < 0.01, `live: ${charges[0].toFixed(3)} W/m² against γ ΔT ${(2 * DEEP.GAMMA).toFixed(3)}`);
  assert.ok(Math.abs(charges[2] / (2 * DEEP.C_D / 1e4) - 1) < 0.01, `at its balance: ${charges[2].toFixed(4)} W/m² against C_D ΔT/s ${(2 * DEEP.C_D / 1e4).toFixed(4)}`);
});
