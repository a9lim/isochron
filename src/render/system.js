// Fig. 9 with people: the Solar System as the ending leaves it (docs/people.md, the endings). A plan
// view, the Sun at the centre and distance on a log scale (0.3 to 11 AU), each planet on its orbit
// at a fixed angle (where it is in its year isn't a quantity here). Every mark reads the model's:
//   the swarm   graphite points about the Sun, as many as its share of the Sun's output (by the
//               square root, to the whole Sun), the Sun's disc dimmed by it where Earth is sacrificed
//   the belt    an ochre stipple, thinning as it's mined
//   Mercury     its disc shrinking as it's taken apart (its mass's cube root), a hairline where it was
//   people      on Earth and each world they've settled (WORLDS), a patch of the residences' accent
//               blocks as wide as log₁₀ of their number; in habitats about the Sun, accent points
//               scattered about Earth's orbit, as many as log₁₀ of theirs
// Named, with their numbers, where people live. The probes' stars are the caption's.
import { WORLDS } from '../engine/worlds.js';
import { count } from './economy.js';

const FONT = "'Newsreader', 'STIX Two Text', serif";
const rgba = (hex, a) => { const h = hex.replace('#', ''); return `rgba(${parseInt(h.slice(0, 2), 16)}, ${parseInt(h.slice(2, 4), 16)}, ${parseInt(h.slice(4, 6), 16)}, ${a})`; };
const DEG = Math.PI / 180;
// The planets: distance (AU, standard), the angle each is drawn at, its dot's radius (px).
const PLANETS = { mercury: [0.387, 205, 2.6], venus: [0.723, 140, 3], earth: [1, 25, 3.4], mars: [1.524, 300, 2.8], jupiter: [5.203, 95, 5], saturn: [9.537, 235, 4.4] };
// Where each world sits about its planet (angle from the planet, outward offset in px).
const NEAR = { l45: [[-70, 13], [70, 13]], moon: [[0, 13]], callisto: [[-40, 16]], ganymede: [[20, 15]], europa: [[75, 13]], titan: [[0, 14]] };
const PLANET_OF = { earth: 'earth', jupiter: 'jupiter', saturn: 'saturn' };

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

/** Fig. 9's caption: the people off-world, the swarm's share of the Sun, what's left of Mercury and the belt, the stars reached. */
export function systemCaption(s) {
  if (!s) return 'The system';
  const pc = v => `${v < 0.095 ? (100 * v).toFixed(1) : Math.round(100 * v)}%`, parts = ['The system'];
  if (s.space >= 1e3) parts.push(`${count(s.space)} off-world`);
  if (s.share >= 1e-4) parts.push(`the swarm ${pc(s.share)} of the Sun`);
  if (s.merc > 0.005) parts.push(s.merc > 0.995 ? 'Mercury gone' : `Mercury ${pc(s.merc)} taken`);
  else if (s.belt > 0.005) parts.push(`the belt ${pc(s.belt)} mined`);
  if (s.stars && s.stars.n >= 1) parts.push(`${count(s.stars.n)} ${s.stars.n < 1.5 ? 'star' : 'stars'} reached`);
  return parts.join(' · ');
}

export function drawSystem(canvas, s, pal) {
  const { ctx, w, h } = setup(canvas);
  if (!s) return;
  const cx = w / 2, cy = h / 2, R0 = 13, R1 = Math.min(w, h) / 2 - 10;
  const rad = a => R0 + (R1 - R0) * Math.log(a / 0.3) / Math.log(11 / 0.3);
  const at = (a, deg) => [cx + rad(a) * Math.cos(deg * DEG), cy - rad(a) * Math.sin(deg * DEG)];
  const label = (text, x, y, color, align, size = 11, italic = false) => {
    ctx.font = `${italic ? 'italic ' : ''}${size}px ${FONT}`; ctx.fillStyle = color; ctx.textAlign = align; ctx.textBaseline = 'middle'; ctx.fillText(text, x, y);
  };
  // Orbits, and the scale's AU along the left.
  ctx.lineWidth = 1;
  for (const [, [a]] of Object.entries(PLANETS)) { ctx.strokeStyle = rgba(pal.text, 0.12); ctx.beginPath(); ctx.arc(cx, cy, rad(a), 0, 2 * Math.PI); ctx.stroke(); }
  for (const a of [1, 10]) label(`${a} AU`, cx, cy + rad(a) - 7, pal.muted, 'center', 9.5, true);
  // The belt: an ochre stipple as much of it as is left.
  ctx.fillStyle = pal.inks.ochre;
  const nB = Math.round(BELT.length * (1 - s.belt));
  for (let k = 0; k < nB; k++) { const [a, t] = BELT[k]; ctx.beginPath(); ctx.arc(cx + rad(a) * Math.cos(t), cy - rad(a) * Math.sin(t), 0.8, 0, 2 * Math.PI); ctx.fill(); }
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
  const named = [];
  // The planets: Mercury shrinking as it's taken (a hairline where it was), the rest as dots; people on Earth.
  for (const [k, [a, deg, r]] of Object.entries(PLANETS)) {
    const [x, y] = at(a, deg);
    let rr = r;
    if (k === 'mercury') {
      rr = r * Math.cbrt(Math.max(0, 1 - s.merc));
      ctx.strokeStyle = rgba(pal.text, 0.45); ctx.lineWidth = 0.6; ctx.beginPath(); ctx.arc(x, y, r, 0, 2 * Math.PI); ctx.stroke();
    }
    let pr = 0;
    if (k === 'earth') pr = patch(x, y, s.earth);
    if (rr > 0.2) { ctx.fillStyle = pal.muted; ctx.beginPath(); ctx.arc(x, y, rr, 0, 2 * Math.PI); ctx.fill(); }
    if (k === 'earth' && s.earth >= 1e3) named.push({ name: 'Earth', n: s.earth, x, y, r: Math.max(pr, rr), first: true });
  }
  // The worlds people live on: a patch at each, about its planet (or on its own orbit), named; Jupiter's
  // moons named together.
  const jove = WORLDS.filter(W => W.around === 'jupiter').reduce((a, W) => a + (s.worlds[W.k] || 0), 0);
  if (jove >= 1e3) { const [x, y] = at(PLANETS.jupiter[0], PLANETS.jupiter[1]); named.push({ name: "Jupiter's moons", n: jove, x, y, r: 16 }); }
  for (const W of WORLDS) {
    const n = s.worlds[W.k] || 0;
    if (!(n >= 1e3)) continue;
    const host = W.around ? PLANETS[PLANET_OF[W.around]] : null;
    const [a, deg] = host ? [host[0], host[1]] : [W.a, { mars: PLANETS.mars[1], ceres: 50 }[W.k] ?? 0];
    let [x, y] = at(a, deg);
    for (const [da, off] of NEAR[W.k] || []) {
      const t = (deg + da) * DEG;
      const px = x + off * Math.cos(t), py = y - off * Math.sin(t);
      const r = patch(px, py, n / (NEAR[W.k].length));
      ctx.fillStyle = pal.muted; ctx.beginPath(); ctx.arc(px, py, W.k === 'l45' ? 0.9 : 1.6, 0, 2 * Math.PI); ctx.fill();
      if (da === NEAR[W.k][0][0] && W.around !== 'jupiter') named.push({ name: W.name.replace(/^the /, ''), n, x: px, y: py, r });
    }
    if (!NEAR[W.k]) { const r = patch(x, y, n); if (W.k === 'ceres') { ctx.fillStyle = pal.muted; ctx.beginPath(); ctx.arc(x, y, 1.6, 0, 2 * Math.PI); ctx.fill(); } named.push({ name: W.name, n, x, y, r }); }
  }
  if ((s.worlds.habitats || 0) >= 1e3) named.push({ name: 'habitats', n: s.worlds.habitats, ...(() => { const [x, y] = at(1.55, 170); return { x, y }; })(), r: 2 });
  // Names and numbers, outward from the Sun, Earth's first and then the most people, each kept
  // clear of the ones before it.
  const taken = [];
  for (const q of named.sort((a, b) => (b.first ? 1 : 0) - (a.first ? 1 : 0) || b.n - a.n)) {
    const t = Math.atan2(cy - q.y, q.x - cx), ox = Math.cos(t), oy = -Math.sin(t);
    let x = q.x + ox * (q.r + 4), y = q.y + oy * (q.r + 4);
    const align = ox > 0.3 ? 'left' : ox < -0.3 ? 'right' : 'center';
    ctx.font = `11px ${FONT}`;
    const tw = Math.max(ctx.measureText(q.name).width, (ctx.font = `10px ${FONT}`, ctx.measureText(count(q.n)).width));
    if (oy > 0.3) y += 6; else if (oy < -0.3) y -= 12;
    else y -= 6;
    const x0 = align === 'left' ? x : align === 'right' ? x - tw : x - tw / 2, b = [x0 - 1, y - 6, x0 + tw + 1, y + 18];
    if (b[0] < 0 || b[2] > w || b[1] < 0 || b[3] > h || taken.some(o => b[0] < o[2] && b[2] > o[0] && b[1] < o[3] && b[3] > o[1])) continue;
    taken.push(b);
    ctx.fillStyle = rgba(pal.canvas, 0.85); ctx.fillRect(b[0], b[1], b[2] - b[0], b[3] - b[1]);
    label(q.name, x, y, pal.text, align, 11);
    label(count(q.n), x, y + 12, pal.muted, align, 10);
  }
}
