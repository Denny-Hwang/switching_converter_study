import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { sim } from 'pe-core';
import SequenceView from './SequenceView';
import { SEQ_TEXT } from '../i18n/sequence';
import type { PlotTheme } from '../lib/plot';

/**
 * The operating-mode view as the page renders it: what its description says
 * about each inductor's voltage is the number in its table, a positive
 * voltage across an inductance goes with a current that grows along the
 * arrow and a negative one with a current that shrinks, the forward
 * converter's core reset is said in the mode where it happens, and an
 * instant inside a mode is printed inside the mode's printed range.
 */

const THEME: PlotTheme = { dark: false, text: '#000', muted: '#555', grid: '#ddd', line: '#888', band: '#eee', font: 'sans-serif', colors: ['#111', '#222', '#333', '#444', '#555'] };

/** A formatted value (fmtValue) back to a number. */
function parse(v: string): number {
  const m = /^(−?[\d.]+(?:e[+-]?\d+)?) ?([pnµmkMG]?)(V|A|s)$/.exec(v.trim());
  if (!m) throw new Error(`not a value: "${v}"`);
  const prefix: Record<string, number> = { p: 1e-12, n: 1e-9, µ: 1e-6, m: 1e-3, '': 1, k: 1e3, M: 1e6, G: 1e9 };
  return Number(m[1]!.replace('−', '-')) * prefix[m[2]!]!;
}

const strip = (html: string) => html.replace(/<[^>]+>/g, '').replace(/&#x27;/g, "'").replace(/&amp;/g, '&');

interface Shown {
  description: string;
  heading: string;
  rows: { name: string; state: string; current: string; voltage: string }[];
}

function render(r: sim.SimResult, k: number, locale: 'en' | 'ko'): Shown {
  const ms = sim.modes(r);
  const html = renderToStaticMarkup(createElement(SequenceView, { result: r, modes: ms, text: SEQ_TEXT[locale], selected: k, onSelect: () => {}, theme: THEME }));
  const text = /<div class="pe-seq__text"><h4>(.*?)<\/h4><p>(.*?)<\/p>/s.exec(html);
  const rows = [...html.matchAll(/<tr[^>]*><th scope="row">(.*?)<\/th><td>(.*?)<\/td><td>(.*?)<\/td><td>(.*?)<\/td><\/tr>/gs)].map((m) => ({
    name: strip(m[1]!),
    state: strip(m[2]!),
    current: strip(m[3]!),
    voltage: strip(m[4]!),
  }));
  return { heading: strip(text?.[1] ?? ''), description: strip(text?.[2] ?? ''), rows };
}

/** The average in a "start → end (average)" cell. */
const avgOf = (cell: string) => parse(/\((.*)\)$/.exec(cell)![1]!);

/** What the description says each inductor's voltage averages, by the symbol it names (L, LM), with its parts. */
function saidVolts(description: string, locale: 'en' | 'ko'): Map<string, { v: number; vr?: number; vl?: number }> {
  const out = new Map<string, { v: number; vr?: number; vl?: number }>();
  const re =
    locale === 'en'
      ? /The voltage across (\w+) averages (.+?)(?:: (.+?) across its winding resistance, (.+?) across its inductance)?\.(?: |$)/g
      : /(\w+) 양단 전압은 평균 (.+?)입니다(?:: 권선 저항에 (.+?), 인덕턴스에 (.+?)\.(?: |$))?/g;
  for (const m of description.matchAll(re)) out.set(m[1]!, { v: parse(m[2]!), vr: m[3] ? parse(m[3]) : undefined, vl: m[4] ? parse(m[4]) : undefined });
  return out;
}

const CASES: [string, sim.SimParams][] = [
  // the second review's circuits: the resistances take more than the input gives while S is on
  ['boost, 12 V, 1 ohm, lossy', { topology: 'boost', Vg: 12, D: 0.6, fs: 2e5, L: 1e-4, Ron: 0.5, RL: 0.1, VF: 0.3, load: { kind: 'resistive', R: 1, C: 4.7e-6 } }],
  ['boost into a fixed output below its input', { topology: 'boost', Vg: 54.4, D: 0.414, fs: 5e5, L: 1.48e-4, Ron: 0.0855, RL: 0.0156, VF: 0.247, load: { kind: 'fixed', V: 9.9 } }],
  ['buck into a fixed output', { topology: 'buck', Vg: 24, D: 0.4, fs: 1e5, L: 1e-4, Ron: 0.1, load: { kind: 'fixed', V: 8 } }],
  // a reverse current: the arrow points back to the input
  ['buck, battery above the input', { topology: 'buck', Vg: 24, D: 0.5, fs: 1e5, L: 1e-4, Ron: 0.05, RL: 0.02, load: { kind: 'network', C: 2.2e-5, battery: { V: 30, R: 0.5 } } }],
  ['buck-boost in DCM with a node capacitance', { topology: 'buckboost', Vg: 12, D: 0.3, fs: 1e5, L: 2e-5, Ron: 0.1, RL: 0.05, VF: 0.5, Cnode: 1e-10, load: { kind: 'resistive', R: 50, C: 1e-4 } }],
  ['flyback with a winding resistance', { topology: 'flyback', Vg: 48, D: 0.4, fs: 1e5, L: 2e-5, n: 0.25, Ron: 0.1, RL: 0.05, VF: 0.5, load: { kind: 'resistive', R: 10, C: 1e-4 } }],
  ['forward', { topology: 'forward', Vg: 48, D: 0.4, fs: 1e5, L: 1e-4, n: 0.5, nr: 1, LM: 1e-2, load: { kind: 'resistive', R: 0.5, C: 1e-4 } }],
  ['forward beyond its reset limit, held by R_on', { topology: 'forward', Vg: 48, D: 0.7, fs: 1e5, L: 1e-4, n: 0.5, nr: 1, LM: 1e-3, Ron: 0.1, load: { kind: 'resistive', R: 5, C: 1e-4 } }],
];

describe("the description's voltages are the table's", () => {
  for (const [name, p] of CASES) {
    it(name, () => {
      const r = sim.simulate(p);
      expect(r.status).toBe('steady');
      const ms = sim.modes(r);
      const s = sim.schematic(p);
      for (const locale of ['en', 'ko'] as const) {
        for (let k = 0; k < ms.length; k++) {
          const v = render(r, k, locale);
          const states = sim.elementStates(r, ms[k]!, s);
          expect(v.rows.length).toBe(states.length);
          const said = saidVolts(v.description, locale);
          states.forEach((e, j) => {
            if (e.kind !== 'inductor') return;
            const sym = e.id === 'LM' ? 'LM' : 'L';
            const at = `${locale} mode ${k + 1}, ${e.id} (${e.state})`;
            if (e.state === 'zero') {
              expect(said.has(sym), at).toBe(false);
              return;
            }
            const got = said.get(sym);
            expect(got, `${at}: ${v.description}`).toBeDefined();
            // the same number as the table's average, printed the same
            expect(got!.v, at).toBe(avgOf(v.rows[j]!.voltage));
            // with a winding resistance, its parts; they add up to the whole, to the printed digits
            const R = e.id === 'LM' && p.topology === 'forward' ? 0 : (p.RL ?? 0);
            expect(got!.vr === undefined, at).toBe(R === 0);
            if (got!.vr !== undefined) expect(Math.abs(got!.vr + got!.vl! - got!.v), at).toBeLessThanOrEqual(0.006 * Math.max(Math.abs(got!.v), Math.abs(got!.vr), Math.abs(got!.vl!)));
            // the voltage across the inductance and the current's change agree: along the arrow, a current that
            // only grows has a positive one, a current that only shrinks a negative one
            const vl = got!.vl ?? got!.v;
            if (e.signChanges === 0 && e.state === 'storing') expect(vl, at).toBeGreaterThan(0);
            if (e.signChanges === 0 && e.state === 'releasing') expect(vl, at).toBeLessThan(0);
          });
        }
      }
    });
  }
});

describe("the forward converter's core reset is said where it happens", () => {
  const reset = (name: string) => [SEQ_TEXT.en['say.reset']!, SEQ_TEXT.en['say.noReset']!].map((x) => x.replace(/_/g, '')).map((x) => name.includes(x));
  it('the magnetizing current reaches zero in the mode where the reset winding returns it', () => {
    const r = sim.simulate(CASES[6]![1]);
    const ms = sim.modes(r);
    expect(ms.map((m) => m.kind)).toEqual(['on', 'off', 'offM0']);
    const said = ms.map((_, k) => reset(render(r, k, 'en').description));
    expect(said).toEqual([
      [false, false],
      [true, false],
      [false, false],
    ]);
    const s = sim.schematic(r.params);
    const off = ms[1]!;
    const sc = sim.modeScales(r, off, s);
    const LM = sim.elementStates(r, off, s, sc).find((e) => e.id === 'LM')!;
    expect(Math.abs(LM.i1)).toBeLessThanOrEqual(sim.countingFloor(r, sc.get('LM')!));
    expect(LM.i0).toBeGreaterThan(1e-3);
  });

  it('beyond the reset limit, the magnetizing current never returns to zero: said in the mode that ends the period', () => {
    for (const p of [
      CASES[7]![1],
      { topology: 'forward', Vg: 67.1, D: 0.695, fs: 2e4, L: 1.88e-6, n: 0.149, nr: 1.44, LM: 6.05e-3, Ron: 0.102, RL: 0.00781, VF: 0.101, load: { kind: 'fixed', V: 8.65 } } as sim.SimParams,
    ]) {
      const r = sim.simulate(p);
      expect(r.status).toBe('steady');
      const ms = sim.modes(r);
      const said = ms.map((_, k) => reset(render(r, k, 'en').description));
      expect(said.at(-1)).toEqual([false, true]);
      for (const x of said.slice(0, -1)) expect(x).toEqual([false, false]);
      // the magnetizing current's smallest value over the period is far from zero
      expect(Math.min(...(r.waveforms.i_M as number[]))).toBeGreaterThan(100);
    }
  });

  it('the Korean view says the same', () => {
    const r = sim.simulate(CASES[6]![1]);
    const ko = sim.modes(r).map((_, k) => render(r, k, 'ko').description);
    expect(ko[1]).toContain(SEQ_TEXT.ko['say.reset']!.replace(/_/g, ''));
    expect(ko.filter((d) => d.includes(SEQ_TEXT.ko['say.reset']!.replace(/_/g, ''))).length).toBe(1);
  });
});

describe('instants inside a mode are printed inside its printed range', () => {
  it('a current that reverses within a sub-microsecond mode', () => {
    // the second review's boost: a mode from 9.55921 to 9.55977 us whose current reversed "at 9.56 us"
    const r = sim.simulate({ topology: 'boost', Vg: 12, D: 0.4, fs: 1e5, L: 5e-6, Ron: 0.1, Cnode: 1e-10, load: { kind: 'resistive', R: 10, C: 1e-4 } });
    const ms = sim.modes(r);
    let checked = 0;
    for (let k = 0; k < ms.length; k++) {
      const v = render(r, k, 'en');
      const range = /: (.+?) to (.+?) \(/.exec(v.heading)!;
      const [t0, t1] = [parse(range[1]!), parse(range[2]!)];
      for (const row of v.rows) {
        const at = /reverses at (.+?)\)/.exec(row.state);
        if (!at) continue;
        const t = parse(at[1]!);
        expect(t, `mode ${k + 1}: ${v.heading} / ${row.state}`).toBeGreaterThanOrEqual(t0);
        expect(t, `mode ${k + 1}: ${v.heading} / ${row.state}`).toBeLessThanOrEqual(t1);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(0);
  });
});

describe('a circuit at rest', () => {
  it('has no modes to select, and the view says why', () => {
    const r = sim.simulate({ topology: 'buck', Vg: 24, D: 0.4, fs: 1e5, L: 1e-4, Ron: 0.1, load: { kind: 'network', C: 1e-5, V0: 0 } });
    expect(sim.atRest(r)).toBe(true);
    for (const locale of ['en', 'ko'] as const) {
      const html = renderToStaticMarkup(createElement(SequenceView, { result: r, modes: [], text: SEQ_TEXT[locale], selected: 0, onSelect: () => {}, theme: THEME }));
      expect(html).toContain(SEQ_TEXT[locale].rest!);
      expect(html).not.toContain('pe-seq__mode');
    }
  });
});
