import { describe, expect, it } from 'vitest';
import { sim } from 'pe-core';
import { NAMES } from '../lib/seqlayout';
import { SAY, SEQ_TEXT, descKey, elementKey, energySentences, kindKey, stateKey } from './sequence';

/**
 * The operating-mode view has a text for everything the simulator can show:
 * every interval of every model (with and without a node capacitance, a
 * source, each load), every element of every drawn circuit, every state of
 * every kind of element, in English and in Korean.
 */

const TOPOLOGIES: sim.Topology[] = ['buck', 'boost', 'buckboost', 'flyback', 'forward'];
const LOADS: sim.SimParams['load'][] = [
  { kind: 'resistive', R: 10, C: 1e-4 },
  { kind: 'network', C: 1e-4, battery: { V: 8, R: 0.5 } },
  { kind: 'network', C: 1e-4, R: 20, battery: { V: 8, R: 0.5 } },
  { kind: 'network', C: 1e-4, V0: 0 },
  { kind: 'fixed', V: 12 },
];

function variants(): sim.SimParams[] {
  const out: sim.SimParams[] = [];
  for (const topology of TOPOLOGIES) {
    for (const load of LOADS) {
      const p = { topology, Vg: 24, D: 0.4, fs: 1e5, L: 1e-4, n: 0.5, nr: 1, LM: 1e-3, Ron: 0.1, load } as sim.SimParams;
      out.push(p, { ...p, source: { Voc: 30, Rs: 1, Cbus: 1e-4 } });
      if (topology !== 'forward') out.push({ ...p, Cnode: 1e-10 }, { ...p, Cnode: 1e-10, source: { Voc: 30, Rs: 1, Cbus: 1e-4 } });
    }
  }
  return out;
}

describe('operating-mode texts', () => {
  it('English and Korean have the same keys, none empty but the idle short states', () => {
    const en = Object.keys(SEQ_TEXT.en).sort();
    const ko = Object.keys(SEQ_TEXT.ko).sort();
    expect(ko).toEqual(en);
    for (const locale of ['en', 'ko'] as const) {
      for (const [k, v] of Object.entries(SEQ_TEXT[locale])) {
        if (k === 'short.idle') continue;
        expect(v.trim().length, `${locale} ${k}`).toBeGreaterThan(0);
      }
    }
  });

  it('every interval of every model has a mode name and a description', () => {
    const missing: string[] = [];
    for (const p of variants()) {
      const kinds = new Set(Object.keys(sim.buildModel(p).intervals).map((iv) => (iv === 'clamp' ? 'ring' : iv)));
      for (const kind of kinds) {
        for (const locale of ['en', 'ko'] as const) {
          const text = SEQ_TEXT[locale];
          if (!text[kindKey(p.topology, kind)]) missing.push(`${locale} ${kindKey(p.topology, kind)}`);
          // a rise ends as the diode takes over, as the current reaches zero first, or at turn-on
          for (const next of kind === 'rise' ? ['off', 'ring', undefined] : [undefined]) {
            const key = descKey(p.topology, kind, text, next);
            if (!text[key]) missing.push(`${locale} ${key}`);
          }
        }
      }
    }
    expect([...new Set(missing)]).toEqual([]);
  });

  it('every element of every drawn circuit has a name, a drawn symbol, and a text for each state it can be in', () => {
    const missing: string[] = [];
    for (const p of variants()) {
      for (const b of sim.schematic(p).branches) {
        if (b.kind === 'wire') continue;
        if (!NAMES[b.id]) missing.push(`drawn name ${b.id}`);
        for (const locale of ['en', 'ko'] as const) {
          const text = SEQ_TEXT[locale];
          if (!text[elementKey(p.topology, b.id)]) missing.push(`${locale} ${elementKey(p.topology, b.id)}`);
          for (const st of sim.STATES[b.kind]) {
            for (const prefix of ['st', 'short'] as const) {
              if (!(stateKey(b.kind, st, prefix) in text)) missing.push(`${locale} ${stateKey(b.kind, st, prefix)}`);
            }
          }
        }
      }
    }
    expect([...new Set(missing)]).toEqual([]);
  });
});

describe('the energy sentences', () => {
  it('every state of every element they name has a sentence in both languages, and each source its name', () => {
    const missing: string[] = [];
    for (const p of variants()) {
      for (const b of sim.schematic(p).branches) {
        const say = SAY[b.id];
        if (!say || b.kind === 'wire') continue;
        expect(say.kind, b.id).toBe(b.kind);
        for (const locale of ['en', 'ko'] as const) {
          const text = SEQ_TEXT[locale];
          for (const st of sim.STATES[b.kind]) if (!text[stateKey(say.kind, st, 'say')]) missing.push(`${locale} ${stateKey(say.kind, st, 'say')}`);
          if (say.kind === 'vsource' && !text[`src.${b.id}`]) missing.push(`${locale} src.${b.id}`);
        }
      }
    }
    expect([...new Set(missing)]).toEqual([]);
    for (const locale of ['en', 'ko'] as const) for (const k of ['rest', 'tableNote']) expect(SEQ_TEXT[locale][k], `${locale} ${k}`).toBeTruthy();
  });

  it("follow the table's states, one sentence per element, with no placeholder left", () => {
    const p: sim.SimParams = { topology: 'buck', Vg: 24, D: 0.6, fs: 2e5, L: 2e-5, source: { Voc: 24, Rs: 0.2, Cbus: 1e-5 }, load: { kind: 'network', C: 2.2e-5, R: 20, battery: { V: 15.84, R: 2 } } };
    const r = sim.simulate(p);
    for (const m of sim.modes(r)) {
      const states = sim.elementStates(r, m);
      for (const locale of ['en', 'ko'] as const) {
        const said = energySentences(states, SEQ_TEXT[locale]);
        // L, C, the battery, the source and the bus capacitor
        expect(said.length).toBe(5);
        for (const x of said) expect(x).not.toMatch(/[{}]/);
      }
      const battery = states.find((e) => e.id === 'B')!;
      expect(energySentences(states, SEQ_TEXT.en)).toContain(SEQ_TEXT.en[`say.battery.${battery.state}`]);
    }
  });
});
