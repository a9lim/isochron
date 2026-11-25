// The engine's per-cell loops that run on its pool of threads (src/engine/pool.js): each a function of
// its arguments (the planet's shared arrays, plain values, and the constants it reads) and a range of
// cells [a, b), returning what the caller sums. Each layer's own method is the reference; a kernel
// rebuilds the layer's view of its arrays and calls it on its range.
import { Soil, SOIL } from './soil.js';
import { cloudCells, CLOUDS } from './clouds.js';
import { pressureCells, surfaceWind } from './climate.js';

export const KERNELS = {
  /** The ground's periodic year (Soil.equilibrium) on cells [a, b), from the climate's months. */
  soilYear(x, a, b) {
    Object.assign(SOIL, x.SOIL);
    const s = Object.assign(Object.create(Soil.prototype), x.soil);
    return s.equilibrium(x.T, x.P, x.PET, { cold: x.cold, from: a, to: b });
  },
  /** A point of the year's clouds (cloudCells) on cells [a, b). */
  clouds(x, a, b) { Object.assign(CLOUDS, x.CLOUDS); return cloudCells(x, a, b); },
  /** A point of the year's template pressure (pressureCells) on cells [a, b). */
  pressure(x, a, b) { pressureCells(x, a, b); },
  /** Its winds and carrying winds from that pressure (surfaceWind) on cells [a, b). */
  wind(x, a, b) { surfaceWind(x.g, x.pres, x.omega, x.wind, x.carry, x.gp, a, b, x.C); },
};
