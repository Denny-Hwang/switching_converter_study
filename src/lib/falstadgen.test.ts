import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import data from '../generated/falstad.json';
import { falstadCases } from './falstad';
import { currentBar, falstadLink, falstadText, num, type FalstadParams } from './falstadgen';
import { compressToEncodedURIComponent } from './lzstring';
import { presetValues } from './simpresets';

/**
 * The TypeScript generator against scripts/falstad_library.py: for the SPICE library's seven cases it
 * must write the committed circuit files (sim/falstad/*.txt) character for character, and their links,
 * given the same values and the same start. The Python script checks those circuits' wiring against the
 * SPICE netlists and the CI runs them in CircuitJS1, so an identical text inherits both checks.
 */
const root = resolve(__dirname, '../..');

// made with lz-string's own compressToEncodedURIComponent (as in python/pe_core/tests/test_falstad.py)
const VECTORS: [string, string][] = [
  ['', 'Q'],
  ['a', 'IZA'],
  ['hello world', 'BYUwNmD2AEDukCcwBMg'],
  ['aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 'IY18ZVkA'],
  ['$ 1 2e-08 1000 50 24 50 5e-11\nw 80 176 176 176 0\nr 464 176 464 336 0 10\n', 'CQAgjCBMCmC0AMAOc9UgKzygFg19cYYAUAO4iJZgDsAbOHQ-fMQE4ja2432e4DM-ZimJA'],
  ['Ω µ 한글 °C', 'pXAAIK0oOquAB1IA0GEg'],
  ['😀 emoji', 'rwbgA9gECmC2D2BWBLIA'],
];

describe('lz-string', () => {
  it.each(VECTORS)('%j compresses as lz-string does', (text, want) => {
    expect(compressToEncodedURIComponent(text)).toBe(want);
  });
});

describe('num: numbers as Python writes them and CircuitJS1 reads them', () => {
  it.each([
    [0, '0'],
    [12, '12'],
    [0.9, '0.9'],
    [-12, '-12'],
    [2e-8, '2e-08'],
    [1e-4, '0.0001'],
    [1e-5, '1e-05'],
    [1.5e-5, '1.5e-05'],
    [1e6, '1000000'],
    [1e16, '1e16'],
    [1.25e21, '1.25e21'],
    [3.125, '3.125'],
    [0.1 + 0.2, '0.30000000000000004'],
    [123456.789, '123456.789'],
    [0.186667, '0.186667'],
  ])('%s -> %s', (x, want) => {
    expect(num(x)).toBe(want);
  });
});

/** The values, start and current bar of a committed circuit file. */
function fromFile(text: string) {
  const lines = text.split('\n');
  const tok = (kind: string) => lines.find((l) => l.startsWith(`${kind} `))?.split(' ');
  return {
    bar: Number(lines[0]!.split(' ')[4]),
    vOut: Number(tok('c')![7]),
    iL: Number(tok('l')?.[8] ?? 0),
    iM: Number(tok('T')?.[8] ?? 0),
  };
}

describe('the SPICE library in CircuitJS1: the same circuits as scripts/falstad_library.py', () => {
  it.each(falstadCases.map((c) => [c.id, c] as const))('%s: the committed circuit and its link', (_id, c) => {
    const want = readFileSync(resolve(root, c.file), 'utf8');
    const v = presetValues(c.example, c.topology);
    const p: FalstadParams = {
      topology: c.topology,
      Vg: v.Vg!,
      D: v.D!,
      fs: v.fs!,
      L: v.L!,
      C: v.C!,
      R: v.R!,
      n: v.n,
      nr: v.nr,
      Lm: c.topology === 'flyback' ? v.L : v.LM,
    };
    const f = fromFile(want);
    const text = falstadText(p, { vOut: f.vOut, iL: f.iL, iM: f.iM }, { bar: f.bar });
    expect(text).toBe(want);
    expect(falstadLink(text)).toBe(c.link);
    expect(data.app).toBe('https://www.falstad.com/circuit/circuitjs.html');
    // the bar from the load current: the Python script's, from the ideal output voltage
    expect(currentBar(f.vOut / p.R)).toBe(f.bar);
  });
});
