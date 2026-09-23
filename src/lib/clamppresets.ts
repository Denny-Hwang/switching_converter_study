/**
 * Clamp-check presets, built from the synthetic examples
 * (examples/synthetic/clamp-*.yaml) so that the tool never shows a
 * hand-typed number.
 */
import type { ClampKind } from 'pe-core';
import { getExample } from './examples';

/** Example parameter -> clamp-check field. */
const FIELD: Record<string, string> = {
  V_g: 'Vg',
  V: 'V',
  V_D: 'VD',
  n: 'n',
  L_lk: 'Llk',
  I_pk: 'Ipk',
  f_s: 'fs',
  V_rating: 'Vrating',
  V_BR: 'VBR',
  V_CL: 'VCL',
  I_PP: 'IPP',
  R_clamp: 'R',
};

export interface ClampPresetSpec {
  example: string;
  kind: ClampKind;
}

export const CLAMP_PRESETS: ClampPresetSpec[] = [
  { example: 'clamp-tvs', kind: 'tvs' },
  { example: 'clamp-rcd', kind: 'rcd' },
];

/** Clamp-check field values from a synthetic example. */
export function clampValues(example: string): Record<string, number> {
  const values: Record<string, number> = {};
  for (const [k, v] of Object.entries(getExample(example).params)) {
    const f = FIELD[k];
    if (!f) throw new Error(`examples/synthetic/${example}.yaml: ${k} is not a clamp-check parameter`);
    values[f] = v;
  }
  return values;
}
