// The record: global series at several resolutions, so its figure can follow
// the dial from years to hundreds of millions of years.

export const SERIES = ['T', 'co2', 'sea', 'ice', 'land', 'ridge', 'day'];
const LEVELS = [0.1, 1, 10, 100, 1e3, 1e4, 1e5, 1e6];   // years between samples
const KEEP = 480;

/** Global series at several resolutions, so the record can follow the dial. */
export class Record {
  constructor() {
    this.levels = LEVELS.map(dt => ({ dt, t: new Float64Array(KEEP), v: SERIES.map(() => new Float32Array(KEEP)), n: 0, head: 0, last: -Infinity }));
  }
  push(t, values) {
    for (const L of this.levels) {
      if (t - L.last < L.dt) continue;
      L.last = t;
      L.t[L.head] = t;
      for (let k = 0; k < SERIES.length; k++) L.v[k][L.head] = values[k];
      L.head = (L.head + 1) % KEEP;
      L.n = Math.min(KEEP, L.n + 1);
    }
  }
  /** Add dv to every sample of series `name` held (a new reference: the sea measured from the settled opening). */
  shift(name, dv) {
    const k = SERIES.indexOf(name);
    for (const L of this.levels) for (let j = 0; j < KEEP; j++) L.v[k][j] += dv;
  }
  /** The finest level whose span covers `span` years, as arrays oldest first. */
  window(span) {
    let L = this.levels[this.levels.length - 1];
    for (const l of this.levels) if (l.dt * KEEP >= span) { L = l; break; }
    const n = L.n, t = new Float64Array(n), v = SERIES.map(() => new Float32Array(n));
    for (let k = 0; k < n; k++) {
      const j = (L.head - n + k + KEEP) % KEEP;
      t[k] = L.t[j];
      for (let s = 0; s < SERIES.length; s++) v[s][k] = L.v[s][j];
    }
    return { t, v, dt: L.dt };
  }
}
