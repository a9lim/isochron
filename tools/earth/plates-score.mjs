// Today's Earth's plates against the sim's torque balance. Opens `earth` (src/engine/earth.js) and
// compares each plate's balance ω (the converged balance, not the relaxed blend: Tectonics.balanceTarget)
// with Müller et al. 2019's ω over the last Myr: per plate the speed at its centroid, the angle between
// the two velocities there, |ω|·R, its trench (edge cells pulling) and its slab pull's and ridge push's
// share of the balance; over all cells an area-weighted velocity correlation and regression slope (the
// balance's velocity on the data's), and the rms. Then it runs the planet N Myr (Planet.plateStep: the
// plates, plumes, landscape and the crust's flexure) and reports the drift: rms (and over continental and
// oceanic crust apart), the correlation and slope against the data, sea level, land, mean ocean age,
// plates, named plates' |ω|·R, every 2 Myr (or in 20 rows).
//
// With a seed other than `earth` (a seeded planet, spun up as the page does) it reports the drift alone:
// rms, the fastest plate and how many sit at V_MAX, sea level, land, mean ocean age, plates. The table's
// slab and ridge columns are the balance with only that force (the balance is linear in its torques).
//
// usage: node tools/earth/plates-score.mjs [level 6] [Myr 20] [overrides-json] [seed earth]
//   overrides: { "PARAMS": {...plates}, "EARTH": {...earth.js}, "MANTLE": {...mantle.js} }, or a bare PARAMS object
//   QUIET=1 prints only the summary lines; JSON=1 adds them as JSON; PATCH=module.mjs edits the data first.

import { openPlanet } from '../../src/engine/planet.js';
import { loadEarth, EARTH } from '../../src/engine/earth.js';
import { PARAMS, CM_PER_YR, CONTINENTAL } from '../../src/engine/plates.js';
import { MANTLE } from '../../src/engine/mantle.js';

const level = +(process.argv[2] || 6);
const myr = +(process.argv[3] ?? 20);
const over = JSON.parse(process.argv[4] || '{}');
const isNested = over.PARAMS || over.EARTH || over.MANTLE;
Object.assign(MANTLE, over.MANTLE || {});
Object.assign(PARAMS, isNested ? over.PARAMS || {} : over);
Object.assign(EARTH, over.EARTH || {});
const QUIET = !!process.env.QUIET;
const log = (...a) => console.log(...a);

const seed = process.argv[5] || 'earth', earth = seed === 'earth';
const t0 = performance.now();
// PATCH=module.mjs: its default export edits the Earth data (and may return a note) before the opening, for experiments.
const data = earth ? await loadEarth() : null;
if (data && process.env.PATCH) log('patch:', await (await import(new URL(process.env.PATCH, `file://${process.cwd()}/`))).default(data));
const P = await openPlanet(seed, { level, earth: data });
const tec = P.tec, g = P.grid, n = g.n, pos = g.pos, area = g.area;
log(`${seed} level ${level}: opened in ${((performance.now() - t0) / 1000).toFixed(1)} s; PARAMS ${JSON.stringify(isNested ? over.PARAMS || {} : over)} EARTH ${JSON.stringify(over.EARTH || {})}`);

const plates = tec.alivePlates();
const W0 = new Map(plates.map(p => [p.index, Float64Array.from(p.w)]));   // the data's ω
const short = name => (name || '?').replace(/ (from|plate|Plate).*$/, '').replace(/_.*$/, '').slice(0, 14);

const cross = (w, x, y, z, o) => { o[0] = w[1] * z - w[2] * y; o[1] = w[2] * x - w[0] * z; o[2] = w[0] * y - w[1] * x; return o; };

/** Per plate: area, continental share, centroid (unit), and its edge cells that pull (a slab of its own within a cell). */
function geometry() {
  const out = new Map();
  for (const p of tec.alivePlates()) out.set(p.index, { A: 0, cont: 0, c: [0, 0, 0], trench: 0 });
  const cellLen = Math.sqrt(4 * Math.PI / n) * 6371;
  for (let i = 0; i < n; i++) {
    const k = tec.owner[i], s = out.get(k);
    if (!s) continue;
    s.A += area[i]; if (tec.phi[i] >= CONTINENTAL) s.cont += area[i];
    s.c[0] += area[i] * pos[3 * i]; s.c[1] += area[i] * pos[3 * i + 1]; s.c[2] += area[i] * pos[3 * i + 2];
    let edge = false;
    for (let t = g.nbrOff[i]; t < g.nbrOff[i + 1]; t++) if (tec.owner[g.nbr[t]] !== k) { edge = true; break; }
    if (!edge) continue;
    let sl = tec.slabPlate[i] === k ? tec.slab[i] : 0;
    for (let t = g.nbrOff[i]; t < g.nbrOff[i + 1]; t++) { const j = g.nbr[t]; if (tec.slabPlate[j] === k) sl = Math.max(sl, tec.slab[j]); }
    if (sl > 1e-4) s.trench += cellLen;
  }
  for (const s of out.values()) { const r = Math.hypot(...s.c); s.c = s.c.map(v => v / r); }
  return out;
}

/** Area-weighted statistics of the velocity field of ω (a map plate → ω) against the data's. */
function field(W) {
  let sm = 0, sd = 0, smd = 0, A = 0;
  const vm = new Float64Array(3), vd = new Float64Array(3);
  for (let i = 0; i < n; i++) {
    const k = tec.owner[i], wm = W.get(k), wd = W0.get(k);
    if (!wm || !wd) continue;
    const x = pos[3 * i], y = pos[3 * i + 1], z = pos[3 * i + 2];
    cross(wm, x, y, z, vm); cross(wd, x, y, z, vd);
    sm += area[i] * (vm[0] ** 2 + vm[1] ** 2 + vm[2] ** 2);
    sd += area[i] * (vd[0] ** 2 + vd[1] ** 2 + vd[2] ** 2);
    smd += area[i] * (vm[0] * vd[0] + vm[1] * vd[1] + vm[2] * vd[2]);
    A += area[i];
  }
  return { rms: Math.sqrt(sm / A) * CM_PER_YR, rmsData: Math.sqrt(sd / A) * CM_PER_YR, corr: smd / Math.sqrt(sm * sd), slope: smd / sd };
}

/** The converged balance's ω per plate, and its parts (slab pull, ridge push, the rest: the balance is linear in the torques). */
function parts() {
  const all = tec.balanceTarget();
  const save = { K_SLAB: PARAMS.K_SLAB, K_RIDGE: PARAMS.K_RIDGE };
  PARAMS.K_RIDGE = 0; const slab = tec.balanceTarget({ cap: false });
  PARAMS.K_RIDGE = save.K_RIDGE; PARAMS.K_SLAB = 0; const ridge = tec.balanceTarget({ cap: false });
  Object.assign(PARAMS, save);
  return { all, slab, ridge };
}

const summary = { opening: null, drift: [] };   // JSON=1 prints it last, for scans
if (earth) opening();

/** The opening: each plate's balance against the data, and the field's statistics. */
function opening() {
  const geo0 = geometry();
  const { all: Wb, slab: Ws, ridge: Wr } = parts();
  const f0 = field(Wb), fs = field(Ws), fr = field(Wr);
  summary.opening = { rms: f0.rms, corr: f0.corr, slope: f0.slope };
  if (!QUIET) {
    log('\nplate            A%  cont  trench   v_data  v_bal  angle | |ω|R data  bal  (slab ridge) cm/yr');
    const rows = plates.map(p => ({ p, s: geo0.get(p.index) })).sort((a, b) => b.s.A - a.s.A);
    const vd = new Float64Array(3), vb = new Float64Array(3);
    for (const { p, s } of rows) {
      const [x, y, z] = s.c, wd = W0.get(p.index), wb = Wb.get(p.index);
      cross(wd, x, y, z, vd); cross(wb, x, y, z, vb);
      const sd = Math.hypot(...vd) * CM_PER_YR, sb = Math.hypot(...vb) * CM_PER_YR;
      const ang = Math.acos(Math.max(-1, Math.min(1, (vd[0] * vb[0] + vd[1] * vb[1] + vd[2] * vb[2]) / (Math.hypot(...vd) * Math.hypot(...vb) || 1)))) * 180 / Math.PI;
      const m = w => (Math.hypot(...w) * CM_PER_YR).toFixed(1).padStart(5);
      log(`${short(p.name).padEnd(15)} ${(100 * s.A / (4 * Math.PI)).toFixed(1).padStart(4)}  ${(s.cont / s.A).toFixed(2)}  ${s.trench.toFixed(0).padStart(6)}  ${sd.toFixed(1).padStart(6)} ${sb.toFixed(1).padStart(6)}  ${ang.toFixed(0).padStart(4)}° |   ${m(wd)} ${m(wb)}  (${m(Ws.get(p.index))} ${m(Wr.get(p.index))})`);
    }
  }
  log(`\nopening: data rms ${f0.rmsData.toFixed(2)} cm/yr; balance rms ${f0.rms.toFixed(2)}, corr ${f0.corr.toFixed(3)}, slope ${f0.slope.toFixed(2)} | slab alone rms ${fs.rms.toFixed(2)} corr ${fs.corr.toFixed(3)} | ridge alone rms ${fr.rms.toFixed(2)} corr ${fr.corr.toFixed(3)}`);
}

if (myr > 0) {
  const byName = new Map(plates.map(p => [short(p.name), p.index]));
  const watch = ['Pacific', 'Nazca', 'Australia', 'India', 'Eurasia', 'Africa', 'NAM', 'SAM', 'Antarctica'].filter(k => earth && byName.has(k));
  const sl0 = tec.seaLevel;
  const head = () => log(`\n   t  rms${earth ? '  corr slope' : ' fastest'} cont/ocean  sea(m) land% age plates | ${earth ? watch.map(k => k.slice(0, 5).padStart(5)).join(' ') : 'speeds (|ω|·R, cm/yr)'}`);
  const row = () => {
    const W = new Map(tec.alivePlates().map(p => [p.index, p.w]));
    const f = earth ? field(W) : rmsOf(), st = tec.stats(), co = byCrust();
    const sp = earth ? watch.map(k => { const p = tec.plates[byName.get(k)]; return p.alive ? (Math.hypot(...p.w) * CM_PER_YR).toFixed(1).padStart(5) : '    -'; })
      : tec.alivePlates().map(p => (Math.hypot(...p.w) * CM_PER_YR).toFixed(1));
    let atMax = 0; for (const p of tec.alivePlates()) if (Math.hypot(...p.w) >= PARAMS.V_MAX * 0.999) atMax++;
    const mid = earth ? `${f.corr.toFixed(2).padStart(5)} ${f.slope.toFixed(2).padStart(5)}` : `${st.fastest.toFixed(1).padStart(7)}`;
    summary.drift.push({ t: +(tec.t - tec.t0).toFixed(1), rms: f.rms, corr: f.corr, slope: f.slope, cont: co.cont, ocean: co.ocean, sea: (tec.seaLevel - sl0) * 1000, land: st.land, age: st.meanOceanAge, plates: st.plates, atMax, sp: sp.map(Number) });
    log(`${(tec.t - tec.t0).toFixed(0).padStart(4)} ${f.rms.toFixed(2)} ${mid}  ${co.cont.toFixed(1).padStart(4)}/${co.ocean.toFixed(1).padEnd(4)} ${((tec.seaLevel - sl0) * 1000).toFixed(0).padStart(6)} ${(100 * st.land).toFixed(1)} ${st.meanOceanAge.toFixed(0).padStart(3)} ${String(st.plates).padStart(6)}${atMax ? '*' + atMax : '  '}| ${sp.join(' ')}`);
    return f;
  };
  /** The area-weighted rms speed (cm/yr) over continental crust and over oceanic. */
  function byCrust() {
    const s2 = [0, 0], A = [0, 0], v = new Float64Array(3);
    for (let i = 0; i < n; i++) { const c = tec.phi[i] >= CONTINENTAL ? 0 : 1; tec.velocity(tec.owner[i], i, v); s2[c] += area[i] * (v[0] ** 2 + v[1] ** 2 + v[2] ** 2); A[c] += area[i]; }
    return { cont: Math.sqrt(s2[0] / A[0]) * CM_PER_YR, ocean: Math.sqrt(s2[1] / A[1]) * CM_PER_YR };
  }
  /** The area-weighted rms speed (cm/yr). */
  function rmsOf() {
    let s2 = 0;
    const v = new Float64Array(3);
    for (let i = 0; i < n; i++) { tec.velocity(tec.owner[i], i, v); s2 += area[i] * (v[0] ** 2 + v[1] ** 2 + v[2] ** 2); }
    return { rms: Math.sqrt(s2 / (4 * Math.PI)) * CM_PER_YR };
  }
  head(); row();
  const steps = Math.round(myr / 0.5);
  const every = Math.max(4, 2 * Math.round(myr / 20));   // rows every 2 Myr, or 20 rows
  let sum = 0, cnt = 0, pinned = 0, rows = 0;
  for (let s = 1; s <= steps; s++) {
    P.plateStep(5e5);
    if (s % every === 0) {
      const f = row(); rows++;
      if (tec.t - tec.t0 > 2.5) { sum += f.rms; cnt++; }
      if (tec.alivePlates().some(p => Math.hypot(...p.w) >= PARAMS.V_MAX * 0.999)) pinned++;
    }
  }
  if (cnt) log(`mean rms after 2 Myr ${(sum / cnt).toFixed(2)} cm/yr; a plate at V_MAX in ${pinned} of ${rows} rows`);
}
if (process.env.JSON) console.log('JSON ' + JSON.stringify(summary));
