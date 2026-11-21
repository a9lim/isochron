// Lakes (src/engine/lakes.js): a closed lake at A = Q/(E − P), the closure against a long run, water kept through a
// reroute.
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildGrid } from '../src/grid/icosphere.js';
import { route } from '../src/engine/landscape.js';
import { Lakes } from '../src/engine/lakes.js';

const g6 = buildGrid(6), n6 = g6.n;

/** Angular distance of each cell from a unit vector. */
function theta(g, c) {
  return Float64Array.from({ length: g.n }, (_, i) => Math.acos(Math.max(-1, Math.min(1,
    g.pos[3 * i] * c[0] + g.pos[3 * i + 1] * c[1] + g.pos[3 * i + 2] * c[2]))));
}
const unit = (lat, lon) => [Math.cos(lat) * Math.cos(lon), Math.cos(lat) * Math.sin(lon), Math.sin(lat)];

function setup(g, z) {
  const base = Uint8Array.from(z, v => v < 0 ? 1 : 0);
  const r = route(g, z, base);
  const lakes = new Lakes(g);
  lakes.rebuild(r, z);
  return { lakes, r, base };
}

/** A bowl round the pole: z rises 0.5 km from its centre to its rim at θ₁, then falls to the sea. */
function bowl(g, th1 = 0.1) {
  const th = theta(g, [0, 0, 1]);
  return { th, z: Float64Array.from(th, t => t < th1 ? 0.2 + 0.5 * t / th1 : 0.7 - 1.5 * (t - th1)) };
}

/** A plane falling away from the pole to the sea, with two cones in it on one meridian: A upslope, B below. */
function twoCones(g, { dA = 0.25, dB = 0.35 } = {}) {
  const tA = theta(g, unit(Math.PI / 2 - 0.12, 0)), tB = theta(g, unit(Math.PI / 2 - 0.34, 0)), tp = theta(g, [0, 0, 1]);
  const z = Float64Array.from(tp, (t, i) => 1.2 - 2 * t - dA * Math.max(0, 1 - tA[i] / 0.07) - dB * Math.max(0, 1 - tB[i] / 0.09));
  return { z, tA, tB };
}

const balance = l => l.storage() + l.total.toSea - l.total.runoff - l.total.vertical;

test('a closed lake in a bowl settles at A = Q/(E − P), by steps and by the closure', () => {
  const { th, z } = bowl(g6);
  const { lakes } = setup(g6, z);
  const A = lakes.areaKm, th1 = 0.1;
  let Abowl = 0, Aring = 0;
  for (let i = 0; i < n6; i++) { if (th[i] < th1) Abowl += A[i]; if (th[i] > 0.85 * th1 && th[i] < th1) Aring += A[i]; }
  // Runoff only off a ring near the rim (the lake stays inside it); E − P = 1 m/yr everywhere.
  const R0 = 0.3 * Abowl / Aring;
  const runoff = Float64Array.from(th, t => t > 0.85 * th1 && t < th1 ? R0 : 0), pe = new Float64Array(n6).fill(-1);
  let Q = 0;
  for (let i = 0; i < n6; i++) if (lakes.catch[i] >= 0) Q += A[i] * runoff[i] * 1e-3;
  const want = Q / 1e-3;
  for (let y = 0; y < 3000; y++) lakes.stepYear(runoff, pe);
  const s = lakes.stats();
  assert.equal(s.lakes, 1);
  assert.equal(s.closed, 1);
  assert.ok(Math.abs(s.area / want - 1) < 1e-4, `stepped: area ${s.area.toFixed(0)} km² against Q/(E − P) = ${want.toFixed(0)}`);
  assert.ok(Math.abs(balance(lakes)) < 1e-8 * lakes.total.runoff, `water off by ${balance(lakes)} km³`);
  const Vstep = s.volume;
  lakes.equilibrium(runoff, pe);
  const e = lakes.stats();
  assert.ok(Math.abs(e.area / want - 1) < 1e-8, `closure: area ${e.area} against ${want}`);
  assert.ok(Math.abs(e.volume / Vstep - 1) < 1e-4, `closure ${e.volume} km³ against stepped ${Vstep}`);
  assert.ok(Math.abs(balance(lakes)) < 1e-8 * lakes.total.runoff);
});

test('a reroute carries the water and conserves it; a dam that goes releases its lake', () => {
  const { z } = twoCones(g6);
  const { lakes } = setup(g6, z);
  const runoff = Float64Array.from(z, v => v > 0 ? 0.3 : 0), pe = new Float64Array(n6).fill(-1.5);
  lakes.equilibrium(runoff, pe);
  // The ground changes under the lakes: the plane tilts, the cones move and deepen.
  const before = lakes.storage();
  const z2 = twoCones(g6, { dA: 0.3, dB: 0.3 }).z.map((v, i) => v + 0.02 * g6.pos[3 * i]);
  const base2 = Uint8Array.from(z2, v => v < 0 ? 1 : 0);
  const { released } = lakes.rebuild(route(g6, z2, base2), z2);
  assert.ok(before > 0);
  assert.ok(Math.abs(lakes.storage() + released - before) < 1e-9 * before, `carried ${lakes.storage()} + ${released} against ${before} km³`);
  // A ring dam on the open plane (ice round a patch of ground): a lake behind it, which
  // leaves in one step when the dam goes.
  const tD = theta(g6, unit(Math.PI / 2 - 0.42, 0.8));
  const zd = Float64Array.from(z, (v, i) => v + (tD[i] > 0.05 && tD[i] < 0.07 ? 0.3 : 0));
  const dam = new Lakes(g6);
  dam.rebuild(route(g6, zd, Uint8Array.from(zd, v => v < 0 ? 1 : 0)), zd);
  for (let y = 0; y < 200; y++) dam.step(50, runoff, new Float64Array(n6));
  const held = dam.storage(), out = dam.rebuild(route(g6, z, Uint8Array.from(z, v => v < 0 ? 1 : 0)), z);
  assert.ok(held > dam.storage(), 'the lake behind the dam drains');
  assert.ok(out.released > 0.5 * (held - lakes.storage()), `released ${out.released.toFixed(0)} of ${held.toFixed(0)} km³`);
  assert.ok(Math.abs(dam.storage() + out.released - held) < 1e-9 * held);
});
