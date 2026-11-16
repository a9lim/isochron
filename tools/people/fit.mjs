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

/**
 * The dial set so a doubling of the minds takes `secs` seconds, within the dial's range
 * (10^−3.5 to 10^7 yr/s): its wall-clock in all, and by era (before the first tip, foragers after
 * it, farmers, industry, compute), the eras by the history's own shares.
 */
export function followDial(h, secs) {
  let wall = 0;
  const eras = new Map();
  for (let k = 1; k < h.length; k++) {
    // The growth over the last 20 steps, so the dial reads the trend, not a step's noise.
    const a = h[Math.max(0, k - 20)], b = h[k];
    const g = Math.log(b.minds / a.minds) / (b.t - a.t);
    const rate = g > 1e-7 ? Math.min(1e7, Math.max(Math.pow(10, -3.5), Math.log(2) / g / secs)) : 1e7;
    const w = b.dt / rate;
    wall += w;
    const era = b.ind > 0.05 ? (b.zmax > 11 ? 'compute' : 'industry') : b.farm > 0.05 ? 'farmers' : b.zmax > 1 ? 'foragers' : 'hominins';
    eras.set(era, (eras.get(era) || 0) + w);
  }
  return { wall, eras: [...eras] };
}
