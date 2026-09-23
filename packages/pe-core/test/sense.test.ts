import { describe, expect, it } from 'vitest';
import { currentAt, errorCurve, outputAt, readingAt, senseChain, transferCurve, type SenseSpec } from '../src/sense';

const rel = (a: number, b: number) => Math.abs(a - b) / Math.abs(b);

// Synthetic chain, round numbers: 10 mohm shunt, a current-output amplifier with R_OUT/R_IN = 100 (1 V/A).
const base: SenseSpec = {
  Imax: 2, Imin: 0.05, Rsense: 0.01, Rpad: 0,
  monitor: { kind: 'current', Rin: 100, Rout: 1e4 },
  Vos: 1e-4, VoutMin: 0, VoutMax: 4, Vfs: 2.5, fsamp: 1e4, Rf: 0, Cf: 1e-8, errMax: 0.01,
};
const voltage: SenseSpec = { ...base, monitor: { kind: 'voltage', G: 50, Vref: 0 }, Rf: 1e3, Cf: 1e-7 };

describe('sense chain', () => {
  it('current output: gain, output, full scale, burden, offset, filter against the Nyquist frequency', () => {
    const r = senseChain(base);
    expect(rel(r.gain, 1)).toBeLessThan(1e-12);
    expect(r.Vout0).toBe(0);
    expect(rel(r.VoutImax, 2)).toBeLessThan(1e-12);
    // at its highest the output carries the offset too: 1 V/A times (2 A + 0.1 mV/10 mohm)
    expect(rel(r.VoutHi, 2.01)).toBeLessThan(1e-12);
    expect(rel(r.adcUse, 2.01 / 2.5)).toBeLessThan(1e-12);
    // the ADC's 2.5 V comes before the amplifier's 4 V: the highest output reaches it at 2.49 A
    expect(r.limit).toBe('adc');
    expect(rel(r.Ifs, 2.49)).toBeLessThan(1e-9);
    // with the offset at the sign that lowers the output, it stays at 0 V up to 10 mA
    expect(rel(r.Ifloor, 0.01)).toBeLessThan(1e-9);
    expect(rel(r.Vsense, 0.02)).toBeLessThan(1e-12);
    expect(rel(r.Pshunt, 0.04)).toBeLessThan(1e-12);
    // 0.1 mV over 10 mohm: 10 mA, a fifth of the smallest current
    expect(rel(r.Ios, 0.01)).toBeLessThan(1e-12);
    expect(rel(r.offsetShare, 0.2)).toBeLessThan(1e-12);
    expect(r.padError).toBe(0);
    // the capacitor across R_OUT (no series resistor): the corner is 1/(2 pi R_OUT C_f)
    expect(r.Rfilt).toBe(1e4);
    expect(rel(r.fc, 1 / (2 * Math.PI * 1e-4))).toBeLessThan(1e-12);
    expect(r.fN).toBe(5000);
    expect(rel(r.gainAtNyquist, 1 / Math.sqrt(1 + (5000 / r.fc) ** 2))).toBeLessThan(1e-12);
    expect(r.warnings).toEqual(['offset']);
  });

  it("a current-output amplifier's R_OUT is in series with the filter resistor; a voltage output's is not", () => {
    const cur = senseChain({ ...base, Rf: 1e3 });
    expect(cur.Rfilt).toBe(1.1e4);
    expect(rel(cur.fc, 1 / (2 * Math.PI * 1.1e4 * 1e-8))).toBeLessThan(1e-12);
    const vol = senseChain(voltage);
    expect(vol.Rfilt).toBe(1e3);
    expect(rel(vol.fc, 1 / (2 * Math.PI * 1e-4))).toBeLessThan(1e-12);
  });

  it('voltage output: the REF voltage sets the output at zero current and shortens the full scale', () => {
    const r = senseChain({ ...voltage, monitor: { kind: 'voltage', G: 50, Vref: 0.5 } });
    expect(r.Vout0).toBe(0.5);
    expect(rel(r.gain, 50 * 0.01)).toBeLessThan(1e-12);
    // (2.5 V - 0.5 V)/(50 * 10 mohm), less the 10 mA the offset adds at its highest
    expect(rel(r.Ifs, 3.99)).toBeLessThan(1e-9);
    // a REF voltage at the full scale leaves no range at all
    expect(currentAt({ ...voltage, monitor: { kind: 'voltage', G: 50, Vref: 2.5 } }, 2.5, 1)).toBe(0);
  });

  it('the reading: the pad resistance scales the current, the offset shifts it either way', () => {
    const s = { ...base, Rpad: 5e-4 };
    expect(rel(readingAt(s, 2, 1), 2.11)).toBeLessThan(1e-12);
    expect(rel(readingAt(s, 2, -1), 2.09)).toBeLessThan(1e-12);
    expect(rel(outputAt(s, 2, 1), 2.11)).toBeLessThan(1e-12);
  });

  it('the upper limits take the highest output: a chain that fits nominally can clip with the pad and the offset', () => {
    // nominally 2 V at 2 A, below a 2.005 V amplifier limit; with the offset 2.01 V
    const amp = senseChain({ ...base, VoutMax: 2.005 });
    expect(amp.VoutImax).toBeLessThan(2.005);
    expect(amp.warnings).toContain('ampClips');
    // a 0.5 mohm pad on the 10 mohm shunt: 2.11 V against a 2.05 V full scale
    const adc = senseChain({ ...base, Vfs: 2.05, Rpad: 5e-4 });
    expect(adc.VoutImax).toBeLessThan(2.05);
    expect(adc.warnings).toContain('adcClips');
    expect(rel(adc.Ifs, (2.05 - 0.01) / 1.05)).toBeLessThan(1e-9);
    expect(adc.Ifs).toBeLessThan(base.Imax);
  });

  it('the output floor: below it the output cannot follow the current; a REF voltage above it removes it', () => {
    // 20 mV lowest output at 0.5 V/A, and a 10 mA offset lowering the reading: the output stays there up to 50 mA
    const r = senseChain({ ...voltage, VoutMin: 0.02, Imin: 0.03 });
    expect(rel(r.Ifloor, 0.05)).toBeLessThan(1e-9);
    expect(r.warnings).toContain('floor');
    expect(senseChain({ ...voltage, VoutMin: 0.02, Imin: 0.06 }).warnings).not.toContain('floor');
    // without an offset the floor is the swing alone: 40 mA
    expect(rel(senseChain({ ...voltage, VoutMin: 0.02, Vos: 0 }).Ifloor, 0.04)).toBeLessThan(1e-9);
    const ref = senseChain({ ...voltage, VoutMin: 0.02, monitor: { kind: 'voltage', G: 50, Vref: 0.1 } });
    expect(ref.Ifloor).toBe(0);
    expect(ref.warnings).not.toContain('floor');
  });

  it('flags each violation', () => {
    expect(senseChain({ ...base, monitor: { kind: 'current', Rin: 100, Rout: 3e4 } }).warnings).toEqual(
      expect.arrayContaining(['adcClips']),
    );
    expect(senseChain({ ...base, VoutMax: 1.5 }).warnings).toContain('ampClips');
    expect(senseChain({ ...base, VburdenMax: 0.01 }).warnings).toContain('burden');
    expect(senseChain({ ...base, Prating: 0.01 }).warnings).toContain('shuntPower');
    // a 0.5 mohm pad in series with a 10 mohm shunt: 5 %
    const pad = senseChain({ ...base, Rpad: 5e-4, Vos: 1e-6 });
    expect(rel(pad.padError, 0.05)).toBeLessThan(1e-12);
    expect(pad.warnings).toEqual(['pad']);
    // a 20 kHz corner (10 kohm, 0.8 nF) above the 5 kHz Nyquist frequency
    expect(senseChain({ ...base, Cf: 7.9577e-10, Vos: 1e-6 }).warnings).toEqual(['aliasing']);
    // no capacitor: no filter at all
    const none = senseChain({ ...base, Cf: 0, Vos: 1e-6 });
    expect(none.fc).toBe(Number.POSITIVE_INFINITY);
    expect(none.gainAtNyquist).toBe(1);
    expect(none.warnings).toEqual(['aliasing']);
  });

  it('the ADC sees at most what the amplifier can drive: no ADC warning while the amplifier clips below the full scale', () => {
    // 3 V wanted at 2 A, the amplifier stops at 2.2 V, the ADC reads up to 2.5 V
    const r = senseChain({ ...base, VoutMax: 2.2, monitor: { kind: 'current', Rin: 100, Rout: 1.5e4 } });
    expect(r.warnings).toContain('ampClips');
    expect(r.warnings).not.toContain('adcClips');
    expect(rel(r.adcUse, 2.2 / 2.5)).toBeLessThan(1e-12);
  });

  it('no usable range: a REF voltage at the limit, or a floor at or above the full scale', () => {
    const ref = senseChain({ ...voltage, monitor: { kind: 'voltage', G: 50, Vref: 3.25 }, VoutMax: 3.2, Vfs: 3.3 });
    expect(ref.Ifs).toBe(0);
    expect(ref.warnings).toContain('noRange');
    const floor = senseChain({ ...base, VoutMin: 3, Vfs: 2.5 });
    expect(floor.Ifloor).toBeGreaterThanOrEqual(floor.Ifs);
    expect(floor.warnings).toContain('noRange');
    expect(senseChain(base).warnings).not.toContain('noRange');
  });

  it("the filter's gain at the switching frequency, when one is given", () => {
    expect(senseChain(base).gainAtFsw).toBeUndefined();
    const r = senseChain({ ...base, fsw: 1e5 });
    expect(rel(r.gainAtFsw!, 1 / Math.sqrt(1 + (1e5 / r.fc) ** 2))).toBeLessThan(1e-12);
    expect(senseChain({ ...base, fsw: 1e5, Cf: 0 }).gainAtFsw).toBe(1);
  });

  it('flags the offset and the pad error together when neither alone exceeds the target', () => {
    // 0.6 % offset share at 0.5 A and 0.6 % pad error: 1.2 % together against 1 %
    const r = senseChain({ ...base, Imin: 0.5, Vos: 3e-5, Rpad: 6e-5 });
    expect(rel(r.offsetShare, 0.006)).toBeLessThan(1e-12);
    expect(rel(r.padError, 0.006)).toBeLessThan(1e-12);
    expect(r.warnings).toEqual(['combined']);
    expect(senseChain({ ...base, Imin: 0.5, Vos: 3e-5, Rpad: 3e-5 }).warnings).toEqual([]);
  });

  it('the error curve: the offset falls as 1/I, the pad error stays', () => {
    const r = senseChain({ ...base, Rpad: 5e-4 });
    const c = errorCurve(r);
    for (let k = 0; k < c.I.length; k++) {
      expect(rel(c.offset[k]!, r.Ios / c.I[k]!)).toBeLessThan(1e-12);
      expect(rel(c.total[k]!, c.offset[k]! + 0.05)).toBeLessThan(1e-12);
    }
    expect(c.I[0]).toBe(0.005);
    expect(c.I[c.I.length - 1]).toBe(2);
  });

  it('the transfer curve runs past the full-scale current: nominal, highest and lowest output', () => {
    const r = senseChain({ ...base, Rpad: 5e-4 });
    const t = transferCurve(r);
    expect(t.I[0]).toBe(0);
    // 1.2 times the full-scale current, (2.5 V - 0.01 A x 1 V/A)/1.05 A
    expect(t.I[t.I.length - 1]).toBeCloseTo(1.2 * ((2.5 - 0.01) / 1.05), 9);
    for (let k = 0; k < t.I.length; k++) {
      const i = t.I[k]!;
      expect(t.nominal[k]).toBeCloseTo(i, 12);
      expect(t.high[k]).toBeCloseTo(1.05 * i + 0.01, 12);
      expect(t.low[k]).toBeCloseTo(1.05 * i - 0.01, 12);
    }
  });
});
