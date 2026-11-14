import { stream } from '../rng.js';
// The orbit and the sunlight it delivers (docs/PLAN.md, layers 4 and 5).
//
// Daily-mean insolation at latitude φ when the sun is at true longitude λ
// (measured from the northern spring equinox), for obliquity ε, eccentricity
// e and the longitude of perihelion ϖ (the sun's longitude at perihelion):
//   sin δ = sin ε sin λ                        declination
//   cos h₀ = −tan φ tan δ                      sunset hour angle (clamped)
//   (a/r)  = (1 + e cos(λ − ϖ)) / (1 − e²)     distance factor
//   Q = (S/π) (a/r)² (h₀ sin φ sin δ + cos φ cos δ sin h₀)
// (standard; Berger's formula). The calendar is tied to the equinox, as
// Earth's tropical year is: year phase 0 is the northern spring equinox, and
// time runs uniformly in mean anomaly, so the seasons' lengths follow Kepler.

export const EARTH_ORBIT = { e: 0.0167, obliquity: 23.44 * Math.PI / 180, perihelion: 283 * Math.PI / 180 };
export const S0 = 1361;   // W/m², the stellar flux at 1 AU today

/** Daily-mean insolation (W/m²) at latitude phi (rad) for solar longitude lam. */
export function insolation(phi, lam, orbit, S = S0) {
  const sd = Math.sin(orbit.obliquity) * Math.sin(lam);
  const cd = Math.sqrt(1 - sd * sd);
  const sp = Math.sin(phi), cp = Math.cos(phi);
  let ch = cp > 1e-9 && cd > 1e-9 ? -(sp * sd) / (cp * cd) : (sp * sd > 0 ? -1 : 1);
  ch = Math.max(-1, Math.min(1, ch));
  const h0 = Math.acos(ch);
  const rf = (1 + orbit.e * Math.cos(lam - orbit.perihelion)) / (1 - orbit.e * orbit.e);
  return (S / Math.PI) * rf * rf * (h0 * sp * sd + cp * cd * Math.sin(h0));
}

/** True anomaly from mean anomaly (Kepler's equation by Newton). */
function trueAnomaly(M, e) {
  let E = M + e * Math.sin(M);
  for (let k = 0; k < 6; k++) E -= (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
  return 2 * Math.atan2(Math.sqrt(1 + e) * Math.sin(E / 2), Math.sqrt(1 - e) * Math.cos(E / 2));
}

/** The sun's true longitude at year phase τ ∈ [0, 1), τ = 0 at the spring equinox. */
export function solarLongitude(tau, orbit) {
  const e = orbit.e, nu0 = -orbit.perihelion;   // true anomaly at the equinox (λ = 0)
  const E0 = 2 * Math.atan2(Math.sqrt(1 - e) * Math.sin(nu0 / 2), Math.sqrt(1 + e) * Math.cos(nu0 / 2));
  const M0 = E0 - e * Math.sin(E0);
  return trueAnomaly(M0 + 2 * Math.PI * tau, e) + orbit.perihelion;
}

/**
 * The year's insolation as harmonics, on a table of latitudes: for each
 * latitude, the mean and the complex coefficients of harmonics 1..H, so that
 * Q(τ) = Q̄ + Σ_k Re(Q̂_k e^{2πikτ}). Sampled at `samples` phases of the year.
 */
export function insolationTable(orbit, S = S0, nLat = 181, H = 2, samples = 48) {
  const mean = new Float64Array(nLat);
  const re = new Float64Array(nLat * H), im = new Float64Array(nLat * H);
  const lam = new Float64Array(samples);
  for (let s = 0; s < samples; s++) lam[s] = solarLongitude(s / samples, orbit);
  for (let l = 0; l < nLat; l++) {
    const phi = -Math.PI / 2 + Math.PI * l / (nLat - 1);
    let m = 0;
    const q = new Float64Array(samples);
    for (let s = 0; s < samples; s++) { q[s] = insolation(phi, lam[s], orbit, S); m += q[s]; }
    mean[l] = m / samples;
    for (let k = 1; k <= H; k++) {
      let a = 0, b = 0;
      for (let s = 0; s < samples; s++) {
        const th = 2 * Math.PI * k * s / samples;
        a += q[s] * Math.cos(th); b -= q[s] * Math.sin(th);
      }
      re[l * H + k - 1] = 2 * a / samples; im[l * H + k - 1] = 2 * b / samples;
    }
  }
  return { nLat, H, mean, re, im };
}

/** Interpolate the table at latitude phi: { mean, re[H], im[H] }. */
export function insolationAt(table, phi, out) {
  const { nLat, H, mean, re, im } = table;
  const x = (phi + Math.PI / 2) / Math.PI * (nLat - 1);
  const l = Math.max(0, Math.min(nLat - 2, Math.floor(x))), w = x - l;
  out.mean = mean[l] * (1 - w) + mean[l + 1] * w;
  for (let k = 0; k < H; k++) {
    out.re[k] = re[l * H + k] * (1 - w) + re[(l + 1) * H + k] * w;
    out.im[k] = im[l * H + k] * (1 - w) + im[(l + 1) * H + k] * w;
  }
  return out;
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
/** The month at year phase τ (the equinox falls on 20 March). */
export function monthName(tau) {
  const day = ((tau * 365.2422 + 78.5) % 365.2422 + 365.2422) % 365.2422;
  const ends = [31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334, 365.25];
  let m = 0;
  while (m < 11 && day >= ends[m]) m++;
  return MONTHS[m];
}
/** Where year phase τ falls between the months' middles: the month i (0 = January) and the share f toward the next. */
export function monthAt(tau) {
  const mid = [15.5, 45, 74.5, 105, 135.5, 166, 196.5, 227.5, 258, 288.5, 319, 349.5];
  const day = ((tau * 365.2422 + 78.5) % 365.2422 + 365.2422) % 365.2422;
  let i = 11;
  for (let m = 0; m < 12; m++) if (day >= mid[m]) i = m;
  const a = mid[i], b = i === 11 ? mid[0] + 365.2422 : mid[i + 1], d = day < a ? day + 365.2422 : day;
  return { i, f: (d - a) / (b - a) };
}
/** Year phase at the middle of month m (0 = January). */
export function monthPhase(m) {
  const mid = [15.5, 45, 74.5, 105, 135.5, 166, 196.5, 227.5, 258, 288.5, 319, 349.5][m];
  return ((mid - 78.5) / 365.2422 + 1) % 1;
}

// ── The orbit's cycles (docs/PLAN.md, layer 5) ──
// The planet's own Milankovitch cycles, seeded: eccentricity near 405, 124 and
// 95 kyr, obliquity near 41 and 54 kyr, and the perihelion's precession near
// 22 kyr relative to the equinox (Earth's periods and amplitudes, from memory,
// each jittered by the seed). The climate sees the orbit averaged over a
// window W: each periodic term of period P is scaled by sinc(W/P), so at plate
// speed the cycles average out and at a few kyr a second they come through
// whole. Times in kyr.
export class OrbitCycles {
  constructor(seed) {
    const r = stream(seed, 'orbit');
    const jit = (v, f) => v * (1 + f * (2 * r.uniform() - 1));
    const ph = () => 2 * Math.PI * r.uniform();
    this.e0 = jit(0.028, 0.15);
    this.eTerms = [[405, 0.011], [124, 0.008], [95, 0.007]].map(([P, a]) => ({ P: jit(P, 0.06), a: jit(a, 0.25), p: ph() }));
    this.ob0 = jit(23.3, 0.03) * Math.PI / 180;
    this.obTerms = [[41, 0.62], [54, 0.15]].map(([P, a]) => ({ P: jit(P, 0.05), a: jit(a, 0.25) * Math.PI / 180, p: ph() }));
    this.precP = jit(22.4, 0.05);
    this.prec0 = ph();
  }

  /** The orbit at time t (kyr), averaged over a window of W kyr. */
  at(t, W = 0) {
    const sinc = P => { const x = Math.PI * W / P; return x < 1e-6 ? 1 : Math.sin(x) / x; };
    let e = this.e0;
    for (const k of this.eTerms) e += k.a * sinc(k.P) * Math.cos(2 * Math.PI * t / k.P + k.p);
    let ob = this.ob0;
    for (const k of this.obTerms) ob += k.a * sinc(k.P) * Math.cos(2 * Math.PI * t / k.P + k.p);
    // Precession: the vector (e cos ϖ, e sin ϖ) turns; averaging shrinks it.
    const pw = this.prec0 + 2 * Math.PI * t / this.precP;
    const eSeason = Math.max(0.0005, e) * sinc(this.precP);
    return { e: Math.max(0.0005, eSeason), eMean: Math.max(0.0005, e), obliquity: ob, perihelion: ((pw % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI) };
  }

  /** Mid-July insolation at 65°N (W/m²), Milankovitch's curve, at time t (kyr). */
  summer65(t) {
    const o = this.at(t, 0);
    return insolation(65 * Math.PI / 180, Math.PI / 2 + 0.2, o);
  }
}
