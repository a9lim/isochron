// The physiographic globe in WebGPU: the geodesic grid's triangles, each cell's
// fields as vertex attributes, every mark procedural in the fragment shader.
//
// What each mark reads (docs/PLAN.md, "The scene"):
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
//   snow, sea ice    a light fill with a hard edge, as a map draws them
//   phytoplankton    the sea's tint turns a milky teal where its export
//                    production is high (src/engine/life.js), as a bloom looks
//                    from orbit: quiet in the gyres, seen at upwelling coasts
//                    and in the cold sea (Relief)
//   lakes            from their water (src/engine/lakes.js), in the sea's tint
//                    by depth, with a hard shore; eased when they change
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
// Each class is its group's ink in its second letter's pattern (docs/PLAN.md,
// "Climate zones"): solid f, cross-hatch m, hatch / for w and \ for s, dense
// and sparse stipple for BW and BS, fine hatch for ET, bare paper for EF.
// Patterns and the mosaic are fixed to the globe and scale with the zoom.
// The Tides view is a co-tidal chart: the semidiurnal tide's amplitude as a
// wash (co-range), co-tidal lines every lunar hour (30° of its phase) meeting
// at the amphidromic points, at the slowest dials the line of high water
// sweeping round them, and a stipple where the tide loses its energy.
// The People view (the People experiment, src/engine/people.js) is a chart's
// base with the ice sheets: farms as a parcel hatch (the mosaic's tesserae,
// each farmed with the cell's farmed share and furrowed its own way, in sap),
// people as a graphite stipple whose density is theirs (by log density, from
// ~0.001 to ~1,000 a km²), darker where they use more energy, and in the dark
// theme lit by it (W/m²: the night's lights); the sulfate veil as in the Air map.

import { Refiner } from '../gpu/refine.js';
import { storage } from '../gpu/device.js';

const SHADER = /* wgsl */ `
const PLANKTON_HUE = 0.65;    // how far the depth tint's ink turns toward teal (verdigris) where the sea blooms most
const PLANKTON_WASH = 0.3;    // and a pale, milky turquoise laid over it there (blooms scatter light: so shelves, lightly tinted, show it too)
struct U {
  view0: vec4f, view1: vec4f, view2: vec4f,
  frame: vec4f,      // sx, sy, tNow (rel. to the polarity origin), polarity dT
  frame2: vec4f,     // polarity N, ocean tint floor, ocean tint span, land tint floor
  canvas: vec4f, text: vec4f, accent: vec4f, ocean: vec4f, land: vec4f,
  light: vec4f,      // xyz toward the light (view space); w the land tint span
  mode: vec4f,       // view (0 relief, 1 climate's zones, 2–4 weather's charts, 5 tides, 6 climate's air, 7 people), mosaic frequency, device px per CSS px, globe radius in device px
  // inkA.w: 1 in the dark theme
  inkA: vec4f, inkB: vec4f, inkC: vec4f, inkD: vec4f, inkE: vec4f,
  inkF: vec4f,       // sienna (the temperature chart's warmth)
  inkG: vec4f,       // violet (permafrost's hatch)
  tide: vec4f,       // the tide's clock: Re, Im of e^{iφ₂} + ρ e^{iφs} (spring and neap), cos, sin φ₂
  tide2: vec4f,      // the equilibrium tide's amplitude (m), its square, how much the tide shown is now; w the lakes' ease (0 last, 1 new)
  veil: array<vec4f, 9>,   // the volcanoes' sulfate veil: optical depth in 36 bands of 5°, south first (0 where not drawn)
};
@group(0) @binding(0) var<uniform> u: U;
@group(0) @binding(1) var<storage, read> pol: array<f32>;
@group(0) @binding(2) var<storage, read> cover: array<vec4f>;   // the cover's eight colour weights a vertex
@group(0) @binding(3) var<storage, read> folk: array<vec4f>;    // the people: per km², the farmed share, energy used (W/m²), industry's share

struct VOut {
  @builtin(position) clip: vec4f,
  @location(0) f: vec4f,
  @location(1) nrm: vec3f,
  @location(2) vp: vec3f,
  @location(3) wp: vec3f,
  @location(4) c: vec4f,
  @location(5) z0: vec4f,
  @location(6) z1: vec4f,
  @location(7) z2: vec4f,
  @location(8) z3: vec4f,
  @location(9) iv: vec4f,
  @location(10) wx: vec4f,
  @location(11) td: vec4f,
  @location(12) lw: vec4f,
  @location(13) cv: vec4f,   // the cover's colour (premultiplied) and its weight
  @location(14) pp: vec4f,   // the people (folk)
};

fn toView(p: vec3f) -> vec3f {
  return vec3f(dot(u.view0.xyz, p), dot(u.view1.xyz, p), dot(u.view2.xyz, p));
}

@vertex fn vs(@location(0) p: vec3f, @location(1) fc: vec4f, @location(2) nc: vec3f, @location(3) c: vec4f,
              @location(4) z0: vec4f, @location(5) z1: vec4f, @location(6) z2: vec4f, @location(7) z3: vec4f,
              @location(8) iv: vec4f, @location(9) wx: vec4f, @location(10) fp: vec4f, @location(11) np: vec3f,
              @location(12) td: vec4f, @location(13) lw: vec4f, @builtin(vertex_index) vi: u32) -> VOut {
  // Between plate steps the surface blends from the last step's state to this
  // one's (each step moves the crust less than half a cell), so it moves
  // continuously rather than in ticks.
  let f = mix(fp, fc, u.inkB.w);
  let n = normalize(mix(np, nc, u.inkB.w));
  var o: VOut;
  let v = toView(p);
  o.clip = vec4f(v.x * u.frame.x, v.y * u.frame.y, 0.5 - 0.5 * v.z, 1.0);
  o.f = f;
  o.nrm = toView(n);
  o.vp = v;
  o.wp = p;
  o.c = c;
  o.z0 = z0; o.z1 = z1; o.z2 = z2; o.z3 = z3;
  o.iv = iv;                           // the ice's flow in the globe's frame, as long as its sliding share; its speed
  o.wx = wx;
  o.td = td;
  o.lw = lw;
  // The cover's colour: its classes (src/engine/vegetation.js, COLOURS) in the biomes' colours,
  // rock as the summits' (linear in the weights, so blending here is blending the weights).
  o.pp = folk[vi];
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

// The tessera at p: a uniform value per cell of a jittered lattice (Worley's).
fn tessera(p: vec3f) -> f32 {
  let c = floor(p);
  var best = 1e9;
  var id = 0.0;
  for (var dz = -1; dz <= 1; dz++) {
    for (var dy = -1; dy <= 1; dy++) {
      for (var dx = -1; dx <= 1; dx++) {
        let cell = c + vec3f(f32(dx), f32(dy), f32(dz));
        let h = hash3(cell);
        let d = p - (cell + 0.15 + 0.7 * h);
        let dd = dot(d, d);
        if (dd < best) { best = dd; id = hash3(cell + 17.31).x; }
      }
    }
  }
  return id;
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
  let tf = i.f.y;          // formation time, Myr after the polarity origin
  let phi = i.f.z;         // felsic fraction
  let lake = mix(i.lw.x, i.lw.z, u.tide2.w);   // lake depth, km (signed: dry land below zero)
  let salt = mix(i.lw.y, i.lw.w, u.tide2.w);   // the share of salt flat
  let cold = i.c.x;        // snow on land, ice on the sea (0..1)
  let sst = i.c.y;         // sea-surface temperature, °C
  let psi = i.c.z;         // the gyres' streamfunction, Sv
  let age = u.frame.z - tf;
  let iceH = i.c.w;        // ice sheet thickness, m
  let dark = u.inkA.w > 0.5;

  // The globe's own coordinates for patterns (triplanar), and their change per pixel.
  let wpn = normalize(i.wp);
  var tw = pow(abs(wpn), vec3f(12.0));
  tw = tw / (tw.x + tw.y + tw.z);
  let T = Tri(wpn.yz, wpn.zx, wpn.xy, tw, vec3f(length(fwidth(wpn.yz)), length(fwidth(wpn.zx)), length(fwidth(wpn.xy))));

  // Relief: the surface normal against the sphere's own, so only slope shades.
  let N = normalize(i.nrm);
  let S = normalize(i.vp);
  let L = normalize(u.light.xyz);
  let relief = clamp(1.0 + 1.1 * (dot(N, L) - dot(S, L)), 0.8, 1.12);

  // Derivatives first: WGSL takes them only in uniform control flow.
  let fe = fwidth(e);
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
  let fcold = max(fwidth(cold), 1e-3);
  let fice = max(fwidth(iceH), 1.0);
  let flake = max(fwidth(lake), 1e-4);
  let fsalt = max(fwidth(salt), 1e-3);
  let lat = asin(clamp(wpn.z, -1.0, 1.0));
  let dlat = fwidth(lat);
  let iceSurf = max(e, 0.0) + iceH / 1000.0;
  let fsurf = fwidth(iceSurf);
  let oceanic = 1.0 - smoothstep(0.35, 0.65, phi);
  let climate = u.mode.x > 0.5 && u.mode.x < 1.5;
  let weather = u.mode.x > 1.5 && u.mode.x < 4.5;
  let wxTemp = u.mode.x > 2.5 && u.mode.x < 3.5;
  let wxHum = u.mode.x > 3.5 && u.mode.x < 4.5;
  let tides = u.mode.x > 4.5 && u.mode.x < 5.5;
  let air = u.mode.x > 5.5 && u.mode.x < 6.5;
  let folkV = u.mode.x > 6.5;
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
  sea = mix(sea, u.text.rgb, 0.075 * (0.5 + 0.5 * pbar) * oceanic * (1.0 - cold));
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
  let ice = clamp(0.5 + (cold - 0.5) / fcold, 0.0, 1.0);
  let iceEdge = hair(abs(cold - 0.5), fcold);
  sea = mix(sea, iceInk, ice);
  sea = mix(sea, u.ocean.rgb, 0.55 * iceEdge);

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
  let tess = tessera(i.wp * u.mode.y);
  let pf = i.td.w * select(0.0, 1.0, u.mode.x < 0.5);
  if (pf > 0.002) {
    let frozen = select(0.0, 1.0, tess < pf) * (1.0 - clamp(0.5 + lake / flake, 0.0, 1.0));
    land = mix(land, u.inkG.rgb, 0.07 * frozen);
    land = mix(land, u.inkG.rgb, 0.7 * frozen * hatch(T, vec2f(1.0, 0.0), 4.2 * u.mode.z, 0.8 * u.mode.z));
  }
  // Lakes, in the sea's tint by depth, with a hard shore and its hairline. The
  // depth is smoothed and signed (dry land below zero), so the shore is a curve.
  let lk = clamp(0.5 + lake / flake, 0.0, 1.0) * (1.0 - ice);   // a lake under snow is frozen over
  land = mix(land, mix(u.canvas.rgb, u.ocean.rgb, u.frame2.y + u.frame2.z * sqrt(clamp(lake / 6.0, 0.0, 1.0))), lk);
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
  let zone = mix(zoneColor(cls, T), mix(u.canvas.rgb, u.ocean.rgb, 0.16), lk);
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
  let sheetEdge = hair(abs(iceH - 50.0), fice) * step(0.0, e + iceH / 1000.0);
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

  // The People view: a chart's base with the ice sheets, farms' parcel hatch, people's stipple.
  let pd = log(max(i.pp.x, 1e-9)) / 2.302585;
  let pDots = stipple(T, mix(22.0, 3.0, smoothstep(-3.0, 3.0, pd)) * u.mode.z, 0.8 * u.mode.z) * smoothstep(-3.6, -2.8, pd);
  let furrowA = 3.14159265 * fract(tess * 97.31);
  let furrow = hatch(T, vec2f(cos(furrowA), sin(furrowA)), 3.6 * u.mode.z, 0.75 * u.mode.z);
  let farmed = select(0.0, 1.0, tess < i.pp.y);
  let lit = smoothstep(-2.5, 1.0, log(max(i.pp.z, 1e-9)) / 2.302585);
  let graphite = mix(u.canvas.rgb, u.text.rgb, 0.58);
  let dotInk = select(mix(graphite, u.text.rgb, lit), mix(graphite, mix(u.inkB.rgb, u.text.rgb, 0.5), lit), dark);
  var pland = mix(mix(u.canvas.rgb, u.land.rgb, 0.16) * mix(1.0, relief, 0.5), iceC, sheet);
  pland = mix(pland, u.inkC.rgb, farmed * (0.1 + 0.55 * furrow));
  pland = mix(pland, dotInk, 0.9 * pDots);
  land = select(land, pland, folkV);
  sea = select(sea, mix(mix(u.canvas.rgb, u.ocean.rgb, 0.05), iceC, sheet), folkV);
  let chart = weather || tides || air || folkV;

  var c = select(land * select(shade, 1.0, chart), sea * select(seaShade, 1.0, chart), e < 0.0);

  // The coastline.
  c = mix(c, u.text.rgb, 0.7 * hair(abs(e), fe));
  // The sulfate veil (Air): graphite hatching along the circles of latitude (the veil lies in bands),
  // denser where its optical depth is (16 px apart at 0.02, 4 px at 1, by log optical depth).
  if (air || folkV) {
    let aod = veilAt(wpn.z);
    let va = smoothstep(-1.7, 0.0, log(max(aod, 1e-4)) / 2.302585);
    let vh = hatch1(vec2f(lat, 0.0), dlat, vec2f(1.0, 0.0), octave(mix(16.0, 4.0, va) * u.mode.z), 0.55 * u.mode.z);
    c = mix(c, mix(u.text.rgb, u.canvas.rgb, 0.3), select(0.5, 0.28, folkV) * vh * smoothstep(0.01, 0.04, aod));   // lighter over the people
  }
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
  const climBuf = device.createBuffer({ size: nm * 16, usage: VS });
  const zoneBuf = device.createBuffer({ size: nm * 64, usage: VS });
  const iceBuf = device.createBuffer({ size: nm * 16, usage: VS });
  const wxBuf = device.createBuffer({ size: nm * 16, usage: VS });      // written by the weather's kernels, on the mesh
  // The tide's harmonic and dissipation and the permafrost's share, then the lakes' drawn depth and
  // salt (the last and the new): one buffer, as a pipeline has eight vertex buffers at most.
  const tideBuf = device.createBuffer({ size: nm * 32, usage: VS });
  // The cover's eight colour weights a vertex, read by the vertex shader from storage (a ninth vertex buffer is past the limit).
  const coverBuf = storage(device, nm * 32);
  // The people's four values a vertex (the People experiment), refined from their grid (src/engine/people-worker.js).
  const folkBuf = storage(device, nm * 16);
  let folkS = null, folkRef = null;
  // The fields' sources on the engine's grid: their own buffers when refining, else the vertex buffers.
  const S = (size, own) => refining ? storage(device, size) : own;
  const fieldS = S(n * 32, fieldBuf), normS = S(n * 32, normBuf), climS = S(n * 16, climBuf), zoneS = S(n * 64, zoneBuf), iceS = S(n * 16, iceBuf), tideS = S(n * 32, tideBuf), coverS = S(n * 32, coverBuf);
  const refiner = refining ? new Refiner(device, mesh, coarse) : null;
  const refine = (src, dst, m, enc) => { if (refiner) refiner.run(src, dst, m, enc); };
  const idxBuf = device.createBuffer({ size: mesh.tris.byteLength, usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST });
  device.queue.writeBuffer(idxBuf, 0, mesh.tris);
  const uniBuf = device.createBuffer({ size: 30 * 16, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
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
        { arrayStride: 16, attributes: [{ shaderLocation: 3, offset: 0, format: 'float32x4' }] },
        { arrayStride: 64, attributes: [0, 1, 2, 3].map(k => ({ shaderLocation: 4 + k, offset: 16 * k, format: 'float32x4' })) },
        { arrayStride: 16, attributes: [{ shaderLocation: 8, offset: 0, format: 'float32x4' }] },
        { arrayStride: 16, attributes: [{ shaderLocation: 9, offset: 0, format: 'float32x4' }] },
        { arrayStride: 32, attributes: [{ shaderLocation: 12, offset: 0, format: 'float32x4' }, { shaderLocation: 13, offset: 16, format: 'float32x4' }] },
      ],
    },
    fragment: { module, entryPoint: 'fs', targets: [{ format }] },
    primitive: { topology: 'triangle-list', cullMode: 'none' },
    depthStencil: { format: 'depth24plus', depthWriteEnabled: true, depthCompare: 'less' },
  });
  let bind = null, depth = null, depthW = 0, depthH = 0;
  const uni = new Float32Array(120);
  const field = new Float32Array(8 * n);
  const norm = new Float32Array(8 * n);
  let blend = 1;
  let polN = 0, polDT = 1, polT0 = 0;
  // The lakes ease from the last drawn to the new over LAKE_EASE ms.
  const LAKE_EASE = 400, tideLake = new Float32Array(8 * n);
  let lakeAt = -Infinity;
  const lakeMix = () => { const t = Math.min(1, Math.max(0, (performance.now() - lakeAt) / LAKE_EASE)); return t * t * (3 - 2 * t); };

  function rebind() {
    bind = device.createBindGroup({
      layout: pipeline.getBindGroupLayout(0),
      entries: [{ binding: 0, resource: { buffer: uniBuf } }, { binding: 1, resource: { buffer: polBuf } }, { binding: 2, resource: { buffer: coverBuf } }, { binding: 3, resource: { buffer: folkBuf } }],
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

    /** Per cell: elevation above sea level (km), formation time (Myr), felsic fraction, lake depth (km), normal. */
    // `fromStep`: the old current becomes the previous state to blend from;
    // otherwise both are the new state.
    // `mode`: 'step', the current becomes the previous to blend from; 'reset', both are the
    // new state; 'refresh', the current changes and the previous stays (the blend carries on).
    setFields(elevRel, tform, felsic, lake, normals, mode = 'reset') {
      const fromStep = mode === 'step', both = mode === 'reset';
      for (let i = 0; i < n; i++) {
        const o = 8 * i;
        if (fromStep) { field[o + 4] = field[o]; field[o + 5] = field[o + 1]; field[o + 6] = field[o + 2]; field[o + 7] = field[o + 3]; }
        field[o] = elevRel[i];
        field[o + 1] = tform[i] - polT0;
        field[o + 2] = felsic[i];
        field[o + 3] = lake ? lake[i] : 0;
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

    /** Per cell of the engine's grid: snow or sea ice (0..1), sea-surface temperature, the gyres' streamfunction (Sv), ice thickness (m); the season writes it, then `refineClimate`. */
    climBuffer: climS,
    refineClimate() { refine(climS, climBuf, 1); },
    /** Per cell: the zones' probabilities, 16 floats (14 used). */
    setZones(z) { device.queue.writeBuffer(zoneS, 0, z); refine(zoneS, zoneBuf, 4); },
    /** Per cell: the tide's harmonic per unit equilibrium tide (C, S) and dissipation per unit² (W/m²). */
    setTides(C, S, diss) {
      const a = tideLake;
      for (let i = 0; i < n; i++) { a[8 * i] = C[i]; a[8 * i + 1] = S[i]; a[8 * i + 2] = diss[i]; }
      device.queue.writeBuffer(tideS, 0, a); refine(tideS, tideBuf, 2);
    },
    /** Per cell: the permafrost's share (0..1; src/engine/soil.js), as the worker draws it (`drawnPermafrost`). */
    setPermafrost(p) {
      const a = tideLake;
      for (let i = 0; i < n; i++) a[8 * i + 3] = p[i];
      device.queue.writeBuffer(tideS, 0, a); refine(tideS, tideBuf, 2);
    },
    /**
     * Per cell: the lakes' drawn depth (km, signed: dry land below zero) and salt flats' share
     * (src/render/surface.js, lakeFields), eased from what is drawn now.
     */
    setLakes(draw, salt) {
      const f = lakeMix(), first = lakeAt === -Infinity, a = tideLake;
      for (let i = 0; i < n; i++) {
        const o = 8 * i + 4;
        a[o] = first ? draw[i] : a[o] + (a[o + 2] - a[o]) * f;
        a[o + 1] = first ? salt[i] : a[o + 1] + (a[o + 3] - a[o + 1]) * f;
        a[o + 2] = draw[i]; a[o + 3] = salt[i];
      }
      lakeAt = performance.now();
      device.queue.writeBuffer(tideS, 0, a); refine(tideS, tideBuf, 2);
    },
    get lakesEasing() { return performance.now() - lakeAt < LAKE_EASE; },
    /** Per cell: the plants' cover as eight colour weights (src/engine/vegetation.js, COLOURS; zero off its land). */
    setCover(w) { device.queue.writeBuffer(coverS, 0, w); refine(coverS, coverBuf, 2); },
    /** Per cell of the people's grid `pg`: people per km², the farmed share, energy used (W/m²), industry's share. */
    setPeople(d, pg) {
      if (pg === mesh) { device.queue.writeBuffer(folkBuf, 0, d); return; }
      if (!folkS) { folkS = storage(device, pg.n * 16); folkRef = refiner && refiner.coarse === pg ? refiner : new Refiner(device, mesh, pg); }
      device.queue.writeBuffer(folkS, 0, d); folkRef.run(folkS, folkBuf, 1);
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
      uni.set([mode.view === 'climate' ? (mode.cl === 'air' ? 6 : 1) : mode.view === 'weather' ? wxm : mode.view === 'tides' ? 5 : mode.view === 'people' ? 7 : 0, freq, dprNow, rPx], 44);
      put(48, palette.inks.viridian); put(52, palette.inks.ochre); put(56, palette.inks.sap); put(60, palette.inks.verdigris); put(64, palette.inks.indigo);
      uni[51] = palette.dark ? 1 : 0;
      put(68, palette.inks.sienna); put(72, palette.inks.violet);
      uni[55] = mode.blend ?? 1;
      const td = mode.tides || { m: [1, 0], hw: [1, 0], amp: 0, now: 0 };
      uni.set([td.m[0], td.m[1], td.hw[0], td.hw[1], td.amp, td.amp * td.amp, td.now, lakeMix()], 76);
      if (mode.veil) uni.set(mode.veil, 84); else uni.fill(0, 84, 120);
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
