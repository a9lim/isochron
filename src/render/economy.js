// Fig. 2 with people: their economy (src/engine/people.js), the planet's layers they touch at its
// edge, drawn by figures.js's drawModel. Each part comes with the era that brings it, so the figure
// grows as the history does; an arrow is a coupling the people's code has, as heavy as what flows.
//
// AI is compute's: it thinks (its research minds join people's, `E.AIr`) and works (its share of
// the work, `sA`), and drives the robots' bodies, which work beside people. Culture is the
// economy's one technology: what the land and the fields carry, output's productivity, energy's
// intensity and its sources' returns, compute's efficiency (hardware and algorithms), a body's cost.
// The land holds the economy's endowments: its plants, fossil carbon and ores (the fossil and ore
// maps), and the sunlight surface solar is capped by. Every energy source is plant built from
// output (output → energy, the share invested); the land gives fossil carbon's and solar's power,
// space its sunlight's, and fusion needs nothing but the plant. Fixed capital is output kept, a
// loop on output (the share reinvested). Burning sends carbon (net of what capture takes back) and
// coal's sulfate into the air; waste heat (fossil carbon's and fusion's) goes straight to the climate.

export const ECONOMY = {
  sea: [0.08, 0.04, 'Sea'], climate: [0.32, 0.04, 'Climate'], air: [0.6, 0.04, 'Air'], space: [0.88, 0.04, 'Space'],
  land: [0.12, 0.21, 'Land'], energy: [0.8, 0.3, 'Energy'],
  people: [0.3, 0.43, 'People'], farms: [0.1, 0.5, 'Farms'],
  output: [0.6, 0.55, 'Output'], culture: [0.34, 0.64, 'Culture'],
  minds: [0.14, 0.84, 'Minds'], compute: [0.58, 0.86, 'Compute'], robots: [0.88, 0.76, 'Robots'],
};

const SUP = '⁰¹²³⁴⁵⁶⁷⁸⁹';
export const g2 = v => (v >= 99.5 ? Math.round(v).toLocaleString('en') : v.toPrecision(2));
export const sci = v => { const k = Math.floor(Math.log10(v)); return `${(v / 10 ** k).toFixed(1)} × 10${String(k).split('').map(c => SUP[c]).join('')}`; };
export const watts = v => (v >= 1e18 ? `${sci(v)} W` : v >= 1e15 ? `${g2(v / 1e15)} PW` : v >= 1e12 ? `${g2(v / 1e12)} TW` : v >= 1e9 ? `${g2(v / 1e9)} GW` : `${Math.round(v / 1e6)} MW`);
const count = v => (v >= 1e15 ? sci(v) : v >= 1e12 ? `${g2(v / 1e12)} trillion` : v >= 1e9 ? `${(v / 1e9).toPrecision(3)} billion` : v >= 1e6 ? `${(v / 1e6).toPrecision(3)} million` : Math.round(+v.toPrecision(2)).toLocaleString('en'));
const pc = v => `${v < 0.095 ? (100 * v).toFixed(1) : Math.round(100 * v)}%`;
const Wm = v => `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(Math.abs(v) < 0.1 ? 2 : 1)} W/m²`;

/**
 * The figure's nodes, values and arrows from the people's report `m` (people-worker.js) and the
 * planet's side: the plants' NPP (Pg C/yr), the mean temperature, the air's CO₂ and its reference,
 * rain on land (km³/yr) over land's area (the planet's units), the sea's boiled share, the farmed
 * share of land.
 */
export function economyOf({ m, npp = 0, meanT = 0, pco2 = 280, pco20 = 280, rain = 0, la = 1, boiled = 0, farmed = 0 }) {
  const h = m.last, F = m.flags, E = m.econ;
  const farms = m.packages > 0, ind = !!(F.industry && E);
  const allE = h.Ef + h.Er + h.Eu + h.Es, Y = h.Y || 0, fl = E ? E.flows : {}, sA = m.sA || 0, dis = m.dis || 0;
  const ai = ind && h.AI >= 1e6, bots = ai && E.bodies >= 1e3, work = bots && h.Ap >= 1e3;
  const co2F = 5.35 * Math.log(pco2 / pco20), airF = co2F + m.forcing.aer, heat = m.forcing.heat || 0;
  const net = h.Ef * 3.15576e7 / 4e19 - (E ? E.cdrPg || 0 : 0), share = v => (allE > 0 ? v / allE : 0), inv = k => (Y > 0 ? (fl[k] || 0) / Y : 0);
  const income = h.O / Math.max(h.earth, 1), ground = h.Ef + h.Er;
  return {
    values: {
      climate: `${meanT.toFixed(1)} °C`, land: `NPP ${Math.round(npp)} Pg/yr`,
      // People and their fields leave the figure with the last of them on Earth (the minds stay: AI's research joins them).
      people: h.earth >= 1 ? count(h.earth) : null, minds: count(h.minds), culture: `z ${h.zmax.toFixed(2)}`,
      farms: farms && (h.earth >= 1 || farmed > 5e-4) ? `${pc(farmed)} of land` : null,
      sea: boiled > 0 ? `${Math.round(100 * boiled)}% boiled` : null,
      air: ind ? `${Math.round(pco2)} ppm` : null,
      output: ind ? (h.earth >= 1e3 ? `income ${income >= 1e6 ? sci(income) : g2(income)}×` : `${sci(Y)} sy/yr`) : null,
      energy: ind ? watts(allE) : null,
      space: ind && (h.Es >= 1e9 || h.space >= 1e3) ? (h.Es >= 1e9 ? watts(h.Es) : count(h.space)) : null,
      compute: ai ? count(h.AI) : null,
      robots: bots ? (work ? count(h.Ap) : `${count(E.bodies)} idle`) : null,
    },
    // Misaligned, AI's nodes are drawn in the red.
    red: m.ending && !m.ending.aligned ? { compute: true, robots: true } : {},
    edges: [
      // Kremer's loop: the land feeds people, people make minds, minds ideas, and culture raises what the land carries.
      { from: 'climate', to: 'land', w: rain / la / 1.5, label: `${Math.round(1000 * rain / la)} mm/yr`, bend: 0 },
      { from: 'land', to: 'people', w: 0.25 + 0.5 * (1 - h.farm), label: 'forage', bend: -0.1 },
      { from: 'people', to: 'minds', w: 0.45, bend: 0.1 },
      { from: 'minds', to: 'culture', w: 0.5, label: 'ideas', bend: -0.1 },
      { from: 'culture', to: 'people', w: 0.4, bend: 0.1 },
      // Farming: the fields take land and strip its soil, yield by the soil, and feed people.
      { from: 'farms', to: 'people', w: 0.25 + 0.5 * h.farm, label: 'harvest', bend: 0.1 },
      { from: 'farms', to: 'land', w: farmed / 0.1, label: 'tillage', bend: 0.25 },
      { from: 'land', to: 'farms', w: h.soil / 4, label: `soil ${h.soil.toFixed(1)} m`, bend: 0.25 },
      { from: 'culture', to: 'farms', w: 0.3, bend: -0.1 },
      { from: 'air', to: 'land', w: Math.min(1, Math.max(0, co2F) / 4), label: 'CO₂', bend: 0.1, on: ind && co2F > 0.05 },
      // Industry: output from capital (output kept), the work and energy, at culture's productivity,
      // with the land's ores; invested back by return.
      { from: 'output', to: 'output', w: inv('f') / 0.15, label: pc(inv('f')), on: ind && inv('f') >= 5e-4 },
      { from: 'people', to: 'output', w: 0.8 * (ai ? 1 - sA : 1), label: ai ? pc(1 - sA) : '', bend: 0.1 },
      { from: 'compute', to: 'output', w: 0.8 * sA, label: pc(sA), bend: 0.1 },
      { from: 'robots', to: 'output', w: h.Ap / Math.max(1, h.Ap + 0.5 * (E ? E.Lh : 0)), bend: 0.1, on: work },
      { from: 'energy', to: 'output', w: 0.5, bend: 0.12 },
      { from: 'culture', to: 'output', w: 0.3, bend: 0.1 },
      { from: 'land', to: 'output', w: 0.2 + 0.6 * (1 - (E ? E.grade : 1)), label: `ores ${E ? E.grade.toFixed(2) : ''}`, bend: -0.12, on: ind },
      { from: 'output', to: 'people', w: 0.3, label: 'goods', bend: 0.1 },
      { from: 'output', to: 'energy', w: inv('e') / 0.08, label: pc(inv('e')), bend: 0.12, on: inv('e') >= 5e-4 },
      { from: 'output', to: 'compute', w: (inv('c') + inv('q')) / 0.08, label: pc(inv('c') + inv('q')), bend: 0.12, on: inv('c') + inv('q') >= 5e-4 },
      { from: 'output', to: 'robots', w: inv('r') / 0.05, label: pc(inv('r')), bend: 0.12, on: inv('r') >= 5e-4 },
      // Energy: the land's fossil carbon and sunlight, space's sunlight (fusion is plant alone); its
      // intensity and the sources' returns rising with culture; power to the machines and to food.
      { from: 'land', to: 'energy', w: share(ground), label: watts(ground), bend: -0.08, on: ground > 1e8 },
      { from: 'space', to: 'energy', w: share(h.Es), label: watts(h.Es), bend: 0, on: h.Es >= 1e9 },
      { from: 'culture', to: 'energy', w: 0.3, bend: -0.1 },
      { from: 'energy', to: 'compute', w: E ? 3 * share(E.Wc) : 0, label: E ? watts(E.Wc) : '', bend: -0.15 },
      { from: 'energy', to: 'robots', w: E ? 3 * share(E.Wr) : 0, label: E ? watts(E.Wr) : '', bend: -0.1, on: work },
      { from: 'energy', to: 'people', w: E ? 3 * share(E.food) : 0, label: 'food', bend: -0.1, on: !!E && E.food > 1e9 },
      // The air and the climate: carbon burned, net of capture (and coal's sulfate); the air's forcing
      // (CO₂, coal's sulfate, and a preserving AI's sprayed sulfate, which costs nothing here and so
      // has no source); waste heat straight to the climate.
      { from: 'energy', to: 'air', w: Math.abs(net) / 10, label: `${net >= 0 ? '+' : '−'}${Math.abs(net).toFixed(Math.abs(net) < 1 ? 2 : 1)} Pg/yr`, red: net > 0, bend: 0.05, on: Math.abs(net) > 1e-3 },
      { from: 'air', to: 'climate', w: Math.abs(airF) / 6, label: Wm(airF), bend: 0, on: ind },
      { from: 'energy', to: 'climate', w: heat / 2, label: `heat ${Wm(heat)}`, bend: 0, on: heat > 0.005 },
      // AI: compute thinks and works; its efficiency rises with culture; it drives the robots' bodies, cheaper with culture.
      { from: 'culture', to: 'compute', w: 0.3, bend: -0.1, on: ai },
      { from: 'compute', to: 'minds', w: h.minds > 0 && E ? Math.min(1, 3 * E.Ar / h.minds) : 0, label: 'research', bend: 0.05 },
      { from: 'compute', to: 'robots', w: 0.3, bend: 0.1, on: work },
      { from: 'culture', to: 'robots', w: 0.2, bend: 0.1 },
      // Space: its sunlight's power, and the people who go; misaligned, control passes to AI.
      { from: 'people', to: 'space', w: 0.3, label: h.Es >= 1e9 ? count(h.space) : '', bend: -0.25, on: h.space >= 1e3 },
      // Alignment: people's hold on AI, 1 − its control (a9), in the ink; misaligned, the control AI takes back in the red.
      { from: 'people', to: 'compute', w: 1 - dis, label: `alignment ${pc(1 - dis)}`, ink: 'text', bend: 0.2 },
      { from: 'compute', to: 'people', w: dis, label: `control ${pc(dis)}`, red: true, bend: -0.2, on: dis > 0.01 },
      // Past the runaway the climate boils the sea.
      { from: 'climate', to: 'sea', w: boiled, label: 'boils', bend: 0 },
    ],
  };
}

/** Fig. 2's caption with people: the share invested, the power and its sources; before industry, the minds and culture. */
export function economyCaption(m) {
  const h = m.last, E = m.econ, Y = h.Y || 0;
  if (!(m.flags.industry && E && Y > 0)) return `The people · ${count(h.minds)} minds · culture z ${h.zmax.toFixed(2)}`;
  const f = E.flows, all = h.Ef + h.Er + h.Eu + h.Es;
  const mix = [['fossil', h.Ef], ['solar', h.Er], ['fusion', h.Eu], ['space', h.Es]].filter(([, v]) => v / all >= 0.005).map(([k, v]) => `${k} ${Math.round(100 * v / all)}%`);
  return `The economy · investing ${Math.round(100 * (f.f + f.c + f.r + f.e + f.q) / Y)}% of output · ${watts(all)}: ${mix.join(', ')}`;
}
