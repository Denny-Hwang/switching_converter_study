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
    expect(rel(r.ceiling.low, 0.25 * 60 - 0.5)).toBeLessThan(1e-12);
    expect(rel(r.ceiling.high, 0.25 * 66 - 0.5)).toBeLessThan(1e-12);
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
