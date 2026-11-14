// Crust → elevation, and sea level (docs/PLAN.md, layer 2).
//
// Elevation is Airy isostasy on crustal thickness and density, less the
// thermal subsidence of oceanic crust as it cools and ages. The datum is
// arbitrary: sea level is solved from the ocean's water volume, so only
// differences in elevation matter.

export const RHO_MANTLE = 3.30;            // g/cm³
export const RHO_OCEANIC = 2.95;
export const RHO_CONTINENTAL = 2.85;
export const H_OCEANIC = 7;                // km, new crust at a ridge
export const H_CONTINENTAL = 35;           // km, typical continental crust

/**
 * Subsidence of oceanic crust below its ridge (km) at an age (Myr): √age
 * cooling while young, flattening as the plate reaches thermal equilibrium.
 * The shape is the GDH1 fit's (Stein and Stein 1992; constants from memory,
 * check before citing): 0.365√t to 20 Myr, then 3.051 − 2.473 e^(−0.0278 t).
 */
export function subsidence(age) {
  if (age <= 0) return 0;
  if (age < 20) return 0.365 * Math.sqrt(age);
  return 3.051 - 2.473 * Math.exp(-0.0278 * age);
}

/** Elevation on the isostatic datum (km). */
export function elevation(h, felsic, age) {
  const rho = RHO_OCEANIC + (RHO_CONTINENTAL - RHO_OCEANIC) * felsic;
  return h * (1 - rho / RHO_MANTLE) - (1 - felsic) * subsidence(age);
}

/** The ocean's volume (in km·sr: depth × solid angle) below level s. */
export function oceanVolume(grid, elev, s) {
  let v = 0;
  for (let i = 0; i < grid.n; i++) if (elev[i] < s) v += (s - elev[i]) * grid.area[i];
  return v;
}

/** The level whose basins hold exactly `volume`. Bisection: volume is monotone in s. */
export function solveSeaLevel(grid, elev, volume) {
  let lo = Infinity, hi = -Infinity;
  for (let i = 0; i < grid.n; i++) { if (elev[i] < lo) lo = elev[i]; if (elev[i] > hi) hi = elev[i]; }
  hi += volume / (4 * Math.PI) + 1;
  for (let it = 0; it < 48; it++) {
    const mid = 0.5 * (lo + hi);
    if (oceanVolume(grid, elev, mid) < volume) lo = mid; else hi = mid;
  }
  return 0.5 * (lo + hi);
}

/** The water volume that leaves `landFraction` of the surface dry. */
export function waterForLand(grid, elev, landFraction) {
  const idx = Array.from({ length: grid.n }, (_, i) => i).sort((a, b) => elev[a] - elev[b]);
  const target = (1 - landFraction) * 4 * Math.PI;
  let acc = 0, s = elev[idx[idx.length - 1]];
  for (const i of idx) { acc += grid.area[i]; if (acc >= target) { s = elev[i]; break; } }
  return oceanVolume(grid, elev, s);
}
