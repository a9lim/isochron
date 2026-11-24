// The key at the globe's corner: each view's symbols, drawn as the scene draws
// them, with their names (a glyph key: "Show, don't tell" keeps these on the
// surface). Only marks a reader needs named are keyed: the land's natural
// colours, lakes, rivers, snow, sea ice and the ice sheets, the highs' and
// lows' letters and the temperature chart's warm and cold speak for
// themselves, and the People view's veil is the Air map's to name. Where the
// globe shows its night side, each map's key adds the night and its lights. The
// climate's fourteen zones are keyed in full in the margin; here, their five
// groups.
import { zonePattern } from './figures.js';
import { streamWidth } from './streamlines.js';

const FONT = "'Newsreader', 'STIX Two Text', serif";
const rgba = (hex, a) => { const h = hex.replace('#', ''); return `rgba(${parseInt(h.slice(0, 2), 16)}, ${parseInt(h.slice(2, 4), 16)}, ${parseInt(h.slice(4, 6), 16)}, ${a})`; };
const mixHex = (a, b, t) => {
  const p = x => [1, 3, 5].map(k => parseInt(x.slice(k, k + 2), 16));
  const A = p(a), B = p(b);
  return `rgb(${A.map((v, i) => Math.round(v + (B[i] - v) * t)).join(', ')})`;
};

// Blocks: a grid in the colour darkened, over a light wash of it (residences).
function blocks(c, x, y, P, ink) {
  c.fillStyle = rgba(ink, 0.14); c.fillRect(x, y, 26, 12);
  c.strokeStyle = mixHex(ink, P.text, P.dark ? 0.3 : 0.35); c.globalAlpha = 0.75; c.lineWidth = 0.7;
  c.beginPath(); for (let a = 1.5; a < 26; a += 3.4) { c.moveTo(x + a, y); c.lineTo(x + a, y + 12); } for (let b = 1.5; b < 12; b += 3.4) { c.moveTo(x, y + b); c.lineTo(x + 26, y + b); } c.stroke();
  c.globalAlpha = 1;
}
// The peoples' hue wheel (src/render/globe.js, idWheel; Miasma's strain wheel): OKLCH at one lightness and
// chroma a theme, its zero opposite the accent, hurried through the accent with its chroma dipping there;
// t a state's tone, its lightness TONE_L a step away from the paper.
export const TONE_L = 0.08;
export function idHue(h, dark, t = 0) {
  const L = (dark ? 0.62 : 0.525) + (dark ? TONE_L : -TONE_L) * t, C0 = dark ? 0.10 : 0.08, ah = dark ? 0.3473 : 0.4346;
  const v = ((h / (2 * Math.PI) + 0.5) % 1 + 1) % 1, hh = ah + 2 * Math.PI * v + 0.35 * Math.sin(2 * Math.PI * v);
  const dh = Math.abs(Math.atan2(Math.sin(hh - ah), Math.cos(hh - ah))), C = C0 * (1 - 0.5 * Math.exp(-((dh / 0.5236) ** 2)));
  const a = C * Math.cos(hh), b = C * Math.sin(hh);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3, m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3, q = (L - 0.0894841775 * a - 1.2914855480 * b) ** 3;
  const lin = [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * q, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * q, -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * q];
  return '#' + lin.map(c => { const v2 = Math.min(1, Math.max(0, c)); return Math.round(255 * (v2 <= 0.0031308 ? 12.92 * v2 : 1.055 * Math.pow(v2, 1 / 2.4) - 0.055)).toString(16).padStart(2, '0'); }).join('');
}
// A patch of a people's mark: a wash of its hue and its hatch at its angle (ph shifts the lines a half period).
function idPatch(c, x, y, w, h, ink, ang, wash = true, ph = 0) {
  c.save(); c.beginPath(); c.rect(x, y, w, h); c.clip();
  if (wash) { c.fillStyle = rgba(ink, 0.22); c.fillRect(x, y, w, h); }
  c.strokeStyle = rgba(ink, 0.85); c.lineWidth = 0.9;
  const dx = Math.cos(ang), dy = Math.sin(ang);
  c.beginPath(); for (let t = -20 + ph * 4; t <= 20; t += 4) { const cx = x + w / 2 - dy * t, cy = y + h / 2 + dx * t; c.moveTo(cx - 24 * dx, cy - 24 * dy); c.lineTo(cx + 24 * dx, cy + 24 * dy); } c.stroke();
  c.restore();
}
// Parcels: each furrowed its own way, in the colour (fields: farms and solar farms).
function parcels(c, x, y, ink, wash, a) {
  const ps = [[x, y, 9, 6, 0.6], [x + 9, y, 9, 6, -0.5], [x + 18, y, 8, 6, 1.4], [x, y + 6, 12, 6, 0.1], [x + 12, y + 6, 14, 6, 2.2]];
  for (const [px, py, w, h, ang] of ps) {
    c.save(); c.beginPath(); c.rect(px, py, w, h); c.clip();
    c.fillStyle = rgba(ink, wash); c.fillRect(px, py, w, h);
    c.strokeStyle = rgba(ink, a); c.lineWidth = 0.75;
    const dx = Math.cos(ang), dy = Math.sin(ang);
    c.beginPath(); for (let t = -16; t <= 16; t += 3.6) { const cx = px + w / 2 - dy * t, cy = py + h / 2 + dx * t; c.moveTo(cx - 20 * dx, cy - 20 * dy); c.lineTo(cx + 20 * dx, cy + 20 * dy); } c.stroke();
    c.restore();
  }
}

// Each glyph draws in a 26 × 12 box at (x, y).
const GLYPHS = {
  ridge: (c, x, y, P) => { c.strokeStyle = P.accent; c.lineWidth = 1.5; line(c, x, y + 6, x + 26, y + 6); },
  trench: (c, x, y, P) => {
    c.strokeStyle = rgba(P.text, 0.85); c.lineWidth = 1.25; line(c, x, y + 8, x + 26, y + 8);
    c.fillStyle = rgba(P.text, 0.85);
    for (const t of [6, 19]) { c.beginPath(); c.moveTo(x + t - 3, y + 8); c.lineTo(x + t, y + 3); c.lineTo(x + t + 3, y + 8); c.fill(); }
  },
  collision: (c, x, y, P) => {
    c.strokeStyle = rgba(P.text, 0.85); c.lineWidth = 1.25; line(c, x, y + 8, x + 26, y + 8);
    c.fillStyle = P.canvas; c.lineWidth = 1;
    for (const t of [6, 19]) { c.beginPath(); c.moveTo(x + t - 3, y + 8); c.lineTo(x + t, y + 3); c.lineTo(x + t + 3, y + 8); c.closePath(); c.fill(); c.stroke(); }
  },
  transform: (c, x, y, P) => {
    c.strokeStyle = rgba(P.text, 0.5); c.lineWidth = 1; line(c, x, y + 6, x + 26, y + 6);
    c.strokeStyle = rgba(P.text, 0.7);
    c.beginPath(); c.moveTo(x + 8, y + 2.5); c.lineTo(x + 17, y + 2.5); c.lineTo(x + 14.5, y + 0.5); c.stroke();
    c.beginPath(); c.moveTo(x + 18, y + 9.5); c.lineTo(x + 9, y + 9.5); c.lineTo(x + 11.5, y + 11.5); c.stroke();
  },
  inactive: (c, x, y, P) => { c.strokeStyle = rgba(P.text, 0.45); c.lineWidth = 1; c.setLineDash([1, 3]); line(c, x, y + 6, x + 26, y + 6); c.setLineDash([]); },
  hotspot: (c, x, y, P) => { c.fillStyle = P.accent; c.strokeStyle = P.accent; c.lineWidth = 1; c.beginPath(); c.arc(x + 13, y + 6, 1.9, 0, 7); c.fill(); c.beginPath(); c.arc(x + 13, y + 6, 4.6, 0, 7); c.stroke(); },
  volcano: (c, x, y, P) => { c.fillStyle = P.accent; c.beginPath(); c.moveTo(x + 13, y + 1.5); c.lineTo(x + 18, y + 10); c.lineTo(x + 8, y + 10); c.closePath(); c.fill(); },
  // The sulfate veil: graphite hatching along the circles of latitude, as the Air chart's.
  veil: (c, x, y, P) => {
    c.strokeStyle = rgba(P.text, 0.5); c.lineWidth = 0.6;
    c.beginPath(); for (let r = 1.5; r < 12; r += 3) { c.moveTo(x, y + r); c.lineTo(x + 26, y + r); } c.stroke();
  },
  // A streamline: its weight the wind's speed, an arrowhead downwind.
  wind: (c, x, y, P) => {
    c.strokeStyle = rgba(P.text, 0.72); c.fillStyle = rgba(P.text, 0.72); c.lineCap = 'round';
    const pts = [[0, 9], [7, 6.6], [14, 5.2], [20, 4.8], [26, 5]];
    for (let k = 0; k < pts.length - 1; k++) { c.lineWidth = streamWidth(2 + 10 * k / (pts.length - 2)); line(c, x + pts[k][0], y + pts[k][1], x + pts[k + 1][0], y + pts[k + 1][1]); }
    const w = streamWidth(7), len = 2.6 + 2.2 * w, half = 1.1 + w, px = x + 14, py = y + 5.2, tx = 0.98, ty = -0.2;
    c.beginPath(); c.moveTo(px + 0.55 * len * tx, py + 0.55 * len * ty);
    c.lineTo(px - 0.45 * len * tx - half * ty, py - 0.45 * len * ty + half * tx);
    c.lineTo(px - 0.45 * len * tx + half * ty, py - 0.45 * len * ty - half * tx); c.closePath(); c.fill();
    c.lineCap = 'butt';
  },
  // Salt flats: a pale crust under short graphite strokes (the shader's `strokes`).
  salt: (c, x, y, P) => {
    const crust = P.dark ? mixHex(P.canvas, P.text, 0.3) : mixHex(P.canvas, P.inks.ochre, 0.05);
    c.fillStyle = crust; c.fillRect(x, y, 26, 12);
    c.strokeStyle = P.dark ? mixHex(P.canvas, P.text, 0.12) : mixHex(P.canvas, P.text, 0.55); c.lineWidth = 0.8;
    for (let b = 0; b < 3; b++) for (let a = 0; a < 4; a++) { const cx = x + 3.2 + a * 6.5 + (b % 2) * 3.25; line(c, cx - 1.45, y + 2 + b * 4, cx + 1.45, y + 2 + b * 4); }
    c.strokeStyle = rgba(P.text, 0.2); c.lineWidth = 1; c.strokeRect(x + 0.5, y + 0.5, 25, 11);
  },
  // Permafrost: a violet hatch on tesserae, each frozen or not (the shader's mosaic).
  permafrost: (c, x, y, P) => {
    c.save();
    c.beginPath(); c.moveTo(x, y); c.lineTo(x + 10, y); c.lineTo(x + 12, y + 7); c.lineTo(x + 9, y + 12); c.lineTo(x, y + 12); c.closePath();
    c.moveTo(x + 17, y); c.lineTo(x + 26, y); c.lineTo(x + 26, y + 12); c.lineTo(x + 15, y + 12); c.lineTo(x + 19, y + 6); c.closePath();
    c.clip();
    c.fillStyle = rgba(P.inks.violet, 0.07); c.fillRect(x, y, 26, 12);
    c.strokeStyle = rgba(P.inks.violet, 0.7); c.lineWidth = 0.8;
    c.beginPath(); for (let t = 1.5; t < 26; t += 3.2) { c.moveTo(x + t, y); c.lineTo(x + t, y + 12); } c.stroke();
    c.restore();
    c.strokeStyle = rgba(P.text, 0.2); c.lineWidth = 1; c.strokeRect(x + 0.5, y + 0.5, 25, 11);
  },
  // The tide's amplitude: the co-range wash from none to 3 m.
  amplitude: (c, x, y, P) => {
    for (let k = 0; k < 26; k++) { c.fillStyle = mixHex(P.canvas, P.ocean, 0.05 + 0.62 * Math.sqrt(k / 25)); c.fillRect(x + k, y, 1.05, 12); }
    c.strokeStyle = rgba(P.text, 0.2); c.lineWidth = 1; c.strokeRect(x + 0.5, y + 0.5, 25, 11);
  },
  // Dashes along the flow on the ice's fill, as the globe draws a stream.
  icestream: (c, x, y, P) => {
    c.fillStyle = P.dark ? mixHex(P.canvas, P.text, 0.2) : P.canvas; c.fillRect(x, y, 26, 12);
    c.strokeStyle = rgba(P.ocean, 0.6); c.lineWidth = 0.9;
    for (const [r, o] of [[3, 0], [6, 3], [9, 0]]) for (let t = o + 1; t < 25; t += 6) line(c, x + t, y + r, x + t + 4.2, y + r);
  },
  isotherm: (c, x, y, P) => { c.strokeStyle = rgba(P.text, 0.3); c.lineWidth = 1; line(c, x, y + 6, x + 26, y + 6); },
  // The Sea chart's isotherms, in its wash's ink: prussian where cold, sienna where warm.
  // A current: a streamline, as the wind's (the Sea chart's).
  current: (c, x, y, P) => GLYPHS.wind(c, x, y, P),
  // The water's vertical motion in indigo: upwelling a stipple, the overturning's sinking a hatch (the shader's).
  upwell: (c, x, y, P) => { c.fillStyle = rgba(P.inks.indigo, 0.8); for (let a = 0; a < 6; a++) for (let b = 0; b < 3; b++) { c.beginPath(); c.arc(x + 2.5 + a * 4.2 + (b % 2) * 2.1, y + 2 + b * 3.8, 0.85, 0, 7); c.fill(); } },
  sink: (c, x, y, P) => {
    c.save(); c.beginPath(); c.rect(x, y, 26, 12); c.clip();
    c.strokeStyle = rgba(P.inks.indigo, 0.8); c.lineWidth = 0.9;
    c.beginPath(); for (let t = -12; t < 30; t += 4.5) { c.moveTo(x + t, y + 12); c.lineTo(x + t + 12, y); } c.stroke();
    c.restore();
  },
  // Export production: short viridian strokes on a staggered lattice, as the shader's `dashes`.
  export: (c, x, y, P) => { c.strokeStyle = rgba(P.inks.viridian, 0.75); c.lineWidth = 0.9; c.lineCap = 'round'; for (let b = 0; b < 3; b++) for (let a = 0; a < 4; a++) { const cx = x + 3.5 + a * 6.4 + (b % 2) * 3.2; line(c, cx - 1.5, y + 2 + b * 4, cx + 1.5, y + 2 + b * 4); } c.lineCap = 'butt'; },
  // People: the accent by log density, the farms' densities over the first two thirds and the cities' step after.
  folk: (c, x, y, P) => {
    const ss = (a, b, v) => { const t = Math.min(1, Math.max(0, (v - a) / (b - a))); return t * t * (3 - 2 * t); };
    for (let a = 0; a < 26; a++) {
      const v = -3 + 6.8 * a / 25;   // log₁₀ people per km²
      c.fillStyle = P.accent; c.globalAlpha = ss(-3.2, -2.5, v) * (P.dark ? 0.05 + 0.16 * ss(-2.5, 2.5, v) : 0.08 + 0.22 * ss(-2.5, 2.5, v)) + ss(2.3, 3.6, v) * (P.dark ? 0.55 : 0.42);
      c.fillRect(x + a, y, 1, 12);
    }
    c.globalAlpha = 1;
    c.strokeStyle = rgba(P.text, 0.25); c.lineWidth = 1; c.strokeRect(x + 0.5, y + 0.5, 25, 11);
  },
  // Robots at work: verdigris by log density (~1 to ~3,000 worker-equivalents a km²).
  robot: (c, x, y, P) => {
    for (let a = 0; a < 26; a++) { const t = a / 25; c.fillStyle = P.inks.verdigris; c.globalAlpha = (P.dark ? 0.6 : 0.55) * t * t * (3 - 2 * t); c.fillRect(x + a, y, 1, 12); }
    c.globalAlpha = 1;
    c.strokeStyle = rgba(P.text, 0.25); c.lineWidth = 1; c.strokeRect(x + 0.5, y + 0.5, 25, 11);
  },
  // The land's uses, as the shader draws them on the tesserae: blocks for residences (people's cities
  // in the accent, AI's datacenters in the robots' verdigris), parcels for fields (farms in sap, solar
  // farms in verdigris, pasture in ochre, the fishers' in the sea's blue), factories a heavy hatch.
  city: (c, x, y, P) => blocks(c, x, y, P, P.accent),
  datacenter: (c, x, y, P) => blocks(c, x, y, P, P.inks.verdigris),
  factory: (c, x, y, P) => {
    c.save(); c.beginPath(); c.rect(x, y, 26, 12); c.clip();
    c.fillStyle = rgba(P.inks.sienna, 0.18); c.fillRect(x, y, 26, 12);
    c.strokeStyle = rgba(P.inks.sienna, 0.85); c.lineWidth = 1;
    c.beginPath(); for (let t = -12; t < 26; t += 2.8) { c.moveTo(x + t, y + 12); c.lineTo(x + t + 12, y); } c.stroke();
    c.restore();
  },
  solar: (c, x, y, P) => parcels(c, x, y, P.inks.verdigris, 0.12, 0.7),
  // Land no one has lived on yet (the Settlement map): grey, against the explored land's colours.
  unknown: (c, x, y, P) => {
    c.fillStyle = mixHex(P.canvas, P.text, P.dark ? 0.12 : 0.13); c.fillRect(x, y, 26, 12);
    c.strokeStyle = rgba(P.text, 0.25); c.lineWidth = 1; c.strokeRect(x + 0.5, y + 0.5, 25, 11);
  },
  // Farms: parcels, each furrowed its own way, in sap.
  farm: (c, x, y, P) => parcels(c, x, y, P.inks.sap, 0.1, 0.65),
  // Pasture: parcels as the farms', in ochre.
  pasture: (c, x, y, P) => parcels(c, x, y, P.inks.ochre, 0.1, 0.65),
  // The fishers' parcels, as the farms', in the sea's blue.
  fishing: (c, x, y, P) => parcels(c, x, y, P.ocean, 0.1, 0.65),
  // Peoples (src/render/globe.js, the Culture map): each its hue and its hatch's angle, three apart.
  peoples: (c, x, y, P) => { [[0.3, 0.4], [2.4, 1.6], [4.4, 2.7]].forEach(([h, a], k) => idPatch(c, x + 9 * k, y, k < 2 ? 9 : 8, 12, idHue(h, P.dark), a)); },
  // States (the States map): each a wash of its hue, set apart from its neighbours'.
  states: (c, x, y, P) => { [[0.4, 1], [3.5, -1], [2.0, 0]].forEach(([h, t], k) => { c.fillStyle = rgba(idHue(h, P.dark, t), 0.45 * (1 + 0.3 * t)); c.fillRect(x + 9 * k, y, k < 2 ? 9 : 8, 12); }); },
  // A contested place: equal stripes of its two states' hues.
  contested: (c, x, y, P) => {
    c.save(); c.beginPath(); c.rect(x, y, 26, 12); c.clip();
    c.fillStyle = rgba(idHue(0.4, P.dark), 0.45); c.fillRect(x, y, 26, 12);
    c.strokeStyle = rgba(idHue(3.5, P.dark), 0.9); c.lineWidth = 4 / Math.SQRT2;
    c.beginPath(); for (let t = -12; t <= 38; t += 8) { c.moveTo(x + t, y + 12); c.lineTo(x + t + 12, y); } c.stroke();
    c.restore();
  },
  // A capital: a star in the rules' colour.
  capital: (c, x, y, P) => {
    c.fillStyle = rgba(P.text, 0.85); c.beginPath();
    for (let p = 0; p < 10; p++) { const a = -Math.PI / 2 + p * Math.PI / 5, r = p % 2 ? 1.8 : 4.5; c.lineTo(x + 13 + r * Math.cos(a), y + 6.5 + r * Math.sin(a)); }
    c.closePath(); c.fill();
  },
  // Two ways of life in one place: the second's hatch between the first's lines.
  mixed: (c, x, y, P) => { idPatch(c, x, y, 26, 12, idHue(0.3, P.dark), 0.4); idPatch(c, x, y, 26, 12, idHue(2.4, P.dark), 1.6, false, 0.5); },
  // Knowledge's domains: production in the accent and learning in verdigris, each by how near the
  // frontier's a place's is, far behind (left) to at the frontier (right).
  production: (c, x, y, P) => lag(c, x, y, P, P.accent),
  learning: (c, x, y, P) => lag(c, x, y, P, P.inks.verdigris),
  // The eras (the shader's lines where a place's knowledge crosses each threshold), in each domain's ink.
  era: (c, x, y, P) => { c.strokeStyle = mixHex(P.canvas, P.accent, 0.8); c.lineWidth = 2.2; line(c, x, y + 6, x + 26, y + 6); },
  eraL: (c, x, y, P) => { c.strokeStyle = mixHex(P.canvas, P.inks.verdigris, 0.8); c.lineWidth = 2.2; line(c, x, y + 6, x + 26, y + 6); },
  // Works: dots on a staggered lattice in the rules' colour, as the shader's `stipple`.
  works: (c, x, y, P) => { c.fillStyle = rgba(P.text, 0.6); for (let b = 0; b < 3; b++) for (let a = 0; a < 5; a++) { c.beginPath(); c.arc(x + 2.6 + a * 5.2 + (b % 2) * 2.6, y + 2 + b * 4, 0.8, 0, 7); c.fill(); } },
  // The routes (src/render/overlay.js, drawRoutes): by land, river and sea alike, in the rules' colour.
  route: (c, x, y, P) => { c.strokeStyle = rgba(P.text, 0.6); c.lineWidth = 1.5; line(c, x, y + 6, x + 26, y + 6); },
  // Night: the night side's three steps, the Sun 0°, 6° and 12° below the horizon (the shader's NIGHT_K).
  night: (c, x, y, P) => {
    for (let k = 0; k < 3; k++) { c.fillStyle = nightGround(P, (k + 1) / 3); c.fillRect(x + k * 26 / 3, y, 26 / 3 + 0.3, 12); }
    c.strokeStyle = rgba(P.text, 0.25); c.lineWidth = 1; c.strokeRect(x + 0.5, y + 0.5, 25, 11);
  },
  // Lights: on the night, a tint from a farmland's dim yellow to a city's, turning white where robots make it (the shader's LIGHT_FOLK, LIGHT_BOTS).
  light: (c, x, y, P) => {
    c.fillStyle = nightGround(P, 1); c.fillRect(x, y, 26, 12);
    const g = c.createLinearGradient(x, 0, x + 26, 0), Y = 'rgba(242, 201, 84, ', W = 'rgba(255, 252, 245, ';
    g.addColorStop(0, Y + '0)'); g.addColorStop(0.55, Y + '0.9)'); g.addColorStop(1, W + '0.9)');
    c.fillStyle = g; c.fillRect(x, y, 26, 12);
    c.strokeStyle = rgba(P.text, 0.25); c.lineWidth = 1; c.strokeRect(x + 0.5, y + 0.5, 25, 11);
  },

  // Dust: ochre dots on a staggered lattice, as the shader's `stipple`.
  dust: (c, x, y, P) => { c.fillStyle = rgba(P.inks.ochre, 0.8); for (let b = 0; b < 3; b++) for (let a = 0; a < 5; a++) { c.beginPath(); c.arc(x + 2.6 + a * 5.2 + (b % 2) * 2.6, y + 2 + b * 4, 0.8, 0, 7); c.fill(); } },
  cold: (c, x, y, P) => front(c, x, y, P.inks.prussian, 'tri'),
  warm: (c, x, y, P) => front(c, x, y, P.inks.sienna, 'semi'),
  stationary: (c, x, y, P) => {
    c.lineWidth = 1.6; c.strokeStyle = P.inks.prussian; line(c, x, y + 7, x + 13, y + 7); c.strokeStyle = P.inks.sienna; line(c, x + 13, y + 7, x + 26, y + 7);
    c.fillStyle = P.inks.prussian; c.beginPath(); c.moveTo(x + 3, y + 7); c.lineTo(x + 6.5, y + 1.5); c.lineTo(x + 10, y + 7); c.fill();
    c.fillStyle = P.inks.sienna; c.beginPath(); c.arc(x + 19.5, y + 7, 3.6, 0, Math.PI); c.fill();
  },
  occluded: (c, x, y, P) => {
    c.strokeStyle = P.inks.mulberry; c.fillStyle = P.inks.mulberry; c.lineWidth = 1.6; line(c, x, y + 8, x + 26, y + 8);
    c.beginPath(); c.moveTo(x + 3, y + 8); c.lineTo(x + 6.5, y + 2); c.lineTo(x + 10, y + 8); c.fill();
    c.beginPath(); c.arc(x + 19, y + 8, 3.6, Math.PI, 2 * Math.PI); c.fill();
  },
  trough: (c, x, y, P) => { c.strokeStyle = P.inks.umber; c.lineWidth = 1.4; c.setLineDash([7, 4]); line(c, x, y + 6, x + 26, y + 6); c.setLineDash([]); },
  shear: (c, x, y, P) => { c.strokeStyle = P.inks.prussian; c.lineWidth = 1.2; c.setLineDash([8, 3, 1.5, 3]); line(c, x, y + 6, x + 26, y + 6); c.setLineDash([]); },
  pridge: (c, x, y, P) => { c.strokeStyle = P.inks.umber; c.lineWidth = 1.2; c.beginPath(); c.moveTo(x, y + 6); for (let k = 1; k <= 5; k++) c.lineTo(x + k * 5.2, y + 6 + (k % 2 ? -2.6 : 2.6)); c.stroke(); },
  iso0: (c, x, y, P) => { c.strokeStyle = rgba(P.text, 0.7); c.lineWidth = 1.3; line(c, x, y + 6, x + 26, y + 6); },
  isohume: (c, x, y, P) => { c.strokeStyle = rgba(P.text, 0.32); c.lineWidth = 1; c.beginPath(); c.moveTo(x, y + 8); c.bezierCurveTo(x + 8, y, x + 18, y + 12, x + 26, y + 4); c.stroke(); },
  dry: (c, x, y, P) => {
    c.strokeStyle = P.inks.ochre; c.lineWidth = 1.3; line(c, x, y + 5, x + 26, y + 5);
    for (const t of [7, 19]) { c.beginPath(); c.arc(x + t, y + 5, 3.4, 0, Math.PI); c.stroke(); }
  },
  isobar: (c, x, y, P) => { c.strokeStyle = rgba(P.text, 0.45); c.lineWidth = 1; c.beginPath(); c.moveTo(x, y + 9); c.quadraticCurveTo(x + 13, y - 1, x + 26, y + 9); c.stroke(); },
  rain: (c, x, y, P) => { c.fillStyle = rgba(P.ocean, 0.85); for (let a = 0; a < 6; a++) for (let b = 0; b < 3; b++) { c.beginPath(); c.arc(x + 2.5 + a * 4.2 + (b % 2) * 2.1, y + 2 + b * 3.8, 0.85, 0, 7); c.fill(); } },
  // The Tides view: lines every lunar hour converging on an amphidrome, the high water, the energy lost.
  cotidal: (c, x, y, P) => { c.strokeStyle = rgba(P.text, 0.3); c.lineWidth = 1; for (const a of [-0.5, 0, 0.5, 1.0, 1.5, 2.0]) { c.beginPath(); c.moveTo(x + 13, y + 6); c.lineTo(x + 13 + 14 * Math.cos(a * Math.PI / 3 * 2), y + 6 + 7 * Math.sin(a * Math.PI / 3 * 2)); c.stroke(); } },
  amphidrome: (c, x, y, P) => { c.fillStyle = P.canvas; c.fillRect(x, y, 26, 12); c.strokeStyle = rgba(P.text, 0.3); c.lineWidth = 1; for (let k = 0; k < 12; k++) { const a = k * Math.PI / 6; c.beginPath(); c.moveTo(x + 13 + 2 * Math.cos(a), y + 6 + 2 * Math.sin(a)); c.lineTo(x + 13 + 6 * Math.cos(a), y + 6 + 6 * Math.sin(a)); c.stroke(); } },
  highwater: (c, x, y, P) => { c.strokeStyle = rgba(P.text, 0.85); c.lineWidth = 1.3; c.beginPath(); c.moveTo(x, y + 9); c.quadraticCurveTo(x + 13, y + 1, x + 26, y + 5); c.stroke(); },
  dissipation: (c, x, y, P) => { c.fillStyle = rgba(P.inks.sienna, 0.8); for (let a = 0; a < 6; a++) for (let b = 0; b < 3; b++) { c.beginPath(); c.arc(x + 2.5 + a * 4.2 + (b % 2) * 2.1, y + 2 + b * 3.8, 0.8, 0, 7); c.fill(); } },
};

function line(c, x0, y0, x1, y1) { c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1); c.stroke(); }
function front(c, x, y, ink, kind) {
  c.strokeStyle = ink; c.fillStyle = ink; c.lineWidth = 1.6; line(c, x, y + 8, x + 26, y + 8);
  for (const t of [7, 19]) {
    c.beginPath();
    if (kind === 'tri') { c.moveTo(x + t - 3.5, y + 8); c.lineTo(x + t, y + 2); c.lineTo(x + t + 3.5, y + 8); }
    else c.arc(x + t, y + 8, 3.6, Math.PI, 2 * Math.PI);
    c.fill();
  }
}

/** The night's ground as the globe darkens a chart's (src/render/globe.js, NIGHT_K): `k` of the way. */
function nightGround(P, k) {
  const p = x => [1, 3, 5].map(j => parseInt(x.slice(j, j + 2), 16)), C = p(P.canvas), L = p(P.land), N = P.dark ? [0, 0, 0] : p(P.text), t = (P.dark ? 0.55 : 0.24) * k;
  return `rgb(${C.map((v, i) => Math.round((v + (L[i] - v) * 0.16) * (1 - t) + N[i] * t)).join(', ')})`;
}

/** A domain of knowledge's wash, far behind its frontier (left) to at it (right), as the Knowledge map's e^{−2 × the lag}. */
function lag(c, x, y, P, ink) {
  for (let a = 0; a < 26; a++) { c.fillStyle = ink; c.globalAlpha = (P.dark ? 0.45 : 0.4) * Math.exp(-4 * (1 - a / 25)); c.fillRect(x + a, y, 1, 12); }
  c.globalAlpha = 1;
  c.strokeStyle = rgba(P.text, 0.25); c.lineWidth = 1; c.strokeRect(x + 0.5, y + 0.5, 25, 11);
}

/** A wash between the paper and an ink, as the charts tint. */
function wash(c, x, y, P, ink, a) {
  c.fillStyle = mixHex(P.canvas, ink, a); c.fillRect(x, y, 26, 12);
  c.strokeStyle = rgba(P.text, 0.2); c.lineWidth = 1; c.strokeRect(x + 0.5, y + 0.5, 25, 11);
}

const FRONTS = [['cold', 'Cold front'], ['warm', 'Warm front'], ['stationary', 'Stationary'], ['occluded', 'Occluded']];
const ITEMS = {
  relief: [['ridge', 'Ridge'], ['trench', 'Trench'], ['collision', 'Collision'], ['transform', 'Transform'], ['inactive', 'Inactive'], ['hotspot', 'Hotspot'],
    ['volcano', 'Eruption'], ['salt', 'Salt flat'], ['permafrost', 'Permafrost'], ['icestream', 'Ice stream']],
  'climate-zones': [['z:0', 'Tropical'], ['z:4', 'Arid'], ['z:6', 'Temperate'], ['z:9', 'Continental'], ['z:12', 'Polar'], ['export', 'Export production'], ['volcano', 'Eruption']],
  'climate-air': [['wind', 'Wind'], ['dust', 'Dust'], ['veil', 'Sulfate veil'], ['volcano', 'Eruption']],
  'climate-sea': [['current', 'Current'], ['upwell', 'Upwelling'], ['sink', 'Sinking'], ['volcano', 'Eruption']],
  'weather-pressure': [...FRONTS, ['trough', 'Trough'], ['pridge', 'Ridge'], ['shear', 'Shear line'], ['dry', 'Dry line'], ['isobar', 'Isobar, 4 hPa'], ['rain', 'Rain']],
  'weather-temperature': [...FRONTS, ['isotherm', 'Isotherm, 5 °C'], ['iso0', '0 °C']],
  'weather-humidity': [['h:dry', 'Dry air'], ['h:moist', 'Moist air'], ['dry', 'Dry line'], ['isohume', 'Humidity, 20%'], ['rain', 'Rain']],
  'people-settlement': [['unknown', 'Unexplored'], ['city', 'Cities'], ['datacenter', 'Datacenters'], ['factory', 'Factories'], ['farm', 'Farms'], ['pasture', 'Pasture'], ['fishing', 'Fishing'], ['solar', 'Solar farms']],
  'people-density': [['folk', 'People'], ['robot', 'Robots'], ['city', 'Cities'], ['datacenter', 'Datacenters'], ['factory', 'Factories'], ['farm', 'Farms'], ['pasture', 'Pasture'], ['fishing', 'Fishing'], ['solar', 'Solar farms']],
  'people-knowledge': [['production', 'Production'], ['learning', 'Learning'], ['era', 'Farming, industry'], ['eraL', 'AI'], ['works', 'Works'], ['city', 'Cities'], ['datacenter', 'Datacenters'], ['factory', 'Factories'], ['route', 'Routes']],
  'people-culture': [['peoples', 'Peoples'], ['mixed', 'Two ways of life'], ['city', 'Cities'], ['datacenter', 'Datacenters'], ['factory', 'Factories']],
  'people-states': [['states', 'States'], ['contested', 'Contested'], ['capital', 'Capital'], ['city', 'Cities'], ['datacenter', 'Datacenters'], ['factory', 'Factories']],
  tides: [['amplitude', 'Tide, 0–3 m'], ['cotidal', 'Co-tidal, hourly'], ['amphidrome', 'Amphidrome'], ['highwater', 'High water'], ['dissipation', 'Energy lost']],
};

/** Two columns, each as wide as its longest name (measured, so nothing is clipped); `extra` items after the view's (the night's). */
export function drawKey(canvas, view, P, extra = []) {
  const items = [...(ITEMS[view] || ITEMS.relief), ...extra];
  const cols = items.length > 4 ? 2 : 1, rows = Math.ceil(items.length / cols), rowH = 18, SW = 32, GAP = 16;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const c = canvas.getContext('2d');
  c.font = `12px ${FONT}`;
  const colW = Array.from({ length: cols }, (_, j) => {
    let m = 0;
    for (let k = j * rows; k < Math.min(items.length, (j + 1) * rows); k++) m = Math.max(m, c.measureText(items[k][1]).width);
    return SW + Math.ceil(m) + (j < cols - 1 ? GAP : 2);
  });
  const w = colW.reduce((a, b) => a + b, 0), h = rows * rowH + 2;
  canvas.style.width = `${w}px`; canvas.style.height = `${h}px`;
  canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
  c.clearRect(0, 0, w, h);
  // Column by column, so a column's names line up and its width is its own.
  items.forEach(([g, name], k) => {
    const j = Math.floor(k / rows), x = colW.slice(0, j).reduce((a, b) => a + b, 0), y = (k % rows) * rowH + 2;
    if (g.startsWith('h:')) wash(c, x, y, P, g === 'h:moist' ? P.inks.verdigris : P.inks.ochre, 0.3);
    else if (g.startsWith('z:')) zonePattern(c, +g.slice(2), x, y, 26, 12, P);
    else GLYPHS[g](c, x, y, P);
    c.font = `12px ${FONT}`; c.fillStyle = P.text; c.textAlign = 'left'; c.textBaseline = 'middle';
    c.fillText(name, x + SW, y + 6.5);
  });
}
