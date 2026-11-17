// The surface as drawn, prepared from the engine's state (on the engine's
// worker, src/engine/worker.js): relief eased toward its neighbours, the coast
// (where the ocean ends: the relief, but a basin below sea level that the sea
// doesn't reach counts as just above it), normals for the hillshade, and
// magnetic stripes eased along each plate's own seafloor; and, apart (`lakeFields`, posted when the lakes change), lakes from
// their water as a smoothed signed depth, and salt flats. Each of these draws
// the grid's cells as continuous fields rather than as hexagons.
import { gradient } from '../grid/icosphere.js';

const RELIEF = 20;            // vertical exaggeration of the hillshade
const R_KM = 6371;
export const LIFT = 0.005;    // km: a basin below sea level that the sea doesn't reach, as the coast sees it

/**
 * The coast as drawn (km, signed: negative on the ocean, zero at the coast): the eased relief
 * `elevRel`, except at and beside a basin below sea level that the sea doesn't reach
 * (src/engine/plates.js, solveSea), where the relief is eased again with the basin's floor at
 * LIFT above the sea, so the basin draws as land however low it lies.
 */
export function coastField(grid, tec, elevRel) {
  const n = grid.n, nbrOff = grid.nbrOff, nbr = grid.nbr, sea = tec.sea, s = tec.seaLevel, elev = tec.elev;
  const coast = Float32Array.from(elevRel);
  if (!sea) return coast;
  const dry = i => !sea[i] && elev[i] < s, raw = i => dry(i) ? LIFT : elev[i] - s;
  for (let i = 0; i < n; i++) {
    const o = nbrOff[i], e = nbrOff[i + 1];
    let near = dry(i);
    for (let t = o; t < e && !near; t++) near = dry(nbr[t]);
    if (!near) continue;
    let v = 0;
    for (let t = o; t < e; t++) v += raw(nbr[t]);
    coast[i] = Math.max(0.5 * raw(i) + 0.5 * v / (e - o), sea[i] ? -Infinity : LIFT);
  }
  return coast;
}

export function surfaceFields(grid, tec, land, ice) {
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
  const coast = coastField(grid, tec, elevRel);
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
 * Lakes from their water (src/engine/lakes.js), as a smoothed field signed so its zero is
 * the shore, where a cell is half under water: past it 50 m plus the water's depth (km),
 * short of it down to −50 m on dry land, so a shallow lake's shore stands as well as a deep
 * one's against the smoothing; and salt flats, the share of each cell a dried lake left,
 * eased once. Lakes under an ice sheet aren't drawn (the ice is). A lake of one cell would
 * draw as a hexagon (interpolation round one vertex can't make a curve), so lakes are drawn
 * from two cells up.
 */
export function lakeFields(grid, tec, lakes, iceH = null) {
  const n = grid.n, nbrOff = grid.nbrOff, nbr = grid.nbr, sea = tec.sea;
  const land = i => !sea[i];
  const draw = new Float32Array(n), salt = new Float32Array(n), tmp = new Float32Array(n);
  const DRY = -0.05;
  for (let i = 0; i < n; i++) {
    const w = lakes.wet[i];
    draw[i] = w > 0 && !(iceH && iceH[i] > 20) ? (w >= 0.5 ? -DRY + lakes.depth[i] : DRY * (1 - 2 * w)) : land(i) ? DRY : 0;
    salt[i] = lakes.salt[i];
  }
  for (let i = 0; i < n; i++) {
    if (!(draw[i] > 0)) continue;
    let mate = false;
    for (let t = nbrOff[i], e = nbrOff[i + 1]; t < e; t++) if (draw[nbr[t]] > 0) { mate = true; break; }
    if (!mate) draw[i] = DRY;
  }
  for (const [f, passes] of [[draw, 2], [salt, 1]]) for (let pass = 0; pass < passes; pass++) {
    tmp.set(f);
    for (let i = 0; i < n; i++) {
      if (!land(i)) continue;
      let v = 0;
      const o = nbrOff[i], e = nbrOff[i + 1];
      for (let t = o; t < e; t++) v += land(nbr[t]) ? tmp[nbr[t]] : f === draw ? DRY : 0;
      f[i] = 0.4 * tmp[i] + 0.6 * v / (e - o);
    }
  }
  return { draw, salt };
}
