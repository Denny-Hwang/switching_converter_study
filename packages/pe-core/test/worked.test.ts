import { describe, expect, it } from 'vitest';
import { checkCondition, runSteps } from '../src/worked';

describe('runSteps', () => {
  it('feeds each result into the next step under its lhs', () => {
    const { context, results } = runSteps({ D: 0.5, V_g: 24, f_s: 1e5 }, ['def.Ts', 'buck.ccm.M', 'def.V']);
    expect(context.T_s).toBeCloseTo(1e-5, 15);
    expect(context.V).toBeCloseTo(12, 12);
    expect(results.map((r) => r.name)).toEqual(['T_s', 'M', 'V']);
  });

  it('stores under an alias and binds inputs to other names', () => {
    const { context } = runSteps({ D: 0.5, K: 0.2, V_g: 24 }, [
      { eq: 'buck.dcm.M', as: 'M_dcm' },
      { eq: 'def.V', bind: { M: 'M_dcm' }, as: 'V_dcm' },
    ]);
    expect(context.M).toBeUndefined();
    expect(context.V_dcm).toBeCloseTo(context.M_dcm! * 24, 12);
  });

  it('fails on an input that no parameter or earlier step defines', () => {
    expect(() => runSteps({ D: 0.5 }, ['def.V'])).toThrow(/input "M"/);
  });
});

describe('checkCondition', () => {
  it('compares names and numeric literals', () => {
    expect(checkCondition('K > K_crit', { K: 2, K_crit: 0.5 })).toBe(true);
    expect(checkCondition('K >= 2', { K: 2 })).toBe(true);
    expect(checkCondition('D < 0.5', { D: 0.5 })).toBe(false);
    expect(checkCondition('D <= 0.5', { D: 0.5 })).toBe(true);
  });

  it('rejects unknown names and unsupported expressions', () => {
    expect(() => checkCondition('K > K_crit', { K: 1 })).toThrow(/unknown name/);
    expect(() => checkCondition('K + 1 > 2', { K: 1 })).toThrow(/unsupported/);
  });
});
