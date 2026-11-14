// Plates and crust (docs/PLAN.md, layer 1). Times in Myr, lengths on the unit
// sphere (radians), speeds in rad/Myr (× 637.1 for cm/yr on Earth's radius).
//
// Each plate is a rotation Q (plate frame → mantle frame) and an angular
// velocity ω. A plate keeps its crust on its own copy of the grid, in plate
// coordinates, as a mask and fields: world cell i reads plate k at Qₖ⁻¹xᵢ, so
// rigid motion is exact. (Resampling a moving field onto the fixed grid each
// step would freeze it: a step moves less than half a cell.)
//
// Each step, every world cell tests the plates that held it or a neighbour:
//   none covers it   a gap: new oceanic crust, age 0, accreted to the plate
//                    that held the cell (ridges grow symmetrically)
//   one              that plate
//   several          the most buoyant stays on top (continent over ocean,
//                    young ocean over old, the incumbent among equals); the
//                    others are consumed there. Ocean going down leaves a slab
//                    (it pulls its plate) and builds an arc on the top plate;
//                    continent against continent thickens the crust, marks a
//                    suture, and, along a long enough front, merges the plates.
// Then ω comes from a torque balance on each plate: slab pull and ridge push
// against basal drag, continents dragging harder (their keels).
import { nearest, gradient } from '../grid/icosphere.js';
import { elevation, subsidence, solveSeaLevel, H_OCEANIC } from './crust.js';

export const EARTH_RADIUS_KM = 6371;
export const CM_PER_YR = EARTH_RADIUS_KM * 1e5 / 1e6;   // per rad/Myr

const MAX_PLATES = 32;
const CONTINENTAL = 0.5;          // felsic fraction above which crust is continental
const H_MAX = 72;                 // km, crust thicker than this spreads (orogenic collapse)
/** Tunable constants; tools and tests may change them. */
export const PARAMS = {
  ARC_DH: 0.35,  // km of arc crust per cell of ocean consumed (at level 6; × the cell's size elsewhere)
  ARC_DPHI: 0.03,
  CLOSING: 0.3,  // share of the relative motion that must close for an overlap to consume
  COLLIDE_FRAC: 0.6,  // share of a consumed continent's crust that stacks
  ARC_TAU: 5,  // Myr, arc volcanism after subduction stops
  SLAB_TAU: 4,  // Myr, a slab's pull where subduction has stopped (or the trench has moved on)
  SLAB_MAX: 0.11,  // rad, ~700 km of slab: the pull saturates
  MERGE_EVENTS: 150,  // collision events (decaying over MERGE_TAU) that weld two plates (at level 6; per area elsewhere)
  MERGE_TAU: 20,
  K_COLLIDE: 0.03,  // resistance of a collision front, per cell, against convergence
  COLLIDE_TAU: 8,  // Myr
  K_SLAB: 0.005,  // slab pull per cell of trench
  FOUNDER_AGE: 140,  // Myr: seafloor this old at a plate's edge, or at its own continent's margin, begins to sink
  INITIATE_CELLS: 15,  // old margin cells needed before a passive margin turns active (at level 6; per length elsewhere)
  INITIATE_GAP: 20,  // Myr between initiations anywhere on the planet
  K_RIDGE: 6e-4,  // ridge push per unit area and subsidence gradient
  KEEL: 2,  // extra drag of continental crust
  V_RELAX: 2,  // Myr, how fast ω follows its torque balance
  V_MAX: 0.0235,  // rad/Myr (15 cm/yr)
  MIN_PLATES: 7,
  MAX_LIVE_PLATES: 16,
  MICROPLATE: 0.004 * 4 * Math.PI,  // a plate smaller than this joins its largest neighbour
  MAX_PLATE_AREA: 0.2 * 4 * Math.PI,
  RIFT_TAU: 25,  // Myr, how long a rift's opening torque lasts
  RIFT_SPEED: 0.004,  // rad/Myr per steradian of plate
  WATER_TAU: 150,  // Myr: the ocean's volume drifts toward the land fraction set at genesis (the deep water cycle's stand-in)
};

// ── Small vector and rotation helpers ──

function quatMul(a, b, out) {
  const w = a[0] * b[0] - a[1] * b[1] - a[2] * b[2] - a[3] * b[3];
  const x = a[0] * b[1] + a[1] * b[0] + a[2] * b[3] - a[3] * b[2];
  const y = a[0] * b[2] - a[1] * b[3] + a[2] * b[0] + a[3] * b[1];
  const z = a[0] * b[3] + a[1] * b[2] - a[2] * b[1] + a[3] * b[0];
  const r = Math.hypot(w, x, y, z);
  out[0] = w / r; out[1] = x / r; out[2] = y / r; out[3] = z / r;
  return out;
}

function quatToMat(q, m) {
  const [w, x, y, z] = q;
  m[0] = 1 - 2 * (y * y + z * z); m[1] = 2 * (x * y - w * z);     m[2] = 2 * (x * z + w * y);
  m[3] = 2 * (x * y + w * z);     m[4] = 1 - 2 * (x * x + z * z); m[5] = 2 * (y * z - w * x);
  m[6] = 2 * (x * z - w * y);     m[7] = 2 * (y * z + w * x);     m[8] = 1 - 2 * (x * x + y * y);
  return m;
}

/** Solve the symmetric 3×3 system M x = b (Cramer, regularized). */
function solve3(M, b, out) {
  const a = M[0] + 1e-9, e = M[4] + 1e-9, i = M[8] + 1e-9;
  const bb = M[1], c = M[2], f = M[5];
  const A = e * i - f * f, B = c * f - bb * i, C = bb * f - c * e;
  const det = a * A + bb * B + c * C;
  if (!(Math.abs(det) > 1e-30)) { out[0] = out[1] = out[2] = 0; return out; }
  const D = a * i - c * c, E = bb * c - a * f, F = a * e - bb * bb;
  out[0] = (A * b[0] + B * b[1] + C * b[2]) / det;
  out[1] = (B * b[0] + D * b[1] + E * b[2]) / det;
  out[2] = (C * b[0] + E * b[1] + F * b[2]) / det;
  return out;
}

function newPlate(n) {
  return {
    alive: false,
    q: new Float64Array([1, 0, 0, 0]),
    R: new Float64Array([1, 0, 0, 0, 1, 0, 0, 0, 1]),
    w: new Float64Array(3),
    torqueExt: new Float64Array(3),
    mask: new Uint8Array(n),
    h: new Float32Array(n),
    phi: new Float32Array(n),
    tf: new Float32Array(n),
    sut: new Float32Array(n).fill(-1e9),
    area: 0,
    land: 0,
  };
}

export class Tectonics {
  constructor(grid) {
    const n = grid.n;
    this.grid = grid;
    // The cell's size against level 6's, where PARAMS were tuned: counts of cells along a line
    // scale as 1/res, counts over an area as 1/res², and what a cell adds to its neighbour as res.
    this.res = Math.sqrt(40962 / n);

    this.t = 0;
    this.plates = [];
    this.owner = new Int16Array(n);
    this.ref = new Int32Array(n);
    this.prevOwner = new Int16Array(n);
    this.prevRef = new Int32Array(n);
    // World samples of the crust on top.
    this.h = new Float32Array(n);
    this.phi = new Float32Array(n);
    this.tf = new Float32Array(n);
    this.sut = new Float32Array(n);
    this.elev = new Float32Array(n);
    this.subs = new Float64Array(n);
    // Events at the surface.
    this.fresh = new Uint8Array(n);          // new crust made here this step
    this.arc = new Float32Array(n);          // arc volcanism (decays)
    this.slab = new Float32Array(n);         // slab hanging under the trench here (rad)
    this.slabPlate = new Int16Array(n).fill(-1);
    this.slabAge = new Float32Array(n);
    this.slabDir = new Float32Array(3 * n);
    this.col = new Float32Array(n);          // collision front here (decays)
    this.colPlate = new Int16Array(n).fill(-1);
    this.colTop = new Int16Array(n).fill(-1);
    this.colDir = new Float32Array(3 * n);
    this.pairs = new Map();                  // collision tallies, key a*MAX+b
    this.water = 0;
    this.seaLevel = 0;
    this.landTarget = 0;                     // set by genesis; 0 holds the water fixed
    this.load = null;                        // km: the bed's depression under ice (src/engine/ice.js)
    this.swell = null;                       // km: hotspot swells (src/engine/plumes.js)
    this.iceWater = 0;                       // water held as ice (km·sr)
    this.grad = new Float64Array(3 * n);
    this.rng = null;
    this.noise = null;
    this.counters = { made: 0, consumed: 0, collided: 0, merges: 0, rifts: 0, opened: 0, closed: 0 };
  }

  alivePlates() { return this.plates.filter(p => p.alive); }

  allocPlate() {
    for (const p of this.plates) if (!p.alive) { p.mask.fill(0); p.sut.fill(-1e9); p.torqueExt.fill(0); p.alive = true; return p; }
    if (this.plates.length >= MAX_PLATES) return null;
    const p = newPlate(this.grid.n);
    p.index = this.plates.length;
    p.alive = true;
    this.plates.push(p);
    return p;
  }

  /** Velocity of plate k at world cell i (rad/Myr, 3-vector). */
  velocity(k, i, out) {
    const w = this.plates[k].w, x = this.grid.pos;
    out[0] = w[1] * x[3 * i + 2] - w[2] * x[3 * i + 1];
    out[1] = w[2] * x[3 * i] - w[0] * x[3 * i + 2];
    out[2] = w[0] * x[3 * i + 1] - w[1] * x[3 * i];
    return out;
  }

  /** Buoyancy rank of the crust plate k holds at its frame cell j. */
  buoyancy(k, j) {
    const p = this.plates[k];
    if (p.phi[j] >= CONTINENTAL) return 2 + 0.001 * p.h[j];
    return 1 - (this.t - p.tf[j]) / 400;
  }

  /**
   * Crust opened at ridges and ocean closed at trenches over dt, in cells, from
   * the plates' motion across each boundary (∫ max(0, ±v·n̂) dℓ dt). Counting the
   * cells that gaps and overlaps make instead also counts the grid's rounding,
   * a few cells along every boundary each step whatever its length, so the rate
   * read would grow as the steps shrink; the carbon cycle's outgassing reads this.
   */
  kinematics(dt) {
    const g = this.grid, n = g.n, pos = g.pos, nbrOff = g.nbrOff, nbr = g.nbr, tan = g.tan, ell = g.ell, owner = this.owner, plates = this.plates;
    let open = 0, close = 0;
    for (let i = 0; i < n; i++) {
      const a = owner[i];
      for (let t = nbrOff[i], e = nbrOff[i + 1]; t < e; t++) {
        const j = nbr[t], b = owner[j];
        if (j < i || b === a) continue;
        // The relative velocity at the edge (ω_b − ω_a) × r, along the normal from i to j.
        const wa = plates[a].w, wb = plates[b].w, dx = wb[0] - wa[0], dy = wb[1] - wa[1], dz = wb[2] - wa[2];
        const x = 0.5 * (pos[3 * i] + pos[3 * j]), y = 0.5 * (pos[3 * i + 1] + pos[3 * j + 1]), z = 0.5 * (pos[3 * i + 2] + pos[3 * j + 2]);
        const vn = (dy * z - dz * y) * tan[3 * t] + (dz * x - dx * z) * tan[3 * t + 1] + (dx * y - dy * x) * tan[3 * t + 2];
        if (vn > 0) open += vn * ell[t];
        else if (this.phi[i] < CONTINENTAL || this.phi[j] < CONTINENTAL) close -= vn * ell[t];
      }
    }
    const cell = 4 * Math.PI / n;
    this.counters.opened += open * dt / cell;
    this.counters.closed += close * dt / cell;
  }

  step(dt) {
    const g = this.grid, n = g.n, pos = g.pos, nbrOff = g.nbrOff, nbr = g.nbr;
    const t1 = this.t + dt;
    const dq = new Float64Array(4);
    for (const p of this.plates) {
      if (!p.alive) continue;
      const wm = Math.hypot(p.w[0], p.w[1], p.w[2]);
      if (wm > 0) {
        const half = 0.5 * wm * dt, s = Math.sin(half) / wm;
        dq[0] = Math.cos(half); dq[1] = p.w[0] * s; dq[2] = p.w[1] * s; dq[3] = p.w[2] * s;
        quatMul(dq, p.q, p.q);
        quatToMat(p.q, p.R);
      }
    }
    this.prevOwner.set(this.owner);
    this.prevRef.set(this.ref);
    this.fresh.fill(0);

    const cand = new Int32Array(8), guess = new Int32Array(8);
    const covK = new Int32Array(8), covJ = new Int32Array(8), locJ = new Int32Array(8);
    const vo = new Float64Array(3), vt = new Float64Array(3);
    const plates = this.plates, prevOwner = this.prevOwner, prevRef = this.prevRef;
    const cellLen = Math.sqrt(4 * Math.PI / n);

    for (let i = 0; i < n; i++) {
      // Candidates: the plates that held this cell or a neighbour.
      let nc = 0;
      const own = prevOwner[i];
      cand[nc] = own; guess[nc] = prevRef[i]; nc++;
      for (let t = nbrOff[i], e = nbrOff[i + 1]; t < e; t++) {
        const j = nbr[t], k = prevOwner[j];
        let seen = false;
        for (let c = 0; c < nc; c++) if (cand[c] === k) { seen = true; break; }
        if (!seen) { cand[nc] = k; guess[nc] = prevRef[j]; nc++; }
      }
      const x = pos[3 * i], y = pos[3 * i + 1], z = pos[3 * i + 2];
      let ncov = 0;
      for (let c = 0; c < nc; c++) {
        const p = plates[cand[c]];
        const R = p.R;
        // Plate-frame position: Rᵀ x.
        const px = R[0] * x + R[3] * y + R[6] * z;
        const py = R[1] * x + R[4] * y + R[7] * z;
        const pz = R[2] * x + R[5] * y + R[8] * z;
        const j = nearest(g, px, py, pz, guess[c]);
        locJ[c] = j;
        if (p.mask[j]) { covK[ncov] = cand[c]; covJ[ncov] = j; ncov++; }
      }

      let top, jt;
      if (ncov === 0) {
        // A gap: new crust, accreted to the plate that held the cell.
        top = own; jt = locJ[0];
        const p = plates[top];
        p.mask[jt] = 1; p.h[jt] = H_OCEANIC; p.phi[jt] = 0; p.tf[jt] = t1 - 0.5 * dt; p.sut[jt] = -1e9;
        this.fresh[i] = 1;
        this.counters.made++;
      } else if (ncov === 1) {
        top = covK[0]; jt = covJ[0];
      } else {
        let best = -Infinity, bi = 0;
        for (let c = 0; c < ncov; c++) {
          const b = this.buoyancy(covK[c], covJ[c]) + (covK[c] === own ? 0.02 : 0);
          if (b > best) { best = b; bi = c; }
        }
        top = covK[bi]; jt = covJ[bi];
        const P = plates[top];
        const topContinental = P.phi[jt] >= CONTINENTAL;
        for (let c = 0; c < ncov; c++) {
          if (c === bi) continue;
          const k = covK[c], j = covJ[c], Q = plates[k];
          // Consume only where the plates close on each other. An overlap where
          // they slide past (a transform) is the grid's rounding: the loser stays
          // hidden under the top and nothing is made of it.
          this.velocity(k, i, vo); this.velocity(top, i, vt);
          let dx = vo[0] - vt[0], dy = vo[1] - vt[1], dz = vo[2] - vt[2];
          const dot = dx * x + dy * y + dz * z;
          dx -= dot * x; dy -= dot * y; dz -= dot * z;
          const r = Math.hypot(dx, dy, dz);
          let nx = 0, ny = 0, nz = 0;
          for (let t = nbrOff[i], e = nbrOff[i + 1]; t < e; t++) {
            const o = prevOwner[nbr[t]];
            const sgn = o === top ? 1 : o === k ? -1 : 0;
            if (sgn) { nx += sgn * g.tan[3 * t]; ny += sgn * g.tan[3 * t + 1]; nz += sgn * g.tan[3 * t + 2]; }
          }
          const closing = dx * nx + dy * ny + dz * nz;
          if (!(closing > PARAMS.CLOSING * r * Math.hypot(nx, ny, nz))) continue;
          Q.mask[j] = 0;
          if (Q.phi[j] >= CONTINENTAL && topContinental) {
            // Collision: the crust stacks; the front is a suture.
            P.h[jt] = Math.min(H_MAX, P.h[jt] + PARAMS.COLLIDE_FRAC * Q.h[j]);
            P.sut[jt] = t1;
            // The front resists: a force on the incoming plate against its approach.
            if (r > 0) {
              this.col[i] = Math.min(1, this.col[i] + 0.5);
              this.colPlate[i] = k; this.colTop[i] = top;
              this.colDir[3 * i] = dx / r; this.colDir[3 * i + 1] = dy / r; this.colDir[3 * i + 2] = dz / r;
            }
            const key = Math.min(top, k) * MAX_PLATES + Math.max(top, k);
            this.pairs.set(key, (this.pairs.get(key) || 0) + 1);
            this.counters.collided++;
          } else {
            // Subduction: a slab hangs here and pulls its plate toward the trench.
            // The slab's length so far follows the trench: inherit the longest
            // slab of this plate beside the cell, so a migrating trench keeps it.
            let len = this.slabPlate[i] === k ? this.slab[i] : 0;
            for (let t = nbrOff[i], e = nbrOff[i + 1]; t < e; t++) {
              const jn = nbr[t];
              if (this.slabPlate[jn] === k && this.slab[jn] > len) len = this.slab[jn];
            }
            this.slab[i] = Math.min(PARAMS.SLAB_MAX, len + cellLen);
            this.slabPlate[i] = k;
            this.slabAge[i] = Math.max(0, this.t - Q.tf[j]);
            if (r > 0) { this.slabDir[3 * i] = dx / r; this.slabDir[3 * i + 1] = dy / r; this.slabDir[3 * i + 2] = dz / r; }
            // The arc on the plate above.
            P.h[jt] = Math.min(H_MAX, P.h[jt] + PARAMS.ARC_DH * this.res);
            P.phi[jt] = Math.min(1, P.phi[jt] + PARAMS.ARC_DPHI * this.res);
            this.arc[i] += 1;
            this.counters.consumed++;
          }
        }
      }
      this.owner[i] = top;
      this.ref[i] = jt;
    }

    this.relaxBoundaries();

    // Sample the crust on top. (Erosion and the spreading of thick crust are
    // the landscape's: src/engine/landscape.js.)
    for (let i = 0; i < n; i++) {
      const p = plates[this.owner[i]], j = this.ref[i];
      this.h[i] = p.h[j]; this.phi[i] = p.phi[j]; this.tf[i] = p.tf[j]; this.sut[i] = p.sut[j];
    }

    const ka = Math.exp(-dt / PARAMS.ARC_TAU), ks = Math.exp(-dt / PARAMS.SLAB_TAU), kc = Math.exp(-dt / PARAMS.COLLIDE_TAU);
    for (let i = 0; i < n; i++) { this.arc[i] *= ka; this.slab[i] *= ks; this.col[i] *= kc; }
    const km = Math.exp(-dt / PARAMS.MERGE_TAU);
    for (const [key, v] of this.pairs) { const nv = v * km; if (nv < 0.5) this.pairs.delete(key); else this.pairs.set(key, nv); }

    this.kinematics(dt);
    this.t = t1;
    this.updateElevation();
    this.exchangeWater(dt);
    this.balance(dt);
    this.mergeWelded();
    this.maybeRift();
    this.maybeInitiate();
  }

  /**
   * Boundary relaxation: a cell held by one plate but surrounded mostly by
   * another passes its crust to the plate around it. Nearest-cell rounding
   * otherwise roughens boundaries a cell at a time until they are fractal;
   * this is a curvature flow at the scale of one cell (a numerical
   * regularization, not geology), and it moves crust without making or
   * destroying any.
   */
  relaxBoundaries() {
    const g = this.grid, n = g.n, pos = g.pos, nbrOff = g.nbrOff, nbr = g.nbr, owner = this.owner;
    const ks = new Int32Array(8), cs = new Int32Array(8), gs = new Int32Array(8);
    for (let i = 0; i < n; i++) {
      const own = owner[i], o = nbrOff[i], e = nbrOff[i + 1], d = e - o;
      let nk = 0, same = 0;
      for (let t = o; t < e; t++) {
        const k = owner[nbr[t]];
        if (k === own) { same++; continue; }
        let c = 0;
        while (c < nk && ks[c] !== k) c++;
        if (c === nk) { ks[nk] = k; cs[nk] = 0; gs[nk] = this.ref[nbr[t]]; nk++; }
        cs[c]++;
      }
      if (same > 1) continue;
      let m = -1;
      for (let c = 0; c < nk; c++) if (cs[c] >= d - 2) { m = c; break; }
      if (m < 0) continue;
      const to = ks[m], P = this.plates[own], Q = this.plates[to], R = Q.R;
      const x = pos[3 * i], y = pos[3 * i + 1], z = pos[3 * i + 2];
      const jf = this.ref[i];
      const jt = nearest(g, R[0] * x + R[3] * y + R[6] * z, R[1] * x + R[4] * y + R[7] * z, R[2] * x + R[5] * y + R[8] * z, gs[m]);
      Q.mask[jt] = 1; Q.h[jt] = P.h[jf]; Q.phi[jt] = P.phi[jf]; Q.tf[jt] = P.tf[jf]; Q.sut[jt] = P.sut[jf];
      P.mask[jf] = 0;
      owner[i] = to; this.ref[i] = jt;
      this.counters.relaxed = (this.counters.relaxed || 0) + 1;
    }
  }

  /**
   * Over hundreds of Myr the ocean's volume drifts so the continents keep
   * their freeboard: a stand-in for the water that ridges degas and trenches
   * subduct, which is thought to buffer sea level (the mechanism is debated).
   * Sea level moves 3 km per unit of land fraction off the target, per τ.
   */
  exchangeWater(dt) {
    if (!(this.landTarget > 0) || !(PARAMS.WATER_TAU > 0)) return;
    const g = this.grid, n = g.n, s = this.seaLevel;
    let land = 0;
    for (let i = 0; i < n; i++) if (this.elev[i] > s) land += g.area[i];
    land /= 4 * Math.PI;
    this.water += (1 - land) * 4 * Math.PI * 3 * (land - this.landTarget) * dt / PARAMS.WATER_TAU;
  }

  updateElevation() {
    const n = this.grid.n, load = this.load, swell = this.swell;
    for (let i = 0; i < n; i++) {
      const age = this.t - this.tf[i];
      this.subs[i] = this.phi[i] < CONTINENTAL ? subsidence(age) : 0;
      this.elev[i] = elevation(this.h[i], this.phi[i], age) + (load ? load[i] : 0) + (swell ? swell[i] : 0);
    }
    if (this.water > 0) this.seaLevel = solveSeaLevel(this.grid, this.elev, Math.max(0.1 * this.water, this.water - this.iceWater), this.seaLevel);
  }

  /** ω from slab pull and ridge push against basal drag, per plate. */
  balance(dt) {
    const g = this.grid, n = g.n, pos = g.pos, area = g.area;
    const cellLen = Math.sqrt(4 * Math.PI / n);
    const np = this.plates.length;
    const M = new Float64Array(9 * np), T = new Float64Array(3 * np);
    for (let k = 0; k < np; k++) { const p = this.plates[k]; p.area = 0; p.land = 0; T[3 * k] = p.torqueExt[0]; T[3 * k + 1] = p.torqueExt[1]; T[3 * k + 2] = p.torqueExt[2]; }

    // Ridge push: oceanic lithosphere slides down its own cooling slope.
    // The gradient of subsidence is taken within a plate's ocean only.
    const subs = this.subs, owner = this.owner, phi = this.phi, nbrOff = g.nbrOff, nbr = g.nbr, gw = g.gw;
    for (let i = 0; i < n; i++) {
      const k = owner[i], p = this.plates[k], A = area[i];
      const x = pos[3 * i], y = pos[3 * i + 1], z = pos[3 * i + 2];
      const c = A * (1 + PARAMS.KEEL * phi[i]);
      const o = 9 * k;
      M[o] += c * (1 - x * x); M[o + 1] -= c * x * y; M[o + 2] -= c * x * z;
      M[o + 4] += c * (1 - y * y); M[o + 5] -= c * y * z; M[o + 8] += c * (1 - z * z);
      p.area += A;
      if (phi[i] >= CONTINENTAL) { p.land += A; continue; }
      let gx = 0, gy = 0, gz = 0;
      const si = subs[i];
      for (let t = nbrOff[i], e = nbrOff[i + 1]; t < e; t++) {
        const j = nbr[t];
        if (owner[j] !== k || phi[j] >= CONTINENTAL) continue;
        const d = subs[j] - si;
        gx += d * gw[3 * t]; gy += d * gw[3 * t + 1]; gz += d * gw[3 * t + 2];
      }
      const f = PARAMS.K_RIDGE * A;
      const fx = f * gx, fy = f * gy, fz = f * gz;
      T[3 * k] += y * fz - z * fy; T[3 * k + 1] += z * fx - x * fz; T[3 * k + 2] += x * fy - y * fx;
    }
    // Slab pull, along the trench line only: each cell of a plate's edge pulls
    // with the longest slab of that plate hanging within a cell of it. (The
    // slab memory behind a migrating trench is a band; counting the band
    // would make pull grow with speed and run away.)
    for (let i = 0; i < n; i++) {
      const k = owner[i];
      let edge = false;
      for (let t = nbrOff[i], e = nbrOff[i + 1]; t < e; t++) if (owner[nbr[t]] !== k) { edge = true; break; }
      if (!edge) continue;
      let s = this.slabPlate[i] === k ? this.slab[i] : 0, si = i;
      for (let t = nbrOff[i], e = nbrOff[i + 1]; t < e; t++) {
        const j = nbr[t];
        if (this.slabPlate[j] === k && this.slab[j] > s) { s = this.slab[j]; si = j; }
      }
      if (s < 1e-4) {
        // Old seafloor at a plate's edge founders: subduction begins there.
        const age = this.t - this.tf[i];
        if (phi[i] >= CONTINENTAL || age < PARAMS.FOUNDER_AGE) continue;
        let dx = 0, dy = 0, dz = 0;
        for (let t = nbrOff[i], e = nbrOff[i + 1]; t < e; t++) if (owner[nbr[t]] !== k) { dx += g.tan[3 * t]; dy += g.tan[3 * t + 1]; dz += g.tan[3 * t + 2]; }
        const r = Math.hypot(dx, dy, dz);
        if (!(r > 0)) continue;
        this.slab[i] = s = 0.3 * PARAMS.SLAB_MAX; this.slabPlate[i] = k; this.slabAge[i] = age; si = i;
        this.slabDir[3 * i] = dx / r; this.slabDir[3 * i + 1] = dy / r; this.slabDir[3 * i + 2] = dz / r;
        this.counters.foundered = (this.counters.foundered || 0) + 1;
      }
      const f = PARAMS.K_SLAB * (s / PARAMS.SLAB_MAX) * Math.sqrt(Math.max(0, Math.min(this.slabAge[si], 150)) / 100) * cellLen;
      const fx = f * this.slabDir[3 * si], fy = f * this.slabDir[3 * si + 1], fz = f * this.slabDir[3 * si + 2];
      const x = pos[3 * i], y = pos[3 * i + 1], z = pos[3 * i + 2];
      T[3 * k] += y * fz - z * fy; T[3 * k + 1] += z * fx - x * fz; T[3 * k + 2] += x * fy - y * fx;
    }
    // Collision fronts resist convergence: equal and opposite on the two plates.
    for (let i = 0; i < n; i++) {
      const c = this.col[i];
      if (c < 1e-3) continue;
      const a = this.colPlate[i], b = this.colTop[i];
      if (a < 0 || b < 0 || !this.plates[a].alive || !this.plates[b].alive) continue;
      // A front's memory builds per crossing, twice as often a cell a level up: × res.
      const f = PARAMS.K_COLLIDE * c * cellLen * this.res;
      const fx = -f * this.colDir[3 * i], fy = -f * this.colDir[3 * i + 1], fz = -f * this.colDir[3 * i + 2];
      const x = pos[3 * i], y = pos[3 * i + 1], z = pos[3 * i + 2];
      const tx = y * fz - z * fy, ty = z * fx - x * fz, tz = x * fy - y * fx;
      T[3 * a] += tx; T[3 * a + 1] += ty; T[3 * a + 2] += tz;
      T[3 * b] -= tx; T[3 * b + 1] -= ty; T[3 * b + 2] -= tz;
    }
    // Symmetric fill and solve.
    const w = new Float64Array(3), mk = new Float64Array(9), tk = new Float64Array(3);
    const a = 1 - Math.exp(-dt / PARAMS.V_RELAX), ke = Math.exp(-dt / PARAMS.RIFT_TAU);
    for (let k = 0; k < np; k++) {
      const p = this.plates[k];
      if (!p.alive) continue;
      const o = 9 * k;
      mk[0] = M[o]; mk[1] = M[o + 1]; mk[2] = M[o + 2];
      mk[3] = M[o + 1]; mk[4] = M[o + 4]; mk[5] = M[o + 5];
      mk[6] = M[o + 2]; mk[7] = M[o + 5]; mk[8] = M[o + 8];
      tk[0] = T[3 * k]; tk[1] = T[3 * k + 1]; tk[2] = T[3 * k + 2];
      // Regularize by the plate's own size, so a sliver can't spin up without bound.
      const reg = 1e-3 * Math.max(p.area, 1e-6);
      mk[0] += reg; mk[4] += reg; mk[8] += reg;
      solve3(mk, tk, w);
      let wm = Math.hypot(w[0], w[1], w[2]);
      if (!Number.isFinite(wm)) { w[0] = w[1] = w[2] = 0; wm = 0; }
      if (wm > PARAMS.V_MAX) { const s = PARAMS.V_MAX / wm; w[0] *= s; w[1] *= s; w[2] *= s; }
      for (let c = 0; c < 3; c++) { p.w[c] += (w[c] - p.w[c]) * a; p.torqueExt[c] *= ke; }
      if (p.area < 1e-9) p.alive = false;
    }
  }

  /** Plates welded along a long enough collision front become one; a microplate joins its largest neighbour. */
  mergeWelded() {
    const g = this.grid, n = g.n;
    for (const p of this.alivePlates()) {
      if (p.area >= PARAMS.MICROPLATE || this.alivePlates().length <= PARAMS.MIN_PLATES) continue;
      const border = new Map();
      for (let i = 0; i < n; i++) {
        if (this.owner[i] !== p.index) continue;
        for (let t = g.nbrOff[i], e = g.nbrOff[i + 1]; t < e; t++) {
          const o = this.owner[g.nbr[t]];
          if (o !== p.index) border.set(o, (border.get(o) || 0) + 1);
        }
      }
      let into = -1, most = 0;
      for (const [o, c] of border) if (c > most) { most = c; into = o; }
      if (into >= 0 && this.plates[into].alive) this.merge(into, p.index);
    }
    for (const [key, v] of this.pairs) {
      if (v < PARAMS.MERGE_EVENTS / (this.res * this.res)) continue;
      const a = Math.floor(key / MAX_PLATES), b = key % MAX_PLATES;
      this.pairs.delete(key);
      const A = this.plates[a], B = this.plates[b];
      if (!A.alive || !B.alive) continue;
      if (A.area >= B.area) this.merge(a, b); else this.merge(b, a);
    }
  }

  /** Re-express plate b's crust in plate a's frame; a keeps momentum-weighted ω. */
  merge(a, b) {
    const g = this.grid, n = g.n, pos = g.pos;
    const A = this.plates[a], B = this.plates[b];
    const RA = A.R, RB = B.R;
    let guess = -1;
    for (let j = 0; j < n; j++) {
      if (!B.mask[j]) continue;
      const x = pos[3 * j], y = pos[3 * j + 1], z = pos[3 * j + 2];
      const wx = RB[0] * x + RB[1] * y + RB[2] * z, wy = RB[3] * x + RB[4] * y + RB[5] * z, wz = RB[6] * x + RB[7] * y + RB[8] * z;
      const ax = RA[0] * wx + RA[3] * wy + RA[6] * wz, ay = RA[1] * wx + RA[4] * wy + RA[7] * wz, az = RA[2] * wx + RA[5] * wy + RA[8] * wz;
      const ja = nearest(g, ax, ay, az, guess);
      guess = ja;
      if (!A.mask[ja] || B.phi[j] > A.phi[ja]) {
        A.mask[ja] = 1; A.h[ja] = B.h[j]; A.phi[ja] = B.phi[j]; A.tf[ja] = B.tf[j]; A.sut[ja] = B.sut[j];
      }
    }
    const wa = A.area, wb = B.area;
    for (let c = 0; c < 3; c++) { A.w[c] = (A.w[c] * wa + B.w[c] * wb) / (wa + wb); A.torqueExt[c] += B.torqueExt[c]; }
    B.alive = false;
    this.relocate(b, a);
    this.counters.merges++;
  }

  /** World cells owned by `from` (or whose slabs belong to it) now belong to `to`. */
  relocate(from, to) {
    const g = this.grid, n = g.n, pos = g.pos, R = this.plates[to].R;
    let guess = -1;
    for (let i = 0; i < n; i++) {
      if (this.slabPlate[i] === from) this.slabPlate[i] = to;
      if (this.colPlate[i] === from) this.colPlate[i] = to;
      if (this.colTop[i] === from) this.colTop[i] = to;
      if (this.colPlate[i] === this.colTop[i]) this.col[i] = 0;
      if (this.owner[i] !== from) continue;
      const x = pos[3 * i], y = pos[3 * i + 1], z = pos[3 * i + 2];
      const j = nearest(g, R[0] * x + R[3] * y + R[6] * z, R[1] * x + R[4] * y + R[7] * z, R[2] * x + R[5] * y + R[8] * z, guess);
      guess = j;
      this.owner[i] = to; this.ref[i] = j;
    }
  }

  /**
   * Subduction begins at an old passive margin: where a plate's own seafloor
   * has aged past FOUNDER_AGE against its own continent, the ocean breaks
   * away as a plate of its own and starts to sink under the continent.
   */
  maybeInitiate() {
    const g = this.grid, n = g.n, nbrOff = g.nbrOff, nbr = g.nbr;
    if (this.t - (this.lastInitiation ?? -1e9) < PARAMS.INITIATE_GAP) return;
    if (this.alivePlates().length >= PARAMS.MAX_LIVE_PLATES) return;
    const owner = this.owner, phi = this.phi;
    const margin = new Map();
    for (let i = 0; i < n; i++) {
      if (phi[i] >= CONTINENTAL || this.t - this.tf[i] < PARAMS.FOUNDER_AGE) continue;
      const k = owner[i];
      for (let t = nbrOff[i], e = nbrOff[i + 1]; t < e; t++) {
        const j = nbr[t];
        if (owner[j] === k && phi[j] >= CONTINENTAL) { (margin.get(k) || margin.set(k, []).get(k)).push(i); break; }
      }
    }
    let bestK = -1, best = null;
    for (const [k, cells] of margin) if (cells.length >= PARAMS.INITIATE_CELLS / this.res && (!best || cells.length > best.length)) { bestK = k; best = cells; }
    if (bestK < 0) return;
    const A = this.plates[bestK];
    const B = this.allocPlate();
    if (!B) return;
    B.q.set(A.q); B.R.set(A.R); B.w.set(A.w);
    // The ocean attached to that margin, by flood fill through the plate's seafloor.
    const take = new Uint8Array(n), stack = best.slice();
    for (const i of best) take[i] = 1;
    while (stack.length) {
      const i = stack.pop();
      for (let t = nbrOff[i], e = nbrOff[i + 1]; t < e; t++) {
        const j = nbr[t];
        if (take[j] || owner[j] !== bestK || phi[j] >= CONTINENTAL) continue;
        take[j] = 1; stack.push(j);
      }
    }
    for (let i = 0; i < n; i++) {
      if (!take[i]) continue;
      const j = this.ref[i];
      B.mask[j] = 1; B.h[j] = A.h[j]; B.phi[j] = A.phi[j]; B.tf[j] = A.tf[j]; B.sut[j] = A.sut[j];
      A.mask[j] = 0;
      owner[i] = B.index;
    }
    // A slab on the margin, pulling the new plate under the continent.
    for (const i of best) {
      let dx = 0, dy = 0, dz = 0;
      for (let t = nbrOff[i], e = nbrOff[i + 1]; t < e; t++) if (owner[nbr[t]] === bestK) { dx += g.tan[3 * t]; dy += g.tan[3 * t + 1]; dz += g.tan[3 * t + 2]; }
      const r = Math.hypot(dx, dy, dz);
      if (!(r > 0)) continue;
      this.slab[i] = 0.5 * PARAMS.SLAB_MAX; this.slabPlate[i] = B.index; this.slabAge[i] = this.t - this.tf[i];
      this.slabDir[3 * i] = dx / r; this.slabDir[3 * i + 1] = dy / r; this.slabDir[3 * i + 2] = dz / r;
    }
    this.lastInitiation = this.t;
    this.counters.initiated = (this.counters.initiated || 0) + 1;
  }

  /** Too few plates, or one too large: split the largest along a weak line. */
  maybeRift() {
    const alive = this.alivePlates();
    let big = null;
    for (const p of alive) if (!big || p.area > big.area) big = p;
    if (!big) return;
    if (alive.length >= PARAMS.MIN_PLATES && big.area < PARAMS.MAX_PLATE_AREA) return;
    this.rift(big.index);
  }

  /** Split plate k; along a plane through `through` (a unit vector, a plume) if given. */
  rift(k, through = null) {
    const g = this.grid, n = g.n, pos = g.pos;
    const A = this.plates[k];
    const B = this.allocPlate();
    if (!B || !this.rng) return;
    // Centroid of the plate in the world.
    let cx = 0, cy = 0, cz = 0;
    for (let i = 0; i < n; i++) if (this.owner[i] === k) { const a = g.area[i]; cx += a * pos[3 * i]; cy += a * pos[3 * i + 1]; cz += a * pos[3 * i + 2]; }
    const cr = Math.hypot(cx, cy, cz) || 1;
    cx /= cr; cy /= cr; cz /= cr;
    // Candidate rift planes through the centroid; prefer the one over most old sutures.
    let best = null, bestScore = -1;
    if (through) {
      // The plane through the centroid and the plume, tilted by chance about that line.
      const [px, py, pz] = through;
      let ax = cy * pz - cz * py, ay = cz * px - cx * pz, az = cx * py - cy * px;
      const ar = Math.hypot(ax, ay, az);
      if (ar > 1e-6) {
        ax /= ar; ay /= ar; az /= ar;
        const u = this.rng.unitVector(), tilt = 0.4 * (u[0] * ax + u[1] * ay + u[2] * az);
        best = [ax, ay, az];
        // Small tilt toward a random direction in the plane, keeping it through the plume.
        const bx = py * az - pz * ay, by = pz * ax - px * az, bz = px * ay - py * ax;
        best = [ax + tilt * bx, ay + tilt * by, az + tilt * bz];
        const br = Math.hypot(...best); best = best.map(v => v / br);
        bestScore = Infinity;
      }
    }
    for (let c = 0; c < 8 && bestScore < Infinity; c++) {
      const u = this.rng.unitVector();
      const d = u[0] * cx + u[1] * cy + u[2] * cz;
      let mx = u[0] - d * cx, my = u[1] - d * cy, mz = u[2] - d * cz;
      const mr = Math.hypot(mx, my, mz); mx /= mr; my /= mr; mz /= mr;
      let score = 0;
      for (let i = 0; i < n; i++) {
        if (this.owner[i] !== k || this.sut[i] < -1e8) continue;
        const s = pos[3 * i] * mx + pos[3 * i + 1] * my + pos[3 * i + 2] * mz;
        if (Math.abs(s) < 0.05) score++;
      }
      if (score > bestScore) { bestScore = score; best = [mx, my, mz]; }
    }
    const [mx, my, mz] = best;
    B.alive = true;
    B.q.set(A.q); B.R.set(A.R); B.w.set(A.w);
    const R = A.R;
    for (let j = 0; j < n; j++) {
      if (!A.mask[j]) continue;
      const x = pos[3 * j], y = pos[3 * j + 1], z = pos[3 * j + 2];
      const wx = R[0] * x + R[1] * y + R[2] * z, wy = R[3] * x + R[4] * y + R[5] * z, wz = R[6] * x + R[7] * y + R[8] * z;
      const s = wx * mx + wy * my + wz * mz + (this.noise ? 0.12 * this.noise.fbm(wx, wy, wz, 2.2, 4) : 0);
      if (s > 0) {
        B.mask[j] = 1; B.h[j] = A.h[j]; B.phi[j] = A.phi[j]; B.tf[j] = A.tf[j]; B.sut[j] = A.sut[j];
        A.mask[j] = 0;
      }
    }
    for (let i = 0; i < n; i++) if (this.owner[i] === k && B.mask[this.ref[i]]) this.owner[i] = B.index;
    // Opening: rotate the halves apart about the axis in the rift plane.
    const ax = cy * mz - cz * my, ay = cz * mx - cx * mz, az = cx * my - cy * mx;
    const f = PARAMS.RIFT_SPEED * A.area * 0.5;
    B.torqueExt[0] += f * ax; B.torqueExt[1] += f * ay; B.torqueExt[2] += f * az;
    A.torqueExt[0] -= f * ax; A.torqueExt[1] -= f * ay; A.torqueExt[2] -= f * az;
    this.counters.rifts++;
  }

  /** Boundary edges for drawing: type 1 divergent, 2 convergent, 3 transform. */
  boundaries() {
    const g = this.grid, n = g.n, pos = g.pos, nbrOff = g.nbrOff, nbr = g.nbr, corner = g.corner;
    const out = [];
    const va = new Float64Array(3), vb = new Float64Array(3);
    for (let i = 0; i < n; i++) {
      const a = this.owner[i];
      const o = nbrOff[i], d = nbrOff[i + 1] - o;
      for (let k = 0; k < d; k++) {
        const j = nbr[o + k];
        if (j < i) continue;
        const b = this.owner[j];
        if (a === b) continue;
        this.velocity(a, i, va); this.velocity(b, j, vb);
        const tx = g.tan[3 * (o + k)], ty = g.tan[3 * (o + k) + 1], tz = g.tan[3 * (o + k) + 2];
        const dvx = vb[0] - va[0], dvy = vb[1] - va[1], dvz = vb[2] - va[2];
        const vn = dvx * tx + dvy * ty + dvz * tz;
        const dv = Math.hypot(dvx, dvy, dvz);
        let type = 3;
        if (vn > 0.4 * dv) type = 1; else if (vn < -0.4 * dv) type = 2;
        // Which side stays on top at a convergent edge: +1 if i's side.
        const over = this.buoyancyAt(i) >= this.buoyancyAt(j) ? 1 : -1;
        out.push(corner[o + (k + d - 1) % d], corner[o + k], type, over, i, j, dv);
      }
    }
    return out;
  }

  buoyancyAt(i) { return this.phi[i] >= CONTINENTAL ? 2 + 0.001 * this.h[i] : 1 - (this.t - this.tf[i]) / 400; }

  stats() {
    const g = this.grid, n = g.n;
    let land = 0, ocean = 0, oceanAge = 0;
    for (let i = 0; i < n; i++) {
      if (this.elev[i] > this.seaLevel) land += g.area[i];
      if (this.phi[i] < CONTINENTAL) { ocean += g.area[i]; oceanAge += g.area[i] * (this.t - this.tf[i]); }
    }
    let vmax = 0;
    for (const p of this.alivePlates()) vmax = Math.max(vmax, Math.hypot(p.w[0], p.w[1], p.w[2]));
    return {
      plates: this.alivePlates().length,
      land: land / (4 * Math.PI),
      meanOceanAge: oceanAge / Math.max(ocean, 1e-9),
      fastest: vmax * CM_PER_YR,
      seaLevel: this.seaLevel,
    };
  }
}

export { CONTINENTAL };
