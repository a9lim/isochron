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
import { INACTIVE, RIDGE, TRENCH, TRANSFORM } from './lines.js';

const TOOTH_GAP = 13, TOOTH = 3.2;
const ARC_GAP = 17, ARC_OFF = 8.5, ARC_R = 1.25;
const SLIP_GAP = 70, SLIP_LEN = 8, SLIP_OFF = 3.5;

export function drawOverlay(ctx, w, h, dpr, camera, lines, palette) {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  const r = camera.radius(w * dpr, h * dpr) / dpr;
  const cx = w / 2, cy = h / 2;

  ctx.lineWidth = 1;
  ctx.strokeStyle = withAlpha(palette.text, 0.28);
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, 2 * Math.PI);
  ctx.stroke();
  if (!lines) return;

  const paths = { [INACTIVE]: new Path2D(), [RIDGE]: new Path2D(), [TRENCH]: new Path2D(), [TRANSFORM]: new Path2D() };
  const teeth = new Path2D(), arcs = new Path2D(), slips = new Path2D();
  const v = [0, 0, 0];

  for (const line of lines) {
    const { P, T, L, type, over, arc, slide } = line;
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
              slips.lineTo(ex - along * tx * 3 + sideSign * nx * 2.4, ey - along * ty * 3 + sideSign * ny * 2.4);
            }
          }
        }
      }
    }
  }

  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.setLineDash([1, 3]);
  ctx.lineWidth = 1;
  ctx.strokeStyle = withAlpha(palette.text, 0.35);
  ctx.stroke(paths[INACTIVE]);
  ctx.setLineDash([]);
  ctx.strokeStyle = withAlpha(palette.text, 0.5);
  ctx.stroke(paths[TRANSFORM]);
  ctx.strokeStyle = withAlpha(palette.text, 0.7);
  ctx.stroke(slips);
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = palette.accent;
  ctx.stroke(paths[RIDGE]);
  ctx.lineWidth = 1.25;
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
