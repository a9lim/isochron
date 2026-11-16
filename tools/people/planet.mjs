// The planet's fields for the people, cached (docs/PLAN.md, Roadmap 2.0): `planetFields(seed, level)`
// builds the opening, settles its climate and caches its fields (src/engine/peoplelink.js,
// `fieldsOf`) in tools/people/.cache/ (ignored), so iterating on the people costs nothing on the
// planet's side.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { buildGrid } from '../../src/grid/icosphere.js';
import { FIELDS, fieldsOf } from '../../src/engine/peoplelink.js';

export { fieldsOf };
const CACHE = join(dirname(fileURLToPath(import.meta.url)), '.cache');
const VERSION = 3;

export async function planetFields(seed = 'earthlike', level = 6, { log = () => {} } = {}) {
  const file = join(CACHE, `${seed}-l${level}-v${VERSION}.bin`), grid = buildGrid(level), n = grid.n;
  let f;
  if (existsSync(file)) {
    const buf = readFileSync(file), head = JSON.parse(buf.subarray(4, 4 + buf.readUInt32LE(0)).toString());
    const o = (4 + buf.readUInt32LE(0) + 3) & ~3;
    const all = new Float32Array(buf.buffer.slice(buf.byteOffset + o, buf.byteOffset + buf.length));
    f = { ...head.meta, grid }; let k = 0;
    for (const [name, w] of Object.entries(FIELDS)) { f[name] = all.subarray(k, k + w * n); k += w * n; }
    log(`planet ${seed} at level ${level} from the cache`);
  } else {
    const { Planet } = await import('../../src/engine/planet.js');
    const t0 = performance.now();
    const P = new Planet(seed, { level });
    P.settleClimate();
    f = fieldsOf(P);
    const meta = { seed, level, n, co2: f.co2, meanT: f.meanT, settled: f.settled };
    mkdirSync(CACHE, { recursive: true });
    const head = Buffer.from(JSON.stringify({ meta })), pad = (4 + head.length + 3) & ~3;
    const parts = Object.keys(FIELDS).map(k => Buffer.from(f[k].buffer, f[k].byteOffset, f[k].byteLength));
    const lenBuf = Buffer.alloc(4); lenBuf.writeUInt32LE(head.length);
    writeFileSync(file, Buffer.concat([lenBuf, head, Buffer.alloc(pad - 4 - head.length), ...parts]));
    log(`planet ${seed} at level ${level} built and settled in ${((performance.now() - t0) / 1e3).toFixed(1)} s (cycle ${meta.settled}, ${meta.meanT.toFixed(1)} °C, ${meta.co2.toFixed(0)} ppm); cached`);
  }
  return f;
}
