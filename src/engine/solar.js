// The planet's solar system (docs/people.md, Off-world): today's on the `earth` seed, else seeded. The
// people's model reads it (the worlds they settle, the inner planet the swarm takes apart, the belt the
// habitats are built from) and Fig. 9 draws it (src/render/system.js). The Sun and the Moon are the
// same for every seed (the climate's sunlight, and the tide and day the Moon keeps, are tuned to them).
import { stream } from '../rng.js';
import { WORLDS } from './worlds.js';

const M_EARTH = 5.97e24, A_EARTH = 5.1e8;   // kg, km²
/** The home planet's own neighbourhood, every seed's: habitats at its Moon's L4 and L5, and its Moon. */
const HOME_WORLDS = WORLDS.filter(w => w.around === 'earth');

/**
 * Today's Solar System, as Fig. 9 draws it (distances standard; the angles where Fig. 9 places each, not
 * where it is): to Saturn, the belt between Mars and Jupiter, Mercury the swarm's quarry (its mass, from
 * memory), and the worlds of src/engine/worlds.js.
 */
export const OUR_SYSTEM = {
  earth: true,
  planets: [
    { k: 'mercury', name: 'Mercury', a: 0.387, deg: 205, r: 2.6, kind: 'rocky' },
    { k: 'venus', name: 'Venus', a: 0.723, deg: 140, r: 3, kind: 'rocky' },
    { k: 'earth', name: 'Earth', a: 1, deg: 25, r: 3.4, kind: 'rocky', home: true },
    { k: 'mars', name: 'Mars', a: 1.524, deg: 300, r: 2.8, kind: 'rocky' },
    { k: 'jupiter', name: 'Jupiter', a: 5.203, deg: 95, r: 5, kind: 'giant' },
    { k: 'saturn', name: 'Saturn', a: 9.537, deg: 235, r: 4.4, kind: 'giant' },
  ],
  belt: { a0: 2.1, a1: 3.3, mass: 2.4e21 },
  quarry: { k: 'mercury', mass: 3.3e23, name: 'Mercury' },
  worlds: WORLDS.map(w => ({ ...w, host: w.around || null, deg: w.k === 'ceres' ? 50 : undefined })),
};

/**
 * Where a world off the home planet opens to people, in log₁₀ of the robots at work off-world: farther
 * from the Sun is later, as sunlight thins (fitted to today's worlds: Mars at 1.52 AU 6.5, Ceres at 2.77
 * 7.5, Jupiter's moons at 5.2 ~9, Titan at 9.6 10; synthesis).
 */
export const opensAt = a => 5.6 + 4.6 * Math.log10(a);

/**
 * A seeded planetary system about the same Sun (speculation, in standard outline): the home planet at
 * 1 AU; inside it none to three planets, rocky, spaced by period ratios as Kepler's systems are
 * (distance ratios 1.35–2.0); outside it three to six, rocky inside the snow line (~2.7 AU), giants and
 * ice giants beyond (distance ratios 1.4–2.4); a belt of small bodies in the widest gap between the
 * rocky planets and the giants, else beyond the last planet; the giants with two to four large moons and
 * the ice giants with up to two. The swarm's quarry is the innermost rocky planet besides home; the
 * worlds people settle are the rocky planets beyond home, the belt's largest body and the giants' moons,
 * each opening by its distance (opensAt). Nothing is named: `name` is null.
 */
export function seededSystem(seed) {
  const r = stream(seed, 'solar'), logU = (lo, hi) => Math.exp(Math.log(lo) + (Math.log(hi) - Math.log(lo)) * r.uniform());
  const planets = [{ k: 'home', name: null, a: 1, kind: 'rocky', m: M_EARTH, home: true }];
  // Inside: inward from home.
  const nIn = [0, 1, 1, 2, 2, 2, 3][Math.floor(7 * r.uniform())];
  let a = 1;
  for (let k = 0; k < nIn; k++) {
    a /= r.range(1.35, 2.0);
    if (a < 0.15) break;
    planets.unshift({ k: `in${k}`, name: null, a, kind: 'rocky', m: M_EARTH * logU(0.04, 2.5) });
  }
  // Outside: outward from home, rocky inside the snow line, then giants and ice giants.
  const nOut = 3 + Math.floor(4 * r.uniform());
  a = 1;
  let giants = 0;
  for (let k = 0; k < nOut; k++) {
    a *= r.range(1.4, 2.4);
    if (a > 45) break;
    let kind = 'rocky', m = M_EARTH * logU(0.04, 2);
    if (a > 2.7) {
      const giant = r.uniform() < (giants === 0 ? 0.8 : 0.5);
      kind = giant ? 'giant' : a > 6 ? 'ice' : 'rocky';
      m = kind === 'giant' ? M_EARTH * logU(40, 1200) : kind === 'ice' ? M_EARTH * logU(8, 25) : m;
      if (giant) giants++;
    }
    planets.push({ k: `out${k}`, name: null, a, kind, m });
  }
  // The belt: in the widest gap from a rocky planet to a giant, or beyond the last planet.
  let belt = null, gap = 1.8;
  for (let k = 0; k + 1 < planets.length; k++) {
    const p = planets[k], q = planets[k + 1];
    if (p.a >= 1 && p.kind === 'rocky' && q.kind !== 'rocky' && q.a / p.a > gap) { gap = q.a / p.a; belt = { a0: p.a * Math.pow(q.a / p.a, 0.25), a1: p.a * Math.pow(q.a / p.a, 0.65) }; }
  }
  if (!belt) { const last = planets[planets.length - 1].a; belt = { a0: last * 1.3, a1: last * 1.8 }; }
  belt.mass = logU(5e20, 2e22);
  // Fig. 9's marks: each planet's angle, its dot's radius by its mass.
  for (const p of planets) {
    p.deg = p.home ? 25 : 360 * r.uniform();
    p.r = Math.max(2.2, Math.min(5.4, 3.4 * Math.pow(p.m / M_EARTH, 0.12)));
  }
  // The swarm's quarry: the innermost rocky planet besides home (Mercury's part).
  const rock = planets.filter(p => p.kind === 'rocky' && !p.home);
  const q = rock[0] || null;
  const quarry = q ? { k: q.k, mass: q.m, name: null } : { k: null, mass: 0, name: null };
  // The worlds people settle beyond home's own neighbourhood.
  const worlds = HOME_WORLDS.map(w => ({ ...w, host: 'home', name: null }));
  for (const p of planets) {
    if (p.home || p === q) continue;
    if (p.kind === 'rocky' && p.a > 1) worlds.push({ k: p.k, name: null, a: p.a, host: null, deg: p.deg, area: A_EARTH * Math.pow(p.m / M_EARTH, 0.55), opens: opensAt(p.a) });
    if (p.kind !== 'rocky') {
      const nm = p.kind === 'giant' ? 2 + Math.floor(3 * r.uniform()) : Math.floor(3 * r.uniform());
      for (let j = 0; j < nm; j++) {
        const area = p.kind === 'giant' ? logU(2e7, 9e7) : logU(5e6, 3e7);
        // Outer moons first, out of the inner ones' radiation (Callisto before Europa).
        worlds.push({ k: `${p.k}m${j}`, name: null, a: p.a, host: p.k, area, opens: opensAt(p.a) + 0.5 * (j - (nm - 1) / 2) });
      }
    }
  }
  const mid = Math.sqrt(belt.a0 * belt.a1);
  worlds.push({ k: 'belt', name: null, a: mid, host: null, deg: 360 * r.uniform(), area: logU(1e6, 5e6), opens: opensAt(mid) });
  return { earth: false, planets, belt, quarry, worlds };
}

/** The system for a seed: today's on `earth`, else seeded. */
export const solarSystem = (seed, earth) => earth ? OUR_SYSTEM : seededSystem(seed);

/** What the text calls the swarm's quarry: its name, or "the inner planet". */
export const quarryName = sys => sys.quarry.name || 'the inner planet';
