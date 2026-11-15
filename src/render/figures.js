// The margin's figures, drawn from the model's own state (docs/PLAN.md,
// "Figures"): zonal means, hypsometry, the polarity record, and the key to
// the Climate view's zones. Hairline axes, Newsreader, the inks for data.

import { ZONES } from '../engine/climate.js';

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
  const top = 10, bot = h - 20, left = 34, right = w - 8;
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
  label(ctx, 'km', left - 5, top - 3, pal.muted, 'right', 10.5, true);
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
    ctx.strokeStyle = alpha(ink, 0.82); ctx.lineWidth = lw;
    ctx.beginPath();
    for (let o = -w - h; o < w + h; o += period) {
      if (dy === 0) { ctx.moveTo(x, y + o); ctx.lineTo(x + w, y + o); continue; }
      ctx.moveTo(x + o, y + h); ctx.lineTo(x + o + h * dx / dy, y);
    }
    ctx.stroke();
  };
  const dots = (period, r) => {
    ctx.fillStyle = alpha(ink, 0.82);
    for (let row = 0, yy = y; yy < y + h + period; row++, yy += period * 0.866) {
      for (let xx = x + (row % 2 ? period / 2 : 0); xx < x + w + period; xx += period) { ctx.beginPath(); ctx.arc(xx, yy, r, 0, 2 * Math.PI); ctx.fill(); }
    }
  };
  if (k === 0 || k === 6 || k === 9) fill(0.56 * v);
  else if (k === 1) { fill(0.16); hatch(1, 1, 5 * 1.414, 1); hatch(-1, 1, 5 * 1.414, 1); }
  else if (k === 2 || k === 8 || k === 11) { fill(0.16 * v); hatch(1, 1, 4.5 * 1.414 / v, 1.1); }
  else if (k === 3 || k === 7 || k === 10) { fill(0.16 * v); hatch(-1, 1, 4.5 * 1.414 / v, 1.1); }
  else if (k === 4) { fill(0.10); dots(3.6, 0.95); }
  else if (k === 5) { fill(0.07); dots(6.5, 0.95); }
  else if (k === 12) { fill(0.10); hatch(0, 0, 3.2, 0.8); }
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

// ── Fig. 7: the model ──
// Every layer a node with its live value; every coupling the code has an arrow,
// as heavy as its flux against a typical size. The mantle's CO₂ and sulfate are the red.
// The tide's arrows carry the spin it slows.
const NODES = {
  orbit: [0.84, 0.07, 'Orbit'], weather: [0.16, 0.07, 'Weather'], tides: [0.5, 0.07, 'Tides'],
  ocean: [0.14, 0.31, 'Ocean'], climate: [0.5, 0.24, 'Climate'], zones: [0.86, 0.31, 'Zones'],
  ice: [0.16, 0.55, 'Ice'], carbon: [0.84, 0.56, 'Carbon'], landscape: [0.5, 0.6, 'Landscape'],
  sea: [0.16, 0.83, 'Sea level'], plates: [0.5, 0.9, 'Plates'], plumes: [0.86, 0.85, 'Plumes'],
  year: [0.66, 0.47, 'Year'], volcanoes: [0.64, 0.78, 'Volcanoes'],
  ground: [0.34, 0.42, 'Ground'], lakes: [0.31, 0.66, 'Lakes'],
  regolith: [0.34, 0.77, 'Regolith'], veg: [0.66, 0.35, 'Vegetation'], seaC: [0.87, 0.7, 'Sea carbon'],
};

export function drawModel(canvas, s, pal) {
  const { ctx, w, h } = setup(canvas);
  if (!s) return;
  const P = k => [NODES[k][0] * w, NODES[k][1] * h + 4];
  const R = 20;
  // Arrows first, under the labels.
  for (const e of s.edges) {
    const [ax, ay] = P(e.from), [bx, by] = P(e.to);
    const dx = bx - ax, dy = by - ay, L = Math.hypot(dx, dy), ux = dx / L, uy = dy / L;
    // Bend: pairs going both ways part to either side.
    const bend = e.bend ?? 0.12;
    const mx = (ax + bx) / 2 - uy * L * bend, my = (ay + by) / 2 + ux * L * bend;
    const sx = ax + ux * R, sy = ay + uy * R * 0.8, ex = bx - ux * R, ey = by - uy * R * 0.8;
    const wgt = Math.max(0, Math.min(1, e.w));
    const ink = e.red ? pal.accent : pal.text;
    ctx.strokeStyle = alpha(ink, 0.25 + 0.6 * wgt);
    ctx.lineWidth = 0.6 + 2.6 * wgt;
    ctx.beginPath(); ctx.moveTo(sx, sy); ctx.quadraticCurveTo(mx, my, ex, ey); ctx.stroke();
    // Head along the curve's end tangent.
    const tx = ex - mx, ty = ey - my, tl = Math.hypot(tx, ty) || 1, hx = tx / tl, hy = ty / tl, hs = 4 + 2 * wgt;
    ctx.fillStyle = alpha(ink, 0.35 + 0.6 * wgt);
    ctx.beginPath(); ctx.moveTo(ex, ey); ctx.lineTo(ex - hx * hs - hy * hs * 0.55, ey - hy * hs + hx * hs * 0.55); ctx.lineTo(ex - hx * hs + hy * hs * 0.55, ey - hy * hs - hx * hs * 0.55); ctx.closePath(); ctx.fill();
    // The flux's value at the bend.
    if (e.label) {
      const lx = 0.25 * sx + 0.5 * mx + 0.25 * ex, ly = 0.25 * sy + 0.5 * my + 0.25 * ey;
      ctx.font = `italic 10px ${FONT}`;
      const tw = ctx.measureText(e.label).width;
      ctx.fillStyle = pal.canvas; ctx.fillRect(lx - tw / 2 - 2, ly - 6, tw + 4, 12);
      label(ctx, e.label, lx, ly, e.red ? pal.accent : pal.muted, 'center', 10, true);
    }
  }
  for (const k of Object.keys(NODES)) {
    const [x, y] = P(k);
    ctx.font = `13px ${FONT}`;
    const tw = Math.max(ctx.measureText(NODES[k][2]).width, 40);
    ctx.fillStyle = pal.canvas; ctx.fillRect(x - tw / 2 - 4, y - 10, tw + 8, 26);
    label(ctx, NODES[k][2], x, y - 2, pal.text, 'center', 13);
    if (s.values[k]) label(ctx, s.values[k], x, y + 11, pal.muted, 'center', 10.5);
  }
}
