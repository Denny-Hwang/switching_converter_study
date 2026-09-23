import type { AstroGlobal } from 'astro';
import { localeOf, type Locale } from '../i18n/ui';

/** Locale of the Starlight page being rendered ('en' outside Starlight pages). */
export function pageLocale(astro: AstroGlobal): Locale {
  try {
    return localeOf(astro.locals.starlightRoute?.locale);
  } catch {
    return 'en';
  }
}
