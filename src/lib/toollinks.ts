/**
 * Deep links into the design tools with a preset (<TryTool />): the URL hash each tool writes
 * for its state (its own hashOf), filled as its preset button fills the form: every field the
 * synthetic example sets, the others empty. The simulator and the magnetics designer have their
 * own links (<TrySim />, <TryMag />).
 */
import { hashOf as clampHashOf } from '../tools/ClampCheck';
import { hashOf as designHashOf } from '../tools/ConverterDesigner';
import { hashOf as lossHashOf } from '../tools/LossBudget';
import { hashOf as senseHashOf } from '../tools/SenseChain';
import { hashOf as sourceHashOf } from '../tools/SourceMatcher';
import { CLAMP_PRESETS, clampValues } from './clamppresets';
import { DESIGN_PRESETS, designValues } from './designpresets';
import { LOSS_PRESETS, lossValues } from './losspresets';
import { SENSE_PRESETS, senseValues } from './sensepresets';
import { SOURCE_PRESETS, sourceValues } from './sourcepresets';

/** Each tool's page (a slug under the locale). */
export const TOOL_PAGES = {
  'clamp-check': 'design/clamp-check',
  'converter-designer': 'design/converter-designer',
  'loss-budget': 'design/loss-budget',
  'sense-chain': 'design/sense-chain',
  'source-matcher': 'design/source-matcher',
} as const;

export type ToolId = keyof typeof TOOL_PAGES;

export const TOOL_IDS = Object.keys(TOOL_PAGES) as ToolId[];

/** The presets of each tool, by example (a link may only open a preset the tool offers itself). */
export function toolPresets(tool: ToolId): string[] {
  switch (tool) {
    case 'clamp-check':
      return CLAMP_PRESETS.map((p) => p.example);
    case 'converter-designer':
      return DESIGN_PRESETS.map((p) => p.example);
    case 'loss-budget':
      return LOSS_PRESETS.map((p) => p.example);
    case 'sense-chain':
      return SENSE_PRESETS.map((p) => p.example);
    case 'source-matcher':
      return [...SOURCE_PRESETS];
  }
}

const strings = (values: Record<string, number>): Record<string, string> =>
  Object.fromEntries(Object.entries(values).map(([k, v]) => [k, String(v)]));

/** The URL hash that opens `tool` with the preset of `example`. */
export function toolHash(tool: ToolId, example: string): string {
  const missing = () => new Error(`<TryTool tool="${tool}" example="${example}">: ${example} is not a preset of that tool (${toolPresets(tool).join(', ')})`);
  switch (tool) {
    case 'clamp-check': {
      const p = CLAMP_PRESETS.find((x) => x.example === example);
      if (!p) throw missing();
      return clampHashOf(p.kind, strings(clampValues(example)));
    }
    case 'converter-designer': {
      const p = DESIGN_PRESETS.find((x) => x.example === example);
      if (!p) throw missing();
      return designHashOf(p.topology, strings(designValues(example)));
    }
    case 'loss-budget': {
      const p = LOSS_PRESETS.find((x) => x.example === example);
      if (!p) throw missing();
      return lossHashOf(p.topology, strings(lossValues(example, p.topology)));
    }
    case 'sense-chain': {
      const p = SENSE_PRESETS.find((x) => x.example === example);
      if (!p) throw missing();
      return senseHashOf(p.kind, strings(senseValues(example)));
    }
    case 'source-matcher': {
      if (!SOURCE_PRESETS.includes(example)) throw missing();
      const values = sourceValues(example);
      // as the tool's preset button does: a sinusoidal envelope when the example gives its frequency
      return sourceHashOf(values.fenv !== undefined ? 'sine' : 'none', strings(values));
    }
  }
}
