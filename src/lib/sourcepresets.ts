/**
 * Source-matcher presets, built from the synthetic examples
 * (examples/synthetic/source-*.yaml) so that the tool never shows a
 * hand-typed number.
 */
import { getExample } from './examples';

/** Example parameter -> source-matcher field. */
const FIELD: Record<string, string> = {
  V_oc: 'Voc',
  R_s: 'Rs',
  L_M: 'LM',
  f_s: 'fs',
  D: 'D',
  V: 'V',
  V_D: 'VD',
  n: 'n',
  V_rating: 'Vrating',
  C_bus: 'Cbus',
  f_env: 'fenv',
};

export const SOURCE_PRESETS: string[] = ['source-lfr', 'source-envelope'];

/** Source-matcher field values from a synthetic example. */
export function sourceValues(example: string): Record<string, number> {
  const values: Record<string, number> = {};
  for (const [k, v] of Object.entries(getExample(example).params)) {
    const f = FIELD[k];
    if (!f) throw new Error(`examples/synthetic/${example}.yaml: ${k} is not a source-matcher parameter`);
    values[f] = v;
  }
  return values;
}
