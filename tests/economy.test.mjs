// Fig. 7's economy (src/render/economy.js): every arrow joins two of its nodes, every weight is a
// number, and each part comes with its era.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ECONOMY, economyOf, economyCaption, watts } from '../src/render/economy.js';

const row = o => ({ people: 1e6, minds: 8e5, O: 1e6, food: 1e6, zmax: 0.5, farm: 0, Y: 0, Kf: 0, AI: 0, Ap: 0, Ef: 0, Er: 0, Eu: 0, Es: 0,
  earth: 1e6, space: 0, fossil: 5000, soil: 0, ...o });
const report = (last, o = {}) => ({ last, flags: {}, econ: null, packages: 0, sA: 0, dis: 0, forcing: { heat: 0, aer: 0, geo: 0 }, ...o });
const econ = o => ({ flows: { f: 1e9, c: 1e8, r: 1e7, e: 5e8, q: 1e7 }, Lh: 3e9, bodies: 0, grade: 0.97, food: 0, cdr: 0, Ar: 0, Wc: 1e11, Wr: 0, ...o });
const planet = { npp: 65, meanT: 14, pco2: 400, pco20: 280, rain: 1e5, la: 1e2, boiled: 0, farmed: 0.1 };

function check(fig) {
  for (const e of fig.edges) {
    assert.ok(ECONOMY[e.from] && ECONOMY[e.to], `${e.from} → ${e.to} names a node`);
    assert.ok(Number.isFinite(e.w), `${e.from} → ${e.to} has a finite weight (${e.w})`);
    if (e.label !== undefined) assert.equal(typeof e.label, 'string');
  }
  for (const [k, v] of Object.entries(fig.values)) {
    assert.ok(ECONOMY[k], `${k} is a node`);
    if (v !== null) assert.ok(typeof v === 'string' && !/NaN|undefined|Infinity/.test(v), `${k}: ${v}`);
  }
}
const shown = fig => Object.keys(fig.values).filter(k => fig.values[k] !== null).sort();

test('the hominins: Kremer\'s loop alone', () => {
  const fig = economyOf({ m: report(row()), ...planet });
  check(fig);
  assert.deepEqual(shown(fig), ['climate', 'culture', 'land', 'minds', 'people']);
  assert.match(economyCaption(report(row())), /^The people/);
});

test('industry brings output (capital its loop), energy and the air; AI brings compute; a starved fleet idles', () => {
  const ind = report(row({ Y: 1e10, Kf: 3e10, Ef: 2e11, farm: 0.6 }), { packages: 2, flags: { industry: true }, econ: econ() });
  let fig = economyOf({ m: ind, ...planet });
  check(fig);
  for (const k of ['output', 'energy', 'air', 'farms']) assert.notEqual(fig.values[k], null, k);
  for (const k of ['compute', 'robots', 'space', 'sea']) assert.equal(fig.values[k], null, k);
  const on = (a, b) => fig.edges.some(e => e.from === a && e.to === b && e.on !== false);
  assert.ok(on('output', 'output') && on('land', 'energy') && on('land', 'output') && on('energy', 'air'), 'capital kept, the land\'s fossil carbon and ores, carbon burned');
  assert.match(economyCaption(ind), /^The economy · investing 16% of output · 200 GW: fossil 100%$/);
  const idle = report(row({ Y: 1e14, Kf: 1e14, Ef: 2e13, Er: 5e12, AI: 1e12, Ap: 0.05 }), { packages: 2, sA: 0.4, flags: { industry: true }, econ: econ({ bodies: 8e6, Ar: 1e11 }) });
  fig = economyOf({ m: idle, ...planet });
  check(fig);
  assert.match(fig.values.robots, /idle$/);
  assert.match(economyCaption(idle), /: fossil 80%, solar 20%$/);
  const live = e => e.on !== false;
  assert.ok(!fig.edges.some(e => live(e) && (e.from === 'robots' || e.to === 'robots') && e.from !== 'output' && e.from !== 'culture'), 'an idle fleet works nothing and draws no power');
});

test('watts names its unit without exponents below an exawatt', () => {
  assert.equal(watts(1.9e11), '190 GW');
  assert.equal(watts(4.7e14), '470 TW');
  assert.equal(watts(5.8e15), '5.8 PW');
  assert.equal(watts(1.5e19), '1.5 × 10¹⁹ W');
});
