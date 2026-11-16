// The People experiments' numbers (docs/PLAN.md, Roadmap 2.0: Experiments), each read off the
// running people on their thread (src/engine/people-worker.js) against its theory. `sample` runs
// after each of the people's steps; `report` goes to the page with each report of theirs, and its
// `text` is the caption's number.
import { fitHyperbola } from './peoplefit.js';

const R_KM = 6371, B_EBM = 2.09;
const km = (lat0, lon0, lat1, lon1) => R_KM * Math.acos(Math.max(-1, Math.min(1, Math.sin(lat0) * Math.sin(lat1) + Math.cos(lat0) * Math.cos(lat1) * Math.cos(lon1 - lon0))));
const fit1 = pts => {   // least squares y = a + b x
  let n = 0, sx = 0, sy = 0, sxx = 0, sxy = 0;
  for (const [x, y] of pts) { n++; sx += x; sy += y; sxx += x * x; sxy += x * y; }
  const d = n * sxx - sx * sx;
  return n >= 3 && d > 0 ? (n * sxy - sx * sy) / d : null;
};
const sp = v => (v >= 10 ? v.toFixed(0) : v >= 1 ? v.toFixed(1) : v.toFixed(2));
const yrs = y => (y >= 1e3 ? `${+(y / 1e3).toPrecision(2)} kyr` : `${+y.toPrecision(2)} yr`);

/**
 * Dispersal: the first hominins' front, where their numbers pass half the land's capacity, as a
 * cap's radius on the sphere, against Fisher's 2√(rD) (standard: r the births less the deaths at
 * low density, D the dispersal), until the front has crossed a third of the home landmass.
 */
class Dispersal {
  constructor(p) { this.pts = []; this.done = false; this.p = p; }
  sample(p) {
    if (this.done) return;
    const L = p.lineages[0], H = p.H;
    if (!L || L.died !== null) return;
    let A = 0;
    for (let c = 0; c < p.nL; c++) if (L.N[c] > 0.5 * L.K[c] && L.K[c] > 0) A += H.area[c];
    if (!this.body) {
      // The home landmass: the habitable land joined to where the first people are most numerous.
      const comp = p.components(c => H.alive[c] && H.b[c] > 0, 0);
      let best = 0, bc = 0;
      for (let c = 0; c < p.nL; c++) if (L.N[c] > bc) { bc = L.N[c]; best = c; }
      let a = 0; for (let c = 0; c < p.nL; c++) if (comp.id[c] === comp.id[best]) a += H.area[c];
      this.body = Math.max(a, 1);
    }
    const r = R_KM * Math.acos(Math.max(-1, 1 - A / (2 * Math.PI * R_KM * R_KM)));
    if (A > 0.01 * this.body) this.pts.push([p.t, r]);
    if (A > 0.33 * this.body || this.pts.length > 4000) this.done = true;
  }
  report(p) {
    const P = p.P, D = P.D0, r = P.B_PRE - P.D_LO, fisher = 2 * Math.sqrt(r * D);
    const v = fit1(this.pts);
    return { v, fisher, done: this.done, text: v ? `front ${sp(v)} km/yr against Fisher's 2√(rD) ${sp(fisher)} on even ground` : `Fisher's 2√(rD) ${sp(fisher)} km/yr on even ground` };
  }
}

/**
 * Kremer's continents: each landmass's people (connected without crossing the sea) and its mean
 * culture, against culture's balance A M/λ with M its minds (Kremer 1993's natural experiment,
 * from memory: the Old World, the Americas, Australia, Tasmania).
 */
class Kremer {
  sample() {}
  report(p) {
    // The natural experiment is the foragers' (culture near its balance): held once farming begins,
    // whose culture runs far ahead of any balance.
    if (this.held) return this.held;
    const r = this.measure(p);
    if (p.packages.length) this.held = { ...r, text: `${r.text}, as farming began` };
    return r;
  }
  measure(p) {
    const P = p.P, H = p.H, live = p.lineages.filter(L => L.died === null);
    const comp = p.components(c => p.Ntot[c] >= P.N_MIN * H.area[c], 0);
    const n = new Float64Array(comp.count), zs = new Float64Array(comp.count), zb = new Float64Array(comp.count);
    for (let c = 0; c < p.nL; c++) {
      const k = comp.id[c];
      if (k < 0) continue;
      for (const L of live) if (L.N[c] > 0) { n[k] += L.N[c]; zs[k] += L.N[c] * L.Z[c]; zb[k] += L.N[c] * Math.min(P.Z_SAT, P.A_INV * L.M[c] / P.LAMBDA); }
    }
    const lands = [...n.keys()].filter(k => n[k] >= P.P_MIN).sort((a, b) => n[b] - n[a]).map(k => ({ N: n[k], z: zs[k] / n[k], zb: zb[k] / n[k] }));
    const hc = v => (v >= 1e9 ? `${+(v / 1e9).toPrecision(2)} B` : v >= 1e6 ? `${+(v / 1e6).toPrecision(2)} M` : `${Math.round(v / 1e3)}k`);
    const txt = lands.slice(0, 3).map(l => `z ${l.z.toFixed(2)} on ${hc(l.N)} (${l.zb > 0 ? (l.z / l.zb).toFixed(2) : '–'} of A M/λ)`).join(', ');
    return { lands: lands.slice(0, 8), text: lands.length ? `${lands.length} ${lands.length === 1 ? 'landmass' : 'landmasses'}: ${txt}` : 'no landmass yet' };
  }
}

/**
 * Axes: the first farming package's spread from its origin east–west against north–south (Diamond's
 * axes, from memory): its farthest farmed cell each way (within ±500 km of the other axis, so a
 * diagonal spread counts once each way), each speed the slope of that reach over time while it is
 * still under four fifths of its most (before the coasts stop it).
 */
class Axes {
  constructor() { this.pts = []; }
  reach(p) {
    const k = p.packages[0], H = p.H;
    let ew = 0, ns = 0;
    for (let c = 0; c < p.nL; c++) {
      if (p.pkg[c] !== 0 || !(p.f[c] > 0.01)) continue;
      const dn = R_KM * Math.abs(H.lat[c] - k.lat), de = km(k.lat, k.lon, k.lat, H.lon[c]);
      if (dn < 500) ew = Math.max(ew, de);
      if (de < 500) ns = Math.max(ns, dn);
    }
    return [ew, ns];
  }
  sample(p) {
    const k = p.packages[0];
    if (!k || this.pts.length > 3000 || p.flags.industry) return;   // farming's own spread: industry's breeding and rewilding move it after
    const last = this.pts[this.pts.length - 1];
    if (last && p.t - last[0] < 20) return;
    this.pts.push([p.t, ...this.reach(p)]);
  }
  report(p) {
    if (!p.packages[0]) return { text: 'no farming yet' };
    const speed = j => {
      const mx = Math.max(...this.pts.map(q => q[j])), end = this.pts.findIndex(q => q[j] >= 0.8 * mx);
      return fit1(this.pts.slice(0, end < 0 ? this.pts.length : end).map(q => [q[0], q[j]]));
    };
    const vE = speed(1), vN = speed(2);
    if (vE === null || vN === null) return { text: 'farming spreading' };
    return { vE, vN, text: `farming ${sp(vE)} km/yr east–west, ${sp(vN)} north–south${vN > 0 ? ` (${(vE / vN).toFixed(1)}×)` : ''}` };
  }
}

/**
 * Carbon budget: AI never comes (B_MAX 0: no task can be automated), so the people burn what they burn; the
 * carbon emitted, its peak CO₂, and the share of it still in the air 1, 10 and 100 kyr after the
 * emissions peak, against the Pulse's theory (the closed sea, the compensated sea, then
 * weathering: src/engine/pulse.js) for the same carbon, which the engine computes on its sea. Once
 * the burning is over the people are held where they stand, so the planet runs on to 100 kyr.
 */
class Budget {
  constructor() { this.peakRate = 0; this.yPeak = null; this.at = {}; this.peakCO2 = 0; this.always = true; this.freeze = false; }
  sample(p, env) {
    const h = p.history, x = h[h.length - 1];
    if (!x) return;
    if (!this.freeze) {
      const rate = p.econ && p.econ.burned > 0 && x.dt > 0 ? p.econ.burned / x.dt : 0;
      this.rate = rate;
      if (rate > this.peakRate) { this.peakRate = rate; this.yPeak = env.years; }
      if (!this.started && rate > 0) { this.started = true; this.co2Pre = env.pco2; this.snapshot = true; }   // the worker asks the engine to keep the sea as it is
      // The burning over: the people held where they stand (their thread stops stepping), so the
      // planet runs on to 100 kyr on its own clock.
      if (this.yPeak !== null && p.emitted > 1 && rate < 0.05 * this.peakRate && x.Ef < 0.05 * (this.efPeak || Infinity)) this.freeze = true;
      this.efPeak = Math.max(this.efPeak || 0, x.Ef || 0);
    }
    this.peakCO2 = Math.max(this.peakCO2, env.pco2);
    if (this.freeze && this.yPeak !== null) for (const T of [1e3, 1e4, 1e5]) {
      if (!(T in this.at) && env.years - this.yPeak >= T) this.at[T] = (env.pco2 - this.co2Pre) * 2.12 / Math.max(1, p.emitted);
    }
  }
  report(p, env, theory) {
    const e = p.emitted, pc = v => `${Math.round(100 * v)}%`;
    const shares = [1e3, 1e4, 1e5].map(T => (T in this.at ? `${pc(this.at[T])}${theory ? ` (${pc(theory[T === 1e3 ? 's1' : T === 1e4 ? 's10' : 's100'])})` : ''}` : '–')).join(' · ');
    return { emitted: e, peakCO2: this.peakCO2, at: this.at, done: this.freeze, freeze: this.freeze,
      text: e > 1 ? `${Math.round(e).toLocaleString('en')} Pg C burned · peak ${Math.round(this.peakCO2)} ppm · in the air after 1, 10, 100 kyr ${shares}${theory ? ' (the Pulse’s theory)' : ''}` : 'no carbon burned yet' };
  }
}

/**
 * Takeoff: years from early takeoff to the dial, and the minds' singularity t* with an interval
 * from a seeded bootstrap of the fit over the record from the first tip (as tools/horizon-fit.mjs
 * reads the home page's horizons).
 */
class Takeoff {
  sample() {}
  report(p) {
    const ev = k => p.events.find(e => e.kind === k), pres = ev('present'), dial = ev('dial'), tip = ev('tip');
    if (!pres) return { text: 'before early takeoff' };
    const out = { gap: dial ? dial.t - pres.t : null };
    if (dial && !this.ci && tip) {
      const h = p.history.filter(x => x.t >= tip.t && x.t <= dial.t);
      const step = Math.max(1, Math.floor(h.length / 400)), rows = h.filter((_, i) => i % step === 0);
      let s = 12345;
      const rnd = () => (s = (s * 1103515245 + 12345) % 2147483648) / 2147483648;
      const ts = [];
      for (let b = 0; b < 40; b++) {
        const pick = rows.filter(() => rnd() < 0.632).sort((a, c) => a.t - c.t);
        const f = fitHyperbola(pick.map((x, i) => ({ ...x, dt: i ? x.t - pick[i - 1].t : x.dt })), tip.t, 'minds', dial.t);
        if (f) ts.push(f.tStar - pres.t);
      }
      ts.sort((a, b) => a - b);
      if (ts.length > 5) this.ci = [ts[Math.floor(0.05 * ts.length)], ts[Math.floor(0.5 * ts.length)], ts[Math.floor(0.95 * ts.length)]];
    }
    out.ci = this.ci || null;
    out.text = dial ? `the dial ${yrs(out.gap)} after early takeoff${this.ci ? ` · t* ${yrs(this.ci[1])} (${yrs(this.ci[0])}–${yrs(this.ci[2])})` : ''}` : `early takeoff ${yrs(p.t - pres.t)} ago`;
    return out;
  }
}

/**
 * Radiator: Earth spent as the machines' radiator (ending 1a forced), its heat budget the knob; the
 * people's waste heat and the planet's warming since they began, against the forcing over B (the
 * energy balance's, before feedbacks), and the runaway when it comes.
 */
class Radiator {
  sample() {}
  report(p, env) {
    const heat = p.forcing.heat || 0, F = p.Ft || 0, dT = env.dT || 0, pw = heat * 5.1e14 / 1e15;
    const run = p.boiled > 0 ? ` · the runaway: ${Math.round(100 * p.boiled)}% of the sea in the air` : '';
    return { heat, F, dT, text: `waste heat ${heat.toFixed(heat < 10 ? 1 : 0)} W/m² (${sp(pw)} PW) · forcing ${F.toFixed(0)} W/m² · +${dT.toFixed(1)} K against F/B's +${(F / B_EBM).toFixed(1)}${run}` };
  }
}

const KINDS = { dispersal: Dispersal, kremer: Kremer, axes: Axes, budget: Budget, takeoff: Takeoff, radiator: Radiator };
/** The measure for experiment `id`, or null. */
export function measureFor(id, p) { const K = KINDS[id]; return K ? new K(p) : null; }
