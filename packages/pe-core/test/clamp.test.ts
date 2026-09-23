import { describe, expect, it } from 'vitest';
import { clampCheck, type ClampSpec } from '../src/clamp';

const rel = (a: number, b: number) => Math.abs(a - b) / Math.abs(b);

// Synthetic flyback, round numbers: V_OR = (12 + 0.5)/0.25 = 50 V, leakage power 1/2 2e-6 2^2 1e5 = 0.4 W.
const base: Omit<ClampSpec, 'clamp'> = { Vg: 72, V: 12, VD: 0.5, n: 0.25, Llk: 2e-6, Ipk: 2, fs: 1e5, Vrating: 150 };

describe('clamp check', () => {
  it('TVS: clamping voltage at the peak current, dissipation bounds, switch voltage, output ceiling', () => {
    const r = clampCheck({ ...base, clamp: { kind: 'tvs', VBR: 60, VCL: 90, IPP: 10 } });
    expect(rel(r.VOR, 50)).toBeLessThan(1e-12);
    expect(rel(r.Plk, 0.4)).toBeLessThan(1e-12);
    expect(rel(r.RD!, 3)).toBeLessThan(1e-12);
    expect(r.Vclamp).toEqual({ low: 60, high: 66 });
    // the leakage power times V_clamp/(V_clamp - V_OR): 66/16 at the peak clamping voltage, 60/10 at V_BR
    expect(rel(r.P.low, 0.4 * (66 / 16))).toBeLessThan(1e-12);
    expect(rel(r.P.high, 0.4 * (60 / 10))).toBeLessThan(1e-12);
    expect(r.Vds).toBe(72 + 66);
    expect(r.margin).toBe(150 - 138);
    expect(rel(r.ceiling!.low, 0.25 * 60 - 0.5)).toBeLessThan(1e-12);
    expect(rel(r.ceiling!.high, 0.25 * 66 - 0.5)).toBeLessThan(1e-12);
    expect(r.warnings).toEqual([]);
  });

  it('RCD: the resistor sets the clamp voltage, whose dissipation it carries', () => {
    const r = clampCheck({ ...base, clamp: { kind: 'rcd', R: 4687.5 } });
    // V_clamp^2/R = 0.4 W * V_clamp/(V_clamp - 50) at V_clamp = 75 V: 1.2 W both ways
    expect(rel(r.Vclamp.low, 75)).toBeLessThan(1e-12);
    expect(r.Vclamp.high).toBe(r.Vclamp.low);
    expect(rel(r.P.low, 1.2)).toBeLessThan(1e-12);
    expect(rel(r.P.low, r.Vclamp.low ** 2 / 4687.5)).toBeLessThan(1e-12);
    expect(rel(r.Vds, 147)).toBeLessThan(1e-12);
    // without a load the resistor must dissipate all of the input power, so the loaded clamp
    // voltage bounds nothing: no ceiling, and a warning
    expect(r.ceiling).toBeUndefined();
    expect(r.warnings).toEqual(['rcdOpenLoad']);
  });

  it('the leakage reset time, and a warning when it would not fit in a switching period', () => {
    // 2 uH * 2 A / (66 V - 50 V) at the TVS's peak voltage; the reset is slowest at V_BR: 2 uH * 2 A / 10 V
    const tvs = clampCheck({ ...base, clamp: { kind: 'tvs', VBR: 60, VCL: 90, IPP: 10 } });
    expect(rel(tvs.tReset, 4e-7)).toBeLessThan(1e-12);
    // an RCD resistor so small that the clamp voltage sits on V_OR: the reset never ends within a period
    for (const R of [1e-12, 1e-3]) {
      const r = clampCheck({ ...base, clamp: { kind: 'rcd', R } });
      expect(r.tReset).toBeGreaterThan(1 / base.fs);
      expect(r.warnings).toContain('slowReset');
      expect(r.warnings).not.toContain('belowReflected');
    }
    // a TVS just above V_OR
    const close = clampCheck({ ...base, clamp: { kind: 'tvs', VBR: 50.01, VCL: 90, IPP: 10 } });
    expect(close.warnings).toContain('slowReset');
  });

  it('refuses a TVS whose clamping voltage is not above its breakdown voltage', () => {
    expect(() => clampCheck({ ...base, clamp: { kind: 'tvs', VBR: 60, VCL: 60, IPP: 10 } })).toThrow(/V_CL/);
  });

  it('flags a clamp at or below the reflected voltage and a switch voltage above the rating', () => {
    const low = clampCheck({ ...base, clamp: { kind: 'tvs', VBR: 45, VCL: 70, IPP: 10 } });
    expect(low.warnings).toContain('belowReflected');
    expect(low.P.high).toBe(Number.POSITIVE_INFINITY);
    const high = clampCheck({ ...base, Vrating: 130, clamp: { kind: 'tvs', VBR: 60, VCL: 90, IPP: 10 } });
    expect(high.warnings).toContain('overRating');
    expect(high.margin).toBeLessThan(0);
  });
});
