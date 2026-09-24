import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { simulate, type SimParams } from '../src/sim';

/**
 * The SPICE library (sim/, written by scripts/sim_library.py) against the
 * in-browser simulator. Each case is a converter with a synthetic example's
 * numbers, the example the simulator's preset of that name opens with;
 * ngspice ran its netlist from rest to a steady state, and sim/results.json
 * holds each quantity's average, largest and smallest value over the last
 * period (the CI's spice job reruns ngspice and compares). The simulator
 * runs the same circuit: the switch's 1 mΩ, ideal diodes (ngspice's drop
 * about 30 mV). SPICE needs 1 pF at the forward converter's drain (sim/ngspice/forward/README.md):
 * after the reset it leaves about 1.5 mA of magnetizing current in the winding, which the simulator's
 * forward model, without a drain capacitance, does not. So each value must agree within 1 % of its
 * quantity's largest magnitude in the period.
 *
 * The library records the switch node of the buck and the buck-boost, v(sw);
 * the simulator the voltage across the switch, V_g − v(sw). The buck-boost's
 * output is below ground in SPICE; the simulator gives its magnitude.
 */

interface Quantity {
  unit: string;
}
interface LibraryCase {
  topology: SimParams['topology'];
  params: Record<string, number>;
  quantities: Record<string, Quantity>;
  values: Record<string, number>;
}

const results = JSON.parse(readFileSync(new URL('../../../sim/results.json', import.meta.url), 'utf8')) as {
  ngspice: string;
  cases: Record<string, LibraryCase>;
};

const TOL = 0.01;

function params(c: LibraryCase): SimParams {
  const p = c.params;
  const load: SimParams['load'] = { kind: 'resistive', R: p.R!, C: p.C! };
  const base = { topology: c.topology, Vg: p.Vg!, D: p.D!, fs: p.fs!, Ron: 1e-3, load };
  if (c.topology === 'flyback') return { ...base, L: p.Lm!, n: p.n! };
  if (c.topology === 'forward') return { ...base, L: p.L!, LM: p.Lm!, n: p.n!, nr: p.nr! };
  return { ...base, L: p.L! };
}

/** The library's quantity -> the simulator's series, and how its value maps (the sign, V_g minus). */
function mapping(c: LibraryCase): Record<string, { series: string; map: (x: number) => number }> {
  const vg = c.params.Vg!;
  const out: Record<string, { series: string; map: (x: number) => number }> = {};
  const across = c.topology === 'buck' || c.topology === 'buckboost';
  out.v_sw = { series: 'v_sw', map: across ? (x) => vg - x : (x) => x };
  out.v_out = { series: 'v_out', map: c.topology === 'buckboost' ? (x) => -x : (x) => x };
  if (c.topology === 'flyback') out.i_M = { series: 'i_L', map: (x) => x };
  else out.i_L = { series: 'i_L', map: (x) => x };
  if (c.topology === 'forward') out.i_M = { series: 'i_M', map: (x) => x };
  return out;
}

describe(`SPICE library against the in-browser simulator (ngspice ${results.ngspice})`, () => {
  it('covers the five converters, and both modes of the buck and the flyback', () => {
    const ids = Object.keys(results.cases);
    for (const t of ['buck', 'boost', 'buckboost', 'flyback', 'forward']) expect(ids.some((id) => results.cases[id]!.topology === t)).toBe(true);
    for (const id of ['buck-ccm', 'buck-dcm', 'flyback-ccm', 'flyback-dcm']) expect(ids).toContain(id);
  });

  for (const [id, c] of Object.entries(results.cases)) {
    it(id, () => {
      const r = simulate(params(c));
      expect(r.converged).toBe(true);
      expect(r.mode).toBe(id.endsWith('-ccm') ? 'CCM' : 'DCM');
      for (const [q, { series, map }] of Object.entries(mapping(c))) {
        const sp = { avg: map(c.values[`${q}_avg`]!), a: map(c.values[`${q}_max`]!), b: map(c.values[`${q}_min`]!) };
        const spice = { avg: sp.avg, max: Math.max(sp.a, sp.b), min: Math.min(sp.a, sp.b) };
        const scale = Math.max(Math.abs(spice.max), Math.abs(spice.min));
        const sim = { avg: r.avg[series]!, max: r.max[series]!, min: r.min[series]! };
        for (const fn of ['avg', 'max', 'min'] as const) {
          const diff = Math.abs(sim[fn] - spice[fn]);
          expect(diff, `${id} ${q} ${fn}: simulator ${sim[fn]}, ngspice ${spice[fn]}`).toBeLessThanOrEqual(TOL * scale);
        }
      }
    });
  }
});

describe('the simulator page links the library', () => {
  const root = resolve(__dirname, '../../..');
  for (const lang of ['en', 'ko']) {
    it(`${lang}: every case's schematic and netlist`, () => {
      const page = readFileSync(resolve(root, `src/content/docs/${lang}/simulate/simulator.mdx`), 'utf8');
      for (const [id, c] of Object.entries(results.cases)) {
        for (const file of [`sim/ltspice/${c.topology}/${id}.asc`, `sim/ngspice/${c.topology}/${id}.cir`]) {
          expect(page, `${lang}: ${file}`).toContain(`https://github.com/Denny-Hwang/switching_converter_study/blob/main/${file}`);
        }
      }
    });
  }
});
