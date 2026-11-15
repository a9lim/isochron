// The icosahedral geodesic grid: an icosahedron bisected `level` times and
// projected onto the unit sphere. Cells are its 10·4^level + 2 vertices; each
// cell's Voronoi region is a hexagon, twelve are pentagons. Levels nest, so a
// level's vertices are the first cells of the next level (multigrid and
// transfer between layers for free).
//
// Layout (structure of arrays):
//   pos       Float64Array(3n)   cell centres, unit vectors
//   nbrOff    Int32Array(n+1)    CSR offsets into the per-edge arrays
//   nbr       Int32Array(m)      neighbours, counter-clockwise seen from outside
//   corner    Int32Array(m)      corner[o+k]: the face between nbr k and nbr k+1;
//                                the Voronoi edge to nbr k runs from corner k-1 to k
//   ell       Float32Array(m)    Voronoi edge length (radians)
//   dist      Float32Array(m)    centre-to-centre distance (radians)
//   tan       Float32Array(3m)   unit tangent at the cell pointing toward nbr k
//   area      Float64Array(n)    Voronoi cell area (steradians; sums to 4π)
//   tris      Uint32Array(3f)    triangles, counter-clockwise seen from outside
//   centre    Float64Array(3f)   each triangle's circumcentre on the sphere
//                                (the Voronoi corners)

const PHI = (1 + Math.sqrt(5)) / 2;
const ICO_V = [
  [-1, PHI, 0], [1, PHI, 0], [-1, -PHI, 0], [1, -PHI, 0],
  [0, -1, PHI], [0, 1, PHI], [0, -1, -PHI], [0, 1, -PHI],
  [PHI, 0, -1], [PHI, 0, 1], [-PHI, 0, -1], [-PHI, 0, 1],
];
const ICO_F = [
  [0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11],
  [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
  [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9],
  [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1],
];

export function cellCount(level) { return 10 * 4 ** level + 2; }

/** Great-circle angle between two unit vectors, robust near 0 and π. */
function angle(ax, ay, az, bx, by, bz) {
  const cx = ay * bz - az * by, cy = az * bx - ax * bz, cz = ax * by - ay * bx;
  return Math.atan2(Math.sqrt(cx * cx + cy * cy + cz * cz), ax * bx + ay * by + az * bz);
}

/** Area of the spherical triangle abc (unit vectors), Eriksson's formula. */
function triArea(ax, ay, az, bx, by, bz, cx, cy, cz) {
  const triple = ax * (by * cz - bz * cy) + ay * (bz * cx - bx * cz) + az * (bx * cy - by * cx);
  const denom = 1 + (ax * bx + ay * by + az * bz) + (bx * cx + by * cy + bz * cz) + (cx * ax + cy * ay + cz * az);
  return 2 * Math.atan2(Math.abs(triple), denom);
}

// One grid per level for the thread: grids are never written after they are built, and the
// engine wants several levels more than once (the spin-up's, the climate's transfer, the
// flexure's and the dust's multigrid, the tide's), ~0.2 s of a level-7 boot built again.
const grids = new Map();
export function buildGrid(level) {
  let g = grids.get(level);
  if (!g) grids.set(level, g = makeGrid(level));
  return g;
}

function makeGrid(level) {
  const n = cellCount(level);
  const pos = new Float64Array(3 * n);
  let nv = 0;
  const push = (x, y, z) => {
    const r = Math.hypot(x, y, z);
    pos[3 * nv] = x / r; pos[3 * nv + 1] = y / r; pos[3 * nv + 2] = z / r;
    return nv++;
  };
  for (const v of ICO_V) push(v[0], v[1], v[2]);

  let tris = Uint32Array.from(ICO_F.flat());
  // Make every face counter-clockwise from outside.
  for (let f = 0; f < 20; f++) {
    const a = tris[3 * f], b = tris[3 * f + 1], c = tris[3 * f + 2];
    const ux = pos[3 * b] - pos[3 * a], uy = pos[3 * b + 1] - pos[3 * a + 1], uz = pos[3 * b + 2] - pos[3 * a + 2];
    const vx = pos[3 * c] - pos[3 * a], vy = pos[3 * c + 1] - pos[3 * a + 1], vz = pos[3 * c + 2] - pos[3 * a + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    if (nx * (pos[3 * a] + pos[3 * b] + pos[3 * c]) + ny * (pos[3 * a + 1] + pos[3 * b + 1] + pos[3 * c + 1]) + nz * (pos[3 * a + 2] + pos[3 * b + 2] + pos[3 * c + 2]) < 0) {
      tris[3 * f + 1] = c; tris[3 * f + 2] = b;
    }
  }

  // Bisect: each triangle becomes four, midpoints shared through each edge's lower vertex (a
  // vertex has at most six edges, so six slots of (other end, midpoint) each).
  for (let l = 0; l < level; l++) {
    const slotV = new Int32Array(6 * nv).fill(-1), slotM = new Int32Array(6 * nv);
    const midpoint = (a, b) => {
      if (a > b) { const t = a; a = b; b = t; }
      for (let o = 6 * a, e = o + 6; o < e; o++) {
        const v = slotV[o];
        if (v === b) return slotM[o];
        if (v < 0) {
          slotV[o] = b;
          return slotM[o] = push(pos[3 * a] + pos[3 * b], pos[3 * a + 1] + pos[3 * b + 1], pos[3 * a + 2] + pos[3 * b + 2]);
        }
      }
      throw new Error('icosphere: a vertex with more than six edges');
    };
    const nf0 = tris.length / 3, next = new Uint32Array(12 * nf0);
    let k = 0;
    for (let f = 0; f < nf0; f++) {
      const a = tris[3 * f], b = tris[3 * f + 1], c = tris[3 * f + 2];
      const ab = midpoint(a, b), bc = midpoint(b, c), ca = midpoint(c, a);
      next[k++] = a; next[k++] = ab; next[k++] = ca; next[k++] = b; next[k++] = bc; next[k++] = ab;
      next[k++] = c; next[k++] = ca; next[k++] = bc; next[k++] = ab; next[k++] = bc; next[k++] = ca;
    }
    tris = next;
  }
  if (nv !== n) throw new Error(`icosphere: built ${nv} vertices, expected ${n}`);

  const nf = tris.length / 3;
  const centre = new Float64Array(3 * nf);
  for (let f = 0; f < nf; f++) {
    const a = tris[3 * f], b = tris[3 * f + 1], c = tris[3 * f + 2];
    const ux = pos[3 * b] - pos[3 * a], uy = pos[3 * b + 1] - pos[3 * a + 1], uz = pos[3 * b + 2] - pos[3 * a + 2];
    const vx = pos[3 * c] - pos[3 * a], vy = pos[3 * c + 1] - pos[3 * a + 1], vz = pos[3 * c + 2] - pos[3 * a + 2];
    let cx = uy * vz - uz * vy, cy = uz * vx - ux * vz, cz = ux * vy - uy * vx;
    const r = Math.hypot(cx, cy, cz);
    centre[3 * f] = cx / r; centre[3 * f + 1] = cy / r; centre[3 * f + 2] = cz / r;
  }

  // Around each vertex: in a CCW face (a, b, c), going CCW round a, b is followed by c.
  // `succ` holds, per vertex, pairs (neighbour → next neighbour, face).
  const deg = new Int32Array(n);
  for (let f = 0; f < nf; f++) { deg[tris[3 * f]]++; deg[tris[3 * f + 1]]++; deg[tris[3 * f + 2]]++; }
  const nbrOff = new Int32Array(n + 1);
  for (let i = 0; i < n; i++) nbrOff[i + 1] = nbrOff[i] + deg[i];
  const m = nbrOff[n];
  const succFrom = new Int32Array(m), succTo = new Int32Array(m), succFace = new Int32Array(m);
  const fill = new Int32Array(n);
  const addSucc = (v, from, to, f) => {
    const o = nbrOff[v] + fill[v]++;
    succFrom[o] = from; succTo[o] = to; succFace[o] = f;
  };
  for (let f = 0; f < nf; f++) {
    const a = tris[3 * f], b = tris[3 * f + 1], c = tris[3 * f + 2];
    addSucc(a, b, c, f); addSucc(b, c, a, f); addSucc(c, a, b, f);
  }

  const nbr = new Int32Array(m), corner = new Int32Array(m);
  for (let i = 0; i < n; i++) {
    const o = nbrOff[i], d = deg[i];
    let cur = succFrom[o];
    for (let k = 0; k < d; k++) {
      let s = -1;
      for (let t = o; t < o + d; t++) if (succFrom[t] === cur) { s = t; break; }
      if (s < 0) throw new Error('icosphere: broken vertex ring');
      nbr[o + k] = cur;
      corner[o + k] = succFace[s];
      cur = succTo[s];
    }
  }

  const ell = new Float32Array(m), dist = new Float32Array(m), tan = new Float32Array(3 * m);
  const area = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const o = nbrOff[i], d = nbrOff[i + 1] - o;
    const px = pos[3 * i], py = pos[3 * i + 1], pz = pos[3 * i + 2];
    let A = 0;
    for (let k = 0; k < d; k++) {
      const j = nbr[o + k];
      const qx = pos[3 * j], qy = pos[3 * j + 1], qz = pos[3 * j + 2];
      dist[o + k] = angle(px, py, pz, qx, qy, qz);
      const c0 = corner[o + (k + d - 1) % d], c1 = corner[o + k];
      ell[o + k] = angle(centre[3 * c0], centre[3 * c0 + 1], centre[3 * c0 + 2], centre[3 * c1], centre[3 * c1 + 1], centre[3 * c1 + 2]);
      const dot = px * qx + py * qy + pz * qz;
      let tx = qx - dot * px, ty = qy - dot * py, tz = qz - dot * pz;
      const tr = Math.hypot(tx, ty, tz);
      tan[3 * (o + k)] = tx / tr; tan[3 * (o + k) + 1] = ty / tr; tan[3 * (o + k) + 2] = tz / tr;
      const c2 = corner[o + (k + 1) % d];
      A += triArea(px, py, pz, centre[3 * c1], centre[3 * c1 + 1], centre[3 * c1 + 2], centre[3 * c2], centre[3 * c2 + 1], centre[3 * c2 + 2]);
    }
    area[i] = A;
  }

  // Least-squares gradient weights: ∇f_i = Σ_k gw_k (f_k − f_i), exact for any
  // function linear in the ambient coordinates, whatever the cell's shape.
  const gw = new Float32Array(3 * m), as = new Float64Array(6), bs = new Float64Array(6);
  for (let i = 0; i < n; i++) {
    const o = nbrOff[i], d = nbrOff[i + 1] - o;
    const px = pos[3 * i], py = pos[3 * i + 1], pz = pos[3 * i + 2];
    const e1x = tan[3 * o], e1y = tan[3 * o + 1], e1z = tan[3 * o + 2];
    const e2x = py * e1z - pz * e1y, e2y = pz * e1x - px * e1z, e2z = px * e1y - py * e1x;
    let m11 = 0, m12 = 0, m22 = 0;
    for (let k = 0; k < d; k++) {
      const s = Math.sin(dist[o + k]), t = 3 * (o + k);
      as[k] = s * (tan[t] * e1x + tan[t + 1] * e1y + tan[t + 2] * e1z);
      bs[k] = s * (tan[t] * e2x + tan[t + 1] * e2y + tan[t + 2] * e2z);
      m11 += as[k] * as[k]; m12 += as[k] * bs[k]; m22 += bs[k] * bs[k];
    }
    const det = m11 * m22 - m12 * m12;
    for (let k = 0; k < d; k++) {
      const c1 = (m22 * as[k] - m12 * bs[k]) / det, c2 = (m11 * bs[k] - m12 * as[k]) / det;
      const t = 3 * (o + k);
      gw[t] = c1 * e1x + c2 * e2x; gw[t + 1] = c1 * e1y + c2 * e2y; gw[t + 2] = c1 * e1z + c2 * e2z;
    }
  }

  const grid = { level, n, pos, nbrOff, nbr, corner, ell, dist, tan, gw, area, tris, centre, nf };
  grid.lookup = buildLookup(grid);
  return grid;
}

// ── Point location ──

const LUT_W = 256, LUT_H = 128;

function lutIndex(x, y, z) {
  const lat = Math.asin(Math.max(-1, Math.min(1, z)));
  const lon = Math.atan2(y, x);
  let u = Math.floor((lon + Math.PI) / (2 * Math.PI) * LUT_W);
  let v = Math.floor((lat + Math.PI / 2) / Math.PI * LUT_H);
  if (u >= LUT_W) u = LUT_W - 1;
  if (v >= LUT_H) v = LUT_H - 1;
  return v * LUT_W + u;
}

function buildLookup(grid) {
  const lut = new Int32Array(LUT_W * LUT_H);
  let guess = 0;
  for (let v = 0; v < LUT_H; v++) {
    const lat = ((v + 0.5) / LUT_H) * Math.PI - Math.PI / 2;
    for (let u = 0; u < LUT_W; u++) {
      const lon = ((u + 0.5) / LUT_W) * 2 * Math.PI - Math.PI;
      const x = Math.cos(lat) * Math.cos(lon), y = Math.cos(lat) * Math.sin(lon), z = Math.sin(lat);
      guess = walk(grid, x, y, z, guess);
      lut[v * LUT_W + u] = guess;
    }
    guess = lut[v * LUT_W];
  }
  return lut;
}

/** Greedy walk to the cell whose centre is nearest (x, y, z). */
function walk(grid, x, y, z, start) {
  const { pos, nbrOff, nbr } = grid;
  let cur = start;
  let best = pos[3 * cur] * x + pos[3 * cur + 1] * y + pos[3 * cur + 2] * z;
  for (;;) {
    let next = cur;
    for (let t = nbrOff[cur], e = nbrOff[cur + 1]; t < e; t++) {
      const j = nbr[t];
      const d = pos[3 * j] * x + pos[3 * j + 1] * y + pos[3 * j + 2] * z;
      if (d > best) { best = d; next = j; }
    }
    if (next === cur) return cur;
    cur = next;
  }
}

/** The cell nearest a unit vector. `guess` (a nearby cell) makes it a few steps. */
export function nearest(grid, x, y, z, guess = -1) {
  const start = guess >= 0 ? guess : grid.lookup[lutIndex(x, y, z)];
  return walk(grid, x, y, z, start);
}

// ── Finite-volume operators (unit sphere; scale by 1/R² or 1/R outside) ──

/** out_i = (1/A_i) Σ_j (ℓ_ij / d_ij)(f_j − f_i). */
export function laplacian(grid, f, out) {
  const { n, nbrOff, nbr, ell, dist, area } = grid;
  for (let i = 0; i < n; i++) {
    const fi = f[i];
    let s = 0;
    for (let t = nbrOff[i], e = nbrOff[i + 1]; t < e; t++) s += (ell[t] / dist[t]) * (f[nbr[t]] - fi);
    out[i] = s / area[i];
  }
  return out;
}

/** Least-squares gradient in the tangent plane, as 3-vectors: out[3i..3i+2]. */
export function gradient(grid, f, out) {
  const { n, nbrOff, nbr, gw } = grid;
  for (let i = 0; i < n; i++) {
    const fi = f[i];
    let gx = 0, gy = 0, gz = 0;
    for (let t = nbrOff[i], e = nbrOff[i + 1]; t < e; t++) {
      const w = f[nbr[t]] - fi;
      gx += w * gw[3 * t]; gy += w * gw[3 * t + 1]; gz += w * gw[3 * t + 2];
    }
    out[3 * i] = gx; out[3 * i + 1] = gy; out[3 * i + 2] = gz;
  }
  return out;
}

export function latLon(grid, i) {
  const x = grid.pos[3 * i], y = grid.pos[3 * i + 1], z = grid.pos[3 * i + 2];
  return [Math.asin(z), Math.atan2(y, x)];
}
