// The engine's shared arrays and kernels' chunks (src/engine/pool.js). Imports nothing, so a layer can
// allocate through it without loading the pool.

export const CHUNKS = 32;      // chunks a kernel's cells are cut into (~5,000 cells each at level 7)

/** Whether arrays are allocated shared (the engine's thread turns it on with its pool). */
export const SHARED = { on: false };

/** A typed array of n elements, in a SharedArrayBuffer when the pool is on. */
export function shared(T, n) {
  return SHARED.on ? new T(new SharedArrayBuffer(n * T.BYTES_PER_ELEMENT)) : new T(n);
}

/** `a`, or a shared copy of it when the pool is on (for arrays built before anything holds them). */
export function toShared(a) {
  if (!SHARED.on || a.buffer instanceof SharedArrayBuffer) return a;
  const b = shared(a.constructor, a.length); b.set(a); return b;
}

/** Chunk k's cells of n: [from, to). */
export const chunkOf = (k, n, chunks = CHUNKS) => [Math.floor(k * n / chunks), Math.floor((k + 1) * n / chunks)];
