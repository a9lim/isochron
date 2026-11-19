// Peoples (batch 1c, landing 4; docs/people.md, "Peoples"): who people are, beside what they know.
// Marks as in the plan: standard, synthesis, speculation.
//
// Each cell's identity is a point on a torus of side TOR for each of its ways of life (foragers,
// herders, fishers, farmers, city people), held by that way's people: Barth's groups that last side
// by side by living differently (1969, from memory). A continuum is points varying smoothly over the
// land; a mosaic is ways sharing a cell. A people isn't an object, only a region where points are
// close. The torus is Miasma's antigenic map ported (a9): drawn directly, one axis a hatch's angle and
// the other a hue, so the Culture map is a fill that turns and shifts with identity, and a boundary
// shows only where distant branches meet. Its cost is chance resemblance: in two dimensions unrelated
// peoples can drift into looking alike (synthesis throughout; the values speculation).
//
//   drift       each point random-walks, ID_SIG2 a dimension a year, so two peoples parted drift
//               apart as E d² = 4σ²t on the torus (until it wraps): a language apart (d 1) in ~1.25
//               kyr (Romance's), a family (d ~2.3) in ~6.5 kyr (Bantu's, Austronesian's; from
//               memory); and a founder's kick (ID_KICK a dimension) where migrants settle an empty
//               place, so expansions split as they go (a serial founder effect).
//   contact     each point is pulled toward the points its people meet, at R_CONT a year × g(d), g =
//               G_FLOOR + (1 − G_FLOOR)/(1 + (d/D_CONT)²): dialects level fast, unlike peoples
//               converge slowly (a Sprachbund) and never not at all, so neighbours settle a dialect
//               apart and peoples a family apart only where contact thins. Its people meet their own
//               cell's and their ring's, the ring's share 1 − e^{−(ℓ_id/dx)²} by the ring's people and
//               the land's ease (across a strait by e^{−km/ℓ_id}); between two ways of life at X_WAY
//               (people meet and trade across them but seldom marry: Barth), whole between foragers
//               and fishers (both forage) and with the cities, where ways meet. ℓ_id is ID_L0 (a band's
//               marriages and a village's) until learning passes writing's (Z_ID0), then e-fold per
//               Z_IDL (writing's, print's, broadcast's reach: speculation); past it the media pull every
//               point toward the world's mean, R_MEDIA × 1 − e^{−(ℓ_id/L_WORLD)²}, whatever the
//               distance: the world blends once learning spans it (a9), or where a state holds the
//               place, its nation does: the media's pull is toward the holders' capitals' identity by
//               their shares (a9: national broadcasting), the world's mean for the rest. States also
//               pull the places they hold toward their capitals' identity, R_STATE × the share held ×
//               the falloff (src/engine/polities.js; a9: softly). With drift, the
//               nearest-neighbour pull is a stepping-stone field, whose identity distance grows as the
//               log of the distance between places in two dimensions (Séguy's curve for dialects,
//               1971; Nerbonne; from memory).
//   ways        each cell's ways of life follow its food (`People.capAt`: the land's, foraged or
//               herded as herders hold it, the sea's, the fields', what energy buys) and its city's
//               share; people change their way as the mix changes and keep who they are, but take a
//               share F_CONV of the way to its customs (each non-urban way's point on the torus, `att`,
//               seeded apart: cultural ecology, a9), and every point of that way drifts toward it at
//               R_ATT (weak: ~100 kyr). Cities have no point of their own: their people's.
//   migrants    carry their points by way of life (`carry`, from the spread and the voyages), so
//               farming's dispersals carry language families.
//   mixing      people joining a way's point move it by a conformist mean: weights w^γ, γ = 1 + d²/(d² +
//               D_MIX²), so near peoples average (people and mean identity kept) and far ones shift
//               toward the larger (Boyd and Richerson's conformist transmission, standard in form).
//
// Read back: learning's copying by how alike two places are once learning is written (texts need a
// shared language: each cell's learned identity its city's point, else its largest way's; `copyW`),
// and a common language in trade's kernel (`tradeW`; standard in gravity models of trade, its size
// from memory). Drawn (`drawn`): each cell's largest way's point and its second's (scaled by its
// share), as angles' cosines and sines so the globe interpolates them; counted: the effective number
// of peoples (`count`: Leinster and Cobbold's similarity-sensitive Hill number of order 2, 2012, from
// memory).
import { stream } from '../rng.js';

export const WAYS = 5, CITY = 4;
const KPOL = 3;   // the polities a place keeps (src/engine/polities.js, KP; not imported, which would be circular)
export const WAY = ['foragers', 'herders', 'fishers', 'farmers', 'city'];

/** The shortest way round on a circle of side S. */
export const wrap = (d, S) => d - S * Math.round(d / S);
/** Contact's rate's falloff with identity distance d (squared: d2), to its floor g0. */
export const pull = (d2, D, g0 = 0) => g0 + (1 - g0) / (1 + d2 / (D * D));
/**
 * Contact between two ways of life: whole within one, between foragers and fishers (both forage), and
 * with the cities (where ways meet); X_WAY between two others (Barth's boundary).
 */
export const across = (a, b, x) => (a === b || a === CITY || b === CITY || a + b === 2 && a !== 1 ? 1 : x);

export class Peoples {
  /** For a People `pp` (src/engine/people.js): its cells, land graph and parameters. */
  constructor(pp) {
    this.pp = pp;
    const nL = pp.nL, P = pp.P, S = P.TOR;
    this.W = new Float64Array(WAYS * nL);          // people a way
    this.X = new Float64Array(2 * WAYS * nL);      // a way's point on the torus
    this.T = new Float64Array(nL);                 // people a cell, as its ways hold them
    this.Xn = new Float64Array(2 * WAYS * nL);     // the step's scratch
    this.lead = new Int32Array(nL).fill(-1);       // each cell's learned identity (a way's slot)
    this.mu = new Float64Array(2);                 // the world's mean identity
    this.rng = stream(pp.planet.seed, 'people:peoples');
    // Each non-urban way's customs: four points on the torus, seeded apart (a half side each way).
    const r = stream(pp.planet.seed, 'people:peoples:ways'), ox = r.uniform() * S, oy = r.uniform() * S;
    this.att = Float64Array.from([0, 0, S / 2, 0, 0, S / 2, S / 2, S / 2], (v, k) => ((v + (k % 2 ? oy : ox)) % S));
    this.nPeoples = 0;
  }

  /** The first people: foragers at the foragers' point. */
  seed(cells) {
    const N = this.pp.Ntot;
    for (const c of cells) { const s = c * WAYS; this.W[s] = N[c]; this.T[c] = N[c]; this.X[2 * s] = this.att[0]; this.X[2 * s + 1] = this.att[1]; }
  }

  /** Squared distance between two points (slots), the shortest way round. */
  d2(a, b) {
    const S = this.pp.P.TOR, X = this.X, dx = wrap(X[2 * b] - X[2 * a], S), dy = wrap(X[2 * b + 1] - X[2 * a + 1], S);
    return dx * dx + dy * dy;
  }
  /** w people at (x, y) into slot s: a conformist mean (near peoples average, far ones shift toward the larger). */
  mix(s, w, x, y) {
    if (!(w > 0)) return;
    const P = this.pp.P, S = P.TOR, W = this.W, X = this.X, w0 = W[s];
    if (!(w0 > 0)) { W[s] = w; X[2 * s] = ((x % S) + S) % S; X[2 * s + 1] = ((y % S) + S) % S; return; }
    const dx = wrap(x - X[2 * s], S), dy = wrap(y - X[2 * s + 1], S), d2 = dx * dx + dy * dy, g = 1 + d2 / (d2 + P.D_MIX * P.D_MIX);
    const f = 1 / (1 + Math.pow(w0 / w, g));
    X[2 * s] = ((X[2 * s] + f * dx) % S + S) % S; X[2 * s + 1] = ((X[2 * s + 1] + f * dy) % S + S) % S;
    W[s] = w0 + w;
  }
  /**
   * q migrants from cell a to cell b, each way of life in its share (the spread, the voyages); settling
   * an empty place, their points take a founder's kick.
   */
  carry(a, b, q) {
    const W = this.W, X = this.X, s0 = this.T[a];
    if (!(s0 > 0) || !(q > 0)) return;
    const f = Math.min(1, q / s0), settle = !(this.T[b] > 0), kick = settle ? Math.sqrt(this.pp.P.ID_KICK) : 0;
    let moved = 0;
    for (let k = 0; k < WAYS; k++) {
      const sa = a * WAYS + k, w = W[sa];
      if (!(w > 0)) continue;
      const m = w * f;
      W[sa] = w - m; moved += m;
      this.mix(b * WAYS + k, m, X[2 * sa] + (settle ? kick * this.rng.normal() : 0), X[2 * sa + 1] + (settle ? kick * this.rng.normal() : 0));
    }
    this.T[a] -= moved; this.T[b] += moved;
  }
  /** Whether migrants into c are carried: always into a cell with no one, else past ID_EPS of its people. */
  carries(c, q) { return q > this.pp.P.ID_EPS * this.T[c] || !(this.T[c] > 0); }

  /** Identity's contact length at learning z (km): ID_L0, then e-fold per Z_IDL past Z_ID0, to ID_LMAX. */
  idL(z) { const P = this.pp.P, x = P.ID_L0 * Math.exp(Math.min(Math.max(0, z - P.Z_ID0) / P.Z_IDL, 60)); return x / Math.pow(1 + Math.pow(x / P.ID_LMAX, 4), 0.25); }

  /**
   * The step, every DT_ID years at least (identity moves over generations; the takeoff's steps are
   * days): each cell's ways to its people; ways of life to its food; contact, the customs and the
   * media; drift. Each part is exact over a long step.
   */
  step(dt) {
    this.owed = (this.owed || 0) + dt;
    if (this.owed < this.pp.P.DT_ID) return;
    const due = this.owed;
    this.owed = 0;
    this.advance(due);
  }
  advance(dt) {
    const pp = this.pp, P = pp.P, S = P.TOR, nL = pp.nL, N = pp.Ntot, E = pp.E, W = this.W, X = this.X, T = this.T;
    // The people as the step left them: each cell's ways scaled to its people (births, deaths and
    // migrants not carried scale every way alike); a cell peopled with none takes its most peopled
    // neighbour's largest way's point.
    for (let c = 0; c < nL; c++) {
      const o = c * WAYS;
      if (!(N[c] > 0)) { if (T[c] !== 0) { W.fill(0, o, o + WAYS); T[c] = 0; } continue; }
      let s = 0;
      for (let k = 0; k < WAYS; k++) s += W[o + k];
      if (s > 0) { const f = N[c] / s; for (let k = 0; k < WAYS; k++) W[o + k] *= f; }
      else {
        let best = -1, bn = 0;
        for (let e = E.off[c]; e < E.off[c + 1]; e++) { const d = E.nb[e]; if (T[d] > 0 && N[d] > bn) { bn = N[d]; best = d; } }
        const src = best >= 0 ? this.main(best) : -1;
        this.mix(o, N[c], src >= 0 ? X[2 * src] : this.att[0], src >= 0 ? X[2 * src + 1] : this.att[1]);
      }
      T[c] = N[c];
    }
    // Ways of life: each cell's people shared by its food (`People.capAt`) and its city's share;
    // those whose way shrinks take up the ways that grow, keeping who they are but taking F_CONV of
    // the way to the new way's customs.
    const wol = pp.wol, u = pp.cityShare, tgt = [0, 0, 0, 0, 0], cur = [0, 0, 0, 0, 0], att = this.att;
    for (let c = 0; c < nL; c++) {
      if (!(N[c] > 0)) continue;
      const o = c * WAYS, f = 5 * c;
      let tot = 0;
      for (let k = 0; k < 5; k++) tot += wol[f + k];
      if (!(tot > 0)) continue;
      const uc = u ? u[c] : 0;
      for (let k = 0; k < 4; k++) tgt[k] = N[c] * (1 - uc) * wol[f + k] / tot;
      tgt[CITY] = N[c] * (uc + (1 - uc) * wol[f + 4] / tot);
      let def = 0;
      for (let k = 0; k < WAYS; k++) { cur[k] = W[o + k]; def += Math.max(0, tgt[k] - cur[k]); }
      if (!(def > 1e-9 * N[c])) continue;
      for (let j = 0; j < WAYS; j++) {
        const give = cur[j] - tgt[j];
        if (!(give > 1e-12 * N[c])) continue;
        const sj = o + j, xj = X[2 * sj], yj = X[2 * sj + 1];
        W[sj] -= give;
        for (let k = 0; k < WAYS; k++) {
          const dk = tgt[k] - cur[k];
          if (!(dk > 0)) continue;
          // (Cities have no customs of their own: their people keep their points.)
          if (k === CITY) this.mix(o + k, give * dk / def, xj, yj);
          else this.mix(o + k, give * dk / def, xj + P.F_CONV * wrap(att[2 * k] - xj, S), yj + P.F_CONV * wrap(att[2 * k + 1] - yj, S));
        }
      }
    }
    // The world's mean identity (circular, each axis).
    let cx = 0, sx = 0, cy = 0, sy = 0;
    const tw = 2 * Math.PI / S;
    for (let s = 0; s < WAYS * nL; s++) { const w = W[s]; if (!(w > 0)) continue; cx += w * Math.cos(tw * X[2 * s]); sx += w * Math.sin(tw * X[2 * s]); cy += w * Math.cos(tw * X[2 * s + 1]); sy += w * Math.sin(tw * X[2 * s + 1]); }
    const mu = this.mu;
    mu[0] = ((Math.atan2(sx, cx) / tw) % S + S) % S; mu[1] = ((Math.atan2(sy, cy) / tw) % S + S) % S;
    // Contact, each point toward those its people meet (as the step found them), its way's customs and
    // the media, toward their weighted mean, then drift under that pull (an Ornstein–Uhlenbeck step:
    // σ²(1 − e^{−2r dt})/2r a dimension, σ² dt unpulled; added whole after the pull, a 500-year step's
    // walk had left neighbours a step's kick apart however strongly they were held).
    const Xn = this.Xn, dx = pp.dx || 120, Dc = P.D_CONT, g0 = P.G_FLOOR, zl = pp.zl, xw = P.X_WAY, rng = this.rng, pol = P.R_STATE > 0 ? pp.pol : null;
    for (let c = 0; c < nL; c++) {
      if (!(N[c] > 0)) continue;
      const o = c * WAYS, l = this.idL(zl[c]), kap = 1 - Math.exp(-(l / dx) * (l / dx)), gam = P.R_MEDIA * (1 - Math.exp(-(l / P.L_WORLD) * (l / P.L_WORLD)));
      // The ring's share of contact, by its people and the land's ease (averaged over the land edges, a
      // strait's added: averaged over all, a coast's many crossings had thinned its contact with the land).
      let ring = 0, deg = 0;
      for (let e = E.off[c]; e < E.off[c + 1]; e++) { const d = E.nb[e]; if (!E.hop[e]) deg++; if (N[d] > 0) ring += N[d] * (E.hop[e] ? Math.exp(-E.km[e] / l) : E.slope[e]); }
      ring /= Math.max(1, deg);
      const kr = ring > 0 ? kap * ring / (ring + N[c]) : 0, ko = 1 - kr;
      for (let k = 0; k < WAYS; k++) {
        const a = o + k;
        if (!(W[a] > 1e-12 * N[c])) continue;
        const xa = X[2 * a], ya = X[2 * a + 1];
        let r = 0, tx = 0, ty = 0;
        const meet = (b, w) => {
          const ddx = wrap(X[2 * b] - xa, S), ddy = wrap(X[2 * b + 1] - ya, S), q = w * pull(ddx * ddx + ddy * ddy, Dc, g0);
          r += q; tx += q * ddx; ty += q * ddy;
        };
        for (let j = 0; j < WAYS; j++) if (j !== k && W[o + j] > 0) meet(o + j, ko * W[o + j] / N[c] * across(k, j, xw));
        if (kr > 0) for (let e = E.off[c]; e < E.off[c + 1]; e++) {
          const d = E.nb[e];
          if (!(N[d] > 0)) continue;
          const ew = kr * (E.hop[e] ? Math.exp(-E.km[e] / l) : E.slope[e]) / Math.max(1, deg) / ring;
          if (!(ew > 0)) continue;
          for (let j = 0; j < WAYS; j++) { const b = d * WAYS + j; if (W[b] > 0.05 * N[d]) meet(b, ew * W[b] * across(k, j, xw)); }
        }
        // The states holding the place pull it toward their capitals' identity (src/engine/polities.js;
        // a9: softly), R_STATE × the share held × contact's falloff.
        // The media's pull is the nation's where a state holds the place (a9: national broadcasting, its
        // schools and press), each holder's capital by its share of those who deliver, and the world's mean
        // for the rest: whatever the distance.
        let rs = 0, sx = 0, sy = 0, hm = 0, mx = 0, my = 0;
        if (pol) for (let j = 0; j < KPOL; j++) {
          const q = pol.id[KPOL * c + j];
          if (q < 0) break;
          const b = pol.capSlot(q);
          if (b < 0) continue;
          const ddx = wrap(X[2 * b] - xa, S), ddy = wrap(X[2 * b + 1] - ya, S), sh = pol.s[KPOL * c + j];
          if (gam > 0 && pol.d[c] > 0) { const f = Math.min(1 - hm, sh / pol.d[c]); hm += f; mx += f * ddx; my += f * ddy; }
          if (b === a) continue;
          const w = P.R_STATE * sh * pull(ddx * ddx + ddy * ddy, Dc, g0);
          rs += w; sx += w * ddx; sy += w * ddy;
        }
        mx += (1 - hm) * wrap(mu[0] - xa, S); my += (1 - hm) * wrap(mu[1] - ya, S);
        // Contact at R_CONT × its weight, the way's customs at R_ATT, the media at their rate, the states.
        const ra = k === CITY ? 0 : P.R_ATT, rt = P.R_CONT * r + ra + gam + rs;
        let ox = 0, oy = 0;
        if (rt > 0) {
          const kk = 1 - Math.exp(-rt * dt);
          ox = kk * (P.R_CONT * tx + (ra > 0 ? ra * wrap(att[2 * k] - xa, S) : 0) + gam * mx + sx) / rt;
          oy = kk * (P.R_CONT * ty + (ra > 0 ? ra * wrap(att[2 * k + 1] - ya, S) : 0) + gam * my + sy) / rt;
        }
        const z = 2 * rt * dt, sd = Math.sqrt(P.ID_SIG2 * (z > 1e-6 ? (1 - Math.exp(-z)) / (2 * rt) : dt));
        Xn[2 * a] = xa + ox + sd * rng.normal(); Xn[2 * a + 1] = ya + oy + sd * rng.normal();
      }
    }
    for (let c = 0; c < nL; c++) {
      if (!(N[c] > 0)) { this.lead[c] = -1; continue; }
      const o = c * WAYS;
      for (let k = 0; k < WAYS; k++) { const a = o + k; if (W[a] > 1e-12 * N[c]) { X[2 * a] = ((Xn[2 * a] % S) + S) % S; X[2 * a + 1] = ((Xn[2 * a + 1] % S) + S) % S; } }
      this.lead[c] = W[o + CITY] > 0 ? o + CITY : this.main(c);
    }
  }

  /** Cell c's most peopled way (its slot). */
  main(c) {
    const W = this.W, o = c * WAYS;
    let best = o;
    for (let s = o + 1; s < o + WAYS; s++) if (W[s] > W[best]) best = s;
    return best;
  }
  /** How alike two cells' learned identities are, 1 at none apart, 1/(1 + (d/D_SIM)²). */
  sim(c, d) {
    const a = this.lead[c], b = this.lead[d];
    return a < 0 || b < 0 ? 1 : 1 / (1 + this.d2(a, b) / (this.pp.P.D_SIM * this.pp.P.D_SIM));
  }
  /**
   * Learning's copying from d into c, by how alike they are (ID_COPY of the way to none), as c's learning
   * comes to texts (past writing's Z_ID0): before them it's oral, and bilingual neighbours carry it as
   * production's tacit copying is carried. (From the first, it held the foragers' mosaic apart and
   * farming came ~10 kyr later.)
   */
  copyW(c, d) {
    const P = this.pp.P, k = P.ID_COPY * (1 / (1 + Math.exp(-(this.pp.zl[c] - P.Z_ID0) / 0.25)));
    return k > 1e-6 ? 1 - k * (1 - this.sim(c, d)) : 1;
  }
  /** Trade's kernel between two places, by a common language: × (1 + CL sim)/(1 + CL). */
  tradeW(c, d) { const k = this.pp.P.CL_TRADE; return k > 0 ? (1 + k * this.sim(c, d)) / (1 + k) : 1; }

  /**
   * The effective number of peoples: Leinster and Cobbold's similarity-sensitive diversity of order 2,
   * ²D = 1/Σᵢⱼ pᵢ pⱼ Zᵢⱼ, Zᵢⱼ = e^{−d²/(2 D_HILL²)}, over the points binned by D_HILL on the torus (each
   * bin's people at its centre): at most (TOR/D_HILL)² bins, so exact.
   */
  count() {
    const pp = this.pp, P = pp.P, S = P.TOR, h = P.D_HILL, nb = Math.max(1, Math.round(S / h)), W = this.W, X = this.X;
    const bins = new Float64Array(nb * nb);
    let all = 0;
    for (let s = 0; s < WAYS * pp.nL; s++) {
      const w = W[s];
      if (!(w > 0)) continue;
      const i = Math.floor(X[2 * s] / S * nb) % nb, j = Math.floor(X[2 * s + 1] / S * nb) % nb;
      bins[i * nb + j] += w; all += w;
    }
    if (!(all > 0)) return (this.nPeoples = 0);
    const at = [];
    for (let b = 0; b < nb * nb; b++) if (bins[b] > 0) at.push(b);
    const s2 = 2 * h * h, step = S / nb;
    let z = 0;
    for (const a of at) for (const b of at) {
      const dx = wrap(((a / nb | 0) - (b / nb | 0)) * step, S), dy = wrap(((a % nb) - (b % nb)) * step, S);
      z += bins[a] * bins[b] / (all * all) * Math.exp(-(dx * dx + dy * dy) / s2);
    }
    return (this.nPeoples = 1 / z);
  }

  /**
   * The Culture map's fields, three vec4s a cell of the people's grid: its largest way's point as
   * (cos, sin) of each axis' angle (the hatch's 2θ and the hue's), its second's the same scaled by the
   * second's share of the cell's people, and the fishers' parcels (a share of the cell; `People.drawn`).
   */
  drawn(out = null) {
    const pp = this.pp, n = pp.planet.grid.n, S = pp.P.TOR, W = this.W, X = this.X, tw = 2 * Math.PI / S;
    out = out || new Float32Array(12 * n); out.fill(0);
    for (let c = 0; c < pp.nL; c++) {
      const o = 12 * pp.cells[c];
      out[o + 8] = pp.fishU ? pp.fishU[c] : 0;
      if (!(pp.Ntot[c] > 0) || !(this.T[c] > 0)) continue;
      let a = -1, b = -1;
      for (let s = c * WAYS; s < c * WAYS + WAYS; s++) { if (!(W[s] > 0)) continue; if (a < 0 || W[s] > W[a]) { b = a; a = s; } else if (b < 0 || W[s] > W[b]) b = s; }
      if (a < 0) continue;
      out[o] = Math.cos(tw * X[2 * a]); out[o + 1] = Math.sin(tw * X[2 * a]); out[o + 2] = Math.cos(tw * X[2 * a + 1]); out[o + 3] = Math.sin(tw * X[2 * a + 1]);
      if (b >= 0) {
        const f = W[b] / this.T[c];
        out[o + 4] = f * Math.cos(tw * X[2 * b]); out[o + 5] = f * Math.sin(tw * X[2 * b]); out[o + 6] = f * Math.cos(tw * X[2 * b + 1]); out[o + 7] = f * Math.sin(tw * X[2 * b + 1]);
      }
    }
    return out;
  }
}
