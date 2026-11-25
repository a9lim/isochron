// One of the engine's pool threads (src/engine/pool.js): for each job, chunks claimed from the shared
// counter until none are left, each a kernel's run over its cells (src/engine/kernels.js), and the
// results sent back by chunk.
import { KERNELS } from './kernels.js';
import { chunkOf } from './shared.js';

self.onmessage = e => {
  const { id, name, args, n, chunks, ctl } = e.data, f = KERNELS[name], results = [];
  try {
    for (let k; (k = Atomics.add(ctl, 0, 1)) < chunks;) { const [a, b] = chunkOf(k, n, chunks); results.push([k, f(args, a, b)]); }
    self.postMessage({ id, results });
  } catch (err) {
    self.postMessage({ id, results, error: `${name}: ${err.message}` });
  }
};
