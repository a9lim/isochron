// The 2D layer over the globe: the limb, and the plate boundaries as smooth
// lines (src/render/lines.js) in the symbols of a tectonic map, pinned to the
// line (src/render/along.js: a symbol keeps its place as the line moves, and
// spacing is even on screen at the usual zoom):
//   trench       a rule with sawteeth on the plate that stays on top, and,
//                where ocean is going down, red marks for the arc of volcanoes
//                standing on that side
//   collision    continent against continent (nothing sinks): open sawteeth,
//                as a thrust belt, and no arc
//   ridge        a red rule: the mantle reaching the surface (the globe also
//                tints crust younger than 1 Myr)
//   transform    a lighter rule with paired half-arrows giving the sense of slip
//   inactive     a dotted rule (the plates hardly move against each other)
// Under them, rivers in the sea's ink, their weight the discharge (at a slow
// dial, the month's: a river that has run dry is a dotted bed, as maps draw an
// intermittent stream). The Climate
// view keeps the rivers, lighter, and drops the tectonic symbols, as do the
// Weather and Tides views (the rivers lighter still). Hotspots are
// red points ringed, and a province in eruption a red stippled disc: the
// mantle at the surface. The Climate view's Air chart draws the winds as
// streamlines (src/render/streamlines.js). The People view draws the trade's
// routes (src/engine/routes.js, `lines`) in the rules' colour, their weight the
// food they carry, by land, river and sea alike.
import { INACTIVE, RIDGE, TRENCH, TRANSFORM } from './lines.js';
import { RIVER_MIN } from './rivers.js';
import { nearest } from '../grid/icosphere.js';
import { drawChart } from './chart.js';
import { freshU, inheritU, octaves, marks, dashes } from './along.js';
import { drawSky } from './sky.js';
import { drawStreamlines } from './streamlines.js';

// Symbols scale with the globe (the radius on screen against 380 px), within
// limits that keep them legible far out and unobtrusive close in.
const symbolScale = r => Math.max(0.75, Math.min(3.5, r / 380));

/**
 * A line's points turned by a plate's rotation over `tau` Myr (ω in rad/Myr):
 * between retraces, boundaries and rivers glide with their plates. Returns a
 * new array (Rodrigues' formula), or the original when there's nothing to turn.
 */
export function turned(P, w, tau) {
  const wm = Math.hypot(w[0], w[1], w[2]), a = wm * tau;
  if (!(Math.abs(a) > 1e-9)) return P;
  const kx = w[0] / wm, ky = w[1] / wm, kz = w[2] / wm, c = Math.cos(a), s = Math.sin(a), C = 1 - c;
  const out = new Float32Array(P.length);
  for (let k = 0; k < P.length; k += 3) {
    const x = P[k], y = P[k + 1], z = P[k + 2], d = kx * x + ky * y + kz * z;
    out[k] = x * c + (ky * z - kz * y) * s + kx * d * C;
    out[k + 1] = y * c + (kz * x - kx * z) * s + ky * d * C;
    out[k + 2] = z * c + (kx * y - ky * x) * s + kz * d * C;
  }
  return out;
}

/** The rotation matrix (row-major, 9) of a turn by ω over `tau` Myr, into `R`; false if there is none. */
function rotation(w, tau, R) {
  const wm = Math.hypot(w[0], w[1], w[2]), a = wm * tau;
  if (!(Math.abs(a) > 1e-9)) { R[0] = R[4] = R[8] = 1; R[1] = R[2] = R[3] = R[5] = R[6] = R[7] = 0; return false; }
  const x = w[0] / wm, y = w[1] / wm, z = w[2] / wm, c = Math.cos(a), s = Math.sin(a), C = 1 - c;
  R[0] = c + x * x * C;     R[1] = x * y * C - z * s; R[2] = x * z * C + y * s;
  R[3] = y * x * C + z * s; R[4] = c + y * y * C;     R[5] = y * z * C - x * s;
  R[6] = z * x * C - y * s; R[7] = z * y * C + x * s; R[8] = c + z * z * C;
  return true;
}

/**
 * Where a line or river is drawn now, into its own buffer (`l.shown`): its course turned by ω
 * over `tCur` Myr, morphed (at φ < 1) from its predecessor's course turned over `tPrev`, point by
 * corresponding point (`morphed`). The turn is kept (`l.R`) for what else is placed on the line.
 */
export function placeLine(l, w, tCur, tPrev, phi) {
  const cur = l.P, m = cur.length / 3, R = l.R || (l.R = new Float64Array(9));
  rotation(w, tCur, R);
  if (!l.shown || l.shown === l.P || l.shown.length !== cur.length) l.shown = new Float32Array(cur.length);
  const out = l.shown, prev = l.prev && l.corr && phi < 1 ? l.prev.P : null;
  const r0 = R[0], r1 = R[1], r2 = R[2], r3 = R[3], r4 = R[4], r5 = R[5], r6 = R[6], r7 = R[7], r8 = R[8];
  if (!prev) {
    for (let k = 0; k < 3 * m; k += 3) {
      const x = cur[k], y = cur[k + 1], z = cur[k + 2];
      out[k] = r0 * x + r1 * y + r2 * z; out[k + 1] = r3 * x + r4 * y + r5 * z; out[k + 2] = r6 * x + r7 * y + r8 * z;
    }
    return out;
  }
  const Q = placeLine.Q || (placeLine.Q = new Float64Array(9)), corr = l.corr;
  rotation(w, tPrev, Q);
  const q0 = Q[0], q1 = Q[1], q2 = Q[2], q3 = Q[3], q4 = Q[4], q5 = Q[5], q6 = Q[6], q7 = Q[7], q8 = Q[8];
  for (let k = 0; k < m; k++) {
    const j = corr[2 * k], t = corr[2 * k + 1], a = 3 * j, b = a + 3, o = 3 * k;
    const px = prev[a] + t * (prev[b] - prev[a]), py = prev[a + 1] + t * (prev[b + 1] - prev[a + 1]), pz = prev[a + 2] + t * (prev[b + 2] - prev[a + 2]);
    const qx = q0 * px + q1 * py + q2 * pz, qy = q3 * px + q4 * py + q5 * pz, qz = q6 * px + q7 * py + q8 * pz;
    const x0 = cur[o], y0 = cur[o + 1], z0 = cur[o + 2];
    const cx = r0 * x0 + r1 * y0 + r2 * z0, cy = r3 * x0 + r4 * y0 + r5 * z0, cz = r6 * x0 + r7 * y0 + r8 * z0;
    const x = qx + phi * (cx - qx), y = qy + phi * (cy - qy), z = qz + phi * (cz - qz), r = Math.hypot(x, y, z) || 1;
    out[o] = x / r; out[o + 1] = y / r; out[o + 2] = z / r;
  }
  return out;
}

/**
 * The cap a line (and its predecessor) lies in: its points' mean direction and their widest
 * angle from it (`l.cap`), so a line wholly behind the globe needn't be placed or drawn.
 */
export function capOf(l) {
  let sx = 0, sy = 0, sz = 0;
  const sets = l.prev && l.corr ? [l.P, l.prev.P] : [l.P];
  for (const P of sets) for (let k = 0; k < P.length; k += 3) { sx += P[k]; sy += P[k + 1]; sz += P[k + 2]; }
  const r = Math.hypot(sx, sy, sz);
  if (!(r > 1e-9)) { l.cap = null; return; }
  sx /= r; sy /= r; sz /= r;
  let lo = 1;
  for (const P of sets) for (let k = 0; k < P.length; k += 3) lo = Math.min(lo, sx * P[k] + sy * P[k + 1] + sz * P[k + 2]);
  l.cap = [sx, sy, sz, Math.acos(Math.max(-1, Math.min(1, lo)))];
}

/**
 * Whether any of a line's cap, turned by ω over `tau` Myr, faces the viewer (`m`: the camera's
 * matrix; view z beyond 0.02 shows), with a margin for the morph and the predecessor's own turn.
 */
export function capFaces(l, w, tau, m) {
  const c = l.cap;
  if (!c || c[3] > 1.4) return true;
  const wm = Math.hypot(w[0], w[1], w[2]), a = wm * tau;
  let x = c[0], y = c[1], z = c[2];
  if (Math.abs(a) > 1e-9) {
    const kx = w[0] / wm, ky = w[1] / wm, kz = w[2] / wm, co = Math.cos(a), si = Math.sin(a), d = (kx * x + ky * y + kz * z) * (1 - co);
    const nx = x * co + (ky * z - kz * y) * si + kx * d, ny = y * co + (kz * x - kx * z) * si + ky * d, nz = z * co + (kx * y - ky * x) * si + kz * d;
    x = nx; y = ny; z = nz;
  }
  const vz = m[6] * x + m[7] * y + m[8] * z;
  return Math.acos(Math.max(-1, Math.min(1, vz))) - c[3] < 1.551 + 0.06;   // acos(0.02) ≈ 1.551
}

const RIVER_BUCKETS = 6;

/**
 * The discharge drawn at point k: the year's mean, or at a slow dial (`month`: the
 * month's index and the share into the next) that month's. In its month a river is dry
 * under a tenth of its own mean (and 450 m³/s): a dotted bed. At the year's mean,
 * rivers under the drawing threshold (those that run only in their wet season) hide.
 */
const isDry = (river, k, w) => w < 0.1 * river.W[k] && w < 0.3 * RIVER_MIN;
function riverW(river, k, month) {
  if (!month || !river.M) return river.W[k];
  const M = river.M, a = month.i, b = (a + 1) % 12;
  const q = M[12 * k + a] * (1 - month.f) + M[12 * k + b] * month.f;
  // The year's anomaly this month (the worker's factor per cell of the river's chain, source to mouth).
  const A = river.anom;
  if (!A || !A.length) return q;
  const n = river.W.length, j = n > 1 ? Math.round(k / (n - 1) * (A.length - 1)) : 0, x = q * (1 + month.aw * (A[j] - 1));
  // A factor that isn't a number (seen on the page, intermittently, source not yet found) draws the month's
  // climatology: a NaN width had thrown, and the overlay's rivers, routes and capitals went undrawn that frame.
  return Number.isFinite(x) ? x : q;
}

const riverBucket = w => Math.min(RIVER_BUCKETS - 1, Math.floor(Math.log10(Math.max(1, w / RIVER_MIN)) * 2.2));

/**
 * The drawn lakes' field (km, signed: water above zero; src/render/surface.js, lakeFields) at
 * each point of each river (`river.wet`), interpolated linearly over the grid's triangles as the
 * globe's shader interpolates it, so a river is cut where the drawn shore crosses it: rivers are
 * traced on cells and the shore is a smoothed field, and the two needn't agree (a river ran on
 * past the shore, or a stretch of one lay within the lake). Recomputed when rivers or lakes change.
 */
export function lakeAlong(grid, rivers, draw) {
  const pos = grid.pos, off = grid.nbrOff, nbr = grid.nbr;
  const det = (ax, ay, az, bx, by, bz, cx, cy, cz) => ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx);
  for (const river of rivers) {
    const P = river.P, m = P.length / 3, wet = river.wet && river.wet.length === m ? river.wet : (river.wet = new Float32Array(m));
    let g = -1;
    for (let k = 0; k < m; k++) {
      const x = P[3 * k], y = P[3 * k + 1], z = P[3 * k + 2];
      const i = g = nearest(grid, x, y, z, g), ax = pos[3 * i], ay = pos[3 * i + 1], az = pos[3 * i + 2];
      let best = -Infinity, val = draw[i];
      for (let e = off[i], end = off[i + 1]; e < end; e++) {
        const j = nbr[e], l = nbr[e + 1 < end ? e + 1 : off[i]];
        const bx = pos[3 * j], by = pos[3 * j + 1], bz = pos[3 * j + 2], cx = pos[3 * l], cy = pos[3 * l + 1], cz = pos[3 * l + 2];
        const wa = det(x, y, z, bx, by, bz, cx, cy, cz), wb = det(ax, ay, az, x, y, z, cx, cy, cz), wc = det(ax, ay, az, bx, by, bz, x, y, z), s = wa + wb + wc;
        if (!(Math.abs(s) > 0)) continue;
        const lo = Math.min(wa, wb, wc) / s;
        if (lo > best) { best = lo; val = (wa * draw[i] + wb * draw[j] + wc * draw[l]) / s; }
        if (lo >= 0) break;
      }
      wet[k] = val;
    }
  }
}

/** The dry part of a segment whose ends lie at a and b in the lakes' field: [from, to] as fractions along it, or null. */
function dryPart(a, b) {
  if (!(a > 0) && !(b > 0)) return [0, 1];
  if (a > 0 && b > 0) return null;
  const t = a / (a - b);
  return a > 0 ? [t, 1] : [0, t];
}

function drawRivers(ctx, cx, cy, r, camera, rivers, color, alpha, month = null) {
  const lw = Math.sqrt(symbolScale(r));
  const paths = Array.from({ length: RIVER_BUCKETS }, () => new Path2D()), dry = new Path2D();
  const v = [0, 0, 0];
  const faded = [];
  for (const river of rivers) {
    if (river.hidden) continue;
    if (river.shownA) { faded.push(river); continue; }
    const { W } = river, P = river.shown || river.P;
    let px = 0, py = 0, pv = false;
    for (let k = 0; k < W.length; k++) {
      camera.view(P[3 * k], P[3 * k + 1], P[3 * k + 2], v);
      const x = cx + v[0] * r, y = cy - v[1] * r, vis = v[2] > 0.02;
      const cut = vis && pv ? (river.wet ? dryPart(river.wet[k - 1], river.wet[k]) : [0, 1]) : null;
      if (cut) {
        const w = riverW(river, k, month), x0 = px + cut[0] * (x - px), y0 = py + cut[0] * (y - py), x1 = px + cut[1] * (x - px), y1 = py + cut[1] * (y - py);
        if (month ? isDry(river, k, w) : w < RIVER_MIN * 0.999) { if (month) { dry.moveTo(x0, y0); dry.lineTo(x1, y1); } }
        else { const b = paths[riverBucket(w)]; b.moveTo(x0, y0); b.lineTo(x1, y1); }
      }
      px = x; py = y; pv = vis;
    }
  }
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = withAlpha(color, alpha);
  for (let b = 0; b < RIVER_BUCKETS; b++) {
    ctx.lineWidth = (0.6 + 0.42 * b) * lw;
    ctx.stroke(paths[b]);
  }
  const strokeDry = (path, a) => {
    ctx.strokeStyle = withAlpha(color, 0.55 * a); ctx.lineWidth = 0.9 * lw;
    ctx.setLineDash([0.5 * lw, 3 * lw]);
    ctx.stroke(path);
    ctx.setLineDash([]);
  };
  if (month) strokeDry(dry, alpha);
  // Where a retrace changed a river, its old course fades out and its new one in, point by
  // point (shownA): what stayed is drawn whole. A segment takes the larger of its ends' alphas
  // (so a stretch fading in meets the one that stayed without a gap), in runs of one weight and
  // alpha, each one path (so its joins don't darken).
  for (const river of faded) {
    const { W } = river, P = river.shown || river.P, A = river.shownA;
    let px = 0, py = 0, pv = false, path = null, pb = -2, pa = -1;
    const flush = () => {
      if (!path) return;
      if (pb < 0) strokeDry(path, alpha * pa);
      else { ctx.strokeStyle = withAlpha(color, alpha * pa); ctx.lineWidth = (0.6 + 0.42 * pb) * lw; ctx.stroke(path); }
      path = null;
    };
    for (let k = 0; k < W.length; k++) {
      camera.view(P[3 * k], P[3 * k + 1], P[3 * k + 2], v);
      const x = cx + v[0] * r, y = cy - v[1] * r, vis = v[2] > 0.02;
      const a = k > 0 ? Math.round(32 * Math.max(A[k - 1], A[k])) / 32 : 0;
      const cut = vis && pv && a > 0 ? (river.wet ? dryPart(river.wet[k - 1], river.wet[k]) : [0, 1]) : null;
      if (cut) {
        const w = riverW(river, k, month), dryNow = month ? isDry(river, k, w) : w < RIVER_MIN * 0.999;
        if (!dryNow || month) {
          const b = dryNow ? -1 : riverBucket(w);
          if (b !== pb || a !== pa) { flush(); path = new Path2D(); pb = b; pa = a; }
          path.moveTo(px + cut[0] * (x - px), py + cut[0] * (y - py)); path.lineTo(px + cut[1] * (x - px), py + cut[1] * (y - py));
        }
      }
      px = x; py = y; pv = vis;
    }
    flush();
  }
}

// The routes: each line's segments in buckets of weight by the food they carry (×3 a bucket, the
// heaviest at the top; lighter than the fourth isn't drawn), by land, river and sea alike.
const ROUTE_BUCKETS = 4;
function drawRoutes(ctx, cx, cy, r, camera, routes, color) {
  const { P, W, off, max } = routes;
  if (!P || !P.length || !(max > 0)) return;
  const lw = Math.sqrt(symbolScale(r)), v = [0, 0, 0], lg3 = Math.log(3);
  const paths = Array.from({ length: ROUTE_BUCKETS }, () => new Path2D());
  const m = P.length / 3;
  for (let l = 0; l < off.length; l++) {
    const end = l + 1 < off.length ? off[l + 1] : m;
    let px = 0, py = 0, pv = false;
    for (let k = off[l]; k < end; k++) {
      camera.view(P[3 * k], P[3 * k + 1], P[3 * k + 2], v);
      const x = cx + v[0] * r, y = cy - v[1] * r, vis = v[2] > 0.02;
      if (vis && pv && k > off[l]) {
        const b = ROUTE_BUCKETS - 1 + Math.floor(Math.log(W[k] / max) / lg3);
        if (b >= 0) { const p = paths[Math.min(ROUTE_BUCKETS - 1, b)]; p.moveTo(px, py); p.lineTo(x, y); }
      }
      px = x; py = y; pv = vis;
    }
  }
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  for (let b = 0; b < ROUTE_BUCKETS; b++) {
    const w = (0.5 + 0.5 * b) * lw;
    ctx.strokeStyle = withAlpha(color, 0.4 + 0.1 * b); ctx.lineWidth = w;
    ctx.stroke(paths[b]);
  }
}

// The states' capitals (src/engine/polities.js, `capitals`): each a five-pointed star in the rules' colour,
// larger by the people it holds.
function drawCapitals(ctx, cx, cy, r, camera, caps, color) {
  const lw = Math.sqrt(symbolScale(r)), v = [0, 0, 0];
  ctx.fillStyle = withAlpha(color, 0.85);
  ctx.beginPath();
  for (let k = 0; k < caps.length; k += 4) {
    camera.view(caps[k], caps[k + 1], caps[k + 2], v);
    if (v[2] <= 0.02) continue;
    const R = lw * (2.6 + 0.9 * Math.max(0, Math.log10(caps[k + 3] / 1e6))), x = cx + v[0] * r, y = cy - v[1] * r;
    for (let p = 0; p < 10; p++) {
      const a = -Math.PI / 2 + p * Math.PI / 5, rr = p % 2 ? 0.4 * R : R;
      if (p) ctx.lineTo(x + rr * Math.cos(a), y + rr * Math.sin(a)); else ctx.moveTo(x + rr * Math.cos(a), y + rr * Math.sin(a));
    }
    ctx.closePath();
  }
  ctx.fill();
}

function drawPlumes(ctx, cx, cy, r, camera, plumes, palette) {
  const v = [0, 0, 0], sc = symbolScale(r);
  ctx.fillStyle = palette.accent;
  ctx.strokeStyle = palette.accent;
  ctx.lineWidth = 1;
  for (const p of plumes.hot) {
    camera.view(p[0], p[1], p[2], v);
    if (v[2] < 0.05) continue;
    const x = cx + v[0] * r, y = cy - v[1] * r;
    ctx.beginPath(); ctx.arc(x, y, 1.9 * sc, 0, 2 * Math.PI); ctx.fill();
    ctx.beginPath(); ctx.arc(x, y, 4.6 * sc, 0, 2 * Math.PI); ctx.stroke();
  }
  for (const L of plumes.lips) {
    camera.view(L.p[0], L.p[1], L.p[2], v);
    if (v[2] < 0.1) continue;
    const x = cx + v[0] * r, y = cy - v[1] * r, rad = L.radius * r;
    const fade = Math.max(0, 1 - L.age / 3);
    ctx.globalAlpha = 0.35 + 0.65 * fade;
    ctx.beginPath(); ctx.ellipse(x, y, rad * Math.max(0.2, v[2]), rad, Math.atan2(-v[1], v[0]), 0, 2 * Math.PI); ctx.stroke();
    for (let a = -rad; a <= rad; a += 5) for (let b = -rad; b <= rad; b += 5) {
      if (a * a + b * b > rad * rad * 0.85) continue;
      ctx.fillRect(x + a + ((b / 5) % 2 ? 2.5 : 0) - 0.6, y + b - 0.6, 1.2, 1.2);
    }
    ctx.globalAlpha = 1;
  }
}

// An eruption: a red triangle, the map's volcano, its size by the sulfate (a decade of
// Pinatubos a step), fading over its second and a half on screen.
function drawEruptions(ctx, cx, cy, r, camera, eruptions, palette) {
  const v = [0, 0, 0], sc = symbolScale(r);
  ctx.fillStyle = palette.accent;
  for (const e of eruptions) {
    camera.view(e.p[0], e.p[1], e.p[2], v);
    if (v[2] < 0.05 || !(e.a > 0)) continue;
    const x = cx + v[0] * r, y = cy - v[1] * r, s = (3 + 1.8 * Math.max(0, Math.log10(e.M / 0.1))) * sc;
    ctx.globalAlpha = e.a;
    ctx.beginPath(); ctx.moveTo(x, y - s); ctx.lineTo(x + 0.95 * s, y + 0.65 * s); ctx.lineTo(x - 0.95 * s, y + 0.65 * s); ctx.closePath(); ctx.fill();
  }
  ctx.globalAlpha = 1;
}

const scratch = {};   // drawOverlay's per-line screen points, grown as lines need

export function drawOverlay(ctx, w, h, dpr, camera, layers, palette) {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  const r = camera.radius(w * dpr, h * dpr) / dpr;
  const cx = w / 2, cy = h / 2;

  drawSky(ctx, cx, cy, r, r / camera.zoom, w, h, camera, layers.sky, palette);
  ctx.lineWidth = 1;
  ctx.strokeStyle = withAlpha(palette.text, 0.28);
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, 2 * Math.PI);
  ctx.stroke();
  const climate = layers.view === 'climate', weather = layers.view === 'weather', tides = layers.view === 'tides', folk = layers.view === 'people';
  // Rivers are painted over the land, opaque, so nothing under them shows through and their joins
  // don't darken (a9: over the relief's colours, the farms and the cities): in the sea's ink on the
  // Surface and the People maps, paler toward the paper on the Zones' mosaic and on the charts.
  if (layers.rivers) {
    const ink = layers.air || weather || tides ? mixHex(palette.ocean, palette.canvas, 0.6) : climate ? mixHex(palette.ocean, palette.canvas, 0.35) : palette.ocean;
    drawRivers(ctx, cx, cy, r, camera, layers.rivers, ink, 1, layers.riverMonth);
  }
  if (folk && layers.routes) drawRoutes(ctx, cx, cy, r, camera, layers.routes, palette.text);
  if (folk && layers.capitals) drawCapitals(ctx, cx, cy, r, camera, layers.capitals, palette.text);
  if (weather) { drawChart(ctx, cx, cy, r, camera, layers.chart, palette, layers.chartFade ?? 1, symbolScale(r), layers.wxNow); return; }
  // The Climate view's Air chart: the winds as streamlines (src/render/streamlines.js).
  if (layers.air) drawStreamlines(ctx, cx, cy, r, camera, layers.air.sets, withAlpha(palette.text, 0.62), Math.sqrt(symbolScale(r)));
  if (!climate && !tides && !folk && layers.plumes) drawPlumes(ctx, cx, cy, r, camera, layers.plumes, palette);
  if (!tides && !folk && layers.eruptions && layers.eruptions.length) drawEruptions(ctx, cx, cy, r, camera, layers.eruptions, palette);
  const lines = climate || tides || folk ? null : layers.boundaries;
  if (!lines) return;
  const sc = symbolScale(r), lw = Math.sqrt(sc);
  // Gaps in px at scale 1 (along.js scales them); sizes in px.
  const TOOTH_GAP = 13, TOOTH = 3.2 * sc, ARC_GAP = 17, ARC_OFF = 8.5 * sc, ARC_R = 1.25 * sc;
  const SLIP_GAP = 70, SLIP_LEN = 8 * sc, SLIP_OFF = 3.5 * sc;

  const paths = { [INACTIVE]: new Path2D(), [RIDGE]: new Path2D(), [TRENCH]: new Path2D(), [TRANSFORM]: new Path2D() };
  const teeth = new Path2D(), openTeeth = new Path2D(), arcs = new Path2D(), slips = new Path2D();
  const v = [0, 0, 0];

  for (const line of lines) {
    if (line.hidden) continue;
    const { type, over, arc, slide } = line, P = line.shown || line.P, L = line.L, R = line.shown && line.R;
    if (!line.u) freshU(line);
    const M = type.length, u = line.shownU || line.u;
    if (!scratch.sx || scratch.sx.length < M) { const c = Math.max(M, 2 * (scratch.sx ? scratch.sx.length : 256)); scratch.sx = new Float32Array(c); scratch.sy = new Float32Array(c); scratch.vis = new Uint8Array(c); }
    const sx = scratch.sx.subarray(0, M), sy = scratch.sy.subarray(0, M), vis = scratch.vis.subarray(0, M);
    let has = 0;
    for (let k = 0; k < M; k++) {
      camera.view(P[3 * k], P[3 * k + 1], P[3 * k + 2], v);
      sx[k] = cx + v[0] * r; sy[k] = cy - v[1] * r; vis[k] = v[2] > 0.03 ? 1 : 0;
      has |= 1 << type[k];
    }
    // Rules: one subpath per run of a type on the visible side; inactive ones dotted, the dots pinned too.
    for (let k = 0; k < M - 1; k++) {
      if (!vis[k] || !vis[k + 1] || type[k] === INACTIVE) continue;
      const p = paths[type[k]];
      if (k === 0 || type[k - 1] !== type[k] || !vis[k - 1]) p.moveTo(sx[k], sy[k]);
      p.lineTo(sx[k + 1], sy[k + 1]);
    }
    if (has & (1 << INACTIVE)) dashes(paths[INACTIVE], sx, sy, k => vis[k] && vis[k + 1] && type[k] === INACTIVE, u, [0.5, 3.5], sc, r);
    // The screen direction of the line's left side at segment k, from its world vector.
    const lf = [0, 0], leftOf = (k, tx, ty) => {
      // The left side as traced, turned with the line (placeLine's turn) only where a mark needs it.
      const x = L[3 * k], y = L[3 * k + 1], z = L[3 * k + 2];
      if (R) camera.view(R[0] * x + R[1] * y + R[2] * z, R[3] * x + R[4] * y + R[5] * z, R[6] * x + R[7] * y + R[8] * z, v);
      else camera.view(x, y, z, v);
      const s = -ty * v[0] + tx * -v[1] < 0 ? -1 : 1;
      lf[0] = -ty * s; lf[1] = tx * s;
      return lf;
    };
    const oct = has & (1 << TRENCH | 1 << TRANSFORM) ? octaves(sx, sy, vis, u, sc) : null;
    if (has & (1 << TRENCH)) {
      marks(sx, sy, u, TOOTH_GAP, oct, (px, py, tx, ty, size, k) => {
        if (type[k] !== TRENCH) return;
        // Subduction: filled teeth on the plate on top (+1: the left one). Collision
        // (continent against continent, nothing sinks): open teeth, as a thrust belt.
        const [nx, ny] = leftOf(k, tx, ty), side = over[k] >= 0 ? 1 : -1, ox = side * nx, oy = side * ny;
        const path = arc[k] > 0.5 ? teeth : openTeeth, T = TOOTH * size;
        path.moveTo(px - tx * T, py - ty * T);
        path.lineTo(px + ox * T * 1.5, py + oy * T * 1.5);
        path.lineTo(px + tx * T, py + ty * T);
        path.closePath();
      });
      marks(sx, sy, u, ARC_GAP, oct, (px, py, tx, ty, size, k) => {
        if (type[k] !== TRENCH || arc[k] <= 0.5) return;
        const [nx, ny] = leftOf(k, tx, ty), side = over[k] >= 0 ? 1 : -1;
        const qx = px + side * nx * ARC_OFF, qy = py + side * ny * ARC_OFF, R = ARC_R * size;
        arcs.moveTo(qx + R, qy);
        arcs.arc(qx, qy, R, 0, 2 * Math.PI);
      });
    }
    if (has & (1 << TRANSFORM)) marks(sx, sy, u, SLIP_GAP, oct, (px, py, tx, ty, size, k) => {
      if (type[k] !== TRANSFORM) return;
      // The right side moves along +t relative to the left when slide > 0.
      const [nx, ny] = leftOf(k, tx, ty), dir = slide[k] >= 0 ? 1 : -1, len = SLIP_LEN * size, hd = size * sc;
      for (const sideSign of [1, -1]) {
        const along = sideSign === -1 ? dir : -dir;          // −1 is the right side
        const ox = px + sideSign * nx * SLIP_OFF, oy = py + sideSign * ny * SLIP_OFF;
        const ex = ox + along * tx * len / 2, ey = oy + along * ty * len / 2;
        slips.moveTo(ox - along * tx * len / 2, oy - along * ty * len / 2);
        slips.lineTo(ex, ey);
        // Half-head on the outer side.
        slips.lineTo(ex - along * tx * 3 * hd + sideSign * nx * 2.4 * hd, ey - along * ty * 3 * hd + sideSign * ny * 2.4 * hd);
      }
    });
  }

  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.lineWidth = lw;
  ctx.strokeStyle = withAlpha(palette.text, 0.35);
  ctx.stroke(paths[INACTIVE]);
  ctx.strokeStyle = withAlpha(palette.text, 0.5);
  ctx.stroke(paths[TRANSFORM]);
  ctx.strokeStyle = withAlpha(palette.text, 0.7);
  ctx.stroke(slips);
  ctx.lineWidth = 1.5 * lw;
  ctx.strokeStyle = palette.accent;
  ctx.stroke(paths[RIDGE]);
  ctx.lineWidth = 1.25 * lw;
  ctx.strokeStyle = withAlpha(palette.text, 0.85);
  ctx.stroke(paths[TRENCH]);
  ctx.fillStyle = withAlpha(palette.text, 0.85);
  ctx.fill(teeth);
  ctx.fillStyle = palette.canvas;
  ctx.fill(openTeeth);
  ctx.lineWidth = lw;
  ctx.strokeStyle = withAlpha(palette.text, 0.85);
  ctx.stroke(openTeeth);
  ctx.fillStyle = palette.accent;
  ctx.fill(arcs);
}

/** Hex a mixed toward hex b by t, as hex. */
function mixHex(a, b, t) {
  const p = x => { const h = x.replace('#', ''); return [0, 2, 4].map(k => parseInt(h.slice(k, k + 2), 16)); };
  const A = p(a), B = p(b);
  return `#${A.map((v, i) => Math.round(v + (B[i] - v) * t).toString(16).padStart(2, '0')).join('')}`;
}

function withAlpha(hex, a) {
  const h = hex.replace('#', '');
  return `rgba(${parseInt(h.slice(0, 2), 16)}, ${parseInt(h.slice(2, 4), 16)}, ${parseInt(h.slice(4, 6), 16)}, ${a})`;
}

/**
 * For each point of a new line, its nearest point on the old line (segment
 * index and fraction), searched near the same share of the way along. Points
 * then move across the line as it changes, not along it, and the coordinate its
 * symbols sit on (along.js) carries over. `flip`: the old line runs the other way.
 */
export function correspond(prev, cur) {
  const n = prev.length / 3, m = cur.length / 3;
  const d2 = (A, i, B, j) => (A[3 * i] - B[3 * j]) ** 2 + (A[3 * i + 1] - B[3 * j + 1]) ** 2 + (A[3 * i + 2] - B[3 * j + 2]) ** 2;
  const flip = d2(cur, 0, prev, n - 1) + d2(cur, m - 1, prev, 0) < d2(cur, 0, prev, 0) + d2(cur, m - 1, prev, n - 1);
  const corr = new Float32Array(2 * m);
  if (n < 2) return { corr, flip };
  // The match runs along the old line as k runs along the new, so each point searches near
  // the last one's match (and the proportional place, should the last have strayed).
  const win = 6 + 2 * Math.ceil(n / m);
  let lastJ = flip ? n - 2 : 0;
  for (let k = 0; k < m; k++) {
    if (k === 0 || k === m - 1) { const e = (k === 0) !== flip ? 0 : n - 2; corr[2 * k] = e; corr[2 * k + 1] = (k === 0) !== flip ? 0 : 1; continue; }
    const f = k / (m - 1), c = Math.floor((flip ? 1 - f : f) * (n - 1));
    let best = Infinity, bj = 0, bt = 0;
    const lo = Math.max(0, Math.min(lastJ, c) - win), hi = Math.min(n - 2, Math.max(lastJ, c) + win);
    for (let j = lo; j <= hi; j++) {
      const ax = prev[3 * j], ay = prev[3 * j + 1], az = prev[3 * j + 2];
      const ux = prev[3 * j + 3] - ax, uy = prev[3 * j + 4] - ay, uz = prev[3 * j + 5] - az, uu = ux * ux + uy * uy + uz * uz || 1e-12;
      const px = cur[3 * k] - ax, py = cur[3 * k + 1] - ay, pz = cur[3 * k + 2] - az;
      const t = Math.max(0, Math.min(1, (px * ux + py * uy + pz * uz) / uu));
      const dd = (px - t * ux) ** 2 + (py - t * uy) ** 2 + (pz - t * uz) ** 2;
      if (dd < best) { best = dd; bj = j; bt = t; }
    }
    corr[2 * k] = bj; corr[2 * k + 1] = bt;
    lastJ = bj;
  }
  return { corr, flip };
}

/** A line between its predecessor's course (φ = 0) and its own (φ = 1), point by corresponding point. */
export function morphed(prev, cur, phi, corr) {
  if (!prev || !corr || phi >= 1) return cur;
  const out = new Float32Array(cur.length), m = cur.length / 3;
  for (let k = 0; k < m; k++) {
    const j = corr[2 * k], t = corr[2 * k + 1], a = 3 * j, b = 3 * (j + 1);
    const qx = prev[a] + t * (prev[b] - prev[a]), qy = prev[a + 1] + t * (prev[b + 1] - prev[a + 1]), qz = prev[a + 2] + t * (prev[b + 2] - prev[a + 2]);
    const x = qx + phi * (cur[3 * k] - qx), y = qy + phi * (cur[3 * k + 1] - qy), z = qz + phi * (cur[3 * k + 2] - qz), r = Math.hypot(x, y, z) || 1;
    out[3 * k] = x / r; out[3 * k + 1] = y / r; out[3 * k + 2] = z / r;
  }
  return out;
}

/** A line linked to its predecessor: their correspondence, and the coordinate its symbols keep (along.js). */
export function link(l, prev) {
  const { corr, flip } = correspond(prev.P, l.P);
  l.prev = prev; l.corr = corr;
  inheritU(l, prev, corr, flip);
}

/**
 * Pair each new line with its predecessor (same key, nearest middle within
 * ~500 km) and work out their correspondence. Returns the old lines left unpaired.
 */
export function matchLines(prev, cur, key) {
  if (!prev) { for (const l of cur) { l.prev = null; l.corr = null; freshU(l); } return []; }
  const pt = (P, k) => [P[3 * k], P[3 * k + 1], P[3 * k + 2]];
  const mid = P => pt(P, Math.floor(P.length / 6));
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const byKey = new Map();
  for (const l of prev) { const k = key(l); if (!byKey.has(k)) byKey.set(k, []); byKey.get(k).push(l); }
  const used = new Set();
  for (const l of cur) {
    l.prev = null; l.corr = null;
    const cands = byKey.get(key(l));
    if (!cands) { freshU(l); continue; }
    const m = mid(l.P);
    let best = Math.cos(0.08), bl = null;
    for (const c of cands) {
      if (used.has(c)) continue;
      const d = dot(m, mid(c.P));
      if (d <= best) continue;
      best = d; bl = c;
    }
    if (bl) { used.add(bl); link(l, bl); } else freshU(l);
  }
  return prev.filter(l => !used.has(l));
}
