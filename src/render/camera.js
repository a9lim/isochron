// The orbit camera: an orthographic view of the unit globe. `q` turns world
// coordinates into view coordinates (x right, y up, z toward the viewer).
// Dragging turns the globe under the pointer; zoom scales it.

function mul(a, b) {
  return [
    a[0] * b[0] - a[1] * b[1] - a[2] * b[2] - a[3] * b[3],
    a[0] * b[1] + a[1] * b[0] + a[2] * b[3] - a[3] * b[2],
    a[0] * b[2] - a[1] * b[3] + a[2] * b[0] + a[3] * b[1],
    a[0] * b[3] + a[1] * b[2] - a[2] * b[1] + a[3] * b[0],
  ];
}
function axisAngle(x, y, z, a) { const s = Math.sin(a / 2); return [Math.cos(a / 2), x * s, y * s, z * s]; }
function norm(q) { const r = Math.hypot(...q); return q.map(c => c / r); }

export class Orbit {
  constructor() {
    // World z is the planet's spin axis: put it up the screen (view y), then
    // tilt the north pole 20° toward the viewer.
    const upright = axisAngle(1, 0, 0, -Math.PI / 2);
    const tilt = axisAngle(1, 0, 0, 20 * Math.PI / 180);
    this.q = norm(mul(tilt, upright));
    this.zoom = 1;
    this.m = new Float32Array(9);
    this.update();
  }

  update() {
    const [w, x, y, z] = this.q, m = this.m;
    m[0] = 1 - 2 * (y * y + z * z); m[1] = 2 * (x * y - w * z);     m[2] = 2 * (x * z + w * y);
    m[3] = 2 * (x * y + w * z);     m[4] = 1 - 2 * (x * x + z * z); m[5] = 2 * (y * z - w * x);
    m[6] = 2 * (x * z - w * y);     m[7] = 2 * (y * z + w * x);     m[8] = 1 - 2 * (x * x + y * y);
  }

  /** The globe's radius in CSS pixels for a w × h stage. */
  radius(w, h) { return 0.43 * Math.min(w, h) * this.zoom; }

  /** Turn by a pointer drag of (dx, dy) CSS px on a globe of radius r px. */
  drag(dx, dy, r) {
    const a = Math.hypot(dx, dy) / r;
    if (a === 0) return;
    // Axis in view space perpendicular to the drag, in the screen plane (screen y runs down).
    const ax = dy / Math.hypot(dx, dy), ay = dx / Math.hypot(dx, dy);
    this.q = norm(mul(axisAngle(ax, ay, 0, a), this.q));
    this.update();
  }

  zoomBy(f) { this.zoom = Math.min(8, Math.max(0.8, this.zoom * f)); }

  /** View coordinates of a world point. */
  view(x, y, z, out) {
    const m = this.m;
    out[0] = m[0] * x + m[1] * y + m[2] * z;
    out[1] = m[3] * x + m[4] * y + m[5] * z;
    out[2] = m[6] * x + m[7] * y + m[8] * z;
    return out;
  }
}
