import { describe, expect, it } from 'vitest';
import { stateFromHash as clampState } from '../tools/ClampCheck';
import { stateFromHash as designState } from '../tools/ConverterDesigner';
import { stateFromHash as lossState } from '../tools/LossBudget';
import { stateFromHash as senseState } from '../tools/SenseChain';
import { stateFromHash as sourceState } from '../tools/SourceMatcher';
import { CLAMP_PRESETS, clampValues } from './clamppresets';
import { DESIGN_PRESETS, designValues } from './designpresets';
import { LOSS_PRESETS, lossValues } from './losspresets';
import { SENSE_PRESETS, senseValues } from './sensepresets';
import { SOURCE_PRESETS, sourceValues } from './sourcepresets';
import { TOOL_IDS, TOOL_PAGES, toolHash, toolPresets, type ToolId } from './toollinks';

/**
 * A <TryTool /> link must open the tool exactly as its own preset button does: the preset's kind,
 * every field the example sets, and the other fields empty. The presets are built as the tools'
 * Astro wrappers build them (src/components/<Tool>.astro).
 */
const clampPresets = CLAMP_PRESETS.map((p) => ({ id: p.example, label: p.example, kind: p.kind, values: clampValues(p.example) }));
const designPresets = DESIGN_PRESETS.map((p) => ({ id: p.example, label: p.example, topology: p.topology, values: designValues(p.example) }));
const lossPresets = LOSS_PRESETS.map((p) => ({ id: p.example, label: p.example, topology: p.topology, values: lossValues(p.example, p.topology) }));
const sensePresets = SENSE_PRESETS.map((p) => ({ id: p.example, label: p.example, kind: p.kind, values: senseValues(p.example) }));
const sourcePresets = SOURCE_PRESETS.map((id) => ({ id, label: id, values: sourceValues(id) }));

/** The tool's state for the link, and the kind and values its preset button would set. */
function opened(tool: ToolId, example: string): { got: { kind: string; values: Record<string, string> }; want: { kind: string; values: Record<string, number> } } {
  const h = new URLSearchParams(toolHash(tool, example));
  switch (tool) {
    case 'clamp-check': {
      const s = clampState(h, clampPresets);
      const p = clampPresets.find((x) => x.id === example)!;
      return { got: { kind: s.kind, values: s.values }, want: { kind: p.kind, values: p.values } };
    }
    case 'converter-designer': {
      const s = designState(h, designPresets);
      const p = designPresets.find((x) => x.id === example)!;
      return { got: { kind: s.topo, values: s.values }, want: { kind: p.topology, values: p.values } };
    }
    case 'loss-budget': {
      const s = lossState(h, lossPresets);
      const p = lossPresets.find((x) => x.id === example)!;
      return { got: { kind: s.topo, values: s.values }, want: { kind: p.topology, values: p.values } };
    }
    case 'sense-chain': {
      const s = senseState(h, sensePresets);
      const p = sensePresets.find((x) => x.id === example)!;
      return { got: { kind: s.kind, values: s.values }, want: { kind: p.kind, values: p.values } };
    }
    case 'source-matcher': {
      const s = sourceState(h, sourcePresets);
      const p = sourcePresets.find((x) => x.id === example)!;
      return { got: { kind: s.env, values: s.values }, want: { kind: p.values.fenv !== undefined ? 'sine' : 'none', values: p.values } };
    }
  }
}

describe('links into the design tools (<TryTool />)', () => {
  it('know every tool page', () => {
    expect([...TOOL_IDS].sort()).toEqual(['clamp-check', 'converter-designer', 'loss-budget', 'sense-chain', 'source-matcher']);
    for (const tool of TOOL_IDS) expect(TOOL_PAGES[tool]).toBe(`design/${tool}`);
  });

  for (const tool of TOOL_IDS) {
    for (const example of toolPresets(tool)) {
      it(`${tool}: ${example} opens as its preset button sets it`, () => {
        const { got, want } = opened(tool, example);
        expect(got.kind).toBe(want.kind);
        for (const [k, v] of Object.entries(got.values)) {
          expect(v, `${tool} ${example}: field ${k}`).toBe(want.values[k] !== undefined ? String(want.values[k]) : '');
        }
        for (const k of Object.keys(want.values)) expect(k in got.values, `${tool} ${example}: field ${k} is not in the form`).toBe(true);
      });
    }
  }

  it('refuse an example that is not a preset of the tool', () => {
    expect(() => toolHash('clamp-check', 'buck-basic')).toThrow(/not a preset of that tool/);
    expect(() => toolHash('source-matcher', 'clamp-rcd')).toThrow(/not a preset of that tool/);
  });
});
