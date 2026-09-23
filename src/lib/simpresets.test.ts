import { describe, expect, it } from 'vitest';
import { sim } from 'pe-core';
import { stateFromHash, toParams } from '../tools/Simulator';
import { getExample } from './examples';
import { loadChoiceOf } from './simload';
import { PRESETS, presetValues, simulatorHash } from './simpresets';

/** A preset as the simulator runs it: the example's values through the form, as the page does. */
function run(id: string) {
  const p = PRESETS.find((x) => x.id === id)!;
  const values = presetValues(p.example, p.topology);
  const form = { topo: p.topology, load: loadChoiceOf(values), source: values.Voc !== undefined };
  const params = toParams(form, Object.fromEntries(Object.entries(values).map(([k, v]) => [k, String(v)])));
  if ('error' in params) throw new Error(`${id}: ${params.error}`);
  return { preset: p, values, params, result: sim.simulate(params) };
}

describe('simulator presets', () => {
  it('every preset simulates; those without a steady state say why', () => {
    const expected: Record<string, sim.Status> = { 'flyback-charging': 'charging', 'buck-runaway': 'runaway' };
    for (const p of PRESETS) {
      const { result } = run(p.id);
      expect(result.status, p.id).toBe(expected[p.id] ?? 'steady');
    }
  });

  it('a "Try it" link opens the same load as the preset', () => {
    for (const p of PRESETS) {
      const values = presetValues(p.example, p.topology);
      const { fs } = stateFromHash(new URLSearchParams(simulatorHash(p.example, p.topology)), []);
      expect(fs.load, p.id).toBe(loadChoiceOf(values));
      expect(fs.topo, p.id).toBe(p.topology);
    }
    expect(loadChoiceOf(presetValues('sim-buck-battery', 'buck'))).toBe('bat');
    expect(loadChoiceOf(presetValues('sim-flyback-charging', 'flyback'))).toBe('cap');
    expect(loadChoiceOf(presetValues('sim-buck-fixed', 'buck'))).toBe('fixed');
  });

  it('buck charging a battery: the simulated average current is the worked example\'s I_b = (D V_g - V_b)/R_b', () => {
    const { result } = run('buck-battery');
    const I_b = getExample('sim-buck-battery').context.I_b!;
    expect(I_b).toBeCloseTo(4.8, 12);
    expect(result.mode).toBe('CCM');
    expect(Math.abs(result.avg.i_bat! - I_b) / I_b).toBeLessThan(1e-9);
  });

  it('flyback charging a battery in DCM: the battery and the diode take the power the converter draws', () => {
    const { result, params } = run('flyback-battery');
    const P = getExample('sim-flyback-battery').context.P!;
    expect(result.mode).toBe('DCM');
    const b = (params.load as { battery: sim.Battery }).battery;
    const t = result.waveforms.t as number[];
    const ib = result.waveforms.i_bat as number[];
    let Pb = 0;
    for (let k = 1; k < t.length; k++) {
      const f = (j: number) => b.V * ib[j]! + b.R * ib[j]! ** 2;
      Pb += 0.5 * (f(k - 1) + f(k)) * (t[k]! - t[k - 1]!);
    }
    Pb /= t.at(-1)!;
    expect(Math.abs(Pb + result.losses.diode - P) / P).toBeLessThan(1e-6);
  });

  it('buck into a fixed voltage at D = 0.8: the current runs away, and D = V/V_g = 0.5 would balance', () => {
    const { result } = run('buck-runaway');
    expect(result.drift!.state).toBe('i');
    expect(result.drift!.Dbalance).toBeCloseTo(0.5, 9);
    // (V_g D - V) T_s / L = (19.2 - 12) V x 10 us / 100 uH
    expect(result.drift!.perCycle).toBeCloseTo(0.72, 9);
  });
});
