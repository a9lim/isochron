// The people prototype, headless (docs/PLAN.md, Roadmap 2.0; the model is tools/people/model.mjs):
// the first hominins placed on a settled planet, run until the minds' doubling time passes a day
// (the dial's floor, more or less: "the dial runs out", an event), then until the energy ceiling
// holds them (the radiator), or tMax.
// It prints the events as they happen and a line at each doubling of the people, then the
// hyperbola's fit and the follow dial's wall-clock.
// usage: node tools/people-run.mjs [seed] [tMax yr] [overrides json for PEOPLE]
//   env: LEVEL=n (6), QUIET=1 (events only), OUT=path (the history as JSON; default the cache)
import { writeFileSync } from 'node:fs';
import { planetFields } from './people/planet.mjs';
import { People } from './people/model.mjs';
import { fitHyperbola, followDial, fmtYears } from './people/fit.mjs';

const [seed = 'earthlike', tMaxArg = '5e6', ov = '{}'] = process.argv.slice(2);
const level = +(process.env.LEVEL || 6);
const planet = await planetFields(seed, level, { log: s => console.log(s) });
const t0 = performance.now();
const pp = new People(planet, JSON.parse(ov));
console.log(`land cells ${pp.nL} · sea crossings ${pp.hopEdges} · cell spacing ${pp.dx.toFixed(0)} km · coal ${(pp.P.FOSSIL * pp.P.COAL_SHARE).toFixed(0)} Pg C over ${[...pp.coal].filter(x => x > 0.01).length} cells`);
pp.onEvent = (t, kind, text) => console.log(`${fmtYears(t).padStart(12)}  ${kind.padEnd(10)} ${text}`);
pp.seed();
let lastPeople = 0, lastT = 0;
const DAY = 1 / 365.25;
pp.run({
  tMax: +tMaxArg,
  onStep(p) {
    const h = p.history[p.history.length - 1];
    if (!process.env.QUIET && (h.people > 2 * lastPeople || p.t - lastT > 250e3)) {
      lastPeople = h.people; lastT = p.t;
      const live = p.lineages.filter(L => L.died === null).sort((a, b) => b.total - a.total);
      const L0 = live[0], comp = p.components(c => L0.N[c] >= p.P.N_MIN * p.H.area[c], p.seaReach(L0.zmax));
      let occ = 0, all = 0; for (let c = 0; c < p.nL; c++) { all += p.H.area[c]; if (comp.id[c] >= 0) occ += p.H.area[c]; }
      const range = `range ${(100 * occ / all).toFixed(0)}% of land in ${comp.count} bodies · `;
      console.log(`${fmtYears(p.t).padStart(12)}  ${(h.people / 1e6).toPrecision(3).padStart(8)} M people · minds ${h.minds.toPrecision(3)} · z ${h.zmax.toFixed(2)} · farm ${(100 * h.farm).toFixed(0)}% · ind ${(100 * h.ind).toFixed(0)}% · ` +
        range + `${(h.energy / 1e12).toPrecision(3)} TW · CO₂ ${h.co2.toFixed(0)} · ${live.length} lineages [${live.slice(0, 4).map(L => `${L.id}: ${(L.total / 1e3).toPrecision(3)}k g ${L.g.toFixed(2)} z ${L.zbar.toFixed(2)}`).join(' | ')}] · dt ${fmtYears(h.dt)}`);
    }
  },
  stop(p) {
    const h = p.history, n = h.length;
    if (!p.lineages.some(L => L.died === null)) { p.event('end', 'no one is left'); return true; }
    if (n < 3) return false;
    const g = Math.log(h[n - 1].minds / h[n - 2].minds) / h[n - 1].dt;
    if (g > 0 && Math.log(2) / g < DAY && !p.flags.dial) { p.flags.dial = true; p.event('dial', `the minds double in under a day: the dial runs out`); }
    if (p.flags.cap && n > 50) {
      const a = h[n - 50], b = h[n - 1];
      if (Math.abs(Math.log(b.minds / a.minds)) < 0.01) { p.event('end', `the radiator: the minds level off at ${b.minds.toPrecision(3)} at the energy ceiling (${(b.energy / 1e12).toFixed(0)} TW), waste heat ${b.heat.toFixed(2)} K`); return true; }
    }
    return false;
  },
});
const ms = performance.now() - t0, h = pp.history;
console.log(`\nper section (s): ${Object.entries(pp.prof).map(([k, v]) => `${k} ${(v / 1e3).toFixed(1)}`).join(' · ')}`);
console.log(`\n${h.length} steps in ${(ms / 1e3).toFixed(1)} s · ended at ${fmtYears(pp.t)} · ${(h.at(-1).people / 1e9).toPrecision(3)} billion people · minds ${h.at(-1).minds.toPrecision(3)} · emitted ${pp.emitted.toFixed(0)} Pg C · peak CO₂ ${Math.max(...h.map(x => x.co2)).toFixed(0)} ppm`);
const tip = pp.events.find(e => e.kind === 'tip');
if (tip) {
  const fit = fitHyperbola(h, tip.t, 'people'), fitM = fitHyperbola(h, tip.t, 'minds');
  for (const [name, f] of [['people', fit], ['minds', fitM]]) if (f) console.log(`hyperbola (${name}, from the first tip): t* = ${fmtYears(f.tStar)} (${fmtYears(f.tStar - pp.t)} after the end), exponent ${f.p.toFixed(2)}, R² ${f.r2.toFixed(3)} (an exponential: R² ${f.r2exp.toFixed(3)})`);
  if (fit) for (const e of pp.events) console.log(`  t* − t ${fmtYears(fit.tStar - e.t).padStart(12)}  ${e.kind}`);
}
const dial = followDial(h, 3);
console.log(`the follow dial (3 s a doubling, clamped to the dial's 2.8 h/s–10 Myr/s): ${dial.wall.toFixed(0)} s in all · ${dial.eras.map(([k, s]) => `${k} ${s.toFixed(0)} s`).join(' · ')}`);
const out = process.env.OUT || new URL(`./people/.cache/run-${seed}.json`, import.meta.url).pathname;
writeFileSync(out, JSON.stringify({ seed, params: pp.P, events: pp.events, packages: pp.packages.map(({ zv, ...p }) => p),
  lineages: pp.lineages.map(({ N, Z, M, K, anc, ...L }) => ({ ...L, anc: Object.fromEntries(anc) })),
  history: h.filter((_, k) => k % Math.max(1, Math.floor(h.length / 4000)) === 0 || k === h.length - 1) }));
console.log(`history in ${out}`);
