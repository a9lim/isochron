// The surface's hypsometry (each height's share of the sphere) of a seeded planet as it opens and as
// its plates, landscape and crustal flexure run, against today's Earth (ETOPO's bed, baked on the grid).
// usage: node tools/hypsometry.mjs [seed | etopo | earth] [Myr] [print every Myr] [overrides json {PARAMS, LAND, CRUSTFLEX}] [level]
//   etopo: the baked bed alone; earth: today's Earth opened in the sim and run.
import { buildGrid } from '../src/grid/icosphere.js';
import { makeTransfer, restrict } from '../src/grid/transfer.js';
import { Tectonics, PARAMS } from '../src/engine/plates.js';
import { Landscape, LAND } from '../src/engine/landscape.js';
import { genesis } from '../src/engine/genesis.js';
import { earthGenesis, loadEarth } from '../src/engine/earth.js';
import { Flexure } from '../src/engine/flexure.js';
import { CrustFlex, CRUSTFLEX } from '../src/engine/crustflex.js';
import { Plumes } from '../src/engine/plumes.js';
import { elevation, H_OCEANIC } from '../src/engine/crust.js';

const [seed = 'earthlike', myr = '0', every = '50', ov = '{}', lv = '6'] = process.argv.slice(2);
const o = JSON.parse(ov);
Object.assign(PARAMS, o.PARAMS || {}); Object.assign(LAND, o.LAND || {}); Object.assign(CRUSTFLEX, o.CRUSTFLEX || {});
const level = +lv, g = buildGrid(level);

const EDGES = [-6, -5, -4, -3, -2, -1, -0.2, 0, 0.2, 0.5, 1, 2, 3, 4];
export function hypsometry(g, z, extra = {}) {
  const A = 4 * Math.PI, bins = new Float64Array(EDGES.length + 1), land = [];
  let la = 0, lz = 0, oa = 0, oz = 0;
  for (let i = 0; i < g.n; i++) {
    const a = g.area[i], e = z[i];
    let b = 0; while (b < EDGES.length && e >= EDGES[b]) b++;
    bins[b] += a / A;
    if (e >= 0) { la += a; lz += a * e; land.push([e, a]); } else { oa += a; oz += a * e; }
  }
  land.sort((p, q) => p[0] - q[0]);
  const pct = q => { let acc = 0; for (const [e, a] of land) { acc += a; if (acc >= q * la) return e; } return NaN; };
  const f = x => x.toFixed(2);
  return `land ${(100 * la / A).toFixed(1)}% mean ${f(lz / la)} p50 ${f(pct(0.5))} p90 ${f(pct(0.9))} p99 ${f(pct(0.99))} · sea mean ${f(-oz / oa)} km` +
    Object.entries(extra).map(([k, v]) => ` · ${k} ${v}`).join('') + '\n    ' +
    ['<-6', ...EDGES.map((e, k) => k + 1 < EDGES.length ? `${e}..${EDGES[k + 1]}` : `>${e}`)].map((l, k) => `${l} ${(100 * bins[k]).toFixed(1)}`).join(' | ');
}

// The continental crust (φ ≥ ½): its share of the sphere, mean thickness, share over 50 km, and the share of the
// sphere and of the crust that would stand dry were the sea at Earth's freeboard (2.5 km over a new ridge).
function crustStats(tec) {
  const s = elevation(H_OCEANIC, 0, 0) + 2.5;
  let ca = 0, ch = 0, thick = 0, dry = 0, cdry = 0;
  for (let i = 0; i < tec.grid.n; i++) {
    const a = tec.grid.area[i];
    if (tec.elev[i] >= s) dry += a;
    if (tec.phi[i] >= 0.5) { ca += a; ch += a * tec.h[i]; if (tec.h[i] > 50) thick += a; if (tec.elev[i] >= s) cdry += a; }
  }
  return { cont: `${(100 * ca / (4 * Math.PI)).toFixed(1)}%`, h: (ch / ca).toFixed(1), '>50km': `${(100 * thick / ca).toFixed(1)}%`, 'land at 2.5 km over ridges': `${(100 * dry / (4 * Math.PI)).toFixed(1)}% (crust ${(100 * cdry / ca).toFixed(0)}%)`, 'sea over ridges': (tec.seaLevel - s + 2.5).toFixed(2) };
}

const rel = tec => { const z = new Float64Array(tec.grid.n); for (let i = 0; i < z.length; i++) z[i] = tec.elev[i] - tec.seaLevel; return z; };

if (seed === 'etopo') {
  const d = await loadEarth(), fine = buildGrid(d.level), bed = Float64Array.from(d.bed, v => v / 1000);
  const z = level < d.level ? restrict(makeTransfer(fine, g), bed, new Float64Array(g.n)) : bed;
  console.log(`ETOPO bed, level ${level}\n  ` + hypsometry(g, z));
} else {
  const tec = new Tectonics(g), land = new Landscape(tec);
  if (seed === 'earth') { earthGenesis(tec, seed, await loadEarth()); }
  else genesis(tec, seed, { spinup: +(process.env.SPIN ?? 80), landscape: land });
  const plumes = new Plumes(tec, seed); tec.swell = plumes.swell; tec.updateElevation();
  const flex = new CrustFlex(tec, new Flexure(g));
  console.log(`${seed}, level ${level}, opening\n  ` + hypsometry(g, rel(tec), crustStats(tec)));
  const fk = Math.max(1, Math.round(CRUSTFLEX.EVERY / 0.5));
  for (let s = 1; s <= +myr * 2; s++) {
    tec.step(0.5); plumes.step?.(0.5); land.step(5e5);
    if (s % fk === 0) { flex.step(0.5 * fk); tec.updateElevation(); }
    if (s % (2 * +every) === 0) console.log(`${(s / 2).toFixed(0)} Myr\n  ` + hypsometry(g, rel(tec), crustStats(tec)));
  }
}
