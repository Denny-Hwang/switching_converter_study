/**
 * Sense-chain presets, built from the synthetic examples
 * (examples/synthetic/sense-*.yaml) so that the tool never shows a
 * hand-typed number.
 */
import type { MonitorKind } from 'pe-core';
import { getExample } from './examples';

/** Example parameter -> sense-chain field (I_SENSE is the largest current). */
const FIELD: Record<string, string> = {
  I_SENSE: 'Imax',
  I_min: 'Imin',
  R_SENSE: 'Rsense',
  R_pad: 'Rpad',
  R_IN: 'Rin',
  R_OUT: 'Rout',
  G_sense: 'G',
  V_REF: 'Vref',
  V_OS: 'Vos',
  V_OUTmin: 'VoutMin',
  V_OUTmax: 'VoutMax',
  V_FS: 'Vfs',
  f_samp: 'fsamp',
  R_f: 'Rf',
  C_f: 'Cf',
  eps_max: 'errMax',
};

export interface SensePresetSpec {
  example: string;
  kind: MonitorKind;
}

export const SENSE_PRESETS: SensePresetSpec[] = [
  { example: 'sense-current', kind: 'current' },
  { example: 'sense-voltage', kind: 'voltage' },
];

/** Sense-chain field values from a synthetic example. */
export function senseValues(example: string): Record<string, number> {
  const values: Record<string, number> = {};
  for (const [k, v] of Object.entries(getExample(example).params)) {
    const f = FIELD[k];
    if (!f) throw new Error(`examples/synthetic/${example}.yaml: ${k} is not a sense-chain parameter`);
    values[f] = v;
  }
  return values;
}
