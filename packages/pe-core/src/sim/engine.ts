/**
 * Piecewise-linear time-domain simulator (docs/BUILD_SPEC.md §4).
 *
 * A converter is a set of linear intervals, each with dx/dt = A x + b: the
 * switch on, the switch off with the diode conducting, the idle interval of
 * DCM, and so on. Within an interval the state is advanced by the exact
 * solution over fixed sub-steps (Phi = expm(A dt), precomputed per interval,
 * dt = T_s / 2000 by default). Gate edges fall at t = 0 and t = D T_s;
 * other events (a diode current reaching zero, a clamp starting to conduct)
 * are guards, linear functions of the state, located on the exact solution
 * inside the sub-step where they change sign. State changes at edges and
 * events are affine assignments, x_k := c·x + d.
 *
 * Within a cycle the simulator advances the deviation y = x - x0 from the
 * cycle's start state x0, which obeys dy/dt = A y + (A x0 + b). The rounding
 * errors of a sub-step then scale with how far the state has moved in the
 * cycle, not with its size, and the change over the cycle comes out exact to
 * rounding: a slow state (a very large capacitor) whose change per cycle
 * lies far below its own rounding level is still resolved.
 *
 * The periodic steady state is found by Newton shooting on the cycle map.
 * Its Jacobian J is exact: the product of the sub-step matrices Phi, of the
 * assignments' matrices and, at every event whose time depends on the state,
 * of the saltation matrix that accounts for that dependence. The engine
 * accumulates J - I rather than J (with Phi - I computed directly), so that
 * a slow state, whose Phi rounds to 1, keeps its decay. It is confirmed
 * by two tests, each below `tol` (default 1e-6), within at most `maxCycles`
 * cycles (default 2000). The spec's criterion: the largest change of any
 * state between two consecutive cycles, relative to how far that state moves
 * within the cycle (its total variation). A change relative to the state's
 * peak would not do: a state that grows without bound (a fixed output fed in
 * CCM from a fixed input has no steady state) passes it once it is large
 * enough. And the distance to the fixed point that the Newton step
 * estimates, relative to the state's size: a slow state changes little per
 * cycle even far from its steady state.
 */

import { addScaled, affineStep, identity, matmul, matvec, norm1, solveVec, stepMatrices, type Mat, type Vec } from './linalg';

/** An affine assignment at an edge or an event: x[state] := c·x + d (c and d from the state before the change). */
export interface Assign {
  state: number;
  c: Vec;
  d: number;
}

export interface Guard {
  /** The interval ends when c·x + d, positive at the start of a sub-step, reaches zero or below. */
  c: Vec;
  d: number;
  /** Interval entered at the event. */
  next: string;
  /** Only fire when this holds at the event (e.g. a diode turns on only for a forward current). */
  when?: (x: Vec) => boolean;
  /** State changes at the event, e.g. set a current to exactly zero. */
  reset?: Assign[];
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
  /** State changes at the edge. */
  set?: Assign[];
  /** Energy dissipated by an instantaneous state change at the edge (J), e.g. a discharged node capacitance. */
  loss?: number;
}

export interface Model {
  topology: string;
  stateNames: string[];
  /**
   * Each state's natural size in the circuit (a voltage it is given; the
   * current that voltage builds in a period). A change or a Newton step
   * within a few units in the last place of it is rounding, and a state at
   * rest is measured against it. Zero when absent.
   */
  scales?: Vec;
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
  /** Change of the state over the cycle (exact to rounding, unlike x minus the start state). */
  dx: Vec;
  /** Samples at every sub-step and at both sides of every event (only when recorded). */
  samples: Sample[];
  /** Largest |x_j| during the cycle, per state. */
  maxAbs: Vec;
  /** Total variation of each state during the cycle: the sum of |change| over every sub-step, event and reset. */
  variation: Vec;
  /** Time spent in each interval (s). */
  durations: Record<string, number>;
  events: { t: number; from: string; to: string }[];
  /** Energy dissipated by instantaneous resets at the edges during the cycle (J). */
  edgeLoss: number;
  /** Jacobian of the end state with respect to the start state, minus the identity (only when requested; exact to rounding, also for slow states). */
  jacMinusI?: Mat;
}

export interface RunOptions {
  stepsPerPeriod?: number;
  record?: boolean;
  /** Also compute the exact Jacobian of the cycle map. */
  jacobian?: boolean;
}

interface StepMats {
  Phi: Mat;
  W: Mat;
  /** Phi - I = A W, without the cancellation of Phi - I. */
  Psi: Mat;
}

function stepMats(A: Mat, h: number): StepMats {
  const { Phi, W } = stepMatrices(A, h);
  return { Phi, W, Psi: matmul(A, W) };
}

class StepCache {
  private readonly cache = new Map<string, StepMats>();
  constructor(
    private readonly model: Model,
    private readonly dt: number,
  ) {}
  full(name: string): StepMats {
    let s = this.cache.get(name);
    if (!s) {
      s = stepMats(this.model.intervals[name]!.A, this.dt);
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

function dot(a: Vec, b: Vec): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i]! * b[i]!;
  return s;
}

function advance(step: { Phi: Mat; Gamma: Vec }, y: Vec): Vec {
  return matvec(step.Phi, y).map((v, i) => v + step.Gamma[i]!);
}

/**
 * The cycle in the deviation y = x - x0 from its start state: each interval
 * becomes dy/dt = A y + b0 with b0 = A x0 + b, a guard c·x + d becomes
 * c·y + (c·x0 + d), and an assignment x_k := c·x + d becomes
 * y_k := c·y + (c·x0 + d - x0_k).
 */
class Shifted {
  private readonly b0 = new Map<string, Vec>();
  private readonly gamma = new Map<string, Vec>();
  constructor(
    readonly model: Model,
    readonly x0: Vec,
    private readonly cache: StepCache,
  ) {}
  interval(name: string): Interval {
    const iv = this.model.intervals[name];
    if (!iv) throw new Error(`${this.model.topology}: unknown interval "${name}"`);
    return iv;
  }
  /** A x0 + b: the interval's input in the deviation. */
  input(name: string): Vec {
    let b = this.b0.get(name);
    if (!b) {
      const iv = this.interval(name);
      b = matvec(iv.A, this.x0).map((v, i) => v + iv.b[i]!);
      this.b0.set(name, b);
    }
    return b;
  }
  /** The exact step over a full sub-step. */
  full(name: string): { Phi: Mat; Gamma: Vec; Psi: Mat } {
    const s = this.cache.full(name);
    let g = this.gamma.get(name);
    if (!g) {
      g = matvec(s.W, this.input(name));
      this.gamma.set(name, g);
    }
    return { Phi: s.Phi, Gamma: g, Psi: s.Psi };
  }
  /** The exact step over a time h (with Phi - I when the Jacobian is wanted). */
  step(name: string, h: number, withPsi = false): { Phi: Mat; Gamma: Vec; Psi?: Mat } {
    if (!withPsi) return affineStep(this.interval(name).A, this.input(name), h);
    const s = stepMats(this.interval(name).A, h);
    return { Phi: s.Phi, Gamma: matvec(s.W, this.input(name)), Psi: s.Psi };
  }
  guard(g: Guard, y: Vec): number {
    return dot(g.c, y) + (dot(g.c, this.x0) + g.d);
  }
  state(y: Vec): Vec {
    return y.map((v, i) => this.x0[i]! + v);
  }
  assign(y: Vec, set: Assign[] | undefined): Vec {
    if (!set || set.length === 0) return y;
    const out = y.slice();
    for (const a of set) out[a.state] = dot(a.c, y) + (dot(a.c, this.x0) + a.d - this.x0[a.state]!);
    return out;
  }
}

/** The state after the assignments (all computed from the state before them). */
export function applyAssign(x: Vec, set: Assign[] | undefined): Vec {
  if (!set || set.length === 0) return x;
  const y = x.slice();
  for (const a of set) y[a.state] = dot(a.c, x) + a.d;
  return y;
}

/** Jacobian of the assignments: the identity with each assigned row replaced by its c. */
function assignJacobian(n: number, set: Assign[] | undefined): Mat {
  const R = identity(n);
  for (const a of set ?? []) R[a.state] = a.c.slice();
  return R;
}

/** The assignments' Jacobian minus the identity: zero except the assigned rows, c - e_k. */
function assignJacobianMinusI(n: number, set: Assign[] | undefined): Mat {
  const R = identity(n).map((row) => row.map(() => 0));
  for (const a of set ?? []) R[a.state] = a.c.map((v, j) => v - (j === a.state ? 1 : 0));
  return R;
}

/**
 * The exact solution of dy/dt = A y + b at time tau from y: a Taylor series
 * when the dynamics are slow over tau (cheap: matrix-vector products only),
 * otherwise the matrix exponential.
 */
function flow(A: Mat, b: Vec, y: Vec, tau: number): Vec {
  if (norm1(A) * tau > 0.5) return advance(affineStep(A, b, tau), y);
  // y(tau) = y + sum_{k>=1} tau^k/k! A^(k-1) (A y + b)
  let term = matvec(A, y).map((v, i) => (v + b[i]!) * tau);
  const out = y.map((v, i) => v + term[i]!);
  for (let k = 2; k < 40; k++) {
    term = matvec(A, term).map((v) => (v * tau) / k);
    let big = 0;
    let small = 0;
    for (let i = 0; i < out.length; i++) {
      out[i]! += term[i]!;
      big = Math.max(big, Math.abs(out[i]!));
      small = Math.max(small, Math.abs(term[i]!));
    }
    if (small <= 1e-17 * big) break;
  }
  return out;
}

/**
 * Time within (0, h] at which the guard first reaches zero, on the exact
 * solution: the Illinois variant of regula falsi, which keeps the root
 * bracketed like bisection and converges superlinearly (a few evaluations
 * instead of the sixty-odd that bisection needs to reach the same resolution).
 */
function locate(sh: Shifted, name: string, y: Vec, g: Guard, h: number, gh: number): number {
  const iv = sh.interval(name);
  const b = sh.input(name);
  let lo = 0;
  let hi = h;
  let glo = sh.guard(g, y);
  let ghi = gh;
  let side = 0;
  for (let k = 0; k < 100 && hi - lo > 1e-13 * h; k++) {
    let tau = (lo * ghi - hi * glo) / (ghi - glo);
    if (!(tau > lo && tau < hi)) tau = 0.5 * (lo + hi);
    const gt = sh.guard(g, flow(iv.A, b, y, tau));
    if (gt > 0) {
      lo = tau;
      glo = gt;
      if (side === 1) ghi /= 2;
      side = 1;
    } else {
      hi = tau;
      ghi = gt;
      if (side === -1) glo /= 2;
      side = -1;
      if (gt === 0) break;
    }
  }
  return hi;
}

interface Cursor {
  iv: string;
  /** Deviation of the state from the cycle's start state. */
  y: Vec;
  t: number;
  /** Jacobian of the current state with respect to the cycle's start state, minus the identity. */
  N?: Mat;
}

interface Tracker {
  run: CycleRun;
  /** Last tracked deviation (for the variation). */
  last: Vec;
}

function track(tr: Tracker, sh: Shifted, y: Vec): void {
  const { run } = tr;
  for (let i = 0; i < y.length; i++) {
    run.maxAbs[i] = Math.max(run.maxAbs[i]!, Math.abs(sh.x0[i]! + y[i]!));
    run.variation[i]! += Math.abs(y[i]! - tr.last[i]!);
  }
  tr.last = y;
}

function integrate(sh: Shifted, cur: Cursor, t1: number, dt: number, tr: Tracker, record: boolean): void {
  const { model } = sh;
  const { run } = tr;
  const eps = 1e-12 * model.Ts;
  let guardEvents = 0;
  while (t1 - cur.t > eps) {
    const iv = sh.interval(cur.iv);
    const nextGrid = (Math.floor(cur.t / dt + 1e-7) + 1) * dt;
    const tEnd = Math.min(nextGrid, t1);
    const h = tEnd - cur.t;
    const step = Math.abs(h - dt) <= 1e-9 * dt ? sh.full(cur.iv) : sh.step(cur.iv, h, !!cur.N);
    const yn = advance(step, cur.y);
    let first: { tau: number; g: Guard } | null = null;
    for (const g of iv.guards) {
      const gEnd = sh.guard(g, yn);
      if (sh.guard(g, cur.y) > 0 && gEnd <= 0) {
        const tau = locate(sh, cur.iv, cur.y, g, h, gEnd);
        if (first && tau >= first.tau) continue;
        if (g.when && !g.when(sh.state(flow(iv.A, sh.input(cur.iv), cur.y, tau)))) continue;
        first = { tau, g };
      }
    }
    // A guard that crossed zero before that event and turned back by the step's end is still below zero
    // at the event (a node capacitance's rise passing the diode's turn-on voltage just before its current
    // ends at the peak): it came first.
    while (first) {
      const at = flow(iv.A, sh.input(cur.iv), cur.y, first.tau);
      let earlier: { tau: number; g: Guard } | null = null;
      for (const g of iv.guards) {
        if (g === first.g) continue;
        const gAt = sh.guard(g, at);
        if (!(sh.guard(g, cur.y) > 0 && gAt <= 0)) continue;
        const tau = locate(sh, cur.iv, cur.y, g, first.tau, gAt);
        if (tau >= first.tau || (earlier && tau >= earlier.tau)) continue;
        if (g.when && !g.when(sh.state(flow(iv.A, sh.input(cur.iv), cur.y, tau)))) continue;
        earlier = { tau, g };
      }
      if (!earlier) break;
      first = earlier;
    }
    if (first) {
      if (++guardEvents > 1000) throw new Error(`${model.topology}: too many events in one cycle (chattering)`);
      const toEvent = sh.step(cur.iv, first.tau, !!cur.N);
      const ye = advance(toEvent, cur.y);
      run.durations[cur.iv] = (run.durations[cur.iv] ?? 0) + first.tau;
      track(tr, sh, ye);
      if (record) run.samples.push({ t: cur.t + first.tau, interval: cur.iv, x: sh.state(ye) });
      const yr = sh.assign(ye, first.g.reset);
      track(tr, sh, yr);
      const next = sh.interval(first.g.next);
      if (cur.N) {
        // Saltation: the event time depends on the state, S = R + (f+ - R f-) c^T / (c·f-).
        // With M = I + N and Phi = I + Psi: S Phi M - I = (S - I) + S Psi + S Phi N.
        const n = ye.length;
        const R = assignJacobian(n, first.g.reset);
        const SmI = assignJacobianMinusI(n, first.g.reset);
        const fm = matvec(iv.A, ye).map((v, i) => v + sh.input(cur.iv)[i]!);
        const fp = matvec(next.A, yr).map((v, i) => v + sh.input(first!.g.next)[i]!);
        const Rfm = matvec(R, fm);
        const denom = dot(first.g.c, fm);
        if (Math.abs(denom) > 1e-300) {
          for (let i = 0; i < n; i++) {
            const w = (fp[i]! - Rfm[i]!) / denom;
            for (let j = 0; j < n; j++) SmI[i]![j]! += w * first.g.c[j]!;
          }
        }
        const S = addScaled(SmI, identity(n));
        cur.N = addScaled(addScaled(SmI, matmul(S, toEvent.Psi!)), matmul(S, matmul(toEvent.Phi, cur.N)));
      }
      run.events.push({ t: cur.t + first.tau, from: cur.iv, to: first.g.next });
      cur.t += first.tau;
      cur.iv = first.g.next;
      cur.y = yr;
      if (record) run.samples.push({ t: cur.t, interval: cur.iv, x: sh.state(yr) });
      continue;
    }
    run.durations[cur.iv] = (run.durations[cur.iv] ?? 0) + h;
    if (cur.N) cur.N = addScaled(step.Psi!, matmul(step.Phi, cur.N));
    cur.y = yn;
    cur.t = tEnd;
    track(tr, sh, yn);
    if (record) run.samples.push({ t: cur.t, interval: cur.iv, x: sh.state(yn) });
  }
}

/** Simulate one switching period from the state x0 at the gate turn-on edge. */
export function runCycle(model: Model, x0: Vec, opts: RunOptions = {}): CycleRun {
  const N = opts.stepsPerPeriod ?? 2000;
  const record = opts.record ?? false;
  const dt = model.Ts / N;
  const sh = new Shifted(model, x0, cacheFor(model, dt));
  const n = x0.length;
  const run: CycleRun = {
    x: x0,
    dx: x0.map(() => 0),
    samples: [],
    maxAbs: x0.map((v) => Math.abs(v)),
    variation: x0.map(() => 0),
    durations: {},
    events: [],
    edgeLoss: 0,
  };
  const tr: Tracker = { run, last: x0.map(() => 0) };
  const on = model.turnOn(x0);
  run.edgeLoss += on.loss ?? 0;
  const cur: Cursor = { iv: on.interval, y: sh.assign(tr.last, on.set), t: 0 };
  if (opts.jacobian) cur.N = assignJacobianMinusI(n, on.set);
  if (record) run.samples.push({ t: 0, interval: cur.iv, x: sh.state(cur.y) });
  track(tr, sh, cur.y);
  integrate(sh, cur, model.D * model.Ts, dt, tr, record);
  const off = model.turnOff(sh.state(cur.y));
  run.edgeLoss += off.loss ?? 0;
  const yoff = sh.assign(cur.y, off.set);
  if (cur.N) cur.N = addScaled(assignJacobianMinusI(n, off.set), matmul(assignJacobian(n, off.set), cur.N));
  if (record) run.samples.push({ t: cur.t, interval: off.interval, x: sh.state(yoff) });
  run.events.push({ t: cur.t, from: cur.iv, to: off.interval });
  cur.iv = off.interval;
  cur.y = yoff;
  track(tr, sh, cur.y);
  integrate(sh, cur, model.Ts, dt, tr, record);
  run.dx = cur.y;
  run.x = sh.state(cur.y);
  if (cur.N) run.jacMinusI = cur.N;
  return run;
}

export interface SteadyOptions extends RunOptions {
  /**
   * Tolerance of both convergence tests: the largest change of any state
   * between consecutive cycles, relative to its total variation within the
   * cycle, and the remaining Newton step, relative to the state's size.
   */
  tol?: number;
  maxCycles?: number;
  /**
   * Stop early when a state changes by the same amount cycle after cycle (a
   * pure drift: there is no steady state to find, e.g. a fixed output fed
   * in CCM whose volt-seconds do not balance).
   */
  stopOnDrift?: boolean;
}

export interface SteadyResult {
  /** State at the start of the periodic cycle. */
  x0: Vec;
  /** Cycles simulated in total (Newton evaluations included). */
  cycles: number;
  converged: boolean;
  /** The larger of the two convergence measures (below tol when converged; the first alone when the second was not evaluated). */
  residual: number;
  /** The recorded steady-state cycle. */
  run: CycleRun;
}

/** Rounding level of a state relative to its magnitude, the floor of its scale in the line search. */
const ROUNDING = 1e-12;

/** A change within a few units in the last place of a state's magnitude is no change. */
const ULPS = 8 * Number.EPSILON;

/**
 * A change or a step below this is no change at all: far below any physical
 * quantity in SI units, and above the subnormal rounding a state resting at
 * zero may carry (a node capacitance's voltage of -2e-321 V, whose tiny
 * variation would otherwise make a change of 3e-322 V look large).
 */
const TINY = 1e-250;

/**
 * A change or a step within this many units in the last place of a state's
 * natural size (Model.scales) is rounding: a state resting at zero picks up
 * the rounding of the voltages that drive it (a current of 1e-20 A, a
 * voltage of 1e-16 V, where the circuit's voltages are tens of volts).
 */
const NOISE = 64 * Number.EPSILON;

/** The floor under which a state's change or Newton step is no change: TINY, or rounding of its natural size. */
function floorOf(model: Model, j: number): number {
  return Math.max(TINY, NOISE * (model.scales?.[j] ?? 0));
}

/**
 * Convergence measure (the spec's criterion): the largest change of a state
 * over one cycle, relative to that state's total variation within the cycle.
 * A state that grows by the same amount every cycle never passes: its change
 * is its whole variation, however large it has grown. A change within a few
 * units in the last place of the state's magnitude, or of its natural size,
 * is ignored: a state that does not move within the cycle has only rounding
 * as its variation.
 */
function relativeChange(model: Model, r: CycleRun): number {
  let worst = 0;
  for (let j = 0; j < r.dx.length; j++) {
    const change = Math.abs(r.dx[j]!);
    if (change <= Math.max(ULPS * r.maxAbs[j]!, floorOf(model, j))) continue;
    const v = r.variation[j]!;
    worst = Math.max(worst, v > 0 ? change / v : Infinity);
  }
  return worst;
}

/**
 * A state that changes by the same amount in two consecutive cycles (to
 * 1e-9), by at least a thousandth of its movement within the cycle: the map
 * only shifts it, and no steady state exists.
 */
function drifting(model: Model, r: CycleRun, prevDx: Vec): boolean {
  for (let j = 0; j < r.dx.length; j++) {
    const d = r.dx[j]!;
    if (Math.abs(d) <= floorOf(model, j) || Math.abs(d) < 1e-3 * r.variation[j]!) continue;
    if (Math.abs(d - prevDx[j]!) <= 1e-9 * Math.abs(d)) return true;
  }
  return false;
}

/**
 * The Newton step to the fixed point of the cycle map, from a run with its
 * Jacobian: (J - I) delta = -(F(x) - x).
 *
 * A state whose row and column of J - I are zero (to rounding) neither moves
 * the others nor is moved by them, and any value of it comes back to itself:
 * a capacitor alone that no more charge reaches, or the inductor current of a
 * fixed output at exactly the duty ratio that balances it. Its fixed points
 * form a range, so it takes no step, and the others' step is solved without
 * it. Whether it changes at all is for the first convergence test to say.
 */
function newtonStep(r: CycleRun): Vec | null {
  const A = r.jacMinusI!;
  const n = A.length;
  let scale = 0;
  for (const row of A) for (const v of row) scale = Math.max(scale, Math.abs(v));
  const zero = (v: number) => Math.abs(v) <= 64 * Number.EPSILON * scale;
  const keep: number[] = [];
  for (let j = 0; j < n; j++) if (!A[j]!.every(zero) || !A.every((row) => zero(row[j]!))) keep.push(j);
  const step = new Array<number>(n).fill(0);
  if (keep.length === 0) return step;
  try {
    const delta = solveVec(
      keep.map((i) => keep.map((j) => A[i]![j]!)),
      keep.map((i) => -r.dx[i]!),
    );
    if (!delta.every((v) => Number.isFinite(v))) return null;
    keep.forEach((i, k) => (step[i] = delta[k]!));
    return step;
  } catch {
    return null;
  }
}

/**
 * Second convergence measure: the distance to the fixed point that the
 * Newton step estimates, relative to each state's size (at least its
 * natural size in the circuit: a state at rest has no size of its own). A
 * slow state (a very large capacitor) changes by little per cycle even when
 * it is still far from its steady state, so the first measure can pass
 * early; the Newton step, which divides that change by the state's decay
 * per cycle, does not.
 */
function distance(model: Model, delta: Vec | null, r: CycleRun): number {
  if (!delta) return Infinity;
  let worst = 0;
  for (let j = 0; j < delta.length; j++) {
    const d = Math.abs(delta[j]!);
    if (d <= floorOf(model, j)) continue;
    const size = Math.max(r.maxAbs[j]!, r.variation[j]!, model.scales?.[j] ?? 0);
    worst = Math.max(worst, size > 0 ? d / size : Infinity);
  }
  return worst;
}

/**
 * Periodic steady state from an initial guess: Newton shooting with the
 * exact Jacobian, and plain cycles when Newton stalls. Converged when both
 * measures are below tol.
 */
export function steadyState(model: Model, x0: Vec, opts: SteadyOptions = {}): SteadyResult {
  const tol = opts.tol ?? 1e-6;
  const maxCycles = opts.maxCycles ?? 2000;
  const runOpts: RunOptions = { stepsPerPeriod: opts.stepsPerPeriod };
  let cycles = 0;
  const map = (x: Vec, jacobian = false): CycleRun => {
    cycles++;
    return runCycle(model, x, { ...runOpts, jacobian });
  };
  const n = x0.length;
  let x = x0.slice();
  let r = map(x, true);
  let res = relativeChange(model, r);
  let step = newtonStep(r);
  let dist = distance(model, step, r);
  const done = () => res < tol && dist < tol;
  // Scale of a state for the line search: how far it moves within a cycle
  // (or, if it barely moves, the rounding level of its magnitude).
  const scaleOf = (run: CycleRun, j: number) => Math.max(run.variation[j]!, ROUNDING * run.maxAbs[j]!, ROUNDING * (model.scales?.[j] ?? 0), Number.MIN_VALUE);
  const newton = () => {
    for (let it = 0; it < 40 && !done() && step && cycles < maxCycles; it++) {
      const f = r.dx;
      // Trust region: a step may move a state by at most ten times its size
      // in the base cycle. A map that only shifts a state (no steady state)
      // has a Jacobian of 1 and asks for an enormous step.
      let shrink = 1;
      for (let j = 0; j < n; j++) {
        const limit = 10 * Math.max(Math.abs(x[j]!), r.maxAbs[j]!, r.variation[j]!, 1e-9);
        if (Math.abs(step[j]!) > limit) shrink = Math.min(shrink, limit / Math.abs(step[j]!));
      }
      const delta = step.map((v) => v * shrink);
      // a step that moves nothing (every state left out of the reduced
      // system, a pure drift) cannot lower the residual: no trials
      if (delta.every((v) => v === 0)) return;
      // Line search on the squared residual, each state scaled by how far it
      // moves within the cycle. A trial may move more than the base cycle
      // (a rectifier that starts conducting), so each state takes the larger
      // of its two scales; the base merit uses the same scales. The decrease
      // asked for is proportional to the fraction of the Newton step taken
      // (the trust region may have shortened it a lot). Near the fixed point
      // both merits are rounding noise, so a trial that passes both
      // convergence tests is taken as it is.
      const base = x.map((_, j) => scaleOf(r, j));
      let accepted = false;
      for (let lambda = 1; lambda > 1e-3 && cycles < maxCycles; lambda /= 2) {
        const xt = x.map((v, i) => v + lambda * delta[i]!);
        const rt = map(xt, true);
        let m0 = 0;
        let mt = 0;
        for (let j = 0; j < n; j++) {
          const s = Math.max(base[j]!, scaleOf(rt, j));
          m0 += (f[j]! / s) ** 2;
          mt += (rt.dx[j]! / s) ** 2;
        }
        const resT = relativeChange(model, rt);
        const stepT = newtonStep(rt);
        const distT = distance(model, stepT, rt);
        if (mt < (1 - 1e-4 * lambda * shrink) * m0 || (resT < tol && distT < tol)) {
          x = xt;
          r = rt;
          res = resT;
          step = stepT;
          dist = distT;
          accepted = true;
          break;
        }
      }
      if (!accepted) return;
    }
  };
  newton();
  // Plain cycles: the spec's convergence test, and the fallback when Newton
  // stalls. Once they pass it, one cycle with the Jacobian checks the
  // distance to the fixed point, and Newton resumes from there if a slow
  // state is still off; Newton is also retried every fifty plain cycles.
  let plain = 0;
  let prevDx: Vec | null = null;
  while (!done() && cycles < maxCycles) {
    const xn = r.x;
    r = map(xn);
    x = xn;
    res = relativeChange(model, r);
    dist = NaN; // not evaluated
    if (opts.stopOnDrift && prevDx && drifting(model, r, prevDx)) break;
    prevDx = r.dx;
    if ((res < tol || ++plain % 50 === 0) && cycles < maxCycles) {
      r = map(x, true);
      step = newtonStep(r);
      dist = distance(model, step, r);
      newton();
    }
  }
  const run = runCycle(model, x, { ...runOpts, record: true });
  return { x0: x, cycles, converged: done(), residual: Number.isNaN(dist) ? res : Math.max(res, dist), run };
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
