// Age cohorts (docs/MODEL.md): each cell's pyramid of one-year cohorts, riding the total that the
// people's demography solves exactly (src/engine/people.js, `demography`). The total keeps its own
// law; the pyramid is its shape, and it feeds two things back: aging (the crude death rate a cell's
// old people add, in place of the demography's closure on income) and the workers' share (each
// cell's people of working age, where the economy's labour reads it).
//
// Mortality by age (synthesis on Siler's three-part form, standard; its numbers from memory): the
// demography's crude deaths past senescence, d_ns (hunger, disease and density, famine), fall on all
// ages as μ₀ (1 + J e^{−a/T_JUV}), children most, with μ₀ set so the cell's crude rate is d_ns; and
// senescence, m_s S₀ e^{G (a − A_S)} (Gompertz's doubling every ~7 years), m_s = m^{M_SEN} medicine's
// reach into it (m the demography's medicine: 1 before industry, M_MIN rich; senescence falls by its
// square root, ~2× at the rich end, as old-age mortality has, from memory). A cell's aging, in its
// crude deaths, is m_s × its crude senescent rate past the pre-industrial reference's (births B_PRE,
// no growth: `reference`), so the pyramid's deaths are the total's. The rich end's life table sets
// replacement, the demography's B_MIN (`replacement`).
//
// Stepping: a step longer than T_STABLE (most of a lifetime) leaves only the stable population of
// its rates (Lotka's, standard: c(a) ∝ e^{−ra} l(a), the births and the growth the step's own),
// looked up in a table over births and growth; a shorter one ages the cohorts as a boxcar (all
// cells on one clock, cohorts moving on whole each time it passes a year, so steps of a month
// don't smear them: a cohort's ages are offset by under a year), its deaths by age along the way,
// its births into the youngest. Migrants come and go with a schedule of their own (mostly young adults, after Rogers
// and Castro's, from memory), so a frontier's settlers are young and the places they leave age.
export const COHORTS = {
  W: 1, K: 101,                    // years a cohort; cohorts (the last is 100 and over)
  J: 8, T_JUV: 3,                  // children's excess over adults' in d₀'s share, and its e-folding in age (yr): ~40% dead by five in the pre-industrial reference
  S0: 0.012, G: 0.1, A_S: 60,      // senescence: 1.2%/yr at sixty before medicine, doubling every ln 2/G ≈ 7 years
  T_STABLE: 60,                    // yr: a step this long or longer leaves the stable population
  WORK: [15, 65],                  // the working ages' cohorts, [15, 65)
  W_REF: 0.65,                     // the working-age share at which the economy's workers' share is its LFP (Earth's now, ~65%; from memory)
  // Migrants by age (after Rogers and Castro's schedule, from memory): children with their parents
  // (falling e-fold per 10 years), a labour peak about 24 (±8 years), a small working-age floor.
  MIG: a => 0.3 * Math.exp(-a / 10) + Math.exp(-(((a - 24) / 8) ** 2)) + (a < 60 ? 0.03 : 0),
};

const { W, K } = COHORTS;
// Each cohort's mean of the children's excess and of senescence over its ages (the last over 80–100).
const bin = (k, f) => { const a0 = W * k, a1 = k === K - 1 ? a0 + 10 : a0 + W, n = 20; let s = 0; for (let j = 0; j < n; j++) s += f(a0 + (j + 0.5) * (a1 - a0) / n); return s / n; };
const SHAPE = Float64Array.from({ length: K }, (_, k) => 1 + COHORTS.J * bin(k, a => Math.exp(-a / COHORTS.T_JUV)));
const SEN = Float64Array.from({ length: K }, (_, k) => COHORTS.S0 * bin(k, a => Math.exp(COHORTS.G * (a - COHORTS.A_S))));
const AGE_MID = Float64Array.from({ length: K }, (_, k) => W * k + W / 2);
const MIG = (() => { const m = Float64Array.from({ length: K }, (_, k) => bin(k, COHORTS.MIG)), s = m.reduce((a, b) => a + b, 0); return m.map(v => v / s); })();
export { SHAPE, SEN, MIG };

/**
 * The stable population at μ₀ (d₀'s level) and growth r: shares by cohort into `out`, and its crude
 * birth rate. Survivorship l(a) through each cohort's hazard μ₀ SHAPE + SEN; the last cohort holds
 * those surviving past 80 (its expected stay 1/μ).
 */
function stableAt(mu0, r, out, m = 1) {
  let l = 1, s = 0;
  for (let k = 0; k < K; k++) {
    const mu = mu0 * SHAPE[k] + m * SEN[k];
    const v = k < K - 1 ? l * (1 - Math.exp(-mu * W)) / mu * Math.exp(-r * (AGE_MID[k])) : l / (mu + r) * Math.exp(-r * W * k);
    out[k] = v; s += v;
    l *= Math.exp(-mu * W);
  }
  for (let k = 0; k < K; k++) out[k] /= s;
  return 1 / s;   // births per person a year: the newborns' density at age 0 over the whole
}

/** The stable population with crude births b and growth r (Lotka's), senescence × m: μ₀ by bisection; shares into `out`. */
export function stable(b, r, out = new Float64Array(K), m = 1) {
  let lo = 0, hi = 0.5;
  for (let it = 0; it < 40; it++) { const x = 0.5 * (lo + hi); if (stableAt(x, r, out, m) < b) lo = x; else hi = x; }
  stableAt(0.5 * (lo + hi), r, out, m);
  return out;
}

/** The crude senescent rate of a pyramid. */
export const senescent = c => { let s = 0; for (let k = 0; k < K; k++) s += c[k] * SEN[k]; return s; };
/** The working-age share. */
export const working = c => { let s = 0; for (let k = COHORTS.WORK[0]; k < COHORTS.WORK[1]; k++) s += c[k]; return s; };

/** The pre-industrial reference (births B_PRE, no growth): its crude senescent rate, which the demography's D_LO and B_PRE already hold. */
export function reference(P) { return { sen: senescent(stable(P.B_PRE, 0)) }; }

/**
 * Replacement: the crude birth rate of the rich end's stationary population: its deaths past
 * senescence M_MIN D_LO less the reference's senescence (× m_s) on all ages, and m_s × senescence by
 * age (μ₀ by bisection).
 */
export function replacement(P) {
  const ref = reference(P).sen, ms = Math.pow(P.M_MIN, P.M_SEN), dns = P.M_MIN * P.D_LO - ms * ref, c = new Float64Array(K);
  let lo = 0, hi = 0.5, b = 0;
  for (let it = 0; it < 60; it++) {
    const x = 0.5 * (lo + hi); b = stableAt(x, 0, c, ms);
    let ns = 0; for (let k = 0; k < K; k++) ns += c[k] * x * SHAPE[k];
    if (ns < dns) lo = x; else hi = x;
  }
  return b;
}

// The stable table over births and growth (bilinear), built once.
const TB = { b0: 0.005, b1: 0.06, nb: 23, r0: -0.04, r1: 0.04, nr: 33 };
let TABLE = null;
function table() {
  if (TABLE) return TABLE;
  TABLE = new Float64Array(TB.nb * TB.nr * K);
  const tmp = new Float64Array(K);
  for (let i = 0; i < TB.nb; i++) for (let j = 0; j < TB.nr; j++) {
    const b = TB.b0 + (TB.b1 - TB.b0) * i / (TB.nb - 1), r = TB.r0 + (TB.r1 - TB.r0) * j / (TB.nr - 1);
    stable(b, Math.min(r, 0.9 * b), tmp);
    TABLE.set(tmp, (i * TB.nr + j) * K);
  }
  return TABLE;
}
/** The stable shares at births b and growth r, from the table, into `out` (offset `o`). */
export function stableLookup(b, r, out, o = 0) {
  const T = table();
  const x = Math.min(TB.nb - 1.0001, Math.max(0, (b - TB.b0) / (TB.b1 - TB.b0) * (TB.nb - 1)));
  const y = Math.min(TB.nr - 1.0001, Math.max(0, (r - TB.r0) / (TB.r1 - TB.r0) * (TB.nr - 1)));
  const i = Math.floor(x), j = Math.floor(y), fx = x - i, fy = y - j;
  const a = (i * TB.nr + j) * K, bq = ((i + 1) * TB.nr + j) * K, cq = (i * TB.nr + j + 1) * K, d = ((i + 1) * TB.nr + j + 1) * K;
  let s = 0;
  for (let k = 0; k < K; k++) {
    const v = (1 - fx) * (1 - fy) * T[a + k] + fx * (1 - fy) * T[bq + k] + (1 - fx) * fy * T[cq + k] + fx * fy * T[d + k];
    out[o + k] = v; s += v;
  }
  for (let k = 0; k < K; k++) out[o + k] /= s;
}

let MIGT = null;
/**
 * The migrants' age weight of the stable population at births b and growth r, Σ c(a) MIG(a) (MIG sums to 1):
 * `stableLookup`'s table, each entry weighted once, bilinear between. A pyramid's own weight against it is its
 * bulge of those of an age to migrate (People.diffuse: the emigration hump), 1 for any population at its rates.
 */
export function stableMig(b, r) {
  const T = table();
  if (!MIGT) {
    MIGT = new Float64Array(TB.nb * TB.nr);
    for (let q = 0; q < TB.nb * TB.nr; q++) { let s = 0, w = 0; for (let k = 0; k < K; k++) { s += T[q * K + k]; w += T[q * K + k] * MIG[k]; } MIGT[q] = w / s; }
  }
  const x = Math.min(TB.nb - 1.0001, Math.max(0, (b - TB.b0) / (TB.b1 - TB.b0) * (TB.nb - 1)));
  const y = Math.min(TB.nr - 1.0001, Math.max(0, (r - TB.r0) / (TB.r1 - TB.r0) * (TB.nr - 1)));
  const i = Math.floor(x), j = Math.floor(y), fx = x - i, fy = y - j;
  return (1 - fx) * (1 - fy) * MIGT[i * TB.nr + j] + fx * (1 - fy) * MIGT[(i + 1) * TB.nr + j] + (1 - fx) * fy * MIGT[i * TB.nr + j + 1] + fx * fy * MIGT[(i + 1) * TB.nr + j + 1];
}

/**
 * The cohorts' clock (all cells age together): a step of dt years from a clock at `clock` (years
 * into the current cohort's span) moves every cohort on by `shift` whole cohorts. A boxcar: cohorts
 * move only whole, so short steps don't smear them. Returns [shift, the clock after].
 */
export function ageClock(clock, dt) { const t = clock + dt, shift = Math.floor(t / W); return [shift, t - shift * W]; }

// The children's excess and senescence integrated from birth to age x (cohorts), for the step's tables.
const CSH = new Float64Array(K + 1), CSE = new Float64Array(K + 1);
for (let k = 0; k < K; k++) { CSH[k + 1] = CSH[k] + SHAPE[k] * W; CSE[k + 1] = CSE[k] + SEN[k] * W; }
const cumAt = (C, R, x) => { if (x >= K) return C[K] + (x - K) * R[K - 1] * W; const i = Math.floor(x); return C[i] + (x - i) * R[i] * W; };
const YOUNG = 20;   // cohorts past this are adults: their share of d₀ is μ₀ alone (the children's excess under 1%)

/**
 * The step's tables, the same for every cell (a step of dt years moving the cohorts on by `shift`):
 * for each cohort the children's excess and senescence integrated over the ages it passes, and for
 * the births by their ages at the step's end, the same from birth.
 */
const ML = { lo: 0.2, n: 17 };   // medicine's levels for the senescence tables: m from 0.2 to 1, lerped between
export function stepTables(dt, shift, T = {}) {
  if (!T.a) { T.a = new Float64Array(K); T.s = new Float64Array(K); T.ba = new Float64Array(K); T.bs = new Float64Array(K); T.bw = new Float64Array(K); T.e = new Float64Array(ML.n * K); T.be = new Float64Array(ML.n * K); }
  for (let k = 0; k < K; k++) {
    const a0 = (k + 0.5) * W;
    T.a[k] = k === K - 1 ? SHAPE[K - 1] * dt : cumAt(CSH, SHAPE, (a0 + dt) / W) - cumAt(CSH, SHAPE, a0 / W);
    T.s[k] = k === K - 1 ? SEN[K - 1] * dt : cumAt(CSE, SEN, (a0 + dt) / W) - cumAt(CSE, SEN, a0 / W);
  }
  let nb = 0;
  for (let k = 0; k * W < dt && k < K; k++) {
    const lo = k * W, hi = Math.min(dt, lo + W), x = 0.5 * (lo + hi) / W;
    T.bw[k] = hi - lo; T.ba[k] = cumAt(CSH, SHAPE, x); T.bs[k] = cumAt(CSE, SEN, x); nb = k + 1;
  }
  // Senescence's survival at each of medicine's levels.
  for (let l = 0; l < ML.n; l++) {
    const m = ML.lo + (1 - ML.lo) * l / (ML.n - 1);
    for (let k = 0; k < K; k++) T.e[l * K + k] = Math.exp(-m * T.s[k]);
    for (let k = 0; k < nb; k++) T.be[l * K + k] = Math.exp(-m * T.bs[k]);
  }
  T.nb = nb; T.dt = dt; T.shift = shift;
  return T;
}

/**
 * One step of a cell's pyramid (shares at `o` in `c`): crude births b and crude deaths past
 * senescence d_ns (each per person a year, the step's), medicine m (senescence × m), and the step's
 * growth r (for a step past T_STABLE: the stable population, at m = 1, before industry); the survivors move on `shift` whole cohorts (`ageClock`), the
 * step's births sit by their ages. `T` is the step's tables (`stepTables`); `tmp` K values. The
 * shares are left unnormalized: returns their sum, which `settle` divides out.
 */
export function stepPyramid(c, o, b, dns, m, r, T, tmp) {
  const dt = T.dt, shift = T.shift;
  if (dt >= COHORTS.T_STABLE) { stableLookup(b, r, c, o); return 1; }
  let cs = 1;   // Σ c SHAPE, the shares summing to one and SHAPE one past the young
  for (let k = 0; k < YOUNG; k++) cs += c[o + k] * (SHAPE[k] - 1);
  const mu0 = cs > 0 ? Math.max(0, dns) / cs : 0, adult = Math.exp(-mu0 * dt);
  // Medicine's level: the two tables either side, lerped.
  const x = Math.min(ML.n - 1.0001, Math.max(0, (m - ML.lo) / (1 - ML.lo) * (ML.n - 1))), l = Math.floor(x), f = x - l, e0 = l * K, e1 = e0 + K, E = T.e, BE = T.be;
  tmp.fill(0);
  for (let k = 0; k < K; k++) {
    const v = c[o + k];
    if (!(v > 0)) continue;
    tmp[Math.min(K - 1, k + shift)] += v * (k < YOUNG ? Math.exp(-mu0 * T.a[k]) : adult) * (E[e0 + k] + f * (E[e1 + k] - E[e0 + k]));
  }
  if (b > 0) for (let k = 0; k < T.nb; k++) tmp[k] += b * T.bw[k] * Math.exp(-mu0 * T.ba[k]) * (BE[e0 + k] + f * (BE[e1 + k] - BE[e0 + k]));
  let sum = 0;
  for (let k = 0; k < K; k++) { c[o + k] = tmp[k]; sum += tmp[k]; }
  return sum > 0 ? sum : 1;
}

/**
 * After the step's spread: a cell's shares normalized (their sum `sum` from `stepPyramid`), net
 * migrants mixed in by their schedule (N people before, dN moving, in when positive), and its
 * crude senescent rate and working-age share read, into `out` ({ sen, work }).
 */
export function settle(c, o, sum, N, dN, out) {
  const inv = sum > 0 && Number.isFinite(sum) ? 1 / sum : 1, w0 = COHORTS.WORK[0], w1 = COHORTS.WORK[1];
  let sen = 0, work = 0, tot = 0;
  // By mass: the stayers' cohorts and the migrants' (out where dN < 0), renormalized; none left, the migrants'.
  const Ns = N > 0 ? N : 0, mv = Math.abs(dN) > 1e-12 ? dN : 0;
  for (let k = 0; k < K; k++) { const v = Math.max(0, Ns * c[o + k] * inv + mv * MIG[k]); c[o + k] = v; tot += v; }
  if (tot > 0 && Number.isFinite(tot)) { const r = 1 / tot; for (let k = 0; k < K; k++) c[o + k] *= r; }
  else for (let k = 0; k < K; k++) c[o + k] = MIG[k];
  for (let k = 0; k < K; k++) { const v = c[o + k]; sen += v * SEN[k]; if (k >= w0 && k < w1) work += v; }
  out.sen = sen; out.work = work;
  return out;
}
