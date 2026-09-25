import { describe, expect, it } from 'vitest';
import { parseSI } from './siparse';

describe('parseSI: the numbers a tool field accepts', () => {
  it.each([
    ['0.0001', 1e-4],
    ['1e-4', 1e-4],
    ['1E-4', 1e-4],
    ['  12 ', 12],
    ['.5', 0.5],
    ['5.', 5],
    ['-3', -3],
    ['+3', 3],
    ['100u', 100e-6],
    ['100µ', 100e-6],
    ['100μ', 100e-6],
    ['100 µH', 100e-6],
    ['100uH', 100e-6],
    ['2.2m', 2.2e-3],
    ['2.2 mH', 2.2e-3],
    ['200k', 200e3],
    ['200K', 200e3],
    ['200 kHz', 200e3],
    ['200kHz', 200e3],
    ['1.5M', 1.5e6],
    ['1meg', 1e6],
    ['1MEG', 1e6],
    ['1 MΩ', 1e6],
    ['330n', 330e-9],
    ['330 nF', 330e-9],
    ['4.7 µF', 4.7e-6],
    ['10 Ω', 10],
    ['10ohm', 10],
    ['10 ohms', 10],
    ['24 V', 24],
    ['10p', 10e-12],
    ['1f', 1e-15],
    ['1F', 1],
    ['1e3k', 1e6],
    ['30%', 0.3],
    ['30 %', 0.3],
    ['0.5 %', 0.005],
    ['10 µs', 10e-6],
    ['1 W', 1],
    ['2 A', 2],
  ])('%s is %s', (raw, want) => {
    expect(parseSI(raw)).toBeCloseTo(want, 15);
    expect(parseSI(raw) / want).toBeCloseTo(1, 12);
  });

  it.each([[''], ['   '], ['abc'], ['1,5'], ['0x10'], ['Infinity'], ['1e999'], ['1 2'], ['1uu'], ['1 x'], ['1mm'], ['%'], ['k'], ['1e'], ['--1'], ['1 kk']])(
    '"%s" is not a number',
    (raw) => {
      expect(parseSI(raw)).toBeNaN();
    },
  );

  it('a value is scaled exactly, as the digits say', () => {
    expect(parseSI('100u')).toBe(1e-4);
    expect(parseSI('5.u')).toBe(5e-6);
    expect(parseSI('4.7 µF')).toBe(4.7e-6);
    expect(parseSI('2.2m')).toBe(0.0022);
    expect(parseSI('1e3k')).toBe(1e6);
  });

  it('reads a Korean keyboard\'s unit symbols and full-width digits (NFKC)', () => {
    expect(parseSI('4.7㎌')).toBe(4.7e-6);
    expect(parseSI('100㎑')).toBe(1e5);
    expect(parseSI('10㏀')).toBe(1e4);
    expect(parseSI('１００')).toBe(100);
    expect(parseSI('10 Ω')).toBe(10); // U+2126 ohm sign
  });

  describe("with the field's unit", () => {
    it.each([
      ['0.3 T', 'T', 0.3],
      ['0.3T', 'T', 0.3],
      ['300 mT', 'T', 0.3],
      ['5 m', 'm', 5],
      ['5m', 'm', 5],
      ['5 mm', 'm', 0.005],
      ['0.05', 'm', 0.05],
      ['20 nC', 'C', 20e-9],
      ['25 °C', '°C', 25],
      ['1e-4 m²', 'm²', 1e-4],
      ['100 µH', 'H', 1e-4],
      ['100u', 'H', 1e-4],
      ['1F', 'F', 1],
      ['1f', 'F', 1e-15],
      ['10 ohm', 'Ω', 10],
      ['10 kΩ', 'Ω', 1e4],
      ['21', '1', 21],
      ['21', '', 21],
      ['30 %', '', 0.3],
    ])('%s in %s is %s', (raw, unit, want) => {
      expect(parseSI(raw, unit)).toBe(want);
    });

    it.each([
      ['100 µF', 'H'],
      ['5 V', 'A'],
      ['1 mm', 'H'],
      ['0.3 Tm', 'T'],
    ])('%s is not a number in a field of %s', (raw, unit) => {
      expect(parseSI(raw, unit)).toBeNaN();
    });
  });

  it('an undefined field is NaN', () => {
    expect(parseSI(undefined)).toBeNaN();
  });
});
