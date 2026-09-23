import { describe, expect, it } from 'vitest';
import { envelopeAt, matchSource, sim } from 'pe-core';
import { sourceValues } from '../lib/sourcepresets';
import { getExample } from '../lib/examples';
import { toParams } from './Simulator';
import { hashOf, simulatorHash, stateFromHash, toEnvelope, toMatchSpec, type SourcePreset } from './SourceMatcher';

const strings = (v: Record<string, number>) => Object.fromEntries(Object.entries(v).map(([k, x]) => [k, String(x)]));
const rel = (a: number, b: number) => Math.abs(a - b) / Math.abs(b);
const result = (example: string, name: string) => getExample(example).results.find((r) => r.name === name)!.value;

describe('source-matcher form', () => {
  const lfr = strings(sourceValues('source-lfr'));

  it('reads the synthetic example, and the tool agrees with its worked table', () => {
    const m = matchSource(toMatchSpec(lfr)!);
    expect(m.point.mode).toBe('LFR');
    expect(rel(m.Rin, result('source-lfr', 'R_in'))).toBeLessThan(1e-12);
    expect(rel(m.point.Vg, result('source-lfr', 'V_g'))).toBeLessThan(1e-12);
    expect(rel(m.point.eta, result('source-lfr', 'eta_ext'))).toBeLessThan(1e-12);
    expect(rel(m.Vgcrit, result('source-lfr', 'V_gcrit'))).toBeLessThan(1e-12);
    expect(rel(m.point.Vds, result('source-lfr', 'V_DS'))).toBeLessThan(1e-12);
  });

  it('rejects a missing field and D = 1; V_D may be 0; C_bus is needed only for an envelope', () => {
    expect(toMatchSpec({ ...lfr, Rs: '' })).toBeNull();
    expect(toMatchSpec({ ...lfr, D: '1' })).toBeNull();
    expect(toMatchSpec({ ...lfr, VD: '0' })).not.toBeNull();
    expect(toMatchSpec({ ...lfr, Cbus: '' })).not.toBeNull();
  });
});

describe('envelope input', () => {
  it('a rectified sine needs a positive frequency', () => {
    expect(toEnvelope('sine', { fenv: '2' })).toEqual({ kind: 'sine', f: 2 });
    expect(toEnvelope('sine', { fenv: '0' })).toBeNull();
    expect(toEnvelope('none', { fenv: '2' })).toBeNull();
  });

  it('points: from t = 0, increasing times, amplitudes from 0 to 1; separators ";" and "," or spaces', () => {
    const e = toEnvelope('points', { pts: '0 0; 0.5, 1; 1 0' });
    expect(e).toEqual({ kind: 'points', t: [0, 0.5, 1], v: [0, 1, 0] });
    expect(envelopeAt(e!, 0.25)).toBeCloseTo(0.5, 12);
    expect(envelopeAt(e!, 1.25)).toBeCloseTo(0.5, 12); // repeats with the last time as its period
    for (const pts of ['0.1 0; 1 1', '0 0; 1 1; 1 0.5', '0 0; 1 1.2', '0 0', '0 0; x 1', '0 0 1; 1 1']) {
      expect(toEnvelope('points', { pts })).toBeNull();
    }
  });
});

describe('source-matcher URL hash', () => {
  const presets: SourcePreset[] = [
    { id: 'source-lfr', label: 'lfr', values: sourceValues('source-lfr') },
    { id: 'source-envelope', label: 'env', values: sourceValues('source-envelope') },
  ];

  it('round-trips the form and the envelope points, an emptied field included', () => {
    const values: Record<string, string> = { ...strings(sourceValues('source-lfr')), pts: '0 0; 0.5 1; 1 0', Cbus: '' };
    const back = stateFromHash(new URLSearchParams(hashOf('points', values)), presets);
    expect(back.env).toBe('points');
    expect(back.values.pts).toBe(values.pts);
    expect(back.values.Cbus).toBe('');
    expect(back.values.Voc).toBe(values.Voc);
  });

  it('a hash without the fields takes the first example, without an envelope', () => {
    const back = stateFromHash(new URLSearchParams(''), presets);
    expect(back.env).toBe('none');
    expect(back.values.Voc).toBe(String(sourceValues('source-lfr').Voc));
  });
});

describe('the operating point, opened in the simulator', () => {
  // The simulator settles where the source matcher says: at the divider voltage as a loss-free
  // resistor, and at V_g,crit as a constant-voltage sink.
  for (const Voc of [150, 1000]) {
    it(`V_oc = ${Voc} V`, () => {
      const s = toMatchSpec({ ...strings(sourceValues('source-lfr')), Voc: String(Voc) })!;
      const m = matchSource(s);
      const q = Object.fromEntries(new URLSearchParams(simulatorHash(s, 1e-5)));
      const params = toParams({ topo: 'flyback', load: 'fixed', source: true }, q);
      if ('error' in params) throw new Error(params.error);
      const r = sim.simulate(params);
      expect(r.converged).toBe(true);
      expect(rel(r.avg.v_in!, m.point.Vg)).toBeLessThan(2e-3);
      expect(m.point.mode).toBe(Voc === 150 ? 'LFR' : 'CV');
    });
  }
});
