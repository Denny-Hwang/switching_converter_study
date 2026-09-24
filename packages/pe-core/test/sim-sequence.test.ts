import { describe, expect, it } from 'vitest';
import { elementStates, modes, runCycle, buildModel, simulate, type ElementInMode, type SimParams } from '../src/sim';

/**
 * The operating modes: each mode is one interval of the engine, lasting what
 * the engine says, and every element's state in it is what the circuit of
 * that interval implies.
 */

const fs = 1e5;
const Ts = 1 / fs;

const byId = (els: ElementInMode[]) => Object.fromEntries(els.map((e) => [e.id, e]));

/** The durations of the engine's intervals over the steady-state period. */
function durations(p: SimParams, x0: number[]): Record<string, number> {
  const model = buildModel(p);
  return runCycle(model, x0, { stepsPerPeriod: 2000 }).durations;
}

describe('modes cover the period in the engine\'s intervals', () => {
  const cases: [string, SimParams][] = [
    ['buck CCM', { topology: 'buck', Vg: 24, D: 0.5, fs, L: 1e-4, load: { kind: 'resistive', R: 6, C: 1e-4 } }],
    ['buck DCM', { topology: 'buck', Vg: 24, D: 0.3, fs, L: 2e-5, load: { kind: 'resistive', R: 50, C: 1e-4 } }],
    ['boost DCM', { topology: 'boost', Vg: 12, D: 0.3, fs, L: 1e-5, load: { kind: 'resistive', R: 100, C: 1e-4 } }],
    ['flyback DCM with a node capacitance', { topology: 'flyback', Vg: 48, D: 0.3, fs, L: 2e-5, n: 0.25, VF: 0.5, Ron: 0.1, Cnode: 1e-10, load: { kind: 'resistive', R: 10, C: 1e-4 } }],
    ['forward DCM', { topology: 'forward', Vg: 48, D: 0.3, fs, L: 2e-5, n: 0.5, nr: 1, LM: 1e-3, VF: 0.5, load: { kind: 'resistive', R: 20, C: 1e-4 } }],
    ['flyback charging a battery', { topology: 'flyback', Vg: 48, D: 0.3, fs, L: 2e-5, n: 0.25, VF: 0.5, load: { kind: 'network', C: 1e-4, battery: { V: 12, R: 0.05 } } }],
  ];
  for (const [name, p] of cases) {
    it(name, () => {
      const r = simulate(p);
      expect(r.status).toBe('steady');
      const ms = modes(r);
      expect(ms[0]!.t0).toBe(0);
      expect(ms.at(-1)!.t1).toBeCloseTo(Ts, 15);
      for (let k = 1; k < ms.length; k++) {
        expect(ms[k]!.t0).toBe(ms[k - 1]!.t1);
        // one mode never follows another of the same kind
        expect(ms[k]!.kind).not.toBe(ms[k - 1]!.kind);
      }
      ms.forEach((m, k) => expect(m.index).toBe(k + 1));
      // each interval's total time in the modes equals the engine's
      const dur = durations(p, r.x0);
      const fromModes: Record<string, number> = {};
      const t = r.waveforms.t as number[];
      const iv = r.waveforms.interval as string[];
      for (let k = 1; k < t.length; k++) fromModes[iv[k]!] = (fromModes[iv[k]!] ?? 0) + (t[k]! - t[k - 1]!);
      for (const [name2, d] of Object.entries(dur)) if (d > 0) expect(Math.abs((fromModes[name2] ?? 0) - d)).toBeLessThan(1e-12);
      const total = ms.reduce((s, m) => s + (m.t1 - m.t0), 0);
      expect(Math.abs(total - Ts)).toBeLessThan(1e-15);
    });
  }
});

describe('element states in each mode match the circuit of its interval', () => {
  it('buck in CCM: on, then off', () => {
    const r = simulate({ topology: 'buck', Vg: 24, D: 0.5, fs, L: 1e-4, load: { kind: 'resistive', R: 6, C: 1e-4 } });
    const ms = modes(r);
    expect(ms.map((m) => m.kind)).toEqual(['on', 'off']);
    const on = byId(elementStates(r, ms[0]!));
    expect(on.S!.state).toBe('on');
    expect(on.D!.state).toBe('blocking');
    expect(on.L!.state).toBe('storing');
    expect(on.Vg!.state).toBe('delivering');
    // the capacitor current is i_L - V/R: negative at the start of the on-interval, positive at its end
    expect(on.C!.state).toBe('dischargeCharge');
    const off = byId(elementStates(r, ms[1]!));
    expect(off.S!.state).toBe('off');
    expect(off.S!.v0).toBeCloseTo(24, 9);
    expect(off.D!.state).toBe('conducting');
    expect(off.L!.state).toBe('releasing');
    expect(off.Vg!.state).toBe('idle');
    expect(off.C!.state).toBe('chargeDischarge');
    expect(off.R!.state).toBe('conducting');
  });

  it('boost in DCM: on, off, idle', () => {
    const r = simulate({ topology: 'boost', Vg: 12, D: 0.3, fs, L: 1e-5, load: { kind: 'resistive', R: 100, C: 1e-4 } });
    const ms = modes(r);
    expect(ms.map((m) => m.kind)).toEqual(['on', 'off', 'idle']);
    const [on, off, idle] = ms.map((m) => byId(elementStates(r, m)));
    expect([on!.S!.state, on!.D!.state, on!.L!.state, on!.C!.state]).toEqual(['on', 'blocking', 'storing', 'discharging']);
    expect([off!.S!.state, off!.D!.state, off!.L!.state]).toEqual(['off', 'conducting', 'releasing']);
    expect([idle!.S!.state, idle!.D!.state, idle!.L!.state, idle!.C!.state]).toEqual(['off', 'blocking', 'zero', 'discharging']);
    // the input keeps delivering while the diode conducts (the boost's inductor is in the input's path)
    expect(off!.Vg!.state).toBe('delivering');
    expect(idle!.Vg!.state).toBe('idle');
  });

  it('flyback in DCM with a node capacitance: body diode, on, rise, off, ringing', () => {
    const r = simulate({ topology: 'flyback', Vg: 48, D: 0.3, fs, L: 2e-5, n: 0.25, VF: 0.5, Ron: 0.1, Cnode: 1e-10, load: { kind: 'resistive', R: 10, C: 1e-4 } });
    const ms = modes(r);
    expect(ms.map((m) => m.kind)).toEqual(['onRev', 'on', 'rise', 'off', 'ring']);
    const [onRev, on, rise, off, ring] = ms.map((m) => byId(elementStates(r, m)));
    // the ringing left the magnetizing current slightly negative: at turn-on it flows back to the input
    // through the body diode until it reaches zero, then the switch takes it and the core stores energy
    expect([onRev!.S!.state, onRev!.D!.state, onRev!.LM!.state, onRev!.Vg!.state]).toEqual(['onBodyDiode', 'blocking', 'releasing', 'absorbing']);
    expect(onRev!.LM!.i0).toBeLessThan(0);
    expect(Math.abs(onRev!.LM!.i1)).toBeLessThan(1e-9);
    expect([on!.S!.state, on!.D!.state, on!.LM!.state, on!.W2!.state, on!.Vg!.state]).toEqual(['on', 'blocking', 'storing', 'idle', 'delivering']);
    expect(on!.LM!.i1).toBeGreaterThan(-10 * onRev!.LM!.i0);
    // after turn-off the magnetizing current charges the node capacitance until the diode takes over
    expect([rise!.S!.state, rise!.D!.state, rise!.Cn!.state]).toEqual(['off', 'blocking', 'charging']);
    expect([off!.D!.state, off!.LM!.state, off!.W1!.state, off!.W2!.state]).toEqual(['conducting', 'releasing', 'conducting', 'conducting']);
    // the ringing: the diode blocks, the node capacitance charges and discharges, the body diode clamps
    expect(ring!.D!.state).toBe('blocking');
    expect(ring!.Cn!.state).toBe('ringing');
    expect(ring!.LM!.state).toBe('ringing');
    expect(ms.find((m) => m.kind === 'ring')!.intervals).toContain('clamp');
    expect(ring!.S!.state).toBe('bodyDiode');
  });

  it('forward in DCM: the core resets through D3 while L_f freewheels through D2, then each ends', () => {
    const r = simulate({ topology: 'forward', Vg: 48, D: 0.3, fs, L: 2e-5, n: 0.5, nr: 1, LM: 1e-3, VF: 0.5, load: { kind: 'resistive', R: 20, C: 1e-4 } });
    const ms = modes(r);
    expect(ms.map((m) => m.kind)).toEqual(['on', 'off', 'offM0', 'idle']);
    const [on, off, offM0, idle] = ms.map((m) => byId(elementStates(r, m)));
    expect([on!.S!.state, on!.D1!.state, on!.D2!.state, on!.D3!.state, on!.LM!.state, on!.L!.state]).toEqual(['on', 'conducting', 'blocking', 'blocking', 'storing', 'storing']);
    expect([off!.S!.state, off!.D1!.state, off!.D2!.state, off!.D3!.state, off!.LM!.state, off!.L!.state]).toEqual(['off', 'blocking', 'conducting', 'conducting', 'releasing', 'releasing']);
    // during the reset the source takes energy back
    expect(off!.Vg!.state).toBe('absorbing');
    expect([offM0!.D3!.state, offM0!.LM!.state, offM0!.D2!.state, offM0!.L!.state]).toEqual(['blocking', 'zero', 'conducting', 'releasing']);
    expect([idle!.D1!.state, idle!.D2!.state, idle!.D3!.state, idle!.L!.state, idle!.LM!.state]).toEqual(['blocking', 'blocking', 'blocking', 'zero', 'zero']);
  });

  it('a battery charges or discharges with the sign of its current, and the capacitor state follows its voltage', () => {
    const r = simulate({ topology: 'flyback', Vg: 48, D: 0.3, fs, L: 2e-5, n: 0.25, VF: 0.5, load: { kind: 'network', C: 1e-4, battery: { V: 12, R: 0.05 } } });
    for (const m of modes(r)) {
      for (const e of elementStates(r, m)) {
        if (e.kind === 'battery') expect(e.state === 'charging').toBe(e.min > 0);
        if (e.id === 'C' && (e.state === 'charging' || e.state === 'discharging')) {
          expect(Math.sign(e.v1! - e.v0!)).toBe(e.state === 'charging' ? 1 : -1);
        }
      }
    }
  });
});
