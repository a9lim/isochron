// Crust → elevation, and sea level (docs/plates.md).
//
// Elevation is Airy isostasy on crustal thickness and density, less the
// thermal subsidence of oceanic crust as it cools and ages. The datum is
// arbitrary: sea level is solved from the ocean's water volume, so only
// differences in elevation matter.

export const RHO_MANTLE = 3.30;            // g/cm³
export const RHO_OCEANIC = 2.95;
export const RHO_CONTINENTAL = 2.85;
export const H_OCEANIC = 7;                // km, new crust at a ridge
export const FREEBOARD = 2.5;              // km: how far today's sea stands over a new ridge (GDH1's ridge ~2.6 km deep, from memory): seeded planets' water, Earth's datum

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

/**
 * The level whose basins hold exactly `volume`. V(s) is convex and piecewise
 * linear, rising with slope the ocean's area, so Newton from the last level
 * lands in a few passes (bisection took 48); a bracket guards it. Cells with
 * `excl` set (basins the sea doesn't reach: seaMask) hold none of it.
 */
export function solveSeaLevel(grid, elev, volume, guess = null, excl = null) {
  const n = grid.n, area = grid.area;
  let lo = Infinity, hi = -Infinity;
  for (let i = 0; i < n; i++) { if (elev[i] < lo) lo = elev[i]; if (elev[i] > hi) hi = elev[i]; }
  hi += volume / (4 * Math.PI) + 1;
  let s = guess != null && guess > lo && guess < hi ? guess : 0.5 * (lo + hi);
  for (let it = 0; it < 60; it++) {
    let v = 0, a = 0;
    if (excl) { for (let i = 0; i < n; i++) { const d = s - elev[i]; if (d > 0 && !excl[i]) { v += d * area[i]; a += area[i]; } } }
    else for (let i = 0; i < n; i++) { const d = s - elev[i]; if (d > 0) { v += d * area[i]; a += area[i]; } }
    const r = v - volume;
    if (Math.abs(r) <= 1e-12 * volume) break;
    if (r > 0) hi = s; else lo = s;
    let next = a > 0 ? s - r / a : 0.5 * (lo + hi);
    if (!(next > lo && next < hi)) next = 0.5 * (lo + hi);
    if (Math.abs(next - s) < 1e-9) { s = next; break; }
    s = next;
  }
  return s;
}

/**
 * The ocean at level s (synthesis): the cells below it that the open ocean reaches. Cells join
 * on their channel's height (`chan`, plates.js's seaChannel: the mean less the sea's channel
 * through the cell, a strait narrower than a cell; the mean where none is given), their wet area
 * on their mean. A cell whose channel is below s joins its neighbours, and a strait joins them
 * too: a cell that was part of the ocean (`strait`, kept here) whose channel now stands less than
 * STRAIT above it, the sub-grid relief (so a sill doesn't open and close with every metre the sea
 * moves). A body
 * holding at least SEA.OCEAN_MIN of the sphere, or the largest, is ocean; the others are basins
 * the sea doesn't reach, which hold lakes or lie dry (src/engine/lakes.js). Writes `sea` (1
 * on the ocean) and `strait`; returns the ocean's area (sr).
 */
/** Tunable; tools and tests may change them. */
export const SEA = {
  STRAIT: 0.025,      // km: a sill stands this far clear of the sea before it closes (the sub-grid relief's half range, LAND.ROUGH)
  OCEAN_MIN: 0.02,    // of the sphere (~10 M km²): a body this large is ocean wherever it stands (0: every basin below sea level is sea)
  TRAPPED: 0.5,       // a body this much floored by oceanic crust is ocean too (2 or more: none is)
  // The straits' scour (plates.js, `scour`; speculation): where the sea flows through a cell between
  // two of its waters, its channel cuts down at SCOUR, less as it deepens (e-fold SCOUR_D below the
  // sea), against uplift and filling; everywhere the channel fills back toward the mean over FILL.
  SCOUR: 0.4,         // km/Myr: a shallow strait's cutting (0.4 mm/yr), the uplift it holds open against
  SCOUR_D: 0.025,     // km: the channel's depth below the sea over which the cutting falls e-fold
  FILL: 30,           // Myr: a channel's relief filling back toward its cell's mean
  CHANNEL_MAX: 0.6,   // km: the deepest channel kept below a cell's mean
};
export function seaMask(grid, elev, s, sea, strait, scratch = null, felsic = null, chan = elev) {
  const n = grid.n, area = grid.area, nbrOff = grid.nbrOff, nbr = grid.nbr, S2 = s + SEA.STRAIT;
  const id = scratch && scratch.id && scratch.id.length === n ? scratch.id : new Int32Array(n);
  const stack = scratch && scratch.stack && scratch.stack.length === n ? scratch.stack : new Int32Array(n);
  if (scratch) { scratch.id = id; scratch.stack = stack; }
  id.fill(-1);
  const wet = [], oce = [];
  let big = -1, bigA = -1;
  for (let i0 = 0; i0 < n; i0++) {
    if (id[i0] >= 0 || !(elev[i0] < s)) continue;
    const c = wet.length;
    let sp = 0, a = 0, ao = 0;
    id[i0] = c; stack[sp++] = i0;
    while (sp) {
      const i = stack[--sp];
      if (elev[i] < s) { a += area[i]; if (felsic && felsic[i] < 0.5) ao += area[i]; }
      for (let t = nbrOff[i], e = nbrOff[i + 1]; t < e; t++) {
        const j = nbr[t];
        if (id[j] >= 0) continue;
        const z = chan[j];
        if (z < s || (strait[j] && z < S2)) { id[j] = c; stack[sp++] = j; }
      }
    }
    wet.push(a); oce.push(ao);
    if (a > bigA) { bigA = a; big = c; }
  }
  const min = SEA.OCEAN_MIN * 4 * Math.PI;
  let ocean = 0;
  for (let i = 0; i < n; i++) {
    const c = id[i], o = c >= 0 && (c === big || wet[c] >= min || oce[c] >= SEA.TRAPPED * wet[c]);
    sea[i] = o && elev[i] < s ? 1 : 0;
    strait[i] = o ? 1 : 0;
    if (sea[i]) ocean += area[i];
  }
  return ocean;
}
