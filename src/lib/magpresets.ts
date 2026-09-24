/**
 * Magnetics-designer presets, built from the synthetic examples
 * (examples/synthetic/mag-*.yaml) so that the designer never shows a
 * hand-typed number. The core and the device come from here; the core's own
 * values from the core table (src/lib/cores.ts).
 */
import type { Arrangement, MagDevice } from 'pe-core';
import type { CoreId } from './cores';
import { getExample } from './examples';

/** Example parameter -> magnetics-designer field (the secondary's ends in `s`). */
const FIELD: Record<string, string> = {
  L: 'L',
  L_M: 'L',
  I_pk: 'Ipk',
  I_rms: 'Irms',
  Delta_i_L: 'dI',
  Delta_i_M: 'dI',
  f_s: 'fs',
  B_max: 'Bmax',
  n: 'n',
  I_rms_s: 'IrmsS',
  T_w: 'Tw',
  b_w: 'bw',
  K_umax: 'KuMax',
  h_g: 'hg',
  N: 'N',
  d_w: 'dP',
  d_o: 'oP',
  k_s: 'ksP',
  M_l: 'mP',
  d_ws: 'dS',
  d_os: 'oS',
  k_ss: 'ksS',
  M_ls: 'mS',
};

export interface MagPresetSpec {
  example: string;
  device: MagDevice;
  core: CoreId;
  arrangement?: Arrangement;
}

export const MAG_PRESETS: MagPresetSpec[] = [
  { example: 'mag-inductor', device: 'inductor', core: 'e25' },
  { example: 'mag-flyback', device: 'flyback', core: 'etd29', arrangement: 'ps' },
  { example: 'mag-kg', device: 'inductor', core: 'etd29' },
];

/** Magnetics-designer field values from a synthetic example. */
export function magValues(example: string): Record<string, number> {
  const values: Record<string, number> = {};
  for (const [k, v] of Object.entries(getExample(example).params)) {
    const f = FIELD[k];
    if (!f) throw new Error(`examples/synthetic/${example}.yaml: ${k} is not a magnetics-designer parameter`);
    values[f] = v;
  }
  return values;
}

/**
 * The magnetics designer's URL hash for a preset: its device, core (and the
 * flyback's arrangement) and every field its example sets, so that a page
 * can link straight to that design (<TryMag />).
 */
export function magHash(example: string): string {
  const p = MAG_PRESETS.find((x) => x.example === example);
  if (!p) throw new Error(`no magnetics preset "${example}"`);
  const q = new URLSearchParams({ dev: p.device, core: p.core });
  if (p.device === 'flyback') q.set('arr', p.arrangement ?? 'ps');
  for (const [k, v] of Object.entries(magValues(example))) q.set(k, String(v));
  return q.toString();
}
