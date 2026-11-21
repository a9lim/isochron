// The ice (src/engine/ice.js): Vialov's cap and its plug-flow limit, glacial erosion's budget, the ELRA bed by
// flexure, the calving law, and a marine front with its budget closed.
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildGrid } from '../src/grid/icosphere.js';
import { Ice, ICE, calveOf, frontRate } from '../src/engine/ice.js';
import { Flexure, flexuralLength, rigidity } from '../src/engine/flexure.js';
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
const withIce = (o, f) => { const keep = {}; for (const k in o) { keep[k] = ICE[k]; ICE[k] = o[k]; } try { return f(); } finally { Object.assign(ICE, keep); } };


test("a cap under uniform snowfall on a flat bed settles to Vialov's profile", () => {
  withIce({ LATENT: Infinity, TAU_BED: Infinity }, () => {
    const c = cap(5, { snow: 0.3 });
    c.ice.Cb.fill(0);                                // deformation alone
    run(c.ice, 400);
    const { H0, worst } = profileError(c, x => Math.pow(1 - Math.pow(x, 4 / 3), 3 / 8));
    assert.ok(H0 > 1500 && H0 < 6000 && worst < 0.08, `dome ${H0.toFixed(0)} m, profile off by ${(100 * worst).toFixed(1)}% of it`);
  });
});

// The profiles' oracles stand on a rigid bed: the bed holds (no load's response, TAU_BED infinite).
test("sliding alone, the plug-flow limit: Vialov's profile with the exponent 3/7", () => {
  withIce({ LATENT: Infinity, TAU_BED: Infinity }, () => {
    const c = cap(5, { soft: 1, gamma: 0 });
    run(c.ice, 300);
    const { H0, worst } = profileError(c, x => Math.pow(1 - Math.pow(x, 4 / 3), 3 / 7));
    // H₀ from H^{7/3} = (7/4) k L^{4/3}, k = (M / 2C(ρg)³)^{1/3}, with the cap's radius on the sphere.
    const k = Math.cbrt(0.3 / (2 * ICE.C_SOFT * RG ** 3)), Lm = 0.25 * R, want = Math.pow(1.75 * k * Lm ** (4 / 3), 3 / 7);
    const vialov = profileError(c, x => Math.pow(1 - Math.pow(x, 4 / 3), 3 / 8)).worst;
    assert.ok(Math.abs(H0 / want - 1) < 0.06, 'dome');
    assert.ok(worst < 0.04, 'profile');
  });
});

test('glacial erosion: its integral is its rate, rock is kept (eroded = till + debris), and the meltwater leaves at the margin', () => {
  const half = Float32Array.from(grid(5).pos.filter((_, k) => k % 3 === 0), x => x > 0 ? 1 : 0);   // soft where x > 0
  const c = cap(5, { soft: half }), ice = c.ice, A = ice.areaM;
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
  assert.ok(Math.abs(ero / want - 1) < 0.01, 'the integral is the rate');
  assert.ok(Math.abs(ero - till - (b1 - b0)) < 1e-6 * ero, 'rock kept');
  assert.ok(rim > 0.95 * till, 'till at the margin');
  assert.ok(Math.abs(out / snow - 1) < 0.02, 'meltwater');
});

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
  assert.ok(atTau < 0.01 && at30 < 0.002, 'relaxes to the plate');
  assert.ok(bulge > 5 && bulge < 20 && (rb - Lc) / alpha > 1.5 && (rb - Lc) / alpha < 2.7, 'forebulge');
  assert.ok(left < 0.02 * bulge && centre < 0.02 * wmax, 'collapses');
}));

test('the calving law: linear in depth and in the thermal forcing above a cold floor; nothing on land', () => {
  const f = calveOf(0), w = calveOf(ICE.TF_REF);
  assert.ok(Math.abs(w - ICE.CALVE) < 1e-12, 'at the reference forcing, Pelto and Warren\'s slope');
  assert.ok(Math.abs(f / w - ICE.TF_COLD / (ICE.TF_REF + ICE.TF_COLD)) < 1e-12 && calveOf(-3) === f, 'a freezing sea keeps the floor');
  assert.ok(Math.abs((calveOf(4) - calveOf(2)) - (calveOf(2) - calveOf(0))) < 1e-12, 'linear in the forcing');
  const a = 3e9, l = 0.577;
  const r1 = frontRate(w, -200, 1000, l, a), r2 = frontRate(w, -400, 1000, l, a);
  assert.ok(Math.abs(r2 / r1 - 2) < 1e-12, 'twice the depth, twice the ablation (thick ice)');
  const thin = frontRate(w, -400, 10, l, a), flot = frontRate(w, -400, ICE.RHO_W * 400 / ICE.RHO_I, l, a);
  assert.ok(Math.abs(thin / flot - 1) < 1e-12, 'a thin front ablates as the flotation thickness');
  assert.equal(frontRate(w, 50, 1000, l, a), 0, 'ice on land has no front in the water');
  // The speed at 300 m in Alaska's fjords' warmth: Pelto and Warren's 70 + 8.33 d less its intercept.
});

/** The scene: a cap of snow on land at the pole out to 0.30 rad, then a shelf `shelf` m deep to 0.5 rad, then the deep sea; no melt anywhere. */
function marginIce(shelf, tf, L = 6) {
  const g = buildGrid(L), n = g.n;
  const r = Float64Array.from({ length: n }, (_, i) => Math.acos(Math.min(1, g.pos[3 * i + 2])));
  const elev = Float32Array.from(r, v => v < 0.3 ? 0.5 : v < 0.5 ? -shelf / 1000 : -4);
  const tec = { grid: g, elev, seaLevel: 0, updateElevation() {} };
  const ice = new Ice(tec, { version: 0, tAt: () => 0, pAt: () => 0 });
  ice.mbVersion = 0;
  for (let i = 0; i < n; i++) { ice.M[i] = r[i] < 0.25 ? 0.3 : 0; ice.melt[i] = 0; }
  ice.Ts0.fill(-20); ice.setSoftness(new Float32Array(n));
  ice.cf.fill(calveOf(tf));
  return { g, n, r, ice };
}
function margin(shelf, tf, kyr = 40) {
  const { n, r, ice } = marginIce(shelf, tf, 5);
  let snow = 0, calved = 0, basal = 0;
  const V = () => ice.H.reduce((s, h, i) => s + h * ice.areaM[i], 0);
  for (let k = 0; k < kyr; k++) {
    const v0 = V();
    ice.advance(1000, 1e9);
    snow += ice.stats.snow * 1000; calved += ice.stats.calving * 1000; basal += (ice.stats.basal + ice.stats.melt) * 1000;
    if (k === kyr - 1) ice.dV = V() - v0;
  }
  // The front: the outermost ice, and the sea's area under grounded and floating ice.
  let front = 0, grounded = 0, floating = 0;
  for (let i = 0; i < n; i++) if (ice.H[i] > 0) {
    front = Math.max(front, r[i]);
    if (r[i] >= 0.3) { if (ice.H[i] * ICE.RHO_I >= -ice.bed(i) * ICE.RHO_W) grounded += ice.areaM[i]; else floating += ice.areaM[i]; }
  }
  const total = V();
  return { front, grounded: grounded / 1e12, floating: floating / 1e12, snow, calved, basal, total, dV: ice.dV };
}

test('a marine front: a cold sea lets it ground across a shelf; a warm sea or deep water holds it at the coast', () => {
  const cold = margin(200, 0), warm = margin(200, 5), deep = margin(1500, 0);
  for (const [name, m] of [['cold, 200 m shelf', cold], ['5 K, 200 m shelf', warm], ['cold, 1,500 m shelf', deep]]) {
  }
  assert.ok(cold.grounded > 1 && cold.front > warm.front, 'the cold front grounds out onto the shelf');
  assert.ok(warm.grounded === 0 && deep.grounded === 0, 'a warm sea or deep water holds the front at the coast');
  assert.ok(warm.total < cold.total && deep.total < cold.total);
  // The budget: what fell is calved, melted at the bed, or held (no surface melt; the cap started bare).
  for (const m of [cold, warm, deep]) assert.ok(Math.abs(m.snow - m.calved - m.basal - m.total) < 1e-3 * m.snow, `snow ${m.snow} against calving ${m.calved}, basal melt ${m.basal} and ice ${m.total}`);
});
