/**
 * External learning resources (resources.yaml at the repository root).
 * Every entry was verified (URL opened / title matched, see
 * scripts/resources_check.py) and carries a retrieval date.
 */
import yaml from 'js-yaml';
import raw from '../../resources.yaml?raw';

export interface Resource {
  id: string;
  type: string;
  title: string;
  author: string;
  url: string;
  tags: string[];
  level: 'intro' | 'intermediate' | 'advanced';
  language: 'en' | 'ko';
  retrieved: string;
  why: string;
  why_ko: string;
  title_match: string;
  urlkind?: 'html' | 'pdf' | 'login';
  cite?: string;
}

/** YAML reads an unquoted 2026-09-23 as a Date; show it as that date again. */
function isoDate(value: unknown): string {
  return value instanceof Date ? value.toISOString().slice(0, 10) : String(value);
}

const data = yaml.load(raw) as { resources: Resource[] };
export const resources: readonly Resource[] = data.resources.map((r) => ({ ...r, retrieved: isoDate(r.retrieved) }));

export function getResource(id: string): Resource {
  const r = resources.find((x) => x.id === id);
  if (!r) throw new Error(`unknown resource id "${id}" (resources.yaml)`);
  return r;
}
