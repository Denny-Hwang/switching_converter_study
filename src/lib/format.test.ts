import { describe, expect, it } from 'vitest';
import { displayUnit, fmtValue, formatSI } from './format';

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

  it('rounds a computed value as the decimal it stands for, not its binary noise', () => {
    // 4.5 A rms in 30 mΩ: 0.6075 W, computed as 0.60749999…
    expect(4.5 ** 2 * 0.03).toBeLessThan(0.6075);
    expect(formatSI(4.5 ** 2 * 0.03, 'W')).toBe('608 mW');
    expect(formatSI(4.5 ** 2 * 0.03, 'W', 4)).toBe('607.5 mW');
    expect(formatSI(0.6074, 'W')).toBe('607 mW');
  });

  it('moves to the next prefix instead of printing 1000', () => {
    expect(formatSI(999.8, 'V')).toBe('1 kV');
  });

  it('writes lengths, areas and volumes of parts in millimetres, and resistivity with a prefix', () => {
    expect(formatSI(2.5e-4, 'm')).toBe('0.25 mm');
    expect(formatSI(0.0575, 'm')).toBe('57.5 mm');
    expect(formatSI(52.5e-6, 'm²')).toBe('52.5 mm²');
    expect(formatSI(1.9634954e-7, 'm²')).toBe('0.196 mm²');
    expect(formatSI(3.02e-6, 'm³')).toBe('3020 mm³');
    expect(formatSI(1.7241e-8, 'Ω·m', 5)).toBe('17.241 nΩ·m');
    // beyond the size of a part: plain SI
    expect(formatSI(2, 'm')).toBe('2 m');
    // the core geometrical constant, in cm⁵ as textbook tables give it
    expect(formatSI(5.245733888888889e-12, 'm⁵')).toBe('0.0525 cm⁵');
    expect(formatSI(1.0611212121212122e-11, 'm⁵')).toBe('0.106 cm⁵');
  });

  it('handles zero, negative and non-finite values', () => {
    expect(formatSI(0, 'V')).toBe('0 V');
    expect(formatSI(-4, 'V')).toBe('−4 V');
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

describe('prefix of the printed value, signs and plain digits', () => {
  it('chooses the prefix after rounding to the digits shown', () => {
    expect(fmtValue(999.6, 'V')).toBe('999.6 V');
    expect(fmtValue(999.96, 'V')).toBe('1 kV');
    expect(formatSI(999.6, 'V')).toBe('1 kV');
    expect(fmtValue(999600, 'W')).toBe('999.6 kW');
  });

  it('writes negative values with a minus sign', () => {
    expect(formatSI(-0.5, '1')).toBe('−0.5');
    expect(fmtValue(-0.0021, 'A')).toBe('−2.1 mA');
    expect(fmtValue(-Infinity, 'V')).toBe('−∞');
  });

  it('keeps plain digits below 1e5 for units that take no prefix', () => {
    expect(fmtValue(12345, '×')).toBe('12350 ×');
    expect(fmtValue(1234.5, '%', 3)).toBe('1230 %');
    expect(fmtValue(123456, '×')).toBe('1.235e+5 ×');
  });
});

describe('displayUnit: the unit formatSI writes a value in', () => {
  it('is the SI unit, which takes a prefix, for the electrical units', () => {
    expect(displayUnit(12, 'V')).toEqual({ unit: 'V', factor: 1 });
    expect(displayUnit(25e-6, 'H')).toEqual({ unit: 'H', factor: 1 });
  });

  it('is cm⁵ for a small core constant and mm for a small length, as formatSI prints them', () => {
    expect(displayUnit(5.25e-12, 'm⁵')).toEqual({ unit: 'cm⁵', factor: 1e10 });
    expect(formatSI(5.25e-12, 'm⁵')).toBe('0.0525 cm⁵');
    expect(displayUnit(2.5e-4, 'm')).toEqual({ unit: 'mm', factor: 1e3 });
    expect(formatSI(2.5e-4, 'm')).toBe('0.25 mm');
    expect(displayUnit(2, 'm')).toEqual({ unit: 'm', factor: 1 });
  });
});
