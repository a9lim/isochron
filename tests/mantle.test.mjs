// The mantle (src/engine/mantle.js): the graveyard fed and sinking as dσ/dt = flux − σ/T_SINK; the flow from the
// piles to the slabs (what sinks rises, the flow converging on the slabs and spreading from the piles); the plates'
// drag against it (a plate carried by a flow that turns rigidly turns with it); the dynamic topography's sign and
// mean; plume heads on the piles' edges; hotspots drifting; today's Earth's piles where Earth's are.
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildGrid } from '../src/grid/icosphere.js';
import { Tectonics, PARAMS } from '../src/engine/plates.js';
import { Mantle, MANTLE, earthMantle } from '../src/engine/mantle.js';
import { stream } from '../src/rng.js';

const grid = buildGrid(5), n = grid.n;
/** One plate over the whole sphere, ocean, at rest; its mantle with piles at ±x. */
function world() {
  const tec = new Tectonics(grid), p = tec.allocPlate();
  p.alive = true;
  for (let i = 0; i < n; i++) { p.mask[i] = 1; p.h[i] = 7; p.phi[i] = 0; p.tf[i] = -50; tec.owner[i] = 0; tec.ref[i] = i; tec.h[i] = 7; tec.tf[i] = -50; }
  const m = new Mantle(tec, 'test', { piles: [{ p: [1, 0, 0] }, { p: [-1, 0, 0] }] });
  return { tec, m };
}
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

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

test('the flow: what sinks rises, toward the slabs and away from the piles; as strong as K_FLOW', () => {
  const { tec, m } = world();
  // A graveyard at the pole (+z), between the piles at ±x.
  for (let i = 0; i < m.g.n; i++) if (m.g.pos[3 * i + 2] > 0.95) m.sigma[i] = 2;
  m.solve();
  const pole = [0, 0, 1];
  let toward = 0, away = 0, cnt = 0;
  for (let i = 0; i < m.g.n; i++) {
    const p = [m.g.pos[3 * i], m.g.pos[3 * i + 1], m.g.pos[3 * i + 2]], u = [m.u[3 * i], m.u[3 * i + 1], m.u[3 * i + 2]];
    if (Math.abs(p[2] - 0.6) < 0.1 && Math.abs(p[0]) < 0.3) { cnt++; if (dot(u, pole) > 0) toward++; }   // between: flowing poleward
    if (dot(p, [1, 0, 0]) > 0.97 && dot(p, [1, 0, 0]) < 0.995) { const out = [p[0] - 1 * dot(p, [1, 0, 0]), p[1], p[2]]; if (dot(u, out) > 0) away++; }
  }
  assert.ok(cnt > 5 && toward === cnt, `toward the slabs at ${toward} of ${cnt}`);
  assert.ok(away > 3, 'spreading from the pile');
  // Linear in K_FLOW.
  const u1 = Float64Array.from(m.u), k = MANTLE.K_FLOW;
  MANTLE.K_FLOW = 2 * k;
  try { m.phi.fill(0); m.solve(); } finally { MANTLE.K_FLOW = k; }
  let r = 0;
  for (let i = 0; i < u1.length; i++) r = Math.max(r, Math.abs(m.u[i] - 2 * u1[i]));
  assert.ok(r < 1e-6 * Math.max(...u1.map(Math.abs)), 'twice as strong at twice K_FLOW');
  // The topography: up over the piles, down over the slabs, the mean nothing.
  let mean = 0, A = 0, up = 0, down = 0;
  for (let i = 0; i < n; i++) {
    mean += tec.dyn[i] * grid.area[i]; A += grid.area[i];
    if (grid.pos[3 * i] > 0.99) up = Math.max(up, tec.dyn[i]);
    if (grid.pos[3 * i + 2] > 0.99) down = Math.min(down, tec.dyn[i]);
  }
  assert.ok(Math.abs(mean / A) < 1e-9, 'the mean nothing');
  assert.ok(up > 0.2 * MANTLE.DYN && down < -0.2 * MANTLE.DYN, `over the piles ${up.toFixed(3)} km, the slabs ${down.toFixed(3)} km`);
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

test('plume heads rise on the piles\' edges; hotspots drift with the flow', async () => {
  const { tec, m } = world();
  const r = stream('x', 'p');
  for (let k = 0; k < 50; k++) {
    const p = m.plumeSite(r), d = Math.min(...m.piles.map(q => Math.acos(Math.max(-1, Math.min(1, dot(p, q.p))))));
    assert.ok(Math.abs(Math.hypot(...p) - 1) < 1e-9 && d > 0.8 * MANTLE.PILE_R && d < 1.2 * MANTLE.PILE_R, `${d.toFixed(3)} rad from a pile`);
  }
  for (let i = 0; i < m.g.n; i++) if (m.g.pos[3 * i + 2] > 0.95) m.sigma[i] = 2;
  m.solve();
  const { Plumes } = await import('../src/engine/plumes.js');
  const pl = new Plumes(tec, 'drift');
  const h = pl.hot[0], p0 = h.p.slice(), u = m.flowAt(p0);
  pl.nextLip = Infinity;
  pl.step(1);
  const moved = [h.p[0] - p0[0], h.p[1] - p0[1], h.p[2] - p0[2]];
  assert.ok(Math.abs(Math.hypot(...moved) - MANTLE.DRIFT * Math.hypot(...u)) < 0.02 * MANTLE.DRIFT * Math.hypot(...u) + 1e-12, 'DRIFT of the flow a Myr');
});

test('today\'s Earth: the graveyard from Müller\'s past trenches, the piles under the South Pacific and southern Africa', async () => {
  const { loadEarth } = await import('../src/engine/earth.js');
  const d = await loadEarth();
  const tec = new Tectonics(buildGrid(5)), m = earthMantle(tec, d.slabs);
  const ll = p => [Math.asin(p[2]) * 180 / Math.PI, Math.atan2(p[1], p[0]) * 180 / Math.PI];
  const near = (p, la, lo) => { const r = Math.PI / 180, q = [Math.cos(la * r) * Math.cos(lo * r), Math.cos(la * r) * Math.sin(lo * r), Math.sin(la * r)]; return Math.acos(Math.min(1, dot(p, q))) * 180 / Math.PI; };
  const pac = Math.min(...m.piles.map(q => near(q.p, -10, -150))), afr = Math.min(...m.piles.map(q => near(q.p, -20, 15)));
  assert.ok(pac < 25 && afr < 25, `piles at ${m.piles.map(q => ll(q.p).map(v => v.toFixed(0)).join(',')).join(' and ')} (${pac.toFixed(0)}° and ${afr.toFixed(0)}° from Earth's, from memory)`);
  let tot = 0;
  for (let i = 0; i < m.g.n; i++) tot += m.sigma[i] * m.g.area[i];
  assert.ok(tot / (4 * Math.PI) > 0.5 && tot / (4 * Math.PI) < 1.5, `the graveyard ${(tot / (4 * Math.PI)).toFixed(2)} of the sphere's area`);
});
