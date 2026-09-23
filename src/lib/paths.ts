/** Build a site-internal URL for a docs page in a given locale. */
export function pageHref(locale: string, slug: string, hash?: string): string {
  const base = import.meta.env.BASE_URL.replace(/\/$/, '');
  const clean = slug.replace(/^\/+|\/+$/g, '');
  const path = clean ? `${base}/${locale}/${clean}/` : `${base}/${locale}/`;
  return hash ? `${path}#${hash}` : path;
}

export const BIBLIOGRAPHY_SLUG = '10-resources/bibliography';
export const DERIVATIONS_SLUG = '02-theory/derivations';
