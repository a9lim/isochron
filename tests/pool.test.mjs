// The engine's pool (src/engine/pool.js): a kernel's work on a cell doesn't depend on how the cells are
// cut into chunks or in what order the chunks run, so the pool's threads give what one thread gives.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Planet } from '../src/engine/planet.js';
import { KERNELS } from '../src/engine/kernels.js';
import { chunkOf } from '../src/engine/shared.js';
import { SOIL } from '../src/engine/soil.js';

// Each kernel's arguments on a small planet after a climate cycle.
const P = new Planet('earthlike', { level: 4, spinLevel: 4, spinup: 10 });
P.climate.solve(1);
const ARGS = {
  soilYear: () => { const c = P.climate; return { soil: c.soil.arrays(), T: c.T12, P: c.P12, PET: c.PET12, cold: false, SOIL: { ...SOIL } }; },
  clouds: () => P.climate.clouds.args(2, P.climate.Tf[0]),
};
const clone = x => ArrayBuffer.isView(x) ? x.slice() : x && typeof x === 'object' ? Object.fromEntries(Object.entries(x).map(([k, v]) => [k, clone(v)])) : x;

test('pool: every kernel gives each cell the same, over all its cells at once or by chunks in reverse', () => {
  const n = P.grid.n;
  for (const name of Object.keys(KERNELS)) {
    assert.ok(ARGS[name], `${name} has arguments in this test`);
    const base = ARGS[name](), whole = clone(base), chunked = clone(base);
    KERNELS[name](whole, 0, n);
    for (let k = 7; k >= 0; k--) { const [a, b] = chunkOf(k, n, 8); KERNELS[name](chunked, a, b); }
    assert.deepStrictEqual(chunked, whole, name);
  }
});
