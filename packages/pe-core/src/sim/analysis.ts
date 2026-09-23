/**
 * Steady-state analysis of a simulated cycle: averages, peak-to-peak ripple,
 * detected conduction mode, K against K_crit, stresses, losses and the energy
 * per cycle; plus `simulate()`, which builds the model, starts from the
 * analytic operating point and finds the periodic steady state.
 */

import { evaluate } from '../equations';
import { steadyState, type CycleRun, type Model, type SteadyOptions } from './engine';
import type { Vec } from './linalg';
import { buildModel, type SimParams } from './models';

export type Mode = 'CCM' | 'DCM' | 'BCM';

export interface Waveforms {
  t: number[];
  interval: string[];
  [series: string]: number[] | string[];
}

export interface SimResult {
  params: SimParams;
  stateNames: string[];
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
  /** Losses (W). */
  losses: { conduction: number; diode: number; capacitive: number; total: number };
  /** Energy per cycle (J). */
  energy: { input: number; output: number };
}

const SERIES = ['i_L', 'v_L', 'v_sw', 'i_sw', 'i_D', 'i_out', 'i_in', 'v_in', 'v_out'] as const;

/** Waveforms of a recorded cycle. */
export function waveforms(model: Model, run: CycleRun): Waveforms {
  const out: Waveforms = { t: [], interval: [] };
  const names = new Set<string>();
  for (const s of run.samples) {
    const y = model.outputs(s.x, s.interval);
    for (const k of Object.keys(y)) names.add(k);
  }
  for (const k of names) out[k] = [];
  for (const s of run.samples) {
    (out.t as number[]).push(s.t);
    (out.interval as string[]).push(s.interval);
    const y = model.outputs(s.x, s.interval);
    for (const k of names) (out[k] as number[]).push(y[k] ?? NaN);
  }
  return out;
}

/** Time average of a series over the recorded cycle (trapezoids; samples at events have zero width). */
function average(t: number[], y: number[], Ts: number, f: (v: number) => number = (v) => v): number {
  let s = 0;
  for (let k = 1; k < t.length; k++) s += 0.5 * (f(y[k - 1]!) + f(y[k]!)) * (t[k]! - t[k - 1]!);
  return s / Ts;
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
  if (p.load.kind === 'resistive') {
    const K = (2 * p.L) / (p.load.R * Ts);
    const Kc = kCrit(p);
    ccm = K >= Kc;
    const M = analyticM(p, K, Kc);
    if (p.source) {
      const Rin = p.load.R / (M * M); // ideal converter as seen from its input
      Vg = (p.source.Voc * Rin) / (Rin + p.source.Rs);
    }
    // The diode's forward drop lowers the output by about V_F; a forward
    // converter's output also stays below n V_g - V_F, where its rectifier
    // would stop conducting.
    const VF = p.VF ?? 0;
    V = Math.max(0, Math.abs(M) * Vg - VF);
    if (p.topology === 'forward') V = Math.min(V, 0.999 * Math.max(0, n * Vg - VF));
    const Iout = V / p.load.R;
    Iavg = {
      buck: Iout,
      forward: Iout,
      boost: Iout / (1 - D),
      buckboost: Iout / (1 - D),
      flyback: (n * Iout) / (1 - D),
    }[p.topology];
    x[at('v')] = V;
  } else {
    V = p.load.V;
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

export function analyse(p: SimParams, model: Model, ss: ReturnType<typeof steadyState>): SimResult {
  const Ts = model.Ts;
  const wf = waveforms(model, ss.run);
  const t = wf.t as number[];
  const avg: Record<string, number> = {};
  const min: Record<string, number> = {};
  const max: Record<string, number> = {};
  const pp: Record<string, number> = {};
  for (const k of Object.keys(wf)) {
    if (k === 't' || k === 'interval') continue;
    const y = wf[k] as number[];
    avg[k] = average(t, y, Ts);
    // loops, not Math.min(...y): the spread fails on very long waveforms
    let lo = Infinity;
    let hi = -Infinity;
    for (const v of y) {
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    }
    min[k] = lo;
    max[k] = hi;
    pp[k] = hi - lo;
  }
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
  if (p.load.kind === 'resistive') {
    K = (2 * p.L) / (p.load.R * Ts);
    Kc = kCrit(p);
  }
  const iL = wf.i_L as number[];
  const isw = wf.i_sw as number[];
  const iD = wf.i_D as number[];
  const conduction = (p.Ron ?? 0) * average(t, isw, Ts, (v) => v * v) + (p.RL ?? 0) * average(t, iL, Ts, (v) => v * v);
  const diode = (p.VF ?? 0) * average(t, iD, Ts);
  const capacitive = ss.run.edgeLoss / Ts;
  const vin = wf.v_in as number[];
  const iin = wf.i_in as number[];
  const vout = wf.v_out as number[];
  const iout = wf.i_out as number[];
  const pin = t.map((_, k) => vin[k]! * iin[k]!);
  const pout = t.map((_, k) => vout[k]! * iout[k]!);
  return {
    params: p,
    stateNames: model.stateNames,
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
    M: avg.v_out! / avg.v_in!,
    losses: { conduction, diode, capacitive, total: conduction + diode + capacitive },
    energy: { input: average(t, pin, Ts) * Ts, output: average(t, pout, Ts) * Ts },
  };
}

/** Most sub-steps per period, and the fewest sub-steps per ring of the node capacitance that still find its events. */
export const MAX_STEPS = 20000;
export const MIN_STEPS_PER_RING = 3;

/**
 * Sub-steps per period: 2000 (docs/BUILD_SPEC.md section 4), more when a node
 * capacitance rings so fast that a ring period would span fewer than twenty
 * sub-steps (at most MAX_STEPS), so that events inside the ringing are found.
 * A node capacitance whose ring would span fewer than MIN_STEPS_PER_RING
 * sub-steps even then is refused: the diode's turn-on during the ringing
 * could fall between two sub-steps and be missed.
 */
export function stepsFor(p: SimParams): number {
  if (!p.Cnode || p.topology === 'forward') return 2000;
  const ringPeriod = 2 * Math.PI * Math.sqrt(p.L * p.Cnode);
  const perRing = (MAX_STEPS * ringPeriod) * p.fs;
  if (perRing < MIN_STEPS_PER_RING) {
    throw new Error(
      `the node capacitance rings too fast to simulate: its ring period (${ringPeriod.toExponential(2)} s) would span ` +
        `${perRing.toFixed(1)} of the ${MAX_STEPS} sub-steps per switching period, fewer than ${MIN_STEPS_PER_RING}; ` +
        'use a larger node capacitance or a lower switching frequency',
    );
  }
  return Math.min(MAX_STEPS, Math.max(2000, Math.ceil(20 / (p.fs * ringPeriod))));
}

/** Build the model, start from the analytic operating point, and find the periodic steady state. */
export function simulate(p: SimParams, opts: SteadyOptions = {}): SimResult {
  const model = buildModel(p);
  const ss = steadyState(model, initialState(p, model), { ...opts, stepsPerPeriod: opts.stepsPerPeriod ?? stepsFor(p) });
  return analyse(p, model, ss);
}

export { SERIES };
