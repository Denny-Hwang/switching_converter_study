import { describe, expect, it } from 'vitest';
import generated from '../equations/equations.generated.json';
import vectors from '../equations/test_vectors.json';
import { constants } from '../src/constants';
import { evaluators } from '../src/equations';

const ids = Object.keys(generated.equations);

function relErr(a: number, b: number): number {
  const scale = Math.max(Math.abs(a), Math.abs(b));
  return scale === 0 ? 0 : Math.abs(a - b) / scale;
}

describe('equation catalogue coverage', () => {
  it('has an evaluator for every generated equation id, and no extras', () => {
    expect(Object.keys(evaluators).sort()).toEqual([...ids].sort());
  });

  it.each(ids)('%s: evaluator variables match equations.yaml', (id) => {
    const want = (generated.equations as Record<string, { variables: string[] }>)[id]!.variables;
    expect([...evaluators[id]!.vars].sort()).toEqual([...want].sort());
  });

  it.each(ids)('%s: has at least one test vector', (id) => {
    expect(vectors.vectors.some((v) => v.id === id)).toBe(true);
  });
});

describe('physical constants match equations.yaml', () => {
  it.each(Object.entries(generated.constants))('%s', (name, c) => {
    expect(constants[name]).toBeDefined();
    expect(relErr(constants[name]!, c.value)).toBeLessThanOrEqual(1e-15);
  });
});

describe('TypeScript/Python parity on shared vectors', () => {
  const tol = vectors.tolerance_rel;
  it.each(vectors.vectors.map((v, i) => [`${v.id} #${i} (${v.source})`, v] as const))('%s', (_name, v) => {
    const got = evaluators[v.id]!(v.inputs as Record<string, number>);
    expect(relErr(got, v.value), `got ${got}, want ${v.value}`).toBeLessThanOrEqual(tol);
  });
});
