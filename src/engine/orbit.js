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
/** Year phase at the middle of month m (0 = January). */
export function monthPhase(m) {
  const mid = [15.5, 45, 74.5, 105, 135.5, 166, 196.5, 227.5, 258, 288.5, 319, 349.5][m];
  return ((mid - 78.5) / 365.2422 + 1) % 1;
}
