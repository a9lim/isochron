// One of the engine's pool threads (src/engine/pool.js): for each job, chunks claimed from the shared
// counter until none are left, each a kernel's run over its cells (src/engine/kernels.js), and the
// results sent back by chunk (or, for a job the engine waits on, each chunk counted done).
import { KERNELS } from './kernels.js';
import { chunkOf } from './shared.js';

self.onmessage = e => {
  const { id, name, args, n, chunks, ctl, sync } = e.data, f = KERNELS[name], results = [];
  try {
    // A job the engine waits on (pool.runSync): each chunk counted done as it ends, nothing sent back.
    if (sync) { for (let k; (k = Atomics.add(ctl, 0, 1)) < chunks;) { const [a, b] = chunkOf(k, n, chunks); f(args, a, b); Atomics.add(ctl, 1, 1); Atomics.notify(ctl, 1); } return; }
    for (let k; (k = Atomics.add(ctl, 0, 1)) < chunks;) { const [a, b] = chunkOf(k, n, chunks); results.push([k, f(args, a, b)]); }
    self.postMessage({ id, results });
  } catch (err) {
    if (sync) { Atomics.store(ctl, 2, 1); Atomics.notify(ctl, 1); console.warn(`[isochron] pool: ${name}: ${err.message}`); return; }
    self.postMessage({ id, results, error: `${name}: ${err.message}` });
  }
};
