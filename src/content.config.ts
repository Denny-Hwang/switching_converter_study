import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';
import { docsLoader, i18nLoader } from '@astrojs/starlight/loaders';
import { docsSchema, i18nSchema } from '@astrojs/starlight/schema';
import { GOTCHA_TAG_IDS } from './lib/gotchas';

export const collections = {
  docs: defineCollection({
    loader: docsLoader(),
    schema: docsSchema({
      extend: z.object({
        /** A learning module page held to the definition of done (scripts/modulelint.py). */
        module: z.boolean().optional(),
        /** A gotcha page (08-gotchas): its tags, from src/lib/gotchas.json. */
        gotcha: z.object({ tags: z.array(z.enum(GOTCHA_TAG_IDS)).min(1) }).optional(),
      }),
    }),
  }),
  // Overrides for Starlight's built-in UI strings (it ships en and ko).
  i18n: defineCollection({ loader: i18nLoader(), schema: i18nSchema() }),
  // One quiz per module page and locale: src/content/quizzes/<locale>/<section>/<page>.yaml
  quizzes: defineCollection({
    loader: glob({ pattern: '**/*.yaml', base: './src/content/quizzes' }),
    schema: z.object({
      /** Every number in a quiz is a synthetic exercise value. */
      numbers: z.literal('synthetic'),
      questions: z
        .array(
          z.object({
            q: z.string(),
            options: z.array(z.string()).min(2).max(6),
            answer: z.number().int().min(0),
            explain: z.string(),
          }),
        )
        .min(5),
    }),
  }),
};
