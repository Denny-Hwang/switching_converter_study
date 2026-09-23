/**
 * Hand-written evaluators, one per equation id in equations.yaml.
 *
 * These are deliberately NOT generated from the YAML: they are an
 * independent implementation that the vitest parity test checks against
 * the sympy-computed vectors in equations/test_vectors.json (1e-9 relative).
 * All inputs and outputs are SI (see CLAUDE.md "Symbol conventions").
 */
import { MU_0 } from './constants';

export type Inputs = Readonly<Record<string, number>>;

export interface Evaluator {
  /** Names of the input symbols, exactly as in equations.yaml (constants excluded). */
  readonly vars: readonly string[];
  (inputs: Inputs): number;
}

function eq<K extends string>(vars: readonly K[], fn: (p: Record<K, number>) => number): Evaluator {
  const run = (inputs: Inputs): number => {
    const p = {} as Record<K, number>;
    for (const k of vars) {
      const val = inputs[k];
      if (typeof val !== 'number' || !Number.isFinite(val)) {
        throw new Error(`missing or non-finite input ${k}`);
      }
      p[k] = val;
    }
    return fn(p);
  };
  return Object.assign(run, { vars });
}

const sq = (x: number): number => x * x;

const base: Readonly<Record<string, Evaluator>> = {
  // --- CCM conversion ratios (volt-second balance) -------------------------
  'buck.ccm.M': eq(['D'], ({ D }) => D),
  'boost.ccm.M': eq(['D'], ({ D }) => 1 / (1 - D)),
  'buckboost.ccm.M': eq(['D'], ({ D }) => -D / (1 - D)),
  'flyback.ccm.M': eq(['n', 'D'], ({ n, D }) => (n * D) / (1 - D)),
  'forward.ccm.M': eq(['n', 'D'], ({ n, D }) => n * D),
  'forward.reset.Dmax': eq(['n_r'], ({ n_r }) => 1 / (1 + n_r)),

  // --- ripple ---------------------------------------------------------------
  'buck.ripple.iL': eq(['V_g', 'V', 'D', 'T_s', 'L'], ({ V_g, V, D, T_s, L }) => ((V_g - V) * D * T_s) / (2 * L)),
  'buck.ripple.iL_pp': eq(['V_g', 'V', 'D', 'L', 'f_s'], ({ V_g, V, D, L, f_s }) => ((V_g - V) * D) / (L * f_s)),

  // --- CCM/DCM boundary -----------------------------------------------------
  'K.def': eq(['L', 'R', 'T_s'], ({ L, R, T_s }) => (2 * L) / (R * T_s)),
  'Kcrit.buck': eq(['D'], ({ D }) => 1 - D),
  'Kcrit.boost': eq(['D'], ({ D }) => D * sq(1 - D)),
  'Kcrit.buckboost': eq(['D'], ({ D }) => sq(1 - D)),
  'Kcrit.flyback': eq(['D', 'n'], ({ D, n }) => sq((1 - D) / n)),

  // --- DCM conversion ratios --------------------------------------------------
  'buck.dcm.M': eq(['K', 'D'], ({ K, D }) => 2 / (1 + Math.sqrt(1 + (4 * K) / sq(D)))),
  'boost.dcm.M': eq(['D', 'K'], ({ D, K }) => (1 + Math.sqrt(1 + (4 * sq(D)) / K)) / 2),
  'buckboost.dcm.M': eq(['D', 'K'], ({ D, K }) => -D / Math.sqrt(K)),
  'flyback.dcm.M': eq(['D', 'K'], ({ D, K }) => D / Math.sqrt(K)),

  // --- DCM power, loss-free resistor, flyback boundary and stresses ----------
  'dcm.P_in': eq(['V_g', 'D', 'L_M', 'f_s'], ({ V_g, D, L_M, f_s }) => sq(V_g * D) / (2 * L_M * f_s)),
  'lfr.R_in': eq(['L_M', 'f_s', 'D'], ({ L_M, f_s, D }) => (2 * L_M * f_s) / sq(D)),
  'flyback.V_crit': eq(['V', 'V_D', 'D', 'n'], ({ V, V_D, D, n }) => ((V + V_D) * (1 - D)) / (n * D)),
  'flyback.Vds_off': eq(['V_g', 'V', 'V_D', 'n'], ({ V_g, V, V_D, n }) => V_g + (V + V_D) / n),
  'flyback.Vds_clamped': eq(['V', 'V_D', 'n', 'D'], ({ V, V_D, n, D }) => (V + V_D) / (n * D)),
  'flyback.diode.VR': eq(['V', 'n', 'V_g'], ({ V, n, V_g }) => V + n * V_g),
  'flyback.Ipk.dcm': eq(['V_g', 'D', 'L_M', 'f_s'], ({ V_g, D, L_M, f_s }) => (V_g * D) / (L_M * f_s)),

  // --- stored energy, ringing and losses ------------------------------------
  'flyback.leak.E': eq(['L_lk', 'I_pk'], ({ L_lk, I_pk }) => 0.5 * L_lk * sq(I_pk)),
  'flyback.leak.P': eq(['E_lk', 'f_s'], ({ E_lk, f_s }) => E_lk * f_s),
  'dcm.ring.f': eq(['L_M', 'C_node'], ({ L_M, C_node }) => 1 / (2 * Math.PI * Math.sqrt(L_M * C_node))),
  'loss.cond': eq(['I_rms', 'R_x'], ({ I_rms, R_x }) => sq(I_rms) * R_x),
  'loss.sw.cap': eq(['C_node', 'V_sw', 'f_s'], ({ C_node, V_sw, f_s }) => 0.5 * C_node * sq(V_sw) * f_s),
  'loss.gate': eq(['Q_g', 'V_GS', 'f_s'], ({ Q_g, V_GS, f_s }) => Q_g * V_GS * f_s),
  'loss.diode': eq(['V_F', 'I_avg', 'r_d', 'I_rms'], ({ V_F, I_avg, r_d, I_rms }) => V_F * I_avg + r_d * sq(I_rms)),
  'loss.steinmetz': eq(['k', 'f', 'alpha', 'B_ac', 'beta'], ({ k, f, alpha, B_ac, beta }) =>
    k * Math.pow(f, alpha) * Math.pow(B_ac, beta),
  ),

  // --- magnetics ------------------------------------------------------------
  'mag.L_from_AL': eq(['A_L', 'N'], ({ A_L, N }) => A_L * sq(N)),
  'mag.AL_gap': eq(['A_e', 'l_g', 'l_e', 'mu_i'], ({ A_e, l_g, l_e, mu_i }) => (MU_0 * A_e) / (l_g + l_e / mu_i)),
  'mag.B_pk': eq(['L', 'I_pk', 'N', 'A_e'], ({ L, I_pk, N, A_e }) => (L * I_pk) / (N * A_e)),
  'mag.dB_faraday': eq(['V_w', 't_on', 'N', 'A_e'], ({ V_w, t_on, N, A_e }) => (V_w * t_on) / (N * A_e)),

  // --- sources, extraction, sensing -----------------------------------------
  'src.Pmax': eq(['V_oc', 'R_s'], ({ V_oc, R_s }) => sq(V_oc) / (4 * R_s)),
  'src.cv_extraction': eq(['V_c', 'V_oc'], ({ V_c, V_oc }) => {
    const x = V_c / V_oc;
    return 4 * x * (1 - x);
  }),
  'sense.current_out_monitor': eq(['I_SENSE', 'R_SENSE', 'R_OUT', 'R_IN'], ({ I_SENSE, R_SENSE, R_OUT, R_IN }) =>
    (I_SENSE * R_SENSE * R_OUT) / R_IN,
  ),
};

/** Evaluators added with the 02-theory pages (Phase 2). */
const theory: Readonly<Record<string, Evaluator>> = {
  // --- definitions used to chain worked examples -------------------------------
  'def.Ts': eq(['f_s'], ({ f_s }) => 1 / f_s),
  'def.V': eq(['M', 'V_g'], ({ M, V_g }) => M * V_g),

  // --- CCM/DCM boundary in terms of L ------------------------------------------
  'L.crit': eq(['K_crit', 'R', 'T_s'], ({ K_crit, R, T_s }) => (K_crit * R * T_s) / 2),

  // --- averaging and balance --------------------------------------------------
  'sw.v_avg': eq(['D', 'V_g'], ({ D, V_g }) => D * V_g),
  'vsb.v_off': eq(['D', 'v_Lon'], ({ D, v_Lon }) => (-D * v_Lon) / (1 - D)),
  'csb.i_off': eq(['D', 'i_Con'], ({ D, i_Con }) => (-D * i_Con) / (1 - D)),
  'buck.dcm.D2': eq(['D', 'M'], ({ D, M }) => (D * (1 - M)) / M),
  'boost.ccm.M_RL': eq(['D', 'R_L', 'R'], ({ D, R_L, R }) => 1 / ((1 - D) * (1 + R_L / (sq(1 - D) * R)))),
  'boost.ccm.eta_RL': eq(['D', 'R_L', 'R'], ({ D, R_L, R }) => {
    // eta = P_out / P_in = D'^2 R / (D'^2 R + R_L)
    const k = sq(1 - D) * R;
    return k / (k + R_L);
  }),

  // --- small-signal CCM transfer functions -----------------------------------
  'buck.ss.Gd0': eq(['V_g'], ({ V_g }) => V_g),
  'buck.ss.w0': eq(['L', 'C'], ({ L, C }) => 1 / Math.sqrt(L * C)),
  'buck.ss.Q': eq(['R', 'C', 'L'], ({ R, C, L }) => R * Math.sqrt(C / L)),
  'boost.ss.Gd0': eq(['V_g', 'D'], ({ V_g, D }) => V_g / sq(1 - D)),
  'boost.ss.w0': eq(['D', 'L', 'C'], ({ D, L, C }) => (1 - D) / Math.sqrt(L * C)),
  'boost.ss.Q': eq(['D', 'R', 'C', 'L'], ({ D, R, C, L }) => (1 - D) * R * Math.sqrt(C / L)),
  'boost.ss.wz': eq(['D', 'R', 'L'], ({ D, R, L }) => (sq(1 - D) * R) / L),
  'buckboost.ss.Gd0': eq(['V_g', 'D'], ({ V_g, D }) => V_g / sq(1 - D)),
  'buckboost.ss.w0': eq(['D', 'L', 'C'], ({ D, L, C }) => (1 - D) / Math.sqrt(L * C)),
  'buckboost.ss.Q': eq(['D', 'R', 'C', 'L'], ({ D, R, C, L }) => (1 - D) * R * Math.sqrt(C / L)),
  'buckboost.ss.wz': eq(['D', 'R', 'L'], ({ D, R, L }) => (sq(1 - D) * R) / (D * L)),

  // --- control basics --------------------------------------------------------
  'pwm.d': eq(['V_ctrl', 'V_M'], ({ V_ctrl, V_M }) => V_ctrl / V_M),
  'loop.T': eq(['G_c', 'G_vd', 'H', 'V_M'], ({ G_c, G_vd, H, V_M }) => (G_c * G_vd * H) / V_M),
  'loop.suppression': eq(['T_loop'], ({ T_loop }) => 1 / (1 + T_loop)),
};

function merge(...groups: Readonly<Record<string, Evaluator>>[]): Readonly<Record<string, Evaluator>> {
  const out: Record<string, Evaluator> = {};
  for (const g of groups) {
    for (const [id, fn] of Object.entries(g)) {
      if (id in out) throw new Error(`duplicate evaluator id ${id}`);
      out[id] = fn;
    }
  }
  return out;
}

export const evaluators: Readonly<Record<string, Evaluator>> = merge(base, theory);

export function evaluate(id: string, inputs: Inputs): number {
  const fn = evaluators[id];
  if (!fn) throw new Error(`unknown equation id: ${id}`);
  return fn(inputs);
}
