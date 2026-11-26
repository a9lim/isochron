// The engine's pool (src/engine/pool.js): a kernel's work on a cell doesn't depend on how the cells are
// cut into chunks or in what order the chunks run, so the pool's threads give what one thread gives.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Planet } from '../src/engine/planet.js';
import { KERNELS } from '../src/engine/kernels.js';
import { chunkOf } from '../src/engine/shared.js';
import { SOIL } from '../src/engine/soil.js';
import { CLIMATE } from '../src/engine/climate.js';
import { CLOUDS } from '../src/engine/clouds.js';
import { coverArgs } from '../src/engine/life.js';
import { SEAHEAT } from '../src/engine/seaheat.js';

// Each kernel's arguments on a small planet after a climate cycle.
const P = new Planet('earthlike', { level: 4, spinLevel: 4, spinup: 10 });
P.climate.solve(1);
const ARGS = {
  soilYear: () => { const c = P.climate; return { soil: c.soil.arrays(), T: c.T12, P: c.P12, PET: c.PET12, cold: false, SOIL: { ...SOIL } }; },
  clouds: () => P.climate.clouds.args(2, P.climate.Tf[0]),
  pressure: () => { const c = P.climate; return { lat: c.lat, secX: c.secX, landSmooth: c.landSmooth, polarHi: c.polarHi, anom: c.Tf[1], itcz: Array.from(c.itcz.subarray(36, 72)), phiH: 0.55, pres: c.pres, C: { ...CLIMATE } }; },
  finish: () => P.climate.finishArgs(),
  dustSources: () => P.aeolian.sourceArgs(3, P.climate.Tf[0]),
  routeLayer: () => { const g = P.grid, n = g.n, mk = Int32Array.from([0, 17, 400, 1201, 2000, 2561]), nm = mk.length; return { off: g.nbrOff, nbr: g.nbr, cost: Float32Array.from({ length: g.nbrOff[n] }, (_, o) => 1 + Math.abs(Math.sin(o))), mk, D: new Float32Array(nm * nm), pred: new Uint16Array(nm * n), n, nm }; },
  descent: () => { const g = P.grid, r = P.land.r, n = g.n; return { nbrOff: g.nbrOff, nbr: g.nbr, dist: g.dist, z: P.land.zr, base: P.land.base, zf: r.zf, rcv: new Int32Array(n), rlen: new Float32Array(n), lake: new Uint8Array(n) }; },
  diffuse: () => { const L = P.land; L.diffuse(5e5); const pl = L.plan(5e5); return { C: pl.C, kap: pl.kap, kapT: pl.kapT, loc: L.loc, off: L.dOff, edge: L.dEdge, other: L.dOther, EG: L.dEG, ds: pl.ds, thick: true, hc: L.hc, hn: new Float64Array(L.hn.length), Ac: L.Ac, dT: L.dT }; },
  eastStress: () => { const c = P.climate, g = P.grid, n = g.n; return { W: c.windPhase, pos: g.pos, east: Float64Array.from({ length: 2 * n }, (_, j) => (j & 1 ? 0.6 : -0.8)), k: 2e-3, tx: new Float64Array(n), SEAHEAT: { ...SEAHEAT } }; },
  meanStress: () => { const c = P.climate, g = P.grid; return { W: c.windPhase, pos: g.pos, tf: new Float64Array(3 * g.n), SEAHEAT: { ...SEAHEAT } }; },
  cover: () => coverArgs(P.life.veg, P.climate, 280, {}),
  groundTail: () => { const c = P.climate, s = c.soil, o = s.out; return { Smax: s.Smax, A: s.A, SWE: o.SWE, quick: o.quick, base: o.base, S: o.S, evap: o.evap, P12: c.P12, PET12: c.PET12, land: c.landMask, pAnn: c.pAnn, peAnn: c.peAnn, runoff: c.runoff, runoffM: c.runoffM, betaPh: c.betaPh, evapPh: c.evapPh, ph: Array.from(c.monthPh), FC: SOIL.FC, CV: SOIL.COVER, AQ: { F_AQ: SOIL.F_AQ, TAU_A: SOIL.TAU_A } }; },
  phaseT: () => { const c = P.climate, n = P.grid.n; return { tau: 0.25, Tf: c.Tf, T: new Float64Array(n), band: c.band, land: c.landMask, elev: c.elevPos, sst: c.ocean.fine.sst, W: c.W[1], dry: CLIMATE.ITCZ_DRY, R: CLIMATE.ITCZ_R, LAPSE: CLIMATE.LAPSE, score: new Float64Array(n) }; },
  anom: () => { const c = P.climate, n = P.grid.n; return { T: c.Tf[0], lat: c.lat, zm: Array.from({ length: 90 }, (_, b) => 25 - Math.abs(b - 45)), anom: new Float64Array(n) }; },
  olr: () => { const c = P.climate, n = P.grid.n; return { hi: c.clouds.hi, T: c.Tf[0], land: c.landMask, elev: c.elevPos, area: P.grid.area, n, A: CLIMATE.A, B: CLIMATE.B, OLR_Z: CLIMATE.OLR_Z, LAPSE: CLIMATE.LAPSE, out: new Float64Array(n), CLOUDS: { ...CLOUDS } }; },
  humid: () => { const c = P.climate, n = P.grid.n; return { Tf: c.Tf, W: c.W, land: c.landMask, elev: c.elevPos, sst: c.ocean.fine.sst, lapse: CLIMATE.LAPSE, out: Array.from({ length: 6 }, () => new Float64Array(n)) }; },
  dustEmit: () => { const c = P.climate, a = P.aeolian, d = a.dust; return { wind: c.windPhase[2], cw: c.carry, rain: c.Pph[2], source: a.source, ut: a.ut, gust: a.gust, emission: null, C: d.P.C * 86400, Af: d.areaF, E: d.emit[2], Rn: d.rain[2], aw: d.aw, ar: d.ar, ae: d.ae }; },
  dustDown: () => { const n = P.grid.n, nc = 642, kidOff = new Int32Array(nc + 1), kids = []; for (let q = 0; q < nc; q++) { for (let i = nc + q; i < n; i += 997) kids.push(i); kidOff[q + 1] = kids.length; } return { kidOff, kids: Int32Array.from(kids), f: Float64Array.from({ length: 3 * n }, (_, j) => Math.sin(j)), k: 3, y: new Float64Array(3 * nc) }; },
  dustEffects: () => { const c = P.climate, a = P.aeolian, o = a.dust.out, n = P.grid.n; return { dep: o.depAnn, emit: o.emitAnn, T12: c.T12, P12: c.P12, A: { ...a.A }, PLANETARY: 0.4, conc: new Float32Array(n), dark: new Float32Array(n), ddf: new Float32Array(2 * n), net: new Float32Array(n), da: new Float64Array(n) }; },
  dustCoeffs: () => { const d = P.aeolian.dust, sg = d.solveGrid; return { p: 2, nbrOff: sg.nbrOff, nbr: sg.nbr, AW: d.aw, AR: d.ar, AE: d.ae, ch: d.chord, el: d.elen, kd: d.kdiff, co: d.co, src: d.src }; },
  dustFinish: () => P.aeolian.dust.finishArgs(P.aeolian.alb),
  wind: () => { const c = P.climate, g = c.grid; return { g: { n: g.n, pos: g.pos, nbrOff: g.nbrOff, nbr: g.nbr, gw: g.gw }, pres: c.presPhase[2], omega: CLIMATE.OMEGA, wind: c.windPhase[2], carry: c.carry, gp: c.gp, C: { ...CLIMATE } }; },
};
// The kernels that run over something other than the planet's cells: the routes' markets, the dust's coarse cells.
const COUNT = { routeLayer: x => x.nm, dustDown: x => x.kidOff.length - 1 };
const nans = x => ArrayBuffer.isView(x) ? x.reduce((s, v) => s + (v !== v ? 1 : 0), 0) : x && typeof x === 'object' ? Object.values(x).reduce((s, v) => s + nans(v), 0) : 0;
const clone = x => ArrayBuffer.isView(x) ? x.slice() : Array.isArray(x) ? x.map(clone) : x && typeof x === 'object' ? Object.fromEntries(Object.entries(x).map(([k, v]) => [k, clone(v)])) : x;

test('pool: every kernel gives each cell the same, over all its cells at once or by chunks in reverse', () => {
  const n = P.grid.n;
  for (const name of Object.keys(KERNELS)) {
    assert.ok(ARGS[name], `${name} has arguments in this test`);
    const base = ARGS[name](), whole = clone(base), chunked = clone(base);
    const m = COUNT[name] ? COUNT[name](base) : n;
    KERNELS[name](whole, 0, m);
    for (let k = 7; k >= 0; k--) { const [a, b] = chunkOf(k, m, 8); KERNELS[name](chunked, a, b); }
    assert.deepStrictEqual(chunked, whole, name);
    assert.ok(nans(whole) <= nans(base), `${name} writes no NaN`);
  }
});
