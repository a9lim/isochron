// Fig. 2's economy (src/render/economy.js): every arrow joins two of its nodes, every weight is a
// number, and each part comes with its era.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ECONOMY, economyOf, economyCaption, watts, tonnes } from '../src/render/economy.js';

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

test('alignment is people\'s hold on AI; misaligned, AI\'s nodes are red; extinct people leave the figure', () => {
  const late = o => report(row({ Y: 1e14, Kf: 1e14, Ef: 2e13, Er: 5e12, AI: 1e12, Ap: 1e10, earth: 0, ...o }), { packages: 2, sA: 0.9, dis: 0.7, flags: { industry: true, present: true }, econ: econ({ bodies: 1e10, Ar: 1e11 }), ending: { aligned: false, preserve: false } });
  let fig = economyOf({ m: late(), ...planet, farmed: 0 });
  check(fig);
  assert.equal(fig.values.people, null, 'no people node once they are gone');
  assert.equal(fig.values.farms, null, 'nor their fields');
  assert.deepEqual(fig.red, { compute: true, robots: true });
  fig = economyOf({ m: late({ earth: 8e9 }), ...planet });
  const al = fig.edges.find(e => e.from === 'people' && e.to === 'compute');
  assert.ok(al && Math.abs(al.w - 0.3) < 1e-12 && al.ink === 'text', 'alignment is 1 − control, in the ink');
  assert.ok(fig.edges.some(e => e.from === 'compute' && e.to === 'people' && e.red && e.on !== false), 'and the control AI took, in the red');
});

test('watts names its unit without exponents below an exawatt', () => {
  assert.equal(watts(1.9e11), '190 GW');
  assert.equal(watts(4.7e14), '470 TW');
  assert.equal(watts(5.8e15), '5.8 PW');
  assert.equal(watts(1.5e19), '1.5 × 10¹⁹ W');
});

test('space gives materials: the asteroids\' share, then the mass mined; the swarm reads as its share of the Sun; Earth keeps its robots', () => {
  const late = (off, o = {}) => report(row({ Y: 1e20, Kf: 1e20, Er: 0, Eu: 5e13, Es: 3e25, AI: 1e25, Ap: 1e18, earth: 1e10, space: 1e15, ...o }), { packages: 2, sA: 1, flags: { industry: true, present: true },
    econ: econ({ bodies: 1e18, Ar: 1e20, aA: 1, ApE: 1.4e9 }), ending: { aligned: true, preserve: true }, sun: 3.83e26, Es: 3e25, off });
  let fig = economyOf({ m: late({ flow: 4e12, belt: 0.3, merc: 0 }), ...planet });
  check(fig);
  const arrow = f => f.edges.find(e => e.from === 'space' && e.to === 'output' && e.on !== false);
  assert.equal(arrow(fig).label, 'asteroids 4.0 Gt/yr');
  assert.ok(!fig.edges.some(e => e.from === 'land' && e.to === 'output' && e.on !== false), 'the crust\'s ores give way to them');
  assert.equal(fig.values.space, '7.8% of the Sun');
  assert.equal(fig.values.robots, '1.0 × 10¹⁸, 1.40 billion on Earth');
  fig = economyOf({ m: late({ flow: 3e21, belt: 1, merc: 0.4 }), ...planet });
  assert.equal(arrow(fig).label, 'Mercury 3.0 × 10¹⁸ t/yr');
  assert.ok(arrow(fig).w > 0.9, 'heavy at Mercury\'s rate');
  assert.equal(tonnes(4e10), '40 Mt/yr');
});
