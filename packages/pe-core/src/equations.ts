/**
 * Hand-written evaluators, one per equation id in equations.yaml.
 *
 * These are deliberately NOT generated from the YAML: they are an
 * independent implementation that the vitest parity test checks against
 * the sympy-computed vectors in equations/test_vectors.json (1e-9 relative).
 * All inputs and outputs are SI (see CLAUDE.md "Symbol conventions").
 */

export type Inputs = Readonly<Record<string, number>>;

export interface Evaluator {
  /** Names of the free symbols, exactly as in equations.yaml. */
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

export const evaluators: Readonly<Record<string, Evaluator>> = {
  // --- CCM conversion ratios (volt-second balance) -------------------------
  'buck.ccm.M': eq(['D'], ({ D }) => D),
  'boost.ccm.M': eq(['D'], ({ D }) => 1 / (1 - D)),
};

export function evaluate(id: string, inputs: Inputs): number {
  const fn = evaluators[id];
  if (!fn) throw new Error(`unknown equation id: ${id}`);
  return fn(inputs);
}
