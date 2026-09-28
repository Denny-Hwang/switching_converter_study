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
      title: { en: 'Switching Converter Study', ko: '스위칭 컨버터 스터디', 'zh-CN': '开关变换器学习' },
      description:
        'Verifiable power-electronics learning: every equation derived and tested in code, every claim cited, every concept runnable in the browser.',
      defaultLocale: 'en',
      locales: {
        en: { label: 'English', lang: 'en' },
        ko: { label: '한국어', lang: 'ko' },
        zh: { label: '简体中文', lang: 'zh-CN' },
      },
      social: [{ icon: 'github', label: 'GitHub', href: REPO_URL }],
      customCss: ['katex/dist/katex.min.css', './src/styles/custom.css'],
      components: { Footer: './src/components/Footer.astro' },
      favicon: '/favicon.svg',
      lastUpdated: false,
      sidebar: [
        {
          label: 'Learn',
          translations: { ko: '학습', 'zh-CN': '学习' },
          items: [
            {
              label: '00 · Foundations',
              translations: { ko: '00 · 기초', 'zh-CN': '00 · 基础' },
              items: [{ autogenerate: { directory: '00-foundations' } }],
            },
            {
              label: '01 · Physics',
              translations: { ko: '01 · 물리', 'zh-CN': '01 · 物理' },
              items: [{ autogenerate: { directory: '01-physics' } }],
            },
            {
              label: '02 · Theory',
              translations: { ko: '02 · 이론', 'zh-CN': '02 · 理论' },
              items: [{ autogenerate: { directory: '02-theory' } }],
            },
            {
              label: '03 · Topologies',
              translations: { ko: '03 · 토폴로지', 'zh-CN': '03 · 拓扑' },
              items: [{ autogenerate: { directory: '03-topologies' } }],
            },
            {
              label: '04 · Magnetics',
              translations: { ko: '04 · 자성 부품', 'zh-CN': '04 · 磁性元件' },
              items: [{ autogenerate: { directory: '04-magnetics' } }],
            },
            {
              label: '05 · Simulation',
              translations: { ko: '05 · 시뮬레이션', 'zh-CN': '05 · 仿真' },
              items: [{ autogenerate: { directory: '05-simulation' } }],
            },
            {
              label: '06 · Bench',
              translations: { ko: '06 · 벤치(실험대)', 'zh-CN': '06 · 实验台' },
              items: [{ autogenerate: { directory: '06-bench' } }],
            },
            {
              label: '07 · Harvesting',
              translations: { ko: '07 · 에너지 하베스팅', 'zh-CN': '07 · 能量收集' },
              items: [{ autogenerate: { directory: '07-harvesting' } }],
            },
          ],
        },
        {
          label: 'Design',
          translations: { ko: '설계', 'zh-CN': '设计' },
          items: [{ autogenerate: { directory: 'design' } }],
        },
        {
          label: 'Simulate',
          translations: { ko: '시뮬레이션', 'zh-CN': '仿真' },
          items: [{ autogenerate: { directory: 'simulate' } }],
        },
        {
          label: 'Missions',
          translations: { ko: '미션', 'zh-CN': '任务' },
          items: [{ autogenerate: { directory: '09-missions' } }],
        },
        {
          label: 'Gotchas',
          translations: { ko: '주의할 점', 'zh-CN': '易错点' },
          items: [{ autogenerate: { directory: '08-gotchas' } }],
        },
        {
          label: 'Resources',
          translations: { ko: '자료', 'zh-CN': '资料' },
          items: [{ autogenerate: { directory: '10-resources' } }],
        },
        {
          label: 'About',
          translations: { ko: '소개', 'zh-CN': '关于' },
          items: [{ autogenerate: { directory: 'about' } }],
        },
      ],
    }),
    react(),
  ],
});
