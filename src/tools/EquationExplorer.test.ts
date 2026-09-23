import { describe, expect, it } from 'vitest';
import { evaluate } from 'pe-core';
import { parseField } from './EquationExplorer';

describe('equation explorer input fields', () => {
  it('reads numbers, including exponent notation', () => {
    expect(parseField('0.5')).toBe(0.5);
    expect(parseField(' 1e-5 ')).toBe(1e-5);
  });

  it('treats an empty or partial field as invalid, not as zero', () => {
    expect(parseField('')).toBeNaN();
    expect(parseField('   ')).toBeNaN();
    expect(parseField(undefined)).toBeNaN();
    expect(parseField('-')).toBeNaN();
  });

  it('an empty field makes the evaluation fail instead of returning a plausible value', () => {
    expect(() => evaluate('buck.ccm.M', { D: parseField('') })).toThrow(/non-finite/);
  });
});
