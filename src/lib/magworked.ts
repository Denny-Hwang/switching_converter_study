/**
 * The magnetics designer's worked examples (<MagWorked />): a preset's
 * design, computed by pe-core's magnetics() at build time, as rows of
 * given values (the synthetic example), core data (the core table, citing
 * the data sheet) and results (each with the catalogue equation it comes
 * from). The page thus never shows a hand-typed result.
 */
import { catalog, magnetics, type MagResult, type MagSpec, type WindingResult } from 'pe-core';
import { TOOL_SYMBOLS } from '../i18n/symbols';
import { coreById } from './cores';
import { MAG_PRESETS, magValues } from './magpresets';

type Text = { en: string; ko: string };

export interface MagRow {
  kind: 'given' | 'core' | 'result';
  /** The symbol, in LaTeX. */
  latex: string;
  meaning: Text;
  value: number;
  /** The unit for formatSI. */
  unit: string;
  /** Results: the catalogue equation; core data: the data sheet's citation key. */
  eq?: string;
  cite?: string;
  /** How a result that is no single equation is obtained ("rounded up"). */
  note?: Text;
}

/** The design specification of a preset: its example's values on its table core. */
export function presetSpec(example: string): MagSpec {
  const p = MAG_PRESETS.find((x) => x.example === example);
  if (!p) throw new Error(`no magnetics preset "${example}"`);
  const v = magValues(example);
  const spec: MagSpec = {
    device: p.device,
    L: v.L!,
    Ipk: v.Ipk!,
    Irms: v.Irms!,
    dI: v.dI,
    fs: v.fs!,
    Bmax: v.Bmax!,
    core: coreById(p.core)!.core,
    primary: { d: v.dP!, dOuter: v.oP!, ks: v.ksP!, layers: v.mP! },
    bw: v.bw!,
    Tw: v.Tw!,
    KuMax: v.KuMax!,
  };
  if (v.N !== undefined) spec.N = v.N;
  if (p.device === 'flyback') {
    spec.n = v.n;
    spec.IrmsS = v.IrmsS;
    spec.secondary = { d: v.dS!, dOuter: v.oS!, ks: v.ksS!, layers: v.mS! };
    spec.arrangement = p.arrangement ?? 'ps';
    spec.hg = v.hg;
  }
  return spec;
}

function cat(key: string): { latex: string; meaning: Text; unit: string } {
  const s = catalog.symbols[key];
  if (!s) throw new Error(`magworked: ${key} is not a catalogue symbol`);
  return { latex: s.latex, meaning: { en: s.meaning, ko: s.meaning_ko }, unit: s.unit };
}

function tool(label: string): Text {
  const m = TOOL_SYMBOLS[label];
  if (!m) throw new Error(`magworked: no meaning for ${label} (i18n/symbols.ts)`);
  return m;
}

const suffix = (t: Text, s: Text): Text => ({ en: `${t.en} (${s.en})`, ko: `${t.ko} (${s.ko})` });
const PRIMARY: Text = { en: 'primary', ko: '1차' };
const SECONDARY: Text = { en: 'secondary', ko: '2차' };

/** The rows of a preset's worked example, and the design they come from. */
export function magWorked(example: string): { result: MagResult; rows: MagRow[]; cite: string } {
  const spec = presetSpec(example);
  const r = magnetics(spec);
  const p = MAG_PRESETS.find((x) => x.example === example)!;
  const entry = coreById(p.core)!;
  const fly = spec.device === 'flyback';
  const rows: MagRow[] = [];
  const given = (latex: string, meaning: Text, value: number | undefined, unit: string) => {
    if (value !== undefined) rows.push({ kind: 'given', latex, meaning, value, unit });
  };
  const c = (key: string) => cat(key);

  // the operating point and the windings, as the example gives them
  given(fly ? c('L_M').latex : 'L', fly ? c('L_M').meaning : c('L').meaning, spec.L, 'H');
  given(fly ? 'I_{p,\\mathrm{pk}}' : 'I_{L,\\mathrm{pk}}', tool(fly ? 'I_p,pk' : 'I_L,pk'), spec.Ipk, 'A');
  given(fly ? 'I_{p,\\mathrm{rms}}' : 'I_{L,\\mathrm{rms}}', tool(fly ? 'I_p,rms' : 'I_L,rms'), spec.Irms, 'A');
  given(c(fly ? 'Delta_i_M' : 'Delta_i_L').latex, c(fly ? 'Delta_i_M' : 'Delta_i_L').meaning, spec.dI, 'A');
  given(c('f_s').latex, c('f_s').meaning, spec.fs, 'Hz');
  given(c('B_max').latex, c('B_max').meaning, spec.Bmax, 'T');
  if (fly) {
    given(c('n').latex, c('n').meaning, spec.n, '1');
    given('I_{s,\\mathrm{rms}}', tool('I_s,rms'), spec.IrmsS, 'A');
  }
  given(c('T_w').latex, c('T_w').meaning, spec.Tw, '°C');
  given(c('b_w').latex, c('b_w').meaning, spec.bw, 'm');
  given('K_{u,\\mathrm{max}}', tool('K_u,max'), spec.KuMax, '1');
  if (fly) given(c('h_g').latex, c('h_g').meaning, spec.hg, 'm');
  const windings: [typeof spec.primary, Text | undefined][] = [[spec.primary, fly ? PRIMARY : undefined]];
  if (spec.secondary) windings.push([spec.secondary, SECONDARY]);
  for (const [w, which] of windings) {
    const m = (t: Text) => (which ? suffix(t, which) : t);
    given(c('d_w').latex, m(c('d_w').meaning), w.d, 'm');
    given('d_o', m(tool('d_o')), w.dOuter, 'm');
    given(c('k_s').latex, m(c('k_s').meaning), w.ks, '1');
    given(c('M_l').latex, m(tool('M_l')), w.layers, '1');
  }

  // the core's data sheet
  const core = (latex: string, meaning: Text, value: number, unit: string) => rows.push({ kind: 'core', latex, meaning, value, unit, cite: entry.cite });
  const k = spec.core;
  core(c('A_e').latex, c('A_e').meaning, k.Ae, 'm²');
  core('A_\\mathrm{min}', tool('A_min'), k.Amin ?? k.Ae, 'm²');
  core(c('l_e').latex, c('l_e').meaning, k.le, 'm');
  core('A_{L0}', tool('A_L0'), k.AL0, 'H');
  core(c('W_A').latex, c('W_A').meaning, k.WA, 'm²');
  core(c('MLT').latex, c('MLT').meaning, k.MLT, 'm');

  // the design
  const res = (latex: string, meaning: Text, value: number | undefined, unit: string, eq?: string, note?: Text) => {
    if (value !== undefined) rows.push({ kind: 'result', latex, meaning, value, unit, eq, note });
  };
  const N = fly ? 'N_p' : 'N';
  res('N_\\mathrm{min}', { en: 'fewest turns for B_max, at A_min', ko: 'B_max를 지키는 최소 턴 수, A_min 기준' }, r.Nmin, '1', 'mag.N_Bmax');
  res(N, fly ? tool('N_p') : c('N').meaning, r.N, '1', undefined, { en: 'rounded up', ko: '올림' });
  res(c('A_L').latex, { en: 'inductance factor the design needs', ko: '설계에 필요한 인덕턴스 계수' }, r.ALreq, 'H', 'mag.L_from_AL');
  res('\\mu_e', { en: 'effective permeability of the ungapped set', ko: '공극 없는 세트의 유효 투자율' }, r.mue, '1', 'mag.AL_gap');
  res(c('l_g').latex, { en: 'gap, without fringing', ko: '공극, 프린징 무시' }, r.gap, 'm', 'mag.gap_length');
  res(c('B_pk').latex, suffix(c('B_pk').meaning, { en: 'at A_min', ko: 'A_min 기준' }), r.BpkMin, 'T', 'mag.B_pk');
  res(c('B_ac').latex, c('B_ac').meaning, r.Bac, 'T', 'mag.B_ac');
  if (fly) res('N_s', { en: 'secondary turns', ko: '2차 턴 수' }, r.Ns, '1', undefined, { en: 'n N_p, rounded', ko: 'n N_p를 반올림' });
  res(c('rho_w').latex, suffix(c('rho_w').meaning, { en: 'at T_w', ko: 'T_w에서' }), r.rho, 'Ω·m', 'wind.rho_T');
  res(c('delta_s').latex, suffix(c('delta_s').meaning, { en: 'at f_s', ko: 'f_s에서' }), r.delta, 'm', 'wind.skin_depth');
  const ws: [WindingResult, Text | undefined][] = [[r.primary, fly ? PRIMARY : undefined]];
  if (r.secondary) ws.push([r.secondary, SECONDARY]);
  for (const [w, which] of ws) {
    const m = (t: Text) => (which ? suffix(t, which) : t);
    res(c('A_w').latex, m(c('A_w').meaning), w.Aw, 'm²', 'wind.round_area');
    res(c('R_dc').latex, m(c('R_dc').meaning), w.Rdc, 'Ω', 'wind.dcr');
    res(c('eta_p').latex, m(c('eta_p').meaning), w.eta, '1', 'wind.porosity');
    res(c('phi_l').latex, m(c('phi_l').meaning), w.phi, '1', 'wind.phi_round');
    res(c('F_R').latex, m(suffix(c('F_R').meaning, { en: 'at f_s', ko: 'f_s에서' })), w.FR, '1', 'wind.dowell');
    res('P_\\mathrm{dc}', m({ en: 'loss at the dc resistance', ko: '직류 저항에서의 손실' }), w.Pdc, 'W', 'loss.cond');
  }
  res(c('K_u').latex, fly ? suffix(c('K_u').meaning, { en: 'both windings', ko: '두 권선' }) : c('K_u').meaning, r.Ku, '1', 'wind.fill');
  if (fly) res(c('L_lk').latex, c('L_lk').meaning, r.Llk, 'H', spec.arrangement === 'psp' ? 'xfmr.leakage.psp' : 'xfmr.leakage.ps');
  return { result: r, rows, cite: entry.cite };
}
