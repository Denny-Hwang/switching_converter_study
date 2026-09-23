/**
 * Converter-designer presets, built from the synthetic design specifications
 * (examples/synthetic/design-*.yaml) so that the designer never shows a
 * hand-typed number.
 */
import type { DesignTopology } from 'pe-core';
import { getExample } from './examples';

/** Example parameter -> designer field. */
const FIELD: Record<string, string> = {
  V_gmin: 'VgMin',
  V_gmax: 'VgMax',
  V: 'V',
  P: 'P',
  P_min: 'Pmin',
  f_s: 'fs',
  r_i: 'rI',
  r_v: 'rV',
  n: 'n',
  n_r: 'nr',
  V_D: 'VD',
  L_M: 'LM',
};

export interface DesignPresetSpec {
  example: string;
  topology: DesignTopology;
}

export const DESIGN_PRESETS: DesignPresetSpec[] = [
  { example: 'design-buck', topology: 'buck' },
  { example: 'design-boost', topology: 'boost' },
  { example: 'design-buckboost', topology: 'buckboost' },
  { example: 'design-flyback', topology: 'flyback' },
  { example: 'design-forward', topology: 'forward' },
];

/** Designer field values from a synthetic design specification. */
export function designValues(example: string): Record<string, number> {
  const values: Record<string, number> = {};
  for (const [k, v] of Object.entries(getExample(example).params)) {
    const f = FIELD[k];
    if (!f) throw new Error(`examples/synthetic/${example}.yaml: ${k} is not a designer parameter`);
    values[f] = v;
  }
  return values;
}
