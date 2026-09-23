import { describe, expect, it } from 'vitest';
import { sim } from 'pe-core';
import { compareRows, fromSlider, nextAnchor, parseField, sliderAnchors, toParams } from './Simulator';

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

  it('re-anchor only on a committed value outside the range, never on a partial entry', () => {
    // typing 100000 over an anchor of 1e5 passes through 1, 10, ...; only the committed value counts
    expect(nextAnchor(1e5, '100000')).toBe(1e5);
    expect(nextAnchor(1e5, '2000000')).toBe(2e6);
    expect(nextAnchor(1e5, '5000')).toBe(5000);
    expect(nextAnchor(undefined, '5')).toBe(5);
    expect(nextAnchor(1e5, '')).toBe(1e5);
    expect(nextAnchor(1e5, '-3')).toBe(1e5);
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
    const rows = compareRows(sim.simulate(p));
    const byLabel = Object.fromEntries(rows.map((r) => [r.label, r]));
    expect(Object.keys(byLabel)).toEqual(['|M|', 'I_L', 'Δi_L,pp (on)', 'V_DS,max']);
    for (const r of rows) expect(Math.abs(r.sim - r.formula) / Math.abs(r.formula)).toBeLessThan(0.02);
    expect(byLabel['V_DS,max']!.eq).toBe('buck.Vds');
  });

  it('reports the pinned input of the source-driven flyback', () => {
    const p = toParams(
      { topo: 'flyback', load: 'fixed', source: true },
      { D: '0.2', fs: '10000', L: '0.02', n: '0.1', V: '5', VF: '0.5', Voc: '1000', Rs: '10000', Cbus: '0.00001' },
    );
    if ('error' in p) throw new Error('invalid');
    const rows = compareRows(sim.simulate(p));
    const vcrit = rows.find((r) => r.label === 'V_g,crit');
    expect(vcrit).toBeDefined();
    expect(Math.abs(vcrit!.sim - vcrit!.formula) / vcrit!.formula).toBeLessThan(0.02);
  });

  it('a source-driven flyback in DCM: no V_g,crit row, its input is a loss-free resistor', () => {
    const p = toParams(
      { topo: 'flyback', load: 'fixed', source: true },
      { D: '0.2', fs: '10000', L: '0.02', n: '0.1', V: '5', VF: '0.5', Voc: '150', Rs: '10000', Cbus: '0.00001' },
    );
    if ('error' in p) throw new Error('invalid');
    const r = sim.simulate(p);
    expect(r.mode).toBe('DCM');
    const rows = compareRows(r);
    expect(rows.find((x) => x.label === 'V_g,crit')).toBeUndefined();
    const rin = rows.find((x) => x.label === 'R_in')!;
    expect(rin.eq).toBe('lfr.R_in');
    expect(Math.abs(rin.sim - rin.formula) / rin.formula).toBeLessThan(0.02);
  });

  it('the ripple row is the on-interval rise, also when the node rings in DCM', () => {
    const r = sim.simulate({
      topology: 'flyback', Vg: 24, D: 0.3, fs: 1e5, n: 0.5, L: 2e-5, Ron: 0.05, Cnode: 1e-9,
      load: { kind: 'resistive', R: 50, C: 1e-4 },
    });
    expect(r.mode).toBe('DCM');
    expect(r.min.i_L!).toBeLessThan(0); // the ringing current goes negative
    const row = compareRows(r).find((x) => x.label === 'Δi_L,pp (on)')!;
    expect(Math.abs(row.sim - row.formula) / row.formula).toBeLessThan(0.02);
  });

  it('no ripple row when the ideal converter would not raise the current (the output held above the forward converter’s n V_g)', () => {
    const r = sim.simulate({ topology: 'forward', Vg: 48, D: 0.4, fs: 1e5, n: 0.5, nr: 1, LM: 1e-3, L: 1e-4, VF: 0.5, load: { kind: 'fixed', V: 30 } });
    expect(r.max.i_L!).toBe(0);
    expect(compareRows(r).find((x) => x.label === 'Δi_L,pp (on)')).toBeUndefined();
  });

  it('a boost whose only loss is the winding resistance is compared with boost.ccm.M_RL', () => {
    const r = sim.simulate({ topology: 'boost', Vg: 12, D: 0.5, fs: 1e5, L: 1e-4, RL: 0.2, load: { kind: 'resistive', R: 10, C: 1e-4 } });
    const m = compareRows(r).find((x) => x.label === '|M|')!;
    expect(m.eq).toBe('boost.ccm.M_RL');
    expect(Math.abs(m.sim - m.formula) / m.formula).toBeLessThan(0.005);
  });
});
