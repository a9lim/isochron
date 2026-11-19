// Phase 7's ice that carves (src/engine/ice.js): sliding on a thawed bed against
// Vialov's profile and its plug-flow limit, the explicit step's stability with
// sliding, a frozen bed that doesn't slide, glacial erosion's budget (eroded =
// till + debris, outwash = the accumulation), and the ELRA bed by flexure (its
// relaxation, the forebulge, and its collapse).
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildGrid } from '../src/grid/icosphere.js';
import { Ice, ICE } from '../src/engine/ice.js';
import { Flexure, flexuralLength, rigidity } from '../src/engine/flexure.js';

const say = (...a) => console.log('  ', ...a);
const R = 6.371e6, RG = ICE.RHO_I * ICE.G;
const grids = [];
const grid = L => { for (let l = 1; l <= L; l++) grids[l] ||= buildGrid(l); return grids[L]; };

/** A cap under uniform snowfall on a flat bed 500 m up, all melting outside; the bed's inputs by hand. */
function cap(L, { radius = 0.25, snow = 0.3, Ts0 = 5, geo = ICE.GEO, soft = 0, gamma = null, flex = null } = {}) {
  const g = grid(L), n = g.n;
  const tec = { grid: g, elev: new Float32Array(n).fill(0.5), seaLevel: 0, updateElevation() {} };
  const ice = new Ice(tec, { version: 0, tAt: () => 0, pAt: () => 0 });
  ice.mbVersion = 0;                                  // the mass balance is set by hand
  const r = Float64Array.from({ length: n }, (_, i) => Math.acos(Math.min(1, g.pos[3 * i + 2])));
  for (let i = 0; i < n; i++) {
    ice.M[i] = r[i] < radius ? snow : -50;
    ice.melt[i] = r[i] < radius ? 0 : 50;
  }
  ice.Ts0.fill(Ts0); ice.geo.fill(geo);
  ice.setSoftness(typeof soft === 'number' ? new Float32Array(n).fill(soft) : soft);
  if (gamma !== null) ice.Gamma = gamma;
  if (flex) ice.attachFlexure(new Flexure(g, { have: grids.filter(Boolean) }), flex);
  return { g, n, tec, ice, r };
}
const run = (ice, kyr, step = 1000) => { for (let k = 0; k < kyr * 1000 / step; k++) ice.advance(step, 1e9); };
/** The worst error of H/H₀ against a normalized profile, inside 0.8 of the radius. */
function profileError({ ice, r, n }, prof, radius = 0.25) {
  const H0 = Math.max(...ice.H);
  let worst = 0;
  for (let i = 0; i < n; i++) if (r[i] <= 0.8 * radius) worst = Math.max(worst, Math.abs(ice.H[i] / H0 - prof(r[i] / radius)));
  return { H0, worst };
}
/** The steady axisymmetric profile for flux (Γ H⁵ + C' H⁴)|s'|³ = M r/2, integrated in H from the margin inward. */
function steady1D(gamma, Cp, M, Lm) {
  const pts = [[Lm, 0]];
  let rr = Lm, H = 0;
  const dr = (H, rr) => -Math.cbrt(2 * (gamma * H ** 5 + Cp * H ** 4) / (M * Math.max(rr, 1)));   // dr/dH
  const dH = 0.5;
  while (rr > 0) {
    const k1 = dr(H, rr), k2 = dr(H + dH / 2, rr + k1 * dH / 2), k3 = dr(H + dH / 2, rr + k2 * dH / 2), k4 = dr(H + dH, rr + k3 * dH);
    rr += dH * (k1 + 2 * k2 + 2 * k3 + k4) / 6; H += dH;
    pts.push([rr, H]);
  }
  const H0 = H;
  return Object.assign(x => {           // H/H₀ at r = x·Lm
    const v = x * Lm;
    for (let k = 1; k < pts.length; k++) if (pts[k][0] <= v) { const [r1, h1] = pts[k - 1], [r2, h2] = pts[k]; return (h1 + (h2 - h1) * (v - r1) / (r2 - r1)) / H0; }
    return 1;
  }, { H0 });
}
const withIce = (o, f) => { const keep = {}; for (const k in o) { keep[k] = ICE[k]; ICE[k] = o[k]; } try { return f(); } finally { Object.assign(ICE, keep); } };

// The profiles' oracles stand on a rigid bed: the bed holds (no load's response, TAU_BED infinite).
test("sliding alone, the plug-flow limit: Vialov's profile with the exponent 3/7", () => {
  withIce({ LATENT: Infinity, TAU_BED: Infinity }, () => {
    const c = cap(6, { soft: 1, gamma: 0 });
    run(c.ice, 300);
    const { H0, worst } = profileError(c, x => Math.pow(1 - Math.pow(x, 4 / 3), 3 / 7));
    // H₀ from H^{7/3} = (7/4) k L^{4/3}, k = (M / 2C(ρg)³)^{1/3}, with the cap's radius on the sphere.
    const k = Math.cbrt(0.3 / (2 * ICE.C_SOFT * RG ** 3)), Lm = 0.25 * R, want = Math.pow(1.75 * k * Lm ** (4 / 3), 3 / 7);
    const vialov = profileError(c, x => Math.pow(1 - Math.pow(x, 4 / 3), 3 / 8)).worst;
    say(`plug flow, level 6: dome ${H0.toFixed(0)} m (analytic ${want.toFixed(0)}), profile off by ${(100 * worst).toFixed(1)}% of the dome (Vialov's 3/8 shape: ${(100 * vialov).toFixed(1)}%); thawed share ${c.ice.stats.thawed.toFixed(3)}`);
    assert.ok(Math.abs(H0 / want - 1) < 0.06, 'dome');
    assert.ok(worst < 0.04, 'profile');
  });
});

test('deformation and sliding together: the steady profile of a fine 1-D solve', () => {
  withIce({ LATENT: Infinity, TAU_BED: Infinity }, () => {
    const g0 = new Ice({ grid: grid(6), elev: new Float32Array(grid(6).n) }, {}).Gamma;
    for (const ratio of [0.5, 2]) {
      // Sliding's flux against deformation's at 2 km: C (ρg)³ H⁴ against Γ H⁵.
      const C = ratio * g0 * 2000 / RG ** 3, soft = Math.log(C / ICE.C_HARD) / Math.log(ICE.C_SOFT / ICE.C_HARD);
      const c = cap(6, { soft });
      run(c.ice, 300);
      const ref = steady1D(g0, C * RG ** 3, 0.3, 0.25 * R);
      const { H0, worst } = profileError(c, ref);
      say(`sliding ${ratio}× deformation at 2 km: dome ${H0.toFixed(0)} m (1-D ${ref.H0.toFixed(0)}), profile off the 1-D solve by ${(100 * worst).toFixed(1)}% of the dome; sliding speed mean ${c.ice.stats.sliding.toFixed(1)} m/yr`);
      assert.ok(worst < 0.04, 'profile');
      assert.ok(Math.abs(H0 / ref.H0 - 1) < 0.04, 'dome');
    }
  });
});

test('the explicit step with sliding: stable at its limit, and the limit binds', () => {
  withIce({ LATENT: Infinity }, () => {
    // 20 kyr from bare ground on soft till; roughness is the worst departure of a cell from its neighbours' mean.
    const grow = (coef, soft = 1) => withIce({ STEP_C: 0.12 * coef }, () => {
      const c = cap(6, { soft }), g = c.g;
      let dtMin = Infinity;
      const step = c.ice.step.bind(c.ice);
      c.ice.step = dt => { const d = step(dt); if (d < dt) dtMin = Math.min(dtMin, d); return d; };
      run(c.ice, 20);
      const H = c.ice.H, H0 = H.reduce((m, v) => Math.max(m, v), 0);
      let rough = 0;
      for (let i = 0; i < c.n; i++) {
        if (!(c.r[i] < 0.2)) continue;
        let m = 0;
        for (let t = g.nbrOff[i]; t < g.nbrOff[i + 1]; t++) m += H[g.nbr[t]] / (g.nbrOff[i + 1] - g.nbrOff[i]);
        rough = Math.max(rough, Math.abs(H[i] - m) / H0);
      }
      return { H: Float64Array.from(H), H0, dtMin, rough };
    });
    const hard = grow(1, 0), ref = grow(0.25), one = grow(1), eight = grow(8);
    const off = a => { let d = 0; for (let i = 0; i < a.H.length; i++) d = Math.max(d, Math.abs(a.H[i] - ref.H[i])); return d / ref.H0; };
    say(`the step at its limit (level 6): ${hard.dtMin.toFixed(1)} yr on hard rock, ${one.dtMin.toFixed(1)} yr on soft till; after 20 kyr on soft till, ` +
      `off a quarter-step run by ${(100 * off(one)).toFixed(2)}% of the dome (roughness ${one.rough.toFixed(4)} against ${ref.rough.toFixed(4)}); ` +
      `with 8× the step (${Math.min(ICE.MAX_STEP, 8 * one.dtMin).toFixed(0)} yr), ${(100 * off(eight)).toFixed(1)}% and roughness ${eight.rough.toFixed(4)}`);
    assert.ok(off(one) < 0.005 && one.rough < 1.05 * ref.rough, 'stable at the limit');
    assert.ok(off(eight) > 0.02 && eight.rough > 2 * ref.rough, 'the limit binds');
  });
});

test("a frozen bed doesn't slide; a thawed one does", () => {
  // A thin cap under light snow (the bed's conduction warms ~19–38 K a km).
  const o = { radius: 0.12, snow: 0.02, soft: 1 };
  const cold = cap(6, { ...o, Ts0: -45, geo: 0.04 }), warm = cap(6, { ...o, Ts0: 0, geo: 0.08 }), none = cap(6, { ...o, Ts0: -45, geo: 0.04 });
  none.ice.Cb.fill(0);
  for (const c of [cold, warm, none]) run(c.ice, 200);
  const maxOf = a => a.reduce((m, v) => Math.max(m, v), -Infinity);
  let d = 0;
  for (let i = 0; i < cold.n; i++) d = Math.max(d, Math.abs(cold.ice.H[i] - none.ice.H[i]));
  const tb = Float32Array.from(cold.ice.Tb).filter((_, i) => cold.ice.H[i] > 0);
  say(`frozen: dome ${maxOf(cold.ice.H).toFixed(0)} m, bed ${maxOf(tb).toFixed(1)} °C at the warmest, thawed share ${cold.ice.stats.thawed.toExponential(1)}, ` +
    `sliding ${maxOf(cold.ice.ub).toExponential(1)} m/yr at most, off the no-sliding cap by ${d.toFixed(4)} m; thawed: dome ${maxOf(warm.ice.H).toFixed(0)} m, ` +
    `share ${warm.ice.stats.thawed.toFixed(2)}, sliding to ${maxOf(warm.ice.ub).toFixed(0)} m/yr`);
  assert.ok(maxOf(cold.ice.ub) < 1e-3 && d < 1e-3 * maxOf(none.ice.H), 'frozen');
  assert.ok(warm.ice.stats.thawed > 0.9 && maxOf(warm.ice.ub) > 10 && maxOf(warm.ice.H) < 0.8 * maxOf(cold.ice.H), 'thawed');
});

test('glacial erosion: its integral is its rate, rock is kept (eroded = till + debris), and the meltwater leaves at the margin', () => {
  const half = Float32Array.from(grid(6).pos.filter((_, k) => k % 3 === 0), x => x > 0 ? 1 : 0);   // soft where x > 0
  const c = cap(6, { soft: half }), ice = c.ice, A = ice.areaM;
  run(ice, 300);
  ice.takeGlacial();
  const rate = Float64Array.from(ice.ub, u => ICE.KG * u);
  const b0 = ice.debris.reduce((s, v, i) => s + v * A[i], 0);
  const Y = 20000;
  run(ice, Y / 1000, 500);
  const got = ice.takeGlacial();
  let ero = 0, want = 0, till = 0, rim = 0, out = 0, snow = 0;
  for (let i = 0; i < c.n; i++) {
    ero += got.eroded[i] * A[i]; want += rate[i] * Y * A[i]; till += got.till[i] * A[i]; out += got.outwash[i];
    if (c.r[i] > 0.9 * 0.25) rim += got.till[i] * A[i];
    if (c.r[i] < 0.25) snow += 0.3 * A[i] * Y * ICE.RHO_I / ICE.RHO_W;
  }
  const b1 = ice.debris.reduce((s, v, i) => s + v * A[i], 0);
  say(`erosion over ${Y / 1000} kyr: ${(ero / 1e9).toFixed(2)} km³ against its rate's ${(want / 1e9).toFixed(2)}; till ${(till / 1e9).toFixed(2)} km³ ` +
    `(${(100 * rim / till).toFixed(1)}% at the rim), debris ${(b0 / 1e9).toFixed(2)} → ${(b1 / 1e9).toFixed(2)} km³, budget off by ${((ero - till - (b1 - b0)) / ero).toExponential(1)}; ` +
    `outwash ${(out / 1e12).toFixed(2)} thousand km³ against the snow's ${(snow / 1e12).toFixed(2)}`);
  assert.ok(Math.abs(ero / want - 1) < 0.01, 'the integral is the rate');
  assert.ok(Math.abs(ero - till - (b1 - b0)) < 1e-6 * ero, 'rock kept');
  assert.ok(rim > 0.95 * till, 'till at the margin');
  assert.ok(Math.abs(out / snow - 1) < 0.02, 'meltwater');
});

test("the bed sinks with its load between the crust's re-solves", () => withIce({ LATENT: Infinity }, () => {
  // The cap's crust never re-solves its elevation (updateElevation does nothing), as the planet's waits
  // for the sea to have moved: the elevation, and so the bed the ice steps on, takes the load all the same.
  const c = cap(5), RM = ICE.RHO_I / ICE.RHO_M;
  run(c.ice, 30);
  let worst = 0, Hd = 0, bedD = 0;
  for (let i = 0; i < c.n; i++) {
    worst = Math.max(worst, Math.abs(c.tec.elev[i] - 0.5 - c.ice.w[i] / 1000));
    if (c.ice.H[i] > Hd) { Hd = c.ice.H[i]; bedD = c.ice.bed(i); }
  }
  say(`after 30 kyr: the elevation off the load by ${(1e6 * worst).toFixed(2)} mm at worst; under the ${Hd.toFixed(0)} m dome the bed at ${bedD.toFixed(0)} m (local isostasy ${(500 - RM * Hd).toFixed(0)})`);
  assert.ok(worst < 1e-5, 'the elevation carries the load');
  assert.ok(Math.abs(bedD - (500 - RM * Hd)) < 0.05 * RM * Hd, 'the bed under the dome near its isostatic depth');
}));

test('the ELRA bed by flexure: relaxes over 3 kyr to the plate, a forebulge beyond the margin, and its collapse', () => withIce({ LATENT: Infinity }, () => {
  const L = 7, te = 90, H0 = 3000, Lc = 1.2e6, alpha = flexuralLength(rigidity(te));
  const c = cap(L, { gamma: 0, flex: { Te: new Float32Array(grid(L).n).fill(te) } }), ice = c.ice, n = c.n;
  ice.Cb.fill(0); ice.M.fill(0); ice.melt.fill(0);                 // a load held still
  for (let i = 0; i < n; i++) { const v = c.r[i] * R; ice.H[i] = v < Lc ? H0 * (1 - (v / Lc) ** (4 / 3)) ** (3 / 8) : 0; }
  const F = new Flexure(c.g, { have: grids.filter(Boolean) });
  const weq = Float64Array.from(F.solve(Float64Array.from(ice.H, h => RG * h), new Float64Array(n).fill(te), { tol: 1e-9, warm: false }));
  const wmax = weq.reduce((m, v) => Math.max(m, v), 0);
  const off = (frac) => { let d = 0; for (let i = 0; i < n; i++) d = Math.max(d, Math.abs(ice.w[i] + frac * weq[i])); return d / wmax; };
  run(ice, 3);
  const atTau = off(1 - Math.exp(-1));
  run(ice, 27);
  const at30 = off(1 - Math.exp(-10));
  let bulge = 0, rb = 0;
  for (let i = 0; i < n; i++) if (c.r[i] * R > Lc && ice.w[i] > bulge) { bulge = ice.w[i]; rb = c.r[i] * R; }
  ice.H.fill(0);
  run(ice, 15);
  let left = 0;
  for (let i = 0; i < n; i++) if (c.r[i] * R > Lc) left = Math.max(left, ice.w[i]);
  const centre = -ice.w.reduce((m, v) => Math.min(m, v), 0);
  say(`ELRA, Tₑ ${te} km (α ${(alpha / 1e3).toFixed(0)} km), level ${L}: at τ off (1 − 1/e)·w_eq by ${(100 * atTau).toFixed(2)}% of its peak, at 10τ by ${(100 * at30).toFixed(3)}%; ` +
    `forebulge ${bulge.toFixed(1)} m at ${((rb - Lc) / alpha).toFixed(2)} α beyond the margin; 15 kyr after the ice is gone, ${left.toFixed(2)} m of it left and ${centre.toFixed(1)} m of the ${wmax.toFixed(0)} m depression`);
  assert.ok(atTau < 0.01 && at30 < 0.002, 'relaxes to the plate');
  assert.ok(bulge > 5 && bulge < 20 && (rb - Lc) / alpha > 1.5 && (rb - Lc) / alpha < 2.7, 'forebulge');
  assert.ok(left < 0.02 * bulge && centre < 0.02 * wmax, 'collapses');
}));
