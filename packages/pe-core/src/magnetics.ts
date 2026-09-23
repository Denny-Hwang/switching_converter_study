/**
 * The magnetics designer (docs/BUILD_SPEC.md section 5, MagneticsDesigner):
 * the turns, the gap, the flux density, the window and the windings of an
 * inductor or a flyback transformer (coupled inductor) on a given core. Every
 * physical relation is a catalogue equation (the rounding to whole turns and
 * layers, the sums over windings and the comparisons are arithmetic on them):
 *
 *   fewest turns at the flux limit     mag.N_Bmax (at the smallest cross-section, when known)
 *   inductance per turn squared        mag.L_from_AL, solved for A_L (and for N on a data-sheet A_L)
 *   the ungapped set's permeability    mag.AL_gap with no gap, solved for mu_i
 *   gap without fringing               mag.gap_length
 *   peak flux density                  mag.B_pk
 *   ac flux amplitude from the ripple  mag.B_ac
 *   copper area, window utilization    wind.round_area, wind.fill (summed over the windings)
 *   resistivity at temperature         wind.rho_T
 *   dc resistance                      wind.dcr
 *   skin depth, porosity, phi, F_R     wind.skin_depth, wind.porosity, wind.phi_round, wind.dowell
 *   dc copper loss                     loss.cond
 *   leakage (flyback)                  xfmr.leakage.ps or xfmr.leakage.psp
 *
 * Dowell's factor assumes a one-dimensional field across the layers. Next to
 * the gap the field is two-dimensional and the loss higher, and in a flyback
 * the windings do not conduct together, so interleaving does not cancel their
 * fields as in a transformer: each winding is taken with its own layers, from
 * zero field on one side.
 */

import { evaluate } from './equations';
import { invert } from './invert';

export type MagDevice = 'inductor' | 'flyback';
export type Arrangement = 'ps' | 'psp';

/** A core set: its magnetic data and its coil former's window (SI units). */
export interface MagCore {
  /** Effective area, smallest cross-section (optional), effective path length. */
  Ae: number;
  Amin?: number;
  le: number;
  /** Inductance factor of the ungapped set (H per turn squared). */
  AL0: number;
  /** Data-sheet gapped sets (one gapped core with one ungapped): gap and A_L. */
  gapped?: readonly { g: number; AL: number }[];
  /** Winding area of the coil former, and the mean length of one turn on it. */
  WA: number;
  MLT: number;
}

/** A winding of round strands: bare diameter, strands in parallel, layers, and the insulated diameter (for its height). */
export interface MagWinding {
  d: number;
  ks: number;
  layers: number;
  dOuter?: number;
}

export interface MagSpec {
  device: MagDevice;
  /** Inductance (the magnetizing inductance referred to the primary for the flyback), H. */
  L: number;
  /** Peak and rms current of the (primary) winding, A. */
  Ipk: number;
  Irms: number;
  /** Half the peak-to-peak ripple of that current (Erickson), A: it sets the flux swing. None: no swing is computed. */
  dI?: number;
  /** Switching frequency, Hz (the frequency of the ac resistance). */
  fs: number;
  /** Largest flux density allowed, T. */
  Bmax: number;
  core: MagCore;
  primary: MagWinding;
  /** Flyback: turns ratio N_s/N_p, the secondary's rms current, winding, arrangement and the spacing between the windings. */
  n?: number;
  IrmsS?: number;
  secondary?: MagWinding;
  arrangement?: Arrangement;
  hg?: number;
  /** Winding breadth along the core leg, m. */
  bw: number;
  /** Winding temperature, °C, and the conductor's resistivity and temperature coefficient at 20 °C (annealed copper by default). */
  Tw: number;
  rho20?: number;
  alpha20?: number;
  /** Largest window utilization that can be wound. */
  KuMax: number;
  /** Primary turns to use; by default the fewest that keep the flux density at B_max. */
  N?: number;
}

export type MagWarning =
  | 'needTurns' // the ungapped core gives less than the inductance at these turns: no gap helps, more turns do
  | 'saturation' // the peak flux density exceeds B_max (turns given by the user)
  | 'window' // the windings take more of the window than K_u,max
  | 'layerFull'; // a layer's turns, side by side over their insulation, do not fit in the winding breadth

/** One winding's copper: turns, area, resistance, and Dowell's factor at the switching frequency. */
export interface WindingResult {
  N: number;
  Aw: number;
  /** Turns per layer and the layer's porosity. */
  Nl: number;
  eta: number;
  Rdc: number;
  phi: number;
  FR: number;
  /** Resistance at the switching frequency, F_R R_dc. */
  Rac: number;
  Pdc: number;
  /** Height (build) of the winding: layers times the insulated diameter. */
  height: number;
  /** Width a layer's turns take side by side over their insulation (turns per layer x strands x insulated diameter). */
  layerWidth: number;
}

export interface MagResult {
  spec: MagSpec;
  /** Fewest turns for B_max (not rounded), and the area it was computed at (A_min when given). */
  Nmin: number;
  Acheck: number;
  N: number;
  /** A_L the design needs, the ungapped set's effective permeability, and the gap without fringing (negative: see needTurns). */
  ALreq: number;
  mue: number;
  gap: number;
  /** Peak flux density at A_e and at the smallest cross-section. */
  Bpk: number;
  BpkMin: number;
  /** AC flux-density amplitude at A_e from the ripple (half the peak-to-peak swing), when the ripple is given. */
  Bac?: number;
  /** Data-sheet gapped sets: turns for the inductance, the inductance and peak flux density they give. */
  options: { g: number; AL: number; N: number; L: number; Bpk: number; ok: boolean }[];
  rho: number;
  delta: number;
  primary: WindingResult;
  secondary?: WindingResult;
  /** Secondary turns rounded to whole turns, and the turns ratio they give. */
  Ns?: number;
  nActual?: number;
  Ku: number;
  Pdc: number;
  /** Leakage inductance referred to the primary (flyback). */
  Llk?: number;
  warnings: MagWarning[];
}

/** Annealed copper at 20 °C: resistivity and temperature coefficient (NBS Handbook 100, nbs_hb100). */
export const COPPER = { rho20: 1.7241e-8, alpha20: 0.00393 } as const;

/** Whole turns at or above x (x slightly above an integer from rounding counts as that integer). */
function wholeUp(x: number): number {
  return Math.max(1, Math.ceil(x - 1e-9));
}

function winding(w: MagWinding, N: number, Irms: number, M: number, spec: MagSpec, rho: number, delta: number): WindingResult {
  const Aw = evaluate('wind.round_area', { k_s: w.ks, d_w: w.d });
  const Rdc = evaluate('wind.dcr', { rho_w: rho, N, MLT: spec.core.MLT, A_w: Aw });
  const layers = Math.max(1, Math.round(w.layers));
  const Nl = Math.ceil(N / layers);
  const eta = evaluate('wind.porosity', { N_l: Nl, k_s: w.ks, d_w: w.d, b_w: spec.bw });
  const phi = evaluate('wind.phi_round', { eta_p: Math.min(eta, 1), d_w: w.d, delta_s: delta });
  const FR = evaluate('wind.dowell', { phi_l: phi, M_l: M });
  return {
    N,
    Aw,
    Nl,
    eta,
    Rdc,
    phi,
    FR,
    Rac: FR * Rdc,
    Pdc: evaluate('loss.cond', { I_rms: Irms, R_x: Rdc }),
    height: layers * (w.dOuter ?? w.d),
    layerWidth: Nl * w.ks * (w.dOuter ?? w.d),
  };
}

/** Dowell's factor of a winding over frequency (for the chart): the same winding, the skin depth at each frequency. */
export function frCurve(w: MagWinding, N: number, M: number, spec: Pick<MagSpec, 'bw' | 'Tw' | 'rho20' | 'alpha20'>, freqs: readonly number[]): number[] {
  const rho = evaluate('wind.rho_T', { rho_20: spec.rho20 ?? COPPER.rho20, alpha_20: spec.alpha20 ?? COPPER.alpha20, T_w: spec.Tw });
  const layers = Math.max(1, Math.round(w.layers));
  const eta = Math.min(evaluate('wind.porosity', { N_l: Math.ceil(N / layers), k_s: w.ks, d_w: w.d, b_w: spec.bw }), 1);
  return freqs.map((f) => {
    const delta = evaluate('wind.skin_depth', { rho_w: rho, f });
    return evaluate('wind.dowell', { phi_l: evaluate('wind.phi_round', { eta_p: eta, d_w: w.d, delta_s: delta }), M_l: M });
  });
}

export function magnetics(spec: MagSpec): MagResult {
  const { core } = spec;
  const warnings = new Set<MagWarning>();
  const Acheck = core.Amin ?? core.Ae;
  const Nmin = evaluate('mag.N_Bmax', { L: spec.L, I_pk: spec.Ipk, B_max: spec.Bmax, A_e: Acheck });
  const N = spec.N !== undefined ? Math.max(1, Math.round(spec.N)) : wholeUp(Nmin);

  const ALreq = invert('mag.L_from_AL', 'A_L', spec.L, { N }, 1e-15, 1);
  const mue = invert('mag.AL_gap', 'mu_i', core.AL0, { A_e: core.Ae, l_g: 0, l_e: core.le }, 1e-3, 1e7);
  const gap = evaluate('mag.gap_length', { A_e: core.Ae, N, L: spec.L, l_e: core.le, mu_i: mue });
  if (gap <= 0) warnings.add('needTurns');

  const Bpk = evaluate('mag.B_pk', { L: spec.L, I_pk: spec.Ipk, N, A_e: core.Ae });
  const BpkMin = evaluate('mag.B_pk', { L: spec.L, I_pk: spec.Ipk, N, A_e: Acheck });
  if (BpkMin > spec.Bmax * (1 + 1e-9)) warnings.add('saturation');
  const Bac = spec.dI !== undefined ? evaluate('mag.B_ac', { L: spec.L, Delta_i_L: spec.dI, N, A_e: core.Ae }) : undefined;

  const options = (core.gapped ?? []).map(({ g, AL }) => {
    const Nopt = wholeUp(invert('mag.L_from_AL', 'N', spec.L, { A_L: AL }, 1e-6, 1e6));
    const Lopt = evaluate('mag.L_from_AL', { A_L: AL, N: Nopt });
    const B = evaluate('mag.B_pk', { L: Lopt, I_pk: spec.Ipk, N: Nopt, A_e: Acheck });
    return { g, AL, N: Nopt, L: Lopt, Bpk: B, ok: B <= spec.Bmax * (1 + 1e-9) };
  });

  const rho = evaluate('wind.rho_T', { rho_20: spec.rho20 ?? COPPER.rho20, alpha_20: spec.alpha20 ?? COPPER.alpha20, T_w: spec.Tw });
  const delta = evaluate('wind.skin_depth', { rho_w: rho, f: spec.fs });

  const flyback = spec.device === 'flyback';
  const primary = winding(spec.primary, N, spec.Irms, Math.max(1, Math.round(spec.primary.layers)), spec, rho, delta);
  let secondary: WindingResult | undefined;
  let Ns: number | undefined;
  let nActual: number | undefined;
  let Llk: number | undefined;
  if (flyback) {
    if (!spec.secondary || spec.n === undefined) throw new Error('magnetics: a flyback needs the turns ratio and the secondary winding');
    Ns = Math.max(1, Math.round(spec.n * N));
    nActual = Ns / N;
    secondary = winding(spec.secondary, Ns, spec.IrmsS ?? 0, Math.max(1, Math.round(spec.secondary.layers)), spec, rho, delta);
    const leak = spec.arrangement === 'psp' ? 'xfmr.leakage.psp' : 'xfmr.leakage.ps';
    Llk = evaluate(leak, { N, MLT: core.MLT, h_p: primary.height, h_g: spec.hg ?? 0, h_s: secondary.height, b_w: spec.bw });
  }
  // Dowell's porosity counts the copper only; whether the turns fit counts their insulation
  for (const w of [primary, secondary]) if (w && (w.eta > 1 + 1e-9 || w.layerWidth > spec.bw * (1 + 1e-9))) warnings.add('layerFull');

  const Ku = evaluate('wind.fill', { N, A_w: primary.Aw, W_A: core.WA }) + (secondary ? evaluate('wind.fill', { N: secondary.N, A_w: secondary.Aw, W_A: core.WA }) : 0);
  if (Ku > spec.KuMax) warnings.add('window');

  return {
    spec,
    Nmin,
    Acheck,
    N,
    ALreq,
    mue,
    gap,
    Bpk,
    BpkMin,
    Bac,
    options,
    rho,
    delta,
    primary,
    secondary,
    Ns,
    nActual,
    Ku,
    Pdc: primary.Pdc + (secondary?.Pdc ?? 0),
    Llk,
    warnings: [...warnings],
  };
}
