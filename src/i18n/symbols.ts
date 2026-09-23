/**
 * What each symbol in the tools' input labels and tables means, in a few
 * words (EN and KO). A symbol of the equation catalogue takes the catalogue's
 * own `meaning`, so the tools and the equations say the same thing; the
 * others are the tools' own quantities (limits, targets, ratings).
 */
import { catalog } from 'pe-core';

type Meaning = { en: string; ko: string };

function cat(key: string): Meaning {
  const s = catalog.symbols[key];
  if (!s) throw new Error(`symbols.ts: ${key} is not a catalogue symbol`);
  return { en: s.meaning, ko: s.meaning_ko };
}

export const TOOL_SYMBOLS: Record<string, Meaning> = {
  A_e: cat('A_e'),
  C: cat('C'),
  C_bus: cat('C_bus'),
  C_f: cat('C_f'),
  C_node: cat('C_node'),
  D: cat('D'),
  G: cat('G_sense'),
  I_L: cat('I_L'),
  I_PP: cat('I_PP'),
  I_max: { en: 'largest current to measure', ko: '측정할 최대 전류' },
  I_min: cat('I_min'),
  I_pk: { en: 'peak primary current', ko: '1차 피크 전류' },
  K: cat('K'),
  K_crit: cat('K_crit'),
  L: cat('L'),
  L_M: cat('L_M'),
  L_lk: cat('L_lk'),
  N: cat('N'),
  P: { en: 'full-load output power', ko: '전부하 출력 전력' },
  'P_min (CCM)': {
    en: 'lowest power that must stay in CCM',
    ko: 'CCM을 유지해야 하는 최소 전력',
  },
  P_rated: { en: 'shunt power rating', ko: '션트 정격 전력' },
  Q_g: cat('Q_g'),
  R: cat('R'),
  R_IN: cat('R_IN'),
  R_L: cat('R_L'),
  R_OUT: cat('R_OUT'),
  R_SENSE: cat('R_SENSE'),
  R_clamp: cat('R_clamp'),
  R_f: cat('R_f'),
  R_in: cat('R_in'),
  R_on: { en: 'switch on-resistance', ko: '스위치 온 저항(on-resistance)' },
  R_pad: { en: 'pad and solder resistance (0 with a Kelvin connection)', ko: '패드·납땜 저항 (켈빈 연결이면 0)' },
  R_s: cat('R_s'),
  V: cat('V'),
  '|V|': { en: 'output voltage magnitude', ko: '출력 전압의 크기' },
  V_BR: cat('V_BR'),
  V_CL: cat('V_CL'),
  V_D: cat('V_D'),
  'V_DS,max': { en: 'largest switch voltage', ko: '최대 스위치 전압' },
  'V_DS,rated': cat('V_rating'),
  V_F: cat('V_F'),
  V_FS: cat('V_FS'),
  V_GS: cat('V_GS'),
  'V_OUT,max': cat('V_OUTmax'),
  'V_OUT,min': cat('V_OUTmin'),
  V_REF: cat('V_REF'),
  'V_SENSE,max': {
    en: 'largest shunt voltage allowed',
    ko: '허용하는 최대 션트 전압',
  },
  V_e: cat('V_e'),
  V_g: cat('V_g'),
  'V_g,crit': cat('V_gcrit'),
  'V_g,max': { en: 'highest input voltage', ko: '최고 입력 전압' },
  'V_g,min': { en: 'lowest input voltage', ko: '최저 입력 전압' },
  V_oc: cat('V_oc'),
  f_env: { en: 'envelope frequency', ko: '포락선(envelope) 주파수' },
  f_s: cat('f_s'),
  f_samp: cat('f_samp'),
  f_sw: { en: "converter's switching frequency", ko: '컨버터의 스위칭 주파수' },
  k: cat('k'),
  n: cat('n'),
  'n = N_s/N_p': cat('n'),
  n_r: cat('n_r'),
  'n_r = N_r/N_p': cat('n_r'),
  r_d: cat('r_d'),
  '|M|': { en: 'conversion ratio magnitude', ko: '변환비의 크기' },
  '|V_OS|': {
    en: 'offset magnitude (data sheet)',
    ko: '오프셋 전압의 크기(데이터시트)',
  },
  'Δi_L / I_L': {
    en: 'ripple target: half peak-to-peak over dc',
    ko: '리플 목표: 피크-피크의 절반 ÷ 직류',
  },
  'Δi_M / I_M': {
    en: 'magnetizing ripple target: half peak-to-peak over dc',
    ko: '자화 전류 리플 목표: 피크-피크의 절반 ÷ 직류',
  },
  'Δi_L,pp (on)': {
    en: 'inductor current rise while on',
    ko: '온 구간의 인덕터 전류 상승폭',
  },
  'Δv / V': {
    en: 'output ripple target: half peak-to-peak over V',
    ko: '출력 리플 목표: 피크-피크의 절반 ÷ V',
  },
  α: cat('alpha'),
  β: cat('beta'),
  ε_max: cat('eps_max'),
};

/** Every tool symbol's meaning in one language, for an island's props. */
export function toolSymbols(locale: 'en' | 'ko'): Record<string, string> {
  return Object.fromEntries(Object.entries(TOOL_SYMBOLS).map(([k, m]) => [k, m[locale]]));
}
