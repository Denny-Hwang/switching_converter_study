/**
 * Typed access to equations.generated.json (generated from equations.yaml
 * by `python scripts/gen_equations.py`; never edited by hand).
 */
import generated from '../equations/equations.generated.json';

export interface EquationMeta {
  id: string;
  title: string;
  title_ko: string;
  /** Full display LaTeX, e.g. "M = \\frac{1}{1 - D}". */
  latex: string;
  lhs: string;
  /** The sympy source expression from equations.yaml. */
  expr: string;
  relation: 'eq' | 'approx';
  variables: string[];
  /** Physical constants appearing in the expression (not inputs). */
  constants: string[];
  symbols: Record<string, string>;
  assumptions: string[];
  convention: string;
  convention_ko: string;
  notes: string;
  notes_ko: string;
  cites: { key: string; where: string }[];
  derived_by: string | null;
  n_tests: number;
  yaml_line: number;
}

export interface SymbolMeta {
  latex: string;
  unit: string;
  desc: string;
  /** Range used for random test vectors (SI), also a sensible UI default. */
  range: [number, number] | null;
  scale: 'linear' | 'log';
}

export interface Catalog {
  sympy_version: string;
  schema_version: number;
  assumption_labels: Record<string, { en: string; ko: string }>;
  symbols: Record<string, SymbolMeta>;
  constants: Record<string, { value_expr: string; value: number }>;
  equations: Record<string, EquationMeta>;
}

export const catalog = generated as unknown as Catalog;

export function getEquation(id: string): EquationMeta {
  const eq = catalog.equations[id];
  if (!eq) throw new Error(`unknown equation id "${id}" (not in equations.generated.json)`);
  return eq;
}
