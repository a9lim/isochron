// Tune the people's constants toward the sketch's targets (docs/MODEL.md, "An alternate Earth on this climate"): a
// parallel pattern search, as tools/earth/tune.mjs's. Each candidate runs the same seeded draws of
// earth-score.mjs (`--one`, draws 0…N−1, so candidates are compared on the same seeds) and is scored by its
// medians against the sketch's ranges: nothing inside a range, |ln(value / the nearer end)| outside it, each
// target weighted (shares by their sum). Each round tries every parameter a step up and down, takes the best,
// then every improving move together; with none, the steps halve.
// Caution (round 2): a draw's history is chaotic in every constant that acts before industry, so the same seeds pair
// candidates only until their histories part, and six draws' objective carries noise ~0.5; a round's best of
// many candidates is chosen partly on it. Use more draws, fewer candidates, and check a move on new seeds
// (earth-score.mjs's first draw) before taking it.
// usage: node tools/people/tune.mjs spec.json [rounds] [draws]
//   spec.json: { "params": [{ "key": "K_COLL", "lo": 10, "hi": 200, "x": 40, "step": 20, "log": true }, …], "fixed": { … } }
//   ("log": steps multiply by e^{step} rather than add). env: JOBS (parallel draws, cores − 2)
import { readFileSync, writeFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { cpus } from 'node:os';

const [specPath, roundsArg = '6', drawsArg = '8'] = process.argv.slice(2);
const spec = JSON.parse(readFileSync(specPath, 'utf8'));
const P = spec.params, ROUNDS = +roundsArg, DRAWS = +drawsArg, JOBS = +(process.env.JOBS || Math.max(1, cpus().length - 2));
const one = fileURLToPath(new URL('./earth-score.mjs', import.meta.url));

// The sketch's targets: [name, read(medians), lo, hi, weight]. Medians are over the draws that reached the mark.
const md = a => { const b = a.filter(v => v != null && Number.isFinite(v)).sort((p, q) => p - q); return b.length ? b[b.length >> 1] : NaN; };
const TARGETS = [
  ['Sahul (kyr)', r => md(r.map(x => x.agr && x.agr.sahul)), 50, 65, 0.5],
  ['Europe (kyr)', r => md(r.map(x => x.agr && x.agr.europe)), 40, 50, 0.5],
  ['the Americas (kyr)', r => md(r.map(x => x.agr && x.agr.americas)), 12, 20, 0.5],
  ['the first fields (kyr)', r => md(r.map(x => x.agr && x.agr.fields)), 10, 12, 0.5],
  ['the first state (kyr)', r => md(r.map(x => x.agr && x.agr.state)), 5, 6, 0.5],
  ['people at 10,000 BCE', r => md(r.map(x => x.agr && x.agr.pop[0])), 3e6, 15e6, 0.5],
  ['people at 1 CE', r => md(r.map(x => x.agr && x.agr.pop[1])), 170e6, 300e6, 1],
  ['people in 1500', r => md(r.map(x => x.agr && x.agr.pop[2])), 425e6, 600e6, 1],
  ...[['Asia', 0.30, 0.45], ['India', 0.03, 0.08], ['China', 0.05, 0.12], ['Africa', 0.20, 0.30], ['Americas', 0.08, 0.15], ['Europe', 0.04, 0.08], ['Oceania', 0.01, 0.04]]
    .map(([k, lo, hi]) => [`${k} at industry`, r => md(r.map(x => x.sharesI && x.sharesI[k])), lo, hi, 1]),
  ['the Americas\' fall', r => md(r.map(x => x.falls && x.falls.americas)), 0.5, 0.9, 1],
  ['Europe\'s plague', r => md(r.map(x => x.falls && x.falls.europe)), 0.15, 0.5, 0.5],
  ['under unlike rulers 1913', r => md(r.map(x => x.emp && x.emp[1] && x.emp[1][4])), 0.20, 0.35, 1],
  ...[[0, 1.27], [1, 1.79], [2, 2.52], [4, 6.07]].map(([i, h]) => [`people in ${[1870, 1913, 1950, 1973, 2000][i]}`, r => md(r.map(x => x.emp && x.emp[i] && x.emp[i][0])), 0.8 * h * 1e9, 1.2 * h * 1e9, 1]),
  ...[['Asia', 0.30, 0.45], ['Africa', 0.20, 0.30], ['Americas', 0.12, 0.20], ['Europe', 0.04, 0.08], ['Oceania', 0.01, 0.04]]
    .map(([k, lo, hi]) => [`${k} at early takeoff`, r => md(r.map(x => x.sharesP && x.sharesP[k])), lo, hi, 0.5]),
  ['the dial by the 6 billion', r => 1999 + md(r.map(x => x.dial && x.dial.six)), 2027, 2028.5, 1],
  ['industry in Australia', r => r.filter(x => x.ind && /^-(1\d|2\d|3\d)°, 1[1-5]\d°/.test(x.ind)).length / r.length + 0.01, 0.01, 0.13, 0.5],
];
const pen = (v, lo, hi) => (!Number.isFinite(v) || v <= 0 ? 3 : v < lo ? Math.log(lo / v) : v > hi ? Math.log(v / hi) : 0);
const objective = runs => TARGETS.reduce((s, [, f, lo, hi, w]) => s + w * Math.min(3, pen(f(runs), lo, hi)), 0);

function overrides(x) { const o = { ...(spec.fixed || {}) }; P.forEach((p, k) => { o[p.key] = x[k]; }); return o; }
// Every candidate's draws through one pool of JOBS processes.
let queue = [], active = 0;
const drain = () => { while (active < JOBS && queue.length) { const j = queue.shift(); active++; j(); } };
const draw = (ov, k) => new Promise(ok => {
  queue.push(() => {
    const p = spawn(process.execPath, [one, '--one', JSON.stringify(ov), String(k)], { env: process.env });
    let out = '';
    p.stdout.on('data', d => (out += d));
    p.on('close', () => { active--; drain(); try { ok(JSON.parse(out)); } catch { ok(null); } });
  });
  drain();
});
async function run(x) {
  const runs = (await Promise.all(Array.from({ length: DRAWS }, (_, k) => draw(overrides(x), k)))).filter(Boolean);
  return { x, runs, f: runs.length ? objective(runs) : Infinity };
}
const clamp = (v, p) => Math.min(p.hi, Math.max(p.lo, v));
const fmt = x => P.map((p, k) => `${p.key} ${+x[k].toPrecision(4)}`).join(', ');
const show = r => TARGETS.map(([n, f, lo, hi]) => { const v = f(r.runs), e = pen(v, lo, hi); return e > 0.01 ? `${n} ${v >= 1e6 ? (v / 1e6).toPrecision(3) + 'M' : v < 1 ? (100 * v).toFixed(0) + '%' : v.toPrecision(4)}` : null; }).filter(Boolean).join(' · ');

let best = await run(P.map(p => p.x));
const step = P.map(p => p.step);
console.log(`start  f ${best.f.toFixed(3)} · off: ${show(best)}\n       ${fmt(best.x)}`);
for (let r = 1; r <= ROUNDS; r++) {
  const cands = [];
  P.forEach((p, k) => { for (const s of [1, -1]) { const x = best.x.slice(); x[k] = clamp(p.log ? x[k] * Math.exp(s * step[k]) : x[k] + s * step[k], p); if (x[k] !== best.x[k]) cands.push({ x, k }); } });
  const res = await Promise.all(cands.map(c => run(c.x)));
  const better = res.map((q, i) => ({ ...q, k: cands[i].k })).filter(q => q.f < best.f).sort((a, b) => a.f - b.f);
  if (!better.length) { for (let k = 0; k < P.length; k++) step[k] /= 2; console.log(`round ${r}: no move; steps halved`); continue; }
  let top = better[0];
  const per = new Map();
  for (const b of better) if (!per.has(b.k)) per.set(b.k, b);
  if (per.size > 1) { const x = best.x.slice(); for (const [k, b] of per) x[k] = b.x[k]; const comb = await run(x); if (comb.f < top.f) top = comb; }
  best = top;
  console.log(`round ${r}: f ${best.f.toFixed(3)} · off: ${show(best)}\n       ${fmt(best.x)}`);
  writeFileSync(specPath.replace(/\.json$/, '.best.json'), JSON.stringify(overrides(best.x), null, 1));
}
console.log('best overrides:', JSON.stringify(overrides(best.x)));
