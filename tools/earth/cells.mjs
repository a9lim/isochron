// The grid's cell centres for the bake (tools/earth/bake.py): level L's `pos` as raw float64 (x, y, z
// per cell, little-endian) in tools/earth/.cache/cells-L.f64. The bake assigns each data point to its
// nearest centre, which is its Voronoi cell.
//   node tools/earth/cells.mjs 7
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { buildGrid } from '../../src/grid/icosphere.js';

const L = +(process.argv[2] ?? 7);
const dir = fileURLToPath(new URL('./.cache/', import.meta.url));
mkdirSync(dir, { recursive: true });
const g = buildGrid(L);
writeFileSync(`${dir}cells-${L}.f64`, Buffer.from(g.pos.buffer, g.pos.byteOffset, g.pos.byteLength));
console.log(`level ${L}: ${g.n} cells → ${dir}cells-${L}.f64`);
