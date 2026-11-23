// The globe's triangles in patches (src/render/globe.js), so a frame shades only the patches that face
// the viewer and lie on screen: the vertex stage runs for every vertex an index reaches, before the
// rasterizer culls a back face, and at level 7 its ~160 thousand vertices carry sixteen varyings each.
// A patch is the triangles whose first corner is nearest one cell of a coarse grid (LEVEL), its cap the
// axis through its corners' mean and the widest angle α of a corner from it. Patches run in latitude
// bands of BAND, each band's by longitude, alternating, so a hemisphere's patches come as a few runs
// (one draw each).
import { buildGrid, nearest } from '../grid/icosphere.js';

const LEVEL = 3, BAND = 8 * Math.PI / 180;

/** The mesh's triangles reordered by patch ({ tris, first, n } per patch, in triangles), and each patch's cap (axis, α). */
export function patchesOf(mesh, level = LEVEL) {
  const g = buildGrid(level), tris = mesh.tris, pos = mesh.pos, nt = tris.length / 3, np = g.n;
  const of = new Int32Array(nt), n = new Int32Array(np);
  let guess = -1;
  for (let t = 0; t < nt; t++) { const i = 3 * tris[3 * t]; of[t] = guess = nearest(g, pos[i], pos[i + 1], pos[i + 2], guess); n[guess]++; }
  // Each patch's axis (its corners' mean), then their order.
  const ax = new Float64Array(3 * np);
  for (let t = 0; t < 3 * nt; t++) { const p = of[Math.floor(t / 3)], i = 3 * tris[t]; ax[3 * p] += pos[i]; ax[3 * p + 1] += pos[i + 1]; ax[3 * p + 2] += pos[i + 2]; }
  const key = new Float64Array(np);
  for (let p = 0; p < np; p++) {
    const r = Math.hypot(ax[3 * p], ax[3 * p + 1], ax[3 * p + 2]) || 1;
    ax[3 * p] /= r; ax[3 * p + 1] /= r; ax[3 * p + 2] /= r;
    const band = Math.floor((Math.asin(Math.max(-1, Math.min(1, ax[3 * p + 2]))) + Math.PI / 2) / BAND), lon = Math.atan2(ax[3 * p + 1], ax[3 * p]) / Math.PI;
    key[p] = band * 4 + 2 + (band % 2 ? -lon : lon);
  }
  const order = Array.from({ length: np }, (_, p) => p).sort((a, b) => key[a] - key[b]);
  const first = new Int32Array(np), at = new Int32Array(np);
  for (let k = 0, s = 0; k < np; k++) { const p = order[k]; first[p] = at[p] = s; s += n[p]; }
  const out = new Uint32Array(tris.length);
  for (let t = 0; t < nt; t++) { const o = 3 * at[of[t]]++; out[o] = tris[3 * t]; out[o + 1] = tris[3 * t + 1]; out[o + 2] = tris[3 * t + 2]; }
  // Each cap's widest angle: the least cosine of a corner from the axis.
  const lo = new Float64Array(np).fill(1);
  for (let t = 0; t < 3 * nt; t++) {
    const p = of[Math.floor(t / 3)], i = 3 * tris[t], c = ax[3 * p] * pos[i] + ax[3 * p + 1] * pos[i + 1] + ax[3 * p + 2] * pos[i + 2];
    if (c < lo[p]) lo[p] = c;
  }
  const alpha = Float64Array.from(lo, c => Math.acos(Math.max(-1, Math.min(1, c))));
  return { tris: out, order: Int32Array.from(order), first, n, ax, alpha, np, runs: { first: new Int32Array(np), count: new Int32Array(np), k: 0 } };
}

/**
 * The runs of patches to draw (into pt.runs, in indices): those whose cap reaches the near hemisphere
 * (its axis's view z above −sin α) and the screen (|x|, |y| within the half-widths hx, hy, in globe radii,
 * plus α: a projection moves no point farther than its angle). m is the view's rows (camera.m).
 */
export function visibleRuns(pt, m, hx, hy) {
  const { order, first, n, ax, alpha, runs } = pt, pad = 0.01;
  runs.k = 0;
  let open = false;
  for (let k = 0; k < order.length; k++) {
    const p = order[k], x = ax[3 * p], y = ax[3 * p + 1], z = ax[3 * p + 2], a = alpha[p] + pad;
    const vx = m[0] * x + m[1] * y + m[2] * z, vy = m[3] * x + m[4] * y + m[5] * z, vz = m[6] * x + m[7] * y + m[8] * z;
    const show = n[p] > 0 && vz > -Math.sin(Math.min(a, Math.PI / 2)) && Math.abs(vx) - a < hx && Math.abs(vy) - a < hy;
    if (!show) { open = false; continue; }
    if (open) runs.count[runs.k - 1] += 3 * n[p];
    else { runs.first[runs.k] = 3 * first[p]; runs.count[runs.k] = 3 * n[p]; runs.k++; open = true; }
  }
  return runs;
}
