// The synoptic chart, traced off the page's thread (src/render/chart.js). The
// page sends the weather's lower layer as read from the GPU (ψ₂, surface
// temperature, moisture) with the climate's template pressure at the season;
// this restricts the weather to the chart's grid (a level coarser: tracing on
// 55 km cells costs ~6× as much and the chart's fields are smoothed past that
// scale anyway), derives the wind, vorticity and the storms' pressure (ρfψ₂
// less its zonal mean) and returns the chart's lines.
//
// It also traces the Climate view's Air chart (src/render/streamlines.js): the
// page sends the template's pressure at the shown date (or the year's mean) on
// a grid no finer than 110 km, and this derives the surface wind by the
// climate's own formula and returns its streamlines.
import { buildGrid } from '../grid/icosphere.js';
import { makeTransfer, restrict } from '../grid/transfer.js';
import { chartLines } from './chart.js';
import { surfaceWind } from '../engine/climate.js';
import { traceStreamlines } from './streamlines.js';

const A_M = 6.371e6, OMEGA = 7.292e-5, NB = 60;
let g = null, T = null, lat = null, band = null, state = {}, zeta2, vel, pc;
let airGrid = null, airWind = null, airGp = null;

self.onmessage = e => {
  const m = e.data;
  if (m.type === 'init') {
    g = buildGrid(m.chartLevel ?? m.level);
    if (g.level < m.level) T = makeTransfer(buildGrid(m.level), g);
    lat = Float64Array.from({ length: g.n }, (_, i) => Math.asin(g.pos[3 * i + 2]));
    band = Int16Array.from(lat, l => Math.min(NB - 1, Math.floor((l / Math.PI + 0.5) * NB)));
    zeta2 = new Float64Array(g.n); vel = new Float64Array(3 * g.n); pc = new Float64Array(g.n);
    return;
  }
  if (m.type === 'reset') { state = {}; return; }
  if (m.type === 'air') {
    const ag = g && g.level === m.level ? g : (airGrid && airGrid.level === m.level ? airGrid : (airGrid = buildGrid(m.level)));
    if (!airWind || airWind.length !== 3 * ag.n) { airWind = new Float32Array(3 * ag.n); airGp = new Float64Array(3 * ag.n); }
    const { lines, maxWind } = traceStreamlines(ag, surfaceWind(ag, m.pres, m.omega, airWind, null, airGp), m.dsep);
    const transfer = [];
    for (const l of lines) transfer.push(l.P.buffer, l.V.buffer, l.S.buffer);
    self.postMessage({ type: 'air', id: m.id, dsep: m.dsep, lines, maxWind }, transfer);
    return;
  }
  let { psi2, theta, qv } = m;
  if (T) { psi2 = restrict(T, psi2, new Float64Array(g.n)); theta = restrict(T, theta, new Float64Array(g.n)); qv = restrict(T, qv, new Float64Array(g.n)); }
  let { pres, land } = m;
  if (T && pres.length !== g.n) { pres = restrict(T, pres, new Float64Array(g.n)); land = restrict(T, land, new Float64Array(g.n)); }
  const { t } = m, n = g.n, { nbrOff, nbr, ell, dist, gw, pos, area } = g;
  const zs = new Float64Array(NB), za = new Float64Array(NB);
  let maxWind = 0;
  for (let i = 0; i < n; i++) {
    let s = 0, gx = 0, gy = 0, gz = 0;
    for (let k = nbrOff[i], e = nbrOff[i + 1]; k < e; k++) {
      const d = psi2[nbr[k]] - psi2[i];
      s += ell[k] / dist[k] * d;
      gx += d * gw[3 * k]; gy += d * gw[3 * k + 1]; gz += d * gw[3 * k + 2];
    }
    zeta2[i] = s / (area[i] * A_M * A_M);
    const x = pos[3 * i], y = pos[3 * i + 1], z = pos[3 * i + 2];
    vel[3 * i] = (y * gz - z * gy) / A_M; vel[3 * i + 1] = (z * gx - x * gz) / A_M; vel[3 * i + 2] = (x * gy - y * gx) / A_M;
    maxWind = Math.max(maxWind, Math.hypot(vel[3 * i], vel[3 * i + 1], vel[3 * i + 2]));
    const p = 1.2 * 2 * OMEGA * z * psi2[i] / 100;
    pc[i] = p; zs[band[i]] += p; za[band[i]]++;
  }
  // Less the zonal mean, linear between the bands' centres.
  for (let b = 0; b < NB; b++) zs[b] /= za[b] || 1;
  for (let i = 0; i < n; i++) {
    const x = Math.min(NB - 1, Math.max(0, (lat[i] / Math.PI + 0.5) * NB - 0.5)), b0 = Math.floor(x), b1 = Math.min(NB - 1, b0 + 1);
    pc[i] = pres[i] + pc[i] - (zs[b0] + (x - b0) * (zs[b1] - zs[b0]));
  }
  const chart = chartLines({ grid: g, lat, theta, qv, zeta2, vel, land, t }, pc, state);
  chart.maxWind = maxWind;
  chart.lows.forEach(l => { l.p = Array.from(l.p); });
  const transfer = [];
  for (const k of ['fronts', 'dry', 'troughs', 'ridges', 'shear']) for (const l of chart[k]) for (const a of Object.values(l)) if (ArrayBuffer.isView(a)) transfer.push(a.buffer);
  self.postMessage(chart, transfer);
};
