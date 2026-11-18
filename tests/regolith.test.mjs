// Phase 7's regolith (src/engine/regolith.js) and the ice's erosion applied to it and
// the crust: the steady depth h* = h₀ ln(P₀/E) against its exact solution, bare rock
// where erosion outruns production, and the budget of rock, regolith and sediment
// through glacial erosion, till and outwash (the landscape routing the outwash).
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildGrid } from '../src/grid/icosphere.js';
import { Tectonics } from '../src/engine/plates.js';
import { Landscape } from '../src/engine/landscape.js';
import { genesis } from '../src/engine/genesis.js';
import { Ice, ICE } from '../src/engine/ice.js';
import { Regolith, REGOLITH, regolithStep, steadyRegolith } from '../src/engine/regolith.js';

const say = (...a) => console.log('  ', ...a);

test('the regolith: its steady depth h₀ ln(P₀/E), from bare rock and from deep; bare where E ≥ P₀; any step exact', () => {
  const h0 = REGOLITH.H0, P0 = 1e-4;                    // m/yr
  let worst = 0, worstSteps = 0;
  for (const E of [1e-6, 1e-5, 3e-5, 9e-5]) {
    const want = h0 * Math.log(P0 / E), tau = h0 / E;     // relaxes over h₀/E
    for (const start of [0, 5, 20]) {
      const got = regolithStep(start, P0, E, 100 * tau);   // from 20 m it erodes down for (20 − h*)/E first
      worst = Math.max(worst, Math.abs(got - want));
      // One step against a thousand: the solution is exact, so the steps compose.
      let h = start;
      for (let k = 0; k < 1000; k++) h = regolithStep(h, P0, E, 0.002 * tau);
      worstSteps = Math.max(worstSteps, Math.abs(h - regolithStep(start, P0, E, 2 * tau)));
    }
    assert.ok(Math.abs(steadyRegolith(P0, E) - want) < 1e-12);
  }
  // Bare where erosion outruns production; thin regolith is stripped, then the rock stays bare.
  const bare = [regolithStep(0, P0, 2 * P0, 1e6), regolithStep(3, P0, 2 * P0, 1e6)];
  // With nothing eroding, it thickens as h₀ ln(1 + P₀t/h₀).
  const t = 3e7, grow = regolithStep(0, P0, 0, t), wantGrow = h0 * Math.log(1 + P0 * t / h0);
  say(`h* within ${worst.toExponential(1)} m of h₀ ln(P₀/E) from 0, 5 and 20 m (E 1–90 m/Myr against P₀ 100); a step against a thousand ${worstSteps.toExponential(1)} m; ` +
    `bare ${bare.map(v => v.toFixed(3)).join(', ')} m where E = 2P₀; ${(t / 1e6).toFixed(0)} Myr uneroded ${grow.toFixed(3)} m against ${wantGrow.toFixed(3)}`);
  assert.ok(worst < 1e-6, 'steady depth');
  assert.ok(worstSteps < 1e-9, 'exact steps');
  assert.ok(bare.every(v => v === 0), 'bare');
  assert.ok(Math.abs(grow - wantGrow) < 1e-9, 'growth uneroded');
});

/** A small planet with an ice cap grown by hand on its largest continent, a landscape and a regolith. */
function capPlanet() {
  const g = buildGrid(5), tec = new Tectonics(g), land = new Landscape(tec);
  genesis(tec, 'earthlike', { spinup: 10, landscape: land });
  const climate = { version: 0, tAt: () => 0, pAt: () => 0 };
  const ice = new Ice(tec, climate);
  ice.mbVersion = 0;
  // Snow over the land poleward of 40° in one hemisphere, melt elsewhere; a temperate bed.
  let snowy = 0;
  for (let i = 0; i < g.n; i++) {
    const on = tec.elev[i] > tec.seaLevel && g.pos[3 * i + 2] > 0.64;
    ice.M[i] = on ? 0.5 : -20; ice.melt[i] = on ? 0 : 20;
    if (on) snowy++;
  }
  ice.Ts0.fill(-2);
  land.preview();
  const reg = new Regolith(tec, land, null, ice);
  REGOLITH.START = 3; reg.init(); REGOLITH.START = -1;
  return { g, tec, land, ice, reg, snowy };
}

test('rock, regolith and sediment kept through glacial erosion, till and outwash', () => {
  const kg = ICE.KG;
  ICE.KG = 1e-4;                                        // erosion fast enough to measure in a few kyr
  try {
    const { g, tec, land, ice, reg, snowy } = capPlanet(), A = ice.areaM, n = g.n;
    // World cells showing a frame cell another also shows (nearest-cell rounding, ~1%) take both
    // cells' change to one frame cell, so the regolith's own budget is read on the others.
    const solo = new Uint8Array(n).fill(1), seen = new Map();
    for (let i = 0; i < n; i++) { const k = tec.owner[i] * n + tec.ref[i]; if (seen.has(k)) solo[i] = solo[seen.get(k)] = 0; else seen.set(k, i); }
    const rock = () => { let v = 0; for (let i = 0; i < n; i++) v += tec.h[i] * 1000 * A[i]; return v; };   // m³, the world's view
    const bank = () => land.sedIn.reduce((s, v) => s + v * 1e9, 0);
    const debris = () => ice.debris.reduce((s, v, i) => s + v * A[i], 0);
    const regV = () => { let v = 0; for (let i = 0; i < n; i++) if (solo[i]) v += reg.h[i] * A[i]; return v; };
    for (let k = 0; k < 10; k++) { ice.advance(1000, 1e9); reg.update(0); }
    const r0 = rock(), b0 = bank(), d0 = debris();
    let ero = 0, till = 0, lost = 0, laid = 0;
    const R0 = regV();
    for (let k = 0; k < 20; k++) {
      ice.advance(1000, 1e9);
      // The regolith's own budget, cell by cell: stripped first, then laid down as till less the outwash.
      const e = ice.eroded, tl = ice.till;
      for (let i = 0; i < n; i++) {
        ero += e[i] * A[i]; till += tl[i] * A[i];
        if (!solo[i]) continue;
        const p = tec.plates[tec.owner[i]], j = tec.ref[i];
        lost += Math.min(p.reg[j], e[i]) * A[i];
        laid += (!tec.sea[i] ? 1 - REGOLITH.OUTWASH : 1) * tl[i] * A[i];
      }
      reg.update(0);                                     // no production: the budget alone
    }
    const r1 = rock(), b1 = bank(), d1 = debris(), R1 = regV();
    const off = (r1 + b1 + d1) - (r0 + b0 + d0);
    // The landscape routes the outwash: what it banked joins the crust downstream, read against a
    // twin's same step without it (diffusion and erosion move crust too). The crust is the plates':
    // world cells that show one frame cell (nearest-cell rounding) all see what was laid in it, so
    // the world's view counts a deposit there twice; each frame cell the world shows counts once.
    const A1 = capPlanet(), B1 = capPlanet();
    const vol = P => {
      const seen = new Set(), t = P.tec;
      let v = 0;
      for (let i = 0; i < n; i++) {
        const f = t.owner[i] * n + t.ref[i];
        if (seen.has(f)) continue;
        seen.add(f); v += t.plates[t.owner[i]].h[t.ref[i]] * 1000 * A[i];
      }
      return v;
    };
    // Banked on land whose way down to the sea runs through frame cells no other world cell shows: a
    // deposit in a shared one (nearest-cell rounding) stands in both world cells, and the diffusion then
    // spreads it from each, which the twins' difference would count as the outwash not kept.
    let banked = 0;
    const shown = new Map(), fr = i => A1.tec.owner[i] * n + A1.tec.ref[i];
    for (let i = 0; i < n; i++) shown.set(fr(i), (shown.get(fr(i)) || 0) + 1);
    A1.land.reroute();
    const clear = i => { for (let c = i, k = 0; c >= 0 && k < n; c = A1.land.r.rcv[c], k++) if (shown.get(fr(c)) !== 1) return false; return true; };
    for (let i = 0, k = 0; i < n && k < 40; i++) if (A1.tec.elev[i] > A1.tec.seaLevel + 0.3 && clear(i)) { A1.land.sedIn[i] = 50; banked += 50e9; k++; }
    const va = vol(A1), vb = vol(B1);
    A1.land.step(1000); B1.land.step(1000);
    const routed = (vol(A1) - va) - (vol(B1) - vb);
    say(`${snowy} snowy cells, ice ${(ice.stats.volume / 1e15).toFixed(2)} M km³ sliding ${ice.stats.sliding.toFixed(0)} m/yr; over 20 kyr eroded ${(ero / 1e9).toFixed(1)} km³, ` +
      `till ${(till / 1e9).toFixed(1)}, outwash banked ${((b1 - b0) / 1e9).toFixed(1)}, debris ${(d0 / 1e9).toFixed(1)} → ${(d1 / 1e9).toFixed(1)}; ` +
      `rock + debris + outwash off by ${(off / ero).toExponential(1)} of the erosion; the regolith ${(R0 / 1e9).toFixed(1)} → ${(R1 / 1e9).toFixed(1)} km³ ` +
      `(stripped ${(lost / 1e9).toFixed(1)}, laid ${(laid / 1e9).toFixed(1)}, off by ${((R1 - R0 - laid + lost) / Math.max(lost, laid)).toExponential(1)}); ` +
      `the landscape's step routes ${(banked / 1e9).toFixed(0)} km³ of outwash and keeps it to ${(routed / banked - 1).toExponential(1)} (${(A1.land.flux.outwash * 1000).toFixed(0)} km³ counted)`);
    assert.ok(ero > 1e10 && till > 1e9, 'the ice erodes and lays till');
    assert.ok(Math.abs(off) < 1e-3 * ero, 'rock, debris and outwash kept');
    assert.ok(Math.abs(R1 - R0 - laid + lost) < 1e-3 * Math.max(lost, laid), 'the regolith: stripped first, laid as till');
    assert.ok(A1.land.sedIn.every(v => v === 0) && Math.abs(routed / banked - 1) < 1e-3, 'the outwash routed and kept');
  } finally { ICE.KG = kg; }
});
