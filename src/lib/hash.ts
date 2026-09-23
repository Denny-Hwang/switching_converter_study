/**
 * A URL hash belongs to a tool when it carries at least one of the tool's
 * keys. Headings, equations and the table of contents are in-page anchors
 * (#screenshot, #eq-clamp.P): following one changes the hash too, and must
 * not reset the tool's inputs.
 */
export function isToolHash(h: URLSearchParams, keys: readonly string[]): boolean {
  return keys.some((k) => h.has(k));
}
