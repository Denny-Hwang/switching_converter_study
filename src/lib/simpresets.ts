/**
 * Simulator presets and "Try it" links, built from the synthetic examples
 * (examples/synthetic/*.yaml) so that the simulator never shows a
 * hand-typed number: example symbols map to simulator parameters.
 */
import type { sim } from 'pe-core';
import { getExample } from './examples';

type Topology = sim.Topology;

/** Example symbol -> simulator field (L_M is the flyback's L, the forward's LM). */
const FIELD: Record<string, string> = {
  V_g: 'Vg',
  D: 'D',
  f_s: 'fs',
  L: 'L',
  C: 'C',
  R: 'R',
  n: 'n',
  n_r: 'nr',
  V_D: 'VF',
  R_L: 'RL',
  V: 'V',
  V_oc: 'Voc',
  R_s: 'Rs',
  C_bus: 'Cbus',
};

export interface PresetSpec {
  id: string;
  example: string;
  topology: Topology;
  en: string;
  ko: string;
}

export const PRESETS: PresetSpec[] = [
  { id: 'buck', example: 'buck-basic', topology: 'buck', en: 'Buck, CCM', ko: '벅, CCM' },
  { id: 'buck-light', example: 'buck-light-load', topology: 'buck', en: 'Buck, light load (DCM)', ko: '벅, 경부하(DCM)' },
  { id: 'boost', example: 'boost-ideal', topology: 'boost', en: 'Boost', ko: '부스트' },
  { id: 'boost-rl', example: 'boost-basic', topology: 'boost', en: 'Boost with winding resistance', ko: '권선 저항이 있는 부스트' },
  { id: 'buckboost', example: 'buckboost-basic', topology: 'buckboost', en: 'Buck-boost', ko: '벅-부스트' },
  { id: 'flyback-ccm', example: 'flyback-ccm', topology: 'flyback', en: 'Flyback, CCM', ko: '플라이백, CCM' },
  { id: 'flyback-dcm', example: 'flyback-dcm', topology: 'flyback', en: 'Flyback, DCM', ko: '플라이백, DCM' },
  {
    id: 'flyback-source',
    example: 'flyback-source',
    topology: 'flyback',
    en: 'Flyback from a current-limited source into a fixed output',
    ko: '전류 제한 전원에서 고정 출력으로 동작하는 플라이백',
  },
  { id: 'forward', example: 'forward-basic', topology: 'forward', en: 'Forward', ko: '포워드' },
];

/** Simulator field values from a synthetic example. */
export function presetValues(example: string, topology: Topology): Record<string, number> {
  const ex = getExample(example);
  const values: Record<string, number> = {};
  for (const [k, v] of Object.entries(ex.params)) {
    if (k === 'L_M') values[topology === 'forward' ? 'LM' : 'L'] = v;
    else if (FIELD[k]) values[FIELD[k]!] = v;
  }
  return values;
}

/** URL hash that opens the simulator with an example's values. */
export function simulatorHash(example: string, topology: Topology): string {
  const values = presetValues(example, topology);
  const q = new URLSearchParams({
    topo: topology,
    load: values.V !== undefined && values.R === undefined ? 'fixed' : 'res',
    src: values.Voc !== undefined ? '1' : '0',
  });
  for (const [k, v] of Object.entries(values)) q.set(k, String(v));
  return q.toString();
}
