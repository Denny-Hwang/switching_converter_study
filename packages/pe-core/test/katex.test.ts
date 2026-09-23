import katex from 'katex';
import { describe, expect, it } from 'vitest';
import { macros } from '../../../src/math/macros';
import derivations from '../equations/derivations.generated.json';
import generated from '../equations/equations.generated.json';

// The site renders the same strings with the same options at build time;
// this catches unsupported LaTeX before the build does.
const opts = (displayMode: boolean) => ({ displayMode, throwOnError: true, strict: 'error' as const, macros: { ...macros } });
const render = (tex: string, display: boolean) => () => katex.renderToString(tex, opts(display));
const inlineMath = (text: string): string[] => [...text.matchAll(/\$([^$]+)\$/g)].map((m) => m[1]!);

const equations = Object.values(generated.equations);

describe('generated LaTeX renders with KaTeX in strict mode', () => {
  it.each(equations.map((e) => [e.id, e.latex] as const))('%s', (_id, latex) => {
    expect(render(latex, true)).not.toThrow();
  });

  it.each(Object.entries(generated.symbols))('symbol %s', (_name, s) => {
    expect(render(s.latex, false)).not.toThrow();
  });

  it.each(equations.map((e) => [e.id, [e.convention, e.convention_ko, e.notes, e.notes_ko].join(' ')] as const))(
    '%s: inline math in convention/notes',
    (_id, text) => {
      for (const m of inlineMath(text)) expect(render(m, false), m).not.toThrow();
    },
  );
});

describe('derivation steps render with KaTeX in strict mode', () => {
  for (const d of derivations.derivations) {
    it(`${d.module}: display math`, () => {
      for (const st of d.steps) if (st.latex) expect(render(st.latex, true), st.latex).not.toThrow();
    });
    it(`${d.module}: inline math in the text`, () => {
      const texts = [d.intro, d.intro_ko, ...d.steps.flatMap((st) => [st.text, st.text_ko])];
      for (const t of texts) for (const m of inlineMath(t)) expect(render(m, false), m).not.toThrow();
    });
  }
});
