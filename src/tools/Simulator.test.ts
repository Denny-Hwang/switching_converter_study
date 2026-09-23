import { describe, expect, it } from 'vitest';
import { sim } from 'pe-core';
import { compareRows, fromSlider, parseField, sliderAnchors, toParams } from './Simulator';

const buck = { topo: 'buck' as const, load: 'res' as const, source: false };
const values = { Vg: '24', D: '0.5', fs: '100000', L: '0.0001', R: '10', C: '0.00001' };

describe('simulator form', () => {
  it('an empty field is invalid, not zero', () => {
    expect(Number.isNaN(parseField(''))).toBe(true);
    expect(toParams(buck, { ...values, L: '' })).toEqual({ error: 'invalid' });
  });

  it('rejects a duty ratio outside (0, 1) and non-positive parameters', () => {
    expect(toParams(buck, { ...values, D: '1' })).toEqual({ error: 'invalid' });
    expect(toParams(buck, { ...values, R: '0' })).toEqual({ error: 'invalid' });
    expect(toParams(buck, { ...values, RL: '-0.1' })).toEqual({ error: 'invalid' });
  });

  it('leaves the non-ideal parts ideal when empty', () => {
    const p = toParams(buck, values);
    expect('error' in p).toBe(false);
    if ('error' in p) return;
    expect(p.Ron).toBe(0);
    expect(p.VF).toBe(0);
    expect(p.Cnode).toBe(0);
  });

  it('a node capacitance needs a positive on-resistance', () => {
    expect(toParams(buck, { ...values, Cnode: '1e-10' })).toEqual({ error: 'node' });
    expect('error' in toParams(buck, { ...values, Cnode: '1e-10', Ron: '0.05' })).toBe(false);
  });

  it('builds the source-driven fixed-output flyback', () => {
    const p = toParams(
      { topo: 'flyback', load: 'fixed', source: true },
      { D: '0.2', fs: '10000', L: '0.02', n: '0.1', V: '5', VF: '0.5', Voc: '1000', Rs: '10000', Cbus: '0.00001' },
    );
    expect('error' in p).toBe(false);
    if ('error' in p) return;
    expect(p.source).toEqual({ Voc: 1000, Rs: 10000, Cbus: 0.00001 });
    expect(p.load).toEqual({ kind: 'fixed', V: 5 });
  });
});

describe('sliders', () => {
  it('anchor only the positive fields', () => {
    expect(sliderAnchors({ D: '0.5', L: '', R: '10', Ron: '0', VF: 'x' })).toEqual({ D: 0.5, R: 10 });
  });

  it('move a decade either side of the anchor, to three significant digits', () => {
    expect(fromSlider(1e-4, 1)).toBe('0.001');
    expect(fromSlider(1e-4, -1)).toBe('0.00001');
    expect(fromSlider(10, 0.5)).toBe('31.6');
    expect(fromSlider(24, 0)).toBe('24');
  });
});

describe('compare panel', () => {
  it('matches the equations for an ideal CCM buck', () => {
    const p = toParams(buck, values);
    if ('error' in p) throw new Error('invalid');
    const rows = compareRows(p, sim.simulate(p));
    const byLabel = Object.fromEntries(rows.map((r) => [r.label, r]));
    expect(Object.keys(byLabel)).toEqual(['|M|', 'I_L', 'Δi_L,pp', 'V_DS,max']);
    for (const r of rows) expect(Math.abs(r.sim - r.formula) / Math.abs(r.formula)).toBeLessThan(0.02);
    expect(byLabel['V_DS,max']!.eq).toBe('buck.Vds');
  });

  it('reports the pinned input of the source-driven flyback', () => {
    const p = toParams(
      { topo: 'flyback', load: 'fixed', source: true },
      { D: '0.2', fs: '10000', L: '0.02', n: '0.1', V: '5', VF: '0.5', Voc: '1000', Rs: '10000', Cbus: '0.00001' },
    );
    if ('error' in p) throw new Error('invalid');
    const rows = compareRows(p, sim.simulate(p));
    const vcrit = rows.find((r) => r.label === 'V_g,crit');
    expect(vcrit).toBeDefined();
    expect(Math.abs(vcrit!.sim - vcrit!.formula) / vcrit!.formula).toBeLessThan(0.02);
  });
});
