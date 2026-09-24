import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import generated from '../equations/equations.generated.json';

// <Eq> links to these repository files on the default branch. lychee skips
// github.com/<repo>/blob/... (the target may only exist after merge), so
// this test proves the targets exist in the working tree instead.
const root = resolve(__dirname, '../../..');
const yamlLines = readFileSync(resolve(root, 'packages/pe-core/equations/equations.yaml'), 'utf8').split('\n');

describe('repository links used by <Eq>', () => {
  it.each(['packages/pe-core/test/parity.test.ts', 'packages/pe-core/equations/equations.yaml'])('%s exists', (p) => {
    expect(existsSync(resolve(root, p))).toBe(true);
  });

  it.each(Object.values(generated.equations).map((e) => [e.id, e.yaml_line] as const))(
    '%s: equations.yaml#L%i is the start of its entry',
    (id, line) => {
      expect(yamlLines[line - 1]).toContain(`id: ${id}`);
    },
  );
});

// Pages may link a repository file on the default branch as well (the gotcha
// template, for example); the same reasoning applies to those links.
function mdxFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((d) =>
    d.isDirectory() ? mdxFiles(join(dir, d.name)) : d.name.endsWith('.mdx') ? [join(dir, d.name)] : [],
  );
}
const BLOB = /https:\/\/github\.com\/Denny-Hwang\/switching_converter_study\/(?:blob|tree)\/main\/([^\s)"'#>]+)/g;
const pageLinks = mdxFiles(resolve(root, 'src/content/docs')).flatMap((f) =>
  [...readFileSync(f, 'utf8').matchAll(BLOB)].map((m) => [f.slice(root.length + 1), m[1]!] as const),
);

describe('repository links in the pages', () => {
  it('finds the links it checks', () => {
    expect(pageLinks.length).toBeGreaterThan(0);
  });
  it.each(pageLinks)('%s links %s, which exists', (_page, target) => {
    expect(existsSync(resolve(root, target))).toBe(true);
  });
});
