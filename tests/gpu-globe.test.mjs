// The globe's shader compiles and its pipeline validates on Dawn (WGSL otherwise compiles only in
// the browser): the vertex stage's storage read of the cover, the inter-stage limit, the layout.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { hasGPU } from './webgpu-node.mjs';

const src = readFileSync(new URL('../src/render/globe.js', import.meta.url), 'utf8');
const SHADER = src.slice(src.indexOf('const SHADER = /* wgsl */ `') + 27, src.indexOf('`;\n', src.indexOf('const SHADER')));

test('globe: the shader compiles and the pipeline validates', { skip: !hasGPU && 'no WebGPU in node' }, async () => {
  const adapter = await navigator.gpu.requestAdapter();
  const device = await adapter.requestDevice();
  const errors = [];
  device.pushErrorScope('validation');
  const module = device.createShaderModule({ code: SHADER });
  const info = await module.getCompilationInfo();
  for (const m of info.messages) if (m.type === 'error') errors.push(`${m.lineNum}:${m.linePos} ${m.message}`);
  assert.deepEqual(errors, [], 'compiles');
  // The globe's vertex layout (src/render/globe.js, createGlobe).
  device.createRenderPipeline({
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
    fragment: { module, entryPoint: 'fs', targets: [{ format: 'bgra8unorm' }] },
    primitive: { topology: 'triangle-list', cullMode: 'none' },
    depthStencil: { format: 'depth24plus', depthWriteEnabled: true, depthCompare: 'less' },
  });
  const err = await device.popErrorScope();
  assert.equal(err, null, err ? err.message : '');
  device.destroy();
});
