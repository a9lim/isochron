// The routes (src/engine/routes.js) against their oracles: a sail's year-mean speed, Dijkstra
// against brute force, and on a water world with two islands under one wind, the way home the long
// way round (the volta do mar's), and a monsoon's reversal making both ways alike.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildGrid } from '../src/grid/icosphere.js';
import { NZ } from '../src/engine/climate.js';
import { People } from '../src/engine/people.js';
import { Routes, ROUTES, sailSpeed, dijkstra, Heap, twelve } from '../src/engine/routes.js';

const R = 6371;

test('a sail runs before a fair wind at its speed, beats against one, and a monsoon halves the difference', () => {
  const h = [1, 0, 0], cu = [0, 0, 0], C = ROUTES;
  const fair = new Float64Array(18), foul = new Float64Array(18), mon = new Float64Array(18);
  for (let p = 0; p < 6; p++) { fair[3 * p] = C.W_REF; foul[3 * p] = -C.W_REF; mon[3 * p] = p < 3 ? C.W_REF : -C.W_REF; }
  const beat = Math.max(C.V_ROW, C.V_SHIP * C.G_UP);
  assert.ok(Math.abs(sailSpeed(h, fair, cu, 1) - C.V_SHIP) < 1e-9);
  assert.ok(Math.abs(sailSpeed(h, foul, cu, 1) - beat) < 1e-9);
  assert.ok(Math.abs(sailSpeed(h, mon, cu, 1) - 0.5 * (C.V_SHIP + beat)) < 1e-9);
  // A current along the way adds to the speed; ice closes the sea for its share of the year.
  assert.ok(Math.abs(sailSpeed(h, fair, [0.5, 0, 0], 1) - (C.V_SHIP + 0.5)) < 1e-9);
  assert.ok(Math.abs(sailSpeed(h, fair, cu, 0.5) - 0.5 * C.V_SHIP) < 1e-9);
});

test('Dijkstra matches brute force on a grid with uneven, directed costs', () => {
  const g = buildGrid(2), n = g.n, m = g.nbrOff[n];
  const cost = Float32Array.from({ length: m }, (_, o) => 1 + ((o * 7919) % 13));
  const dist = new Float64Array(n), pred = new Uint16Array(n);
  const bf = new Float64Array(n).fill(Infinity); bf[5] = 0;
  for (let it = 0; it < n; it++) for (let u = 0; u < n; u++) for (let o = g.nbrOff[u]; o < g.nbrOff[u + 1]; o++) { const v = g.nbr[o]; if (bf[u] + cost[o] < bf[v]) bf[v] = bf[u] + cost[o]; }
  dijkstra(g, cost, 5, dist, pred, new Heap(m + n));
  for (let i = 0; i < n; i++) assert.ok(Math.abs(dist[i] - bf[i]) < 1e-6, `node ${i}: ${dist[i]} against ${bf[i]}`);
  // The path back by pred sums to the distance.
  for (const i of [17, 40, 100]) {
    let s = 0, v = i;
    while (v !== 5) { const u = pred[v]; let o = g.nbrOff[u]; while (g.nbr[o] !== v) o++; s += cost[o]; v = u; }
    assert.ok(Math.abs(s - dist[i]) < 1e-6);
  }
});

/** A water world with two small islands on the equator at longitudes 0° and 90°, under a wind toward the east (`east`: per point of the year, +1 or −1). */
function islands(east) {
  const grid = buildGrid(5), n = grid.n, f = { seed: 'routes', grid, n };
  const one = (w, v = 0) => new Float32Array(w * n).fill(v);
  Object.assign(f, { elev: one(1, -3), ice: one(1), T12: one(12, 24), P12: one(12, 120), ft: one(1, 0.3), fg: one(1, 0.5), npp: one(1, 0.4), zones: one(NZ), runoff: one(1, 0.3),
    discharge: one(1), lake: one(1), perma: one(1), sigT: one(1, 1), wind: one(18), cur: one(3), seaIce: one(1) });
  const at = lon => [Math.cos(lon), Math.sin(lon), 0];
  const isl = [at(0), at(Math.PI / 2)];
  for (let i = 0; i < n; i++) {
    const x = grid.pos[3 * i], y = grid.pos[3 * i + 1], z = grid.pos[3 * i + 2];
    for (const q of isl) if (R * Math.acos(Math.min(1, x * q[0] + y * q[1] + z * q[2])) < 350) f.elev[i] = 0.2;
    f.zones[NZ * i + 2] = 1;
    const r = Math.hypot(x, y) || 1, ex = -y / r, ey = x / r;
    for (let p = 0; p < 6; p++) { f.wind[18 * i + 3 * p] = east[p] * ROUTES.W_REF * ex; f.wind[18 * i + 3 * p + 1] = east[p] * ROUTES.W_REF * ey; }
  }
  return f;
}
const nearest = (rt, lon) => { let b = -1, bd = -2; for (let k = 0; k < rt.nm; k++) { const d = rt.mpos[3 * k] * Math.cos(lon) + rt.mpos[3 * k + 1] * Math.sin(lon); if (d > bd) { bd = d; b = k; } } return b; };

test('under one wind the way home is the long way round, and a monsoon makes both ways alike', () => {
  const C = ROUTES, beat = C.V_SHIP / Math.max(C.V_ROW, C.V_SHIP * C.G_UP);
  {
    const f = islands([1, 1, 1, 1, 1, 1]), pp = new People(f, { H_FARM: 0 }), rt = new Routes(pp, f);
    const a = nearest(rt, 0), b = nearest(rt, Math.PI / 2), nm = rt.nm;
    assert.ok(a !== b && rt.nm >= 2);
    const out = rt.D.S[a * nm + b], home = rt.D.S[b * nm + a], quarter = R * Math.PI / 2;
    // Out: a quarter of the equator before the wind, ~1 sea-km a km (the grid's zigzag a little more), and two ports.
    assert.ok(out > 0.95 * quarter && out < 1.2 * quarter + 2 * C.C_PORT + 400, `out ${out.toFixed(0)} against ${quarter.toFixed(0)}`);
    // Home: three quarters round before the wind beats a quarter against it.
    assert.ok(home < beat * quarter && home > 2.8 * quarter, `home ${home.toFixed(0)}: three quarters round (${(3 * quarter).toFixed(0)}), not a beat (${(beat * quarter).toFixed(0)})`);
    const path = rt.path(b, rt.mnode[a], 'S');
    const far = path.some(v => { const x = rt.g.pos[3 * v], y = rt.g.pos[3 * v + 1]; return x < 0 && Math.abs(y) < 0.5 * -x; });
    assert.ok(far, 'the way home passes the far side (longitude 180°, at whatever latitude shortens it)');
    // Steam hardly cares: the short way both ways, a few percent apart (K_STEAM of the wind).
    assert.ok(Math.abs(rt.D.I[a * nm + b] / rt.D.I[b * nm + a] - 1) < 0.15);
  }
  {
    const f = islands([1, 1, 1, -1, -1, -1]), pp = new People(f, { H_FARM: 0 }), rt = new Routes(pp, f);
    const a = nearest(rt, 0), b = nearest(rt, Math.PI / 2), nm = rt.nm;
    const out = rt.D.S[a * nm + b], home = rt.D.S[b * nm + a];
    assert.ok(Math.abs(out / home - 1) < 0.05, `monsoon: out ${out.toFixed(0)}, home ${home.toFixed(0)}`);
    // Each leg sails when its wind serves: the year's mean of a fair run and a beat.
    const quarter = R * Math.PI / 2, k = C.V_SHIP / (0.5 * (C.V_SHIP + Math.max(C.V_ROW, C.V_SHIP * C.G_UP)));
    assert.ok(out > 0.95 * k * quarter && out < 1.2 * k * quarter + 2 * C.C_PORT + 400, `monsoon out ${out.toFixed(0)} against ${(k * quarter).toFixed(0)}`);
  }
});

test('a market pools the harvest by its basket: one-factor variance', () => {
  const f = islands([1, 1, 1, 1, 1, 1]), pp = new People(f, { H_FARM: 0 }), rt = new Routes(pp, f);
  // A cell trading τ through a market whose basket has variance V and covariance C with it.
  rt.active = [0]; rt.mF = new Float64Array(rt.nm).fill(1); rt.V = new Float64Array(rt.nm).fill(0.25); rt.Cv = new Float64Array(rt.nm).fill(0.5);
  const c = 0; pp.f[c] = 0.5; pp.ind[c] = 0; rt.marketOf[c] = 0;
  const tau = ROUTES.TAU_AG, want = 1 / Math.sqrt((1 - tau) ** 2 + 2 * tau * (1 - tau) * 0.5 + tau * tau * 0.25);
  const p = rt.pool(c);
  assert.ok(Math.abs(p.pool - want) < 1e-9 && p.tau === tau);
  pp.f[c] = 0; assert.equal(rt.pool(c).pool, 1);   // foragers don't trade food
});

test('twelve directions: paths on an even graph run within a few percent of the great circle', () => {
  const g = buildGrid(4), G = twelve(g), n = g.n;
  let deg12 = 0;
  for (let u = 0; u < n; u++) { const d = G.nbrOff[u + 1] - G.nbrOff[u]; if (d === 12) deg12++; else assert.equal(d, 10, `a pentagon's ten (${d} at ${u})`); }
  assert.equal(deg12, n - 12);
  // Cost = length: the worst ratio of path to great circle over far pairs, on six directions and twelve.
  const km = (u, v) => Math.acos(Math.min(1, g.pos[3 * u] * g.pos[3 * v] + g.pos[3 * u + 1] * g.pos[3 * v + 1] + g.pos[3 * u + 2] * g.pos[3 * v + 2]));
  const cost6 = Float32Array.from({ length: g.nbrOff[n] }, (_, o) => g.dist[o]);
  const cost12 = new Float32Array(G.nbrOff[n]);
  for (let u = 0; u < n; u++) for (let o = G.nbrOff[u]; o < G.nbrOff[u + 1]; o++) cost12[o] = km(u, G.nbr[o]);
  const dist = new Float64Array(n), heap = new Heap(4 * G.nbrOff[n]);
  const worst = (graph, cost) => { let w = 0; for (const s of [0, 100, 777]) { dijkstra(graph, cost, s, dist, null, heap); for (let v = 0; v < n; v++) { const d = km(s, v); if (d > 0.5 && d < 2.5) w = Math.max(w, dist[v] / d); } } return w; };
  const w6 = worst(g, cost6), w12 = worst(G, cost12);
  assert.ok(w6 > 1.1, `six directions run long off their axes (${w6.toFixed(3)})`);
  assert.ok(w12 < 1.05, `twelve run within 5% (${w12.toFixed(3)})`);
});

test('roads and canals cheapen the sail\'s part by land between two markets', () => {
  const f = islands([1, 1, 1, 1, 1, 1]), pp = new People(f, { H_FARM: 0 }), rt = new Routes(pp, f);
  const a = 0, b = 1, base = rt.cost(a, b, 'S'), land = rt.LS[a * rt.nm + b];
  rt.mWr = new Float64Array(rt.nm).fill(1); rt.mWc = new Float64Array(rt.nm);
  assert.ok(Math.abs(rt.cost(a, b, 'S') - base * (1 - land / 2)) < 1e-6 * base, 'roads at their room halve the part by land');
  rt.mWr.fill(0); rt.mWc.fill(0.2);
  assert.ok(Math.abs(rt.cost(a, b, 'S') - base * (1 - land / 2)) < 1e-6 * base, 'canals over a fifth of the land halve it too');
  assert.equal(rt.cost(a, b, 'I'), rt.R.I[a * rt.nm + b], 'steam and rail are industry\'s own');
});
