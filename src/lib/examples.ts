/**
 * Synthetic examples (examples/synthetic/*.yaml): the only non-textbook
 * numbers allowed on the site. Loaded at build time and evaluated by
 * pe-core's runSteps, so pages never contain hand-typed results.
 */
import yaml from 'js-yaml';
import { catalog, checkCondition, runSteps, type Context, type StepResult, type StepSpec } from 'pe-core';

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
  // PRIVACY_RULES.md: an example says so where it appears; the page footer says that its numbers are synthetic
  const label = String(data.label ?? '');
  const labelKo = String(data.label_ko ?? '');
  if (data.synthetic !== true || !label.toLowerCase().includes('example') || !labelKo.includes('예제')) {
    throw new Error(`examples/synthetic/${name}.yaml must declare synthetic: true and labels naming it an example ("example", "예제")`);
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

/**
 * The catalogue symbol a context name stands for: the name itself, or a
 * symbol with a suffix (`f_lo` is the frequency `f`, tagged "lo"), the
 * longest symbol that fits. Lets an example give one quantity twice (a meter
 * read at two frequencies) and still show its symbol, meaning and unit.
 */
export function symbolOf(name: string): { symbol: string; suffix: string } | undefined {
  if (catalog.symbols[name]) return { symbol: name, suffix: '' };
  let best: string | undefined;
  for (const s of Object.keys(catalog.symbols)) {
    if (name.startsWith(`${s}_`) && name.length > s.length + 1 && (!best || s.length > best.length)) best = s;
  }
  return best ? { symbol: best, suffix: name.slice(best.length + 1) } : undefined;
}
