/**
 * Worked-example chains: evaluate a list of equations in order, feeding each
 * result into the context under the equation's lhs symbol (or an alias).
 * Used at build time by the site's <Worked>/<Val> components so that every
 * number on a page is computed by pe-core, never typed by hand.
 */
import { getEquation } from './catalog';
import { evaluate } from './equations';

export interface StepSpec {
  /** Equation id from equations.yaml. */
  eq: string;
  /** Store the result under this name instead of the equation's lhs. */
  as?: string;
  /** Map equation input symbols to other context names, e.g. {M: 'M_dcm'}. */
  bind?: Record<string, string>;
}

export interface StepResult {
  eq: string;
  /** Context name the result was stored under. */
  name: string;
  /** The equation's lhs symbol (for display: LaTeX and unit). */
  symbol: string;
  value: number;
  inputs: Record<string, number>;
}

export type Context = Record<string, number>;

export function normaliseStep(step: string | StepSpec): StepSpec {
  return typeof step === 'string' ? { eq: step } : step;
}

export function runSteps(params: Context, steps: readonly (string | StepSpec)[]): { context: Context; results: StepResult[] } {
  const context: Context = { ...params };
  const results: StepResult[] = [];
  for (const raw of steps) {
    const step = normaliseStep(raw);
    const meta = getEquation(step.eq);
    const inputs: Record<string, number> = {};
    for (const v of meta.variables) {
      const source = step.bind?.[v] ?? v;
      const val = context[source];
      if (val === undefined) {
        throw new Error(`step ${step.eq}: input "${v}" (from "${source}") is not defined by the params or an earlier step`);
      }
      inputs[v] = val;
    }
    const value = evaluate(step.eq, inputs);
    if (!Number.isFinite(value)) throw new Error(`step ${step.eq}: non-finite result`);
    const name = step.as ?? meta.lhs;
    context[name] = value;
    results.push({ eq: step.eq, name, symbol: meta.lhs, value, inputs });
  }
  return { context, results };
}

/** Evaluate a comparison such as "K > K_crit" against a context. */
export function checkCondition(expr: string, context: Context): boolean {
  const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*(<=|>=|<|>)\s*([A-Za-z_][A-Za-z0-9_]*|[-+]?\d+(?:\.\d+)?(?:e[-+]?\d+)?)\s*$/i.exec(expr);
  if (!m) throw new Error(`unsupported check "${expr}" (use "a > b", "a < b", "a >= b" or "a <= b")`);
  const [, a, op, b] = m as unknown as [string, string, string, string];
  const lhs = context[a];
  const rhs = /^[-+]?\d/.test(b) ? Number(b) : context[b];
  if (lhs === undefined || rhs === undefined) throw new Error(`check "${expr}": unknown name`);
  switch (op) {
    case '<':
      return lhs < rhs;
    case '>':
      return lhs > rhs;
    case '<=':
      return lhs <= rhs;
    default:
      return lhs >= rhs;
  }
}
