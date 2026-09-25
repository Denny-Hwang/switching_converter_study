/**
 * The SPICE library's cases as CircuitJS1 circuits: src/generated/falstad.json, written by
 * scripts/falstad_library.py (share links, circuit files, and the ideal values that
 * scripts/falstad_check.mjs compares each circuit's last periods with).
 */
import data from '../generated/falstad.json';

export interface FalstadExpected {
  value: number;
  from: string;
}

export interface FalstadCase {
  id: string;
  topology: 'buck' | 'boost' | 'buckboost' | 'flyback' | 'forward';
  title: string;
  title_ko: string;
  example: string;
  file: string;
  link: string;
  /** the same circuit at the CI's speed (scripts/falstad_check.mjs); only the header's speed differs */
  check_link: string;
  Ts: number;
  periods: number;
  measure: Record<string, { node?: string; element?: number; sign?: number }>;
  expected: Record<string, FalstadExpected>;
}

export const FALSTAD_TOL: number = data.tol;
export const FALSTAD_STEPS: number = data.steps_per_period;
export const falstadCases: readonly FalstadCase[] = data.cases as FalstadCase[];

export function falstadCase(id: string): FalstadCase {
  const c = falstadCases.find((x) => x.id === id);
  if (!c) throw new Error(`unknown CircuitJS1 case "${id}" (src/generated/falstad.json: ${falstadCases.map((x) => x.id).join(', ')})`);
  return c;
}
