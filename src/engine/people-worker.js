// The people's thread (docs/MODEL.md; the model is src/engine/people.js), beside the
// engine's. The People scenario starts it with a port to the engine's thread:
//   from the engine   `fields` after each climate cycle (the planet's fields on the people's grid,
//                     src/engine/peoplelink.js), `air` a few times a second (CO₂, the regolith, and
//                     while the dial resolves the year its whole years for the harvests)
//   to the engine     `writeback` ~10 times a second: farmed shares, tillage and large game's share a cell, the carbon
//                     burned less what capture took back, the forcing (heat and sulfate)
//   from the engine   also the sea's boiled share and the planet's mean temperature (`air`): past the
//                     limit the runaway is the planet's (src/engine/runaway.js)
//   to the page       `people` ~10 times a second (the clock, what's owed, the follow dial's pace,
//                     the last of the record, new events), `drawn` ~4 times a second (people and
//                     robots per km² and the land's uses, eight a cell: People.drawn; the herders'
//                     pasture, four a cell: People.pasture), `figure` once a second
//                     (Fig. 8: src/engine/peoplefit.js; Fig. 9: the states, the Histomap; Fig. 10: the world's ages)
// The first people are placed on the first fields that come (the climate's first cycle). The
// page's ticks owe the people years; the people step toward them at their own pace (People.nextDt)
// and, behind, say so, so the page holds its clock.
import { buildGrid } from '../grid/icosphere.js';
import { People } from './people.js';
import { solarSystem } from './solar.js';
import { figureOf, histomapOf } from './peoplefit.js';
import { stable } from './cohorts.js';
let pyrRef = null, routesAt = null;   // Fig. 10's reference; the trade kernel last drawn
let capsAt = -1;   // the states' step whose capitals were last sent

const BUDGET = 30;            // ms of stepping between looks at the messages
const WAIT = 50;              // ms the owed years may build toward a whole step before one shorter is taken
let grid = null, people = null, port = null, params = {}, system = undefined, owed = 0, lastStep = 0, timer = 0;
let lastPost = 0, lastDrawn = 0, lastBack = 0, lastFig = 0, eventsSent = 0, msPerStep = 5, dtLast = 1, trail = 0;
let bad = null;   // the first number that wasn't finite, where (People.check), for the page too
// The planet's side: its CO₂, how much of the sea has boiled (src/engine/runaway.js), and its warming since the people began.
const env = { live: true, pco2: 280, bank: 0, boiled: 0, years: 0, meanT: null, T0: null, get dT() { return this.meanT === null ? 0 : this.meanT - this.T0; },
  co2() { return this.pco2; }, emit(PgC) { this.bank += PgC; }, soil() {} };

self.onmessage = e => {
  const m = e.data;
  if (m.type === 'init') {
    grid = buildGrid(m.level); params = m.params || {};
    system = solarSystem(m.seed, m.earth);
    port = m.port; port.onmessage = onEngine;
  } else if (m.type === 'tick') { if (people) { owed += m.adv; schedule(owed >= dtLast ? 0 : waitLeft()); } }
  else if (m.type === 'params') {
    Object.assign(params, m.params);
    if (people) Object.assign(people.P, m.params);
  }
};

function onEngine(e) {
  const m = e.data;
  if (m.type === 'fields') {
    const f = m.f;
    f.grid = grid;
    env.pco2 = f.co2;
    if (f.meanT !== undefined) { env.meanT = f.meanT; if (env.T0 === null) env.T0 = f.meanT; }
    if (!people) {
      people = new People(f, params, system);
      people.env = env;
      people.debug = true;   // the numbers checked after each phase until one isn't finite (`step`, below)
      people.seed();
      lastStep = performance.now();
      post(true);
    } else {
      people.rates(f);
      for (let c = 0; c < people.nL; c++) people.soil[c] = f.reg[people.cells[c]];
    }
  } else if (m.type === 'air') {
    env.pco2 = m.co2;
    if (m.years !== undefined) env.years = m.years;
    if (m.boiled !== undefined) env.boiled = m.boiled;
    if (m.meanT !== undefined && env.T0 !== null) env.meanT = m.meanT;
    if (people && m.soil) for (let c = 0; c < people.nL; c++) people.soil[c] = m.soil[people.cells[c]];
    if (people && m.harvest) people.addYears(m.harvest, m.harvestLevel);
  }
}

// The pump's next turn: the earliest asked for wins (a tick bringing a whole step's years doesn't
// wait out a pending WAIT: waiting it out stepped ~40% of the time at the follow dial's top).
let timerDue = Infinity;
function schedule(ms) {
  const due = performance.now() + ms;
  if (timer) { if (due >= timerDue) return; clearTimeout(timer); }
  timerDue = due;
  timer = setTimeout(() => { timer = 0; timerDue = Infinity; pump(); }, ms);
}
const waitLeft = () => Math.max(0, lastStep + WAIT - performance.now());

function pump() {
  if (!people) return;
  const t0 = performance.now();
  while (owed > 0 && performance.now() - t0 < BUDGET) {
    const want = people.nextDt();
    // A step shorter than the model would take only once the owed years have waited WAIT ms.
    if (owed < want && performance.now() - lastStep < WAIT) break;
    const dt = Math.min(want, owed), ts = performance.now();
    // The first number that isn't finite is said once, where it arose (People.check's phase, array and
    // cell), and the checks stop: the people go on, the planet's side holding off what they write back.
    try { people.step(dt); } catch (err) { if (!people.debug) throw err; people.debug = false; bad = err.message; console.error(`[isochron] the people: ${bad}`); }
    owed -= dt; dtLast = want;
    lastStep = performance.now();
    msPerStep = 0.9 * msPerStep + 0.1 * (lastStep - ts);
  }
  if (owed < 1e-9) owed = 0;
  post(false);
  if (owed > 0) schedule(owed >= dtLast ? 0 : waitLeft());
}

function post(force) {
  const now = performance.now();
  // To the engine: the write-back.
  if (force || now - lastBack > 100) {
    lastBack = now;
    // The forcing: waste heat, a preserving AI's sprayed sulfate and a sacrificing swarm's shade
    // global (F), coal's sulfate (aerC, its global mean) carried by the planet's winds from where it's lifted (x).
    const wb = people.writeBack(), Fo = people.forcing, F = Fo.heat + Fo.geo + (Fo.shade || 0), aerC = Fo.aer - Fo.geo;
    port.postMessage({ type: 'writeback', f: wb.f, Ef: wb.Ef, s: wb.s, x: wb.x, m: wb.m, carbon: env.bank, F, aerC }, [wb.f.buffer, wb.Ef.buffer, wb.s.buffer, wb.x.buffer, wb.m.buffer]);
    env.bank = 0;
  }
  // To the page: the clock, the record's last row, the events; one skipped is sent once its 100 ms
  // are up (the page holds its clock while the people are owed years, and sends none meanwhile: a
  // last step's report skipped had left both waiting for good).
  if (!force && now - lastPost <= 100) { if (!trail) trail = setTimeout(() => { trail = 0; post(false); }, 101 - (now - lastPost)); }
  else {
    lastPost = now;
    const h = people.history, last = h.length ? h[h.length - 1] : null, E = people.econ;
    const ev = people.events.slice(eventsSent); eventsSent = people.events.length;
    // The most years a second the people keep up with: a step's years over its cost, on most of this thread.
    const cap = 0.8 * 1000 * dtLast / Math.max(0.05, msPerStep), F = people.flags;
    const era = F.dial ? 'after the dial' : F.present ? 'takeoff' : F.industry ? 'industry' : people.packages.length ? 'farmers'
      : people.tTip !== null ? 'foragers' : 'first people';
    self.postMessage({
      type: 'people', t: people.t, owed, cap, pace: people.pace(), events: ev, last, era, bad: [bad, people.yrBad].filter(Boolean).join(' | ') || null,
      packages: people.packages.length,
      ending: people.ending, flags: { ...people.flags }, dialAt: people.dialAt ?? null,
      forcing: { ...people.forcing }, space: people.space, boiled: people.boiled, hE: people.hE, dis: people.dis,
      Es: E.Es || 0, sA: E.sA || 0, sun: people.P.L_SUN, msPerStep, emitted: people.emitted, removed: people.removed,
      city: people.city ? people.city.reduce((a, b) => Math.max(a, b), 0) : 0,
      // Fig. 2's economy: investment by stock (sy/yr), people's work, the bodies, the ores' grade,
      // the power to food and to capture (and the carbon it takes back, Pg C/yr), AI's research minds,
      // compute's and the working robots' power.
      econ: E.on && E.flows ? { flows: { ...E.flows }, Lh: E.Lh, bodies: E.bodies, grade: E.grade, food: E.EfoodGot || 0, cdr: E.EcdrGot || 0,
        Ar: E.AIr, Wc: people.P.W_C * (E.Kc + E.Kq), Wr: people.P.W_R * E.Ap, cdrPg: (E.EcdrGot || 0) * 3.15576e7 / people.P.J_CDR, aA: E.aA || 0, ApE: E.ApE ?? E.Ap } : null,
      // Off-world (Fig. 11, the sky): where its people live, the mass mined (Mercury's and the belt's
      // shares, kg a year and the source drawn on most), the rooms off Earth and on it, the growth
      // past replacement, and the probes (with the people at other stars).
      off: { worlds: people.offworld(), ...people.minedShares(), flow: people.flow, src: people.src, mined: people.mined, room: people.room, roomE: people.roomE || 0, fert: people.fert, stars: people.stars() },
    });
  }
  // Fig. 8 (the hyperbola), once a second: ~5 ms of fitting on a thinned record.
  if (force || now - lastFig > 1000) {
    lastFig = now;
    const fig = figureOf(people);
    // Fig. 10: the world's ages, and the pre-industrial reference's (src/engine/cohorts.js); Fig. 9: the states on Fig. 8's axis.
    if (!pyrRef) { const r = stable(people.P.B_PRE, 0); pyrRef = Array.from({ length: Math.ceil(r.length / 5) }, (_, g) => { let s = 0; for (let k = 5 * g; k < Math.min(r.length, 5 * g + 5); k++) s += r[k]; return s; }); }
    const states = fig ? histomapOf(people, fig) : null;
    if (fig) self.postMessage({ type: 'figure', fig, pyr: people.pyramid(), pyrRef, states }, states ? [states.x.buffer, states.n.buffer, states.held.buffer] : []);
  }
  if (force || now - lastDrawn > 250) {
    lastDrawn = now;
    const d = people.drawn(), l = people.drawnB(), c = people.ids.drawn(), st = people.pol.drawn();
    self.postMessage({ type: 'drawn', d, l, c, s: st, zf: [people.zfP || 0, people.zfL || 0] }, [d.buffer, l.buffer, c.buffer, st.buffer]);
    // The states' capitals (src/engine/polities.js), as the states change.
    const pol = people.pol;
    if (pol.ver !== capsAt) {
      capsAt = pol.ver;
      const caps = pol.capitals();
      self.postMessage({ type: 'capitals', caps }, [caps.buffer]);
    }
    // The trade's routes (src/engine/routes.js), as each new kernel comes.
    const rt = people.routes;
    if (rt && rt.tTrade !== routesAt) {
      routesAt = rt.tTrade;
      const r = rt.lines();
      self.postMessage({ type: 'routes', ...r }, [r.P.buffer, r.W.buffer, r.sea.buffer, r.off.buffer]);
    }

  }
}
