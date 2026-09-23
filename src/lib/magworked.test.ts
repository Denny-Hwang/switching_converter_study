import { describe, expect, it } from 'vitest';
import { catalog } from 'pe-core';
import { resultOf, toMagSpec, withCore } from '../tools/MagneticsDesigner';
import { MAG_PRESETS, magValues } from './magpresets';
import { magWorked, presetSpec } from './magworked';

const strings = (v: Record<string, number>) => Object.fromEntries(Object.entries(v).map(([k, x]) => [k, String(x)]));

describe('magnetics worked examples (<MagWorked />)', () => {
  it('works each preset exactly as the tool does', () => {
    for (const p of MAG_PRESETS) {
      const form = withCore(strings(magValues(p.example)), p.core);
      expect(presetSpec(p.example)).toEqual(toMagSpec(p.device, p.core, p.arrangement ?? 'ps', form));
      const tool = resultOf(p.device, p.core, p.arrangement ?? 'ps', form)!;
      expect(magWorked(p.example).result).toEqual(tool);
    }
  });

  it('gives every row a finite value, a meaning in both languages, and a source', () => {
    for (const p of MAG_PRESETS) {
      const { rows, cite } = magWorked(p.example);
      expect(cite).toMatch(/^tdk_/);
      for (const r of rows) {
        expect(Number.isFinite(r.value), `${p.example}: ${r.latex}`).toBe(true);
        expect(r.meaning.en && r.meaning.ko, `${p.example}: ${r.latex}`).toBeTruthy();
        if (r.kind === 'core') expect(r.cite).toBe(cite);
        if (r.kind === 'result') expect(r.eq !== undefined ? catalog.equations[r.eq] !== undefined : r.note !== undefined, `${p.example}: ${r.latex}`).toBe(true);
      }
    }
  });

  it('the flyback shows both windings and the leakage; the inductor neither', () => {
    const fly = magWorked('mag-flyback').rows;
    expect(fly.filter((r) => r.eq === 'wind.dowell')).toHaveLength(2);
    expect(fly.some((r) => r.eq === 'xfmr.leakage.ps')).toBe(true);
    const ind = magWorked('mag-inductor').rows;
    expect(ind.filter((r) => r.eq === 'wind.dowell')).toHaveLength(1);
    expect(ind.some((r) => r.eq?.startsWith('xfmr.'))).toBe(false);
  });
});
