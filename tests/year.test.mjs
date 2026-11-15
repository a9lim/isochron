// The year (src/engine/year.js) and the volcanoes (src/engine/volcanoes.js):
// Hasselmann's red spectrum, the veil's cooling against the analytic
// convolution, determinism for a seed, and the closures' means.
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildGrid } from '../src/grid/icosphere.js';
import { CLIMATE } from '../src/engine/climate.js';
import { Year, YEAR, boxResponse } from '../src/engine/year.js';
import { Volcanoes, VOLC, plMean } from '../src/engine/volcanoes.js';

/** A climate with only what the year reads: land (a band of continents, or none), no ice. */
function world(level, land = () => false) {
  const g = buildGrid(level), n = g.n;
  const landMask = Uint8Array.from({ length: n }, (_, i) => land(g.pos[3 * i], g.pos[3 * i + 1], g.pos[3 * i + 2]) ? 1 : 0);
  return { grid: g, landMask, snowAnn: new Float32Array(n), stats: { cycles: 3 } };
}
const tecOf = (g, cell = -1) => { const arc = new Float32Array(g.n); if (cell >= 0) arc[cell] = 5; return { grid: g, arc, t: 0 }; };
const equatorCell = g => { let b = 0; for (let i = 0; i < g.n; i++) if (Math.abs(g.pos[3 * i + 2]) < Math.abs(g.pos[3 * b + 2])) b = i; return b; };

function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let b = n >> 1;
    for (; j & b; b >>= 1) j ^= b;
    j ^= b;
    if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const a = -2 * Math.PI / len, wr = Math.cos(a), wi = Math.sin(a);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const ur = re[i + k], ui = im[i + k], vr = re[i + k + len / 2] * cr - im[i + k + len / 2] * ci, vi = re[i + k + len / 2] * ci + im[i + k + len / 2] * cr;
        re[i + k] = ur + vr; im[i + k] = ui + vi; re[i + k + len / 2] = ur - vr; im[i + k + len / 2] = ui - vi;
        const t = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = t;
      }
    }
  }
}

test("the anomaly's spectrum is Hasselmann's: red, with its corner at B/C", () => {
  const c = world(3), y = new Year(c, null, 'spectrum', { D: 0 });
  y.capacity(true);
  const N = 8192, burn = 240, n = y.n, F = new Float64Array(n), X = Array.from({ length: n }, () => new Float64Array(N));
  for (let k = 0; k < burn + N; k++) { y.stepAnomaly(1 / 12, F); if (k >= burn) for (let i = 0; i < n; i++) X[i][k - burn] = y.Ta[i]; }
  // The periodogram, averaged over cells and normalized by each cell's variance.
  const S = new Float64Array(N / 2), re = new Float64Array(N), im = new Float64Array(N);
  for (let i = 0; i < n; i++) {
    const s = y.q[i] ** 2 / (2 * CLIMATE.B * y.C[i]);
    re.set(X[i]); im.fill(0); fft(re, im);
    for (let f = 1; f < N / 2; f++) S[f] += (re[f] ** 2 + im[f] ** 2) / N / s / n;
  }
  // The discrete OU's spectrum: (1 − a²) / (1 − 2a cos 2πf + a²), f per month.
  const a = Math.exp(-CLIMATE.B / 12 / CLIMATE.C_OCEAN), th = f => (1 - a * a) / (1 - 2 * a * Math.cos(2 * Math.PI * f / N) + a * a);
  let worst = 0;
  for (let lo = 2; lo < N / 2; lo = Math.ceil(lo * 1.5)) {
    const hi = Math.min(N / 2, Math.ceil(lo * 1.5));
    let m = 0, t = 0;
    for (let f = lo; f < hi; f++) { m += S[f]; t += th(f); }
    worst = Math.max(worst, Math.abs(m / t - 1));
  }
  assert.ok(worst < 0.12, `periodogram off its theory by ${(100 * worst).toFixed(1)}% in the worst band`);
  // The corner: where the spectrum falls to half its plateau, against B/(2πC) cycles a year.
  const fc = CLIMATE.B / (2 * Math.PI * CLIMATE.C_OCEAN), k0 = Math.round(fc * N / 12);
  let plateau = 0, np = 0;
  for (let f = 1; f < k0 / 4; f++) { plateau += S[f]; np++; }
  plateau /= np;
  const sm = f => { let s = 0, w = 0; for (let d = -3; d <= 3; d++) if (f + d > 0) { s += S[f + d]; w++; } return s / w; };
  let fHalf = null;
  for (let f = 1; f < N / 2; f++) if (sm(f) < plateau / 2) { fHalf = f * 12 / N; break; }
  assert.ok(fHalf && Math.abs(fHalf / fc - 1) < 0.2, `corner at ${fHalf?.toFixed(4)} cycles/yr against B/2πC = ${fc.toFixed(4)}`);
  // Above it, ω⁻²: a decade up in frequency, a hundredfold down.
  const ratio = sm(10 * k0) / sm(100 * k0);
  assert.ok(ratio > 60 && ratio < 160, `fall over a decade ${ratio.toFixed(0)}×`);
});

test("the veil's global cooling is the analytic convolution: uniform sea with diffusion, and mixed land and sea without", () => {
  const save = VOLC.BACKGROUND;
  VOLC.BACKGROUND = false;
  try {
    // With one heat capacity the diffusion keeps the global mean's budget, so a tropical veil's
    // global response is the box's; with land and sea the boxes are independent only without
    // diffusion, and then they must all see the global forcing: a veil spread evenly.
    for (const [name, land, D, even] of [['sea, D 0.03', () => false, 0.03, false], ['land and sea, D 0', (x, y, z) => x > 0.3 && Math.abs(z) < 0.7, 0, true]]) {
      const c = world(4, land), g = c.grid, V = new Volcanoes(tecOf(g, equatorCell(g)), null, null, 'veil');
      const y = new Year(c, V, 'veil', { D });
      y.capacity(true); y.q.fill(0);            // no weather: the eruption's response alone
      y.t0 = y.t1 = 0;
      const info = y.eruptTagged(10, 0);
      if (even) { const u = V.global(V.tag); V.tag.fill(u); V.aod.fill(u); }
      const th = boxResponse(y.C, Float64Array.from(g.area, a => a / (4 * Math.PI)), CLIMATE.B, info.F0, VOLC.TAU);
      let worst = 0;
      for (let k = 0; k < 15 * 12; k++) { y.step(1); worst = Math.max(worst, Math.abs(y.tagInfo.now - th.at(y.t1))); }
      const I = y.tagInfo;
      assert.ok(worst < 0.02 * Math.abs(th.peak), `${name}: off the convolution by ${worst.toFixed(4)} K (peak ${th.peak.toFixed(3)} K)`);
      assert.ok(Math.abs(I.peak / th.peak - 1) < 0.02, `${name}: peak ${I.peak.toFixed(3)} against ${th.peak.toFixed(3)} K`);
      assert.ok(Math.abs(I.efold - th.efold) < 0.15, `${name}: e-folding ${I.efold} against ${th.efold?.toFixed(2)} yr`);
      // The whole anomaly is the tag's here (no noise, no other eruptions): superposition.
      assert.ok(Math.abs(y.stats.meanT - I.now) < 1e-9, `${name}: the tag's response is the anomaly's`);
    }
  } finally { VOLC.BACKGROUND = save; }
});

test('a seeded year is deterministic, and its seed is what varies it', () => {
  const run = seed => {
    const c = world(4, (x, y, z) => z > 0.4), g = c.grid, V = new Volcanoes(tecOf(g, equatorCell(g)), null, null, seed);
    const y = new Year(c, V, seed);
    for (let t = 0; t <= 60; t += 1 / 60) y.advance(t, 1);
    return { T: Float64Array.from(y.Ta), e: V.recent.map(e => `${e.t.toFixed(6)}:${e.M.toFixed(6)}`).join(), steps: y.steps };
  };
  const a = run('alpha'), b = run('alpha'), c = run('beta');
  assert.deepEqual(a.T, b.T);
  assert.equal(a.e, b.e);
  assert.ok(Math.abs(a.steps - 721) <= 1, `${a.steps} monthly steps in 60 years`);
  assert.notDeepEqual(a.T, c.T);
});

test("the closure's means: the eruption rate's forcing is the live veil's mean; the live spread is the closure's", async () => {
  // The veil, a year at a time for 100 kyr, sampled at each year's end (unbiased: the process is stationary).
  const c = world(3), g = c.grid, V = new Volcanoes(tecOf(g, equatorCell(g)), null, null, 'mean');
  let sum = 0;
  const Fb = new Float64Array(VOLC.NB), years = 1e5;
  for (let t = 0; t < years; t++) { V.step(t, 1, true); V.forcing(Fb); let s = 0; for (let b = 0; b < VOLC.NB; b++) s += Fb[b] * (Math.sin((-85 + 5 * b) * Math.PI / 180) - Math.sin((-90 + 5 * b) * Math.PI / 180)) / 2; sum += s; }
  const live = sum / years;
  const expect = -VOLC.FORCE * VOLC.AOD_P * VOLC.ARC_RATE * plMean(VOLC.M_MIN, VOLC.ARC_MAX) * VOLC.TAU;
  assert.ok(Math.abs(V.meanForcing() / expect - 1) < 1e-9, 'meanForcing is rate × mean size × a Pinatubo\'s integral');
  assert.ok(Math.abs(live / V.meanForcing() - 1) < 0.08, `live mean ${live.toFixed(3)} W/m² against the closure's ${V.meanForcing().toFixed(3)}`);

  // The anomaly on a seeded planet: its live spread over land against the closure the zones read.
  const { Planet } = await import('../src/engine/planet.js');
  const P = new Planet('earthlike', { level: 5, spinup: 10 });
  P.climate.solve(2);
  const y = new Year(P.climate, null, 'spread');
  y.capacity(true);
  const n = y.n, s1 = new Float64Array(n), s2 = new Float64Array(n), F = new Float64Array(n);
  let N = 0;
  for (let k = 0; k < 160 * 12; k++) { y.stepAnomaly(1 / 12, F); if (k >= 120) { for (let i = 0; i < n; i++) { s1[i] += y.Ta[i]; s2[i] += y.Ta[i] ** 2; } N++; } }
  let e = 0, w = 0;
  for (let i = 0; i < n; i++) { const r = Math.log(Math.sqrt(s2[i] / N - (s1[i] / N) ** 2) / y.sigma[i]), a = y.land[i] * y.grid.area[i]; e += r * r * a; w += a; }
  assert.ok(Math.sqrt(e / w) < 0.15, `land's live spread off the closure by ${(100 * Math.sqrt(e / w)).toFixed(0)}% rms`);
  // At the opening, the volcanoes' mean forcing is in the climate's tuning: nothing is added.
  P.year.advance(P.years, 1e6);
  assert.equal(CLIMATE.F_VOLC, 0);
});

test('the stepper: live below ~56 yr/s, its closure above ~180, soft between; parts called by the month and the year', () => {
  assert.equal(Year.liveWeight(1), 1);
  assert.equal(Year.liveWeight(1e3), 0);
  const mid = Year.liveWeight(100);
  assert.ok(mid > 0.3 && mid < 0.7, `half-live near 100 yr/s (${mid.toFixed(2)})`);
  let prev = 1;
  for (let lr = 1.5; lr <= 2.5; lr += 0.01) { const v = Year.liveWeight(10 ** lr); assert.ok(v <= prev && prev - v < 0.04, 'smooth'); prev = v; }
  // Hooks: a mock soil and lakes over three years at 1 yr/s, then outrun.
  const c = world(4, (x, y, z) => z > 0.3), n = c.grid.n;
  Object.assign(c, {
    Pf: [new Float32Array(n).fill(2), ...Array.from({ length: 4 }, () => new Float32Array(n))],
    Tf: [new Float32Array(n).fill(10), ...Array.from({ length: 4 }, () => new Float32Array(n))],
    runoffM: new Float32Array(12 * n).fill(0.03), elevPos: new Float32Array(n),
  });
  const y = new Year(c, null, 'hooks'), months = [], years = [], closures = [];
  y.soil = { month: inp => { months.push(inp.month); assert.equal(inp.T.length, n); assert.ok(inp.P.every(v => v >= 0)); }, closure: inp => closures.push(inp.live) };
  y.lakes = { year: inp => { years.push(inp.years); assert.ok(inp.runoff.some(v => v > 0)); }, closure: () => {} };
  for (let t = 0; t <= 3; t += 1 / 120) y.advance(t, 1);
  assert.ok(months.length >= 36 && months.length <= 37, `${months.length} months`);
  assert.ok(years.length === 3, `${years.length} years`);
  assert.ok(new Set(months).size === 12, 'every month of the calendar');
  const steps = y.steps;
  for (let t = 3; t <= 1e4; t += 50) y.advance(t, 3e3);
  assert.equal(y.steps, steps, 'outrun: no steps');
  assert.ok(closures.length > 0 && closures.every(v => v === 0), 'outrun: closures');
});
