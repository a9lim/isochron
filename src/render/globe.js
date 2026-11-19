// The physiographic globe in WebGPU: the geodesic grid's triangles, each cell's
// fields as vertex attributes, every mark procedural in the fragment shader.
//
// What each mark reads (docs/scene.md):
//   ocean tint       depth below sea level (prussian, deepening)
//   land tint        height above sea level (umber)
//   hillshade        the relief's slope, lit from the upper left, as maps are
//   stripes          the polarity of the field when the crust formed: normal
//                    darker, reversed lighter. Box-filtered through the
//                    polarity's running integral over the pixel's span of
//                    formation times, so chrons finer than a pixel read as the
//                    mid-tone rather than shimmering.
//   hairlines        the coastline, and every kilometre of depth and height
//   vegetation       land is coloured by the plants' cover (src/engine/life.js:
//                    trees, grass and bare ground by warmth, as forests,
//                    savanna, steppe, desert, boreal forest, tundra and rock),
//                    rock toward the summits; the cover lags its climate, so
//                    after the ice goes bare ground and grass come first
//   snow, sea ice    a light fill with a hard edge, as a map draws them; the
//                    land's snow and the sea's ice each up to the coast
//   phytoplankton    the sea's tint turns a milky teal where its export
//                    production is high (src/engine/life.js), as a bloom looks
//                    from orbit: quiet in the gyres, seen at upwelling coasts
//                    and in the cold sea (Relief)
//   lakes            from their water (src/engine/lakes.js), in the sea's tint
//                    by depth, blooming as the sea does by their algae's
//                    production (src/engine/life.js, lakeAlgae), with a hard
//                    shore; eased when they change. In the Zones map the sea's
//                    wash with their shore and the production's strokes
//   salt flats       where a closed lake has dried: a pale crust, hard-edged,
//                    under short graphite strokes (Relief)
//   permafrost       ground frozen all year (src/engine/soil.js): a violet hatch
//                    on a mosaic of tesserae fixed to the globe (the Climate
//                    view's), each tessera frozen with the cell's share, so
//                    continuous ground is hatched whole and sporadic ground in
//                    scattered patches; over snow, under lakes and the ice
//                    sheets (Relief)
//   ice sheets       a light fill with a hard outline and contours of the
//                    ice's surface every 500 m
//   ice streams      where the ice slides faster than it deforms (on soft,
//                    thawed beds: src/engine/regolith.js), fine dashes along
//                    its flow, as glaciological velocity maps draw them (Relief)
// In the Climate view the sea carries isotherms of its surface temperature
// every 5 °C, the gyres' streamlines every 3 Sv and short viridian strokes
// whose density is the export production (the sea carbon's boxes spread by
// what feeds them: upwelling, rivers, the cold sea). Its Air chart is a
// chart's base (pale land with half the relief, the paper for sea) under an
// ochre stipple whose density is the dust the air carries (the year's mean
// load, src/engine/aeolian.js) and, after an eruption, the sulfate veil as
// graphite hatching along the circles of latitude, denser where its optical
// depth is; the winds are streamlines on the overlay (src/render/streamlines.js).
// The Weather view is a synoptic chart's base: pale land, the paper for sea,
// isobars every 4 hPa (heavier every 20) and rain as a stipple whose density
// is the rate.
// The Climate view draws each land cell's soft Köppen mixture as a mosaic:
// tesserae fixed to the surface (a jittered 3D lattice), each taking one class
// with the cell's probability, so a boundary is an ecotone that interleaves.
// Each class is its group's ink in its second letter's pattern (docs/scene.md): solid f, cross-hatch m, hatch / for w and \ for s, dense
// and sparse stipple for BW and BS, fine hatch for ET, bare paper for EF.
// Patterns and the mosaic are fixed to the globe and scale with the zoom.
// The Tides view is a co-tidal chart: the semidiurnal tide's amplitude as a
// wash (co-range), co-tidal lines every lunar hour (30° of its phase) meeting
// at the amphidromic points, at the slowest dials the line of high water
// sweeping round them, and a stipple where the tide loses its energy.
// The People view (the People scenario, src/engine/people.js) has three maps.
// Settlement: the Relief view's land and sea where people have ever lived and
// grey terra incognita where they haven't, a hairline at the frontier. Density:
// a chart's base with the ice sheets under people as a tint in the accent by log
// density (~0.003 to ~4,000 a km², rural and in cities: People.places) and
// robots at work as a verdigris tint over it. On both, the land's uses on the
// mosaic's tesserae, each tessera one use by its cell's shares (exclusive) at a
// rank fixed to the globe (landRank, so a use stays put through the zoom), in
// two patterns of two colours each: blocks for residences (cities in the accent,
// datacenters in the robots' verdigris), parcels for fields (farms in sap, solar
// farms in indigo, the herders' pasture in ochre), and factories a heavy sienna
// hatch; the sulfate veil as in the Air map. Knowledge: a chart's base, production
// as an accent wash and learning as a verdigris one by how near each is to its
// frontier, lines of equal production in the accent (heavier at farming's and
// industry's) and of equal learning in verdigris, a stipple by the works a km², and of the land's
// uses only the cities (People.drawnB). The ice is plain on the People charts.
// Night: where the dial resolves the day (u.sun.w), every map darkens the side
// away from the Sun in three steps (the Sun 0°, 6° and 12° below the horizon:
// civil, nautical and astronomical twilight) and lights it where people and
// robots are: a tint by the log of their density (the cities' tesserae at a
// city's), yellow for people turning white with the robots' share.

import { Refiner } from '../gpu/refine.js';
import { storage } from '../gpu/device.js';

const SHADER = /* wgsl */ `
const PLANKTON_HUE = 0.65;    // how far the depth tint's ink turns toward teal (verdigris) where the sea blooms most
const PLANKTON_WASH = 0.3;    // and a pale, milky turquoise laid over it there (blooms scatter light: so shelves, lightly tinted, show it too)
const NIGHT_K = 0.24;         // how far night takes a map toward graphite (light theme)
const NIGHT_K_DARK = 0.55;    // and toward black (dark theme)
const Z_FARM = 3.0;   // the knowledge farming begins about and industry's (src/engine/people.js, PEOPLE.Z_FARM, Z_IND): the Knowledge map's heavier lines
const Z_IND = 7.0;
const LIGHT_FOLK = vec3f(0.95, 0.79, 0.33);   // the night's lights where people make them: lamplight's yellow
const LIGHT_BOTS = vec3f(1.0, 0.99, 0.96);    // and where the robots do: white
struct U {
  view0: vec4f, view1: vec4f, view2: vec4f,
  frame: vec4f,      // sx, sy, tNow (rel. to the polarity origin), polarity dT
  frame2: vec4f,     // polarity N, ocean tint floor, ocean tint span, land tint floor
  canvas: vec4f, text: vec4f, accent: vec4f, ocean: vec4f, land: vec4f,
  light: vec4f,      // xyz toward the light (view space); w the land tint span
  mode: vec4f,       // view (0 relief, 1 climate's zones, 2–4 weather's charts, 5 tides, 6 climate's air, 7 people's settlement, 8 people's density, 9 people's knowledge), mosaic frequency, device px per CSS px, globe radius in device px
  // inkA.w: 1 in the dark theme
  inkA: vec4f, inkB: vec4f, inkC: vec4f, inkD: vec4f, inkE: vec4f,
  inkF: vec4f,       // sienna (the temperature chart's warmth)
  inkG: vec4f,       // violet (permafrost's hatch)
  tide: vec4f,       // the tide's clock: Re, Im of e^{iφ₂} + ρ e^{iφs} (spring and neap), cos, sin φ₂
  tide2: vec4f,      // the equilibrium tide's amplitude (m), its square, how much the tide shown is now; w the lakes' ease (0 last, 1 new)
  veil: array<vec4f, 9>,   // the volcanoes' sulfate veil: optical depth in 36 bands of 5°, south first (0 where not drawn)
  steam: vec4f,      // the runaway's steam (src/engine/runaway.js): x its wash's opacity, from the column's pressure; y coal's sulfate's optical depth where its pattern is 1; z, w the Knowledge map's frontiers (production's, learning's)
  sun: vec4f,        // xyz toward the Sun in the globe's frame; w how much the night side is shown (where the dial resolves the day)
};
@group(0) @binding(0) var<uniform> u: U;
@group(0) @binding(1) var<storage, read> pol: array<f32>;
@group(0) @binding(2) var<storage, read> cover: array<vec4f>;   // the cover's eight colour weights a vertex
@group(0) @binding(3) var<storage, read> folk: array<vec4f>;
// The people, two a vertex: per km², and the shares of farms, cities, factories; of datacenters and solar farms, robots at work per km², and reached.
@group(0) @binding(4) var<storage, read> sulf: array<vec4f>;    // coal's sulfate: x its burden's pattern (mean 1, src/engine/peoplelink.js)
@group(0) @binding(5) var<storage, read> past: array<vec4f>;    // People.drawnB: x the herders' pasture (a share of the cell), y production's knowledge there, z learning's, w the works a km²

struct VOut {
  @builtin(position) clip: vec4f,
  @location(0) f: vec4f,
  @location(1) nrm: vec4f,
  @location(2) vp: vec4f,
  @location(3) wp: vec4f,    // w the herders' pasture (a share of the cell)
  @location(4) c: vec4f,
  @location(5) z0: vec4f,
  @location(6) z1: vec4f,
  @location(7) z2: vec4f,
  @location(8) z3: vec4f,
  @location(9) iv: vec4f,
  @location(10) wx: vec4f,
  @location(11) td: vec4f,
  @location(12) lw: vec4f,   // the lakes' drawn field, salt flats, the sea's ice, the lakes' tint
  @location(13) cv: vec4f,   // the cover's colour (premultiplied) and its weight
  @location(14) pp: vec4f,   // the people (folk), and the robots
  @location(15) pq: vec4f,
};

fn toView(p: vec3f) -> vec3f {
  return vec3f(dot(u.view0.xyz, p), dot(u.view1.xyz, p), dot(u.view2.xyz, p));
}

@vertex fn vs(@location(0) p: vec3f, @location(1) fc: vec4f, @location(2) nc: vec3f, @location(3) c: vec4f,
              @location(4) z0: vec4f, @location(5) z1: vec4f, @location(6) z2: vec4f, @location(7) z3: vec4f,
              @location(8) iv: vec4f, @location(9) wx: vec4f, @location(10) fp: vec4f, @location(11) np: vec3f,
              @location(12) td: vec4f, @location(13) lw: vec4f, @location(14) c2: vec4f, @location(15) lt: vec4f,
              @builtin(vertex_index) vi: u32) -> VOut {
  // Between plate steps the surface blends from the last step's state to this
  // one's (each step moves the crust less than half a cell), so it moves
  // continuously rather than in ticks.
  let f = mix(fp, fc, u.inkB.w);
  let n = normalize(mix(np, nc, u.inkB.w));
  var o: VOut;
  let v = toView(p);
  o.clip = vec4f(v.x * u.frame.x, v.y * u.frame.y, 0.5 - 0.5 * v.z, 1.0);
  o.f = f;
  o.nrm = vec4f(toView(n), 0.0);
  o.vp = vec4f(v, 0.0);
  o.wp = vec4f(p, past[vi].x);
  o.c = c;
  o.z0 = z0; o.z1 = z1; o.z2 = z2; o.z3 = z3;
  o.iv = iv;                           // the ice's flow in the globe's frame, as long as its sliding share; its speed
  // The weather's fields, in its charts; in the Air and People maps (which draw no weather) coal's
  // sulfate's optical depth, its haze where the winds carry it, and the knowledge, its lag and the
  // works (People.drawnB; the vertex has no varyings to spare).
  o.wx = select(wx, vec4f(sulf[vi].x * u.steam.y, past[vi].y, past[vi].z, past[vi].w), u.mode.x > 5.5);
  o.td = td;
  // The lakes eased from the last drawn to the new here (linear, so as the fragments would), which
  // leaves room beside them for the sea's ice (c holds the land's snow) and their tint.
  o.lw = vec4f(mix(lw.x, lw.z, u.tide2.w), mix(lw.y, lw.w, u.tide2.w), c2.x, mix(lt.x, lt.y, u.tide2.w));
  // The cover's colour: its classes (src/engine/vegetation.js, COLOURS) in the biomes' colours,
  // rock as the summits' (linear in the weights, so blending here is blending the weights).
  o.pp = folk[2u * vi];
  o.pq = folk[2u * vi + 1u];
  let c0 = cover[2u * vi];
  let c1 = cover[2u * vi + 1u];
  let rock = mix(u.canvas.rgb, u.land.rgb, 0.5);
  o.cv = vec4f(c0.x * biome(0) + c0.y * biome(6) + c0.z * biome(9) + c0.w * biome(2)
             + c1.x * biome(5) + c1.y * biome(12) + c1.z * biome(4) + c1.w * rock,
               c0.x + c0.y + c0.z + c0.w + c1.x + c1.y + c1.z + c1.w);
  return o;
}

fn hash3(p: vec3f) -> vec3f {
  var q = fract(p * vec3f(0.1031, 0.1030, 0.0973));
  q += dot(q, q.yxz + 33.33);
  return fract((q.xxy + q.yxx) * q.zyx);
}

// The tessera at p: its site (xyz, in the lattice's units) and a uniform value (w) per cell of a
// jittered lattice (Worley's).
fn tessera(p: vec3f) -> vec4f {
  let c = floor(p);
  var best = 1e9;
  var t = vec4f(0.0);
  for (var dz = -1; dz <= 1; dz++) {
    for (var dy = -1; dy <= 1; dy++) {
      for (var dx = -1; dx <= 1; dx++) {
        let cell = c + vec3f(f32(dx), f32(dy), f32(dz));
        let site = cell + 0.15 + 0.7 * hash3(cell);
        let d = p - site;
        let dd = dot(d, d);
        if (dd < best) { best = dd; t = vec4f(site, hash3(cell + 17.31).x); }
      }
    }
  }
  return t;
}

// The People view's uses are claimed by a rank fixed to the globe, read at each tessera's site,
// rather than by the tessera's own value: so a use keeps its place as the mosaic's lattice changes
// octave with the zoom (a tessera's own value is new at each octave, and cities moved), and a
// cell's uses gather into patches, cities at the field's lows and the fields round them. The rank
// is two octaves of value noise (features ~160 and ~80 km) made uniform through their quantiles on
// the sphere (computed once, in f32 as here; a share s then covers s of the land to 0.01%).
fn vnoise(p: vec3f) -> f32 {
  let i = floor(p);
  let f = p - i;
  let w = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  let a = mix(hash3(i).x, hash3(i + vec3f(1.0, 0.0, 0.0)).x, w.x);
  let b = mix(hash3(i + vec3f(0.0, 1.0, 0.0)).x, hash3(i + vec3f(1.0, 1.0, 0.0)).x, w.x);
  let c = mix(hash3(i + vec3f(0.0, 0.0, 1.0)).x, hash3(i + vec3f(1.0, 0.0, 1.0)).x, w.x);
  let d = mix(hash3(i + vec3f(0.0, 1.0, 1.0)).x, hash3(i + vec3f(1.0, 1.0, 1.0)).x, w.x);
  return mix(mix(a, b, w.y), mix(c, d, w.y), w.z);
}
fn landRank(x: vec3f) -> f32 {
  var lp = array<f32, 39>(0.0, 0.0005, 0.001, 0.002, 0.004, 0.007, 0.01, 0.015, 0.02, 0.03, 0.045, 0.065, 0.09, 0.12, 0.16, 0.21, 0.28, 0.36, 0.44, 0.5,
                          0.56, 0.64, 0.72, 0.79, 0.84, 0.88, 0.91, 0.935, 0.955, 0.97, 0.98, 0.985, 0.99, 0.993, 0.996, 0.998, 0.999, 0.9995, 1.0);
  var lq = array<f32, 39>(0.01975, 0.09039, 0.10478, 0.12105, 0.14115, 0.15998, 0.17373, 0.19092, 0.20425, 0.22515, 0.24882, 0.27279, 0.29647,
                          0.31988, 0.34625, 0.37406, 0.40800, 0.44275, 0.47534, 0.49917, 0.52297, 0.55546, 0.59025, 0.62460, 0.65319, 0.67995,
                          0.70385, 0.72775, 0.75180, 0.77520, 0.79603, 0.80949, 0.82655, 0.83990, 0.85874, 0.87843, 0.89623, 0.91079, 0.97054);
  let n = 0.65 * vnoise(x * 40.0) + 0.35 * vnoise(x * 80.0 + 31.7);
  var k = 0;
  for (var j = 1; j < 38; j++) { if (n >= lq[j]) { k = j; } }
  return clamp(lp[k] + (lp[k + 1] - lp[k]) * (n - lq[k]) / (lq[k + 1] - lq[k]), 0.0, 1.0);
}

// Patterns are anchored to the globe: each is drawn in three planar projections
// of the sphere (triplanar, blended sharply by the normal), at a frequency set
// by the zoom. Within an octave the next octave's marks fade in between the
// last's, so a pattern grows and shrinks with the globe without popping, and
// its marks keep a constant width on screen.
struct Tri { x: vec2f, y: vec2f, z: vec2f, w: vec3f, f: vec3f };

fn octave(periodPx: f32) -> vec2f {
  let l = log2(max(u.mode.w / periodPx, 1.0));
  return vec2f(exp2(floor(l)), fract(l));
}
fn lineAA(c: f32, fwc: f32, wpx: f32) -> f32 {
  let d = abs(c - round(c)) / max(fwc, 1e-7);
  return 1.0 - smoothstep(0.5 * wpx - 0.5, 0.5 * wpx + 0.5, d);
}
fn hatch1(uv: vec2f, fw: f32, dir: vec2f, o: vec2f, wpx: f32) -> f32 {
  let c = dot(uv, dir) * o.x;
  return max(lineAA(c, fw * o.x, wpx), o.y * lineAA(2.0 * c, 2.0 * fw * o.x, wpx));
}
fn hatch(T: Tri, dir: vec2f, periodPx: f32, wpx: f32) -> f32 {
  let o = octave(periodPx);
  return T.w.x * hatch1(T.x, T.f.x, dir, o, wpx) + T.w.y * hatch1(T.y, T.f.y, dir, o, wpx) + T.w.z * hatch1(T.z, T.f.z, dir, o, wpx);
}
fn dot1(uv: vec2f, fw: f32, F: f32, rpx: f32) -> f32 {
  let q = uv * F;
  let row = floor(q.y / 0.8660254);
  let odd = row - 2.0 * floor(row * 0.5);
  let qx = q.x + 0.5 * odd;
  let c = vec2f(qx - floor(qx) - 0.5, (q.y / 0.8660254 - row - 0.5) * 0.8660254);
  return 1.0 - smoothstep(rpx - 0.6, rpx + 0.6, length(c) / max(fw * F, 1e-7));
}
fn stipple1(uv: vec2f, fw: f32, o: vec2f, rpx: f32) -> f32 {
  return mix(dot1(uv, fw, o.x, rpx), dot1(uv, fw, 2.0 * o.x, rpx), o.y);
}
fn stipple(T: Tri, periodPx: f32, rpx: f32) -> f32 {
  let o = octave(periodPx);
  return T.w.x * stipple1(T.x, T.f.x, o, rpx) + T.w.y * stipple1(T.y, T.f.y, o, rpx) + T.w.z * stipple1(T.z, T.f.z, o, rpx);
}
// Short strokes on the stipple's staggered lattice: a stroke 0.45 of the period long, wpx wide.
fn stroke1(uv: vec2f, fw: f32, F: f32, wpx: f32) -> f32 {
  let q = uv * F;
  let row = floor(q.y / 0.8660254);
  let odd = row - 2.0 * floor(row * 0.5);
  let qx = q.x + 0.5 * odd;
  let c = vec2f(qx - floor(qx) - 0.5, (q.y / 0.8660254 - row - 0.5) * 0.8660254);
  let d = length(vec2f(max(abs(c.x) - 0.225, 0.0), c.y)) / max(fw * F, 1e-7);
  return 1.0 - smoothstep(0.5 * wpx - 0.5, 0.5 * wpx + 0.5, d);
}
fn strokes1(uv: vec2f, fw: f32, o: vec2f, wpx: f32) -> f32 {
  return mix(stroke1(uv, fw, o.x, wpx), stroke1(uv, fw, 2.0 * o.x, wpx), o.y);
}
fn strokes(T: Tri, periodPx: f32, wpx: f32) -> f32 {
  let o = octave(periodPx);
  return T.w.x * strokes1(T.x, T.f.x, o, wpx) + T.w.y * strokes1(T.y, T.f.y, o, wpx) + T.w.z * strokes1(T.z, T.f.z, o, wpx);
}

// Ice streams: dashes along a flow d (unit, in the plane), one to each point of a staggered
// lattice, lpx long and wpx wide on screen. Each dash is placed by its own point, so a flow
// that turns turns its dashes without the moiré a line pattern would make.
fn dash1(uv: vec2f, fw: f32, F: f32, d: vec2f, lpx: f32, wpx: f32) -> f32 {
  let q = uv * F;
  let row = floor(q.y);
  let qx = q.x + 0.5 * (row - 2.0 * floor(row * 0.5));
  let c = vec2f(qx - floor(qx) - 0.5, q.y - row - 0.5);
  let px = max(fw * F, 1e-7);
  let a = abs(dot(c, d)) / px;
  let b = abs(c.x * d.y - c.y * d.x) / px;
  return (1.0 - smoothstep(0.5 * wpx - 0.5, 0.5 * wpx + 0.5, b)) * (1.0 - smoothstep(0.5 * lpx - 0.7, 0.5 * lpx + 0.7, a));
}
fn dashP(uv: vec2f, fw: f32, o: vec2f, d2: vec2f, lpx: f32, wpx: f32) -> f32 {
  let l = length(d2);
  if (l < 1e-4) { return 0.0; }
  let d = d2 / l;
  return max(dash1(uv, fw, o.x, d, lpx, wpx), o.y * dash1(uv, fw, 2.0 * o.x, d, lpx, wpx));
}
fn flowDash(T: Tri, d: vec3f, periodPx: f32, lpx: f32, wpx: f32) -> f32 {
  let o = octave(periodPx);
  return T.w.x * dashP(T.x, T.f.x, o, d.yz, lpx, wpx) + T.w.y * dashP(T.y, T.f.y, o, d.zx, lpx, wpx) + T.w.z * dashP(T.z, T.f.z, o, d.xy, lpx, wpx);
}

// The veil's optical depth at sin(latitude) z, linear between its bands' centres.
fn veilAt(z: f32) -> f32 {
  let x = clamp((asin(clamp(z, -1.0, 1.0)) * 57.2957795 + 87.5) / 5.0, 0.0, 35.0);
  let k = u32(floor(x));
  let k1 = min(k + 1u, 35u);
  return mix(u.veil[k / 4u][k % 4u], u.veil[k1 / 4u][k1 % 4u], x - f32(k));
}

fn zoneInk(g: i32) -> vec3f {
  switch g {
    case 0: { return u.inkA.rgb; }
    case 1: { return u.inkB.rgb; }
    case 2: { return u.inkC.rgb; }
    case 3: { return u.inkD.rgb; }
    default: { return u.inkE.rgb; }
  }
}

// A class (0..13: Af Am Aw As BW BS Cf Cs Cw Df Ds Dw ET EF) in its pattern.
fn zoneColor(k: i32, T: Tri) -> vec3f {
  let s = u.mode.z;              // device px per CSS px
  var g = 0;
  if (k >= 4) { g = 1; }
  if (k >= 6) { g = 2; }
  if (k >= 9) { g = 3; }
  if (k >= 12) { g = 4; }
  let ink = zoneInk(g);
  let paper = u.canvas.rgb;
  // The groups step in value as well as hue (A darkest, then C, D), so they part in grayscale.
  var v = 1.0;
  if (g == 2) { v = 0.8; }
  if (g == 3) { v = 0.64; }
  let ground = mix(paper, ink, 0.16 * v);
  let mark = mix(paper, ink, 0.82);
  let diag = vec2f(0.7071, 0.7071);
  let anti = vec2f(0.7071, -0.7071);
  switch k {
    case 0, 6, 9: { return mix(paper, ink, 0.56 * v); }                                         // f: solid
    case 1: { return mix(ground, mark, max(hatch(T, diag, 5.0 * s, 1.0 * s), hatch(T, anti, 5.0 * s, 1.0 * s))); }   // m
    case 2, 8, 11: { return mix(ground, mark, hatch(T, diag, 4.5 * s / v, 1.1 * s)); }          // w: hatch /
    case 3, 7, 10: { return mix(ground, mark, hatch(T, anti, 4.5 * s / v, 1.1 * s)); }          // s: hatch, the other way
    case 4: { return mix(mix(paper, ink, 0.10), mark, stipple(T, 3.6 * s, 0.95 * s)); }        // BW: dense stipple
    case 5: { return mix(mix(paper, ink, 0.07), mark, stipple(T, 6.5 * s, 0.95 * s)); }        // BS: sparse stipple
    case 12: { return mix(mix(paper, ink, 0.10), mark, hatch(T, vec2f(0.0, 1.0), 3.2 * s, 0.8 * s)); }   // ET: fine hatch
    default: { return paper; }                                                                  // EF: paper
  }
}

// The Relief view's vegetation: each class as a natural colour (forest greens,
// savanna and steppe, pale desert, boreal blue-green, tundra), blended by the
// mixture rather than drawn as a mosaic.
fn biome(k: i32) -> vec3f {
  let p = u.canvas.rgb;
  switch k {
    case 0, 1: { return mix(p, u.inkA.rgb, 0.42); }
    case 2, 3: { return mix(p, u.inkC.rgb, 0.30); }
    case 4: { return mix(p, u.inkB.rgb, 0.17); }
    case 5: { return mix(p, mix(u.inkB.rgb, u.inkC.rgb, 0.5), 0.24); }
    case 6, 8: { return mix(p, u.inkC.rgb, 0.37); }
    case 7: { return mix(p, mix(u.inkC.rgb, u.inkB.rgb, 0.45), 0.30); }
    case 9, 10, 11: { return mix(p, u.inkD.rgb, 0.34); }
    case 12: { return mix(p, mix(u.inkE.rgb, u.land.rgb, 0.5), 0.17); }
    default: { return p; }
  }
}

fn polC(t: f32) -> f32 {
  let n = u.frame2.x;
  let x = clamp(t / u.frame.w, 0.0, n - 1.001);
  let i = u32(floor(x));
  return mix(pol[i], pol[i + 1u], fract(x));
}

fn hair(d: f32, w: f32) -> f32 {
  return 1.0 - smoothstep(0.5 * w, 1.5 * w, d);
}

@fragment fn fs(i: VOut) -> @location(0) vec4f {
  let e = i.f.x;           // km above sea level
  let cst = i.f.w;         // the coast: negative on the ocean (a basin below sea level that the sea doesn't reach is land)
  let tf = i.f.y;          // formation time, Myr after the polarity origin
  let phi = i.f.z;         // felsic fraction
  let lake = i.lw.x;       // the lakes' drawn field: signed, the shore at zero (src/render/surface.js, lakeFields)
  let salt = i.lw.y;       // the share of salt flat
  let snowL = i.c.x;       // the land's snow (0..1), carried onto the sea's cells beside it
  let iceS = i.lw.z;       // the sea's ice (0..1), carried onto the land's cells beside it
  let lakeQ = i.lw.w;      // the lakes' tint: √(depth / 6 km)
  let sst = i.c.y;         // sea-surface temperature, °C
  let psi = i.c.z;         // the gyres' streamfunction, Sv
  let age = u.frame.z - tf;
  let iceH = i.c.w;        // ice sheet thickness, m
  let dark = u.inkA.w > 0.5;

  // The globe's own coordinates for patterns (triplanar), and their change per pixel.
  let wpn = normalize(i.wp.xyz);
  var tw = pow(abs(wpn), vec3f(12.0));
  tw = tw / (tw.x + tw.y + tw.z);
  let T = Tri(wpn.yz, wpn.zx, wpn.xy, tw, vec3f(length(fwidth(wpn.yz)), length(fwidth(wpn.zx)), length(fwidth(wpn.xy))));

  // Relief: the surface normal against the sphere's own, so only slope shades.
  let N = normalize(i.nrm.xyz);
  let S = normalize(i.vp.xyz);
  let L = normalize(u.light.xyz);
  let relief = clamp(1.0 + 1.1 * (dot(N, L) - dot(S, L)), 0.8, 1.12);

  // Derivatives first: WGSL takes them only in uniform control flow.
  let fe = fwidth(e);
  let fcst = fwidth(cst);
  let ftf = fwidth(tf);
  let fa = max(fwidth(age), 0.05);
  let fsst = fwidth(sst);
  let pw = i.wx.x;         // sea-level pressure about 1013 hPa
  let fpw = fwidth(pw);
  let wT = i.wx.z;         // the chart's surface temperature, °C
  let fwT = fwidth(wT);
  let wH = i.wx.w;         // the column's relative humidity (0..1)
  let fwH = fwidth(wH);
  let fpsi = fwidth(psi);
  let fsnow = max(fwidth(snowL), 1e-3);
  let fseaice = max(fwidth(iceS), 1e-3);
  let fice = max(fwidth(iceH), 1.0);
  let flake = max(fwidth(lake), 1e-4);
  let fsalt = max(fwidth(salt), 1e-3);
  let freach = max(fwidth(i.pq.w), 1e-3);   // the Settlement map's frontier (where people have reached)
  let lat = asin(clamp(wpn.z, -1.0, 1.0));
  let dlat = fwidth(lat);
  let sunUp = dot(wpn, u.sun.xyz);   // the sine of the Sun's elevation
  let fsun = max(fwidth(sunUp), 1e-5);
  let iceSurf = max(e, 0.0) + iceH / 1000.0;
  let fsurf = fwidth(iceSurf);
  let oceanic = 1.0 - smoothstep(0.35, 0.65, phi);
  let climate = u.mode.x > 0.5 && u.mode.x < 1.5;
  let weather = u.mode.x > 1.5 && u.mode.x < 4.5;
  let wxTemp = u.mode.x > 2.5 && u.mode.x < 3.5;
  let wxHum = u.mode.x > 3.5 && u.mode.x < 4.5;
  let tides = u.mode.x > 4.5 && u.mode.x < 5.5;
  let air = u.mode.x > 5.5 && u.mode.x < 6.5;
  let folkV = u.mode.x > 6.5;       // the People view: its Settlement map (7), Density map (8) or Knowledge map (9)
  let folkD = u.mode.x > 7.5 && u.mode.x < 8.5;
  let folkK = u.mode.x > 8.5;
  let folkC = folkD || folkK;       // the People maps on a chart's base
  // The tide: its harmonic per unit equilibrium tide, scaled (η = C cos ωt + S sin ωt, m).
  let tz = i.td.xy * u.tide2.x;
  let tA = length(tz);
  let tc = tz / max(tA, 1e-6);                 // e^{iG}, G the phase of high water
  let z2 = vec2f(tc.x * tc.x - tc.y * tc.y, 2.0 * tc.x * tc.y);
  let z3 = vec2f(z2.x * tc.x - z2.y * tc.y, z2.x * tc.y + z2.y * tc.x);
  let im6 = 2.0 * z3.x * z3.y;                 // sin 6G: zero every 30°, with no seam where G wraps
  let fim6 = fwidth(im6);
  let sd = tc.y * u.tide.z - tc.x * u.tide.w;  // sin(G − φ₂): zero at high and low water
  let fsd = fwidth(sd);

  // Sea: depth tint, stripes on oceanic crust, isobaths every kilometre.
  let d = -e;
  // Depth tint: a square-root curve, so shelves read as water and the abyss as deep. Where
  // phytoplankton grow (the export production, g C m⁻² yr⁻¹, in the zones' slot 14) the water
  // turns a milky teal, as a bloom looks from orbit (green toward turquoise, brightened by the
  // cells' scattering), by log production: nothing in the gyres (~4, the sea's median), half at
  // ~12 (the most productive tenth: upwelling coasts, river mouths, the cold sea), all past 25.
  let bloom = smoothstep(0.7, 1.4, log(max(i.z3.z, 1e-3)) / 2.302585);
  let seaInk = mix(u.ocean.rgb, u.inkD.rgb, PLANKTON_HUE * bloom);
  var sea = mix(u.canvas.rgb, seaInk, u.frame2.y + u.frame2.z * sqrt(clamp(d / 6.0, 0.0, 1.0)));
  sea = mix(sea, mix(u.canvas.rgb, mix(u.inkD.rgb, u.ocean.rgb, 0.3), 0.4), PLANKTON_WASH * bloom);
  let w = max(1.5 * ftf, u.frame.w);
  let pbar = (polC(tf + w) - polC(tf - w)) / (2.0 * w);
  sea = mix(sea, u.text.rgb, 0.075 * (0.5 + 0.5 * pbar) * oceanic * (1.0 - iceS));
  sea = mix(sea, u.text.rgb, 0.09 * hair(abs(d - round(d)), fe) * step(0.5, d));
  // In the Climate view the sea is a plain wash, with isotherms every 5 °C and
  // the gyres' streamlines every 3 Sv (the currents run along them).
  var wash = mix(u.canvas.rgb, u.ocean.rgb, 0.16);
  let iso = sst / 5.0;
  wash = mix(wash, u.text.rgb, 0.22 * hair(abs(iso - round(iso)), max(fsst / 5.0, 1e-4)));
  let st = psi / 3.0;
  wash = mix(wash, u.ocean.rgb, 0.75 * hair(abs(st - round(st)), max(fpsi / 3.0, 1e-4)) * step(0.5, abs(psi)));
  // Export production (g C m⁻² yr⁻¹, in the zones' free slot): viridian strokes, denser where more sinks.
  let ex = smoothstep(0.6, 1.9, log(max(i.z3.z, 1e-3)) / 2.302585);
  let exMarks = strokes(T, mix(15.0, 5.0, ex) * u.mode.z, 0.9 * u.mode.z) * smoothstep(0.0, 0.15, ex);
  wash = mix(wash, u.inkA.rgb, 0.6 * exMarks);
  sea = select(sea, wash, climate);
  // Snow and sea ice: a light fill with a hard edge, as a map draws them.
  let iceInk = select(mix(u.canvas.rgb, u.ocean.rgb, 0.05), mix(u.canvas.rgb, u.text.rgb, 0.16), dark);
  let snowInk = select(u.canvas.rgb, mix(u.canvas.rgb, u.text.rgb, 0.2), dark);
  let seaIce = clamp(0.5 + (iceS - 0.5) / fseaice, 0.0, 1.0);
  sea = mix(sea, iceInk, seaIce);
  sea = mix(sea, u.ocean.rgb, 0.55 * hair(abs(iceS - 0.5), fseaice));
  let ice = clamp(0.5 + (snowL - 0.5) / fsnow, 0.0, 1.0);   // snow on land
  let iceEdge = hair(abs(snowL - 0.5), fsnow);

  // Land: the plants' cover (the height's umber where it isn't known yet), rock
  // toward the summits, contours every kilometre.
  let heightTint = mix(u.canvas.rgb, u.land.rgb, u.frame2.w + u.light.w * smoothstep(0.0, 5.0, e));
  var land = select(heightTint, i.cv.rgb / max(i.cv.w, 1e-6), i.cv.w > 0.5);
  land = mix(land, mix(u.canvas.rgb, u.land.rgb, 0.5), smoothstep(1.2, 4.0, e) * 0.85);
  land = mix(land, u.text.rgb, 0.07 * hair(abs(e - round(e)), fe) * step(0.5, e));
  land = mix(land, snowInk, ice);
  land = mix(land, u.text.rgb, 0.22 * iceEdge);
  // Salt flats (Relief): a pale crust with a hard edge under short graphite strokes, under snow hidden.
  let sk = clamp(0.5 + (salt - 0.25) / fsalt, 0.0, 1.0) * (1.0 - ice) * select(1.0, 0.0, climate);
  if (sk > 0.0) {
    let crust = select(mix(land, u.canvas.rgb, 0.72), mix(land, u.text.rgb, 0.24), dark);
    let saltInk = select(mix(crust, u.text.rgb, 0.55), mix(crust, u.canvas.rgb, 0.6), dark);
    land = mix(land, mix(crust, saltInk, strokes(T, 6.5 * u.mode.z, 0.8 * u.mode.z)), sk);
  }
  // Permafrost (Relief): a violet hatch on the Climate view's mosaic of tesserae, each tessera frozen
  // with the share's probability, so the soft share reads as patchiness. Over snow (the ground stays
  // frozen under it), under a lake's water, frozen over or not, and under the ice sheets (their fill, below).
  let ts = tessera(i.wp.xyz * u.mode.y);
  let tess = ts.w;
  let pf = i.td.w * select(0.0, 1.0, u.mode.x < 0.5);
  if (pf > 0.002) {
    let frozen = select(0.0, 1.0, tess < pf) * (1.0 - clamp(0.5 + lake / flake, 0.0, 1.0));
    land = mix(land, u.inkG.rgb, 0.07 * frozen);
    land = mix(land, u.inkG.rgb, 0.7 * frozen * hatch(T, vec2f(1.0, 0.0), 4.2 * u.mode.z, 0.8 * u.mode.z));
  }
  // Lakes, in the sea's tint by depth and blooming as the sea does (their algae's production, on the
  // sea's export scale, in the zones' slot 14: src/engine/life.js), with a hard shore and its hairline. The field is smoothed
  // and signed (dry land below zero), so the shore is a curve. Frozen, a lake is ice on water, as
  // the sea's is: the sea ice's ink and its edge's hairline, where the land's snow field passes ½,
  // read on the lake at its surface's height (src/engine/climate.js, geography). The model
  // freezes a lake's share by ramp(−Ts, 0, 4.5), a quarter degree colder than the snow's; through the year
  // the two disagree on under 3% of lake vertices.
  let lk = clamp(0.5 + lake / flake, 0.0, 1.0);
  var lakeWater = mix(u.canvas.rgb, mix(u.ocean.rgb, u.inkD.rgb, PLANKTON_HUE * bloom), u.frame2.y + u.frame2.z * lakeQ);
  lakeWater = mix(lakeWater, mix(u.canvas.rgb, mix(u.inkD.rgb, u.ocean.rgb, 0.3), 0.4), PLANKTON_WASH * bloom);
  let lakeInk = mix(mix(lakeWater, iceInk, ice), u.ocean.rgb, 0.55 * iceEdge);
  land = mix(land, lakeInk, lk);
  land = mix(land, u.text.rgb, 0.55 * hair(abs(lake), flake));

  // The Climate view: the zones' mosaic on land.
  var probs = array<f32, 16>(i.z0.x, i.z0.y, i.z0.z, i.z0.w, i.z1.x, i.z1.y, i.z1.z, i.z1.w,
                             i.z2.x, i.z2.y, i.z2.z, i.z2.w, i.z3.x, i.z3.y, 0.0, 0.0);
  let h = tess;
  var acc = 0.0;
  var cls = 13;
  // Drawn in proportion to p²: an even ecotone stays an even mosaic, while the
  // logistic tails (a few percent of every class everywhere) don't speckle it.
  var tot = 0.0;
  for (var k = 0; k < 14; k++) { probs[k] = probs[k] * probs[k]; tot += probs[k]; }
  for (var k = 0; k < 14; k++) {
    acc += probs[k] / max(tot, 1e-6);
    if (h < acc) { cls = k; break; }
  }
  // A lake in the Zones map is the sea's wash, frozen as the sea is there, with its production's
  // strokes as the sea's and its shore's hairline.
  let lakeWash = mix(mix(mix(mix(u.canvas.rgb, u.ocean.rgb, 0.16), u.inkA.rgb, 0.6 * exMarks), iceInk, ice), u.ocean.rgb, 0.55 * iceEdge);
  var zone = mix(zoneColor(cls, T), lakeWash, lk);
  zone = mix(zone, u.text.rgb, 0.5 * hair(abs(lake), flake));
  land = select(land, zone, climate);
  let shade = select(relief, mix(1.0, relief, 0.55), climate);
  let seaShade = select(relief, 1.0, climate);

  // Ice sheets: a light fill with a hard outline, and contours of the ice's
  // surface every 500 m (the ice flows across them, downhill).
  let sheet = clamp(0.5 + (iceH - 50.0) / fice, 0.0, 1.0);
  let sc = iceSurf * 2.0;
  var iceC = mix(snowInk, u.ocean.rgb, 0.35 * hair(abs(sc - round(sc)), max(2.0 * fsurf, 1e-4)) * step(0.3, iceSurf));
  land = mix(land, iceC, sheet);
  sea = mix(sea, iceC, sheet);
  let sheetEdge = hair(abs(iceH - 50.0), fice) * step(0.0, cst + iceH / 1000.0);
  land = mix(land, u.text.rgb, 0.55 * sheetEdge);
  sea = mix(sea, u.text.rgb, 0.55 * sheetEdge);
  // Ice streams: where sliding carries more than half the flow and the ice moves at tens of m/yr.
  let slide = length(i.iv.xyz);
  let streamW = smoothstep(0.5, 0.7, slide) * smoothstep(15.0, 40.0, i.iv.w) * sheet * select(1.0, 0.0, climate);
  if (streamW > 0.01) {
    let st = flowDash(T, i.iv.xyz / max(slide, 1e-6), 6.0 * u.mode.z, 5.0 * u.mode.z, 0.9 * u.mode.z) * streamW;
    land = mix(land, u.ocean.rgb, 0.6 * st);
    sea = mix(sea, u.ocean.rgb, 0.6 * st);
  }

  // The Weather view: a chart's base, isobars, and rain as stipple.
  var wland = mix(u.canvas.rgb, u.land.rgb, 0.16) * mix(1.0, relief, 0.5);
  var wsea = mix(u.canvas.rgb, u.ocean.rgb, 0.05);
  let ib = (pw + 1013.0) / 4.0;          // isobars at whole hPa: …1012, 1016…
  let iso4 = hair(abs(ib - round(ib)), max(fpw / 4.0, 1e-4));
  let ib20 = (pw + 1013.0) / 20.0;
  let iso20 = hair(abs(ib20 - round(ib20)), max(fpw / 10.0, 1e-4));
  let rainR = i.wx.y;
  let rainDots = stipple(T, mix(10.0, 3.6, smoothstep(1.0, 25.0, rainR)) * u.mode.z, 0.85 * u.mode.z) * smoothstep(0.5, 2.0, rainR);
  // Temperature: a wash from prussian (cold) to sienna (warm), isotherms every 5 °C, 0 °C heavier.
  let tT = clamp((wT - 10.0) / 25.0, -1.0, 1.0);
  let tTint = select(u.ocean.rgb, u.inkF.rgb, tT > 0.0);
  let isoT = wT / 5.0;
  let isoTl = hair(abs(isoT - round(isoT)), max(fwT / 5.0, 1e-4));
  let iso0 = hair(abs(wT), max(fwT, 1e-4));
  // Humidity: ochre where dry, verdigris where moist, a line every 20%.
  let hTint = select(u.inkB.rgb, u.inkD.rgb, wH > 0.5);
  let isoH = wH * 5.0;
  let isoHl = hair(abs(isoH - round(isoH)), max(fwH * 5.0, 1e-4));
  wland = select(wland, mix(wland, tTint, 0.3 * abs(tT)), wxTemp);
  wsea = select(wsea, mix(wsea, tTint, 0.3 * abs(tT)), wxTemp);
  wland = select(wland, mix(wland, hTint, 0.7 * abs(wH - 0.5)), wxHum);
  wsea = select(wsea, mix(wsea, hTint, 0.7 * abs(wH - 0.5)), wxHum);
  // Rain in the pressure and humidity charts; then each chart's lines.
  let showRain = select(1.0, 0.0, wxTemp);
  wland = mix(wland, u.ocean.rgb, 0.85 * rainDots * showRain);
  wsea = mix(wsea, u.ocean.rgb, 0.85 * rainDots * showRain);
  let chartLines = select(select(max(0.4 * iso4, 0.6 * iso20), max(0.32 * isoTl, 0.7 * iso0), wxTemp), 0.32 * isoHl, wxHum);
  wland = mix(wland, u.text.rgb, chartLines);
  wsea = mix(wsea, u.text.rgb, chartLines);
  land = select(land, wland, weather);
  sea = select(sea, wsea, weather);

  // The Climate view's Air chart: a chart's base, under an ochre stipple whose density is the dust the
  // air carries (kg/m², the year's mean load, in the zones' last slot; ~0.01 g/m² to ~2), over land,
  // sea and ice alike.
  let dl = smoothstep(-2.0, 0.3, log(max(i.z3.w * 1000.0, 1e-6)) / 2.302585);
  let dustDots = stipple(T, mix(16.0, 4.2, dl) * u.mode.z, 0.75 * u.mode.z) * smoothstep(0.0, 0.1, dl);
  let aland = mix(mix(u.canvas.rgb, u.land.rgb, 0.16) * mix(1.0, relief, 0.5), u.inkB.rgb, 0.75 * dustDots);
  let asea = mix(mix(u.canvas.rgb, u.ocean.rgb, 0.05), u.inkB.rgb, 0.75 * dustDots);
  land = select(land, aland, air);
  sea = select(sea, asea, air);

  // The Tides view: co-range wash (or, at the slowest dials, the sea's height now), co-tidal
  // lines every lunar hour fading into each amphidrome, the line of high water now, and a
  // sienna stipple where the tide's energy goes (its density the dissipation per area).
  let eta = dot(tz, u.tide.xy);
  let range = mix(u.canvas.rgb, u.ocean.rgb, 0.05 + 0.62 * sqrt(clamp(tA / 3.0, 0.0, 1.0)));
  let height = mix(u.canvas.rgb, u.ocean.rgb, 0.3 + 0.28 * clamp(eta, -1.0, 1.0));   // ±1 m of sea
  var tsea = mix(range, height, u.tide2.z);
  let dW = i.td.z * u.tide2.y;                 // W/m²
  let dDots = stipple(T, mix(9.0, 3.4, smoothstep(0.05, 1.0, dW)) * u.mode.z, 0.8 * u.mode.z) * smoothstep(0.02, 0.08, dW);
  tsea = mix(tsea, u.inkF.rgb, 0.8 * dDots);
  let cotidal = hair(abs(im6), fim6) * smoothstep(0.015, 0.05, tA) * step(0.0, tc.x * tc.x + tc.y * tc.y - 0.5);
  tsea = mix(tsea, u.text.rgb, 0.3 * cotidal);
  let high = hair(abs(sd), fsd) * step(0.0, tc.x * u.tide.z + tc.y * u.tide.w) * smoothstep(0.015, 0.05, tA);
  tsea = mix(tsea, u.text.rgb, 0.85 * high * u.tide2.z);
  let tland = mix(u.canvas.rgb, u.land.rgb, 0.16) * mix(1.0, relief, 0.5);
  land = select(land, tland, tides);
  sea = select(sea, tsea, tides);

  // The People view. Settlement: the Relief view's land and sea where people have ever lived, grey
  // terra incognita where they haven't, a hairline at the frontier. Density: a chart's base with the
  // ice sheets under the people's and the robots' tints. Both: the land's uses on the mosaic's
  // tesserae, each tessera one use by its cell's shares (exclusive) at the rank, in two patterns, each in two
  // colours: blocks for residences (people's cities in the accent, AI's datacenters in the robots'
  // verdigris), parcels for fields (farms in sap, solar farms in indigo), and factories a heavy hatch.
  let explored = clamp(0.5 + (i.pq.w - 0.5) / freach, 0.0, 1.0);
  let unknown = mix(mix(u.canvas.rgb, u.text.rgb, select(0.13, 0.12, dark)), iceC, sheet);
  // On the People charts the ice is plain (its surface's contours crowd at a cap's steep edge, and
  // read there as the charts' own lines).
  var pland = select(mix(unknown, land, explored), mix(mix(u.canvas.rgb, u.land.rgb, 0.16) * mix(1.0, relief, 0.5), snowInk, sheet), folkC);
  // The land's uses by a rank fixed to the globe at the tessera's site (the People view's, and the
  // night's lights: the cities' tesserae lit at a city's density).
  var rank = 1.0;
  if (folkV || u.sun.w > 0.0) { rank = landRank(ts.xyz / u.mode.y); }
  if (folkV) {
    if (folkD) {
      // People: the accent by log density, a faint wash wherever anyone lives deepening to the farms'
      // densities (~0.003 to ~300 a km²), then a step for the cities (~200 to ~4,000 a km²).
      let plog = i.pp.x;   // log₁₀ a km², interpolated in log (People.drawn)
      let rural = smoothstep(-3.2, -2.5, plog) * select(0.08 + 0.22 * smoothstep(-2.5, 2.5, plog), 0.05 + 0.16 * smoothstep(-2.5, 2.5, plog), dark);
      let urban = smoothstep(2.3, 3.6, plog) * select(0.42, 0.55, dark);
      pland = mix(pland, u.accent.rgb, rural + urban);
      // Robots at work (worker-equivalents a km², ~1 to ~3,000 by log): verdigris over the people, so a
      // few million robots near the cities barely show and billions over the land do.
      let rlog = i.pq.z;
      pland = mix(pland, u.inkD.rgb, select(0.55, 0.6, dark) * smoothstep(0.0, 3.5, rlog));
    } else if (folkK) {
      // Knowledge in its two domains, where people have been: production as an accent wash and learning
      // as a verdigris one, each by how near the place is to its frontier (full at it, a third half a
      // unit behind; where both are near they mix to a grey); lines of equal production in the accent (heavier at farming's and industry's, Z_FARM and
      // Z_IND: the fronts by which they spread) and of equal learning in verdigris, each line at
      // the coarsest of a quarter, a half, one or two units it falls on where such lines stand ≥ ~6 px
      // apart (a steep front keeps every fourth or eighth); and a stipple, denser by the works a km²
      // (from ~30 person-years to ~10⁴).
      let zp = i.wx.y;
      let zl = i.wx.z;
      let had = explored * (1.0 - sheet);   // where people have been, never over an ice sheet
      let a = select(0.4, 0.45, dark);
      pland = mix(pland, u.accent.rgb, a * exp(-2.0 * max(u.steam.z - zp, 0.0)) * had);
      pland = mix(pland, u.inkD.rgb, a * exp(-2.0 * max(u.steam.w - zl, 0.0)) * had);
      let fzp = max(fwidth(zp), 1e-5);
      let fzl = max(fwidth(zl), 1e-5);
      var isoP = 0.0;
      var isoL = 0.0;
      for (var L = 0u; L < 4u; L++) {
        let iv = 0.25 * f32(1u << L);
        isoP = max(isoP, hair(abs(zp / iv - round(zp / iv)), fzp / iv) * smoothstep(4.0, 7.0, iv / fzp));
        isoL = max(isoL, hair(abs(zl / iv - round(zl / iv)), fzl / iv) * smoothstep(4.0, 7.0, iv / fzl));
      }
      pland = mix(pland, u.accent.rgb, 0.55 * isoP * had);
      pland = mix(pland, u.inkD.rgb, 0.65 * isoL * had);
      let era = max(hair(abs(zp - Z_FARM), 2.2 * fzp), hair(abs(zp - Z_IND), 2.2 * fzp));
      pland = mix(pland, u.accent.rgb, 0.8 * era * had);
      let wl = log(max(i.wx.w, 1e-6)) / 2.302585;
      let wd = smoothstep(1.5, 4.0, wl);
      pland = mix(pland, u.text.rgb, 0.55 * stipple(T, mix(12.0, 4.0, wd) * u.mode.z, 0.8 * u.mode.z) * smoothstep(1.3, 1.7, wl) * had);
    } else {
      pland = mix(pland, u.text.rgb, 0.4 * hair(abs(i.pq.w - 0.5), freach));
    }
    // The land's uses by the rank at the tessera's site: cities at its lows, then datacenters,
    // factories, farms, solar farms and the herders' pasture outward.
    let c1 = i.pp.z;
    let c2 = c1 + i.pq.x;
    let c3 = c2 + i.pp.w;
    let c4 = c3 + i.pp.y;
    let c5 = c4 + i.pq.y;
    let c6 = c5 + i.wp.w;
    let blocks = max(hatch(T, vec2f(1.0, 0.0), 3.4 * u.mode.z, 0.7 * u.mode.z), hatch(T, vec2f(0.0, 1.0), 3.4 * u.mode.z, 0.7 * u.mode.z));
    let furrowA = 3.14159265 * fract(tess * 97.31);
    let furrows = hatch(T, vec2f(cos(furrowA), sin(furrowA)), 3.6 * u.mode.z, 0.75 * u.mode.z);
    if (rank < c1) {
      pland = mix(mix(pland, u.accent.rgb, 0.14), mix(u.accent.rgb, u.text.rgb, select(0.35, 0.3, dark)), 0.75 * blocks);
    } else if (folkK) {
      // The Knowledge map keeps only the cities of the land's uses (where the minds gather).
    } else if (rank < c2) {
      pland = mix(mix(pland, u.inkD.rgb, 0.14), mix(u.inkD.rgb, u.text.rgb, select(0.35, 0.3, dark)), 0.75 * blocks);
    } else if (rank < c3) {
      pland = mix(mix(pland, u.inkF.rgb, 0.18), u.inkF.rgb, 0.85 * hatch(T, vec2f(0.7071, 0.7071), 2.8 * u.mode.z, 1.0 * u.mode.z));
    } else if (rank < c4) {
      pland = mix(pland, u.inkC.rgb, 0.1 + 0.55 * furrows);
    } else if (rank < c5) {
      pland = mix(pland, u.inkE.rgb, 0.12 + 0.6 * furrows);
    } else if (rank < c6) {
      // Herders' pasture: parcels as the farms', in ochre.
      pland = mix(pland, u.inkB.rgb, 0.1 + 0.55 * furrows);
    }
  }
  // Nothing stands on a lake or an ice sheet: the lakes over the uses, as the Relief view draws them
  // (Settlement, known land or not, as the rivers and the ice) and in the chart's water (Density,
  // Knowledge), with their shore; the ice sheets over them in turn, the Relief view's on Settlement and
  // plain on the charts, with their edge (the uses, the frontier's hairline and the knowledge stop there).
  let pwet = lk * (1.0 - sheet);
  pland = mix(pland, select(lakeInk, mix(u.canvas.rgb, u.ocean.rgb, 0.12), folkC), pwet);
  pland = mix(pland, u.text.rgb, select(0.55, 0.4, folkC) * hair(abs(lake), flake) * (1.0 - sheet));
  pland = mix(pland, select(iceC, snowInk, folkC), sheet);
  pland = mix(pland, u.text.rgb, select(0.55, 0.4, folkC) * sheetEdge);
  land = select(land, pland, folkV);
  sea = select(sea, mix(mix(u.canvas.rgb, u.ocean.rgb, 0.05), snowInk, sheet), folkC);
  let chart = weather || tides || air || folkC;

  // A lake's surface, open or frozen, takes the sea's hillshade, its bed's relief at a third (the
  // normals are the land's, at full exaggeration, so a third of their shading).
  let lakeFlat = lk * (1.0 - sheet);
  var c = select(land * select(mix(shade, 1.0 + (shade - 1.0) / 3.0, lakeFlat), 1.0, chart), sea * select(seaShade, 1.0, chart), cst < 0.0);

  // The coastline.
  c = mix(c, u.text.rgb, 0.7 * hair(abs(cst), fcst));
  // The sulfate veil (Air, People): graphite hatching along the circles of latitude (the volcanoes' and
  // a sprayed veil lie in bands; coal's haze lies where the winds carry it), denser where its optical
  // depth is (16 px apart at 0.02, 4 px at 1, by log optical depth).
  if (air || folkV) {
    let aod = veilAt(wpn.z) + max(i.wx.x, 0.0);
    let va = smoothstep(-1.7, 0.0, log(max(aod, 1e-4)) / 2.302585);
    let vh = hatch1(vec2f(lat, 0.0), dlat, vec2f(1.0, 0.0), octave(mix(16.0, 4.0, va) * u.mode.z), 0.55 * u.mode.z);
    c = mix(c, mix(u.text.rgb, u.canvas.rgb, 0.3), select(0.5, 0.28, folkV) * vh * smoothstep(0.01, 0.04, aod));   // lighter over the people
  }
  // Night: where the dial resolves the day (u.sun.w), the side away from the Sun darkens in three
  // steps, at the Sun 0°, 6° and 12° below the horizon (civil, nautical and astronomical twilight's:
  // standard), toward graphite (black in the dark theme). Over it, the lights: a tint by the log of
  // people's and robots' density (the cities' tesserae at a city's, D_URB), from nothing at a
  // forager's ~1 a km² through a third at farmland's ~100 to full at a city's ~4,000, yellow where
  // people make it and white where the robots do; none on the sea, a lake or an ice sheet.
  let dusk = clamp(0.5 - sunUp / fsun, 0.0, 1.0) + clamp(0.5 - (sunUp + 0.104528) / fsun, 0.0, 1.0) + clamp(0.5 - (sunUp + 0.207912) / fsun, 0.0, 1.0);
  let night = u.sun.w * dusk / 3.0;
  if (night > 0.0) {
    c = mix(c, select(u.text.rgb, vec3f(0.0), dark), select(NIGHT_K, NIGHT_K_DARK, dark) * night);
    let dens = pow(10.0, i.pp.x);
    let folkN = select(dens, max(dens, 4000.0), rank < i.pp.z);
    let bots = pow(10.0, i.pq.z);
    let lq = log(max(folkN + bots, 1e-9)) / 2.302585;
    let lit = pow(smoothstep(0.0, 3.6, lq), 2.2) * step(0.0, cst) * (1.0 - lk) * (1.0 - sheet);
    let col = mix(LIGHT_FOLK, LIGHT_BOTS, bots / max(folkN + bots, 1e-9));
    c = mix(c, col, 0.9 * lit * night);
  }
  // The runaway's steam: a pale wash over everything, as thick as the column (Venus's surface is
  // hidden under 92 bar; this one keeps a little of the ground showing).
  c = mix(c, mix(u.canvas.rgb, u.text.rgb, 0.12), u.steam.x);
  return vec4f(c, 1.0);
}
`;

function hexToRgb(hex) {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0, 2), 16) / 255, parseInt(h.slice(2, 4), 16) / 255, parseInt(h.slice(4, 6), 16) / 255];
}

/**
 * The globe on `mesh`. Fields arrive on the engine's grid `coarse`; where that is
 * a level coarser they're refined onto the mesh on the GPU (src/gpu/refine.js),
 * else written straight in. The weather writes its fields on the mesh.
 */
export async function createGlobe(canvas, mesh, coarse, device) {
  const context = canvas.getContext('webgpu');
  const format = navigator.gpu.getPreferredCanvasFormat();
  context.configure({ device, format, alphaMode: 'opaque' });
  let lost = false;
  device.lost.then(() => { lost = true; });

  const n = coarse.n, nm = mesh.n, refining = coarse !== mesh;
  const VS = GPUBufferUsage.VERTEX | GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST;
  const posBuf = device.createBuffer({ size: nm * 12, usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST });
  device.queue.writeBuffer(posBuf, 0, Float32Array.from(mesh.pos));
  const fieldBuf = device.createBuffer({ size: nm * 32, usage: VS });   // current, previous
  const normBuf = device.createBuffer({ size: nm * 32, usage: VS });    // current, previous (vec3 in vec4)
  const climBuf = device.createBuffer({ size: nm * 32, usage: VS });   // the season's two vec4s (src/gpu/season.js)
  const zoneBuf = device.createBuffer({ size: nm * 64, usage: VS });
  const iceBuf = device.createBuffer({ size: nm * 16, usage: VS });
  const wxBuf = device.createBuffer({ size: nm * 16, usage: VS });      // written by the weather's kernels, on the mesh
  // The tide's harmonic and dissipation and the permafrost's share, then the lakes' drawn field and
  // salt (the last and the new), then their tint (the last and the new): one buffer, as a pipeline
  // has eight vertex buffers at most.
  const tideBuf = device.createBuffer({ size: nm * 48, usage: VS });
  // The cover's eight colour weights a vertex, read by the vertex shader from storage (a ninth vertex buffer is past the limit).
  const coverBuf = storage(device, nm * 32);
  // The people's eight values a vertex (the People scenario), refined from their grid (src/engine/people-worker.js).
  const folkBuf = storage(device, nm * 32);
  // The herders' pasture, one vec4 a vertex (People.pasture), refined from their grid as the folk are.
  const pastBuf = storage(device, nm * 16);
  let pastS = null;
  // Coal's sulfate's pattern a vertex (the People scenario: src/engine/peoplelink.js), one vec4 for the refiner.
  const sulfBuf = storage(device, nm * 16), sulfS = refining ? storage(device, n * 16) : sulfBuf;
  let folkS = null, folkRef = null;
  // The fields' sources on the engine's grid: their own buffers when refining, else the vertex buffers.
  const S = (size, own) => refining ? storage(device, size) : own;
  const fieldS = S(n * 32, fieldBuf), normS = S(n * 32, normBuf), climS = S(n * 32, climBuf), zoneS = S(n * 64, zoneBuf), iceS = S(n * 16, iceBuf), tideS = S(n * 48, tideBuf), coverS = S(n * 32, coverBuf);
  const refiner = refining ? new Refiner(device, mesh, coarse) : null;
  const refine = (src, dst, m, enc) => { if (refiner) refiner.run(src, dst, m, enc); };
  const idxBuf = device.createBuffer({ size: mesh.tris.byteLength, usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST });
  device.queue.writeBuffer(idxBuf, 0, mesh.tris);
  const uniBuf = device.createBuffer({ size: 32 * 16, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
  let polBuf = null, polCap = 0;

  const module = device.createShaderModule({ code: SHADER });
  const pipeline = device.createRenderPipeline({
    layout: 'auto',
    vertex: {
      module, entryPoint: 'vs',
      buffers: [
        { arrayStride: 12, attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x3' }] },
        { arrayStride: 32, attributes: [{ shaderLocation: 1, offset: 0, format: 'float32x4' }, { shaderLocation: 10, offset: 16, format: 'float32x4' }] },
        { arrayStride: 32, attributes: [{ shaderLocation: 2, offset: 0, format: 'float32x3' }, { shaderLocation: 11, offset: 16, format: 'float32x3' }] },
        { arrayStride: 32, attributes: [{ shaderLocation: 3, offset: 0, format: 'float32x4' }, { shaderLocation: 14, offset: 16, format: 'float32x4' }] },
        { arrayStride: 64, attributes: [0, 1, 2, 3].map(k => ({ shaderLocation: 4 + k, offset: 16 * k, format: 'float32x4' })) },
        { arrayStride: 16, attributes: [{ shaderLocation: 8, offset: 0, format: 'float32x4' }] },
        { arrayStride: 16, attributes: [{ shaderLocation: 9, offset: 0, format: 'float32x4' }] },
        { arrayStride: 48, attributes: [{ shaderLocation: 12, offset: 0, format: 'float32x4' }, { shaderLocation: 13, offset: 16, format: 'float32x4' }, { shaderLocation: 15, offset: 32, format: 'float32x4' }] },
      ],
    },
    fragment: { module, entryPoint: 'fs', targets: [{ format }] },
    primitive: { topology: 'triangle-list', cullMode: 'none' },
    depthStencil: { format: 'depth24plus', depthWriteEnabled: true, depthCompare: 'less' },
  });
  let bind = null, depth = null, depthW = 0, depthH = 0;
  const uni = new Float32Array(128);
  const field = new Float32Array(8 * n);
  const norm = new Float32Array(8 * n);
  let blend = 1;
  let polN = 0, polDT = 1, polT0 = 0;
  // The lakes ease from the last drawn to the new over LAKE_EASE ms.
  const LAKE_EASE = 400, tideLake = new Float32Array(12 * n);
  let lakeAt = -Infinity;
  const lakeMix = () => { const t = Math.min(1, Math.max(0, (performance.now() - lakeAt) / LAKE_EASE)); return t * t * (3 - 2 * t); };

  function rebind() {
    bind = device.createBindGroup({
      layout: pipeline.getBindGroupLayout(0),
      entries: [{ binding: 0, resource: { buffer: uniBuf } }, { binding: 1, resource: { buffer: polBuf } }, { binding: 2, resource: { buffer: coverBuf } }, { binding: 3, resource: { buffer: folkBuf } }, { binding: 4, resource: { buffer: sulfBuf } }, { binding: 5, resource: { buffer: pastBuf } }],
    });
  }

  return {
    get lost() { return lost; },
    device,

    /** Polarity integral table over [T0, T0 + N·dT] (Myr). */
    setPolarity(table, T0, dT) {
      if (!polBuf || table.byteLength > polCap) {
        polCap = table.byteLength;
        polBuf = device.createBuffer({ size: polCap, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
        rebind();
      }
      device.queue.writeBuffer(polBuf, 0, table);
      polN = table.length; polDT = dT; polT0 = T0;
    },
    get polarityOrigin() { return polT0; },

    /**
     * Per cell: elevation above sea level (km), formation time (Myr), felsic fraction, the coast
     * (km, signed: negative on the ocean; src/render/surface.js, coastField), normal.
     */
    // `fromStep`: the old current becomes the previous state to blend from;
    // otherwise both are the new state.
    // `mode`: 'step', the current becomes the previous to blend from; 'reset', both are the
    // new state; 'refresh', the current changes and the previous stays (the blend carries on).
    setFields(elevRel, tform, felsic, coast, normals, mode = 'reset') {
      const fromStep = mode === 'step', both = mode === 'reset';
      for (let i = 0; i < n; i++) {
        const o = 8 * i;
        if (fromStep) { field[o + 4] = field[o]; field[o + 5] = field[o + 1]; field[o + 6] = field[o + 2]; field[o + 7] = field[o + 3]; }
        field[o] = elevRel[i];
        field[o + 1] = tform[i] - polT0;
        field[o + 2] = felsic[i];
        field[o + 3] = coast ? coast[i] : elevRel[i];
        if (both) { field[o + 4] = field[o]; field[o + 5] = field[o + 1]; field[o + 6] = field[o + 2]; field[o + 7] = field[o + 3]; }
        const q = 8 * i;
        if (fromStep) { norm[q + 4] = norm[q]; norm[q + 5] = norm[q + 1]; norm[q + 6] = norm[q + 2]; }
        norm[q] = normals[3 * i]; norm[q + 1] = normals[3 * i + 1]; norm[q + 2] = normals[3 * i + 2];
        if (both) { norm[q + 4] = norm[q]; norm[q + 5] = norm[q + 1]; norm[q + 6] = norm[q + 2]; }
      }
      device.queue.writeBuffer(fieldS, 0, field);
      device.queue.writeBuffer(normS, 0, norm);
      if (refiner) {
        const enc = device.createCommandEncoder();
        refine(fieldS, fieldBuf, 2, enc); refine(normS, normBuf, 2, enc);
        device.queue.submit([enc.finish()]);
      }
    },

    /** Per cell of the engine's grid, two vec4s: the land's snow (0..1), sea-surface temperature, the gyres' streamfunction (Sv), ice thickness (m); the sea's ice (0..1); the season writes it, then `refineClimate`. */
    climBuffer: climS,
    refineClimate() { refine(climS, climBuf, 2); },
    /** Per cell: the zones' probabilities, 16 floats (14 used). */
    setZones(z) { device.queue.writeBuffer(zoneS, 0, z); refine(zoneS, zoneBuf, 4); },
    /** Per cell: the tide's harmonic per unit equilibrium tide (C, S) and dissipation per unit² (W/m²). */
    setTides(C, S, diss) {
      const a = tideLake;
      for (let i = 0; i < n; i++) { a[12 * i] = C[i]; a[12 * i + 1] = S[i]; a[12 * i + 2] = diss[i]; }
      device.queue.writeBuffer(tideS, 0, a); refine(tideS, tideBuf, 3);
    },
    /** Per cell: the permafrost's share (0..1; src/engine/soil.js), as the worker draws it (`drawnPermafrost`). */
    setPermafrost(p) {
      const a = tideLake;
      for (let i = 0; i < n; i++) a[12 * i + 3] = p[i];
      device.queue.writeBuffer(tideS, 0, a); refine(tideS, tideBuf, 3);
    },
    /**
     * Per cell: the lakes' drawn field (signed: the shore at zero), salt flats' share and the lakes'
     * tint (src/render/surface.js, lakeFields), eased from what is drawn now.
     */
    setLakes(draw, salt, tint) {
      const f = lakeMix(), first = lakeAt === -Infinity, a = tideLake;
      for (let i = 0; i < n; i++) {
        const o = 12 * i + 4, q = tint ? tint[i] : 0;
        a[o] = first ? draw[i] : a[o] + (a[o + 2] - a[o]) * f;
        a[o + 1] = first ? salt[i] : a[o + 1] + (a[o + 3] - a[o + 1]) * f;
        a[o + 2] = draw[i]; a[o + 3] = salt[i];
        a[o + 4] = first ? q : a[o + 4] + (a[o + 5] - a[o + 4]) * f;
        a[o + 5] = q;
      }
      lakeAt = performance.now();
      device.queue.writeBuffer(tideS, 0, a); refine(tideS, tideBuf, 3);
    },
    get lakesEasing() { return performance.now() - lakeAt < LAKE_EASE; },
    /** Per cell: the plants' cover as eight colour weights (src/engine/vegetation.js, COLOURS; zero off its land). */
    setCover(w) { device.queue.writeBuffer(coverS, 0, w); refine(coverS, coverBuf, 2); },
    /** Per cell of the people's grid `pg`, eight values (People.drawn): people per km², the shares of farms, cities and factories; of datacenters and solar farms, robots at work per km², reached. */
    setPeople(d, pg) {
      if (pg === mesh) { device.queue.writeBuffer(folkBuf, 0, d); return; }
      if (!folkS) folkS = storage(device, pg.n * 32);
      if (!folkRef) folkRef = refiner && refiner.coarse === pg ? refiner : new Refiner(device, mesh, pg);
      device.queue.writeBuffer(folkS, 0, d); folkRef.run(folkS, folkBuf, 2);
    },
    /** Per cell of the people's grid `pg`, four values (People.drawnB): the herders' pasture (a share of the cell), production's and learning's knowledge there, the works a km². */
    setPeopleB(l, pg) {
      if (pg === mesh) { device.queue.writeBuffer(pastBuf, 0, l); return; }
      if (!pastS) pastS = storage(device, pg.n * 16);
      if (!folkRef) folkRef = refiner && refiner.coarse === pg ? refiner : new Refiner(device, mesh, pg);
      device.queue.writeBuffer(pastS, 0, l); folkRef.run(pastS, pastBuf, 1);
    },
    /** Per cell of the engine's grid: coal's sulfate's burden, its pattern (mean 1), or null for none. */
    setSulfate(p) {
      const v = new Float32Array(4 * n);
      if (p) for (let i = 0; i < n; i++) v[4 * i] = p[i];
      device.queue.writeBuffer(sulfS, 0, v); refine(sulfS, sulfBuf, 1);
    },
    /** Per cell: the ice's flow direction (3) and speed (m/yr). */
    setIce(v) { device.queue.writeBuffer(iceS, 0, v); refine(iceS, iceBuf, 1); },
    refiner,
    /** Per cell: the chart's sea-level pressure (hPa about 1013), rain (mm/day), surface temperature (°C), column humidity (0..1); the weather writes it. */
    wxBuffer: wxBuf,

    draw(camera, tNow, palette, mode = {}) {
      if (lost || !bind) return;
      const w = canvas.width, h = canvas.height;
      if (!depth || depthW !== w || depthH !== h) {
        if (depth) depth.destroy();
        depth = device.createTexture({ size: [w, h], format: 'depth24plus', usage: GPUTextureUsage.RENDER_ATTACHMENT });
        depthW = w; depthH = h;
      }
      const m = camera.m;
      uni.set([m[0], m[1], m[2], 0, m[3], m[4], m[5], 0, m[6], m[7], m[8], 0], 0);
      const rPx = camera.radius(w, h);
      uni.set([2 * rPx / w, 2 * rPx / h, tNow - polT0, polDT], 12);
      const tint = palette.tint;
      uni.set([polN, tint[0], tint[1], tint[2]], 16);
      const put = (o, hex) => { const c = hexToRgb(hex); uni[o] = c[0]; uni[o + 1] = c[1]; uni[o + 2] = c[2]; uni[o + 3] = 1; };
      put(20, palette.canvas); put(24, palette.text); put(28, palette.accent); put(32, palette.ocean); put(36, palette.land);
      const L = [-0.55, 0.65, 0.52], lr = Math.hypot(...L);
      uni.set([L[0] / lr, L[1] / lr, L[2] / lr, tint[3]], 40);
      // The mosaic's lattice, snapped to octaves so tesserae stay put while zooming: ~14 CSS px each.
      const dprNow = w / Math.max(1, canvas.clientWidth || w);
      const freq = 2 ** Math.round(Math.log2(Math.max(8, rPx / dprNow / 14)));
      const wxm = { pressure: 2, temperature: 3, humidity: 4 }[mode.wx || 'pressure'];
      uni.set([mode.view === 'climate' ? (mode.cl === 'air' ? 6 : 1) : mode.view === 'weather' ? wxm : mode.view === 'tides' ? 5 : mode.view === 'people' ? (mode.pm === 'density' ? 8 : mode.pm === 'knowledge' ? 9 : 7) : 0, freq, dprNow, rPx], 44);
      put(48, palette.inks.viridian); put(52, palette.inks.ochre); put(56, palette.inks.sap); put(60, palette.inks.verdigris); put(64, palette.inks.indigo);
      uni[51] = palette.dark ? 1 : 0;
      put(68, palette.inks.sienna); put(72, palette.inks.violet);
      uni[55] = mode.blend ?? 1;
      const td = mode.tides || { m: [1, 0], hw: [1, 0], amp: 0, now: 0 };
      uni.set([td.m[0], td.m[1], td.hw[0], td.hw[1], td.amp, td.amp * td.amp, td.now, lakeMix()], 76);
      if (mode.veil) uni.set(mode.veil, 84); else uni.fill(0, 84, 120);
      uni[120] = mode.steam || 0; uni[121] = mode.sulf || 0; uni[122] = mode.fronts ? mode.fronts[0] : 0; uni[123] = mode.fronts ? mode.fronts[1] : 0;
      // The Sun's direction in the globe's frame and how much of the night side shows (main.js, dayShown).
      const sun = mode.sun || { dir: [1, 0, 0], w: 0 };
      uni.set([sun.dir[0], sun.dir[1], sun.dir[2], sun.w], 124);
      device.queue.writeBuffer(uniBuf, 0, uni);
      const bg = hexToRgb(palette.canvas);
      const enc = device.createCommandEncoder();
      const pass = enc.beginRenderPass({
        colorAttachments: [{ view: context.getCurrentTexture().createView(), clearValue: { r: bg[0], g: bg[1], b: bg[2], a: 1 }, loadOp: 'clear', storeOp: 'store' }],
        depthStencilAttachment: { view: depth.createView(), depthClearValue: 1, depthLoadOp: 'clear', depthStoreOp: 'store' },
      });
      pass.setPipeline(pipeline);
      pass.setBindGroup(0, bind);
      pass.setVertexBuffer(0, posBuf);
      pass.setVertexBuffer(1, fieldBuf);
      pass.setVertexBuffer(2, normBuf);
      pass.setVertexBuffer(3, climBuf);
      pass.setVertexBuffer(4, zoneBuf);
      pass.setVertexBuffer(5, iceBuf);
      pass.setVertexBuffer(6, wxBuf);
      pass.setVertexBuffer(7, tideBuf);
      pass.setIndexBuffer(idxBuf, 'uint32');
      pass.drawIndexed(mesh.tris.length);
      pass.end();
      device.queue.submit([enc.finish()]);
    },
  };
}
