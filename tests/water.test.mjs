// The ground and the lakes wired into the planet (docs/PLAN.md, phase 6): water
// kept from the rain through the soil, the rivers and the lakes to the sea; the
// closure-to-live handover continuous (on the CPU, and on the GPU where node has
// WebGPU); the lakes rebuilt when the ice moves; rivers ending at closed lakes.
import test from 'node:test';
import assert from 'node:assert/strict';
import { hasGPU } from './webgpu-node.mjs';
import { Planet, PLANET } from '../src/engine/planet.js';
import { accumulatePass } from '../src/engine/landscape.js';
import { drainage } from '../src/render/rivers.js';

const R2 = 6371 * 6371;
let shared = null;
/** A level-5 planet with a warm climate, its lakes at their balance, and the ground handed over to live (1 yr/s). */
function planet() {
  if (shared) return shared;
  const P = new Planet('earthlike', { level: 5, spinup: 20 });
  P.climate.solve(3); P.afterClimate();
  for (let f = 0; f < 120; f++) { P.years += 1 / 60; P.fast(1 / 60, 4, 1); }
  return (shared = P);
}

test('water is kept over a year from the rain through the soil, the rivers and the lakes to the sea', () => {
  const P = planet(), g = P.grid, n = g.n, G = P.ground, c = P.climate, L = P.lakes, A = Float64Array.from(g.area, a => a * R2);
  assert.ok(G.live && G.cpu, 'the ground is live');
  const s = G.cpu, store0 = Float64Array.from({ length: n }, (_, i) => s.S[i] + s.SWE[i] + s.G[i]);
  // Each month the ground steps, its rain (the climate's month times the step's held factor).
  const rain = new Float64Array(n), step = G.step.bind(G);
  G.step = inp => {
    for (let k = 0; k < inp.months; k++) { const m = (G.month + k) % 12; for (let i = 0; i < n; i++) if (s.Smax[i] > 0) rain[i] += c.P12[12 * i + m] * inp.rf[i]; }
    step(inp);
  };
  const months0 = G.stepped, out = s.out, run = new Float64Array(n), evap = new Float64Array(n);
  const books0 = { ...L.total }, V0 = L.storage();
  // The ground's bank in the lakes' catchments (km³): discharged, not yet taken by the lakes.
  const banked = () => { let v = 0; for (let i = 0; i < n; i++) if (L.catch[i] >= 0) v += A[i] * G.bank[i] * 1e-6; return v; };
  const bank0 = banked();
  let k = 0;
  while (G.stepped < months0 + 12 && k++ < 2000) {
    const m0 = G.stepped;
    P.years += 1 / 60; P.fast(1 / 60, 4, 1);
    for (let j = m0; j < G.stepped; j++) {
      const m = (G.month - (G.stepped - j) + 120) % 12;
      for (let i = 0; i < n; i++) if (s.Smax[i] > 0) { run[i] += out.quick[12 * i + m] + out.base[12 * i + m]; evap[i] += out.evap[12 * i + m]; }
    }
  }
  G.step = step;
  assert.equal(G.stepped, months0 + 12);
  // The soil: rain = evaporation + runoff + storage (mm × km², summed over the land).
  let Rn = 0, E = 0, Q = 0, dS = 0;
  for (let i = 0; i < n; i++) { if (!(s.Smax[i] > 0)) continue; Rn += A[i] * rain[i]; E += A[i] * evap[i]; Q += A[i] * run[i]; dS += A[i] * (s.S[i] + s.SWE[i] + s.G[i] - store0[i]); }
  const resid = Rn - E - Q - dS;
  // The runoff (km³): to the lakes' catchments, or straight to the sea.
  let toLakes = 0, direct = 0;
  for (let i = 0; i < n; i++) { const q = A[i] * run[i] * 1e-6; if (L.catch[i] >= 0) toLakes += q; else direct += q; }
  // The lakes' books over the year (km³): storage = runoff in + rain less evaporation on them − overflow.
  const dV = L.storage() - V0, inL = L.total.runoff - books0.runoff, vert = L.total.vertical - books0.vertical, out2 = L.total.toSea - books0.toSea;
  const dBank = banked() - bank0;
  // The rivers: this year's runoff routed down their drainage reaches the sea as the direct runoff
  // and the spilling lakes' overflow (to within the two routings' catchments, the landscape's over
  // its roughness and the lakes' over the smooth surface).
  const rt = drainage(g, P.land, L), w = Float64Array.from(run, (v, i) => P.land.base[i] ? 0 : A[i] * v * 1e-6), q = new Float64Array(n);
  accumulatePass(rt, w, q);
  let mouths = 0;
  for (let i = 0; i < n; i++) { const r = rt.rcv[i]; if (!P.land.base[i] && r >= 0 && P.land.base[r]) mouths += q[i] * rt.pass[i]; }
  console.log(`a year on land: rain ${(Rn * 1e-6).toFixed(0)} km³ = evaporation ${(E * 1e-6).toFixed(0)} + runoff ${(Q * 1e-6).toFixed(0)} + storage ${(dS * 1e-6).toFixed(1)} (residual ${(resid * 1e-6).toExponential(1)}); ` +
    `runoff to lakes ${toLakes.toFixed(0)} km³, to the sea ${direct.toFixed(0)}; lakes: in ${inL.toFixed(0)} (bank ${dBank >= 0 ? '+' : ''}${dBank.toFixed(0)}), net vertical ${vert.toFixed(0)}, over ${out2.toFixed(0)}, storage ${dV.toFixed(1)}; ` +
    `rivers at the coast ${mouths.toFixed(0)} km³ against ${(direct + out2).toFixed(0)}`);
  assert.ok(Math.abs(resid) < 1e-5 * Rn, `soil residual ${(resid / Rn).toExponential(1)} of the rain`);
  assert.ok(Math.abs(toLakes + direct - Q * 1e-6) < 1e-6 * Q * 1e-6, 'runoff splits between the lakes and the sea');
  assert.ok(Math.abs(dV - (inL + vert - out2)) < 1e-6 * Math.max(1, inL), `lakes: storage ${dV} against the books ${inL + vert - out2}`);
  // Across the ledgers: what the soil let go into the lakes' catchments is what the lakes took, or still in the bank.
  assert.ok(Math.abs(toLakes - (inL + dBank)) < 1e-6 * toLakes, `soil to the lakes' catchments ${toLakes.toFixed(1)} km³ against ${inL.toFixed(1)} taken + ${dBank.toFixed(1)} banked`);
  assert.ok(Math.abs(mouths - (direct + out2)) < 0.08 * (direct + out2), `rivers at the coast ${mouths.toFixed(0)} km³ against ${(direct + out2).toFixed(0)}`);
});

test('the closure-to-live handover is continuous: the first live year repeats the periodic year', () => {
  const P = planet(), G = P.ground, c = P.climate, n = P.grid.n;
  // Hand over afresh at April, with no anomaly, and step a year a month at a time.
  G.closure({ live: 0 });
  const dT = new Float32Array(n), rf = new Float32Array(n).fill(1);
  G.step({ years: P.years, m0: 3, months: 1, live: 1, dT, rf });
  for (let k = 1; k < 12; k++) G.step({ years: P.years, m0: (3 + k) % 12, months: 1, live: 1, dT, rf });
  const s = c.soil.out, l = G.cpu.out;
  let worst = 0, top = 0;
  for (let i = 0; i < n; i++) for (let m = 0; m < 12; m++) {
    const k = 12 * i + m, a = s.quick[k] + s.base[k], b = l.quick[k] + l.base[k];
    worst = Math.max(worst, Math.abs(a - b), Math.abs(s.S[k] - l.S[k]), Math.abs(s.SWE[k] - l.SWE[k]));
    top = Math.max(top, a);
  }
  assert.ok(worst < 0.2, `live against periodic: ${worst.toFixed(3)} mm at most (largest month ${top.toFixed(0)} mm)`);
});

test('the lakes are rebuilt when the ice moves: an ice dam makes a lake, and its loss lets the water go', () => {
  const P = planet(), g = P.grid, n = g.n, tec = P.tec, L = P.lakes, H = P.ice.H;
  // A big river's reach well inland, ringed by ice: its six neighbours under 3 km of it,
  // so the reach is a closed depression whatever the valley's shape (a dam across the river alone, below it,
  // left the reach a way round on some planets).
  const rt = drainage(g, P.land, L), Q = new Float64Array(n), land = i => i >= 0 && !P.land.base[i];
  accumulatePass(rt, Float64Array.from(P.climate.runoff, (r, i) => P.land.base[i] ? 0 : r * g.area[i]), Q);
  // Each cell's main-stem donor; the reach two cells above the dam must run free too.
  const stem = new Int32Array(n).fill(-1);
  for (let i = 0; i < n; i++) { const c = rt.rcv[i]; if (c >= 0 && land(i) && (stem[c] < 0 || Q[i] > Q[stem[c]])) stem[c] = i; }
  const donor = c => c >= 0 ? stem[c] : -1;
  let dam = -1;
  for (let i = 0; i < n; i++) {
    const a = rt.rcv[i], b = a >= 0 ? rt.rcv[a] : -1, d = b >= 0 ? rt.rcv[b] : -1, u = donor(donor(i));
    if (land(i) && land(a) && land(b) && land(d) && L.regOf[i] < 0 && u >= 0 && L.regOf[u] < 0 && L.regOf[donor(i)] < 0 && (dam < 0 || Q[i] > Q[dam])) dam = i;
  }
  assert.ok(dam >= 0);
  // Two cells upstream: the main stem's.
  const up = donor(donor(dam));
  assert.ok(up >= 0 && L.regOf[up] < 0, 'the reach above runs free');
  const saved = Float32Array.from(H), builds = L.builds;
  for (const j of g.nbr.subarray(g.nbrOff[up], g.nbrOff[up + 1])) if (land(j)) H[j] = 3000;
  // The lakes alone (the ice isn't stepped, so the dam stays as laid), at 10 yr/s, on the
  // closure's runoff (the live ground lets go only the water of the months it steps).
  P.ground.closure({ live: 0 });
  P.tec.iceWater += 2 * PLANET.LAKES_ICE; P.years += PLANET.LAKES_ICE_YEARS;
  P.stepLakes(1, 10);
  assert.equal(L.builds, builds + 1, 'rebuilt when the ice moved');
  assert.ok(L.regOf[up] >= 0, 'the dam holds a depression upstream');
  for (let y = 0; y < 400; y++) P.stepLakes(1, 10);
  P.stepLakes(1, 10);
  assert.equal(L.builds, builds + 1, 'not rebuilt while the ice stays');
  const held = L.storage(), total0 = L.total.toSea;
  // The opening's lakes sit at their balance with each climate cycle until the climate has settled
  // (Planet.stepLakes), which moves water legitimately; only the rebuild is under test here.
  const cs = P.climate.stats;
  if (!(cs.settled && cs.cycles > cs.settled)) { cs.settled = 1; cs.cycles = Math.max(cs.cycles, 2); }
  H.set(saved); P.tec.iceWater -= 2 * PLANET.LAKES_ICE; P.years += PLANET.LAKES_ICE_YEARS;
  P.stepLakes(0, 10);   // the rebuild alone: what the old basins held is carried over or released
  assert.equal(L.builds, builds + 2, 'rebuilt when the dam went');
  const released = L.total.toSea - total0;
  console.log(`dammed: ${held.toFixed(0)} km³ in all lakes; the dam gone: ${released.toFixed(0)} km³ released to the sea, ${L.storage().toFixed(0)} km³ kept`);
  assert.ok(released > 0, 'the dammed water went');
  assert.ok(Math.abs(L.storage() + released - held) < 1e-9 * held, 'and none was made or lost');
});

test('the closure-to-live handover on the GPU repeats the periodic year', { skip: hasGPU ? false : 'no WebGPU in node (npm install in tests/)' }, async () => {
  const { GpuSoil } = await import('../src/gpu/soil.js');
  const { gpuDevice } = await import('../src/gpu/device.js');
  const P = planet(), G = P.ground, c = P.climate, n = P.grid.n;
  G.closure({ live: 0 });
  G.gpu = new GpuSoil(await gpuDevice(), n, 0);
  const dT = new Float32Array(n), rf = new Float32Array(n).fill(1);
  G.step({ years: P.years, m0: 7, months: 1, live: 1, dT, rf });
  const r = await G.gpu.read({ monthly: true, state: true });
  G.gpu = null; G.closure({ live: 0 });
  const o = c.soil.out;
  let worst = 0, top = 0;
  for (let i = 0; i < n; i++) for (let m = 0; m < 12; m++) {
    const k = 12 * i + m, a = o.quick[k] + o.base[k];
    worst = Math.max(worst, Math.abs(r.runoffM[k] - a)); top = Math.max(top, a);
  }
  // The state after August is the periodic year's at September.
  let ws = 0;
  for (let i = 0; i < n; i++) if (c.soil.Smax[i] > 0) ws = Math.max(ws, Math.abs(r.S[i] - o.S[12 * i + 7]), Math.abs(r.SWE[i] - o.SWE[12 * i + 7]), Math.abs(r.G[i] - o.G[12 * i + 7]));
  assert.ok(worst < 0.05 + 1e-4 * top, `runoff by month, GPU against the periodic year: ${worst.toFixed(3)} mm at most`);
  assert.ok(ws < 0.5, `state: ${ws.toFixed(3)} mm at most`);
});
