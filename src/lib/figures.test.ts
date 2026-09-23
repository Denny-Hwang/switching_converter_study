import { describe, expect, it } from 'vitest';
import { FIGURES, figureFiles, figureSvg } from './figures';
import { citable } from './references';
import { renderInlineMath } from '../math/inline';

describe('figures (scripts/gen_figures.py -> src/assets/figures)', () => {
  it('every figure file has an entry in figures.ts and every entry a file', () => {
    expect(figureFiles()).toEqual(Object.keys(FIGURES).sort());
  });

  it('captions render in strict KaTeX; captions and text alternatives exist in both languages', () => {
    for (const [name, f] of Object.entries(FIGURES)) {
      for (const lang of ['en', 'ko'] as const) {
        expect(() => renderInlineMath(f.caption[lang]), `${name} ${lang}`).not.toThrow();
        expect(f.alt[lang].length, `${name} ${lang}`).toBeGreaterThan(40);
      }
      expect(f.caption.ko, name).toMatch(/[가-힣]/);
      expect(f.alt.ko, name).toMatch(/[가-힣]/);
    }
  });

  it('every figure follows a citable source', () => {
    for (const [name, f] of Object.entries(FIGURES)) {
      expect(() => citable(f.cite.key), name).not.toThrow();
      expect(f.cite.where, name).not.toBe('');
    }
  });

  it('each SVG stays inside its figure: theme ink, its own ids, no style sheet, hidden from screen readers', () => {
    for (const name of figureFiles()) {
      const svg = figureSvg(name);
      expect(svg.startsWith('<svg aria-hidden="true"'), name).toBe(true);
      expect(svg, name).toContain('currentColor');
      expect(svg, name).not.toMatch(/<style|<script|<\?xml|#010203/i);
      for (const id of svg.matchAll(/\sid="([^"]+)"/g)) expect(id[1]!.startsWith(`fig-${name}-`), `${name}: ${id[1]}`).toBe(true);
    }
  });
});
