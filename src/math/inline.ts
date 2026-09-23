import katex from 'katex';
import { katexOptions } from './katex-options';

const escapeHtml = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * Render a metadata string that may contain `$...$` inline math (used for
 * the convention/notes fields of equations.yaml). Text is HTML-escaped;
 * math goes through strict KaTeX, so an error fails the build.
 */
export function renderInlineMath(text: string): string {
  const parts = text.split(/(\$[^$]+\$)/g);
  return parts
    .map((part) =>
      part.length > 2 && part.startsWith('$') && part.endsWith('$')
        ? katex.renderToString(part.slice(1, -1), katexOptions(false))
        : escapeHtml(part),
    )
    .join('');
}
