// Water through the wired planet: kept from the rain through the soil, the rivers and the lakes to the sea; the
// closure-to-live handover.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Planet } from '../src/engine/planet.js';
import { accumulatePass } from '../src/engine/landscape.js';
import { traceRivers } from '../src/render/rivers.js';
import { drainage } from '../src/engine/lakes.js';
import { fieldsOf } from '../src/engine/peoplelink.js';

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

test('rivers run off an ice sheet over its surface: never up it, and none drawn on it', () => {
  // A dome of ice 2 km thick at its centre, laid on the land farthest from the sea. Water runs on the ice's
  // surface (Landscape.iceRoute) to the margin, so along the drainage it never climbs the ice (routed on its bed,
  // a river crossed a cap uphill), and no river is drawn where the globe draws the sheet (past 50 m).
  const P = planet(), g = P.grid, n = g.n, land = P.land, far = new Int32Array(n).fill(-1);
  let front = [];
  for (let i = 0; i < n; i++) if (land.base[i]) { far[i] = 0; front.push(i); }
  for (let d = 1; front.length; d++) {
    const next = [];
    for (const i of front) for (let t = g.nbrOff[i]; t < g.nbrOff[i + 1]; t++) { const j = g.nbr[t]; if (far[j] < 0) { far[j] = d; next.push(j); } }
    front = next;
  }
  let c0 = 0;
  for (let i = 0; i < n; i++) if (far[i] > far[c0]) c0 = i;
  const H = new Float32Array(n), p0 = [g.pos[3 * c0], g.pos[3 * c0 + 1], g.pos[3 * c0 + 2]];
  for (let i = 0; i < n; i++) {
    if (land.base[i]) continue;
    const a = Math.acos(Math.min(1, p0[0] * g.pos[3 * i] + p0[1] * g.pos[3 * i + 1] + p0[2] * g.pos[3 * i + 2])) / 0.35;
    if (a < 1) H[i] = 2000 * Math.sqrt(1 - a * a);
  }
  const iceR = land.iceRoute(H), rt = drainage(g, land, null, iceR), top = i => land.zr[i] + H[i] / 1000;
  let steps = 0;
  for (let i = 0; i < n; i++) {
    const j = rt.rcv[i];
    if (!(H[i] > 50) || j < 0 || !(H[j] > 50)) continue;
    steps++;
    assert.ok(top(j) < top(i), `cell ${i} drains up the ice to ${j}: ${top(i).toFixed(3)} → ${top(j).toFixed(3)} km`);
  }
  assert.ok(steps > 20, `${steps} steps on the sheet`);
  const rivers = traceRivers(g, land, null, land.monthly(P.climate.runoffM, rt), 1, rt);
  assert.ok(rivers.length > 0, 'rivers drawn');
  for (const r of rivers) for (const c of r.cells) assert.ok(!(H[c] > 50), `a river drawn on the sheet at ${c}`);
});

test("the rivers the people and the sea's mouths read follow the climate's runoff", () => {
  // Planet.rivers: the year's mean discharge down the lakes' drainage from the climate's runoff as it is now (the
  // landscape's own discharge, routed only when it steps, had held its opening's uniform runoff through the people's era).
  const P = planet(), c = P.climate, n = P.grid.n, base = P.land.base, run0 = Float32Array.from(c.runoff);
  const at = () => Float64Array.from(fieldsOf(P).discharge);   // as the people's fields carry it (and the sea's mouths, Life.seaInputs)
  const Q1 = at();
  for (let i = 0; i < n; i++) c.runoff[i] = 2 * run0[i];
  c.version++;
  const Q2 = at();
  c.runoff.set(run0); c.version++;
  let land = 0, off = 0, top = 0;
  for (let i = 0; i < n; i++) if (!base[i]) { land++; top = Math.max(top, Q1[i]); if (Math.abs(Q2[i] - 2 * Q1[i]) > 1e-4 * Math.max(1, Q1[i])) off++; }
  assert.ok(top > 0 && off === 0, `twice the runoff twice the discharge (${off} of ${land} land cells off)`);
});
