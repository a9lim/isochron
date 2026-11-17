// The surface as drawn, prepared from the engine's state (on the engine's
// worker, src/engine/worker.js): relief eased toward its neighbours, the coast
// (where the ocean ends: the relief, but a basin below sea level that the sea
// doesn't reach counts as just above it, and so do a lake and its rim), normals
// for the hillshade, and magnetic stripes eased along each plate's own seafloor;
// and, apart (`lakeFields`, posted when the lakes change), lakes from their water
// as a smoothed signed field, and salt flats. Each of these draws the grid's
// cells as continuous fields rather than as hexagons.
import { gradient } from '../grid/icosphere.js';

const RELIEF = 20;            // vertical exaggeration of the hillshade
const R_KM = 6371;
export const LIFT = 0.005;    // km: a basin below sea level that the sea doesn't reach, or a lake's rim, as the coast sees it
export const HELD = 0.25;     // a cell is a lake's when its wet share, now or lately, reaches this (`lakeHeld`)

/**
 * The cells that hold a lake, now or lately (1): their wet share or its memory over the last
 * ~3 kyr (src/engine/lakes.js, `mem`) at least HELD, so a lake's seasons are all in it.
 */
export function lakeHeld(lakes) {
  const n = lakes.wet.length, held = new Uint8Array(n), wet = lakes.wet, mem = lakes.mem;
  for (let i = 0; i < n; i++) held[i] = Math.max(wet[i], mem ? mem[i] : 0) >= HELD ? 1 : 0;
  return held;
}

/**
 * The coast as drawn (km, signed: negative on the ocean, zero at the coast): the eased relief
 * `elevRel`, except at and beside a basin below sea level that the sea doesn't reach
 * (src/engine/plates.js, solveSea), where the relief is eased again with the basin's floor at
 * LIFT above the sea, so the basin draws as land however low it lies; and land at or beside a
 * lake (`held`, from `lakeHeld`) stands at least LIFT above it. The eased relief draws a low
 * cell beside deep sea as sea, which is how most coasts are drawn (~40% of coastal land cells);
 * a lake's rim drawn so let the lake touch a sea it doesn't reach.
 */
export function coastField(grid, tec, elevRel, held = null) {
  const n = grid.n, nbrOff = grid.nbrOff, nbr = grid.nbr, sea = tec.sea, s = tec.seaLevel, elev = tec.elev;
  const coast = Float32Array.from(elevRel);
  if (!sea) return coast;
  const dry = i => !sea[i] && elev[i] < s, raw = i => dry(i) ? LIFT : elev[i] - s;
  for (let i = 0; i < n; i++) {
    const o = nbrOff[i], e = nbrOff[i + 1];
    let near = dry(i), lake = !!(held && held[i]);
    for (let t = o; t < e; t++) { const j = nbr[t]; near = near || dry(j); lake = lake || !!(held && held[j]); }
    if (near) {
      let v = 0;
      for (let t = o; t < e; t++) v += raw(nbr[t]);
      coast[i] = Math.max(0.5 * raw(i) + 0.5 * v / (e - o), sea[i] ? -Infinity : LIFT);
    }
    if (lake && !sea[i]) coast[i] = Math.max(coast[i], LIFT);
  }
  return coast;
}

export function surfaceFields(grid, tec, land, ice, lakes = null) {
  const n = grid.n, Pp = grid.pos, nbrOff = grid.nbrOff, nbr = grid.nbr;
  const elevRel = new Float32Array(n), normals = new Float32Array(3 * n), tfDraw = new Float32Array(n);
  const tmp = new Float32Array(n), grad = new Float64Array(3 * n);
  // Drawn relief is the model's, eased once toward its neighbours' mean: a
  // margin then reads as a slope across a cell rather than a stair of hexagons.
  for (let i = 0; i < n; i++) {
    let s = 0;
    const o = nbrOff[i], e = nbrOff[i + 1];
    for (let t = o; t < e; t++) s += tec.elev[nbr[t]];
    elevRel[i] = 0.5 * tec.elev[i] + 0.5 * s / (e - o) - tec.seaLevel;
  }
  // The deep sea is eased further, so isobaths read as curves, not facets; the
  // coast and the shelf keep the single easing.
  for (let pass = 0; pass < 2; pass++) {
    tmp.set(elevRel);
    for (let i = 0; i < n; i++) {
      if (tmp[i] > -0.4) continue;
      let s = 0, deep = true;
      const o = nbrOff[i], e = nbrOff[i + 1];
      for (let t = o; t < e; t++) { const v = tmp[nbr[t]]; if (v > -0.4) { deep = false; break; } s += v; }
      if (deep) elevRel[i] = 0.4 * tmp[i] + 0.6 * s / (e - o);
    }
  }
  const coast = coastField(grid, tec, elevRel, lakes ? lakeHeld(lakes) : null);
  gradient(grid, elevRel, grad);
  for (let i = 0; i < n; i++) {
    // Land relief at full exaggeration; the sea floor at a third (depth is shown by tint).
    const k = (coast[i] < 0 ? RELIEF / 3 : RELIEF) / R_KM;
    const x = Pp[3 * i] - k * grad[3 * i], y = Pp[3 * i + 1] - k * grad[3 * i + 1], z = Pp[3 * i + 2] - k * grad[3 * i + 2];
    const r = Math.hypot(x, y, z);
    normals[3 * i] = x / r; normals[3 * i + 1] = y / r; normals[3 * i + 2] = z / r;
  }
  // Formation times are laid down a step and a cell at a time; eased twice
  // across each plate's own seafloor, the stripes follow the ridge rather than
  // the hexagons. Ridges (where two plates meet) stay sharp.
  tfDraw.set(tec.tf);
  for (let pass = 0; pass < 2; pass++) {
    tmp.set(tfDraw);
    for (let i = 0; i < n; i++) {
      if (tec.phi[i] >= 0.5) continue;
      let s = 0, c = 0;
      for (let t = nbrOff[i], e = nbrOff[i + 1]; t < e; t++) {
        const j = nbr[t];
        if (tec.owner[j] !== tec.owner[i] || tec.phi[j] >= 0.5) continue;
        s += tmp[j]; c++;
      }
      if (c) tfDraw[i] = 0.5 * tmp[i] + 0.5 * s / c;
    }
  }
  return { elevRel, coast, normals, tfDraw, felsic: Float32Array.from(tec.phi) };
}

/**
 * Lakes from their water (src/engine/lakes.js): a smoothed field signed so its zero is the shore,
 * where a cell is half under water (LAKE_WET where it is, LAKE_DRY where it's dry, between for a
 * cell partly wet), each water cell kept at least a tenth of LAKE_WET after the smoothing (`PIN`),
 * so a lake of two or three cells still draws, small, where the smoothing took it; the lakes' tint,
 * √(depth / 6 km) on their water, eased once over the water; and salt flats, the share of each cell
 * a dried lake left, eased once. The depth is apart because, in the shore's field, a
 * kilometre-deep lake's value carried a cell or more past its shore (the opening's lakes drew at
 * 1.7 times their wet area, over 77 dry cells, 15 of them across a rim into the sea), and bounded
 * there, the smoothing left no tint. (A floor of half LAKE_WET held most shores to the cells' edges,
 * a zigzag.) A lake's rim beside the sea is dry: no lake cell lies beside the ocean (the sea would
 * reach it), and the coast keeps the rim as land (`coastField`). Lakes under an ice sheet aren't
 * drawn (the ice is). A lake of one cell would draw as a hexagon (interpolation round one vertex
 * can't make a curve), so lakes are drawn from two cells up.
 */
export const LAKE_DRY = -0.05, LAKE_WET = 0.05;
const PIN = 0.1;
export function lakeFields(grid, tec, lakes, iceH = null) {
  const n = grid.n, nbrOff = grid.nbrOff, nbr = grid.nbr, sea = tec.sea;
  const land = i => !sea[i];
  const draw = new Float32Array(n), salt = new Float32Array(n), tint = new Float32Array(n), tmp = new Float32Array(n);
  const side = new Int8Array(n);       // +1 drawn as water, −1 dry, 0 partly wet
  const DRY = LAKE_DRY;
  for (let i = 0; i < n; i++) {
    const w = land(i) && !(iceH && iceH[i] > 20) ? lakes.wet[i] : 0;
    draw[i] = w >= 0.5 ? LAKE_WET : w > 0 ? DRY * (1 - 2 * w) : DRY;
    side[i] = w >= 0.5 ? 1 : w > 0 ? 0 : -1;
    salt[i] = lakes.salt[i];
  }
  for (let i = 0; i < n; i++) {
    if (side[i] !== 1) continue;
    let mate = false;
    for (let t = nbrOff[i], e = nbrOff[i + 1]; t < e; t++) if (side[nbr[t]] === 1) { mate = true; break; }
    if (!mate) { draw[i] = DRY; side[i] = -1; }
  }
  for (let i = 0; i < n; i++) if (side[i] === 1) tint[i] = Math.sqrt(Math.min(1, lakes.depth[i] / 6));
  for (const [f, passes] of [[draw, 2], [salt, 1], [tint, 1]]) for (let pass = 0; pass < passes; pass++) {
    tmp.set(f);
    for (let i = 0; i < n; i++) {
      if (!land(i) || (f === tint && side[i] !== 1)) continue;
      let v = 0, m = 0;
      const o = nbrOff[i], e = nbrOff[i + 1];
      if (f === tint) { for (let t = o; t < e; t++) if (side[nbr[t]] === 1) { v += tmp[nbr[t]]; m++; } if (m) f[i] = 0.4 * tmp[i] + 0.6 * v / m; continue; }
      for (let t = o; t < e; t++) v += land(nbr[t]) ? tmp[nbr[t]] : f === draw ? DRY : 0;
      f[i] = 0.4 * tmp[i] + 0.6 * v / (e - o);
    }
  }
  for (let i = 0; i < n; i++) {
    if (side[i] === 1) draw[i] = Math.max(draw[i], PIN * LAKE_WET);
    if (!land(i)) continue;
    for (let t = nbrOff[i], e = nbrOff[i + 1]; t < e; t++) if (!land(nbr[t])) { draw[i] = Math.min(draw[i], DRY); break; }
  }
  return { draw, salt, tint };
}
