// The ocean: Sverdrup's interior transport and a western boundary current in a box basin.
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildGrid } from '../src/grid/icosphere.js';
import { Ocean } from '../src/engine/ocean.js';

test('a box basin under a westerly–trade wind: Sverdrup transport inside, the return flow on the west', () => {
  const g = buildGrid(6), n = g.n;
  const lat = new Float64Array(n), lon = new Float64Array(n);
  const climate = { grid: g, landMask: new Uint8Array(n), windPhase: [new Float32Array(3 * n)], Tf: [new Float32Array(n)], orders: null };
  const lat0 = 15 * Math.PI / 180, lat1 = 45 * Math.PI / 180, lonW = 0, lonE = 60 * Math.PI / 180;
  for (let i = 0; i < n; i++) {
    const x = g.pos[3 * i], y = g.pos[3 * i + 1], z = g.pos[3 * i + 2];
    lat[i] = Math.asin(z); lon[i] = Math.atan2(y, x);
    climate.landMask[i] = lat[i] > lat0 && lat[i] < lat1 && lon[i] > lonW && lon[i] < lonE ? 0 : 1;
  }
  const o = new Ocean(climate);
  // A zonal stress τx = −τ0 cos(π (φ − φ0)/(φ1 − φ0)): trades below, westerlies above. Built directly.
  const tau0 = 0.1;
  for (let i = 0; i < n; i++) {
    const x = g.pos[3 * i], y = g.pos[3 * i + 1];
    const ex = -y / Math.hypot(x, y), ey = x / Math.hypot(x, y);   // east
    const tx = -tau0 * Math.cos(Math.PI * (lat[i] - lat0) / (lat1 - lat0));
    o.tau[3 * i] = tx * ex; o.tau[3 * i + 1] = tx * ey; o.tau[3 * i + 2] = 0;
    o.sea[i] = climate.landMask[i] ? 0 : 1;
  }
  // Compute the curl with the stress as set (reuse the method's curl loop by calling it with a no-wind climate).
  {
    const nbrOff = g.nbrOff, nbr = g.nbr, corner = g.corner, C = g.centre, tau = o.tau;
    for (let i = 0; i < n; i++) {
      const s = nbrOff[i], d = nbrOff[i + 1] - s;
      let circ = 0;
      for (let k = 0; k < d; k++) {
        const j = nbr[s + k], a = corner[s + (k + d - 1) % d], b = corner[s + k];
        circ += 0.5 * ((tau[3 * i] + tau[3 * j]) * (C[3 * b] - C[3 * a]) + (tau[3 * i + 1] + tau[3 * j + 1]) * (C[3 * b + 1] - C[3 * a + 1]) + (tau[3 * i + 2] + tau[3 * j + 2]) * (C[3 * b + 2] - C[3 * a + 2]));
      }
      o.curl[i] = circ / (g.area[i] * 6.371e6);
    }
  }
  const it = o.gyres(); while (!it.next().done);
  // Sverdrup: ψ(λ) = −(1/β) ∫_λ^{λE} curl τ/ρ dx along a latitude, in the eastern half.
  const R = 6.371e6, Om = 7.292e-5, rho = 1025;
  let worst = 0, checked = 0, west = 0;
  for (let i = 0; i < n; i++) {
    if (climate.landMask[i]) continue;
    const midLat = Math.abs(lat[i] - 30 * Math.PI / 180) < 0.05;
    if (!midLat) continue;
    const beta = 2 * Om * Math.cos(lat[i]) / R;
    const curl = Math.PI * tau0 / ((lat1 - lat0) * R) * Math.sin(Math.PI * (lat[i] - lat0) / (lat1 - lat0)) * -1;
    const dx = (lonE - lon[i]) * R * Math.cos(lat[i]);
    const sv = -curl / rho * dx / beta;          // the interior ψ (m³/s)
    if (lon[i] > 0.4 * lonE && lon[i] < 0.85 * lonE) { worst = Math.max(worst, Math.abs(o.psi[i] / sv - 1)); checked++; }
    if (lon[i] < 0.08 * lonE) west++;
  }
  assert.ok(checked > 3, `${checked} interior cells`);
  // Stommel's frictional layers on the north and south walls (~√(εL) wide) take the rest.
  assert.ok(worst < 0.2, `interior ψ off Sverdrup's by ${(100 * worst).toFixed(0)}%`);
  // The western boundary current: the return flow is squeezed against the west coast,
  // so ψ's zonal gradient there is several times the interior's.
  let gw = 0, gi = 0, nw = 0, ni = 0;
  for (let i = 0; i < n; i++) {
    if (climate.landMask[i] || Math.abs(lat[i] - 30 * Math.PI / 180) > 0.05) continue;
    let gx = 0, gy = 0;
    for (let t = g.nbrOff[i], e = g.nbrOff[i + 1]; t < e; t++) { const j = g.nbr[t], d = (o.sea[j] ? o.psi[j] : 0) - o.psi[i]; gx += d * g.gw[3 * t]; gy += d * g.gw[3 * t + 1]; }
    const dlam = Math.abs(-g.pos[3 * i + 1] * gx + g.pos[3 * i] * gy);
    if (lon[i] < 0.1 * lonE) { gw += dlam; nw++; } else if (lon[i] > 0.4 * lonE && lon[i] < 0.85 * lonE) { gi += dlam; ni++; }
  }
  assert.ok(nw > 0 && gw / nw > 3 * gi / ni, `western gradient ${(gw / nw).toExponential(2)} vs interior ${(gi / ni).toExponential(2)}`);
  assert.ok(Math.max(...o.psi) > 0 || Math.min(...o.psi) < 0, 'a gyre formed');
});

test('the equator under the trades wells up: easterlies cool it on both sides alike, most at its basin\'s eastern end, and westerlies don\'t', () => {
  // A planet at rest (no gyres), a uniform zonal stress, the anomaly's steady balance: all sea, then
  // one basin walled by a meridional continent 20° wide.
  const g = buildGrid(5), n = g.n, id = Int32Array.from({ length: n }, (_, i) => i), back = id.slice().reverse();
  const lat = Float64Array.from({ length: n }, (_, i) => Math.asin(g.pos[3 * i + 2]) * 180 / Math.PI);
  const lon = Float64Array.from({ length: n }, (_, i) => Math.atan2(g.pos[3 * i + 1], g.pos[3 * i]) * 180 / Math.PI);
  const run = (tx, walled) => {
    const landMask = Uint8Array.from(lon, l => (walled && Math.abs(l) < 10 ? 1 : 0));
    const climate = { grid: g, landMask, windPhase: [new Float32Array(3 * n)], Tf: [new Float32Array(n).fill(25)], orders: [id, back, id, back] };
    const o = new Ocean(climate);
    for (let i = 0; i < n; i++) {
      const x = g.pos[3 * i], y = g.pos[3 * i + 1], h = Math.hypot(x, y) || 1;
      o.tau[3 * i] = tx * -y / h; o.tau[3 * i + 1] = tx * x / h; o.tau[3 * i + 2] = 0; o.sea[i] = 1 - landMask[i];
    }
    for (const _ of o.temperature());
    const band = (a, b, ok = () => true) => { let s = 0, k = 0; for (let i = 0; i < n; i++) if (o.sea[i] && lat[i] >= a && lat[i] < b && ok(i)) { s += o.sst[i]; k++; } return s / k; };
    return { eq: band(-2, 2), n: band(2, 6), s: band(-6, -2), far: Math.max(Math.abs(band(20, 30)), Math.abs(band(-30, -20))),
      west: band(-2, 2, i => lon[i] > 20 && lon[i] < 80), east: band(-2, 2, i => lon[i] > -80 && lon[i] < -20) };
  };
  const e = run(-0.05, false), w = run(0.05, false), b = run(-0.05, true);
  assert.ok(e.eq < -2, `easterlies: the equator ${e.eq.toFixed(2)} K`);
  assert.ok(e.n < 0 && e.s < 0 && Math.abs(e.n - e.s) < 0.1 * Math.abs(e.n), `easterlies: ${e.n.toFixed(2)} K north, ${e.s.toFixed(2)} south`);
  assert.ok(e.far < 0.05 * Math.abs(e.eq), `off the equator: ${e.far.toFixed(3)} K`);
  assert.ok(Math.abs(w.eq) < 1e-6, `westerlies: the equator ${w.eq} K`);
  // The basin runs east from 10° E round to 10° W: its eastern end is colder than its western.
  assert.ok(b.east < 2 * b.west && b.east < -2, `walled: the basin's east ${b.east.toFixed(2)} K, its west ${b.west.toFixed(2)}`);
});
