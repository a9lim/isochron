// The climate (docs/climate.md): temperature through the year,
// the winds' template, moisture and rain, and the soft climate zones.
//
// Temperature. A seasonal energy-balance model (standard: Budyko, Sellers,
// North): C ∂T/∂t = S(1 − α) − (A + B T) + 5.35 ln(CO₂/CO₂₀) + ∇·(D ∇T), with
// the heat capacity of the ocean's mixed layer at sea and of the air over
// land. The year is solved as harmonics, T = T̄ + Σₖ Re(T̂ₖ e^{ikωt}), each
// one elliptic: (B + ikωC) T̂ₖ − ∇·D∇T̂ₖ = F̂ₖ, so the oceans' seasonal lag and
// the continents' wide seasons come straight out of it. Albedo (snow, sea
// ice, deserts) depends on the temperature through the year, so the absorbed
// sunlight is re-evaluated at 24 points of the year from the last solution
// and its harmonics re-solved: a fixed point, warm-started and iterated with
// Anderson's mixing (`energyBalance`), which also keeps the ice-albedo
// feedback's hysteresis. The diffusivity falls toward the poles (synthesis). T is the sea-level temperature; the
// surface is colder by the lapse rate. Solved on the level below the
// surface's (220 km cells): heat spreads over thousands of km.
//
// Circulation (synthesis). A template, not a solve: the ITCZ follows the
// warmest latitude in each sector of longitude, the Hadley cell's edge scales
// as Held and Hou's, ∝ √ΔT / Ω, and surface pressure has the ITCZ's trough,
// the subtropical highs, the subpolar lows and the polar highs, plus a low
// over land warmer than its latitude and a high over land colder than it
// (the monsoons). The surface wind balances the pressure gradient against
// Coriolis and friction, r u + f k×u = −∇p/ρ: geostrophic with a cross-isobar
// drift at mid-latitudes, down the gradient at the equator.
//
// Moisture (synthesis). Column water W is carried by those winds and eddy
// diffusion, ∇·(uW) − ∇·(κ∇W) = E − P, steady, at six points of the year.
// The sea evaporates toward saturation (Clausius–Clapeyron, ~6.5%/K); land
// recycles part of its rain, by its soil's wetness (the ground's evaporative
// efficiency at that point of the year), and a lake's share of a cell
// evaporates as the sea does (a fifth as much when frozen). It rains where the column passes 75% of
// saturation (convergence and cooling: the ITCZ, air rising over mountains),
// where air is lifted up a slope, and lightly elsewhere except where the air
// is sinking (the subtropical highs). Lee slopes get rain shadows because the
// air that crosses a range has already rained out. Solved by Gauss–Seidel
// sweeps in four directions of the globe (fast sweeping), warm-started.
//
// Zones (synthesis, soft-everywhere). Köppen's classes (Peel and others'
// thresholds, from memory) are thresholds on the monthly temperatures and
// precipitation. Each threshold here is a logistic whose width stands for the
// spread from year to year, so each cell holds a probability over the
// fourteen classes.
//
// The ground (src/engine/soil.js). Each cycle's months (surface temperature,
// rain, the potential evaporation of Budyko's scale month by month) drive the
// soil's bucket, snowpack and ground heat to their periodic year: the closure
// the year steps live from (src/engine/ground.js). Its runoff, by month and in
// the year, goes to the landscape and the rivers; its evaporative efficiency
// to the next cycle's moisture. Lakes (src/engine/lakes.js) add open water to
// the moisture balance and the albedo.
//
// The plants' cover (src/engine/vegetation.js, through src/engine/life.js:
// `cover`, trees' and grass's shares), once known, sets land's albedo
// (VECODE's surface albedos; trees mask snow) in place of the zones', and
// land's evaporation: bare ground and grass at the ground's β, trees at √β.
//
// Clouds (src/engine/clouds.js, `clouds`): each point of the year's moisture diagnoses high cloud
// where it rains and low cloud from the column's humidity and, at sea, the inversion's strength;
// the next energy balance sees them over the clear sky's albedo (`albedo`, the surface and the clear
// air) by the adding formula, and the high cloud's cold top in the longwave over A + B T.
//
// Dust (src/engine/aeolian.js, `dust`) packs its sources at each point of the
// year after the winds and rain, and is solved after the six; its last
// cycle's darkening of snow and ice (`dustDark`) enters the albedo, and its
// forcing (`dustForcing`) the absorbed sunlight.

import { buildGrid, gradient } from '../grid/icosphere.js';
import { makeTransfer, prolong, prolongT, restrict } from '../grid/transfer.js';
import { EARTH_ORBIT, S0, insolation, solarLongitude, monthPhase } from './orbit.js';
import { Soil, SOIL, potentialEvaporation } from './soil.js';
import { landAlbedo, VEG } from './vegetation.js';
import { ICE } from './ice.js';
import { SeaHeat } from './seaheat.js';
import { AirHeat, AIRHEAT } from './airheat.js';
import { Clouds, CLOUDS, shortwave, longwave } from './clouds.js';

// Tuned on today's Earth (2026-11-17; tools/earth/: climate-score.mjs against observed climatologies,
// tune.mjs): the constants below marked "Earth" were set by a pattern search over the land's January,
// July and annual temperature, the sea's surface and ice by latitude, the land's rain and the Köppen
// map, settled at level 6, and since the clouds the top of the atmosphere against CERES. Before it the
// climate had been tuned to Earth's numbers from memory on seeded planets; on Earth's own map it scored
// 25% of the land's Köppen classes and 56% of its groups right (53% and 74% after the first tuning, 48%
// and 71% with the clouds), with land 3.8 K cold in the year and 14 K off in January.
export const CLIMATE = {
  // OLR = A + B·T (W/m², T in °C), the clear sky's: B North's fit to Earth (from memory); A Earth's,
  // against CERES's clear sky (its 268 W/m² over a mean ~15 °C: ~238; tuned 234), the clouds' longwave
  // taken from it (src/engine/clouds.js). Before the clouds, 206: the all-sky's, North's 203.3 raised.
  A: 234, B: 2.09,
  // Heat diffusion, W m⁻² K⁻¹ on the unit sphere (the annual mean), at the equator; it falls toward
  // the poles as 1 + D_LAT sin²φ (each edge's weight carries it). Synthesis: a uniform 0.45 was
  // tuned to the opening's fourth cycle, a transient; converged it left the planet 2–3 K cold, 60°
  // 5–6 K colder than Earth's and 16–23% of the sea under ice. Uniform D enough for the sea ice
  // (0.75) made the polar cap a flat −7 °C (Earth's Arctic ~−18, from memory); falling poleward
  // (the polar air's stable layering carries less heat per kelvin of gradient) it gives 70–80°
  // at −9 to −14 °C, 60° near 0 and the sea ice at 8–11%: Earth's ~7% (from memory) with
  // Antarctica's area as sea, as this planet's ocean poles have it. Earth: 0.85 and −0.75 (from 1.0
  // and −0.6), so the tropics hold more of their heat (Earth's tropical sea was 3–5 K cold); 0.91 and −0.85 with the sea's heat transport (src/engine/seaheat.js) beside it;
  // 0.86 with the air's (src/engine/airheat.js); 1.14 with the clouds (retuned with them: at 0.86 the
  // tropical sea ran ~4 K warm and the Southern Ocean's ice 25 points too wide).
  D: 1.14, D_LAT: -0.85,
  // For the seasonal harmonics: transport smooths a season's land–sea contrast less. Synthesis: with
  // the capacity mixed over each coarse cell, 0.1 left 55–65° continents with summers ~3 K cooler
  // than Earth's (from memory) and D climates at 15% of land, and 0.085 stood in for that mixing;
  // with each cell's own seasons (SUBGRID), 0.085 made 60–70° N land's summers 2–4 K warm, and 0.11
  // holds them near Earth's (~11 °C in June–August, from memory). Earth: 0.29 with maritime air (an
  // exchange with the sea's air carried inland, since replaced by the wind's own transport,
  // src/engine/airheat.js); 0.49 with the sea's heat transport and the belts at Earth's latitudes; 0.44 with the clouds.
  D_SEASON: 0.44,
  // Continental seasons (`continentalSeasons`): each cell's seasonal harmonics from its own heat
  // capacity, not its coarse cell's mixed one.
  SUBGRID: true,
  // W m⁻² K⁻¹: each cell's exchange with its coarse cell's mean (synthesis): onshore winds carry the
  // sea's air over a coast's first ~100 km (ρc_p h u/L ≈ 25 for a 1 km layer at 5 m/s across 220 km,
  // onshore about a third of the time), so a coast's land has seasons about halfway between the
  // sea's and inland's, as west coasts do (Bergen's ~13 K against inland Scandinavia's ~20–25,
  // Seattle's against Spokane's; from memory). 0: none below the coarse grid's scale; ∞: the mixed capacity.
  SUB_K: 8,
  C_OCEAN: 7.9,            // W yr m⁻² K⁻¹: a 60 m mixed layer
  C_LAND: 0.61,            // Earth (from 0.3, then 0.46: the air's column with the ground's seasonal layer)
  C_ICE: 1.2,
  LAPSE: 5.4,              // K/km. Earth (from 6.5, then 5.6): the surface's, which broad uplands warm (Tibet's air)
  // The clear sky's albedo at the top of the atmosphere (the surface and the clear air; the clouds
  // are src/engine/clouds.js's, over it), + ALB_POLAR·sin²φ at sea and ALB_POLAR_LAND·sin²φ on land
  // (a low sun: water's reflection grows at a slant, land's less). Earth, against CERES's clear sky
  // (the sea's ~0.10 in the tropics, deserts' ~0.3, the ice sheets' ~0.65; tuned). Before the clouds,
  // the planetary albedo with them folded in: the sea 0.25 + 0.12 sin²φ, land 0.225 (from 0.27: a
  // diffusive balance imports heat only where land is colder than its neighbours, so land as bright as
  // it is left subtropical land ~10 K cold), snow and the ice sheets 0.62, sea ice 0.56.
  ALB_OCEAN: 0.09, ALB_LAND: 0.18, ALB_POLAR: 0.13, ALB_POLAR_LAND: 0.07,
  ALB_SNOW: 0.44, ALB_ICE: 0.62, ALB_SEAICE: 0.46,   // land's snow (trees mask it further: VEG), the ice sheets', sea ice's
  ALB_DESERT: 0.07, ALB_FOREST: -0.03,
  ALB_COVER: 0,            // snow-free land's offset under the plants' cover (which also masks snow): Earth (from 0.03)
  CO2: 280, CO2_REF: 280,  // ppm
  S: S0,
  // Circulation and moisture
  OMEGA: 7.292e-5,         // rad/s, the planet's spin
  FRICTION: 4.5e-5,        // 1/s
  ITCZ_PEN: 0.5,           // K per (latitude/14°)²: the ITCZ's pull toward the equator, against the warmest latitude in each sector (Earth; 0.6 before)
  ITCZ_MAX: 0.5,           // rad: the ITCZ's reach from the equator (Earth; 0.35 kept India's monsoon trough at 20°)
  ITCZ_SMOOTH: 3,          // passes of the ITCZ's smoothing along the sectors
  // hPa per K: the low where it's warmer than its latitude, the high where it's colder, bounded softly at
  // THERMAL_MAX (hPa). Earth's winter highs over cold continents and lows over warm seas are ~1 hPa/K
  // (from memory). Earth: 0.75, then 0.4, 0.2, and 0.12 with the air's heat transport, whose winds at
  // 0.6–1 carried a summer continent's heat into its interior (Siberia's July 25–28 °C against 16) and at
  // 1.5 ran away; with the clouds, which shade a summer continent's rain, 1.0 holds (against 0.12:
  // January's land 6.4 → 5.7 K rms, eastern North America's January 2 K colder; Siberia's July 2.5 K warm).
  THERMAL: 1.0, THERMAL_MAX: 30,
  // The Hadley edge, where the subtropical highs stand: Held and Hou's √ΔT/Ω, HADLEY degrees at
  // an equator-to-60° contrast of HADLEY_DT; the subpolar lows at LOWS of it. Earth: its highs at
  // ~30–35° and its lows at ~60–65° (the Southern Ocean's trough ~65° S; from memory), so its
  // westerlies blow strongest at 45–55°. (A 38 K reference put Earth's edge at 26° and its lows at
  // 54°: the westerlies peaked at 30–40° and blew easterly past 50° N and 55° S, over Europe and
  // Drake Passage.)
  HADLEY: 30, HADLEY_DT: 28, LOWS: 2.05,   // Earth
  // The subtropical highs' share that land takes away (smoothed over ~1,500 km): 0 zonal bands, 1
  // oceanic cells (Earth's highs sit over the eastern oceans, and their western flanks carry the sea's
  // air up the continents' east coasts: zonal bands left eastern China and the eastern US as deserts).
  HIGH_LAND: 0.75,         // Earth (0.85 before the sea's heat transport)
  CARRY: 0.4,              // share of the down-gradient (frictional) drift the moisture-bearing layer takes
  KAPPA_W: 1.65e5,         // km²/day, eddy mixing of moisture (Earth; 7e4, then 1.45e5)
  // The eddies' mixing is the storm tracks': KW_TROP of it in the deep tropics, the whole past KW_LAT[1]°
  // (smoothly from KW_LAT[0]°), where the mean circulation carries the water (standard in kind).
  KW_TROP: 0.3, KW_LAT: [10, 30],
  CONV_A: 15.6,            // convective rain = (W_s/60 mm) e^{a (r − r₀)} mm/day at column humidity r
  CONV_R0: 0.743,          //   (the shape of Bretherton and others' tropical fit, from memory; r₀ Earth, 0.603, then 0.693)
  RAIN_BG: 0.14,           // 1/day where the air isn't sinking (Earth; 0.08 ungated, then 0.12)
  // Descent (synthesis on Sverdrup's balance, βv = f ∂w/∂z: Rodwell and Hoskins's subtropical
  // anticyclones): air moving equatorward in the subtropics is sinking aloft, poleward rising. The
  // carrying wind's equatorward speed over SUB_V (tapered within 15° of the equator, where f fails)
  // is a cell's descent, 0–1: it raises the humidity convection needs by SUB_R0 and holds back the
  // background rain by e^{−SUB_BG}. So the Sahara under the trades is dry while eastern China under
  // the summer's southerlies rains, at the same latitude.
  SUB_V: 5, SUB_R0: 0.15, SUB_BG: 2.25,
  // The background rain needs moist air: its rate rises from nothing at a column humidity of BG_R1
  // to RAIN_BG at BG_R2 (smoothly; the humidity is the last solve's at that point of the year), so a
  // hot desert's air, holding much water but far from saturation, doesn't drizzle (synthesis).
  BG_R1: 0.2, BG_R2: 0.65,
  // Convection needs a warm surface: its rain rises from nothing at a surface temperature of CONV_T0
  // (°C) to Bretherton's curve at CONV_T1, so a cool plateau's humid winter air doesn't storm (synthesis).
  CONV_T0: 17, CONV_T1: 28,
  RAIN_ORO: 1.5,           // 1/day per m/s of lift up a slope (Earth; 2.5 rained 2 m a year on the Great Basin)
  EVAP: 0.25,              // 1/day toward saturation at 7 m/s (Earth; 0.35 before)
  RAIN_MAX: 25,            // mm/day in a cell: past it the column stays supersaturated and carries on (precipitation efficiency)
  LAND_EVAP: 0.56,         // land's evaporation relative to the sea's, at the soil's full efficiency (β = 1): retuned
  LAND_EVAP_COVER: 0.46,   // the same with the plants' cover (src/engine/vegetation.js's factors): Earth (0.52 before)
  LAND_FLUX: 1,            // over land the air takes the ground's own evaporation (its year's, × this; 1 keeps the water), once the ground has a year; 0: the deficit's, as the sea
  LAKE_ICE: 0.15,          // a frozen lake's evaporation relative to open water's
  SWEEPS: 6,               // Gauss–Seidel sweeps of the moisture balance on the CPU, warm-started (four times as many cold)
  GPU_PASSES: 160,         // Jacobi passes of the moisture balance on the GPU, warm-started (four times as many cold)
  F_VOLC: 0,               // W/m²: the volcanoes' mean forcing against the opening's (src/engine/volcanoes.js)
  F_PEOPLE: 0,             // W/m²: the people's waste heat and sulfate (src/engine/peoplelink.js; CO₂'s comes with the carbon)
  F_OLR: 0,                // W/m², uniform: the outgoing longwave's departure from A + BT as it saturates, and the steam's (src/engine/runaway.js; set before each step)
  // The energy balance's fixed point (absorbed sunlight reads the temperature through snow and
  // sea ice), by Anderson's mixing over the last EBM_DEPTH steps (`energyBalance`): a cycle steps
  // until a step moves T by less than EBM_TOL (K rms over the year and the globe), at most
  // EBM_MAX steps warm and EBM_MAX_COLD cold.
  EBM_TOL: 0.02, EBM_MAX: 2, EBM_MAX_COLD: 6, EBM_DEPTH: 3,
  // The CPU's harmonic solves (COCG): relative residual and iterations, warm then cold.
  EBM_CG: [1e-5, 60, 1e-7, 300],
  // The CPU's moisture: past SWEEPS, sweeps carry on in fours until the last four moved no
  // cell's column by more than MOIST_TOL of its saturation, at most MOIST_MAX (warm; ×4 cold).
  MOIST_TOL: 1e-3, MOIST_MAX: 48,
  // The climate has settled (`stats.settled`, the cycle it did) once two cycles running moved
  // the mean temperature less than SETTLE_T (K) and rain, global and on land, less than SETTLE_P
  // of itself; at the latest SETTLE_MAX cycles. The opening's references wait for it.
  SETTLE_T: 0.02, SETTLE_P: 0.005, SETTLE_MAX: 16,
  // The zones' widths: the year's own spread (src/engine/year.js) where there is one, with these
  // floors in quadrature (the classification's own uncertainty: a cell is 55–220 km of climates);
  // without one, the fixed widths (K, and in log rain).
  ZONE_FLOOR_T: 0.5, ZONE_FLOOR_P: 0.1, ZONE_T: 1.5, ZONE_P: 0.25,
};

export const ZONES = ['Af', 'Am', 'Aw', 'As', 'BW', 'BS', 'Cf', 'Cs', 'Cw', 'Df', 'Ds', 'Dw', 'ET', 'EF'];
export const NZ = 16;          // padded to four vec4s per cell for the GPU
const NS = 24;                 // samples of the year for albedo
const NP = 6;                  // points of the year for the winds and rain
const NLAT = 181;
const R_KM = 6371, R_M = 6.371e6;
const W0 = 25, WA = 0.065;     // saturated column water (mm) = W0 e^{WA (T − 15)}

const sigmoid = x => 1 / (1 + Math.exp(-x));
const ramp = (x, a, b) => { const t = (x - a) / (b - a); return t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t); };
export const wsat = T => W0 * Math.exp(WA * (Math.max(-45, Math.min(45, T)) - 15));

/**
 * The surface wind from the template's sea-level pressure (hPa about the mean): r u + f k×u =
 * −∇p/ρ, as 3-vectors (m/s) in each cell's tangent plane, written into `wind`. With `carry`,
 * also the moisture's carrying wind: the geostrophic part and CARRY of the frictional drift.
 * The climate's phases and the page's Air chart (src/render/streamlines.js) both take it.
 */
export function surfaceWind(g, pres, omega, wind, carry = null, gp = new Float64Array(3 * g.n)) {
  gradient(g, pres, gp);
  const r = CLIMATE.FRICTION, cy = CLIMATE.CARRY, pos = g.pos, n = g.n;
  for (let i = 0; i < n; i++) {
    const gx = -gp[3 * i] * 100 / R_M / 1.2, gy = -gp[3 * i + 1] * 100 / R_M / 1.2, gz = -gp[3 * i + 2] * 100 / R_M / 1.2;
    const px = pos[3 * i], py = pos[3 * i + 1], pz = pos[3 * i + 2];
    const f = 2 * omega * pz;
    // k × G
    const kx = py * gz - pz * gy, ky = pz * gx - px * gz, kz = px * gy - py * gx;
    const d = r * r + f * f;
    wind[3 * i] = (r * gx - f * kx) / d; wind[3 * i + 1] = (r * gy - f * ky) / d; wind[3 * i + 2] = (r * gz - f * kz) / d;
    if (carry) { carry[3 * i] = (cy * r * gx - f * kx) / d; carry[3 * i + 1] = (cy * r * gy - f * ky) / d; carry[3 * i + 2] = (cy * r * gz - f * kz) / d; }
  }
  return wind;
}

/** Preconditioned conjugate gradients for a complex symmetric system (COCG; real when im = 0). */
export function cocg(g, D, dr, di, br, bi, xr, xi, ws, maxIt, tol) {
  const n = g.n, nbrOff = g.nbrOff, nbr = g.nbr, w = ws.w;
  const { rr, ri, zr, zi, pr, pi, qr, qi, mr, mi } = ws;
  const apply = (ur, ui, outr, outi) => {
    for (let i = 0; i < n; i++) {
      let sr = 0, si = 0;
      for (let t = nbrOff[i], e = nbrOff[i + 1]; t < e; t++) { const j = nbr[t]; sr += w[t] * (ur[j] - ur[i]); si += w[t] * (ui[j] - ui[i]); }
      outr[i] = dr[i] * ur[i] - di[i] * ui[i] - D * sr;
      outi[i] = dr[i] * ui[i] + di[i] * ur[i] - D * si;
    }
  };
  // Jacobi preconditioner: 1 / (d + D Σw).
  for (let i = 0; i < n; i++) {
    let s = 0;
    for (let t = nbrOff[i], e = nbrOff[i + 1]; t < e; t++) s += w[t];
    const ar = dr[i] + D * s, ai = di[i], m2 = ar * ar + ai * ai;
    mr[i] = ar / m2; mi[i] = -ai / m2;
  }
  apply(xr, xi, qr, qi);
  let bn = 0;
  for (let i = 0; i < n; i++) { rr[i] = br[i] - qr[i]; ri[i] = bi[i] - qi[i]; bn += br[i] * br[i] + bi[i] * bi[i]; }
  bn = Math.sqrt(bn) || 1;
  let rhoR = 0, rhoI = 0;
  for (let i = 0; i < n; i++) {
    zr[i] = mr[i] * rr[i] - mi[i] * ri[i]; zi[i] = mr[i] * ri[i] + mi[i] * rr[i];
    pr[i] = zr[i]; pi[i] = zi[i];
    rhoR += rr[i] * zr[i] - ri[i] * zi[i]; rhoI += rr[i] * zi[i] + ri[i] * zr[i];
  }
  let it = 0;
  for (; it < maxIt; it++) {
    apply(pr, pi, qr, qi);
    let sR = 0, sI = 0;
    for (let i = 0; i < n; i++) { sR += pr[i] * qr[i] - pi[i] * qi[i]; sI += pr[i] * qi[i] + pi[i] * qr[i]; }
    const s2 = sR * sR + sI * sI;
    if (!(s2 > 0)) break;
    const aR = (rhoR * sR + rhoI * sI) / s2, aI = (rhoI * sR - rhoR * sI) / s2;
    let rn = 0;
    for (let i = 0; i < n; i++) {
      xr[i] += aR * pr[i] - aI * pi[i]; xi[i] += aR * pi[i] + aI * pr[i];
      rr[i] -= aR * qr[i] - aI * qi[i]; ri[i] -= aR * qi[i] + aI * qr[i];
      rn += rr[i] * rr[i] + ri[i] * ri[i];
    }
    if (Math.sqrt(rn) / bn < tol) { it++; break; }
    let nR = 0, nI = 0;
    for (let i = 0; i < n; i++) {
      zr[i] = mr[i] * rr[i] - mi[i] * ri[i]; zi[i] = mr[i] * ri[i] + mi[i] * rr[i];
      nR += rr[i] * zr[i] - ri[i] * zi[i]; nI += rr[i] * zi[i] + ri[i] * zr[i];
    }
    const r2 = rhoR * rhoR + rhoI * rhoI;
    const bR = (nR * rhoR + nI * rhoI) / r2, bI = (nI * rhoR - nR * rhoI) / r2;
    for (let i = 0; i < n; i++) {
      const p0 = pr[i], p1 = pi[i];
      pr[i] = zr[i] + bR * p0 - bI * p1; pi[i] = zi[i] + bR * p1 + bI * p0;
    }
    rhoR = nR; rhoI = nI;
  }
  return it;
}

/**
 * A complex system with a lopsided part: (dr + i di) x + Σ (D w + a)(x_I − x_J) = b on g, a per
 * directed edge (the air's inflow from the neighbour, src/engine/airheat.js), by BiCGSTAB (van der
 * Vorst's) preconditioned by Jacobi on the right, warm-started from x (xr, xi). Its scratch is
 * kept on ws. Returns the iterations taken.
 */
export function bicgstab(g, D, dr, di, br, bi, xr, xi, ws, a, maxIt, tol) {
  const n = g.n, nbrOff = g.nbrOff, nbr = g.nbr, w = ws.w;
  const S = ws.bicg && ws.bicg.n === n ? ws.bicg : (ws.bicg = { n, v: Array.from({ length: 16 }, () => new Float64Array(n)) });
  const [rr, ri, hr, hi, pr, pi, vr, vi, qr, qi, sr, si, tr, ti, mr, mi] = S.v;
  const apply = (ur, ui, outr, outi) => {
    for (let i = 0; i < n; i++) {
      let s = 0, t = 0;
      for (let e = nbrOff[i], f = nbrOff[i + 1]; e < f; e++) { const k = D * w[e] + a[e], j = nbr[e]; s += k * (ur[i] - ur[j]); t += k * (ui[i] - ui[j]); }
      outr[i] = dr[i] * ur[i] - di[i] * ui[i] + s; outi[i] = dr[i] * ui[i] + di[i] * ur[i] + t;
    }
  };
  // ⟨x, y⟩ = Σ conj(x) y
  const dot = (ar, ai, cr, ci) => { let s = 0, t = 0; for (let i = 0; i < n; i++) { s += ar[i] * cr[i] + ai[i] * ci[i]; t += ar[i] * ci[i] - ai[i] * cr[i]; } return [s, t]; };
  const cdiv = (p, q) => { const m = q[0] * q[0] + q[1] * q[1]; return [(p[0] * q[0] + p[1] * q[1]) / m, (p[1] * q[0] - p[0] * q[1]) / m]; };
  const cmul = (p, q) => [p[0] * q[0] - p[1] * q[1], p[0] * q[1] + p[1] * q[0]];
  for (let i = 0; i < n; i++) {
    let s = dr[i];
    for (let e = nbrOff[i], f = nbrOff[i + 1]; e < f; e++) s += D * w[e] + a[e];
    const m = 1 / (s * s + di[i] * di[i]);
    mr[i] = s * m; mi[i] = -di[i] * m;
  }
  apply(xr, xi, tr, ti);
  let bn = 0, rn = 0;
  for (let i = 0; i < n; i++) {
    rr[i] = br[i] - tr[i]; ri[i] = bi[i] - ti[i]; hr[i] = rr[i]; hi[i] = ri[i];
    pr[i] = pi[i] = vr[i] = vi[i] = 0;
    bn += br[i] * br[i] + bi[i] * bi[i]; rn += rr[i] * rr[i] + ri[i] * ri[i];
  }
  bn = Math.sqrt(bn) || 1;
  if (Math.sqrt(rn) / bn < tol) return 0;
  let rho = [1, 0], alpha = [1, 0], omega = [1, 0], it = 0;
  for (; it < maxIt; it++) {
    const rho1 = dot(hr, hi, rr, ri);
    if (!(Math.hypot(rho1[0], rho1[1]) > 0)) break;
    const beta = cmul(cdiv(rho1, rho), cdiv(alpha, omega));
    for (let i = 0; i < n; i++) {
      const xr0 = pr[i] - (omega[0] * vr[i] - omega[1] * vi[i]), xi0 = pi[i] - (omega[0] * vi[i] + omega[1] * vr[i]);
      pr[i] = rr[i] + beta[0] * xr0 - beta[1] * xi0; pi[i] = ri[i] + beta[0] * xi0 + beta[1] * xr0;
      qr[i] = mr[i] * pr[i] - mi[i] * pi[i]; qi[i] = mr[i] * pi[i] + mi[i] * pr[i];   // p̂
    }
    apply(qr, qi, vr, vi);
    const hv = dot(hr, hi, vr, vi);
    if (!(Math.hypot(hv[0], hv[1]) > 0)) break;
    alpha = cdiv(rho1, hv);
    let sn = 0;
    for (let i = 0; i < n; i++) {   // r becomes s
      rr[i] -= alpha[0] * vr[i] - alpha[1] * vi[i]; ri[i] -= alpha[0] * vi[i] + alpha[1] * vr[i];
      sn += rr[i] * rr[i] + ri[i] * ri[i];
    }
    if (Math.sqrt(sn) / bn < tol) {
      for (let i = 0; i < n; i++) { xr[i] += alpha[0] * qr[i] - alpha[1] * qi[i]; xi[i] += alpha[0] * qi[i] + alpha[1] * qr[i]; }
      it++; break;
    }
    for (let i = 0; i < n; i++) { sr[i] = mr[i] * rr[i] - mi[i] * ri[i]; si[i] = mr[i] * ri[i] + mi[i] * rr[i]; }   // ŝ
    apply(sr, si, tr, ti);
    const ts = dot(tr, ti, rr, ri), tt = dot(tr, ti, tr, ti);
    omega = tt[0] > 0 ? [ts[0] / tt[0], ts[1] / tt[0]] : [0, 0];
    rn = 0;
    for (let i = 0; i < n; i++) {
      xr[i] += alpha[0] * qr[i] - alpha[1] * qi[i] + omega[0] * sr[i] - omega[1] * si[i];
      xi[i] += alpha[0] * qi[i] + alpha[1] * qr[i] + omega[0] * si[i] + omega[1] * sr[i];
      rr[i] -= omega[0] * tr[i] - omega[1] * ti[i]; ri[i] -= omega[0] * ti[i] + omega[1] * tr[i];
      rn += rr[i] * rr[i] + ri[i] * ri[i];
    }
    rho = rho1;
    if (Math.sqrt(rn) / bn < tol) { it++; break; }
    if (!(Math.hypot(omega[0], omega[1]) > 0)) break;
  }
  return it;
}

export class Climate {
  constructor(tec, land = null, opts = {}) {
    this.tec = tec;
    this.land = land;
    const fine = this.grid = tec.grid;
    const n = fine.n;
    // The energy balance (and the ocean's gyres, on the same grid) at 220 km whatever the
    // engine's level: the temperature is smooth at that scale, and at 110 km the cold
    // cycle's three solves cost ~2 s of a level-7 opening.
    this.coarse = buildGrid(Math.min(fine.level - 1, 5));
    this.T = makeTransfer(fine, this.coarse);
    const nc = this.coarse.n;
    this.orbit = { ...EARTH_ORBIT, ...(opts.orbit || {}) };

    // Geometry, fine.
    this.lat = new Float64Array(n); this.lon = new Float64Array(n);
    this.row = new Int16Array(n); this.roww = new Float32Array(n);
    this.sector = new Uint8Array(n); this.band = new Uint8Array(n);
    this.cor = new Float64Array(n);
    this.eqw = new Float64Array(3 * n);   // per cell: the unit vector toward the equator, tapered within 15° of it (descent's)
    this.sinking = new Float32Array(n);   // per cell: the descent at the point of the year being solved (`descent`)
    for (let i = 0; i < n; i++) {
      const z = fine.pos[3 * i + 2];
      const la = Math.asin(Math.max(-1, Math.min(1, z))), lo = Math.atan2(fine.pos[3 * i + 1], fine.pos[3 * i]);
      this.lat[i] = la; this.lon[i] = lo;
      { const sl = Math.sin(la), tap = -Math.sign(la) * Math.min(1, Math.abs(la) / (15 * Math.PI / 180));
        this.eqw[3 * i] = -sl * Math.cos(lo) * tap; this.eqw[3 * i + 1] = -sl * Math.sin(lo) * tap; this.eqw[3 * i + 2] = Math.cos(la) * tap; }
      const x = (la + Math.PI / 2) / Math.PI * (NLAT - 1);
      this.row[i] = Math.min(NLAT - 2, Math.floor(x)); this.roww[i] = x - this.row[i];
      this.sector[i] = Math.min(35, Math.floor((lo + Math.PI) / (2 * Math.PI) * 36));
      this.band[i] = Math.min(89, Math.floor((la + Math.PI / 2) / Math.PI * 90));
    }
    this.bandArea = new Float64Array(90);
    for (let i = 0; i < n; i++) this.bandArea[this.band[i]] += fine.area[i];
    // Edge weights for the coarse Laplacian.
    const cg = this.coarse;
    this.ws = { w: Float64Array.from(cg.ell, (l, t) => l / cg.dist[t]) };
    for (const k of ['rr', 'ri', 'zr', 'zi', 'pr', 'pi', 'qr', 'qi', 'mr', 'mi']) this.ws[k] = new Float64Array(nc);
    // The energy balance's: each edge's weight carries the diffusivity's shape in latitude,
    // 1 + D_LAT sin²φ at the edge's middle.
    this.wsD = { ...this.ws, w: Float64Array.from(this.ws.w) };
    for (let I = 0; I < nc; I++) for (let t = cg.nbrOff[I], e = cg.nbrOff[I + 1]; t < e; t++) {
      const z = 0.5 * (cg.pos[3 * I + 2] + cg.pos[3 * cg.nbr[t] + 2]);
      this.wsD.w[t] *= 1 + CLIMATE.D_LAT * z * z;
    }

    // State: harmonics of the sea-level temperature, coarse (warm start) and fine.
    this.Tc = [new Float64Array(nc).fill(14), new Float64Array(nc), new Float64Array(nc), new Float64Array(nc), new Float64Array(nc)];
    this.Fc = [0, 1, 2, 3, 4].map(() => new Float64Array(nc));
    this.Tf = [0, 1, 2, 3, 4].map(() => new Float32Array(n));
    this.Tf[0].fill(14);
    this.Pf = [0, 1, 2, 3, 4].map(() => new Float32Array(n));
    this.Pf[0].fill(2.5);
    this.W = Array.from({ length: NP }, () => new Float32Array(n).fill(20));
    this.Pph = Array.from({ length: NP }, () => new Float32Array(n).fill(2.5));
    this.zones = new Float32Array(NZ * n);
    this.snowAnn = new Float32Array(n);    // fraction of the year under snow (land) or sea ice
    this.runoff = new Float32Array(n);         // m/yr, the ground's (its periodic year)
    this.runoffM = new Float32Array(12 * n);   // runoff by month (m), January first: rivers' seasons
    // The ground: its periodic year under this climate's months (the closure; the year steps
    // it live, src/engine/ground.js). Sea and grounded ice hold no soil water.
    this.soil = new Soil(n, 0);
    this.T12 = new Float32Array(12 * n);       // surface °C by month (12 i + m)
    this.P12 = new Float32Array(12 * n);       // rain, mm in the month
    this.PET12 = new Float32Array(12 * n);     // potential evaporation, mm in the month
    this.peAnn = new Float32Array(n);          // m/yr: rain less potential evaporation (what open water gains)
    this.pAnn = new Float32Array(n);           // m/yr: rain (land)
    this.betaPh = Array.from({ length: NP }, () => new Float32Array(n).fill(0.5));   // the ground's evaporative efficiency at each point of the year
    this.evapPh = Array.from({ length: NP }, () => new Float32Array(n));            // the ground's evaporation at each point of the year (mm/day), the air's source over land
    this.soilWarm = false;
    this.lakes = null;   // src/engine/lakes.js, when there is one
    this.lakeWet = new Float32Array(n);        // the lakes' share of each cell, as this cycle saw it
    this.ground = null;  // the live ground (src/engine/ground.js): its slow mean, weighed by the year's live weight
    this.upz = new Float64Array(3 * n);
    this.elevPos = new Float64Array(n);
    this.landMask = new Uint8Array(n);
    this.landFracC = new Float64Array(nc);
    this.landSmooth = new Float64Array(n);   // the land's share smoothed over ~1,500 km (`geography`)
    this.wind = new Float32Array(3 * n);   // the last phase's surface wind (m/s), for drawing
    this.windPhase = Array.from({ length: NP }, () => new Float32Array(3 * n));
    this.pres = new Float32Array(n);
    this.presPhase = Array.from({ length: NP }, () => new Float32Array(n));   // the template's pressure at each point of the year
    this.itcz = new Float32Array(NP * 36);
    this.zonal = null;
    this.stats = { meanT: 14, iceLat: 90, cycles: 0, hadley: 30, settled: 0 };
    this.scratch = {
      f6: new Float64Array(n), c5: new Float64Array(nc), c5b: new Float64Array(nc),
      F: [0, 1, 2, 3, 4].map(() => new Float64Array(n)),
      alb: new Float32Array(n),
    };
    // Sweep orders for the moisture solve.
    const idx = Array.from({ length: n }, (_, i) => i);
    const byLon = idx.slice().sort((a, b) => this.lon[a] - this.lon[b]);
    const byLat = idx.slice().sort((a, b) => this.lat[a] - this.lat[b]);
    this.orders = [Int32Array.from(byLon), Int32Array.from(byLon.reverse()), Int32Array.from(byLat), Int32Array.from(byLat.reverse())];
    this.ice = null;     // src/engine/ice.js, when there is one
    this.dust = null;    // src/engine/aeolian.js, when there is one: its sources packed at each point of the year
    this.dustDark = null;      // its darkening of snow and ice (planetary albedo, ≤ 0), and its forcing (W/m²): the last cycle's
    this.dustForcing = null;
    this.peopleForcing = null;     // W/m² per cell: coal's sulfate where the winds carry it (src/engine/peoplelink.js)
    this.gpu = null;     // src/gpu/moisture.js, where there's a device (the page's engine)
    this.ebmGpu = null;  // src/gpu/ebm.js, where there's a device: the energy balance's steps
    this.airHeat = new AirHeat(this);     // the air's heat carried by the mean wind (src/engine/airheat.js): its wind from each cycle
    this.clouds = new Clouds(this);       // the clouds (src/engine/clouds.js): from each point of the year's moisture, in the next energy balance
    this.seaHeat = new SeaHeat(this);     // the sea's heat transport (src/engine/seaheat.js): the gyres and the overturning, their paths with the geography, their flows from each cycle's winds
    this.ocean = null;   // src/engine/ocean.js, when there is one
    this.year = null;    // src/engine/year.js, when there is one: the zones' widths
    this.warm = false;
    this.it = null;
    this.version = 0;
    this.qtab = null;
    this.qkey = '';
  }

  /** Insolation at NS phases of the year, by latitude row. */
  insolationRows() {
    const o = this.orbit, key = `${o.e},${o.obliquity},${o.perihelion},${CLIMATE.S}`;
    if (key === this.qkey) return this.qtab;
    const tab = new Float64Array(NLAT * NS);
    for (let s = 0; s < NS; s++) {
      const lam = solarLongitude((s + 0.5) / NS, o);
      for (let l = 0; l < NLAT; l++) tab[l * NS + s] = insolation(-Math.PI / 2 + Math.PI * l / (NLAT - 1), lam, o, CLIMATE.S);
    }
    this.qtab = tab; this.qkey = key;
    return tab;
  }

  /** Sea-level temperature at year phase τ, fine cell i. */
  tAt(i, tau) {
    const c = Math.cos(2 * Math.PI * tau), s = Math.sin(2 * Math.PI * tau);
    const c2 = c * c - s * s, s2 = 2 * s * c;
    const T = this.Tf;
    return T[0][i] + T[1][i] * c - T[2][i] * s + T[3][i] * c2 - T[4][i] * s2;
  }
  pAt(i, tau) {
    const c = Math.cos(2 * Math.PI * tau), s = Math.sin(2 * Math.PI * tau);
    const c2 = c * c - s * s, s2 = 2 * s * c;
    const P = this.Pf;
    return Math.max(0, P[0][i] + P[1][i] * c - P[2][i] * s + P[3][i] * c2 - P[4][i] * s2);
  }
  /** The template's sea-level pressure (hPa about the mean) at year phase τ, by the six points' harmonics. */
  presAt(i, tau) {
    const x = ((tau * NP - 0.5) % NP + NP) % NP, k = Math.floor(x), w = x - k;
    return this.presPhase[k][i] * (1 - w) + this.presPhase[(k + 1) % NP][i] * w;
  }
  /** Surface temperature: the sea-level value less the lapse rate over land. */
  surfaceT(i, tau) { return this.tAt(i, tau) - CLIMATE.LAPSE * this.elevPos[i]; }

  /** Snapshot of the geography the climate sees. */
  geography() {
    const tec = this.tec, n = this.grid.n, s = tec.seaLevel, H = this.ice ? this.ice.H : null;
    // Heights from the air's datum (where the sea stood, if it has boiled away: src/engine/plates.js).
    const dz = s - (tec.airDatum ? tec.airDatum() : s);
    const L = this.lakes && this.lakes.built ? this.lakes : null;
    const lift = this.lakeLift || (this.lakeLift = new Float32Array(n));
    for (let i = 0; i < n; i++) {
      // Grounded ice counts as land, its surface as the height; floating ice (a marine front's
      // partly filled cell, src/engine/ice.js) is sea. The sea is the ocean the plates solve: a
      // basin below sea level it doesn't reach is land, as low as it lies (a Dead Sea's air is the
      // warmer for it). Its height is the mean surface's: a lake's share stands at the lake's
      // level (src/engine/lakes.js, the year's wet share), not on the floor below it (a lake 3 km
      // deep in a 6.7 km pit, read on the floor, was ~20 K too warm and evaporated at the
      // saturation's cap). The lift is relaxed halfway each time: a closed lake's level and its
      // air's warmth feed each other, and the opening's cycles, each with the lakes at their
      // balance, rang (seed c's land rain ±0.8% with a period of three cycles, never settling).
      const e = tec.elev[i] - s, h = H ? H[i] / 1000 : 0, sea = tec.sea[i], grounded = h > 0 && (!sea || h * ICE.RHO_I > -e * ICE.RHO_W);
      const land = !sea || grounded;
      let up = 0;
      if (L && !(h > 0) && L.lakeId[i] >= 0) { const top = L.level[L.lakeId[i]] - s; if (top > e) up = L.wetY[i] * (top - e); }
      lift[i] = 0.5 * (lift[i] + up);
      const z = e + h + dz + lift[i];
      this.landMask[i] = land ? 1 : 0;
      this.elevPos[i] = land ? (!sea && e < 0 ? z : Math.max(0, z)) : 0;
    }
    // The soil's capacity: land, but not under grounded ice (the ice owns its water).
    const cap = this.soilCap || (this.soilCap = new Float32Array(n));
    const reg = this.regolith;              // the regolith's depth sets it (src/engine/regolith.js)
    for (let i = 0; i < n; i++) cap[i] = this.landMask[i] && !(H && H[i] > 1) ? (reg ? reg.capacity(i) : SOIL.SMAX) : 0;
    this.soil.setCapacity(cap);
    if (this.lakes) this.lakeWet.set(this.lakes.wetY); else this.lakeWet.fill(0);   // the year's (src/engine/lakes.js): a climatology, not this month's
    gradient(this.grid, this.elevPos, this.upz);
    for (let i = 0; i < 3 * n; i++) this.upz[i] /= R_KM;   // km per km
    const f6 = this.scratch.f6;
    for (let i = 0; i < n; i++) f6[i] = this.landMask[i];
    restrict(this.T, f6, this.landFracC);
    if (this.seaHeat) this.seaHeat.geometry();
    // The land's share smoothed over ~1,500 km (the subtropical highs' footprint: they stand over the sea).
    {
      const cg = this.coarse, w = this.ws.w, c5 = this.scratch.c5, c5b = this.scratch.c5b;
      c5.set(this.landFracC);
      for (let pass = 0, m = Math.round(10 * cg.n / 10242); pass < m; pass++) {
        for (let I = 0; I < cg.n; I++) {
          let a = 0, ws = 0;
          for (let t = cg.nbrOff[I], e = cg.nbrOff[I + 1]; t < e; t++) { a += w[t] * c5[cg.nbr[t]]; ws += w[t]; }
          c5b[I] = 0.4 * c5[I] + 0.6 * a / ws;
        }
        c5.set(c5b);
      }
      prolong(this.T, c5, this.landSmooth);
    }
  }

  /** Albedo of fine cell i at sea-level temperature T (at sea, the surface's: the air's plus the gyres' anomaly). */
  albedo(i, T) {
    const C = CLIMATE, s = Math.sin(this.lat[i]), s2 = s * s, polar = C.ALB_POLAR * s2, polarL = C.ALB_POLAR_LAND * s2;
    const dk = this.dustDark ? this.dustDark[i] : 0, snowA = C.ALB_SNOW + dk;   // dusty snow and ice are darker
    if (this.ice && this.ice.H[i] > 10) return C.ALB_ICE + dk;
    if (this.landMask[i]) {
      const z = this.zones, o = NZ * i, cv = this.cover, Ts = T - C.LAPSE * this.elevPos[i];
      let a;
      // The plants' cover where it's known (trees mask snow), else the zones'.
      if (cv) a = landAlbedo(cv.ft[i], cv.fg[i], ramp(-Ts, -1, 5), C.ALB_LAND + C.ALB_COVER + polarL, snowA);
      else {
        const base = C.ALB_LAND + polarL + C.ALB_DESERT * (z[o + 4] + 0.5 * z[o + 5]) + C.ALB_FOREST * (z[o] + z[o + 1] + 0.5 * (z[o + 6] + z[o + 9]));
        a = base + (snowA - base) * ramp(-Ts, -1, 5);
      }
      const lw = this.lakeWet[i];
      if (!(lw > 0)) return a;
      // A lake's share of the cell: open water, or its ice (fresh water freezes at 0 °C).
      const wa = C.ALB_OCEAN + polar;
      return a + lw * (wa + (C.ALB_SEAICE - wa) * ramp(-Ts, 0, 4.5) - a);
    }
    const base = C.ALB_OCEAN + polar;
    return base + (C.ALB_SEAICE + dk - base) * ramp(-T, 1.5, 6);
  }

  /**
   * Each cell's albedo (`albedo`) as c0 + c1 r₁(v) + c2 ramp(−v, 0, 4.5) at v = T + o, r₁ land's
   * snow ramp(−v, −1, 5) or the sea's ice ramp(−v, 1.5, 6) (also the cell's cold share), for the
   * energy balance on the GPU (src/gpu/ebm.js): pa (o, c0, c1, c2), pb (latitude row, its weight,
   * land, dust's forcing). o is the lapse rate's drop over land, the gyres' anomaly at sea.
   */
  packAlbedo(pa, pb) {
    const C = CLIMATE, n = this.grid.n, z = this.zones, cv = this.cover, H = this.ice ? this.ice.H : null;
    const sstA = this.ocean ? this.ocean.fine.sst : null, dF = this.dustForcing, pF = this.peopleForcing;
    for (let i = 0; i < n; i++) {
      const s = Math.sin(this.lat[i]), s2 = s * s, polar = C.ALB_POLAR * s2, polarL = C.ALB_POLAR_LAND * s2, dk = this.dustDark ? this.dustDark[i] : 0, snowA = C.ALB_SNOW + dk;
      const land = this.landMask[i], o = land ? -C.LAPSE * this.elevPos[i] : sstA ? sstA[i] : 0;
      let c0, c1, c2 = 0;
      if (H && H[i] > 10) { c0 = C.ALB_ICE + dk; c1 = 0; }
      else if (land) {
        if (cv) {
          const base = C.ALB_LAND + C.ALB_COVER + polarL;
          c0 = landAlbedo(cv.ft[i], cv.fg[i], 0, base, snowA); c1 = landAlbedo(cv.ft[i], cv.fg[i], 1, base, snowA) - c0;
        } else {
          const q = NZ * i;
          c0 = C.ALB_LAND + polarL + C.ALB_DESERT * (z[q + 4] + 0.5 * z[q + 5]) + C.ALB_FOREST * (z[q] + z[q + 1] + 0.5 * (z[q + 6] + z[q + 9]));
          c1 = snowA - c0;
        }
        const lw = this.lakeWet[i];
        if (lw > 0) { const wa = C.ALB_OCEAN + polar; c0 = (1 - lw) * c0 + lw * wa; c1 *= 1 - lw; c2 = lw * (C.ALB_SEAICE - wa); }
      } else { c0 = C.ALB_OCEAN + polar; c1 = C.ALB_SEAICE + dk - c0; }
      pa[4 * i] = o; pa[4 * i + 1] = c0; pa[4 * i + 2] = c1; pa[4 * i + 3] = c2;
      pb[4 * i] = this.row[i]; pb[4 * i + 1] = this.roww[i]; pb[4 * i + 2] = land; pb[4 * i + 3] = (dF ? dF[i] : 0) + (pF ? pF[i] : 0);
    }
  }

  /**
   * Continental seasons (synthesis on the standard linear seasonal balance). A cell's seasonal
   * harmonic k answers its own absorbed sunlight F̂ and the heat the coarse grid's transport
   * brings it, L (W/m²), through its own heat capacity: T̂ = (F̂ + L)/(B + ikωC). Mixing C over
   * each 220 km coarse cell, as the energy balance did, stands for lateral exchange infinitely
   * fast below the coarse grid's scale, and held a coast's land to the sea's seasons. Here a cell
   * exchanges with its coarse cell's mean T̂ₘ at SUB_K, (B + K + ikωC) T̂ = F̂ + L + K T̂ₘ (between
   * coarse cells the transport is D_SEASON's), so the cells' responses add as admittances in
   * parallel: the coarse cell's mean answers through Z = 1/⟨1/(B + K + ikωC)⟩ − K and the forcing
   * ⟨F̂/(B + K + ikωC)⟩/⟨1/(B + K + ikωC)⟩, solved as before; the transport per unit area that
   * solve carries is shared by the coarse cell's cells (prolonged), and each answers with its own
   * capacity (`fineTemperature`). A coarse cell of one kind solves as before; K → ∞ is the mixed
   * capacity. The annual mean isn't touched (its transport reaches thousands of km), and the
   * transport and the exchange move heat without making any (`fineTemperature`). Off (SUBGRID
   * false), the mixed capacity.
   */
  continentalSeasons(F, Cf) {
    const C = CLIMATE, n = this.grid.n, nc = this.coarse.n, B = C.B, K = C.SUB_K;
    const f32 = () => [0, 1].map(() => new Float32Array(n)), f64 = () => [0, 1].map(() => new Float64Array(nc));
    const sub = this.sub || (this.sub = {
      Yr: f32(), Yi: f32(), Fr: f32(), Fi: f32(),       // each cell's admittance 1/(B + K + ikωC) and forcing, per harmonic
      Zr: f64(), Zi: f64(), FYr: f64(), FYi: f64(),     // the coarse cells' impedance Z and ⟨F̂/(B + K + ikωC)⟩
      W: null, a: new Float64Array(n), b: new Float64Array(n), mr: new Float64Array(n), mi: new Float64Array(n), Lr: new Float64Array(nc), Li: new Float64Array(nc),
    });
    for (let k = 1; k <= 2; k++) {
      const om = 2 * Math.PI * k, Yr = sub.Yr[k - 1], Yi = sub.Yi[k - 1], Fr = sub.Fr[k - 1], Fi = sub.Fi[k - 1];
      const a = sub.a, b = sub.b, Fk = F[2 * k - 1], Fk2 = F[2 * k];
      for (let i = 0; i < n; i++) {
        const bk = B + K, z = om * Cf[i], m = 1 / (bk * bk + z * z), yr = bk * m, yi = -z * m;
        Yr[i] = yr; Yi[i] = yi; Fr[i] = Fk[i]; Fi[i] = Fk2[i];
        a[i] = Fk[i] * yr - Fk2[i] * yi; b[i] = Fk[i] * yi + Fk2[i] * yr;
      }
      restrict(this.T, a, sub.FYr[k - 1]); restrict(this.T, b, sub.FYi[k - 1]);
      const Zr = sub.Zr[k - 1], Zi = sub.Zi[k - 1];
      restrict(this.T, Yr, Zr); restrict(this.T, Yi, Zi);
      for (let I = 0; I < nc; I++) { const yr = Zr[I], yi = Zi[I], m = 1 / (yr * yr + yi * yi); Zr[I] = yr * m - K; Zi[I] = -yi * m; }
    }
  }

  /** The fine harmonics from the coarse: the annual mean prolonged; the seasons each cell's own (`continentalSeasons`), or prolonged. */
  fineTemperature() {
    const n = this.grid.n, nc = this.coarse.n, f6 = this.scratch.f6, Tc = this.Tc, sub = CLIMATE.SUBGRID ? this.sub : null, K = CLIMATE.SUB_K;
    for (let k = 0; k < (sub ? 1 : 5); k++) {
      prolong(this.T, Tc[k], f6);
      for (let i = 0; i < n; i++) this.Tf[k][i] = f6[i];
    }
    if (!sub) return;
    // Each coarse cell's weight under prolongation (Pᵀ of the cells' areas), so Σ a L = Σ A L_coarse = 0.
    const W = sub.W || (sub.W = prolongT(this.T, this.grid.area, new Float64Array(nc))), A = this.coarse.area;
    const Lr = sub.Lr, Li = sub.Li;
    for (let k = 1; k <= 2; k++) {
      const Zr = sub.Zr[k - 1], Zi = sub.Zi[k - 1], Gr = sub.FYr[k - 1], Gi = sub.FYi[k - 1], xr = Tc[2 * k - 1], xi = Tc[2 * k];
      // The transport per unit area, L = (Z + K) T̂ − ⟨F̂ Y⟩/⟨Y⟩ (Gr, Gi hold ⟨F̂ Y⟩, and Z + K = 1/⟨Y⟩).
      for (let I = 0; I < nc; I++) {
        const zr = Zr[I] + K, zi = Zi[I], w = A[I] / W[I];
        const gr = zr * Gr[I] - zi * Gi[I], gi = zr * Gi[I] + zi * Gr[I];
        Lr[I] = (Zr[I] * xr[I] - Zi[I] * xi[I] - gr) * w; Li[I] = (Zr[I] * xi[I] + Zi[I] * xr[I] - gi) * w;
      }
      prolong(this.T, Lr, sub.a); prolong(this.T, Li, sub.b);
      const Yr = sub.Yr[k - 1], Yi = sub.Yi[k - 1], Fr = sub.Fr[k - 1], Fi = sub.Fi[k - 1], Tr = this.Tf[2 * k - 1], Ti = this.Tf[2 * k];
      // The exchange with the coarse cell's mean: K (T̂ₘ − T̂) at each cell, T̂ₘ the coarse solution
      // prolonged. The transfer's averages aren't each other's adjoints, so its net over the globe
      // (a part in ~10³ of the forcing) is returned evenly, δ, which closes the budget exactly.
      let dr = 0, di = 0;
      if (K > 0) {
        prolong(this.T, xr, sub.mr); prolong(this.T, xi, sub.mi);
        const a = this.grid.area;
        let sa = 0, syr = 0, syi = 0, er = 0, ei = 0;
        for (let i = 0; i < n; i++) {
          const fr = Fr[i] + sub.a[i] + K * sub.mr[i], fi = Fi[i] + sub.b[i] + K * sub.mi[i];
          er += a[i] * (fr * Yr[i] - fi * Yi[i] - sub.mr[i]); ei += a[i] * (fr * Yi[i] + fi * Yr[i] - sub.mi[i]);
          sa += a[i]; syr += a[i] * Yr[i]; syi += a[i] * Yi[i];
        }
        // δ (Σa − K Σ a Y) = K Σ a (Y (F̂ + L + K T̂ₘ) − T̂ₘ)
        const pr = sa - K * syr, pi = -K * syi, q = 1 / (pr * pr + pi * pi);
        dr = K * (er * pr + ei * pi) * q; di = K * (ei * pr - er * pi) * q;
      }
      for (let i = 0; i < n; i++) {
        const fr = Fr[i] + sub.a[i] + dr + (K > 0 ? K * sub.mr[i] : 0), fi = Fi[i] + sub.b[i] + di + (K > 0 ? K * sub.mi[i] : 0);
        Tr[i] = fr * Yr[i] - fi * Yi[i]; Ti[i] = fr * Yi[i] + fi * Yr[i];
      }
    }
  }

  /** The forcing outside the sunlight: CO₂, the volcanoes' mean, the people's (W/m²). */
  externalForcing() { const C = CLIMATE; return 5.35 * Math.log(C.CO2 / C.CO2_REF) + C.F_VOLC + C.F_PEOPLE; }

  /**
   * Before each energy-balance step: the outgoing longwave's departure from A + BT as it
   * saturates, or the steam's (src/engine/runaway.js), from the last step's mean absorbed
   * sunlight. Zero below the curve's knee, and with no runaway attached (headless climate alone).
   */
  olrCorrection() {
    const C = CLIMATE;
    if (this.runaway && this.absMean !== undefined) {
      // The limit is the planet's outgoing longwave: the clear sky's A + BT less the clouds' (their
      // mean from the last state), so the curve's knee stands where it did before the clouds.
      const Lc = this.cloudLongwave();
      C.F_OLR = this.runaway.correction(this.absMean - Lc, this.externalForcing(), C.A - Lc, C.B);
    } else C.F_OLR = 0;
    this.forcingUsed = this.externalForcing() + C.F_OLR;
  }

  /** The clouds' longwave, its global mean (W/m²), from each cell's year-mean high cloud and annual-mean temperature (both paths alike). */
  cloudLongwave() {
    const cl = CLOUDS.ON ? this.clouds : null;
    if (!cl) return 0;
    const C = CLIMATE, n = this.grid.n, a = this.grid.area, T = this.Tf[0];
    let s = 0, w = 0;
    for (let i = 0; i < n; i++) {
      let h = 0;
      for (let p = 0; p < NP; p++) h += cl.hi[p * n + i];
      s += a[i] * longwave(C.A + C.B * T[i], h / NP);
      w += a[i];
    }
    return s / w;
  }

  /** After each step: its mean absorbed sunlight, from the annual mean's global balance, A + B T̄ = Ā + the forcing (the transport sums to nothing). */
  olrMeasure() {
    const C = CLIMATE, a = this.coarse.area, T = this.Tc[0];
    let s = 0, w = 0;
    for (let I = 0; I < a.length; I++) { s += a[I] * T[I]; w += a[I]; }
    this.absMean = C.A + C.B * s / w - this.forcingUsed;
  }

  /** The energy balance: absorbed sunlight from the last state, then the five harmonic solves. */
  *ebm() {
    const C = CLIMATE, g = this.grid, n = g.n, cg = this.coarse, nc = cg.n;
    const Q = this.insolationRows(), F = this.scratch.F;
    // Absorbed sunlight through the year, and its harmonics (fine).
    const cs = new Float64Array(NS), sn = new Float64Array(NS);
    for (let s = 0; s < NS; s++) { cs[s] = Math.cos(2 * Math.PI * (s + 0.5) / NS); sn[s] = Math.sin(2 * Math.PI * (s + 0.5) / NS); }
    // Sea ice reads the sea's own surface: the air's temperature plus the gyres' anomaly
    // (warm currents keep a sea open poleward of its latitude's ice edge, cold ones carry
    // ice toward the equator), so the edge isn't the energy balance's latitude circle.
    const sstA = this.ocean ? this.ocean.fine.sst : null, dF = this.dustForcing, pF = this.peopleForcing;   // dust's forcing with the sunlight it scatters; coal's sulfate's (src/engine/peoplelink.js)
    // The clouds (src/engine/clouds.js): each sample's two points of the year and its weight between them,
    // the layers over the clear sky's albedo, and the high cloud's longwave over the clear sky's A + B T.
    const cl = CLOUDS.ON && this.clouds ? this.clouds : null;
    const ck = new Int32Array(2 * NS), cw = new Float64Array(NS);
    for (let s = 0; s < NS; s++) { const x = (((s + 0.5) / NS * NP - 0.5) % NP + NP) % NP, k = Math.floor(x); ck[2 * s] = k * n; ck[2 * s + 1] = ((k + 1) % NP) * n; cw[s] = x - k; }
    for (let i = 0; i < n; i++) {
      const l = this.row[i], w = this.roww[i], land = this.landMask[i], tp = !land && sstA ? sstA[i] : 0;
      let f0 = 0, a1 = 0, b1 = 0, a2 = 0, b2 = 0, cold = 0;
      const [al, ah] = cl ? cl.layerAlbedo(i) : [0, 0];
      for (let s = 0; s < NS; s++) {
        const q = Q[l * NS + s] * (1 - w) + Q[(l + 1) * NS + s] * w;
        const c = cs[s], sv = sn[s], c2 = c * c - sv * sv, s2 = 2 * sv * c;
        const Tsl = this.Tf[0][i] + this.Tf[1][i] * c - this.Tf[2][i] * sv + this.Tf[3][i] * c2 - this.Tf[4][i] * s2, T = Tsl + tp;
        let a = this.albedo(i, T), fa;
        if (cl) {
          const u = cw[s], k0 = ck[2 * s] + i, k1 = ck[2 * s + 1] + i;
          const lo = cl.lo[k0] * (1 - u) + cl.lo[k1] * u, hi = cl.hi[k0] * (1 - u) + cl.hi[k1] * u;
          a = shortwave(a, lo, al, hi, ah);
          fa = q * (1 - a) + longwave(C.A + C.B * Tsl, hi);
        } else fa = q * (1 - a);
        f0 += fa; a1 += fa * c; b1 -= fa * sv; a2 += fa * c2; b2 -= fa * s2;
        cold += land ? ramp(-(T - C.LAPSE * this.elevPos[i]), -1, 5) : ramp(-T, 1.5, 6);
      }
      F[0][i] = f0 / NS + (dF ? dF[i] : 0) + (pF ? pF[i] : 0); F[1][i] = 2 * a1 / NS; F[2][i] = 2 * b1 / NS; F[3][i] = 2 * a2 / NS; F[4][i] = 2 * b2 / NS;
      this.snowAnn[i] = cold / NS;
    }
    yield;
    for (let k = 0; k < 5; k++) restrict(this.T, F[k], this.Fc[k]);
    // Heat capacity: land, open sea, and sea under ice, per cell; the coarse cells' is its mean.
    const f6 = this.scratch.f6, cap = this.scratch.c5, Cf = this.capF || (this.capF = new Float64Array(n));
    for (let i = 0; i < n; i++) Cf[i] = this.landMask[i] ? C.C_LAND : C.C_OCEAN + (C.C_ICE - C.C_OCEAN) * this.snowAnn[i];
    restrict(this.T, Cf, cap);
    const A = cg.area, dr = new Float64Array(nc), di = new Float64Array(nc);
    const br = new Float64Array(nc), bi = new Float64Array(nc);
    const forcing = 5.35 * Math.log(C.CO2 / C.CO2_REF) + C.F_VOLC + C.F_PEOPLE + C.F_OLR;
    const sv = C.EBM_CG, tol = this.warm ? sv[0] : sv[2], maxIt = this.warm ? sv[1] : sv[3];
    // Mean: B T̄ − ∇·D∇T̄ = F̄ − A + ΔF, with the heat the sea's currents bring (src/engine/seaheat.js:
    // linearized about the last state, its own cell's share on the diagonal).
    const sh = this.seaHeat && this.seaHeat.terms(this.Tc[0]) ? this.seaHeat : null;
    for (let I = 0; I < nc; I++) {
      dr[I] = A[I] * C.B + (sh ? sh.diag[I] : 0); di[I] = 0;
      br[I] = A[I] * (this.Fc[0][I] - C.A + forcing) + (sh ? sh.rhs[I] : 0); bi[I] = 0;
    }
    // The air's heat carried by the wind (src/engine/airheat.js): the year's mean wind's upwind and
    // implicit (lopsided, so BiCGSTAB), the seasons' winds' lagged from the last state.
    const zero = this.scratch.c5b.fill(0), ah = this.airHeat && this.airHeat.on ? this.airHeat : null;
    const X = ah && ah.cross(this.Tc) ? ah.X : null;
    if (X) for (let I = 0; I < nc; I++) br[I] += X[0][I];
    if (ah) bicgstab(cg, C.D, dr, di, br, bi, this.Tc[0], zero, this.wsD, ah.a, maxIt, tol);
    else cocg(cg, C.D, dr, di, br, bi, this.Tc[0], zero, this.wsD, maxIt, tol);
    yield;
    // The seasons: each harmonic's impedance B + ikωC, the coarse cells' from their cells'
    // (`continentalSeasons`), or with the heat capacity mixed over each coarse cell (SUBGRID off).
    if (C.SUBGRID) this.continentalSeasons(F, Cf);
    for (let k = 1; k <= 2; k++) {
      const om = 2 * Math.PI * k, sub = C.SUBGRID ? this.sub : null;
      for (let I = 0; I < nc; I++) {
        if (sub) {
          // Z T̂ − ∇·D∇T̂ = ⟨F̂ Y⟩/⟨Y⟩, with Z = 1/⟨Y⟩ − K.
          const zr = sub.Zr[k - 1][I], zi = sub.Zi[k - 1][I], yr = sub.FYr[k - 1][I], yi = sub.FYi[k - 1][I], ur = zr + C.SUB_K;
          dr[I] = A[I] * zr; di[I] = A[I] * zi;
          br[I] = A[I] * (ur * yr - zi * yi); bi[I] = A[I] * (ur * yi + zi * yr);
        } else {
          dr[I] = A[I] * C.B; di[I] = A[I] * om * cap[I];
          br[I] = A[I] * this.Fc[2 * k - 1][I]; bi[I] = A[I] * this.Fc[2 * k][I];
        }
      }
      if (X) for (let I = 0; I < nc; I++) { br[I] += X[2 * k - 1][I]; bi[I] += X[2 * k][I]; }
      if (ah && AIRHEAT.SEASONS) bicgstab(cg, C.D_SEASON, dr, di, br, bi, this.Tc[2 * k - 1], this.Tc[2 * k], this.wsD, ah.a, maxIt, tol);
      else cocg(cg, C.D_SEASON, dr, di, br, bi, this.Tc[2 * k - 1], this.Tc[2 * k], this.wsD, maxIt, tol);
      yield;
    }
    this.fineTemperature();
    this.temperatureStats();
  }

  /**
   * Mean surface temperature, and the ice line: the latitude whose polar cap has the area
   * colder than −10 °C in the annual mean (Budyko's criterion), per hemisphere.
   */
  temperatureStats() {
    const C = CLIMATE, g = this.grid, n = g.n;
    let sum = 0, capN = 0, capS = 0;
    for (let i = 0; i < n; i++) {
      const Ts = this.Tf[0][i] - C.LAPSE * this.elevPos[i];
      sum += Ts * g.area[i];
      if (Ts < -10) { if (this.lat[i] >= 0) capN += g.area[i]; else capS += g.area[i]; }
    }
    this.stats.meanT = sum / (4 * Math.PI);
    const edge = a => Math.asin(Math.max(0, Math.min(1, 1 - a / (2 * Math.PI)))) * 180 / Math.PI;
    this.stats.iceLat = 0.5 * (edge(capN) + edge(capS));
  }

  /**
   * The energy balance to its fixed point. Absorbed sunlight reads the temperature (snow, sea
   * ice, and sea ice's heat capacity), so each pass of `ebm` is one step T ← G(T). Plain steps
   * converge slowly or not at all: the annual mean's ice–albedo feedback contracts by ~0.5–0.9
   * a step, and the seasonal harmonics flip (successive changes correlate at about −1: the
   * sea ice's albedo and heat capacity overshoot), so at one step a cycle the seasons
   * alternated between two states ~0.4 K rms apart for as long as the climate ran. Anderson's
   * mixing (standard; Walker and Ni 2011) over the last EBM_DEPTH steps: each step starts from
   * G(T) less the combination of the last steps' changes in G that best cancels the residual
   * G(T) − T, in the norm of T's variance over the year and the globe. The memory carries over
   * from cycle to cycle while the residual is above EBM_TOL (the map changes a little between
   * cycles, as the cover and the rain move), so a warm cycle takes one step, two while the
   * climate is moving, and a settled climate plain steps; it restarts when a step grows the
   * residual (the map is nonlinear at the ice's edges, and a change of forcing moves it).
   * Cold, from a uniform 14 °C, six steps leave ~0.2 K (three plain steps left ~1.5 K).
   */
  *energyBalance() {
    const C = CLIMATE, cg = this.coarse, nc = cg.n, N = 5 * nc, m = C.EBM_DEPTH;
    const maxIt = this.warm ? C.EBM_MAX : C.EBM_MAX_COLD;
    // The norm's weights: area, and each harmonic's share of the year's variance.
    const ws = this.ebmWs || (this.ebmWs = {
      w: Float64Array.from({ length: N }, (_, j) => cg.area[j % nc] / (4 * Math.PI) * (j < nc ? 1 : 0.5)),
      x: new Float64Array(N), g: new Float64Array(N),
      hg: Array.from({ length: m + 1 }, () => new Float64Array(N)), hf: Array.from({ length: m + 1 }, () => new Float64Array(N)),
      dF: Array.from({ length: m }, () => new Float64Array(N)), dG: Array.from({ length: m }, () => new Float64Array(N)),
      hist: 0, last: Infinity,
    });
    const { w, x, g, hg, hf } = ws, Tc = this.Tc, f6 = this.scratch.f6;
    const dot = (a, b) => { let s = 0; for (let j = 0; j < N; j++) s += w[j] * a[j] * b[j]; return s; };
    // The next start from the memory: x = g − Σ γⱼ ΔGⱼ, γ minimizing |f − Σ γⱼ ΔFⱼ| (normal equations).
    const mix = () => {
      const q = ws.hist - 1, f = hf[q];
      x.set(hg[q]);
      if (q < 1) return;
      for (let j = 0; j < q; j++) {
        const a = ws.dF[j], b = ws.dG[j], F0 = hf[j], F1 = hf[j + 1], G0 = hg[j], G1 = hg[j + 1];
        for (let i = 0; i < N; i++) { a[i] = F1[i] - F0[i]; b[i] = G1[i] - G0[i]; }
      }
      const M = [], r = [];
      for (let j = 0; j < q; j++) { M.push([]); for (let k = 0; k < q; k++) M[j].push(dot(ws.dF[j], ws.dF[k])); r.push(dot(ws.dF[j], f)); }
      for (let j = 0; j < q; j++) M[j][j] = M[j][j] * (1 + 1e-6) + 1e-30;
      for (let c = 0; c < q; c++) for (let i = c + 1; i < q; i++) {
        const s = M[i][c] / M[c][c];
        for (let k = c; k < q; k++) M[i][k] -= s * M[c][k];
        r[i] -= s * r[c];
      }
      const gam = new Float64Array(q);
      for (let i = q - 1; i >= 0; i--) { let s = r[i]; for (let k = i + 1; k < q; k++) s -= M[i][k] * gam[k]; gam[i] = s / M[i][i]; }
      // The fit's own residual, |f − ΔF γ|² = |f|² − γ·r (for the unreduced r): where the memory
      // explains less than a fifth of the residual (it was laid down under a map that has since
      // moved: the orbit, CO₂, the geography) or γ is ill-conditioned, the plain step, and the
      // memory restarts from it.
      let fit = 0;
      for (let j = 0; j < q; j++) fit += gam[j] * dot(ws.dF[j], f);
      if (!gam.every(v => Math.abs(v) < 20) || fit < 0.2 * dot(f, f)) {
        hg[0].set(hg[q]); hf[0].set(f); ws.hist = 1;
        return;
      }
      for (let j = 0; j < q; j++) { const b = ws.dG[j], c = gam[j]; for (let i = 0; i < N; i++) x[i] -= c * b[i]; }
    };
    // On the GPU (src/gpu/ebm.js, the engine's): each step whole there, the coarse harmonics read back.
    const gpu = this.ebmGpu && C.SUBGRID ? this.ebmGpu : null;
    if (gpu) gpu.begin(this);
    const start = () => {
      for (let k = 0; k < 5; k++) Tc[k].set(x.subarray(k * nc, (k + 1) * nc));
      if (gpu) gpu.start(Tc); else this.fineTemperature();
    };
    // The memory's last pair stands for the state now when Tc is still its G (nothing has set the
    // state since): then start from its mix.
    if (!this.warm) ws.hist = 0;
    if (ws.hist > 0) {
      const G = hg[ws.hist - 1];
      for (let k = 0; k < 5 && ws.hist > 0; k++) { const t = Tc[k], o = k * nc; for (let I = 0; I < nc; I++) if (t[I] !== G[o + I]) { ws.hist = 0; break; } }
    }
    if (ws.hist > 1) { mix(); start(); } else for (let k = 0; k < 5; k++) x.set(Tc[k], k * nc);
    for (let it = 0; it < maxIt; it++) {
      this.olrCorrection();
      if (gpu) {
        gpu.setSeaHeat(this.seaHeat && this.seaHeat.terms(Tc[0]) ? this.seaHeat : null);
        gpu.setAirHeat(this.airHeat, Tc);
        yield gpu.step(Tc, this.warm);
      } else yield* this.ebm();
      this.olrMeasure();
      for (let k = 0; k < 5; k++) g.set(Tc[k], k * nc);
      // Remember (x, G(x)) as the residual f = G(x) − x and G(x), oldest first.
      if (ws.hist === m + 1) { hg.push(hg.shift()); hf.push(hf.shift()); ws.hist--; }
      const f = hf[ws.hist];
      for (let j = 0; j < N; j++) f[j] = g[j] - x[j];
      hg[ws.hist].set(g);
      const res = Math.sqrt(dot(f, f));
      this.stats.ebmSteps = it + 1; this.stats.ebmRes = res;
      // A step that grew the residual restarts the memory from itself.
      if (res > 2 * ws.last && ws.hist > 0) { hg[0].set(g); hf[0].set(f); ws.hist = 0; }
      ws.hist++; ws.last = res;
      if (res < C.EBM_TOL) { ws.hist = 0; ws.last = Infinity; break; }
      if (it === maxIt - 1) break;
      mix(); start();
      yield;
    }
    if (gpu) { yield gpu.readFine(this.Tf, this.snowAnn); this.temperatureStats(); }
  }

  /** Winds and rain at one point of the year. */
  *phase(p) {
    const C = CLIMATE, g = this.grid, n = g.n, nbrOff = g.nbrOff, nbr = g.nbr, tan = g.tan, pos = g.pos;
    const tau = (p + 0.5) / NP;
    const T = this.scratch.f6, Tf = this.Tf;
    {
      // tAt, its phase's cosines taken once.
      const c = Math.cos(2 * Math.PI * tau), sv = Math.sin(2 * Math.PI * tau), c2 = c * c - sv * sv, s2 = 2 * sv * c;
      for (let i = 0; i < n; i++) T[i] = Tf[0][i] + Tf[1][i] * c - Tf[2][i] * sv + Tf[3][i] * c2 - Tf[4][i] * s2;
    }
    // Zonal means and the ITCZ by sector.
    const zm = new Float64Array(90), za = new Float64Array(90);
    const sec = new Float64Array(36 * 30), secA = new Float64Array(36 * 30);   // ±30° in 2° bands
    for (let i = 0; i < n; i++) {
      const b = this.band[i], a = g.area[i];
      zm[b] += T[i] * a; za[b] += a;
      if (b >= 30 && b < 60) { const k = this.sector[i] * 30 + b - 30; sec[k] += T[i] * a; secA[k] += a; }
    }
    for (let b = 0; b < 90; b++) zm[b] = za[b] > 0 ? zm[b] / za[b] : 0;
    const itcz = new Float64Array(36);
    for (let s = 0; s < 36; s++) {
      let best = -1e9, bb = 15;
      for (let b = 0; b < 30; b++) {
        const k = s * 30 + b;
        if (!(secA[k] > 0)) continue;
        const la = -29 + 2 * b;
        const score = sec[k] / secA[k] - C.ITCZ_PEN * (la / 14) * (la / 14);
        if (score > best) { best = score; bb = b; }
      }
      itcz[s] = (-29 + 2 * bb) * Math.PI / 180;
    }
    // Smooth around the globe, and bound.
    for (let pass = 0; pass < C.ITCZ_SMOOTH; pass++) {
      const t = itcz.slice();
      for (let s = 0; s < 36; s++) itcz[s] = 0.25 * t[(s + 35) % 36] + 0.5 * t[s] + 0.25 * t[(s + 1) % 36];
    }
    for (let s = 0; s < 36; s++) { itcz[s] = Math.max(-C.ITCZ_MAX, Math.min(C.ITCZ_MAX, itcz[s])); this.itcz[p * 36 + s] = itcz[s]; }
    // Hadley edge: Held and Hou's scaling from the equator-to-pole contrast and the spin.
    const zAt = la => { const x = (la + Math.PI / 2) / Math.PI * 90 - 0.5, b = Math.max(0, Math.min(88, Math.floor(x))), w = Math.min(1, Math.max(0, x - b)); return zm[b] * (1 - w) + zm[b + 1] * w; };
    const dT = Math.max(5, zAt(0) - 0.5 * (zAt(1.05) + zAt(-1.05)));
    const phiH = Math.max(0.2, Math.min(1.0, (C.HADLEY * Math.PI / 180) * Math.sqrt(dT / C.HADLEY_DT) * (7.292e-5 / C.OMEGA)));
    this.stats.hadley = phiH * 180 / Math.PI;
    yield;
    // The thermal part of pressure: land warmer or colder than its latitude, smoothed (coarse).
    const anom = this.scratch.F[0], c5 = this.scratch.c5, c5b = this.scratch.c5b;
    for (let i = 0; i < n; i++) anom[i] = T[i] - zAt(this.lat[i]);
    restrict(this.T, anom, c5);
    {
      const cg = this.coarse, w = this.ws.w;
      // Six passes on level 5's cells (the scale the template was tuned at), more on finer.
      const passes = Math.round(6 * this.coarse.n / 10242);
      for (let pass = 0; pass < passes; pass++) {
        for (let I = 0; I < cg.n; I++) {
          let s = 0, ws = 0;
          for (let t = cg.nbrOff[I], e = cg.nbrOff[I + 1]; t < e; t++) { s += w[t] * c5[cg.nbr[t]]; ws += w[t]; }
          c5b[I] = 0.4 * c5[I] + 0.6 * s / ws;
        }
        c5.set(c5b);
      }
    }
    prolong(this.T, c5, anom);
    // Pressure (hPa about the mean). The thermal part: −THERMAL per kelvin of the departure, bounded softly at THERMAL_MAX.
    const pres = this.pres, G = (x, w) => Math.exp(-0.5 * (x / w) * (x / w));
    const thMax = C.THERMAL_MAX, thermal = a => { const x = -C.THERMAL * a; return thMax > 0 ? thMax * Math.tanh(x / thMax) : x; };
    // The polar highs don't move: their Gaussians once.
    const polarHi = this.polarHi || (this.polarHi = Float64Array.from(this.lat, la => G(la - Math.PI / 2, 0.28) + G(la + Math.PI / 2, 0.28)));
    for (let i = 0; i < n; i++) {
      const la = this.lat[i], pi = itcz[this.sector[i]];
      const N = phiH + 0.45 * pi, S = -phiH + 0.45 * pi;
      const NL = Math.min(1.2, C.LOWS * phiH) + 0.3 * pi, SL = -Math.min(1.2, C.LOWS * phiH) + 0.3 * pi;
      pres[i] = -7 * G(la - pi, 0.2) + 11 * (1 - C.HIGH_LAND * this.landSmooth[i]) * (G(la - N, 0.17) + G(la - S, 0.17)) - 13 * (G(la - NL, 0.2) + G(la - SL, 0.2))
        + 8 * polarHi[i] + thermal(anom[i]);
    }
    this.presPhase[p].set(pres);
    // Winds: r u + f k×u = −∇p/ρ.
    if (!this.gp) this.gp = new Float64Array(3 * n);
    if (!this.carry) this.carry = new Float32Array(3 * n);
    const carry = this.carry;
    surfaceWind(g, pres, C.OMEGA, this.windPhase[p], carry, this.gp);
    yield;
    yield* this.moisture(p, T, carry);
    // Its clouds (src/engine/clouds.js), for the next energy balance.
    if (this.clouds) this.clouds.phase(p, T);
    // Dust's sources on these winds and this rain (src/engine/aeolian.js).
    if (this.dust) { yield; yield* this.dust.phaseSteps(p, T); }
  }

  /** Whether the air takes land's evaporation from the ground (LAND_FLUX, once the ground has had a year). */
  landFlux() { return CLIMATE.LAND_FLUX > 0 && !!this.soilWarm; }

  /**
   * Each edge's share of KAPPA_W (the eddies' mixing of moisture): KW_TROP in the deep tropics,
   * rising to the whole between KW_LAT's latitudes, at the edge's mean latitude (kept until those move).
   */
  mixFactor() {
    const C = CLIMATE, g = this.grid, n = g.n, key = `${C.KW_TROP},${C.KW_LAT}`;
    if (this.kfKey === key) return this.kf;
    const kf = this.kf || (this.kf = new Float32Array(g.nbrOff[n])), l0 = C.KW_LAT[0] * Math.PI / 180, l1 = C.KW_LAT[1] * Math.PI / 180;
    for (let i = 0; i < n; i++) for (let t = g.nbrOff[i]; t < g.nbrOff[i + 1]; t++) {
      const la = 0.5 * (Math.abs(this.lat[i]) + Math.abs(this.lat[g.nbr[t]]));
      kf[t] = C.KW_TROP + (1 - C.KW_TROP) * ramp(la, l0, l1);
    }
    this.kfKey = key;
    return kf;
  }

  /** Each cell's descent (0–1) under the carrying wind (CLIMATE.SUB_V; see SUB_R0): its equatorward speed over SUB_V. */
  descent(wind) {
    const n = this.grid.n, e = this.eqw, sub = this.sinking, v0 = CLIMATE.SUB_V;
    for (let i = 0; i < n; i++) sub[i] = Math.min(1, Math.max(0, (wind[3 * i] * e[3 * i] + wind[3 * i + 1] * e[3 * i + 1] + wind[3 * i + 2] * e[3 * i + 2]) / v0));
    return sub;
  }

  /** The steady moisture balance at phase p, by fast sweeping. */
  *moisture(p, T, wind) {
    const C = CLIMATE, g = this.grid, n = g.n, nbrOff = g.nbrOff, nbr = g.nbr, tan = g.tan, ell = g.ell, dist = g.dist;
    const m = nbrOff[n], pmax = C.RAIN_MAX;
    if (this.gpu && this.gpu.solveFrom) {
      // On the GPU (src/gpu/moisture.js), packed there from the wind and the temperature, with
      // the geography as it stands and β's factor (the live ground's slow mean against the
      // closure's, by the year's live weight).
      this.gpu.setGeography(this, C, VEG);
      const beta = this.betaPh[p], G = this.ground, gw = G && G.betaSlow ? G.weight : 0, gratio = gw > 0 ? G.betaRatio : null;
      const bf = this.betaF || (this.betaF = new Float32Array(n));
      if (this.landFlux()) {
        const ev = this.evapPh[p], lw = this.lakeWet, k = C.LAND_FLUX;
        for (let i = 0; i < n; i++) bf[i] = this.landMask[i] ? k * (1 - lw[i]) * ev[i] * (gw > 0 ? 1 - gw + gw * gratio[i] : 1) : 0;
      } else if (gw > 0) for (let i = 0; i < n; i++) bf[i] = beta[i] * (1 - gw + gw * gratio[i]); else bf.set(beta);
      yield this.gpu.solveFrom(wind, T, bf, this.W[p], this.Pph[p], this.warm ? C.GPU_PASSES : 4 * C.GPU_PASSES, C.CONV_A, C.CONV_R0, pmax, this.descent(wind), this.W[p]);
      return;
    }
    if (!this.edgeU) { this.edgeU = new Float32Array(m); this.coefA = new Float64Array(n); this.ws_ = new Float64Array(n); this.lam = new Float64Array(n); this.ecoef = new Float64Array(n); this.lflux = new Float64Array(n); }
    const un = this.edgeU, A = this.coefA, Ws = this.ws_, lam = this.lam, ec = this.ecoef, fl = this.lflux;
    const toKmDay = 86.4;
    // Edge-normal winds, and the divergence.
    const div = this.scratch.F[2];
    for (let i = 0; i < n; i++) {
      let dv = 0;
      for (let t = nbrOff[i], e = nbrOff[i + 1]; t < e; t++) {
        const j = nbr[t];
        const u = 0.5 * ((wind[3 * i] + wind[3 * j]) * tan[3 * t] + (wind[3 * i + 1] + wind[3 * j + 1]) * tan[3 * t + 1] + (wind[3 * i + 2] + wind[3 * j + 2]) * tan[3 * t + 2]);
        un[t] = u;
        dv += u * ell[t];
      }
      div[i] = dv / g.area[i] / R_M;   // 1/s
    }
    const P = this.Pph[p], W = this.W[p];
    const areaKm = R_KM * R_KM, sub = this.descent(wind);
    const r0 = this.r0 || (this.r0 = new Float64Array(n));   // each cell's convective threshold: CONV_R0, raised by descent
    const cvf = this.cvf || (this.cvf = new Float64Array(n)); // and its convection's share by the surface's warmth
    // The live ground's slow mean of β against the closure's (src/engine/ground.js), by the year's live weight.
    const beta = this.betaPh[p], G = this.ground, gw = G && G.betaSlow ? G.weight : 0, gratio = gw > 0 ? G.betaRatio : null;
    for (let i = 0; i < n; i++) {
      const land = this.landMask[i];
      const Ts = land ? T[i] - C.LAPSE * this.elevPos[i] : Math.max(-1.8, T[i] + (this.ocean ? this.ocean.fine.sst[i] : 0));
      Ws[i] = wsat(Ts);
      const ux = wind[3 * i], uy = wind[3 * i + 1], uz = wind[3 * i + 2], speed = Math.sqrt(ux * ux + uy * uy + uz * uz);
      const lift = wind[3 * i] * this.upz[3 * i] + wind[3 * i + 1] * this.upz[3 * i + 1] + wind[3 * i + 2] * this.upz[3 * i + 2];
      const sink = Math.max(0, div[i]) / 3e-6;
      lam[i] = C.RAIN_BG * (0.25 + 0.75 * Math.exp(-sink - C.SUB_BG * sub[i])) * ramp(W[i] / Ws[i], C.BG_R1, C.BG_R2) + C.RAIN_ORO * Math.max(0, lift);
      r0[i] = C.CONV_R0 + C.SUB_R0 * sub[i];
      cvf[i] = ramp(Ts, C.CONV_T0, C.CONV_T1);
      let e = C.EVAP * (speed + 3) / 10;
      fl[i] = 0;
      if (land && this.landFlux()) {
        // The ground's own evaporation (its year's, at this point of the year: the water the soil
        // loses is the air's), off the land a lake doesn't cover; a lake's open water as the sea's.
        const lw = this.lakeWet[i];
        fl[i] = C.LAND_FLUX * (1 - lw) * this.evapPh[p][i] * (gw > 0 ? 1 - gw + gw * gratio[i] : 1);
        e = lw * e * (1 - (1 - C.LAKE_ICE) * ramp(-Ts, 0, 4.5));
      } else if (land) {
        // The soil's evaporative efficiency at this point of the year, and a lake's open water.
        // With the plants' cover: bare ground and grass at β, trees at √β (deeper roots).
        const b = beta[i] * (gw > 0 ? 1 - gw + gw * gratio[i] : 1), cv = this.cover;
        const bc = cv ? (VEG.E_BARE * Math.max(0, 1 - cv.ft[i] - cv.fg[i]) + cv.fg[i]) * b + VEG.E_TREE * cv.ft[i] * Math.sqrt(b) : b;
        const el = e * (cv ? C.LAND_EVAP_COVER : C.LAND_EVAP) * bc * ramp(Ts, -5, 5), lw = this.lakeWet[i];
        e = lw > 0 ? el + lw * (e * (1 - (1 - C.LAKE_ICE) * ramp(-Ts, 0, 4.5)) - el) : el;
      } else if (T[i] < -1.8) e *= 0.15;   // sea ice
      ec[i] = e;
      A[i] = g.area[i] * areaKm;
    }
    // Each cell solves a W + A P(W) = b, P convex in W, by Newton from its last value.
    const sweeps = this.warm ? C.SWEEPS : 4 * C.SWEEPS, ca = C.CONV_A, cr = C.CONV_R0, kap = C.KAPPA_W, kf = this.mixFactor();
    if (this.gpu) {
      // On the GPU (src/gpu/moisture.js): every cell at once, many times (the page's engine).
      const co = this.gpuCo || (this.gpuCo = new Float32Array(16 * n)), cin = new Float64Array(6);
      for (let i = 0; i < n; i++) {
        let a = 0;
        cin.fill(0);
        for (let t = nbrOff[i], e = nbrOff[i + 1]; t < e; t++) {
          const k = t - nbrOff[i], L = ell[t] * R_KM * toKmDay, u = un[t], kd = kap * kf[t] * ell[t] / dist[t];
          if (u > 0) a += u * L; else cin[k] -= u * L;
          a += kd; cin[k] += kd;
        }
        const Ai = A[i], ws = Ws[i], o = 16 * i;
        a += Ai * (lam[i] + ec[i]);
        co[o] = cin[0]; co[o + 1] = cin[1]; co[o + 2] = cin[2]; co[o + 3] = cin[3];
        co[o + 4] = cin[4]; co[o + 5] = cin[5]; co[o + 6] = a; co[o + 7] = Ai * (ec[i] * ws + fl[i]);
        co[o + 8] = cvf[i] * Ai * ws / 60 * Math.exp(-ca * r0[i]); co[o + 9] = ca / ws; co[o + 10] = lam[i]; co[o + 11] = ws;
        co[o + 12] = Ai; co[o + 13] = Ai * pmax; co[o + 14] = r0[i]; co[o + 15] = cvf[i];
      }
      yield this.gpu.solve(co, W, this.warm ? C.GPU_PASSES : 4 * C.GPU_PASSES, ca, cr, pmax);
    } else for (let s = 0, moved = 0, top = Math.max(sweeps, this.warm ? C.MOIST_MAX : 4 * C.MOIST_MAX); s < top; s++) {
      // At least `sweeps`; then on, in fours, until the last four moved no column by MOIST_TOL
      // of its saturation (warm, six sweeps left ~4% of the rain short of the balance the GPU
      // reaches, and the shortfall closed only over ~10 cycles).
      const ord = this.orders[s & 3];
      for (let k = 0; k < n; k++) {
        const i = ord[k];
        let a = 0, b = 0;
        for (let t = nbrOff[i], e = nbrOff[i + 1]; t < e; t++) {
          const j = nbr[t], L = ell[t] * R_KM * toKmDay, u = un[t];
          const kd = kap * kf[t] * ell[t] / dist[t];
          if (u > 0) a += u * L; else b -= u * L * W[j];
          a += kd; b += kd * W[j];
        }
        const Ai = A[i], ws = Ws[i];
        a += Ai * (lam[i] + ec[i]);
        b += Ai * (ec[i] * ws + fl[i]);
        const k0 = cvf[i] * Ai * ws / 60 * Math.exp(-ca * r0[i]), al = ca / ws;
        let w = Math.min(W[i], b / a);
        for (let it = 0; it < 4; it++) {
          const ex = k0 * Math.exp(Math.min(40, al * w));
          const step = (a * w + ex - b) / (a + al * ex);
          w -= step;
          if (Math.abs(step) < 1e-3) break;
        }
        // The cap: rain held at RAIN_MAX, the rest of the water carried on.
        if (lam[i] * w + cvf[i] * ws / 60 * Math.exp(Math.min(40, ca * (w / ws - r0[i]))) > pmax) {
          w = Math.max(w, (b - Ai * pmax) / Math.max(1e-9, a - Ai * lam[i]));
        }
        w = Math.max(0, w);
        const dw = Math.abs(w - W[i]) / ws;
        if (dw > moved) moved = dw;
        W[i] = w;
      }
      this.stats.sweeps = s + 1;
      if (s % 4 === 3) {
        if (s + 1 >= sweeps && moved < C.MOIST_TOL) break;
        moved = 0;
        yield;
      }
    }
    for (let i = 0; i < n; i++) {
      const w = W[i], ws = Ws[i];
      P[i] = Math.min(pmax, lam[i] * w + this.cvf[i] * ws / 60 * Math.exp(Math.min(40, ca * (w / ws - this.r0[i]))));
    }
  }

  /** Harmonics of rain, the months, and the zones, whole (`finishSteps`). */
  finish() { const it = this.finishSteps(); while (!it.next().done); }

  /**
   * Harmonics of rain, the months, and the zones, a slice of the cells at a time. The months'
   * and the six points' phases are the same for every cell, so their cosines are taken once.
   */
  *finishSteps(slice = Math.ceil(this.grid.n / 8)) {
    const C = CLIMATE, g = this.grid, n = g.n;
    const P = this.Pf, Tf = this.Tf, Pph = this.Pph, elev = this.elevPos, lapse = C.LAPSE;
    const ph = this.finishTrig || (this.finishTrig = (() => {
      const t = { c1: new Float64Array(NP), s1: new Float64Array(NP), c2: new Float64Array(NP), s2: new Float64Array(NP), mc: new Float64Array(12), ms: new Float64Array(12), mc2: new Float64Array(12), ms2: new Float64Array(12) };
      for (let p = 0; p < NP; p++) { const th = 2 * Math.PI * (p + 0.5) / NP; t.c1[p] = Math.cos(th); t.s1[p] = Math.sin(th); t.c2[p] = Math.cos(2 * th); t.s2[p] = Math.sin(2 * th); }
      for (let m = 0; m < 12; m++) {
        const tau = monthPhase(m), c = Math.cos(2 * Math.PI * tau), sv = Math.sin(2 * Math.PI * tau);
        t.mc[m] = c; t.ms[m] = sv; t.mc2[m] = c * c - sv * sv; t.ms2[m] = 2 * sv * c;
      }
      return t;
    })());
    const { c1, s1, c2, s2, mc, ms, mc2, ms2 } = ph;
    // Monthly values, the zones, and runoff.
    const tm = new Float64Array(12), pm = new Float64Array(12);
    // The thresholds' widths stand for the spread from year to year: the year's anomaly's
    // (its closure: a month's temperature, a year's log rain), as a logistic's scale
    // (σ / 1.7 matches a normal's spread), where the planet has a year.
    const z = this.zones, sp = this.year ? this.year.spreadFine() : null;
    let wT = C.ZONE_T, wP = C.ZONE_P;
    for (let a = 0; a < n; a += slice) {
      for (let i = a, e = Math.min(n, a + slice); i < e; i++) {
        let p0 = 0, a1 = 0, b1 = 0, a2 = 0, b2 = 0;
        for (let p = 0; p < NP; p++) {
          const v = Pph[p][i];
          p0 += v; a1 += v * c1[p]; b1 -= v * s1[p]; a2 += v * c2[p]; b2 -= v * s2[p];
        }
        P[0][i] = p0 / NP; P[1][i] = 2 * a1 / NP; P[2][i] = 2 * b1 / NP; P[3][i] = 2 * a2 / NP; P[4][i] = 2 * b2 / NP;
        const o = NZ * i;
        for (let k = 0; k < NZ; k++) z[o + k] = 0;
        let mat = 0, map = 0, th = -99, tc = 99, pdry = 1e9;
        const t0 = Tf[0][i], t1 = Tf[1][i], t2 = Tf[2][i], t3 = Tf[3][i], t4 = Tf[4][i], q0 = P[0][i], q1 = P[1][i], q2 = P[2][i], q3 = P[3][i], q4 = P[4][i], dz = lapse * elev[i];
        for (let m = 0; m < 12; m++) {
          tm[m] = t0 + t1 * mc[m] - t2 * ms[m] + t3 * mc2[m] - t4 * ms2[m] - dz;
          pm[m] = Math.max(0, q0 + q1 * mc[m] - q2 * ms[m] + q3 * mc2[m] - q4 * ms2[m]) * 30.44;
          this.T12[12 * i + m] = tm[m]; this.P12[12 * i + m] = pm[m];
          mat += tm[m] / 12; map += pm[m];
          if (tm[m] > th) th = tm[m];
          if (tm[m] < tc) tc = tm[m];
          if (pm[m] < pdry) pdry = pm[m];
        }
        if (!this.landMask[i]) continue;
        if (sp) { const a = sp.T[i] / 1.7, b = this.year.annualRainSpread(i, map) / 1.7; wT = Math.sqrt(a * a + C.ZONE_FLOOR_T * C.ZONE_FLOOR_T); wP = Math.sqrt(b * b + C.ZONE_FLOOR_P * C.ZONE_FLOOR_P); }
        // Summer is April–September in the north, October–March in the south.
        const north = this.lat[i] >= 0;
        let ps = 0, pw = 0, psd = 1e9, pwd = 1e9, psw = 0, pww = 0;
        for (let m = 0; m < 12; m++) {
          const summer = (m >= 3 && m <= 8) === north;
          if (summer) { ps += pm[m]; psd = Math.min(psd, pm[m]); psw = Math.max(psw, pm[m]); }
          else { pw += pm[m]; pwd = Math.min(pwd, pm[m]); pww = Math.max(pww, pm[m]); }
        }
        const pth = 2 * mat + (ps >= 0.7 * map ? 28 : pw >= 0.7 * map ? 0 : 14);
        const pE = sigmoid((10 - th) / wT);
        const lmap = Math.log(Math.max(1, map));
        const pB = 10 * pth > 1 ? (1 - pE) * sigmoid((Math.log(10 * pth) - lmap) / wP) : 0;
        const rest = 1 - pE - pB;
        const sA = sigmoid((tc - 18) / wT), sC = sigmoid(tc / wT);
        const pA = rest * sA, pC = rest * (1 - sA) * sC, pD = rest * (1 - sA) * (1 - sC);
        // Second letters.
        const sS = sigmoid((40 - psd) / 8) * sigmoid((pww / 3 - psd) / 8);
        const sW = sigmoid((psw / 10 - pwd) / 6);
        const fS = sS, fW = (1 - sS) * sW, fF = (1 - sS) * (1 - sW);
        const af = sigmoid((pdry - 60) / 10), am = (1 - af) * sigmoid((pdry - (100 - map / 25)) / 10);
        const dryS = psd < pwd ? 1 : 0;
        z[o] = pA * af; z[o + 1] = pA * am;
        z[o + 2] = pA * (1 - af - am) * (1 - dryS); z[o + 3] = pA * (1 - af - am) * dryS;
        const bw = sigmoid((Math.log(5 * Math.max(0.2, pth)) - lmap) / wP);
        z[o + 4] = pB * bw; z[o + 5] = pB * (1 - bw);
        z[o + 6] = pC * fF; z[o + 7] = pC * fS; z[o + 8] = pC * fW;
        z[o + 9] = pD * fF; z[o + 10] = pD * fS; z[o + 11] = pD * fW;
        const ef = sigmoid(-th / wT);
        z[o + 12] = pE * (1 - ef); z[o + 13] = pE * ef;
      }
      yield;
    }
    yield* this.zonalSteps();
  }

  /**
   * The ground's periodic year under this cycle's months (sliced over the cells, warm from
   * the last), then its runoff for the landscape and the rivers, open water's balance for
   * the lakes, and its evaporative efficiency at each point of the year for the next cycle.
   */
  *groundYear() {
    const n = this.grid.n, s = this.soil, o = s.out, FC = SOIL.FC, CV = SOIL.COVER;
    potentialEvaporation(this.T12, this.PET12);
    const cold = !this.soilWarm, slice = Math.ceil(n / 16);
    let years = 0, cells = 0;
    for (let a = 0; a < n; a += slice) {
      const r = s.equilibrium(this.T12, this.P12, this.PET12, { cold, from: a, to: Math.min(n, a + slice) });
      years += r.meanYears * r.cells; cells += r.cells;
      yield;
    }
    this.soilWarm = true;
    this.stats.soilYears = cells ? years / cells : 0;
    const ph = this.monthPh || (this.monthPh = Array.from({ length: 12 }, (_, m) => Math.floor(((monthPhase(m) % 1) + 1) % 1 * NP) % NP));
    const cnt = new Float64Array(NP);
    for (let m = 0; m < 12; m++) cnt[ph[m]]++;
    for (let i = 0; i < n; i++) {
      const smax = s.Smax[i], b = 12 * i;
      let pa = 0, ea = 0;
      for (let m = 0; m < 12; m++) { pa += this.P12[b + m]; ea += this.PET12[b + m]; }
      const land = this.landMask[i];
      this.pAnn[i] = land ? pa / 1000 : 0; this.peAnn[i] = land ? (pa - ea) / 1000 : 0;
      if (!(smax > 0)) {
        this.runoff[i] = 0;
        for (let m = 0; m < 12; m++) this.runoffM[b + m] = 0;
        for (let p = 0; p < NP; p++) this.betaPh[p][i] = this.evapPh[p][i] = 0;
        continue;
      }
      this.runoff[i] = s.runoff[i] / 1000;
      for (let p = 0; p < NP; p++) this.betaPh[p][i] = this.evapPh[p][i] = 0;
      for (let m = 0; m < 12; m++) {
        const k = b + m, sw = o.SWE[k];
        this.runoffM[k] = (o.quick[k] + o.base[k]) / 1000;
        this.betaPh[ph[m]][i] += Math.min(1, o.S[k] / smax / FC) * (1 - sw / (sw + CV)) / cnt[ph[m]];
        this.evapPh[ph[m]][i] += o.evap[k] / 30.44 / cnt[ph[m]];
      }
    }
    if (this.land) this.land.runoff.set(this.runoff);
  }

  /** Zonal means for Fig. 3: by 2° band, annual T and its monthly range, rain; the ITCZ's range; Hadley edges. */
  zonalStats() { const it = this.zonalSteps(); while (!it.next().done); }
  /** `zonalStats` a slice of the cells at a time. */
  *zonalSteps(slice = Math.ceil(this.grid.n / 4)) {
    const g = this.grid, n = g.n, mph = Array.from({ length: 12 }, (_, m) => monthPhase(m));
    const T = new Float64Array(90), Tlo = new Float64Array(90), Thi = new Float64Array(90), P = new Float64Array(90), Pl = new Float64Array(90), La = new Float64Array(90);
    const Tm = new Float64Array(90 * 12), Tf = this.Tf, lapse = CLIMATE.LAPSE;
    const mc = mph.map(t => Math.cos(2 * Math.PI * t)), ms = mph.map(t => Math.sin(2 * Math.PI * t));
    const mc2 = mc.map((c, m) => c * c - ms[m] * ms[m]), ms2 = mc.map((c, m) => 2 * ms[m] * c);
    for (let i = 0; i < n; i++) {
      if (i > 0 && i % slice === 0) yield;
      const b = this.band[i], a = g.area[i], t0 = Tf[0][i], t1 = Tf[1][i], t2 = Tf[2][i], t3 = Tf[3][i], t4 = Tf[4][i], dz = lapse * this.elevPos[i];
      for (let m = 0; m < 12; m++) Tm[b * 12 + m] += a * (t0 + t1 * mc[m] - t2 * ms[m] + t3 * mc2[m] - t4 * ms2[m] - dz);
      P[b] += a * this.Pf[0][i] * 365.25;
      if (this.landMask[i]) { Pl[b] += a * this.Pf[0][i] * 365.25; La[b] += a; }
    }
    for (let b = 0; b < 90; b++) {
      const A = this.bandArea[b] || 1;
      let s = 0, lo = 1e9, hi = -1e9;
      for (let m = 0; m < 12; m++) { const v = Tm[b * 12 + m] / A; s += v; lo = Math.min(lo, v); hi = Math.max(hi, v); }
      T[b] = s / 12; Tlo[b] = lo; Thi[b] = hi; P[b] /= A; Pl[b] = La[b] > 0 ? Pl[b] / La[b] : NaN;
    }
    let ilo = 1, ihi = -1;
    for (let p = 0; p < NP; p++) {
      let s = 0;
      for (let k = 0; k < 36; k++) s += this.itcz[p * 36 + k];
      s /= 36;
      ilo = Math.min(ilo, s); ihi = Math.max(ihi, s);
    }
    this.zonal = { T, Tlo, Thi, P, Pland: Pl, itczLo: ilo * 180 / Math.PI, itczHi: ihi * 180 / Math.PI, hadley: this.stats.hadley };
    let pm = 0, lsum = 0, land = 0;
    for (let i = 0; i < n; i++) { pm += this.Pf[0][i] * g.area[i]; if (this.landMask[i]) { lsum += this.Pf[0][i] * g.area[i]; land += g.area[i]; } }
    this.stats.meanP = pm / (4 * Math.PI) * 365.25;
    this.stats.landP = land > 0 ? lsum / land * 365.25 : 0;
  }

  /** One full cycle: geography, energy balance, six points of the year, then rain and zones. */
  *cycle() {
    this.co2Seen = CLIMATE.CO2;
    this.geography();
    yield;
    if (this.seaHeat) yield* this.seaHeat.solveSteps();   // the overturning's flows when the sea has moved (src/engine/seaheat.js)
    yield* this.energyBalance();
    for (let p = 0; p < NP; p++) yield* this.phase(p);
    // The year's winds carry the air's heat in the next cycle's energy balance (src/engine/airheat.js).
    if (this.airHeat) yield* this.airHeat.windSteps();
    // The gyres after the winds they're driven by (before them, the first cycle's saw none), and
    // the sea's heat transport after both (src/engine/seaheat.js).
    if (this.ocean) yield* this.ocean.solve();
    if (this.seaHeat) yield* this.seaHeat.flowSteps();
    yield* this.finishSteps();
    if (this.dust) { yield* this.dust.solve(); yield; }
    yield* this.groundYear();
    this.warm = true;
    // Settling: two cycles running that moved the mean temperature and rain (global and on
    // land) less than SETTLE_T and SETTLE_P (the opening's references wait for it).
    const C = CLIMATE, s = this.stats, q = this.lastMeans;
    if (q) {
      s.dT = s.meanT - q.T; s.dP = s.meanP / q.P - 1; s.dPland = s.landP / Math.max(1e-9, q.L) - 1;
      const near = Math.abs(s.dT) < C.SETTLE_T && Math.abs(s.dP) < C.SETTLE_P && Math.abs(s.dPland) < C.SETTLE_P;
      this.calm = near ? (this.calm || 0) + 1 : 0;
    }
    this.lastMeans = { T: s.meanT, P: s.meanP, L: s.landP };
    s.cycles++;
    if (!s.settled && (this.calm >= 2 || s.cycles >= C.SETTLE_MAX)) s.settled = s.cycles;
    this.version++;
  }

  /** Work for at most `ms` milliseconds; returns true when a cycle completed. */
  work(ms) {
    const t0 = performance.now();
    let done = false;
    while (performance.now() - t0 < ms) {
      if (!this.it) this.it = this.cycle();
      const r = this.it.next();
      if (r.done) { this.it = null; done = true; if (this.idle) break; }
    }
    return done;
  }

  /** Run whole cycles, awaiting the GPU's work where the climate has it (`gpu`). */
  async solveAsync(cycles = 1) {
    for (let c = 0; c < cycles; c++) {
      const it = this.cycle();
      for (let r = it.next(); !r.done; r = it.next()) if (r.value && r.value.then) await r.value;
    }
  }

  /** Headless: run whole cycles. */
  solve(cycles = 1) {
    for (let c = 0; c < cycles; c++) { const it = this.cycle(); while (!it.next().done); }
    this.it = null;
  }
}
