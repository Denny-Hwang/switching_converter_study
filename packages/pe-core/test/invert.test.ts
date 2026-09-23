import { describe, expect, it } from 'vitest';
import { evaluate } from '../src/equations';
import { InvertError, invert } from '../src/invert';

const rel = (a: number, b: number) => Math.abs(a - b) / Math.abs(b);

describe('invert', () => {
  // [equation, unknown, the other inputs, the unknown's true value, bracket]
  const cases: [string, string, Record<string, number>, number, [number, number]][] = [
    ['buck.ccm.M', 'D', {}, 0.37, [0, 1]],
    ['boost.ccm.M', 'D', {}, 0.62, [0, 0.999999]],
    ['buckboost.ccm.M', 'D', {}, 0.45, [0, 0.999999]],
    ['flyback.ccm.M', 'D', { n: 0.25 }, 0.3, [0, 0.999999]],
    ['forward.ccm.M', 'D', { n: 0.5 }, 0.4, [0, 1]],
    ['buck.ripple.iL', 'L', { V_g: 24, V: 12, D: 0.5, T_s: 1e-5 }, 4.7e-5, [1e-12, 10]],
    ['boost.ripple.iL', 'L', { V_g: 12, D: 0.5, T_s: 1e-5 }, 1e-4, [1e-12, 10]],
    ['buck.ripple.v', 'C', { Delta_i_L: 0.3, T_s: 1e-5 }, 4.7e-5, [1e-15, 10]],
    ['boost.ripple.v', 'C', { V: 24, D: 0.5, T_s: 1e-5, R: 10 }, 2.2e-5, [1e-15, 10]],
    ['K.def', 'L', { R: 10, T_s: 1e-5 }, 3.3e-5, [1e-12, 10]],
  ];
  for (const [id, unknown, inputs, x, [lo, hi]] of cases) {
    it(`${id} solved for ${unknown} returns the value it was evaluated at`, () => {
      const y = evaluate(id, { ...inputs, [unknown]: x });
      const got = invert(id, unknown, y, inputs, lo, hi);
      expect(rel(got, x)).toBeLessThan(1e-12);
      expect(rel(evaluate(id, { ...inputs, [unknown]: got }), y)).toBeLessThan(1e-12);
    });
  }

  it('a target outside the bracket is an error, not a wrong answer', () => {
    // a buck cannot step up: no duty ratio in [0, 1] gives M = 1.5
    expect(() => invert('buck.ccm.M', 'D', 1.5, {}, 0, 1)).toThrow(InvertError);
    expect(() => invert('buck.ccm.M', 'D', 0.5, {}, 1, 0)).toThrow(InvertError);
  });

  it('a target equal to the value at an end of a logarithmic bracket returns that end', () => {
    const y = evaluate('K.def', { L: 1e-6, R: 10, T_s: 1e-5 });
    expect(invert('K.def', 'L', y, { R: 10, T_s: 1e-5 }, 1e-6, 1)).toBe(1e-6);
    const z = evaluate('K.def', { L: 1, R: 10, T_s: 1e-5 });
    expect(invert('K.def', 'L', z, { R: 10, T_s: 1e-5 }, 1e-6, 1)).toBe(1);
  });

  it('a target or an end value that is not a finite number is an error', () => {
    expect(() => invert('buck.ccm.M', 'D', Number.NaN, {}, 0, 1)).toThrow(InvertError);
    expect(() => invert('buck.ccm.M', 'D', Number.POSITIVE_INFINITY, {}, 0, 1)).toThrow(InvertError);
    // K = 2L/(R T_s) with R = 0 is infinite at both ends
    expect(() => invert('K.def', 'L', 1, { R: 0, T_s: 1e-5 }, 1e-6, 1)).toThrow(InvertError);
  });

  it('works on a decreasing function (the ripple falls as C grows)', () => {
    const got = invert('buck.ripple.v', 'C', 0.01, { Delta_i_L: 0.4, T_s: 1e-5 }, 1e-12, 1);
    expect(rel(got, (0.4 * 1e-5) / (8 * 0.01))).toBeLessThan(1e-12);
  });
});
