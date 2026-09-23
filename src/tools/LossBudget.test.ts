import { describe, expect, it } from 'vitest';
import { lossPoint, sim } from 'pe-core';
import { lossValues } from '../lib/losspresets';
import { hashOf, simulatorHash, stateFromHash, toLossSpec, type LossPreset } from './LossBudget';
import { toParams } from './Simulator';

const strings = (v: Record<string, number>) => Object.fromEntries(Object.entries(v).map(([k, x]) => [k, String(x)]));
const rel = (a: number, b: number) => Math.abs(a - b) / Math.abs(b);

describe('loss-budget form', () => {
  const buck = strings(lossValues('loss-buck', 'buck'));

  it('reads a synthetic example, core included', () => {
    const s = toLossSpec('buck', buck);
    expect(s).not.toBeNull();
    expect(s!.core).toBeDefined();
    expect(s!.Llk).toBeUndefined();
  });

  it('leaves out the core when all six core values are empty, but not when only some are', () => {
    const none = { ...buck, N: '', Ae: '', Ve: '', k: '', alpha: '', beta: '' };
    expect(toLossSpec('buck', none)!.core).toBeUndefined();
    expect(toLossSpec('buck', { ...buck, N: '' })).toBeNull();
  });

  it('non-ideal parts may be zero, the operating point may not; a node capacitance needs R_on', () => {
    expect(toLossSpec('buck', { ...buck, Ron: '0', Cnode: '0', rd: '0' })).not.toBeNull();
    expect(toLossSpec('buck', { ...buck, P: '0' })).toBeNull();
    expect(toLossSpec('buck', { ...buck, Ron: '0' })).toBeNull();
  });

  it('the flyback example carries its leakage inductance', () => {
    const s = toLossSpec('flyback', strings(lossValues('loss-flyback', 'flyback')));
    expect(s!.Llk).toBeGreaterThan(0);
    expect(s!.n).toBeGreaterThan(0);
  });
});

describe('the full-load point, opened in the simulator', () => {
  it('reproduces the output voltage and the simulated losses', () => {
    const s = toLossSpec('buck', strings(lossValues('loss-buck', 'buck')))!;
    const p = lossPoint(s, 1, s.fs);
    const q = Object.fromEntries(new URLSearchParams(simulatorHash(s, p)));
    const params = toParams({ topo: 'buck', load: 'res', source: false }, q);
    if ('error' in params) throw new Error(params.error);
    const r = sim.simulate(params);
    // four significant digits in the link
    expect(rel(Math.abs(r.avg.v_out!), s.V)).toBeLessThan(2e-3);
    expect(rel(r.losses.conduction, p.sim.conduction)).toBeLessThan(5e-3);
  });
});

describe('loss-budget URL hash', () => {
  it('core values emptied on purpose stay empty through the hash (no core loss after a reload)', () => {
    const base = lossValues('loss-buck', 'buck');
    const presets: LossPreset[] = [{ id: 'b', label: 'b', topology: 'buck', values: base }];
    const values = Object.fromEntries(Object.entries(base).map(([k, v]) => [k, String(v)]));
    for (const k of ['N', 'Ae', 'Ve', 'k', 'alpha', 'beta']) values[k] = '';
    const back = stateFromHash(new URLSearchParams(hashOf('buck', values)), presets);
    expect(back.values.N).toBe('');
    expect(toLossSpec('buck', back.values)!.core).toBeUndefined();
    // a hash without the keys takes the example's core
    expect(toLossSpec('buck', stateFromHash(new URLSearchParams('topo=buck'), presets).values)!.core).toBeDefined();
  });
});
