import { describe, expect, it } from 'vitest';
import { formatSI } from './format';

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
