// The one WebGPU device the page shares: the globe draws with it and the
// weather (src/gpu/weather.js) computes on it, so the weather's fields reach
// the globe without leaving the GPU.

let pending = null;

/** The shared device (requested once), with timestamp queries where the adapter has them. */
export function gpuDevice() {
  return pending || (pending = (async () => {
    if (!navigator.gpu) throw new Error('no WebGPU');
    const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
    if (!adapter) throw new Error('no WebGPU adapter');
    const requiredFeatures = ['timestamp-query'].filter(f => adapter.features.has(f));
    return adapter.requestDevice({ requiredFeatures });
  })());
}

/**
 * A compute kernel from WGSL source. Bind groups are made by the bindings'
 * names in the source, so each kernel declares only what its entry uses (the
 * 'auto' layout drops anything else).
 */
export function kernel(device, code, label = 'kernel') {
  const module = device.createShaderModule({ code, label });
  const pipeline = device.createComputePipeline({ layout: 'auto', compute: { module, entryPoint: 'main' }, label });
  const slots = {};
  for (const m of code.matchAll(/@binding\((\d+)\)\s*var(?:<[^>]*>)?\s+(\w+)/g)) slots[m[2]] = +m[1];
  return {
    pipeline,
    bind(res) {
      return device.createBindGroup({
        layout: pipeline.getBindGroupLayout(0),
        entries: Object.entries(res).map(([name, r]) => {
          if (!(name in slots)) throw new Error(`${label}: no binding ${name}`);
          return { binding: slots[name], resource: r.buffer ? r : { buffer: r } };
        }),
        label,
      });
    },
  };
}

/** A storage buffer, optionally filled. */
export function storage(device, size, data = null, extra = 0) {
  const buf = device.createBuffer({ size: Math.max(16, Math.ceil(size / 16) * 16), usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC | extra });
  if (data) device.queue.writeBuffer(buf, 0, data);
  return buf;
}

/** A uniform buffer holding `data` (an ArrayBuffer view). */
export function uniform(device, data) {
  const buf = device.createBuffer({ size: Math.max(16, Math.ceil(data.byteLength / 16) * 16), usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
  device.queue.writeBuffer(buf, 0, data);
  return buf;
}
