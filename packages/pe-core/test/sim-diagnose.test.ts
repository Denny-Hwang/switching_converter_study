import { describe, expect, it } from 'vitest';
import { evaluate } from '../src/equations';
import { buildModel, restState, runCycle, simulate, startUp, stepsFor, type SimParams } from '../src/sim';

/**
 * What the simulator reports when a circuit's steady state is not a single,
 * isolated point, or does not exist: the duty ratio that balances a fixed
 * output, a capacitor alone, a current that reverses through the switch's
 * body diode, and the diagnosis of a search that fails.
 */

const fs = 1e5;
const Ts = 1 / fs;
const rel = (a: number, b: number) => Math.abs(a - b) / Math.abs(b);

/**
 * Cycles from rest until the output capacitor has stopped changing for good:
 * its change over a cycle exactly zero for `quiet` cycles in a row (the other
 * states may still settle for a while, and the capacitor take a little more
 * charge). Its last change, and the voltage it stops at.
 */
function startUpUntilStopped(p: SimParams, max: number, quiet = 200): { v: number; lastStep: number } {
  const model = buildModel(p);
  const iv = model.stateNames.indexOf('v');
  const steps = stepsFor(p);
  let x = restState(p, model);
  let lastStep = 0;
  let still = 0;
  for (let k = 0; k < max; k++) {
    const r = runCycle(model, x, { stepsPerPeriod: steps });
    x = r.x;
    if (r.dx[iv] === 0) {
      if (++still >= quiet) return { v: x[iv]!, lastStep };
    } else {
      still = 0;
      lastStep = r.dx[iv]!;
    }
  }
  throw new Error(`the capacitor still changes after ${max} cycles`);
}

describe('a fixed output around its balancing duty ratio', () => {
  it('at exactly the balancing duty ratio (ideal parts) every current is periodic: the buck and the boost settle', () => {
    for (const p of [
      { topology: 'buck', Vg: 24, D: 0.5, fs, L: 1e-4, load: { kind: 'fixed', V: 12 } },
      { topology: 'boost', Vg: 12, D: 0.5, fs, L: 1e-4, load: { kind: 'fixed', V: 24 } },
    ] as SimParams[]) {
      const r = simulate(p);
      expect(r.status, p.topology).toBe('steady');
      // the current reached from rest: it starts and ends each period at zero
      expect(Math.abs(r.min.i_L!), p.topology).toBeLessThan(1e-12);
      expect(r.mode).toBe('BCM');
    }
  });

  it('below it the current falls to zero within the period and the converter settles in DCM', () => {
    for (const p of [
      { topology: 'buck', Vg: 24, D: 0.3, fs, L: 1e-4, load: { kind: 'fixed', V: 12 } },
      { topology: 'boost', Vg: 12, D: 0.3, fs, L: 1e-4, load: { kind: 'fixed', V: 24 } },
      { topology: 'buckboost', Vg: 12, D: 0.3, fs, L: 1e-4, load: { kind: 'fixed', V: 12 } },
      { topology: 'flyback', Vg: 300, D: 0.02, fs, L: 1e-4, n: 0.2, load: { kind: 'fixed', V: 5 } },
      { topology: 'forward', Vg: 48, D: 0.1, fs, L: 1e-4, n: 0.5, nr: 1, LM: 1e-3, load: { kind: 'fixed', V: 12 } },
    ] as SimParams[]) {
      const r = simulate(p);
      expect(r.status, p.topology).toBe('steady');
      expect(r.mode, p.topology).toBe('DCM');
    }
  });

  it('above it the current runs away; the change per cycle is the net volt-seconds over L (0.72 A for this buck)', () => {
    const r = simulate({ topology: 'buck', Vg: 24, D: 0.8, fs, L: 1e-4, load: { kind: 'fixed', V: 12 } });
    expect(r.status).toBe('runaway');
    // (V_g - V) D T_s up, V (1 - D) T_s down: 7.2 V T_s net
    expect(r.drift!.perCycle).toBeCloseTo((((24 - 12) * 0.8 - 12 * 0.2) * Ts) / 1e-4, 12);
    expect(r.drift!.Dbalance).toBeCloseTo(0.5, 9);
  });

  it("the buck-boost's balancing duty ratio comes from its inverted ratio, M = -V/V_g", () => {
    const r = simulate({ topology: 'buckboost', Vg: 12, D: 0.7, fs, L: 1e-4, load: { kind: 'fixed', V: 12 } });
    expect(r.status).toBe('runaway');
    expect(r.drift!.Dbalance).toBeCloseTo(0.5, 9);
  });

  it('a forward converter above its reset limit reports its magnetizing current first, with the limit', () => {
    const Dmax = evaluate('forward.reset.Dmax', { n_r: 1 });
    for (const load of [
      { kind: 'fixed', V: 8 },
      { kind: 'network', C: 1e-4, V0: 0 },
    ] as SimParams['load'][]) {
      const r = simulate({ topology: 'forward', Vg: 24, D: 0.7, fs, L: 1e-4, n: 0.5, nr: 1, LM: 1e-3, load });
      expect(r.status, load.kind).toBe('runaway');
      expect(r.drift!.state).toBe('iM');
      expect(r.drift!.Dmax).toBeCloseTo(Dmax, 12);
      // on: V_g D T_s; reset: V_g/n_r for the rest of the period (the core never resets)
      expect(r.drift!.vLavg!).toBeCloseTo(24 * 0.7 - 24 * 0.3, 6);
    }
  });
});

describe('a capacitor alone', () => {
  it('behind a boost without a node capacitance it charges without bound (no search); the drift is the start-up\'s own last cycle', () => {
    const r = simulate({ topology: 'boost', Vg: 12, D: 0.3, fs, L: 1e-4, load: { kind: 'network', C: 1e-5, V0: 0 } });
    expect(r.status).toBe('charging');
    const su = r.startUp!;
    const iv = r.stateNames.indexOf('v');
    expect(r.drift!.perCycle).toBe(su.end[iv]! - su.lastStart[iv]!);
    expect(r.drift!.perCycle).toBeGreaterThan(0);
  });

  it('behind a buck it settles at the input, from below and from above (the switch conducts both ways)', () => {
    for (const V0 of [0, 40]) {
      for (const Cnode of [undefined, 1e-9]) {
        const p: SimParams = { topology: 'buck', Vg: 6, D: 0.5, fs, L: 1e-5, Ron: 0.05, Cnode, load: { kind: 'network', C: 1e-5, V0 } };
        const r = simulate(p);
        expect(r.status, `V0 ${V0}, C_node ${Cnode}`).toBe('steady');
        expect(rel(r.avg.v_out!, 6), `V0 ${V0}, C_node ${Cnode}`).toBeLessThan(1e-6);
      }
    }
  });

  it('behind a forward converter it keeps a start voltage above n V_g: nothing reaches it any more', () => {
    const r = simulate({ topology: 'forward', Vg: 48, D: 0.4, fs, L: 1e-4, n: 0.5, nr: 1, LM: 1e-3, load: { kind: 'network', C: 1e-4, V0: 30 } });
    expect(r.status).toBe('steady');
    expect(rel(r.avg.v_out!, 30)).toBeLessThan(1e-12);
    expect(r.max.i_L).toBe(0);
  });

  it("behind a forward converter it keeps the peak of an L-C charge that overshoots n V_g: the start-up's own stop", () => {
    // D = 0.6 within the reset limit of n_r = 0.5; the L-C charge towards D n V_g peaks near 2 D n V_g
    const p: SimParams = { topology: 'forward', Vg: 48, D: 0.6, fs, L: 1e-4, n: 0.5, nr: 0.5, LM: 1e-3, load: { kind: 'network', C: 1e-4, V0: 0 } };
    const r = simulate(p);
    expect(r.status).toBe('steady');
    const su = startUpUntilStopped(p, 2000);
    expect(rel(r.avg.v_out!, su.v)).toBeLessThan(1e-9);
    expect(su.v).toBeGreaterThan(0.5 * 48);
  });

  it('behind a forward converter below D = 0.5 it creeps up to n V_g', () => {
    const r = simulate({ topology: 'forward', Vg: 48, D: 0.4, fs, L: 1e-4, n: 0.5, nr: 1, LM: 1e-3, load: { kind: 'network', C: 1e-4, V0: 0 } });
    expect(r.status).toBe('steady');
    expect(rel(r.avg.v_out!, 24)).toBeLessThan(1e-6);
  });

  it('a boost with a node capacitance charges from 0 V: its diode conducts from the first turn-off, with no forward drop', () => {
    const p: SimParams = { topology: 'boost', Vg: 12, D: 0.3, fs, L: 1e-4, Ron: 0.05, Cnode: 1e-9, load: { kind: 'network', C: 1e-7, V0: 0 } };
    const model = buildModel(p);
    const first = runCycle(model, restState(p, model), { stepsPerPeriod: stepsFor(p), record: true });
    expect(first.samples.map((s) => s.interval)).toContain('off');
    expect(first.x[model.stateNames.indexOf('v')]!).toBeGreaterThan(1);
  });

  it('a boost with a node capacitance stops where its start-up stops: the search is brought back to the voltage the start-up creeps up to', () => {
    // a small output capacitor, so that the start-up stops within a few hundred cycles
    const p: SimParams = { topology: 'boost', Vg: 12, D: 0.3, fs, L: 1e-4, Ron: 0.05, Cnode: 1e-9, load: { kind: 'network', C: 1e-9, V0: 0 } };
    const r = simulate(p);
    expect(r.status).toBe('steady');
    const su = startUpUntilStopped(p, 5000);
    // the reported voltage is the edge the start-up creeps up to: no charge reaches the capacitor there,
    // and the start-up, which charges in steps, stops at most its last step above it
    expect(r.max.i_D).toBe(0);
    expect(r.avg.v_out!).toBeLessThanOrEqual(su.v * (1 + 1e-12));
    expect(su.v - r.avg.v_out!).toBeLessThanOrEqual(su.lastStep);
  });

  it('a search cut short reports that the capacitor has not settled, with its change per cycle', () => {
    const r = simulate({ topology: 'buck', Vg: 24, D: 0.5, fs, L: 1e-4, load: { kind: 'network', C: 1e-2, V0: 0 } }, { maxCycles: 1 });
    expect(r.status).toBe('unsettled');
    expect(r.drift!.state).toBe('v');
    expect(r.drift!.perCycle).toBeGreaterThan(0);
  });

  it('a search cut short for another reason is unsettled, without a drift', () => {
    // a DCM buck, whose cycle map is not linear: one cycle is no search at all
    const r = simulate({ topology: 'buck', Vg: 24, D: 0.3, fs, L: 2e-5, load: { kind: 'resistive', R: 50, C: 22e-6 } }, { maxCycles: 1 });
    expect(r.status).toBe('unsettled');
    expect(r.drift).toBeUndefined();
  });
});

describe("a negative current through the switch's body diode", () => {
  const p: SimParams = { topology: 'buck', Vg: 24, D: 0.5, fs, L: 1e-4, Ron: 0.05, load: { kind: 'network', C: 22e-6, battery: { V: 30, R: 0.5 } } };

  it('a battery above the input discharges through the body diode, on or off: at zero volts, with no loss in R_on', () => {
    const r = simulate(p);
    expect(r.status).toBe('steady');
    expect(new Set(r.waveforms.interval as string[])).toEqual(new Set(['onRev', 'rev']));
    // the battery's excess over the input across R_b alone
    expect(rel(r.avg.i_L!, -(30 - 24) / 0.5)).toBeLessThan(1e-9);
    expect(r.max.v_sw).toBe(0);
    expect(r.min.v_sw).toBe(0);
    expect(r.max.i_sw).toBe(0);
    expect(r.losses.conduction).toBe(0);
  });

  it('from rest the first interval is already the body diode: the current turns negative at once', () => {
    const model = buildModel(p);
    const su = startUp(p, model, 1, 200);
    expect((su.waveforms.interval as string[])[0]).toBe('onRev');
  });

  it('a current that falls through zero while the switch is on moves to the body diode', () => {
    // the battery above the input: a small positive current at turn-on falls through zero within the on-interval
    const model = buildModel(p);
    const x = restState(p, model);
    x[0] = 0.1;
    const run = runCycle(model, x, { stepsPerPeriod: 400, record: true });
    expect(run.events.map((e) => `${e.from}>${e.to}`)[0]).toBe('on>onRev');
    // the ideal diode holds the switch at zero volts from there on
    const after = run.samples.filter((s) => s.interval === 'onRev');
    expect(after.length).toBeGreaterThan(0);
  });

  it('a negative current that rises through zero while the switch is on moves back to the switch', () => {
    // a battery below the input: the on-interval's positive voltage lifts a negative start current through zero
    const q: SimParams = { ...p, load: { kind: 'network', C: 22e-6, battery: { V: 12, R: 0.5 } } };
    const model = buildModel(q);
    const x = restState(q, model);
    x[0] = -0.3;
    const run = runCycle(model, x, { stepsPerPeriod: 400, record: true });
    expect(run.samples[0]!.interval).toBe('onRev');
    expect(run.events.map((e) => `${e.from}>${e.to}`)[0]).toBe('onRev>on');
    // about 24 - 12 V across 100 uH (the output moves a little), with 0.3 A to make up: 2.5 us after turn-on
    expect(rel(run.events[0]!.t, (0.3 * 1e-4) / 12)).toBeLessThan(2e-3);
  });
});
