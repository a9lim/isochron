// The air's heat carried by the wind (src/engine/airheat.js) on a seeded planet: its flows are the
// wind's rotational part, free of divergence cell by cell; the heat it carries sums to nothing, the
// year's mean wind's (implicit) and the seasons' (lagged) alike; and a westerly carries a source's
// heat east, solved by BiCGSTAB (src/engine/climate.js) to the energy balance's own budget.
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildGrid } from '../src/grid/icosphere.js';
import { Tectonics } from '../src/engine/plates.js';
import { genesis } from '../src/engine/genesis.js';
import { Climate, bicgstab } from '../src/engine/climate.js';
import { AIRHEAT } from '../src/engine/airheat.js';

const g = buildGrid(5), tec = new Tectonics(g);
genesis(tec, 'earthlike', { spinup: 10 });
const c = new Climate(tec);
c.geography();
const cg = c.coarse, nc = cg.n, ah = c.airHeat, R = 6.371e6;
/** Each phase p's wind: u east and v north (m/s) by latitude and longitude. */
function setWind(f) {
  c.windPhase.forEach((w, p) => {
    for (let i = 0; i < g.n; i++) {
      const la = c.lat[i], lo = c.lon[i], [u, v] = f(la, lo, p);
      w[3 * i] = -Math.sin(lo) * u - Math.sin(la) * Math.cos(lo) * v;
      w[3 * i + 1] = Math.cos(lo) * u - Math.sin(la) * Math.sin(lo) * v;
      w[3 * i + 2] = Math.cos(la) * v;
    }
  });
}

test('a solid-body westerly: the flows are the wind\'s, and free of divergence', () => {
  setWind(la => [10 * Math.cos(la), 0]);
  ah.setWind();
  assert.ok(ah.on, 'on');
  // The wind's own flows across each edge, from its two cells' mean (as the wind meets the edge).
  let fx = 0, xx = 0, ff = 0, worst = 0, scale = 0;
  for (let I = 0; I < nc; I++) {
    const x = cg.pos[3 * I], y = cg.pos[3 * I + 1], la = Math.asin(cg.pos[3 * I + 2]), h = Math.hypot(x, y) || 1;
    let net = 0;
    for (let t = cg.nbrOff[I]; t < cg.nbrOff[I + 1]; t++) {
      const J = cg.nbr[t], xj = cg.pos[3 * J], yj = cg.pos[3 * J + 1], hj = Math.hypot(xj, yj) || 1, laj = Math.asin(cg.pos[3 * J + 2]);
      // the solid-body wind at the two cells, eastward, dotted with the edge's normal
      const wI = [-y / h * 10 * Math.cos(la), x / h * 10 * Math.cos(la), 0], wJ = [-yj / hj * 10 * Math.cos(laj), xj / hj * 10 * Math.cos(laj), 0];
      const un = 0.5 * ((wI[0] + wJ[0]) * cg.tan[3 * t] + (wI[1] + wJ[1]) * cg.tan[3 * t + 1]);
      const w = un * cg.ell[t] * R, a = ah.F[0][t] * R;
      fx += a * w; xx += w * w; ff += a * a; scale = Math.max(scale, Math.abs(a));
      net += ah.F[0][t];
    }
    worst = Math.max(worst, Math.abs(net));
  }
  const r = fx / Math.sqrt(xx * ff);
  assert.ok(r > 0.98, `the flows follow the wind (r ${r.toFixed(4)})`);
  assert.ok(Math.abs(Math.sqrt(ff / xx) - 1) < 0.05, `at its strength (${Math.sqrt(ff / xx).toFixed(3)} of it)`);
  assert.ok(worst * R < 1e-9 * scale, `each cell's flows sum to ${(worst * R / scale).toExponential(1)} of the largest`);
  assert.ok(Math.abs(ah.stats.urms - 10 * Math.sqrt(2 / 3)) < 0.4, `its rms speed ${ah.stats.urms.toFixed(2)} m/s (10√⅔ = 8.16)`);
});

test('the heat it carries sums to nothing: the year\'s mean wind\'s and the seasons\'', () => {
  // Winds that turn through the year (a westerly with a wave, a monsoon's swing), and a made-up state.
  setWind((la, lo, p) => {
    const th = 2 * Math.PI * (p + 0.5) / 6;
    return [8 * Math.cos(la) * Math.sin(2 * la) * (1 + 0.5 * Math.cos(th)) + 3 * Math.cos(3 * lo) * Math.cos(la), 4 * Math.sin(3 * lo) * Math.cos(la) * Math.cos(th + lo)];
  });
  ah.setWind();
  const Tc = [
    Float64Array.from({ length: nc }, (_, I) => 28 - 30 * cg.pos[3 * I + 2] ** 2 + 3 * cg.pos[3 * I]),
    Float64Array.from({ length: nc }, (_, I) => 12 * cg.pos[3 * I + 2] + 2 * cg.pos[3 * I + 1]),
    Float64Array.from({ length: nc }, (_, I) => 3 * cg.pos[3 * I + 2] * cg.pos[3 * I]),
    Float64Array.from({ length: nc }, (_, I) => 1.5 * cg.pos[3 * I + 2] ** 2),
    Float64Array.from({ length: nc }, (_, I) => 0.5 * cg.pos[3 * I + 1]),
  ];
  assert.ok(ah.cross(Tc), 'the seasons\' winds carry heat');
  for (let h = 0; h < 5; h++) {
    let s = 0, m = 0;
    for (let I = 0; I < nc; I++) { s += ah.X[h][I]; m += Math.abs(ah.X[h][I]); }
    assert.ok(m > 0 && Math.abs(s) < 1e-10 * m, `harmonic ${h}: the seasons' winds' heat sums to ${(s / m).toExponential(1)} of what it moves`);
  }
  // The year's mean wind's, upwind: Σ_I Σ a (x_I − x_J) for any x.
  let s = 0, m = 0;
  for (let I = 0; I < nc; I++) for (let t = cg.nbrOff[I]; t < cg.nbrOff[I + 1]; t++) {
    const q = ah.a[t] * (Tc[0][I] - Tc[0][cg.nbr[t]]);
    s += q; m += Math.abs(q);
  }
  assert.ok(m > 0 && Math.abs(s) < 1e-10 * m, `the mean wind's heat sums to ${(s / m).toExponential(1)} of what it moves`);
});

test('a westerly carries a source\'s heat east, and the balance closes', () => {
  const keep = AIRHEAT.H;
  AIRHEAT.H = 4;
  try {
    setWind(la => [10 * Math.cos(la), 0]);
    ah.setWind();
    // A source at 45° N, 0° E, 500 km across; B and a weak diffusion.
    const B = 2, D = 0.05, d = Float64Array.from(cg.area, a => B * a), di = new Float64Array(nc), b = new Float64Array(nc), bi = new Float64Array(nc);
    const s0 = [Math.cos(Math.PI / 4), 0, Math.sin(Math.PI / 4)];
    for (let I = 0; I < nc; I++) {
      const cs = cg.pos[3 * I] * s0[0] + cg.pos[3 * I + 1] * s0[1] + cg.pos[3 * I + 2] * s0[2], ang = Math.acos(Math.min(1, cs));
      b[I] = cg.area[I] * 100 * Math.exp(-((ang * R / 5e5) ** 2));
    }
    const ws = { w: Float64Array.from(cg.ell, (l, t) => l / cg.dist[t]) };
    for (const k of ['rr', 'ri', 'zr', 'zi', 'pr', 'pi', 'qr', 'qi', 'mr', 'mi']) ws[k] = new Float64Array(nc);
    const solve = a => { const x = new Float64Array(nc), xi = new Float64Array(nc); const it = bicgstab(cg, D, d, di, b, bi, x, xi, ws, a, 2000, 1e-10); return { x, it }; };
    const still = solve(new Float64Array(ah.a.length)), blown = solve(ah.a);
    // Where the heat lies: its mean longitude about the source, and the budget (B Σ A T = Σ source).
    const where = x => {
      let sx = 0, sy = 0, s = 0, q = 0;
      for (let I = 0; I < nc; I++) { const w = cg.area[I] * x[I]; sx += w * cg.pos[3 * I]; sy += w * cg.pos[3 * I + 1]; s += B * w; q += b[I]; }
      return { lon: Math.atan2(sy, sx) * 180 / Math.PI, close: Math.abs(s - q) / q };
    };
    const w0 = where(still.x), w1 = where(blown.x);
    assert.ok(Math.abs(w0.lon) < 1, `still air keeps it about the source (${w0.lon.toFixed(2)}°)`);
    assert.ok(w1.lon > 10, `the westerly carries it east (${w1.lon.toFixed(1)}°)`);
    assert.ok(w0.close < 1e-6 && w1.close < 1e-6, `the balance closes (${w1.close.toExponential(1)})`);
    assert.ok(blown.it < 2000, `BiCGSTAB converges (${blown.it} iterations)`);
  } finally { AIRHEAT.H = keep; }
});

test('the year\'s mean wind carries the sea\'s seasons onto a windward coast', () => {
  setWind(la => [10 * Math.cos(la), 0]);
  ah.setWind();
  // The first harmonic alone, forced only at sea (its seasons ~1 K there), each cell's own heat capacity.
  const B = 2, D = 0.05, om = 2 * Math.PI, land = c.landFracC;
  const dr = Float64Array.from(cg.area, a => B * a), di = Float64Array.from({ length: nc }, (_, I) => cg.area[I] * om * (land[I] >= 0.5 ? 0.61 : 8));
  const br = Float64Array.from({ length: nc }, (_, I) => (land[I] >= 0.5 ? 0 : Math.hypot(B, om * 8) * cg.area[I])), bi = new Float64Array(nc);
  const ws = { w: Float64Array.from(cg.ell, (l, t) => l / cg.dist[t]) };
  const amp = a => { const x = new Float64Array(nc), xi = new Float64Array(nc); bicgstab(cg, D, dr, di, br, bi, x, xi, ws, a, 3000, 1e-10); return Float64Array.from(x, (v, I) => Math.hypot(v, xi[I])); };
  const still = amp(new Float64Array(ah.a.length)), blown = amp(ah.a);
  // Coast cells (land beside sea) by where the sea lies: west of them (windward) or east (lee).
  let ww = 0, wl = 0, nw = 0, nl = 0, sw = 0, sl = 0;
  for (let I = 0; I < nc; I++) {
    if (!(land[I] >= 0.5)) continue;
    let west = 0, east = 0;
    const x = cg.pos[3 * I], y = cg.pos[3 * I + 1], h = Math.hypot(x, y) || 1, ex = -y / h, ey = x / h;
    for (let t = cg.nbrOff[I]; t < cg.nbrOff[I + 1]; t++) {
      if (land[cg.nbr[t]] >= 0.5) continue;
      const e = cg.tan[3 * t] * ex + cg.tan[3 * t + 1] * ey;
      if (e < -0.7) west++; else if (e > 0.7) east++;
    }
    if (west && !east) { ww += blown[I]; sw += still[I]; nw++; }
    if (east && !west) { wl += blown[I]; sl += still[I]; nl++; }
  }
  assert.ok(nw > 10 && nl > 10, `coasts both ways (${nw} windward, ${nl} lee)`);
  const r = (ww / nw) / (wl / nl), r0 = (sw / nw) / (sl / nl);
  assert.ok(r > 1.1 * r0, `windward coasts keep more of the sea's seasons under a westerly (${r.toFixed(2)} of the lee's, ${r0.toFixed(2)} in still air)`);
});
