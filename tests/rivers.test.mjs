// The rivers as drawn (src/render/rivers.js): the flow graph's nodes, and the page's succession
// across a retrace (no morph: what stayed stays, what changed crossfades).
import test from 'node:test';
import assert from 'node:assert/strict';
import { traceRivers, succeedRivers, drainage, NODE } from '../src/render/rivers.js';

const { Planet } = await import('../src/engine/planet.js');
const P = new Planet('earthlike', { level: 4, spinup: 10 });
P.climate.solve(2);
P.land.runoff.set(P.climate.runoff);
P.land.reroute();
const g = P.grid, n = g.n, QMIN = 300;
const rt = drainage(g, P.land, null), Q12 = P.land.monthly(P.climate.runoffM, rt);
const rivers = traceRivers(g, P.land, null, Q12, QMIN, rt);
const spacing = 1.07 * Math.sqrt(4 * Math.PI / n);
const pt = (P, k) => [P[3 * k], P[3 * k + 1], P[3 * k + 2]];
const at = (p, i) => Math.hypot(p[0] - g.pos[3 * i], p[1] - g.pos[3 * i + 1], p[2] - g.pos[3 * i + 2]) < 1e-6;
const same = (a, b) => a[0] === b[0] && a[1] === b[1] && a[2] === b[2];

test('rivers meet as a graph of the flow: comparable inflows end at a node, from which a new river runs', () => {
  const Q = new Float64Array(n);
  for (let i = 0; i < n; i++) { let s = 0; for (let m = 0; m < 12; m++) s += Q12[12 * i + m]; Q[i] = s / 12; }
  const of = new Int32Array(n).fill(-1);
  rivers.forEach((r, k) => { for (const i of r.cells) { assert.equal(of[i], -1, `cell ${i} in two rivers`); of[i] = k; } });
  // Each drawn cell's drawn inflows.
  const inflow = new Map();
  for (let i = 0; i < n; i++) { const j = rt.rcv[i]; if (of[i] < 0 || j < 0 || of[j] < 0) continue; if (!inflow.has(j)) inflow.set(j, []); inflow.get(j).push(i); }
  let nodes = 0, runOn = 0;
  for (const [j, ins] of inflow) {
    if (ins.length < 2) continue;
    ins.sort((a, b) => Q[b] - Q[a]);
    if (Q[ins[1]] >= NODE * Q[ins[0]]) {
      nodes++;
      // A node: every inflow's river ends exactly on the node's point, and a river starts there.
      const c = rivers[of[j]];
      assert.equal(c.cells[0], j, `node ${j}: a new river starts at it`);
      assert.ok(at(pt(c.P, 0), j), 'and its first point is the node');
      for (const i of ins) {
        const r = rivers[of[i]], m = r.P.length / 3;
        assert.equal(r.cells[r.cells.length - 1], i, `inflow ${i} ends at node ${j}`);
        assert.ok(same(pt(r.P, m - 1), pt(c.P, 0)), 'its last point is the new river\'s first, exactly');
      }
    } else {
      runOn++;
      // One dominates: it runs on through, and the smaller ends on the larger's course.
      assert.equal(of[ins[0]], of[j], `the larger inflow runs on through ${j}`);
      for (const i of ins.slice(1)) {
        const r = rivers[of[i]], s = rivers[of[j]], e = pt(r.P, r.P.length / 3 - 1);
        assert.equal(r.cells[r.cells.length - 1], i);
        let on = false;
        for (let k = 0; k < s.P.length / 3 && !on; k++) on = same(pt(s.P, k), e);
        assert.ok(on, `a tributary's end at ${j} lies on its river`);
      }
    }
  }
  assert.ok(nodes > 0 && runOn > 0, `${nodes} nodes and ${runOn} confluences run on`);
});

test("a retrace: an unchanged river stays whole, a moved one crossfades only where it moved, fades carry on", () => {
  const copy = r => ({ ...r, P: Float32Array.from(r.P), W: r.W, cells: r.cells, fa0: null, fa1: null });
  // Unchanged: every river stays, nothing fades out.
  const drawn = rivers.map(copy), cur = rivers.map(copy);
  assert.equal(succeedRivers(drawn, cur, 1, spacing).length, 0, 'nothing fades out');
  assert.ok(cur.every(r => r.fa0 === null), 'every river stays whole');
  // One river's lower half moved by half a cell across: that half crossfades, the upper half stays.
  const k = rivers.reduce((b, r, i) => r.W.length > rivers[b].W.length ? i : b, 0), m = rivers[k].W.length;
  const cur2 = rivers.map(copy), Pm = cur2[k].P;
  const P0 = Float32Array.from(Pm);
  for (let q = Math.floor(m / 2); q < m; q++) {
    // Off the course: across it (the course's local direction crossed with the point), by half a cell.
    const x = P0[3 * q], y = P0[3 * q + 1], z = P0[3 * q + 2], a1 = Math.max(0, q - 1), b1 = Math.min(m - 1, q + 1);
    const tx = P0[3 * b1] - P0[3 * a1], ty = P0[3 * b1 + 1] - P0[3 * a1 + 1], tz = P0[3 * b1 + 2] - P0[3 * a1 + 2];
    const ax = ty * z - tz * y, ay = tz * x - tx * z, az = tx * y - ty * x, a = Math.hypot(ax, ay, az) || 1, d = 0.5 * spacing;
    const X = x + d * ax / a, Y = y + d * ay / a, Z = z + d * az / a, rr = Math.hypot(X, Y, Z);
    Pm[3 * q] = X / rr; Pm[3 * q + 1] = Y / rr; Pm[3 * q + 2] = Z / rr;
  }
  const drawn2 = rivers.map(copy), gone = succeedRivers(drawn2, cur2, 1, spacing), r = cur2[k];
  assert.ok(r.fa0 && r.fa0[0] === 1 && r.fa0[m - 1] === 0 && r.fa1.every(v => v === 1), 'the moved half fades in, the rest is drawn whole');
  assert.ok(cur2.every((c, i) => i === k || c.fa0 === null), 'the others stay');
  assert.equal(gone.length, 1, 'only its old course fades out');
  assert.ok(gone[0].fa0[0] === 0 && gone[0].fa0[m - 1] === 1 && gone[0].fa1.every(v => v === 0), 'and only where it moved');
  // A retrace mid-fade, back to the old course (fading out, at 0.5): it carries on from there, read
  // where the moved half runs farthest from every other river (a river may end at a node others leave,
  // or pass near another).
  const P1 = rivers[k].P;
  let qc = -1, far = -1;
  for (let q = Math.floor(5 * m / 8); q < Math.floor(7 * m / 8); q++) {   // clear of the bend where it leaves the course, and of its mouth
    let near = Infinity;
    rivers.forEach((o, i) => { if (i !== k) for (let e = 0; e < o.P.length; e += 3) near = Math.min(near, Math.hypot(o.P[e] - P1[3 * q], o.P[e + 1] - P1[3 * q + 1], o.P[e + 2] - P1[3 * q + 2])); });
    if (near > far) { far = near; qc = q; }
  }
  const cur3 = rivers.map(copy);
  succeedRivers(cur2.concat(gone), cur3, 0.5, spacing);
  assert.ok(Math.abs(cur3[k].fa0[qc] - 0.5) < 1e-6, `back on its old course, it carries on from 0.5 (${cur3[k].fa0[qc]})`);
});
