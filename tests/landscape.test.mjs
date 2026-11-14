// Landscape: the stream-power law's steady state is the slope–area law, and
// erosion, sediment and diffusion move crust without making or losing any.
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildGrid } from '../src/grid/icosphere.js';
import { route, accumulate, streamPower, Landscape, LAND } from '../src/engine/landscape.js';
import { Tectonics } from '../src/engine/plates.js';
import { genesis } from '../src/engine/genesis.js';

const R = 6371;

test('uplift against stream power settles on S = (U/K) Q^(−m)', () => {
  const g = buildGrid(5), n = g.n;
  const base = new Uint8Array(n), z = new Float64Array(n), f = new Float64Array(n).fill(1);
  const w = new Float64Array(n), Q = new Float64Array(n), zb = new Float64Array(n);
  for (let i = 0; i < n; i++) base[i] = g.pos[3 * i + 2] < 0.4 ? 1 : 0;
  for (let i = 0; i < n; i++) w[i] = base[i] ? 0 : g.area[i] * R * R;
  const U = 1e-6, K = 2e-7, m = 0.5, dt = 1e6;   // 1 mm/yr of uplift
  let r = null;
  for (let s = 0; s < 300; s++) {
    for (let i = 0; i < n; i++) if (!base[i]) z[i] += U * dt;
    r = route(g, z, base, r);
    accumulate(r.order, r.count, r.rcv, w, Q);
    streamPower(r, z, Q, f, K, m, dt, zb);
  }
  let worst = 0, land = 0;
  for (let i = 0; i < n; i++) {
    if (base[i]) continue;
    land++;
    const j = r.rcv[i];
    const S = (z[i] - z[j]) / r.rlen[i];
    worst = Math.max(worst, Math.abs(K * Q[i] ** m * S / U - 1));
  }
  assert.ok(land > 1000, `${land} land cells`);
  assert.ok(worst < 0.02, `steady state off by ${(100 * worst).toFixed(2)}%`);
});

test('a landscape step conserves crust: eroded rock all ends up as sediment', () => {
  const g = buildGrid(5);
  const tec = new Tectonics(g);
  genesis(tec, 'landscape-test', { spinup: 0 });
  const land = new Landscape(tec);
  // Give it relief to cut: a ridge of thick crust.
  for (let i = 0; i < g.n; i++) if (tec.phi[i] >= 0.5 && Math.abs(g.pos[3 * i]) < 0.15) {
    const p = tec.plates[tec.owner[i]], j = tec.ref[i];
    p.h[j] += 20; tec.h[i] = p.h[j];
  }
  tec.updateElevation();
  const v0 = land.volume();
  for (let s = 0; s < 5; s++) land.step(5e5);
  const v1 = land.volume();
  assert.ok(land.flux.eroded > 0, 'nothing eroded');
  // The plates hold thickness as float32, so ~1e-7 is rounding.
  assert.ok(Math.abs(v1 - v0) / v0 < 1e-7, `volume changed by ${((v1 - v0) / v0).toExponential(2)}`);
});
