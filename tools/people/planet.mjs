// The planet's fields for the people, cached (docs/MODEL.md): `planetFields(seed, level)`
// builds the opening, settles its climate, fills its lakes as the page's opening does and caches its fields (src/engine/peoplelink.js,
// `fieldsOf`) in tools/people/.cache/ (ignored), so iterating on the people costs nothing on the
// planet's side. With `engine` finer than `level` (env ENGINE in the tools: the page's desktop
// engine is level 7), the planet is built there and its fields restricted to the people's grid, as
// the page's engine worker does.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { buildGrid } from '../../src/grid/icosphere.js';
import { makeTransfer } from '../../src/grid/transfer.js';
import { FIELDS, fieldsOf } from '../../src/engine/peoplelink.js';

export { fieldsOf };
const CACHE = join(dirname(fileURLToPath(import.meta.url)), '.cache');
const VERSION = 25;  // bumped when the planet's climate or the fields change (25: the rivers' drainage on the people's grid, `down`, for the canals' books; 24: the lakes' heat; 23: today's Earth's plates, so its arcs' eruptions, ~0.004 K; 22: the rivers' discharge from the climate's runoff down the lakes' drainage, Planet.rivers, not the landscape's opening's; 21: moist static energy, the ITCZ softly and between its sectors; 20: the aquifer's store and recharge, dust's deposition, for 4c's wells and fertility; 19: the column's humidity at the warmest point, for the people's heat; 18: the equator's upwelling, the storms' gusts on the sea, high ground's longwave; 17: a lakeshore's lake's export, and the lakes filled to their balance as the page's opening fills them; 8: the air takes the ground's evaporation; 9: a year's mean T′ spread; 10: the coast's sea's export; 11: the winds, currents and sea ice for the routes; 13: a seeded planet's ice grown with its climate in the opening; 14: the whole fast sim in its chunks, to the ice's thickness; 15: the sea's carbon settled at the opening's end; 16: the bed under the ice takes its load between the sea's re-solves)

export async function planetFields(seed = 'earthlike', level = 6, { log = () => {}, engine = +(process.env.ENGINE || level) } = {}) {
  engine = Math.max(level, engine);
  const file = join(CACHE, `${seed}-l${level}${engine > level ? `-e${engine}` : ''}-v${VERSION}.bin`), grid = buildGrid(level), n = grid.n;
  let f;
  if (existsSync(file)) {
    const buf = readFileSync(file), head = JSON.parse(buf.subarray(4, 4 + buf.readUInt32LE(0)).toString());
    const o = (4 + buf.readUInt32LE(0) + 3) & ~3;
    const all = new Float32Array(buf.buffer.slice(buf.byteOffset + o, buf.byteOffset + buf.length));
    f = { ...head.meta, grid }; let k = 0;
    for (const [name, w] of Object.entries(FIELDS)) { f[name] = all.subarray(k, k + w * n); k += w * n; }
    log(`planet ${seed} at level ${level}${engine > level ? ` (from level ${engine})` : ''} from the cache`);
  } else {
    const { openPlanet, PLANET } = await import('../../src/engine/planet.js');
    const t0 = performance.now();
    const P = await openPlanet(seed, { level: engine });
    P.settleClimate();
    // The lakes at their balance with the climate, cycle by cycle as the page's opening holds them
    // (Planet.stepLakes; settleClimate steps no fast layers, and its Earth had none), and the climate
    // and the lakes' algae run again on them.
    for (let k = 0; k < 3; k++) { P.stepLakes(0, PLANET.LAKES_LIVE); P.climate.solve(1); P.afterClimate(); }
    f = fieldsOf(P, null, engine > level ? makeTransfer(P.grid, grid) : null);
    const meta = { seed, level, n, co2: f.co2, meanT: f.meanT, settled: f.settled };
    mkdirSync(CACHE, { recursive: true });
    const head = Buffer.from(JSON.stringify({ meta })), pad = (4 + head.length + 3) & ~3;
    const parts = Object.keys(FIELDS).map(k => Buffer.from(f[k].buffer, f[k].byteOffset, f[k].byteLength));
    const lenBuf = Buffer.alloc(4); lenBuf.writeUInt32LE(head.length);
    writeFileSync(file, Buffer.concat([lenBuf, head, Buffer.alloc(pad - 4 - head.length), ...parts]));
    log(`planet ${seed} at level ${level}${engine > level ? ` (from level ${engine})` : ''} built and settled in ${((performance.now() - t0) / 1e3).toFixed(1)} s (cycle ${meta.settled}, ${meta.meanT.toFixed(1)} °C, ${meta.co2.toFixed(0)} ppm); cached`);
  }
  return f;
}
