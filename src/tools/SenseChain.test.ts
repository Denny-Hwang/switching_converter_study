import { describe, expect, it } from 'vitest';
import { senseChain } from 'pe-core';
import { getExample } from '../lib/examples';
import { senseValues } from '../lib/sensepresets';
import { checkOf, hashOf, stateFromHash, toSenseSpec, type SensePreset } from './SenseChain';

const strings = (v: Record<string, number>): Record<string, string> =>
  Object.fromEntries(Object.entries(v).map(([k, x]) => [k, String(x)]));
const rel = (a: number, b: number) => Math.abs(a - b) / Math.abs(b);
const result = (example: string, name: string) => getExample(example).results.find((r) => r.name === name)!.value;

describe('sense-chain form', () => {
  const cur = strings(senseValues('sense-current'));
  const vol = strings(senseValues('sense-voltage'));

  it('reads the current-output example, and the tool agrees with its worked table', () => {
    const r = senseChain(toSenseSpec('current', cur)!);
    expect(rel(r.Vsense, result('sense-current', 'V_SENSE'))).toBeLessThan(1e-12);
    expect(rel(r.VoutImax, result('sense-current', 'V_OUT'))).toBeLessThan(1e-12);
    // the limits take the highest output: the pad resistance and the offset raise it
    expect(rel(r.VoutHi, result('sense-current', 'V_OUThi'))).toBeLessThan(1e-12);
    expect(r.VoutHi).toBeGreaterThan(r.VoutImax);
    expect(rel(r.Ios, result('sense-current', 'I_OSeq'))).toBeLessThan(1e-12);
    expect(rel(r.padError, result('sense-current', 'eps_pad'))).toBeLessThan(1e-12);
    expect(rel(r.errorAtImin, result('sense-current', 'eps_I'))).toBeLessThan(1e-12);
    expect(rel(r.Rfilt, result('sense-current', 'R_filt'))).toBeLessThan(1e-12);
    expect(rel(r.fc, result('sense-current', 'f_c'))).toBeLessThan(1e-12);
    expect(rel(r.fN, result('sense-current', 'f_N'))).toBeLessThan(1e-12);
    expect(rel(r.gainAtNyquist, result('sense-current', 'G_lp'))).toBeLessThan(1e-12);
    // the two-terminal shunt: the offset and the pad each miss the 1 % target at I_min
    expect(r.warnings).toEqual(['offset', 'pad']);
  });

  it('reads the voltage-output example, which meets its targets', () => {
    const r = senseChain(toSenseSpec('voltage', vol)!);
    expect(rel(r.Vsense, result('sense-voltage', 'V_SENSE'))).toBeLessThan(1e-12);
    expect(rel(r.VoutImax, result('sense-voltage', 'V_OUT'))).toBeLessThan(1e-12);
    expect(rel(r.VoutHi, result('sense-voltage', 'V_OUThi'))).toBeLessThan(1e-12);
    expect(rel(r.errorAtImin, result('sense-voltage', 'eps_I'))).toBeLessThan(1e-12);
    expect(rel(r.fc, result('sense-voltage', 'f_c'))).toBeLessThan(1e-12);
    expect(rel(r.gainAtNyquist, result('sense-voltage', 'G_lp'))).toBeLessThan(1e-12);
    expect(r.Rfilt).toBe(Number(vol.Rf));
    expect(r.limit).toBe('amp');
    expect(r.warnings).toEqual([]);
  });

  it('rejects a missing or out-of-range field; the zero-allowed fields may be 0', () => {
    expect(toSenseSpec('current', { ...cur, Rsense: '' })).toBeNull();
    expect(toSenseSpec('current', { ...cur, Rout: '0' })).toBeNull();
    expect(toSenseSpec('current', { ...cur, Imin: String(2 * Number(cur.Imax)) })).toBeNull();
    expect(toSenseSpec('current', { ...cur, VoutMax: '0' })).toBeNull();
    expect(toSenseSpec('voltage', { ...vol, VoutMin: vol.VoutMax })).toBeNull();
    expect(toSenseSpec('current', { ...cur, Vos: '-1e-4' })).toBeNull();
    for (const k of ['Rpad', 'Vos', 'VoutMin', 'Rf', 'Cf']) expect(toSenseSpec('current', { ...cur, [k]: '0' })).not.toBeNull();
    expect(toSenseSpec('voltage', { ...vol, Vref: '0' })).not.toBeNull();
    // each kind needs its own gain parts only
    expect(toSenseSpec('current', { ...cur, G: '', Vref: '' })).not.toBeNull();
    expect(toSenseSpec('voltage', { ...vol, Rin: '', Rout: '' })).not.toBeNull();
    expect(toSenseSpec('voltage', { ...vol, G: '' })).toBeNull();
  });

  it('the shunt rating and the burden limit are optional, and positive when given', () => {
    const s = toSenseSpec('current', { ...cur, Prating: '', VburdenMax: '' })!;
    expect(s.Prating).toBeUndefined();
    expect(s.VburdenMax).toBeUndefined();
    expect(toSenseSpec('current', { ...cur, Prating: '0' })).toBeNull();
    const low = checkOf('current', { ...cur, Prating: '0.01', VburdenMax: '0.01' })!;
    expect(low.warnings).toEqual(expect.arrayContaining(['shuntPower', 'burden']));
  });

  it('an empty or non-finite field, or an overflowing input, gives no result rather than an exception', () => {
    expect(checkOf('current', { ...cur, Imax: 'abc' })).toBeNull();
    expect(checkOf('current', { ...cur, Rsense: 'Infinity' })).toBeNull();
    expect(checkOf('current', { ...cur, Rout: '1e308', Rin: '1e-308' })).toBeNull();
    expect(checkOf('current', cur)).not.toBeNull();
  });

  it("a state whose charts would overflow gives no result, so a chart cannot unmount the tool on a state the URL keeps", () => {
    // the review's case: I_max/I_min beyond the double range, so the error curve's currents overflow
    expect(checkOf('current', { ...cur, Rsense: '1', Vos: '0', Imin: '1e-320' })).toBeNull();
  });

  it('a REF voltage above the amplifier\'s largest output leaves no range, and says so', () => {
    const r = checkOf('voltage', { ...vol, Vref: '3.25' })!;
    expect(r.Ifs).toBe(0);
    expect(r.warnings).toContain('noRange');
    expect(checkOf('voltage', vol)!.warnings).not.toContain('noRange');
  });

  it('the switching frequency is optional', () => {
    expect(checkOf('current', { ...cur, fsw: '' })!.gainAtFsw).toBeUndefined();
    expect(checkOf('current', { ...cur, fsw: '1e5' })!.gainAtFsw).toBeLessThan(0.02);
    expect(checkOf('current', { ...cur, fsw: '0' })).toBeNull();
  });
});

describe('sense-chain URL hash', () => {
  const presets: SensePreset[] = [
    { id: 'sense-current', label: 'current', kind: 'current', values: senseValues('sense-current') },
    { id: 'sense-voltage', label: 'voltage', kind: 'voltage', values: senseValues('sense-voltage') },
  ];

  it('round-trips the form, an emptied field included', () => {
    const values: Record<string, string> = { ...strings(senseValues('sense-voltage')), Rpad: '' };
    const back = stateFromHash(new URLSearchParams(hashOf('voltage', values)), presets);
    expect(back.kind).toBe('voltage');
    expect(back.values.Rpad).toBe('');
    expect(back.values.G).toBe(values.G);
  });

  it("a hash without the fields takes the amplifier kind's example", () => {
    const back = stateFromHash(new URLSearchParams('mon=voltage'), presets);
    expect(back.values.G).toBe(String(senseValues('sense-voltage').G));
    expect(stateFromHash(new URLSearchParams(''), presets).kind).toBe('current');
  });
});
