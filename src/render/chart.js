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
//   occluded   where a cold front has caught its warm front: stretches of the
//              two lying within ~400 km of each other merge along their midline
//   troughs, ridges   pressure's long axes of low and high (ridge lines of −p and
//              p by the Hessian), troughs not drawn where a front already is
//   shear lines   subtropical ridges of cyclonic vorticity where temperature
//              barely changes (a cold front's remains)
//   H and L    pressure's local extremes, two rings wide
// Each line is chained from its triangle segments, bridged where two pieces'
// ends meet and line up, smoothed, and kept if long enough to read. The fields
// and thresholds behind them are averaged over successive charts (about a
// quarter of a model day each at a day a second), so fronts move rather than
// flicker.

import { matchLines, morphed } from './overlay.js';

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
  const n = g.n, f = smoothField(g, Float64Array.from(field), 6 * scale(g));
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
  // The locator falls through zero at a maximum of TFP along n̂, rises through it at a
  // minimum: the minima would draw a second front beside each real one.
  const gL = grad(g, loc, new Float64Array(3 * n)), curv = new Float64Array(n);
  for (let i = 0; i < n; i++) curv[i] = gL[3 * i] * nh[3 * i] + gL[3 * i + 1] * nh[3 * i + 1] + gL[3 * i + 2] * nh[3 * i + 2];
  return { G, nh, tfp, loc, curv, f };
}

function percentile(a, mask, q) {
  const v = new Float64Array(a.length);
  let m = 0;
  for (let i = 0; i < a.length; i++) if (mask(i)) v[m++] = a[i];
  const u = v.subarray(0, m).sort();
  return m ? u[Math.min(m - 1, Math.floor(q * m))] : Infinity;
}

// Counts on the grid's own lines (smoothing passes, chain lengths) scale with
// its cells, so the chart reads alike at every level; after corner-cutting,
// one pass fewer per level up keeps the points as dense as they were.
const scale = g => 2 ** (g.level - 5);
const cuts = (g, passes) => Math.max(1, passes - (g.level - 5));

/** Each cell's neighbours out to R rings (cached per grid and R). */
function rings(g, R) {
  const key = `rings${R}`;
  if (g[key]) return g[key];
  const { n, nbrOff, nbr } = g, off = new Int32Array(n + 1), list = [];
  const mark = new Int32Array(n).fill(-1);
  for (let i = 0; i < n; i++) {
    let front = [i];
    mark[i] = i;
    for (let r = 0; r < R; r++) {
      const next = [];
      for (const a of front) for (let t = nbrOff[a], e = nbrOff[a + 1]; t < e; t++) { const b = nbr[t]; if (mark[b] !== i) { mark[b] = i; next.push(b); list.push(b); } }
      front = next;
    }
    off[i + 1] = list.length;
  }
  return (g[key] = { off, list: Int32Array.from(list) });
}

/** Zero contour of loc on triangles whose corners all pass `ok`, chained into polylines. */
function trace(g, loc, ok, local = null) {
  const { tris, nf, pos } = g;
  const segs = new Map();   // edge key → [segment ids]
  const S = [];             // segments: [keyA, keyB, pA, pB]
  const key = (a, b) => a < b ? a * 1e6 + b : b * 1e6 + a;
  let la = 0, lb = 0;
  const cross = (a, b) => {
    const t = la / (la - lb);
    const x = pos[3 * a] + t * (pos[3 * b] - pos[3 * a]), y = pos[3 * a + 1] + t * (pos[3 * b + 1] - pos[3 * a + 1]), z = pos[3 * a + 2] + t * (pos[3 * b + 2] - pos[3 * a + 2]);
    const r = Math.hypot(x, y, z);
    return [x / r, y / r, z / r, a, b, t];
  };
  for (let f = 0; f < nf; f++) {
    const v = [tris[3 * f], tris[3 * f + 1], tris[3 * f + 2]];
    if (!ok(v[0]) || !ok(v[1]) || !ok(v[2])) continue;
    const pts = [];
    const L3 = local ? local(v) : [loc[v[0]], loc[v[1]], loc[v[2]]];
    for (let e = 0; e < 3; e++) {
      const a = v[e], b = v[(e + 1) % 3];
      la = L3[e]; lb = L3[(e + 1) % 3];
      if ((la > 0) !== (lb > 0)) pts.push({ k: key(a, b), p: cross(a, b) });
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
    if (chain.length >= 5 * scale(g)) lines.push(chain);
  }
  return lines;
}

/**
 * Ridge lines of f (maxima across the line, not along it): where ∇f·e = 0 for e
 * the Hessian's eigenvector of most negative eigenvalue λ₁, and λ₁ is strong
 * while λ₂ is weak (the line is long, not a round peak). An eigenvector's sign
 * is arbitrary, so each triangle aligns its corners' before finding the zero.
 */
function ridgeLines(g, f, ok, q = 0.85) {
  const n = g.n, pos = g.pos, tan = g.tan, nbrOff = g.nbrOff;
  const gf = grad(g, f, new Float64Array(3 * n));
  const comp = c => Float64Array.from({ length: n }, (_, i) => gf[3 * i + c]);
  const hx = grad(g, comp(0), new Float64Array(3 * n)), hy = grad(g, comp(1), new Float64Array(3 * n)), hz = grad(g, comp(2), new Float64Array(3 * n));
  const ev = new Float64Array(3 * n), l1 = new Float64Array(n), l2 = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const t = 3 * nbrOff[i], e1 = [tan[t], tan[t + 1], tan[t + 2]], p = [pos[3 * i], pos[3 * i + 1], pos[3 * i + 2]];
    const e2 = [p[1] * e1[2] - p[2] * e1[1], p[2] * e1[0] - p[0] * e1[2], p[0] * e1[1] - p[1] * e1[0]];
    const Hv = v => [hx[3 * i] * v[0] + hx[3 * i + 1] * v[1] + hx[3 * i + 2] * v[2], hy[3 * i] * v[0] + hy[3 * i + 1] * v[1] + hy[3 * i + 2] * v[2], hz[3 * i] * v[0] + hz[3 * i + 1] * v[1] + hz[3 * i + 2] * v[2]];
    const d3 = (u, v) => u[0] * v[0] + u[1] * v[1] + u[2] * v[2];
    const H1 = Hv(e1), H2 = Hv(e2);
    const a = d3(e1, H1), d = d3(e2, H2), b = 0.5 * (d3(e1, H2) + d3(e2, H1));
    const m = 0.5 * (a + d), r = Math.hypot(0.5 * (a - d), b);
    l1[i] = m - r; l2[i] = m + r;
    let u0 = b, u1 = l1[i] - a;
    if (Math.abs(u0) + Math.abs(u1) < 1e-12) { u0 = l1[i] - d; u1 = b; }
    const um = Math.hypot(u0, u1) || 1;
    for (let c = 0; c < 3; c++) ev[3 * i + c] = (u0 * e1[c] + u1 * e2[c]) / um;
  }
  const strong = percentile(l1, ok, 1 - q);
  const okR = i => ok(i) && l1[i] < strong && l1[i] < 0 && l2[i] > 0.35 * l1[i];
  const local = v => {
    const [a, b, c] = v, sgn = j => (ev[3 * j] * ev[3 * a] + ev[3 * j + 1] * ev[3 * a + 1] + ev[3 * j + 2] * ev[3 * a + 2]) < 0 ? -1 : 1;
    const L = j => gf[3 * j] * ev[3 * j] + gf[3 * j + 1] * ev[3 * j + 1] + gf[3 * j + 2] * ev[3 * j + 2];
    return [L(a), sgn(b) * L(b), sgn(c) * L(c)];
  };
  return trace(g, null, okR, local).map(chain => chaikin(relax(chain.map(c => c.p.slice()), 6 * scale(g)), cuts(g, 3)));
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

/** Laplacian relaxation of a chain's positions (ends held), before corner-cutting. */
function relax(P, passes = 3) {
  for (let pass = 0; pass < passes; pass++) {
    const Q = P.map(q => q.slice());
    for (let k = 1; k < P.length - 1; k++) {
      const x = 0.5 * Q[k][0] + 0.25 * (Q[k - 1][0] + Q[k + 1][0]), y = 0.5 * Q[k][1] + 0.25 * (Q[k - 1][1] + Q[k + 1][1]), z = 0.5 * Q[k][2] + 0.25 * (Q[k - 1][2] + Q[k + 1][2]);
      const r = Math.hypot(x, y, z);
      P[k][0] = x / r; P[k][1] = y / r; P[k][2] = z / r;
    }
  }
  return P;
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
export function chartLines(wx, pres, st) {
  const g = wx.grid, n = g.n, lat = wx.lat, S = 2 ** (g.level - 5);
  const out = { fronts: [], dry: [], highs: [], lows: [], troughs: [], ridges: [], shear: [], t: wx.t };
  const vNow = wx.vel;
  // Successive charts are averaged: the fields, and below, the thresholds.
  if (!st.th) Object.assign(st, { th: Float64Array.from(wx.theta), qv: Float64Array.from(wx.qv), v: Float64Array.from(vNow), zeta: Float64Array.from(wx.zeta2), thr: null });
  for (let i = 0; i < n; i++) { st.th[i] = 0.5 * (st.th[i] + wx.theta[i]); st.qv[i] = 0.5 * (st.qv[i] + wx.qv[i]); st.zeta[i] = 0.5 * (st.zeta[i] + wx.zeta2[i]); }
  for (let i = 0; i < 3 * n; i++) st.v[i] = 0.5 * (st.v[i] + vNow[i]);
  const vel = st.v;
  // Highs and lows first: the occlusions are found near the deep lows.
  // An extreme over ~440 km (two rings of 220 km cells): a cell beats every cell that near.
  {
    // Extremes of the pressure eased at the scale of 220 km cells (so ripples along a trough
    // aren't each a low), at least 1 hPa from their surroundings.
    const { pos } = g, R = rings(g, 2 * S), pr = smoothField(g, Float64Array.from(pres), S * S);
    for (let i = 0; i < n; i++) {
      if (Math.abs(lat[i]) < 0.26) continue;
      let mn = true, mx = true, s = 0;
      const o = R.off[i], e = R.off[i + 1];
      for (let k = o; k < e; k++) {
        const m = R.list[k];
        if (pr[m] <= pr[i]) mn = false;
        if (pr[m] >= pr[i]) mx = false;
        if (!mn && !mx) break;
        s += pres[m];
      }
      if (!mn && !mx) continue;
      const d = pres[i] - s / (e - o);
      const Pt = [pos[3 * i], pos[3 * i + 1], pos[3 * i + 2]];
      const Vt = [vel[3 * i], vel[3 * i + 1], vel[3 * i + 2]];
      if (mn && d < -1) out.lows.push({ p: Pt, v: pres[i], V: Vt });
      if (mx && d > 1) out.highs.push({ p: Pt, v: pres[i], V: Vt });
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
  const okF = i => mid(i) && T.G[i] > g70 && T.tfp[i] > t60 && cyc(i) && T.curv[i] < 0;
  // The wind across each front point; fronts are typed against this chart's own
  // typical value: low-level flow runs nearly along the isotherms in this model,
  // so an absolute threshold would call almost every front stationary.
  const traced = bridge(trace(g, T.loc, okF), 0.065).map(chain => {
    const P = chaikin(relax(chain.map(c => { const [x, y, z, a, b, t] = c.p; return [x, y, z, a, b, t]; }), 4 * S), cuts(g, 2));
    const V = [];
    const adv = P.map(q => {
      const a = Math.round(q[3]), b = Math.round(q[4]), t = q[5];
      const nh = lerp3(T.nh, a, b, t), v = lerp3(vel, a, b, t);
      V.push(v);
      return v[0] * nh[0] + v[1] * nh[1] + v[2] * nh[2];   // > 0: wind from cold toward warm
    });
    return { P, adv, V };
  });
  const allAdv = traced.flatMap(f => f.adv.map(Math.abs)).sort((x, y) => x - y);
  const rawCut = allAdv.length ? 0.45 * allAdv[allAdv.length >> 1] : 1;
  st.cut = st.cut ? 0.7 * st.cut + 0.3 * rawCut : rawCut;
  const runs = [];   // stretches of one type: { P: [[x,y,z]], V: [[vx,vy,vz]], side: [[...]], type }
  for (const { P, adv, V } of traced) {
    const M = P.length, type = new Uint8Array(M), side = P.map(q => lerp3(T.nh, Math.round(q[3]), Math.round(q[4]), q[5]));   // toward the warm air
    for (let k = 0; k < M; k++) type[k] = adv[k] > st.cut ? COLD : adv[k] < -st.cut ? WARM : STATIONARY;
    // A front's type reads in stretches: a majority over ±8 points, then runs under 10 points join their neighbour.
    const maj = new Uint8Array(M);
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
    for (let k = 0; k < M;) {
      let e = k;
      while (e < M && maj[e] === maj[k]) e++;
      // Overlap one point so neighbouring runs still meet.
      const a = Math.max(0, k - 1);
      runs.push({ P: P.slice(a, e).map(q => [q[0], q[1], q[2]]), V: V.slice(a, e), side: side.slice(a, e), type: maj[k] });
      k = e;
    }
  }
  // Pairs of stretches lying side by side, ~400 km apart or closer: a cold one
  // against a warm one is a cold front that has caught its warm front, so they
  // merge into an occluded front along their shared course; two of one type are
  // one front found twice, and the shorter goes; so does any stretch lying right on
// a longer one, whatever its type.
  const near = (A, B, D) => {
    const c = Math.cos(D);
    const hit = new Uint8Array(A.P.length), mate = new Int32Array(A.P.length).fill(-1);
    for (let k = 0; k < A.P.length; k++) {
      const p = A.P[k];
      let best = c, bj = -1;
      for (let j = 0; j < B.P.length; j++) { const q = B.P[j], d = p[0] * q[0] + p[1] * q[1] + p[2] * q[2]; if (d > best) { best = d; bj = j; } }
      if (bj >= 0) { hit[k] = 1; mate[k] = bj; }
    }
    return { hit, mate, share: hit.reduce((x, y) => x + y, 0) / Math.max(1, A.P.length) };
  };
  runs.sort((a, b) => b.P.length - a.P.length);
  const kept = [];
  for (const r of runs) {
    let drop = false;
    for (const k of kept) if ((k.type === r.type || near(r, k, 0.03).share > 0.6) && near(r, k, 0.045).share > 0.6) { drop = true; break; }
    if (!drop) kept.push(r);
  }
  const occluded = [];
  for (const c of kept) {
    if (c.type !== COLD || c.dead) continue;
    for (const w of kept) {
      if (w.type !== WARM || w.dead) continue;
      const m = near(c, w, 0.06);
      if (m.share < 0.4) continue;
      // The occlusion runs along the midline of the matched stretch.
      const O = { P: [], V: [], side: [], type: OCCLUDED };
      for (let k = 0; k < c.P.length; k++) {
        if (!m.hit[k]) continue;
        const a = c.P[k], b = w.P[m.mate[k]], x = a[0] + b[0], y = a[1] + b[1], z = a[2] + b[2], r = Math.hypot(x, y, z);
        O.P.push([x / r, y / r, z / r]); O.V.push(c.V[k]); O.side.push(c.side[k]);
      }
      if (O.P.length >= 5) occluded.push(O);
      // What's left of each: the cold front's unmatched part, the warm front's part beyond the match.
      const keepIdx = (R, hit) => { const idx = []; for (let k = 0; k < R.P.length; k++) if (!hit[k]) idx.push(k); return idx; };
      const cl = keepIdx(c, m.hit), wHit = new Uint8Array(w.P.length);
      for (let k = 0; k < c.P.length; k++) if (m.hit[k]) wHit[m.mate[k]] = 1;
      // Grow the warm front's matched set to the span between its first and last match.
      let lo = w.P.length, hi = -1;
      for (let j = 0; j < w.P.length; j++) if (wHit[j]) { lo = Math.min(lo, j); hi = Math.max(hi, j); }
      for (let j = lo; j <= hi; j++) wHit[j] = 1;
      const wl = keepIdx(w, wHit);
      const cut = (R, idx) => ({ P: idx.map(k => R.P[k]), V: idx.map(k => R.V[k]), side: idx.map(k => R.side[k]), type: R.type });
      Object.assign(c, cut(c, cl)); Object.assign(w, cut(w, wl));
      if (c.P.length < 5) { c.dead = true; break; }
    }
  }
  for (const r of [...kept.filter(r => !r.dead && r.P.length >= 5), ...occluded]) {
    const M = r.P.length, pts = new Float32Array(3 * M), side = new Float32Array(3 * M), V = new Float32Array(3 * M);
    // Symbols point where the front moves: toward the warm air (cold, occluded), the cold (warm); one side per stretch.
    const sg = r.type === WARM ? -1 : 1;
    let sx = 0, sy = 0, sz = 0;
    for (let k = 0; k < M; k++) { sx += r.side[k][0]; sy += r.side[k][1]; sz += r.side[k][2]; }
    for (let k = 0; k < M; k++) {
      pts.set(r.P[k], 3 * k); V.set(r.V[k], 3 * k);
      const d = r.side[k], f = d[0] * sx + d[1] * sy + d[2] * sz < 0 ? -sg : sg;
      side[3 * k] = f * d[0]; side[3 * k + 1] = f * d[1]; side[3 * k + 2] = f * d[2];
    }
    out.fronts.push({ P: pts, side, V, type: new Uint8Array(M).fill(r.type) });
  }
  // Dry lines: over land, moisture sharp and temperature not.
  const Q = locate(g, st.qv);
  const okD = i => wx.land[i] > 0.6 && Math.abs(lat[i]) > 0.2 && Math.abs(lat[i]) < 0.9;
  const q80 = percentile(Q.G, okD, 0.85), tq = percentile(Q.tfp, i => okD(i) && Q.G[i] > q80, 0.4);
  const okDry = i => okD(i) && Q.G[i] > q80 && Q.tfp[i] > tq && T.G[i] < g70;
  for (const chain of trace(g, Q.loc, okDry)) {
    let P = chaikin(relax(chain.map(c => c.p.slice()), 4 * S), cuts(g, 2));
    const pts = new Float32Array(3 * P.length), side = new Float32Array(3 * P.length), V = new Float32Array(3 * P.length);
    P.forEach((q, k) => {
      pts[3 * k] = q[0]; pts[3 * k + 1] = q[1]; pts[3 * k + 2] = q[2];
      const nh = lerp3(Q.nh, Math.round(q[3]), Math.round(q[4]), q[5]);
      side[3 * k] = nh[0]; side[3 * k + 1] = nh[1]; side[3 * k + 2] = nh[2];   // toward the moist air
      V.set(lerp3(vel, Math.round(q[3]), Math.round(q[4]), q[5]), 3 * k);
    });
    out.dry.push({ P: pts, side, V });
  }
  // Troughs and ridges of pressure, and subtropical shear lines (vorticity ridges
  // where temperature barely changes). Troughs that a front already marks aren't
  // drawn twice.
  const pS = smoothField(g, Float64Array.from(pres), 5 * S * S);
  const velAt = P => { const V = new Float32Array(P.length * 3); P.forEach((q, k) => V.set(lerp3(vel, Math.round(q[3]), Math.round(q[4]), q[5]), 3 * k)); return V; };
  const pack = P => { const a = new Float32Array(3 * P.length); P.forEach((q, k) => { a[3 * k] = q[0]; a[3 * k + 1] = q[1]; a[3 * k + 2] = q[2]; }); return a; };
  const fronted = (P) => {
    let hits = 0;
    for (const q of P) {
      for (const fr of out.fronts) {
        let hit = false;
        for (let k = 0; k < fr.P.length; k += 3) if (q[0] * fr.P[k] + q[1] * fr.P[k + 1] + q[2] * fr.P[k + 2] > Math.cos(0.06)) { hit = true; break; }
        if (hit) { hits++; break; }
      }
    }
    return hits / P.length > 0.4;
  };
  const midP = i => Math.abs(lat[i]) > 0.3 && Math.abs(lat[i]) < 1.3;
  for (const P of ridgeLines(g, pS.map(v => -v), midP)) if (P.length >= 20 && !fronted(P)) out.troughs.push({ P: pack(P), V: velAt(P) });
  for (const P of ridgeLines(g, pS, midP)) if (P.length >= 20) out.ridges.push({ P: pack(P), V: velAt(P) });
  // The longest of each, so the chart stays readable.
  out.troughs = out.troughs.sort((a, b) => b.P.length - a.P.length).slice(0, 10);
  out.ridges = out.ridges.sort((a, b) => b.P.length - a.P.length).slice(0, 8);
  const cycV = smoothField(g, Float64Array.from(st.zeta, (z, i) => z * Math.sign(lat[i])), 2 * S * S);
  const sub = i => Math.abs(lat[i]) > 0.17 && Math.abs(lat[i]) < 0.62 && T.G[i] < 0.5 * g70;
  for (const P of ridgeLines(g, cycV, sub, 0.9)) if (P.length >= 16) out.shear.push({ P: pack(P), V: velAt(P) });
  joinEnds([...out.fronts, ...out.dry, ...out.shear]);
  return out;
}

/**
 * Lines that nearly meet, meet: each end of a front, dry line or shear line
 * moves onto the nearest end of another within ~320 km (a front's pieces, a
 * cold front and its occlusion, a dry line and the front it runs into), or
 * else onto the nearest point of one within ~190 km (a junction), the last few
 * points following so the join is a kink rather than a hook.
 */
function joinEnds(lines) {
  const END = Math.cos(0.05), MID = Math.cos(0.03), TAPER = [1, 0.66, 0.36, 0.14];
  const ends = [];
  for (const l of lines) { const m = l.P.length / 3; if (m >= 2) ends.push([l, 0], [l, m - 1]); }
  for (const [l, k] of ends) {
    const P = l.P, x = P[3 * k], y = P[3 * k + 1], z = P[3 * k + 2];
    let best = END, tx = 0, ty = 0, tz = 0, found = false;
    // Another line's end first.
    for (const [o, j] of ends) {
      if (o === l) continue;
      const d = x * o.P[3 * j] + y * o.P[3 * j + 1] + z * o.P[3 * j + 2];
      if (d > best) { best = d; tx = o.P[3 * j]; ty = o.P[3 * j + 1]; tz = o.P[3 * j + 2]; found = true; }
    }
    if (!found) {
      best = MID;
      for (const o of lines) {
        if (o === l) continue;
        for (let j = 0; j < o.P.length; j += 3) {
          const d = x * o.P[j] + y * o.P[j + 1] + z * o.P[j + 2];
          if (d > best) { best = d; tx = o.P[j]; ty = o.P[j + 1]; tz = o.P[j + 2]; found = true; }
        }
      }
    }
    if (!found || best > 0.9999999) continue;
    const dx = tx - x, dy = ty - y, dz = tz - z, m = P.length / 3, dir = k === 0 ? 1 : -1;
    for (let q = 0; q < TAPER.length && q < m - 1; q++) {
      const i = k + dir * q, w = TAPER[q];
      const a = P[3 * i] + w * dx, b = P[3 * i + 1] + w * dy, c = P[3 * i + 2] + w * dz, r = Math.hypot(a, b, c);
      P[3 * i] = a / r; P[3 * i + 1] = b / r; P[3 * i + 2] = c / r;
    }
  }
}

/**
 * Successive charts linked for drawing: each line of the new chart pairs with the
 * old chart's nearest of its kind (its middle within ~500 km), and each centre with
 * the old one of its kind within ~400 km. Returns the old chart's leftovers, to fade.
 */
export function linkCharts(prev, cur) {
  const gone = { fronts: [], dry: [], troughs: [], ridges: [], shear: [], highs: [], lows: [] };
  for (const k of ['fronts', 'dry', 'troughs', 'ridges', 'shear']) gone[k] = matchLines(prev ? prev[k] : null, cur[k], () => k);
  for (const k of ['highs', 'lows']) {
    const used = new Set();
    for (const c of cur[k]) {
      c.prev = null;
      if (!prev) continue;
      let best = Math.cos(0.065), bp = null;
      for (const p of prev[k]) { if (used.has(p)) continue; const d = c.p[0] * p.p[0] + c.p[1] * p.p[1] + c.p[2] * p.p[2]; if (d > best) { best = d; bp = p; } }
      if (bp) { used.add(bp); c.prev = bp; }
    }
    gone[k] = prev ? prev[k].filter(p => !used.has(p)) : [];
  }
  return gone;
}

/**
 * The chart as drawn at weather time `now`: every line and centre carried by its wind
 * (whole, for up to three hours) and blended from its predecessor's course by `phi`
 * (the share of the time between charts that has passed); new ones fade in, old ones out.
 */
export function chartFrame(chart, gone, phi, now) {
  const carry = (l, t) => drift(l.P, l.V, Math.min(3 * 3600, Math.max(0, now - t)));
  const at = (h, t) => h.V ? drift(Float32Array.from(h.p), Float32Array.from(h.V), Math.min(3 * 3600, Math.max(0, now - t))) : h.p;
  const out = { ...chart };
  for (const k of ['fronts', 'dry', 'troughs', 'ridges', 'shear']) {
    const live = chart[k].map(l => {
      const P = carry(l, chart.t);
      return { ...l, P: l.prev && l.corr && phi < 1 ? morphed(carry(l.prev, chart.prevT), P, phi, l.corr) : P, alpha: l.prev ? 1 : phi };
    });
    const old = gone && phi < 1 ? gone[k].map(l => ({ ...l, P: carry(l, chart.prevT), alpha: 1 - phi })) : [];
    out[k] = live.concat(old);
  }
  for (const k of ['highs', 'lows']) {
    const live = chart[k].map(h => {
      const p = at(h, chart.t);
      if (!h.prev || phi >= 1) return { ...h, p, alpha: h.prev ? 1 : phi };
      const q = at(h.prev, chart.prevT), x = q[0] + phi * (p[0] - q[0]), y = q[1] + phi * (p[1] - q[1]), z = q[2] + phi * (p[2] - q[2]), r = Math.hypot(x, y, z);
      return { ...h, p: [x / r, y / r, z / r], alpha: 1 };
    });
    const old = gone && phi < 1 ? gone[k].map(h => ({ ...h, p: at(h, chart.prevT), alpha: 1 - phi })) : [];
    out[k] = live.concat(old);
  }
  return out;
}

const withAlpha = (hex, a) => { const h = hex.replace('#', ''); return `rgba(${parseInt(h.slice(0, 2), 16)}, ${parseInt(h.slice(2, 4), 16)}, ${parseInt(h.slice(4, 6), 16)}, ${a})`; };

/** Draw the chart's symbols: fronts (cold triangles in prussian, warm semicircles in sienna,
 * stationary alternating), dry lines (ochre scallops toward the moist side), H and L. */
/**
 * A line carried whole by its mean wind for dt seconds (between charts): moving
 * each point by its own wind folds the line, so the line keeps its shape and
 * translates, turned about the axis r × v̄ through the line's middle.
 */
function drift(P, V, dt) {
  if (!V || !(dt > 0)) return P;
  const n = P.length / 3;
  let vx = 0, vy = 0, vz = 0, cx = 0, cy = 0, cz = 0;
  for (let i = 0; i < P.length; i += 3) { vx += V[i]; vy += V[i + 1]; vz += V[i + 2]; cx += P[i]; cy += P[i + 1]; cz += P[i + 2]; }
  vx /= n; vy /= n; vz /= n;
  const cr = Math.hypot(cx, cy, cz) || 1; cx /= cr; cy /= cr; cz /= cr;
  // Rotation axis r × v, angle |v| dt / a.
  let ax = cy * vz - cz * vy, ay = cz * vx - cx * vz, az = cx * vy - cy * vx;
  const am = Math.hypot(ax, ay, az), ang = Math.hypot(vx, vy, vz) * dt / 6.371e6;
  if (!(am > 0) || !(ang > 0)) return P;
  ax /= am; ay /= am; az /= am;
  const c = Math.cos(ang), s = Math.sin(ang), C = 1 - c, out = new Float32Array(P.length);
  for (let i = 0; i < P.length; i += 3) {
    const x = P[i], y = P[i + 1], z = P[i + 2], d = ax * x + ay * y + az * z;
    out[i] = x * c + (ay * z - az * y) * s + ax * d * C;
    out[i + 1] = y * c + (az * x - ax * z) * s + ay * d * C;
    out[i + 2] = z * c + (ax * y - ay * x) * s + az * d * C;
  }
  return out;
}

export function drawChart(ctx, cx, cy, r, camera, chart0, pal, fade = 1, sc = 1, wxNow = null) {
  if (!chart0 || fade <= 0.01) return;
  // Between charts every line and centre drifts with its wind, so the chart moves
  // continuously; each new chart corrects it.
  // `chart0` is as drawn (chartFrame: carried by the wind and morphed); each line may carry an alpha.
  const chart = chart0;
  ctx.save();
  ctx.globalAlpha = fade;
  const A = l => { ctx.globalAlpha = fade * (l.alpha ?? 1); };
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
    A(fr);
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
  // Troughs (umber, dashed), ridges (umber zigzag), shear lines (prussian, dash-dot).
  const visPath = (P, fn) => {
    const M = P.length / 3;
    let prev = null;
    for (let k = 0; k < M; k++) {
      const q = project(P, k);
      if (q[2] < 0.05) { prev = null; continue; }
      if (prev) fn(prev, q);
      prev = q;
    }
  };
  ctx.lineCap = 'butt';
  for (const [list, ink, dash, w] of [[chart.troughs, pal.inks.umber, [7, 4], 1.4], [chart.shear, pal.inks.prussian, [8, 3, 1.5, 3], 1.2]]) {
    ctx.strokeStyle = ink; ctx.lineWidth = w * lw; ctx.setLineDash(dash.map(d => d * sc));
    for (const t of list) { A(t); ctx.beginPath(); visPath(t.P, (a, b) => { ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); }); ctx.stroke(); }
  }
  ctx.setLineDash([]);
  ctx.strokeStyle = pal.inks.umber; ctx.lineWidth = 1.2 * lw;
  for (const rd of chart.ridges) {
    A(rd);
    ctx.beginPath();
    let d = 0, up = 1, started = false;
    visPath(rd.P, (a, b) => {
      const seg = Math.hypot(b[0] - a[0], b[1] - a[1]); if (seg < 1e-6) return;
      const tx = (b[0] - a[0]) / seg, ty = (b[1] - a[1]) / seg;
      if (!started) { ctx.moveTo(a[0], a[1]); started = true; }
      let s = 0;
      while (s + (5 * sc - d) <= seg) {
        s += 5 * sc - d; d = 0; up = -up;
        ctx.lineTo(a[0] + tx * s - ty * up * 2.6 * sc, a[1] + ty * s + tx * up * 2.6 * sc);
      }
      d += seg - s;
    });
    ctx.stroke();
  }
  ctx.lineCap = 'round';
  // Dry lines: an ochre line with open scallops toward the moist air.
  for (const dl of chart.dry) {
    A(dl);
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
      A(h);
      camera.view(h.p[0], h.p[1], h.p[2], v);
      if (v[2] < 0.1) continue;
      const x = cx + v[0] * r, y = cy - v[1] * r;
      ctx.fillStyle = L === 'L' ? pal.text : withAlpha(pal.text, 0.75);
      ctx.fillText(L, x, y);
    }
  }
  ctx.restore();
}
