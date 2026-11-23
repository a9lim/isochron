// The dial and the scheduler (docs/MODEL.md).
//
// The dial is log10 of simulated years per real second. Each layer declares
// its step (years) and a substep budget per frame, and optionally a closure
// (`summarize`) that stands in for it when the dial outruns the budget. Every
// layer banks the frame's time:
//   live          bank holds n ≤ budget whole steps: take them (n may be 0, and
//                 a layer slower than the dial then holds still)
//   summarized    more than the budget is banked and the layer has a closure:
//                 the closure takes the whole bank
// A layer without a closure must keep up, so it bounds the frame's time
// (`maxFrameYears`), and the main loop clamps the dial to it.

export const DIAL_MIN = -3.5;   // 2.8 hours a second
export const DIAL_MAX = 7;      // 10 Myr a second

const HOUR = 1 / 8766, DAY = 1 / 365.25;

// The follow dial (the People scenario): the rate at which a doubling or halving of what changes
// fastest (People.pace) takes SECS seconds; AFTER seconds past the dial, where the minds and the
// swarm double dozens of times over (at SECS each they took ~10 minutes of a ~20-minute run); at least
// FIRST yr/s before the first people tip. Eased in the dial's log: down within DOWN seconds, so
// what slows the people isn't passed by, and up over UP seconds at most SLEW decades a second, so a
// pace easing off doesn't fling the dial.
export const FOLLOW = { SECS: 10, AFTER: 4, FIRST: 5e3, DOWN: 1, UP: 2, SLEW: 0.25 };

/** The follow dial's aim (log₁₀ yr/s) at a pace (/yr) in an era (the people's worker's), within lo…hi; `scale` the seconds. */
export function followAim(pace, era, lo, hi, scale = 1) {
  const secs = scale * (era === 'after the dial' ? FOLLOW.AFTER : FOLLOW.SECS);
  const floor = era === 'first people' ? Math.log10(FOLLOW.FIRST) : -Infinity;
  return Math.max(lo, Math.min(hi, Math.max(floor, pace > 0 ? Math.log10(Math.LN2 / (pace * secs)) : hi)));
}

/** The follow dial's value v (log₁₀ yr/s) eased toward its aim over dt seconds. */
export function followEase(v, aim, dt) {
  const dv = (aim - v) * (1 - Math.exp(-dt / (aim < v ? FOLLOW.DOWN : FOLLOW.UP)));
  return v + (dv > 0 ? Math.min(dv, FOLLOW.SLEW * dt) : dv);
}

/** "2.8 h/s", "1 day/s", "3 yr/s", "10 kyr/s", "1 Myr/s". */
export function formatRate(yps) {
  const fmt = v => (v >= 100 ? v.toFixed(0) : v >= 10 ? v.toFixed(0) : v >= 1 ? (Math.round(v * 10) / 10).toString() : v.toPrecision(1));
  if (yps < DAY) return `${fmt(yps / HOUR)} h/s`;
  if (yps < 1) { const d = yps / DAY; return `${fmt(d)} ${d < 1.5 ? 'day' : 'days'}/s`; }
  if (yps < 1e3) return `${fmt(yps)} yr/s`;
  if (yps < 1e6) return `${fmt(yps / 1e3)} kyr/s`;
  return `${fmt(yps / 1e6)} Myr/s`;
}

/** "412.3 Myr", "28.4 kyr", "3.1 yr", "day 12". Time since the planet's start. */
export function formatTime(years) {
  const a = Math.abs(years);
  if (a >= 1e6) return `${(years / 1e6).toFixed(a >= 1e8 ? 0 : 1)} Myr`;
  if (a >= 1e3) return `${(years / 1e3).toFixed(1)} kyr`;
  return `${years.toFixed(1)} yr`;
}

export class Scheduler {
  /** layers: [{ name, step, budget, summarize? }] */
  constructor(layers) {
    this.layers = layers.map(l => ({ ...l, bank: 0 }));
    this.time = 0;
  }

  /** The most a frame may advance with every closure-less layer keeping up. */
  get maxFrameYears() {
    let m = Infinity;
    for (const l of this.layers) if (!l.summarize) m = Math.min(m, l.step * l.budget);
    return m;
  }

  /**
   * Advance the planet's clock by dt years. Returns, per layer, what to do:
   * { name, mode: 'live' | 'summary', steps, step, span, blend } where `span`
   * is the time a summary covers and `blend` runs 0 (live) → 1 (summarized)
   * over half a decade either side of the hand-off, for crossfading drawings.
   */
  advance(dt) {
    dt = Math.min(dt, this.maxFrameYears);
    this.time += dt;
    const plan = [];
    for (const l of this.layers) {
      l.bank += dt;
      const load = dt / (l.step * l.budget);
      const x = Math.log10(Math.max(load, 1e-12)) / 0.5;           // ±1 at half a decade
      const blend = l.summarize ? Math.min(1, Math.max(0, 0.5 + 0.5 * x)) : 0;
      const n = Math.floor(l.bank / l.step + 1e-9);
      if (n <= l.budget || !l.summarize) {
        const steps = Math.min(n, l.budget);
        l.bank -= steps * l.step;
        plan.push({ name: l.name, mode: 'live', steps, step: l.step, span: 0, blend });
      } else {
        const span = l.bank;
        l.bank = 0;
        plan.push({ name: l.name, mode: 'summary', steps: 0, step: l.step, span, blend });
      }
    }
    return { dt, plan };
  }
}
