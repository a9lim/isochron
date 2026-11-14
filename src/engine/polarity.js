// The geomagnetic polarity record (docs/PLAN.md, layer 1). Reversals are a
// Poisson process whose log-rate wanders (an Ornstein–Uhlenbeck walk), so
// long stretches without reversals (superchrons) happen on their own. Oceanic
// crust remembers the polarity at its formation time, which draws the stripes.
// Times are in Myr.
import { stream } from '../rng.js';

const MEAN_LOG_RATE = Math.log(2.5);   // reversals per Myr
const LOG_RATE_SD = 0.9;
const LOG_RATE_RELAX = 25;             // Myr

export class Polarity {
  constructor(seed, start = -400) {
    this.rng = stream(seed, 'polarity');
    this.start = start;
    this.times = [];                   // reversal times, ascending
    this.end = start;                  // generated up to here
    this.logRate = MEAN_LOG_RATE;
    this.generate(start + 1000);
  }

  generate(until) {
    const r = this.rng;
    while (this.end < until) {
      // Rate held over 1 Myr slices; OU update between them.
      const slice = 1;
      const a = Math.exp(-slice / LOG_RATE_RELAX);
      this.logRate = MEAN_LOG_RATE + (this.logRate - MEAN_LOG_RATE) * a + LOG_RATE_SD * Math.sqrt(1 - a * a) * r.normal();
      const rate = Math.exp(this.logRate);
      let t = this.end;
      const stop = this.end + slice;
      for (;;) {
        t += r.exponential(1 / rate);
        if (t >= stop) break;
        this.times.push(t);
      }
      this.end = stop;
    }
  }

  /** Reversals strictly before t. */
  countBefore(t) {
    let lo = 0, hi = this.times.length;
    while (lo < hi) { const m = (lo + hi) >> 1; if (this.times[m] < t) lo = m + 1; else hi = m; }
    return lo;
  }

  /** +1 normal, −1 reversed. The planet starts normal at `start`. */
  at(t) {
    if (t >= this.end) this.generate(t + 100);
    return this.countBefore(t) % 2 === 0 ? 1 : -1;
  }

  /**
   * The running integral C(T0 + kΔ) = ∫_{T0}^{T0+kΔ} p dt for k = 0..N−1, for
   * the shader's box filter: the mean polarity over [t − w, t + w] is
   * (C(t + w) − C(t − w)) / 2w, so stripes too fine for a pixel go to the
   * mid-tone instead of shimmering.
   */
  table(T0, dT, N) {
    const out = new Float32Array(N);
    this.at(T0 + dT * N);
    let k0 = this.countBefore(T0);
    let p = k0 % 2 === 0 ? 1 : -1;
    let acc = 0, t = T0, next = k0;
    for (let k = 0; k < N; k++) {
      const target = T0 + k * dT;
      while (next < this.times.length && this.times[next] < target) {
        acc += p * (this.times[next] - t);
        t = this.times[next]; p = -p; next++;
      }
      out[k] = acc + p * (target - t);
    }
    return out;
  }

  /** Reversals over the last `span` Myr before t (for the polarity figure and the caption). */
  recent(t, span) {
    const a = this.countBefore(t - span), b = this.countBefore(t);
    return this.times.slice(a, b);
  }
}
