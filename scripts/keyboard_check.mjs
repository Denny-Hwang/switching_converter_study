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
  { path: 'design/explorer/', ready: [`${TOOL} select`, `${TOOL} .main-svg`], action: explorerAction },
  { path: 'simulate/simulator/', ready: [`${TOOL} .pe-sim__table`, `${TOOL} .main-svg`], action: simulatorAction },
  { path: 'design/converter-designer/', ready: [`${TOOL} .pe-sim__table`, `${TOOL} .main-svg`], action: designerAction },
  { path: 'design/loss-budget/', ready: [`${TOOL} .pe-sim__table`, `${TOOL} .main-svg`], action: lossAction },
  { path: 'design/clamp-check/', ready: [`${TOOL} .pe-sim__table`, `${TOOL} .main-svg`], action: clampAction },
  { path: 'design/source-matcher/', ready: [`${TOOL} .pe-sim__table`, `${TOOL} .main-svg`], action: sourceAction },
];
const LOCALES = ['en', 'ko'];

/**
 * Wait until the tool is on screen and its set of focusable controls stops
 * changing: a chart's mode bar adds buttons when the chart is drawn, which
 * can be seconds after the first result.
 */
async function settle(page, ready) {
  for (const sel of ready) await page.waitForSelector(sel, { timeout: 60000 });
  const count = () => page.$eval(TOOL, (tool, selector) => tool.querySelectorAll(selector).length, FOCUSABLE);
  let last = await count();
  let stableSince = Date.now();
  const deadline = Date.now() + 60000;
  while (Date.now() - stableSince < 1000 && Date.now() < deadline) {
    await page.waitForTimeout(100);
    const n = await count();
    if (n !== last) {
      last = n;
      stableSince = Date.now();
    }
  }
}

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
  // an invalid field removes the result and the waveforms, not only the tables
  await page.waitForSelector(`${TOOL} .main-svg`, { timeout: 30000 });
  const fs = page.locator(`${TOOL} #sim-fs`);
  const fsValue = await fs.inputValue();
  await fs.fill('');
  await page.waitForFunction((sel) => !document.querySelector(sel), `${TOOL} .main-svg`, { timeout: 10000 }).catch(() => {
    errors.push(`${where}: the waveforms stayed on screen with an invalid field`);
  });
  await fs.fill(fsValue);
  // Enter on the page's own "Try it" link (same page, another preset in the hash) loads that preset
  const link = page.locator('a[href*="simulate/simulator/#"]').first();
  const expected = new URLSearchParams((await link.getAttribute('href')).split('#')[1]);
  await link.focus();
  await page.keyboard.press('Enter');
  const got = await page
    .waitForFunction(
      ([sel, v]) => document.querySelector(sel)?.value === v,
      [`${TOOL} #sim-D`, expected.get('D')],
      { timeout: 10000 },
    )
    .then(() => true, () => false);
  const topo = await page.locator(`${TOOL} .pe-sim__buttons[role="group"] button[aria-pressed="true"]`).innerText();
  if (!got || topo.trim().length === 0) errors.push(`${where}: the page's own preset link did not load its preset (hash change)`);
}

/**
 * An invalid field removes the tool's charts, not only its tables; a new hash
 * (a link to the same page, the back button) loads its values into the form.
 */
async function staleAndHash(page, where, errors, prefix) {
  await page.waitForSelector(`${TOOL} .main-svg`, { timeout: 60000 });
  const fs = page.locator(`${TOOL} #${prefix}-fs`);
  const fsValue = await fs.inputValue();
  await fs.fill('');
  await page.waitForFunction((sel) => !document.querySelector(sel), `${TOOL} .main-svg`, { timeout: 10000 }).catch(() => {
    errors.push(`${where}: a chart stayed on screen with an invalid field`);
  });
  await fs.fill(fsValue);
  const v = page.locator(`${TOOL} #${prefix}-V`);
  const next = String(Number(await v.inputValue()) + 1);
  await page.evaluate((value) => {
    const q = new URLSearchParams(window.location.hash.slice(1));
    q.set('V', value);
    window.location.hash = q.toString();
  }, next);
  const got = await page
    .waitForFunction(([sel, value]) => document.querySelector(sel)?.value === value, [`${TOOL} #${prefix}-V`, next], { timeout: 10000 })
    .then(() => true, () => false);
  if (!got) errors.push(`${where}: a new URL hash did not load its values`);
}

/**
 * A run still in flight when the form becomes invalid must not bring its
 * result back after the charts were cleared: change a value (a run starts),
 * empty a field while it runs, and wait longer than the run takes.
 */
async function noStaleResult(page, where, errors, prefix, waitMs) {
  await page.waitForSelector(`${TOOL} .main-svg`, { timeout: 60000 });
  const v = page.locator(`${TOOL} #${prefix}-V`);
  const fs = page.locator(`${TOOL} #${prefix}-fs`);
  const vValue = await v.inputValue();
  const fsValue = await fs.inputValue();
  await v.fill(String(Number(vValue) * 1.01));
  await page.waitForTimeout(700);
  await fs.fill('');
  await page.waitForTimeout(waitMs);
  if ((await page.locator(`${TOOL} .main-svg`).count()) > 0) {
    errors.push(`${where}: a run started before the form became invalid brought its charts back`);
  }
  await fs.fill(fsValue);
  await v.fill(vValue);
}

/**
 * Following an in-page anchor (a heading, an equation link) changes the URL
 * hash too; it must not reset the tool's inputs to a preset.
 */
async function anchorKeepsState(page, where, errors) {
  const input = page.locator(`${TOOL} input[type="number"]`).first();
  if ((await input.count()) === 0) return;
  const before = await input.inputValue();
  const next = before === '' ? '7' : String(Number(before) * 1.5);
  await input.fill(next);
  await page.waitForTimeout(300);
  const id = await page.evaluate(() => [...document.querySelectorAll('h2[id]')].pop()?.id ?? '');
  if (!id) return;
  await page.evaluate((h) => {
    window.location.hash = h;
  }, id);
  await page.waitForTimeout(300);
  if ((await input.inputValue()) !== next) errors.push(`${where}: following the in-page anchor #${id} reset the tool's inputs`);
  await input.fill(before);
}

/** Designer: Space on the second topology button selects it and loads that topology's specification. */
async function designerAction(page, where, errors) {
  const buttons = page.locator(`${TOOL} .pe-sim__buttons[role="group"] button`);
  const second = buttons.nth(1);
  const before = await page.locator(`${TOOL} #des-V`).inputValue();
  await second.focus();
  await page.keyboard.press('Space');
  await page.waitForTimeout(100);
  if ((await second.getAttribute('aria-pressed')) !== 'true') errors.push(`${where}: Space did not select a topology button`);
  if ((await page.locator(`${TOOL} #des-V`).inputValue()) === before) errors.push(`${where}: the topology's specification was not loaded`);
  await staleAndHash(page, where, errors, 'des');
}

/** Loss budget: Space on the second topology button selects it and loads that topology's example. */
async function lossAction(page, where, errors) {
  const buttons = page.locator(`${TOOL} .pe-sim__buttons[role="group"] button`);
  const second = buttons.nth(1);
  const before = await page.locator(`${TOOL} #loss-V`).inputValue();
  await second.focus();
  await page.keyboard.press('Space');
  await page.waitForTimeout(100);
  if ((await second.getAttribute('aria-pressed')) !== 'true') errors.push(`${where}: Space did not select a topology button`);
  if ((await page.locator(`${TOOL} #loss-V`).inputValue()) === before) errors.push(`${where}: the topology's example was not loaded`);
  await staleAndHash(page, where, errors, 'loss');
  // a budget takes a few seconds (every point is a simulation)
  await noStaleResult(page, where, errors, 'loss', 10000);
}

/** Clamp check: Space on the second clamp-type button selects the RCD clamp and shows its resistor. */
async function clampAction(page, where, errors) {
  const buttons = page.locator(`${TOOL} .pe-sim__buttons[role="group"] button`);
  const second = buttons.nth(1);
  await second.focus();
  await page.keyboard.press('Space');
  await page.waitForTimeout(100);
  if ((await second.getAttribute('aria-pressed')) !== 'true') errors.push(`${where}: Space did not select a clamp type`);
  if ((await page.locator(`${TOOL} #clamp-R`).count()) !== 1) errors.push(`${where}: the RCD clamp's resistor field did not appear`);
  await staleAndHash(page, where, errors, 'clamp');
}

/** Source matcher: Space on the second envelope button selects the rectified sine and shows its frequency. */
async function sourceAction(page, where, errors) {
  const buttons = page.locator(`${TOOL} .pe-sim__buttons[role="group"] button`);
  const second = buttons.nth(1);
  await second.focus();
  await page.keyboard.press('Space');
  await page.waitForTimeout(100);
  if ((await second.getAttribute('aria-pressed')) !== 'true') errors.push(`${where}: Space did not select an envelope`);
  if ((await page.locator(`${TOOL} #src-fenv`).count()) !== 1) errors.push(`${where}: the envelope frequency field did not appear`);
  // an envelope run of a few seconds: the bus settles for 7 R_s C_bus
  await page.locator(`${TOOL} #src-fenv`).fill('1');
  await page.locator(`${TOOL} #src-Cbus`).fill('5e-5');
  await staleAndHash(page, where, errors, 'src');
  await noStaleResult(page, where, errors, 'src', 10000);
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
        await settle(page, p.ready);
        const n = await checkOrder(page, where, errors);
        await p.action(page, where, errors);
        await anchorKeepsState(page, where, errors);
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
