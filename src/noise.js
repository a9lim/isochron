// Seeded 3D gradient noise evaluated on the unit sphere (no seams, no poles),
// and fractal sums of it. Used only by genesis: the planet's first shapes.
import { mulberry32, hashString } from './rng.js';

export function makeNoise(seed) {
  const rnd = mulberry32(hashString(`${seed}:noise`));
  const perm = new Uint8Array(512);
  const p = new Uint8Array(256);
  for (let i = 0; i < 256; i++) p[i] = i;
  for (let i = 255; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); const t = p[i]; p[i] = p[j]; p[j] = t; }
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
  // 16 gradient directions on the cube's edges and corners.
  const G = [[1,1,0],[-1,1,0],[1,-1,0],[-1,-1,0],[1,0,1],[-1,0,1],[1,0,-1],[-1,0,-1],[0,1,1],[0,-1,1],[0,1,-1],[0,-1,-1],[1,1,0],[0,-1,1],[-1,1,0],[0,-1,-1]];
  const fade = t => t * t * t * (t * (t * 6 - 15) + 10);
  const lerp = (a, b, t) => a + (b - a) * t;
  const grad = (h, x, y, z) => { const g = G[h & 15]; return g[0] * x + g[1] * y + g[2] * z; };

  function noise3(x, y, z) {
    const X = Math.floor(x), Y = Math.floor(y), Z = Math.floor(z);
    x -= X; y -= Y; z -= Z;
    const xi = X & 255, yi = Y & 255, zi = Z & 255;
    const u = fade(x), v = fade(y), w = fade(z);
    const A = perm[xi] + yi, AA = perm[A] + zi, AB = perm[A + 1] + zi;
    const B = perm[xi + 1] + yi, BA = perm[B] + zi, BB = perm[B + 1] + zi;
    return lerp(
      lerp(lerp(grad(perm[AA], x, y, z), grad(perm[BA], x - 1, y, z), u),
           lerp(grad(perm[AB], x, y - 1, z), grad(perm[BB], x - 1, y - 1, z), u), v),
      lerp(lerp(grad(perm[AA + 1], x, y, z - 1), grad(perm[BA + 1], x - 1, y, z - 1), u),
           lerp(grad(perm[AB + 1], x, y - 1, z - 1), grad(perm[BB + 1], x - 1, y - 1, z - 1), u), v), w);
  }

  /** Fractal sum, roughly in [−1, 1]. */
  function fbm(x, y, z, freq = 1, octaves = 5, gain = 0.5) {
    let s = 0, a = 1, norm = 0;
    for (let o = 0; o < octaves; o++) {
      s += a * noise3(x * freq + 31.7 * o, y * freq - 17.3 * o, z * freq + 5.1 * o);
      norm += a; a *= gain; freq *= 2;
    }
    return s / norm * 1.6;
  }

  return { noise3, fbm };
}
