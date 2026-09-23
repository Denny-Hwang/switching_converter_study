import { describe, expect, it } from 'vitest';
import { catalog } from 'pe-core';
import { latexHtml, symHtml, symParts } from './sym';

describe('symParts / symHtml', () => {
  it('splits symbols with subscripts from the words around them', () => {
    expect(symParts('V_g,min')).toEqual([{ base: 'V', sub: 'g,min' }]);
    expect(symParts('Δi_L / I_L')).toEqual([{ base: 'Δi', sub: 'L' }, ' / ', { base: 'I', sub: 'L' }]);
    expect(symParts('n = N_s/N_p')).toEqual(['n = ', { base: 'N', sub: 's' }, '/', { base: 'N', sub: 'p' }]);
    expect(symParts('Conduction (R_on, R_L)')).toEqual(['Conduction (', { base: 'R', sub: 'on' }, ', ', { base: 'R', sub: 'L' }, ')']);
    expect(symParts('D')).toEqual(['D']);
  });

  it('keeps Korean particles out of the subscript', () => {
    expect(symParts('V_DS,max에는')).toEqual([{ base: 'V', sub: 'DS,max' }, '에는']);
  });

  it('writes chart text with <sub> and escapes markup', () => {
    expect(symHtml('i_L')).toBe('i<sub>L</sub>');
    expect(symHtml('K_crit(D)')).toBe('K<sub>crit</sub>(D)');
    expect(symHtml('a < b')).toBe('a &lt; b');
  });
});

describe('latexHtml', () => {
  it('turns catalogue LaTeX into chart text', () => {
    expect(latexHtml('V_g')).toBe('V<sub>g</sub>');
    expect(latexHtml('V_\\mathrm{OUT}')).toBe('V<sub>OUT</sub>');
    expect(latexHtml('\\Delta i_L')).toBe('Δ i<sub>L</sub>');
    expect(latexHtml('\\mu_0')).toBe('μ<sub>0</sub>');
    expect(latexHtml('A_e l_e')).toBe('A<sub>e</sub> l<sub>e</sub>');
  });

  it('handles text commands nested in a subscript group', () => {
    expect(latexHtml('V_{g,\\mathrm{crit}}')).toBe('V<sub>g,crit</sub>');
    expect(latexHtml('\\Delta i_{L,\\mathrm{pp}}')).toBe('Δ i<sub>L,pp</sub>');
    expect(latexHtml('V_{\\mathrm{OUT},\\max}')).toBe('V<sub>OUT,max</sub>');
    expect(latexHtml('\\langle v_s\\rangle')).toBe('⟨v<sub>s</sub>⟩');
  });

  it('leaves no LaTeX behind for any catalogue symbol', () => {
    for (const [name, sym] of Object.entries(catalog.symbols)) {
      expect(latexHtml(sym.latex), name).not.toMatch(/[\\{}_^]/);
    }
  });
});
