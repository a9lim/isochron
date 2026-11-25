// The page's first module. It imports nothing, so it runs as soon as it arrives, while main.js's
// ~50 modules are still loading: it names the planet and the engine's grid and starts the engine's
// thread (src/engine/worker.js), whose own ~55 modules then load, and whose planet builds, alongside
// the page's (on the site the engine had started ~0.9 s in, once main.js's whole graph had loaded).
// main.js imports this module (one instance: the same URL), and takes the engine's messages with
// `takeEngine`; those the engine posts before then wait here (a worker's message with no listener is lost).
const query = new URLSearchParams(location.search);

/** The planet's seed: the link's, or today's Earth's (EARTH_SEED, src/engine/earth.js) for a link without one. */
export const seed = query.get('seed') || 'earth';

// The engine's grid: 55 km (level 7), or 110 km on phones and tablets and on machines of four cores
// or 4 GB or fewer (a quarter of the work, and ~200 MB of the engine's arrays against ~650; ?level=
// overrides). The drawn mesh and the weather's stay at 55 km, onto which a coarser engine's fields are refined.
export const LIGHT = matchMedia('(pointer: coarse)').matches || (navigator.hardwareConcurrency || 8) <= 4 || (navigator.deviceMemory || 8) <= 4;
export const LEVEL = Math.max(5, Math.min(7, +(query.get('level') || (LIGHT ? 6 : 7))));

export const engine = new Worker(new URL('./src/engine/worker.js', import.meta.url), { type: 'module' });
const early = [];
engine.onmessage = e => early.push(e);
engine.postMessage({ type: 'init', seed, level: LEVEL });

/** The engine's messages to `handler` from here on, those it posted before first. */
export function takeEngine(handler) {
  engine.onmessage = handler;
  for (const e of early.splice(0)) handler(e);
}
