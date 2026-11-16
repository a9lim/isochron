// The sky behind the globe: a star field fixed in space, and the Sun and the
// Moon where they are. Drawn as a star chart, in ink on the paper (the dark
// theme's paper is the night). Directions are in the planet's equatorial frame
// (z its spin axis); the planet turns under them by its sidereal angle θ, so
// the camera, which turns with the planet, sees the sky wheel about the pole.
//   stars   seeded positions and brightnesses; the pole is the spin axis
//   Sun     on the ecliptic at its longitude for the date, tilted by the
//           obliquity: its path through the year is the ecliptic
//   Moon    on the ecliptic at its longitude (advancing at its mean motion,
//           which its distance sets), lit on the side facing the Sun; drawn
//           at its true size against the Sun's (×5 both, to be read), so a nearer Moon
//           looks larger
//   swarm   the people's collectors round the Sun (the People experiment's
//           industry off-world): graphite points on seeded orbits, as many as
//           the share of the Sun's output they take (to a tenth), the disc
//           dimmed by it
//   base    the people's city on the Moon: ochre lights spreading from one
//           site on its near side (north up, by the planet's pole), as far as
//           off-world power has grown on a log scale (100 GW to 10²¹ W)
// Each shows only where the dial resolves its motion: the sky turns at the
// slowest dials and holds still above; the Moon and the Sun fade out when a
// month or a year would pass in under a few seconds.
import { stream } from '../rng.js';

/** The star field: unit vectors and brightnesses (0..1), seeded. */
export function makeStars(seed, count = 800) {
  const r = stream(seed, 'stars'), out = new Float32Array(4 * count);
  for (let k = 0; k < count; k++) {
    const z = 2 * r.uniform() - 1, a = 2 * Math.PI * r.uniform(), s = Math.sqrt(1 - z * z);
    out[4 * k] = s * Math.cos(a); out[4 * k + 1] = s * Math.sin(a); out[4 * k + 2] = z;
    out[4 * k + 3] = r.uniform() ** 3;   // few bright, many faint
  }
  return out;
}

/** An ecliptic longitude's direction in the equatorial frame, at obliquity ε. */
export function ecliptic(lam, eps) {
  return [Math.cos(lam), Math.sin(lam) * Math.cos(eps), Math.sin(lam) * Math.sin(eps)];
}

const SUN_R = 6.957e8, AU = 1.496e11, MOON_R = 1.7374e6, BIG = 5;
// The swarm's collectors: seeded orbits about the Sun (radius in the disc's, and phase), the first
// ones drawn as the share taken grows (by its square root, so the first percent shows).
const SWARM = (() => { const r = stream('swarm', 'orbits'), a = new Float32Array(3 * 900); for (let k = 0; k < 900; k++) { a[3 * k] = 1.25 + 1.6 * r.uniform() ** 0.7; a[3 * k + 1] = 2 * Math.PI * r.uniform(); a[3 * k + 2] = 0.25 + 0.75 * r.uniform(); } return a; })();

// The Moon's city: seeded points about one site on the near side (in the disc's units, north up),
// nearest first, so the first lit are the site's and the city spreads outward.
const BASE = (() => {
  const r = stream('moon', 'base'), pts = [];
  for (let k = 0; k < 420; k++) {
    const rr = 0.62 * Math.sqrt(r.uniform()) * (0.75 + 0.25 * r.uniform()), a = 2 * Math.PI * r.uniform();
    const x = 0.28 + rr * Math.cos(a), y = -0.38 + 0.85 * rr * Math.sin(a);
    if (x * x + y * y < 0.88) pts.push([x, y, rr, 0.35 + 0.65 * r.uniform()]);
  }
  return pts.sort((a, b) => a[2] - b[2]);
})();

const rgba = (hex, a) => { const h = hex.replace('#', ''); return `rgba(${parseInt(h.slice(0, 2), 16)}, ${parseInt(h.slice(2, 4), 16)}, ${parseInt(h.slice(4, 6), 16)}, ${a})`; };

/**
 * Draw the sky outside the globe's disc. `sky`: { stars, theta (rad), sun: dir | null,
 * sunAlpha, moon: dir | null, moonAlpha, moonDist (m) }; directions equatorial.
 * r0 is the globe's radius at the camera's least zoom: the sky's scale, which zoom
 * doesn't change (the stars are at infinity).
 */
export function drawSky(ctx, cx, cy, r, r0, w, h, camera, sky, pal) {
  if (!sky) return;
  const f = 1.6 * r0, c = Math.cos(sky.theta), s = Math.sin(sky.theta), v = [0, 0, 0];
  // Equatorial → the planet's frame (turned back by θ about the pole) → the view.
  const project = (x, y, z) => {
    camera.view(c * x + s * y, -s * x + c * y, z, v);
    if (v[2] > -0.05) return null;                       // behind the viewer, or edge on
    return [cx + f * v[0] / -v[2], cy - f * v[1] / -v[2]];
  };
  ctx.save();
  ctx.beginPath(); ctx.rect(0, 0, w, h); ctx.arc(cx, cy, r + 0.5, 0, 2 * Math.PI, true); ctx.clip();
  const st = sky.stars, ink = pal.text;
  for (let k = 0; k < st.length; k += 4) {
    const p = project(st[k], st[k + 1], st[k + 2]);
    if (!p || p[0] < -2 || p[0] > w + 2 || p[1] < -2 || p[1] > h + 2) continue;
    const b = st[k + 3];
    ctx.fillStyle = rgba(ink, (pal.dark ? 0.25 : 0.18) + (pal.dark ? 0.55 : 0.4) * b);
    ctx.beginPath(); ctx.arc(p[0], p[1], 0.45 + 1.1 * b, 0, 2 * Math.PI); ctx.fill();
  }
  // The Sun: a disc in ochre, dimmed by the swarm's share; the swarm's collectors on their orbits.
  if (sky.sun && sky.sunAlpha > 0.01) {
    const p = project(...sky.sun);
    if (p) {
      const R = Math.max(4, BIG * f * SUN_R / AU), sw = Math.min(0.1, sky.swarm || 0);
      ctx.globalAlpha = sky.sunAlpha * (1 - sw);
      ctx.fillStyle = pal.inks.ochre;
      ctx.beginPath(); ctx.arc(p[0], p[1], R, 0, 2 * Math.PI); ctx.fill();
      const nSw = sw > 1e-9 ? Math.round(900 * Math.sqrt(sw / 0.1)) : 0;
      if (nSw) {
        ctx.globalAlpha = sky.sunAlpha;
        ctx.fillStyle = rgba(ink, pal.dark ? 0.7 : 0.6);
        for (let k = 0; k < nSw; k++) {
          const rr = SWARM[3 * k] * R, a = SWARM[3 * k + 1];
          ctx.beginPath(); ctx.arc(p[0] + rr * Math.cos(a), p[1] + rr * SWARM[3 * k + 2] * Math.sin(a), 0.6, 0, 2 * Math.PI); ctx.fill();
        }
      }
      ctx.globalAlpha = 1;
    }
  }
  // The Moon in its phase: the lit side toward the Sun.
  if (sky.moon && sky.moonAlpha > 0.01 && sky.sun) {
    const m = sky.moon, p = project(...m);
    if (p) {
      const R = Math.max(4, BIG * f * MOON_R / sky.moonDist);
      // Elongation from the Sun, and the screen direction toward it (a step along the Sun's direction).
      const sn = sky.sun, cosE = m[0] * sn[0] + m[1] * sn[1] + m[2] * sn[2];
      const q = project(m[0] + 0.02 * sn[0], m[1] + 0.02 * sn[1], m[2] + 0.02 * sn[2]);
      const ang = q ? Math.atan2(q[1] - p[1], q[0] - p[0]) : 0;
      const cosA = -cosE;                                 // the phase angle's cosine (the Sun far away)
      ctx.globalAlpha = sky.moonAlpha;
      ctx.fillStyle = rgba(ink, pal.dark ? 0.22 : 0.16);
      ctx.beginPath(); ctx.arc(p[0], p[1], R, 0, 2 * Math.PI); ctx.fill();
      ctx.save();
      ctx.translate(p[0], p[1]); ctx.rotate(ang);
      ctx.fillStyle = pal.dark ? rgba(ink, 0.85) : pal.canvas;
      ctx.beginPath();
      ctx.arc(0, 0, R, -Math.PI / 2, Math.PI / 2, false);
      if (cosA > 0) ctx.ellipse(0, 0, R * cosA, R, 0, Math.PI / 2, 3 * Math.PI / 2, false);
      else ctx.ellipse(0, 0, -R * cosA, R, 0, Math.PI / 2, -Math.PI / 2, true);
      ctx.fill();
      ctx.restore();
      ctx.strokeStyle = rgba(ink, 0.55); ctx.lineWidth = 0.8;
      ctx.beginPath(); ctx.arc(p[0], p[1], R, 0, 2 * Math.PI); ctx.stroke();
      // The city: its lights, as many as off-world power has grown (north up, along the pole's direction on screen).
      const nB = Math.round(BASE.length * Math.min(1, Math.max(0, sky.moonbase || 0)) ** 1.3);
      if (nB) {
        const up = project(m[0], m[1], m[2] + 0.02), ua = up ? Math.atan2(up[1] - p[1], up[0] - p[0]) : -Math.PI / 2;
        const ny = [Math.cos(ua), Math.sin(ua)], nx = [-ny[1], ny[0]];   // screen directions of the Moon's north and east
        ctx.fillStyle = pal.inks.ochre;
        for (let k = 0; k < nB; k++) {
          const [bx, by, , b] = BASE[k];
          ctx.globalAlpha = sky.moonAlpha * (0.45 + 0.55 * b);
          ctx.beginPath(); ctx.arc(p[0] + R * (bx * nx[0] + by * ny[0]), p[1] + R * (bx * nx[1] + by * ny[1]), Math.max(0.4, 0.022 * R), 0, 2 * Math.PI); ctx.fill();
        }
      }
      ctx.globalAlpha = 1;
    }
  }
  ctx.restore();
}
