// Lakes: water is conserved through steps, spills and reroutes; a closed lake
// settles at A = Q/(E − P); a cascade fills from the top; the closure agrees
// with a long run; and a seeded planet's lakes are plausible.
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildGrid } from '../src/grid/icosphere.js';
import { route } from '../src/engine/landscape.js';
import { Lakes } from '../src/engine/lakes.js';

const g6 = buildGrid(6), n6 = g6.n;
const R2 = 6371 * 6371;

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
  // Dry centuries shrink it to half, and its bed turns to salt; wet ones grow it back.
  const dry = runoff.map(v => v * 0.5);
  for (let y = 0; y < 1000; y++) lakes.stepYear(dry, pe);
  const d = lakes.stats();
  assert.ok(Math.abs(d.area / (want / 2) - 1) < 1e-3, `dry: ${d.area.toFixed(0)} km² against ${(want / 2).toFixed(0)}`);
  assert.ok(d.saltArea > 0.3 * want / 2 && d.saltArea < want / 2, `salt flats ${d.saltArea.toFixed(0)} km² where ${(want / 2).toFixed(0)} dried`);
  for (let i = 0; i < n6; i++) assert.ok(!(lakes.salt[i] > 0 && lakes.wet[i] >= 1), 'no salt under water');
  for (let y = 0; y < 3000; y++) lakes.stepYear(runoff.map(v => v * 1.5), pe);
  assert.ok(Math.abs(lakes.stats().area / (1.5 * want) - 1) < 1e-3);
  assert.ok(lakes.stats().saltArea < 1e-3 * want, 'flooded again, the salt is gone');
  assert.ok(Math.abs(balance(lakes)) < 1e-8 * lakes.total.runoff);
});

test('a cascade fills the upper basin first, then spills into the lower; water is conserved', () => {
  const { z, tA, tB } = twoCones(g6);
  const { lakes } = setup(g6, z);
  const cA = tA.indexOf(Math.min(...tA)), cB = tB.indexOf(Math.min(...tB));
  const qA = lakes.regOf[cA], qB = lakes.regOf[cB];
  assert.ok(qA >= 0 && qB >= 0 && qA !== qB, 'two depressions');
  assert.equal(lakes.region[lakes.link[lakes.regRoot[qA]]], qB, 'A spills into B');
  const rootA = lakes.regRoot[qA], rootB = lakes.regRoot[qB];
  // Rain only on A's catchment; no evaporation.
  const runoff = Float64Array.from({ length: n6 }, (_, i) => lakes.catch[i] >= 0 && lakes.region[lakes.catch[i]] === qA ? 0.002 : 0);
  const pe = new Float64Array(n6);
  const heldIn = q => { let s = 0; for (let b = lakes.regNode0[q]; b < lakes.regNode0[q + 1]; b++) s += lakes.W[b]; return s; };
  let yFull = -1, years = 0, Bbefore = 0;
  for (; years < 200000 && lakes.total.toSea === 0; years += 10) {
    lakes.step(10, runoff, pe);
    if (yFull < 0 && heldIn(qA) >= lakes.cap[rootA] * (1 - 1e-12)) yFull = years;
    if (yFull < 0) Bbefore = Math.max(Bbefore, heldIn(qB));
  }
  assert.ok(yFull > 1000, `A fills (in ${yFull} years)`);
  assert.equal(Bbefore, 0, 'B stays dry until A is full');
  assert.ok(heldIn(qB) >= lakes.cap[rootB] * (1 - 1e-9), 'then B fills and spills to the sea');
  assert.ok(Math.abs(balance(lakes)) < 1e-9 * lakes.total.runoff, `water off by ${balance(lakes)} km³`);
});

/** A bowl split by a ridge through its centre: two pits under one rim, the sill (0.6 km) below the rim (0.9). */
function twins(g, th1 = 0.25) {
  const th = theta(g, [0, 0, 1]);
  const z = Float64Array.from(th, (t, i) => {
    const ridge = 0.3 * Math.max(0, 1 - Math.abs(Math.asin(g.pos[3 * i])) / 0.05);
    return t < th1 ? 0.3 + 0.6 * t / th1 + ridge : 0.9 - 1.5 * (t - th1);
  });
  return { th, z };
}

test('one depression, two pits: the fed one fills, spills over the sill, and they rise as one lake', () => {
  const th1 = 0.25, { th, z } = twins(g6, th1);
  const { lakes } = setup(g6, z);
  const pole = th.indexOf(Math.min(...th)), q = lakes.regOf[pole], root = lakes.regRoot[q];
  assert.ok(q >= 0 && lakes.c0[root] >= 0, 'one depression with nested basins');
  // The two halves: the root's children (the ridge is its lowest pass).
  const side = i => { let b = lakes.leafOf[i]; while (lakes.parent[b] !== root) b = lakes.parent[b]; return b; };
  const fedCell = th.findIndex((t, i) => t > 0.8 * th1 && t < th1 && g6.pos[3 * i] > 0.02);
  const fed = side(fedCell), other = fed === lakes.c0[root] ? lakes.c1[root] : lakes.c0[root];
  assert.ok(Math.abs(lakes.spill[fed] - 0.6) < 0.03 && lakes.spill[root] > 0.85, `sill at ${lakes.spill[fed]}, rim at ${lakes.spill[root]}`);
  const ring = (t, i) => t > 0.8 * th1 && t < th1 && g6.pos[3 * i] > 0.02;
  const runoff = Float64Array.from(th, (t, i) => ring(t, i) ? 0.01 : 0), none = new Float64Array(g6.n);
  const sub = b => lakes.heldNow(b);
  let otherBefore = 0, mergedLevel = null;
  for (let y = 0; y < 20000 && lakes.total.toSea === 0; y++) {
    lakes.step(20, runoff, none);
    if (sub(fed) < lakes.cap[fed] * (1 - 1e-12)) otherBefore = Math.max(otherBefore, sub(other));
    if (lakes.W[root] > 0 && mergedLevel === null) mergedLevel = lakes.level[root];
  }
  assert.equal(otherBefore, 0, 'the other pit is dry until the fed one is full');
  assert.ok(mergedLevel > lakes.merge[root], 'then one lake above the sill');
  assert.ok(lakes.total.toSea > 0 && lakes.state[root] === 2, 'until it spills over the rim');
  assert.ok(Math.abs(balance(lakes)) < 1e-9 * lakes.total.runoff);
  // With evaporation: closed above the sill (one lake), or below it (the fed pit spilling into the other).
  const pe = new Float64Array(g6.n).fill(-1);
  const a2 = lakes.capArea[fed] + lakes.capArea[other], aR = lakes.capArea[root];
  let Aring = 0;
  for (let i = 0; i < g6.n; i++) if (ring(th[i], i) && lakes.catch[i] >= 0 && lakes.region[lakes.catch[i]] === q) Aring += lakes.areaKm[i];
  for (const [want, lakesWant] of [[0.5 * (a2 + aR), 1], [lakes.capArea[fed] + 0.5 * lakes.capArea[other], 2]]) {
    const R0 = want / Aring, rr = Float64Array.from(th, (t, i) => ring(t, i) && lakes.catch[i] >= 0 && lakes.region[lakes.catch[i]] === q ? R0 : 0);
    const st = new Lakes(g6);
    st.rebuild(route(g6, z, Uint8Array.from(z, v => v < 0 ? 1 : 0)), z);
    for (let y = 0; y < 6000; y++) st.stepYear(rr, pe);
    const inQ = l => l.filter(x => x.region === q);
    const a = inQ(st.list()), A = a.reduce((s, l) => s + l.area, 0);
    assert.ok(Math.abs(A / want - 1) < 1e-3, `stepped: ${A.toFixed(0)} km² of lake against Q/(E − P) = ${want.toFixed(0)}`);
    assert.ok(a.length >= lakesWant && a.filter(l => l.spilling).length === lakesWant - 1, `${a.length} lakes, ${a.filter(l => l.spilling).length} spilling`);
    if (lakesWant === 1) assert.equal(a.length, 1);
    st.equilibrium(rr, pe);
    const b = inQ(st.list()), B = b.reduce((s, l) => s + l.area, 0);
    assert.ok(Math.abs(B / want - 1) < 1e-6, `closure: ${B.toFixed(0)} against ${want.toFixed(0)}`);
    assert.equal(b.length, a.length);
    assert.ok(Math.abs(balance(st)) < 1e-8 * st.total.runoff);
  }
});

test('the closure agrees with a long run of steps, through a cascade', () => {
  const { z } = twoCones(g6);
  const { lakes } = setup(g6, z);
  // Runoff off all the land, evaporation off the lakes: A spills into B, which is closed.
  const runoff = Float64Array.from(z, v => v > 0 ? 0.3 : 0), pe = new Float64Array(n6).fill(-1.5);
  const ref = new Lakes(g6);
  ref.rebuild(route(g6, z, Uint8Array.from(z, v => v < 0 ? 1 : 0)), z);
  ref.equilibrium(runoff, pe);
  for (let y = 0; y < 400; y++) lakes.step(25, runoff, pe);
  const a = lakes.list().sort((x, y) => y.area - x.area), b = ref.list().sort((x, y) => y.area - x.area);
  assert.ok(b.some(l => l.spilling) && b.some(l => !l.spilling), 'one lake spills, one is closed');
  assert.equal(a.length, b.length);
  for (let k = 0; k < a.length; k++) {
    assert.equal(a[k].spilling, b[k].spilling);
    assert.ok(Math.abs(a[k].area / b[k].area - 1) < 1e-3, `lake ${k}: ${a[k].area.toFixed(0)} against ${b[k].area.toFixed(0)} km²`);
    assert.ok(Math.abs(a[k].level - b[k].level) < 1e-4, `lake ${k}: level ${a[k].level} against ${b[k].level}`);
  }
  assert.ok(Math.abs(balance(lakes)) < 1e-9 * lakes.total.runoff);
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

test('a seeded planet: lakes under its climate', { timeout: 120000 }, async () => {
  const { Planet } = await import('../src/engine/planet.js');
  const { CLIMATE } = await import('../src/engine/climate.js');
  const t0 = performance.now();
  const planet = new Planet('earthlike', { level: 6 });
  planet.climate.solve(3);
  const g = planet.grid, n = g.n, tec = planet.tec, C = planet.climate;
  const z = Float64Array.from(tec.elev, (e, i) => e + planet.ice.H[i] / 1000);
  const base = Uint8Array.from(tec.elev, e => e < tec.seaLevel ? 1 : 0);
  const dry = Uint8Array.from(planet.ice.H, h => h > 1 ? 1 : 0);   // grounded ice dams lakes but holds none
  const lakes = new Lakes(g);
  let t = performance.now();
  lakes.rebuild(route(g, z, base), z, dry);
  const tBuild = performance.now() - t;
  // Open water evaporates at the climate's potential rate (its Budyko step's PET).
  const runoff = C.runoff, pe = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const mat = C.Tf[0][i] - CLIMATE.LAPSE * C.elevPos[i];
    pe[i] = C.Pf[0][i] * 365.25 / 1000 - Math.max(30, 55 * (mat + 4)) / 1000;
  }
  t = performance.now();
  lakes.equilibrium(runoff, pe);
  const tEq = performance.now() - t;
  const s = lakes.stats();
  let landA = 0;
  for (let i = 0; i < n; i++) if (!base[i]) landA += g.area[i] * R2;
  t = performance.now();
  const stepped = new Lakes(g);
  stepped.rebuild(route(g, z, base), z, dry);
  for (let y = 0; y < 2000; y++) stepped.stepYear(runoff, pe);
  const tStep = (performance.now() - t) / 2000;
  const ss = stepped.stats();
  const big = s.largest;
  console.log(`planet ${((performance.now() - t0) / 1000).toFixed(1)} s; ${s.regions} depressions, ${s.basins} nodes; build ${tBuild.toFixed(1)} ms, closure ${tEq.toFixed(1)} ms, step ${tStep.toFixed(2)} ms`);
  console.log(`closure: ${s.lakes} lakes, ${s.closed} closed, ${(s.area / 1e3).toFixed(0)}k km² (${(100 * s.area / landA).toFixed(2)}% of land), ${(s.volume / 1e3).toFixed(1)}k km³, salt ${(s.saltArea / 1e3).toFixed(0)}k km²`);
  if (big) console.log(`largest: ${(big.area / 1e3).toFixed(1)}k km², ${big.volume.toFixed(0)} km³, ${big.spilling ? 'spilling' : 'closed'}, ${((big.level - tec.seaLevel) * 1000).toFixed(0)} m above the sea`);
  console.log(`2000 years of steps from dry: ${ss.lakes} lakes, ${ss.closed} closed, ${(ss.area / 1e3).toFixed(0)}k km², ${(ss.volume / 1e3).toFixed(1)}k km³`);
  assert.ok(s.lakes > 0 && s.area < 0.1 * landA, 'some lakes, not a flooded continent');
  assert.ok(Math.abs(balance(stepped)) < 1e-8 * stepped.total.runoff);
});
