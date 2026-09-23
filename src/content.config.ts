import { defineCollection } from 'astro:content';
import { docsLoader, i18nLoader } from '@astrojs/starlight/loaders';
import { docsSchema, i18nSchema } from '@astrojs/starlight/schema';

export const collections = {
  docs: defineCollection({ loader: docsLoader(), schema: docsSchema() }),
  // Overrides for Starlight's built-in UI strings (it ships en and ko).
  i18n: defineCollection({ loader: i18nLoader(), schema: i18nSchema() }),
};
