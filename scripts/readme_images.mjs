#!/usr/bin/env node
/**
 * The README's pictures (docs/images/<name>-<locale>.png): a theory page with
 * its figure and the equation after it, the converter designer and the
 * simulator, taken from the built site in the light theme. The schematic
 * gallery at the top of the README is drawn by scripts/gen_figures.py.
 *
 * Re-run after changing what they show:
 *
 *     npm run build && node scripts/readme_images.mjs
 */
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { startPreview } from './preview.mjs';

const OUT = fileURLToPath(new URL('../docs/images/', import.meta.url));

/**
 * `figure`: from that figure down to the end of the first equation after it.
 * `tool`: the top of the page's tool, `height` pixels of it, once `ready` is on screen.
 */
const SHOTS = [
  { name: 'learn', page: '02-theory/volt-second-charge-balance/', figure: '#fig-balance' },
  { name: 'design', page: 'design/converter-designer/', tool: true, height: 720, ready: ['.pe-tool .pe-sim__table', '.pe-tool .main-svg'] },
  { name: 'simulate', page: 'simulate/simulator/', tool: true, height: 1000, ready: ['.pe-tool .pe-sim__table', '.pe-tool .main-svg'] },
];
const LOCALES = ['en', 'ko'];
const PAD = 12;

/** Boxes of the elements matching `selector`, in page coordinates (the clip of a full-page screenshot). */
function boxes(page, selector) {
  return page.locator(selector).evaluateAll((els) =>
    els.map((el) => {
      const r = el.getBoundingClientRect();
      return { x: r.x, y: r.y + window.scrollY, width: r.width, height: r.height };
    }),
  );
}

async function clipOf(page, shot) {
  if (shot.tool) {
    const [box] = await boxes(page, '.pe-tool');
    return { x: box.x - PAD, y: box.y - PAD, width: box.width + 2 * PAD, height: Math.min(box.height, shot.height) + 2 * PAD };
  }
  const [fig] = await boxes(page, shot.figure);
  const eq = (await boxes(page, '.pe-eq')).find((r) => r.y > fig.y + fig.height);
  if (!eq) throw new Error(`${shot.page}: no equation after ${shot.figure}`);
  const x = Math.min(fig.x, eq.x) - PAD;
  const width = Math.max(fig.x + fig.width, eq.x + eq.width) - x + PAD;
  return { x, y: fig.y - PAD, width, height: eq.y + eq.height - fig.y + 2 * PAD };
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const { base, stop } = await startPreview();
  const browser = await chromium.launch();
  try {
    for (const locale of LOCALES) {
      for (const shot of SHOTS) {
        const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 2, colorScheme: 'light' });
        await page.addInitScript(() => localStorage.setItem('starlight-theme', 'light'));
        await page.goto(`${base}/${locale}/${shot.page}`, { waitUntil: 'networkidle' });
        for (const sel of shot.ready ?? []) await page.waitForSelector(sel, { timeout: 30000 });
        await page.evaluate(() => window.scrollTo(0, 0));
        await page.waitForTimeout(500);
        const file = `${OUT}${shot.name}-${locale}.png`;
        await page.screenshot({ path: file, clip: await clipOf(page, shot), fullPage: true, animations: 'disabled' });
        console.log(file);
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
