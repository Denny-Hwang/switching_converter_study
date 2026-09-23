/**
 * Source matching (docs/BUILD_SPEC.md section 5, SourceMatcher): a linear
 * source, V_oc behind R_s, feeding a DCM flyback with a fixed duty ratio that
 * charges a fixed output.
 *
 * While the flyback stays in DCM its input is a loss-free resistor R_in
 * (lfr.R_in): the source sees a resistor, the bus sits at the divider
 * voltage (lfr.Vg), and the converter takes the fraction lfr.eta of the
 * available power (src.Pmax) whatever the source amplitude. Once that
 * divider voltage would exceed the critical input voltage (flyback.V_crit),
 * the flyback enters CCM, which holds the bus there: the converter becomes a
 * constant-voltage sink (src.cv_extraction), whose share of the available
 * power changes with the amplitude.
 *
 * A higher power through the same R_in needs a higher bus voltage
 * (lfr.Vg_power), which the switch blocks on top of the reflected output
 * voltage (flyback.Vds_off): the switch's rating caps the power.
 *
 * envelopeRun() simulates the flyback over a slowly varying source amplitude
 * (a sinusoidal envelope or points), cycle by cycle, with the simulator.
 */

import { evaluate } from './equations';
import { invert } from './invert';
import { buildModel, runCycle, type SimParams } from './sim';

export interface MatchSpec {
  /** Source open-circuit voltage (V) and resistance (ohm). */
  Voc: number;
  Rs: number;
  /** Flyback: magnetizing inductance (H), switching frequency (Hz), duty ratio. */
  LM: number;
  fs: number;
  D: number;
  /** Fixed output voltage, output-diode drop (V) and turns ratio N_s/N_p. */
  V: number;
  VD: number;
  n: number;
  /** Voltage rating of the switch (V). */
  Vrating: number;
}

export type SinkMode = 'LFR' | 'CV';

export interface MatchPoint {
  Voc: number;
  mode: SinkMode;
  /** Bus voltage (V), power into the converter (W), available power (W), extracted fraction. */
  Vg: number;
  P: number;
  Pmax: number;
  eta: number;
  /** Switch voltage while the output diode conducts (V). */
  Vds: number;
}

export interface MatchResult {
  spec: MatchSpec;
  Rin: number;
  Vgcrit: number;
  /** Source amplitude at which the divider voltage reaches V_g,crit. */
  VocCrit: number;
  /** Extracted fraction while the flyback is a loss-free resistor. */
  etaLfr: number;
  VOR: number;
  point: MatchPoint;
  /** Operating points against the source amplitude. */
  sweep: MatchPoint[];
  /** Largest power the loss-free resistor can draw before the switch voltage reaches the rating (0 if none). */
  Pswitch: number;
  /** Switch voltage against the power drawn through R_in. */
  switchCurve: { P: number[]; Vds: number[] };
}

/** The operating point at the source amplitude Voc. */
export function matchPoint(s: MatchSpec, Voc: number, Rin: number, Vgcrit: number): MatchPoint {
  const Pmax = evaluate('src.Pmax', { V_oc: Voc, R_s: s.Rs });
  const lfrVg = evaluate('lfr.Vg', { V_oc: Voc, R_s: s.Rs, R_in: Rin });
  const lfr = lfrVg < Vgcrit;
  const Vg = lfr ? lfrVg : Vgcrit;
  const eta = lfr ? evaluate('lfr.eta', { R_s: s.Rs, R_in: Rin }) : evaluate('src.cv_extraction', { V_c: Vgcrit, V_oc: Voc });
  return {
    Voc,
    mode: lfr ? 'LFR' : 'CV',
    Vg,
    P: eta * Pmax,
    Pmax,
    eta,
    Vds: evaluate('flyback.Vds_off', { V_g: Vg, V: s.V, V_D: s.VD, n: s.n }),
  };
}

const logspace = (a: number, b: number, n: number) => Array.from({ length: n }, (_, k) => a * (b / a) ** (k / (n - 1)));

export function matchSource(s: MatchSpec): MatchResult {
  const Rin = evaluate('lfr.R_in', { L_M: s.LM, f_s: s.fs, D: s.D });
  const Vgcrit = evaluate('flyback.V_crit', { V: s.V, V_D: s.VD, D: s.D, n: s.n });
  // the amplitude whose divider voltage is V_g,crit (lfr.Vg solved for V_oc)
  const VocCrit = invert('lfr.Vg', 'V_oc', Vgcrit, { R_s: s.Rs, R_in: Rin }, Vgcrit, Vgcrit * (1 + s.Rs / Rin) * 2);
  const VOR = evaluate('flyback.V_OR', { V: s.V, V_D: s.VD, n: s.n });
  const lo = Math.min(s.Voc, VocCrit) / 5;
  const hi = Math.max(s.Voc, VocCrit) * 5;
  const sweep = logspace(lo, hi, 81).map((v) => matchPoint(s, v, Rin, Vgcrit));
  // the switch caps the bus voltage at the rating minus the reflected voltage (flyback.Vds_off solved for V_g),
  // and the power a loss-free resistor draws there (dcm.P_in)
  let Pswitch = 0;
  if (s.Vrating > VOR) {
    const VgMax = invert('flyback.Vds_off', 'V_g', s.Vrating, { V: s.V, V_D: s.VD, n: s.n }, 0, s.Vrating);
    Pswitch = evaluate('dcm.P_in', { V_g: VgMax, D: s.D, L_M: s.LM, f_s: s.fs });
  }
  const Ptop = Math.max(Pswitch, ...sweep.map((p) => p.P)) * 2;
  const P = logspace(Ptop / 1e4, Ptop, 81);
  const Vds = P.map((p) =>
    evaluate('flyback.Vds_off', { V_g: evaluate('lfr.Vg_power', { P: p, R_in: Rin }), V: s.V, V_D: s.VD, n: s.n }),
  );
  return {
    spec: s,
    Rin,
    Vgcrit,
    VocCrit,
    etaLfr: evaluate('lfr.eta', { R_s: s.Rs, R_in: Rin }),
    VOR,
    point: matchPoint(s, s.Voc, Rin, Vgcrit),
    sweep,
    Pswitch,
    switchCurve: { P, Vds },
  };
}

/** The source amplitude over time, as a fraction of the peak amplitude V_oc. */
export type Envelope =
  | { kind: 'sine'; f: number } // |sin(2 pi f t)|: a rectified sinusoid, period 1/(2f)
  | { kind: 'points'; t: number[]; v: number[] }; // piecewise linear through (t, v), repeated with the period t_last

/** Period of the envelope (s). */
export function envelopePeriod(e: Envelope): number {
  return e.kind === 'sine' ? 1 / (2 * e.f) : e.t[e.t.length - 1]!;
}

/** The envelope's value (0..1) at time t. */
export function envelopeAt(e: Envelope, t: number): number {
  if (e.kind === 'sine') return Math.abs(Math.sin(2 * Math.PI * e.f * t));
  const T = envelopePeriod(e);
  const u = ((t % T) + T) % T;
  for (let k = 1; k < e.t.length; k++) {
    if (u <= e.t[k]!) {
      const t0 = e.t[k - 1]!;
      const w = e.t[k]! > t0 ? (u - t0) / (e.t[k]! - t0) : 1;
      return e.v[k - 1]! + w * (e.v[k]! - e.v[k - 1]!);
    }
  }
  return e.v[e.v.length - 1]!;
}

export interface EnvelopeRun {
  /** Start time of every simulated cycle of the reported envelope period (s), from the start of that period. */
  t: number[];
  Voc: number[];
  /** Bus voltage averaged over each cycle (V). */
  Vbus: number[];
  /** Power the source delivers to the bus, averaged over each cycle (W), and the power it could deliver (W). */
  P: number[];
  Pmax: number[];
  /** Extracted energy over the reported envelope period as a fraction of the available energy. */
  eta: number;
  /** Cycles simulated before the reported period, for the bus to settle. */
  settle: number;
}

/** Time constants R_s C_bus simulated before the reported period (the start's trace falls below e^-7 < 1e-3). */
export const ENVELOPE_SETTLE = 7;
/** Most switching cycles one envelope run simulates (a few seconds in a browser). */
export const ENVELOPE_MAX_CYCLES = 100000;

/**
 * Switching cycles an envelope run needs: the bus settling (`settle` time
 * constants R_s C_bus), then one envelope period.
 */
export function envelopeCycles(
  s: MatchSpec,
  Cbus: number,
  e: Envelope,
  settle = ENVELOPE_SETTLE,
): { settle: number; period: number; total: number } {
  const Ts = 1 / s.fs;
  const period = Math.max(1, Math.round(envelopePeriod(e) / Ts));
  const before = Math.ceil((settle * s.Rs * Cbus) / Ts);
  return { settle: before, period, total: before + period };
}

/**
 * The flyback over a varying source amplitude: the simulator's source-driven
 * flyback, one cycle at a time, each cycle with the source amplitude at its
 * start. It starts from an empty bus ENVELOPE_SETTLE time constants R_s C_bus
 * before an envelope period (the slowest time constant of the bus: with the
 * loss-free resistor in parallel it is shorter), and reports that period,
 * with the bus voltage and the power averaged over each cycle. The power into
 * the bus node is the constant-voltage-sink power at the bus voltage
 * (src.cv_extraction times src.Pmax), averaged over the cycle's samples.
 *
 * The source amplitude enters the model only through its input vector b (the
 * bus row), linearly: b(V_oc) = b(0) + V_oc (b(1) - b(0)). One model therefore
 * serves every cycle with b updated, and the step matrices, which depend on A
 * alone, are computed once.
 */
export function envelopeRun(
  s: MatchSpec,
  Cbus: number,
  e: Envelope,
  opts: { stepsPerPeriod?: number; maxCycles?: number; settle?: number } = {},
): EnvelopeRun {
  const Ts = 1 / s.fs;
  const cycles = envelopeCycles(s, Cbus, e, opts.settle);
  const maxCycles = opts.maxCycles ?? ENVELOPE_MAX_CYCLES;
  if (cycles.total > maxCycles) {
    throw new Error(
      `envelopeRun: ${cycles.total} switching cycles needed (${cycles.settle} for the bus to settle, ` +
        `${cycles.period} for one envelope period), more than ${maxCycles}`,
    );
  }
  // The steps are exact and the events located between sub-steps, so the sub-steps only set the
  // samples of the cycle averages: 50 per cycle keep them within 1e-5 of 800.
  const steps = opts.stepsPerPeriod ?? 50;
  const base: SimParams = {
    topology: 'flyback',
    Vg: 0,
    D: s.D,
    fs: s.fs,
    n: s.n,
    L: s.LM,
    VF: s.VD,
    load: { kind: 'fixed', V: s.V },
    source: { Voc: 0, Rs: s.Rs, Cbus },
  };
  const model = buildModel(base);
  const unit = buildModel({ ...base, source: { Voc: 1, Rs: s.Rs, Cbus } });
  const b0: Record<string, number[]> = {};
  const bv: Record<string, number[]> = {};
  for (const [name, iv] of Object.entries(model.intervals)) {
    const u = unit.intervals[name]!;
    if (u.A.some((row, i) => row.some((a, j) => a !== iv.A[i]![j]))) {
      throw new Error(`envelopeRun: the source amplitude changes the matrix A of interval ${name}`);
    }
    b0[name] = iv.b.slice();
    bv[name] = u.b.map((v, i) => v - iv.b[i]!);
  }
  const setVoc = (voc: number) => {
    for (const [name, iv] of Object.entries(model.intervals)) iv.b = b0[name]!.map((v, i) => v + voc * bv[name]![i]!);
  };
  const jb = model.stateNames.indexOf('vbus');
  const Voc = (t: number) => s.Voc * envelopeAt(e, t);
  const sinkPower = (vbus: number, voc: number) =>
    voc > 0 ? evaluate('src.cv_extraction', { V_c: vbus, V_oc: voc }) * evaluate('src.Pmax', { V_oc: voc, R_s: s.Rs }) : 0;
  const out: EnvelopeRun = { t: [], Voc: [], Vbus: [], P: [], Pmax: [], eta: 0, settle: cycles.settle };
  let x = model.stateNames.map(() => 0);
  let got = 0;
  let avail = 0;
  // cycle k starts at t = k T_s of the envelope; the reported period is k = 0 .. period - 1
  for (let k = -cycles.settle; k < cycles.period; k++) {
    const t = k * Ts;
    const voc = Voc(t);
    setVoc(voc);
    const report = k >= 0;
    const run = runCycle(model, x, { stepsPerPeriod: steps, record: report });
    x = run.x;
    if (!report) continue;
    // averages over the cycle (trapezoids between the recorded samples)
    let vb = 0;
    let p = 0;
    const smp = run.samples;
    for (let j = 1; j < smp.length; j++) {
      const h = smp[j]!.t - smp[j - 1]!.t;
      if (h <= 0) continue;
      const a = smp[j - 1]!.x[jb]!;
      const b = smp[j]!.x[jb]!;
      vb += (h * (a + b)) / 2;
      p += (h * (sinkPower(a, voc) + sinkPower(b, voc))) / 2;
    }
    const Pmax = voc > 0 ? evaluate('src.Pmax', { V_oc: voc, R_s: s.Rs }) : 0;
    out.t.push(t);
    out.Voc.push(voc);
    out.Vbus.push(vb / Ts);
    out.P.push(p / Ts);
    out.Pmax.push(Pmax);
    got += p / Ts;
    avail += Pmax;
  }
  out.eta = avail > 0 ? got / avail : 0;
  return out;
}
