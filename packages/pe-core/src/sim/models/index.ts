/**
 * Piecewise-linear models of the basic converters (docs/BUILD_SPEC.md
 * section 2: sim/models/, per-topology interval definitions): the buck,
 * boost, buck-boost and flyback share one two-switch structure
 * (two-switch.ts); the forward converter with its reset winding is
 * forward.ts; common.ts holds the parameters, the linear-expression helpers
 * and the header describing the states and the idealisations.
 */

import type { Model } from '../engine';
import type { SimParams } from './common';
import { forward } from './forward';
import { twoSwitch } from './two-switch';

export type { Load, SimParams, Source, Topology } from './common';

export function buildModel(p: SimParams): Model {
  return p.topology === 'forward' ? forward(p) : twoSwitch(p);
}
