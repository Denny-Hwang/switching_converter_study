#!/usr/bin/env node
/**
 * Browser check of the simulator's operating-mode drawing. src/lib/seqlayout.test.ts
 * checks the layout with estimated text widths; this one measures the text
 * the browser really draws. It serves dist/ with `astro preview`, opens the
 * simulator for every converter with a resistor, a battery and a resistor,
 * and a fixed output, with and without a Thevenin source, each with a node
 * capacitance (the forward converter has none), in both languages; it
 * selects every mode in turn and checks, in the drawing:
 *
 *   1. every label's text lies inside the box the layout reserved for it
 *      (its data-box), to half a pixel;
 *   2. no label's text meets another label's, or an arrow;
 *   3. no label leaves the drawing.
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
  const out = [];
  labels.forEach((l, i) => {
    const [x0, y0, x1, y1] = l.reserved;
    if (l.box[0] < x0 - 0.5 || l.box[2] > x1 + 0.5 || l.box[1] < y0 - 0.5 || l.box[3] > y1 + 0.5) out.push(`"${l.text}" is drawn outside the box reserved for it`);
    if (l.box[0] < 0 || l.box[1] < 0 || l.box[2] > vb.width || l.box[3] > vb.height) out.push(`"${l.text}" leaves the drawing`);
    labels.forEach((m, k) => {
      if (k > i && meet(l.box, m.box)) out.push(`"${l.text}" meets "${m.text}"`);
    });
    for (const a of arrows) if (meet(l.box, a)) out.push(`"${l.text}" meets an arrow`);
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
