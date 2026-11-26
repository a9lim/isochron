// A pool of threads for the engine's per-cell loops (the page's engine thread only: headless, and on a
// page that isn't cross-origin isolated, every loop runs on its own thread as before).
//
// A kernel is a layer's function over a range of cells (which the layer hands `parallel`, and the
// pool's threads find by name in src/engine/kernels.js), run on CHUNKS fixed chunks of
// [0, n): the pool's threads and the engine's own claim chunks from a shared counter until none are
// left, and the results come back by chunk, in order. So a kernel's work is the same per cell however
// many threads share it, and what the results sum to is summed in the same order: a run on the pool
// gives what one without it gives, to the bit.
//
// The arrays a kernel reads and writes live in SharedArrayBuffers (`shared`, src/engine/shared.js, on
// once the engine starts the pool, before the planet is built), so the threads work on the planet's own
// arrays; a kernel's arguments are those arrays and plain values, and one that isn't shared is refused
// (the thread would have written a copy). Constants a kernel reads that the engine may set
// (CLIMATE.CO2 and the like) go with its arguments.
import { SHARED, CHUNKS, chunkOf } from './shared.js';

const SLICE = 4;               // chunks between the turns a loop without the pool yields (as its slices did)

let pool = null;

/**
 * The pool, from the engine's thread: `threads` workers (src/engine/pool-worker.js) beside it. Only
 * where SharedArrayBuffer is there (a cross-origin isolated page); null otherwise, and loops run here.
 */
export function startPool(threads) {
  if (pool || !(threads > 0) || typeof SharedArrayBuffer !== 'function' || !(globalThis.crossOriginIsolated)) return null;
  SHARED.on = true;
  const workers = Array.from({ length: threads }, () => new Worker(new URL('./pool-worker.js', import.meta.url), { type: 'module' }));
  const jobs = new Map();
  let ids = 0;
  for (const w of workers) {
    w.onmessage = e => {
      const { id, results, error } = e.data, job = jobs.get(id);
      if (!job) return;
      if (error) job.error = error;
      for (const [k, r] of results) job.results[k] = r;
      if (++job.replies === workers.length) { jobs.delete(id); job.error ? job.reject(new Error(job.error)) : job.resolve(job.results); }
    };
    w.onerror = e => console.warn('[isochron] pool:', e.message);
  }
  pool = {
    threads,
    /** Run kernel `name` (here `f`) over n cells: the job's `results` (by chunk) once `done` resolves. */
    run(name, f, args, n, chunks = CHUNKS) {
      checkShared(name, args);
      const ctl = new Int32Array(new SharedArrayBuffer(4)), id = ++ids;
      const job = { results: new Array(chunks), replies: 0 };
      job.done = new Promise((res, rej) => { job.resolve = res; job.reject = rej; });
      jobs.set(id, job);
      for (const w of workers) w.postMessage({ id, name, args, n, chunks, ctl });
      // This thread takes chunks too, while the others start.
      for (let k; (k = Atomics.add(ctl, 0, 1)) < chunks;) { const [a, b] = chunkOf(k, n, chunks); job.results[k] = f(args, a, b); }
      return job;
    },
    /**
     * Run kernel `name` over n cells and wait here for every chunk (Atomics.wait: the engine's thread
     * is a worker), for loops inside a step that isn't a generator. The kernel's results aren't kept:
     * it writes shared arrays. ctl: [claimed, done, failed].
     */
    runSync(name, f, args, n, chunks = CHUNKS) {
      checkShared(name, args);
      const ctl = new Int32Array(new SharedArrayBuffer(12));
      for (const w of workers) w.postMessage({ id: 0, name, args, n, chunks, ctl, sync: true });
      for (let k; (k = Atomics.add(ctl, 0, 1)) < chunks;) { const [a, b] = chunkOf(k, n, chunks); f(args, a, b); Atomics.add(ctl, 1, 1); }
      for (let d; (d = Atomics.load(ctl, 1)) < chunks;) {
        if (Atomics.load(ctl, 2)) throw new Error(`pool: ${name} failed on a thread`);
        if (Atomics.wait(ctl, 1, d, 5000) === 'timed-out') throw new Error(`pool: ${name} timed out`);
      }
    },
  };
  return pool;
}

/** Refuse a kernel's typed array that isn't shared: the pool's threads would write a copy. */
function checkShared(name, x, path = name) {
  if (ArrayBuffer.isView(x)) { if (!(x.buffer instanceof SharedArrayBuffer)) throw new Error(`pool: ${path} isn't shared`); return; }
  if (x && typeof x === 'object') for (const k in x) checkShared(name, x[k], `${path}.${k}`);
}

/**
 * Kernel `name`, which is `f` (kernels.js gives the pool's threads the same function by that name),
 * over n cells by chunk (yield* it in a generator): on the pool where there is one, the engine's turns
 * given to it while it runs; else here, yielding every SLICE chunks. Returns the results by chunk.
 */
export function* parallel(name, f, args, n, chunks = CHUNKS) {
  if (pool) { const job = pool.run(name, f, args, n, chunks); yield job.done; return job.results; }
  const out = new Array(chunks);
  for (let k = 0; k < chunks; k++) {
    const [a, b] = chunkOf(k, n, chunks);
    out[k] = f(args, a, b);
    if ((k + 1) % SLICE === 0 && k + 1 < chunks) yield;
  }
  return out;
}

/**
 * Kernel `name` (here `f`) over n cells by chunk, waiting for them all: on the pool where there is one,
 * else here in order. For kernels that only write their shared arrays (nothing comes back).
 */
export function parallelSync(name, f, args, n, chunks = CHUNKS) {
  if (pool) { pool.runSync(name, f, args, n, chunks); return; }
  for (let k = 0; k < chunks; k++) { const [a, b] = chunkOf(k, n, chunks); f(args, a, b); }
}

/** The pool's threads (0 without it). */
export const poolThreads = () => (pool ? pool.threads : 0);
