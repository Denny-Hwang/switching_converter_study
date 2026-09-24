/**
 * The core table's cores against a core geometrical constant an example
 * needs (<CoreKg />, the inductor design procedure): each core's K_g from
 * its data-sheet values (mag.Kg_core) and whether it reaches the need
 * (mag.Kg_req, computed by the example).
 */
import { evaluate } from 'pe-core';
import { CORES, type CoreEntry } from './cores';

export interface CoreKgRow {
  entry: CoreEntry;
  Kg: number;
  /** The core's K_g over the one needed: at least 1 means it can meet the specification. */
  margin: number;
}

export function coreKg(needed: number): CoreKgRow[] {
  if (!(needed > 0)) throw new Error('coreKg: the needed K_g must be positive');
  return CORES.map((entry) => {
    const k = entry.core;
    const Kg = evaluate('mag.Kg_core', { A_e: k.Ae, W_A: k.WA, MLT: k.MLT });
    return { entry, Kg, margin: Kg / needed };
  });
}
