// Today's Earth (`?seed=earth`): the planet opened on data rather than from noise. tools/earth/bake.py
// puts the data on the level-7 grid (earth/earth.json, earth/earth-7.bin): ETOPO 2022's bedrock and its
// grounded ice, Seton et al. 2020's seafloor ages, Müller et al. 2019's plates and their motions, ten
// hotspots. Everything after the opening is the sim's own: the plates relax to their torque balance
// within a few Myr (PARAMS.V_RELAX), and the climate, the ice and the rest find their own balance on
// Earth's map.
//
// The opening fits the sim's crust to Earth (synthesis). The datum puts a new ridge (H_OCEANIC of
// crust at age 0) at RIDGE below sea level; the sim's subsidence then gives Earth's own seafloor ages
// GDH1's depths (within ~0.1 km: 3.65 km at 10 Myr, 5.13 at 64, 5.51 at 150), and each cell's
// thickness is solved so the sim's isostasy (crust.js, elevation) stands it where ETOPO does: 24 km
// of continental crust at sea level, 30 at 0.8 km, 60 under Tibet. Trenches, which the sim doesn't
// bend down, would need negative crust: they're held at H_MIN and stand shallower. Under the ice,
// the bed is held at its measured depth with the ice's load in place (the crust stands where the bed
// would rebound to). The ocean holds the water that puts the sea at the datum, with the ice's.
import { stream } from '../rng.js';
import { makeNoise } from '../noise.js';
import { buildGrid } from '../grid/icosphere.js';
import { makeTransfer, restrict } from '../grid/transfer.js';
import { H_OCEANIC, RHO_MANTLE, RHO_OCEANIC, RHO_CONTINENTAL, elevation, subsidence, seaMask } from './crust.js';
import { PARAMS } from './plates.js';
import { framesFromWorld, hangSlabs } from './genesis.js';

export const EARTH_SEED = 'earth';
export const isEarth = seed => seed === EARTH_SEED;

/** Tunable; tools and tests may change them. */
export const EARTH = {
  RIDGE: 2.5,          // km below sea level a new ridge stands: the datum (GDH1's ridge is ~2.6 km, from memory)
  DEEP0: 2.5,          // km: floor the age grid doesn't date is oceanic from here down (continental crust
  DEEP1: 3.0,          //   would be thinner than H_MIN by 3 km: forearcs, the Canada Basin, the eastern
                       //   Mediterranean, the Japan Sea), its age by its depth
  AGE_DEEP: 100,       // Myr at most for floor aged by its depth (short of PARAMS.FOUNDER_AGE: forearcs don't founder)
  H_MIN: 2,            // km of crust at least
  H_MAX: 75,           // km at most
};

const TYPES = { i2: Int16Array, u2: Uint16Array, u1: Uint8Array };

/** The baked data from its JSON and binary (an ArrayBuffer): typed fields, plates, hotspots. */
export function parseEarth(meta, buf) {
  const d = { level: meta.level, n: meta.n, plates: meta.plates, hotspots: meta.hotspots || [] };
  for (const f of meta.fields) {
    const T = TYPES[f.type];
    d[f.name] = new T(buf.slice(f.offset, f.offset + meta.n * T.BYTES_PER_ELEMENT));
  }
  return d;
}

/** Fetch (in a page or worker) or read (in node) the baked data. */
export async function loadEarth() {
  const json = new URL('../../earth/earth.json', import.meta.url);
  if (json.protocol === 'file:') {
    const { readFileSync } = await import('node:fs');
    const meta = JSON.parse(readFileSync(json, 'utf8'));
    const b = readFileSync(new URL(`../../earth/earth-${meta.level}.bin`, import.meta.url));
    return parseEarth(meta, b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
  }
  const meta = await (await fetch(json)).json();
  const buf = await (await fetch(new URL(`../../earth/earth-${meta.level}.bin`, import.meta.url))).arrayBuffer();
  return parseEarth(meta, buf);
}

/** The inverse of crust.js's subsidence (Myr at `drop` km below the ridge), held to [0, cap]. */
function ageOfDrop(drop, cap) {
  if (!(drop > 0)) return 0;
  const young = 0.365 * Math.sqrt(20);
  const t = drop < young ? (drop / 0.365) ** 2 : (drop < 3.051 ? -Math.log((3.051 - drop) / 2.473) / 0.0278 : Infinity);
  return Math.min(cap, t);
}

/**
 * The data on grid g (its level or a coarser one: area-weighted restriction, the age weighted by the
 * oceanic share; plates sampled at the nested cells), in the sim's units: bed (km), ice (m), the oceanic
 * share and its age (Myr), each cell's plate.
 */
function fieldsOn(d, g) {
  if (g.level > d.level) throw new Error(`earth: the data is level ${d.level}; the grid is ${g.level}`);
  const nf = d.n, bed = new Float64Array(nf), ice = new Float64Array(nf), oc = new Float64Array(nf), oa = new Float64Array(nf);
  for (let i = 0; i < nf; i++) {
    bed[i] = d.bed[i] / 1000; ice[i] = d.ice[i]; oc[i] = d.ocean[i] / 255; oa[i] = oc[i] * d.age[i] / 100;
  }
  const n = g.n, out = { bed, ice, ocean: oc, age: new Float64Array(nf), plate: d.plate.slice(0, n) };
  if (g.level < d.level) {
    const T = makeTransfer(buildGrid(d.level), g), r = a => restrict(T, a, new Float64Array(n));
    out.bed = r(bed); out.ice = r(ice); out.ocean = r(oc);
    const ra = r(oa);
    out.age = new Float64Array(n);
    for (let i = 0; i < n; i++) out.age[i] = out.ocean[i] > 1e-6 ? ra[i] / out.ocean[i] : 0;
  } else for (let i = 0; i < n; i++) out.age[i] = oc[i] > 1e-6 ? oa[i] / oc[i] : 0;
  return out;
}

/** Each cell's target elevation on the sim's datum (km): ETOPO's bed, with the sea at `datum`. */
const datum = () => elevation(H_OCEANIC, 0, 0) + EARTH.RIDGE;

/** Crust thickness (km) that stands at elevation E with felsic share phi and age (the sim's isostasy, inverted). */
function thickness(E, phi, age, extra = 0) {
  const rho = RHO_OCEANIC + (RHO_CONTINENTAL - RHO_OCEANIC) * phi;
  const h = (E - extra + (1 - phi) * subsidence(age)) / (1 - rho / RHO_MANTLE);
  return Math.min(EARTH.H_MAX, Math.max(EARTH.H_MIN, h));
}

/**
 * The plates (Müller et al. 2019's, today), each with its motion over the last Myr: a plate index a
 * cell. Microplates (below PARAMS.MICROPLATE) join a neighbour, as the sim's own rule has them do, but
 * the one they share the most boundary with that isn't across a subduction zone from them: an arc or a
 * forearc sliver (Mariana, Izu, Tonga, Kamchatka) rides its overriding plate, so the trench stays a
 * plate boundary. Joined to its largest neighbour, the Pacific, each took the Pacific's trench inside
 * the Pacific and left it pulling at the back-arc. A neighbour is across a subduction zone where a
 * quarter of the shared boundary closes faster than ~1.3 cm/yr with ocean on either side; with none
 * other, the largest.
 */
function platesOf(d, g, plate, ocean) {
  const n = g.n, K = d.plates.length, area = new Float64Array(K), label = Int32Array.from({ length: K }, (_, k) => k);
  for (let i = 0; i < n; i++) area[plate[i]] += g.area[i];
  const find = k => { while (label[k] !== k) k = label[k] = label[label[k]]; return k; };
  const v = (m, i, o) => { const w = d.plates[m].w, p = g.pos; o[0] = w[1] * p[3 * i + 2] - w[2] * p[3 * i + 1]; o[1] = w[2] * p[3 * i] - w[0] * p[3 * i + 2]; o[2] = w[0] * p[3 * i + 1] - w[1] * p[3 * i]; return o; };
  const va = new Float64Array(3), vb = new Float64Array(3);
  for (;;) {
    // The smallest plate joins a neighbour while it's a microplate. (More plates than MAX_LIVE_PLATES
    // may remain: it caps the plates the sim makes, not the ones it's given.)
    let small = -1, live = 0;
    for (let k = 0; k < K; k++) if (find(k) === k && area[k] > 0) { live++; if (small < 0 || area[k] < area[small]) small = k; }
    if (small < 0 || live <= PARAMS.MIN_PLATES || area[small] >= PARAMS.MICROPLATE) break;
    const len = new Map(), sub = new Map();
    for (let i = 0; i < n; i++) {
      if (find(plate[i]) !== small) continue;
      for (let t = g.nbrOff[i]; t < g.nbrOff[i + 1]; t++) {
        const j = g.nbr[t], b = find(plate[j]);
        if (b === small) continue;
        len.set(b, (len.get(b) || 0) + g.ell[t]);
        v(plate[i], i, va); v(plate[j], j, vb);
        const vn = (vb[0] - va[0]) * g.tan[3 * t] + (vb[1] - va[1]) * g.tan[3 * t + 1] + (vb[2] - va[2]) * g.tan[3 * t + 2];
        if (vn < -0.002 && (ocean[i] > 0.5 || ocean[j] > 0.5)) sub.set(b, (sub.get(b) || 0) + g.ell[t]);
      }
    }
    let best = -1;
    for (const [b, l] of len) if ((sub.get(b) || 0) < 0.25 * l && (best < 0 || l > len.get(best))) best = b;
    if (best < 0) for (const b of len.keys()) if (best < 0 || area[b] > area[best]) best = b;
    if (best < 0) break;
    label[small] = best; area[best] += area[small]; area[small] = 0;
  }
  const keep = [], index = new Int32Array(K).fill(-1);
  for (let k = 0; k < K; k++) if (find(k) === k && area[k] > 0) { index[k] = keep.length; keep.push(k); }
  const owner = new Int32Array(n);
  for (let i = 0; i < n; i++) owner[i] = index[find(plate[i])];
  return { owner, plates: keep.map(k => d.plates[k]) };
}

/**
 * Earth's opening on tec (an empty Tectonics): the crust, the plates and their motions, slabs on the
 * trenches those motions close, the sea at the datum. Returns the fields for `earthIce`.
 */
export function earthGenesis(tec, seed, d) {
  const g = tec.grid, n = g.n, pos = g.pos;
  tec.rng = stream(seed, 'tectonics');
  const noise = tec.noise = makeNoise(seed);
  const f = fieldsOn(d, g), s0 = datum();
  const { owner, plates } = platesOf(d, g, f.plate, f.ocean);
  for (const pl of plates) {
    const p = tec.allocPlate();
    p.w[0] = pl.w[0]; p.w[1] = pl.w[1]; p.w[2] = pl.w[2];
    p.name = pl.name;
  }
  const { h, phi, tf } = tec;
  const target = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    tec.owner[i] = owner[i];
    // The oceanic share: dated floor, and undated floor too deep for the continental crust here.
    const depth = -f.bed[i], dated = f.ocean[i];
    const u = Math.min(1, Math.max(0, (depth - EARTH.DEEP0) / (EARTH.DEEP1 - EARTH.DEEP0)));
    const deep = (1 - dated) * u * u * (3 - 2 * u);
    const s = dated + deep;
    const age = s > 0 ? (dated * f.age[i] + deep * ageOfDrop(depth - EARTH.RIDGE, EARTH.AGE_DEEP)) / s : 0;
    phi[i] = 1 - s;
    const x = pos[3 * i], y = pos[3 * i + 1], z = pos[3 * i + 2];
    // Continents' crust is old: its formation time as genesis gives it (it sets the heat flow under ice).
    tf[i] = phi[i] >= 0.5 ? -(900 + 600 * (1 + noise.fbm(x, y, z, 2, 3))) : -age;
    target[i] = s0 + f.bed[i];
    h[i] = thickness(target[i], phi[i], -tf[i]);
  }
  framesFromWorld(tec);
  // Earth's slabs mostly reach the transition zone (~660 km, from memory), so they hang at SLAB_MAX, where the pull saturates.
  hangSlabs(tec, PARAMS.SLAB_MAX);
  tec.seaLevel = s0;
  tec.updateElevation();
  fillSea(tec, s0);
  tec.landTarget = 1 - tec.oceanArea / (4 * Math.PI);
  tec.balance(1e-6);
  // The carbon cycle's reference activity: crust opened and closed a Myr by these motions.
  const o0 = tec.counters.opened, c0 = tec.counters.closed;
  tec.kinematics(1);
  tec.spinRate = { made: tec.counters.opened - o0, consumed: tec.counters.closed - c0 };
  tec.counters.opened = o0; tec.counters.closed = c0;
  tec.t0 = tec.t;
  f.target = target;
  return f;
}

/** The water that holds the sea at s0 over the ocean (with the ice's and the lakes' off it), and the sea solved. */
function fillSea(tec, s0) {
  const g = tec.grid, n = g.n, elev = tec.elev, sea = new Uint8Array(n), strait = new Uint8Array(n);
  seaMask(g, elev, s0, sea, strait, null, tec.phi);
  let v = 0;
  for (let i = 0; i < n; i++) if (sea[i]) v += (s0 - elev[i]) * g.area[i];
  tec.water = v + tec.iceWater + tec.lakeWater;
  tec.seaLevel = s0;
  tec.updateElevation();
}

/**
 * Earth's ice on the planet P (after the ice and its flexure exist): ETOPO's grounded ice, the bed bent
 * to its equilibrium under it, and the crust refitted so the bed (with the load and the hotspots'
 * swells) stands where ETOPO measures it; then the water again, now with the ice's.
 */
export function earthIce(P, f) {
  const tec = P.tec, ice = P.ice, n = P.grid.n, H = ice.H, w = ice.w;
  for (let i = 0; i < n; i++) H[i] = f.ice[i];
  if (ice.flex) { const wf = ice.flexTarget(); for (let i = 0; i < n; i++) w[i] = -wf[i]; }
  else for (let i = 0; i < n; i++) w[i] = -917 / 3300 * H[i];
  ice.publish();
  tec.updateElevation();
  const { h, phi, tf, elev, owner, ref, plates } = tec;
  for (let i = 0; i < n; i++) {
    const other = elev[i] - elevation(h[i], phi[i], tec.t - tf[i]);   // the load, the swell, the flexure's correction
    h[i] = thickness(f.target[i], phi[i], tec.t - tf[i], other);
    plates[owner[i]].h[ref[i]] = h[i];
  }
  tec.updateElevation();
  fillSea(tec, datum());
  tec.landTarget = 1 - tec.oceanArea / (4 * Math.PI);
}
