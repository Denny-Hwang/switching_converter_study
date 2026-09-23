import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
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
