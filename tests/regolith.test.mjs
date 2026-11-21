// The regolith (src/engine/regolith.js): its steady depth h₀ ln(P₀/E), and its steps exact.
import test from 'node:test';
import assert from 'node:assert/strict';
import { REGOLITH, regolithStep, steadyRegolith } from '../src/engine/regolith.js';


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
  assert.ok(worst < 1e-6, 'steady depth');
  assert.ok(worstSteps < 1e-9, 'exact steps');
  assert.ok(bare.every(v => v === 0), 'bare');
  assert.ok(Math.abs(grow - wantGrow) < 1e-9, 'growth uneroded');
});
