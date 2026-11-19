// The herders' pasture as drawn (People.drawn, People.pasture): it follows the herders who are
// there, not the land they could hold, and a preserving ending's rewilding retires it with the fields.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildGrid } from '../src/grid/icosphere.js';
import { NZ } from '../src/engine/climate.js';
import { People } from '../src/engine/people.js';

/** A dry, cold-wintered grassland everywhere: no farming, little to forage, good to herd. */
function steppe(level) {
  const grid = buildGrid(level), n = grid.n;
  const f = { seed: 'test', grid, n, elev: new Float32Array(n).fill(0.3), ice: new Float32Array(n), T12: new Float32Array(12 * n),
    P12: new Float32Array(12 * n).fill(15), ft: new Float32Array(n).fill(0.02), fg: new Float32Array(n).fill(0.6), npp: new Float32Array(n).fill(0.3),
    zones: new Float32Array(NZ * n), runoff: new Float32Array(n).fill(0.1), discharge: new Float32Array(n), lake: new Float32Array(n),
    perma: new Float32Array(n), sigT: new Float32Array(n).fill(1) };
  for (let i = 0; i < n; i++) { f.zones[NZ * i + 5] = 1; for (let m = 0; m < 12; m++) f.T12[12 * i + m] = 8 + 14 * Math.cos(2 * Math.PI * (m - 6) / 12); }
  return f;
}
const quiet = { H_FARM: 0, S_BG: 0, V_G: 0, CHECK: 1e12, Z_IND: 1e9, Z_AI: 1e9, Z_BOAT: 1e9, T_COLD0: -100 };

/** Herders known everywhere, the people at `occ` of the capacity; the pasture's mean share of a cell. */
function pastureAt(occ, rewild = 0) {
  const p = new People(steppe(4), { ...quiet });
  const L = p.newLineage(null, 0, 0);
  p.packages.push({ id: 0 }); p.rewild = rewild;
  for (let c = 0; c < p.nL; c++) L.Z[c] = p.P.Z_HERD + 1;
  p.capacity(L);
  for (let c = 0; c < p.nL; c++) { L.N[c] = occ * L.K[c]; p.Ntot[c] = L.N[c]; }
  p.reached.fill(1);
  p.drawn();
  const l = p.pasture();
  let s = 0;
  for (let c = 0; c < p.nL; c++) { assert.equal(l[4 * p.cells[c]], Math.fround(p.past[c])); s += p.past[c]; }
  return { mean: s / p.nL, K: L.K.reduce((a, b) => a + b, 0) };
}

test('the pasture follows the herders who are there', () => {
  const full = pastureAt(1).mean, tenth = pastureAt(0.1).mean, none = pastureAt(0).mean;
  assert.ok(full > 0.3, `grassland held by herders at their capacity: ${full.toFixed(2)} of each cell`);
  assert.ok(Math.abs(tenth / full - 0.1) < 1e-6, `a tenth of the herders, a tenth of the pasture (${tenth.toFixed(3)})`);
  assert.equal(none, 0, 'no one there, no pasture');
});

test('a preserving ending\'s rewilding retires the herds with the fields', () => {
  const kept = pastureAt(1, 0), wild = pastureAt(1, 1);
  assert.equal(wild.mean, 0, 'no pasture on rewilded land');
  assert.ok(wild.K < 0.5 * kept.K, `the land feeds as foragers' then (${(wild.K / kept.K).toFixed(2)} of the herders' capacity)`);
});
