import { describe, expect, it } from 'vitest';
import { sim } from 'pe-core';
import { SEQ_TEXT, stateKey } from '../i18n/sequence';
import { collisions, layoutCircuit, stateLines, textWidth, FONT, U, type BranchView } from './seqlayout';

/**
 * The circuit drawn for the operating modes stays legible for every
 * topology, load, node capacitance, source and language: no label overlaps
 * another label, a wire, a symbol, an arrow or the core; no symbol overlaps
 * another or crosses a wire; nothing leaves the drawing. Each element is
 * drawn with the widest and with the tallest (two-line) state its kind can
 * have, and its current both ways, with one head and with two.
 */

type Params = sim.SimParams;
const TOPOLOGIES: sim.Topology[] = ['buck', 'boost', 'buckboost', 'flyback', 'forward'];
const LOADS: [string, Params['load']][] = [
  ['R||C', { kind: 'resistive', R: 10, C: 1e-4 }],
  ['battery', { kind: 'network', C: 1e-4, battery: { V: 8, R: 0.5 } }],
  ['battery and R', { kind: 'network', C: 1e-4, R: 20, battery: { V: 8, R: 0.5 } }],
  ['C alone', { kind: 'network', C: 1e-4, V0: 0 }],
  ['fixed', { kind: 'fixed', V: 12 }],
];

function variants(): [string, Params][] {
  const out: [string, Params][] = [];
  for (const t of TOPOLOGIES) {
    for (const [ln, load] of LOADS) {
      const p = { topology: t, Vg: 24, D: 0.4, fs: 1e5, L: 1e-4, n: 0.5, nr: 1, LM: 1e-3, load } as Params;
      out.push([`${t}, ${ln}`, p]);
      out.push([`${t}, ${ln}, source`, { ...p, source: { Voc: 30, Rs: 1, Cbus: 1e-4 } }]);
      if (t !== 'forward') {
        out.push([`${t}, ${ln}, node capacitance`, { ...p, Cnode: 1e-10, Ron: 0.1 }]);
        out.push([`${t}, ${ln}, node capacitance, source`, { ...p, Cnode: 1e-10, Ron: 0.1, source: { Voc: 30, Rs: 1, Cbus: 1e-4 } }]);
      }
    }
  }
  return out;
}

/** The short states a kind can show, in a language. */
function shorts(kind: string, locale: 'en' | 'ko'): string[] {
  const text = SEQ_TEXT[locale];
  return sim.STATES[kind as keyof typeof sim.STATES].map((st) => text[stateKey(kind, st, 'short')]!);
}

/** The widest and the tallest state of a kind as drawn. */
function worst(kind: string, locale: 'en' | 'ko'): string[] {
  const all = shorts(kind, locale);
  const width = (s: string) => Math.max(0, ...stateLines(s).map((l) => textWidth(l, FONT.state)));
  const widest = all.reduce((a, b) => (width(b) > width(a) ? b : a));
  const tallest = all.reduce((a, b) => (stateLines(b).length > stateLines(a).length ? b : a));
  return [widest, tallest];
}

describe('the operating-mode drawing: nothing overlaps', () => {
  for (const [name, p] of variants()) {
    for (const locale of ['en', 'ko'] as const) {
      it(`${name} (${locale})`, () => {
        const s = sim.schematic(p);
        for (const pick of [0, 1]) {
          for (const [sign, reverses] of [
            [1, false],
            [-1, false],
            [1, true],
          ] as const) {
            const view = (b: sim.SchematicBranch): BranchView => ({
              state: b.kind === 'wire' ? undefined : worst(b.kind, locale)[pick],
              sign,
              reverses,
            });
            const l = layoutCircuit(s, view);
            expect(collisions(l), `${name}, ${locale}, state ${pick}, sign ${sign}${reverses ? ', reversing' : ''}`).toEqual([]);
          }
        }
      });
    }
  }
});

describe('the operating-mode drawing: windings by their core', () => {
  for (const [name, p] of variants().filter(([, q]) => q.topology === 'flyback' || q.topology === 'forward')) {
    it(name, () => {
      const s = sim.schematic(p);
      const l = layoutCircuit(s, () => ({ sign: 0, reverses: false }));
      const cores = l.cores;
      expect(cores.length).toBe(1);
      const core = cores[0]!;
      for (const b of l.branches.filter((x) => x.b.kind === 'winding')) {
        // the winding's symbol lies along the core, within 0.75 grid units of it, its turns towards it
        expect(Math.abs(b.c[0] - core.x), b.b.id).toBeLessThan(0.75 * U);
        expect(b.c[1] - b.h, b.b.id).toBeGreaterThanOrEqual(core.y1 - 1);
        expect(b.c[1] + b.h, b.b.id).toBeLessThanOrEqual(core.y2 + 1);
        const towards = Math.sign(core.x - b.c[0]);
        // the bulge's side on screen: v = (-d.y, d.x) times its sign
        const bulgeX = -b.d[1] * b.bulgeSide;
        expect(Math.sign(bulgeX), `${b.b.id} bulges towards the core`).toBe(towards);
      }
    });
  }
});
