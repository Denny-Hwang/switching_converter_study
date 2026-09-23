import { describe, expect, it } from 'vitest';
import { catalog } from 'pe-core';
import { TOOL_SYMBOLS, toolSymbols } from '../i18n/symbols';
import { FIELDS as CLAMP } from './ClampCheck';
import { FIELDS as DESIGN } from './ConverterDesigner';
import { FIELDS as LOSS } from './LossBudget';
import { FIELDS as SENSE } from './SenseChain';
import { FIELDS as SIM } from './Simulator';
import { FIELDS as SOURCE } from './SourceMatcher';

const TOPOLOGIES = ['buck', 'boost', 'buckboost', 'flyback', 'forward'] as const;

/** Every label a tool's inputs can show, over every state that changes a label. */
function labels(): Set<string> {
  const out = new Set<string>();
  for (const f of [...CLAMP, ...SENSE, ...SOURCE]) out.add(f.label);
  for (const t of TOPOLOGIES) {
    for (const f of DESIGN) out.add(f.label(t));
    for (const f of LOSS) out.add(f.label(t));
    for (const load of ['res', 'fixed'] as const) {
      for (const source of [false, true]) for (const f of SIM) out.add(f.label({ topo: t, load, source }));
    }
  }
  return out;
}

describe('symbol meanings (what a symbol stands for, next to it)', () => {
  it('every input label of every tool has a meaning in English and Korean', () => {
    const missing = [...labels()].filter((l) => !TOOL_SYMBOLS[l]?.en || !TOOL_SYMBOLS[l]?.ko);
    expect(missing).toEqual([]);
  });

  it("the simulator's comparison rows have meanings too", () => {
    for (const l of ['|M|', 'I_L', 'Δi_L,pp (on)', 'V_DS,max', 'R_in', 'V_g,crit']) expect(TOOL_SYMBOLS[l]?.ko).toBeTruthy();
  });

  it('every catalogue symbol has a short meaning in both languages, and the Korean one is Korean', () => {
    for (const [name, s] of Object.entries(catalog.symbols)) {
      expect(s.meaning.length, name).toBeGreaterThan(0);
      expect(s.meaning.length, name).toBeLessThanOrEqual(60);
      expect(s.meaning_ko, name).toMatch(/[가-힣]/);
    }
  });

  it('a catalogue symbol in a tool says what the catalogue says', () => {
    expect(TOOL_SYMBOLS.D).toEqual({ en: catalog.symbols.D!.meaning, ko: catalog.symbols.D!.meaning_ko });
    expect(toolSymbols('ko').L_M).toBe(catalog.symbols.L_M!.meaning_ko);
  });
});
