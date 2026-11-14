// WebGPU in node (Dawn's bindings, `npm install` in tests/), so the GPU paths
// run headless: importing this sets navigator.gpu. `hasGPU` says whether it worked.
let ok = false;
try {
  const w = await import('webgpu');
  Object.assign(globalThis, w.globals);
  const gpu = w.create([]);
  if (globalThis.navigator) Object.defineProperty(globalThis.navigator, 'gpu', { value: gpu, configurable: true });
  else globalThis.navigator = { gpu };
  ok = true;
} catch { /* no bindings: the GPU tests skip */ }
export const hasGPU = ok;
