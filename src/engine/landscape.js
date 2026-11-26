// The landscape (docs/MODEL.md): rivers cut the land the plates raise,
// and carry it to lakes and the sea.
//
//   routing     depressions filled by priority flood (lakes), then steepest
//               descent on the filled surface. The flood's pop order is a
//               topological order: every receiver comes before its donors.
//   erosion     the stream-power law dz/dt = U − K Qᵐ S (n = 1), solved
//               implicitly from the outlets upstream (Braun and Willett's
//               scheme), so any step is stable. Q is discharge: drainage area
//               weighted by runoff from the climate.
//   isostasy    rock removed from the top of the crust lowers the surface by
//               only (1 − ρ_crust/ρ_mantle) of its thickness, because the
//               crust rebounds. Erosion therefore takes thickness, and the
//               surface follows through isostasy.
//   sediment    routed downstream with the water; it fills lakes, and at the
//               coast builds a shelf to just below sea level and then
//               progrades into deeper water. Enough of it turns oceanic crust
//               continental (a delta's crust).
//   diffusion   thickness spreads between continental cells: hillslopes and
//               small rivers below the grid's scale, and the lateral flow of
//               thick, hot crust under an orogen (gravitational collapse).
//   outwash     the till the ice's meltwater carries off (src/engine/regolith.js)
//               waits in `sedIn` and joins the rivers' sediment at the next step,
//               where it melted out.
//   regolith    the rivers strip the weathered layer before rock: the layer
//               thins at `erosion`'s rate (src/engine/regolith.js), and the
//               thickness taken here is the same either way.
//
// Lengths in km, time in years, areas in km².
import { RHO_MANTLE, RHO_OCEANIC, RHO_CONTINENTAL } from './crust.js';
import { channel } from './plates.js';
import { shared, toShared, isShared } from './shared.js';
import { parallelSync } from './pool.js';

export const LAND = {
  K: 1.2e-7,         // 1/yr: erodibility for Q in km² of drainage at reference runoff (m = ½)
  M: 0.5,
  KAPPA: 4e-4,       // km²/yr: diffusion of continental thickness
  KAPPA_THICK: 3e-3, // km²/yr more, per 30 km of crust above 40 km
  SHELF: 0.12,       // km below sea level that sediment builds a shelf to
  SED_FELSIC: 0.9,   // felsic fraction of river sediment
  RUNOFF0: 0.3,      // m/yr: the runoff at which K applies
  ROUGH: 0.025,      // km: relief below the grid's scale, fixed to the crust, that water routes over
};

/** A fixed value in [−1, 1) for a plate's own cell: the crust's sub-grid roughness, which moves with it. */
function rough(plate, j) {
  let h = Math.imul(plate + 1, 0x9E3779B1) ^ Math.imul(j + 7, 0x85EBCA77);
  h = Math.imul(h ^ (h >>> 15), 0x2C1B3C6D);
  h ^= h >>> 13;
  return ((h >>> 0) / 4294967296) * 2 - 1;
}

const R_KM = 6371;
const SEAWARD = 24;   // cells of the sea a coast's sediment may search for room in (seaward)
const CONTINENTAL = 0.5;

/** A binary min-heap on typed arrays (key Float64, value Int32). */
class Heap {
  constructor(cap) { this.k = new Float64Array(cap); this.v = new Int32Array(cap); this.n = 0; }
  push(key, val) {
    const k = this.k, v = this.v;
    let i = this.n++;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (k[p] <= key) break;
      k[i] = k[p]; v[i] = v[p]; i = p;
    }
    k[i] = key; v[i] = val;
  }
  pop() {
    const k = this.k, v = this.v;
    const top = v[0];
    const n = --this.n;
    if (n > 0) {
      const lk = k[n], lv = v[n];
      let i = 0;
      for (;;) {
        let c = 2 * i + 1;
        if (c >= n) break;
        if (c + 1 < n && k[c + 1] < k[c]) c++;
        if (k[c] >= lk) break;
        k[i] = k[c]; v[i] = v[c]; i = c;
      }
      k[i] = lk; v[i] = lv;
    }
    return top;
  }
}

/**
 * Route water over z. `base` marks outlets (the sea). Fills depressions
 * (priority flood with a small rise ε so filled flats still drain) and gives
 * each cell its steepest-descent receiver on the filled surface.
 * Returns { zf, rcv (−1 at outlets), rlen (km to the receiver), order }.
 *
 * The outlets head the order (they have no receivers), and only those beside
 * dry ground seed the flood: the open sea reaches nothing but more sea, and
 * pushing it all through the heap was four fifths of the flood's cost.
 */
export function route(grid, z, base, out) {
  const n = grid.n, nbrOff = grid.nbrOff, nbr = grid.nbr, dist = grid.dist;
  const zf = out?.zf || shared(Float64Array, n);
  const rcv = out?.rcv || shared(Int32Array, n);
  const rlen = out?.rlen || shared(Float32Array, n);
  const order = out?.order || new Int32Array(n);
  const seen = out?.seen || new Uint8Array(n);
  const lake = out?.lake || shared(Uint8Array, n);
  const heap = out?.heap || new Heap(n + 8);
  seen.fill(0); heap.n = 0;
  const EPS = 1e-6;
  let no = 0;
  for (let i = 0; i < n; i++) {
    if (!base[i]) continue;
    zf[i] = z[i]; seen[i] = 1; order[no++] = i;
    for (let t = nbrOff[i], e = nbrOff[i + 1]; t < e; t++) if (!base[nbr[t]]) { heap.push(z[i], i); break; }
  }
  while (heap.n > 0) {
    const c = heap.pop();
    if (!base[c]) order[no++] = c;
    const zc = zf[c];
    for (let t = nbrOff[c], e = nbrOff[c + 1]; t < e; t++) {
      const j = nbr[t];
      if (seen[j]) continue;
      seen[j] = 1;
      zf[j] = Math.max(z[j], zc + EPS);
      heap.push(zf[j], j);
    }
  }
  // Steepest descent on the filled surface (descentCells: by chunk on the engine's pool where the arrays are shared).
  const x = { nbrOff, nbr, dist, z, base, zf, rcv, rlen, lake };
  if (isShared(z, base, zf, rcv, rlen, lake)) parallelSync('descent', descentCells, x, n); else descentCells(x, 0, n);
  return { zf, rcv, rlen, order, seen, lake, heap, count: no };
}

/** Each cell's steepest descent on the filled surface zf, cells [a, b) (`route`, and the pool's kernel): outlets drain nowhere; a cell filled more than 10 cm is under a lake. */
export function descentCells(x, a, b) {
  const { nbrOff, nbr, dist, z, base, zf, rcv, rlen, lake } = x;
  for (let i = a; i < b; i++) {
    if (base[i]) { lake[i] = 0; rcv[i] = -1; rlen[i] = 0; continue; }
    lake[i] = zf[i] > z[i] + 1e-4 ? 1 : 0;
    let best = 0, r = -1, len = 0;
    for (let t = nbrOff[i], e = nbrOff[i + 1]; t < e; t++) {
      const j = nbr[t];
      const s = (zf[i] - zf[j]) / dist[t];
      if (s > best) { best = s; r = j; len = dist[t]; }
    }
    rcv[i] = r; rlen[i] = len * R_KM;
  }
}

/** Accumulate w down a drainage { order, count, rcv, pass }: out_i = w_i + Σ donors' out × their pass. */
export function accumulatePass({ order, count, rcv, pass }, w, out) {
  out.set(w);
  for (let k = count - 1; k >= 0; k--) {
    const i = order[k], r = rcv[i];
    if (r >= 0) out[r] += out[i] * pass[i];
  }
  return out;
}

/** Accumulate w (per cell) downstream: out_i = w_i + Σ donors. */
export function accumulate(order, count, rcv, w, out) {
  out.set(w);
  for (let k = count - 1; k >= 0; k--) {
    const i = order[k], r = rcv[i];
    if (r >= 0) out[r] += out[i];
  }
  return out;
}

/**
 * One implicit stream-power step on z (km), in place. Each cell drains to
 * its receiver; outlets hold base level `zb[i]`, lakes hold their filled
 * surface. `f` scales the surface's response (the isostatic factor); returns
 * nothing, z is updated. Steady state is exactly U = K Qᵐ (z − z_r)/L.
 */
export function streamPower(r, z, Q, f, K, m, dt, zb) {
  const { zf, rcv, rlen, order, lake, count } = r;
  for (let k = 0; k < count; k++) {
    const i = order[k], j = rcv[i];
    if (j < 0 || lake[i]) continue;             // outlets, and lake floors, don't erode
    const zr = rcv[j] < 0 ? zb[j] : lake[j] ? zf[j] : z[j];
    const F = f[i] * K * dt * Math.pow(Q[i], m) / rlen[i];
    const zn = (z[i] + F * zr) / (1 + F);
    z[i] = Math.max(zn, zr);
  }
}

/** A column's mass, ρh (g/cm³·km), as the crust's flexure counts it (src/engine/crustflex.js). */
const massOf = (h, phi) => (RHO_OCEANIC + (RHO_CONTINENTAL - RHO_OCEANIC) * phi) * h;

function factor(phi) {
  const rho = RHO_OCEANIC + (RHO_CONTINENTAL - RHO_OCEANIC) * phi;
  return 1 - rho / RHO_MANTLE;
}

/** The landscape layer, wired to the crust of a Tectonics. */
/**
 * One substep of the landscape's diffusion on its packed continental cells [a, b) (Landscape.diffuse, and
 * the engine's pool's kernel): each cell's flow with its continental neighbours, κ̄ ds ℓ/d per km of
 * difference (the thick crust's share of it summed into dT), into hn = hc + its change. Each edge's flow is
 * the other cell's height less this one's, so the scatter's −(flow) on an edge's second cell is this exactly.
 */
export function diffuseCells(x, a, b) {
  const { C, kap, kapT, loc, off, edge, other, EG, ds, thick, hc, hn, Ac, dT } = x;
  for (let c = a; c < b; c++) {
    const i = C[c], ki = kap[i], ti = kapT[i], hi = hc[c], ac = Ac[c];
    let dh = 0, dt = dT[c];
    for (let t = off[i], e = off[i + 1]; t < e; t++) {
      const j = other[t], kj = kap[j];
      if (kj < 0) continue;
      const eg = EG[edge[t]], d = hc[loc[j]] - hi;
      dh += 0.5 * (ki + kj) * ds * eg * d * ac;   // km³ of flow, per km² of the cell
      if (thick) dt += 0.5 * (ti + kapT[j]) * ds * eg * d * ac;
    }
    hn[c] = hi + dh; dT[c] = dt;
  }
}

export class Landscape {
  constructor(tec) {
    const n = tec.grid.n;
    this.tec = tec;
    this.grid = tec.grid;
    this.runoff = new Float32Array(n).fill(LAND.RUNOFF0);   // m/yr, from the climate
    this.base = shared(Uint8Array, n);
    this.z = new Float64Array(n);
    this.z0 = new Float64Array(n);
    this.f = new Float64Array(n);
    this.w = new Float64Array(n);
    this.Q = new Float64Array(n);           // km² of drainage at reference runoff
    this.discharge = new Float32Array(n);  // m³/s, for drawing
    this.lake = new Float32Array(n);        // lake depth (km)
    this.qs = new Float64Array(n);
    this.erosion = new Float32Array(n);     // km/Myr of rock removed, last step
    this.dh = new Float64Array(n);
    this.areaKm = Float64Array.from(this.grid.area, a => a * R_KM * R_KM);
    this.r = null;
    this.sedIn = new Float64Array(n);       // km³ of outwash waiting for the next step (src/engine/regolith.js)
    this.flux = { eroded: 0, toSea: 0, toLakes: 0, outwash: 0 };   // km³/yr, last step
    this.steps = 0;
  }

  /**
   * Re-route on the current crust (no change to it): rivers and lakes for drawing.
   * Water routes over each cell's channel (its lowest land: src/engine/plates.js's
   * `channel`) plus a little roughness fixed to the crust:
   * on flat ground steepest descent on a hexagonal grid otherwise runs in
   * straight parallel lines, and the roughness branches them as real drainage
   * does. Steep ground is unaffected.
   */
  reroute() {
    const tec = this.tec, n = this.grid.n, R = LAND.ROUGH;
    const zr = this.zr || (this.zr = shared(Float64Array, n)), ch = channel(tec, this.zc || (this.zc = new Float64Array(n)));
    for (let i = 0; i < n; i++) {
      this.z[i] = tec.elev[i];
      this.base[i] = tec.sea[i];              // the ocean (src/engine/plates.js, solveSea): a basin below sea level it doesn't reach is a depression
      zr[i] = this.base[i] ? tec.elev[i] : ch[i] + R * rough(tec.owner[i], tec.ref[i]);   // on its channel (src/engine/plates.js): a gorge drains its basin
    }
    this.r = route(this.grid, zr, this.base, this.r);
    const r0 = LAND.RUNOFF0;
    for (let i = 0; i < n; i++) this.w[i] = this.base[i] ? 0 : this.areaKm[i] * this.runoff[i] / r0;
    accumulate(this.r.order, this.r.count, this.r.rcv, this.w, this.Q);
    const toM3s = r0 * 1e6 / 3.156e7;    // km² at r0 m/yr → m³/s
    for (let i = 0; i < n; i++) {
      this.discharge[i] = this.base[i] ? 0 : this.Q[i] * toM3s;
      this.lake[i] = this.r.lake[i] ? Math.max(0, this.r.zf[i] - this.z[i] - LAND.ROUGH) : 0;
    }
  }

  /**
   * Discharge by month (m³/s, 12 per cell, January first) from the climate's monthly
   * runoff (m), routed down the same drainage as the year's (no travel time: a month is
   * longer than most rivers take to reach the sea), or down `rt` (src/render/rivers.js,
   * `drainage`: the rivers' own, which end at closed lakes and pass on spilling lakes'
   * overflow).
   */
  monthly(runoffM, rt = null) {
    const n = this.grid.n, out = new Float32Array(12 * n);
    if (!this.r) return out;
    const toM3s = 1e6 * 12 / 3.156e7;     // km² · m a month → m³/s
    // The twelve months down the drainage together, in one pass over the order.
    const q = this.q12 || (this.q12 = new Float64Array(12 * n)), base = this.base, A = this.areaKm;
    const { order, count, rcv } = rt || this.r, pass = rt ? rt.pass : null;
    for (let i = 0, o = 0; i < n; i++, o += 12) {
      if (base[i]) { for (let m = 0; m < 12; m++) q[o + m] = 0; continue; }
      const a = A[i];
      for (let m = 0; m < 12; m++) q[o + m] = a * runoffM[o + m];
    }
    for (let k = count - 1; k >= 0; k--) {
      const i = order[k], r = rcv[i];
      if (r < 0) continue;
      const p = pass ? pass[i] : 1, oi = 12 * i, or = 12 * r;
      for (let m = 0; m < 12; m++) q[or + m] += q[oi + m] * p;
    }
    for (let i = 0, o = 0; i < n; i++, o += 12) if (!base[i]) for (let m = 0; m < 12; m++) out[o + m] = q[o + m] * toM3s;
    return out;
  }

  /**
   * The erosion rates (km/Myr, `erosion`) a step of dt years would make on the crust as it
   * stands, without changing it: for the regolith at the opening, before the first step.
   */
  preview(dt = 2.5e5) {
    this.reroute();
    this.cut(dt);
    const n = this.grid.n, z = this.z, z0 = this.z0, f = this.f;
    for (let i = 0; i < n; i++) this.erosion[i] = (z[i] < z0[i] ? (z0[i] - z[i]) / f[i] : 0) / dt * 1e6;
    this.z.set(z0);
  }

  /**
   * The drainage over the ice, for drawing (src/render/rivers.js, `drainage`): the rough routing's surface
   * plus the ice (`iceH`, m), so water runs on an ice sheet's surface to its margin (its melt and the
   * accumulation the soil's pack passes on, leaving where the ice ends) and a sheet dams what drains toward
   * it, as the lakes route (src/engine/lakes.js, reroute: their basins behind the ice are its proglacial
   * lakes). With each cell under a sheet (more than `sheet` m, where the globe draws one), where no river
   * is drawn. Null where no ice is that thick, so the landscape's own routing serves. Drawing only: the
   * landscape's cut runs on its bed.
   */
  iceRoute(iceH, sheet = 50) {
    const n = this.grid.n, base = this.base, zr = this.zr;
    if (!zr || !iceH) return null;
    let any = false;
    for (let i = 0; i < n; i++) if (!base[i] && iceH[i] > sheet) { any = true; break; }
    if (!any) return null;
    const z = this.zi || (this.zi = shared(Float64Array, n)), ice = new Uint8Array(n);
    for (let i = 0; i < n; i++) { const h = base[i] ? 0 : iceH[i]; z[i] = zr[i] + h / 1000; ice[i] = h > sheet ? 1 : 0; }
    this.ri = route(this.grid, z, base, this.ri);
    return { r: this.ri, ice };
  }

  /** The implicit stream-power cut over dt years on z (after reroute); z0 keeps the start. */
  cut(dt) {
    const tec = this.tec, n = this.grid.n, s = tec.seaLevel, z = this.z, z0 = this.z0, f = this.f;
    z0.set(z);
    for (let i = 0; i < n; i++) f[i] = factor(tec.phi[i]);
    const r = this.r;
    {
      const { zf, rcv, rlen, order, lake, count } = r;
      const K = LAND.K, m = LAND.M, Q = this.Q;
      for (let k = 0; k < count; k++) {
        const i = order[k], j = rcv[i];
        if (j < 0 || lake[i]) continue;
        const zr = rcv[j] < 0 ? s : lake[j] ? Math.min(zf[j], z0[j] + 1) : z[j];
        if (!(z[i] > zr)) continue;              // the roughness routed it uphill: no cutting
        const F = f[i] * K * dt * Math.pow(Q[i], m) / rlen[i];
        z[i] = Math.max(zr, (z[i] + F * zr) / (1 + F));
      }
    }
  }

  /** Erode, carry and deposit over dt years, then diffuse. Updates the crust in place. */
  step(dt) {
    this.erode(dt);
    this.diffuse(dt);
    this.settle();
  }

  /** The step's end: the elevation and the sea on the new crust. */
  settle() {
    this.steps++;
    this.tec.updateElevation();
  }

  /** The rivers' part of a step: cut, carry and deposit, written into the plates' crust. */
  erode(dt) {
    const n = this.grid.n;
    this.reroute();
    const z = this.z, z0 = this.z0, f = this.f, dh = this.dh, A = this.areaKm;
    // Rivers erode down to sea level at the coast.
    this.cut(dt);
    const r = this.r;
    // Rock removed (thickness), and the sediment it makes (km³).
    const qs = this.qs;
    let eroded = 0;
    for (let i = 0; i < n; i++) {
      const d = z[i] < z0[i] ? (z0[i] - z[i]) / f[i] : 0;
      dh[i] = -d;
      qs[i] = d * A[i];
      eroded += qs[i];
      this.erosion[i] = d / dt * 1e6;
    }
    // The ice's outwash joins it where it melted out.
    let outwash = 0;
    for (let i = 0; i < n; i++) if (this.sedIn[i] > 0) { qs[i] += this.sedIn[i]; outwash += this.sedIn[i]; this.sedIn[i] = 0; }
    // Carry it downstream; lakes keep what fits.
    let toLakes = 0;
    {
      const { zf, rcv, order, count } = r;
      for (let k = count - 1; k >= 0; k--) {
        const i = order[k], j = rcv[i];
        if (j < 0) continue;
        const room = zf[i] - z[i];
        if (room > 1e-6 && qs[i] > 0) {
          const cap = room * A[i] / f[i];
          const d = Math.min(cap, qs[i]);
          dh[i] += d / A[i];
          qs[i] -= d;
          toLakes += d;
        }
        qs[j] += qs[i];
        qs[i] = 0;
      }
    }
    // At the coast: a shelf to just below sea level, then out into deeper water.
    let toSea = 0;
    for (let c0 = 0; c0 < n; c0++) {
      const V = qs[c0];
      if (!(V > 0) || !this.base[c0]) continue;
      qs[c0] = 0;
      toSea += V;
      this.seaward(c0, V, dh);
    }
    this.deposit(dh);
    this.flux.eroded = eroded / dt; this.flux.toSea = toSea / dt; this.flux.toLakes = toLakes / dt; this.flux.outwash = outwash / dt;
  }

  /**
   * V km³ of sediment entering the sea at its cell c0, laid into dh (km of thickness): a shelf to SHELF
   * below sea level, then onward into the sea, always into the lowest cell the sediment can reach next (a
   * best-first search through the sea's cells, so it backs out of a shallow pocket rather than piling on a
   * bank), each filled to the shelf, at most SEAWARD cells; what's left lies in the lowest cell reached.
   */
  seaward(c0, V, dh) {
    const g = this.grid, nbrOff = g.nbrOff, nbr = g.nbr, elev = this.tec.elev, f = this.f, A = this.areaKm, base = this.base;
    const shelf = this.tec.seaLevel - LAND.SHELF, top = c => elev[c] + f[c] * dh[c];
    const front = [c0], seen = this.seenSea || (this.seenSea = new Set());
    seen.clear(); seen.add(c0);
    let low = c0;
    for (let k = 0; k < SEAWARD && front.length && V > 0; k++) {
      // The lowest cell on the front (a few dozen at most: a scan).
      let b = 0;
      for (let q = 1; q < front.length; q++) if (top(front[q]) < top(front[b])) b = q;
      const c = front[b];
      front[b] = front[front.length - 1]; front.pop();
      if (top(c) < top(low)) low = c;
      const d = Math.min(V, Math.max(0, shelf - top(c)) * A[c] / f[c]);
      dh[c] += d / A[c];
      V -= d;
      for (let t = nbrOff[c], e = nbrOff[c + 1]; t < e; t++) { const j = nbr[t]; if (base[j] && !seen.has(j)) { seen.add(j); front.push(j); } }
    }
    if (V > 0) dh[low] += V / A[low];
  }

  /**
   * Sediment (dh, km of thickness per world cell) written into the plates' crust, mixing in felsic
   * sediment. The column's mass the crust's flexure last saw (`mq`) moves with it: the rivers' cut and
   * fill stand on local isostasy, as their solve assumed (src/engine/crustflex.js).
   */
  deposit(dh) {
    const tec = this.tec, n = this.grid.n, plates = tec.plates, owner = tec.owner, ref = tec.ref, sedPhi = LAND.SED_FELSIC;
    for (let i = 0; i < n; i++) {
      const d = dh[i];
      if (d === 0) continue;
      const p = plates[owner[i]], j = ref[i], m0 = massOf(p.h[j], p.phi[j]);
      if (d > 0) p.phi[j] = (p.phi[j] * p.h[j] + sedPhi * d) / (p.h[j] + d);
      p.h[j] = Math.max(0.5, p.h[j] + d);
      if (p.mq[j] >= 0) p.mq[j] = Math.fround(p.mq[j] + massOf(p.h[j], p.phi[j]) - m0);
      tec.h[i] = p.h[j]; tec.phi[i] = p.phi[j];
    }
  }

  /**
   * Diffusion's plan for dt years: κ on continental cells (read at the step's start, −1
   * elsewhere), the continental cells, and the substeps (explicit, so κ_max·ds stays
   * under a fifth of the smallest cell's area over its ~3.5 neighbours' share).
   */
  plan(dt) {
    const tec = this.tec, n = this.grid.n, h = tec.h, phi = tec.phi, A = this.areaKm;
    if (!this.kap) { this.kap = shared(Float64Array, n); this.cont = shared(Int32Array, n); }   // (shared with the engine's pool: diffuseCells)
    if (!this.kapT || this.kapT.length !== n) this.kapT = shared(Float64Array, n);
    const kap = this.kap, kapT = this.kapT, C = this.cont;
    let kmax = 0, nc = 0;
    for (let i = 0; i < n; i++) {
      if (phi[i] < CONTINENTAL) { kap[i] = -1; continue; }
      kapT[i] = LAND.KAPPA_THICK * Math.max(0, h[i] - 40) / 30;
      const k = LAND.KAPPA + kapT[i];
      kap[i] = k; kmax = Math.max(kmax, k); C[nc++] = i;
    }
    const lim = 0.2 * Math.min(A[0], A[12]) / 3.5;   // κ·dt (km²) per substep; cell 0 is a pentagon
    const sub = Math.max(1, Math.ceil(kmax * dt / lim));
    return { kap, kapT, C, nc, sub, ds: dt / sub };
  }

  /**
   * Thickness spreads between continental cells, faster under thick crust. Explicit and
   * conservative, edge by edge. Two kinds of flow (synthesis): KAPPA's is the surface's
   * (hillslopes and small rivers below the grid's scale), and what of it reaches a cell of the
   * sea goes on as the rivers' sediment does (`seaward`: the sea's currents carry it off, so a
   * strait isn't filled from its shores); KAPPA_THICK's is the thick crust's flow at depth, which
   * stays where it goes. Both stand on local isostasy: the column's mass the crust's flexure last
   * saw (`mq`) moves with them, as with the rivers' cut and fill (`deposit`). (The root's flow
   * seen as a buoyant load ran in cell-to-cell pairs across an orogen's taper, which the plate
   * held as single cells km off their neighbours; an orogen thick enough to flow is weak and
   * stands near Airy.) (On the GPU, as a gather per cell, it cost 1.8 ms against 5.4 here at
   * level 7, but in the engine's worker its readback queued behind the ice's steps and the step
   * cost the same.)
   */
  diffuse(dt) {
    const tec = this.tec, g = this.grid, n = g.n, h = tec.h, A = this.areaKm;
    // Each cell's edges, once (i < j over the grid's edges in the order cells list their neighbours, their
    // ell/dist EG): first those where it is the second cell (its lower neighbours, ascending), then those
    // where it is the first (its higher ones, in its list's order), the order a scatter over the edges
    // would add them to the cell in, so the gather by cell (diffuseCells) gives each cell the same sums.
    if (!this.dOff) {
      const lo = Array.from({ length: n }, () => []), hi = Array.from({ length: n }, () => []), eg = [];
      for (let i = 0; i < n; i++) for (let t = g.nbrOff[i], e = g.nbrOff[i + 1]; t < e; t++) {
        const j = g.nbr[t];
        if (j <= i) continue;
        const k = eg.length;
        eg.push(g.ell[t] / g.dist[t]); hi[i].push(k, j); lo[j].push(k, i);
      }
      this.dOff = shared(Int32Array, n + 1); this.dEdge = shared(Int32Array, 2 * eg.length); this.dOther = shared(Int32Array, 2 * eg.length); this.dEG = toShared(Float64Array.from(eg));
      let q = 0;
      for (let i = 0; i < n; i++) {
        for (const L of [lo[i], hi[i]]) for (let u = 0; u < L.length; u += 2) { this.dEdge[q] = L[u]; this.dOther[q] = L[u + 1]; q++; }
        this.dOff[i + 1] = q;
      }
      this.loc = shared(Int32Array, n); this.hc = shared(Float64Array, n); this.hn = shared(Float64Array, n); this.dT = shared(Float64Array, n); this.Ac = shared(Float64Array, n);   // 1 / area (km⁻²)
    }
    // The substeps run on the continental cells packed together (local index c, cell C[c]),
    // which keeps them in cache (scattered over the grid they cost twice as much), and multiply
    // by each cell's 1/area (dividing cost half again).
    const { kap, kapT, C, nc, sub, ds } = this.plan(dt), loc = this.loc, dT = this.dT, Ac = this.Ac;
    let hc = this.hc, hn = this.hn, thick = false;
    for (let c = 0; c < nc; c++) { const i = C[c]; loc[i] = c; hc[c] = h[i]; Ac[c] = 1 / A[i]; dT[c] = 0; if (kapT[i] > 0) thick = true; }
    for (let s = 0; s < sub; s++) {
      parallelSync('diffuse', diffuseCells, { C, kap, kapT, loc, off: this.dOff, edge: this.dEdge, other: this.dOther, EG: this.dEG, ds, thick, hc, hn, Ac, dT }, nc);
      const t = hc; hc = hn; hn = t;
    }
    // The change into the plates' crust: the surface's gain at sea goes on seaward; then every
    // world cell reads its frame cell back, so world cells that share one all see its sum.
    const plates = tec.plates, owner = tec.owner, ref = tec.ref, base = this.base;
    const sed = this.dhSea || (this.dhSea = new Float64Array(n));
    let seaward = false;
    for (let c = 0; c < nc; c++) {
      const i = C[c], d = hc[c] - h[i], t = dT[c];
      if (d === 0) continue;
      const p = plates[owner[i]], j = ref[i], surf = d - t;
      let kept = surf;
      if (base[i] && surf > 0) {
        if (!seaward) { sed.fill(0); seaward = true; for (let k = 0; k < n; k++) this.f[k] = factor(tec.phi[k]); }
        p.h[j] += t;
        kept = 0;
        this.seaward(i, surf * A[i], sed);
      } else p.h[j] += d;
      // Both flows stand on local isostasy (what goes seaward, as deposit has it).
      if (p.mq[j] >= 0) p.mq[j] = Math.fround(p.mq[j] + (RHO_OCEANIC + (RHO_CONTINENTAL - RHO_OCEANIC) * p.phi[j]) * (t + kept));
    }
    for (let c = 0; c < nc; c++) { const i = C[c]; h[i] = plates[owner[i]].h[ref[i]]; }
    if (seaward) this.deposit(sed);
  }

  /** Total continental volume (km³), for conservation checks. */
  volume() {
    let v = 0;
    for (let i = 0; i < this.grid.n; i++) v += this.tec.h[i] * this.areaKm[i];
    return v;
  }
}
