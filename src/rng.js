// Seeded random streams. A planet is its seed: every stream is derived from
// the seed string and a stream name, so adding a stream never shifts another.

export function hashString(s) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return h >>> 0;
}

export function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A stream: uniform(), normal(), range(a, b), int(n), unitVector(). */
export function stream(seed, name) {
  const u = mulberry32(hashString(`${seed}:${name}`));
  let spare = null;
  const s = {
    uniform: u,
    range: (a, b) => a + (b - a) * u(),
    int: n => Math.floor(u() * n),
    normal() {
      if (spare !== null) { const v = spare; spare = null; return v; }
      let x, y, r;
      do { x = 2 * u() - 1; y = 2 * u() - 1; r = x * x + y * y; } while (r === 0 || r >= 1);
      const f = Math.sqrt(-2 * Math.log(r) / r);
      spare = y * f;
      return x * f;
    },
    unitVector() {
      const z = 2 * u() - 1, th = 2 * Math.PI * u(), r = Math.sqrt(1 - z * z);
      return [r * Math.cos(th), r * Math.sin(th), z];
    },
    exponential: mean => -mean * Math.log(1 - u()),
  };
  return s;
}
