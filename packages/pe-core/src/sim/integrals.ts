/**
 * Exact integrals and extremes over a recorded period.
 *
 * Between two samples of the same interval the state follows dx/dt = A x + b
 * exactly. With z = [x; 1] and F = [[A, b], [0, 0]], z(t) = e^{F t} z(0), and
 * every output is an affine function of the state within an interval,
 * y = c·z. So over a segment of length h
 *
 *   ∫ y dt        = c · (∫_0^h e^{F s} ds) z(0),
 *   ∫ y_a y_b dt  = z(0) · (∫_0^h e^{Fᵀ s} c_a c_bᵀ e^{F s} ds) z(0),
 *
 * and y has an extreme inside the segment where its slope, c·F z(t), changes
 * sign. Averages, powers, mean squares and extremes computed this way do not
 * depend on the sub-steps: a transient faster than a sub-step is integrated,
 * not sampled. The samples remain what the page draws. The exponentials are
 * kept apart from the identity (e^{F τ} − I, linalg.ts expmMinusI), so that
 * a slow mode's small change keeps its digits however many squarings a fast
 * mode asks for; what rounding remains grows only with the number of
 * squarings, the logarithm of the ratio of a sub-step to the fastest time
 * constant.
 *
 * In each interval z holds the deviation from the first state the period
 * visits in it, [x − x_r; 1]: an output whose constant part dwarfs what
 * varies (a battery's current, (v − V_b)/R_b, with V_b/R_b a million times
 * its rms value) then keeps the digits the samples give it, since c·z is its
 * value at x_r, evaluated directly, plus the change; and x_r is a state of
 * that interval, so the constant part is one of the output's own values
 * there. The rate of change at x_r, A x_r + b, is summed in twice the
 * precision: its terms can be ten orders of magnitude larger than it.
 *
 * Every mode of the circuit decays or rings, and the sub-steps resolve every
 * ring (analysis.ts, stepsFor). Near the start of a segment a mode much
 * faster than it can still decay, so the slope is also checked at h/2, h/4,
 * … down to that mode's time scale, and every sign change between two
 * checkpoints is searched. Between two checkpoints the slope can also dip
 * through zero and back (a ring riding on a steeper ramp turns twice within
 * a sub-step); where the slope's own derivative shows it turning towards
 * zero, its turning point is found, and both turns are searched when the
 * slope changes sign there. A sign change of a slope within its own rounding
 * is noise and is not searched, and neither is one so small that the output
 * moves by less than a trillionth of its range, or by less than the rounding
 * of its own value at the sample (the stored state's rounding starts a fast
 * mode's transient no larger than that). The slope's rounding is a few units
 * in the last place of the terms the slope is summed from: at a segment's
 * start, the terms of c·(A x + b) at the sample's own state, whose digits a
 * fast mode amplifies; inside the segment and at its end (the start
 * propagated by e^{F h}, so that all its checkpoints lie on one solution),
 * the terms of c·F z at the deviation, which is where that slope is computed.
 */

import { OVERFLOW, type CycleRun, type Model } from './engine';
import { eigenvalues, expmMinusI, matmul, matvec, norm1, zeros, type Mat, type Vec } from './linalg';

export interface PeriodIntegrals {
  /** ∫ y dt over the recorded period, for every output. */
  lin: Record<string, number>;
  /** ∫ y_a y_b dt over the period, for each requested pair, keyed `a*b`. */
  quad: Record<string, number>;
  /** The least and greatest value of every output over the period: at the samples, and inside segments where it peaks. */
  min: Record<string, number>;
  max: Record<string, number>;
}

/** F = [[A, b], [0, 0]]: the interval's dynamics for z = [x; 1]. */
function augmented(A: Mat, b: Vec): Mat {
  const n = A.length;
  const F = zeros(n + 1);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) F[i]![j] = A[i]![j]!;
    F[i]![n] = b[i]!;
  }
  return F;
}

const dot = (a: Vec, b: Vec) => a.reduce((s, v, i) => s + v * b[i]!, 0);

/**
 * a·x + b, rounded as if summed in twice the precision (Ogita, Rump and
 * Oishi's Dot2, with Dekker's product and Knuth's sum): an interval's rate of
 * change at a state, whose terms can be ten orders of magnitude larger than
 * it (a battery's V_b/(R_b C) against the net current into its capacitor).
 * The plain sum where a term is too large to split.
 */
function rateAt(a: Vec, x: Vec, b: number): number {
  let s = b;
  let err = 0;
  for (let j = 0; j < a.length; j++) {
    const u = a[j]!;
    const v = x[j]!;
    const p = u * v;
    // Dekker's split of each factor into halves whose products are exact
    const cu = 134217729 * u;
    const uh = cu - (cu - u);
    const ul = u - uh;
    const cv = 134217729 * v;
    const vh = cv - (cv - v);
    const vl = v - vh;
    const pe = ul * vl - (((p - uh * vh) - ul * vh) - uh * vl);
    // Knuth's sum
    const t = s + p;
    const bb = t - s;
    const te = s - (t - bb) + (p - bb);
    s = t;
    err += pe + te;
  }
  const out = s + err;
  return Number.isFinite(out) ? out : dot(a, x) + b;
}

/**
 * Each output of each interval as c·[x; 1]: its coefficients from the
 * outputs at zero and at each unit vector, checked at one more state (the
 * models' outputs are affine within an interval).
 */
export function outputForms(model: Model): Record<string, Record<string, Vec>> {
  const n = model.stateNames.length;
  const forms: Record<string, Record<string, Vec>> = {};
  for (const iv of Object.keys(model.intervals)) {
    const zero = new Array<number>(n).fill(0);
    const y0 = model.outputs(zero, iv);
    const c: Record<string, Vec> = {};
    for (const k of Object.keys(y0)) {
      c[k] = new Array<number>(n + 1).fill(0);
      c[k]![n] = y0[k]!;
    }
    for (let j = 0; j < n; j++) {
      const e = zero.slice();
      e[j] = 1;
      const y = model.outputs(e, iv);
      for (const k of Object.keys(y0)) c[k]![j] = y[k]! - y0[k]!;
    }
    // one more state: an output that is not affine would be integrated wrongly. The tolerance is measured
    // against the outputs' size at that state: an output that is a difference of larger ones (the diode's
    // voltage, the switch voltage less the bus and the output) keeps their rounding
    const probe = zero.map((_, j) => 1.3 * (j + 1));
    const yp = model.outputs(probe, iv);
    const z = [...probe, 1];
    const size = Math.max(...Object.keys(y0).map((k) => Math.abs(yp[k]!)), ...Object.keys(y0).map((k) => c[k]!.reduce((s, v, j) => s + Math.abs(v * z[j]!), 0)));
    // coefficients or values that overflow (a resistance of 1e-308 ohm) are out of range, not a model error
    if (!Number.isFinite(size) || Object.values(c).some((v) => !v.every(Number.isFinite))) throw new Error(OVERFLOW);
    for (const k of Object.keys(y0)) {
      if (!(Math.abs(yp[k]! - dot(c[k]!, z)) <= 1e-9 * size + 1e-300)) throw new Error(`${model.topology}: output ${k} is not affine in interval ${iv}`);
    }
    forms[iv] = c;
  }
  return forms;
}

/**
 * Φ = e^{F h} and ∫_0^h e^{F s} ds, from the exponential of [[F, I], [0, 0]] h
 * less the identity (the integral is its off-diagonal block, which the
 * identity does not touch).
 */
export function linearIntegral(F: Mat, h: number): { Phi: Mat; Int: Mat } {
  const m = F.length;
  const M = zeros(2 * m);
  for (let i = 0; i < m; i++) {
    for (let j = 0; j < m; j++) M[i]![j] = F[i]![j]! * h;
    M[i]![m + i] = h;
  }
  const E = expmMinusI(M);
  return { Phi: E.slice(0, m).map((r, i) => r.slice(0, m).map((v, j) => (i === j ? v + 1 : v))), Int: E.slice(0, m).map((r) => r.slice(m)) };
}

/**
 * W = ∫_0^h e^{Fᵀ s} Q e^{F s} ds. Van Loan's block exponential,
 * exp([[-Fᵀ, Q], [0, F]] τ) = [[·, E12], [0, E22]] with W(τ) = E22ᵀ E12,
 * holds e^{-Fᵀ τ}, which grows without bound for a stiff F; so it is taken
 * over τ = h/2^k, short enough that it stays near one, and doubled k times:
 * W(2τ) = W(τ) + Φ(τ)ᵀ W(τ) Φ(τ), Φ(2τ) = Φ(τ)². The doubling carries
 * D = Φ − I rather than Φ, W(2τ) = 2W + DᵀW + W D + DᵀW D and
 * D(2τ) = 2D + D², for the reason expmMinusI does.
 */
export function quadraticIntegral(F: Mat, Q: Mat, h: number): Mat {
  const m = F.length;
  const size = norm1(F) * h;
  // a norm that overflows would ask for infinitely many doublings
  if (!Number.isFinite(size) || !Q.every((row) => row.every(Number.isFinite))) throw new Error(OVERFLOW);
  const k = size > 0.5 ? Math.ceil(Math.log2(size / 0.5)) : 0;
  const tau = h / 2 ** k;
  const M = zeros(2 * m);
  for (let i = 0; i < m; i++) {
    for (let j = 0; j < m; j++) {
      M[i]![j] = -F[j]![i]! * tau;
      M[i]![m + j] = Q[i]![j]! * tau;
      M[m + i]![m + j] = F[i]![j]! * tau;
    }
  }
  const E = expmMinusI(M);
  let D = E.slice(m).map((r) => r.slice(m));
  const E12 = E.slice(0, m).map((r) => r.slice(m));
  const transpose = (X: Mat) => X[0]!.map((_, j) => X.map((r) => r[j]!));
  // W(τ) = e^{Fᵀ τ} E12 = E12 + Dᵀ E12
  const DtE = matmul(transpose(D), E12);
  let W = E12.map((row, i) => row.map((v, j) => v + DtE[i]![j]!));
  for (let r = 0; r < k; r++) {
    const Dt = transpose(D);
    const WD = matmul(W, D);
    const DtW = matmul(Dt, W);
    const DtWD = matmul(Dt, WD);
    W = W.map((row, i) => row.map((v, j) => 2 * v + DtW[i]![j]! + WD[i]![j]! + DtWD[i]![j]!));
    const DD = matmul(D, D);
    D = D.map((row, i) => row.map((v, j) => 2 * v + DD[i]![j]!));
  }
  return W;
}

/** Taylor terms of z(τ) = e^{F τ} z0 kept where the fastest mode turns by at most a radian in τ. */
const TAYLOR_TERMS = 22;

/**
 * F^k z0 for k = 0 … TAYLOR_TERMS + 3: z(τ) = Σ τ^k/k! F^k z0, for a stretch
 * of length h. F^k z0 = [A^{k−1} (A x0 + b); 0] for k ≥ 1, so where the
 * fastest mode of A turns by at most a radian in h the terms fall like 1/k!.
 * Null unless the last terms of every state's series, of its rate of change
 * and of that rate's rate of change are below rounding against their
 * largest term (a badly conditioned A can hold them up): the exponentials
 * then stand in.
 */
function taylorVectors(F: Mat, z0: Vec, h: number): Vec[] | null {
  const L = TAYLOR_TERMS + 3;
  const vs = [z0];
  for (let k = 1; k <= L; k++) vs.push(matvec(F, vs[k - 1]!));
  for (let i = 0; i + 1 < z0.length; i++) {
    // the value's series, Σ h^k/k! v_k, the slope's, Σ h^k/k! v_{k+1}, and the slope's rate's, Σ h^k/k! v_{k+2}
    for (const shift of [0, 1, 2]) {
      let big = 0;
      let w = 1;
      for (let k = 0; k + shift <= L; k++) {
        if (k > 0) w *= h / k;
        if (k + shift > 0) big = Math.max(big, w * Math.abs(vs[k + shift]![i]!));
      }
      const tail = w * Math.abs(vs[L]![i]!);
      if (!(tail <= 1e-16 * big)) return null;
    }
  }
  return vs;
}

/**
 * The root of g inside (lo, hi), where g changes sign (g(lo) = gLo, of the
 * other sign at hi): Newton steps kept inside the bracket, bisection when one
 * would leave it or not halve it. `at` gives g(τ) and g′(τ). Stops where g
 * is exactly zero, below a hundred-trillionth of g0 (its value at the
 * stretch's start), or where the bracket is a ten-trillionth of the stretch.
 */
function bracketRoot(at: (tau: number) => [number, number], lo: number, hi: number, gLo: number, g0: number, len: number): number {
  let tau = 0.5 * (lo + hi);
  for (let it = 0; it < 100; it++) {
    const [g, dg] = at(tau);
    if (g === 0 || hi - lo <= 1e-13 * len || Math.abs(g) <= 1e-14 * Math.max(Math.abs(g0), 1e-300)) return tau;
    if (Math.sign(g) === Math.sign(gLo)) {
      lo = tau;
      gLo = g;
    } else hi = tau;
    const next = dg !== 0 ? tau - g / dg : NaN;
    tau = next > lo && next < hi && Math.abs(next - tau) < 0.5 * (hi - lo) ? next : 0.5 * (lo + hi);
  }
  return tau;
}

/**
 * An output and its derivatives along a stretch from z0: the k-th derivative
 * of y = c·z is c·F^k z(τ). Where the stretch is short against the dynamics,
 * from the Taylor vectors of its start (y(τ) = Σ a_k τ^k/k!, a_k = c·F^k z0,
 * by Horner's rule, no exponential per step); else from e^{F τ} z0.
 */
interface Along {
  /** The k-th derivative of the output at τ (k = 0, 1, 2, 3). */
  at(k: number, tau: number): number;
}
function taylorAlong(c: Vec, vs: Vec[]): Along {
  const a = vs.map((v) => dotv(c, v));
  return {
    at(k, tau) {
      const K = a.length - 1 - k;
      let sum = a[K + k]!;
      for (let i = K - 1; i >= 0; i--) sum = a[i + k]! + (sum * tau) / (i + 1);
      return sum;
    },
  };
}
function expAlong(F: Mat, c: Vec, z0: Vec): Along {
  // rows c F^k, and the last τ's state (a root and its value are asked for at the same τ)
  const rows: Vec[] = [c];
  const row = (k: number) => {
    while (rows.length <= k) {
      const r = rows[rows.length - 1]!;
      rows.push(F[0]!.map((_, j) => F.reduce((s, Fi, i) => s + r[i]! * Fi[j]!, 0)));
    }
    return rows[k]!;
  };
  let last: { tau: number; z: Vec } | null = null;
  return {
    at(k, tau) {
      if (!last || last.tau !== tau) last = { tau, z: propagate(expmMinusI(F.map((r) => r.map((v) => v * tau))), z0) };
      return dotv(row(k), last.z);
    },
  };
}

/** Where the k-th derivative of the output changes sign inside (lo, hi), from gLo at lo: its root, by bracketRoot. */
function rootAlong(y: Along, k: number, lo: number, hi: number, gLo: number, len: number): number {
  return bracketRoot((tau) => [y.at(k, tau), y.at(k + 1, tau)], lo, hi, gLo, gLo, len);
}

/**
 * How fast an interval's fastest mode moves, per second: the largest
 * eigenvalue magnitude of A (a ring's angular frequency, a decay's rate),
 * which the states' units do not change (unlike a norm of A, which 1/C of a
 * small node capacitance inflates). Where the QR iteration fails, the
 * Frobenius norm bounds it.
 */
function modeSpeed(A: Mat): number {
  try {
    return Math.max(0, ...eigenvalues(A).map((e) => Math.hypot(e.re, e.im)));
  } catch (e) {
    if (!(e instanceof Error && /did not converge/.test(e.message))) throw e;
    return Math.sqrt(A.reduce((s, row) => s + row.reduce((r, v) => r + v * v, 0), 0));
  }
}

/**
 * The instants at which a segment's slopes are checked, from its start: h
 * alone, or h/2^k, …, h/4, h/2, h when a mode much faster than h (speed
 * times h above one) could turn the slope near the start; and e^{F τ} − I at
 * each.
 */
function checkpoints(F: Mat, speed: number, h: number): { tau: number; E: Mat }[] {
  const size = speed * h;
  const k = size > 1 ? Math.min(60, Math.ceil(Math.log2(size))) : 0;
  const out: { tau: number; E: Mat }[] = [];
  for (let j = k; j >= 0; j--) {
    const tau = h / 2 ** j;
    out.push({ tau, E: expmMinusI(F.map((r) => r.map((v) => v * tau))) });
  }
  return out;
}

/** z(τ) = z0 + (e^{F τ} − I) z0. */
function propagate(E: Mat, z0: Vec): Vec {
  const dz = mv(E, z0);
  for (let i = 0; i < dz.length; i++) dz[i]! += z0[i]!;
  return dz;
}

/**
 * An interval's outputs as rows, in its deviation coordinates: their indices
 * among all outputs, their coefficients c, c·F for their slopes and c·F² for
 * the slopes' rates, and |c|·|F| and |c|·|F|² that bound the rounding of
 * those products; and the sums of |c_i A_ij| and of |c_i b_i| that bound the
 * slope's rounding at a sample.
 */
interface Rows {
  /** The interval's reference state, the first the period visits in it: z = [x − x_r; 1]. */
  xr: Vec;
  F: Mat;
  speed: number;
  out: number[];
  C: Vec[];
  /** Each output's constant term in the original coordinates, c_0 = y(0): with c·x, the terms of its value. */
  c0: number[];
  CF: Vec[];
  CF2: Vec[];
  absCF: Vec[];
  absCF2: Vec[];
  absCA: Vec[];
  absCb: number[];
  /** For each requested pair, the rows of its two outputs, or null where the interval lacks one. */
  pairRows: ([number, number] | null)[];
}

/** a·b, and M x, in plain loops: the period's inner loops run them for every output at every sample. */
function dotv(a: Vec, b: Vec): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i]! * b[i]!;
  return s;
}
function mv(M: Mat, x: Vec): Vec {
  const out = new Array<number>(M.length);
  for (let i = 0; i < M.length; i++) out[i] = dotv(M[i]!, x);
  return out;
}
/** r F: a row times a matrix. */
function rowTimes(r: Vec, F: Mat): Vec {
  const m = F.length;
  const out = new Array<number>(m).fill(0);
  for (let i = 0; i < m; i++) {
    const ri = r[i]!;
    if (ri === 0) continue;
    const Fi = F[i]!;
    for (let j = 0; j < m; j++) out[j]! += ri * Fi[j]!;
  }
  return out;
}

/** A slope within this many units in the last place of the terms it is summed from is noise. */
const SLOPE_ROUNDING = 64 * Number.EPSILON;

/**
 * The refusal periodIntegrals would give any recorded period of the model,
 * given before the steady-state search spends its periods on it: outputs
 * whose forms, or whose slopes' rates c A², overflow (a resistance of 1e300
 * ohm). These parts of c·F and c·F² do not depend on the reference state.
 */
export function checkRange(model: Model): void {
  const forms = outputForms(model);
  const n = model.stateNames.length;
  for (const [name, iv] of Object.entries(model.intervals)) {
    if (!Number.isFinite(norm1(iv.A))) throw new Error(OVERFLOW);
    for (const c of Object.values(forms[name]!)) {
      const cA = rowTimes(c.slice(0, n), iv.A);
      if (!cA.every(Number.isFinite) || !rowTimes(cA, iv.A).every(Number.isFinite)) throw new Error(OVERFLOW);
    }
  }
}

/** Options of periodIntegrals. */
export interface IntegralOptions {
  /** Counts the root searches for extremes inside segments (the tests check that rounding does not start them). */
  stats?: { searches: number };
}

/**
 * ∫ y dt for every output, ∫ y_a y_b dt for the given pairs, and every
 * output's least and greatest value, over a recorded period. Each segment is
 * the span between two consecutive samples of the same interval (the
 * engine records every sub-step, and both sides of every event and edge).
 * ∫ z dt is summed per interval and the outputs' integrals follow from it,
 * since each output is c·z throughout an interval. An output that an
 * interval visited in the period does not define is NaN, as are the pairs
 * that involve it.
 */
export function periodIntegrals(
  model: Model,
  run: CycleRun,
  pairs: readonly (readonly [string, string])[] = [],
  opts: IntegralOptions = {},
): PeriodIntegrals {
  const forms = outputForms(model);
  const n = model.stateNames.length;
  const m = n + 1;
  const samples = run.samples;
  // each interval's reference, the first state the period visits in it: a state that interval holds, so an output's
  // value there is one of its own (engine.ts integrates from the period's first state, which another interval's
  // formula can turn into a large value that its own values then cancel)
  const xrOf = new Map<string, Vec>();
  for (const smp of samples) if (!xrOf.has(smp.interval)) xrOf.set(smp.interval, smp.x.slice());
  const fallback = samples.length > 0 ? samples[0]!.x : new Array<number>(n).fill(0);
  const names: string[] = [];
  const index = new Map<string, number>();
  for (const f of Object.values(forms)) {
    for (const k of Object.keys(f)) {
      if (!index.has(k)) {
        index.set(k, names.length);
        names.push(k);
      }
    }
  }
  const N = names.length;
  const rows: Record<string, Rows> = {};
  for (const [name, iv] of Object.entries(model.intervals)) {
    const xr = xrOf.get(name) ?? fallback.slice();
    // dz/dt = F z with z = [x − x_r; 1]: the input is A x_r + b, the rate of change at x_r
    const F = augmented(
      iv.A,
      iv.A.map((row, i) => rateAt(row, xr, iv.b[i]!)),
    );
    const ks = Object.keys(forms[name]!);
    // each output at x_r directly (a battery's current as (v − V_b)/R_b, not as a sum of its large terms), and its
    // coefficients on the deviation
    const yr = model.outputs(xr, name);
    const C = ks.map((k) => {
      const out = forms[name]![k]!.slice();
      out[n] = yr[k]!;
      return out;
    });
    const CF = C.map((c) => rowTimes(c, F));
    const CF2 = CF.map((c) => rowTimes(c, F));
    const absF = F.map((row) => row.map(Math.abs));
    const absCF = C.map((c) => rowTimes(c.map(Math.abs), absF));
    const absCF2 = absCF.map((c) => rowTimes(c, absF));
    const absCA = ks.map((k) => {
      const c = forms[name]![k]!;
      return iv.A[0] ? iv.A[0].map((_, j) => iv.A.reduce((acc, row, i) => acc + Math.abs(c[i]! * row[j]!), 0)) : [];
    });
    const absCb = ks.map((k) => {
      const c = forms[name]![k]!;
      return iv.b.reduce((acc, v, i) => acc + Math.abs(c[i]! * v), 0);
    });
    // a circuit whose matrices or outputs overflow once shifted is out of range: its norms would ask the exponentials
    // for infinitely many squarings
    const big = C.reduce((mx, c) => c.reduce((m2, v) => Math.max(m2, Math.abs(v)), mx), 0);
    if (!Number.isFinite(norm1(F)) || !(big * big < Infinity) || !CF2.every((r) => r.every(Number.isFinite))) throw new Error(OVERFLOW);
    const pairRows = pairs.map(([pa, pb]): [number, number] | null => {
      const qa = ks.indexOf(pa);
      const qb = ks.indexOf(pb);
      return qa >= 0 && qb >= 0 ? [qa, qb] : null;
    });
    const c0 = ks.map((k) => forms[name]![k]![n]!);
    rows[name] = { xr, F, speed: modeSpeed(iv.A), out: ks.map((k) => index.get(k)!), C, c0, CF, CF2, absCF, absCF2, absCA, absCb, pairRows };
  }
  const lo = new Array<number>(N).fill(Infinity);
  const hi = new Array<number>(N).fill(-Infinity);
  const see = (r: Rows, z: Vec) => {
    for (let q = 0; q < r.out.length; q++) {
      const y = dotv(r.C[q]!, z);
      const k = r.out[q]!;
      if (y < lo[k]!) lo[k] = y;
      if (y > hi[k]!) hi[k] = y;
    }
  };
  const zOf = samples.map((smp) => {
    const r = rows[smp.interval]!;
    const z = smp.x.map((v, j) => v - r.xr[j]!);
    z.push(1);
    return z;
  });
  for (let k = 0; k < samples.length; k++) see(rows[samples[k]!.interval]!, zOf[k]!);
  // each output's range over the samples, at least a billionth of the largest among the outputs of its kind
  // (voltages, currents): a slope that moves the output by less than a trillionth of it is negligible
  const range = new Array<number>(N);
  const kindMax: Record<string, number> = {};
  for (let k = 0; k < N; k++) {
    range[k] = Math.max(Math.abs(lo[k]!), Math.abs(hi[k]!));
    const kind = names[k]![0]!;
    if (Number.isFinite(range[k])) kindMax[kind] = Math.max(kindMax[kind] ?? 0, range[k]!);
  }
  for (let k = 0; k < N; k++) range[k] = Math.max(range[k]!, 1e-9 * (kindMax[names[k]![0]!] ?? 0));

  const zInt: Record<string, number[]> = {};
  for (const name of Object.keys(rows)) zInt[name] = new Array<number>(m).fill(0);
  const quadSum = new Array<number>(pairs.length).fill(0);
  const missing = new Set<string>();
  const linCache = new Map<string, Mat>();
  const quadCache = new Map<string, Mat>();
  const cpCache = new Map<string, { tau: number; E: Mat }[]>();
  for (let k = 0; k + 1 < samples.length; k++) {
    const s0 = samples[k]!;
    const s1 = samples[k + 1]!;
    const h = s1.t - s0.t;
    if (!(h > 0)) continue;
    if (s0.interval !== s1.interval) throw new Error(`a segment of positive length spans intervals ${s0.interval} and ${s1.interval}`);
    const iv = s0.interval;
    const r = rows[iv]!;
    const F = r.F;
    const z0 = zOf[k]!;
    const key = `${iv}|${h}`;
    let Int = linCache.get(key);
    if (!Int) {
      Int = linearIntegral(F, h).Int;
      linCache.set(key, Int);
    }
    const acc = zInt[iv]!;
    for (let i = 0; i < m; i++) acc[i]! += dotv(Int[i]!, z0);
    if (r.out.length < N) for (const name of names) if (!(name in forms[iv]!)) missing.add(name);
    for (let p = 0; p < pairs.length; p++) {
      const pr = r.pairRows[p];
      if (!pr) {
        quadSum[p] = NaN;
        continue;
      }
      const qk = `${key}|${p}`;
      let W = quadCache.get(qk);
      if (!W) {
        const ca = r.C[pr[0]]!;
        const cb = r.C[pr[1]]!;
        const Q = ca.map((u) => cb.map((v) => u * v));
        W = quadraticIntegral(F, Q, h);
        quadCache.set(qk, W);
      }
      quadSum[p]! += dotv(z0, mv(W, z0));
    }
    // extremes inside the segment: the slope c·F z changes sign between two checkpoints, or dips through zero and back
    let cps = cpCache.get(key);
    if (!cps) {
      cps = checkpoints(F, r.speed, h);
      cpCache.set(key, cps);
    }
    const nc = cps.length;
    // the checkpoints, the end included, on the solution from the start (the next sample is that end, up to the
    // engine's rounding)
    const zs: Vec[] = [z0];
    const taus = [0];
    for (let j = 0; j < nc; j++) {
      zs.push(propagate(cps[j]!.E, z0));
      taus.push(cps[j]!.tau);
    }
    // the values at the checkpoints inside the segment are on the solution too
    for (let j = 1; j < nc; j++) see(r, zs[j]!);
    const slopes: number[][] = zs.map((z) => mv(r.CF, z));
    const rates: number[][] = zs.map((z) => mv(r.CF2, z));
    // the terms of a product with the deviation: |c|·|F|^k |z|, which bounds the rounding of c·F^k z computed as
    // (c·F^k)·z, the row's own rounding included
    const terms = (row: Vec, z: Vec) => {
      let sum = row[n]!;
      for (let i = 0; i < n; i++) sum += row[i]! * Math.abs(z[i]!);
      return sum;
    };
    // the slope's rounding at a checkpoint. At the start, its terms at the sample's own state as well: a fast mode
    // amplifies that state's rounding, which then decays or rings within the segment. Elsewhere, the terms of
    // c·F z at the deviation, from which the slope is computed
    const x0 = s0.x;
    const level = (q: number, j: number) => {
      const dev = terms(r.absCF[q]!, zs[j]!);
      if (j > 0) return dev;
      const a = r.absCA[q]!;
      let sum = r.absCb[q]!;
      for (let i = 0; i < n; i++) sum += a[i]! * Math.abs(x0[i]!);
      return Math.max(dev, sum);
    };
    // the rounding of a slope's rate, c·F² z, likewise: at the start, also its terms at the state itself
    const rateLevel = (q: number, j: number) => {
      const dev = terms(r.absCF2[q]!, zs[j]!);
      if (j > 0) return dev;
      const c = r.CF2[q]!;
      let sum = Math.abs(c[n]!);
      for (let i = 0; i < n; i++) sum += Math.abs(c[i]!) * (Math.abs(zs[0]![i]!) + Math.abs(x0[i]!));
      return Math.max(dev, sum);
    };
    const taylor: (Vec[] | null | undefined)[] = [];
    const along = (q: number, j: number, len: number): Along => {
      if (opts.stats) opts.stats.searches++;
      // a stretch short against the dynamics: the Taylor series, shared by every output; else exponentials
      if (r.speed * len <= 1 && taylor[j] === undefined) taylor[j] = taylorVectors(F, zs[j]!, len);
      const vs = r.speed * len <= 1 ? taylor[j] : null;
      return vs ? taylorAlong(r.C[q]!, vs) : expAlong(F, r.C[q]!, zs[j]!);
    };
    const note = (out: number, y: number) => {
      if (y < lo[out]!) lo[out] = y;
      if (y > hi[out]!) hi[out] = y;
    };
    // the rounding of the output's own value at the sample, the terms of c·x + c_0: the stored state's rounding
    // starts a fast mode's transient whose wiggle is no larger (a battery's current, resolved to eps V_b / R_b)
    const valueLevel = (q: number) => {
      const c = r.C[q]!;
      let sum = Math.abs(r.c0[q]!);
      for (let i = 0; i < n; i++) sum += Math.abs(c[i]! * x0[i]!);
      return sum;
    };
    // a slope that moves the output by less than a trillionth of its range over the stretch, or by less than the
    // rounding of its value, or that lies within its own rounding
    const noise = (q: number, j: number, len: number, s: number) =>
      Math.abs(s) * len <= Math.max(1e-12 * range[r.out[q]!]!, SLOPE_ROUNDING * valueLevel(q)) ||
      Math.abs(s) <= SLOPE_ROUNDING * Math.max(level(q, j), level(q, j + 1));
    for (let q = 0; q < r.out.length; q++) {
      const out = r.out[q]!;
      for (let j = 0; j < nc; j++) {
        const a = slopes[j]![q]!;
        const b = slopes[j + 1]![q]!;
        const len = taus[j + 1]! - taus[j]!;
        if ((a > 0 && b < 0) || (a < 0 && b > 0)) {
          if (noise(q, j, len, Math.max(Math.abs(a), Math.abs(b)))) continue;
          const y = along(q, j, len);
          note(out, y.at(0, rootAlong(y, 1, 0, len, a, len)));
          continue;
        }
        // the same sign at both ends: the slope may still dip through zero and back where it turns towards zero
        // (falling from a positive start, then rising again), if its rates are above their rounding and it could
        // reach zero at the rate it changes
        if (a === 0 || b === 0) continue;
        const ra = rates[j]![q]!;
        const rb = rates[j + 1]![q]!;
        if (!(Math.sign(ra) === -Math.sign(a) && Math.sign(rb) === Math.sign(a))) continue;
        // how far the slope can move within the stretch, at the rate it changes: too little to reach zero, or so
        // little that the output would move by no more than its rounding while the slope is past zero
        const reach = Math.max(Math.abs(ra), Math.abs(rb)) * len;
        if (Math.abs(a) + Math.abs(b) > 4 * reach || noise(q, j, len, reach)) continue;
        if (Math.abs(ra) <= SLOPE_ROUNDING * rateLevel(q, j) || Math.abs(rb) <= SLOPE_ROUNDING * rateLevel(q, j + 1)) continue;
        const y = along(q, j, len);
        const turn = rootAlong(y, 2, 0, len, ra, len);
        const sTurn = y.at(1, turn);
        if (!(Math.sign(sTurn) === -Math.sign(a)) || noise(q, j, len, sTurn)) continue;
        note(out, y.at(0, rootAlong(y, 1, 0, turn, a, len)));
        note(out, y.at(0, rootAlong(y, 1, turn, len, sTurn, len)));
      }
    }
  }
  const lin: Record<string, number> = {};
  const min: Record<string, number> = {};
  const max: Record<string, number> = {};
  for (let k = 0; k < N; k++) {
    lin[names[k]!] = 0;
    min[names[k]!] = lo[k]!;
    max[names[k]!] = hi[k]!;
  }
  for (const [iv, acc] of Object.entries(zInt)) {
    const r = rows[iv]!;
    for (let q = 0; q < r.out.length; q++) lin[names[r.out[q]!]!]! += dotv(r.C[q]!, acc);
  }
  for (const name of missing) {
    lin[name] = NaN;
    min[name] = NaN;
    max[name] = NaN;
  }
  const quad: Record<string, number> = {};
  pairs.forEach(([a, b], p) => (quad[`${a}*${b}`] = (quad[`${a}*${b}`] ?? 0) + quadSum[p]!));
  return { lin, quad, min, max };
}
