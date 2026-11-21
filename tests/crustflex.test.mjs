// The crust's flexure (src/engine/crustflex.js): Airy in its limits, its integral nothing, carried with the crust.
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildGrid } from '../src/grid/icosphere.js';
import { Tectonics } from '../src/engine/plates.js';
import { genesis } from '../src/engine/genesis.js';
import { Flexure } from '../src/engine/flexure.js';
import { CrustFlex, CRUSTFLEX } from '../src/engine/crustflex.js';
import { RHO_CONTINENTAL, RHO_MANTLE } from '../src/engine/crust.js';

const grids = [];
const grid = L => { for (let l = 1; l <= L; l++) grids[l] ||= buildGrid(l); return grids[L]; };

/** A planet with one continental cell (220 km across) thinned by 2 km. */
function setup(Te) {
  const g = grid(5), tec = new Tectonics(g);
  genesis(tec, 'earthlike', { spinup: 10 });
  const F = new CrustFlex(tec, new Flexure(g, { have: grids.filter(Boolean) }), { Te: new Float32Array(g.n).fill(Te) });
  let c = -1;
  // Off the grid's twelve pentagons (cells 0–11), where the solver's integral is ~10% off (a hexagon's ~1e-4).
  for (let i = 12; i < g.n && c < 0; i++) {
    let ok = tec.phi[i] > 0.9 && tec.elev[i] > tec.seaLevel;
    for (let e = g.nbrOff[i]; e < g.nbrOff[i + 1]; e++) if (tec.phi[g.nbr[e]] < 0.9) ok = false;
    if (ok) c = i;
  }
  const patch = [c];
  const elev0 = Float32Array.from(tec.elev);
  for (const i of patch) { const p = tec.plates[tec.owner[i]]; p.h[tec.ref[i]] -= 2; tec.h[i] = p.h[tec.ref[i]]; }
  tec.updateElevation();
  const airy = Float32Array.from(tec.elev);          // the elevation without flexure
  return { g, tec, F, c, patch, elev0, airy };
}

test('the crust\'s flexure: Airy at Tₑ → 0 and at τ → 0; a narrow change held by a stiff plate, its integral nothing', () => {
  const wA = 2 * RHO_CONTINENTAL / RHO_MANTLE * 1000;      // m: the Airy rebound of 2 km of crust removed
  // Tₑ → 0 (the solver's floor, 0.2 km: α ≈ 1.6 km, under a cell's 220).
  const s0 = setup(0.2);
  s0.F.step(0.5); s0.tec.updateElevation();
  let soft = 0;
  for (let i = 0; i < s0.g.n; i++) soft = Math.max(soft, Math.abs(s0.tec.elev[i] - s0.airy[i]) * 1000);
  // A stiff plate (Tₑ 60 km, α ≈ 130 km against the cell's 220): the cell rebounds less, its neighbours with it.
  const s1 = setup(60);
  s1.F.step(0.5); s1.tec.updateElevation();
  const { g, tec, c, patch } = s1, area = g.area;
  let int = 0, abs = 0, ring = 0, nr = 0;
  const inPatch = new Uint8Array(g.n); for (const i of patch) inPatch[i] = 1;
  for (let i = 0; i < g.n; i++) {
    const v = tec.flexc[i] * 1000;
    int += v * area[i]; abs += Math.abs(v) * area[i];
    if (!inPatch[i]) for (let e = g.nbrOff[i]; e < g.nbrOff[i + 1]; e++) if (inPatch[g.nbr[e]]) { ring += v; nr++; break; }
  }
  const atC = tec.flexc[c] * 1000;
  // τ → 0 on continents: the change relaxes to Airy within the step.
  const tau = CRUSTFLEX.TAU_CONT;
  CRUSTFLEX.TAU_CONT = 1e-6;
  const s2 = setup(60);
  s2.F.step(0.5); s2.tec.updateElevation();
  CRUSTFLEX.TAU_CONT = tau;
  let relaxed = 0;
  for (let i = 0; i < s2.g.n; i++) if (s2.tec.phi[i] > 0.65) relaxed = Math.max(relaxed, Math.abs(s2.tec.flexc[i]) * 1000);
  // Unchanged crust is no load: a second solve adds nothing.
  const before = Float32Array.from(tec.flexc);
  s1.F.step(0);
  let still = 0;
  for (let i = 0; i < g.n; i++) still = Math.max(still, Math.abs(tec.flexc[i] - before[i]) * 1000);
  assert.ok(soft < 1e-3 * wA, 'Airy at Tₑ → 0');
  assert.ok(atC < -0.15 * wA && ring / nr > 0, 'held by the plate');   // a hexagon of 220 km under α ≈ 130 km: ~18% of Airy's rebound held
  assert.ok(Math.abs(int) < 2e-3 * abs, 'the integral is nothing');
  assert.ok(relaxed < 1e-3 * wA, 'Airy at τ → 0');
  assert.ok(still < 1e-6, 'no change, no load');
});

test('the crust\'s flexure rides the frames: plate steps carry c with the crust', () => {
  const s = setup(60), { tec, F } = s, n = tec.grid.n, t0 = tec.t;
  F.step(0.5);
  // Mark every frame cell's correction by its crust's age, so a carried value is recognizable.
  for (const p of tec.plates) for (let j = 0; j < n; j++) p.cf[j] = p.mask[j] ? t0 - p.tf[j] : 0;
  tec.sampleFlex();
  for (let k = 0; k < 4; k++) tec.step(0.5);
  let ok = 0, fresh = 0, bad = 0;
  for (let i = 0; i < n; i++) {
    const p = tec.plates[tec.owner[i]], j = tec.ref[i], v = tec.flexc[i] * 1000;
    if (Math.abs(v - p.cf[j]) > 1e-4 * Math.max(1, Math.abs(v))) bad++;          // the world's sample is the frame's
    else if (p.tf[j] > t0 - 0.01 && v === 0) fresh++;                            // new crust starts with none
    else if (Math.abs(p.cf[j] - (t0 - p.tf[j])) < 1e-4 * Math.max(1, p.cf[j])) ok++;
    else bad++;
  }
  assert.equal(bad, 0);
});
