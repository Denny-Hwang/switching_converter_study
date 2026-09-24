import { describe, expect, it } from 'vitest';
import { COPPER, evaluate } from 'pe-core';
import { resultOf, withCore } from '../tools/MagneticsDesigner';
import { coreById } from './cores';
import { coreKg } from './corekg';
import { getExample } from './examples';
import { magValues } from './magpresets';

/**
 * What the design-procedure page (04-magnetics/design-procedure, EN and KO)
 * says about its worked example and its "Try it": the K_g inductor example
 * needs a core between the table's two, the ETD 29 has about twice the K_g
 * needed, and the magnetics designer's preset mag-kg on it meets the flux
 * limit, the window and the resistance budget; on the E 25 the same wire no
 * longer fits, and wire thin enough to fit exceeds the budget.
 */

const strings = (v: Record<string, number>) => Object.fromEntries(Object.entries(v).map(([k, x]) => [k, String(x)]));
const need = getExample('kg-inductor');
const budget = need.params.R_dcmax!;
const Ku = need.params.K_u!;

describe('the design-procedure page, as its worked example computes', () => {
  it("its Try it: doubling B_max divides the K_g needed by four; halving R_dc,max doubles it", () => {
    const x = { rho_w: 1.7241e-8, L: need.params.L!, I_pk: need.params.I_pk!, B_max: need.params.B_max!, R_dcmax: budget, K_u: Ku };
    const kg = evaluate('mag.Kg_req', x);
    expect(evaluate('mag.Kg_req', { ...x, B_max: 2 * x.B_max }) / kg).toBeCloseTo(0.25, 12);
    expect(evaluate('mag.Kg_req', { ...x, R_dcmax: x.R_dcmax / 2 }) / kg).toBeCloseTo(2, 12);
  });

  it('the ETD 29 has about twice the K_g the example needs; the E 25 too little', () => {
    const [e25, etd29] = coreKg(need.context.K_g!);
    expect(e25!.margin).toBeLessThan(1);
    expect(etd29!.margin).toBeGreaterThan(1.5);
    expect(etd29!.margin).toBeLessThan(2.5);
  });

  it('on the ETD 29: turns rounded up at the smallest cross-section, three strands in four layers within K_u, the resistance within budget', () => {
    const v = magValues('mag-kg');
    expect([v.ksP, v.mP]).toEqual([3, 4]);
    // the preset carries the kg-inductor operating point
    expect([v.L, v.Ipk, v.Irms, v.Bmax, v.KuMax]).toEqual([need.params.L, need.params.I_pk, need.params.I_rms, need.params.B_max, need.params.K_u]);
    const r = resultOf('inductor', 'etd29', 'ps', withCore(strings(v), 'etd29'))!;
    const core = coreById('etd29')!.core;
    expect(r.Acheck).toBe(core.Amin ?? core.Ae);
    expect(r.N).toBe(Math.ceil(r.Nmin));
    expect(r.N).toBeGreaterThan(r.Nmin);
    expect(r.warnings).toEqual([]);
    expect(r.Ku).toBeLessThan(Ku);
    expect(r.primary.Rdc).toBeLessThan(budget);
    // Dowell's factor at f_s is large for this winding, but only the ripple flows at f_s: its rms value (a
    // triangle of half-amplitude Delta_i_L) is a small fraction of the rms current
    expect(r.primary.FR).toBeGreaterThan(10);
    expect(v.dI! / Math.sqrt(3) / v.Irms!).toBeLessThan(0.1);
  });

  it('on the E 25: more turns, the same wire overflows the window, and any wire that fits exceeds the budget', () => {
    const v = magValues('mag-kg');
    const etd = resultOf('inductor', 'etd29', 'ps', withCore(strings(v), 'etd29'))!;
    const e25 = resultOf('inductor', 'e25', 'ps', withCore(strings(v), 'e25'))!;
    expect(e25.N).toBeGreaterThan(etd.N);
    expect(e25.warnings).toContain('window');
    // the least resistance these turns can have on this core: all of K_u times the window in copper
    const core = coreById('e25')!.core;
    const rho = COPPER.rho20 * (1 + COPPER.alpha20 * (v.Tw! - 20));
    const least = (rho * e25.N ** 2 * core.MLT) / (Ku * core.WA);
    expect(least).toBeGreaterThan(budget);
    // and as the designer computes it: the thickest of these strands that fits has more resistance than the budget
    let fits: number | undefined;
    for (let d = v.dP!; d > 1e-4; d *= 0.98) {
      const r = resultOf('inductor', 'e25', 'ps', withCore(strings({ ...v, dP: d, oP: d * (v.oP! / v.dP!) }), 'e25'));
      if (r && !r.warnings.includes('window')) {
        fits = r.primary.Rdc;
        break;
      }
    }
    expect(fits).toBeDefined();
    expect(fits!).toBeGreaterThan(budget);
  });
});
