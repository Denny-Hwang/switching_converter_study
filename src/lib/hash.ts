/**
 * A URL hash belongs to a tool when it carries at least one of the tool's
 * keys. Headings, equations and the table of contents are in-page anchors
 * (#screenshot, #eq-clamp.P): following one changes the hash too, and must
 * not reset the tool's inputs.
 */
export function isToolHash(h: URLSearchParams, keys: readonly string[]): boolean {
  return keys.some((k) => h.has(k));
}

/**
 * A hash that is an in-page anchor: not empty, and none of the tool's keys.
 * A page opened at one (a link to a section) keeps it in its URL until the
 * tool's state changes, so a reload still lands on that section.
 */
export function isAnchorHash(h: URLSearchParams, keys: readonly string[]): boolean {
  return [...h.keys()].length > 0 && !isToolHash(h, keys);
}
