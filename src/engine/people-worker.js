// The people's thread (Roadmap 2.0: docs/PLAN.md; the model is src/engine/people.js), beside the
// engine's. The People experiment starts it with a port to the engine's thread:
//   from the engine   `fields` after each climate cycle (the planet's fields on the people's grid,
//                     src/engine/peoplelink.js), `air` a few times a second (CO₂, the regolith)
//   to the engine     `writeback` ~10 times a second: farmed shares and tillage a cell, the carbon
//                     burned less what capture took back, the forcing (heat and sulfate)
//   to the page       `people` ~10 times a second (the clock, what's owed, the follow dial's pace,
//                     the last of the record, new events), `drawn` ~4 times a second (people per
//                     km², the farmed share, energy used, industry's share, a cell each)
// The first hominins are placed on the first fields that come (the climate's first cycle). The
// page's ticks owe the people years; the people step toward them at their own pace (People.nextDt)
// and, behind, say so, so the page holds its clock.
import { buildGrid } from '../grid/icosphere.js';
import { People } from './people.js';

const BUDGET = 30;            // ms of stepping between looks at the messages
const WAIT = 50;              // ms the owed years may build toward a whole step before one shorter is taken
let grid = null, people = null, port = null, params = {}, owed = 0, lastStep = 0, timer = 0;
let lastPost = 0, lastDrawn = 0, lastBack = 0, eventsSent = 0, msPerStep = 5, dtLast = 1;
const env = { live: true, pco2: 280, bank: 0, co2() { return this.pco2; }, emit(PgC) { this.bank += PgC; }, soil() {} };

self.onmessage = e => {
  const m = e.data;
  if (m.type === 'init') {
    grid = buildGrid(m.level); params = m.params || {};
    port = m.port; port.onmessage = onEngine;
  } else if (m.type === 'tick') { if (people) { owed += m.adv; schedule(0); } }
  else if (m.type === 'params') { Object.assign(params, m.params); if (people) Object.assign(people.P, m.params); }
};

function onEngine(e) {
  const m = e.data;
  if (m.type === 'fields') {
    const f = m.f;
    f.grid = grid;
    env.pco2 = f.co2;
    if (!people) {
      people = new People(f, params);
      people.env = env;
      people.seed();
      lastStep = performance.now();
      post(true);
    } else {
      people.rates(f);
      for (let c = 0; c < people.nL; c++) people.soil[c] = f.reg[people.cells[c]];
    }
  } else if (m.type === 'air') {
    env.pco2 = m.co2;
    if (people && m.soil) for (let c = 0; c < people.nL; c++) people.soil[c] = m.soil[people.cells[c]];
  }
}

function schedule(ms) { if (!timer) timer = setTimeout(() => { timer = 0; pump(); }, ms); }

function pump() {
  if (!people) return;
  const t0 = performance.now();
  while (owed > 0 && performance.now() - t0 < BUDGET) {
    const want = people.nextDt();
    // A step shorter than the model would take only once the owed years have waited WAIT ms.
    if (owed < want && performance.now() - lastStep < WAIT) break;
    const dt = Math.min(want, owed), ts = performance.now();
    people.step(dt);
    owed -= dt; dtLast = want;
    lastStep = performance.now();
    msPerStep = 0.9 * msPerStep + 0.1 * (lastStep - ts);
  }
  if (owed < 1e-9) owed = 0;
  post(false);
  if (owed > 0) schedule(performance.now() - lastStep < WAIT ? WAIT : 0);
}

function post(force) {
  const now = performance.now();
  // To the engine: the write-back.
  if (force || now - lastBack > 100) {
    lastBack = now;
    const wb = people.writeBack(), F = Math.min(people.forcing.heat + people.forcing.aer, people.P.F_LIVE_MAX);
    port.postMessage({ type: 'writeback', f: wb.f, Ef: wb.Ef, carbon: env.bank, F, boiled: people.boiled }, [wb.f.buffer, wb.Ef.buffer]);
    env.bank = 0;
  }
  // To the page: the clock, the record's last row, the events.
  if (force || now - lastPost > 100) {
    lastPost = now;
    const h = people.history, last = h.length ? h[h.length - 1] : null, E = people.econ;
    const ev = people.events.slice(eventsSent); eventsSent = people.events.length;
    // The most years a second the people keep up with: a step's years over its cost, on most of this thread.
    const cap = 0.8 * 1000 * dtLast / Math.max(0.05, msPerStep), F = people.flags;
    const era = F.dial ? 'after the dial' : F.present ? 'takeoff' : F.industry ? 'industry' : people.packages.length ? 'farmers'
      : people.lineages.some(L => L.tipped !== null) ? 'foragers' : 'hominins';
    self.postMessage({
      type: 'people', t: people.t, owed, cap, pace: people.pace(), events: ev, last, era,
      lineages: people.lineages.filter(L => L.died === null).length, packages: people.packages.length,
      ending: people.ending, flags: { ...people.flags }, dialAt: people.dialAt ?? null,
      forcing: { ...people.forcing }, space: people.space, boiled: people.boiled, hE: people.hE, dis: people.dis,
      Es: E.Es || 0, sA: E.sA || 0, sun: people.P.L_SUN, msPerStep, emitted: people.emitted, removed: people.removed,
    });
  }
  if (force || now - lastDrawn > 250) {
    lastDrawn = now;
    const d = people.drawn();
    self.postMessage({ type: 'drawn', d }, [d.buffer]);
  }
}
