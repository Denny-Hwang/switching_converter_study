import { describe, expect, it } from 'vitest';
import { clampCheck } from 'pe-core';
import { clampValues } from '../lib/clamppresets';
import { getExample } from '../lib/examples';
import { checkOf, hashOf, stateFromHash, toClampSpec, tradeoff, type ClampPreset } from './ClampCheck';

const strings = (v: Record<string, number>) => Object.fromEntries(Object.entries(v).map(([k, x]) => [k, String(x)]));
const rel = (a: number, b: number) => Math.abs(a - b) / Math.abs(b);
const result = (example: string, name: string) => getExample(example).results.find((r) => r.name === name)!.value;

describe('clamp-check form', () => {
  const tvs = strings(clampValues('clamp-tvs'));
  const rcd = strings(clampValues('clamp-rcd'));

  it('reads both synthetic examples, and the tool agrees with their worked tables', () => {
    const t = clampCheck(toClampSpec('tvs', tvs)!);
    expect(rel(t.Vclamp.high, result('clamp-tvs', 'V_clamp'))).toBeLessThan(1e-12);
    expect(t.Vclamp.low).toBe(Number(tvs.VBR));
    expect(rel(t.P.low, result('clamp-tvs', 'P_clamp'))).toBeLessThan(1e-12);
    expect(rel(t.P.high, result('clamp-tvs', 'P_clamp_max'))).toBeLessThan(1e-12);
    expect(rel(t.Vds, result('clamp-tvs', 'V_DS'))).toBeLessThan(1e-12);
    expect(t.warnings).toEqual([]);
    const r = clampCheck(toClampSpec('rcd', rcd)!);
    expect(r.Vclamp.low).toBe(r.Vclamp.high);
    expect(rel(r.Vclamp.high, result('clamp-rcd', 'V_clamp'))).toBeLessThan(1e-12);
    // the resistor dissipates the clamp power: V^2/R equals clamp.P at the RCD's own voltage
    expect(rel(r.Vclamp.high ** 2 / Number(rcd.R), r.P.low)).toBeLessThan(1e-9);
  });

  it('rejects a missing or non-positive field and a clamping voltage not above the breakdown voltage; V_D may be 0', () => {
    expect(toClampSpec('tvs', { ...tvs, Llk: '' })).toBeNull();
    expect(toClampSpec('tvs', { ...tvs, n: '0' })).toBeNull();
    expect(toClampSpec('tvs', { ...tvs, VCL: tvs.VBR })).toBeNull();
    expect(toClampSpec('tvs', { ...tvs, VD: '0' })).not.toBeNull();
    // the RCD clamp needs its resistor, not the TVS's data
    expect(toClampSpec('rcd', { ...rcd, VBR: '', VCL: '', IPP: '' })).not.toBeNull();
    expect(toClampSpec('rcd', { ...rcd, R: '' })).toBeNull();
  });

  it('warns when the clamp voltage is not above the reflected voltage, and when the switch exceeds its rating', () => {
    const low = clampCheck(toClampSpec('tvs', { ...tvs, VBR: '40', VCL: '60' })!);
    expect(low.warnings).toContain('belowReflected');
    expect(low.P.high).toBe(Number.POSITIVE_INFINITY);
    const over = clampCheck(toClampSpec('tvs', { ...tvs, Vrating: '120' })!);
    expect(over.warnings).toEqual(['overRating']);
    expect(over.margin).toBeLessThan(0);
  });

  it('the trade-off chart: the dissipation falls and the switch voltage rises with the clamp voltage', () => {
    const t = tradeoff(clampCheck(toClampSpec('tvs', tvs)!));
    for (let k = 1; k < t.V.length; k++) {
      expect(t.P[k]!).toBeLessThan(t.P[k - 1]!);
      expect(t.Vds[k]!).toBeGreaterThan(t.Vds[k - 1]!);
    }
  });
});

describe('clamp-check URL hash', () => {
  const presets: ClampPreset[] = [
    { id: 'clamp-tvs', label: 'tvs', kind: 'tvs', values: clampValues('clamp-tvs') },
    { id: 'clamp-rcd', label: 'rcd', kind: 'rcd', values: clampValues('clamp-rcd') },
  ];

  it('round-trips the form, an emptied field included', () => {
    const values: Record<string, string> = { ...strings(clampValues('clamp-rcd')), R: '' };
    const back = stateFromHash(new URLSearchParams(hashOf('rcd', values)), presets);
    expect(back.kind).toBe('rcd');
    expect(back.values.R).toBe('');
    expect(back.values.Vg).toBe(values.Vg);
  });

  it("a hash without the fields takes the clamp type's example", () => {
    const back = stateFromHash(new URLSearchParams('clamp=rcd'), presets);
    expect(back.values.R).toBe(String(clampValues('clamp-rcd').R));
    expect(stateFromHash(new URLSearchParams(''), presets).kind).toBe('tvs');
  });
});

describe('clamp-check robustness', () => {
  const tvs = strings(clampValues('clamp-tvs'));
  it('a value too large for a number, or one that overflows the check, gives the invalid message, not a crash', () => {
    expect(checkOf('tvs', tvs)).not.toBeNull();
    for (const [k, v] of [['Ipk', '1e400'], ['Vg', 'Infinity'], ['Ipk', '1e200'], ['Llk', '1e308']] as const) {
      expect(checkOf('tvs', { ...tvs, [k]: v })).toBeNull();
    }
    expect(checkOf('rcd', { ...strings(clampValues('clamp-rcd')), R: '1e308' })).toBeNull();
  });

  it("the hash keeps the other clamp type's values too", () => {
    const presets: ClampPreset[] = [{ id: 't', label: 't', kind: 'tvs', values: clampValues('clamp-tvs') }];
    const values: Record<string, string> = { ...tvs, VBR: '55', R: '3300' };
    const back = stateFromHash(new URLSearchParams(hashOf('rcd', values)), presets);
    expect(back.values.VBR).toBe('55');
    expect(back.values.R).toBe('3300');
  });
});
