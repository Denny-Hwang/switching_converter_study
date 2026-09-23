import { describe, expect, it } from 'vitest';
import { design, sim } from 'pe-core';
import { designValues } from '../lib/designpresets';
import { hashOf, lossBudgetHash, simulatorHash, stateFromHash, toSpec, type DesignerPreset } from './ConverterDesigner';
import { toParams } from './Simulator';

const strings = (v: Record<string, number>) => Object.fromEntries(Object.entries(v).map(([k, x]) => [k, String(x)]));
const rel = (a: number, b: number) => Math.abs(a - b) / Math.abs(b);

describe('designer form', () => {
  const buck = strings(designValues('design-buck'));

  it('reads a synthetic specification', () => {
    const s = toSpec('buck', buck);
    expect(s).not.toBeNull();
    expect(s!.L).toBeUndefined();
    expect(s!.VgMin).toBeLessThan(s!.VgMax);
  });

  it('rejects a missing field, an inverted range and a light load above full load', () => {
    expect(toSpec('buck', { ...buck, V: '' })).toBeNull();
    expect(toSpec('buck', { ...buck, VgMin: buck.VgMax!, VgMax: buck.VgMin! })).toBeNull();
    expect(toSpec('buck', { ...buck, Pmin: String(2 * Number(buck.P)) })).toBeNull();
    expect(toSpec('buck', { ...buck, rI: '0' })).toBeNull();
  });

  it('accepts no CCM requirement (P_min = 0) and an entered inductance', () => {
    const s = toSpec('buck', { ...buck, Pmin: '0', L: '0.0001' });
    expect(s!.Pmin).toBe(0);
    expect(s!.L).toBe(1e-4);
  });

  it('the forward converter needs L_M only for the simulator link', () => {
    const fwd = strings(designValues('design-forward'));
    const r = design(toSpec('forward', fwd)!);
    expect(simulatorHash(r, r.spec.VgMin)).toBeNull();
    const hash = new URLSearchParams(simulatorHash(r, r.spec.VgMin, Number(fwd.LM))!);
    expect(hash.get('topo')).toBe('forward');
    expect(hash.get('LM')).toBe(fwd.LM);
    expect(hash.get('nr')).toBe(fwd.nr);
  });
});

describe('designer URL hash and links', () => {
  const presets: DesignerPreset[] = [{ id: 'b', label: 'b', topology: 'buck', values: designValues('design-buck') }];

  it('an emptied optional field stays empty through the hash; a missing one takes the preset', () => {
    const values: Record<string, string> = { ...strings(designValues('design-buck')), L: '' };
    const back = stateFromHash(new URLSearchParams(hashOf('buck', values)), presets);
    expect(back.topo).toBe('buck');
    expect(back.values.L).toBe('');
    expect(back.values.V).toBe(values.V);
    const bare = stateFromHash(new URLSearchParams('topo=buck'), presets);
    expect(bare.values.V).toBe(values.V);
  });

  it('the simulator link carries the duty ratio to six digits and ideal parts', () => {
    // a large step-up ratio: the output is sensitive to the duty ratio
    const r = design({ topology: 'boost', VgMin: 5, VgMax: 5.5, V: 120, P: 10, Pmin: 0, fs: 1e5, rippleI: 0.3, rippleV: 0.01 });
    const p = r.points[0]!;
    const q = new URLSearchParams(simulatorHash(r, p.Vg)!);
    expect(rel(Number(q.get('D')), p.D)).toBeLessThan(1e-6);
    for (const k of ['Ron', 'RL', 'Cnode', 'VF']) expect(q.get(k)).toBe('0');
    const params = toParams({ topo: 'boost', load: 'res', source: false }, Object.fromEntries(q));
    if ('error' in params) throw new Error(params.error);
    expect(rel(sim.simulate(params).avg.v_out!, 120)).toBeLessThan(2e-3);
  });

  it('the loss-budget link keeps the flyback’s diode drop and leaves the core empty', () => {
    const r = design(toSpec('flyback', strings(designValues('design-flyback')))!);
    const q = new URLSearchParams(lossBudgetHash(r, r.points[0]!.Vg));
    expect(Number(q.get('VF'))).toBe(r.spec.VD);
    for (const k of ['N', 'Ae', 'Ve', 'k', 'alpha', 'beta']) expect(q.get(k)).toBe('');
  });
});

describe('the designed converter, simulated', () => {
  // The designer's ripple and output voltage agree with a time-domain
  // simulation of the parts it chose, at both ends of the input range.
  for (const [topology, example] of [
    ['buck', 'design-buck'],
    ['boost', 'design-boost'],
    ['buckboost', 'design-buckboost'],
    ['flyback', 'design-flyback'],
  ] as const) {
    it(topology, () => {
      const r = design(toSpec(topology, strings(designValues(example)))!);
      for (const p of [r.points[0]!, r.points[r.points.length - 1]!]) {
        const q = Object.fromEntries(new URLSearchParams(simulatorHash(r, p.Vg)!));
        const params = toParams({ topo: topology, load: 'res', source: false }, q);
        if ('error' in params) throw new Error(params.error);
        const s = sim.simulate(params);
        expect(s.converged).toBe(true);
        expect(s.mode).toBe('CCM');
        // small-ripple equations: 2 %
        expect(rel(s.pp.i_L!, 2 * p.dI)).toBeLessThan(0.02);
        expect(rel(Math.abs(s.avg.v_out!), r.spec.V)).toBeLessThan(0.02);
      }
    });
  }
});
