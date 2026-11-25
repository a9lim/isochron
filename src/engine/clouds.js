// Clouds in the energy balance (standard pieces; synthesis as built). Each of the moisture's six
// points of the year diagnoses two layers of cloud per cell from the climate's own state, and the
// next energy balance sees them through the year:
//
//   high   deep convection's anvils and the fronts' cirrus, where it rains: c = HI_MAX (1 − e^{−P/HI_P}),
//          P the rain (mm/day). Its top stands at a fixed temperature, T_TOP (the fixed anvil
//          temperature: Hartmann and Larson 2002, from memory; the convective outflow sits where
//          the water vapour's cooling falls off, which a warmer surface lifts, not warms).
//   low    layer clouds in a humid column, LO_MAX ramp(r, LO_R1, LO_R2) at column humidity r, and
//          over the open sea stratocumulus under a strong inversion, SC_MAX ramp(EIS, SC_E1, SC_E2)
//          within SC_LAT of the equator: the estimated inversion strength (Wood and Bretherton 2006,
//          from memory), EIS = LTS − Γₘ(850 hPa)(z₇₀₀ − LCL), with the lower troposphere's stability
//          LTS = θ₇₀₀ − θ_s (Klein and Hartmann 1993). The free troposphere's temperature is a
//          moist adiabat from a reference surface: within 20° the rain-weighted mean surface
//          temperature (the weak temperature gradient: the tropics' free troposphere is set where
//          it convects), beyond 40° the zonal mean, blended between. The two low kinds overlap at
//          random: 1 − (1 − layer)(1 − stratocumulus).
//
// Shortwave: the layers over the clear sky's albedo α (the climate's `albedo`, its surface and
// the clear air) by the adding formula, low first, then high, each covering c of the cell at
// random overlap: α ← (1 − c) α + c (a + (1 − a)² α / (1 − a α)) (standard: a reflecting layer of
// albedo a over a surface of α, the light between them reflected back and forth). Each layer's a
// brightens at a low sun, a + Z sin²φ (1 − a) (cloud reflects more of a slanting beam; synthesis:
// the latitude stands for the day's mean zenith angle). Over snow and ice the layers add little:
// the cloud's masking of the ice's albedo comes out of the formula.
//
// Longwave: the high cloud replaces the clear sky's outgoing longwave with its top's emission,
// OLR ← (1 − c) OLR + c min(σ T_TOP⁴, OLR), OLR = A + B T the energy balance's clear sky (at most
// L_MAX: a clear column's saturates); the low
// clouds' tops are about as warm as the surface below them and change little (fitted: nothing).
// Since T_TOP is fixed, the cloud's effect grows with the surface's warmth (c B a kelvin): the
// high clouds' feedback (standard, its sign and rough size). The energy balance takes both as
// forcing sampled from its last state (`shortwave`, `longwave`), inside its fixed point.
//
// The clouds are the climate's: the rain (src/engine/climate.js's moisture), its humidity, the
// sea's surface (the gyres' anomaly with it) and the zonal and tropical temperatures; nothing is
// held, so their feedbacks are what the climate makes of them. The constants were fitted to CERES
// EBAF 4.2's cloud forcing (tools/earth/obs.py) on today's Earth, then tuned with the rest of the
// climate (tools/earth/tune.mjs; tools/earth/README.md). Undrawn.
import { CLIMATE, wsat } from './climate.js';
import { shared } from './shared.js';
import { parallel } from './pool.js';

export const CLOUDS = {
  ON: true,
  HI_MAX: 0.27, HI_P: 0.72,                 // high: its largest share, and the rain (mm/day) that brings 63% of it
  LO_MAX: 0.48, LO_R1: 0.1, LO_R2: 0.83,    // low: the humid column's layer cloud
  SC_MAX: 0.24, SC_E1: 7.1, SC_E2: 15.3,    // and stratocumulus at sea, by EIS (K)
  SC_LAT: [45, 60],                         // degrees: stratocumulus from the inversion within the first, none past the second
  LCL: 0.5,                                 // km: the marine boundary layer's cloud base (EIS)
  A_HI: 0.31, A_LO: 0.23, Z: 0.41,          // each layer's albedo, and its brightening at a low sun
  T_TOP: 220,                               // K: the high cloud's top
  // W/m²: the clear sky's outgoing longwave that a cloud masks, at most. A clear column's saturates as
  // its vapour grows opaque (src/engine/runaway.js's premise), and CERES's clear sky reaches ~300 at
  // most (the dry subtropics); without it the clouds' longwave grew with A + BT through a hot planet
  // (60 W/m² at a 61 °C mean) and held the runaway off.
  L_MAX: 300,
  // Before the first points of the year are diagnosed: today's Earth's means.
  LO0: 0.35, HI0: 0.20,
};

const NP = 6;
const SIGMA = 5.670374e-8;
const ramp = (x, a, b) => { const t = (x - a) / (b - a); return t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t); };

// A surface parcel's ascent (standard): air at 1000 hPa and RH_PARCEL rises dry until it saturates,
// then pseudo-adiabatically; its temperature at 700 hPa by the surface's (°C, a table every 0.5 K),
// and the moist lapse rate (K/km) at T (K) and p (hPa).
const RD = 287, CP = 1004, LV = 2.5e6, EPS = 0.622, G = 9.81, RH_PARCEL = 0.8;
const qsat = (T, p) => { const es = 6.112 * Math.exp(17.67 * (T - 273.15) / (T - 29.65)); return EPS * es / (p - es); };
export function moistLapse(T, p) { const q = qsat(T, p); return 1000 * G * (1 + LV * q / (RD * T)) / (CP + LV * LV * q * EPS / (RD * T * T)); }
const T7_LO = -70, T7_STEP = 0.5, T7 = (() => {
  const out = new Float64Array(241);
  for (let k = 0; k < out.length; k++) {
    let T = T7_LO + T7_STEP * k + 273.15;
    const q0 = RH_PARCEL * qsat(T, 1000);
    for (let p = 1000; p > 700; p -= 1) {
      const q = qsat(T, p);
      T -= q > q0 ? RD * T / (CP * p) : (RD * T / p) * (1 + LV * q / (RD * T)) / (CP + LV * LV * q * EPS / (RD * T * T));
    }
    out[k] = T;
  }
  return out;
})();
/** A surface parcel's temperature (K) at 700 hPa from 1000 hPa and T °C (at RH_PARCEL). */
export function t700(T) {
  const x = Math.max(0, Math.min(T7.length - 1.001, (T - T7_LO) / T7_STEP)), k = Math.floor(x), w = x - k;
  return T7[k] * (1 - w) + T7[k + 1] * w;
}

export class Clouds {
  constructor(climate) {
    this.c = climate;
    const n = this.n = climate.grid.n;
    this.lo = shared(Float32Array, NP * n).fill(CLOUDS.LO0);   // point p's at p n + i (shared with the engine's pool)
    this.hi = shared(Float32Array, NP * n).fill(CLOUDS.HI0);
    this.eis = shared(Float32Array, n);                         // the last point's EIS at sea (K), for the tools
    this.s2 = Float64Array.from(climate.lat, la => Math.sin(la) ** 2);
    this.band = new Float64Array(90); this.bandA = new Float64Array(90);
    this.stats = { lo: CLOUDS.LO0, hi: CLOUDS.HI0, cover: 1 - (1 - CLOUDS.LO0) * (1 - CLOUDS.HI0), points: 0 };
    this.version = 0;
  }

  /** Point p's clouds from its moisture (`Climate.phase`, after the rain): T the sea-level temperature there. */
  phase(p, T) { const it = this.phaseSteps(p, T); while (!it.next().done); }
  /** `phase` as the climate's cycle runs it: the cells by chunk (`cloudCells`), on the engine's pool where there is one. */
  *phaseSteps(p, T) {
    let sl = 0, sh = 0, sc = 0, sa = 0;
    for (const r of yield* parallel('clouds', cloudCells, this.args(p, T), this.n)) { sl += r[0]; sh += r[1]; sc += r[2]; sa += r[3]; }
    // The year's means, as each point arrives.
    const st = this.stats, f = 1 / Math.min(NP, st.points + 1);
    st.lo += (sl / sa - st.lo) * f; st.hi += (sh / sa - st.hi) * f; st.cover += (sc / sa - st.cover) * f;
    st.points++;
    if (p === NP - 1) this.version++;
  }
  /** Point p's arguments for `cloudCells`, with the free troposphere's reference taken over the globe. */
  args(p, T) {
    const K = CLOUDS, C = CLIMATE, c = this.c, n = this.n, g = c.grid, lat = c.lat;
    const W = c.W[p], P = c.Pph[p], sst = c.ocean ? c.ocean.fine.sst : null, land = c.landMask, z = c.elevPos;
    // The free troposphere's reference: the zonal mean (2° bands) and, within 20°, the rain-weighted mean surface.
    const zb = this.band, za = this.bandA;
    zb.fill(0); za.fill(0);
    let tw = 0, ww = 0;
    for (let i = 0; i < n; i++) {
      const a = g.area[i], b = c.band[i];
      zb[b] += a * T[i]; za[b] += a;
      if (Math.abs(lat[i]) < 0.349) { const Ts = land[i] ? T[i] - C.LAPSE * z[i] : T[i] + (sst ? sst[i] : 0), w = a * (P[i] + 1e-3); tw += w * Ts; ww += w; }
    }
    for (let b = 0; b < 90; b++) zb[b] = za[b] > 0 ? zb[b] / za[b] : 0;
    const Tw = ww > 0 ? tw / ww : 27;
    return { T, W, P, sst, land, z, lat, area: g.area, lo: this.lo, hi: this.hi, eis: this.eis, o: p * n, zb: Array.from(zb), Tw, LAPSE: C.LAPSE, CLOUDS: { ...K } };
  }

  /** The layers' shares at cell i at year phase τ (the six points, linear in time and periodic). */
  at(i, tau) {
    const x = ((tau * NP - 0.5) % NP + NP) % NP, k = Math.floor(x), w = x - k, k1 = (k + 1) % NP, n = this.n;
    return [this.lo[k * n + i] * (1 - w) + this.lo[k1 * n + i] * w, this.hi[k * n + i] * (1 - w) + this.hi[k1 * n + i] * w];
  }

  /** Each layer's albedo at cell i (its sun angle). */
  layerAlbedo(i) {
    const K = CLOUDS, s = this.s2[i];
    return [K.A_LO + K.Z * s * (1 - K.A_LO), K.A_HI + K.Z * s * (1 - K.A_HI)];
  }
}

/**
 * Point p's clouds on cells [a, b) (Clouds.phase, and the engine's pool's kernel: src/engine/kernels.js):
 * the low and high layers' shares and the EIS at sea written, the area-weighted sums of low, high,
 * cover and area returned. zb the 2° bands' mean temperature and Tw the deep tropics' rain-weighted
 * surface (the free troposphere's reference).
 */
export function cloudCells(x, a, b) {
  const { T, W, P, sst, land, z, lat, area, lo, hi, eis, o, zb, Tw, LAPSE } = x, K = x.CLOUDS || CLOUDS;
  const s1 = K.SC_LAT[0] * Math.PI / 180, s2 = K.SC_LAT[1] * Math.PI / 180, kap = Math.pow(1000 / 700, RD / CP), zlog = RD / G * Math.log(1000 / 700) / 1000;
  let sl = 0, sh = 0, sc = 0, sa = 0;
  for (let i = a; i < b; i++) {
    const sea = !land[i], Tsea = T[i] + (sea && sst ? sst[i] : 0);
    const Ts = sea ? Math.max(-1.8, Tsea) : T[i] - LAPSE * z[i];
    const r = Math.min(1.2, W[i] / wsat(Ts));
    const h = K.HI_MAX * (1 - Math.exp(-Math.max(0, P[i]) / K.HI_P));
    let l = K.LO_MAX * ramp(r, K.LO_R1, K.LO_R2);
    const al = Math.abs(lat[i]);
    if (sea && al < s2) {
      const ice = ramp(-Tsea, 1.5, 6), y = (lat[i] + Math.PI / 2) / Math.PI * 90 - 0.5;
      const b0 = Math.max(0, Math.min(88, Math.floor(y))), bw = Math.min(1, Math.max(0, y - b0)), Tz = zb[b0] * (1 - bw) + zb[b0 + 1] * bw;
      const wt = ramp(al, 0.698, 0.349), Tref = wt * Tw + (1 - wt) * Tz;
      const T7v = t700(Tref), TK = Ts + 273.15, Tm = 0.5 * (TK + T7v);
      const e = T7v * kap - TK - moistLapse(Tm, 850) * (zlog * Tm - K.LCL);
      eis[i] = e;
      const s = K.SC_MAX * ramp(e, K.SC_E1, K.SC_E2) * ramp(al, s2, s1) * (1 - ice);
      l = 1 - (1 - l) * (1 - s);
    } else eis[i] = 0;
    lo[o + i] = l; hi[o + i] = h;
    const A = area[i];
    sl += A * l; sh += A * h; sc += A * (1 - (1 - l) * (1 - h)); sa += A;
  }
  return [sl, sh, sc, sa];
}

/** The planetary albedo with the layers over a clear sky's a: low (cl, its albedo al) then high (ch, ah), each by the adding formula. */
export function shortwave(a, cl, al, ch, ah) {
  a = (1 - cl) * a + cl * (al + (1 - al) * (1 - al) * a / (1 - al * a));
  return (1 - ch) * a + ch * (ah + (1 - ah) * (1 - ah) * a / (1 - ah * a));
}

/** The high cloud's longwave effect (W/m², warming) over a clear sky's outgoing L (at most L_MAX): c (L − min(σT_TOP⁴, L)). */
export function longwave(L, ch) {
  const E = SIGMA * CLOUDS.T_TOP ** 4, l = Math.min(L, CLOUDS.L_MAX);
  return l > E ? ch * (l - E) : 0;
}

/** σ T_TOP⁴ (W/m²): the high cloud's top's emission. */
export function topEmission() { return SIGMA * CLOUDS.T_TOP ** 4; }
