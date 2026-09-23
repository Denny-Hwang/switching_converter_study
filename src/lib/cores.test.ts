import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CORES, coreById } from './cores';
import { citable } from './references';

const bib = readFileSync(new URL('../../references.bib', import.meta.url), 'utf8');

/** The numbers in a bib entry's `urlquotes`: the text the CI URL check finds in the data sheet itself. */
function quotedNumbers(key: string): number[] {
  const entry = new RegExp(`@\\w+\\{${key},([\\s\\S]*?)\\n\\}`).exec(bib)?.[1] ?? '';
  const quotes = /urlquotes\s*=\s*\{([^}]*)\}/.exec(entry)?.[1] ?? '';
  return (quotes.match(/\d+(?:\.\d+)?/g) ?? []).map(Number);
}

describe('core table (src/lib/cores.ts)', () => {
  it('cites a verified data sheet for every core', () => {
    for (const c of CORES) expect(() => citable(c.cite), c.id).not.toThrow();
  });

  it('uses only values the CI finds in the data sheet: each one is among the numbers of its urlquotes', () => {
    for (const c of CORES) {
      const quoted = quotedNumbers(c.cite);
      const k = c.core;
      // data-sheet units: mm, mm², mm³, nH
      const used = [k.le * 1e3, k.Ae * 1e6, k.Amin! * 1e6, c.Ve * 1e9, k.AL0 * 1e9, k.WA * 1e6, k.MLT * 1e3, ...(k.gapped ?? []).flatMap((s) => [s.g * 1e3, s.AL * 1e9])];
      for (const v of used) expect(quoted.some((q) => Math.abs(q - v) <= 1e-9 * v), `${c.id}: ${v} is not in the urlquotes of ${c.cite}`).toBe(true);
    }
  });

  it('is physically consistent: A_min <= A_e, and a larger gap gives a smaller A_L below the ungapped one', () => {
    for (const c of CORES) {
      expect(c.core.Amin!).toBeLessThanOrEqual(c.core.Ae);
      const sets = c.core.gapped ?? [];
      expect(sets.length).toBeGreaterThan(0);
      for (let i = 0; i < sets.length; i++) {
        expect(sets[i]!.AL).toBeLessThan(c.core.AL0);
        if (i > 0) {
          expect(sets[i]!.g).toBeGreaterThan(sets[i - 1]!.g);
          expect(sets[i]!.AL).toBeLessThan(sets[i - 1]!.AL);
        }
      }
      expect(coreById(c.id)).toBe(c);
    }
  });
});
