import type { AstroGlobal } from 'astro';
import { localeOf, type Locale } from '../i18n/ui';

/**
 * Locale of the content being rendered ('en' outside Starlight pages).
 * A Korean page that is not translated yet is served with the English
 * content (Starlight fallback); its components then render in English too,
 * so links, quizzes and equation homes match the text around them.
 */
export function pageLocale(astro: AstroGlobal): Locale {
  try {
    const route = astro.locals.starlightRoute;
    return localeOf(route?.entryMeta?.locale ?? route?.locale);
  } catch {
    return 'en';
  }
}
