import { describe, expect, it } from 'vitest';
import { evaluate, magnetics } from 'pe-core';
import { CORES } from '../lib/cores';
import { MAG_PRESETS, magValues } from '../lib/magpresets';
import { FIELDS, frChart, hashOf, resultOf, stateFromHash, toMagSpec, withCore, type MagPreset } from './MagneticsDesigner';

const strings = (v: Record<string, number>) => Object.fromEntries(Object.entries(v).map(([k, x]) => [k, String(x)]));
const rel = (a: number, b: number) => Math.abs(a - b) / Math.abs(b);
const presets: MagPreset[] = MAG_PRESETS.map((p) => ({ id: p.example, label: p.example, device: p.device, core: p.core, arrangement: p.arrangement, values: magValues(p.example) }));
const inductor = withCore(strings(magValues('mag-inductor')), 'e25');
const flyback = withCore(strings(magValues('mag-flyback')), 'etd29');

describe('magnetics-designer form', () => {
  it('reads both examples: every field of the device is filled, and the design has no warning', () => {
    for (const p of presets) {
      const values = withCore(strings(p.values), p.core);
      for (const f of FIELDS.filter((f) => !f.flyback || p.device === 'flyback')) {
        if (!f.optional) expect(values[f.key], `${p.id}: ${f.key}`).not.toBe('');
      }
      const r = resultOf(p.device, p.core, p.arrangement ?? 'ps', values);
      expect(r, p.id).not.toBeNull();
      expect(r!.warnings, p.id).toEqual([]);
      // the fewest whole turns: B_pk at the smallest cross-section within B_max, one turn fewer beyond it
      expect(r!.BpkMin).toBeLessThanOrEqual(r!.spec.Bmax);
      expect(evaluate('mag.B_pk', { L: r!.spec.L, I_pk: r!.spec.Ipk, N: r!.N - 1, A_e: r!.Acheck })).toBeGreaterThan(r!.spec.Bmax);
    }
  });

  it('takes a table core from the core table, with its gapped sets', () => {
    const spec = toMagSpec('inductor', 'e25', 'ps', inductor)!;
    const e25 = CORES.find((c) => c.id === 'e25')!;
    expect(spec.core).toBe(e25.core);
    const r = magnetics(spec);
    expect(r.options).toHaveLength(e25.core.gapped!.length);
    // a smaller A_L needs more turns and so gives a lower flux density
    for (let i = 1; i < r.options.length; i++) expect(r.options[i]!.N).toBeGreaterThanOrEqual(r.options[i - 1]!.N);
    // an own core has no data-sheet gapped sets
    const own = toMagSpec('inductor', 'custom', 'ps', inductor)!;
    expect(own.core.gapped).toBeUndefined();
    expect(magnetics(own).options).toEqual([]);
  });

  it('rejects missing and out-of-range values', () => {
    expect(toMagSpec('inductor', 'e25', 'ps', { ...inductor, L: '' })).toBeNull();
    expect(toMagSpec('inductor', 'e25', 'ps', { ...inductor, ksP: '1.5' })).toBeNull();
    expect(toMagSpec('inductor', 'e25', 'ps', { ...inductor, mP: '0' })).toBeNull();
    expect(toMagSpec('inductor', 'e25', 'ps', { ...inductor, oP: '0.0005' })).toBeNull(); // insulated thinner than bare
    expect(toMagSpec('inductor', 'e25', 'ps', { ...inductor, KuMax: '1.2' })).toBeNull();
    expect(toMagSpec('inductor', 'e25', 'ps', { ...inductor, Tw: '-300' })).toBeNull();
    expect(toMagSpec('inductor', 'custom', 'ps', { ...inductor, Amin: '0.0001' })).toBeNull(); // A_min above A_e
    expect(toMagSpec('inductor', 'e25', 'ps', { ...inductor, N: '17.5' })).toBeNull();
    expect(toMagSpec('flyback', 'etd29', 'ps', { ...flyback, IrmsS: '' })).toBeNull();
    expect(toMagSpec('inductor', 'e25', 'ps', { ...inductor, dI: '2.5' })).toBeNull(); // half ripple above the peak
  });

  it('accepts the optional fields empty, and zero where zero means something', () => {
    const noRipple = toMagSpec('inductor', 'e25', 'ps', { ...inductor, dI: '' })!;
    expect(noRipple.dI).toBeUndefined();
    expect(magnetics(noRipple).Bac).toBeUndefined();
    expect(toMagSpec('inductor', 'e25', 'ps', { ...inductor, dI: '0' })!.dI).toBe(0);
    expect(toMagSpec('flyback', 'etd29', 'ps', { ...flyback, hg: '0' })!.hg).toBe(0);
    expect(toMagSpec('inductor', 'e25', 'ps', { ...inductor, Tw: '-40' })).not.toBeNull();
    // the inductor ignores the flyback's fields
    expect(toMagSpec('inductor', 'e25', 'ps', { ...inductor, n: '', dS: '' })).not.toBeNull();
  });

  it('uses the turns entered, and warns when they saturate the core', () => {
    const fewest = resultOf('inductor', 'e25', 'ps', inductor)!;
    const r = resultOf('inductor', 'e25', 'ps', { ...inductor, N: String(fewest.N - 3) })!;
    expect(r.N).toBe(fewest.N - 3);
    expect(r.warnings).toContain('saturation');
  });

  it('the chart: F_R of each winding from f_s/20 to 50 f_s, 1 at low frequency and rising', () => {
    const c = frChart(resultOf('flyback', 'etd29', 'ps', flyback)!);
    expect(c.secondary).toBeDefined();
    expect(rel(c.f[0]!, 1e5 / 20)).toBeLessThan(1e-12);
    expect(rel(c.f[c.f.length - 1]!, 1e5 * 50)).toBeLessThan(1e-12);
    for (const y of [c.primary, c.secondary!]) {
      expect(y[0]!).toBeGreaterThanOrEqual(1);
      expect(y[y.length - 1]!).toBeGreaterThan(y[0]!);
    }
    expect(frChart(resultOf('inductor', 'e25', 'ps', inductor)!).secondary).toBeUndefined();
  });
});

describe('magnetics-designer URL hash', () => {
  it('round-trips the state, and a table core always holds its table values', () => {
    const s = stateFromHash(new URLSearchParams(''), presets);
    expect(s.device).toBe('inductor');
    expect(s.core).toBe('e25');
    const back = stateFromHash(new URLSearchParams(hashOf(s)), presets);
    expect(back).toEqual(s);
    // a hash with other core values for a table core gets the table's values back
    const h = new URLSearchParams(hashOf(s));
    h.set('Ae', '1');
    expect(stateFromHash(h, presets).values.Ae).toBe(inductor.Ae);
  });

  it('keeps an own core, the flyback and its arrangement, and an emptied optional field', () => {
    const s = { device: 'flyback' as const, core: 'custom' as const, arr: 'psp' as const, values: { ...flyback, Ae: '0.0001', Amin: '0.00009', N: '' } };
    const back = stateFromHash(new URLSearchParams(hashOf(s)), presets);
    expect(back.device).toBe('flyback');
    expect(back.core).toBe('custom');
    expect(back.arr).toBe('psp');
    expect(back.values.Ae).toBe('0.0001');
    expect(back.values.N).toBe('');
  });

  it('an own core missing from the hash starts from the preset core’s values', () => {
    const s = stateFromHash(new URLSearchParams('core=custom&Ae=0.00006'), presets);
    expect(s.core).toBe('custom');
    expect(s.values.Ae).toBe('0.00006');
    expect(s.values.le).toBe(inductor.le);
    expect(resultOf(s.device, s.core, s.arr, s.values)).not.toBeNull();
  });

  it('a hash of another device takes that device’s preset for the fields it lacks', () => {
    const s = stateFromHash(new URLSearchParams('dev=flyback'), presets);
    expect(s.core).toBe('etd29');
    expect(s.arr).toBe('ps');
    expect(s.values.n).toBe(flyback.n);
  });
});
