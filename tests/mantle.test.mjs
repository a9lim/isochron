// The mantle (src/engine/mantle.js): the graveyard's exact decay, and a plate riding a rigidly turning flow.
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildGrid } from '../src/grid/icosphere.js';
import { Tectonics } from '../src/engine/plates.js';
import { Mantle, MANTLE } from '../src/engine/mantle.js';

const grid = buildGrid(5), n = grid.n;
/** One plate over the whole sphere, ocean, at rest; its mantle with piles at ±x. */
function world() {
  const tec = new Tectonics(grid), p = tec.allocPlate();
  p.alive = true;
  for (let i = 0; i < n; i++) { p.mask[i] = 1; p.h[i] = 7; p.phi[i] = 0; p.tf[i] = -50; tec.owner[i] = 0; tec.ref[i] = i; tec.h[i] = 7; tec.tf[i] = -50; }
  const m = new Mantle(tec, 'test', { piles: [{ p: [1, 0, 0] }, { p: [-1, 0, 0] }] });
  return { tec, m };
}

test('the graveyard: fed by the trenches, sinking away over T_SINK (exactly exponential)', () => {
  const { tec, m } = world();
  const c = 37, f = 1e-4;   // a steady flux (sr a Myr) at one fine cell
  tec.trenchFlux[c] = f;
  m.gatherFlux();
  const rate = m.rate.slice();
  for (let s = 0; s < 40; s++) m.step(5);
  const t = 200, want = i => rate[i] * MANTLE.T_SINK * (1 - Math.exp(-t / MANTLE.T_SINK));
  let off = 0, tot = 0;
  for (let i = 0; i < m.g.n; i++) { off = Math.max(off, Math.abs(m.sigma[i] - want(i))); tot += m.sigma[i] * m.g.area[i]; }
  assert.ok(off < 1e-9 * Math.max(...rate) * MANTLE.T_SINK, `σ off by ${off}`);
  // The slab's area is kept: ∫σ dA is the flux's integral, sinking away.
  assert.ok(Math.abs(tot / (f * MANTLE.T_SINK * (1 - Math.exp(-t / MANTLE.T_SINK))) - 1) < 0.01, 'the area kept (restriction to the coarse grid keeps a cell\'s within ~0.2%)');
  m.steady();
  assert.ok(Math.abs(m.sigma[0] - rate[0] * MANTLE.T_SINK) < 1e-12, 'the steady state: rate × T_SINK');
});

test('a plate with no other force rides a rigidly turning flow; its drag is against the mantle\'s motion', () => {
  const { tec } = world();
  const W = [0.002, -0.001, 0.003];
  tec.mantleU = new Float32Array(3 * n);
  for (let i = 0; i < n; i++) { const x = grid.pos[3 * i], y = grid.pos[3 * i + 1], z = grid.pos[3 * i + 2]; tec.mantleU[3 * i] = W[1] * z - W[2] * y; tec.mantleU[3 * i + 1] = W[2] * x - W[0] * z; tec.mantleU[3 * i + 2] = W[0] * y - W[1] * x; }
  tec.updateElevation();
  const w = tec.balanceTarget({ cap: false }).get(0);
  const off = Math.hypot(w[0] - W[0], w[1] - W[1], w[2] - W[2]) / Math.hypot(...W);
  assert.ok(off < 2e-3, `ω off the flow's by ${(100 * off).toFixed(2)}%`);
});
