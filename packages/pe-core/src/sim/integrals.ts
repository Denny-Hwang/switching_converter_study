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
 * depend on the sub-steps: a transient faster than a sub-step (a time
 * constant far shorter than one) is integrated as exactly as a slow one. The
 * samples remain what the page draws.
 *
 * Every mode of the circuit decays or rings, and the sub-steps resolve every
 * ring (analysis.ts, stepsFor), so within a segment the slope can turn more
 * than once only while a mode much faster than the segment decays from its
 * start. The slope is therefore also checked at h/2, h/4, … down to that
 * mode's time scale, and every sign change between two checkpoints is
 * searched. A sign change of a slope so small that the output moves by less
 * than a trillionth of its range between the two checkpoints is rounding (an
 * output that is a difference of larger ones, such as a conducting diode's
 * voltage, flat but for its last bits) and is not searched.
 */

import type { CycleRun, Model } from './engine';
import { eigenvalues, expm, matmul, matvec, norm1, zeros, type Mat, type Vec } from './linalg';

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
    for (const k of Object.keys(y0)) {
      if (!(Math.abs(yp[k]! - dot(c[k]!, z)) <= 1e-9 * size + 1e-300)) throw new Error(`${model.topology}: output ${k} is not affine in interval ${iv}`);
    }
    forms[iv] = c;
  }
  return forms;
}

/** Φ = e^{F h} and ∫_0^h e^{F s} ds, from the exponential of [[F, I], [0, 0]] h. */
export function linearIntegral(F: Mat, h: number): { Phi: Mat; Int: Mat } {
  const m = F.length;
  const M = zeros(2 * m);
  for (let i = 0; i < m; i++) {
    for (let j = 0; j < m; j++) M[i]![j] = F[i]![j]! * h;
    M[i]![m + i] = h;
  }
  const E = expm(M);
  return { Phi: E.slice(0, m).map((r) => r.slice(0, m)), Int: E.slice(0, m).map((r) => r.slice(m)) };
}

/**
 * W = ∫_0^h e^{Fᵀ s} Q e^{F s} ds. Van Loan's block exponential,
 * exp([[-Fᵀ, Q], [0, F]] τ) = [[·, E12], [0, E22]] with W(τ) = E22ᵀ E12,
 * holds e^{-Fᵀ τ}, which grows without bound for a stiff F; so it is taken
 * over τ = h/2^k, short enough that it stays near one, and doubled k times:
 * W(2τ) = W(τ) + Φ(τ)ᵀ W(τ) Φ(τ), Φ(2τ) = Φ(τ)².
 */
export function quadraticIntegral(F: Mat, Q: Mat, h: number): Mat {
  const m = F.length;
  const size = norm1(F) * h;
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
  const E = expm(M);
  let Phi = E.slice(m).map((r) => r.slice(m));
  const E12 = E.slice(0, m).map((r) => r.slice(m));
  const transpose = (X: Mat) => X[0]!.map((_, j) => X.map((r) => r[j]!));
  let W = matmul(transpose(Phi), E12);
  for (let r = 0; r < k; r++) {
    const PtWP = matmul(transpose(Phi), matmul(W, Phi));
    W = W.map((row, i) => row.map((v, j) => v + PtWP[i]![j]!));
    Phi = matmul(Phi, Phi);
  }
  return W;
}

/**
 * Where y = c·z peaks inside a stretch of length h from z0 whose slope
 * s(τ) = c·F e^{F τ} z0 changes sign between its ends (s0 at τ = 0): the
 * root of the slope, by Newton steps kept inside the bracket (bisection when
 * one would leave it), and y there.
 */
function interiorPeak(F: Mat, c: Vec, z0: Vec, h: number, s0: number): number {
  const cF = F[0]!.map((_, j) => F.reduce((s, row, i) => s + c[i]! * row[j]!, 0));
  const cF2 = F[0]!.map((_, j) => F.reduce((s, row, i) => s + cF[i]! * row[j]!, 0));
  let lo = 0;
  let hi = h;
  let sLo = s0;
  let tau = 0.5 * h;
  for (let it = 0; it < 80; it++) {
    const z = matvec(expm(F.map((r) => r.map((v) => v * tau))), z0);
    const s = dot(cF, z);
    if (s === 0 || hi - lo <= 1e-13 * h) return dot(c, z);
    if (Math.sign(s) === Math.sign(sLo)) {
      lo = tau;
      sLo = s;
    } else hi = tau;
    const ds = dot(cF2, z);
    const next = ds !== 0 ? tau - s / ds : NaN;
    tau = next > lo && next < hi && Math.abs(next - tau) < 0.5 * (hi - lo) ? next : 0.5 * (lo + hi);
    if (Math.abs(s) <= 1e-14 * Math.max(Math.abs(s0), 1e-300)) return dot(c, z);
  }
  return dot(c, matvec(expm(F.map((r) => r.map((v) => v * tau))), z0));
}

/** Taylor terms of z(τ) = e^{F τ} z0 kept where the fastest mode turns by at most a radian in τ. */
const TAYLOR_TERMS = 22;

/**
 * F^k z0 for k = 0 … TAYLOR_TERMS + 1: z(τ) = Σ τ^k/k! F^k z0, for a stretch
 * of length h. F^k z0 = [A^{k−1} (A x0 + b); 0] for k ≥ 1, so where the
 * fastest mode of A turns by at most a radian in h the terms fall like 1/k!.
 * Null unless the last terms of every state's series, and of its rate of
 * change, are below rounding against its largest term (a badly conditioned
 * A can hold them up): the exponentials then stand in.
 */
function taylorVectors(F: Mat, z0: Vec, h: number): Vec[] | null {
  const vs = [z0];
  for (let k = 1; k <= TAYLOR_TERMS + 1; k++) vs.push(matvec(F, vs[k - 1]!));
  const K = TAYLOR_TERMS;
  for (let i = 0; i + 1 < z0.length; i++) {
    // the value's series, Σ h^k/k! v_k, and the slope's, Σ h^k/k! v_{k+1}
    for (const shift of [0, 1]) {
      let big = 0;
      let w = 1;
      for (let k = 0; k + shift <= K + 1; k++) {
        if (k > 0) w *= h / k;
        if (k + shift > 0) big = Math.max(big, w * Math.abs(vs[k + shift]![i]!));
      }
      const tail = w * Math.abs(vs[K + 1]![i]!);
      if (!(tail <= 1e-16 * big)) return null;
    }
  }
  return vs;
}

/**
 * interiorPeak from the Taylor vectors of the stretch's start: y, its slope
 * and the slope's derivative are then polynomials in τ, y(τ) = Σ a_k τ^k/k!
 * with a_k = c·F^k z0, and no exponential is needed per step.
 */
function taylorPeak(c: Vec, vs: Vec[], h: number, s0: number): number {
  const a = vs.map((v) => dot(c, v));
  // Σ_k a_{k+from} τ^k/k! by Horner's rule
  const series = (from: number, tau: number) => {
    const K = a.length - 1 - from;
    let sum = a[K + from]!;
    for (let k = K - 1; k >= 0; k--) sum = a[k + from]! + (sum * tau) / (k + 1);
    return sum;
  };
  let lo = 0;
  let hi = h;
  let sLo = s0;
  let tau = 0.5 * h;
  for (let it = 0; it < 100; it++) {
    const s = series(1, tau);
    if (s === 0 || hi - lo <= 1e-13 * h || Math.abs(s) <= 1e-14 * Math.max(Math.abs(s0), 1e-300)) return series(0, tau);
    if (Math.sign(s) === Math.sign(sLo)) {
      lo = tau;
      sLo = s;
    } else hi = tau;
    const ds = series(2, tau);
    const next = ds !== 0 ? tau - s / ds : NaN;
    tau = next > lo && next < hi && Math.abs(next - tau) < 0.5 * (hi - lo) ? next : 0.5 * (lo + hi);
  }
  return series(0, tau);
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
 * times h above one) could turn the slope near the start; and e^{F τ} at
 * each.
 */
function checkpoints(F: Mat, speed: number, h: number): { tau: number; Phi: Mat }[] {
  const size = speed * h;
  const k = size > 1 ? Math.min(60, Math.ceil(Math.log2(size))) : 0;
  const out: { tau: number; Phi: Mat }[] = [];
  for (let j = k; j >= 0; j--) {
    const tau = h / 2 ** j;
    out.push({ tau, Phi: expm(F.map((r) => r.map((v) => v * tau))) });
  }
  return out;
}

/** An interval's outputs as rows: their indices among all outputs, their coefficients c, and c·F for their slopes. */
interface Rows {
  F: Mat;
  speed: number;
  out: number[];
  C: Vec[];
  CF: Vec[];
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

/**
 * ∫ y dt for every output, ∫ y_a y_b dt for the given pairs, and every
 * output's least and greatest value, over a recorded period. Each segment is
 * the span between two consecutive samples of the same interval (the
 * engine records every sub-step, and both sides of every event and edge).
 * ∫ z dt is summed per interval and the outputs' integrals follow from it,
 * since each output is c·z throughout an interval.
 */
export function periodIntegrals(model: Model, run: CycleRun, pairs: readonly (readonly [string, string])[] = []): PeriodIntegrals {
  const forms = outputForms(model);
  const m = model.stateNames.length + 1;
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
    const F = augmented(iv.A, iv.b);
    const ks = Object.keys(forms[name]!);
    const C = ks.map((k) => forms[name]![k]!);
    const CF = C.map((c) => {
      const r = new Array<number>(m).fill(0);
      for (let i = 0; i < m; i++) {
        const ci = c[i]!;
        if (ci === 0) continue;
        const Fi = F[i]!;
        for (let j = 0; j < m; j++) r[j]! += ci * Fi[j]!;
      }
      return r;
    });
    rows[name] = { F, speed: modeSpeed(iv.A), out: ks.map((k) => index.get(k)!), C, CF };
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
  const samples = run.samples;
  const zOf = samples.map((smp) => [...smp.x, 1]);
  for (let k = 0; k < samples.length; k++) see(rows[samples[k]!.interval]!, zOf[k]!);
  // each output's range over the samples, at least a billionth of the largest among the outputs of its kind
  // (voltages, currents): a slope that moves the output by less than a trillionth of it is rounding
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
  const linCache = new Map<string, Mat>();
  const quadCache = new Map<string, Mat>();
  const cpCache = new Map<string, { tau: number; Phi: Mat }[]>();
  // the slopes at a sample, kept for the segment that starts there
  let kept: { at: number; slopes: number[] } | null = null;
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
    const z1 = zOf[k + 1]!;
    const key = `${iv}|${h}`;
    let Int = linCache.get(key);
    if (!Int) {
      Int = linearIntegral(F, h).Int;
      linCache.set(key, Int);
    }
    const acc = zInt[iv]!;
    for (let i = 0; i < m; i++) acc[i]! += dotv(Int[i]!, z0);
    for (let p = 0; p < pairs.length; p++) {
      const ca = forms[iv]![pairs[p]![0]];
      const cb = forms[iv]![pairs[p]![1]];
      if (!ca || !cb) continue;
      const qk = `${key}|${p}`;
      let W = quadCache.get(qk);
      if (!W) {
        const Q = ca.map((u) => cb.map((v) => u * v));
        W = quadraticIntegral(F, Q, h);
        quadCache.set(qk, W);
      }
      quadSum[p]! += dotv(z0, mv(W, z0));
    }
    // extremes inside the segment: the slope c·F z changes sign between two checkpoints
    let cps = cpCache.get(key);
    if (!cps) {
      cps = checkpoints(F, r.speed, h);
      cpCache.set(key, cps);
    }
    const nc = cps.length;
    const zs: Vec[] = [z0];
    const taus = [0];
    for (let j = 0; j < nc; j++) {
      zs.push(j === nc - 1 ? z1 : mv(cps[j]!.Phi, z0));
      taus.push(cps[j]!.tau);
    }
    // the values at the checkpoints inside the segment are on the solution too
    for (let j = 1; j < nc; j++) see(r, zs[j]!);
    const slopes = zs.map((z, j) => (j === 0 && kept && kept.at === k ? kept.slopes : mv(r.CF, z)));
    kept = { at: k + 1, slopes: slopes[nc]! };
    const taylor: (Vec[] | null | undefined)[] = [];
    for (let q = 0; q < r.out.length; q++) {
      const out = r.out[q]!;
      for (let j = 0; j < nc; j++) {
        const a = slopes[j]![q]!;
        const b = slopes[j + 1]![q]!;
        if (!((a > 0 && b < 0) || (a < 0 && b > 0))) continue;
        const len = taus[j + 1]! - taus[j]!;
        if (Math.max(Math.abs(a), Math.abs(b)) * len <= 1e-12 * range[out]!) continue;
        // a stretch short against the dynamics: the Taylor series, shared by every output; else exponentials
        if (r.speed * len <= 1 && taylor[j] === undefined) taylor[j] = taylorVectors(F, zs[j]!, len);
        const vs = taylor[j];
        const y = vs ? taylorPeak(r.C[q]!, vs, len, a) : interiorPeak(F, r.C[q]!, zs[j]!, len, a);
        if (y < lo[out]!) lo[out] = y;
        if (y > hi[out]!) hi[out] = y;
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
  const quad: Record<string, number> = {};
  pairs.forEach(([a, b], p) => (quad[`${a}*${b}`] = (quad[`${a}*${b}`] ?? 0) + quadSum[p]!));
  return { lin, quad, min, max };
}
