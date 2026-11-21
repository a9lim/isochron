// Water through the wired planet: kept from the rain through the soil, the rivers and the lakes to the sea; the
// closure-to-live handover.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Planet } from '../src/engine/planet.js';
import { accumulatePass } from '../src/engine/landscape.js';
import { drainage } from '../src/render/rivers.js';

const R2 = 6371 * 6371;
let shared = null;
/** A level-5 planet with a warm climate, its lakes at their balance, and the ground handed over to live (1 yr/s). */
function planet() {
  if (shared) return shared;
  const P = new Planet('earthlike', { level: 4, spinup: 10 });
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
