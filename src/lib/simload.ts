/**
 * The simulator's load choices, shared by the tool (a client island) and the
 * presets and "Try it" links (built from the examples at build time).
 * - res: the output capacitor with a resistor across it;
 * - bat: the output capacitor with a battery across it (its open-circuit
 *   voltage V_b behind its internal resistance R_b);
 * - batr: the same with a resistor too;
 * - cap: the output capacitor alone, charging from V_0;
 * - fixed: an ideal voltage V (no capacitor).
 */
export type LoadChoice = 'res' | 'bat' | 'batr' | 'cap' | 'fixed';
export const LOADS: LoadChoice[] = ['res', 'bat', 'batr', 'cap', 'fixed'];

/** The load choice that a set of simulator values describes (a preset's, or a link's). */
export function loadChoiceOf(values: Record<string, number>): LoadChoice {
  if (values.V !== undefined && values.R === undefined) return 'fixed';
  if (values.Vb !== undefined) return values.R !== undefined ? 'batr' : 'bat';
  if (values.V0 !== undefined) return 'cap';
  return 'res';
}
