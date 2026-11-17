// The sky behind the globe: a star field fixed in space, and the Sun and the
// Moon where they are. Drawn as a star chart, in ink on the paper (the dark
// theme's paper is the night). Directions are in the planet's equatorial frame
// (z its spin axis); the planet turns under them by its sidereal angle θ, so
// the camera, which turns with the planet, sees the sky wheel about the pole.
//   stars   seeded positions and brightnesses; the pole is the spin axis
//   Sun     on the ecliptic at its longitude for the date, tilted by the
//           obliquity: its path through the year is the ecliptic; darker
//           toward its limb (limb darkening), with its spots (`spots`): groups
//           born at a rate that follows an 11-year cycle on the planet's clock,
//           at latitudes that fall from ~30° to ~8° through each cycle (Spörer's
//           law: the butterfly diagram), carried across the disc by the Sun's
//           differential rotation (~25 days at its equator, ~29 at 40°: standard,
//           from memory) about the ecliptic's pole, living days to weeks
//   Moon    on the ecliptic at its longitude (advancing at its mean motion,
//           which its distance sets), lit on the side facing the Sun; drawn
//           at its true size against the Sun's (×5 both, to be read), so a nearer Moon
//           looks larger; its face turned to the planet with its maria
//           (`moonFace`): today's Earth's Moon's near side (selenographic
//           positions and sizes, from memory), else flooded basins seeded with
//           the planet, gathered on the near side as the Moon's are
//   swarm   the people's collectors round the Sun (the People scenario's
//           industry off-world): graphite points on seeded orbits, as many as
//           the share of the Sun's output they take (to a tenth), the disc
//           dimmed by it
//   base    the people's city on the Moon, spreading from one site on its near
//           side (north up, by the planet's pole), in the globe's patterns for
//           its uses, interleaved: residences (the accent's blocks) as far as the
//           people off-world have grown (10³ to 10¹⁰, log), datacenters (the
//           verdigris's blocks) and factories (a sienna hatch) as far as
//           off-world compute's and the rest of off-world power have (log, from
//           10 GW and 100 GW to 10²⁰ and 10²¹ W)
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
// nearest first, each given one use (0 residences, 1 datacenters, 2 factories) in turn, so each use
// spreads outward from the site through the others.
const BASE = (() => {
  const r = stream('moon', 'base'), pts = [];
  for (let k = 0; k < 420; k++) {
    const rr = 0.62 * Math.sqrt(r.uniform()) * (0.75 + 0.25 * r.uniform()), a = 2 * Math.PI * r.uniform();
    const x = 0.28 + rr * Math.cos(a), y = -0.38 + 0.85 * rr * Math.sin(a);
    if (x * x + y * y < 0.88) pts.push([x, y, rr, 0.35 + 0.65 * r.uniform()]);
  }
  pts.sort((a, b) => a[2] - b[2]);
  const use = [[], [], []];
  pts.forEach((q, k) => use[k % 3].push(q));
  return use;
})();

/**
 * The Moon's face, north up and east to the right as the planet sees it (unit disc): maria
 * [x, y, rx, ry, turn] (orthographic, so a basin toward the limb is foreshortened) and bright
 * craters [x, y, r, rays]. Earth's Moon's near side, or basins seeded for another planet's.
 */
export function moonFace(seed, earth) {
  const at = (lat, lon) => [Math.cos(lat * Math.PI / 180) * Math.sin(lon * Math.PI / 180), Math.sin(lat * Math.PI / 180), Math.cos(lat * Math.PI / 180) * Math.cos(lon * Math.PI / 180)];
  // A basin of diameter d km at (lat, lon): its projected ellipse, foreshortened along its radius from the centre.
  const basin = (lat, lon, d, sx = 1) => {
    const [x, y, z] = at(lat, lon), r = d / 2 / 1737.4, rho = Math.hypot(x, y);
    return [x, y, r * (rho > 1e-6 ? Math.max(0.25, z) : 1) * sx, r, rho > 1e-6 ? Math.atan2(y, x) : 0];
  };
  if (earth) return {
    maria: [
      basin(33, -16, 1150), basin(28, 17.5, 700), basin(8.5, 31.4, 870), basin(17, 59, 560), basin(-7.8, 51.3, 840, 0.8),
      basin(-15.2, 35.5, 340), basin(-21.3, -16.6, 715), basin(-24.4, -38.6, 390), basin(13, 15.6, 240), basin(-11, -5, 300),
      // Oceanus Procellarum and Mare Frigoris, long, in pieces.
      basin(20, -57, 1100), basin(0, -50, 900), basin(35, -50, 800), basin(-8, -38, 600), basin(56, -15, 500, 2.6), basin(57, 18, 420, 2.2),
      basin(7, -31, 500),
    ],
    craters: [[...at(-43.3, -11.2).slice(0, 2), 0.045, 1], [...at(9.6, -20.1).slice(0, 2), 0.04, 1], [...at(23.7, -47.4).slice(0, 2), 0.035, 0], [...at(8.1, -38).slice(0, 2), 0.03, 0]],
  };
  const r = stream(seed, 'moon-face'), maria = [], craters = [];
  // Basins flooded on the near side (thin crust there), a few large and more small.
  const cLat = 20 * (r.uniform() - 0.5), cLon = 30 * (r.uniform() - 0.5), m = 6 + Math.floor(6 * r.uniform());
  for (let k = 0; k < m; k++) {
    const lat = cLat + 55 * r.normal() * 0.6, lon = cLon + 60 * r.normal() * 0.6, d = 250 + 900 * r.uniform() ** 2;
    if (Math.abs(lat) < 80 && Math.abs(lon) < 85) maria.push(basin(lat, lon, d, 0.8 + 0.5 * r.uniform()));
  }
  for (let k = 0; k < 3; k++) { const lat = 70 * (r.uniform() - 0.5), lon = 140 * (r.uniform() - 0.5); craters.push([...at(lat, lon).slice(0, 2), 0.03 + 0.02 * r.uniform(), k === 0 ? 1 : 0]); }
  return { maria, craters };
}

/** The Sun's activity in [0, 1] at `years` and the latitude (degrees) its new spots form at (Spörer's law). */
function solarCycle(years, phase0) {
  const P = 11, c = (years + phase0 * P) / P, k = Math.floor(c), u = c - k;
  const a = stream('sun', `cycle-${k}`).uniform();
  // Rising over ~4 years, falling over ~7; each cycle its own strength (0.5–1.3).
  const v = u < 0.36 ? 0.5 * u / 0.36 : 0.5 + 0.5 * (u - 0.36) / 0.64;
  return { act: Math.sin(Math.PI * v) ** 2 * (0.5 + 0.8 * a), lat: 30 - 22 * u };
}

/**
 * The spot groups on the Sun's near side at `years`: [x, y, r] in the disc (x toward its west limb,
 * y its north, r its radius's share), from the groups born each day of the last 40 at the cycle's
 * rate, each living 4–20 days, growing and fading.
 */
export function spots(years, phase0 = 0) {
  const day = years * 365.25, D = Math.floor(day), out = [];
  for (let d = D - 40; d <= D; d++) {
    const r = stream('sun', `day-${d}`), { act, lat } = solarCycle(d / 365.25, phase0);
    let g = 0;
    for (let lam = 2.4 * act, x = r.uniform(); x < 1 - Math.exp(-lam) && g < 6; x = r.uniform()) g++;   // a few a day at the cycle's height
    for (let k = 0; k < g; k++) {
      const life = 4 + 16 * r.uniform() ** 2, age = day - d - r.uniform();
      const la = (r.uniform() < 0.5 ? -1 : 1) * Math.max(3, lat + 6 * r.normal() * 0.5), lon0 = 360 * r.uniform(), n = 1 + Math.floor(3.5 * r.uniform()), size = 0.03 + 0.05 * r.uniform() ** 2;
      if (!(age >= 0 && age < life)) continue;
      const s = Math.sin(Math.PI * age / life) ** 0.6, sl = Math.sin(la * Math.PI / 180) ** 2;
      const lon = lon0 + (13.45 - 2.4 * sl - 1.8 * sl * sl) * age;   // synodic degrees a day (differential rotation)
      for (let j = 0; j < n; j++) {
        const L = (lon + (j - (n - 1) / 2) * 3) * Math.PI / 180, B = la * Math.PI / 180, z = Math.cos(B) * Math.cos(L);
        if (z <= 0.05) continue;
        out.push([Math.cos(B) * Math.sin(L), Math.sin(B), size * s * (j === 0 ? 1 : 0.6) * Math.sqrt(z)]);
      }
    }
  }
  return out;
}

const rgba = (hex, a) => { const h = hex.replace('#', ''); return `rgba(${parseInt(h.slice(0, 2), 16)}, ${parseInt(h.slice(2, 4), 16)}, ${parseInt(h.slice(4, 6), 16)}, ${a})`; };

/**
 * Draw the sky outside the globe's disc. `sky`: { stars, theta (rad), sun: dir | null,
 * sunAlpha, moon: dir | null, moonAlpha, moonDist (m), years (the planet's clock: the Sun's
 * spots), eps (the obliquity), solarPhase (the cycle's phase at year 0), face (`moonFace`) };
 * directions equatorial.
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
      const lg = ctx.createRadialGradient(p[0], p[1], 0, p[0], p[1], R);   // limb darkening
      lg.addColorStop(0, pal.inks.ochre); lg.addColorStop(0.7, rgba(pal.inks.ochre, 0.92)); lg.addColorStop(1, rgba(pal.inks.ochre, 0.62));
      ctx.fillStyle = lg;
      ctx.beginPath(); ctx.arc(p[0], p[1], R, 0, 2 * Math.PI); ctx.fill();
      // Its spots, about the ecliptic's pole (the Sun's axis is within 7° of it).
      if (sky.years !== undefined) {
        const e = sky.eps || 0, pole = [0, -Math.sin(e), Math.cos(e)], sn = sky.sun;
        const up = project(sn[0] + 0.02 * pole[0], sn[1] + 0.02 * pole[1], sn[2] + 0.02 * pole[2]);
        const ua = up ? Math.atan2(up[1] - p[1], up[0] - p[0]) : -Math.PI / 2, ny = [Math.cos(ua), Math.sin(ua)], nx = [-ny[1], ny[0]];
        ctx.fillStyle = pal.dark ? pal.canvas : rgba(ink, 0.8);
        for (const [x, y, rr] of spots(sky.years, sky.solarPhase || 0)) {
          ctx.beginPath(); ctx.arc(p[0] + R * (x * nx[0] + y * ny[0]), p[1] + R * (x * nx[1] + y * ny[1]), Math.max(0.55, rr * R), 0, 2 * Math.PI); ctx.fill();
        }
      }
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
      // Its face: maria darker than the highlands, lit or in earthshine, and the bright young craters
      // (Tycho's rays), turned with its north along the planet's pole on screen.
      const up = project(m[0], m[1], m[2] + 0.02), ua = up ? Math.atan2(up[1] - p[1], up[0] - p[0]) : -Math.PI / 2;
      const ny = [Math.cos(ua), Math.sin(ua)], nx = [-ny[1], ny[0]];
      const face = sky.face;
      if (face) {
        ctx.save();
        ctx.beginPath(); ctx.arc(p[0], p[1], R - 0.3, 0, 2 * Math.PI); ctx.clip();
        const toS = (x, y) => [p[0] + R * (x * nx[0] + y * ny[0]), p[1] + R * (x * nx[1] + y * ny[1])], rot = Math.atan2(nx[1], nx[0]);
        ctx.fillStyle = pal.dark ? rgba(pal.canvas, 0.3) : rgba(ink, 0.075);
        for (const [x, y, rx, ry, t] of face.maria) for (const k of [1, 0.7]) {   // soft-edged: two nested fills
          const [sx, sy] = toS(x, y);
          ctx.beginPath(); ctx.ellipse(sx, sy, Math.max(0.4, k * rx * R), Math.max(0.4, k * ry * R), rot - t, 0, 2 * Math.PI); ctx.fill();
        }
        ctx.fillStyle = pal.dark ? rgba(ink, 0.95) : pal.canvas; ctx.strokeStyle = pal.dark ? rgba(ink, 0.35) : rgba(pal.canvas, 0.7); ctx.lineWidth = 0.5;
        for (const [x, y, cr, rays] of face.craters) {
          const [sx, sy] = toS(x, y);
          if (rays) { ctx.beginPath(); for (let k = 0; k < 9; k++) { const a = 2 * Math.PI * k / 9 + 0.3; ctx.moveTo(sx, sy); ctx.lineTo(sx + 0.55 * R * Math.cos(a), sy + 0.55 * R * Math.sin(a)); } ctx.stroke(); }
          ctx.beginPath(); ctx.arc(sx, sy, Math.max(0.6, cr * R), 0, 2 * Math.PI); ctx.fill();
        }
        ctx.restore();
      }
      ctx.strokeStyle = rgba(ink, 0.55); ctx.lineWidth = 0.8;
      ctx.beginPath(); ctx.arc(p[0], p[1], R, 0, 2 * Math.PI); ctx.stroke();
      // The city: each use the union of discs about its sites, as many as its own quantity has grown
      // (north up, along the pole's direction on screen), washed and patterned as the globe draws it
      // (residences and datacenters as blocks, factories as a heavy hatch); clipped to the disc.
      const base = sky.moonbase || [0, 0, 0];
      if (base.some(v => v > 0)) {
        const inks = [pal.accent, pal.inks.verdigris, pal.inks.sienna], step = Math.max(1.3, 0.07 * R);
        for (let u = 0; u < 3; u++) {
          const nB = Math.round(BASE[u].length * Math.min(1, Math.max(0, base[u])) ** 1.3);
          if (!nB) continue;
          ctx.save();
          ctx.beginPath(); ctx.arc(p[0], p[1], R - 0.4, 0, 2 * Math.PI); ctx.clip();
          ctx.beginPath();
          for (let k = 0; k < nB; k++) {
            const [bx, by] = BASE[u][k], cx = p[0] + R * (bx * nx[0] + by * ny[0]), cy = p[1] + R * (bx * nx[1] + by * ny[1]);
            ctx.moveTo(cx + 0.075 * R, cy); ctx.arc(cx, cy, 0.075 * R, 0, 2 * Math.PI);
          }
          ctx.clip();
          ctx.globalAlpha = sky.moonAlpha;
          ctx.fillStyle = rgba(inks[u], 0.3); ctx.fillRect(p[0] - R, p[1] - R, 2 * R, 2 * R);
          ctx.strokeStyle = inks[u]; ctx.lineWidth = Math.max(0.5, (u === 2 ? 0.03 : 0.02) * R);
          ctx.beginPath();
          if (u < 2) {
            for (let t = -R; t <= R; t += step) {
              ctx.moveTo(p[0] + t * nx[0] - R * ny[0], p[1] + t * nx[1] - R * ny[1]); ctx.lineTo(p[0] + t * nx[0] + R * ny[0], p[1] + t * nx[1] + R * ny[1]);
              ctx.moveTo(p[0] + t * ny[0] - R * nx[0], p[1] + t * ny[1] - R * nx[1]); ctx.lineTo(p[0] + t * ny[0] + R * nx[0], p[1] + t * ny[1] + R * nx[1]);
            }
          } else {
            const d = [(nx[0] + ny[0]) / Math.SQRT2, (nx[1] + ny[1]) / Math.SQRT2], e = [-d[1], d[0]];
            for (let t = -1.5 * R; t <= 1.5 * R; t += 0.8 * step) { ctx.moveTo(p[0] + t * e[0] - 1.5 * R * d[0], p[1] + t * e[1] - 1.5 * R * d[1]); ctx.lineTo(p[0] + t * e[0] + 1.5 * R * d[0], p[1] + t * e[1] + 1.5 * R * d[1]); }
          }
          ctx.stroke();
          ctx.restore();
        }
      }
      ctx.globalAlpha = 1;
    }
  }
  ctx.restore();
}
