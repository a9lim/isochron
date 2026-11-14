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
//   red              crust younger than 1 Myr: the ridge axes, where the
//                    mantle reaches the surface
//   hairlines        the coastline, and every kilometre of depth and height

const SHADER = /* wgsl */ `
struct U {
  view0: vec4f, view1: vec4f, view2: vec4f,
  frame: vec4f,      // sx, sy, tNow (rel. to the polarity origin), polarity dT
  frame2: vec4f,     // polarity N, ocean tint floor, ocean tint span, land tint floor
  canvas: vec4f, text: vec4f, accent: vec4f, ocean: vec4f, land: vec4f,
  light: vec4f,      // xyz toward the light (view space); w the land tint span
};
@group(0) @binding(0) var<uniform> u: U;
@group(0) @binding(1) var<storage, read> pol: array<f32>;

struct VOut {
  @builtin(position) clip: vec4f,
  @location(0) f: vec4f,
  @location(1) nrm: vec3f,
  @location(2) vp: vec3f,
};

fn toView(p: vec3f) -> vec3f {
  return vec3f(dot(u.view0.xyz, p), dot(u.view1.xyz, p), dot(u.view2.xyz, p));
}

@vertex fn vs(@location(0) p: vec3f, @location(1) f: vec4f, @location(2) n: vec3f) -> VOut {
  var o: VOut;
  let v = toView(p);
  o.clip = vec4f(v.x * u.frame.x, v.y * u.frame.y, 0.5 - 0.5 * v.z, 1.0);
  o.f = f;
  o.nrm = toView(n);
  o.vp = v;
  return o;
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
  let age = u.frame.z - tf;

  // Relief: the surface normal against the sphere's own, so only slope shades.
  let N = normalize(i.nrm);
  let S = normalize(i.vp);
  let L = normalize(u.light.xyz);
  let relief = clamp(1.0 + 1.1 * (dot(N, L) - dot(S, L)), 0.8, 1.12);

  // Derivatives first: WGSL takes them only in uniform control flow.
  let fe = fwidth(e);
  let ftf = fwidth(tf);
  let fa = max(fwidth(age), 0.05);
  let oceanic = 1.0 - smoothstep(0.35, 0.65, phi);

  // Sea: depth tint, stripes on oceanic crust, isobaths every kilometre.
  let d = -e;
  var sea = mix(u.canvas.rgb, u.ocean.rgb, u.frame2.y + u.frame2.z * smoothstep(0.0, 6.0, d));
  let w = max(1.5 * ftf, u.frame.w);
  let pbar = (polC(tf + w) - polC(tf - w)) / (2.0 * w);
  sea = mix(sea, u.text.rgb, 0.075 * (0.5 + 0.5 * pbar) * oceanic);
  sea = mix(sea, u.text.rgb, 0.09 * hair(abs(d - round(d)), fe) * step(0.5, d));

  // Land: height tint, contours every kilometre.
  var land = mix(u.canvas.rgb, u.land.rgb, u.frame2.w + u.light.w * smoothstep(0.0, 5.0, e));
  land = mix(land, u.text.rgb, 0.07 * hair(abs(e - round(e)), fe) * step(0.5, e));

  var c = select(land, sea, e < 0.0) * relief;

  // The ridge axes: crust younger than 1 Myr.
  let young = (1.0 - smoothstep(0.6, 0.6 + max(0.6, 1.5 * fa), age)) * oceanic;
  c = mix(c, u.accent.rgb, 0.85 * young);

  // The coastline.
  c = mix(c, u.text.rgb, 0.7 * hair(abs(e), fe));
  return vec4f(c, 1.0);
}
`;

function hexToRgb(hex) {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0, 2), 16) / 255, parseInt(h.slice(2, 4), 16) / 255, parseInt(h.slice(4, 6), 16) / 255];
}

export async function createGlobe(canvas, grid) {
  if (!navigator.gpu) throw new Error('no WebGPU');
  const adapter = await navigator.gpu.requestAdapter();
  if (!adapter) throw new Error('no WebGPU adapter');
  const device = await adapter.requestDevice();
  const context = canvas.getContext('webgpu');
  const format = navigator.gpu.getPreferredCanvasFormat();
  context.configure({ device, format, alphaMode: 'opaque' });
  let lost = false;
  device.lost.then(() => { lost = true; });

  const n = grid.n;
  const posBuf = device.createBuffer({ size: n * 12, usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST });
  device.queue.writeBuffer(posBuf, 0, Float32Array.from(grid.pos));
  const fieldBuf = device.createBuffer({ size: n * 16, usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST });
  const normBuf = device.createBuffer({ size: n * 12, usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST });
  const idxBuf = device.createBuffer({ size: grid.tris.byteLength, usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST });
  device.queue.writeBuffer(idxBuf, 0, grid.tris);
  const uniBuf = device.createBuffer({ size: 11 * 16, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
  let polBuf = null, polCap = 0;

  const module = device.createShaderModule({ code: SHADER });
  const pipeline = device.createRenderPipeline({
    layout: 'auto',
    vertex: {
      module, entryPoint: 'vs',
      buffers: [
        { arrayStride: 12, attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x3' }] },
        { arrayStride: 16, attributes: [{ shaderLocation: 1, offset: 0, format: 'float32x4' }] },
        { arrayStride: 12, attributes: [{ shaderLocation: 2, offset: 0, format: 'float32x3' }] },
      ],
    },
    fragment: { module, entryPoint: 'fs', targets: [{ format }] },
    primitive: { topology: 'triangle-list', cullMode: 'none' },
    depthStencil: { format: 'depth24plus', depthWriteEnabled: true, depthCompare: 'less' },
  });
  let bind = null, depth = null, depthW = 0, depthH = 0;
  const uni = new Float32Array(44);
  const field = new Float32Array(4 * n);
  const norm = new Float32Array(3 * n);
  let polN = 0, polDT = 1, polT0 = 0;

  function rebind() {
    bind = device.createBindGroup({
      layout: pipeline.getBindGroupLayout(0),
      entries: [{ binding: 0, resource: { buffer: uniBuf } }, { binding: 1, resource: { buffer: polBuf } }],
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

    /** Per cell: elevation above sea level (km), formation time (Myr), felsic fraction, normal. */
    setFields(elevRel, tform, felsic, normals) {
      for (let i = 0; i < n; i++) {
        field[4 * i] = elevRel[i];
        field[4 * i + 1] = tform[i] - polT0;
        field[4 * i + 2] = felsic[i];
        field[4 * i + 3] = 0;
      }
      norm.set(normals);
      device.queue.writeBuffer(fieldBuf, 0, field);
      device.queue.writeBuffer(normBuf, 0, norm);
    },

    draw(camera, tNow, palette) {
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
      pass.setIndexBuffer(idxBuf, 'uint32');
      pass.drawIndexed(grid.tris.length);
      pass.end();
      device.queue.submit([enc.finish()]);
    },
  };
}
