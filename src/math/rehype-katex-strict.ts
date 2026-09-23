/**
 * rehype-katex, made fatal.
 *
 * rehype-katex reports KaTeX errors as vfile messages and renders an error
 * span instead of failing. CLAUDE.md rule 5 requires a failed render to fail
 * the build, so this wrapper throws when rehype-katex reported anything.
 */
import rehypeKatex from 'rehype-katex';
import { katexOptions } from './katex-options';

type Transformer = (tree: unknown, file: VFileLike) => void;
interface VFileLike {
  path?: string;
  messages: { source?: string | null; reason: string; cause?: unknown }[];
}

export default function rehypeKatexStrict() {
  const { displayMode: _ignored, ...options } = katexOptions(false);
  const transform = (rehypeKatex as unknown as (o: object) => Transformer)(options);
  return (tree: unknown, file: VFileLike) => {
    const before = file.messages.length;
    transform(tree, file);
    const errors = file.messages.slice(before).filter((m) => m.source === 'rehype-katex');
    if (errors.length > 0) {
      const detail = errors
        .map((m) => `${m.reason}: ${m.cause instanceof Error ? m.cause.message : String(m.cause ?? '')}`)
        .join('\n  ');
      throw new Error(`KaTeX (strict) failed in ${file.path ?? '<unknown file>'}:\n  ${detail}`);
    }
  };
}
