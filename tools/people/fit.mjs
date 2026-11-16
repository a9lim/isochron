// Reading a run of the people prototype: the hyperbola's fit, the follow dial's wall-clock, years.

/** "3.2 Myr", "41 kyr", "530 yr", "6.1 days", "3.0 h". */
export function fmtYears(y) {
  const a = Math.abs(y), s = y < 0 ? '−' : '';
  if (a >= 1e6) return `${s}${(a / 1e6).toPrecision(3)} Myr`;
  if (a >= 1e3) return `${s}${(a / 1e3).toPrecision(3)} kyr`;
  if (a >= 1) return `${s}${a.toPrecision(3)} yr`;
  if (a * 365.25 >= 1) return `${s}${(a * 365.25).toPrecision(3)} days`;
  return `${s}${(a * 8766).toPrecision(3)} h`;
}

export { fitHyperbola } from '../../src/engine/peoplefit.js';
import { paceOf } from '../../src/engine/people.js';

/**
 * The follow dial's wall-clock, as People.pace sets it: a doubling of what changes fastest takes
 * `secs` seconds (the minds; before early takeoff also the farmed land and the energy, each from its
 * floor; after it the energy and the people on Earth and off it), within the dial's range and at
 * most `cap` yr/s (the people's thread on the page: ~80 kyr/s in the forager era). Its wall-clock in
 * all, and by era (before the first tip, foragers after it, farmers, industry, then from early
 * takeoff to the dial, and after the dial).
 */
export const FLOOR_HOMININS = 5e3;   // yr/s: main.js's follow floor before the first tip
export function followDial(h, secs, cap = 8e4) {
  let wall = 0, present = false, dial = false;
  const eras = new Map();
  for (let k = 1; k < h.length; k++) {
    const b = h[k];
    present = present || b.beta >= 0.15;
    const g = paceOf(h.slice(Math.max(0, k - 20), k + 1), present);
    const floor = b.zmax > 1 || b.farm > 0 ? 0 : FLOOR_HOMININS;   // the page's floor before the first tip (main.js)
    const rate = Math.min(cap, 1e7, Math.max(floor, g > 1e-7 ? Math.max(Math.pow(10, -3.5), Math.log(2) / g / secs) : 1e7));
    const w = b.dt / rate;
    wall += w;
    if (!dial && k >= 6) { const c = h[k - 5]; const gm = Math.log(b.minds / c.minds) / Math.max(b.t - c.t, 1e-12); dial = gm > 0 && Math.LN2 / gm < 1 / 365.25; }
    const era = dial ? 'after the dial' : present ? 'takeoff' : b.ind > 0.05 ? 'industry' : b.farm > 0.05 ? 'farmers' : b.zmax > 1 ? 'foragers' : 'hominins';
    eras.set(era, (eras.get(era) || 0) + w);
  }
  return { wall, eras: [...eras] };
}
