// The kernels the engine's pool's threads run (src/engine/pool.js), by name: each a layer's own function
// over a range of cells [a, b) (the one the layer hands `parallel`), after the constants the engine may
// have set, which come with its arguments. Only the pool's threads import this.
import { soilYearCells, SOIL } from './soil.js';
import { cloudCells, CLOUDS } from './clouds.js';
import { pressureCells, windCells } from './climate.js';
import { sourceCells } from './aeolian.js';
import { VEG } from './vegetation.js';

export const KERNELS = {
  /** The ground's periodic year (Soil.equilibrium). */
  soilYear(x, a, b) { Object.assign(SOIL, x.SOIL); return soilYearCells(x, a, b); },
  /** A point of the year's clouds. */
  clouds(x, a, b) { Object.assign(CLOUDS, x.CLOUDS); return cloudCells(x, a, b); },
  /** A point of the year's template pressure. */
  pressure: pressureCells,
  /** Its winds and carrying winds from that pressure. */
  wind: windCells,
  /** A point of the year's dust sources. */
  dustSources(x, a, b) { Object.assign(VEG, x.VEG); return sourceCells(x, a, b); },
};
