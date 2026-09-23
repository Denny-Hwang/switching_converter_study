/**
 * Synthetic examples (examples/synthetic/*.yaml): the only non-textbook
 * numbers allowed on the site. Loaded at build time and evaluated by
 * pe-core's runSteps, so pages never contain hand-typed results.
 */
import yaml from 'js-yaml';
import { checkCondition, runSteps, type Context, type StepResult, type StepSpec } from 'pe-core';

export interface ExampleCheck {
  when: string;
  then: { en: string; ko: string };
  else: { en: string; ko: string };
}

export interface Example {
  name: string;
  label: string;
  label_ko: string;
  params: Context;
  steps: (string | StepSpec)[];
  checks: ExampleCheck[];
}

export interface EvaluatedExample extends Example {
  context: Context;
  results: StepResult[];
  checkResults: { when: string; ok: boolean; text: { en: string; ko: string } }[];
}

const raw = import.meta.glob('/examples/synthetic/*.yaml', { query: '?raw', import: 'default', eager: true }) as Record<
  string,
  string
>;

function parse(path: string, text: string): Example {
  const name = path.replace(/^.*\//, '').replace(/\.yaml$/, '');
  const data = yaml.load(text) as Record<string, unknown>;
  if (data.synthetic !== true || !String(data.label ?? '').toLowerCase().includes('synthetic')) {
    throw new Error(`examples/synthetic/${name}.yaml must declare synthetic: true and a label containing "synthetic"`);
  }
  const params = (data.params ?? {}) as Context;
  for (const [k, v] of Object.entries(params)) {
    if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`example ${name}: param ${k} must be a number (SI)`);
  }
  return {
    name,
    label: String(data.label),
    label_ko: String(data.label_ko ?? data.label),
    params,
    steps: (data.steps ?? []) as (string | StepSpec)[],
    checks: (data.checks ?? []) as ExampleCheck[],
  };
}

const cache = new Map<string, EvaluatedExample>();

export function exampleNames(): string[] {
  return Object.keys(raw)
    .map((p) => p.replace(/^.*\//, '').replace(/\.yaml$/, ''))
    .sort();
}

export function getExample(name: string): EvaluatedExample {
  const hit = cache.get(name);
  if (hit) return hit;
  const entry = Object.entries(raw).find(([p]) => p.endsWith(`/${name}.yaml`));
  if (!entry) throw new Error(`unknown synthetic example "${name}" (examples/synthetic/${name}.yaml)`);
  const ex = parse(entry[0], entry[1]);
  const { context, results } = runSteps(ex.params, ex.steps);
  const checkResults = ex.checks.map((c) => {
    const ok = checkCondition(c.when, context);
    return { when: c.when, ok, text: ok ? c.then : c.else };
  });
  const evaluated = { ...ex, context, results, checkResults };
  cache.set(name, evaluated);
  return evaluated;
}
