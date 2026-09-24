import { describe, expect, it } from 'vitest';
import { coreKg } from './corekg';
import { getExample } from './examples';

describe('core geometrical constants of the table cores (<CoreKg />)', () => {
  it('computes each core from its data-sheet values and compares it with the need', () => {
    const rows = coreKg(1e-12);
    expect(rows.map((r) => r.entry.id)).toEqual(['e25', 'etd29']);
    for (const r of rows) {
      const k = r.entry.core;
      expect(r.Kg).toBeCloseTo((k.Ae ** 2 * k.WA) / k.MLT, 24);
      expect(r.margin).toBeCloseTo(r.Kg / 1e-12, 12);
    }
  });

  it('the K_g inductor example needs a core between the two (the E 25 falls short, the ETD 29 fits)', () => {
    const need = getExample('kg-inductor').context.K_g!;
    const [e25, etd29] = coreKg(need);
    expect(e25!.margin).toBeLessThan(1);
    expect(etd29!.margin).toBeGreaterThanOrEqual(1);
  });

  it('refuses a need that is not positive', () => {
    expect(() => coreKg(0)).toThrow();
  });
});
