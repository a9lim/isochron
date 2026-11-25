// The routes (src/engine/routes.js): Dijkstra against brute force, the way home the long way round under one
// wind, and the open ocean closed to coasting craft until navigation.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildGrid } from '../src/grid/icosphere.js';
import { NZ } from '../src/engine/climate.js';
import { People } from '../src/engine/people.js';
import { Routes, ROUTES, dijkstra, Heap } from '../src/engine/routes.js';

const R = 6371;

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
    const out = rt.D.O[a * nm + b], home = rt.D.O[b * nm + a], quarter = R * Math.PI / 2;
    // Out: a quarter of the equator before the wind, ~1 sea-km a km (the grid's zigzag a little more), and two ports.
    assert.ok(out > 0.95 * quarter && out < 1.2 * quarter + 2 * C.C_PORT + 400, `out ${out.toFixed(0)} against ${quarter.toFixed(0)}`);
    // Home: three quarters round before the wind beats a quarter against it.
    assert.ok(home < beat * quarter && home > 2.8 * quarter, `home ${home.toFixed(0)}: three quarters round (${(3 * quarter).toFixed(0)}), not a beat (${(beat * quarter).toFixed(0)})`);
    const path = rt.path(b, rt.mnode[a], 'O');
    const far = path.some(v => { const x = rt.g.pos[3 * v], y = rt.g.pos[3 * v + 1]; return x < 0 && Math.abs(y) < 0.5 * -x; });
    assert.ok(far, 'the way home passes the far side (longitude 180°, at whatever latitude shortens it)');
    // Steam hardly cares: the short way both ways, a few percent apart (K_STEAM of the wind).
    assert.ok(Math.abs(rt.D.I[a * nm + b] / rt.D.I[b * nm + a] - 1) < 0.15);
    // Coasting craft pay (1 + K_OPEN)-fold for the open ocean's legs, nearly the whole crossing, and the
    // cost a carrier sees runs from theirs without navigation to the ocean-going ship's with it.
    const cS = rt.cost(a, b, 'S'), cO = rt.cost(a, b, 'O'), L = 1e4;
    assert.ok(cS > 0.8 * (1 + C.K_OPEN) * cO && cS < (1 + C.K_OPEN) * cO, `coasting ${cS.toFixed(0)} against ${((1 + C.K_OPEN) * cO).toFixed(0)}`);
    assert.equal(rt.between(a, b, 0, 0, L), cS);
    assert.ok(Math.abs(rt.between(a, b, 1, 0, L) - cO) < 1e-6 * cO);
    let last = Infinity;
    for (const nu of [1e-3, 0.01, 0.1, 0.5, 0.9]) { const x = rt.between(a, b, nu, 0, L); assert.ok(x < last && x > cO, `ν ${nu}: ${x}`); last = x; }
  }
  {
    const f = islands([1, 1, 1, -1, -1, -1]), pp = new People(f, { H_FARM: 0 }), rt = new Routes(pp, f);
    const a = nearest(rt, 0), b = nearest(rt, Math.PI / 2), nm = rt.nm;
    const out = rt.D.O[a * nm + b], home = rt.D.O[b * nm + a];
    assert.ok(Math.abs(out / home - 1) < 0.05, `monsoon: out ${out.toFixed(0)}, home ${home.toFixed(0)}`);
    // Each leg sails when its wind serves: the year's mean of a fair run and a beat.
    const quarter = R * Math.PI / 2, k = C.V_SHIP / (0.5 * (C.V_SHIP + Math.max(C.V_ROW, C.V_SHIP * C.G_UP)));
    assert.ok(out > 0.95 * k * quarter && out < 1.2 * k * quarter + 2 * C.C_PORT + 400, `monsoon out ${out.toFixed(0)} against ${(k * quarter).toFixed(0)}`);
  }
});

test('a rebuild that adds markets (an ice sheet gone) trades among all of them, at finite costs, with their years pooled', () => {
  const f = islands([1, 1, 1, 1, 1, 1]), iced = { ...f, ice: Float32Array.from(f.ice) };
  for (let i = 0; i < f.n; i++) if (f.elev[i] > 0 && f.grid.pos[3 * i + 1] > 0.5) iced.ice[i] = 1e3;   // the island at 90° under ice
  const pp = new People(f, { H_FARM: 0 });
  const farm = () => { for (let c = 0; c < pp.nL; c++) if (pp.H.alive[c]) { pp.Ntot[c] = 1e5; pp.f[c] = 0.2; pp.Out[c] = 2e5; pp.goods[c] = 1e5; pp.zc[c] = pp.zl[c] = 4; } };
  pp.yr = Array.from({ length: 5 }, () => new Float64Array(pp.nL).fill(0.1)); pp.yrW = 1;
  pp.rates(iced); farm();
  const rt = pp.routes = new Routes(pp, iced);
  rt.trade(true); pp.pooledYears(rt);
  const nm0 = rt.nm;
  pp.rates(f); farm(); rt.build(f); rt.trade(true); pp.pooledYears(rt);
  const nm = rt.nm, farmed = new Set();
  assert.ok(nm > nm0, `the thaw adds markets (${nm0} → ${nm})`);
  for (let c = 0; c < pp.nL; c++) if (pp.H.alive[c]) farmed.add(rt.marketOf[c]);
  assert.deepEqual([...rt.active].sort(), [...farmed].sort(), 'every market with fields trades');
  for (let a = 0; a < nm; a++) for (let b = 0; b < nm; b++) if (Number.isFinite(rt.R.S[a * nm + b])) assert.ok(Number.isFinite(rt.cost(a, b, 'S')), `the cost ${a} → ${b} is ${rt.cost(a, b, 'S')}`);
  for (const k of rt.active) assert.ok(Number.isFinite(pp.yrM[k]), `market ${k}'s pooled years ${pp.yrM[k]}`);
});

test('reread with the world: the same winds solve nothing again; turned about, the way out and home trade places, the markets kept', () => {
  const f = islands([1, 1, 1, 1, 1, 1]), pp = new People(f, { H_FARM: 0 }), rt = new Routes(pp, f);
  const a = nearest(rt, 0), b = nearest(rt, Math.PI / 2), nm = rt.nm, out = rt.D.S[a * nm + b], home = rt.D.S[b * nm + a], mk = Array.from(rt.mnode);
  assert.equal(rt.reprice(f), false, 'nothing moved');
  const g = { ...f, wind: Float32Array.from(f.wind, x => -x) };
  assert.equal(rt.reprice(g), true, 'the winds turned');
  assert.deepEqual(Array.from(rt.mnode), mk, 'the markets kept');
  assert.ok(Math.abs(rt.D.S[a * nm + b] / home - 1) < 0.02 && Math.abs(rt.D.S[b * nm + a] / out - 1) < 0.02, `out ${rt.D.S[a * nm + b].toFixed(0)} against the old way home ${home.toFixed(0)}; home ${rt.D.S[b * nm + a].toFixed(0)} against the old way out ${out.toFixed(0)}`);
});

test('routes follow works: railways carry steam by land as far as they are built, roads halve the road at their room', () => {
  const f = islands([1, 1, 1, 1, 1, 1]), pp = new People(f, { H_FARM: 0 }), rt = new Routes(pp, f), C = rt.C, km = 100, o = [0, 0];
  rt.landCost(km, 0, 0, 0, 0, 0, false, o);
  assert.equal(o[0], km * C.C_LAND); assert.equal(o[1], km * C.C_LAND, 'no railways: steam by land goes by the road');
  rt.landCost(km, 0, 1, 0, 0.5, 0, false, o);
  assert.equal(o[0], km * C.C_LAND / (1 + C.R_ROAD));
  assert.ok(Math.abs(o[1] - (0.5 * km * C.C_RAIL + 0.5 * o[0])) < 1e-9, 'half the room built: half the freight by rail');
});
