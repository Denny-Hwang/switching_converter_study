import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import yaml from 'js-yaml';
import { catalog } from 'pe-core';
import { describe, expect, it } from 'vitest';
import { exampleValue } from './examples';

/**
 * The missions' acceptance criteria (src/content/missions/<locale>/<id>.yaml): the same ids and
 * answer checks in every language (the progress in the browser is shared), and every answer check
 * a finite, non-zero value of a synthetic example with a unit, as <Mission /> needs it.
 * scripts/modulelint.py checks the pages that embed them.
 */
interface Criterion {
  id: string;
  text: string;
  check?: { example: string; name: string; tol: number };
}

const ROOT = resolve(__dirname, '../..');
const DIR = resolve(ROOT, 'src/content/missions');
const read = (locale: string, id: string) => (yaml.load(readFileSync(resolve(DIR, locale, `${id}.yaml`), 'utf8')) as { criteria: Criterion[] }).criteria;
const ids = readdirSync(resolve(DIR, 'en'))
  .filter((f) => f.endsWith('.yaml'))
  .map((f) => f.replace(/\.yaml$/, ''))
  .sort();

describe('mission criteria', () => {
  it('exist for the missions, in English and Korean', () => {
    expect(ids.length).toBeGreaterThan(0);
    for (const id of ids) expect(id).toMatch(/^m[1-9]$/);
    const ko = readdirSync(resolve(DIR, 'ko')).filter((f) => f.endsWith('.yaml'));
    for (const f of ko) expect(ids, `ko/${f} has no English file`).toContain(f.replace(/\.yaml$/, ''));
  });

  for (const id of ids) {
    it(`${id}: ids once each, the same ids and checks in Korean, every check a value with a unit`, () => {
      const en = read('en', id);
      expect(new Set(en.map((c) => c.id)).size).toBe(en.length);
      let ko: Criterion[] | undefined;
      try {
        ko = read('ko', id);
      } catch {
        ko = undefined; // Korean pending: modulelint requires STATUS to say so
      }
      if (ko) {
        expect(ko.map((c) => c.id)).toEqual(en.map((c) => c.id));
        expect(ko.map((c) => c.check ?? null)).toEqual(en.map((c) => c.check ?? null));
      }
      for (const c of en) {
        if (!c.check) continue;
        const { value, symbol } = exampleValue(c.check.example, c.check.name);
        expect(Number.isFinite(value) && value !== 0, `${id}.${c.id}: ${c.check.example}.${c.check.name} = ${value}`).toBe(true);
        expect(catalog.symbols[symbol]?.unit, `${id}.${c.id}: no unit for ${symbol}`).toBeDefined();
        expect(c.check.tol).toBeGreaterThan(0);
        expect(c.check.tol).toBeLessThanOrEqual(0.2);
      }
    });
  }
});
