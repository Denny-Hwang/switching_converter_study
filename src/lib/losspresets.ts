/**
 * Loss-budget presets, built from the synthetic loss examples
 * (examples/synthetic/loss-*.yaml) so that the tool never shows a hand-typed
 * number.
 */
import type { sim } from 'pe-core';
import { getExample } from './examples';

type Topology = sim.Topology;

/** Example parameter -> loss-budget field (L_M is the flyback's L, the forward's LM). */
const FIELD: Record<string, string> = {
  V_g: 'Vg',
  V: 'V',
  P: 'P',
  f_s: 'fs',
  L: 'L',
  C: 'C',
  n: 'n',
  n_r: 'nr',
  R_on: 'Ron',
  Q_g: 'Qg',
  V_GS: 'Vgs',
  C_node: 'Cnode',
  V_F: 'VF',
  r_d: 'rd',
  R_L: 'RL',
  N: 'N',
  A_e: 'Ae',
  V_e: 'Ve',
  k: 'k',
  alpha: 'alpha',
  beta: 'beta',
  L_lk: 'Llk',
};

export interface LossPresetSpec {
  example: string;
  topology: Topology;
}

export const LOSS_PRESETS: LossPresetSpec[] = [
  { example: 'loss-buck', topology: 'buck' },
  { example: 'loss-boost', topology: 'boost' },
  { example: 'loss-flyback', topology: 'flyback' },
];

/** Loss-budget field values from a synthetic loss example. */
export function lossValues(example: string, topology: Topology): Record<string, number> {
  const values: Record<string, number> = {};
  for (const [k, v] of Object.entries(getExample(example).params)) {
    if (k === 'L_M') values[topology === 'forward' ? 'LM' : 'L'] = v;
    else if (FIELD[k]) values[FIELD[k]!] = v;
    else throw new Error(`examples/synthetic/${example}.yaml: ${k} is not a loss-budget parameter`);
  }
  return values;
}
