// The synoptic chart's lines (docs/PLAN.md, layer 8, "Diagnosed on the
// chart"), found on the weather's grid and drawn on the overlay:
//
//   fronts     where the surface temperature's gradient is strong and the
//              thermal front parameter, TFP = −∇|∇θ|·n̂ (n̂ = ∇θ/|∇θ|), peaks
//              along n̂: the zero of ∇TFP·n̂, traced on the grid's triangles
//              (Hewson's method, standard). Cold where the wind drives the cold
//              air forward (v·n̂ > 0), warm where it retreats, stationary
//              where it barely moves. Symbols point the way the front moves.
//   dry lines  over land, where moisture changes sharply and temperature
//              doesn't: the same tracer on the column's water
//   occluded   the stretch of a front within ~500 km of a deep low, where the
//              cold front has caught the warm one and lifted it
//   H and L    pressure's local extremes, two rings wide
// Each line is chained from its triangle segments, bridged where two pieces'
// ends meet and line up, smoothed, and kept if long enough to read. The fields
// and thresholds behind them are averaged over successive charts (about a
// quarter of a model day each at a day a second), so fronts move rather than
// flicker.

export const COLD = 1, WARM = 2, STATIONARY = 3, DRY = 4, OCCLUDED = 5;

function smoothField(g, f, passes) {
  const n = g.n, nbrOff = g.nbrOff, nbr = g.nbr, t = new Float64Array(n);
  for (let p = 0; p < passes; p++) {
    t.set(f);
    for (let i = 0; i < n; i++) {
      let s = 0, c = 0;
      for (let k = nbrOff[i], e = nbrOff[i + 1]; k < e; k++) { s += t[nbr[k]]; c++; }
      f[i] = 0.5 * t[i] + 0.5 * s / c;
    }
  }
  return f;
}

function grad(g, f, out) {
  const n = g.n, nbrOff = g.nbrOff, nbr = g.nbr, gw = g.gw;
  for (let i = 0; i < n; i++) {
    let x = 0, y = 0, z = 0;
    for (let k = nbrOff[i], e = nbrOff[i + 1]; k < e; k++) { const d = f[nbr[k]] - f[i]; x += d * gw[3 * k]; y += d * gw[3 * k + 1]; z += d * gw[3 * k + 2]; }
    out[3 * i] = x; out[3 * i + 1] = y; out[3 * i + 2] = z;
  }
  return out;
}

/** The locator (∇TFP·n̂), the strength |∇θ| and n̂, for a field on the grid (gradients per radian). */
function locate(g, field) {
  const n = g.n, f = smoothField(g, Float64Array.from(field), 4);
  const gf = grad(g, f, new Float64Array(3 * n)), G = new Float64Array(n), nh = new Float64Array(3 * n);
  for (let i = 0; i < n; i++) {
    const m = Math.hypot(gf[3 * i], gf[3 * i + 1], gf[3 * i + 2]);
    G[i] = m;
    nh[3 * i] = gf[3 * i] / (m || 1); nh[3 * i + 1] = gf[3 * i + 1] / (m || 1); nh[3 * i + 2] = gf[3 * i + 2] / (m || 1);
  }
  const gG = grad(g, G, new Float64Array(3 * n)), tfp = new Float64Array(n);
  for (let i = 0; i < n; i++) tfp[i] = -(gG[3 * i] * nh[3 * i] + gG[3 * i + 1] * nh[3 * i + 1] + gG[3 * i + 2] * nh[3 * i + 2]);
  const gT = grad(g, tfp, new Float64Array(3 * n)), loc = new Float64Array(n);
  for (let i = 0; i < n; i++) loc[i] = gT[3 * i] * nh[3 * i] + gT[3 * i + 1] * nh[3 * i + 1] + gT[3 * i + 2] * nh[3 * i + 2];
  return { G, nh, tfp, loc };
}

function percentile(a, mask, q) {
  const v = [];
  for (let i = 0; i < a.length; i++) if (mask(i)) v.push(a[i]);
  v.sort((x, y) => x - y);
  return v.length ? v[Math.min(v.length - 1, Math.floor(q * v.length))] : Infinity;
}

/** Zero contour of loc on triangles whose corners all pass `ok`, chained into polylines. */
function trace(g, loc, ok) {
  const { tris, nf, pos } = g;
  const segs = new Map();   // edge key → [segment ids]
  const S = [];             // segments: [keyA, keyB, pA, pB]
  const key = (a, b) => a < b ? a * 1e6 + b : b * 1e6 + a;
  const cross = (a, b) => {
    const t = loc[a] / (loc[a] - loc[b]);
    const x = pos[3 * a] + t * (pos[3 * b] - pos[3 * a]), y = pos[3 * a + 1] + t * (pos[3 * b + 1] - pos[3 * a + 1]), z = pos[3 * a + 2] + t * (pos[3 * b + 2] - pos[3 * a + 2]);
    const r = Math.hypot(x, y, z);
    return [x / r, y / r, z / r, a, b, t];
  };
  for (let f = 0; f < nf; f++) {
    const v = [tris[3 * f], tris[3 * f + 1], tris[3 * f + 2]];
    if (!ok(v[0]) || !ok(v[1]) || !ok(v[2])) continue;
    const pts = [];
    for (let e = 0; e < 3; e++) {
      const a = v[e], b = v[(e + 1) % 3];
      if ((loc[a] > 0) !== (loc[b] > 0)) pts.push({ k: key(a, b), p: cross(a, b) });
    }
    if (pts.length !== 2) continue;
    const id = S.length;
    S.push(pts);
    for (const q of pts) { if (!segs.has(q.k)) segs.set(q.k, []); segs.get(q.k).push(id); }
  }
  // Chain: walk from each unused segment both ways through shared edges.
  const used = new Uint8Array(S.length), lines = [];
  for (let s0 = 0; s0 < S.length; s0++) {
    if (used[s0]) continue;
    used[s0] = 1;
    const chain = [S[s0][0], S[s0][1]];
    for (const dir of [1, 0]) {
      let end = dir ? chain[chain.length - 1] : chain[0];
      for (;;) {
        const next = (segs.get(end.k) || []).find(id => !used[id]);
        if (next === undefined) break;
        used[next] = 1;
        const [a, b] = S[next];
        const far = a.k === end.k ? b : a;
        if (dir) chain.push(far); else chain.unshift(far);
        end = far;
      }
    }
    if (chain.length >= 5) lines.push(chain);
  }
  return lines;
}

/** Join chains whose ends meet (within `gap` rad) and line up; chains are arrays of {p}. */
function bridge(chains, gap) {
  const P = c => c.p, d3 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
  const dir = (a, b) => { const v = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], m = Math.hypot(...v) || 1; return v.map(x => x / m); };
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  let merged = true;
  while (merged) {
    merged = false;
    outer: for (let a = 0; a < chains.length; a++) {
      for (let b = 0; b < chains.length; b++) {
        if (a === b) continue;
        for (const flipB of [false, true]) {
          const A = chains[a], B = flipB ? chains[b].slice().reverse() : chains[b];
          const ae = P(A[A.length - 1]), bs = P(B[0]);
          if (d3(ae, bs) > gap) continue;
          const tA = dir(P(A[A.length - 2]), ae), tB = dir(bs, P(B[1])), tj = dir(ae, bs);
          if (dot(tA, tB) < 0.3 || (d3(ae, bs) > 1e-6 && dot(tA, tj) < 0.2)) continue;
          chains[a] = A.concat(B);
          chains.splice(b, 1);
          merged = true;
          break outer;
        }
      }
    }
  }
  return chains;
}

function chaikin(P, passes = 2) {
  for (let p = 0; p < passes; p++) {
    if (P.length < 3) break;
    const Q = [P[0]];
    for (let k = 0; k < P.length - 1; k++) {
      const a = P[k], b = P[k + 1];
      for (const f of [0.25, 0.75]) {
        const x = a[0] + f * (b[0] - a[0]), y = a[1] + f * (b[1] - a[1]), z = a[2] + f * (b[2] - a[2]), r = Math.hypot(x, y, z);
        Q.push([x / r, y / r, z / r, a[3] + f * (b[3] - a[3]), a[4] + f * (b[4] - a[4]), a[5] + f * (b[5] - a[5])]);
      }
    }
    Q.push(P[P.length - 1]);
    P = Q;
  }
  return P;
}

/** Interpolate a per-cell vector field at a crossing point (between cells a and b). */
const lerp3 = (F, a, b, t) => [F[3 * a] + t * (F[3 * b] - F[3 * a]), F[3 * a + 1] + t * (F[3 * b + 1] - F[3 * a + 1]), F[3 * a + 2] + t * (F[3 * b + 2] - F[3 * a + 2])];

/**
 * The chart's lines from the weather: fronts with a type at each point and
 * the side their symbols go (a unit vector, toward where the front moves),
 * dry lines with the moist side, and the highs and lows.
 */
export function chartLines(wx, pres) {
  const g = wx.grid, n = g.n, lat = wx.lat;
  const out = { fronts: [], dry: [], highs: [], lows: [] };
  const vNow = wx.wind();
  // Successive charts are averaged: the fields, and below, the thresholds.
  const st = wx.chartState || (wx.chartState = { th: Float64Array.from(wx.theta), qv: Float64Array.from(wx.qv), v: Float64Array.from(vNow), zeta: Float64Array.from(wx.zeta2), thr: null });
  for (let i = 0; i < n; i++) { st.th[i] = 0.5 * (st.th[i] + wx.theta[i]); st.qv[i] = 0.5 * (st.qv[i] + wx.qv[i]); st.zeta[i] = 0.5 * (st.zeta[i] + wx.zeta2[i]); }
  for (let i = 0; i < 3 * n; i++) st.v[i] = 0.5 * (st.v[i] + vNow[i]);
  const vel = st.v;
  // Highs and lows first: the occlusions are found near the deep lows.
  const lowsDeep = [];
  {
    const { nbrOff, nbr, pos } = g;
    for (let i = 0; i < n; i++) {
      if (Math.abs(lat[i]) < 0.26) continue;
      let mn = true, mx = true, s = 0, c = 0;
      for (let k = nbrOff[i], e = nbrOff[i + 1]; k < e; k++) {
        const j = nbr[k];
        for (let k2 = nbrOff[j], e2 = nbrOff[j + 1]; k2 < e2; k2++) {
          const m = nbr[k2];
          if (m === i) continue;
          if (pres[m] <= pres[i]) mn = false;
          if (pres[m] >= pres[i]) mx = false;
          s += pres[m]; c++;
        }
      }
      const d = pres[i] - s / c;
      const Pt = [pos[3 * i], pos[3 * i + 1], pos[3 * i + 2]];
      if (mn && d < -3) { out.lows.push({ p: Pt, v: pres[i] }); if (d < -4) lowsDeep.push(Pt); }
      if (mx && d > 3) out.highs.push({ p: Pt, v: pres[i] });
    }
  }
  // Fronts on the surface temperature.
  const T = locate(g, st.th);
  const mid = i => Math.abs(lat[i]) > 0.35 && Math.abs(lat[i]) < 1.35;
  const raw = { g: percentile(T.G, mid, 0.74) };
  raw.t = percentile(T.tfp, i => mid(i) && T.G[i] > raw.g, 0.4);
  st.thr = st.thr ? { g: 0.7 * st.thr.g + 0.3 * raw.g, t: 0.7 * st.thr.t + 0.3 * raw.t } : raw;
  const g70 = st.thr.g, t60 = st.thr.t;
  // Fronts lie in troughs: the low-level flow turns cyclonically there.
  const cyc = i => st.zeta[i] * Math.sign(lat[i]) > 0;
  const okF = i => mid(i) && T.G[i] > g70 && T.tfp[i] > t60 && cyc(i);
  // The wind across each front point; fronts are typed against this chart's own
  // typical value: low-level flow runs nearly along the isotherms in this model,
  // so an absolute threshold would call almost every front stationary.
  const traced = bridge(trace(g, T.loc, okF), 0.045).map(chain => {
    const P = chaikin(chain.map(c => { const [x, y, z, a, b, t] = c.p; return [x, y, z, a, b, t]; }));
    const adv = P.map(q => {
      const a = Math.round(q[3]), b = Math.round(q[4]), t = q[5];
      const nh = lerp3(T.nh, a, b, t), v = lerp3(vel, a, b, t);
      return v[0] * nh[0] + v[1] * nh[1] + v[2] * nh[2];   // > 0: wind from cold toward warm
    });
    return { P, adv };
  });
  const allAdv = traced.flatMap(f => f.adv.map(Math.abs)).sort((x, y) => x - y);
  const rawCut = allAdv.length ? 0.45 * allAdv[allAdv.length >> 1] : 1;
  st.cut = st.cut ? 0.7 * st.cut + 0.3 * rawCut : rawCut;
  for (const { P, adv } of traced) {
    const pts = new Float32Array(3 * P.length), side = new Float32Array(3 * P.length), type = new Uint8Array(P.length);
    P.forEach((q, k) => {
      pts[3 * k] = q[0]; pts[3 * k + 1] = q[1]; pts[3 * k + 2] = q[2];
      const a = Math.round(q[3]), b = Math.round(q[4]), t = q[5];
      const nh = lerp3(T.nh, a, b, t);
      type[k] = adv[k] > st.cut ? COLD : adv[k] < -st.cut ? WARM : STATIONARY;
      side[3 * k] = nh[0]; side[3 * k + 1] = nh[1]; side[3 * k + 2] = nh[2];   // toward the warm air, for now
    });
    // Runs: a front's type reads in stretches, not point by point. A majority over
    // ±8 points, then runs shorter than 10 points join their neighbour.
    const M = P.length, maj = new Uint8Array(M);
    for (let k = 0; k < M; k++) {
      const cnt = [0, 0, 0, 0];
      for (let q = Math.max(0, k - 8); q <= Math.min(M - 1, k + 8); q++) cnt[type[q]]++;
      maj[k] = cnt[COLD] >= cnt[WARM] && cnt[COLD] >= cnt[STATIONARY] ? COLD : cnt[WARM] >= cnt[STATIONARY] ? WARM : STATIONARY;
    }
    for (let k = 0; k < M;) {
      let e = k;
      while (e < M && maj[e] === maj[k]) e++;
      if (e - k < 10 && (k > 0 || e < M)) { const fill = k > 0 ? maj[k - 1] : maj[e]; for (let q = k; q < e; q++) maj[q] = fill; }
      k = e;
    }
    type.set(maj);
    // Occlusion: the stretch near a deep low.
    for (let q = 0; q < M; q++) {
      for (const L of lowsDeep) {
        if (P[q][0] * L[0] + P[q][1] * L[1] + P[q][2] * L[2] > Math.cos(0.1)) { type[q] = OCCLUDED; break; }
      }
    }
    // Symbols point where the front moves: toward the warm air for a cold front, the cold for a warm one.
    for (let q = 0; q < M; q++) if (type[q] === WARM) { side[3 * q] *= -1; side[3 * q + 1] *= -1; side[3 * q + 2] *= -1; }
    // A front's symbols keep to one side through each run: the side's majority there.
    for (let k = 0; k < M;) {
      let e = k;
      while (e < M && type[e] === type[k]) e++;
      let sx = 0, sy = 0, sz = 0;
      for (let q = k; q < e; q++) { sx += side[3 * q]; sy += side[3 * q + 1]; sz += side[3 * q + 2]; }
      for (let q = k; q < e; q++) {
        // Keep each point's own direction, flipped to agree with the run's.
        if (side[3 * q] * sx + side[3 * q + 1] * sy + side[3 * q + 2] * sz < 0) { side[3 * q] *= -1; side[3 * q + 1] *= -1; side[3 * q + 2] *= -1; }
      }
      k = e;
    }
    out.fronts.push({ P: pts, side, type });
  }
  // Dry lines: over land, moisture sharp and temperature not.
  const Q = locate(g, st.qv);
  const okD = i => wx.land[i] > 0.6 && Math.abs(lat[i]) > 0.2 && Math.abs(lat[i]) < 0.9;
  const q80 = percentile(Q.G, okD, 0.85), tq = percentile(Q.tfp, i => okD(i) && Q.G[i] > q80, 0.4);
  const okDry = i => okD(i) && Q.G[i] > q80 && Q.tfp[i] > tq && T.G[i] < g70;
  for (const chain of trace(g, Q.loc, okDry)) {
    let P = chaikin(chain.map(c => c.p));
    const pts = new Float32Array(3 * P.length), side = new Float32Array(3 * P.length);
    P.forEach((q, k) => {
      pts[3 * k] = q[0]; pts[3 * k + 1] = q[1]; pts[3 * k + 2] = q[2];
      const nh = lerp3(Q.nh, Math.round(q[3]), Math.round(q[4]), q[5]);
      side[3 * k] = nh[0]; side[3 * k + 1] = nh[1]; side[3 * k + 2] = nh[2];   // toward the moist air
    });
    out.dry.push({ P: pts, side });
  }
  return out;
}

const withAlpha = (hex, a) => { const h = hex.replace('#', ''); return `rgba(${parseInt(h.slice(0, 2), 16)}, ${parseInt(h.slice(2, 4), 16)}, ${parseInt(h.slice(4, 6), 16)}, ${a})`; };

/** Draw the chart's symbols: fronts (cold triangles in prussian, warm semicircles in sienna,
 * stationary alternating), dry lines (ochre scallops toward the moist side), H and L. */
export function drawChart(ctx, cx, cy, r, camera, chart, pal, fade = 1, sc = 1) {
  if (!chart || fade <= 0.01) return;
  ctx.save();
  ctx.globalAlpha = fade;
  const v = [0, 0, 0], sv = [0, 0, 0];
  const project = (P, k) => { camera.view(P[3 * k], P[3 * k + 1], P[3 * k + 2], v); return [cx + v[0] * r, cy - v[1] * r, v[2]]; };
  const sideOnScreen = (side, k, x, y, P) => {
    // A point a little along the side vector, projected; its direction from the line's point.
    const e = 0.01;
    camera.view(P[3 * k] + e * side[3 * k], P[3 * k + 1] + e * side[3 * k + 1], P[3 * k + 2] + e * side[3 * k + 2], sv);
    const dx = cx + sv[0] * r - x, dy = cy - sv[1] * r - y, m = Math.hypot(dx, dy) || 1;
    return [dx / m, dy / m];
  };
  const inkOf = t => t === COLD ? pal.inks.prussian : t === WARM ? pal.inks.sienna : pal.inks.mulberry;   // occluded: mulberry
  const GAP = 22 * sc, SZ = 4.6 * sc, lw = Math.sqrt(sc);
  for (const fr of chart.fronts) {
    const M = fr.type.length;
    const S = Array.from({ length: M }, (_, k) => project(fr.P, k));
    ctx.lineWidth = 1.6 * lw; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (let k = 0; k < M - 1; k++) {
      if (S[k][2] < 0.05 || S[k + 1][2] < 0.05) continue;
      ctx.strokeStyle = fr.type[k] === STATIONARY ? (Math.floor(k / 4) % 2 ? pal.inks.prussian : pal.inks.sienna) : inkOf(fr.type[k]);
      ctx.beginPath(); ctx.moveTo(S[k][0], S[k][1]); ctx.lineTo(S[k + 1][0], S[k + 1][1]); ctx.stroke();
    }
    let d = GAP / 2, nsym = 0;
    for (let k = 0; k < M - 1; k++) {
      const [ax, ay, az] = S[k], [bx, by, bz] = S[k + 1];
      if (az < 0.05 || bz < 0.05) continue;
      const seg = Math.hypot(bx - ax, by - ay);
      if (seg < 1e-6) continue;
      const tx = (bx - ax) / seg, ty = (by - ay) / seg;
      let s = 0;
      while (s + d <= seg) {
        s += d; d = GAP;
        const px = ax + tx * s, py = ay + ty * s;
        let [nx, ny] = sideOnScreen(fr.side, k, ax, ay, fr.P);
        // Perpendicular to the line, on the side's half.
        const pdot = nx * -ty + ny * tx;
        nx = -ty * Math.sign(pdot || 1); ny = tx * Math.sign(pdot || 1);
        // A stationary front alternates its symbols, each on its own side; an
        // occluded one alternates them on one side, in mulberry.
        const ft = fr.type[k];
        const t = ft === STATIONARY || ft === OCCLUDED ? (nsym % 2 ? COLD : WARM) : ft;
        const sgn = ft === STATIONARY && t === WARM ? -1 : 1;
        ctx.fillStyle = ft === OCCLUDED ? pal.inks.mulberry : ft === STATIONARY ? (t === COLD ? pal.inks.prussian : pal.inks.sienna) : inkOf(t);
        ctx.beginPath();
        if (t === COLD) {
          ctx.moveTo(px - tx * SZ, py - ty * SZ);
          ctx.lineTo(px + sgn * nx * SZ * 1.5, py + sgn * ny * SZ * 1.5);
          ctx.lineTo(px + tx * SZ, py + ty * SZ);
        } else {
          const ang = Math.atan2(ty, tx);
          ctx.arc(px, py, SZ * 0.95, ang, ang + Math.PI, (sgn * nx) * -ty + (sgn * ny) * tx > 0 ? false : true);
        }
        ctx.closePath(); ctx.fill();
        nsym++;
      }
      d -= seg - s;
    }
  }
  // Dry lines: an ochre line with open scallops toward the moist air.
  for (const dl of chart.dry) {
    const M = dl.P.length / 3;
    const S = Array.from({ length: M }, (_, k) => project(dl.P, k));
    ctx.strokeStyle = pal.inks.ochre; ctx.lineWidth = 1.3 * lw;
    ctx.beginPath();
    let on = false;
    for (let k = 0; k < M; k++) { if (S[k][2] < 0.05) { on = false; continue; } if (on) ctx.lineTo(S[k][0], S[k][1]); else ctx.moveTo(S[k][0], S[k][1]); on = true; }
    ctx.stroke();
    let d = 8 * sc;
    for (let k = 0; k < M - 1; k++) {
      const [ax, ay, az] = S[k], [bx, by, bz] = S[k + 1];
      if (az < 0.05 || bz < 0.05) continue;
      const seg = Math.hypot(bx - ax, by - ay); if (seg < 1e-6) continue;
      const tx = (bx - ax) / seg, ty = (by - ay) / seg;
      let s = 0;
      while (s + d <= seg) {
        s += d; d = 16 * sc;
        const px = ax + tx * s, py = ay + ty * s;
        const [nx, ny] = sideOnScreen(dl.side, k, ax, ay, dl.P);
        const ccw = nx * -ty + ny * tx > 0;
        const ang = Math.atan2(ty, tx);
        ctx.beginPath(); ctx.arc(px, py, 3.6 * sc, ang, ang + Math.PI, !ccw); ctx.stroke();
      }
      d -= seg - s;
    }
  }
  // H and L, in the text's ink.
  ctx.font = `600 ${Math.round(15 * Math.min(2, Math.sqrt(sc)))}px 'Newsreader', 'STIX Two Text', serif`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (const [list, L] of [[chart.highs, 'H'], [chart.lows, 'L']]) {
    for (const h of list) {
      camera.view(h.p[0], h.p[1], h.p[2], v);
      if (v[2] < 0.1) continue;
      const x = cx + v[0] * r, y = cy - v[1] * r;
      ctx.fillStyle = L === 'L' ? pal.text : withAlpha(pal.text, 0.75);
      ctx.fillText(L, x, y);
    }
  }
  ctx.restore();
}
