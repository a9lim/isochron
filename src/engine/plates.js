// Plates and crust (docs/plates.md). Times in Myr, lengths on the unit
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
// Then the crust deforms past the rigid plates (deform): rifted margins stretch
// into the gaps beside them, an orogen's wedge spreads behind its front, and a
// plateau past H_PLATEAU widens instead of rising.
// Then ω comes from a torque balance on each plate: slab pull and ridge push
// against basal drag, continents dragging harder (their keels), and each slab's
// own resistance to sinking, so a plate its slabs drive moves at about their
// sinking speed whatever its size (Forsyth and Uyeda's result). A plate is one
// connected body: a piece the step cuts off becomes a plate of its own or joins
// the plate around it (resolveFragments).
//
// Other layers keep state of their own with the crust, in the same frames
// (FRAME_EXTRA): the regolith (src/engine/regolith.js), the flexure's
// correction to the elevation and the column's mass it last saw
// (src/engine/crustflex.js), the cell's lowest land below its mean, where
// its water runs (today's Earth's, src/engine/earth.js: `channel`), and the
// sea's channel through it below its mean (`gs`: Earth's baked reach, then the
// straits' scour: `seaChannel`, `scour`). They travel as the crust does: copied where crust
// moves between frames (relaxation, merges, rifts, initiation), set to their
// defaults where crust is new.
import { nearest, gradient } from '../grid/icosphere.js';
import { elevation, subsidence, solveSeaLevel, seaMask, SEA, H_OCEANIC, RHO_OCEANIC, RHO_CONTINENTAL, RHO_MANTLE } from './crust.js';

export const EARTH_RADIUS_KM = 6371;
export const CM_PER_YR = EARTH_RADIUS_KM * 1e5 / 1e6;   // per rad/Myr

const MAX_PLATES = 32;
const CONTINENTAL = 0.5;          // felsic fraction above which crust is continental
/** Tunable constants; tools and tests may change them. */
export const PARAMS = {
  ARC_DH: 0.35,  // km of arc crust per cell of ocean consumed (at level 6; × the cell's size elsewhere)
  ARC_DPHI: 0.03,
  CLOSING: 0.3,  // share of the relative motion that must close for an overlap to consume
  COLLIDE_FRAC: 0.85,  // share of a consumed continent's crust that stacks (the rest sinks: Earth's collisions recycle a small part of the ~3 km³/yr its continents lose, from memory; with rifts' stretching it holds the continents near Earth's 40% of the sphere)
  H_STACK: 150,  // km: the most a cell's crust stacks to in one step (a bound: the orogen spreads it, `orogeny`)
  H_PLATEAU: 60,  // km: crust thicker than this spreads into its plate (an orogenic plateau's: Tibet's in the sim's isostasy, earth.js)
  STRETCH: 0.3,  // share of a rifted margin's crust that stretches into the new cell beside it (deform)
  H_BREAK: 10,  // km: crust thinner than this breaks: what opens beside it is ocean (Earth's ~15 km of real crust; the sim's isostasy stands crust thinner, earth.js)
  TAPER: 0.12,  // km of crust per km inland: the steepest an active orogen's thickening stands behind its front (its wedge's taper, ~1.6 km of relief per 100 km)
  ARC_TAU: 5,  // Myr, arc volcanism after subduction stops
  SLAB_TAU: 15,  // Myr, a slab's memory: how long its upper-mantle part takes to sink away once subduction stops (or the trench moves on)
  SLAB_MAX: 0.11,  // rad, ~700 km of slab: the pull saturates
  MERGE_EVENTS: 150,  // collision events (decaying over MERGE_TAU) that weld two plates (at level 6; per area elsewhere)
  MERGE_TAU: 20,
  K_COLLIDE: 0.03,  // resistance of a collision front, per cell, against convergence
  COLLIDE_TAU: 8,  // Myr
  K_SLAB: 0.04,  // slab pull per cell of trench (any level: see balance); 0.008 (× √res) before the slab's resistance, 0.005 while plates' stray pieces pulled too (resolveFragments)
  K_TRENCH: 2,  // a slab's resistance to sinking per cell of trench, along its pull: a saturated slab sinks at K_SLAB/K_TRENCH (0.02 rad/Myr, 12.7 cm/yr) × its age's factor
  SLAB_CLOSING: 0.6,  // share of the relative motion that must close across a boundary for a slab to hang there (CLOSING consumes from 0.3: where plates mostly slide past, consumption is the grid's rounding)
  FOUNDER_AGE: 140,  // Myr: seafloor this old at a plate's edge, or at its own continent's margin, begins to sink
  INITIATE_CELLS: 15,  // old margin cells needed before a passive margin turns active (at level 6; per length elsewhere)
  INITIATE_GAP: 20,  // Myr between initiations anywhere on the planet
  K_RIDGE: 6e-4,  // ridge push per unit area and subsidence gradient (at level 6; × res^0.2 elsewhere)
  KEEL: 2,  // extra drag of continental crust
  V_RELAX: 2,  // Myr, how fast ω follows its torque balance
  V_MAX: 0.0314,  // rad/Myr (20 cm/yr: India's, ~60–50 Ma, from memory); a step past STEP_CELLS runs as substeps
  MIN_PLATES: 7,
  MAX_LIVE_PLATES: 16,
  MICROPLATE: 0.004 * 4 * Math.PI,  // a plate smaller than this joins its largest neighbour
  MAX_PLATE_AREA: 0.25 * 4 * Math.PI,  // a plate larger than this rifts (Earth's Pacific is ~20% of the surface, 22% in the sim with its slivers)
  STEP_CELLS: 1,  // cells of the grid the fastest plate may move in one step; past it the step runs as substeps
  FRAGMENTS: 0.5,  // Myr of plate time between checks that each plate is one piece (resolveFragments)
  RIFT_TAU: 25,  // Myr, how long a rift's opening torque lasts
  RIFT_SPEED: 0.004,  // rad/Myr per steradian of plate
  WATER_TAU: 150,  // Myr: the ocean's volume drifts toward the land fraction set at genesis (the deep water cycle's stand-in)
};

/** Per frame cell, with the crust: name and the value new crust starts with (−1: not yet seen). */
export const FRAME_EXTRA = { reg: 0, cf: 0, mq: -1, gz: 0, gs: 0 };
const EXTRA = Object.entries(FRAME_EXTRA);

/** Crust and its extras from frame cell jf of plate P to jt of Q (which then holds it). */
export function copyCell(P, jf, Q, jt) {
  Q.mask[jt] = 1; Q.h[jt] = P.h[jf]; Q.phi[jt] = P.phi[jf]; Q.tf[jt] = P.tf[jf]; Q.sut[jt] = P.sut[jf];
  for (const [k] of EXTRA) Q[k][jt] = P[k][jf];
}
/** A frame cell's extras as new crust has them. */
export function freshExtras(P, j) { for (const [k, v] of EXTRA) P[k][j] = v; }

/**
 * Each world cell's channel (km): where its water runs, its mean elevation less the depth of its
 * lowest land below the mean (`gz`, km: a gorge narrower than a cell; today's Earth's, else 0), never
 * below sea level unless the cell's mean is. The landscape and the lakes route on it.
 */
export function channel(tec, out) {
  const n = tec.grid.n, s = tec.seaLevel;
  for (let i = 0; i < n; i++) {
    const e = tec.elev[i], g = tec.plates[tec.owner[i]].gz[tec.ref[i]];
    out[i] = g > 0 ? Math.max(e - g, Math.min(e, s)) : e;
  }
  return out;
}

/**
 * Each world cell's height for the sea's reach (km): its mean elevation less its sea channel (`gs`,
 * km: how far below the mean the sea gets through the cell, below the grid's scale: a strait).
 * The ocean's mask joins cells on it (crust.js, seaMask); their wet area stays the mean's.
 */
export function seaChannel(tec, out) {
  const n = tec.grid.n, plates = tec.plates, owner = tec.owner, ref = tec.ref, elev = tec.elev;
  for (let i = 0; i < n; i++) { const p = plates[owner[i]], g = p ? p.gs[ref[i]] : 0; out[i] = g > 0 ? elev[i] - g : elev[i]; }
  return out;
}

const scratch = new WeakMap();   // per grid: the fragments' labels and work arrays (resolveFragments)

/** Each plate's world cells by connected component: comp per cell, and per component its area (cA) and plate (cK); the count. */
function components(g, owner, s) {
  const n = g.n, nbrOff = g.nbrOff, nbr = g.nbr, area = g.area, comp = s.comp, stack = s.stack, cA = s.cA, cK = s.cK;
  comp.fill(-1);
  let nc = 0;
  for (let i = 0; i < n; i++) {
    if (comp[i] >= 0) continue;
    const k = owner[i];
    let sp = 0, A = 0;
    stack[sp++] = i; comp[i] = nc;
    while (sp > 0) {
      const q = stack[--sp];
      A += area[q];
      for (let t = nbrOff[q], e = nbrOff[q + 1]; t < e; t++) { const j = nbr[t]; if (comp[j] < 0 && owner[j] === k) { comp[j] = nc; stack[sp++] = j; } }
    }
    cA[nc] = A; cK[nc] = k; nc++;
  }
  return nc;
}

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
    ...Object.fromEntries(EXTRA.map(([k, v]) => [k, new Float32Array(n).fill(v)])),
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
    this.flexc = null;                       // km: the flexure's correction to the elevation, the frames' cf sampled (src/engine/crustflex.js)
    this.swell = null;                       // km: hotspot swells (src/engine/plumes.js)
    this.iceWater = 0;                       // water held as ice (km·sr)
    // The ocean (crust.js, seaMask): the cells below sea level the open ocean reaches. A basin
    // below sea level it doesn't reach is land, dry or holding a lake (solveSea).
    this.sea = new Uint8Array(n);
    this.strait = new Uint8Array(n);         // the ocean's cells and its channels, the mask's memory
    this.oceanArea = 0;                      // sr
    this.lakeWater = 0;                      // water held in lakes (km·sr), off the sea: the planet keeps it
    this.lakeDepth = null;                   // km per cell: the lakes' water (src/engine/lakes.js, depth), when the planet has lakes
    this.cutWater = new Float32Array(n);     // km: a basin's water the sea left there, until the lakes take it
    this.cutHeld = 0;                        // km·sr: its sum (in lakeWater meanwhile)
    this.basins = 0;                         // basins cut off or reached so far (the planet rebuilds its lakes on a change)
    this.boiled = 0;                         // the share of the sea boiled away (the people's runaway: src/engine/peoplelink.js)
    this.datum = 0;                          // where the sea would stand unboiled: the air's datum for heights (`airDatum`)
    this.grad = new Float64Array(3 * n);
    this.rng = null;
    this.noise = null;
    this.counters = { made: 0, consumed: 0, collided: 0, merges: 0, rifts: 0, opened: 0, closed: 0 };
    // What the CPU rewrote outside the step (rare events), for the GPU's mirror (src/gpu/plates.js):
    // whole plates, or frame cells one by one (k·n + j: a plate's stray pieces passed on, kept with a GPU).
    this.dirty = { plates: new Set(), cells: new Set(), owner: false, mem: false };
    this.gpu = null;
  }

  alivePlates() { return this.plates.filter(p => p.alive); }

  allocPlate() {
    for (const p of this.plates) if (!p.alive) { p.mask.fill(0); p.sut.fill(-1e9); for (const [k, v] of EXTRA) p[k].fill(v); p.torqueExt.fill(0); p.alive = true; return p; }
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

  /** Each plate turned by its ω over dt (exact: the frames move, nothing is resampled). */
  rotate(dt) {
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
  }

  /**
   * The step finds a world cell's plates among those that held it or a neighbour, so a plate may
   * move about a cell of the grid in one: past it, crust running ahead of its plate's edge goes
   * unseen, hidden under the plate it overrides instead of consuming it (two plates closing at
   * 20 cm/yr each at level 7: 0.99 of the closing consumed at 0.2–0.7 cells a step, 0.97 at 1.1,
   * 0.77 at 1.8, 0.43 at 3.6). A step whose fastest plate would move more than STEP_CELLS cells
   * runs as substeps; the dial's planner needn't know.
   */
  substeps(dt) {
    let w = 0;
    for (const p of this.plates) if (p.alive) w = Math.max(w, Math.hypot(p.w[0], p.w[1], p.w[2]));
    return Math.max(1, Math.ceil(w * dt / (PARAMS.STEP_CELLS * Math.sqrt(4 * Math.PI / this.grid.n)) - 1e-9));
  }

  step(dt) {
    const k = this.substeps(dt);
    for (let s = 0; s < k; s++) this.stepOnce(dt / k);
  }

  async stepAsync(dt) {
    const k = this.substeps(dt);
    for (let s = 0; s < k; s++) await this.stepOnceAsync(dt / k);
  }

  stepOnce(dt) {
    const g = this.grid, n = g.n, pos = g.pos, nbrOff = g.nbrOff, nbr = g.nbr;
    const t1 = this.t + dt;
    this.rotate(dt);
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
        freshExtras(p, jt);
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
            P.h[jt] = Math.min(PARAMS.H_STACK, P.h[jt] + PARAMS.COLLIDE_FRAC * Q.h[j]);
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
            // Subduction: a slab hangs here and pulls its plate toward the trench,
            // down-dip, across the boundary (n̂, toward the top plate). Only where
            // the plates close across it (SLAB_CLOSING): where they mostly slide
            // past, the overlap is the grid's rounding of a transform. The slab's
            // length so far follows the trench: inherit the longest slab of this
            // plate beside the cell, so a migrating trench keeps it.
            const rn = Math.hypot(nx, ny, nz);
            if (closing > PARAMS.SLAB_CLOSING * r * rn) {
              let len = this.slabPlate[i] === k ? this.slab[i] : 0;
              for (let t = nbrOff[i], e = nbrOff[i + 1]; t < e; t++) {
                const jn = nbr[t];
                if (this.slabPlate[jn] === k && this.slab[jn] > len) len = this.slab[jn];
              }
              this.slab[i] = Math.min(PARAMS.SLAB_MAX, len + cellLen);
              this.slabPlate[i] = k;
              this.slabAge[i] = Math.max(0, this.t - Q.tf[j]);
              this.slabDir[3 * i] = nx / rn; this.slabDir[3 * i + 1] = ny / rn; this.slabDir[3 * i + 2] = nz / rn;
            }
            // The arc on the plate above.
            P.h[jt] = Math.min(PARAMS.H_STACK, P.h[jt] + PARAMS.ARC_DH * this.res);
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
    this.deform(t1, dt);
    if (this.flexc) this.sampleFlex();

    const ka = Math.exp(-dt / PARAMS.ARC_TAU), ks = Math.exp(-dt / PARAMS.SLAB_TAU), kc = Math.exp(-dt / PARAMS.COLLIDE_TAU);
    for (let i = 0; i < n; i++) { this.arc[i] *= ka; this.slab[i] *= ks; this.col[i] *= kc; }
    this.decayPairs(dt);

    this.kinematics(dt);
    this.t = t1;
    this.updateElevation();
    this.exchangeWater(dt);
    this.balance(dt);
    this.mergeWelded();
    this.maybeRift();
    this.maybeInitiate();
    this.resolveFragments();
  }

  /**
   * Boundary relaxation: a cell held by one plate but surrounded mostly by
   * another passes its crust to the plate around it. Nearest-cell rounding
   * otherwise roughens boundaries a cell at a time until they are fractal;
   * this is a curvature flow at the scale of one cell (a numerical
   * regularization, not geology), and it moves crust without making or
   * destroying any.
   */
  /**
   * The same step with its per-cell work on the GPU (src/gpu/plates.js): the pass
   * over the cells, relaxation, sampling, the memories' decay, elevation, the sea
   * level, the kinematics and the balance's sums. What stays here is per plate or
   * rare: ω from the sums, collision tallies, the water's drift, merges, rifts and
   * initiation (the memories are read down first where those need them), and a
   * plate's stray pieces passed on (resolveFragments).
   */
  async stepOnceAsync(dt) {
    const t1 = this.t + dt;
    this.rotate(dt);
    const r = await this.gpu.step(dt, t1);
    if (this.flexc) this.sampleFlex(true);
    this.deform(t1, dt, true);
    const c = this.counters, k = r.counts, np = this.plates.length;
    c.made += k.made; c.consumed += k.consumed; c.collided += k.collided;
    c.relaxed = (c.relaxed || 0) + k.relaxed; c.foundered = (c.foundered || 0) + k.foundered;
    for (let a = 0; a < np; a++) for (let b = a + 1; b < np; b++) {
      const v = r.pairs[a * MAX_PLATES + b];
      if (v) { const key = a * MAX_PLATES + b; this.pairs.set(key, (this.pairs.get(key) || 0) + v); }
    }
    this.decayPairs(dt);
    const cell = 4 * Math.PI / this.grid.n;
    c.opened += r.open * dt / cell; c.closed += r.close * dt / cell;
    this.t = t1;
    // The GPU's level fills every basin below it; the ocean's is the CPU's (solveSea).
    if (this.water > 0) this.solveSea();
    this.exchangeWater(dt);
    const T = r.T;
    for (let a = 0; a < np; a++) {
      const p = this.plates[a];
      p.area = r.area[a]; p.land = r.plateLand[a];
      T[3 * a] += p.torqueExt[0]; T[3 * a + 1] += p.torqueExt[1]; T[3 * a + 2] += p.torqueExt[2];
    }
    this.solveBalance(r.M, T, dt);
    // The rare events, on the CPU and in the CPU's order: the memories come down first for those
    // that rewrite them (a merge relocates slabs and fronts; an initiation hangs a slab).
    const merge = this.mergeDue();
    if (merge) { await this.gpu.pullMemory(); this.mergeWelded(); }
    this.maybeRift();
    const site = this.initiationSite();
    if (site) { if (!merge) await this.gpu.pullMemory(); this.initiate(site); }
    this.resolveFragments();
  }

  /**
   * The crust's deformation past the step's rigid plates (synthesis), in rules that move crust and
   * make none (felsic share mixing by volume):
   *   rifted margins  where a gap opens beside its plate's continental crust thicker than H_BREAK,
   *                   STRETCH of that crust stretches into it instead of new ocean: the margin thins
   *                   and widens, and its shelf and slope stand between continent and ocean
   *                   (continents gain area as they rift, as stacking takes it from them)
   *   the wedge       from each cell stacked this step (its suture time the step's), crust thicker
   *                   than its plate's neighbour by more than TAPER a km of the distance between them
   *                   passes to it until the step stands at TAPER, and on from each cell that took
   *                   some: the upper plate thickens behind the front (Tibet's shortening reached
   *                   ~1,000 km inland; from memory), so the orogen widens as it grows rather than
   *                   standing as a wall a cell wide between two drowned margins
   *   the plateau     crust thicker than H_PLATEAU passes its excess to its plate's neighbours by
   *                   their room below it, sweep by sweep (or, with none, evenly, for them to pass
   *                   on): the plateau widens instead of rising (Tibet's crust ~70 km; from memory)
   * A cell with no cell of its plate beside it keeps its excess. With `patch`, the changed cells'
   * elevation is restood (the GPU's step drew it before). Returns the cells changed.
   */
  deform(t1, dt, patch = false) {
    const g = this.grid, n = g.n, area = g.area, nbrOff = g.nbrOff, nbr = g.nbr, owner = this.owner, ref = this.ref, plates = this.plates, h = this.h, H = PARAMS.H_PLATEAU;
    // The frame cells changed, for the GPU's mirror (its step syncs the top cells at the next step's start; this keeps it exact between).
    const mark = this.gpu ? (k, j) => this.dirty.cells.add(k * n + j) : () => {};
    let touched = false;
    // Rifted margins: this step's new crust (its formation time the step's; f32 on the GPU's path).
    const tol = 1e-6 * Math.max(1, Math.abs(t1)) + 1e-9;
    for (let i = 0; i < n; i++) {
      if (!(this.tf[i] >= t1 - dt - tol) || this.phi[i] >= CONTINENTAL) continue;
      const k = owner[i], j = ref[i], p = plates[k];
      if (p.phi[j] >= CONTINENTAL) continue;
      let jd = -1;
      for (let t = nbrOff[i], e = nbrOff[i + 1]; t < e; t++) {
        const q = nbr[t], jq = ref[q];
        if (owner[q] === k && jq !== j && p.phi[jq] >= CONTINENTAL && p.h[jq] > PARAMS.H_BREAK && (jd < 0 || p.h[jq] > p.h[jd])) jd = jq;
      }
      if (jd < 0 || !this.opening(i, k)) continue;
      const v = PARAMS.STRETCH * p.h[jd] * area[jd];
      p.h[jd] -= v / area[jd];
      p.h[j] = v / area[j]; p.phi[j] = p.phi[jd];
      mark(k, j); mark(k, jd);
      touched = true;
    }
    // The wedge: a queue from this step's fronts (sut is f32 on the GPU's path, so within its rounding).
    const S = PARAMS.TAPER * EARTH_RADIUS_KM, queue = [];
    for (let i = 0; i < n; i++) if (this.sut[i] >= t1 - tol) queue.push(i);
    for (let qi = 0; qi < queue.length && qi < 8 * n; qi++) {
      const i = queue[qi], k = owner[i], j = ref[i], p = plates[k];
      for (let t = nbrOff[i], e = nbrOff[i + 1]; t < e; t++) {
        const q = nbr[t], jq = ref[q];
        if (owner[q] !== k || jq === j) continue;
        const over = p.h[j] - p.h[jq] - S * g.dist[t];
        if (!(over > 1e-3)) continue;
        const v = over * area[j] * area[jq] / (area[j] + area[jq]);
        const hv = p.h[jq] * area[jq];
        p.phi[jq] = Math.min(1, (p.phi[jq] * hv + p.phi[j] * v) / (hv + v));
        p.h[j] -= v / area[j]; p.h[jq] += v / area[jq];
        mark(k, j); mark(k, jq);
        touched = true;
        queue.push(q);
      }
    }
    // The plateau.
    let list = [];
    for (let i = 0; i < n; i++) if (plates[owner[i]].h[ref[i]] > H) list.push(i);
    const dv = new Map(), dm = new Map(), rec = [];
    for (let sweep = 0; sweep < 48 && list.length; sweep++) {
      dv.clear(); dm.clear();
      const src = new Set();
      for (const i of list) {
        const k = owner[i], j = ref[i], p = plates[k], key = k * n + j;
        if (src.has(key) || !(p.h[j] > H)) continue;
        src.add(key);
        rec.length = 0;
        let room = 0, ar = 0;
        for (let t = nbrOff[i], e = nbrOff[i + 1]; t < e; t++) {
          const q = nbr[t], jq = ref[q];
          if (owner[q] !== k || jq === j || rec.includes(q)) continue;
          rec.push(q); room += Math.max(0, H - p.h[jq]) * area[jq]; ar += area[jq];
        }
        if (!rec.length) continue;
        const ex = (p.h[j] - H) * area[j], fill = Math.min(1, ex / Math.max(room, 1e-30)), over = Math.max(0, ex - room) / ar;
        dv.set(key, (dv.get(key) || 0) - ex);
        for (const q of rec) {
          const jq = ref[q], kq = k * n + jq, v = fill * Math.max(0, H - p.h[jq]) * area[jq] + over * area[jq];
          dv.set(kq, (dv.get(kq) || 0) + v);
          dm.set(kq, (dm.get(kq) || 0) + v * p.phi[j]);
        }
      }
      if (!dv.size) break;
      touched = true;
      const next = [];
      for (const [key, v] of dv) {
        const k = Math.floor(key / n), j = key - k * n, p = plates[k];
        if (v > 0) { const hv = p.h[j] * area[j]; p.phi[j] = Math.min(1, (p.phi[j] * hv + dm.get(key)) / (hv + v)); }
        p.h[j] += v / area[j];
        mark(k, j);
      }
      // The world cells over the plateau now (the receivers that filled), by their frame cells' state.
      for (const i of list) for (let t = nbrOff[i] - 1, e = nbrOff[i + 1]; t < e; t++) {
        const q = t < nbrOff[i] ? i : nbr[t];
        if (plates[owner[q]].h[ref[q]] > H) next.push(q);
      }
      list = [...new Set(next)];
    }
    if (!touched) return 0;
    // Every world cell reads its frame cell back (world cells sharing one all see it).
    const elev = this.elev, load = this.load, swell = this.swell, fc = this.flexc, t = this.t;
    let changed = 0;
    for (let i = 0; i < n; i++) {
      const p = plates[owner[i]], j = ref[i];
      if (p.h[j] === h[i] && p.phi[j] === this.phi[i]) continue;
      h[i] = p.h[j]; this.phi[i] = p.phi[j]; changed++;
      if (patch) {
        const f = this.phi[i], sa = f < 1 ? subsidence(t - this.tf[i]) : 0, rho = RHO_OCEANIC + (RHO_CONTINENTAL - RHO_OCEANIC) * f;
        this.subs[i] = f < CONTINENTAL ? sa : 0;
        elev[i] = h[i] * (1 - rho / RHO_MANTLE) - (1 - f) * sa + (load ? load[i] : 0) + (swell ? swell[i] : 0) + (fc ? fc[i] : 0);
      }
    }
    return changed;
  }

  /**
   * Whether the plates part across world cell i (held by plate k) from its neighbours of other plates:
   * their relative motion opens along the boundary's normal by more than CLOSING of its speed (the
   * consumption's test turned round), so a gap the grid's rounding leaves along a transform isn't a rift.
   */
  opening(i, k) {
    const g = this.grid, pos = g.pos, x = pos[3 * i], y = pos[3 * i + 1], z = pos[3 * i + 2], w = this.plates[k].w;
    let nx = 0, ny = 0, nz = 0, b = -1;
    for (let t = g.nbrOff[i], e = g.nbrOff[i + 1]; t < e; t++) {
      const o = this.owner[g.nbr[t]];
      if (o === k) continue;
      if (b < 0) b = o;
      if (o === b) { nx += g.tan[3 * t]; ny += g.tan[3 * t + 1]; nz += g.tan[3 * t + 2]; }
    }
    if (b < 0) return false;
    const wb = this.plates[b].w, dx = wb[0] - w[0], dy = wb[1] - w[1], dz = wb[2] - w[2];
    let vx = dy * z - dz * y, vy = dz * x - dx * z, vz = dx * y - dy * x;
    const r = Math.hypot(vx, vy, vz), rn = Math.hypot(nx, ny, nz);
    return rn > 0 && vx * nx + vy * ny + vz * nz > PARAMS.CLOSING * r * rn;
  }

  decayPairs(dt) {
    const km = Math.exp(-dt / PARAMS.MERGE_TAU);
    for (const [key, v] of this.pairs) { const nv = v * km; if (nv < 0.5) this.pairs.delete(key); else this.pairs.set(key, nv); }
  }

  /** Whether mergeWelded would merge anything (a microplate, or a welded pair). */
  mergeDue() {
    const alive = this.alivePlates();
    if (alive.length > PARAMS.MIN_PLATES && alive.some(p => p.area < PARAMS.MICROPLATE)) return true;
    for (const v of this.pairs.values()) if (v >= PARAMS.MERGE_EVENTS / (this.res * this.res)) return true;
    return false;
  }

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
      copyCell(P, jf, Q, jt);
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
  exchangeWater(dt, land = null) {
    if (!(this.landTarget > 0) || !(PARAMS.WATER_TAU > 0)) return;
    if (land == null) land = 1 - this.oceanArea / (4 * Math.PI);
    this.water += (1 - land) * 4 * Math.PI * 3 * (land - this.landTarget) * dt / PARAMS.WATER_TAU;
  }

  /**
   * The flexure's correction (km) sampled from the frames' cf (m) where the crust now is; with
   * `patch`, the elevation moves by the change (the GPU's step drew it with the step's start's).
   */
  sampleFlex(patch = false) {
    const n = this.grid.n, fc = this.flexc, plates = this.plates, owner = this.owner, ref = this.ref, elev = this.elev;
    for (let i = 0; i < n; i++) {
      const v = plates[owner[i]].cf[ref[i]] / 1000;
      if (patch) elev[i] += v - fc[i];
      fc[i] = v;
    }
  }

  updateElevation() {
    const n = this.grid.n, load = this.load, swell = this.swell, fc = this.flexc, t = this.t, tf = this.tf, phi = this.phi, h = this.h, subs = this.subs, elev = this.elev;
    for (let i = 0; i < n; i++) {
      // elevation() (crust.js), the age's subsidence once.
      const f = phi[i], sa = f < 1 ? subsidence(t - tf[i]) : 0, rho = RHO_OCEANIC + (RHO_CONTINENTAL - RHO_OCEANIC) * f;
      subs[i] = f < CONTINENTAL ? sa : 0;
      elev[i] = h[i] * (1 - rho / RHO_MANTLE) - (1 - f) * sa + (load ? load[i] : 0) + (swell ? swell[i] : 0) + (fc ? fc[i] : 0);
    }
    if (this.water > 0) this.solveSea();
  }

  /**
   * The sea level and the ocean (crust.js, seaMask) for the sea's water (synthesis). The level
   * holds the water over the ocean alone: a basin below it the sea doesn't reach holds none.
   * A basin the sea leaves (its sill now clear by STRAIT) keeps its water, handed to the lakes
   * (`cutWater`, until the planet's lakes take it: src/engine/planet.js) and counted off the sea
   * (`lakeWater`) meanwhile, so the level doesn't move; without lakes (the spin-up) it goes
   * back to the sea. A basin the level rises over takes the sea's water, its lakes' water
   * joining the sea, and the level is solved again without it (the sea pours in and stands
   * lower), until no more join. A cut waits for the next solve, so one solve never both
   * reaches and leaves a basin.
   */
  solveSea() {
    const g = this.grid, n = g.n, elev = this.elev, area = g.area, nbrOff = g.nbrOff, nbr = g.nbr;
    const sea = this.sea, strait = this.strait, s0 = this.seaLevel, held = !!this.lakeDepth;
    const scr = this.maskScratch && this.maskScratch.n === n ? this.maskScratch : (this.maskScratch = { n });
    const prev = scr.prev || (scr.prev = new Uint8Array(n)), excl = scr.excl || (scr.excl = new Uint8Array(n));
    prev.set(sea);
    const chan = seaChannel(this, scr.chan || (scr.chan = new Float64Array(n)));
    seaMask(g, elev, s0, sea, strait, scr, this.phi, chan);
    let events = 0;
    const join = i => {
      const w = ((held ? this.lakeDepth[i] : 0) + this.cutWater[i]) * area[i];
      this.cutHeld = Math.max(0, this.cutHeld - this.cutWater[i] * area[i]);
      this.cutWater[i] = 0;
      this.lakeWater = Math.max(0, this.lakeWater - w);
      return w > 0;
    };
    for (let i = 0; i < n; i++) {
      const below = elev[i] < s0;
      excl[i] = below && !sea[i] ? 1 : 0;
      if (prev[i] && excl[i]) {
        events++;
        if (held) { const d = s0 - elev[i]; this.cutWater[i] += d; this.cutHeld += d * area[i]; this.lakeWater += d * area[i]; }
      } else if (!prev[i] && sea[i]) {
        // The ground moved, not the sea: a sill sank, and the sea reaches what lay beyond it.
        if (join(i) || elev[i] < s0 - SEA.STRAIT) events++;
      }
    }
    let s = s0;
    const stack = scr.stack;
    for (let round = 0; round < 12; round++) {
      s = solveSeaLevel(g, elev, this.seaWater(), s, excl);
      if (!(s > s0)) break;
      // The sea's new reach: from its edge into what the level now covers, and through straits.
      const vis = scr.vis || (scr.vis = new Uint8Array(n));
      vis.fill(0);
      let sp = 0, more = 0;
      for (let i = 0; i < n; i++) {
        if (sea[i] || !(elev[i] < s)) continue;
        for (let t = nbrOff[i], e = nbrOff[i + 1]; t < e; t++) if (sea[nbr[t]]) { vis[i] = 1; stack[sp++] = i; break; }
      }
      while (sp) {
        const i = stack[--sp];
        strait[i] = 1;
        if (elev[i] < s) sea[i] = 1;
        if (excl[i]) { excl[i] = 0; more++; join(i); }
        for (let t = nbrOff[i], e = nbrOff[i + 1]; t < e; t++) {
          const j = nbr[t];
          if (sea[j] || vis[j]) continue;
          if (chan[j] < s || (strait[j] && chan[j] < s + SEA.STRAIT)) { vis[j] = 1; stack[sp++] = j; }
        }
      }
      events += more;
      // What the level now covers that the sea doesn't reach is a basin too: solve again without it.
      let fresh = 0;
      for (let i = 0; i < n; i++) if (!sea[i] && !excl[i] && elev[i] < s) { excl[i] = 1; fresh++; }
      if (!more && !fresh) break;
    }
    let ocean = 0;
    for (let i = 0; i < n; i++) { if (sea[i] && !(elev[i] < s)) sea[i] = 0; if (sea[i]) ocean += area[i]; }
    this.oceanArea = ocean;
    this.seaLevel = s;
    this.datum = this.boiled > 0 ? solveSeaLevel(g, elev, this.seaWater(0), this.datum || s, excl) : s;
    if (events) this.basins++;
  }
  /**
   * The straits' scour over dt Myr (SEA.SCOUR…; speculation): a cell of the ocean whose ring of
   * neighbours holds two or more separate runs of the ocean's water is a strait, the sea flowing
   * through it; its channel (`gs`) cuts down at SCOUR e^{−d/SCOUR_D}, d its depth below the sea
   * (the full rate at or above it), so it holds open against uplift slower than SCOUR and closes
   * under faster. Every channel fills back toward its cell's mean over FILL. Exact in each frame
   * cell (once, however many world cells show it).
   */
  scour(dt) {
    const g = this.grid, n = g.n, nbrOff = g.nbrOff, nbr = g.nbr, plates = this.plates, owner = this.owner, ref = this.ref;
    const strait = this.strait, s = this.seaLevel, top = s + SEA.STRAIT;
    const scr = this.maskScratch && this.maskScratch.n === n ? this.maskScratch : (this.maskScratch = { n });
    const chan = seaChannel(this, scr.chan || (scr.chan = new Float64Array(n)));
    // Each frame cell once: a stamp per plate's cell, this call's number (1–255), a plate's stamps
    // cleared the first time it's met in each run of 255 calls.
    const calls = this.scourCalls = (this.scourCalls || 0) + 1, stamp = calls % 255 + 1, epoch = Math.floor(calls / 255);
    const keep = Math.exp(-dt / SEA.FILL), R = SEA.SCOUR * dt, D = SEA.SCOUR_D, cap = SEA.CHANNEL_MAX;
    for (let i = 0; i < n; i++) {
      const p = plates[owner[i]], j = ref[i];
      if (!p) continue;
      let seen = p.scoured;
      if (!seen || seen.length !== p.gs.length) { seen = p.scoured = new Uint8Array(p.gs.length); p.scourEpoch = epoch; }
      else if (p.scourEpoch !== epoch) { seen.fill(0); p.scourEpoch = epoch; }
      if (seen[j] === stamp) continue;
      seen[j] = stamp;
      let gs = p.gs[j] * keep;
      if (strait[i] && chan[i] < top) {
        // Runs of water round the ring (neighbours counter-clockwise): two or more, and the sea passes through.
        let runs = 0, first = -1, last = 0;
        for (let t = nbrOff[i], e = nbrOff[i + 1]; t < e; t++) {
          const k = nbr[t], w = strait[k] && chan[k] < top ? 1 : 0;
          if (first < 0) first = w; else if (w && !last) runs++;
          last = w;
        }
        if (first && !last) runs++;
        if (runs === 0 && first) runs = 1;
        if (runs >= 2) gs += R * Math.exp(-Math.max(0, s - chan[i]) / D);
      }
      p.gs[j] = Math.min(cap, gs);
    }
  }

  /** The sea's water (km·sr): less what the ice holds (at most nine tenths) and the lakes, less what has boiled away. */
  seaWater(boiled = this.boiled) { return Math.max(1e-3 * this.water, Math.max(0.1 * this.water, this.water - this.iceWater - this.lakeWater) * (1 - boiled)); }
  /**
   * The air's datum for heights (km): the sea level, or where the sea would stand had none of it
   * boiled away. The air doesn't drain with the sea, so the climate's lapse rate and the ice's
   * mass balance measure from here; the coast is where the sea stands.
   */
  airDatum() { return this.boiled > 0 ? Math.max(this.seaLevel, this.datum) : this.seaLevel; }

  /** Ridge push, slab pull and the slab's resistance per unit, scaled with the cell (see balance); src/gpu/plates.js reads them here too. */
  forceScales() { return { kRidge: PARAMS.K_RIDGE * this.res ** 0.2, kSlab: PARAMS.K_SLAB, kTrench: PARAMS.K_TRENCH }; }

  /**
   * ω from slab pull and ridge push against basal drag and the slabs' resistance, per plate.
   *
   * Each slab pulls its plate across the trench with K_SLAB (s/SLAB_MAX) √(age/100) per cell of
   * trench and resists the plate's motion that way with K_TRENCH (s/SLAB_MAX) (standard in kind: a
   * slab sinks against the mantle's viscous resistance, which grows with its length as its weight
   * does; Forsyth and Uyeda 1975's slab resistance). So a plate its slabs drive moves at about their
   * sinking speed, K_SLAB/K_TRENCH × the age's factor, whatever its size, and one that basal drag
   * holds (a big plate with a short trench, a continent's keel) moves slower: plates' speeds follow
   * the share of their edge that subducts, as Forsyth and Uyeda found, rather than its ratio to
   * their area. Without it a small plate with a trench ran to V_MAX.
   *
   * The forces are discretized on the cells and PARAMS are tuned at level 6. Ridge push sums a
   * one-sided gradient at the plate's edge, which ends at the edge cell's own depth, nearer the axis
   * on a finer grid (read on one state at both levels, level 7's ~12% stronger), so it scales as
   * res^0.2 (fitted). Slab pull and its resistance need no scaling since slabs hang only where the
   * plates close across the boundary and pull across it (SLAB_CLOSING): each trench cell pulls
   * cellLen, so a trench pulls by its length at any level (measured: Earth's opening balances at rms
   * 3.38 cm/yr at level 7 against 3.35 at level 6 and runs at 3.28 over 20 Myr at both; seeded
   * planets at level 7 within ~4% of level 6). Before, slabs grew at every closing overlap and
   * pulled along the relative motion, the band beside a trench and its staircase changed with the
   * cell, and slab pull went as √res.
   */
  balance(dt) {
    const { M, T } = this.torques(true);
    this.solveBalance(M, T, dt);
  }

  /**
   * The balance's ω per plate without relaxing toward it or changing anything (no foundering, no
   * decay of rifts' torques): a map from plate index to ω. `cap: false` leaves V_MAX off, so the
   * balance is linear in the torques (tools/earth/plates-score.mjs splits it by force).
   */
  balanceTarget({ cap = true } = {}) {
    const { M, T } = this.torques(false), out = new Map();
    this.solveBalance(M, T, 0, (k, w) => {
      const wm = Math.hypot(w[0], w[1], w[2]);
      const s = cap && wm > PARAMS.V_MAX ? PARAMS.V_MAX / wm : 1;
      out.set(k, Float64Array.of(w[0] * s, w[1] * s, w[2] * s));
    });
    return out;
  }

  /** The balance's drag matrices M (upper triangle, 9 per plate) and torques T; `founder` lets old seafloor at an edge founder. */
  torques(founder) {
    const g = this.grid, n = g.n, pos = g.pos, area = g.area;
    const cellLen = Math.sqrt(4 * Math.PI / n);
    const { kRidge, kSlab, kTrench } = this.forceScales();
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
      const f = kRidge * A;
      const fx = f * gx, fy = f * gy, fz = f * gz;
      T[3 * k] += y * fz - z * fy; T[3 * k + 1] += z * fx - x * fz; T[3 * k + 2] += x * fy - y * fx;
    }
    // Slab pull, along the trench line only: each cell of a plate's edge pulls
    // with the longest slab of that plate hanging within a cell of it, and the
    // slab resists motion along its pull (M += c q qᵀ with q = x × d̂). (The
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
        if (!founder || phi[i] >= CONTINENTAL || age < PARAMS.FOUNDER_AGE) continue;
        let dx = 0, dy = 0, dz = 0;
        for (let t = nbrOff[i], e = nbrOff[i + 1]; t < e; t++) if (owner[nbr[t]] !== k) { dx += g.tan[3 * t]; dy += g.tan[3 * t + 1]; dz += g.tan[3 * t + 2]; }
        const r = Math.hypot(dx, dy, dz);
        if (!(r > 0)) continue;
        this.slab[i] = s = 0.3 * PARAMS.SLAB_MAX; this.slabPlate[i] = k; this.slabAge[i] = age; si = i;
        this.slabDir[3 * i] = dx / r; this.slabDir[3 * i + 1] = dy / r; this.slabDir[3 * i + 2] = dz / r;
        this.counters.foundered = (this.counters.foundered || 0) + 1;
      }
      const f = kSlab * (s / PARAMS.SLAB_MAX) * Math.sqrt(Math.max(0, Math.min(this.slabAge[si], 150)) / 100) * cellLen;
      const dx = this.slabDir[3 * si], dy = this.slabDir[3 * si + 1], dz = this.slabDir[3 * si + 2];
      const fx = f * dx, fy = f * dy, fz = f * dz;
      const x = pos[3 * i], y = pos[3 * i + 1], z = pos[3 * i + 2];
      T[3 * k] += y * fz - z * fy; T[3 * k + 1] += z * fx - x * fz; T[3 * k + 2] += x * fy - y * fx;
      const c = kTrench * (s / PARAMS.SLAB_MAX) * cellLen;
      const qx = y * dz - z * dy, qy = z * dx - x * dz, qz = x * dy - y * dx, o = 9 * k;
      M[o] += c * qx * qx; M[o + 1] += c * qx * qy; M[o + 2] += c * qx * qz;
      M[o + 4] += c * qy * qy; M[o + 5] += c * qy * qz; M[o + 8] += c * qz * qz;
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
    return { M, T };
  }

  /**
   * ω per plate from its drag matrix M (upper triangle, 9 per plate) and torque T, relaxed over V_RELAX;
   * with `target`, each plate's solved ω (before V_MAX) goes to it instead and nothing changes.
   */
  solveBalance(M, T, dt, target = null) {
    const np = this.plates.length;
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
      if (target) { target(k, w); continue; }
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
      if (!A.mask[ja] || B.phi[j] > A.phi[ja]) copyCell(B, j, A, ja);
    }
    const wa = A.area, wb = B.area;
    for (let c = 0; c < 3; c++) { A.w[c] = (A.w[c] * wa + B.w[c] * wb) / (wa + wb); A.torqueExt[c] += B.torqueExt[c]; }
    B.alive = false;
    this.relocate(b, a);
    this.dirty.plates.add(a); this.dirty.plates.add(b); this.dirty.owner = this.dirty.mem = true;
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
   * A plate is one body. The step can leave a plate in pieces: an initiation takes the ocean
   * between two of a plate's continents, a trench consumes a neck, a rift's plane crosses a
   * plate twice, and the grid's rounding leaves a few cells of a plate inside its neighbour.
   * Left alone, a piece cut off from its plate moves with the plate's rotation, set by forces
   * elsewhere, and ploughs through the plate around it: new crust fills the gap behind it,
   * young and so buoyant enough to consume the old seafloor ahead, and the piece grows into a
   * tongue of ridge and trench at 5–15 cm/yr against the plate it sits in; the seafloor it
   * consumes hangs slabs on that plate, whose pull, all round the ring, drives the plates
   * faster (at the opening a fifth to a half of the trench cells that pulled were on such
   * rings, and pieces covered 4–18% of the surface). So each plate keeps its largest piece;
   * every other piece becomes a plate of its own if it is a plate's size (MICROPLATE) and
   * there is room (MAX_LIVE_PLATES), else passes to the plate whose body it shares the most
   * boundary with, re-expressed in that plate's frame, as relaxation and merges move crust.
   * Crust moves; none is made or destroyed. The memories (slabs, fronts) stay where they are
   * and decay, as relaxation leaves them.
   *
   * Checked every FRAGMENTS Myr of plate time (the labeling is ~1.6 ms at level 7), after the
   * step's rare events, on the GPU's path as on the CPU's: the CPU's frames are the GPU's, and
   * what it rewrote goes back up before the next step (src/gpu/plates.js: a new plate's frame
   * whole, a joined piece's frame cells one by one).
   */
  resolveFragments() {
    if (this.t - (this.fragmentsAt ?? -Infinity) < PARAMS.FRAGMENTS - 1e-6) return;
    this.fragmentsAt = this.t;
    const g = this.grid, n = g.n, nbrOff = g.nbrOff, nbr = g.nbr, pos = g.pos, owner = this.owner, ref = this.ref;
    let s = scratch.get(g);
    if (!s) scratch.set(g, s = { comp: new Int32Array(n), stack: new Int32Array(n), order: new Int32Array(n), cA: new Float64Array(n), cK: new Int16Array(n) });
    const { comp, order, cA, cK } = s;
    for (let pass = 0, again = true; again && pass < 4; pass++) {
      again = false;
      const nc = components(g, owner, s);
      const body = new Int32Array(MAX_PLATES).fill(-1);
      let plates = 0;
      for (let c = 0; c < nc; c++) { const k = cK[c]; if (body[k] < 0) plates++; if (body[k] < 0 || cA[c] > cA[body[k]]) body[k] = c; }
      if (nc === plates) return;
      // The pieces' cells, grouped (a counting sort on the component), the largest pieces first.
      const start = new Int32Array(nc + 1);
      for (let i = 0; i < n; i++) start[comp[i] + 1]++;
      for (let c = 0; c < nc; c++) start[c + 1] += start[c];
      const at = start.slice(0, nc);
      for (let i = 0; i < n; i++) order[at[comp[i]]++] = i;
      const pieces = [];
      for (let c = 0; c < nc; c++) if (body[cK[c]] !== c) pieces.push(c);
      pieces.sort((a, b) => cA[b] - cA[a]);
      for (const c of pieces) {
        const k = cK[c], P = this.plates[k], cells = order.subarray(start[c], start[c + 1]);
        let Q = null;
        if (cA[c] >= PARAMS.MICROPLATE && this.alivePlates().length < PARAMS.MAX_LIVE_PLATES) Q = this.allocPlate();
        if (Q) {
          // A plate of its own, in its parent's frame and with its motion, as a rift's half starts.
          Q.q.set(P.q); Q.R.set(P.R); Q.w.set(P.w);
          for (const i of cells) { copyCell(P, ref[i], Q, ref[i]); P.mask[ref[i]] = 0; owner[i] = Q.index; }
          this.dirty.plates.add(k); this.dirty.plates.add(Q.index);
          this.counters.split = (this.counters.split || 0) + 1;
        } else {
          // To the plate around it: the one whose body it shares the most edges with (any piece's
          // only where it touches no body, and then the labels are checked again). The frame cells
          // it touches go to the GPU one by one.
          const edges = new Map(), loose = new Map();
          let guess = -1;
          for (const i of cells) for (let t = nbrOff[i], e = nbrOff[i + 1]; t < e; t++) {
            const j = nbr[t], o = owner[j];
            if (o === k) continue;
            const m = comp[j] === body[o] ? edges : loose;
            m.set(o, (m.get(o) || 0) + 1);
          }
          if (!edges.size) again = true;
          let to = -1, most = 0;
          for (const [o, m] of edges.size ? edges : loose) if (m > most) { most = m; to = o; }
          if (to < 0) continue;
          Q = this.plates[to];
          const R = Q.R;
          for (const i of cells) for (let t = nbrOff[i], e = nbrOff[i + 1]; t < e && guess < 0; t++) if (owner[nbr[t]] === to) guess = ref[nbr[t]];
          const touched = this.gpu ? this.dirty.cells : null;
          for (const i of cells) {
            const x = pos[3 * i], y = pos[3 * i + 1], z = pos[3 * i + 2];
            const jt = nearest(g, R[0] * x + R[3] * y + R[6] * z, R[1] * x + R[4] * y + R[7] * z, R[2] * x + R[5] * y + R[8] * z, guess);
            copyCell(P, ref[i], Q, jt);
            P.mask[ref[i]] = 0;
            if (touched) { touched.add(k * n + ref[i]); touched.add(to * n + jt); }
            owner[i] = to; ref[i] = jt; guess = jt;
          }
          this.counters.joined = (this.counters.joined || 0) + 1;
        }
        this.dirty.owner = true;
      }
    }
  }

  /**
   * Subduction begins at an old passive margin: where a plate's own seafloor
   * has aged past FOUNDER_AGE against its own continent, the ocean breaks
   * away as a plate of its own and starts to sink under the continent.
   */
  maybeInitiate() {
    const site = this.initiationSite();
    if (site) this.initiate(site);
  }

  /** The plate whose old margin qualifies, with the margin's cells; null if none does (or it isn't time). */
  initiationSite() {
    const g = this.grid, n = g.n, nbrOff = g.nbrOff, nbr = g.nbr, owner = this.owner, phi = this.phi;
    if (this.t - (this.lastInitiation ?? -1e9) < PARAMS.INITIATE_GAP) return null;
    if (this.alivePlates().length >= PARAMS.MAX_LIVE_PLATES) return null;
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
    return bestK < 0 ? null : { bestK, best };
  }

  /** The step's initiation in place, if a site qualifies. */
  initiate(site) {
    const g = this.grid, n = g.n, nbrOff = g.nbrOff, nbr = g.nbr, owner = this.owner, phi = this.phi;
    const { bestK, best } = site;
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
      copyCell(A, j, B, j);
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
    this.dirty.plates.add(bestK); this.dirty.plates.add(B.index); this.dirty.owner = this.dirty.mem = true;
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
        copyCell(A, j, B, j);
        A.mask[j] = 0;
      }
    }
    for (let i = 0; i < n; i++) if (this.owner[i] === k && B.mask[this.ref[i]]) this.owner[i] = B.index;
    this.dirty.plates.add(k); this.dirty.plates.add(B.index); this.dirty.owner = true;
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
      if (!this.sea[i]) land += g.area[i];
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
