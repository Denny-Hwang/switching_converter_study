import { describe, expect, it } from 'vitest';
import { coloredTitle, logTicks, tickNumber } from './plot';

describe('logTicks', () => {
  it('uses 1-2-5 per decade over a few decades', () => {
    expect(logTicks(0.01, 5).tickvals).toEqual([0.01, 0.02, 0.05, 0.1, 0.2, 0.5, 1, 2, 5]);
  });

  it('uses decades over a wide range', () => {
    expect(logTicks(1e-6, 10).tickvals).toEqual([1e-6, 1e-5, 1e-4, 1e-3, 0.01, 0.1, 1, 10]);
  });

  it('adds finer ticks when 1-2-5 would leave fewer than two', () => {
    expect(logTicks(0.6, 0.95).tickvals).toEqual([0.6, 0.7, 0.8]);
  });

  it('labels with the given format, and gives nothing for an empty range', () => {
    expect(logTicks(0.01, 0.5, (v) => `${100 * v}%`).ticktext).toEqual(['1%', '2%', '5%', '10%', '20%', '50%']);
    expect(logTicks(0, 1)).toEqual({});
    expect(logTicks(2, 1)).toEqual({});
  });
});

describe('tickNumber', () => {
  it('writes plain numbers in the readable range and powers of ten outside it', () => {
    expect(tickNumber(0.002)).toBe('0.002');
    expect(tickNumber(2000)).toBe('2000');
    expect(tickNumber(1e-6)).toBe('10<sup>−6</sup>');
    expect(tickNumber(2e-6)).toBe('2×10<sup>−6</sup>');
    expect(tickNumber(0)).toBe('0');
  });
});

describe('coloredTitle', () => {
  it('colours each name as its trace and adds the unit once', () => {
    expect(coloredTitle([{ name: 'i_L', color: '#123' }, { name: 'i_D', color: '#456' }], 'A')).toBe(
      '<span style="color:#123">i<sub>L</sub></span>, <span style="color:#456">i<sub>D</sub></span> [A]',
    );
  });
});
