import { describe, expect, it } from 'vitest';
import { fmtValue, formatSI } from './format';

describe('formatSI', () => {
  it('attaches SI prefixes to prefixable units', () => {
    expect(formatSI(1e5, 'Hz')).toBe('100 kHz');
    expect(formatSI(1e-5, 's')).toBe('10 µs');
    expect(formatSI(0.3, 'A')).toBe('300 mA');
    expect(formatSI(2.5e-5, 'H')).toBe('25 µH');
    expect(formatSI(31622.776601683792, 'rad/s')).toBe('31.6 krad/s');
    expect(formatSI(24, 'V')).toBe('24 V');
  });

  it('rounds to significant figures and drops trailing zeros', () => {
    expect(formatSI(0.9615384615384615, '1')).toBe('0.962');
    expect(formatSI(0.5, '1')).toBe('0.5');
    expect(formatSI(2000, '1')).toBe('2000');
    expect(formatSI(12345, '1')).toBe('12300');
    expect(formatSI(2.5e6, '1')).toBe('2.50e+6');
    expect(formatSI(2e-4, '1')).toBe('0.0002');
    expect(formatSI(15.705, 'V', 3)).toBe('15.7 V');
  });

  it('moves to the next prefix instead of printing 1000', () => {
    expect(formatSI(999.8, 'V')).toBe('1 kV');
  });

  it('handles zero, negative and non-finite values', () => {
    expect(formatSI(0, 'V')).toBe('0 V');
    expect(formatSI(-4, 'V')).toBe('-4 V');
    expect(formatSI(Number.POSITIVE_INFINITY, 'V')).toBe('Infinity');
  });
});

describe('fmtValue', () => {
  it('writes results with SI prefixes', () => {
    expect(fmtValue(2e-4, 'H')).toBe('200 µH');
    expect(fmtValue(4.1666666e-6, 'F')).toBe('4.167 µF');
    expect(fmtValue(0.3333333, '')).toBe('0.3333');
    expect(fmtValue(28.5, '%')).toBe('28.5 %');
  });

  it('marks a missing value and an unbounded one', () => {
    expect(fmtValue(undefined, 'V')).toBe('—');
    expect(fmtValue(Number.NaN, 'V')).toBe('—');
    expect(fmtValue(Number.POSITIVE_INFINITY)).toBe('∞');
  });
});
