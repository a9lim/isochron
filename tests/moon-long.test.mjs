// The tide and the Moon over 50 Myr of the engine's worker at level 6, driven as the
// page drives it at 1 Myr/s: plate steps of 0.1 Myr, the tide re-solved on the GPU as the
// worker decides (every ~2 Myr, or when the day has drifted). Before the Coriolis was
// made energy-neutral, a deep cell beside a shelf grew without bound within 10–50 Myr
// (1,500 TW, the spin through zero). Driven in model time: a tick waits for its step's
// surface (the worker's pump then ends, deciding on a re-solve, before the next macrotask)
// and for any solve in flight, so at most one step runs beside a solve, as on the page.
import test from 'node:test';
import assert from 'node:assert/strict';
import { hasGPU } from './webgpu-node.mjs';

const skip = hasGPU ? false : 'no WebGPU in node (npm install in tests/)';

test('the tide over 50 Myr: a few TW, and the spin slowing steadily', { skip, timeout: 600000 }, async () => {
  // The worker's channels, closed at the end so the process can exit.
  const ports = [], MC = globalThis.MessageChannel;
  globalThis.MessageChannel = class extends MC { constructor() { super(); ports.push(this.port1, this.port2); } };
  const { Moon } = await import('../src/engine/tides.js');
  const { GpuTides } = await import('../src/gpu/tides.js');
  const steps = [], solves = [];
  let inflight = null;
  const step0 = Moon.prototype.step, solve0 = GpuTides.prototype.solve;
  Moon.prototype.step = function (dt) { step0.call(this, dt); steps.push({ Omega: this.Omega, n: this.omega / -2 + this.Omega, a: this.a, P: this.P, solved: this.Punit > 0 }); };
  GpuTides.prototype.solve = function (...args) { const p = solve0.apply(this, args); inflight = p.then(r => { solves.push(r.P); }, () => {}); return p; };
  let surfaced = 0;
  globalThis.self = { postMessage(m) { if (m.type === 'surface' && m.stepsDone != null) surfaced = m.stepsDone; } };
  try {
    await import('../src/engine/worker.js');
    self.onmessage({ data: { type: 'init', seed: 'earthlike', level: 6 } });
    self.onmessage({ data: { type: 'play', playing: true } });
    const settle = () => new Promise(r => setTimeout(r, 1));
    while (!solves.length) await settle();          // the GPU attached and the first (cold) solve done
    const N = 500, dt = 1e5;
    for (let k = 0; k < N; k++) {
      const want = surfaced + 1;
      self.onmessage({ data: { type: 'tick', adv: dt, steps: [dt], window: 2e6, rate: 1e6 } });
      while (surfaced < want) await settle();
      await settle();
      if (inflight) { await inflight; inflight = null; }
    }
    self.onmessage({ data: { type: 'play', playing: false } });
    const live = steps.filter(s => s.solved), first = live[0], last = live.at(-1);
    let pMin = Infinity, pMax = 0, rises = 0;
    for (let k = 0; k < live.length; k++) {
      pMin = Math.min(pMin, live[k].P); pMax = Math.max(pMax, live[k].P);
      if (k && !(live[k].Omega < live[k - 1].Omega)) rises++;
    }
    const years = (live.length - 1) * dt, cmYr = (last.a - first.a) / years * 100;
    const msCentury = (2 * Math.PI / last.Omega - 2 * Math.PI / first.Omega) * 1000 / (years / 100);
    const msg = `${(years / 1e6).toFixed(1)} Myr, ${solves.length} solves: ${(pMin / 1e12).toFixed(2)}–${(pMax / 1e12).toFixed(2)} TW, Moon +${cmYr.toFixed(2)} cm/yr, day +${msCentury.toFixed(2)} ms a century`;
    console.log(`  ${msg}`);
    assert.ok(years >= 4.9e7, msg);
    assert.ok(solves.every(P => Number.isFinite(P) && P > 0), `every solve finite: ${solves.map(P => P.toExponential(2))}`);
    assert.ok(pMin > 1e12 && pMax < 1.5e13, `dissipation in a few TW (${msg})`);
    assert.equal(rises, 0, 'the spin only slows');
    assert.ok(last.Omega > last.n, 'the spin stays above the Moon’s');
    assert.ok(cmYr > 2 && cmYr < 10, `the Moon recedes as a few TW recede it (${msg})`);
    assert.ok(msCentury > 1 && msCentury < 6, `the day lengthens slowly (${msg})`);
  } finally {
    Moon.prototype.step = step0; GpuTides.prototype.solve = solve0;
    for (const p of ports) p.close();
    globalThis.MessageChannel = MC;
  }
});
