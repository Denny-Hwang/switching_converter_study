/**
 * The loss budget (docs/BUILD_SPEC.md section 5, LossBudget): the loss
 * buckets of a converter against the load and the switching frequency.
 *
 * The buckets are conduction, capacitive switching, gate drive, core and
 * diode, plus the leakage energy of a flyback. At each point the converter is
 * simulated with pe-core's time-domain simulator, its duty ratio adjusted
 * until the output is at its set value, and the catalogue's loss equations
 * are applied to the simulated currents and voltages:
 *
 *   conduction  loss.cond on the switch rms current (R_on) and the inductor
 *               rms current (R_L)
 *   capacitive  loss.sw.cap with the switch voltage just before turn-on
 *   gate        loss.gate
 *   core        loss.steinmetz with B_ac from mag.B_pk, times the volume
 *               (loss.core); the peak flux density B_pk (mag.B_pk at the
 *               peak current) is reported for a check against saturation
 *   diode       loss.diode on the diode's average and rms current
 *   clamp       flyback.leak.E and flyback.leak.P with the peak primary
 *               current (flyback only)
 *
 * R_on, R_L, V_F and C_node are also in the simulated circuit, so the
 * currents include their effect; r_d, the gate drive, the core and the
 * leakage inductance are not.
 */

import { evaluate } from './equations';
import { invert, InvertError } from './invert';
import { simulate, type Mode, type SimParams, type SimResult, type Topology } from './sim';

export interface CoreSpec {
  /** Turns of the winding whose inductance is L (L_M for the flyback). */
  N: number;
  /** Effective area (m^2) and volume (m^3). */
  Ae: number;
  Ve: number;
  /** Steinmetz coefficients (W/m^3 with f in Hz and B in T). */
  k: number;
  alpha: number;
  beta: number;
}

export interface LossSpec {
  topology: Topology;
  Vg: number;
  /** Output voltage set point (magnitude). */
  V: number;
  /** Full-load output power (W). */
  P: number;
  fs: number;
  /** Inductance (L_M for the flyback, the output inductor for the forward). */
  L: number;
  C: number;
  n?: number;
  nr?: number;
  /** Forward: magnetizing inductance. */
  LM?: number;
  Ron: number;
  Qg: number;
  Vgs: number;
  Cnode: number;
  VF: number;
  rd: number;
  RL: number;
  core?: CoreSpec;
  /** Flyback: leakage inductance referred to the primary. */
  Llk?: number;
}

export type Bucket = 'conduction' | 'capacitive' | 'gate' | 'core' | 'diode' | 'clamp';
export const BUCKETS: readonly Bucket[] = ['conduction', 'capacitive', 'gate', 'core', 'diode', 'clamp'];

export interface LossPoint {
  /** Load as a fraction of the full-load power. */
  load: number;
  fs: number;
  R: number;
  D: number;
  mode: Mode;
  converged: boolean;
  /** Whether the duty ratio brought the output to its set point (within 0.1 %). */
  regulated: boolean;
  /** Forward: the output stayed below its set point at the reset limit forward.reset.Dmax. */
  resetLimited: boolean;
  Vout: number;
  Pout: number;
  losses: Record<Bucket, number>;
  total: number;
  eta: number;
  /** The simulated quantities the loss equations were evaluated with. */
  inputs: { Isw_rms: number; IL_rms: number; ID_avg: number; ID_rms: number; Vsw_on: number; IL_pp: number; Ipk: number; Bac?: number; Bpk?: number };
  /** The simulator's own loss accounting (conduction, diode drop, capacitive), for comparison. */
  sim: SimResult['losses'];
}

export interface LossBudget {
  spec: LossSpec;
  /** Loads from a tenth to all of the full-load power, at f_s. */
  load: LossPoint[];
  /** Frequencies from a third to three times f_s, at full load. */
  freq: LossPoint[];
}

export const LOAD_FRACTIONS: readonly number[] = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1];
export const FREQ_FACTORS: readonly number[] = Array.from({ length: 9 }, (_, k) => 3 ** ((k - 4) / 4));

/** Average and rms value of a current over the simulated period: the simulator's exact integrals of the solution. */
function stats(r: SimResult, key: 'i_sw' | 'i_L' | 'i_D'): { avg: number; rms: number } {
  return { avg: r.avg[key]!, rms: Math.sqrt(Math.max(0, r.meanSquare[key]!)) };
}

function kcrit(topology: Topology, D: number, n: number): number {
  switch (topology) {
    case 'buck':
    case 'forward':
      return evaluate('Kcrit.buck', { D });
    case 'boost':
      return evaluate('Kcrit.boost', { D });
    case 'buckboost':
      return evaluate('Kcrit.buckboost', { D });
    case 'flyback':
      return evaluate('Kcrit.flyback', { D, n });
  }
}

/** Duty ratio of the ideal converter for the output at the load R (CCM or DCM by K against K_crit). */
export function idealDuty(s: LossSpec, R: number, fs: number): number {
  const n = s.n ?? 1;
  const Ts = evaluate('def.Ts', { f_s: fs });
  const out = s.topology === 'flyback' ? s.V + s.VF : s.V;
  const M = s.topology === 'buckboost' ? -out / s.Vg : s.topology === 'forward' ? out / (n * s.Vg) : out / s.Vg;
  const ccmEq = { buck: 'buck.ccm.M', forward: 'buck.ccm.M', boost: 'boost.ccm.M', buckboost: 'buckboost.ccm.M', flyback: 'flyback.ccm.M' }[s.topology];
  const ccmIn: Record<string, number> = s.topology === 'flyback' ? { n } : {};
  const Dccm = invert(ccmEq, 'D', M, ccmIn, 0, 1 - 1e-9);
  const K = evaluate('K.def', { L: s.L, R, T_s: Ts });
  if (K >= kcrit(s.topology, Dccm, n)) return Dccm;
  const dcmEq = { buck: 'buck.dcm.M', forward: 'buck.dcm.M', boost: 'boost.dcm.M', buckboost: 'buckboost.dcm.M', flyback: 'flyback.dcm.M' }[s.topology];
  try {
    return invert(dcmEq, 'D', M, { K }, 1e-6, Dccm);
  } catch (e) {
    if (e instanceof InvertError) return Dccm;
    throw e;
  }
}

function simParams(s: LossSpec, R: number, fs: number, D: number): SimParams {
  const p: SimParams = {
    topology: s.topology,
    Vg: s.Vg,
    D,
    fs,
    L: s.L,
    Ron: s.Ron,
    RL: s.RL,
    VF: s.VF,
    Cnode: s.topology === 'forward' ? 0 : s.Cnode,
    load: { kind: 'resistive', R, C: s.C },
  };
  if (s.topology === 'flyback' || s.topology === 'forward') p.n = s.n ?? 1;
  if (s.topology === 'forward') {
    p.nr = s.nr ?? 1;
    p.LM = s.LM ?? 0;
  }
  return p;
}

interface Try {
  D: number;
  r: SimResult;
  V: number;
}

/**
 * The duty ratio at which the simulated output reaches its set point (within
 * 0.1 %): secant steps, kept inside the bracket of the tries below and above
 * the set point (the output rises with the duty ratio) and replaced by
 * bisection when they leave it; without a bracket yet, a step goes halfway to
 * the limit. The best try is kept, so an unreachable set point gives the
 * closest output. The search spans the duty ratios the simulator takes (the
 * open interval (0, 1), less a margin of 1e-6 at each end); the forward
 * converter's stops at its reset limit (forward.reset.Dmax).
 */
function regulate(s: LossSpec, R: number, fs: number, Dmax: number | undefined): Try {
  const lo = 1e-6;
  const hi = Math.min(1 - 1e-6, Dmax ?? 1);
  const tol = 1e-3 * s.V;
  const run = (D: number): Try => {
    const r = simulate(simParams(s, R, fs, D));
    return { D, r, V: Math.abs(r.avg.v_out!) };
  };
  let cur = run(Math.min(hi, Math.max(lo, idealDuty(s, R, fs))));
  let best = cur;
  // (assigned in note(), which the compiler's narrowing does not follow)
  let below = null as Try | null;
  let above = null as Try | null;
  const note = (t: Try) => {
    if (Math.abs(t.V - s.V) < Math.abs(best.V - s.V)) best = t;
    if (t.V < s.V) {
      if (!below || t.D > below.D) below = t;
    } else if (!above || t.D < above.D) above = t;
  };
  note(cur);
  let prev: Try | null = null;
  for (let it = 0; it < 30 && Math.abs(best.V - s.V) > tol; it++) {
    const a = below ? below.D : lo;
    const b = above ? above.D : hi;
    let next =
      prev && prev.V !== cur.V
        ? cur.D - ((cur.V - s.V) * (cur.D - prev.D)) / (cur.V - prev.V)
        : cur.D * (1 + (0.5 * (s.V - cur.V)) / s.V);
    if (!(next > a && next < b)) {
      if (below && above) next = 0.5 * (a + b);
      else if (!above) next = 0.5 * (cur.D + hi);
      else next = 0.5 * (lo + cur.D);
    }
    if (next === cur.D) break;
    prev = cur;
    cur = run(next);
    note(cur);
  }
  return best;
}

/** Simulate one operating point with the duty ratio adjusted until the output is at its set point. */
export function lossPoint(s: LossSpec, load: number, fs: number): LossPoint {
  const R = (s.V * s.V) / (load * s.P);
  const Dmax = s.topology === 'forward' ? evaluate('forward.reset.Dmax', { n_r: s.nr ?? 1 }) : undefined;
  const { D, r, V } = regulate(s, R, fs, Dmax);
  const regulated = Math.abs(V - s.V) <= 1e-3 * s.V;

  const w = r.waveforms;
  const sw = stats(r, 'i_sw');
  const iL = stats(r, 'i_L');
  const iD = stats(r, 'i_D');
  const vsw = w.v_sw as number[];
  const Vsw_on = vsw[vsw.length - 1]!;
  const Ipk = r.max.i_L!;
  const IL_pp = r.pp.i_L!;

  const losses: Record<Bucket, number> = {
    conduction: evaluate('loss.cond', { I_rms: sw.rms, R_x: s.Ron }) + evaluate('loss.cond', { I_rms: iL.rms, R_x: s.RL }),
    capacitive: s.topology === 'forward' ? 0 : evaluate('loss.sw.cap', { C_node: s.Cnode, V_sw: Vsw_on, f_s: fs }),
    gate: evaluate('loss.gate', { Q_g: s.Qg, V_GS: s.Vgs, f_s: fs }),
    core: 0,
    diode: evaluate('loss.diode', { V_F: s.VF, I_avg: iD.avg, r_d: s.rd, I_rms: iD.rms }),
    clamp: 0,
  };
  let Bac: number | undefined;
  let Bpk: number | undefined;
  if (s.core) {
    // the flux density follows the current, B = L i/(N A_e): its ac amplitude follows from half the current swing
    Bac = evaluate('mag.B_pk', { L: s.L, I_pk: IL_pp / 2, N: s.core.N, A_e: s.core.Ae });
    Bpk = evaluate('mag.B_pk', { L: s.L, I_pk: Ipk, N: s.core.N, A_e: s.core.Ae });
    const Pv = evaluate('loss.steinmetz', { k: s.core.k, f: fs, alpha: s.core.alpha, B_ac: Bac, beta: s.core.beta });
    losses.core = evaluate('loss.core', { P_v: Pv, V_e: s.core.Ve });
  }
  if (s.topology === 'flyback' && s.Llk) {
    const E = evaluate('flyback.leak.E', { L_lk: s.Llk, I_pk: Ipk });
    losses.clamp = evaluate('flyback.leak.P', { E_lk: E, f_s: fs });
  }
  const total = BUCKETS.reduce((acc, b) => acc + losses[b], 0);
  // the power the load takes, <v_out^2>/R: the output energy of the simulated
  // period (the capacitor's energy returns to its start value in steady state),
  // not <v_out>^2/R, which the output ripple would make too small
  const Pout = r.energy.output * fs;
  return {
    load,
    fs,
    R,
    D,
    mode: r.mode,
    converged: r.converged,
    regulated,
    resetLimited: Dmax !== undefined && !regulated && V < s.V && D >= Dmax * (1 - 1e-6),
    Vout: V,
    Pout,
    losses,
    total,
    eta: Pout / (Pout + total),
    inputs: { Isw_rms: sw.rms, IL_rms: iL.rms, ID_avg: iD.avg, ID_rms: iD.rms, Vsw_on, IL_pp, Ipk, Bac, Bpk },
    sim: r.losses,
  };
}

export function lossBudget(s: LossSpec): LossBudget {
  return {
    spec: s,
    load: LOAD_FRACTIONS.map((x) => lossPoint(s, x, s.fs)),
    freq: FREQ_FACTORS.map((k) => lossPoint(s, 1, s.fs * k)),
  };
}
