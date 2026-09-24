import { describe, expect, it } from 'vitest';
import { evaluate } from 'pe-core';
import { coreById } from './cores';
import { exampleNames, getExample, symbolOf } from './examples';

describe('synthetic examples (examples/synthetic/*.yaml)', () => {
  it('every example evaluates to finite numbers and is labelled as an example in both languages', () => {
    const names = exampleNames();
    expect(names.length).toBeGreaterThan(0);
    for (const name of names) {
      const ex = getExample(name);
      expect(ex.label.toLowerCase(), name).toContain('example');
      expect(ex.label_ko, name).toContain('예제');
      for (const r of ex.results) expect(Number.isFinite(r.value), `${name}: ${r.name}`).toBe(true);
    }
  });

  it('buck-basic reproduces hand-checked values and is in CCM', () => {
    const { context: c, checkResults } = getExample('buck-basic');
    expect(c.T_s).toBeCloseTo(1e-5, 15);
    expect(c.v_s_avg).toBeCloseTo(12, 12);
    expect(c.V).toBeCloseTo(12, 12);
    expect(c.Delta_i_L).toBeCloseTo(0.3, 12);
    expect(c.K).toBeCloseTo(2, 12);
    expect(c.K_crit).toBeCloseTo(0.5, 12);
    expect(c.L_crit).toBeCloseTo(2.5e-5, 15);
    expect(checkResults).toEqual([{ when: 'K > K_crit', ok: true, text: { en: 'CCM', ko: 'CCM' } }]);
  });

  it('buck-light-load is in DCM, with a ratio above D and D + D_2 < 1', () => {
    const { context: c, checkResults } = getExample('buck-light-load');
    expect(checkResults[0]?.ok).toBe(false);
    expect(checkResults[0]?.text.en).toBe('DCM');
    expect(c.M_dcm!).toBeGreaterThan(c.D!);
    expect(c.D! + c.D_2!).toBeLessThan(1);
    expect(c.V_dcm).toBeCloseTo(c.M_dcm! * c.V_g!, 12);
  });

  it('boost-basic: the winding resistance lowers the ratio and the efficiency', () => {
    const { context: c } = getExample('boost-basic');
    expect(c.M_ideal).toBeCloseTo(2, 12);
    expect(c.M).toBeCloseTo(2 / 1.04, 12);
    expect(c.eta).toBeCloseTo(1 / 1.04, 12);
    expect(c.omega_z).toBeCloseTo(50000, 6);
  });

  it('control-basic: dc loop gain and disturbance suppression', () => {
    const { context: c } = getExample('control-basic');
    expect(c.D).toBeCloseTo(0.5, 12);
    expect(c.G_vd).toBeCloseTo(24, 12);
    expect(c.T_loop).toBeCloseTo(24, 12);
    expect(c.S_dist).toBeCloseTo(1 / 25, 12);
  });

  it('a suffixed name stands for its catalogue symbol (a quantity given twice)', () => {
    expect(symbolOf('f_lo')).toEqual({ symbol: 'f', suffix: 'lo' });
    expect(symbolOf('L_app')).toEqual({ symbol: 'L_app', suffix: '' });
    expect(symbolOf('F_R_low')).toEqual({ symbol: 'F_R', suffix: 'low' });
    expect(symbolOf('no_such_symbol_')).toBeUndefined();
  });

  it('kg-inductor: the core geometrical constant it needs lies between the two table cores', () => {
    const { context: c } = getExample('kg-inductor');
    expect(c.rho_w).toBeCloseTo(1.7241e-8 * (1 + 0.00393 * 80), 20);
    expect(c.K_g).toBeCloseTo((c.rho_w! * 1e-8 * 25) / (0.09 * 0.03 * 0.4), 24);
    expect(c.P_cu).toBeCloseTo(4.5 ** 2 * 0.03, 12);
    const kg = (id: string) => {
      const k = coreById(id)!.core;
      return evaluate('mag.Kg_core', { A_e: k.Ae, W_A: k.WA, MLT: k.MLT });
    };
    // the E 25 core is too small for it, the ETD 29 core is not (design-procedure page)
    expect(kg('e25')).toBeLessThan(c.K_g!);
    expect(kg('etd29')).toBeGreaterThan(c.K_g!);
  });

  it('dowell-foil: the foil is thicker than the thickness of least loss, where the loss is lower', () => {
    const { context: c } = getExample('dowell-foil');
    expect(c.phi_l).toBeCloseTo(3e-4 / c.delta_s!, 12);
    expect(c.phi_l!).toBeGreaterThan(1); // beyond the series' range: it overestimates here
    expect(c.F_R_low!).toBeGreaterThan(c.F_R!);
    expect(c.phi_opt!).toBeLessThan(c.phi_l!);
    expect(c.P_rel_opt!).toBeLessThan(c.P_rel!);
    expect(c.F_R_opt!).toBeCloseTo(4 / 3, 1);
  });

  it('coupled-pair: the coupled-inductor and transformer-model short-circuit inductances agree', () => {
    const { context: c } = getExample('coupled-pair');
    expect(c.k_c).toBeCloseTo(100 / 101, 14);
    expect(c.L_sc).toBeCloseTo(c.L_sc_T!, 18);
    // and the transformer model reproduces the measured inductances (n = 0.25, L_l2 = n^2 L_l2')
    expect(c.L_11).toBeCloseTo(c.L_l1! + c.L_M!, 18);
    expect(c.L_12).toBeCloseTo(0.25 * c.L_M!, 18);
    expect(c.L_22).toBeCloseTo(0.25 ** 2 * (c.L_l2p! + c.L_M!), 18);
  });

  it('rc-snubber: the parasitics give back both ringing frequencies; the snubber is sized as the page says', () => {
    const { context: c } = getExample('rc-snubber');
    const f = (C: number) => 1 / (2 * Math.PI * Math.sqrt(c.L_par! * C));
    expect(f(c.C_par!) / c.f_r0!).toBeCloseTo(1, 12);
    expect(f(c.C_par! + c.C_add!) / c.f_r1!).toBeCloseTo(1, 12);
    // "twice C_par", within AN11160's one to two times
    expect(c.C_snub! / c.C_par!).toBeCloseTo(2, 12);
    // "the middle of the range" 0.5 to 1: the resistor between sqrt(L_par/C_snub) and twice that
    expect(c.zeta).toBe(0.75);
    const Z0 = Math.sqrt(c.L_par! / c.C_snub!);
    expect(c.R_snub! / Z0).toBeCloseTo(1.5, 12);
    expect(c.P).toBeCloseTo(0.1, 12);
  });

  it('lcr-srf: the reading is close to L well below the self-resonance and far above it near it', () => {
    const { context: c } = getExample('lcr-srf');
    expect(c.f_hi!).toBeLessThan(c.f_srf!);
    expect(c.L_app_lo! / c.L! - 1).toBeLessThan(0.01);
    expect(c.L_app_hi! / c.L!).toBeGreaterThan(4);
  });

  it('rejects an unknown example', () => {
    expect(() => getExample('no-such-example')).toThrow(/unknown synthetic example/);
  });
});
