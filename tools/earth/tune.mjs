// Tune constants against today's Earth (tools/earth/climate-score.mjs, JSON=1): a parallel pattern
// search. Each round tries every parameter a step up and a step down (all at once, in parallel
// processes), takes the best, then tries every improving move together; with none, the steps halve.
// usage: node tools/earth/tune.mjs spec.json [rounds] [objective]
//   spec.json: { "params": [{ "key": "CLIMATE.A", "lo": 200, "hi": 210, "x": 205.5, "step": 1 }, …],
//                "fixed": { "CLIMATE": {…}, "VEG": {…}, "SEAHEAT": {…}, "AIRHEAT": {…}, "CLOUDS": {…}, "SOIL": {…} } }
//   objective: temp (default: land temperature, the sea's surface and ice, the Köppen groups), all (with rain),
//   rad (temp with the Köppen classes and the top of the atmosphere against CERES: reflected and outgoing by cell and zone, clear and all-sky, and the clouds' forcing),
//   or reg (rad with land's rain and the rain of the regions in REG_RAIN)
import { readFileSync, writeFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { cpus } from 'node:os';

const [specPath, roundsArg = '12', objName = 'temp'] = process.argv.slice(2);
const spec = JSON.parse(readFileSync(specPath, 'utf8'));
const P = spec.params, ROUNDS = +roundsArg, JOBS = Math.max(1, Math.min(16, cpus().length - 2));
const score = fileURLToPath(new URL('./climate-score.mjs', import.meta.url));

// The regions whose rain `reg` weighs (climate-score.mjs's REGIONS), with their weights.
const REG_RAIN = [['E N America', 1], ['E China', 1], ['India', 1], ['E Africa', 1], ['Amazon', 0.5], ['Congo', 0.5]];
const regRain = j => REG_RAIN.reduce((s, [k, w]) => s + w * Math.log(Math.max(1e-3, j.regions[k].rain)) ** 2, 0);
const OBJ = {
  temp: j => j.rmsY + 0.5 * (j.rmsJ + j.rmsL) + j.sea + 0.5 * j.seas + 20 * j.ice + 10 * (1 - j.group),
  all: j => j.rmsY + 0.5 * (j.rmsJ + j.rmsL) + j.sea + 0.5 * j.seas + 20 * j.ice + 10 * (1 - j.group) + 6 * j.rain + 10 * (1 - j.koppen),
  // 10 W/m² rms by cell, or 5 by zone, weighs about as a kelvin of land's year.
  rad: j => j.rmsY + 0.5 * (j.rmsJ + j.rmsL) + j.sea + 0.5 * j.seas + 20 * j.ice + 10 * (1 - j.group) + 10 * (1 - j.koppen)
    + (j.toa.sw + j.toa.lw + j.toa.cs + j.toa.cl) / 10 + (j.toa.zsw + j.toa.zlw + j.toa.zswc + j.toa.zlwc) / 5,
  // rad with land's rain (as `all` weighs it) and the rain of the regions in REG_RAIN, each's log
  // ratio squared (4 × a ratio of e weighs as 4 K of land's year).
  reg: j => OBJ.rad(j) + 6 * j.rain + 4 * regRain(j),
};
const objective = OBJ[objName];

function overrides(x) {
  const o = { CLIMATE: { ...(spec.fixed?.CLIMATE || {}) }, VEG: { ...(spec.fixed?.VEG || {}) }, SEAHEAT: { ...(spec.fixed?.SEAHEAT || {}) }, AIRHEAT: { ...(spec.fixed?.AIRHEAT || {}) }, CLOUDS: { ...(spec.fixed?.CLOUDS || {}) }, SOIL: { ...(spec.fixed?.SOIL || {}) } };
  P.forEach((p, k) => { const [ns, key] = p.key.split('.'); o[ns][key] = x[k]; });
  return o;
}
function run(x) {
  const o = overrides(x);
  return new Promise(resolve => {
    const ch = spawn(process.execPath, [score, JSON.stringify(o.CLIMATE)], { env: { ...process.env, JSON: '1', VEGO: JSON.stringify(o.VEG), SEAO: JSON.stringify(o.SEAHEAT), AIRO: JSON.stringify(o.AIRHEAT), CLOUDO: JSON.stringify(o.CLOUDS), SOILO: JSON.stringify(o.SOIL) } });
    let out = '';
    ch.stdout.on('data', d => { out += d; });
    ch.on('close', () => {
      try { const j = JSON.parse(out.trim().split('\n').pop()); resolve({ x, j, f: Number.isFinite(j.rmsY) ? objective(j) : Infinity }); }
      catch { resolve({ x, j: null, f: Infinity }); }
    });
  });
}
async function pool(xs) {
  const out = new Array(xs.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(JOBS, xs.length) }, async () => { while (next < xs.length) { const k = next++; out[k] = await run(xs[k]); } }));
  return out;
}
const clamp = (v, p) => Math.min(p.hi, Math.max(p.lo, v));
const rad = j => (j.toa ? ` · TOA ${j.toa.sw.toFixed(1)}/${j.toa.lw.toFixed(1)} (cre ${j.toa.cs.toFixed(1)}/${j.toa.cl.toFixed(1)}, zones ${j.toa.zsw.toFixed(1)}/${j.toa.zlw.toFixed(1)}/${j.toa.zswc.toFixed(1)}/${j.toa.zlwc.toFixed(1)})` : '');
const regs = j => (objName === 'reg' ? ` · rain ${REG_RAIN.map(([k]) => `${k.replace(/ /g, '')} ${j.regions[k].rain.toFixed(2)}`).join(' ')}` : '');
const show = r => `f ${r.f.toFixed(3)} · T rms ${r.j.rmsY.toFixed(2)}/${r.j.rmsJ.toFixed(2)}/${r.j.rmsL.toFixed(2)} bias ${r.j.bias.toFixed(2)} · sea ${r.j.sea.toFixed(2)} (seas ${r.j.seas.toFixed(2)}) · ice ${r.j.ice.toFixed(3)} · rain ${r.j.rain.toFixed(2)} · Köppen ${(100 * r.j.koppen).toFixed(0)}/${(100 * r.j.group).toFixed(0)}% · ${r.j.meanT.toFixed(1)} °C${rad(r.j)}${regs(r.j)}`;
const fmt = x => P.map((p, k) => `${p.key.split('.')[1]} ${+x[k].toPrecision(4)}`).join(', ');

let best = (await pool([P.map(p => p.x)]))[0];
const step = P.map(p => p.step);
console.log(`start  ${show(best)}\n       ${fmt(best.x)}`);
for (let r = 1; r <= ROUNDS; r++) {
  const cands = [];
  P.forEach((p, k) => { for (const s of [1, -1]) { const x = best.x.slice(); x[k] = clamp(x[k] + s * step[k], p); if (x[k] !== best.x[k]) cands.push({ x, k, s }); } });
  const res = await pool(cands.map(c => c.x));
  const better = res.map((r, i) => ({ ...r, ...cands[i] })).filter(r => r.f < best.f);
  if (!better.length) {
    for (let k = 0; k < P.length; k++) step[k] /= 2;
    console.log(`round ${r}: no move; steps halved`);
    continue;
  }
  better.sort((a, b) => a.f - b.f);
  let top = better[0];
  // Every improving coordinate's move together (the best per coordinate).
  const per = new Map();
  for (const b of better) if (!per.has(b.k)) per.set(b.k, b);
  if (per.size > 1) {
    const x = best.x.slice();
    for (const [k, b] of per) x[k] = b.x[k];
    const [comb] = await pool([x]);
    if (comb.f < top.f) top = comb;
  }
  best = top;
  console.log(`round ${r}: ${show(best)}\n       ${fmt(best.x)}`);
  writeFileSync(specPath.replace(/\.json$/, '.best.json'), JSON.stringify(overrides(best.x), null, 1));
}
console.log('best overrides:', JSON.stringify(overrides(best.x)));
console.log(JSON.stringify(best.j.regions));
