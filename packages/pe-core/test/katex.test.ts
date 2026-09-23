import katex from 'katex';
import { describe, expect, it } from 'vitest';
import { macros } from '../../../src/math/macros';
import generated from '../equations/equations.generated.json';

// The site renders the same strings with the same options at build time;
// this catches unsupported LaTeX before the build does.
const equations = Object.values(generated.equations);

describe('generated LaTeX renders with KaTeX in strict mode', () => {
  it.each(equations.map((e) => [e.id, e.latex] as const))('%s', (_id, latex) => {
    expect(() =>
      katex.renderToString(latex, { displayMode: true, throwOnError: true, strict: 'error', macros: { ...macros } }),
    ).not.toThrow();
  });

  it.each(Object.entries(generated.symbols))('symbol %s', (_name, s) => {
    expect(() => katex.renderToString(s.latex, { throwOnError: true, strict: 'error', macros: { ...macros } })).not.toThrow();
  });
});
