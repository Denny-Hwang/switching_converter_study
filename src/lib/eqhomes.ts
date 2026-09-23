/**
 * Where does each equation live? Every <Eq id> is embedded exactly once per
 * locale (mathlint enforces it); other pages link to that home with <EqRef>.
 * Pages under about/ document the site itself; an equation they show to
 * demonstrate the pipeline never counts as its home.
 */
import { getCollection } from 'astro:content';

const cache = new Map<string, Map<string, string>>();

/** eq id -> page slug (without locale) for one locale. */
export async function eqHomes(locale: string): Promise<Map<string, string>> {
  const hit = cache.get(locale);
  if (hit) return hit;
  const map = new Map<string, string>();
  const entries = await getCollection(
    'docs',
    (e) => e.id.startsWith(`${locale}/`) && !e.id.startsWith(`${locale}/about/`),
  );
  for (const e of entries) {
    const body = e.body ?? '';
    for (const m of body.matchAll(/<Eq\s+id="([^"]+)"/g)) {
      map.set(m[1]!, e.id.slice(locale.length + 1));
    }
  }
  cache.set(locale, map);
  return map;
}

export function eqAnchor(id: string): string {
  return `eq-${id.replace(/\./g, '-')}`;
}
