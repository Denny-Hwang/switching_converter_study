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
  'flyback.V_OR': eq(['V', 'V_D', 'n'], ({ V, V_D, n }) => (V + V_D) / n),
  'clamp.Vds': eq(['V_g', 'V_clamp'], ({ V_g, V_clamp }) => V_g + V_clamp),
  'clamp.t_reset': eq(['L_lk', 'I_pk', 'V_clamp', 'V_OR'], ({ L_lk, I_pk, V_clamp, V_OR }) => (L_lk * I_pk) / (V_clamp - V_OR)),
  'clamp.P': eq(['L_lk', 'I_pk', 'f_s', 'V_clamp', 'V_OR'], ({ L_lk, I_pk, f_s, V_clamp, V_OR }) =>
    (L_lk * sq(I_pk) * f_s * V_clamp) / (2 * (V_clamp - V_OR)),
  ),
  'clamp.rcd.V': eq(['V_OR', 'R_clamp', 'L_lk', 'I_pk', 'f_s'], ({ V_OR, R_clamp, L_lk, I_pk, f_s }) =>
    (V_OR + Math.sqrt(sq(V_OR) + 2 * R_clamp * L_lk * sq(I_pk) * f_s)) / 2,
  ),
  'tvs.R_D': eq(['V_CL', 'V_BR', 'I_PP'], ({ V_CL, V_BR, I_PP }) => (V_CL - V_BR) / I_PP),
  'tvs.V_clamp': eq(['V_BR', 'R_D', 'I_pk'], ({ V_BR, R_D, I_pk }) => V_BR + R_D * I_pk),
  'flyback.V_ceiling': eq(['n', 'V_clamp', 'V_D'], ({ n, V_clamp, V_D }) => n * V_clamp - V_D),

  // --- RC snubber: parasitics from two ringing frequencies, damping, loss ------
  'snub.C_par': eq(['C_add', 'f_r0', 'f_r1'], ({ C_add, f_r0, f_r1 }) => C_add / (sq(f_r0 / f_r1) - 1)),
  'snub.L_par': eq(['f_r0', 'C_par'], ({ f_r0, C_par }) => 1 / (4 * sq(Math.PI) * sq(f_r0) * C_par)),
  'snub.R': eq(['zeta', 'L_par', 'C_snub'], ({ zeta, L_par, C_snub }) => 2 * zeta * Math.sqrt(L_par / C_snub)),
  'snub.P': eq(['C_snub', 'V_snub', 'f_s'], ({ C_snub, V_snub, f_s }) => C_snub * sq(V_snub) * f_s),
  'snub.P_R': eq(['f_s', 'C_snub', 'V_snub', 'L_par', 'I_ring'], ({ f_s, C_snub, V_snub, L_par, I_ring }) =>
    (f_s * (C_snub * sq(V_snub) + L_par * sq(I_ring))) / 2,
  ),

  'dcm.ring.f': eq(['L_M', 'C_node'], ({ L_M, C_node }) => 1 / (2 * Math.PI * Math.sqrt(L_M * C_node))),
  'loss.cond': eq(['I_rms', 'R_x'], ({ I_rms, R_x }) => sq(I_rms) * R_x),
  'loss.sw.cap': eq(['C_node', 'V_sw', 'f_s'], ({ C_node, V_sw, f_s }) => 0.5 * C_node * sq(V_sw) * f_s),
  'loss.gate': eq(['Q_g', 'V_GS', 'f_s'], ({ Q_g, V_GS, f_s }) => Q_g * V_GS * f_s),
  'loss.diode': eq(['V_F', 'I_avg', 'r_d', 'I_rms'], ({ V_F, I_avg, r_d, I_rms }) => V_F * I_avg + r_d * sq(I_rms)),
  'loss.steinmetz': eq(['k', 'f', 'alpha', 'B_ac', 'beta'], ({ k, f, alpha, B_ac, beta }) =>
    k * Math.pow(f, alpha) * Math.pow(B_ac, beta),
  ),
  'loss.core': eq(['P_v', 'V_e'], ({ P_v, V_e }) => P_v * V_e),

  // --- magnetics ------------------------------------------------------------
  'mag.L_from_AL': eq(['A_L', 'N'], ({ A_L, N }) => A_L * sq(N)),
  'mag.AL_gap': eq(['A_e', 'l_g', 'l_e', 'mu_i'], ({ A_e, l_g, l_e, mu_i }) => (MU_0 * A_e) / (l_g + l_e / mu_i)),
  'mag.B_pk': eq(['L', 'I_pk', 'N', 'A_e'], ({ L, I_pk, N, A_e }) => (L * I_pk) / (N * A_e)),
  'mag.B_ac': eq(['L', 'Delta_i_L', 'N', 'A_e'], ({ L, Delta_i_L, N, A_e }) => (L * Delta_i_L) / (N * A_e)),
  'mag.dB_faraday': eq(['V_w', 't_on', 'N', 'A_e'], ({ V_w, t_on, N, A_e }) => (V_w * t_on) / (N * A_e)),
  'mag.N_Bmax': eq(['L', 'I_pk', 'B_max', 'A_e'], ({ L, I_pk, B_max, A_e }) => (L * I_pk) / (B_max * A_e)),
  'mag.gap_length': eq(['A_e', 'N', 'L', 'l_e', 'mu_i'], ({ A_e, N, L, l_e, mu_i }) => (MU_0 * A_e * sq(N)) / L - l_e / mu_i),
  'mag.Kg_req': eq(['rho_w', 'L', 'I_pk', 'B_max', 'R_dcmax', 'K_u'], ({ rho_w, L, I_pk, B_max, R_dcmax, K_u }) =>
    (rho_w * sq(L) * sq(I_pk)) / (sq(B_max) * R_dcmax * K_u),
  ),
  'mag.Kg_core': eq(['A_e', 'W_A', 'MLT'], ({ A_e, W_A, MLT }) => (sq(A_e) * W_A) / MLT),
  'wind.fill': eq(['N', 'A_w', 'W_A'], ({ N, A_w, W_A }) => (N * A_w) / W_A),
  'wind.dcr': eq(['rho_w', 'N', 'MLT', 'A_w'], ({ rho_w, N, MLT, A_w }) => (rho_w * N * MLT) / A_w),
  'wind.skin_depth': eq(['rho_w', 'f'], ({ rho_w, f }) => Math.sqrt(rho_w / (Math.PI * MU_0 * f))),
  'wind.dowell': eq(['phi_l', 'M_l'], ({ phi_l, M_l }) => {
    const skin = (Math.sinh(2 * phi_l) + Math.sin(2 * phi_l)) / (Math.cosh(2 * phi_l) - Math.cos(2 * phi_l));
    const proximity = (Math.sinh(phi_l) - Math.sin(phi_l)) / (Math.cosh(phi_l) + Math.cos(phi_l));
    return phi_l * (skin + ((2 * (sq(M_l) - 1)) / 3) * proximity);
  }),
  'xfmr.leakage.ps': eq(['N', 'MLT', 'h_p', 'h_g', 'h_s', 'b_w'], ({ N, MLT, h_p, h_g, h_s, b_w }) =>
    (MU_0 * sq(N) * MLT * (h_p / 3 + h_g + h_s / 3)) / b_w,
  ),
  'xfmr.leakage.psp': eq(['N', 'MLT', 'h_p', 'h_g', 'h_s', 'b_w'], ({ N, MLT, h_p, h_g, h_s, b_w }) =>
    (MU_0 * sq(N) * MLT * (h_p / 3 + 2 * h_g + h_s / 3)) / (4 * b_w),
  ),
  'xfmr.k': eq(['L_12', 'L_11', 'L_22'], ({ L_12, L_11, L_22 }) => L_12 / Math.sqrt(L_11 * L_22)),
  'xfmr.L_sc': eq(['L_11', 'k_c'], ({ L_11, k_c }) => L_11 * (1 - sq(k_c))),
  'xfmr.L_sc_T': eq(['L_l1', 'L_l2p', 'L_M'], ({ L_l1, L_l2p, L_M }) => L_l1 + (L_l2p * L_M) / (L_l2p + L_M)),
  'xfmr.V_oc': eq(['n', 'L_M', 'L_l1'], ({ n, L_M, L_l1 }) => (n * L_M) / (L_l1 + L_M)),
  'wind.rho_T': eq(['rho_20', 'alpha_20', 'T_w'], ({ rho_20, alpha_20, T_w }) => rho_20 * (1 + alpha_20 * (T_w - 20))),
  'wind.round_area': eq(['k_s', 'd_w'], ({ k_s, d_w }) => (k_s * Math.PI * sq(d_w)) / 4),
  'wind.porosity': eq(['N_l', 'k_s', 'd_w', 'b_w'], ({ N_l, k_s, d_w, b_w }) => (N_l * k_s * Math.sqrt(Math.PI / 4) * d_w) / b_w),
  'wind.phi_round': eq(['eta_p', 'd_w', 'delta_s'], ({ eta_p, d_w, delta_s }) => (Math.sqrt(eta_p) * Math.sqrt(Math.PI / 4) * d_w) / delta_s),
  'wind.phi_foil': eq(['h_l', 'delta_s'], ({ h_l, delta_s }) => h_l / delta_s),
  'wind.dowell_low': eq(['phi_l', 'M_l'], ({ phi_l, M_l }) => 1 + ((5 * sq(M_l) - 1) * sq(sq(phi_l))) / 45),
  'wind.loss_rel': eq(['F_R', 'phi_l'], ({ F_R, phi_l }) => F_R / phi_l),
  'wind.phi_opt': eq(['M_l'], ({ M_l }) => Math.pow(15 / (5 * sq(M_l) - 1), 0.25)),

  // --- sources, extraction, sensing -----------------------------------------
  'src.Pmax': eq(['V_oc', 'R_s'], ({ V_oc, R_s }) => sq(V_oc) / (4 * R_s)),
  'src.cv_power': eq(['V_c', 'V_oc', 'R_s'], ({ V_c, V_oc, R_s }) => (V_c * (V_oc - V_c)) / R_s),
  'src.cv_extraction': eq(['V_c', 'V_oc'], ({ V_c, V_oc }) => {
    const x = V_c / V_oc;
    return 4 * x * (1 - x);
  }),
  'lfr.Vg': eq(['V_oc', 'R_s', 'R_in'], ({ V_oc, R_s, R_in }) => (V_oc * R_in) / (R_s + R_in)),
  'lfr.eta': eq(['R_s', 'R_in'], ({ R_s, R_in }) => (4 * R_s * R_in) / sq(R_s + R_in)),
  'lfr.Vg_power': eq(['P', 'R_in'], ({ P, R_in }) => Math.sqrt(P * R_in)),
  'sense.current_out_monitor': eq(['I_SENSE', 'R_SENSE', 'R_OUT', 'R_IN'], ({ I_SENSE, R_SENSE, R_OUT, R_IN }) =>
    (I_SENSE * R_SENSE * R_OUT) / R_IN,
  ),
  'sense.burden': eq(['I_SENSE', 'R_SENSE'], ({ I_SENSE, R_SENSE }) => I_SENSE * R_SENSE),
  'sense.voltage_out_monitor': eq(['G_sense', 'I_SENSE', 'R_SENSE', 'V_REF'], ({ G_sense, I_SENSE, R_SENSE, V_REF }) =>
    G_sense * I_SENSE * R_SENSE + V_REF,
  ),
  'sense.offset_current': eq(['V_OS', 'R_SENSE'], ({ V_OS, R_SENSE }) => V_OS / R_SENSE),
  'sense.pad_error': eq(['R_pad', 'R_SENSE'], ({ R_pad, R_SENSE }) => R_pad / R_SENSE),
  'sense.reading': eq(['I_SENSE', 'R_SENSE', 'R_pad', 'V_OS'], ({ I_SENSE, R_SENSE, R_pad, V_OS }) =>
    (I_SENSE * (R_SENSE + R_pad)) / R_SENSE + V_OS / R_SENSE,
  ),
  'sense.rel_error': eq(['V_OS', 'I_SENSE', 'R_SENSE', 'R_pad'], ({ V_OS, I_SENSE, R_SENSE, R_pad }) =>
    V_OS / (I_SENSE * R_SENSE) + R_pad / R_SENSE,
  ),
  'sense.filter_R': eq(['R_OUT', 'R_f'], ({ R_OUT, R_f }) => R_OUT + R_f),
  'adc.nyquist': eq(['f_samp'], ({ f_samp }) => f_samp / 2),
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
  'vsb.drift': eq(['v_L_avg', 'T_s', 'L'], ({ v_L_avg, T_s, L }) => (v_L_avg * T_s) / L),
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

/** Evaluators added with the 03-topologies pages (Phase 2b). */
const topologies: Readonly<Record<string, Evaluator>> = {
  // --- dc currents and peak current -----------------------------------------
  'buck.IL': eq(['V', 'R'], ({ V, R }) => V / R),
  'boost.IL': eq(['V', 'D', 'R'], ({ V, D, R }) => V / R / (1 - D)),
  'buckboost.IL': eq(['V', 'D', 'R'], ({ V, D, R }) => V / R / (1 - D)),
  'ripple.Ipk': eq(['I_L', 'Delta_i_L'], ({ I_L, Delta_i_L }) => I_L + Delta_i_L),

  // --- current and voltage ripple (half peak-to-peak) -------------------------
  'buck.ripple.v': eq(['Delta_i_L', 'T_s', 'C'], ({ Delta_i_L, T_s, C }) => {
    // charge of the positive half-triangle (base T_s/2, height Delta_i_L) = C * 2 Delta_v
    const charge = 0.5 * (T_s / 2) * Delta_i_L;
    return charge / (2 * C);
  }),
  'boost.ripple.iL': eq(['V_g', 'D', 'T_s', 'L'], ({ V_g, D, T_s, L }) => (V_g / L) * (D * T_s) / 2),
  'boost.ripple.v': eq(['V', 'D', 'T_s', 'R', 'C'], ({ V, D, T_s, R, C }) => (V / R / C) * (D * T_s) / 2),
  'buckboost.ripple.iL': eq(['V_g', 'D', 'T_s', 'L'], ({ V_g, D, T_s, L }) => (V_g / L) * (D * T_s) / 2),
  'buckboost.ripple.v': eq(['V', 'D', 'T_s', 'R', 'C'], ({ V, D, T_s, R, C }) => (V / R / C) * (D * T_s) / 2),
  'forward.ripple.iL': eq(['n', 'V_g', 'V', 'D', 'T_s', 'L'], ({ n, V_g, V, D, T_s, L }) =>
    ((n * V_g - V) / L) * (D * T_s) / 2,
  ),

  // --- voltages and stresses ---------------------------------------------------
  'buckboost.V': eq(['D', 'V_g'], ({ D, V_g }) => (V_g * D) / (1 - D)),
  'flyback.IM': eq(['n', 'V', 'D', 'R'], ({ n, V, D, R }) => (n * V) / ((1 - D) * R)),
  'flyback.ripple.iM': eq(['V_g', 'D', 'T_s', 'L_M'], ({ V_g, D, T_s, L_M }) => (V_g * D * T_s) / (2 * L_M)),
  'flyback.ripple.v': eq(['V', 'D', 'T_s', 'R', 'C'], ({ V, D, T_s, R, C }) => (V * D * T_s) / (2 * R * C)),
  'buck.Vds': eq(['V_g'], ({ V_g }) => V_g),
  'boost.Vds': eq(['V'], ({ V }) => V),
  'buckboost.Vds': eq(['V_g', 'V'], ({ V_g, V }) => V_g + V),
  'forward.Vds': eq(['V_g', 'n_r'], ({ V_g, n_r }) => V_g + V_g / n_r),

  // --- transistor utilization U = P / (V_peak * I_rms) --------------------------
  'util.buck': eq(['D'], ({ D }) => Math.sqrt(D)),
  'util.boost': eq(['D'], ({ D }) => (1 - D) / Math.sqrt(D)),
  'util.buckboost': eq(['D'], ({ D }) => (1 - D) * Math.sqrt(D)),
  'util.forward': eq(['D', 'n_r'], ({ D, n_r }) => (n_r * Math.sqrt(D)) / (n_r + 1)),
};

/** Evaluators added with the 00-foundations and 01-physics refreshers (Phase 2c). */
const foundations: Readonly<Record<string, Evaluator>> = {
  // --- element laws under constant excitation, stored energy -------------------
  'ind.di': eq(['V_L', 't', 'L'], ({ V_L, t, L }) => (V_L / L) * t),
  'cap.dv': eq(['I_C', 't', 'C'], ({ I_C, t, C }) => (I_C / C) * t),
  'ind.E': eq(['L', 'I_L'], ({ L, I_L }) => 0.5 * L * sq(I_L)),
  'cap.E': eq(['C', 'V_C'], ({ C, V_C }) => 0.5 * C * sq(V_C)),

  // --- impedance, R-C filter, self-resonance ------------------------------------
  'imp.ZL': eq(['f', 'L'], ({ f, L }) => 2 * Math.PI * f * L),
  'imp.ZC': eq(['f', 'C'], ({ f, C }) => 1 / (2 * Math.PI * f * C)),
  'rc.fc': eq(['R_f', 'C_f'], ({ R_f, C_f }) => 1 / (2 * Math.PI * R_f * C_f)),
  'rc.gain': eq(['f', 'f_c'], ({ f, f_c }) => 1 / Math.hypot(1, f / f_c)),
  'passive.f_srf': eq(['L', 'C_p'], ({ L, C_p }) => 1 / (2 * Math.PI * Math.sqrt(L * C_p))),
  'meas.L_app': eq(['L', 'f', 'f_srf'], ({ L, f, f_srf }) => L / (1 - sq(f / f_srf))),
  'cap.esr.ripple': eq(['R_esr', 'Delta_i_pp'], ({ R_esr, Delta_i_pp }) => R_esr * Delta_i_pp),

  // --- rectangular pulse train ---------------------------------------------------
  'fourier.pulse.harm': eq(['V_pk', 'h', 'D'], ({ V_pk, h, D }) => {
    // amplitude sqrt(a^2 + b^2) of the cosine and sine coefficients, 2 V |sin(pi h D)| / (pi h)
    const x = Math.PI * h * D;
    return (2 * V_pk * Math.abs(Math.sin(x))) / (Math.PI * h);
  }),
  'fourier.pulse.rms': eq(['V_pk', 'D'], ({ V_pk, D }) => V_pk * Math.sqrt(D)),

  // --- magnetics and the ideal transformer (1:n, n = N_s/N_p) ----------------------
  'mag.H_ampere': eq(['N', 'I_w', 'l_e'], ({ N, I_w, l_e }) => (N * I_w) / l_e),
  'mag.B_H': eq(['mu_r', 'H_mag'], ({ mu_r, H_mag }) => MU_0 * mu_r * H_mag),
  'xfmr.V2': eq(['n', 'V_1'], ({ n, V_1 }) => n * V_1),
  'xfmr.I2': eq(['I_1', 'n'], ({ I_1, n }) => I_1 / n),

  // --- a battery at a converter's output (Rint model) ------------------------------
  'bat.rint': eq(['V', 'V_b', 'R_b'], ({ V, V_b, R_b }) => (V - V_b) / R_b),
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

export const evaluators: Readonly<Record<string, Evaluator>> = merge(base, theory, topologies, foundations);

export function evaluate(id: string, inputs: Inputs): number {
  const fn = evaluators[id];
  if (!fn) throw new Error(`unknown equation id: ${id}`);
  return fn(inputs);
}
