// The kernels the engine's pool's threads run (src/engine/pool.js), by name: each a layer's own function
// over a range of cells [a, b) (the one the layer hands `parallel`), after the constants the engine may
// have set, which come with its arguments. Only the pool's threads import this.
import { soilYearCells, SOIL } from './soil.js';
import { cloudCells, CLOUDS } from './clouds.js';
import { pressureCells, windCells, finishCells, humidCells, olrCells, groundCells, phaseCells, anomCells } from './climate.js';
import { YEAR } from './year.js';
import { sourceCells, effectCells } from './aeolian.js';
import { VEG } from './vegetation.js';
import { emitCells, coeffCells, finishCells as dustFinishCells, downCells } from './dust.js';
import { coverCells } from './life.js';
import { SEAHEAT, eastStressCells, meanStressCells } from './seaheat.js';

export const KERNELS = {
  /** The ground's periodic year (Soil.equilibrium). */
  soilYear(x, a, b) { Object.assign(SOIL, x.SOIL); return soilYearCells(x, a, b); },
  /** A point of the year's clouds. */
  clouds(x, a, b) { Object.assign(CLOUDS, x.CLOUDS); return cloudCells(x, a, b); },
  /** A point of the year's temperature and the ITCZ's scores. */
  phaseT: phaseCells,
  /** Its land's departure from the zonal mean (the thermal pressure's). */
  anom: anomCells,
  /** A point of the year's template pressure. */
  pressure: pressureCells,
  /** Its winds and carrying winds from that pressure. */
  wind: windCells,
  /** Rain's harmonics, the months and the zones. */
  finish(x, a, b) { if (x.YEAR) Object.assign(YEAR, x.YEAR); finishCells(x, a, b); },
  /** The ground's year's runoff, open water's balance and evaporation by point of the year. */
  groundTail: groundCells,
  /** The clouds' longwave by cell, for the runaway's limit. */
  olr(x, a, b) { Object.assign(CLOUDS, x.CLOUDS); olrCells(x, a, b); },
  /** Moist static energy's humidity at the six points of the year. */
  humid: humidCells,
  /** A point of the year's dust sources. */
  dustSources(x, a, b) { Object.assign(VEG, x.VEG); return sourceCells(x, a, b); },
  /** The year's eastward wind stress (the overturning's channels). */
  eastStress(x, a, b) { Object.assign(SEAHEAT, x.SEAHEAT); eastStressCells(x, a, b); },
  /** The year's mean wind stress (the gyres). */
  meanStress(x, a, b) { Object.assign(SEAHEAT, x.SEAHEAT); meanStressCells(x, a, b); },
  /** The cover's climate after a cycle. */
  cover(x, a, b) { Object.assign(VEG, x.VEG); coverCells(x, a, b); },
  /** A point of the year's dust emission and rain, for the solve. */
  dustEmit: emitCells,
  /** Its inputs down to the solve's grid, a level at a time. */
  dustDown: downCells,
  /** Its packed coefficients on the solve's grid. */
  dustCoeffs: coeffCells,
  /** The deposition's effects on snow and ice. */
  dustEffects: effectCells,
  /** The dust's outputs from the solved loads. */
  dustFinish: dustFinishCells,
};
