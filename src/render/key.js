// The key at the globe's corner: each view's symbols, drawn as the scene draws
// them, with their names (a glyph key: "Show, don't tell" keeps these on the
// surface). The Climate view's fourteen classes are keyed in full in the margin;
// here, their five groups.
import { zonePattern } from './figures.js';

const FONT = "'Newsreader', 'STIX Two Text', serif";
const rgba = (hex, a) => { const h = hex.replace('#', ''); return `rgba(${parseInt(h.slice(0, 2), 16)}, ${parseInt(h.slice(2, 4), 16)}, ${parseInt(h.slice(4, 6), 16)}, ${a})`; };
const mixHex = (a, b, t) => {
  const p = x => [1, 3, 5].map(k => parseInt(x.slice(k, k + 2), 16));
  const A = p(a), B = p(b);
  return `rgb(${A.map((v, i) => Math.round(v + (B[i] - v) * t)).join(', ')})`;
};

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
  veil: (c, x, y, P) => {
    c.fillStyle = rgba(P.text, 0.55);
    for (let r = 0; r < 3; r++) for (let k = 0; k < 6; k++) { c.beginPath(); c.arc(x + 2.5 + 4.2 * k + (r % 2 ? 2.1 : 0), y + 2.5 + 3.6 * r, 0.65, 0, 7); c.fill(); }
  },
  river: (c, x, y, P) => { c.strokeStyle = rgba(P.ocean, 0.9); c.lineWidth = 1.6; c.beginPath(); c.moveTo(x, y + 9); c.quadraticCurveTo(x + 10, y + 1, x + 26, y + 5); c.stroke(); },
  seaice: (c, x, y, P) => { c.fillStyle = P.dark ? mixHex(P.canvas, P.text, 0.16) : mixHex(P.canvas, P.ocean, 0.05); c.fillRect(x, y, 26, 12); c.strokeStyle = rgba(P.ocean, 0.7); c.lineWidth = 1; c.strokeRect(x + 0.5, y + 0.5, 25, 11); },
  icesheet: (c, x, y, P) => {
    c.fillStyle = P.dark ? mixHex(P.canvas, P.text, 0.2) : P.canvas; c.fillRect(x, y, 26, 12);
    c.strokeStyle = rgba(P.ocean, 0.4); c.lineWidth = 0.8; c.beginPath(); c.ellipse(x + 13, y + 6, 7, 3.2, 0, 0, 7); c.stroke();
    c.strokeStyle = rgba(P.text, 0.6); c.lineWidth = 1; c.strokeRect(x + 0.5, y + 0.5, 25, 11);
  },
  isotherm: (c, x, y, P) => { c.strokeStyle = rgba(P.text, 0.3); c.lineWidth = 1; line(c, x, y + 6, x + 26, y + 6); },
  current: (c, x, y, P) => { c.strokeStyle = rgba(P.ocean, 0.8); c.lineWidth = 1; c.beginPath(); c.ellipse(x + 13, y + 6, 11, 4.5, 0, 0, 7); c.stroke(); },
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
  hl: (c, x, y, P) => { c.font = `600 13px ${FONT}`; c.fillStyle = P.text; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('H', x + 7, y + 6.5); c.fillText('L', x + 19, y + 6.5); },
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

/** The vegetation swatches the Relief view blends (as its shader's biome colours). */
function wash(c, x, y, P, ink, a) {
  c.fillStyle = mixHex(P.canvas, ink, a); c.fillRect(x, y, 26, 12);
  c.strokeStyle = rgba(P.text, 0.2); c.lineWidth = 1; c.strokeRect(x + 0.5, y + 0.5, 25, 11);
}
function vegetation(c, x, y, P, kind) {
  const ink = { forest: [P.inks.viridian, 0.42], grass: [P.inks.sap, 0.34], desert: [P.inks.ochre, 0.17], boreal: [P.inks.verdigris, 0.34], tundra: [P.inks.indigo, 0.17] }[kind];
  c.fillStyle = mixHex(P.canvas, ink[0], ink[1]); c.fillRect(x, y, 26, 12);
  c.strokeStyle = rgba(P.text, 0.2); c.lineWidth = 1; c.strokeRect(x + 0.5, y + 0.5, 25, 11);
}

const ITEMS = {
  relief: [['ridge', 'Ridge'], ['trench', 'Trench'], ['collision', 'Collision'], ['transform', 'Transform'], ['inactive', 'Inactive'], ['hotspot', 'Hotspot'], ['volcano', 'Eruption'], ['veil', 'Sulfate veil'], ['river', 'River'],
    ['seaice', 'Sea ice'], ['icesheet', 'Ice sheet'], ['v:forest', 'Forest'], ['v:grass', 'Grass, savanna'], ['v:desert', 'Desert'], ['v:boreal', 'Boreal'], ['v:tundra', 'Tundra']],
  climate: [['z:0', 'Tropical'], ['z:4', 'Arid'], ['z:6', 'Temperate'], ['z:9', 'Continental'], ['z:12', 'Polar'], ['seaice', 'Sea ice'], ['isotherm', 'Isotherm, 5 °C'], ['current', 'Current, 3 Sv'], ['volcano', 'Eruption']],
  'weather-pressure': [['cold', 'Cold front'], ['warm', 'Warm front'], ['stationary', 'Stationary'], ['occluded', 'Occluded'], ['trough', 'Trough'], ['pridge', 'Ridge'], ['shear', 'Shear line'], ['dry', 'Dry line'], ['isobar', 'Isobar, 4 hPa'], ['hl', 'High, low'], ['rain', 'Rain']],
  'weather-temperature': [['cold', 'Cold front'], ['warm', 'Warm front'], ['stationary', 'Stationary'], ['occluded', 'Occluded'], ['isotherm', 'Isotherm, 5 °C'], ['iso0', '0 °C'], ['t:cold', 'Cold'], ['t:warm', 'Warm']],
  'weather-humidity': [['dry', 'Dry line'], ['isohume', 'Humidity, 20%'], ['h:dry', 'Dry air'], ['h:moist', 'Moist air'], ['rain', 'Rain'], ['hl', 'High, low']],
  tides: [['r:low', 'Small range'], ['r:high', 'Large range'], ['cotidal', 'Co-tidal, 1 lunar h'], ['amphidrome', 'Amphidrome'], ['highwater', 'High water now'], ['dissipation', 'Tide’s energy lost']],
};

export function drawKey(canvas, view, P) {
  const items = ITEMS[view] || ITEMS[`${view}-pressure`] || ITEMS.relief;
  const cols = 2, colW = 118, rowH = 18;
  const rows = Math.ceil(items.length / cols);
  const w = cols * colW, h = rows * rowH + 2;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.style.width = `${w}px`; canvas.style.height = `${h}px`;
  canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
  const c = canvas.getContext('2d');
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
  c.clearRect(0, 0, w, h);
  items.forEach(([g, name], k) => {
    const x = (k % cols) * colW, y = Math.floor(k / cols) * rowH + 2;
    if (g.startsWith('v:')) vegetation(c, x, y, P, g.slice(2));
    else if (g.startsWith('t:')) wash(c, x, y, P, g === 't:warm' ? P.inks.sienna : P.ocean, 0.3);
    else if (g.startsWith('h:')) wash(c, x, y, P, g === 'h:moist' ? P.inks.verdigris : P.inks.ochre, 0.3);
    else if (g.startsWith('r:')) wash(c, x, y, P, P.ocean, g === 'r:high' ? 0.6 : 0.1);
    else if (g.startsWith('z:')) zonePattern(c, +g.slice(2), x, y, 26, 12, P);
    else GLYPHS[g](c, x, y, P);
    c.font = `12px ${FONT}`; c.fillStyle = P.text; c.textAlign = 'left'; c.textBaseline = 'middle';
    c.fillText(name, x + 32, y + 6.5);
  });
}
