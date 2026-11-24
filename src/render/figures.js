// The margin's figures, drawn from the model's own state (docs/MODEL.md): zonal means, hypsometry, the polarity record, and the key to
// the Climate view's zones. Hairline axes, Newsreader, the inks for data.

import { ZONES } from '../engine/climate.js';
import { idHue } from './key.js';

const FONT = "'Newsreader', 'STIX Two Text', serif";

function setup(canvas) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = Math.max(1, canvas.clientWidth), h = Math.max(1, canvas.clientHeight);
  if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
    canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
  }
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  return { ctx, w, h, dpr };
}

function alpha(hex, a) {
  const h = hex.replace('#', '');
  return `rgba(${parseInt(h.slice(0, 2), 16)}, ${parseInt(h.slice(2, 4), 16)}, ${parseInt(h.slice(4, 6), 16)}, ${a})`;
}

function label(ctx, text, x, y, color, align = 'left', size = 11.5, italic = false) {
  ctx.font = `${italic ? 'italic ' : ''}${size}px ${FONT}`;
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x, y);
}

const latLabel = d => d === 0 ? '0°' : `${Math.abs(d)}°${d > 0 ? 'N' : 'S'}`;

/** Fig.: temperature and precipitation by latitude, with the ITCZ's range and the Hadley edges. */
export function drawZonal(canvas, zonal, pal) {
  const { ctx, w, h } = setup(canvas);
  if (!zonal) return;
  const top = 22, bot = h - 20, left = 34, gap = 18;
  const pw = (w - left - gap - 14) / 2;
  const y = lat => top + (90 - lat) / 180 * (bot - top);
  // The ITCZ's seasonal range: a hatched band across both panels.
  {
    const y0 = y(zonal.itczHi), y1 = y(zonal.itczLo);
    ctx.save();
    ctx.beginPath(); ctx.rect(left, y0, w - left - 6, Math.max(1, y1 - y0)); ctx.clip();
    ctx.strokeStyle = alpha(pal.muted, 0.35); ctx.lineWidth = 0.75;
    ctx.beginPath();
    for (let x = left - 40; x < w; x += 4) { ctx.moveTo(x, y1); ctx.lineTo(x + (y1 - y0), y0); }
    ctx.stroke();
    ctx.restore();
  }
  // Latitude axis.
  ctx.strokeStyle = alpha(pal.text, 0.14); ctx.lineWidth = 1;
  for (const d of [-60, -30, 0, 30, 60]) {
    ctx.beginPath(); ctx.moveTo(left, Math.round(y(d)) + 0.5); ctx.lineTo(w - 6, Math.round(y(d)) + 0.5); ctx.stroke();
    label(ctx, latLabel(d), left - 5, y(d), pal.muted, 'right', 10.5);
  }
  // Hadley edges: ticks at each side.
  for (const d of [zonal.hadley, -zonal.hadley]) {
    ctx.strokeStyle = pal.text; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(left, y(d)); ctx.lineTo(left + 5, y(d)); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(w - 6, y(d)); ctx.lineTo(w - 11, y(d)); ctx.stroke();
  }
  const panel = (x0, lo, hi, ticks, unit, draw) => {
    const X = v => x0 + (v - lo) / (hi - lo) * pw;
    ctx.strokeStyle = alpha(pal.text, 0.4); ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(Math.round(x0) + 0.5, top); ctx.lineTo(Math.round(x0) + 0.5, bot); ctx.stroke();
    for (const t of ticks) {
      const x = X(t);
      ctx.beginPath(); ctx.moveTo(x, bot); ctx.lineTo(x, bot + 3); ctx.stroke();
      label(ctx, String(t), x, bot + 11, pal.muted, 'center', 10.5);
    }
    label(ctx, unit, x0, 9, pal.muted, 'left', 11, true);
    draw(X);
  };
  // Temperature: the year's range (warmest to coldest month) as a band, the mean as a rule.
  panel(left + 1, -50, 40, [-40, -20, 0, 20], 'Temperature, °C', X => {
    ctx.fillStyle = alpha(pal.inks.sienna, 0.2);
    ctx.beginPath();
    for (let b = 0; b < 90; b++) ctx.lineTo(X(Math.max(-50, zonal.Thi[b])), y(-89 + 2 * b));
    for (let b = 89; b >= 0; b--) ctx.lineTo(X(Math.max(-50, zonal.Tlo[b])), y(-89 + 2 * b));
    ctx.fill();
    ctx.strokeStyle = pal.inks.sienna; ctx.lineWidth = 1.4;
    ctx.beginPath();
    for (let b = 0; b < 90; b++) ctx.lineTo(X(Math.max(-50, zonal.T[b])), y(-89 + 2 * b));
    ctx.stroke();
    ctx.strokeStyle = alpha(pal.text, 0.3); ctx.lineWidth = 1; ctx.setLineDash([2, 3]);
    ctx.beginPath(); ctx.moveTo(X(0), top); ctx.lineTo(X(0), bot); ctx.stroke();
    ctx.setLineDash([]);
  });
  // Precipitation: all cells as a rule, land alone dashed.
  const pmax = 3000;
  panel(left + pw + gap, 0, pmax, [0, 1000, 2000], 'Precipitation, mm/yr', X => {
    ctx.strokeStyle = pal.inks.prussian; ctx.lineWidth = 1.4;
    ctx.beginPath();
    for (let b = 0; b < 90; b++) ctx.lineTo(X(Math.min(pmax, zonal.P[b])), y(-89 + 2 * b));
    ctx.stroke();
    ctx.setLineDash([3, 2.5]); ctx.lineWidth = 1.1;
    ctx.beginPath();
    let on = false;
    for (let b = 0; b < 90; b++) {
      const v = zonal.Pland[b];
      if (!(v >= 0)) { on = false; continue; }
      const px = X(Math.min(pmax, v)), py = y(-89 + 2 * b);
      if (on) ctx.lineTo(px, py); else ctx.moveTo(px, py);
      on = true;
    }
    ctx.stroke();
    ctx.setLineDash([]);
  });
}

/** Fig.: the share of the surface in each 250 m of elevation, about sea level. */
export function drawHypsometry(canvas, tec, pal) {
  const { ctx, w, h } = setup(canvas);
  const g = tec.grid, s = tec.seaLevel;
  const lo = -7, hi = 6, bin = 0.25, nb = Math.round((hi - lo) / bin);
  const hist = new Float64Array(nb);
  for (let i = 0; i < g.n; i++) {
    const e = tec.elev[i] - s;
    const b = Math.max(0, Math.min(nb - 1, Math.floor((e - lo) / bin)));
    hist[b] += g.area[i] / (4 * Math.PI);
  }
  const top = 22, bot = h - 20, left = 34, right = w - 8;
  const y = e => bot - (e - lo) / (hi - lo) * (bot - top);
  const xmax = 0.08;
  const X = f => left + Math.min(1, f / xmax) * (right - left);
  ctx.strokeStyle = alpha(pal.text, 0.14); ctx.lineWidth = 1;
  for (const e of [-6, -4, -2, 0, 2, 4, 6]) {
    ctx.beginPath(); ctx.moveTo(left, Math.round(y(e)) + 0.5); ctx.lineTo(right, Math.round(y(e)) + 0.5); ctx.stroke();
    label(ctx, e === 0 ? '0' : `${e > 0 ? '+' : '−'}${Math.abs(e)}`, left - 5, y(e), pal.muted, 'right', 10.5);
  }
  for (let b = 0; b < nb; b++) {
    const e0 = lo + b * bin;
    ctx.fillStyle = e0 >= 0 ? alpha(pal.land, 0.75) : alpha(pal.ocean, 0.6);
    const y0 = y(e0 + bin), y1 = y(e0);
    ctx.fillRect(left, y0 + 0.5, X(hist[b]) - left, Math.max(0.5, y1 - y0 - 1));
  }
  ctx.strokeStyle = pal.text; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(left, Math.round(y(0)) + 0.5); ctx.lineTo(right, Math.round(y(0)) + 0.5); ctx.stroke();
  ctx.strokeStyle = alpha(pal.text, 0.4);
  ctx.beginPath(); ctx.moveTo(left + 0.5, top); ctx.lineTo(left + 0.5, bot); ctx.stroke();
  for (const f of [0, 0.04, 0.08]) {
    const x = X(f);
    ctx.beginPath(); ctx.moveTo(x, bot); ctx.lineTo(x, bot + 3); ctx.stroke();
    label(ctx, `${Math.round(f * 100)}%`, x, bot + 11, pal.muted, 'center', 10.5);
  }
  label(ctx, 'km', left - 5, top - 14, pal.muted, 'right', 10.5, true);
}

/** Fig.: the polarity record as a barcode, normal dark, over the last `span` Myr. */
export function drawPolarity(canvas, polarity, t, pal, span = 160) {
  const { ctx, w, h } = setup(canvas);
  const left = 8, right = w - 8, top = 6, bot = h - 20;
  const X = a => right - a / span * (right - left);        // a: Myr ago
  const times = polarity.recent(t, span);
  // Polarity just before the window's start.
  let p = polarity.at(t - span);
  let a0 = span;
  ctx.fillStyle = pal.text;
  for (const tm of times) {
    const a1 = t - tm;
    if (p > 0) ctx.fillRect(X(a0), top, X(a1) - X(a0), bot - top);
    p = -p; a0 = a1;
  }
  if (p > 0) ctx.fillRect(X(a0), top, X(0) - X(a0), bot - top);
  ctx.strokeStyle = alpha(pal.text, 0.5); ctx.lineWidth = 1;
  ctx.strokeRect(left + 0.5, top + 0.5, right - left - 1, bot - top - 1);
  for (let a = 0; a <= span; a += 40) {
    const x = X(a);
    ctx.beginPath(); ctx.moveTo(x, bot); ctx.lineTo(x, bot + 3); ctx.stroke();
    label(ctx, a === 0 ? 'now' : `${a}`, x, bot + 11, pal.muted, a === 0 ? 'right' : 'center', 10.5);
  }
}

// The zones' patterns in 2D, the same screens as the globe's shader.
export function zonePattern(ctx, k, x, y, w, h, pal) {
  const inks = [pal.inks.viridian, pal.inks.ochre, pal.inks.sap, pal.inks.verdigris, pal.inks.indigo];
  const g = k < 4 ? 0 : k < 6 ? 1 : k < 9 ? 2 : k < 12 ? 3 : 4;
  const ink = inks[g];
  const v = g === 2 ? 0.8 : g === 3 ? 0.64 : 1;
  ctx.save();
  ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
  const fill = a => { ctx.fillStyle = alpha(ink, a); ctx.fillRect(x, y, w, h); };
  const hatch = (dx, dy, period, lw) => {
    ctx.strokeStyle = alpha(ink, 0.82 * v); ctx.lineWidth = lw;
    ctx.beginPath();
    for (let o = -w - h; o < w + h; o += period) {
      if (dy === 0) { ctx.moveTo(x, y + o); ctx.lineTo(x + w, y + o); continue; }
      ctx.moveTo(x + o, y + h); ctx.lineTo(x + o + h * dx / dy, y);
    }
    ctx.stroke();
  };
  const dots = (period, r) => {
    ctx.fillStyle = alpha(ink, 0.82 * v);
    for (let row = 0, yy = y; yy < y + h + period; row++, yy += period * 0.866) {
      for (let xx = x + (row % 2 ? period / 2 : 0); xx < x + w + period; xx += period) { ctx.beginPath(); ctx.arc(xx, yy, r, 0, 2 * Math.PI); ctx.fill(); }
    }
  };
  if (k === 0 || k === 4 || k === 6 || k === 9 || k === 12) fill(0.56 * v);
  else if (k === 1 || k === 5) { fill(0.16); hatch(1, 1, 7 * 1.414, 1); hatch(-1, 1, 7 * 1.414, 1); }
  else if (k === 2 || k === 8 || k === 11) { fill(0.16 * v); hatch(1, 1, 7 * 1.414, 1.1); }
  else if (k === 3 || k === 7 || k === 10) { fill(0.16 * v); dots(6.25, 1.05); }
  ctx.restore();
  ctx.strokeStyle = alpha(pal.text, 0.25); ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
}

/** The key to the zones: a swatch per class, grouped by main letter. */
export function drawZoneKey(canvas, pal, shares) {
  const { ctx, w } = setup(canvas);
  const rows = [[0, 1, 2, 3], [4, 5], [6, 7, 8], [9, 10, 11], [12, 13]];
  const sw = 24, sh = 15, colW = Math.min(76, (w - 4) / 4), rowH = 22;
  rows.forEach((row, r) => {
    row.forEach((k, c) => {
      const x = 2 + c * colW, y = 4 + r * rowH;
      zonePattern(ctx, k, x, y, sw, sh, pal);
      label(ctx, ZONES[k], x + sw + 5, y + sh / 2 + 0.5, pal.text, 'left', 11.5);
      const cw = ctx.measureText(ZONES[k]).width;
      if (shares) label(ctx, `${Math.round(100 * shares[k])}`, x + sw + 9 + cw, y + sh / 2 + 0.5, pal.muted, 'left', 10.5);
    });
  });
}

const ago = (y, span) => {
  if (span >= 2e6) return `${Math.round(y / 1e6)} Myr`;
  if (span >= 2e3) return `${Math.round(y / 1e3)} kyr`;
  return `${Math.round(y)} yr`;
};

/** Fig.: the planet's record, global series stacked on one time axis that follows the dial. */
export function drawRecord(canvas, rec, now, span, pal) {
  const { ctx, w, h } = setup(canvas);
  const rows = [
    { k: 0, name: 'Temperature', unit: v => `${v.toFixed(1)} °C`, ink: pal.inks.sienna },
    { k: 1, name: 'CO₂', unit: v => `${Math.round(v)} ppm`, ink: pal.text, log: true },
    { k: 2, name: 'Sea level', unit: v => `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(Math.round(v))} m`, ink: pal.inks.prussian },
    { k: 3, name: 'Ice', unit: v => `${Math.round(v)} m of sea`, ink: pal.inks.indigo },
    { k: 4, name: 'Land', unit: v => `${v.toFixed(1)}%`, ink: pal.inks.umber },
    { k: 5, name: 'Ridges', unit: v => `${v.toFixed(2)}×`, ink: pal.accent },
    { k: 6, name: 'Day', unit: v => `${v.toFixed(2)} h`, ink: pal.inks.violet },
  ];
  const left = 8, right = w - 8, top = 4, bot = h - 18, rh = (bot - top) / rows.length;
  const { t, v } = rec.window(span);
  const X = tt => right - (now - tt) / span * (right - left);
  rows.forEach((r, ri) => {
    const y0 = top + ri * rh + 13, y1 = top + (ri + 1) * rh - 3;
    const vals = v[r.k];
    let lo = Infinity, hi = -Infinity, last = NaN;
    for (let i = 0; i < t.length; i++) {
      if (t[i] < now - span) continue;
      let x = vals[i]; if (r.log) x = Math.log(Math.max(1, x));
      if (x < lo) lo = x; if (x > hi) hi = x; last = vals[i];
    }
    label(ctx, r.name, left, top + ri * rh + 6, pal.muted, 'left', 10.5, true);
    if (!(hi >= lo)) return;
    label(ctx, r.unit(last), right, top + ri * rh + 6, pal.text, 'right', 10.5);
    const pad = Math.max(1e-6, (hi - lo) * 0.1) + (r.log ? 0.02 : r.k === 0 ? 0.1 : r.k >= 4 ? 0.01 : 0.5);
    lo -= pad; hi += pad;
    const Y = x => y1 - ((r.log ? Math.log(Math.max(1, x)) : x) - lo) / (hi - lo) * (y1 - y0);
    ctx.strokeStyle = alpha(pal.text, 0.1); ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(left, Math.round(y1) + 0.5); ctx.lineTo(right, Math.round(y1) + 0.5); ctx.stroke();
    ctx.strokeStyle = r.ink; ctx.lineWidth = 1.2;
    ctx.beginPath();
    let on = false;
    for (let i = 0; i < t.length; i++) {
      if (t[i] < now - span) continue;
      const x = X(t[i]), y = Y(vals[i]);
      if (on) ctx.lineTo(x, y); else ctx.moveTo(x, y);
      on = true;
    }
    ctx.stroke();
  });
  ctx.strokeStyle = alpha(pal.text, 0.4); ctx.lineWidth = 1;
  for (let k = 0; k <= 4; k++) {
    const x = left + k / 4 * (right - left);
    ctx.beginPath(); ctx.moveTo(x, bot); ctx.lineTo(x, bot + 3); ctx.stroke();
    label(ctx, k === 4 ? 'now' : `−${ago(span * (1 - k / 4), span)}`, x, bot + 10, pal.muted, k === 0 ? 'left' : k === 4 ? 'right' : 'center', 10.5);
  }
}

/** Fig.: the orbit's cycles and Milankovitch's curve, the last 400 kyr and the next 100. */
export function drawOrbit(canvas, orbit, nowKyr, pal) {
  const { ctx, w, h } = setup(canvas);
  const back = 400, fwd = 100, left = 8, right = w - 8, top = 4, bot = h - 18;
  const rows = [
    { name: 'Eccentricity', f: t => orbit.at(t).eMean, fmt: v => v.toFixed(3), ink: pal.text },
    { name: 'Obliquity', f: t => orbit.at(t).obliquity * 180 / Math.PI, fmt: v => `${v.toFixed(1)}°`, ink: pal.inks.violet },
    { name: 'Precession, e sin ϖ', f: t => { const o = orbit.at(t); return o.eMean * Math.sin(o.perihelion); }, fmt: v => v.toFixed(3), ink: pal.inks.madder },
    { name: 'July sun at 65°N', f: t => orbit.summer65(t), fmt: v => `${Math.round(v)} W/m²`, ink: pal.inks.sienna },
  ];
  const rh = (bot - top) / rows.length, N = 300;
  const X = t => left + (t - (nowKyr - back)) / (back + fwd) * (right - left);
  rows.forEach((r, ri) => {
    const y0 = top + ri * rh + 13, y1 = top + (ri + 1) * rh - 3;
    const vals = new Float64Array(N + 1);
    let lo = Infinity, hi = -Infinity;
    for (let k = 0; k <= N; k++) { const v = r.f(nowKyr - back + k / N * (back + fwd)); vals[k] = v; lo = Math.min(lo, v); hi = Math.max(hi, v); }
    const pad = (hi - lo) * 0.08 + 1e-9; lo -= pad; hi += pad;
    const Y = v => y1 - (v - lo) / (hi - lo) * (y1 - y0);
    label(ctx, r.name, left, top + ri * rh + 6, pal.muted, 'left', 10.5, true);
    label(ctx, r.fmt(r.f(nowKyr)), right, top + ri * rh + 6, pal.text, 'right', 10.5);
    ctx.strokeStyle = r.ink; ctx.lineWidth = 1.1;
    ctx.beginPath();
    for (let k = 0; k <= N; k++) {
      const x = X(nowKyr - back + k / N * (back + fwd)), y = Y(vals[k]);
      if (k) ctx.lineTo(x, y); else ctx.moveTo(x, y);
    }
    ctx.stroke();
  });
  const xn = Math.round(X(nowKyr)) + 0.5;
  ctx.strokeStyle = alpha(pal.text, 0.5); ctx.lineWidth = 1; ctx.setLineDash([2, 2]);
  ctx.beginPath(); ctx.moveTo(xn, top); ctx.lineTo(xn, bot); ctx.stroke(); ctx.setLineDash([]);
  for (const k of [-400, -300, -200, -100, 0, 100]) {
    const x = X(nowKyr + k);
    ctx.beginPath(); ctx.moveTo(x, bot); ctx.lineTo(x, bot + 3); ctx.stroke();
    if (k === -300 || k === -100) continue;
    label(ctx, k === 0 ? 'now' : `${k > 0 ? '+' : '−'}${Math.abs(k)} kyr`, x, bot + 10, pal.muted, k === -400 ? 'left' : k === 100 ? 'right' : 'center', 10.5);
  }
}

// ── Fig. 2: the model ──
// Every live layer a node with its value; every coupling the code has an arrow, as heavy as its
// flux against a typical size. A layer that isn't stepping (the weather outside its view, the
// year and its volcanoes outrun) has no value, and it and its arrows are left out. The mantle's
// CO₂ and sulfate are the red. The tide's arrows carry the spin it slows. With people, the
// figure is their economy (src/render/economy.js), the planet's layers they touch at its edge.
export const PLANET = {
  orbit: [0.86, 0.06, 'Orbit'], weather: [0.14, 0.06, 'Weather'], tides: [0.5, 0.06, 'Tides'],
  ocean: [0.12, 0.27, 'Ocean'], climate: [0.5, 0.2, 'Climate'], zones: [0.88, 0.27, 'Zones'],
  ground: [0.26, 0.4, 'Ground'], veg: [0.74, 0.38, 'Vegetation'], dust: [0.5, 0.42, 'Dust'],
  ice: [0.12, 0.56, 'Ice'], year: [0.7, 0.53, 'Year'], carbon: [0.88, 0.58, 'Carbon'],
  lakes: [0.3, 0.63, 'Lakes'], landscape: [0.52, 0.66, 'Landscape'], seaC: [0.86, 0.75, 'Sea carbon'],
  regolith: [0.3, 0.8, 'Regolith'], volcanoes: [0.66, 0.82, 'Volcanoes'],
  sea: [0.1, 0.9, 'Sea level'], plates: [0.48, 0.94, 'Plates'], plumes: [0.86, 0.93, 'Plumes'],
};

export function drawModel(canvas, s, pal) {
  const { ctx, w, h } = setup(canvas);
  if (!s) return;
  const N = s.nodes || PLANET, on = k => N[k] && s.values[k] != null;
  const P = k => [N[k][0] * w, N[k][1] * (h - 24) + 10];
  // The nodes' boxes, where the arrows end and which their labels keep clear of.
  const nodes = Object.keys(N).filter(on).map(k => {
    const [x, y] = P(k);
    ctx.font = `13px ${FONT}`;
    let tw = Math.max(ctx.measureText(N[k][2]).width, 30);
    ctx.font = `10.5px ${FONT}`;
    tw = Math.max(tw, ctx.measureText(s.values[k]).width);
    const cx = Math.min(Math.max(x, tw / 2 + 3), w - tw / 2 - 3);   // kept within the figure
    return { k, x: cx, y, box: [cx - tw / 2 - 3, y - 10, cx + tw / 2 + 3, y + 17] };
  });
  const boxOf = Object.fromEntries(nodes.map(n => [n.k, n.box]));
  // Where a line from (ox, oy) inside a box toward (px, py) leaves it, 3 px out.
  const exit = (b, ox, oy, px, py) => {
    const dx = px - ox, dy = py - oy;
    const tx = dx > 1e-9 ? (b[2] + 3 - ox) / dx : dx < -1e-9 ? (b[0] - 3 - ox) / dx : Infinity;
    const ty = dy > 1e-9 ? (b[3] + 3 - oy) / dy : dy < -1e-9 ? (b[1] - 3 - oy) / dy : Infinity;
    const t = Math.min(1, tx, ty);
    return [ox + dx * t, oy + dy * t];
  };
  const live = s.edges.filter(e => e.on !== false && on(e.from) && on(e.to));
  const byPair = new Map(live.map(e => [`${e.from}>${e.to}`, e]));
  const taken = nodes.map(n => n.box), clear = b => !taken.some(t => b[0] < t[2] && b[2] > t[0] && b[1] < t[3] && b[3] > t[1]);
  // Arrows first, under the nodes; their labels last, the heaviest first, each where it's clear.
  const labels = [];
  // An arrowhead at (x, y) pointing along (hx, hy), hs long, at least as wide as the shaft.
  const head = (x, y, hx, hy, hs, lw) => {
    const hw = Math.max(0.55 * hs, 0.5 * lw + 2);
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - hx * hs - hy * hw, y - hy * hs + hx * hw); ctx.lineTo(x - hx * hs + hy * hw, y - hy * hs - hx * hw); ctx.closePath(); ctx.fill();
  };
  for (const e of live) {
    const A = boxOf[e.from], B = boxOf[e.to];
    if (e.from === e.to) {   // a stock its own flow keeps (capital, output kept): a loop on the roomier side
      const wgt = Math.max(0, Math.min(1, e.w)), ink = e.red ? pal.accent : pal.text, cy = (A[1] + A[3]) / 2;
      const sd = A[2] + 44 < w ? 1 : -1, x0 = sd > 0 ? A[2] + 3 : A[0] - 3, r = 27 * sd;
      const lw = 0.6 + 2.6 * wgt, hl = Math.hypot(r, 16), hx = -r / hl, hy = -16 / hl, hs = 4 + 2 * wgt + lw;
      ctx.strokeStyle = alpha(ink, 0.25 + 0.6 * wgt); ctx.lineWidth = lw;
      ctx.beginPath(); ctx.moveTo(x0, cy - 5); ctx.bezierCurveTo(x0 + r, cy - 21, x0 + r, cy + 21, x0 - hx * hs * 0.8, cy + 5 - hy * hs * 0.8); ctx.stroke();
      ctx.fillStyle = alpha(ink, 0.35 + 0.6 * wgt);
      head(x0, cy + 5, hx, hy, hs, lw);
      if (e.label) { ctx.font = `italic 10px ${FONT}`; const tw = ctx.measureText(e.label).width; labels.push({ text: e.label, x: x0 + 0.78 * r + sd * (tw / 2 + 4), y: cy, red: e.red, w: 2 }); }
      continue;
    }
    const ax = (A[0] + A[2]) / 2, ay = (A[1] + A[3]) / 2, bx = (B[0] + B[2]) / 2, by = (B[1] + B[3]) / 2;
    // A coupling both ways is one curve (the first-named way's) in two lanes, each 3.5 px to its side.
    const back = byPair.get(`${e.to}>${e.from}`), first = !back || e.from < e.to, c = first ? e : back;
    const sg = first ? 1 : -1, dx = (bx - ax) * sg, dy = (by - ay) * sg, L = Math.hypot(dx, dy), ux = dx / L, uy = dy / L;
    const bend = (back ? c.bend ?? 0.12 : e.bend ?? 0.12) * (back ? 0.6 : 1), o = back ? 3.5 * sg : 0;
    const mx = (ax + bx) / 2 - uy * (L * bend + o), my = (ay + by) / 2 + ux * (L * bend + o);
    const [sx, sy] = exit(A, ax - uy * o, ay + ux * o, mx, my), [ex, ey] = exit(B, bx - uy * o, by + ux * o, mx, my);
    const wgt = Math.max(0, Math.min(1, e.w)), lw = 0.6 + 2.6 * wgt;
    const ink = e.ink ? pal[e.ink] : e.red ? pal.accent : pal.text;
    // The head along the curve's end tangent, the shaft ending at its base (run to the tip, a heavy
    // shaft stood out past the head's narrow point).
    const tx = ex - mx, ty = ey - my, tl = Math.hypot(tx, ty) || 1, hx = tx / tl, hy = ty / tl, hs = 4 + 2 * wgt + lw;
    ctx.strokeStyle = alpha(ink, e.ink ? 0.55 + 0.45 * wgt : 0.25 + 0.6 * wgt);
    ctx.lineWidth = lw;
    ctx.beginPath(); ctx.moveTo(sx, sy); ctx.quadraticCurveTo(mx, my, ex - hx * hs * 0.8, ey - hy * hs * 0.8); ctx.stroke();
    ctx.fillStyle = alpha(ink, e.ink ? 0.65 + 0.35 * wgt : 0.35 + 0.6 * wgt);
    head(ex, ey, hx, hy, hs, lw);
    // The flux's value at the bend.
    const t = back ? 0.38 : 0.5, q0 = (1 - t) * (1 - t), q1 = 2 * t * (1 - t), q2 = t * t;
    if (e.label) labels.push({ text: e.label, x: q0 * sx + q1 * mx + q2 * ex, y: q0 * sy + q1 * my + q2 * ey, red: e.red, w: wgt });
  }
  for (const n of nodes) {
    const [x0, y0, x1, y1] = n.box;
    ctx.fillStyle = pal.canvas; ctx.fillRect(x0, y0, x1 - x0, y1 - y0 - 1);
    label(ctx, N[n.k][2], n.x, n.y - 2, s.red && s.red[n.k] ? pal.accent : pal.text, 'center', 13);
    label(ctx, s.values[n.k], n.x, n.y + 11, pal.muted, 'center', 10.5);
  }
  for (const l of labels.sort((a, b) => b.w - a.w)) {
    ctx.font = `italic 10px ${FONT}`;
    const tw = ctx.measureText(l.text).width, b = [l.x - tw / 2 - 2, l.y - 6, l.x + tw / 2 + 2, l.y + 6];
    if (b[0] < 0 || b[2] > w || !clear(b)) continue;
    taken.push(b);
    ctx.fillStyle = pal.canvas; ctx.fillRect(b[0], b[1], b[2] - b[0], b[3] - b[1]);
    label(ctx, l.text, l.x, l.y, l.red ? pal.accent : pal.muted, 'center', 10, true);
  }
}

// ── Fig. 8: the people on the hyperbola's clock (the People scenario) ──
const SUP = { '-': '⁻', 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹' };
const pow10 = n => `10${String(n).split('').map(c => SUP[c]).join('')}`;
const EVENT_NAMES = { origin: 'first people', tip: 'tip', farming: 'farming', industry: 'industry', present: 'takeoff', dial: 'dial' };
/** A span before t* on the axis, for its ticks: "1 Myr", "100 yr", "1 day". */
function before(d) {
  const y = Math.pow(10, d);
  if (y >= 1e6) return `${Math.round(y / 1e6)} Myr`;
  if (y >= 1e3) return `${Math.round(y / 1e3)} kyr`;
  if (y >= 1) return `${Math.round(y)} yr`;
  return d <= -2.5 ? '1 day' : `${Math.round(y * 365.25)} days`;
}

/**
 * Fig. 8 (src/engine/peoplefit.js `figureOf`): people and minds on a log scale against
 * log(t* − t), where the hyperbola is a straight line (its fit dotted over the window it was
 * fitted on), the first of each era's events ruled through.
 */
export function drawPeople(canvas, fig, pal) {
  const { ctx, w, h } = setup(canvas);
  if (!fig || fig.series.length < 2) return;
  const left = 30, right = w - 8, top = 26, bBot = h - 20, aBot = bBot;
  const X = x => left + (fig.x0 - x) / Math.max(1e-9, fig.x0 - fig.x1) * (right - left);
  // The axis: decades before t*.
  ctx.strokeStyle = alpha(pal.text, 0.4); ctx.lineWidth = 1;
  let lastLab = -1e9;
  for (let d = Math.floor(fig.x0); d >= Math.ceil(fig.x1); d--) {
    const x = X(d);
    ctx.beginPath(); ctx.moveTo(Math.round(x) + 0.5, bBot); ctx.lineTo(Math.round(x) + 0.5, bBot + 3); ctx.stroke();
    if (x - lastLab > 34 && (d % 3 === 0 || fig.x0 - fig.x1 < 7)) { label(ctx, before(d), x, bBot + 11, pal.muted, 'center', 10.5); lastLab = x; }
  }
  // The events, ruled through, their names staggered where they crowd.
  let prev = -1e9, row = 0;
  for (const e of [...fig.events].sort((a, b) => b.x - a.x)) {
    const x = X(e.x);
    ctx.strokeStyle = alpha(pal.text, 0.14);
    ctx.beginPath(); ctx.moveTo(Math.round(x) + 0.5, top - 4); ctx.lineTo(Math.round(x) + 0.5, bBot); ctx.stroke();
    row = x - prev < 46 ? 1 - row : 0; prev = x;
    label(ctx, EVENT_NAMES[e.kind] || e.kind, x, 6 + 11 * row, pal.muted, x > right - 24 ? 'right' : x < left + 24 ? 'left' : 'center', 10.5, true);
  }
  // People (solid) and minds (dashed), log₁₀.
  let lo = Infinity, hi = -Infinity;
  for (const s of fig.series) for (const v of [s.people, s.minds]) if (v > 0) { const l = Math.log10(v); if (l < lo) lo = l; if (l > hi) hi = l; }
  if (!(hi >= lo)) return;
  lo = Math.floor(lo); hi = Math.max(lo + 1, Math.ceil(hi));
  const Y = v => aBot - (Math.log10(v) - lo) / (hi - lo) * (aBot - top);
  const step = Math.max(1, Math.ceil((hi - lo) / 6 / 3) * 3);
  for (let d = Math.ceil(lo / step) * step; d <= hi; d += step) {
    const y = Y(Math.pow(10, d));
    ctx.strokeStyle = alpha(pal.text, 0.08);
    ctx.beginPath(); ctx.moveTo(left, Math.round(y) + 0.5); ctx.lineTo(right, Math.round(y) + 0.5); ctx.stroke();
    label(ctx, pow10(d), left - 4, y, pal.muted, 'right', 10);
  }
  const curve = (key, ink, dash, width) => {
    ctx.strokeStyle = ink; ctx.lineWidth = width; ctx.setLineDash(dash);
    ctx.beginPath();
    let on = false;
    for (const s of fig.series) { if (!(s[key] > 0)) continue; const x = X(s.x), y = Y(s[key]); if (on) ctx.lineTo(x, y); else ctx.moveTo(x, y); on = true; }
    ctx.stroke(); ctx.setLineDash([]);
  };
  // The fit, dotted, over its window: log y = a − p log(t* − t), a from the record there.
  const f = fig.fit, key = fig.which;
  if (f && key) {
    const tipX = (fig.events.find(e => e.kind === 'tip') || { x: fig.x0 }).x;
    const inW = fig.series.filter(s => s[key] > 0 && s.x <= tipX);
    if (inW.length > 2) {
      let a = 0; for (const s of inW) a += Math.log10(s[key]) + f.p * s.x;
      a /= inW.length;
      const xa = tipX, xb = inW.at(-1).x;
      ctx.strokeStyle = alpha(pal.text, 0.45); ctx.lineWidth = 1; ctx.setLineDash([1, 3]);
      ctx.beginPath(); ctx.moveTo(X(xa), Y(Math.pow(10, a - f.p * xa))); ctx.lineTo(X(xb), Y(Math.pow(10, a - f.p * xb))); ctx.stroke();
      ctx.setLineDash([]);
    }
  }
  curve('minds', pal.inks.indigo, [4, 3], 1.3);
  curve('people', pal.text, [], 1.3);
  const end = fig.series.at(-1);
  if (end.minds > 0) label(ctx, 'minds', X(end.x) - 3, Y(end.minds) - 8, pal.inks.indigo, 'right', 10.5, true);
  if (end.people > 0) label(ctx, 'people', X(end.x) - 3, Y(end.people) + 9, pal.text, 'right', 10.5, true);
}

/**
 * Fig. 9, the states (src/engine/peoplefit.js `histomapOf`; after Sparks's Histomap of 1931): each state's
 * share of the world's people as a band in its States-map hue and tone, the bands stacked west to east by their
 * capitals at founding, on Fig. 8's axis so the eras line up, each parted from the next by a hairline of
 * paper; the states too small to draw singly a graphite wash above them, up to the share any state holds;
 * the stateless share is the paper above that.
 */
export function drawStates(canvas, st, fig, pal) {
  const { ctx, w, h } = setup(canvas);
  if (!st || !fig || st.x.length < 2) return;
  const left = 30, right = w - 8, top = 8, bot = h - 20, R = st.R, m = st.x.length;
  const X = x => left + (fig.x0 - x) / Math.max(1e-9, fig.x0 - fig.x1) * (right - left), Y = v => bot - v * (bot - top);
  // The axis: Fig. 8's ticks along the foot, the share up the side.
  ctx.strokeStyle = alpha(pal.text, 0.4); ctx.lineWidth = 1;
  let lastLab = -1e9;
  for (let d = Math.floor(fig.x0); d >= Math.ceil(fig.x1); d--) {
    const x = X(d);
    ctx.beginPath(); ctx.moveTo(Math.round(x) + 0.5, bot); ctx.lineTo(Math.round(x) + 0.5, bot + 3); ctx.stroke();
    if (x - lastLab > 34 && (d % 3 === 0 || fig.x0 - fig.x1 < 7)) { label(ctx, before(d), x, bot + 11, pal.muted, 'center', 10.5); lastLab = x; }
  }
  for (const v of [0, 0.5, 1]) {
    const y = Y(v);
    ctx.strokeStyle = alpha(pal.text, v === 0 ? 0.4 : 0.08);
    ctx.beginPath(); ctx.moveTo(left, Math.round(y) + 0.5); ctx.lineTo(right, Math.round(y) + 0.5); ctx.stroke();
    label(ctx, `${Math.round(100 * v)}%`, left - 4, y, pal.muted, 'right', 10);
  }
  // The bands: each row's lower edge forward, its upper edge back; then the small states' wash to the held share.
  const base = new Float32Array(m), band = (lo, hi, fill) => {
    ctx.fillStyle = fill; ctx.beginPath();
    for (let c = 0; c < m; c++) { const x = X(st.x[c]), y = Y(lo(c)); if (c) ctx.lineTo(x, y); else ctx.moveTo(x, y); }
    for (let c = m - 1; c >= 0; c--) ctx.lineTo(X(st.x[c]), Y(hi(c)));
    ctx.closePath(); ctx.fill();
  };
  const tops = [];
  for (let r = 0; r < R; r++) {
    let any = false;
    for (let c = 0; c < m; c++) if (st.n[c * R + r] > 0) { any = true; break; }
    if (any) { const b0 = Float32Array.from(base); band(c => b0[c], c => b0[c] + st.n[c * R + r], alpha(idHue(st.rows[r], pal.dark, st.tones ? st.tones[r] : 0, 0), Math.min(1, 0.62 * (1 + 0.3 * (st.tones ? st.tones[r] : 0))))); }
    for (let c = 0; c < m; c++) base[c] += st.n[c * R + r];
    if (any) tops.push(Float32Array.from(base));
  }
  band(c => base[c], c => Math.max(base[c], st.held[c]), alpha(pal.text, 0.12));
  // The hairlines between the states, in the paper.
  ctx.strokeStyle = pal.canvas; ctx.lineWidth = 0.75;
  for (const tp of tops) {
    ctx.beginPath();
    for (let c = 0; c < m; c++) { const x = X(st.x[c]), y = Y(tp[c]); if (c) ctx.lineTo(x, y); else ctx.moveTo(x, y); }
    ctx.stroke();
  }
}

/** Fig. 9's caption: the effective number of states, the largest's share of those held, the share held. */
export function statesCaption(st) {
  if (!st) return 'States';
  return `States · ${st.states.toFixed(1)} effective · the largest ${Math.round(100 * st.top)}% of those held · ${Math.round(100 * st.heldNow)}% of the people held`;
}

/**
 * Fig. 10, the people's ages (docs/MODEL.md): the world's people in five-year groups
 * (src/engine/people.js `pyramid`, each a share of everyone on Earth), ages up the side, as bars in
 * the accent; the pre-industrial reference (births B_PRE, no growth) a graphite step outline behind
 * them, so the transition reads as the shape moving off it; the working ages (15–64) bracketed.
 */
export function drawAges(canvas, pyr, ref, pal) {
  const { ctx, w, h } = setup(canvas);
  if (!pyr || !pyr.length) return;
  const G = pyr.length, left = 34, right = w - 46, top = 10, bot = h - 22, bh = (bot - top) / G;
  let mx = 0.1;
  for (let k = 0; k < G; k++) mx = Math.max(mx, pyr[k], ref ? ref[k] : 0);
  mx = Math.ceil(mx * 20) / 20;
  const X = v => left + v / mx * (right - left), Y = k => bot - (k + 1) * bh;
  // The axis: shares along the foot, ages up the side every twenty years.
  ctx.strokeStyle = alpha(pal.text, 0.4); ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(left + 0.5, top); ctx.lineTo(left + 0.5, bot + 0.5); ctx.lineTo(right, bot + 0.5); ctx.stroke();
  for (let v = 0; v <= mx + 1e-9; v += 0.05) {
    const x = Math.round(X(v)) + 0.5;
    ctx.beginPath(); ctx.moveTo(x, bot); ctx.lineTo(x, bot + 3); ctx.stroke();
    label(ctx, `${Math.round(100 * v)}%`, x, bot + 12, pal.muted, 'center', 10);
  }
  for (let a = 0; a <= 100; a += 20) label(ctx, a === 100 ? '100+' : String(a), left - 5, bot - a / 5 * bh, pal.muted, 'right', 10);
  // The bars, then the reference's outline over them.
  ctx.fillStyle = alpha(pal.accent, 0.42);
  for (let k = 0; k < G; k++) ctx.fillRect(left + 1, Y(k) + 1, Math.max(0, X(pyr[k]) - left - 1), bh - 2);
  if (ref) {
    ctx.strokeStyle = alpha(pal.text, 0.55); ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(left, bot);
    for (let k = 0; k < G; k++) { ctx.lineTo(X(ref[k]), Y(k) + bh); ctx.lineTo(X(ref[k]), Y(k)); }
    ctx.lineTo(left, Y(G - 1)); ctx.stroke();
  }
  // The working ages: a bracket on the right with its name.
  const y0 = bot - 3 * bh, y1 = bot - 13 * bh, xb = right + 8;
  ctx.strokeStyle = alpha(pal.text, 0.4);
  ctx.beginPath(); ctx.moveTo(xb - 3, y0 - 0.5); ctx.lineTo(xb, y0 - 0.5); ctx.lineTo(xb, y1 + 0.5); ctx.lineTo(xb - 3, y1 + 0.5); ctx.stroke();
  label(ctx, '15–64', xb + 4, (y0 + y1) / 2, pal.muted, 'left', 10, true);
}

/** Fig. 10's caption: the median age, the share 65 and over, and the working ages'. */
export function agesCaption(pyr) {
  if (!pyr || !pyr.length) return 'Ages';
  let acc = 0, med = 0, old = 0, work = 0;
  for (let k = 0; k < pyr.length; k++) {
    if (acc < 0.5 && acc + pyr[k] >= 0.5) med = 5 * k + 5 * (0.5 - acc) / Math.max(pyr[k], 1e-9);
    acc += pyr[k];
    if (k >= 13) old += pyr[k];
    if (k >= 3 && k < 13) work += pyr[k];
  }
  return `Ages · median ${Math.round(med)} · ${Math.round(100 * old)}% 65 and over · ${Math.round(100 * work)}% of working age`;
}
