import { describe, expect, it } from 'vitest';
import { sim } from 'pe-core';
import { ui } from '../i18n/ui';
import { fmtValue } from '../lib/format';
import { compareRows, falstadFor, fillShown, fromSlider, hashOf, loadRows, nextAnchor, noSteadyText, outsideModelText, parseField, sliderAnchors, stateFromHash, toParams, type SimLabels, type SimPreset } from './Simulator';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PRESETS, presetValues, simulatorHash } from '../lib/simpresets';
import { falstadCases } from '../lib/falstad';

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

describe('values as a datasheet writes them', () => {
  it('SI prefixes and units give the same parameters as base units', () => {
    const typed = { Vg: '24 V', D: '50 %', fs: '100k', L: '100 µH', R: '10 Ω', C: '10u', Ron: '5m' };
    const p = toParams(buck, typed);
    const q = toParams(buck, { ...values, Ron: '0.005' });
    expect('error' in p).toBe(false);
    if ('error' in p || 'error' in q) return;
    expect(p.Vg).toBe(24);
    expect(p.D).toBeCloseTo(0.5, 15);
    expect(p.fs).toBeCloseTo(q.fs, 9);
    expect(p.L / q.L).toBeCloseTo(1, 12);
    expect(p.Ron! / q.Ron!).toBeCloseTo(1, 12);
    expect(p.load).toEqual({ kind: 'resistive', R: 10, C: expect.closeTo(1e-5, 18) });
  });

  it('text that is not a number is invalid, not zero', () => {
    expect(toParams(buck, { ...values, L: '100 x' })).toEqual({ error: 'invalid' });
    expect(toParams(buck, { ...values, Ron: 'abc' })).toEqual({ error: 'invalid' });
  });
});

describe('a new load or source', () => {
  const presets: SimPreset[] = PRESETS.map((p) => ({ id: p.id, label: p.en, topology: p.topology, values: presetValues(p.example, p.topology) }));

  it('fills each field it shows that is empty from an example, and leaves typed and non-ideal fields alone', () => {
    const bat = { topo: 'buck' as const, load: 'batr' as const, source: false };
    const filled = fillShown(bat, { ...values, R: '22' }, presets);
    // the battery's two values come from the buck's battery preset; R, typed, and R_on, ideal, stay
    const from = presets.find((p) => p.topology === 'buck' && p.values.Vb !== undefined)!;
    expect(filled).toEqual({ Vb: String(from.values.Vb), Rb: String(from.values.Rb) });
    expect('error' in toParams(bat, { ...values, R: '22', ...filled })).toBe(false);
  });

  it('switching the source on fills the source from a preset of any topology that has one', () => {
    const src = { topo: 'buck' as const, load: 'res' as const, source: true };
    const filled = fillShown(src, values, presets);
    const from = presets.find((p) => p.values.Voc !== undefined)!;
    expect(filled).toEqual({ Voc: String(from.values.Voc), Rs: String(from.values.Rs), Cbus: String(from.values.Cbus) });
    expect('error' in toParams(src, { ...values, ...filled })).toBe(false);
  });

  it('every load and source of every topology has a complete form after the fill', () => {
    for (const p of presets) {
      const base = Object.fromEntries(Object.entries(p.values).map(([k, v]) => [k, String(v)]));
      for (const load of ['res', 'bat', 'batr', 'cap', 'fixed'] as const) {
        for (const source of [false, true]) {
          const fs = { topo: p.topology, load, source };
          const form = { ...base, ...fillShown(fs, base, presets) };
          expect(toParams(fs, form), `${p.id} ${load} ${source}`).not.toEqual({ error: 'invalid' });
        }
      }
    }
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

  it('the ripple row is the rise over the on-interval, also when a large node capacitance makes the current peak after turn-off', () => {
    const r = sim.simulate({
      topology: 'boost', Vg: 12, D: 0.2, fs: 1e5, L: 2e-5, Ron: 0.05, Cnode: 1e-7,
      load: { kind: 'resistive', R: 100, C: 1e-5 },
    });
    const row = compareRows(r).find((x) => x.label === 'Δi_L,pp (on)')!;
    expect(r.max.i_L! - (r.waveforms.i_L as number[])[0]!).toBeGreaterThan(1.2 * row.formula);
    expect(Math.abs(row.sim - row.formula) / row.formula).toBeLessThan(0.01);
  });

  it('a boost whose only loss is the winding resistance is compared with boost.ccm.M_RL', () => {
    const r = sim.simulate({ topology: 'boost', Vg: 12, D: 0.5, fs: 1e5, L: 1e-4, RL: 0.2, load: { kind: 'resistive', R: 10, C: 1e-4 } });
    const m = compareRows(r).find((x) => x.label === '|M|')!;
    expect(m.eq).toBe('boost.ccm.M_RL');
    expect(Math.abs(m.sim - m.formula) / m.formula).toBeLessThan(0.005);
  });
});

describe('simulator URL hash', () => {
  const presets: SimPreset[] = [
    { id: 'b', label: 'b', topology: 'buck', values: { Vg: 24, D: 0.5, fs: 1e5, L: 1e-4, R: 10, C: 1e-5, Ron: 0.05, RL: 0.02 } },
  ];

  it('an emptied non-ideal part stays empty (ideal) through the hash; a missing one takes the preset', () => {
    const values: Record<string, string> = { Vg: '24', D: '0.5', fs: '100000', L: '0.0001', R: '10', C: '0.00001', Ron: '', RL: '0.02' };
    const back = stateFromHash(new URLSearchParams(hashOf(buck, values)), presets);
    expect(back.fs).toEqual(buck);
    expect(back.values.Ron).toBe('');
    expect(back.values.RL).toBe('0.02');
    expect(toParams(back.fs, back.values)).toEqual(toParams(buck, values));
    // a link that names only some fields (a "Try it" link) takes the rest from the preset
    expect(stateFromHash(new URLSearchParams('topo=buck&D=0.4'), presets).values.Ron).toBe('0.05');
  });
});

describe('what the simulator says without a steady state', () => {
  const t = ui.en;
  const labels = {
    runaway: t['sim.runaway'],
    inductorCurrent: t['sim.inductorCurrent'],
    magnetizingCurrent: t['sim.magnetizingCurrent'],
    rises: t['sim.rises'],
    falls: t['sim.falls'],
    balance: t['sim.balance'],
    noReset: t['sim.noReset'],
    startUp: t['sim.startUp'],
    charging: t['sim.charging'],
    settling: t['sim.settling'],
    unsettled: t['sim.unsettled'],
  } as SimLabels;
  const fs = 1e5;

  it('a runaway: the current, its change per cycle, the average inductor voltage, the balancing duty ratio', () => {
    const r = sim.simulate({ topology: 'buck', Vg: 24, D: 0.8, fs, L: 1e-4, load: { kind: 'fixed', V: 12 } });
    const text = noSteadyText(r, labels)!;
    expect(text).toContain('inductor current rises by 720 mA every cycle');
    expect(text).toContain('an average of 7.2 V instead of 0 V');
    expect(text).toContain('CCM needs D = 0.5');
    expect(text).toContain(`first ${r.startUp!.cycles} cycles`);
  });

  it("a forward converter's core that does not reset: the magnetizing current and the reset limit", () => {
    const r = sim.simulate({ topology: 'forward', Vg: 24, D: 0.7, fs, L: 1e-4, n: 0.5, nr: 1, LM: 1e-3, load: { kind: 'fixed', V: 8 } });
    const text = noSteadyText(r, labels)!;
    expect(text).toContain('magnetizing current rises');
    expect(text).toContain('D_max = 0.5');
    expect(text).not.toContain('CCM needs');
  });

  it('a capacitor that charges without bound, and one that has not settled yet', () => {
    const charging = sim.simulate({ topology: 'boost', Vg: 12, D: 0.3, fs, L: 1e-4, load: { kind: 'network', C: 1e-5, V0: 0 } });
    expect(noSteadyText(charging, labels)).toContain('still gains');
    // a forward converter's large capacitor creeping up to n V_g, and one cycle of search after its start-up
    const settling = sim.simulate({ topology: 'forward', Vg: 48, D: 0.4, fs, L: 1e-4, n: 0.5, nr: 1, LM: 1e-3, load: { kind: 'network', C: 1e-2, V0: 0 } }, { maxCycles: 1 });
    expect(settling.status).toBe('unsettled');
    expect(noSteadyText(settling, labels)).toContain('has not settled');
  });

  it('another search cut short, and a steady state (no text)', () => {
    const p: sim.SimParams = { topology: 'buck', Vg: 24, D: 0.3, fs, L: 2e-5, load: { kind: 'resistive', R: 50, C: 22e-6 } };
    const cut = sim.simulate(p, { maxCycles: 1 });
    expect(noSteadyText(cut, labels)).toContain('No periodic steady state within the cycle limit');
    expect(noSteadyText(sim.simulate(p), labels)).toBeNull();
  });

  it('outside the model: each diode the model holds off, then the switch voltage, each with its own number', () => {
    const out = {
      ...labels,
      switchBelowZero: t['sim.switchBelowZero'],
      diodeForward: t['sim.diodeForward'],
      diodeD: t['sim.diode.D'],
      diodeD1: t['sim.diode.D1'],
      diodeD2: t['sim.diode.D2'],
      resetDiodeForward: t['sim.resetDiodeForward'],
      outsidePeriod: t['sim.outside.period'],
      outsideStartUp: t['sim.outside.startUp'],
      outsideResults: t['sim.outside.results'],
      outsideStartUpFrom: t['sim.outside.startUpFrom'],
    } as SimLabels;
    // a buck on a weak source: its freewheeling diode would conduct while the switch is on; the switch voltage stays up
    const buck = sim.simulate({ topology: 'buck', Vg: 24, D: 0.5, fs, L: 1e-5, Ron: 0.05, VF: 0.5, source: { Voc: 24, Rs: 50, Cbus: 1e-8 }, load: { kind: 'resistive', R: 0.5, C: 1e-5 } });
    expect(buck.diodes![0]!.v).toBeGreaterThan(8.28);
    expect(buck.diodes![0]!.v).toBeLessThan(8.29);
    expect(outsideModelText(buck, out)).toBe(
      t['sim.diodeForward']!.replace('{diode}', 'the diode D').replace('{v}', '8.288 V').replace('{vf}', '500 mV').replace('{where}', 'within the period (counting the solution between the drawn samples)').replace('{holds}', 'so these results may not hold'),
    );
    // a buck-boost on a weak source: both, the diode first
    const bb = sim.simulate({ topology: 'buckboost', Vg: 24, D: 0.6, fs, L: 1e-4, Ron: 0.05, source: { Voc: 24, Rs: 20, Cbus: 1e-7 }, load: { kind: 'resistive', R: 5, C: 1e-5 } });
    const both = outsideModelText(bb, out)!;
    expect(both.indexOf('The voltage across the diode D')).toBe(0);
    const bbSwitch = t['sim.switchBelowZero']!.replace('{v}', fmtValue(bb.switchBelowZero, 'V')).replace('{where}', 'within the period (counting the solution between the drawn samples)').replace('{holds}', 'so these results may not hold');
    expect(bbSwitch).toMatch(/^The switch voltage falls to −[0-9.]+ m?V within the period \(counting the solution between the drawn samples\), below 0 V: /);
    expect(both.endsWith(` ${bbSwitch}`)).toBe(true);
    // the switch voltage alone
    expect(outsideModelText({ ...bb, diodes: undefined }, out)).toBe(bbSwitch);
    // a start-up: from the first cycle that leaves the model (a boost charging a capacitor alone from a weak source)
    const boost = sim.simulate({ topology: 'boost', Vg: 5.11, D: 0.234, fs, L: 1.71e-5, source: { Voc: 5.11, Rs: 13.1, Cbus: 7.21e-7 }, load: { kind: 'network', C: 8.53e-6, V0: 0 } });
    expect(boost.switchFrom).toBeGreaterThanOrEqual(1);
    expect(outsideModelText(boost, out)).toContain(`The switch voltage falls to ${fmtValue(boost.switchBelowZero, 'V')} in the start-up, first in cycle ${boost.switchFrom}, below 0 V: `);
    expect(outsideModelText(boost, out)).toContain('so the start-up may not hold from that cycle on.');
    // the forward converter names its reset diode
    const fwd = sim.simulate({ topology: 'forward', Vg: 48, D: 0.7, fs, L: 1e-4, n: 0.5, nr: 1, LM: 1e-3, Ron: 0.01, source: { Voc: 48, Rs: 10, Cbus: 1e-6 }, load: { kind: 'resistive', R: 10, C: 1e-5 } });
    expect(outsideModelText(fwd, out)).toContain('The voltage across the reset diode D_3 rises to');
    // and its freewheeling diode, with its forward voltage (the fifth review's circuit with V_F)
    const d2 = sim.simulate({ topology: 'forward', Vg: 11.1, D: 0.353, fs: 72600, L: 5.22e-6, n: 2.52, nr: 0.542, LM: 3.66e-3, Ron: 0.379, VF: 0.624, load: { kind: 'network', C: 1.81e-6, R: 3.22, battery: { V: 3.39, R: 1.58 } }, source: { Voc: 11.1, Rs: 1.5, Cbus: 1.02e-6 } });
    const text = outsideModelText(d2, out)!;
    expect(text.indexOf('The voltage across the freewheeling diode D_2 rises to ')).toBe(0);
    expect(text).toContain('above its forward voltage of 624 mV');
    // the Korean messages name each diode too
    const ko = ui.ko;
    const outKo = { ...out, diodeForward: ko['sim.diodeForward'], diodeD: ko['sim.diode.D'], diodeD1: ko['sim.diode.D1'], diodeD2: ko['sim.diode.D2'], outsidePeriod: ko['sim.outside.period'], outsideResults: ko['sim.outside.results'] } as SimLabels;
    expect(outsideModelText(d2, outKo)).toContain('환류 다이오드 D_2 양단 전압이 순방향 전압 624 mV보다 높은');
    expect(outsideModelText(d2, outKo)).toContain('이 결과는 성립하지 않을 수 있습니다.');
    // and the switch voltage, in its own words
    const outKoSwitch = { ...outKo, switchBelowZero: ko['sim.switchBelowZero'] } as SimLabels;
    const bbSwitchKo = ko['sim.switchBelowZero']!.replace('{v}', fmtValue(bb.switchBelowZero, 'V')).replace('{where}', ko['sim.outside.period']!).replace('{holds}', ko['sim.outside.results']!);
    // the whole message, placeholders filled: a misspelled one would stay in braces
    expect(bbSwitchKo).toMatch(/^주기 안에서\(그려진 표본 사이의 해까지 포함해\) 스위치 전압이 0 V보다 낮은 −[0-9.]+ m?V까지 내려갑니다\. 스위치의 바디 다이오드\(모델에서는 이상적인 다이오드\)라면 여기서 도통하는데, 이 모델은 그것을 넣지 않으므로 이 결과는 성립하지 않을 수 있습니다\.$/);
    expect(bbSwitchKo).not.toMatch(/[{}]/);
    expect(outsideModelText({ ...bb, diodes: undefined }, outKoSwitch)).toBe(bbSwitchKo);
    // an ordinary circuit: nothing
    expect(outsideModelText(sim.simulate({ topology: 'buck', Vg: 24, D: 0.3, fs, L: 2e-5, load: { kind: 'resistive', R: 50, C: 22e-6 } }), out)).toBeNull();
  });

});

describe('the load table', () => {
  const fs = 1e5;
  it("splits a battery's power into its open-circuit voltage's and its resistance's, which add up to what the terminals take", () => {
    const r = sim.simulate({ topology: 'buck', Vg: 24, D: 0.6, fs, L: 1e-4, load: { kind: 'network', C: 22e-6, R: 40, battery: { V: 12, R: 0.5 } } });
    const rows = Object.fromEntries(loadRows(r).map((x) => [x.label, x.value]));
    expect(Object.keys(rows)).toEqual(['vout', 'iR', 'ibat', 'pbat', 'pRb']);
    expect(rows.pbat).toBeCloseTo(12 * rows.ibat!, 12);
    // v_out = V_b + R_b i_b at every instant, so <v_out i_b> = V_b <i_b> + R_b <i_b^2>
    const t = r.waveforms.t as number[];
    const v = r.waveforms.v_out as number[];
    const i = r.waveforms.i_bat as number[];
    let pTerm = 0;
    for (let k = 1; k < t.length; k++) pTerm += 0.5 * (v[k - 1]! * i[k - 1]! + v[k]! * i[k]!) * (t[k]! - t[k - 1]!);
    pTerm /= t[t.length - 1]! - t[0]!;
    expect(Math.abs(rows.pbat! + rows.pRb! - pTerm) / pTerm).toBeLessThan(1e-9);
  });

  it('has no rows for a resistive or a fixed load, and only the output voltage for a capacitor alone', () => {
    expect(loadRows(sim.simulate({ topology: 'buck', Vg: 24, D: 0.5, fs, L: 1e-4, load: { kind: 'resistive', R: 10, C: 1e-5 } }))).toEqual([]);
    expect(loadRows(sim.simulate({ topology: 'buck', Vg: 24, D: 0.4, fs, L: 1e-4, load: { kind: 'fixed', V: 12 } }))).toEqual([]);
    const cap = loadRows(sim.simulate({ topology: 'buck', Vg: 24, D: 0.5, fs, L: 1e-4, load: { kind: 'network', C: 1e-5, V0: 0 } }));
    expect(cap.map((x) => x.label)).toEqual(['vout']);
    expect(cap[0]!.value).toBeCloseTo(24, 5);
  });
});

describe('the form in CircuitJS1 (falstadFor)', () => {
  const presets: SimPreset[] = PRESETS.map((p) => ({ id: p.id, label: p.en, topology: p.topology, values: presetValues(p.example, p.topology) }));
  const run = (example: string, topology: sim.Topology, extra: Record<string, string> = {}, fs?: { load?: 'res' | 'batr'; source?: boolean }) => {
    const st = stateFromHash(new URLSearchParams(simulatorHash(example, topology)), presets);
    const form = { ...st.fs, ...(fs ?? {}) };
    const values = { ...st.values, ...fillShown(form, st.values, presets), ...extra };
    const p = toParams(form, values);
    if ('error' in p) throw new Error(example);
    return sim.simulate(p);
  };

  it.each(falstadCases.map((c) => [c.id, c] as const))('%s: the library\'s circuit, started from the simulated steady state', (_id, c) => {
    const r = run(c.example, c.topology);
    const f = falstadFor(r)!;
    expect(f.leftOut).toEqual([]);
    const want = readFileSync(resolve(__dirname, '../..', c.file), 'utf8').split('\n');
    const got = f.text.split('\n');
    expect(got.length).toBe(want.length);
    got.forEach((line, j) => {
      const a = line.split(' ');
      const b = want[j]!.split(' ');
      // the start: the simulated steady state at the switch's turn-on against the library's, from the ideal
      // equations: the capacitor's voltage within its simulated ripple and 1 % (the library takes the
      // average, the simulator the instant), the currents within 1 % of the largest inductor current
      const start = { c: [7, 8], l: [7, 8], T: [8] }[a[0] as 'c' | 'l' | 'T'];
      if (!start) return expect(line).toBe(want[j]);
      const tol =
        a[0] === 'c' ? r.max.v_out! - r.min.v_out! + 0.01 * Math.abs(Number(b[7])) : 0.01 * Math.max(r.max.i_L ?? 0, Math.abs(r.min.i_L ?? 0));
      a.forEach((x, k) => {
        if (start.includes(k)) expect(Math.abs(Number(x) - Number(b[k]!)), `${c.id} ${line}`).toBeLessThan(tol);
        else expect(x).toBe(b[k]);
      });
    });
    expect(f.link.startsWith('https://www.falstad.com/circuit/circuitjs.html?ctz=')).toBe(true);
  });

  it('keeps the switch\'s R_on and names the parts CircuitJS1 leaves out', () => {
    const f = falstadFor(run('buck-basic', 'buck', { Ron: '0.05', RL: '0.1', VF: '0.7' }))!;
    expect(f.text).toMatch(/^159 176 176 240 176 0 0\.05 1000000 2\.5$/m);
    expect(f.leftOut).toEqual(['R_L', 'V_F']);
  });

  it('has no circuit for another load or with a source', () => {
    expect(falstadFor(run('buck-basic', 'buck', {}, { load: 'batr' }))).toBeNull();
    expect(falstadFor(run('buck-basic', 'buck', {}, { source: true }))).toBeNull();
  });
});
