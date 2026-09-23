#!/usr/bin/env node
/**
 * Screenshots of the tools for their doc pages (docs/BUILD_SPEC.md section 7,
 * Phase 3: "all tools have a screenshot in their doc page"). It serves dist/
 * with `astro preview`, opens each tool through the "Try it" link that a page
 * of the site already carries (so the state comes from a synthetic example),
 * and saves the tool to src/assets/screenshots/<tool>-<locale>.png.
 *
 * Re-run after changing a tool's layout, then rebuild so the pages pick the
 * new images up:
 *
 *     npm run build && node scripts/screenshots.mjs && npm run build
 */
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { startPreview } from './preview.mjs';

const OUT = fileURLToPath(new URL('../src/assets/screenshots/', import.meta.url));

/**
 * Each tool, the page whose link sets its state (or `page`: the tool's own
 * page in its default state, which is a synthetic preset), and what must be
 * on screen before the shot.
 */
const SHOTS = [
  { name: 'explorer', from: '02-theory/ccm-dcm/', link: 'design/explorer/#', ready: ['.pe-tool .main-svg'] },
  { name: 'simulator', from: 'simulate/simulator/', link: 'simulate/simulator/#', ready: ['.pe-tool .pe-sim__table', '.pe-tool .main-svg'] },
  { name: 'designer', page: 'design/converter-designer/', ready: ['.pe-tool .pe-sim__table', '.pe-tool .main-svg'] },
  { name: 'lossbudget', page: 'design/loss-budget/', ready: ['.pe-tool .pe-sim__table', '.pe-tool .main-svg'] },
];
const LOCALES = ['en', 'ko'];

async function main() {
  mkdirSync(OUT, { recursive: true });
  const { base, stop } = await startPreview();
  const browser = await chromium.launch();
  try {
    for (const locale of LOCALES) {
      for (const s of SHOTS) {
        let target = `${base}/${locale}/${s.page}`;
        let href = target;
        if (!s.page) {
          const from = await browser.newPage();
          await from.goto(`${base}/${locale}/${s.from}`, { waitUntil: 'networkidle' });
          href = await from.locator(`a[href*="${s.link}"]`).first().getAttribute('href');
          if (!href) throw new Error(`/${locale}/${s.from}: no link into ${s.link}`);
          target = new URL(href, from.url()).toString();
          await from.close();
        }
        // a fresh page: the tools read their state from the hash when they load
        const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, colorScheme: 'light' });
        await page.goto(target, { waitUntil: 'networkidle' });
        for (const sel of s.ready) await page.waitForSelector(sel, { timeout: 30000 });
        await page.waitForTimeout(500);
        const file = `${OUT}${s.name}-${locale}.png`;
        await page.locator('.pe-tool').first().screenshot({ path: file, animations: 'disabled' });
        console.log(`${file} (${href.split('#')[1] ?? 'default state'})`);
        await page.close();
      }
    }
  } finally {
    await browser.close();
    stop();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
