/**
 * The ONLY KaTeX macros allowed on this site (CLAUDE.md rule 5).
 *
 * Shared by rehype-katex (inline math in MDX), <Eq>, and the vitest KaTeX
 * check. Add a macro here, and nowhere else, only when it is genuinely
 * needed; generated LaTeX from equations.yaml must not depend on macros.
 */
export const macros: Readonly<Record<string, string>> = {};
