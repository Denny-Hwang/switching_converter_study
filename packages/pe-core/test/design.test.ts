import { describe, expect, it } from 'vitest';
import { design, type DesignSpec } from '../src/design';
import { simulate } from '../src/sim';

const rel = (a: number, b: number) => Math.abs(a - b) / Math.abs(b);
const Ts = 1e-5;

// Synthetic specifications; the expected values are worked out here by hand
// arithmetic, independently of the catalogue and of design().
describe('converter designer', () => {
  it('buck: duty-ratio range, both inductance requirements, capacitance', () => {
    const s: DesignSpec = { topology: 'buck', VgMin: 18, VgMax: 36, V: 12, P: 24, Pmin: 2.4, fs: 1e5, rippleI: 0.2, rippleV: 0.005 };
    const r = design(s);
    expect(rel(r.D.min, 12 / 36)).toBeLessThan(1e-12);
    expect(rel(r.D.max, 12 / 18)).toBeLessThan(1e-12);
    // ripple target: Delta_i = 0.2 * (12/6) = 0.4 A, worst at V_g,max: (36 - 12)(1/3) Ts/(2L) = 0.4
    expect(rel(r.L.ripple, ((36 - 12) * (1 / 3) * Ts) / (2 * 0.4))).toBeLessThan(1e-9);
    // CCM at 2.4 W (R = 60 ohm): K_crit = 1 - D is largest at D = 1/3
    expect(rel(r.L.ccm, ((2 / 3) * 60 * Ts) / 2)).toBeLessThan(1e-9);
    expect(r.L.binding).toBe('ccm');
    expect(r.L.chosen).toBe(r.L.ccm);
    const dI = ((36 - 12) * (1 / 3) * Ts) / (2 * r.L.chosen);
    expect(rel(r.worst.dI, dI)).toBeLessThan(1e-9);
    expect(rel(r.worst.Ipk, 2 + dI)).toBeLessThan(1e-9);
    // output ripple 0.005 * 12 = 0.06 V (half p-p): C = Delta_i Ts/(8 Delta_v)
    expect(rel(r.C, (dI * Ts) / (8 * 0.06))).toBeLessThan(1e-9);
    expect(r.worst.Vds).toBe(36);
    expect(r.warnings).toEqual([]);
  });

  it('boost: the worst cases fall at different ends of the input range', () => {
    const s: DesignSpec = { topology: 'boost', VgMin: 9, VgMax: 15, V: 24, P: 48, Pmin: 4.8, fs: 1e5, rippleI: 0.2, rippleV: 0.005 };
    const r = design(s);
    expect(rel(r.D.min, 1 - 15 / 24)).toBeLessThan(1e-12);
    expect(rel(r.D.max, 1 - 9 / 24)).toBeLessThan(1e-12);
    // required L = V_g D Ts / (2 * 0.2 * I_L) with I_L = 24/((1 - D) 12); largest at V_g = 15 here
    const need = (Vg: number) => {
      const D = 1 - Vg / 24;
      return (Vg * D * Ts) / (2 * 0.2 * (24 / ((1 - D) * 12)));
    };
    expect(rel(r.L.ripple, Math.max(need(9), need(12), need(15)))).toBeLessThan(1e-9);
    // K_crit = D (1 - D)^2 peaks at D = 1/3, below the range: the largest is at D = 0.375
    const Kc = 0.375 * 0.625 ** 2;
    expect(rel(r.worst.KcritMax, Kc)).toBeLessThan(1e-12);
    expect(rel(r.L.ccm, (Kc * 120 * Ts) / 2)).toBeLessThan(1e-9);
    // C from the capacitor feeding the load for D Ts, worst at D = 0.625
    expect(rel(r.C, (24 * 0.625 * Ts) / (2 * 12 * 0.12))).toBeLessThan(1e-9);
    expect(r.worst.Vds).toBe(24);
  });

  it('flyback: the diode drop enters the duty ratio, the ripple sizes L_M', () => {
    const s: DesignSpec = {
      topology: 'flyback', VgMin: 36, VgMax: 72, V: 12, VD: 0.5, n: 0.25, P: 24, Pmin: 0, fs: 1e5, rippleI: 0.3, rippleV: 0.01,
    };
    const r = design(s);
    const Dat = (Vg: number) => 12.5 / (12.5 + 0.25 * Vg);
    expect(rel(r.D.max, Dat(36))).toBeLessThan(1e-12);
    expect(rel(r.D.min, Dat(72))).toBeLessThan(1e-12);
    const need = (Vg: number) => {
      const D = Dat(Vg);
      const IM = (0.25 * 12) / ((1 - D) * 6);
      return (Vg * D * Ts) / (2 * 0.3 * IM);
    };
    expect(rel(r.L.ripple, need(72))).toBeLessThan(1e-9);
    expect(r.L.ccm).toBe(0);
    expect(r.L.binding).toBe('ripple');
    expect(rel(r.worst.Vds, 72 + 12.5 / 0.25)).toBeLessThan(1e-12);
    expect(rel(r.worst.Vr!, 12 + 0.25 * 72)).toBeLessThan(1e-12);
  });

  it('forward: a duty ratio above the reset limit is flagged', () => {
    const s: DesignSpec = { topology: 'forward', VgMin: 36, VgMax: 72, V: 5, n: 0.25, nr: 1, P: 25, Pmin: 0, fs: 1e5, rippleI: 0.2, rippleV: 0.01 };
    const r = design(s);
    expect(rel(r.D.max, 5 / (0.25 * 36))).toBeLessThan(1e-12);
    expect(r.Dmax).toBe(0.5);
    expect(r.warnings).toContain('reset');
    expect(r.worst.Vr).toBeUndefined();
  });

  it('flyback with a diode drop: the CCM boundary is the ideal flyback’s with the output V + V_D (the simulator agrees)', () => {
    const s: DesignSpec = {
      topology: 'flyback', VgMin: 36, VgMax: 72, V: 5, VD: 0.5, n: 0.1, P: 20, Pmin: 2, fs: 1e5, rippleI: 0.3, rippleV: 0.01,
    };
    const r = design(s);
    // K_crit = ((1 - D)/n)^2 is largest at the smallest D, at V_g = 72; the load 12.5 ohm referred to 5.5 V
    const D72 = 5.5 / (5.5 + 0.1 * 72);
    const Kc = ((1 - D72) / 0.1) ** 2;
    const Rlight = 25 / 2;
    expect(rel(r.L.ccm, (Kc * ((Rlight * 5.5) / 5) * Ts) / 2)).toBeLessThan(1e-9);
    expect(r.L.binding).toBe('ccm');
    // simulated at V_g = 72 V and the lightest load, with the diode drop: CCM just above L_ccm, DCM just below
    const at = (L: number) =>
      simulate({ topology: 'flyback', Vg: 72, D: D72, fs: 1e5, n: 0.1, L, VF: 0.5, load: { kind: 'resistive', R: Rlight, C: 1e-3 } });
    expect(at(1.1 * r.L.ccm).mode).toBe('CCM');
    expect(at(0.9 * r.L.ccm).mode).toBe('DCM');
    expect(r.warnings).toEqual([]);
  });

  it('an inductance sized exactly at the CCM boundary does not warn that the light load runs in DCM', () => {
    for (const s of [
      { topology: 'buckboost', VgMin: 9, VgMax: 15, V: 12, P: 12, Pmin: 1.2, fs: 1e5, rippleI: 0.2, rippleV: 0.005 },
      { topology: 'flyback', VgMin: 36, VgMax: 72, V: 12, VD: 0.5, n: 0.25, P: 24, Pmin: 2.4, fs: 1e5, rippleI: 0.3, rippleV: 0.01 },
      { topology: 'buck', VgMin: 18, VgMax: 36, V: 12, P: 24, Pmin: 2.4, fs: 1e5, rippleI: 0.2, rippleV: 0.005 },
    ] as DesignSpec[]) {
      const r = design(s);
      expect(r.L.binding).toBe('ccm');
      expect(r.warnings).not.toContain('dcmLight');
      expect(r.points.every((p) => p.mode === 'CCM')).toBe(true);
    }
  });

  it('a zero-width input range gives one operating point', () => {
    const r = design({ topology: 'buck', VgMin: 24, VgMax: 24, V: 12, P: 24, Pmin: 2.4, fs: 1e5, rippleI: 0.2, rippleV: 0.005 });
    expect(r.points).toHaveLength(1);
    expect(r.D.min).toBe(0.5);
  });

  it('a buck asked for more than its input, and an inductance that lets the light load go DCM', () => {
    const r = design({ topology: 'buck', VgMin: 10, VgMax: 36, V: 12, P: 24, Pmin: 2.4, fs: 1e5, rippleI: 0.2, rippleV: 0.005 });
    expect(r.warnings).toContain('unreachable');
    expect(Math.min(...r.points.map((p) => p.Vg))).toBeGreaterThan(12);
    const small = design({ topology: 'buck', VgMin: 18, VgMax: 36, V: 12, P: 24, Pmin: 2.4, fs: 1e5, rippleI: 0.2, rippleV: 0.005, L: 1e-5 });
    expect(small.L.binding).toBe('given');
    expect(small.warnings).toContain('dcmLight');
    expect(small.warnings).toContain('dcmFull');
  });
});
