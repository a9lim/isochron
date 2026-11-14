// The 2D layer over the globe: the limb, plate boundaries in the symbols of a
// tectonic map, and arc volcanoes.
//   convergent   a rule with barbs on the overriding side (the plate that stays on top)
//   transform    a plain lighter rule
//   divergent    no rule: the globe draws the ridge axis itself, in red, as young crust
//   arcs         small red marks where ocean is going down beneath them

const CONVERGENT = 2, TRANSFORM = 3;

export function drawOverlay(ctx, w, h, dpr, camera, grid, edges, arc, palette) {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  const r = camera.radius(w * dpr, h * dpr) / dpr;
  const cx = w / 2, cy = h / 2;
  const a = [0, 0, 0], b = [0, 0, 0], p = [0, 0, 0], q = [0, 0, 0];
  const C = grid.centre, P = grid.pos;

  ctx.lineWidth = 1;
  ctx.strokeStyle = withAlpha(palette.text, 0.28);
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, 2 * Math.PI);
  ctx.stroke();

  if (edges) {
    const conv = new Path2D(), trans = new Path2D(), barbs = new Path2D();
    for (let e = 0; e < edges.length; e += 7) {
      const type = edges[e + 2];
      if (type !== CONVERGENT && type !== TRANSFORM) continue;
      const ca = edges[e], cb = edges[e + 1];
      camera.view(C[3 * ca], C[3 * ca + 1], C[3 * ca + 2], a);
      camera.view(C[3 * cb], C[3 * cb + 1], C[3 * cb + 2], b);
      if (a[2] < 0.02 && b[2] < 0.02) continue;
      const ax = cx + a[0] * r, ay = cy - a[1] * r, bx = cx + b[0] * r, by = cy - b[1] * r;
      if (type === TRANSFORM) { trans.moveTo(ax, ay); trans.lineTo(bx, by); continue; }
      conv.moveTo(ax, ay); conv.lineTo(bx, by);
      // A barb at the midpoint, pointing into the overriding side.
      const over = edges[e + 3] > 0 ? edges[e + 4] : edges[e + 5];
      camera.view(P[3 * over], P[3 * over + 1], P[3 * over + 2], p);
      const mx = 0.5 * (ax + bx), my = 0.5 * (ay + by);
      let tx = bx - ax, ty = by - ay;
      const len = Math.hypot(tx, ty);
      if (len < 2.5) continue;
      tx /= len; ty /= len;
      let nx = -ty, ny = tx;
      const ox = cx + p[0] * r - mx, oy = cy - p[1] * r - my;
      if (nx * ox + ny * oy < 0) { nx = -nx; ny = -ny; }
      const s = Math.min(3.2, 0.42 * len);
      barbs.moveTo(mx - tx * s, my - ty * s);
      barbs.lineTo(mx + nx * s * 1.3, my + ny * s * 1.3);
      barbs.lineTo(mx + tx * s, my + ty * s);
      barbs.closePath();
    }
    ctx.strokeStyle = withAlpha(palette.text, 0.42);
    ctx.stroke(trans);
    ctx.strokeStyle = withAlpha(palette.text, 0.78);
    ctx.stroke(conv);
    ctx.fillStyle = withAlpha(palette.text, 0.78);
    ctx.fill(barbs);
  }

  if (arc) {
    const dots = new Path2D();
    for (let i = 0; i < grid.n; i++) {
      if (arc[i] < 1.2) continue;
      camera.view(P[3 * i], P[3 * i + 1], P[3 * i + 2], q);
      if (q[2] < 0.05) continue;
      const x = cx + q[0] * r, y = cy - q[1] * r;
      dots.moveTo(x + 1.1, y);
      dots.arc(x, y, 1.1, 0, 2 * Math.PI);
    }
    ctx.fillStyle = palette.accent;
    ctx.fill(dots);
  }
}

function withAlpha(hex, a) {
  const h = hex.replace('#', '');
  return `rgba(${parseInt(h.slice(0, 2), 16)}, ${parseInt(h.slice(2, 4), 16)}, ${parseInt(h.slice(4, 6), 16)}, ${a})`;
}
