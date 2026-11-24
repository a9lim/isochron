// Fig. 11 with people: the planet's solar system as the ending leaves it (docs/MODEL.md;
// today's on the `earth` seed, else seeded: src/engine/solar.js). A plan view, the Sun at the centre and
// distance on a log scale (0.3 to 11 AU, or as far as the system reaches), each planet on its orbit at a
// fixed angle (where it is in its year isn't a quantity here). Every mark reads the model's:
//   the swarm   graphite points about the Sun, as many as its share of the Sun's output (by the
//               square root, to the whole Sun), the Sun's disc dimmed by it where Earth is sacrificed
//   the belt    an ochre stipple across its span, thinning as it's mined
//   the quarry  the inner planet (Mercury) the swarm takes apart: its disc shrinking (its mass's cube
//               root), a hairline where it was
//   people      on the home planet and each world they've settled (the system's worlds), a patch of
//               the residences' accent blocks as wide as log₁₀ of their number; in habitats about the
//               Sun, accent points scattered about the home orbit, as many as log₁₀ of theirs
// Their numbers where people live, named only in today's Solar System. The probes' stars, and the
// people at them, are the caption's.
import { OUR_SYSTEM, quarryName } from '../engine/solar.js';
import { count } from './economy.js';

const FONT = "'Newsreader', 'STIX Two Text', serif";
const rgba = (hex, a) => { const h = hex.replace('#', ''); return `rgba(${parseInt(h.slice(0, 2), 16)}, ${parseInt(h.slice(2, 4), 16)}, ${parseInt(h.slice(4, 6), 16)}, ${a})`; };
const DEG = Math.PI / 180;
// Where each of today's worlds sits about its planet (angle from the planet, outward offset in px); a
// seeded system's moons fan out about theirs.
const NEAR = { l45: [[-70, 13], [70, 13]], moon: [[0, 13]], callisto: [[-40, 16]], ganymede: [[20, 15]], europa: [[75, 13]], titan: [[0, 14]] };

// Seeded marks (a fixed stream, so they hold still): the swarm's points, the belt's, the habitats'.
function lcg(seed) { let x = seed >>> 0; return () => ((x = (1664525 * x + 1013904223) >>> 0) / 4294967296); }
const SWARM = (() => { const r = lcg(9), a = []; for (let k = 0; k < 900; k++) a.push([0.42 + 0.53 * r() ** 0.8, 2 * Math.PI * r()]); return a; })();
const BELT = (() => { const r = lcg(17), a = []; for (let k = 0; k < 320; k++) a.push([2.1 + 1.2 * r(), 2 * Math.PI * r()]); return a; })();
const HABS = (() => { const r = lcg(23), a = []; for (let k = 0; k < 400; k++) a.push([Math.exp(Math.log(0.6) + (Math.log(1.7) - Math.log(0.6)) * r()), 2 * Math.PI * r()]); return a; })();

function setup(canvas) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2), w = Math.max(1, canvas.clientWidth), h = Math.max(1, canvas.clientHeight);
  if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) { canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr); }
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, w, h);
  return { ctx, w, h };
}

/** The figure's quantities from the people's report `m` (people-worker.js): null before anything is off-world. */
export function systemOf(m) {
  if (!m || !m.off || !m.last) return null;
  const share = m.sun ? Math.min(1, (m.Es || 0) / m.sun) : 0, o = m.off;
  if (!(share >= 1e-6 || m.space >= 1e3)) return null;
  return { share, shade: m.ending && !m.ending.preserve ? share : 0, belt: o.belt || 0, merc: o.merc || 0, worlds: o.worlds || {}, earth: m.last.earth || 0, space: m.space || 0,
    stars: o.stars, aligned: !!(m.ending && m.ending.aligned), fert: o.fert || 0 };
}

/** Fig. 11's caption: the people off-world, the swarm's share of the Sun, what's left of the inner planet (Mercury) and the belt, the stars reached. */
export function systemCaption(s, sys = OUR_SYSTEM) {
  if (!s) return 'The system';
  const pc = v => `${v < 0.095 ? (100 * v).toFixed(1) : Math.round(100 * v)}%`, parts = ['The system'];
  if (s.space >= 1e3) parts.push(`${count(s.space)} off-planet`);
  if (s.share >= 1e-4) parts.push(`the swarm ${pc(s.share)} of the Sun`);
  if (s.merc > 0.005) parts.push(s.merc > 0.995 ? `${quarryName(sys)} gone` : `${quarryName(sys)} ${pc(s.merc)} taken`);
  else if (s.belt > 0.005) parts.push(`the belt ${pc(s.belt)} mined`);
  if (s.stars && s.stars.n >= 1) parts.push(`${count(s.stars.n)} ${s.stars.n < 1.5 ? 'star' : 'stars'} reached` + (s.stars.people >= 1e3 ? `, ${count(s.stars.people)} people there` : ''));
  return parts.join(' · ');
}

export function drawSystem(canvas, s, pal, sys = OUR_SYSTEM) {
  const { ctx, w, h } = setup(canvas);
  if (!s) return;
  const planets = sys.planets, byK = Object.fromEntries(planets.map(p => [p.k, p])), home = planets.find(p => p.home);
  const aIn = Math.min(0.3, 0.8 * planets[0].a), aOut = Math.max(11, 1.12 * Math.max(planets[planets.length - 1].a, sys.belt.a1));
  const cx = w / 2, cy = h / 2, R0 = 13, R1 = Math.min(w, h) / 2 - 10;
  const rad = a => R0 + (R1 - R0) * Math.log(a / aIn) / Math.log(aOut / aIn);
  const at = (a, deg) => [cx + rad(a) * Math.cos(deg * DEG), cy - rad(a) * Math.sin(deg * DEG)];
  const label = (text, x, y, color, align, size = 11, italic = false) => {
    ctx.font = `${italic ? 'italic ' : ''}${size}px ${FONT}`; ctx.fillStyle = color; ctx.textAlign = align; ctx.textBaseline = 'middle'; ctx.fillText(text, x, y);
  };
  // Orbits, and the scale's AU along the left.
  ctx.lineWidth = 1;
  for (const p of planets) { ctx.strokeStyle = rgba(pal.text, 0.12); ctx.beginPath(); ctx.arc(cx, cy, rad(p.a), 0, 2 * Math.PI); ctx.stroke(); }
  for (const a of [1, 10]) if (a < aOut) label(`${a} AU`, cx, cy + rad(a) - 7, pal.muted, 'center', 9.5, true);
  // The belt: an ochre stipple as much of it as is left.
  ctx.fillStyle = pal.inks.ochre;
  const nB = Math.round(BELT.length * (1 - s.belt));
  // (BELT's points span 2.1–3.3 AU, today's belt's: a seeded belt's span stretches them, in log.)
  const bl = a => Math.exp(Math.log(sys.belt.a0) + (Math.log(a) - Math.log(2.1)) / Math.log(3.3 / 2.1) * Math.log(sys.belt.a1 / sys.belt.a0));
  for (let k = 0; k < nB; k++) { const [a, t] = BELT[k], r = rad(bl(a)); ctx.beginPath(); ctx.arc(cx + r * Math.cos(t), cy - r * Math.sin(t), 0.8, 0, 2 * Math.PI); ctx.fill(); }
  // The Sun, dimmed where a sacrificing swarm shades it, and the swarm's collectors.
  ctx.fillStyle = rgba(pal.inks.ochre, 1 - 0.85 * s.shade); ctx.beginPath(); ctx.arc(cx, cy, 8, 0, 2 * Math.PI); ctx.fill();
  const nS = s.share > 1e-9 ? Math.min(SWARM.length, Math.round(SWARM.length * Math.sqrt(s.share))) : 0;
  ctx.fillStyle = rgba(pal.text, pal.dark ? 0.7 : 0.6);
  for (let k = 0; k < nS; k++) { const [a, t] = SWARM[k]; ctx.beginPath(); ctx.arc(cx + rad(a) * Math.cos(t), cy - rad(a) * Math.sin(t), 0.65, 0, 2 * Math.PI); ctx.fill(); }
  // The habitats about the Sun: accent points about Earth's orbit, as many as log₁₀ of their people.
  const lg = n => Math.max(0, Math.min(1, (Math.log10(Math.max(n, 1)) - 3) / 15));
  const nH = Math.round(HABS.length * lg(s.worlds.habitats || 0));
  ctx.fillStyle = pal.accent;
  for (let k = 0; k < nH; k++) { const [a, t] = HABS[k]; const x = cx + rad(a) * Math.cos(t), y = cy - rad(a) * Math.sin(t); ctx.fillRect(x - 0.9, y - 0.9, 1.8, 1.8); }
  // A patch of people: the residences' blocks (accent, a grid) in a disc as wide as log₁₀ of them.
  const patch = (x, y, n) => {
    if (!(n >= 1e3)) return 0;
    const r = 2.5 + 11 * lg(n);
    ctx.save(); ctx.beginPath(); ctx.arc(x, y, r, 0, 2 * Math.PI); ctx.clip();
    ctx.fillStyle = rgba(pal.accent, 0.22); ctx.fillRect(x - r, y - r, 2 * r, 2 * r);
    ctx.strokeStyle = pal.accent; ctx.lineWidth = 0.7; ctx.beginPath();
    for (let t = -r; t <= r; t += 2.4) { ctx.moveTo(x + t, y - r); ctx.lineTo(x + t, y + r); ctx.moveTo(x - r, y + t); ctx.lineTo(x + r, y + t); }
    ctx.stroke(); ctx.restore();
    return r;
  };
  const named = [], nm = text => sys.earth ? text : null;
  // The planets: the quarry shrinking as it's taken (a hairline where it was), the rest as dots; people at home.
  for (const p of planets) {
    const [x, y] = at(p.a, p.deg);
    let rr = p.r;
    if (p.k === sys.quarry.k) {
      rr = p.r * Math.cbrt(Math.max(0, 1 - s.merc));
      ctx.strokeStyle = rgba(pal.text, 0.45); ctx.lineWidth = 0.6; ctx.beginPath(); ctx.arc(x, y, p.r, 0, 2 * Math.PI); ctx.stroke();
    }
    let pr = 0;
    if (p.home) pr = patch(x, y, s.earth);
    if (rr > 0.2) { ctx.fillStyle = pal.muted; ctx.beginPath(); ctx.arc(x, y, rr, 0, 2 * Math.PI); ctx.fill(); }
    if (p.home && s.earth >= 1e3) named.push({ name: nm('Earth'), n: s.earth, x, y, r: Math.max(pr, rr), first: true });
  }
  // The worlds people live on: a patch at each, about its planet (or on its own orbit); a giant's moons
  // counted together (in today's system Jupiter's, named so).
  const hostOf = W => W.host === 'earth' || W.host === 'home' ? home : W.host ? byK[W.host] : null;
  const moons = new Map();
  for (const W of sys.worlds) { const H = hostOf(W); if (H && !H.home) moons.set(H.k, [...(moons.get(H.k) || []), W]); }
  for (const [hk, ws] of moons) {
    const tot = ws.reduce((a, W) => a + (s.worlds[W.k] || 0), 0), H = byK[hk];
    if (ws.length > 1 && tot >= 1e3) { const [x, y] = at(H.a, H.deg); named.push({ name: nm(`${H.name}'s moons`), n: tot, x, y, r: 16 }); }
  }
  for (const W of sys.worlds) {
    const n = s.worlds[W.k] || 0;
    if (!(n >= 1e3)) continue;
    const H = hostOf(W), deg = H ? H.deg : W.deg ?? (byK[W.k] ? byK[W.k].deg : 0);
    const [x, y] = at(H ? H.a : W.a, deg);
    let near = NEAR[W.k];
    if (!near && H) { const sib = moons.get(H.k) || [W], j = sib.indexOf(W); near = [[-50 + 100 * (sib.length > 1 ? j / (sib.length - 1) : 0.5), 14]]; }
    for (const [da, off] of near || []) {
      const t = (deg + da) * DEG;
      const px = x + off * Math.cos(t), py = y - off * Math.sin(t);
      const r = patch(px, py, n / near.length);
      ctx.fillStyle = pal.muted; ctx.beginPath(); ctx.arc(px, py, W.k === 'l45' ? 0.9 : 1.6, 0, 2 * Math.PI); ctx.fill();
      if (da === near[0][0] && !(H && !H.home && (moons.get(H.k) || []).length > 1)) named.push({ name: nm(W.name && W.name.replace(/^the /, '')), n, x: px, y: py, r });
    }
    if (!near) {
      const r = patch(x, y, n);
      if (!byK[W.k]) { ctx.fillStyle = pal.muted; ctx.beginPath(); ctx.arc(x, y, 1.6, 0, 2 * Math.PI); ctx.fill(); }
      named.push({ name: nm(W.name), n, x, y, r });
    }
  }
  if ((s.worlds.habitats || 0) >= 1e3) named.push({ name: nm('habitats'), n: s.worlds.habitats, ...(() => { const [x, y] = at(1.55, 170); return { x, y }; })(), r: 2 });
  // Names and numbers, outward from the Sun, Earth's first and then the most people, each kept
  // clear of the ones before it.
  const taken = [];
  for (const q of named.sort((a, b) => (b.first ? 1 : 0) - (a.first ? 1 : 0) || b.n - a.n)) {
    const t = Math.atan2(cy - q.y, q.x - cx), ox = Math.cos(t), oy = -Math.sin(t);
    let x = q.x + ox * (q.r + 4), y = q.y + oy * (q.r + 4);
    const align = ox > 0.3 ? 'left' : ox < -0.3 ? 'right' : 'center';
    ctx.font = `11px ${FONT}`;
    const tw = Math.max(q.name ? ctx.measureText(q.name).width : 0, (ctx.font = `10px ${FONT}`, ctx.measureText(count(q.n)).width));
    if (oy > 0.3) y += 6; else if (oy < -0.3) y -= 12;
    else y -= 6;
    if (!q.name) y -= 6;   // the number alone, where the name would have stood above it
    const x0 = align === 'left' ? x : align === 'right' ? x - tw : x - tw / 2, b = [x0 - 1, y - 6 + (q.name ? 0 : 12), x0 + tw + 1, y + 18];
    if (b[0] < 0 || b[2] > w || b[1] < 0 || b[3] > h || taken.some(o => b[0] < o[2] && b[2] > o[0] && b[1] < o[3] && b[3] > o[1])) continue;
    taken.push(b);
    ctx.fillStyle = rgba(pal.canvas, 0.85); ctx.fillRect(b[0], b[1], b[2] - b[0], b[3] - b[1]);
    if (q.name) label(q.name, x, y, pal.text, align, 11);
    label(count(q.n), x, y + 12, pal.muted, align, 10);
  }
}
