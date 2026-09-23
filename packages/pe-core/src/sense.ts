/**
 * The sense chain (docs/BUILD_SPEC.md section 5, SenseChain): a shunt, a
 * current-output or voltage-output sense amplifier, an R-C filter and an ADC,
 * checked from zero to the largest current. Every formula is a catalogue
 * equation:
 *
 *   sense voltage (burden)      sense.burden, and the shunt's dissipation loss.cond
 *   amplifier output            sense.current_out_monitor or sense.voltage_out_monitor
 *   full-scale current, floor   the output equation solved for the current (invert)
 *   offset-equivalent current   sense.offset_current
 *   pad error                   sense.pad_error
 *   error of the reading        sense.rel_error (offset and pad together)
 *   filter against sampling     sense.filter_R (current output), rc.fc, adc.nyquist,
 *                               rc.gain at the Nyquist frequency
 *
 * The chain measures currents from zero up; a voltage-output amplifier's REF
 * voltage sets its output at zero current.
 */

import { evaluate, type Inputs } from './equations';
import { invert, InvertError } from './invert';

export type MonitorKind = 'current' | 'voltage';

export interface SenseSpec {
  /** Largest current to measure and smallest current to resolve (A). */
  Imax: number;
  Imin: number;
  /** Shunt (ohm), and the pad and solder resistance in its sense path (ohm; 0 with a Kelvin connection). */
  Rsense: number;
  Rpad: number;
  /** Shunt's power rating (W) and the largest voltage the measured circuit can give up (V); optional. */
  Prating?: number;
  VburdenMax?: number;
  monitor: { kind: 'current'; Rin: number; Rout: number } | { kind: 'voltage'; G: number; Vref: number };
  /** Amplifier: input offset voltage (V, its magnitude), and the lowest and largest output voltages it reaches at its supply (V, from its data sheet). */
  Vos: number;
  VoutMin: number;
  VoutMax: number;
  /** ADC: full-scale input (V) and sampling rate (Hz). */
  Vfs: number;
  fsamp: number;
  /** R-C filter between the amplifier and the ADC (ohm, F); a zero capacitance means no filter. */
  Rf: number;
  Cf: number;
  /** Largest acceptable relative error at the smallest current (for example 0.01). */
  errMax: number;
}

export type SenseWarning =
  | 'ampClips' // the amplifier's output would exceed its largest output voltage below the largest current
  | 'adcClips' // the output would exceed the ADC's full scale below the largest current
  | 'floor' // the output at the smallest current lies below the lowest output the amplifier reaches
  | 'burden' // the shunt takes more voltage than the measured circuit can give up
  | 'shuntPower' // the shunt dissipates more than its rating
  | 'offset' // the offset-equivalent current is a larger share of the smallest current than the error target
  | 'pad' // the pad error exceeds the error target
  | 'combined' // neither alone, but the offset and the pad error together exceed the error target
  | 'aliasing'; // the filter's corner lies at or above the Nyquist frequency (or there is no filter)

export interface SenseResult {
  spec: SenseSpec;
  /** Change of the output voltage per ampere (V/A). */
  gain: number;
  /** Output voltage at zero current and at the largest current (V). */
  Vout0: number;
  VoutImax: number;
  /** The output at the largest current as a share of the ADC's full scale. */
  adcUse: number;
  /** Sense voltage and shunt dissipation at the largest current. */
  Vsense: number;
  Pshunt: number;
  /** Current at which the output reaches the lower of the amplifier's limit and the ADC's full scale (A), and which limit that is. */
  Ifs: number;
  limit: 'amp' | 'adc';
  /** Current below which the output stays at the amplifier's lowest output (A; 0 when the output starts above it). */
  Ifloor: number;
  /** Offset-equivalent current (A), and the relative error it causes at the smallest current. */
  Ios: number;
  offsetShare: number;
  /** Relative gain error from the pad and solder resistance. */
  padError: number;
  /** Relative error of the reading at the smallest current, offset and pad together. */
  errorAtImin: number;
  /** Resistance the filter capacitor sees (ohm), filter corner and Nyquist frequency (Hz), and the filter's gain at the Nyquist frequency. */
  Rfilt: number;
  fc: number;
  fN: number;
  gainAtNyquist: number;
  warnings: SenseWarning[];
}

/** The amplifier's output at the current I (a catalogue equation per amplifier kind). */
export function monitorOutput(s: SenseSpec, I: number): number {
  const m = s.monitor;
  return m.kind === 'current'
    ? evaluate('sense.current_out_monitor', { I_SENSE: I, R_SENSE: s.Rsense, R_OUT: m.Rout, R_IN: m.Rin })
    : evaluate('sense.voltage_out_monitor', { G_sense: m.G, I_SENSE: I, R_SENSE: s.Rsense, V_REF: m.Vref });
}

/** Relative error of the reading at the current I from the offset and a pad resistance Rpad (sense.rel_error). */
function relError(s: SenseSpec, I: number, Rpad: number): number {
  return evaluate('sense.rel_error', { V_OS: s.Vos, I_SENSE: I, R_SENSE: s.Rsense, R_pad: Rpad });
}

/** The current at which the output reaches the voltage V (the output equation solved for the current); 0 if the output starts at or above V. */
export function currentAt(s: SenseSpec, V: number): number {
  const m = s.monitor;
  const [id, inputs]: [string, Inputs] =
    m.kind === 'current'
      ? ['sense.current_out_monitor', { R_SENSE: s.Rsense, R_OUT: m.Rout, R_IN: m.Rin }]
      : ['sense.voltage_out_monitor', { G_sense: m.G, R_SENSE: s.Rsense, V_REF: m.Vref }];
  if (!(V > monitorOutput(s, 0))) return 0;
  // the output rises with the current: bracket around the largest current, widening as needed
  let hi = Math.max(s.Imax, 1e-12);
  for (let k = 0; k < 60 && monitorOutput(s, hi) < V; k++) hi *= 4;
  try {
    return invert(id, 'I_SENSE', V, inputs, hi * 1e-15, hi);
  } catch (e) {
    if (e instanceof InvertError) return 0;
    throw e;
  }
}

export function senseChain(s: SenseSpec): SenseResult {
  const Vout0 = monitorOutput(s, 0);
  const VoutImax = monitorOutput(s, s.Imax);
  const gain = (VoutImax - Vout0) / s.Imax;
  const Vsense = evaluate('sense.burden', { I_SENSE: s.Imax, R_SENSE: s.Rsense });
  const Pshunt = evaluate('loss.cond', { I_rms: s.Imax, R_x: s.Rsense });
  const limit = s.VoutMax <= s.Vfs ? 'amp' : 'adc';
  const Ifs = currentAt(s, Math.min(s.VoutMax, s.Vfs));
  const Ifloor = currentAt(s, s.VoutMin);
  const Ios = evaluate('sense.offset_current', { V_OS: s.Vos, R_SENSE: s.Rsense });
  const padError = evaluate('sense.pad_error', { R_pad: s.Rpad, R_SENSE: s.Rsense });
  // a current-output amplifier is a current source loaded by R_OUT: the capacitor sees R_OUT as well
  const Rfilt = s.monitor.kind === 'current' ? evaluate('sense.filter_R', { R_OUT: s.monitor.Rout, R_f: s.Rf }) : s.Rf;
  const filtered = Rfilt > 0 && s.Cf > 0;
  const fc = filtered ? evaluate('rc.fc', { R_f: Rfilt, C_f: s.Cf }) : Number.POSITIVE_INFINITY;
  const fN = evaluate('adc.nyquist', { f_samp: s.fsamp });
  const gainAtNyquist = filtered ? evaluate('rc.gain', { f: fN, f_c: fc }) : 1;

  const warnings: SenseWarning[] = [];
  if (VoutImax > s.VoutMax) warnings.push('ampClips');
  if (VoutImax > s.Vfs) warnings.push('adcClips');
  if (s.Imin < Ifloor) warnings.push('floor');
  if (s.VburdenMax !== undefined && Vsense > s.VburdenMax) warnings.push('burden');
  if (s.Prating !== undefined && Pshunt > s.Prating) warnings.push('shuntPower');
  const offsetShare = relError(s, s.Imin, 0);
  const errorAtImin = relError(s, s.Imin, s.Rpad);
  if (offsetShare > s.errMax) warnings.push('offset');
  if (padError > s.errMax) warnings.push('pad');
  if (offsetShare <= s.errMax && padError <= s.errMax && errorAtImin > s.errMax) warnings.push('combined');
  if (!(fc < fN)) warnings.push('aliasing');
  return {
    spec: s,
    gain,
    Vout0,
    VoutImax,
    adcUse: VoutImax / s.Vfs,
    Vsense,
    Pshunt,
    Ifs,
    limit,
    Ifloor,
    Ios,
    offsetShare,
    padError,
    errorAtImin,
    Rfilt,
    fc,
    fN,
    gainAtNyquist,
    warnings,
  };
}

/**
 * The relative error of the reading against the current (sense.rel_error):
 * the offset's part alone, and the offset and the pad resistance together,
 * over a logarithmic range from a tenth of the smallest current to the largest.
 */
export function errorCurve(r: SenseResult, n = 81): { I: number[]; offset: number[]; total: number[] } {
  const s = r.spec;
  const lo = Math.min(s.Imin, s.Imax) / 10;
  const hi = s.Imax;
  const I = Array.from({ length: n }, (_, k) => (k === n - 1 ? hi : lo * (hi / lo) ** (k / (n - 1))));
  return { I, offset: I.map((i) => relError(s, i, 0)), total: I.map((i) => relError(s, i, s.Rpad)) };
}

/** The output voltage against the current, from zero to beyond the largest current and the full-scale current. */
export function transferCurve(r: SenseResult, n = 101): { I: number[]; Vout: number[] } {
  const top = 1.2 * Math.max(r.spec.Imax, r.Ifs);
  const I = Array.from({ length: n }, (_, k) => (top * k) / (n - 1));
  return { I, Vout: I.map((i) => monitorOutput(r.spec, i)) };
}
