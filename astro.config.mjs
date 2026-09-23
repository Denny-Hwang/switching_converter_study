// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import react from '@astrojs/react';
import { unified } from '@astrojs/markdown-remark';
import remarkMath from 'remark-math';
import rehypeKatexStrict from './src/math/rehype-katex-strict.ts';
import { REPO_URL, SITE_ORIGIN, SITE_BASE } from './src/config.ts';

// https://docs.astro.build/en/reference/configuration-reference/
export default defineConfig({
  site: SITE_ORIGIN,
  base: SITE_BASE,
  trailingSlash: 'always',
  vite: {
    // Plotly (~4.5 MB) is loaded on demand by tool islands only.
    build: { chunkSizeWarningLimit: 5000 },
  },
  markdown: {
    // remark-math + rehype-katex (strict: any KaTeX error fails the build).
    processor: unified({
      remarkPlugins: [remarkMath],
      rehypePlugins: [rehypeKatexStrict],
    }),
  },
  integrations: [
    starlight({
      title: { en: 'Switching Converter Study', ko: '스위칭 컨버터 스터디' },
      description:
        'Verifiable power-electronics learning: every equation derived and tested in code, every claim cited, every concept runnable in the browser.',
      defaultLocale: 'en',
      locales: {
        en: { label: 'English', lang: 'en' },
        ko: { label: '한국어', lang: 'ko' },
      },
      social: [{ icon: 'github', label: 'GitHub', href: REPO_URL }],
      customCss: ['katex/dist/katex.min.css', './src/styles/custom.css'],
      favicon: '/favicon.svg',
      lastUpdated: false,
      sidebar: [
        {
          label: 'About',
          translations: { ko: '소개' },
          items: [{ autogenerate: { directory: 'about' } }],
        },
      ],
    }),
    react(),
  ],
});
