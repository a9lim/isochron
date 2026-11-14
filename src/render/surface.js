// The surface as drawn, prepared from the engine's state (on the engine's
// worker, src/engine/worker.js): relief eased toward its neighbours, normals
// for the hillshade, magnetic stripes eased along each plate's own seafloor,
// and lakes as a smoothed signed depth. Each of these draws the grid's cells
// as continuous fields rather than as hexagons.
import { gradient } from '../grid/icosphere.js';

const RELIEF = 20;            // vertical exaggeration of the hillshade
const R_KM = 6371;

export function surfaceFields(grid, tec, land, ice) {
  const n = grid.n, Pp = grid.pos, nbrOff = grid.nbrOff, nbr = grid.nbr;
  const elevRel = new Float32Array(n), normals = new Float32Array(3 * n), tfDraw = new Float32Array(n), lakeDraw = new Float32Array(n);
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
  gradient(grid, elevRel, grad);
  for (let i = 0; i < n; i++) {
    // Land relief at full exaggeration; the sea floor at a third (depth is shown by tint).
    const k = (elevRel[i] < 0 ? RELIEF / 3 : RELIEF) / R_KM;
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
  // Lakes hold water only where their inflow outpaces evaporation off them (~1 m/yr),
  // and are drawn from a smoothed depth (signed: dry land below zero), so their
  // shores are curves like the coast's rather than the grid's hexagons.
  for (let i = 0; i < n; i++) {
    const L = land.lake[i], aM2 = grid.area[i] * 6.371e6 * 6.371e6;
    lakeDraw[i] = L > 0 && !(ice.H[i] > 20) ? L * Math.min(1, land.discharge[i] * 3.156e7 / aM2) : 0;
    if (!(lakeDraw[i] > 0.03)) lakeDraw[i] = elevRel[i] > 0 ? -0.05 : 0;
  }
  // A lake of one cell would draw as a hexagon (interpolation round one vertex can't
  // make a curve), so lakes are drawn from two cells up.
  for (let i = 0; i < n; i++) {
    if (!(lakeDraw[i] > 0)) continue;
    let mate = false;
    for (let t = nbrOff[i], e = nbrOff[i + 1]; t < e; t++) if (lakeDraw[nbr[t]] > 0) { mate = true; break; }
    if (!mate) lakeDraw[i] = -0.05;
  }
  for (let pass = 0; pass < 2; pass++) {
    tmp.set(lakeDraw);
    for (let i = 0; i < n; i++) {
      if (elevRel[i] <= 0) continue;
      let s = 0;
      const o = nbrOff[i], e = nbrOff[i + 1];
      for (let t = o; t < e; t++) s += elevRel[nbr[t]] > 0 ? tmp[nbr[t]] : -0.05;
      lakeDraw[i] = 0.4 * tmp[i] + 0.6 * s / (e - o);
    }
  }
  return { elevRel, normals, tfDraw, lakeDraw, felsic: Float32Array.from(tec.phi) };
}
