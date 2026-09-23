import type { KatexOptions } from 'katex';
import { macros } from './macros';

/** Strict KaTeX options used everywhere on the site: any error fails the build. */
export function katexOptions(displayMode: boolean): KatexOptions {
  return {
    displayMode,
    throwOnError: true,
    strict: 'error',
    trust: false,
    // KaTeX may mutate the macros object (\gdef); always hand it a copy.
    macros: { ...macros },
  };
}
