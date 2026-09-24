import { describe, expect, it } from 'vitest';
import { SLIVER, atRest, elementStates, modes, runCycle, buildModel, simulate, type ElementInMode, type SimParams } from '../src/sim';

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

  it('buck in DCM: on, off, idle', () => {
    const r = simulate({ topology: 'buck', Vg: 24, D: 0.3, fs, L: 2e-5, load: { kind: 'resistive', R: 50, C: 1e-4 } });
    const ms = modes(r);
    expect(ms.map((m) => m.kind)).toEqual(['on', 'off', 'idle']);
    const [on, off, idle] = ms.map((m) => byId(elementStates(r, m)));
    expect([on!.S!.state, on!.D!.state, on!.L!.state, on!.Vg!.state]).toEqual(['on', 'blocking', 'storing', 'delivering']);
    expect([off!.S!.state, off!.D!.state, off!.L!.state, off!.Vg!.state]).toEqual(['off', 'conducting', 'releasing', 'idle']);
    // the idle interval: nothing but the capacitor feeding the resistor
    expect([idle!.S!.state, idle!.D!.state, idle!.L!.state, idle!.Vg!.state, idle!.C!.state, idle!.R!.state]).toEqual(['off', 'blocking', 'zero', 'idle', 'discharging', 'conducting']);
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

describe('rounding is neither a mode nor a current', () => {
  it('a current left at -1e-21 A by rounding makes no body-diode mode of 1e-26 s', () => {
    // a plain DCM flyback whose steady state starts at i = -1.45e-21 A
    const p: SimParams = { topology: 'flyback', Vg: 12, D: 0.4, fs: 5e4, L: 1e-4, n: 0.1, Ron: 0.5, RL: 0.1, VF: 0.7, load: { kind: 'resistive', R: 100, C: 4.7e-6 } };
    const ms = modes(simulate(p));
    expect(ms.map((m) => m.kind)).toEqual(['on', 'off', 'idle']);
    for (const m of ms) expect(m.t1 - m.t0).toBeGreaterThanOrEqual(SLIVER / p.fs);
  });

  it('a circuit at rest has no current, and a working one has', () => {
    // a buck's capacitor alone at the input; a buck into a fixed output at the input's voltage
    const rest: SimParams[] = [
      { topology: 'buck', Vg: 24, D: 0.5, fs, L: 1e-4, load: { kind: 'network', C: 2.2e-5, V0: 0 } },
      { topology: 'buck', Vg: 48, D: 0.5, fs: 5e4, L: 5e-4, Ron: 0.05, RL: 0.1, VF: 0.3, Cnode: 1e-11, load: { kind: 'fixed', V: 48 } },
    ];
    for (const p of rest) expect(atRest(simulate(p)), p.load.kind).toBe(true);
    expect(atRest(simulate({ topology: 'buck', Vg: 24, D: 0.5, fs, L: 1e-4, load: { kind: 'resistive', R: 6, C: 1e-4 } }))).toBe(false);
  });

  it("the microamperes a node capacitance draws through the input while the diode carries amperes are no current", () => {
    const r = simulate({ topology: 'flyback', Vg: 48, D: 0.3, fs, L: 2e-5, n: 0.25, VF: 0.5, Ron: 0.1, Cnode: 1e-10, load: { kind: 'resistive', R: 10, C: 1e-4 } });
    const off = modes(r).find((m) => m.kind === 'off')!;
    const st = byId(elementStates(r, off));
    expect(Math.abs(st.Vg!.avg)).toBeLessThan(1e-3 * st.D!.max);
    expect(st.Vg!.state).toBe('idle');
    expect(st.W1!.state).toBe('conducting');
  });
});

describe('each state reads the whole mode', () => {
  it('an inductor current that rises and falls again within a mode stores energy, then releases it', () => {
    // a buck from a source: in the on-interval L's current goes 0 -> 341 mA -> 21 mA
    const r = simulate({ topology: 'buck', Vg: 14.4, D: 0.7, fs: 5e4, L: 2e-6, source: { Voc: 14.4, Rs: 0.1, Cbus: 1e-5 }, load: { kind: 'resistive', R: 100, C: 4.7e-6 } });
    const on = modes(r).find((m) => m.kind === 'on')!;
    const L = byId(elementStates(r, on)).L!;
    expect(L.max).toBeGreaterThan(Math.max(Math.abs(L.i0), Math.abs(L.i1)) * 2);
    expect(L.state).toBe('storeRelease');
  });

  it("a boost whose output is below its input: the inductor's states follow its current, not the textbook's direction", () => {
    // 21 A through R_on = 0.5 ohm: while S is on the resistances take more than the input gives, and the
    // current shrinks; while D conducts the input, above the output, first lifts it (L di/dt = +3.7 V),
    // until the output's rise and the resistances turn it (-1.5 V at the end): it grows, then shrinks
    const r = simulate({ topology: 'boost', Vg: 12, D: 0.6, fs: 2e5, L: 1e-4, Ron: 0.5, RL: 0.1, VF: 0.3, load: { kind: 'resistive', R: 1, C: 4.7e-6 } });
    expect(r.max.v_out!).toBeLessThan(12);
    const st = Object.fromEntries(modes(r).map((m) => [m.kind, byId(elementStates(r, m))]));
    expect(st.on!.L!.state).toBe('releasing');
    expect(st.off!.L!.state).toBe('storeRelease');
  });

  it('a reverse current held by a battery above the input is constant, not growing', () => {
    const r = simulate({ topology: 'buck', Vg: 24, D: 0.5, fs, L: 1e-4, Ron: 0.05, load: { kind: 'network', C: 2.2e-5, battery: { V: 30, R: 0.5 } } });
    for (const m of modes(r)) expect(byId(elementStates(r, m)).L!.state, m.kind).toBe('steady');
  });

  it('a rise the diode never ends (the node rings below the output) is followed by the ringing, with the diode off throughout', () => {
    const r = simulate({ topology: 'boost', Vg: 24, D: 0.4, fs: 2e5, L: 5e-4, Ron: 0.1, Cnode: 1e-9, load: { kind: 'fixed', V: 80 } });
    const ms = modes(r);
    const k = ms.findIndex((m) => m.kind === 'rise');
    expect(k).toBeGreaterThanOrEqual(0);
    expect(ms[k + 1]!.kind).toBe('ring');
    for (const m of ms) expect(byId(elementStates(r, m)).D!.state, m.kind).toBe('blocking');
  });

  it("a source whose current changes direction within a mode alternates (the input carries the flyback's ringing)", () => {
    const r = simulate({ topology: 'flyback', Vg: 48, D: 0.3, fs, L: 2e-5, n: 0.25, VF: 0.5, Ron: 0.1, Cnode: 1e-10, load: { kind: 'resistive', R: 10, C: 1e-4 } });
    const ring = modes(r).find((m) => m.kind === 'ring')!;
    const Vg = byId(elementStates(r, ring)).Vg!;
    expect(Vg.signChanges).toBeGreaterThanOrEqual(2);
    expect(Vg.state).toBe('alternating');
  });
});

describe("each mode's circuit sentence and its states agree", () => {
  // what each two-switch mode's description asserts about the switch, the diode and the inductor
  const asserts: Record<string, Record<string, string[]>> = {
    on: { S: ['on'], D: ['blocking'] },
    onRev: { S: ['onBodyDiode'], D: ['blocking'] },
    off: { S: ['off'], D: ['conducting'] },
    rev: { S: ['bodyDiode'], D: ['blocking'] },
    idle: { S: ['off'], D: ['blocking'] },
    rise: { S: ['off'], D: ['blocking'] },
    ring: { D: ['blocking'] },
  };
  const loads: SimParams['load'][] = [
    { kind: 'resistive', R: 10, C: 1e-4 },
    { kind: 'network', C: 1e-4, R: 20, battery: { V: 5, R: 0.5 } },
    { kind: 'fixed', V: 30 },
  ];
  const fixedV = { buck: 8, boost: 30, buckboost: 6, flyback: 8 } as const;
  const cases: [string, SimParams][] = [
    // many modes: the ringing turns the diode on again for 2.6 ns, with a small current that is the mode
    ['buck, 27 modes', { topology: 'buck', Vg: 12, D: 0.1, fs: 5e4, L: 1e-4, Ron: 0.5, RL: 0.02, VF: 0.7, Cnode: 1e-10, load: { kind: 'resistive', R: 100, C: 2.2e-5 } }],
    // a 10 pF node capacitance: the ringing turns the diode on again with currents far below its peak, beside
    // a battery's amperes (found by a random sweep)
    ['boost, 10 pF, battery and R', { topology: 'boost', Vg: 35.4, D: 0.12, fs: 2e5, L: 8.82e-6, Ron: 0.29, Cnode: 1e-11, load: { kind: 'network', C: 8.39e-5, R: 190, battery: { V: 51.6, R: 0.0977 } } }],
    ['buck-boost, 10 pF, battery, source', { topology: 'buckboost', Vg: 99.4, D: 0.0781, fs, L: 1.92e-5, Ron: 0.237, RL: 0.0498, VF: 0.232, Cnode: 1e-11, source: { Voc: 126, Rs: 0.522, Cbus: 2.8e-6 }, load: { kind: 'network', C: 2.1e-6, battery: { V: 14.6, R: 0.2 } } }],
  ];
  for (const t of ['buck', 'boost', 'buckboost', 'flyback'] as const) {
    for (const load of loads) {
      const l = load.kind === 'fixed' ? { kind: 'fixed' as const, V: fixedV[t] } : load;
      const p = { topology: t, Vg: t === 'flyback' ? 48 : t === 'buck' ? 24 : 12, D: 0.4, fs, L: t === 'flyback' ? 2e-5 : 1e-4, n: 0.25, Ron: 0.1, VF: 0.5, load: l } as SimParams;
      cases.push([`${t}, ${l.kind}`, p], [`${t}, ${l.kind}, node capacitance`, { ...p, Cnode: 1e-10 }], [`${t}, ${l.kind}, source`, { ...p, source: { Voc: 1.2 * p.Vg, Rs: 1, Cbus: 1e-4 } }]);
    }
  }
  for (const [name, p] of cases) {
    it(name, () => {
      const r = simulate(p);
      if (r.status !== 'steady') return;
      for (const m of modes(r)) {
        const st = byId(elementStates(r, m));
        for (const [id, allowed] of Object.entries(asserts[m.kind] ?? {})) {
          expect(allowed, `${name}: mode ${m.index} (${m.kind}), ${id} is ${st[id]!.state}`).toContain(st[id]!.state);
        }
        // the inductor carries current in every mode but the idle one, and none in it
        const L = st.L ?? st.LM!;
        if (m.kind === 'idle') expect(L.state, `${name}: mode ${m.index}`).toBe('zero');
        else if (m.kind !== 'ring') expect(L.state, `${name}: mode ${m.index} (${m.kind})`).not.toBe('zero');
      }
    });
  }
});

describe("each mode's circuit sentence and its states agree in random circuits", () => {
  // 80 circuits from a fixed seed: every two-switch converter, each load, a node capacitance down to 10 pF
  // (whose ringing turns the diode on again for nanoseconds), a Thevenin source, losses
  let seed = 7919;
  const rnd = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 2 ** 32;
  };
  const pick = <T,>(a: readonly T[]) => a[Math.floor(rnd() * a.length)]!;
  const logU = (lo: number, hi: number) => Math.exp(Math.log(lo) + rnd() * (Math.log(hi) - Math.log(lo)));
  const r3 = (x: number) => Number(x.toPrecision(3));
  const asserts: Record<string, Record<string, string[]>> = {
    on: { S: ['on'], D: ['blocking'] },
    onRev: { S: ['onBodyDiode'], D: ['blocking'] },
    off: { S: ['off'], D: ['conducting'] },
    rev: { S: ['bodyDiode'], D: ['blocking'] },
    idle: { S: ['off'], D: ['blocking'] },
    rise: { S: ['off'], D: ['blocking'] },
    ring: { D: ['blocking'] },
  };
  it('80 circuits', () => {
    const wrong: string[] = [];
    let steady = 0;
    for (let k = 0; k < 80; k++) {
      const topology = pick(['buck', 'boost', 'buckboost', 'flyback'] as const);
      const kind = pick(['res', 'bat', 'batr', 'fixed'] as const);
      const Vg = r3(logU(5, 100));
      const load: SimParams['load'] =
        kind === 'res'
          ? { kind: 'resistive', R: r3(logU(1, 500)), C: r3(logU(1e-7, 1e-4)) }
          : kind === 'fixed'
            ? { kind: 'fixed', V: r3(Vg * logU(0.2, 3)) }
            : { kind: 'network', C: r3(logU(1e-7, 1e-4)), battery: { V: r3(Vg * logU(0.1, 2)), R: r3(logU(0.05, 5)) }, ...(kind === 'batr' ? { R: r3(logU(5, 500)) } : {}) };
      const lossy = rnd() < 0.5;
      const p: SimParams = {
        topology,
        Vg,
        D: r3(0.05 + 0.9 * rnd()),
        fs: pick([5e4, 1e5, 2e5]),
        L: r3(logU(2e-6, 1e-3)),
        n: topology === 'flyback' ? r3(logU(0.1, 2)) : undefined,
        Ron: r3(logU(0.01, 0.5)),
        RL: lossy ? r3(logU(0.01, 0.2)) : undefined,
        VF: lossy ? r3(logU(0.2, 0.8)) : undefined,
        Cnode: rnd() < 0.5 ? pick([1e-11, 1e-10, 1e-9]) : undefined,
        load,
      };
      if (rnd() < 0.25) p.source = { Voc: r3(Vg * logU(1, 1.5)), Rs: r3(logU(0.05, 5)), Cbus: r3(logU(1e-6, 1e-3)) };
      let r;
      try {
        r = simulate(p);
      } catch {
        continue; // a node capacitance that rings too fast is refused
      }
      if (r.status !== 'steady') continue;
      steady++;
      for (const m of modes(r)) {
        const st = byId(elementStates(r, m));
        for (const [id, allowed] of Object.entries(asserts[m.kind] ?? {})) if (!allowed.includes(st[id]!.state)) wrong.push(`${JSON.stringify(p)}: mode ${m.index} (${m.kind}), ${id} ${st[id]!.state}`);
        const L = st.L ?? st.LM!;
        if (m.kind === 'idle' ? L.state !== 'zero' : m.kind !== 'ring' && L.state === 'zero') wrong.push(`${JSON.stringify(p)}: mode ${m.index} (${m.kind}), inductor ${L.state}`);
      }
    }
    expect(steady).toBeGreaterThan(60);
    expect(wrong).toEqual([]);
  });
});
