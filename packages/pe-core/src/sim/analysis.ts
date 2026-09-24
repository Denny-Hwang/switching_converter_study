/**
 * Steady-state analysis of a simulated cycle: averages, peak-to-peak ripple,
 * detected conduction mode, K against K_crit, stresses, losses and the energy
 * per cycle; plus `simulate()`, which builds the model, starts from the
 * analytic operating point and finds the periodic steady state.
 *
 * Not every circuit has one. A fixed output fed in CCM above the duty ratio
 * that balances the inductor's volt-seconds gains the same inductor current
 * every cycle (below it, the converter settles in DCM); a boost, buck-boost
 * or flyback without a node capacitance charges a capacitor alone for ever.
 * `simulate()` then says which state keeps changing and by how much per
 * cycle, and records the start-up from rest instead.
 */

import { evaluate } from '../equations';
import { invert } from '../invert';
import { runCycle, steadyState, type CycleRun, type Model, type SteadyOptions, type SteadyResult } from './engine';
import { eigenvalues, type Vec } from './linalg';
import { checkRange, periodIntegrals } from './integrals';
import { buildModel, givenVoltage, type SimParams } from './models';

export type Mode = 'CCM' | 'DCM' | 'BCM';

/**
 * steady: a periodic steady state was found. runaway: the inductor current
 * changes by the same amount every cycle (the volt-seconds cannot balance),
 * so there is none. charging: the output capacitor, with nothing across it,
 * keeps charging, and nothing limits its voltage. unsettled: no steady state
 * found within the cycle limit (a capacitor alone still settling, an
 * undamped L-C ringing).
 */
export type Status = 'steady' | 'runaway' | 'charging' | 'unsettled';

/** A state that keeps changing: its change per cycle at the end of the run. */
export interface Drift {
  state: string;
  perCycle: number;
  /** Inductor current: its average voltage over a cycle, L Δi / T_s (zero in a steady state). */
  vLavg?: number;
  /** Fixed output: the duty ratio that balances the volt-seconds in CCM with ideal parts, from the catalogue's M(D). */
  Dbalance?: number;
  /** Forward converter: the largest duty ratio that still resets its core (forward.reset.Dmax). */
  Dmax?: number;
}

/** The first cycles from rest (zero currents, the output at its start voltage), recorded. */
export interface StartUp {
  waveforms: Waveforms;
  cycles: number;
  /** State at the start of the last recorded cycle, and at its end. */
  lastStart: Vec;
  end: Vec;
  /** Sub-steps per recorded cycle. */
  steps: number;
}

export interface Waveforms {
  t: number[];
  interval: string[];
  [series: string]: number[] | string[];
}

export interface SimResult {
  params: SimParams;
  stateNames: string[];
  status: Status;
  /** Why there is no steady state (runaway, charging). */
  drift?: Drift;
  /** The start-up from rest, when there is no steady state to show. */
  startUp?: StartUp;
  converged: boolean;
  cycles: number;
  residual: number;
  /** State at the start of the steady-state cycle. */
  x0: Vec;
  mode: Mode;
  /** Fraction of the period in which the main inductor current is zero. */
  idleFraction: number;
  /** K and its critical value (resistive load only; NaN otherwise). */
  K: number;
  Kcrit: number;
  waveforms: Waveforms;
  avg: Record<string, number>;
  min: Record<string, number>;
  max: Record<string, number>;
  pp: Record<string, number>;
  /** Average output voltage divided by the average input voltage. */
  M: number;
  /** Mean squares over the period (A²): the switch, inductor, diode and battery currents (their rms values squared). */
  meanSquare: Record<string, number>;
  /** Losses (W). */
  losses: { conduction: number; diode: number; capacitive: number; total: number };
  /** Energy per cycle (J). */
  energy: { input: number; output: number };
  /**
   * Outside the model, in the waveforms the page draws (the steady period,
   * or the whole start-up without a steady state): the switch voltage's
   * minimum when it falls below zero, where the switch's body diode (ideal
   * in the models) would conduct; and each diode the model holds off whose
   * voltage exceeds its drop, where a diode with that drop would conduct
   * (DiodeFlag). The models leave that conduction out, so the results may
   * not hold then. A source too weak for the load can bring either about:
   * its bus sagging below zero puts the switch voltage below zero where the
   * switch node follows the bus (DCM's idle interval, without a node
   * capacitance), and can forward-bias a diode; a bus below zero elsewhere
   * turns on no diode by itself.
   */
  switchBelowZero?: number;
  diodes?: DiodeFlag[];
  /** In a start-up, the first cycle (from 1) in which the switch voltage falls below zero. */
  switchFrom?: number;
}

/**
 * A diode the model holds off, forward-biased beyond its drop: D (the
 * two-switch converters' diode), or the forward converter's rectifier D1,
 * freewheeling diode D2 and reset diode D3; its largest voltage (anode to
 * cathode), its drop, and in a start-up the first cycle (from 1) in which it
 * exceeds the drop.
 */
export interface DiodeFlag {
  diode: 'D' | 'D1' | 'D2' | 'D3';
  v: number;
  drop: number;
  from?: number;
}

const SERIES = ['i_L', 'v_L', 'v_sw', 'i_sw', 'i_D', 'i_out', 'i_in', 'v_in', 'v_out', 'i_R', 'i_bat', 'i_C'] as const;

/** Waveforms of a recorded cycle. */
export function waveforms(model: Model, run: CycleRun): Waveforms {
  const out: Waveforms = { t: [], interval: [] };
  const names = new Set<string>();
  const ys = run.samples.map((s) => model.outputs(s.x, s.interval));
  for (const y of ys) for (const k of Object.keys(y)) names.add(k);
  for (const k of names) out[k] = [];
  run.samples.forEach((s, m) => {
    (out.t as number[]).push(s.t);
    (out.interval as string[]).push(s.interval);
    const y = ys[m]!;
    for (const k of names) (out[k] as number[]).push(y[k] ?? NaN);
  });
  return out;
}

function kCrit(p: SimParams): number {
  const D = p.D;
  switch (p.topology) {
    case 'buck':
    case 'forward':
      return evaluate('Kcrit.buck', { D });
    case 'boost':
      return evaluate('Kcrit.boost', { D });
    case 'buckboost':
      return evaluate('Kcrit.buckboost', { D });
    case 'flyback':
      return evaluate('Kcrit.flyback', { D, n: p.n ?? 1 });
  }
}

/** The load resistor when it is the whole load (a resistive load, or a network with a resistor and no battery); NaN otherwise. */
export function loadResistance(p: SimParams): number {
  const l = p.load;
  if (l.kind === 'resistive') return l.R;
  if (l.kind === 'network' && l.R !== undefined && !l.battery) return l.R;
  return NaN;
}

/** Conversion ratio of the ideal converter for the mode that K selects (resistive load). */
export function analyticM(p: SimParams, K: number, Kc: number): number {
  const D = p.D;
  const n = p.n ?? 1;
  const ccm = K >= Kc;
  switch (p.topology) {
    case 'buck':
      return ccm ? evaluate('buck.ccm.M', { D }) : evaluate('buck.dcm.M', { K, D });
    case 'forward':
      return n * (ccm ? evaluate('buck.ccm.M', { D }) : evaluate('buck.dcm.M', { K, D }));
    case 'boost':
      return ccm ? evaluate('boost.ccm.M', { D }) : evaluate('boost.dcm.M', { D, K });
    case 'buckboost':
      return ccm ? -evaluate('buckboost.ccm.M', { D }) : -evaluate('buckboost.dcm.M', { D, K });
    case 'flyback':
      return ccm ? evaluate('flyback.ccm.M', { n, D }) : evaluate('flyback.dcm.M', { D, K });
  }
}

/** Peak-to-peak inductor-current change during the on-interval of the ideal converter. */
export function analyticRipplePP(p: SimParams, Vg: number, V: number): number {
  const Ts = 1 / p.fs;
  const n = p.n ?? 1;
  const onVolts = { buck: Vg - V, forward: n * Vg - V, boost: Vg, buckboost: Vg, flyback: Vg }[p.topology];
  return (onVolts * p.D * Ts) / p.L;
}

/** An initial state near the steady state, from the ideal equations. */
export function initialState(p: SimParams, model: Model): Vec {
  const x = new Array<number>(model.stateNames.length).fill(0);
  const at = (s: string) => model.stateNames.indexOf(s);
  const n = p.n ?? 1;
  const D = p.D;
  const Ts = 1 / p.fs;
  let Vg = p.Vg;
  let V: number;
  let Iavg = 0;
  let ccm = true;
  const load = p.load;
  if (load.kind === 'network' && (load.battery || load.R === undefined)) {
    // A battery holds the output near its open-circuit voltage; a capacitor
    // alone starts from its start voltage. Start at rest and let the search
    // (or the start-up run) find the rest.
    x[at('v')] = load.battery ? load.battery.V : (load.V0 ?? 0);
    if (at('vbus') >= 0 && p.source) x[at('vbus')] = p.source.Voc;
    return x;
  }
  const R = load.kind === 'fixed' ? NaN : load.kind === 'resistive' ? load.R : load.R!;
  if (load.kind !== 'fixed') {
    const K = (2 * p.L) / (R * Ts);
    const Kc = kCrit(p);
    ccm = K >= Kc;
    const M = analyticM(p, K, Kc);
    if (p.source) {
      const Rin = R / (M * M); // ideal converter as seen from its input
      Vg = (p.source.Voc * Rin) / (Rin + p.source.Rs);
    }
    // The diode's forward drop lowers the output by about V_F; a forward
    // converter's output also stays below n V_g - V_F, where its rectifier
    // would stop conducting.
    const VF = p.VF ?? 0;
    V = Math.max(0, Math.abs(M) * Vg - VF);
    if (p.topology === 'forward') V = Math.min(V, 0.999 * Math.max(0, n * Vg - VF));
    const Iout = V / R;
    Iavg = {
      buck: Iout,
      forward: Iout,
      boost: Iout / (1 - D),
      buckboost: Iout / (1 - D),
      flyback: (n * Iout) / (1 - D),
    }[p.topology];
    x[at('v')] = V;
  } else {
    V = load.V;
    ccm = false;
    if (p.source) {
      const Vcrit = p.topology === 'flyback' ? evaluate('flyback.V_crit', { V, V_D: p.VF ?? 0, D, n }) : p.source.Voc;
      Vg = Math.min(Vcrit, p.source.Voc);
    }
  }
  if (ccm) x[0] = Math.max(0, Iavg - analyticRipplePP(p, Vg, V) / 2);
  if (at('vbus') >= 0) x[at('vbus')] = Vg;
  return x;
}

/** The squared currents whose averages the results give (conduction and diode losses, a battery's resistance), and the input and output power. */
const PAIRS = [
  ['i_sw', 'i_sw'],
  ['i_L', 'i_L'],
  ['i_D', 'i_D'],
  ['i_bat', 'i_bat'],
  ['v_in', 'i_in'],
  ['v_out', 'i_out'],
] as const;

/**
 * The recorded period's results. Its averages, mean squares, powers and
 * extremes are exact integrals and extremes of the solution between the
 * samples (periodIntegrals), not trapezoids through them: they do not
 * depend on the sub-steps. The waveforms are the samples the page draws.
 */
export function analyse(p: SimParams, model: Model, ss: ReturnType<typeof steadyState>): SimResult {
  const Ts = model.Ts;
  const wf = waveforms(model, ss.run);
  const ex = periodIntegrals(model, ss.run, PAIRS);
  const avg: Record<string, number> = {};
  const min: Record<string, number> = {};
  const max: Record<string, number> = {};
  const pp: Record<string, number> = {};
  for (const k of Object.keys(ex.lin)) {
    avg[k] = ex.lin[k]! / Ts;
    // the extremes between the samples, and the samples themselves as the model evaluates them (the integrals
    // evaluate them from the deviation, which can round the other way)
    min[k] = ex.min[k]!;
    max[k] = ex.max[k]!;
    for (const v of (wf[k] as number[] | undefined) ?? []) {
      if (v < min[k]!) min[k] = v;
      if (v > max[k]!) max[k] = v;
    }
    pp[k] = max[k]! - min[k]!;
  }
  const meanSquare: Record<string, number> = {};
  for (const [a, b] of PAIRS) if (a === b && ex.quad[`${a}*${b}`] !== undefined) meanSquare[a] = ex.quad[`${a}*${b}`]! / Ts;
  const idleTime = model.idle.reduce((s, iv) => s + (ss.run.durations[iv] ?? 0), 0);
  const idleFraction = idleTime / Ts;
  // DCM: the inductor current rests at zero for part of the period. BCM: it
  // only touches zero. A current that reverses and flows on through the
  // switch's body diode is continuous (CCM).
  let mode: Mode = 'CCM';
  if (idleFraction > 1e-3) mode = 'DCM';
  else if (Math.abs(min.i_L!) <= 0.02 * Math.max(pp.i_L!, 1e-15)) mode = 'BCM';

  let K = NaN;
  let Kc = NaN;
  const Rload = loadResistance(p);
  if (Number.isFinite(Rload)) {
    K = (2 * p.L) / (Rload * Ts);
    Kc = kCrit(p);
  }
  const conduction = (p.Ron ?? 0) * meanSquare.i_sw! + (p.RL ?? 0) * meanSquare.i_L!;
  const diode = (p.VF ?? 0) * avg.i_D!;
  const capacitive = ss.run.edgeLoss / Ts;
  const outside = outsideModel(p, model, wf, false, { min, max });
  return {
    params: p,
    stateNames: model.stateNames,
    status: ss.converged ? 'steady' : 'unsettled',
    converged: ss.converged,
    cycles: ss.cycles,
    residual: ss.residual,
    x0: ss.x0,
    mode,
    idleFraction,
    K,
    Kcrit: Kc,
    waveforms: wf,
    avg,
    min,
    max,
    pp,
    meanSquare,
    M: avg.v_out! / avg.v_in!,
    losses: { conduction, diode, capacitive, total: conduction + diode + capacitive },
    energy: { input: ex.quad['v_in*i_in']!, output: ex.quad['v_out*i_out']! },
    ...outside,
  };
}

/**
 * Where drawn waveforms leave the model: the switch voltage below zero (the
 * switch's body diode, ideal in the models, would conduct), and each diode
 * the model holds off above its drop (the two-switch converters' diode D
 * and the forward converter's D1 and D2, with V_F; its reset diode D3,
 * ideal): a diode with that drop would conduct there. Rounding is not: the
 * switch voltage is measured against a billionth of the largest voltage
 * involved (never less than the circuit's given voltage). A diode's excess
 * over its drop counts from a ten-thousandth of it: what a diode
 * forward-biased by less would take changes the results by about as little,
 * below the four digits the page shows. Over a steady period the exact
 * extremes count too (`ex`): a ring can cross a threshold and return between
 * two samples.
 */
function outsideModel(
  p: SimParams,
  model: Model,
  w: Waveforms,
  startUp = false,
  ex?: { min: Record<string, number>; max: Record<string, number> },
): Pick<SimResult, 'switchBelowZero' | 'diodes' | 'switchFrom'> {
  const most = (k: string) => {
    let m = 0;
    for (const v of (w[k] as number[] | undefined) ?? []) m = Math.max(m, Math.abs(v));
    if (ex && Number.isFinite(ex.min[k]) && Number.isFinite(ex.max[k])) m = Math.max(m, Math.abs(ex.min[k]!), Math.abs(ex.max[k]!));
    return m;
  };
  const V = Math.max(givenVoltage(p), most('v_in'), most('v_out'), most('v_sw'));
  const t = w.t as number[];
  // the cycle (from 1) a sample belongs to: a cycle's end sample, at k T_s, is its own
  const cycle = (k: number) => Math.max(1, Math.ceil(t[k]! / model.Ts - 1e-9));
  const out: Pick<SimResult, 'switchBelowZero' | 'diodes' | 'switchFrom'> = {};
  // the switch's body diode, ideal in the models, forward-biased beyond a ten-thousandth of the circuit's largest
  // voltage, as the diodes below are beyond their drop
  const floor = -1e-4 * V;
  const vsw = w.v_sw as number[];
  let lo = Infinity;
  let first = -1;
  for (let k = 0; k < vsw.length; k++) {
    if (vsw[k]! < floor && first < 0) first = k;
    lo = Math.min(lo, vsw[k]!);
  }
  if (ex && ex.min.v_sw! < lo) lo = ex.min.v_sw!;
  if (first >= 0 || lo < floor) {
    out.switchBelowZero = lo;
    if (startUp) out.switchFrom = cycle(first);
  }
  const VF = p.VF ?? 0;
  const held: [DiodeFlag['diode'], string, number][] =
    model.topology === 'forward'
      ? [
          ['D1', 'v_D1', VF],
          ['D2', 'v_D2', VF],
          ['D3', 'v_Dr', 0],
        ]
      : [['D', 'v_D', VF]];
  for (const [diode, key, drop] of held) {
    const vD = (w[key] as number[] | undefined) ?? [];
    const limit = drop + 1e-4 * Math.max(V, most(key));
    let hi = -Infinity;
    first = -1;
    for (let k = 0; k < vD.length; k++) {
      if (vD[k]! > limit && first < 0) first = k;
      hi = Math.max(hi, vD[k]!);
    }
    if (ex && ex.max[key]! > hi) hi = ex.max[key]!;
    if (first >= 0 || hi > limit) (out.diodes ??= []).push({ diode, v: hi, drop, ...(startUp ? { from: cycle(first) } : {}) });
  }
  return out;
}

/** Most sub-steps per period, and the fewest sub-steps per ring that still find the events inside the ringing. */
export const MAX_STEPS = 20000;
export const MIN_STEPS_PER_RING = 3;
/** Sub-steps per ring the simulator aims for. */
export const STEPS_PER_RING = 20;

/**
 * How many periods of the circuit's fastest ring fit in a switching period:
 * the largest imaginary part of the eigenvalues of any interval's matrix,
 * times T_s / 2π. Any inductance and capacitance can ring: the node
 * capacitance, the output capacitor with the inductance (a small capacitor
 * alone), the input bus.
 */
export function ringsPerPeriod(model: Model): number {
  let w = 0;
  for (const iv of Object.values(model.intervals)) {
    try {
      for (const e of eigenvalues(iv.A)) w = Math.max(w, Math.abs(e.im));
    } catch (e) {
      // the QR iteration did not converge (two nearly identical lossless rings coupled by almost nothing): every
      // eigenvalue's size is at most the matrix's Frobenius norm, a bound that can only ask for more sub-steps.
      // Any other failure is not one a bound can stand in for
      if (!(e instanceof Error && /did not converge/.test(e.message))) throw e;
      w = Math.max(w, Math.sqrt(iv.A.reduce((s, row) => s + row.reduce((r, v) => r + v * v, 0), 0)));
    }
  }
  return (w * model.Ts) / (2 * Math.PI);
}

/**
 * Sub-steps per period: 2000 (docs/BUILD_SPEC.md section 4), more when the
 * circuit rings so fast that a ring period would span fewer than
 * STEPS_PER_RING sub-steps (at most MAX_STEPS). Events are found where a
 * guard changes sign between two sub-steps: a current that rings through
 * zero and back within one sub-step would be missed. A circuit whose ring
 * would span fewer than MIN_STEPS_PER_RING sub-steps even at MAX_STEPS is
 * refused.
 */
export function stepsFor(p: SimParams, model: Model = buildModel(p)): number {
  const rings = ringsPerPeriod(model);
  const perRing = MAX_STEPS / rings;
  if (perRing < MIN_STEPS_PER_RING) {
    throw new Error(
      `the circuit rings too fast to simulate: its fastest ring (period ${(model.Ts / rings).toExponential(2)} s) would span ` +
        `${perRing.toFixed(1)} of the ${MAX_STEPS} sub-steps per switching period, fewer than ${MIN_STEPS_PER_RING}; ` +
        'use a larger inductance or capacitance, or a higher switching frequency',
    );
  }
  return Math.min(MAX_STEPS, Math.max(2000, Math.ceil(STEPS_PER_RING * rings)));
}

/** The state at rest: no current, the output capacitor at its start voltage (a battery's open-circuit voltage), the input bus at V_oc. */
export function restState(p: SimParams, model: Model): Vec {
  const x = new Array<number>(model.stateNames.length).fill(0);
  const iv = model.stateNames.indexOf('v');
  const l = p.load;
  if (iv >= 0 && l.kind === 'network') x[iv] = l.battery ? l.battery.V : (l.V0 ?? 0);
  const ib = model.stateNames.indexOf('vbus');
  if (ib >= 0 && p.source) x[ib] = p.source.Voc;
  return x;
}

/** Most samples a start-up record keeps (per series): it travels from the worker to the page. */
export const STARTUP_SAMPLES = 40000;

/**
 * The first cycles from rest, every cycle recorded at `steps` sub-steps, or
 * more: the solution is exact at every sub-step and event, but an event is
 * found only where its guard changes sign between two sub-steps, so the
 * grid must resolve the circuit's fastest ring (STEPS_PER_RING sub-steps per
 * ring; with a node capacitance, the search's own sub-steps). Fewer cycles
 * when the record would exceed STARTUP_SAMPLES.
 */
export function startUp(p: SimParams, model: Model, cycles: number, steps: number): StartUp {
  const ring = p.Cnode && p.topology !== 'forward' ? stepsFor(p, model) : Math.min(MAX_STEPS, Math.ceil(STEPS_PER_RING * ringsPerPeriod(model)));
  const perCycle = Math.max(steps, ring);
  const n = Math.max(1, Math.min(cycles, Math.floor(STARTUP_SAMPLES / perCycle)));
  const out: Waveforms = { t: [], interval: [] };
  let x = restState(p, model);
  let lastStart = x;
  for (let k = 0; k < n; k++) {
    lastStart = x;
    const run = runCycle(model, x, { stepsPerPeriod: perCycle, record: true });
    const w = waveforms(model, run);
    const t0 = k * model.Ts;
    for (const key of Object.keys(w)) {
      if (!out[key]) out[key] = [];
      const src = w[key] as (number | string)[];
      const dst = out[key] as (number | string)[];
      for (let m = 0; m < src.length; m++) dst.push(key === 't' ? (src[m] as number) + t0 : src[m]!);
    }
    x = run.x;
  }
  return { waveforms: out, cycles: n, lastStart, end: x, steps: perCycle };
}

/**
 * The duty ratio that holds a fixed output in CCM with ideal parts: the
 * catalogue's M(D) solved for D at M = V/V_g (negative for the buck-boost,
 * whose output is inverted; its fixed output is the magnitude).
 */
export function balanceDuty(p: SimParams): number | undefined {
  if (p.load.kind !== 'fixed' || !(p.Vg > 0)) return undefined;
  const M = ((p.topology === 'buckboost' ? -1 : 1) * p.load.V) / p.Vg;
  const eq = { buck: 'buck.ccm.M', boost: 'boost.ccm.M', buckboost: 'buckboost.ccm.M', flyback: 'flyback.ccm.M', forward: 'forward.ccm.M' }[p.topology];
  const inputs: Record<string, number> = p.topology === 'flyback' || p.topology === 'forward' ? { n: p.n ?? 1 } : {};
  try {
    const D = invert(eq, 'D', M, inputs, 1e-9, 1 - 1e-9);
    return D > 0 && D < 1 ? D : undefined;
  } catch {
    return undefined;
  }
}

/** The forward converter's largest duty ratio that still resets its core (forward.reset.Dmax); none for the others. */
export function resetLimit(p: SimParams): number | undefined {
  return p.topology === 'forward' ? evaluate('forward.reset.Dmax', { n_r: p.nr ?? 1 }) : undefined;
}

/**
 * Why the search found no steady state: a few more cycles from where it
 * stopped show which state keeps changing. An inductor current (first the
 * forward converter's magnetizing current, whose core does not reset above
 * its duty-ratio limit) changing by exactly the same amount every cycle
 * means its volt-seconds cannot balance: a runaway. A slow transient's
 * change shrinks from cycle to cycle instead; it, and a capacitor alone
 * whose voltage still changes, have not settled yet.
 */
export function diagnose(p: SimParams, model: Model, x: Vec, steps: number): { status: Status; drift?: Drift } {
  const runs: CycleRun[] = [];
  let y = x;
  for (let k = 0; k < 3; k++) {
    const r = runCycle(model, y, { stepsPerPeriod: steps });
    runs.push(r);
    y = r.x;
  }
  const last = runs[2]!;
  const prev = runs[1]!;
  const names = model.stateNames;
  for (const [state, L] of [
    ['iM', p.LM ?? NaN],
    ['i', p.L],
  ] as const) {
    const j = names.indexOf(state);
    if (j < 0) continue;
    const d = last.dx[j]!;
    // a pure drift: the same change every cycle, to 1e-9 (a slow transient's change shrinks from cycle to cycle)
    const same = Math.abs(d - prev.dx[j]!) <= 1e-9 * Math.abs(d);
    // a change that counts against how far the current moves within the cycle, not rounding
    if (d !== 0 && same && Math.abs(d) > 1e-6 * Math.max(last.variation[j]!, Math.abs(y[j]!))) {
      const drift: Drift = { state, perCycle: d, vLavg: (L * d) / model.Ts };
      if (state === 'i') drift.Dbalance = balanceDuty(p);
      const Dmax = resetLimit(p);
      if (Dmax !== undefined) drift.Dmax = Dmax;
      return { status: 'runaway', drift };
    }
  }
  const iv = names.indexOf('v');
  if (chargingLoad(p) && iv >= 0 && last.dx[iv] !== 0) return { status: 'unsettled', drift: { state: 'v', perCycle: last.dx[iv]! } };
  return { status: 'unsettled' };
}

/** Cycles recorded from rest when there is no steady state (enough to see the current grow, or the capacitor charge), and sub-steps per cycle. */
export const STARTUP = { runaway: [20, 200], charging: [400, 50], unsettled: [60, 100] } as const;

/** An output capacitor with nothing across it (a network load with neither a resistor nor a battery). */
export function chargingLoad(p: SimParams): boolean {
  return p.load.kind === 'network' && p.load.R === undefined && !p.load.battery;
}

/**
 * A capacitor alone that charges without bound: behind a boost, buck-boost
 * or flyback every cycle stores energy in the inductance and hands it to the
 * capacitor, whatever its voltage. With a node capacitance the inductance
 * must also charge that to the output's voltage before the diode conducts,
 * which it no longer can above some voltage: the output stops there. Behind
 * a buck the output settles at the input (the switch conducts both ways),
 * behind a forward converter at or above n V_g less the diode drop.
 */
export function unboundedCharging(p: SimParams): boolean {
  return chargingLoad(p) && (p.topology === 'boost' || p.topology === 'buckboost' || p.topology === 'flyback') && !p.Cnode;
}

/**
 * How far a capacitor alone's start-up is followed before the search: at
 * most `cycles` cycles and `work` sub-steps. It ends once the capacitor has
 * taken no charge for `quiet` cycles in a row, or for `still` cycles in a
 * row with the other states settled (each back where it started the cycle
 * to `settled` of its movement within it); or once its charge per cycle has
 * shrunk for `creep` cycles in a row with the other states settled, a creep
 * towards a voltage that the search then finds directly. A state still
 * drifting, however slowly (an input bus recovering), is not settled: the
 * voltage the capacitor creeps towards moves with it.
 */
export const FOLLOW = { cycles: 4000, work: 2e6, quiet: 50, still: 3, creep: 10, settled: 1e-9 } as const;

/**
 * Sub-steps per cycle for following a start-up: the search's own where a
 * node capacitance rings (a diode that turns on near the top of a ring is
 * found only on the same grid), otherwise STEPS_PER_RING per period of the
 * circuit's fastest ring (a current that rings through zero within one
 * sub-step would be missed), at least 100 and at most the search's.
 */
function followSteps(p: SimParams, model: Model, steps: number): number {
  if (p.Cnode && p.topology !== 'forward') return steps;
  return Math.min(steps, Math.max(100, Math.ceil(STEPS_PER_RING * ringsPerPeriod(model))));
}

/** The start-up of a capacitor alone from rest, followed as FOLLOW says: where it ends, and after how many cycles. */
export function followStartUp(p: SimParams, model: Model, steps: number): { x: Vec; cycles: number } {
  const iv = model.stateNames.indexOf('v');
  const perCycle = followSteps(p, model, steps);
  const max = Math.max(1, Math.min(FOLLOW.cycles, Math.floor(FOLLOW.work / perCycle)));
  let x = restState(p, model);
  let quiet = 0;
  let still = 0;
  let creep = 0;
  let prev = Infinity;
  let k = 0;
  while (k < max) {
    const r = runCycle(model, x, { stepsPerPeriod: perCycle });
    k++;
    x = r.x;
    const dv = r.dx[iv]!;
    const settled = r.dx.every((d, j) => j === iv || Math.abs(d) <= FOLLOW.settled * r.variation[j]!);
    if (dv === 0) {
      creep = 0;
      prev = Infinity;
      quiet++;
      still = settled ? still + 1 : 0;
      if (quiet >= FOLLOW.quiet || still >= FOLLOW.still) break;
      continue;
    }
    quiet = 0;
    still = 0;
    creep = settled && Math.abs(dv) < Math.abs(prev) ? creep + 1 : 0;
    prev = dv;
    if (creep >= FOLLOW.creep) break;
  }
  return { x, cycles: k };
}

/**
 * The steady state a capacitor alone reaches from V_0.
 *
 * Behind a buck there is one: the input (the switch conducts both ways),
 * where the search starts. Behind the others the steady states form a
 * range, every voltage that no more charge reaches (a forward converter's
 * output at or above n V_g less the diode drop; with a node capacitance, a
 * boost's, buck-boost's or flyback's output above the voltage to which its
 * inductance can still lift the node), and the start-up decides which one
 * it keeps. It is followed from rest first (followStartUp), and the search
 * starts where it ends; the voltage reported is never below one it reached:
 * - where the start-up stopped, the search keeps its voltage (the capacitor
 *   takes no step, see steadyState) and finds the other states' cycle;
 * - where it still creeps up, its charge per cycle shrinking to nothing, the
 *   search may step past the edge of the range; it is brought back, by
 *   bisection between the two, to the lowest voltage that no charge reaches.
 *   The start-up, charging in ever smaller steps, stops a little above it
 *   (about 1e-8 of the voltage in the cases tried).
 * Where the search fails from there, or settles below the voltage the
 * start-up reached (a start-up still far from its stop), a steady state with
 * the capacitor high enough that no charge reaches it is found from ever
 * higher voltages, and the bisection runs down from it; that orbit can lie
 * a few millionths of the voltage above the start-up's own.
 * A start-up that has not stopped within FOLLOW's limits (an L-C charge
 * slower than that; with a node capacitance's finer sub-steps only 100 to
 * 1000 periods are followed) is searched from where it got to, and is
 * reported below the voltage it would still reach (by up to about 7e-4 of it
 * in random trials). A start-up quiet for FOLLOW.quiet periods that later
 * charges again likewise ends above the voltage reported.
 */
function capacitorAlone(p: SimParams, model: Model, opts: SteadyOptions, steps: number): SteadyResult {
  const iv = model.stateNames.indexOf('v');
  const search = (x: Vec, more: SteadyOptions = {}) => steadyState(model, x, { stopOnDrift: true, ...opts, stepsPerPeriod: steps, ...more });
  if (p.topology === 'buck') {
    const x = restState(p, model);
    x[iv] = p.source ? p.source.Voc : p.Vg;
    return search(x);
  }
  const f = followStartUp(p, model, steps);
  const a = f.x[iv]!;
  const ss = search(f.x);
  let cycles = f.cycles + ss.cycles;
  const withV = (x: Vec, v: number) => x.map((y, j) => (j === iv ? v : y));
  // no charge reaches the capacitor at v in one cycle from the other states of x
  const stoppedAt = (x: Vec, v: number) => {
    cycles++;
    return runCycle(model, withV(x, v), { stepsPerPeriod: steps }).dx[iv] === 0;
  };
  // the lowest voltage that no charge reaches with the other states of the steady state x, never below a
  const edge = (x: Vec): number | null => {
    if (stoppedAt(x, a)) return a;
    let lo = a;
    let hi = x[iv]!;
    if (!(hi > lo)) return null;
    for (let k = 0; k < 80 && hi - lo > 1e-12 * Math.abs(hi); k++) {
      const m = 0.5 * (lo + hi);
      if (stoppedAt(x, m)) hi = m;
      else lo = m;
    }
    return hi;
  };
  let orbit: Vec | null = null;
  if (ss.converged) {
    const b = ss.x0[iv]!;
    // the start-up stopped where the search kept it, or a steady state whose charge per cycle is below the tolerance
    if (b === a || !stoppedAt(ss.x0, b)) return { ...ss, cycles };
    orbit = ss.x0;
  }
  let v = orbit ? edge(orbit) : null;
  if (v === null) {
    // the search failed, or ended below a voltage the start-up reached: a steady state with the capacitor
    // high enough that no charge reaches it, from ever higher voltages, gives the other states
    // (within what is left of the search's cycle limit)
    orbit = null;
    let left = (opts.maxCycles ?? 2000) - ss.cycles;
    let high = Math.max(2 * Math.abs(a), a + (model.scales?.[iv] ?? 0), Number.MIN_VALUE);
    for (let k = 0; k < 12 && !orbit && left > 0; k++, high *= 2) {
      const s = search(withV(f.x, high), { maxCycles: Math.min(left, 200) });
      cycles += s.cycles;
      left -= s.cycles;
      if (s.converged && s.x0[iv]! > a && stoppedAt(s.x0, s.x0[iv]!)) orbit = s.x0;
    }
    v = orbit ? edge(orbit) : null;
    if (v === null) return { ...ss, cycles, converged: false };
  }
  const fin = steadyState(model, withV(orbit!, v), { ...opts, stepsPerPeriod: steps });
  return { ...fin, cycles: cycles + fin.cycles };
}

/**
 * Build the model, start from the analytic operating point, and find the
 * periodic steady state. Without one, say why and record the start-up from
 * rest instead; the result's averages then describe the start-up's last
 * cycle. A capacitor alone that charges without bound is not searched; one
 * that stops is searched from V_0 for the steady state its start-up reaches
 * (capacitorAlone).
 */
export function simulate(p: SimParams, opts: SteadyOptions = {}): SimResult {
  const model = buildModel(p);
  // parameters whose equations overflow are refused before the search, not after it
  checkRange(model);
  const steps = opts.stepsPerPeriod ?? stepsFor(p);
  if (unboundedCharging(p)) return withStartUp(p, model, 'charging');
  const ss = chargingLoad(p)
    ? capacitorAlone(p, model, opts, steps)
    : steadyState(model, initialState(p, model), { stopOnDrift: true, ...opts, stepsPerPeriod: steps });
  if (ss.converged) return analyse(p, model, ss);
  const { status, drift } = diagnose(p, model, ss.x0, steps);
  return withStartUp(p, model, status, drift);
}

/** The result without a steady state: the start-up from rest, and the analysis of its last cycle. */
function withStartUp(p: SimParams, model: Model, status: Status, drift?: Drift): SimResult {
  const [cycles, perCycle] = STARTUP[status as keyof typeof STARTUP] ?? STARTUP.unsettled;
  const su = startUp(p, model, cycles, perCycle);
  // the start-up's last cycle again, as it was recorded, for its averages
  const last = runCycle(model, su.lastStart, { stepsPerPeriod: su.steps, record: true });
  const r = analyse(p, model, { x0: su.lastStart, cycles: su.cycles, converged: false, residual: NaN, run: last });
  let d = drift;
  const iv = model.stateNames.indexOf('v');
  // a capacitor alone: its change over the start-up's last cycle, which the
  // page shows; a start-up that has stopped by then says nothing about a
  // search that did not settle, and gives no change per cycle
  if (chargingLoad(p) && iv >= 0 && (status === 'charging' || d?.state === 'v')) {
    const dv = su.end[iv]! - su.lastStart[iv]!;
    d = status === 'charging' || Math.abs(dv) > 64 * Number.EPSILON * Math.max(Math.abs(su.end[iv]!), model.scales?.[iv] ?? 0) ? { state: 'v', perCycle: dv } : undefined;
  }
  // what the page draws is the start-up: whether it leaves the model is read from all of it
  const { switchBelowZero: _s, diodes: _d, ...rest } = r;
  return { ...rest, ...outsideModel(p, model, su.waveforms, true), status, drift: d, startUp: su };
}

export { SERIES };
