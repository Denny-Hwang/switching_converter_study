import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import data from '../generated/falstad.json';
import { falstadCase, falstadCases } from './falstad';
import { getExample } from './examples';
import { simulatorHash } from './simpresets';

// FalstadLinks and FalstadLink render these links and files from src/generated/falstad.json;
// the repository links are not in the MDX, so repo-links.test.ts cannot see them.
const root = resolve(__dirname, '../..');

describe('the SPICE library in CircuitJS1 (src/generated/falstad.json)', () => {
  it('lists the seven cases of the SPICE library, each once', () => {
    const ids = falstadCases.map((c) => c.id);
    expect(ids).toEqual(['buck-ccm', 'buck-dcm', 'boost-ccm', 'buckboost-ccm', 'flyback-ccm', 'flyback-dcm', 'forward-ccm']);
  });

  it.each(falstadCases.map((c) => [c.id, c] as const))('%s: its circuit file, schematic and netlist exist', (_id, c) => {
    expect(existsSync(resolve(root, c.file))).toBe(true);
    expect(existsSync(resolve(root, `sim/ltspice/${c.topology}/${c.id}.asc`))).toBe(true);
    expect(existsSync(resolve(root, `sim/ngspice/${c.topology}/${c.id}.cir`))).toBe(true);
  });

  it.each(falstadCases.map((c) => [c.id, c] as const))('%s: a falstad.com link carrying the circuit', (_id, c) => {
    expect(c.link.startsWith(`${data.app}?ctz=`)).toBe(true);
    // lz-string's URI-safe alphabet; the compression itself is tested against lz-string (test_falstad.py)
    expect(c.link.slice(`${data.app}?ctz=`.length)).toMatch(/^[A-Za-z0-9+\-$]+$/);
  });

  it.each(falstadCases.map((c) => [c.id, c] as const))('%s: its example opens in the simulator', (_id, c) => {
    expect(getExample(c.example).label.toLowerCase()).toContain('example');
    expect(simulatorHash(c.example, c.topology)).toContain(`topo=${c.topology}`);
  });

  it.each(falstadCases.map((c) => [c.id, c] as const))('%s: every ideal value is one FalstadLinks can label', (_id, c) => {
    for (const [key, e] of Object.entries(c.expected)) {
      expect(key).toMatch(/^(v_out|i_L|v_sw)_(avg|max|min)$/);
      expect(Number.isFinite(e.value)).toBe(true);
      expect(c.measure[key.replace(/_(avg|max|min)$/, '')]).toBeDefined();
    }
  });

  it('refuses an unknown case', () => {
    expect(() => falstadCase('buck-xyz')).toThrow(/unknown CircuitJS1 case/);
  });
});
