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

  it('an undefined field is NaN', () => {
    expect(parseSI(undefined)).toBeNaN();
  });
});
