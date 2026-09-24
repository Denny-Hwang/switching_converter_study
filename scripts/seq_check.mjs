#!/usr/bin/env node
/**
 * Browser check of the simulator's operating-mode drawing. src/lib/seqlayout.test.ts
 * checks the layout with estimated text widths; this one measures the text
 * the browser really draws. It serves dist/ with `astro preview`, opens the
 * simulator for every converter with a resistor, a battery and a resistor,
 * and a fixed output, with and without a Thevenin source, each with a node
 * capacitance of 100 pF (the forward converter has none), and the boost and
 * the flyback converter with 10 pF, whose ringing makes many short modes, in
 * both languages; it selects every mode in turn and checks, in the drawing:
 *
 *   1. every label's text lies inside the box the layout reserved for it
 *      (its data-box), to half a pixel;
 *   2. no label's text meets another label's, an arrow, or the legend;
 *   3. no label, and no part of the legend, leaves the drawing;
 *   4. the legend's two entries do not meet;
 *
 * and in the strip of modes, at 1280, 768 and 360 pixels wide: every
 * button's text lies inside its button (a word the browser cannot hyphenate
 * widens the button instead).
 *
 *     npm run build && node scripts/seq_check.mjs
 */
import { chromium } from 'playwright';
import { startPreview } from './preview.mjs';

const TOPOLOGIES = {
  buck: 'topo=buck&Vg=24&D=0.4&fs=100000&L=0.0001',
  boost: 'topo=boost&Vg=12&D=0.4&fs=100000&L=0.0001',
  buckboost: 'topo=buckboost&Vg=12&D=0.4&fs=100000&L=0.0001',
  flyback: 'topo=flyback&Vg=48&D=0.3&fs=100000&L=0.00002&n=0.25',
  forward: 'topo=forward&Vg=48&D=0.3&fs=100000&L=0.00002&n=0.5&nr=1&LM=0.001',
};
const LOADS = {
  res: 'load=res&R=10&C=0.0001',
  batr: 'load=batr&R=20&C=0.0001&Vb=5&Rb=0.5',
  fixed: 'load=fixed&V=30',
};
/** A fixed output each converter can reach from its input (below it for the buck and the forward converter). */
const FIXED = { buck: 8, boost: 30, buckboost: 6, flyback: 8, forward: 10 };

function jobs() {
  const out = [];
  for (const [t, th] of Object.entries(TOPOLOGIES)) {
    for (const [l, lh] of Object.entries(LOADS)) {
      for (const src of [0, 1]) {
        const cn = t === 'forward' ? '' : '&Cnode=1e-10';
        const s = src ? '&src=1&Voc=60&Rs=1&Cbus=0.0001' : '&src=0';
        const load = l === 'fixed' ? `load=fixed&V=${FIXED[t]}` : lh;
        const hash = `${th}&${load}${s}&Ron=0.1&RL=&VF=0.5${cn}`;
        for (const locale of ['en', 'ko']) out.push({ name: `${t}, ${l}${src ? ', source' : ''} (${locale})`, hash, locale });
      }
    }
  }
  for (const t of ['boost', 'flyback']) {
    const hash = `${TOPOLOGIES[t]}&${LOADS.res}&src=0&Ron=0.1&RL=&VF=0.5&Cnode=1e-11`;
    for (const locale of ['en', 'ko']) out.push({ name: `${t}, res, 10 pF (${locale})`, hash, locale });
  }
  return out;
}

/** The problems in the drawing of the selected mode. */
function problemsInDrawing() {
  const svg = document.querySelector('.pe-seq__svg');
  const vb = svg.viewBox.baseVal;
  const labels = [...svg.querySelectorAll('.pe-seq__label')].map((g) => {
    const bb = g.getBBox();
    return { box: [bb.x, bb.y, bb.x + bb.width, bb.y + bb.height], reserved: g.getAttribute('data-box').split(',').map(Number), text: g.textContent };
  });
  // the arrowheads: a polygon, or a group of two for a current that reverses
  const arrows = [];
  for (const g of svg.children) {
    if (g.tagName !== 'g') continue;
    for (const ch of g.children) {
      const two = ch.tagName === 'g' && ch.children.length === 2 && [...ch.children].every((c) => c.tagName === 'polygon');
      if (ch.tagName === 'polygon' || two) {
        const bb = ch.getBBox();
        arrows.push([bb.x, bb.y, bb.x + bb.width, bb.y + bb.height]);
      }
    }
  }
  const meet = (a, b) => a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3];
  const outside = (b) => b[0] < 0 || b[1] < 0 || b[2] > vb.width || b[3] > vb.height;
  // the legend's line and text of each entry, in the drawing's coordinates (the legend group is translated)
  const toDrawing = (el) => {
    const bb = el.getBBox();
    const m = svg.getScreenCTM().inverse().multiply(el.getScreenCTM());
    const [p, q] = [
      [bb.x, bb.y],
      [bb.x + bb.width, bb.y + bb.height],
    ].map(([x, y]) => new DOMPoint(x, y).matrixTransform(m));
    return [Math.min(p.x, q.x), Math.min(p.y, q.y), Math.max(p.x, q.x), Math.max(p.y, q.y)];
  };
  const legend = [...(svg.querySelector('.pe-seq__legend')?.children ?? [])].map((el) => ({ box: toDrawing(el), text: el.textContent || 'a legend line' }));
  const out = [];
  if (legend.length !== 4) out.push(`the legend has ${legend.length} parts, not two lines and two texts`);
  labels.forEach((l, i) => {
    const [x0, y0, x1, y1] = l.reserved;
    if (l.box[0] < x0 - 0.5 || l.box[2] > x1 + 0.5 || l.box[1] < y0 - 0.5 || l.box[3] > y1 + 0.5) out.push(`"${l.text}" is drawn outside the box reserved for it`);
    if (outside(l.box)) out.push(`"${l.text}" leaves the drawing`);
    labels.forEach((m, k) => {
      if (k > i && meet(l.box, m.box)) out.push(`"${l.text}" meets "${m.text}"`);
    });
    for (const a of arrows) if (meet(l.box, a)) out.push(`"${l.text}" meets an arrow`);
    for (const g of legend) if (meet(l.box, g.box)) out.push(`"${l.text}" meets the legend's "${g.text}"`);
  });
  for (const g of legend) if (outside(g.box)) out.push(`the legend's "${g.text}" leaves the drawing`);
  // entries: [line, text, line, text]
  for (const a of legend.slice(0, 2)) for (const b of legend.slice(2)) if (meet(a.box, b.box)) out.push(`the legend's "${a.text}" meets "${b.text}"`);
  return out;
}

/** The mode buttons whose text leaves them (measured on the text itself, not on its element's box). */
function problemsInStrip() {
  const out = [];
  [...document.querySelectorAll('.pe-seq__mode')].forEach((b, j) => {
    const r = b.getBoundingClientRect();
    for (const ch of b.children) {
      const range = document.createRange();
      range.selectNodeContents(ch);
      const c = range.getBoundingClientRect();
      if (c.left < r.left - 0.5 || c.right > r.right + 0.5) out.push(`mode ${j + 1}'s "${ch.textContent}" (${c.width.toFixed(1)} px) leaves its button (${r.width.toFixed(1)} px)`);
    }
  });
  return out;
}

const { base, stop } = await startPreview(4331);
const browser = await chromium.launch();
const errors = [];
let modes = 0;
try {
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
  for (const job of jobs()) {
    await page.goto('about:blank');
    await page.goto(`${base}/${job.locale}/simulate/simulator/#${job.hash}`);
    const shown = await page
      .locator('.pe-seq__mode')
      .first()
      .waitFor({ timeout: 60000 })
      .then(() => true)
      .catch(() => false);
    if (!shown) {
      errors.push(`${job.name}: no operating modes shown`);
      continue;
    }
    const n = await page.locator('.pe-seq__mode').count();
    for (let j = 0; j < n; j++) {
      await page.locator('.pe-seq__mode').nth(j).click();
      await page.waitForFunction((k) => document.querySelector(`.pe-seq__mode:nth-child(${k + 1})`)?.getAttribute('aria-pressed') === 'true', j);
      modes++;
      for (const p of await page.evaluate(problemsInDrawing)) errors.push(`${job.name}, mode ${j + 1}: ${p}`);
    }
    for (const width of [1280, 768, 360]) {
      await page.setViewportSize({ width, height: 900 });
      await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
      for (const p of await page.evaluate(problemsInStrip)) errors.push(`${job.name}, ${width} px: ${p}`);
    }
    await page.setViewportSize({ width: 1280, height: 900 });
  }
} finally {
  await browser.close();
  stop();
}
if (errors.length) {
  for (const e of errors.slice(0, 40)) console.error(`  ${e}`);
  console.error(`seq_check: FAILED (${errors.length} problems)`);
  process.exit(1);
}
console.log(`seq_check: OK (${jobs().length} circuits, ${modes} modes)`);
