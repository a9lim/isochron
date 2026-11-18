// The planet's solar system (src/engine/solar.js): today's on the `earth` seed, as the people's model and
// Fig. 9 have always had it; any other seed's its own, seeded, and nameless; and the people's model runs
// its worlds, quarry and belt.
import test from 'node:test';
import assert from 'node:assert/strict';
import { OUR_SYSTEM, seededSystem, solarSystem, quarryName, opensAt } from '../src/engine/solar.js';
import { PEOPLE, WORLDS } from '../src/engine/people.js';

test('today\'s Solar System on the earth seed: Mercury the quarry, the main belt, today\'s worlds, named', () => {
  const s = solarSystem('earth', true);
  assert.equal(s, OUR_SYSTEM);
  assert.ok(s.earth);
  assert.equal(s.quarry.mass, PEOPLE.M_MERC);
  assert.equal(s.belt.mass, PEOPLE.M_BELT);
  assert.deepEqual(s.worlds.map(w => w.k), WORLDS.map(w => w.k));
  assert.equal(quarryName(s), 'Mercury');
  assert.ok(s.planets.every(p => p.name));
  // Today's worlds open about as their distance has it (the rule seeded systems use).
  for (const w of WORLDS.filter(w => !w.around)) assert.ok(Math.abs(opensAt(w.a) - w.opens) < 0.15, `${w.k}: ${opensAt(w.a).toFixed(2)} against ${w.opens}`);
});

test('a seeded system: its own and the same each time, ordered outward, home at 1 AU, a quarry and a belt, nothing named', () => {
  const kinds = new Set();
  let differ = 0;
  for (const seed of ['earthlike', 'b', 'k7x2qa', 'zz', 'qwerty', 'm3']) {
    const s = seededSystem(seed);
    assert.deepEqual(seededSystem(seed), s, 'the same each time');
    assert.equal(s.earth, false);
    assert.ok(s.planets.every((p, k) => k === 0 || p.a > s.planets[k - 1].a), 'ordered outward');
    assert.deepEqual(s.planets.filter(p => p.home).map(p => p.a), [1], 'home at 1 AU, once');
    assert.ok(s.planets.every(p => p.name === null) && s.worlds.every(w => w.name === null) && s.quarry.name === null, 'nothing named');
    assert.equal(quarryName(s), 'the inner planet');
    const q = s.planets.find(p => p.k === s.quarry.k);
    assert.ok(q && q.kind === 'rocky' && !q.home && s.quarry.mass > 0, 'the quarry: a rocky planet besides home');
    assert.ok(s.planets.filter(p => p.kind === 'rocky' && !p.home).every(p => p.a >= q.a), 'the innermost rocky');
    assert.ok(s.belt.a0 < s.belt.a1 && s.belt.mass >= 5e20 && s.belt.mass <= 2e22, 'a belt');
    assert.ok(['l45', 'moon'].every(k => s.worlds.some(w => w.k === k)), 'home\'s own neighbourhood');
    assert.ok(s.planets.filter(p => p.kind !== 'rocky').every(p => p.a > 2.7), 'giants beyond the snow line');
    for (const p of s.planets) kinds.add(p.kind);
    if (JSON.stringify(s.planets.map(p => p.a)) !== JSON.stringify(seededSystem('earthlike').planets.map(p => p.a))) differ++;
  }
  assert.ok(differ >= 5, 'seeds differ');
  assert.ok(kinds.has('rocky') && kinds.has('giant'), `kinds ${[...kinds]}`);
});
