/**
 * The clamp check (docs/BUILD_SPEC.md section 5, ClampCheck): a flyback's
 * primary clamp, a TVS or an RCD clamp, at a given operating point. Every
 * formula is a catalogue equation:
 *
 *   reflected voltage     flyback.V_OR
 *   leakage energy        flyback.leak.E, flyback.leak.P
 *   leakage reset time    clamp.t_reset (at the lowest clamp voltage, the slowest)
 *   clamp voltage         TVS: tvs.R_D from the datasheet, tvs.V_clamp at the
 *                         peak current; RCD: clamp.rcd.V from the resistor
 *   switch voltage        clamp.Vds, against the switch's rating
 *   clamp dissipation     clamp.P
 *   open-load ceiling     flyback.V_ceiling (TVS only)
 *
 * A TVS clamps between its breakdown voltage (no current) and its clamping
 * voltage at the peak current. The clamp dissipation falls as the clamp
 * voltage rises, so clamp.P at the breakdown voltage is an upper bound and at
 * the peak clamping voltage a lower bound; the switch voltage uses the peak.
 *
 * Without a load the clamp takes all of the input power. A TVS holds its
 * voltage, so the output stops at flyback.V_ceiling. An RCD clamp's voltage is
 * set by the power its resistor dissipates (clamp.rcd.V), so at open load it
 * rises far above its loaded value, and so do the output and the switch
 * voltage: there is no ceiling from the loaded clamp voltage.
 */

import { evaluate } from './equations';

export type ClampKind = 'tvs' | 'rcd';

export interface ClampSpec {
  /** Largest input voltage (V). */
  Vg: number;
  /** Output voltage and output-diode drop (V). */
  V: number;
  VD: number;
  /** Turns ratio N_s/N_p. */
  n: number;
  /** Leakage inductance referred to the primary (H). */
  Llk: number;
  /** Peak primary current at turn-off (A). */
  Ipk: number;
  fs: number;
  /** Voltage rating of the switch (V). */
  Vrating: number;
  clamp: { kind: 'tvs'; VBR: number; VCL: number; IPP: number } | { kind: 'rcd'; R: number };
}

export type ClampWarning =
  | 'belowReflected' // the clamp would conduct the reflected voltage itself: it takes the output's energy
  | 'overRating' // the switch voltage exceeds the switch's rating
  | 'rcdOpenLoad' // an RCD clamp does not bound the output without a load
  | 'slowReset'; // the leakage current would take longer than a switching period to fall to zero

export interface ClampResult {
  spec: ClampSpec;
  VOR: number;
  Elk: number;
  Plk: number;
  /** TVS dynamic resistance (TVS only). */
  RD?: number;
  /** Time the leakage current takes to fall to zero, at the lowest clamp voltage (s); infinite at or below V_OR. */
  tReset: number;
  /** Clamp voltage while conducting: from no current (TVS: V_BR) to the peak current. Equal for an RCD clamp. */
  Vclamp: { low: number; high: number };
  /** Clamp dissipation: at the highest clamp voltage (a lower bound for a TVS) and at the lowest (an upper bound). */
  P: { low: number; high: number };
  /** Switch voltage while the clamp conducts, at the highest clamp voltage. */
  Vds: number;
  /** Rating minus the switch voltage (V). */
  margin: number;
  /** Output voltage an unloaded flyback runs up to, at the lowest and the highest clamp voltage (TVS only). */
  ceiling?: { low: number; high: number };
  warnings: ClampWarning[];
}

export function clampCheck(s: ClampSpec): ClampResult {
  const VOR = evaluate('flyback.V_OR', { V: s.V, V_D: s.VD, n: s.n });
  const Elk = evaluate('flyback.leak.E', { L_lk: s.Llk, I_pk: s.Ipk });
  const Plk = evaluate('flyback.leak.P', { E_lk: Elk, f_s: s.fs });
  let RD: number | undefined;
  let Vclamp: ClampResult['Vclamp'];
  if (s.clamp.kind === 'tvs') {
    if (!(s.clamp.VCL > s.clamp.VBR)) throw new Error('clampCheck: the clamping voltage V_CL must lie above the breakdown voltage V_BR');
    RD = evaluate('tvs.R_D', { V_CL: s.clamp.VCL, V_BR: s.clamp.VBR, I_PP: s.clamp.IPP });
    Vclamp = { low: s.clamp.VBR, high: evaluate('tvs.V_clamp', { V_BR: s.clamp.VBR, R_D: RD, I_pk: s.Ipk }) };
  } else {
    const v = evaluate('clamp.rcd.V', { V_OR: VOR, R_clamp: s.clamp.R, L_lk: s.Llk, I_pk: s.Ipk, f_s: s.fs });
    Vclamp = { low: v, high: v };
  }
  const warnings: ClampWarning[] = [];
  const power = (V: number) =>
    V > VOR ? evaluate('clamp.P', { L_lk: s.Llk, I_pk: s.Ipk, f_s: s.fs, V_clamp: V, V_OR: VOR }) : Number.POSITIVE_INFINITY;
  // An RCD clamp's voltage lies above V_OR for any resistor (only rounding can put it there); a TVS's
  // breakdown voltage may not. Close above V_OR the reset takes longer than the off-time can hold, and
  // the clamp takes energy meant for the output: the model no longer holds.
  if (!(Vclamp.low > VOR) && s.clamp.kind === 'tvs') warnings.push('belowReflected');
  const tReset =
    Vclamp.low > VOR ? evaluate('clamp.t_reset', { L_lk: s.Llk, I_pk: s.Ipk, V_clamp: Vclamp.low, V_OR: VOR }) : Number.POSITIVE_INFINITY;
  if (tReset >= 1 / s.fs && !warnings.includes('belowReflected')) warnings.push('slowReset');
  const Vds = evaluate('clamp.Vds', { V_g: s.Vg, V_clamp: Vclamp.high });
  if (Vds > s.Vrating) warnings.push('overRating');
  if (s.clamp.kind === 'rcd') warnings.push('rcdOpenLoad');
  const ceiling = (V: number) => evaluate('flyback.V_ceiling', { n: s.n, V_clamp: V, V_D: s.VD });
  return {
    spec: s,
    VOR,
    Elk,
    Plk,
    RD,
    tReset,
    Vclamp,
    P: { low: power(Vclamp.high), high: power(Vclamp.low) },
    Vds,
    margin: s.Vrating - Vds,
    ceiling: s.clamp.kind === 'tvs' ? { low: ceiling(Vclamp.low), high: ceiling(Vclamp.high) } : undefined,
    warnings,
  };
}
