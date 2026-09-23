/**
 * The converter designer's calculation (docs/BUILD_SPEC.md section 5,
 * ConverterDesigner): from the input-voltage range, the output voltage, the
 * load range and the switching frequency, it finds
 *
 *   - the duty-ratio range (CCM conversion ratio solved for D),
 *   - the inductance (L_M for the flyback) that meets a current-ripple target
 *     at full load, and the one that keeps the lightest load in CCM,
 *   - K against K_crit over the input range, with the chosen inductance,
 *   - the ripples, the peak current and the switch and diode voltages,
 *   - the output capacitance that meets a voltage-ripple target.
 *
 * Every formula is a catalogue equation, evaluated with `evaluate` or solved
 * for one input with `invert`; this module only chooses the operating points
 * (the ends of the input range, and the interior points where a ripple or
 * K_crit peaks) and the worst case among them.
 *
 * The flyback's diode drop V_D adds to the output in volt-second balance, at
 * the same output current: the flyback is an ideal flyback with the output
 * V + V_D and the load R (V + V_D)/V. Its duty ratio and its K (so the CCM
 * boundary against K_crit) are those of that ideal flyback.
 */

import { evaluate } from './equations';
import { invert, InvertError } from './invert';

export type DesignTopology = 'buck' | 'boost' | 'buckboost' | 'flyback' | 'forward';

export interface DesignSpec {
  topology: DesignTopology;
  /** Input voltage range (V). */
  VgMin: number;
  VgMax: number;
  /** Output voltage (V); the magnitude for the inverting buck-boost. */
  V: number;
  /** Full-load output power (W). */
  P: number;
  /** Lightest load that must stay in CCM (W); 0 for no requirement. */
  Pmin: number;
  /** Switching frequency (Hz). */
  fs: number;
  /** Inductor-current ripple target at full load: Delta_i_L / I_L (half peak-to-peak, Erickson). */
  rippleI: number;
  /** Output-voltage ripple target: Delta_v / V (half peak-to-peak, Erickson). */
  rippleV: number;
  /** Turns ratio N_s/N_p (flyback, forward). */
  n?: number;
  /** Reset-winding turns ratio N_r/N_p (forward). */
  nr?: number;
  /** Output-diode drop (flyback). */
  VD?: number;
  /** The inductance to evaluate (L_M for the flyback); by default the larger requirement. */
  L?: number;
}

export type DesignWarning =
  | 'unreachable' // no duty ratio in (0, 1) gives the output at some input voltage
  | 'reset' // forward: the duty ratio exceeds the reset limit
  | 'dcmFull' // DCM at full load somewhere in the range: the CCM duty ratios do not hold
  | 'dcmLight'; // the chosen inductance lets the lightest load enter DCM

export interface DesignPoint {
  Vg: number;
  D: number;
  /** Average inductor current at full load (the magnetizing current, primary-referred, for the flyback). */
  IL: number;
  /** Half peak-to-peak ripple of that current with the chosen inductance. */
  dI: number;
  Ipk: number;
  Kcrit: number;
  /** K at full and at the lightest load (for the flyback, with its load referred to the output V + V_D). */
  Kfull: number;
  Klight: number;
  /** Conduction mode at full load with the chosen inductance. */
  mode: 'CCM' | 'DCM';
  Vds: number;
  /** Diode reverse voltage (undefined for the forward, whose diodes the catalogue does not cover). */
  Vr?: number;
}

export interface DesignResult {
  spec: DesignSpec;
  Ts: number;
  Rfull: number;
  /** Load resistance at the lightest CCM load (Infinity when Pmin is 0). */
  Rlight: number;
  D: { min: number; max: number };
  L: { ripple: number; ccm: number; chosen: number; binding: 'ripple' | 'ccm' | 'given' };
  C: number;
  /** Operating points over the input range (ends included), full load unless stated. */
  points: DesignPoint[];
  worst: { dI: number; Ipk: number; Vds: number; Vr?: number; KcritMax: number };
  /** Reset limit of the forward converter. */
  Dmax?: number;
  /** K_crit(D) over 0 < D < 1 for the chart. */
  curve: { D: number[]; Kcrit: number[] };
  warnings: DesignWarning[];
}

const ratioEq: Record<DesignTopology, string> = {
  buck: 'buck.ccm.M',
  boost: 'boost.ccm.M',
  buckboost: 'buckboost.ccm.M',
  flyback: 'flyback.ccm.M',
  forward: 'forward.ccm.M',
};

const rippleEq: Record<DesignTopology, string> = {
  buck: 'buck.ripple.iL',
  boost: 'boost.ripple.iL',
  buckboost: 'buckboost.ripple.iL',
  flyback: 'flyback.ripple.iM',
  forward: 'forward.ripple.iL',
};

function kcrit(topology: DesignTopology, D: number, n: number): number {
  switch (topology) {
    case 'buck':
    case 'forward': // the output stage is a buck fed with n V_g
      return evaluate('Kcrit.buck', { D });
    case 'boost':
      return evaluate('Kcrit.boost', { D });
    case 'buckboost':
      return evaluate('Kcrit.buckboost', { D });
    case 'flyback':
      return evaluate('Kcrit.flyback', { D, n });
  }
}

/** Duty ratio for the output at the input voltage Vg (CCM), or NaN when no D in (0, 1) gives it. */
function dutyRatio(s: DesignSpec, Vg: number): number {
  const n = s.n ?? 1;
  const inputs: Record<string, number> = s.topology === 'flyback' || s.topology === 'forward' ? { n } : {};
  // the flyback's diode drop adds to the output in volt-second balance: M = (V + V_D)/V_g
  const out = s.topology === 'flyback' ? s.V + (s.VD ?? 0) : s.V;
  const M = s.topology === 'buckboost' ? -out / Vg : out / Vg;
  try {
    return invert(ratioEq[s.topology], 'D', M, inputs, 0, 1 - 1e-12);
  } catch (e) {
    if (e instanceof InvertError) return Number.NaN;
    throw e;
  }
}

/** Average current of the inductor (magnetizing current for the flyback) at the load R. */
function inductorCurrent(s: DesignSpec, D: number, R: number): number {
  switch (s.topology) {
    case 'buck':
    case 'forward':
      return evaluate('buck.IL', { V: s.V, R });
    case 'boost':
      return evaluate('boost.IL', { V: s.V, D, R });
    case 'buckboost':
      return evaluate('buckboost.IL', { V: s.V, D, R });
    case 'flyback':
      return evaluate('flyback.IM', { n: s.n ?? 1, V: s.V, D, R });
  }
}

/** Inputs of the ripple equation except the inductance. */
function rippleInputs(s: DesignSpec, Vg: number, D: number, Ts: number): Record<string, number> {
  switch (s.topology) {
    case 'buck':
      return { V_g: Vg, V: s.V, D, T_s: Ts };
    case 'forward':
      return { V_g: Vg, V: s.V, D, T_s: Ts, n: s.n ?? 1 };
    default:
      return { V_g: Vg, D, T_s: Ts };
  }
}

function inductanceName(s: DesignSpec): 'L' | 'L_M' {
  return s.topology === 'flyback' ? 'L_M' : 'L';
}

function switchVoltage(s: DesignSpec, Vg: number): number {
  switch (s.topology) {
    case 'buck':
      return evaluate('buck.Vds', { V_g: Vg });
    case 'boost':
      return evaluate('boost.Vds', { V: s.V });
    case 'buckboost':
      return evaluate('buckboost.Vds', { V_g: Vg, V: s.V });
    case 'flyback':
      return evaluate('flyback.Vds_off', { V_g: Vg, V: s.V, V_D: s.VD ?? 0, n: s.n ?? 1 });
    case 'forward':
      return evaluate('forward.Vds', { V_g: Vg, n_r: s.nr ?? 1 });
  }
}

function diodeVoltage(s: DesignSpec, Vg: number): number | undefined {
  switch (s.topology) {
    case 'buck': // the diode blocks V_g while the switch is on (buck.Vds)
      return evaluate('buck.Vds', { V_g: Vg });
    case 'boost':
      return evaluate('boost.Vds', { V: s.V });
    case 'buckboost':
      return evaluate('buckboost.Vds', { V_g: Vg, V: s.V });
    case 'flyback':
      return evaluate('flyback.diode.VR', { V: s.V, V_g: Vg, n: s.n ?? 1 });
    case 'forward':
      return undefined;
  }
}

/** Input voltages to examine: a grid over the range plus the interior points where a quantity peaks. */
function inputGrid(s: DesignSpec): number[] {
  const N = 40;
  const grid = Array.from({ length: N + 1 }, (_, k) => s.VgMin + ((s.VgMax - s.VgMin) * k) / N);
  if (s.topology === 'boost') {
    // the boost's current ripple V_g D T_s/(2L) with D = 1 - V_g/V peaks at V_g = V/2,
    // and its K_crit = D (1 - D)^2 at D = 1/3, i.e. V_g = 2V/3
    for (const v of [s.V / 2, (2 * s.V) / 3]) if (v > s.VgMin && v < s.VgMax) grid.push(v);
  }
  return [...new Set(grid)].sort((a, b) => a - b);
}

export function design(s: DesignSpec): DesignResult {
  const Ts = evaluate('def.Ts', { f_s: s.fs });
  const n = s.n ?? 1;
  const Rfull = (s.V * s.V) / s.P;
  const Rlight = s.Pmin > 0 ? (s.V * s.V) / s.Pmin : Number.POSITIVE_INFINITY;
  // the load of the ideal converter whose K is compared with K_crit (see the header)
  const Veq = s.topology === 'flyback' ? s.V + (s.VD ?? 0) : s.V;
  const Keq = (R: number) => (R * Veq) / s.V;
  // K below K_crit: DCM. The relative margin keeps an inductance sized exactly
  // at the boundary (K = K_crit up to rounding) in CCM.
  const dcm = (K: number, Kc: number) => K < Kc * (1 - 1e-9);
  const warnings = new Set<DesignWarning>();
  const Lname = inductanceName(s);

  const grid = inputGrid(s)
    .map((Vg) => ({ Vg, D: dutyRatio(s, Vg) }))
    .filter((p) => {
      if (Number.isFinite(p.D) && p.D > 0 && p.D < 1) return true;
      warnings.add('unreachable');
      return false;
    });
  if (grid.length === 0) throw new InvertError('no input voltage in the range reaches the output');

  // inductance for the ripple target at full load (worst case over the range)
  let Lripple = 0;
  for (const p of grid) {
    const IL = inductorCurrent(s, p.D, Rfull);
    const L = invert(rippleEq[s.topology], Lname, s.rippleI * IL, rippleInputs(s, p.Vg, p.D, Ts), 1e-15, 1e3);
    Lripple = Math.max(Lripple, L);
  }
  // inductance for CCM at the lightest load: K_crit is largest where the boundary is hardest to meet
  const KcritMax = Math.max(...grid.map((p) => kcrit(s.topology, p.D, n)));
  const Lccm = Number.isFinite(Rlight) ? evaluate('L.crit', { K_crit: KcritMax, R: Keq(Rlight), T_s: Ts }) : 0;
  const chosen = s.L ?? Math.max(Lripple, Lccm);
  const binding: DesignResult['L']['binding'] = s.L !== undefined ? 'given' : Lccm > Lripple ? 'ccm' : 'ripple';

  const points: DesignPoint[] = grid.map(({ Vg, D }) => {
    const IL = inductorCurrent(s, D, Rfull);
    const dI = evaluate(rippleEq[s.topology], { ...rippleInputs(s, Vg, D, Ts), [Lname]: chosen });
    const Kc = kcrit(s.topology, D, n);
    const Kfull = evaluate('K.def', { L: chosen, R: Keq(Rfull), T_s: Ts });
    const Klight = Number.isFinite(Rlight) ? evaluate('K.def', { L: chosen, R: Keq(Rlight), T_s: Ts }) : Number.POSITIVE_INFINITY;
    if (dcm(Kfull, Kc)) warnings.add('dcmFull');
    if (dcm(Klight, Kc)) warnings.add('dcmLight');
    return {
      Vg,
      D,
      IL,
      dI,
      Ipk: evaluate('ripple.Ipk', { I_L: IL, Delta_i_L: dI }),
      Kcrit: Kc,
      Kfull,
      Klight,
      mode: dcm(Kfull, Kc) ? 'DCM' : 'CCM',
      Vds: switchVoltage(s, Vg),
      Vr: diodeVoltage(s, Vg),
    };
  });

  const Ds = points.map((p) => p.D);
  const D = { min: Math.min(...Ds), max: Math.max(...Ds) };
  let Dmax: number | undefined;
  if (s.topology === 'forward') {
    Dmax = evaluate('forward.reset.Dmax', { n_r: s.nr ?? 1 });
    if (D.max > Dmax) warnings.add('reset');
  }

  // output capacitance for the voltage-ripple target (worst case over the range)
  const dvTarget = s.rippleV * s.V;
  let C = 0;
  for (const p of points) {
    const c =
      s.topology === 'buck' || s.topology === 'forward'
        ? invert('buck.ripple.v', 'C', dvTarget, { Delta_i_L: p.dI, T_s: Ts }, 1e-18, 1e3)
        : invert(`${s.topology}.ripple.v`, 'C', dvTarget, { V: s.V, D: p.D, R: Rfull, T_s: Ts }, 1e-18, 1e3);
    C = Math.max(C, c);
  }

  const curveD = Array.from({ length: 99 }, (_, k) => (k + 1) / 100);
  const vr = points.map((p) => p.Vr).filter((v): v is number => v !== undefined);
  return {
    spec: s,
    Ts,
    Rfull,
    Rlight,
    D,
    L: { ripple: Lripple, ccm: Lccm, chosen, binding },
    C,
    points,
    worst: {
      dI: Math.max(...points.map((p) => p.dI)),
      Ipk: Math.max(...points.map((p) => p.Ipk)),
      Vds: Math.max(...points.map((p) => p.Vds)),
      Vr: vr.length ? Math.max(...vr) : undefined,
      KcritMax,
    },
    Dmax,
    curve: { D: curveD, Kcrit: curveD.map((d) => kcrit(s.topology, d, n)) },
    warnings: [...warnings],
  };
}
