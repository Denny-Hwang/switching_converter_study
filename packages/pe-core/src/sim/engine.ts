/**
 * Piecewise-linear time-domain simulator (docs/BUILD_SPEC.md §4).
 *
 * A converter is a set of linear intervals, each with dx/dt = A x + b: the
 * switch on, the switch off with the diode conducting, the idle interval of
 * DCM, and so on. Within an interval the state is advanced by the exact
 * solution over fixed sub-steps (Phi = expm(A dt), precomputed per interval,
 * dt = T_s / 2000 by default). Gate edges fall at t = 0 and t = D T_s;
 * other events (a diode current reaching zero, a clamp starting to conduct)
 * are guards, linear functions of the state, located by bisection on the
 * exact solution inside the sub-step where they change sign.
 *
 * The periodic steady state is found by Newton shooting on the cycle map and
 * confirmed by the spec's criterion: the largest change of any state between
 * two consecutive cycles, relative to that state's peak magnitude, is below
 * `tol` (default 1e-6), within at most `maxCycles` cycles (default 2000).
 */

import { addScaled, affineStep, identity, matvec, solveVec, zeros, type Mat, type Vec } from './linalg';

export interface Guard {
  /** The interval ends when c·x + d, positive at the start of a sub-step, reaches zero or below. */
  c: Vec;
  d: number;
  /** Interval entered at the event. */
  next: string;
  /** Only fire when this holds at the event (e.g. a diode turns on only for a forward current). */
  when?: (x: Vec) => boolean;
  /** State map at the event, e.g. set a current to exactly zero. */
  reset?: (x: Vec) => Vec;
}

export interface Interval {
  name: string;
  /** Gate signal during the interval. */
  gate: boolean;
  A: Mat;
  b: Vec;
  guards: Guard[];
}

export interface Edge {
  interval: string;
  x: Vec;
  /** Energy dissipated by an instantaneous state change at the edge (J), e.g. a discharged node capacitance. */
  loss?: number;
}

export interface Model {
  topology: string;
  stateNames: string[];
  Ts: number;
  D: number;
  intervals: Record<string, Interval>;
  /** Intervals in which the main inductor current is zero (the DCM idle interval and its variants). */
  idle: string[];
  turnOn(x: Vec): Edge;
  turnOff(x: Vec): Edge;
  /** Waveform values for the state x in the given interval. */
  outputs(x: Vec, interval: string): Record<string, number>;
}

export interface Sample {
  t: number;
  interval: string;
  x: Vec;
}

export interface CycleRun {
  /** State at the end of the cycle. */
  x: Vec;
  /** Samples at every sub-step and at both sides of every event (only when recorded). */
  samples: Sample[];
  /** Largest |x_j| during the cycle, per state. */
  maxAbs: Vec;
  /** Time spent in each interval (s). */
  durations: Record<string, number>;
  events: { t: number; from: string; to: string }[];
  /** Energy dissipated by instantaneous resets at the edges during the cycle (J). */
  edgeLoss: number;
}

export interface RunOptions {
  stepsPerPeriod?: number;
  record?: boolean;
}

class StepCache {
  private readonly cache = new Map<string, { Phi: Mat; Gamma: Vec }>();
  constructor(
    private readonly model: Model,
    private readonly dt: number,
  ) {}
  full(name: string): { Phi: Mat; Gamma: Vec } {
    let s = this.cache.get(name);
    if (!s) {
      const iv = this.model.intervals[name]!;
      s = affineStep(iv.A, iv.b, this.dt);
      this.cache.set(name, s);
    }
    return s;
  }
}

const caches = new WeakMap<Model, Map<number, StepCache>>();
function cacheFor(model: Model, dt: number): StepCache {
  let byDt = caches.get(model);
  if (!byDt) {
    byDt = new Map();
    caches.set(model, byDt);
  }
  let c = byDt.get(dt);
  if (!c) {
    c = new StepCache(model, dt);
    byDt.set(dt, c);
  }
  return c;
}

function advance(step: { Phi: Mat; Gamma: Vec }, x: Vec): Vec {
  return matvec(step.Phi, x).map((v, i) => v + step.Gamma[i]!);
}

function guardValue(g: Guard, x: Vec): number {
  return g.c.reduce((s, c, i) => s + c * x[i]!, g.d);
}

/** Time within (0, h] at which the guard first reaches zero, by bisection on the exact solution. */
function locate(iv: Interval, x: Vec, g: Guard, h: number): number {
  let lo = 0;
  let hi = h;
  for (let k = 0; k < 64 && hi - lo > 1e-13 * h; k++) {
    const mid = 0.5 * (lo + hi);
    if (guardValue(g, advance(affineStep(iv.A, iv.b, mid), x)) > 0) lo = mid;
    else hi = mid;
  }
  return hi;
}

interface Cursor {
  iv: string;
  x: Vec;
  t: number;
}

function integrate(
  model: Model,
  cache: StepCache,
  cur: Cursor,
  t1: number,
  dt: number,
  run: CycleRun,
  record: boolean,
): void {
  const eps = 1e-12 * model.Ts;
  let guardEvents = 0;
  while (t1 - cur.t > eps) {
    const iv = model.intervals[cur.iv];
    if (!iv) throw new Error(`${model.topology}: unknown interval "${cur.iv}"`);
    const nextGrid = (Math.floor(cur.t / dt + 1e-7) + 1) * dt;
    const tEnd = Math.min(nextGrid, t1);
    const h = tEnd - cur.t;
    const step = Math.abs(h - dt) <= 1e-9 * dt ? cache.full(cur.iv) : affineStep(iv.A, iv.b, h);
    const xn = advance(step, cur.x);
    let first: { tau: number; g: Guard } | null = null;
    for (const g of iv.guards) {
      if (guardValue(g, cur.x) > 0 && guardValue(g, xn) <= 0) {
        const tau = locate(iv, cur.x, g, h);
        const xe = advance(affineStep(iv.A, iv.b, tau), cur.x);
        if (g.when && !g.when(xe)) continue;
        if (!first || tau < first.tau) first = { tau, g };
      }
    }
    if (first) {
      if (++guardEvents > 1000) throw new Error(`${model.topology}: too many events in one cycle (chattering)`);
      const xe = advance(affineStep(iv.A, iv.b, first.tau), cur.x);
      run.durations[cur.iv] = (run.durations[cur.iv] ?? 0) + first.tau;
      track(run, xe);
      if (record) run.samples.push({ t: cur.t + first.tau, interval: cur.iv, x: xe });
      const xr = first.g.reset ? first.g.reset(xe) : xe;
      run.events.push({ t: cur.t + first.tau, from: cur.iv, to: first.g.next });
      cur.t += first.tau;
      cur.iv = first.g.next;
      cur.x = xr;
      if (record) run.samples.push({ t: cur.t, interval: cur.iv, x: xr });
      continue;
    }
    run.durations[cur.iv] = (run.durations[cur.iv] ?? 0) + h;
    cur.x = xn;
    cur.t = tEnd;
    track(run, xn);
    if (record) run.samples.push({ t: cur.t, interval: cur.iv, x: xn });
  }
}

function track(run: CycleRun, x: Vec): void {
  for (let i = 0; i < x.length; i++) run.maxAbs[i] = Math.max(run.maxAbs[i]!, Math.abs(x[i]!));
}

/** Simulate one switching period from the state x0 at the gate turn-on edge. */
export function runCycle(model: Model, x0: Vec, opts: RunOptions = {}): CycleRun {
  const N = opts.stepsPerPeriod ?? 2000;
  const record = opts.record ?? false;
  const dt = model.Ts / N;
  const cache = cacheFor(model, dt);
  const run: CycleRun = {
    x: x0,
    samples: [],
    maxAbs: x0.map((v) => Math.abs(v)),
    durations: {},
    events: [],
    edgeLoss: 0,
  };
  const on = model.turnOn(x0);
  run.edgeLoss += on.loss ?? 0;
  const cur: Cursor = { iv: on.interval, x: on.x, t: 0 };
  if (record) run.samples.push({ t: 0, interval: cur.iv, x: cur.x });
  track(run, cur.x);
  integrate(model, cache, cur, model.D * model.Ts, dt, run, record);
  const off = model.turnOff(cur.x);
  run.edgeLoss += off.loss ?? 0;
  if (record) {
    run.samples.push({ t: cur.t, interval: off.interval, x: off.x });
  }
  run.events.push({ t: cur.t, from: cur.iv, to: off.interval });
  cur.iv = off.interval;
  cur.x = off.x;
  track(run, cur.x);
  integrate(model, cache, cur, model.Ts, dt, run, record);
  run.x = cur.x;
  return run;
}

export interface SteadyOptions extends RunOptions {
  /** Largest change of any state between consecutive cycles, relative to its peak magnitude. */
  tol?: number;
  maxCycles?: number;
}

export interface SteadyResult {
  /** State at the start of the periodic cycle. */
  x0: Vec;
  /** Cycles simulated in total (Newton evaluations included). */
  cycles: number;
  converged: boolean;
  /** Final cycle-to-cycle change, relative (the convergence measure). */
  residual: number;
  /** The recorded steady-state cycle. */
  run: CycleRun;
}

function relativeChange(x: Vec, r: CycleRun): number {
  let worst = 0;
  for (let j = 0; j < x.length; j++) {
    const scale = Math.max(r.maxAbs[j]!, 1e-12);
    worst = Math.max(worst, Math.abs(r.x[j]! - x[j]!) / scale);
  }
  return worst;
}

/** Periodic steady state from an initial guess (Newton shooting, then plain cycles to confirm). */
export function steadyState(model: Model, x0: Vec, opts: SteadyOptions = {}): SteadyResult {
  const tol = opts.tol ?? 1e-6;
  const maxCycles = opts.maxCycles ?? 2000;
  const runOpts: RunOptions = { stepsPerPeriod: opts.stepsPerPeriod };
  let cycles = 0;
  const map = (x: Vec): CycleRun => {
    cycles++;
    return runCycle(model, x, runOpts);
  };
  const n = x0.length;
  let x = x0.slice();
  let r = map(x);
  let res = relativeChange(x, r);
  for (let it = 0; it < 40 && res >= tol && cycles + n + 1 < maxCycles; it++) {
    const f = r.x.map((v, i) => v - x[i]!);
    const J = zeros(n);
    for (let j = 0; j < n; j++) {
      const h = 1e-7 * Math.max(Math.abs(x[j]!), r.maxAbs[j]!, 1e-9);
      const xp = x.slice();
      xp[j]! += h;
      const rp = map(xp);
      for (let i = 0; i < n; i++) J[i]![j] = (rp.x[i]! - r.x[i]!) / h;
    }
    let delta: Vec;
    try {
      delta = solveVec(
        addScaled(J, identity(n), -1),
        f.map((v) => -v),
      );
    } catch {
      break;
    }
    let accepted = false;
    for (let lambda = 1; lambda > 1e-3 && cycles < maxCycles; lambda /= 2) {
      const xt = x.map((v, i) => v + lambda * delta[i]!);
      const rt = map(xt);
      const rest = relativeChange(xt, rt);
      if (rest < res) {
        x = xt;
        r = rt;
        res = rest;
        accepted = true;
        break;
      }
    }
    if (!accepted) break;
  }
  // Plain cycles: the spec's convergence test (and the fallback when Newton stalls).
  while (res >= tol && cycles < maxCycles) {
    const xn = r.x;
    const rn = map(xn);
    res = relativeChange(xn, rn);
    x = xn;
    r = rn;
  }
  const run = runCycle(model, x, { ...runOpts, record: true });
  return { x0: x, cycles, converged: res < tol, residual: res, run };
}

export interface TransientResult {
  /** Start-of-cycle states, one per cycle (length nCycles + 1). */
  states: Vec[];
  /** Start time of every cycle (s). */
  t: number[];
  /** The last cycle, recorded. */
  last: CycleRun;
}

/**
 * Transient run over many cycles, for sources whose parameters change from
 * cycle to cycle (e.g. a slow envelope): `modelAt(t)` returns the model for
 * the cycle that starts at time t.
 */
export function runTransient(
  modelAt: (t: number) => Model,
  x0: Vec,
  nCycles: number,
  opts: RunOptions = {},
): TransientResult {
  const states: Vec[] = [x0.slice()];
  const t: number[] = [0];
  let x = x0.slice();
  let time = 0;
  let last: CycleRun | null = null;
  for (let k = 0; k < nCycles; k++) {
    const m = modelAt(time);
    last = runCycle(m, x, { stepsPerPeriod: opts.stepsPerPeriod, record: k === nCycles - 1 && (opts.record ?? true) });
    x = last.x;
    time += m.Ts;
    states.push(x.slice());
    t.push(time);
  }
  if (!last) throw new Error('runTransient: nCycles must be at least 1');
  return { states, t, last };
}
