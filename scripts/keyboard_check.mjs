#!/usr/bin/env node
/**
 * Keyboard check of the tool pages (docs/BUILD_SPEC.md section 7, Phase 3:
 * "keyboard focus order works"). It serves dist/ with `astro preview`, opens
 * every tool page in both languages in headless Chromium, and checks each
 * tool:
 *
 *   1. no control has a positive tabindex;
 *   2. Tab visits every control in document order, and the Tab after the
 *      last control leaves the tool (nothing skipped, no trap);
 *   3. Shift+Tab visits the same controls in reverse;
 *   4. every control shows a focus indicator (outline or box-shadow) when
 *      it is reached by keyboard;
 *   5. the controls respond to the keyboard (a tool-specific action).
 *
 *     npm run build && node scripts/keyboard_check.mjs
 */
import { chromium } from 'playwright';
import { startPreview } from './preview.mjs';

const TOOL = '.pe-tool';
const FOCUSABLE = 'a[href], button, input, select, textarea, summary, [tabindex]';

/** Tool pages, with a keyboard action that must change the tool's state. */
const PAGES = [
  { path: 'design/explorer/', ready: `${TOOL} select`, action: explorerAction },
  { path: 'simulate/simulator/', ready: `${TOOL} .pe-sim__table`, action: simulatorAction },
];
const LOCALES = ['en', 'ko'];

/** Mark the tool's focusable controls with data-kb="<document order>" and return their descriptions. */
async function markControls(page) {
  return page.$eval(
    TOOL,
    (tool, selector) => {
      const out = [];
      for (const el of tool.querySelectorAll('[data-kb]')) el.removeAttribute('data-kb');
      for (const el of tool.querySelectorAll(selector)) {
        if (el.tabIndex < 0 || el.disabled) continue;
        const st = getComputedStyle(el);
        const r = el.getBoundingClientRect();
        if (st.visibility === 'hidden' || st.display === 'none' || (r.width === 0 && r.height === 0)) continue;
        el.setAttribute('data-kb', String(out.length));
        const name = el.getAttribute('aria-label') || el.labels?.[0]?.textContent || el.textContent || el.id || '';
        out.push({ tag: el.tagName.toLowerCase(), type: el.getAttribute('type') ?? '', name: name.trim().replace(/\s+/g, ' ').slice(0, 40), tabIndex: el.tabIndex });
      }
      return out;
    },
    FOCUSABLE,
  );
}

/** data-kb of the focused element, "outside" if focus left the tool, and whether a focus indicator is drawn. */
async function focused(page) {
  return page.evaluate((toolSel) => {
    const el = document.activeElement;
    const tool = document.querySelector(toolSel);
    if (!el || !tool || !tool.contains(el)) return { kb: 'outside', visible: true };
    const st = getComputedStyle(el);
    const outline = st.outlineStyle !== 'none' && parseFloat(st.outlineWidth) > 0;
    const shadow = st.boxShadow && st.boxShadow !== 'none';
    return { kb: el.getAttribute('data-kb') ?? 'unmarked', visible: outline || shadow };
  }, TOOL);
}

async function checkOrder(page, where, errors) {
  const controls = await markControls(page);
  if (controls.length < 3) errors.push(`${where}: only ${controls.length} focusable controls found`);
  for (const [i, c] of controls.entries()) {
    if (c.tabIndex > 0) errors.push(`${where}: control ${i} (${c.tag} ${c.name}) has tabindex ${c.tabIndex}`);
  }
  // forward
  await page.focus('[data-kb="0"]');
  const seen = [];
  for (let i = 0; i < controls.length; i++) {
    if (i > 0) await page.keyboard.press('Tab');
    const f = await focused(page);
    seen.push(f.kb);
    if (f.kb !== String(i)) {
      errors.push(`${where}: Tab step ${i} reached ${f.kb}, expected ${i} (${controls[i].tag} ${controls[i].name})`);
      break;
    }
    if (!f.visible) errors.push(`${where}: no focus indicator on ${controls[i].tag} ${controls[i].name}`);
  }
  await page.keyboard.press('Tab');
  const after = await focused(page);
  if (after.kb !== 'outside') errors.push(`${where}: Tab after the last control stayed in the tool (${after.kb})`);
  // backward
  await page.focus(`[data-kb="${controls.length - 1}"]`);
  for (let i = controls.length - 2; i >= 0; i--) {
    await page.keyboard.press('Shift+Tab');
    const f = await focused(page);
    if (f.kb !== String(i)) {
      errors.push(`${where}: Shift+Tab reached ${f.kb}, expected ${i} (${controls[i].tag} ${controls[i].name})`);
      break;
    }
  }
  return controls.length;
}

/** Explorer: choosing another equation with the keyboard changes the rendered title. */
async function explorerAction(page, where, errors) {
  const select = page.locator(`${TOOL} select`).first();
  const before = await select.inputValue();
  await select.focus();
  await page.keyboard.press('ArrowDown');
  const after = await select.inputValue();
  if (after === before) errors.push(`${where}: ArrowDown on the equation list did not change the equation`);
}

/** Simulator: Space on the second topology button selects it and runs that topology. */
async function simulatorAction(page, where, errors) {
  const buttons = page.locator(`${TOOL} .pe-sim__buttons[role="group"] button`);
  const second = buttons.nth(1);
  await second.focus();
  await page.keyboard.press('Space');
  await page.waitForTimeout(100);
  if ((await second.getAttribute('aria-pressed')) !== 'true') errors.push(`${where}: Space did not select a topology button`);
  if ((await buttons.nth(0).getAttribute('aria-pressed')) !== 'false') errors.push(`${where}: the first topology stayed selected`);
  // a slider responds to the arrow keys and moves the number field it belongs to
  const d = page.locator(`${TOOL} #sim-D`);
  const slider = page.locator(`${TOOL} #sim-D ~ input[type="range"]`);
  const before = await d.inputValue();
  await slider.focus();
  await page.keyboard.press('ArrowRight');
  if ((await d.inputValue()) === before) errors.push(`${where}: ArrowRight on the D slider did not change D`);
}

async function main() {
  const { base, stop } = await startPreview();
  const browser = await chromium.launch();
  const errors = [];
  let checked = 0;
  try {
    for (const locale of LOCALES) {
      for (const p of PAGES) {
        const url = `${base}/${locale}/${p.path}`;
        const where = `/${locale}/${p.path}`;
        const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
        const pageErrors = [];
        page.on('pageerror', (e) => pageErrors.push(String(e)));
        await page.goto(url, { waitUntil: 'networkidle' });
        await page.waitForSelector(p.ready, { timeout: 30000 });
        const n = await checkOrder(page, where, errors);
        await p.action(page, where, errors);
        for (const e of pageErrors) errors.push(`${where}: page error: ${e}`);
        console.log(`${where}: ${n} controls in order`);
        checked++;
        await page.close();
      }
    }
  } finally {
    await browser.close();
    stop();
  }
  if (errors.length) {
    console.error(errors.join('\n'));
    console.error(`keyboard_check: FAILED (${errors.length} problems)`);
    process.exit(1);
  }
  console.log(`keyboard_check: OK (${checked} tool pages)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
