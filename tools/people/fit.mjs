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
import { DIAL_MIN, followAim, followEase } from '../../src/clock.js';

/**
 * The follow dial's wall-clock, replayed as the page sets it (src/clock.js: `followAim`, `followEase`,
 * at frames of at most 50 ms) from People.pace on the record, within the dial's range and at most `cap`
 * yr/s (the people's thread on the page: ~80 kyr/s in the forager era). Its eras as the people's worker
 * names them, read from the record (the tip as the frontier's knowledge past 1, the farmers from the
 * first fields, early takeoff at β_c 0.15, the dial at the minds doubling in under a day). Its wall-clock
 * in all and by era, and the most it moved in any 2 s (decades).
 */
export function followDial(h, cap = 8e4) {
  let wall = 0, v = null, present = false, dial = false, worst = 0;
  const eras = new Map(), hi = Math.log10(cap), back = [];
  for (let k = 1; k < h.length; k++) {
    const b = h[k];
    present = present || b.beta >= 0.15;
    if (!dial && k >= 6) { const c = h[k - 5]; const gm = Math.log(b.minds / c.minds) / Math.max(b.t - c.t, 1e-12); dial = gm > 0 && Math.LN2 / gm < 1 / 365.25; }
    const era = dial ? 'after the dial' : present ? 'takeoff' : b.ind > 0 ? 'industry' : b.farm > 0 ? 'farmers' : b.zmax > 1 ? 'foragers' : 'first people';
    const aim = followAim(paceOf(h.slice(Math.max(0, k - 80), k + 1), present), era, DIAL_MIN, hi);
    if (v === null) v = aim;
    let y = b.dt, w = 0;
    while (y > 1e-12 && w < 1e5) {
      const ds = Math.min(0.05, y / 10 ** v);
      y -= ds * 10 ** v; w += ds; v = followEase(v, aim, ds);
      back.push([wall + w, v]);
      while (back.length > 1 && back[back.length - 1][0] - back[0][0] > 2) back.shift();
      worst = Math.max(worst, Math.abs(v - back[0][1]));
    }
    wall += w;
    eras.set(era, (eras.get(era) || 0) + w);
  }
  return { wall, eras: [...eras], worst };
}
