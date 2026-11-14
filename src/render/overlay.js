// The 2D layer over the globe: the limb, and the plate boundaries as smooth
// lines (src/render/lines.js) in the symbols of a tectonic map, placed at even
// spacing along each line on screen:
//   trench       a rule with sawteeth on the plate that stays on top, and,
//                where ocean is going down, red marks for the arc of volcanoes
//                standing on that side
//   ridge        a red rule: the mantle reaching the surface (the globe also
//                tints crust younger than 1 Myr)
//   transform    a lighter rule with paired half-arrows giving the sense of slip
//   inactive     a dotted rule (the plates hardly move against each other)
// Under them, rivers in the sea's ink, their weight the discharge. The Climate
// view keeps the rivers, lighter, and drops the tectonic symbols. Hotspots are
// red points ringed, and a province in eruption a red stippled disc: the
// mantle at the surface.
import { INACTIVE, RIDGE, TRENCH, TRANSFORM } from './lines.js';
import { drawChart } from './chart.js';

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

const RIVER_BUCKETS = 6;

function drawRivers(ctx, cx, cy, r, camera, rivers, color, alpha) {
  const lw = Math.sqrt(symbolScale(r));
  const paths = Array.from({ length: RIVER_BUCKETS }, () => new Path2D());
  const v = [0, 0, 0];
  for (const river of rivers) {
    const { W } = river, P = river.shown || river.P;
    let px = 0, py = 0, pv = false;
    for (let k = 0; k < W.length; k++) {
      camera.view(P[3 * k], P[3 * k + 1], P[3 * k + 2], v);
      const x = cx + v[0] * r, y = cy - v[1] * r, vis = v[2] > 0.02;
      if (vis && pv) {
        const q = Math.log10(Math.max(1, W[k] / 1500));
        const b = Math.min(RIVER_BUCKETS - 1, Math.floor(q * 2.2));
        paths[b].moveTo(px, py); paths[b].lineTo(x, y);
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

export function drawOverlay(ctx, w, h, dpr, camera, layers, palette) {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  const r = camera.radius(w * dpr, h * dpr) / dpr;
  const cx = w / 2, cy = h / 2;

  ctx.lineWidth = 1;
  ctx.strokeStyle = withAlpha(palette.text, 0.28);
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, 2 * Math.PI);
  ctx.stroke();
  const climate = layers.view === 'climate', weather = layers.view === 'weather';
  if (layers.rivers) drawRivers(ctx, cx, cy, r, camera, layers.rivers, palette.ocean, climate ? 0.55 : weather ? 0.35 : 0.9);
  if (weather) { drawChart(ctx, cx, cy, r, camera, layers.chart, palette, layers.chartFade ?? 1, symbolScale(r), layers.wxNow); return; }
  if (!climate && layers.plumes) drawPlumes(ctx, cx, cy, r, camera, layers.plumes, palette);
  const lines = climate ? null : layers.boundaries;
  if (!lines) return;
  const sc = symbolScale(r), lw = Math.sqrt(sc);
  const TOOTH_GAP = 13 * sc, TOOTH = 3.2 * sc, ARC_GAP = 17 * sc, ARC_OFF = 8.5 * sc, ARC_R = 1.25 * sc;
  const SLIP_GAP = 70 * sc, SLIP_LEN = 8 * sc, SLIP_OFF = 3.5 * sc;

  const paths = { [INACTIVE]: new Path2D(), [RIDGE]: new Path2D(), [TRENCH]: new Path2D(), [TRANSFORM]: new Path2D() };
  const teeth = new Path2D(), arcs = new Path2D(), slips = new Path2D();
  const v = [0, 0, 0];

  for (const line of lines) {
    const { T, type, over, arc, slide } = line, P = line.shown || line.P, L = line.shownL || line.L;
    const M = type.length;
    const sx = new Float32Array(M), sy = new Float32Array(M), vis = new Uint8Array(M);
    for (let k = 0; k < M; k++) {
      camera.view(P[3 * k], P[3 * k + 1], P[3 * k + 2], v);
      sx[k] = cx + v[0] * r; sy[k] = cy - v[1] * r; vis[k] = v[2] > 0.03 ? 1 : 0;
    }
    // Rules: one subpath per run of a type on the visible side.
    for (let k = 0; k < M - 1; k++) {
      if (!vis[k] || !vis[k + 1]) continue;
      const p = paths[type[k]];
      if (k === 0 || type[k - 1] !== type[k] || !vis[k - 1]) p.moveTo(sx[k], sy[k]);
      p.lineTo(sx[k + 1], sy[k + 1]);
    }
    // Symbols at even spacing along the line on screen.
    let dTooth = TOOTH_GAP / 2, dArc = ARC_GAP / 2, dSlip = SLIP_GAP / 2;
    for (let k = 0; k < M - 1; k++) {
      if (!vis[k] || !vis[k + 1]) { dTooth = TOOTH_GAP / 2; dArc = ARC_GAP / 2; dSlip = SLIP_GAP / 2; continue; }
      const ax = sx[k], ay = sy[k], bx = sx[k + 1], by = sy[k + 1];
      const seg = Math.hypot(bx - ax, by - ay);
      if (seg < 1e-6) continue;
      const tx = (bx - ax) / seg, ty = (by - ay) / seg;
      const ty_ = type[k];
      // Screen direction of the line's left side, from its world vector.
      camera.view(L[3 * k], L[3 * k + 1], L[3 * k + 2], v);
      let nx = -ty, ny = tx;
      if (nx * v[0] + ny * -v[1] < 0) { nx = -nx; ny = -ny; }   // (nx, ny) now points left
      let s = 0;
      while (s < seg) {
        const step = Math.min(seg - s, Math.min(dTooth, dArc, dSlip));
        s += step; dTooth -= step; dArc -= step; dSlip -= step;
        const f = s / seg, px = ax + f * (bx - ax), py = ay + f * (by - ay);
        const side = over[k] >= 0 ? 1 : -1;            // +1: the left plate stays on top
        if (dTooth <= 1e-6) {
          dTooth = TOOTH_GAP;
          if (ty_ === TRENCH) {
            const ox = side * nx, oy = side * ny;
            teeth.moveTo(px - tx * TOOTH, py - ty * TOOTH);
            teeth.lineTo(px + ox * TOOTH * 1.5, py + oy * TOOTH * 1.5);
            teeth.lineTo(px + tx * TOOTH, py + ty * TOOTH);
            teeth.closePath();
          }
        }
        if (dArc <= 1e-6) {
          dArc = ARC_GAP;
          if (ty_ === TRENCH && arc[k] > 0.5) {
            const qx = px + side * nx * ARC_OFF, qy = py + side * ny * ARC_OFF;
            arcs.moveTo(qx + ARC_R, qy);
            arcs.arc(qx, qy, ARC_R, 0, 2 * Math.PI);
          }
        }
        if (dSlip <= 1e-6) {
          dSlip = SLIP_GAP;
          if (ty_ === TRANSFORM) {
            // The right side moves along +t relative to the left when slide > 0.
            const dir = slide[k] >= 0 ? 1 : -1;
            for (const sideSign of [1, -1]) {
              const along = sideSign === -1 ? dir : -dir;          // −1 is the right side
              const ox = px + sideSign * nx * SLIP_OFF, oy = py + sideSign * ny * SLIP_OFF;
              const ex = ox + along * tx * SLIP_LEN / 2, ey = oy + along * ty * SLIP_LEN / 2;
              slips.moveTo(ox - along * tx * SLIP_LEN / 2, oy - along * ty * SLIP_LEN / 2);
              slips.lineTo(ex, ey);
              // Half-head on the outer side.
              slips.lineTo(ex - along * tx * 3 * sc + sideSign * nx * 2.4 * sc, ey - along * ty * 3 * sc + sideSign * ny * 2.4 * sc);
            }
          }
        }
      }
    }
  }

  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.setLineDash([1 * lw, 3 * sc]);
  ctx.lineWidth = lw;
  ctx.strokeStyle = withAlpha(palette.text, 0.35);
  ctx.stroke(paths[INACTIVE]);
  ctx.setLineDash([]);
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
  ctx.fillStyle = palette.accent;
  ctx.fill(arcs);
}

function withAlpha(hex, a) {
  const h = hex.replace('#', '');
  return `rgba(${parseInt(h.slice(0, 2), 16)}, ${parseInt(h.slice(2, 4), 16)}, ${parseInt(h.slice(4, 6), 16)}, ${a})`;
}
