/**
 * Steady-state analysis of a simulated cycle: averages, peak-to-peak ripple,
 * detected conduction mode, K against K_crit, stresses, losses and the energy
 * per cycle; plus `simulate()`, which builds the model, starts from the
 * analytic operating point and finds the periodic steady state.
 *
 * Not every circuit has one. A fixed output fed in CCM gains or loses the
 * same inductor current every cycle unless the duty ratio balances the
 * inductor's volt-seconds exactly; an output capacitor with nothing across
 * it charges for ever. `simulate()` then says which state keeps changing and
 * by how much per cycle, and records the start-up from rest instead.
 */

import { evaluate } from '../equations';
import { invert } from '../invert';
import { runCycle, steadyState, type CycleRun, type Model, type SteadyOptions } from './engine';
import type { Vec } from './linalg';
import { buildModel, type SimParams } from './models';

export type Mode = 'CCM' | 'DCM' | 'BCM';

/**
 * steady: a periodic steady state was found. runaway: the inductor current
 * changes by the same amount every cycle (the volt-seconds cannot balance),
 * so there is none. charging: the output capacitor, with nothing across it,
 * keeps charging. unsettled: no steady state within the cycle limit for
 * another reason (e.g. an undamped L-C ringing).
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
}

/** The first cycles from rest (zero currents, the output at its start voltage), recorded. */
export interface StartUp {
  waveforms: Waveforms;
  cycles: number;
  /** State at the start of the last recorded cycle, and at its end. */
  lastStart: Vec;
  end: Vec;
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
  /** Losses (W). */
  losses: { conduction: number; diode: number; capacitive: number; total: number };
  /** Energy per cycle (J). */
  energy: { input: number; output: number };
}

const SERIES = ['i_L', 'v_L', 'v_sw', 'i_sw', 'i_D', 'i_out', 'i_in', 'v_in', 'v_out', 'i_R', 'i_bat', 'i_C'] as const;

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
  const Rload = loadResistance(p);
  if (Number.isFinite(Rload)) {
    K = (2 * p.L) / (Rload * Ts);
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
 * The first cycles from rest, every cycle recorded at `steps` sub-steps (the
 * solution is exact at every sub-step and event, so a coarse grid only thins
 * the drawing), or at the node capacitance's own minimum. Fewer cycles when
 * the record would exceed STARTUP_SAMPLES.
 */
export function startUp(p: SimParams, model: Model, cycles: number, steps: number): StartUp {
  const perCycle = p.Cnode && p.topology !== 'forward' ? Math.max(steps, stepsFor(p)) : steps;
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
  return { waveforms: out, cycles: n, lastStart, end: x };
}

/** The duty ratio that holds a fixed output in CCM with ideal parts: the catalogue's M(D) solved for D at M = V/V_g. */
export function balanceDuty(p: SimParams): number | undefined {
  if (p.load.kind !== 'fixed' || !(p.Vg > 0)) return undefined;
  const M = p.load.V / p.Vg;
  const eq = { buck: 'buck.ccm.M', boost: 'boost.ccm.M', buckboost: 'buckboost.ccm.M', flyback: 'flyback.ccm.M', forward: 'forward.ccm.M' }[p.topology];
  const inputs: Record<string, number> = p.topology === 'flyback' || p.topology === 'forward' ? { n: p.n ?? 1 } : {};
  try {
    const D = invert(eq, 'D', M, inputs, 1e-9, 1 - 1e-9);
    return D > 0 && D < 1 ? D : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Why the search found no steady state: a few more cycles from where it
 * stopped show which state keeps changing. The inductor current changing by
 * the same amount every cycle means its volt-seconds cannot balance; an
 * output capacitor with nothing across it charges.
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
  const l = p.load;
  const iv = names.indexOf('v');
  if (l.kind === 'network' && l.R === undefined && !l.battery && iv >= 0) {
    return { status: 'charging', drift: { state: 'v', perCycle: last.dx[iv]! } };
  }
  // an inductor current (the forward converter's magnetizing current too)
  // that changes by the same amount every cycle
  for (const [state, L] of [
    ['i', p.L],
    ['iM', p.LM ?? NaN],
  ] as const) {
    const j = names.indexOf(state);
    if (j < 0) continue;
    const d = last.dx[j]!;
    const same = Math.abs(d - prev.dx[j]!) <= 1e-3 * Math.abs(d);
    if (d !== 0 && same && Math.abs(d) >= 1e-6 * Math.max(Math.abs(y[j]!), 1e-12)) {
      const drift: Drift = { state, perCycle: d, vLavg: (L * d) / model.Ts };
      if (state === 'i') drift.Dbalance = balanceDuty(p);
      return { status: 'runaway', drift };
    }
  }
  return { status: 'unsettled' };
}

/** Cycles recorded from rest when there is no steady state (enough to see the current grow, or the capacitor charge), and sub-steps per cycle. */
export const STARTUP = { runaway: [20, 200], charging: [400, 50], unsettled: [60, 100] } as const;

/** An output capacitor with nothing across it (a network load with neither a resistor nor a battery). */
export function chargingLoad(p: SimParams): boolean {
  return p.load.kind === 'network' && p.load.R === undefined && !p.load.battery;
}

/**
 * Build the model, start from the analytic operating point, and find the
 * periodic steady state. Without one, say why and record the start-up from
 * rest instead; the result's averages then describe the start-up's last
 * cycle. A capacitor alone behind a boost, buck-boost or flyback charges
 * without bound (every cycle adds energy and nothing takes it), so no search
 * is made; behind a buck or a forward converter it stops once the output
 * reaches what the converter can give.
 */
export function simulate(p: SimParams, opts: SteadyOptions = {}): SimResult {
  const model = buildModel(p);
  const steps = opts.stepsPerPeriod ?? stepsFor(p);
  const unbounded = chargingLoad(p) && p.topology !== 'buck' && p.topology !== 'forward';
  if (!unbounded) {
    const ss = steadyState(model, initialState(p, model), { stopOnDrift: true, ...opts, stepsPerPeriod: steps });
    if (ss.converged) return analyse(p, model, ss);
    const { status, drift } = diagnose(p, model, ss.x0, steps);
    return withStartUp(p, model, status, drift);
  }
  return withStartUp(p, model, 'charging');
}

/** The result without a steady state: the start-up from rest, and the analysis of its last cycle. */
function withStartUp(p: SimParams, model: Model, status: Status, drift?: Drift): SimResult {
  const [cycles, perCycle] = STARTUP[status as keyof typeof STARTUP] ?? STARTUP.unsettled;
  const su = startUp(p, model, cycles, perCycle);
  // the start-up's last cycle again, for its averages
  const last = runCycle(model, su.lastStart, { stepsPerPeriod: perCycle, record: true });
  const r = analyse(p, model, { x0: su.lastStart, cycles: su.cycles, converged: false, residual: NaN, run: last });
  let d = drift;
  if (status === 'charging') d = { state: 'v', perCycle: last.dx[model.stateNames.indexOf('v')]! };
  return { ...r, status, drift: d, startUp: su };
}

export { SERIES };
