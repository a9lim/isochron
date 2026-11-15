// The planet's fields for the people prototype (docs/PLAN.md, Roadmap 2.0). `fieldsOf(P)` reads
// them off a live Planet (the write-back re-reads them after each climate cycle,
// tools/people/couple.mjs); `planetFields(seed, level)` builds the opening, settles its climate
// and caches its fields in tools/people/.cache/ (ignored), so iterating on the people costs
// nothing on the planet's side.
//
// Per cell, as Float32: the relief above sea level (km), the grounded ice (m), the twelve months'
// surface temperature (°C) and rain (mm), the cover's trees and grass, the vegetation's NPP (kg C
// per m² of vegetation a year), the zones' probabilities (NZ a cell), the ground's runoff (m/yr),
// the rivers' discharge (m³/s), the lakes' share, permafrost's share, a month's T′ spread (K), a
// year's spread of log rain, the regolith (m), its production at bare rock (m/yr) and the rivers'
// erosion (mm/yr).
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { buildGrid } from '../../src/grid/icosphere.js';
import { NZ } from '../../src/engine/climate.js';

const CACHE = join(dirname(fileURLToPath(import.meta.url)), '.cache');
const FIELDS = { elev: 1, ice: 1, T12: 12, P12: 12, ft: 1, fg: 1, npp: 1, zones: NZ, runoff: 1, discharge: 1, lake: 1, perma: 1, sigT: 1, sigP: 1, reg: 1, p0: 1, ero: 1 };
const VERSION = 3;

/** The fields of a live Planet, into `f` (made if absent). */
export function fieldsOf(P, f = null) {
  const n = P.grid.n, c = P.climate, tec = P.tec, s = tec.seaLevel;
  if (!f) { f = { seed: P.seed, grid: P.grid, n }; for (const [name, w] of Object.entries(FIELDS)) f[name] = new Float32Array(w * n); }
  for (let i = 0; i < n; i++) f.elev[i] = tec.elev[i] - s;
  f.ice.set(P.ice.H); f.T12.set(c.T12); f.P12.set(c.P12);
  f.ft.set(P.life.veg.ft); f.fg.set(P.life.veg.fg); f.npp.set(P.life.veg.pi);
  f.zones.set(c.zones); f.runoff.set(c.runoff); f.discharge.set(P.land.discharge);
  f.lake.set(c.lakeWet); f.perma.set(c.soil.permafrost); f.sigT.set(P.year.spreadFine().T);
  // A year's spread of log rain (the year model's, the anomaly's memory kept): the harvests' weather.
  for (let i = 0; i < n; i++) { let map = 0; for (let m = 0; m < 12; m++) map += c.P12[12 * i + m]; f.sigP[i] = map > 1 ? P.year.annualRainSpread(i, map) : 0; }
  f.reg.set(P.regolith.h);
  for (let i = 0; i < n; i++) { f.p0[i] = P.regolith.p0(i); f.ero[i] = P.land.erosion[i] || 0; }
  f.co2 = P.carbon.pco2; f.meanT = c.stats.meanT; f.settled = c.stats.settled;
  return f;
}

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
