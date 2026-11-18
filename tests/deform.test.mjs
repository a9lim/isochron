// The crust's deformation past the rigid plates (src/engine/plates.js, deform): rifted margins
// stretch into the gap where plates part and nowhere else, an orogen's wedge stands at TAPER behind
// its front, a plateau spreads past H_PLATEAU, none of it makes or destroys crust, and none of it
// (nor the stacking it spreads) is a load to the crust's flexure. And a seeded
// planet's continents (src/engine/genesis.js) stand as today's Earth's do, its sea at Earth's freeboard.
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildGrid } from '../src/grid/icosphere.js';
import { Tectonics, PARAMS, EARTH_RADIUS_KM } from '../src/engine/plates.js';
import { genesis, EARTH_CRUST, earthCrustAt } from '../src/engine/genesis.js';
import { elevation, FREEBOARD, H_OCEANIC, RHO_OCEANIC, RHO_CONTINENTAL } from '../src/engine/crust.js';

const grid = buildGrid(5), n = grid.n;

/** Two plates split at x = 0 (A: x > 0), continental crust h km thick, turning by wA and wB. */
function twoPlates(h, wA, wB) {
  const tec = new Tectonics(grid);
  const A = tec.allocPlate(), B = tec.allocPlate();
  A.alive = B.alive = true;
  A.w.set(wA); B.w.set(wB);
  for (let i = 0; i < n; i++) {
    const k = grid.pos[3 * i] > 0 ? 0 : 1, p = tec.plates[k];
    p.mask[i] = 1; p.h[i] = h; p.phi[i] = 1; p.tf[i] = -1000; p.sut[i] = -1e9;
    tec.owner[i] = k; tec.ref[i] = i;
  }
  tec.t = 10;
  sample(tec);
  return tec;
}
function sample(tec) {
  for (let i = 0; i < n; i++) { const p = tec.plates[tec.owner[i]], j = tec.ref[i]; tec.h[i] = p.h[j]; tec.phi[i] = p.phi[j]; tec.tf[i] = p.tf[j]; tec.sut[i] = p.sut[j]; }
}
const volume = tec => { let v = 0; for (const p of tec.plates) for (let j = 0; j < n; j++) if (p.mask[j]) v += p.h[j] * grid.area[j]; return v; };
/** A's cells beside B: new ocean made there this step (t1 − dt/2), the crust beside them A's continent. */
function newOcean(tec, t1, dt) {
  const A = tec.plates[0], cells = [];
  for (let i = 0; i < n; i++) {
    if (tec.owner[i] !== 0) continue;
    let edge = false;
    for (let e = grid.nbrOff[i]; e < grid.nbrOff[i + 1]; e++) if (tec.owner[grid.nbr[e]] === 1) edge = true;
    if (edge) { A.h[i] = H_OCEANIC; A.phi[i] = 0; A.tf[i] = t1 - 0.5 * dt; cells.push(i); }
  }
  sample(tec);
  return cells;
}

test('rifted margins: where plates part, STRETCH of the margin\'s crust stretches into the new cell; where they slide past, it stays ocean', () => {
  const dt = 0.5, t1 = 10.5;
  // About z the two plates part along x = 0 where y < 0 (A moves +x there) and close where y > 0.
  const tec = twoPlates(25, [0, 0, 0.004], [0, 0, -0.004]);
  const fresh = newOcean(tec, t1, dt), v0 = volume(tec);
  tec.deform(t1, dt);
  let opened = 0, stretched = 0;
  for (const i of fresh) {
    const y = grid.pos[3 * i + 1], z = grid.pos[3 * i + 2];
    if (Math.abs(z) > 0.6) continue;   // near the rotation's poles the boundary turns from opening to closing
    if (y < -0.2) { opened++; if (tec.phi[i] === 1 && tec.h[i] > 0.4 * PARAMS.STRETCH * 25 && tec.h[i] < 2 * PARAMS.STRETCH * 25) stretched++; }
    if (y > 0.2) assert.equal(tec.phi[i], 0, 'no stretching where the plates close');
  }
  assert.ok(opened > 5 && stretched === opened, `${stretched} of ${opened} new cells where the plates part took the margin's crust`);
  // The margin's crust moved; the new ocean it stands in place of wasn't made.
  let unmade = 0;
  for (const i of fresh) if (tec.phi[i] === 1) unmade += H_OCEANIC * grid.area[i];
  assert.ok(Math.abs(volume(tec) - (v0 - unmade)) < 1e-6 * v0, 'crust moved, none made');
  // Margins thinned by the share they gave.
  let thin = 0;
  for (let i = 0; i < n; i++) if (tec.owner[i] === 0 && tec.phi[i] === 1 && tec.h[i] < 25 - 1e-6) thin++;
  assert.ok(thin > 0, 'the donors thinned');
  // About x the plates slide past each other along x = 0: a gap there is the grid's rounding, not a rift.
  const sl = twoPlates(25, [0.004, 0, 0], [-0.004, 0, 0]);
  const gaps = newOcean(sl, t1, dt);
  sl.deform(t1, dt);
  assert.ok(gaps.every(i => sl.phi[i] === 0), 'no stretching along a transform');
});

test('rifted margins: crust thinner than H_BREAK breaks, and what opens beside it is ocean', () => {
  const dt = 0.5, t1 = 10.5;
  const tec = twoPlates(0.9 * PARAMS.H_BREAK, [0, 0, 0.004], [0, 0, -0.004]);
  const fresh = newOcean(tec, t1, dt);
  tec.deform(t1, dt);
  assert.ok(fresh.every(i => tec.phi[i] === 0 && tec.h[i] === H_OCEANIC), 'ocean');
});

test('the wedge: crust stacked at a front stands at most TAPER a km behind it, the volume kept', () => {
  const dt = 0.5, t1 = 10.5;
  const tec = twoPlates(25, [0, 0, 0], [0, 0, 0]);
  // A front on A: one cell stacked to 55 km this step.
  let f = -1;
  for (let i = 0; i < n && f < 0; i++) if (tec.owner[i] === 0 && Math.abs(grid.pos[3 * i + 2]) < 0.2 && grid.pos[3 * i] > 0.05 && grid.pos[3 * i] < 0.2) f = i;
  const A = tec.plates[0];
  A.h[f] = 55; A.sut[f] = t1;
  sample(tec);
  const v0 = volume(tec), taper = PARAMS.TAPER;
  PARAMS.TAPER = 0.05;   // ~11 km of crust a cell at level 5, so the wedge reaches past its first ring
  try { tec.deform(t1, dt); } finally { PARAMS.TAPER = taper; }
  assert.ok(Math.abs(volume(tec) - v0) < 1e-6 * v0, 'crust moved, none made');
  assert.ok(tec.h[f] < 55, 'the front spread');
  const S = 0.05 * EARTH_RADIUS_KM;
  let over = 0, took = 0;
  for (let e = grid.nbrOff[f]; e < grid.nbrOff[f + 1]; e++) {
    const q = grid.nbr[e];
    if (tec.owner[q] !== 0) continue;
    over = Math.max(over, tec.h[f] - tec.h[q] - S * grid.dist[e]);
    if (tec.h[q] > 25) took++;
  }
  assert.ok(over < 1e-4, `the front stands ${over.toFixed(4)} km past the taper`);
  assert.ok(took >= 3, 'its plate\'s neighbours took the crust');
  // Every cell the wedge moved stands within the taper of its plate's neighbours: a sandpile at rest.
  for (let i = 0; i < n; i++) {
    if (tec.owner[i] !== 0 || !(tec.h[i] > 25 + 1e-4)) continue;
    for (let e = grid.nbrOff[i]; e < grid.nbrOff[i + 1]; e++) {
      const q = grid.nbr[e];
      if (tec.owner[q] === 0) assert.ok(tec.h[i] - tec.h[q] - S * grid.dist[e] < 1e-4, `cell ${i} stands past the taper`);
    }
  }
  // B, across the boundary, took none.
  for (let i = 0; i < n; i++) if (tec.owner[i] === 1) assert.equal(tec.h[i], 25);
});

test('the plateau: no crust stands past H_PLATEAU after the deformation, the volume kept', () => {
  const tec = twoPlates(25, [0, 0, 0], [0, 0, 0]);
  const A = tec.plates[0];
  let c = -1;
  for (let i = 0; i < n && c < 0; i++) if (tec.owner[i] === 0 && grid.pos[3 * i] > 0.9) c = i;
  A.h[c] = 400;   // a column far past the plateau (not a front: the wedge leaves it)
  sample(tec);
  const v0 = volume(tec);
  tec.deform(10.5, 0.5);
  let top = 0;
  for (let i = 0; i < n; i++) top = Math.max(top, tec.h[i]);
  assert.ok(top <= PARAMS.H_PLATEAU + 1e-9, `the thickest crust ${top.toFixed(2)} km`);
  assert.ok(Math.abs(volume(tec) - v0) < 1e-6 * v0, 'crust moved, none made');
});

test('no load to the crust\'s flexure: a front\'s stacking is seen as it stands, and moved crust takes its mass with it', () => {
  const dt = 0.5, t1 = 10.5, massOf = (h, phi) => (RHO_OCEANIC + (RHO_CONTINENTAL - RHO_OCEANIC) * phi) * h;
  // Plates parting about z where y < 0 (rifted margins), a front stacked this step on A away from them, and a plateau.
  const tec = twoPlates(25, [0, 0, 0.004], [0, 0, -0.004]);
  const fresh = newOcean(tec, t1, dt), A = tec.plates[0];
  let f = -1, c = -1;
  for (let i = 0; i < n; i++) {
    const x = grid.pos[3 * i], y = grid.pos[3 * i + 1], z = grid.pos[3 * i + 2];
    if (f < 0 && tec.owner[i] === 0 && x > 0.1 && x < 0.3 && y > 0.5 && Math.abs(z) < 0.3) f = i;
    if (c < 0 && tec.owner[i] === 0 && x > 0.9) c = i;
  }
  A.h[c] = 200;
  // The flexure has seen every column as it stands, but the new ocean (new to it) and the front's stacking.
  for (const p of tec.plates) for (let j = 0; j < n; j++) p.mq[j] = massOf(p.h[j], p.phi[j]);
  for (const i of fresh) A.mq[i] = -1;
  A.h[f] += 30; A.sut[f] = t1;
  sample(tec);
  tec.deform(t1, dt);
  assert.ok(fresh.some(i => tec.phi[i] === 1) && A.h[f] < 55 && A.h[c] <= PARAMS.H_PLATEAU + 1e-9, 'a margin stretched, the front spread, the plateau spread');
  let worst = 0;
  for (const p of tec.plates) for (let j = 0; j < n; j++) if (p.mask[j] && p.mq[j] >= 0) worst = Math.max(worst, Math.abs(massOf(p.h[j], p.phi[j]) - p.mq[j]));
  assert.ok(worst < 1e-3, `a column's mass off what the flexure saw by ${worst.toExponential(2)} (ρh, g/cm³·km)`);
});

/** Today's Earth's continental crust's elevation above a new ridge at the area quantile u (EARTH_CRUST's bands, weighted as Earth's). */
function earthQuantile(u) {
  const Q = EARTH_CRUST.Q, s = [];
  for (let a = 0; a < 200; a++) {
    const ud = 20 * (a + 0.5) / 200, k = Math.min(19, Math.floor(ud)), d = Q[k] + (ud - k) * (Q[k + 1] - Q[k]);
    for (let b = 0; b < 200; b++) s.push(earthCrustAt(d, (b + 0.5) / 200));
  }
  s.sort((x, y) => x - y);
  return s[Math.floor(u * s.length)];
}
function continentQuantiles(tec, us) {
  const g = tec.grid, ridge = elevation(H_OCEANIC, 0, 0), c = [];
  let A = 0;
  for (let i = 0; i < g.n; i++) if (tec.phi[i] >= 0.5) { c.push([elevation(tec.h[i], tec.phi[i], tec.t - tec.tf[i]) - ridge, g.area[i]]); A += g.area[i]; }
  c.sort((p, q) => p[0] - q[0]);
  return us.map(u => { let acc = 0; for (const [e, a] of c) { acc += a; if (acc >= u * A) return e; } return c[c.length - 1][0]; });
}

test('a seeded planet\'s continents stand as Earth\'s, at its opening and after its spin-up; the sea at Earth\'s freeboard', () => {
  const us = [0.1, 0.25, 0.5, 0.75, 0.9, 0.98], earth = us.map(earthQuantile);
  for (const spinup of [0, 20]) {
    const g6 = buildGrid(6), tec = new Tectonics(g6);
    genesis(tec, 'earthlike', { spinup });
    const q = continentQuantiles(tec, us);
    for (let k = 0; k < us.length; k++) assert.ok(Math.abs(q[k] - earth[k]) < 0.15, `spin-up ${spinup}: the continents' ${us[k]} quantile ${q[k].toFixed(2)} km over a ridge, Earth's ${earth[k].toFixed(2)}`);
    const over = tec.seaLevel - elevation(H_OCEANIC, 0, 0);
    assert.ok(Math.abs(over - FREEBOARD) < 0.06, `spin-up ${spinup}: the sea ${over.toFixed(3)} km over a new ridge`);
    const land = tec.stats().land;
    assert.ok(land > 0.24 && land < 0.32, `land ${(100 * land).toFixed(1)}%`);
    console.log(`  spin-up ${spinup}: continents ${q.map(v => v.toFixed(2)).join(' ')} km over a ridge (Earth's ${earth.map(v => v.toFixed(2)).join(' ')}), land ${(100 * land).toFixed(1)}%`);
  }
});
