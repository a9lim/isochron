// WebGPU in node (Dawn's bindings: `npm ci` in tests/), so the GPU paths run headless. Importing this
// sets navigator.gpu when the package loads and an adapter answers; `skip` is false then, else the reason.
let reason = false;
try {
  const w = await import('webgpu');
  Object.assign(globalThis, w.globals);
  const gpu = w.create([]);
  if (!(await gpu.requestAdapter())) reason = 'no WebGPU adapter';
  else if (globalThis.navigator) Object.defineProperty(globalThis.navigator, 'gpu', { value: gpu, configurable: true });
  else globalThis.navigator = { gpu };
} catch { reason = 'no WebGPU in node (npm ci in tests/)'; }
export const skip = reason;
export const hasGPU = !reason;
