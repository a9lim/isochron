// The Pulse experiment (docs/PLAN.md, phase 8): carbon put into the air at
// once, and the share of it still there after 1, 10 and 100 kyr.
//
// Measured: against a twin of the sea (src/engine/oceancarbon.js) copied at the
// pulse and stepped beside it with the same inputs, so the planet's own drift
// doesn't blur the number: the share is (air − the twin's air) / pulse. The
// twin's weathering answers its own CO₂ (through the climate's sensitivity
// since the climate last solved), so the warming's extra weathering is the
// pulse's; the land's store is shared (its answer to the pulse isn't
// credited), and the twin keeps the seafloor's hypsometry of the pulse's
// moment.
//
// Theory (standard stages, after Archer's; the forms are closed-form
// equilibria on the sea's own chemistry at the pulse, synthesis as built):
//   1 kyr    the closed sea: the air and every box's preformed carbon in
//            equilibrium, alkalinity unchanged, the biological pump as it was
//            (each surface box from its own pCO₂ raised by the air's rise, at
//            its own alkalinity and temperature; the deep takes the cold box's
//            rise per kg, since deep water forms there). This is the stage's
//            end; at 1 kyr the deep is ~1 − 1/e ventilated, so the measured
//            share sits above it.
//   10 kyr   compensated: the seafloor's carbonate has dissolved until each
//            box's carbonate ion is back where it was, so pCO₂ ∝ HCO₃² and
//            each carbon taken up brings a carbonate with it (ΔDIC = ΔHCO₃/2
//            + ΔCO₂ of the pulse's carbon per kg). Compensation takes ~5–10
//            kyr here, so at 10 kyr it is mostly, not wholly, done.
//   100 kyr  weathering: the excess X decays as dX/dt = −(F(p) − F(p₀)),
//            silicate weathering's own form (carbon.js's: the climate's map
//            fixed, the sensitivity through Tₑ, and pCO₂^0.3) at the
//            compensated partition's p(X), from X = pulse at t = 0. Its
//            linear e-folding is `tau`. It sees the compensated pCO₂ from
//            the start, so it misses the extra weathering of the first
//            ~10 kyr's higher pCO₂ (~12% of a 1,000 Pg pulse) and sits above
//            the measured share.
// Large pulses can empty the bioturbated layer of carbonate (~4,000 Pg C
// when every bin is full) before compensation is done; the theory assumes
// enough. Measured headless (tools/pulse-run.mjs, three seeds alike within
// ~1 point): 500 Pg leaves 16.5–16.7%, 6.6–7.4%, 2.5–2.6% (theory 15.8, 5.1,
// 3.1); 2,000 Pg 24%, 7.1–7.5%, 2.6% (20.9, 5.3, 3.1); 10,000 Pg 51%,
// 11.1–11.5%, 2.6% (45.5, 6.2, 3.4). Late in the tail the share e-folds over ~140 kyr against
// the theory's 180 and Archer's ~300 (from memory); reported, not tuned.
import { OC, dicFor, speciate } from './oceancarbon.js';
import { CARBON } from './carbon.js';

/** A copy of a sea's state that steps on its own. */
export function cloneSea(s) {
  const c = Object.create(Object.getPrototypeOf(s));
  for (const k of Object.keys(s)) {
    const v = s[k];
    c[k] = ArrayBuffer.isView(v) ? v.slice() : v && typeof v === 'object' ? structuredClone(v) : v;
  }
  return c;
}

/** Each box's preformed carbon per kg added when the air rises by Δ ppm (mol/kg), closed or compensated. */
function uptake(st, delta, compensated) {
  const per = st.map(b => {
    if (compensated) {
      // CO₃ fixed: [CO₂] ∝ HCO₃², so HCO₃ ∝ √p; half of ΔHCO₃ is the pulse's, half the floor's carbonate.
      const r = (b.pco2 + delta) / b.pco2;
      return 0.5 * b.hco3 * (Math.sqrt(r) - 1) + b.co2 * (r - 1);
    }
    return dicFor(b.pco2 + delta, b.alk, b.k) - b.dic;
  });
  per[2] = per[1];   // the deep's preformed water is the cold box's
  return per;
}

/** The air's rise (ppm) that holds X Pg of added carbon in air and sea. */
function partition(st, M, X, compensated) {
  const mol = X * OC.PG, ppm = OC.PPM * OC.PG;
  let lo = 0, hi = X / OC.PPM;
  for (let it = 0; it < 60; it++) {
    const d = 0.5 * (lo + hi), u = uptake(st, d, compensated);
    const held = ppm * d + M[0] * u[0] + M[1] * u[1] + M[2] * u[2];
    if (held > mol) hi = d; else lo = d;
  }
  return 0.5 * (lo + hi);
}

/** The theory's shares at 1, 10 and 100 kyr for a pulse of PgC into `sea` as it is now. */
export function pulseTheory(sea, PgC) {
  const x = sea.context(), M = [sea.Mw, sea.Mc, sea.Md];
  const st = [0, 1, 2].map(b => {
    const dic = sea.I[1 + b] / M[b], alk = sea.I[4 + b] / M[b], s = speciate(dic, alk, x.k[b], sea.hb[b]);
    return { dic, alk, k: x.k[b], pco2: s.pco2, hco3: s.hco3, co2: s.co2 };
  });
  const s = sea.in, p0 = sea.pco2;
  const F = p => CARBON.V0 * s.wRel * Math.exp(CARBON.SENS * Math.log2(p / s.wCO2) / CARBON.TE) * Math.pow(p / CARBON.PCO2_0, CARBON.CO2_EXP);
  const F0 = F(p0);
  // The excess's decay under weathering at the compensated partition (RK4, 250-yr steps).
  const dX = X => -(F(p0 + partition(st, M, Math.max(0, X), true)) - F0);
  const Xat = {};
  let X = PgC, t = 0;
  const h = 250;
  for (const T of [1e3, 1e4, 1e5]) {
    while (t < T - 1e-6) {
      const k1 = dX(X), k2 = dX(X + 0.5 * h * k1), k3 = dX(X + 0.5 * h * k2), k4 = dX(X + h * k3);
      X += h * (k1 + 2 * k2 + 2 * k3 + k4) / 6; t += h;
    }
    Xat[T] = X;
  }
  const share = (d, X0 = PgC) => OC.PPM * d / X0;
  // The linear e-folding: the compensated system's carbon per ppm over weathering's per ppm.
  const e = 1, dp = partition(st, M, e, true), dF = (F(p0 + dp) - F0);
  return {
    s1: share(partition(st, M, Xat[1e3], false)),
    s10: share(partition(st, M, Xat[1e4], true)),
    s100: share(partition(st, M, Xat[1e5], true)),
    closed: share(partition(st, M, PgC, false)), compensated: share(partition(st, M, PgC, true)),
    tau: e / dF,
  };
}

/** A pulse and its twin: the share left in the air as the planet runs. */
export class PulseTag {
  constructor(carbon, PgC) {
    this.PgC = PgC;
    this.twin = cloneSea(carbon.sea);
    this.theory = pulseTheory(carbon.sea, PgC);
    carbon.pulse(PgC);
    this.t = 0;
    this.marks = [1e3, 1e4, 1e5];
    this.at = [null, null, null];
    this.share = 1;
  }
  /** After the sea's step of dt years: the twin over the same step with the same inputs. */
  step(carbon, dt) {
    if (!(dt > 0)) return;
    const { hyps, ...inputs } = carbon.sea.in;
    this.twin.step(dt, inputs);
    const t0 = this.t, s0 = this.share;
    this.t += dt;
    this.share = (carbon.sea.I[0] - this.twin.I[0]) / (this.PgC * OC.PG);
    for (let k = 0; k < 3; k++) {
      const T = this.marks[k];
      if (this.at[k] === null && this.t >= T) this.at[k] = s0 + (this.share - s0) * (T - t0) / (this.t - t0);
    }
  }
  get info() { return { PgC: this.PgC, t: this.t, share: this.share, at: this.at.slice(), theory: { ...this.theory } }; }
}
