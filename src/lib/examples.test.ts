import { describe, expect, it } from 'vitest';
import { exampleNames, getExample } from './examples';

describe('synthetic examples (examples/synthetic/*.yaml)', () => {
  it('every example evaluates to finite numbers and is labelled synthetic in both languages', () => {
    const names = exampleNames();
    expect(names.length).toBeGreaterThan(0);
    for (const name of names) {
      const ex = getExample(name);
      expect(ex.label.toLowerCase(), name).toContain('synthetic');
      expect(ex.label_ko, name).toContain('합성');
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

  it('rejects an unknown example', () => {
    expect(() => getExample('no-such-example')).toThrow(/unknown synthetic example/);
  });
});
