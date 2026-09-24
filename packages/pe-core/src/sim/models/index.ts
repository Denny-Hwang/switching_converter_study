/**
 * Piecewise-linear models of the basic converters (docs/BUILD_SPEC.md
 * section 2: sim/models/, per-topology interval definitions): the buck,
 * boost, buck-boost and flyback share one two-switch structure
 * (two-switch.ts); the forward converter with its reset winding is
 * forward.ts; common.ts holds the parameters, the linear-expression helpers
 * and the header describing the states and the idealisations.
 */

import { OVERFLOW, type Model } from '../engine';
import type { SimParams } from './common';
import { forward } from './forward';
import { twoSwitch } from './two-switch';

export type { Battery, Load, SimParams, Source, Topology } from './common';
export { givenVoltage } from './common';

export function buildModel(p: SimParams): Model {
  const m = p.topology === 'forward' ? forward(p) : twoSwitch(p);
  // a value so small or so large that the circuit's equations overflow (1/L for an inductance of 1e-320 H) would
  // otherwise reach the solver as infinities and come out as NaN
  const finite = (v: number) => Number.isFinite(v);
  const ok = Number.isFinite(m.Ts) && Object.values(m.intervals).every((iv) => iv.A.every((row) => row.every(finite)) && iv.b.every(finite));
  if (!ok) throw new Error(OVERFLOW);
  return m;
}
