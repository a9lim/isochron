// The people prototype, headless (docs/PLAN.md, Roadmap 2.0; the model is tools/people/model.mjs):
// the first hominins placed on a settled planet, run until AFTER years past the dial (the ending,
// drawn at early takeoff, playing out), or tMax. "The dial runs out" (the minds doubling
// in under a day) is the model's event (src/engine/people.js). It prints the events as they happen and a line at each doubling of
// the people, then the hyperbola's fit and the follow dial's wall-clock.
// usage: node tools/people-run.mjs [seed] [tMax yr] [overrides json for PEOPLE]
//   env: AFTER=yr past the dial to run the ending (300); LEVEL=n (6); LIVE=1 a live Planet from the first farming origin on (tools/people/couple.mjs:
//        emissions, land use, soil and forcing written back); QUIET=1 events only; OUT=path (the
//        history as JSON; default the cache)
import { writeFileSync } from 'node:fs';
import { planetFields } from './people/planet.mjs';
import { People } from '../src/engine/people.js';
import { fitHyperbola, followDial, fmtYears } from './people/fit.mjs';

const [seed = 'earthlike', tMaxArg = '5e6', ov = '{}'] = process.argv.slice(2);
const level = +(process.env.LEVEL || 6), LIVE = !!process.env.LIVE, AFTER = +(process.env.AFTER || 300);
const planet = await planetFields(seed, level, { log: s => console.log(s) });
let Pl = null, live = null, Live = null;
if (LIVE) {
  const t0 = performance.now();
  const { Planet } = await import('../src/engine/planet.js');
  ({ Live } = await import('./people/couple.mjs'));
  Pl = new Planet(seed, { level });
  Pl.settleClimate();
  console.log(`live planet built and settled in ${((performance.now() - t0) / 1e3).toFixed(1)} s (CO₂ ${Pl.carbon.pco2.toFixed(0)} ppm, the sea's carbon ${Pl.carbon.settled ? 'settled' : 'NOT settled: the air is held'})`);
}
const t0 = performance.now();
const pp = new People(planet, JSON.parse(ov));
console.log(`land cells ${pp.nL} · sea crossings ${pp.hopEdges} · cell spacing ${pp.dx.toFixed(0)} km · coal ${(pp.P.FOSSIL * pp.P.COAL_SHARE).toFixed(0)} Pg C over ${[...pp.coal].filter(x => x > 0.01).length} cells · σ ${pp.P.SIGMA}, β at most ${pp.P.B_MAX}`);
pp.onEvent = (t, kind, text) => console.log(`${fmtYears(t).padStart(12)}  ${kind.padEnd(10)} ${text}`);
pp.seed();
let lastPeople = 0, lastT = 0, lastY = 0;
const g3 = x => x.toPrecision(3);
pp.run({
  tMax: +tMaxArg,
  onStep(p) {
    const h = p.history[p.history.length - 1];
    if (LIVE && !live && p.packages.length) {
      live = new Live(Pl, p);
      if (process.env.TRACE) live.onCycle = L => { const s = L.sample(); console.log(`    cycle ${L.stats.cycles} at ${fmtYears(p.t)}: ${s.T.toFixed(2)} °C, CO₂ ${s.co2.toFixed(1)}, trees ${(100 * s.trees).toFixed(1)}%, land C ${s.landC.toFixed(0)}, regolith ${s.soil.toFixed(3)} m, farmed ${(100 * L.farmShare()).toFixed(2)}% of land, forcing ${L.last.F.toFixed(2)} W/m²`); };
      p.event('live', 'the planet goes live (its climate, cover, soil, carbon and forcing from here on)');
    }
    if (live) live.advance(h.dt);
    if (!process.env.QUIET && (h.people > 2 * lastPeople || p.t - lastT > 250e3 || (h.Y > 4 * lastY && h.Y > 0))) {
      lastPeople = h.people; lastT = p.t; lastY = h.Y;
      const L = p.lineages.filter(L => L.died === null).sort((a, b) => b.total - a.total);
      const pl = live ? live.sample() : null;
      console.log(`${fmtYears(p.t).padStart(12)}  ${g3(h.people / 1e6).padStart(8)} M people · minds ${g3(h.minds)} · z ${h.zmax.toFixed(2)} · farm ${(100 * h.farm).toFixed(0)}% (soil ${h.soil.toFixed(2)} m) · ind ${(100 * h.ind).toFixed(0)}% · ` +
        (h.Y > 0 ? `Y ${g3(h.Y)} sy/yr · K ${g3(h.Kf)} · compute ${g3(h.Kc)} (AI ${g3(h.AI)}, β ${h.beta.toFixed(2)}) · energy ${g3(h.energy / 1e12)} TW (fossil ${g3(h.Ef / 1e12)}, sun ${g3(h.Er / 1e12)}, fusion ${g3(h.Eu / 1e12)}; output at ${(100 * h.avail).toPrecision(2)}% of what the factors could make) · fossil left ${h.fossil.toFixed(0)} Pg C · heat ${h.heat.toFixed(2)} W/m² · ` : '') +
        `CO₂ ${h.co2.toFixed(0)}` + (pl ? ` · planet ${pl.T.toFixed(1)} °C, sea ${pl.sea.toFixed(1)} m, ice ${pl.ice.toFixed(2)} M km³, trees ${(100 * pl.trees).toFixed(0)}% of land, land C ${pl.landC.toFixed(0)} Pg, regolith ${pl.soil.toFixed(2)} m` : '') +
        ` · ${L.length} lineages · dt ${fmtYears(h.dt)}`);
    }
  },
  stop(p) {
    const h = p.history, n = h.length;
    if (!p.lineages.some(L => L.died === null) && !(p.space >= 1)) { p.event('end', 'no one is left'); return true; }
    if (n < 3) return false;
    // The ending plays out over AFTER years past the dial (the model finds the dial, People.record).
    if (p.flags.dial && p.t - p.dialAt > AFTER) {
      const b = h[n - 1], e = p.ending || { code: '-' };
      p.event('end', `${AFTER} years past the dial (ending ${e.code}): ${g3(b.earth / 1e9)} billion people on Earth, ${g3(b.space / 1e9)} off-world; minds ${g3(b.minds)}; energy ${g3(b.energy / 1e12)} TW (off-world ${g3(b.Es / 1e12)}); Earth's heat ${b.heat.toFixed(2)} W/m², forcing ${b.Ft.toFixed(1)} W/m², CO₂ ${b.co2.toFixed(0)} ppm, habitability ${b.hE.toFixed(2)}, the oceans ${(100 * b.boiled).toFixed(0)}% boiled; humans' control ${(100 * (1 - b.dis)).toFixed(0)}%`);
      return true;
    }
    const tInd = (p.events.find(e => e.kind === 'industry') || {}).t;
    if (p.econ.on && !p.flags.dial && p.t - tInd > 3000) { p.event('end', 'no takeoff within 3 kyr of industry'); return true; }
    return false;
  },
});
const ms = performance.now() - t0, h = pp.history;
console.log(`\nper section (s): ${Object.entries(pp.prof).map(([k, v]) => `${k} ${(v / 1e3).toFixed(1)}`).join(' · ')}` +
  (live ? ` · planet: ${live.stats.steps} steps ${(live.stats.msFast / 1e3).toFixed(1)} s, ${live.stats.cycles} climate cycles ${(live.stats.msClimate / 1e3).toFixed(1)} s, ${live.stats.pulsed.toFixed(0)} Pg C pulsed` : ''));
console.log(`${h.length} steps in ${(ms / 1e3).toFixed(1)} s · ended at ${fmtYears(pp.t)} · ${g3(h.at(-1).people / 1e9)} billion people (peak ${g3(h.reduce((m, x) => Math.max(m, x.people), 0) / 1e9)}) · minds ${g3(h.at(-1).minds)} · emitted ${pp.emitted.toFixed(0)} Pg C · peak CO₂ ${h.reduce((m, x) => Math.max(m, x.co2), 0).toFixed(0)} ppm`);
if (live) { const s = live.sample(); console.log(`the planet at the end: ${s.T.toFixed(2)} °C, CO₂ ${s.co2.toFixed(0)} ppm, sea ${s.sea.toFixed(1)} m, ice ${s.ice.toFixed(2)} M km³, trees ${(100 * s.trees).toFixed(1)}% of land, land carbon ${s.landC.toFixed(0)} Pg, regolith ${s.soil.toFixed(2)} m`); }
const tip = pp.events.find(e => e.kind === 'tip');
if (tip) {
  const fit = fitHyperbola(h, tip.t, 'people'), fitM = fitHyperbola(h, tip.t, 'minds');
  for (const [name, f] of [['people', fit], ['minds', fitM]]) if (f) console.log(`hyperbola (${name}, from the first tip): t* = ${fmtYears(f.tStar)} (${fmtYears(f.tStar - pp.t)} after the end), exponent ${f.p.toFixed(2)}, R² ${f.r2.toFixed(3)} (an exponential: R² ${f.r2exp.toFixed(3)})`);
  if (fitM) for (const e of pp.events) if (!['split', 'merge', 'extinct'].includes(e.kind) && !(e.kind === 'tip' && e !== tip)) console.log(`  t* − t ${fmtYears(fitM.tStar - e.t).padStart(12)}  ${e.kind}`);
}
const dial = followDial(h, 3);
console.log(`the follow dial (3 s a doubling, clamped to the dial's 2.8 h/s and the page's ~80 kyr/s): ${dial.wall.toFixed(0)} s in all · ${dial.eras.map(([k, s]) => `${k} ${s.toFixed(0)} s`).join(' · ')}`);
const out = process.env.OUT || new URL(`./people/.cache/run-${seed}${LIVE ? '-live' : ''}.json`, import.meta.url).pathname;
writeFileSync(out, JSON.stringify({ seed, live: LIVE, params: pp.P, events: pp.events, packages: pp.packages.map(({ zv, ...p }) => p),
  lineages: pp.lineages.map(({ N, Z, M, K, anc, ...L }) => ({ ...L, anc: Object.fromEntries(anc) })),
  history: h.filter((_, k) => k % Math.max(1, Math.floor(h.length / 4000)) === 0 || k === h.length - 1) }));
console.log(`history in ${out}`);
