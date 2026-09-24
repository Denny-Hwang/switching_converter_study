import { describe, expect, it } from 'vitest';
import { evaluate } from '../src/equations';
import { buildModel, followStartUp, restState, runCycle, simulate, startUp, steadyState, stepsFor, type SimParams } from '../src/sim';

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

  it("within the search's tolerance of it the converter counts as balanced; a little further the current runs away", () => {
    // 1e-9 above: the current gains 2.4e-13 A a cycle, 4e-13 of its ripple, below the tolerance of 1e-6
    const near = simulate({ topology: 'buck', Vg: 24, D: 0.5 + 1e-9, fs, L: 1e-4, load: { kind: 'fixed', V: 12 } });
    expect(near.status).toBe('steady');
    expect(near.cycles).toBeLessThanOrEqual(3);
    // 1e-5 above: 2.4e-5 A a cycle, the net volt-seconds (V_g D - V) T_s over L
    const far = simulate({ topology: 'buck', Vg: 24, D: 0.5 + 1e-5, fs, L: 1e-4, load: { kind: 'fixed', V: 12 } });
    expect(far.status).toBe('runaway');
    expect(rel(far.drift!.perCycle, ((24 * (0.5 + 1e-5) - 12) * Ts) / 1e-4)).toBeLessThan(1e-6);
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
        // the search starts there; the start-up from V_0 heads there, closer every hundred cycles until it is
        // there to rounding (a node capacitance slows the last volts down)
        const model = buildModel(p);
        const iv = model.stateNames.indexOf('v');
        let x = restState(p, model);
        let gap = Math.abs(x[iv]! - 6);
        for (let k = 0; k < 5; k++) {
          for (let j = 0; j < 100; j++) x = runCycle(model, x, { stepsPerPeriod: stepsFor(p) }).x;
          const g = Math.abs(x[iv]! - 6);
          expect(g < gap || g <= 1e-12, `V0 ${V0}, C_node ${Cnode}, after ${100 * (k + 1)} cycles: ${g} from ${gap}`).toBe(true);
          gap = g;
        }
        expect(gap, `V0 ${V0}, C_node ${Cnode}`).toBeLessThan(0.1);
      }
    }
  });

  it('with a node capacitance too, whatever its losses and source (the search does not rely on the slow creep there)', () => {
    const base: SimParams = { topology: 'buck', Vg: 54.8, D: 0.676, fs, L: 1.34e-5, Ron: 0.125, RL: 0.0574, VF: 0.292, Cnode: 1e-10, load: { kind: 'network', C: 1.11e-6, V0: 0 } };
    // (the last: a state at rest picks up rounding of 1e-20 A and 1e-16 V from the 33.8 V around it)
    const noisy: SimParams = { topology: 'buck', Vg: 33.8, D: 0.372, fs, L: 5.58e-4, Ron: 0.0121, Cnode: 1e-10, source: { Voc: 33.8, Rs: 1.75, Cbus: 4.66e-5 }, load: { kind: 'network', C: 2.44e-9, V0: 0 } };
    for (const p of [base, { ...base, source: { Voc: 54.8, Rs: 0.26, Cbus: 4.15e-5 } }, { ...base, Vg: 24, D: 0.5, L: 1e-4, Ron: 0.05, RL: 0, VF: 0, load: { kind: 'network', C: 1e-5, V0: 0 } }, noisy] as SimParams[]) {
      const r = simulate(p);
      expect(r.status).toBe('steady');
      expect(r.cycles).toBe(1);
      expect(rel(r.avg.v_out!, p.Vg)).toBeLessThan(1e-9);
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
    // no charge reaches the capacitor there; the start-up is followed until it stops, so the voltage is its own
    expect(r.max.i_D).toBe(0);
    expect(rel(r.avg.v_out!, su.v)).toBeLessThan(1e-12);
  });

  it('a capacitor that stops while the current still rings, flipping sign from cycle to cycle, is steady there: the search takes no step on it', () => {
    // a larger duty ratio: the inductance rings with C_node after turn-off, and the current left at turn-on
    // alternates about its steady value, decaying by only R_on's loss
    for (const C of [1e-9, 1e-8]) {
      const p: SimParams = { topology: 'boost', Vg: 12, D: 0.6, fs, L: 1e-4, Ron: 0.05, Cnode: 1e-9, load: { kind: 'network', C, V0: 0 } };
      const r = simulate(p);
      expect(r.status, `C ${C}`).toBe('steady');
      expect(r.max.i_D, `C ${C}`).toBe(0);
      expect(rel(r.avg.v_out!, startUpUntilStopped(p, 5000).v), `C ${C}`).toBeLessThan(1e-12);
      // the start-up followed, the search, and its checks, all counted
      const model = buildModel(p);
      expect(r.cycles).toBeGreaterThan(followStartUp(p, model, stepsFor(p)).cycles);
      expect(r.cycles).toBeLessThan(500);
    }
  });

  it('a start-up that jumps past a lower steady state keeps its own: the voltage reported is never below one it reached', () => {
    // the first cycles from rest carry more energy than the periodic ringing: the start-up stops at 63.3 V
    // after three cycles, while a search started from rest finds another cycle with no charge, at 50.6 V
    // (the circuit of the SPICE case buckboost-cnode-stop)
    const p: SimParams = { topology: 'buckboost', Vg: 8, D: 0.8, fs, L: 4e-4, Ron: 0.025, RL: 1, VF: 0.5, Cnode: 1e-9, load: { kind: 'network', C: 1e-8, V0: 0 } };
    const model = buildModel(p);
    const iv = model.stateNames.indexOf('v');
    const fromRest = steadyState(model, restState(p, model), { stepsPerPeriod: stepsFor(p) });
    expect(fromRest.converged).toBe(true);
    expect(fromRest.x0[iv]!).toBeLessThan(55);
    const r = simulate(p);
    expect(r.status).toBe('steady');
    expect(rel(r.avg.v_out!, startUpUntilStopped(p, 2000).v)).toBeLessThan(1e-12);
    expect(r.avg.v_out!).toBeGreaterThan(60);
  });

  it("a slowly recovering input bus: the capacitor keeps the voltage its start-up reached, above the final cycle's edge", () => {
    // the bus sags during the start-up and settles over thousands of cycles; the node rang higher early on,
    // and the capacitor keeps that charge
    const p: SimParams = { topology: 'boost', Vg: 12, D: 0.3, fs, L: 1e-4, Ron: 0.05, Cnode: 1e-9, source: { Voc: 12, Rs: 10, Cbus: 1e-3 }, load: { kind: 'network', C: 1e-8, V0: 0 } };
    const r = simulate(p);
    expect(r.status).toBe('steady');
    expect(rel(r.avg.v_out!, startUpUntilStopped(p, 2000).v)).toBeLessThan(1e-12);
  });

  it('a forward converter above its reset limit, its magnetizing current held by R_on: the capacitor stops where its start-up does', () => {
    // the rectifier conducts in the first cycles only, while the magnetizing current is still small; a search
    // from rest finds a cycle with no charge at 1.0 V, the start-up stops at 2.37 V
    const p: SimParams = { topology: 'forward', Vg: 12, D: 0.65, fs, L: 3e-5, n: 0.2, nr: 1, LM: 1.3e-3, Ron: 0.06, RL: 0.06, VF: 0.3, load: { kind: 'network', C: 5.6e-5, V0: 0 } };
    const r = simulate(p);
    expect(r.status).toBe('steady');
    expect(rel(r.avg.v_out!, startUpUntilStopped(p, 2000).v)).toBeLessThan(1e-12);
    expect(r.avg.v_out!).toBeGreaterThan(2);
  });

  it('a start-up still far from its stop when the following ends, where the search fails: the steady state comes from above', () => {
    // the start-up creeps up to 1419 V, and is at 1407 V after 12 000 cycles; a search from where the
    // following ended (814 V after 1000 cycles) diverges, one with the capacitor at 1628 V finds the ringing
    // with no charge, and the bisection runs down to its edge; and a forward converter whose search stalls
    // at the kink where its rectifier stops conducting, just below n V_g - V_F (on the magnetizing current's R_on drop)
    for (const [p, near] of [
      [{ topology: 'boost', Vg: 67.6, D: 0.235, fs, L: 1.52e-4, Ron: 0.0232, Cnode: 1e-10, load: { kind: 'network', C: 2.38e-7, V0: 0 } }, 1419.05],
      [{ topology: 'forward', Vg: 10.4, D: 0.528, fs, L: 5.35e-5, n: 0.227, nr: 0.5, LM: 9.03e-4, Ron: 0.178, RL: 0.065, VF: 0.426, load: { kind: 'network', C: 8.39e-6, V0: 0 } }, 0.227 * 10.4 - 0.426],
    ] as [SimParams, number][]) {
      const r = simulate(p);
      expect(r.status, p.topology).toBe('steady');
      expect(rel(r.avg.v_out!, near), p.topology).toBeLessThan(1e-5);
      // its edge: no charge there (to rounding: the forward converter's charge per cycle shrinks to
      // nothing there, the boost's stops at once), more charge just below
      const model = buildModel(p);
      const iv = model.stateNames.indexOf('v');
      const v = r.x0[iv]!;
      const dvAt = runCycle(model, r.x0, { stepsPerPeriod: stepsFor(p) }).dx[iv]!;
      expect(Math.abs(dvAt), p.topology).toBeLessThanOrEqual(1e-12 * v);
      const below = r.x0.map((x, j) => (j === iv ? v * (1 - 1e-7) : x));
      expect(runCycle(model, below, { stepsPerPeriod: stepsFor(p) }).dx[iv]!, p.topology).toBeGreaterThan(dvAt);
    }
  });

  it('a search cut short reports that the capacitor has not settled, with its change per cycle', () => {
    // a forward converter's large capacitor creeping up to n V_g: its start-up is followed, then one cycle of search
    const r = simulate({ topology: 'forward', Vg: 48, D: 0.4, fs, L: 1e-4, n: 0.5, nr: 1, LM: 1e-3, load: { kind: 'network', C: 1e-2, V0: 0 } }, { maxCycles: 1 });
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

  it('a current that reaches zero with the output above the input turns negative at once, through the body diode', () => {
    // an L-C overshoot lifts the output above the input within the period (a light resistive load; a battery
    // below the input behind a resistor): when the diode's current ends there, the switch voltage would be
    // negative, so the body diode conducts, and the switch voltage never falls below zero
    for (const load of [
      { kind: 'resistive', R: 1000, C: 1e-7 },
      { kind: 'network', C: 1e-7, R: 100, battery: { V: 20, R: 100 } },
    ] as SimParams['load'][]) {
      const q: SimParams = { topology: 'buck', Vg: 24, D: 0.2, fs, L: 1e-5, load };
      const r = simulate(q);
      expect(r.status, load.kind).toBe('steady');
      expect(r.min.v_sw!, load.kind).toBeGreaterThanOrEqual(0);
      expect(r.min.i_L!, load.kind).toBeLessThan(-0.02);
      const run = runCycle(buildModel(q), r.x0, { stepsPerPeriod: 2000 });
      expect(run.events.map((e) => `${e.from}>${e.to}`), load.kind).toEqual(['on>off', 'off>rev', 'rev>idle']);
    }
  });

  it('a switch turned off at zero current with the output above the input hands over to the body diode, not to idle', () => {
    const q: SimParams = { topology: 'buck', Vg: 24, D: 0.2, fs, L: 1e-5, load: { kind: 'network', C: 1e-7, R: 100, battery: { V: 20, R: 100 } } };
    const model = buildModel(q);
    const x = restState(q, model);
    const iv = model.stateNames.indexOf('v');
    x[iv] = 30;
    expect(model.turnOff(x).interval).toBe('rev');
    x[iv] = 18;
    expect(model.turnOff(x).interval).toBe('idle');
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

describe('outside the model: a switch voltage below zero', () => {
  it('a forward converter beyond its reset limit, its bus collapsed below zero by a weak source, is flagged', () => {
    // the magnetizing current held only by R_s: the bus swings below zero, and with it the switch
    // voltage during the reset, where a real switch's body diode would conduct
    const r = simulate({ topology: 'forward', Vg: 48, D: 0.7, fs, L: 1e-4, n: 0.5, nr: 1, LM: 1e-3, Ron: 0.01, source: { Voc: 48, Rs: 10, Cbus: 1e-6 }, load: { kind: 'resistive', R: 10, C: 1e-5 } });
    expect(r.min.v_in!).toBeLessThan(0);
    expect(r.switchBelowZero).toBe(r.min.v_sw);
    expect(r.switchBelowZero!).toBeLessThan(-10);
  });

  it('no other circuit is: every converter, load, source and node capacitance keeps its switch voltage at or above zero', () => {
    const loads: SimParams['load'][] = [
      { kind: 'resistive', R: 10, C: 1e-4 },
      { kind: 'network', C: 1e-4, battery: { V: 8, R: 0.5 } },
      { kind: 'network', C: 1e-4, R: 20, battery: { V: 8, R: 0.5 } },
      { kind: 'fixed', V: 12 },
    ];
    const flagged: string[] = [];
    for (const topology of ['buck', 'boost', 'buckboost', 'flyback', 'forward'] as const) {
      for (const load of loads) {
        const p = { topology, Vg: 24, D: 0.4, fs, L: 1e-4, n: 0.5, nr: 1, LM: 1e-3, Ron: 0.1, load } as SimParams;
        const variants: SimParams[] = [p, { ...p, source: { Voc: 30, Rs: 1, Cbus: 1e-4 } }];
        if (topology !== 'forward') variants.push({ ...p, Cnode: 1e-10 });
        for (const q of variants) {
          const r = simulate(q);
          if (r.switchBelowZero !== undefined) flagged.push(`${topology} ${load.kind}${q.source ? ' source' : ''}${q.Cnode ? ' C_node' : ''}: ${r.switchBelowZero}`);
        }
      }
    }
    expect(flagged).toEqual([]);
  });
});
