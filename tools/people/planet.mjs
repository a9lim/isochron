// The settled planet's fields for the people prototype (docs/PLAN.md, Roadmap 2.0): the opening
// built and its climate settled once per seed and level, then cached in tools/people/.cache/
// (ignored), so iterating on the people costs nothing on the planet's side. Nothing here writes
// back to the planet: the prototype reads the opening and holds it fixed.
//
// Per cell, as Float32: the relief above sea level (km), the grounded ice (m), the twelve months'
// surface temperature (°C) and rain (mm), the cover's trees and grass, the vegetation's NPP (kg C
// per m² of vegetation a year), the zones' probabilities (NZ a cell), the ground's runoff (m/yr),
// the rivers' discharge (m³/s), the lakes' share, permafrost's share and a month's T′ spread (K).
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { buildGrid } from '../../src/grid/icosphere.js';
import { NZ } from '../../src/engine/climate.js';

const CACHE = join(dirname(fileURLToPath(import.meta.url)), '.cache');
const FIELDS = { elev: 1, ice: 1, T12: 12, P12: 12, ft: 1, fg: 1, npp: 1, zones: NZ, runoff: 1, discharge: 1, lake: 1, perma: 1, sigT: 1 };

export async function planetFields(seed = 'earthlike', level = 6, { log = () => {} } = {}) {
  const file = join(CACHE, `${seed}-l${level}.bin`), grid = buildGrid(level), n = grid.n;
  let f;
  if (existsSync(file)) {
    const buf = readFileSync(file), head = JSON.parse(buf.subarray(4, 4 + buf.readUInt32LE(0)).toString());
    let o = 4 + buf.readUInt32LE(0);
    o = (o + 3) & ~3;
    const all = new Float32Array(buf.buffer.slice(buf.byteOffset + o, buf.byteOffset + buf.length));
    f = { ...head.meta }; let k = 0;
    for (const [name, w] of Object.entries(FIELDS)) { f[name] = all.subarray(k, k + w * n); k += w * n; }
    log(`planet ${seed} at level ${level} from the cache`);
  } else {
    const { Planet } = await import('../../src/engine/planet.js');
    const t0 = performance.now();
    const P = new Planet(seed, { level });
    P.settleClimate();
    const c = P.climate, tec = P.tec, s = tec.seaLevel;
    f = { meta: null };
    for (const [name, w] of Object.entries(FIELDS)) f[name] = new Float32Array(w * n);
    for (let i = 0; i < n; i++) f.elev[i] = tec.elev[i] - s;
    f.ice.set(P.ice.H); f.T12.set(c.T12); f.P12.set(c.P12);
    f.ft.set(P.life.veg.ft); f.fg.set(P.life.veg.fg); f.npp.set(P.life.veg.pi);
    f.zones.set(c.zones); f.runoff.set(c.runoff); f.discharge.set(P.land.discharge);
    f.lake.set(c.lakeWet); f.perma.set(c.soil.permafrost); f.sigT.set(P.year.spreadFine().T);
    const meta = { seed, level, n, co2: P.carbon.pco2, meanT: c.stats.meanT, settled: c.stats.settled };
    f = { ...meta, ...f }; delete f.meta;
    mkdirSync(CACHE, { recursive: true });
    const head = Buffer.from(JSON.stringify({ meta })), pad = (4 + head.length + 3) & ~3;
    const parts = Object.keys(FIELDS).map(k => Buffer.from(f[k].buffer, f[k].byteOffset, f[k].byteLength));
    const lenBuf = Buffer.alloc(4); lenBuf.writeUInt32LE(head.length);
    writeFileSync(file, Buffer.concat([lenBuf, head, Buffer.alloc(pad - 4 - head.length), ...parts]));
    log(`planet ${seed} at level ${level} built and settled in ${((performance.now() - t0) / 1e3).toFixed(1)} s (cycle ${meta.settled}, ${meta.meanT.toFixed(1)} °C, ${meta.co2.toFixed(0)} ppm); cached`);
  }
  return { grid, ...f };
}
