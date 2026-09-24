/**
 * Gotcha pages (src/content/docs/<locale>/08-gotchas/*.mdx): one page per
 * bench or design mistake, on the template symptom · why · how to confirm ·
 * fix · references (docs/BUILD_SPEC.md section 5), tagged in the frontmatter
 * (`gotcha: { tags: [...] }`). The tags and their labels live in
 * gotchas.json, which scripts/modulelint.py reads too.
 */
import data from './gotchas.json';
import type { Locale } from '../i18n/ui';

export const GOTCHA_TAGS = data.tags;
export type GotchaTag = keyof typeof GOTCHA_TAGS;
/** The tag ids, in the order the index shows them. */
export const GOTCHA_TAG_IDS = Object.keys(GOTCHA_TAGS) as [GotchaTag, ...GotchaTag[]];
export const GOTCHAS_DIR = '08-gotchas';

export function tagLabel(tag: GotchaTag, locale: Locale): string {
  return GOTCHA_TAGS[tag][locale];
}

/** Anchor of a tag's list on the index page. */
export function tagAnchor(tag: GotchaTag): string {
  return `tag-${tag}`;
}
