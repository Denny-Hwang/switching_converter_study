import { describe, expect, it } from 'vitest';
import { evaluate } from '../src/equations';
import { buildModel, followStartUp, restState, ringsPerPeriod, runCycle, simulate, startUp, steadyState, stepsFor, type SimParams } from '../src/sim';

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
 * its change over a cycle zero to rounding (a few units in the last place)
 * for `quiet` cycles in a row (the other states may still settle for a while,
 * and the capacitor take a little more charge). Its last change, and the
 * voltage it stops at.
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
    if (Math.abs(r.dx[iv]!) <= 4 * Number.EPSILON * Math.abs(x[iv]!)) {
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
    // the search starts at the input's voltage; the start-ups from rest really do get there
    for (const p of [base, { ...base, source: { Voc: 54.8, Rs: 0.26, Cbus: 4.15e-5 } }] as SimParams[]) {
      const model = buildModel(p);
      const iv = model.stateNames.indexOf('v');
      let x = restState(p, model);
      for (let k = 0; k < 200; k++) x = runCycle(model, x, { stepsPerPeriod: stepsFor(p) }).x;
      expect(rel(x[iv]!, p.Vg), p.source ? 'with a source' : 'stiff input').toBeLessThan(1e-3);
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

  it('behind a forward converter its rectifier lets no current back, also turned on with no voltage across it as the bus sags', () => {
    // the reset winding pumps the bus above V_oc; the capacitor, above n V_g less the diode drop, stops where the
    // on-voltage at turn-on is zero, and the bus then sags within the on-interval: the current starts at zero and
    // must not turn negative (before the fix the capacitor lost 1.36 V in cycle 219)
    const p: SimParams = { topology: 'forward', Vg: 7.51, D: 0.808, fs, L: 1.25e-4, RL: 0.0335, VF: 0.64, n: 3.28, nr: 0.5, LM: 4.02e-4, source: { Voc: 7.51, Rs: 0.46, Cbus: 1.74e-7 }, load: { kind: 'network', C: 1.01e-9, V0: 37.4 } };
    const model = buildModel(p);
    const iv = model.stateNames.indexOf('v');
    for (const steps of [2000, 100]) {
      let x = restState(p, model);
      let lost = 0;
      for (let k = 0; k < 400; k++) {
        const c = runCycle(model, x, { stepsPerPeriod: steps });
        lost = Math.min(lost, c.dx[iv]!);
        x = c.x;
      }
      expect(lost, `${steps} sub-steps`).toBe(0);
      expect(x[iv]!).toBeGreaterThanOrEqual(37.4);
    }
    const r = simulate(p);
    expect(r.status).toBe('steady');
    expect(r.avg.v_out!).toBeGreaterThanOrEqual(37.4);
    expect(r.min.i_D!).toBeGreaterThanOrEqual(-1e-11);
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
    // no charge that counts reaches the capacitor there (at most the ringing's peak touches the diode's turn-on
    // voltage); the start-up is followed until it stops, so the voltage is its own
    expect(r.max.i_D!).toBeLessThan(1e-6 * r.max.i_L!);
    expect(rel(r.avg.v_out!, su.v)).toBeLessThan(1e-12);
  });

  it("a rise that passes the diode's turn-on voltage just before its current ends at the peak turns the diode on", () => {
    // the rise ends when the current reaches zero, at the node's peak, within a sub-step whose end has the node back
    // below the turn-on voltage: the engine checks the other conditions again at that event (before, the rise
    // went on to ring 6 mV past the diode's drop, and the capacitor stopped 6 mV low)
    const p: SimParams = { topology: 'boost', Vg: 24, D: 0.4, fs, L: 1e-4, Ron: 0.1, VF: 0.5, Cnode: 1e-10, load: { kind: 'network', C: 1e-5, V0: 0 } };
    const r = simulate(p);
    expect(r.status).toBe('steady');
    const model = buildModel(p);
    const run = runCycle(model, r.x0, { stepsPerPeriod: stepsFor(p) });
    expect(run.events.map((e) => `${e.from}>${e.to}`)).toContain('rise>off');
    expect(Math.max(...(r.waveforms.v_D as number[]))).toBeLessThanOrEqual(0.5 + 1e-9 * r.max.v_out!);
    expect(r.diodes).toBeUndefined();
  });

  it('a capacitor that stops while the current still rings, flipping sign from cycle to cycle, is steady there: the search takes no step on it', () => {
    // a larger duty ratio: the inductance rings with C_node after turn-off, and the current left at turn-on
    // alternates about its steady value, decaying by only R_on's loss
    for (const C of [1e-9, 1e-8]) {
      const p: SimParams = { topology: 'boost', Vg: 12, D: 0.6, fs, L: 1e-4, Ron: 0.05, Cnode: 1e-9, load: { kind: 'network', C, V0: 0 } };
      const r = simulate(p);
      expect(r.status, `C ${C}`).toBe('steady');
      expect(r.max.i_D!, `C ${C}`).toBeLessThan(1e-6 * r.max.i_L!);
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
    // the final cycle's edge, the lowest voltage no charge reaches, lies 50 to 100 mV below
    const model = buildModel(p);
    const iv = model.stateNames.indexOf('v');
    const gain = (dv: number) => {
      const x = r.x0.slice();
      x[iv] = r.x0[iv]! - dv;
      return runCycle(model, x, { stepsPerPeriod: stepsFor(p) }).dx[iv]!;
    };
    expect(gain(0.05)).toBe(0);
    expect(gain(0.1)).toBeGreaterThan(0);
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

  it('a body-diode interval entered with the current at exactly zero ends as the current turns positive, at any sub-step', () => {
    // the fourth review's buck on a source: its diode's current ends at 38.058 us, the output above the bus, and the
    // body diode takes over at zero current. Within one sub-step of 50 per period the current went negative and
    // back above zero, the guard never saw it positive, and 0.148 A flowed forward through the body diode
    // (5.349 V after one cycle instead of 1.482 V)
    const q: SimParams = { topology: 'buck', Vg: 5.39, D: 0.761, fs: 2e4, L: 6.36e-6, Ron: 2.06e-3, source: { Voc: 5.39, Rs: 0.0986, Cbus: 1.56e-5 }, load: { kind: 'resistive', R: 68.8, C: 1.3e-7 } };
    const model = buildModel(q);
    const iv = model.stateNames.indexOf('v');
    const ends = [50, 100, 2000, 20000].map((steps) => {
      const run = runCycle(model, restState(q, model), { stepsPerPeriod: steps, record: true });
      expect(run.events.map((e) => `${e.from}>${e.to}`).slice(-2), `${steps}`).toEqual(['off>rev', 'rev>idle']);
      // no current through the body diode but a negative one: at most the second guard's rounding-level threshold
      for (const x of run.samples) if (x.interval === 'rev') expect(x.x[0]!, `${steps}`).toBeLessThanOrEqual(2e-12 * model.scales![0]!);
      return run.x[iv]!;
    });
    for (const v of ends) expect(rel(v, ends.at(-1)!)).toBeLessThan(1e-9);
    expect(ends.at(-1)!).toBeCloseTo(1.4815, 4);
  });
});

describe('outside the model: a diode the model holds off would conduct', () => {
  const maxOf = (w: Record<string, unknown>, k: string) => Math.max(...(w[k] as number[]));
  const minOf = (w: Record<string, unknown>, k: string) => Math.min(...(w[k] as number[]));

  it('a forward converter beyond its reset limit, its bus collapsed below zero by a weak source: the reset diode and the switch', () => {
    // the magnetizing current held only by R_s: the bus swings below zero, where the reset diode would
    // conduct, and with it the switch voltage during the reset, where a real switch's body diode would
    const r = simulate({ topology: 'forward', Vg: 48, D: 0.7, fs, L: 1e-4, n: 0.5, nr: 1, LM: 1e-3, Ron: 0.01, source: { Voc: 48, Rs: 10, Cbus: 1e-6 }, load: { kind: 'resistive', R: 10, C: 1e-5 } });
    expect(r.status).toBe('steady');
    expect(r.min.v_in!).toBeLessThan(0);
    // a steady period: no start-up cycle to name
    const d3 = r.diodes!.find((d) => d.diode === 'D3')!;
    expect([r.switchFrom, d3.from]).toEqual([undefined, undefined]);
    expect(d3.v).toBe(maxOf(r.waveforms, 'v_Dr'));
    expect(d3.v).toBeGreaterThan(10);
    expect(d3.drop).toBe(0);
    expect(r.switchBelowZero).toBe(r.min.v_sw);
    expect(r.switchBelowZero!).toBeLessThan(-10);
  });

  it("a weak source that drives the diode of a buck, a buck-boost or a flyback beyond its drop is flagged", () => {
    // ngspice, with the diodes the models leave out: the buck's bus -0.48 V and output 0.263 V (the model: -8.26 V,
    // 0.203 V); the buck-boost's bus -3.07 V and output 3.19 V (the model: -5.05 V, 2.81 V). In the model the buck's
    // freewheeling diode sees 8.3 V forward while the switch is on
    const buck = simulate({ topology: 'buck', Vg: 24, D: 0.5, fs, L: 1e-5, Ron: 0.05, VF: 0.5, source: { Voc: 24, Rs: 50, Cbus: 1e-8 }, load: { kind: 'resistive', R: 0.5, C: 1e-5 } });
    expect(buck.diodes).toEqual([{ diode: 'D', v: maxOf(buck.waveforms, 'v_D'), drop: 0.5 }]);
    expect(buck.diodes![0]!.v).toBeGreaterThan(8);
    expect(buck.switchBelowZero).toBeUndefined();
    for (const topology of ['buckboost', 'flyback'] as const) {
      const r = simulate({ topology, Vg: 24, D: 0.6, fs, L: 1e-4, n: 1, Ron: 0.05, source: { Voc: 24, Rs: 20, Cbus: 1e-7 }, load: { kind: 'resistive', R: 5, C: 1e-5 } } as SimParams);
      expect(r.diodes!.map((d) => d.diode), topology).toEqual(['D']);
      expect(r.diodes![0]!.v, topology).toBeGreaterThan(2);
      expect(r.switchBelowZero!, topology).toBeLessThan(-2);
    }
  });

  it("the forward converter's freewheeling diode D_2 is flagged when the switch's drop exceeds a sagging bus while the switch is on", () => {
    // the fifth review's circuits: while the switch is on, R_on's drop exceeds the bus, the primary voltage turns
    // negative, and the model keeps the rectifier D_1 conducting; D_2 is then forward-biased by -n v_pri beyond V_F.
    // ngspice, with every diode: D_2 carries up to 0.56 A while the switch is on, <i_L> 9.334 A against the model's
    // 9.206 A, the worst value 6.1 % off
    const p: SimParams = { topology: 'forward', Vg: 51.3, D: 0.223, fs: 90900, L: 2.29e-5, n: 2.97, nr: 0.85, LM: 1.95e-4, Ron: 1.32, load: { kind: 'network', C: 1.41e-6, R: 1.58, battery: { V: 2.48, R: 0.0595 } }, source: { Voc: 51.3, Rs: 0.686, Cbus: 2.44e-6 } };
    const r = simulate(p);
    expect(r.status).toBe('steady');
    expect(r.min.v_in!).toBeGreaterThan(36);
    expect(maxOf(r.waveforms, 'v_Dr')).toBeLessThanOrEqual(1e-9);
    expect(r.diodes!.map((d) => d.diode)).toEqual(['D2']);
    const d2 = r.diodes![0]!;
    expect(d2.v).toBe(maxOf(r.waveforms, 'v_D2'));
    expect(d2.v).toBeGreaterThan(5.2);
    expect(d2.v).toBeLessThan(5.4);
    // where it happens: the switch on, the rectifier conducting, the primary's voltage below zero
    const w = r.waveforms;
    const k = (w.v_D2 as number[]).indexOf(d2.v);
    expect((w.interval as string[])[k]).toBe('on');
    const vPri = (w.v_in as number[])[k]! - (w.v_sw as number[])[k]!;
    expect(d2.v).toBeCloseTo(-p.n! * vPri, 9);
    // a second one, with V_F: ngspice's worst value 2.4 % off
    const q: SimParams = { topology: 'forward', Vg: 11.1, D: 0.353, fs: 72600, L: 5.22e-6, n: 2.52, nr: 0.542, LM: 3.66e-3, Ron: 0.379, VF: 0.624, load: { kind: 'network', C: 1.81e-6, R: 3.22, battery: { V: 3.39, R: 1.58 } }, source: { Voc: 11.1, Rs: 1.5, Cbus: 1.02e-6 } };
    const s2 = simulate(q);
    expect(s2.diodes!.map((d) => [d.diode, d.drop])).toEqual([['D2', 0.624]]);
    expect(s2.diodes![0]!.v - 0.624).toBeGreaterThan(0.7);
  });

  it("the forward converter's diode voltages: each conducting diode sits at its drop, and the others follow the circuit", () => {
    const p: SimParams = { topology: 'forward', Vg: 24, D: 0.4, fs, L: 1e-4, n: 0.5, nr: 1, LM: 1e-3, Ron: 0.1, VF: 0.5, load: { kind: 'resistive', R: 50, C: 1e-5 } };
    const r = simulate(p);
    expect(r.status).toBe('steady');
    const w = r.waveforms;
    const iv = w.interval as string[];
    const seen = new Set<string>();
    for (let k = 0; k < iv.length; k++) {
      const [d1, d2, vo, vin, vsw] = (['v_D1', 'v_D2', 'v_out', 'v_in', 'v_sw'] as const).map((key) => (w[key] as number[])[k]!);
      const tol = 1e-9 * 24;
      seen.add(iv[k]!);
      if (iv[k] === 'on') expect(Math.abs(d1! - 0.5)).toBeLessThan(tol);
      if (iv[k] === 'off' || iv[k] === 'offM0') expect(Math.abs(d2! - 0.5)).toBeLessThan(tol);
      if (iv[k] === 'idle' || iv[k] === 'offL0' || iv[k] === 'onL0') {
        // neither conducts: the common cathode at the output
        expect(Math.abs(d2! + vo!)).toBeLessThan(tol);
        expect(Math.abs(d1! - (p.n! * (vin! - vsw!) - vo!))).toBeLessThan(tol);
      }
      expect(Math.max(d1!, d2!)).toBeLessThanOrEqual(0.5 + tol);
    }
    // this converter runs through DCM: the rectifier, the freewheeling diode and neither
    expect([...seen].sort()).toEqual(expect.arrayContaining(['on', 'idle']));
    expect(r.diodes).toBeUndefined();
  });

  it("a boost into a fixed output below its input: 400 A through R_on lift the switch node above the output, and the diode would conduct while the switch is on", () => {
    const r = simulate({ topology: 'boost', Vg: 24, D: 0.4, fs, L: 1e-4, Ron: 0.1, VF: 0.5, load: { kind: 'fixed', V: 12 } });
    expect(r.status).toBe('steady');
    expect(r.max.i_L!).toBeGreaterThan(400);
    expect(r.diodes).toEqual([{ diode: 'D', v: maxOf(r.waveforms, 'v_D'), drop: 0.5 }]);
    // R_on i - V: 0.1 ohm times about 413 A, less the 12 V output
    expect(r.diodes![0]!.v).toBeGreaterThan(29);
  });

  it('a bus below zero that turns no diode on is not flagged: the model holds, as ngspice with the diodes confirms', () => {
    // the fourth review's circuits, each within the SPICE comparison's tolerance of ngspice with every diode in place:
    // a buck-boost whose bus reaches -0.81 V (or -1.67 V with 300 nF), a boost whose bus reaches -0.11 V
    const cases: SimParams[] = [
      { topology: 'buckboost', Vg: 12, D: 0.5, fs, L: 2e-5, Ron: 0.05, source: { Voc: 12, Rs: 10, Cbus: 1e-7 }, load: { kind: 'resistive', R: 5, C: 1e-5 } },
      { topology: 'buckboost', Vg: 12, D: 0.5, fs, L: 2e-5, Ron: 0.05, source: { Voc: 12, Rs: 10, Cbus: 3e-7 }, load: { kind: 'resistive', R: 5, C: 1e-5 } },
      { topology: 'boost', Vg: 7, D: 0.188, fs: 2e4, L: 2.84e-5, Ron: 4.61e-3, VF: 0.13, source: { Voc: 7, Rs: 28.1, Cbus: 1.22e-6 }, load: { kind: 'resistive', R: 2.11, C: 6.37e-7 } },
    ];
    for (const p of cases) {
      const r = simulate(p);
      expect(r.status).toBe('steady');
      expect(r.min.v_in!, p.topology).toBeLessThan(-0.1);
      expect([r.diodes, r.switchBelowZero], p.topology).toEqual([undefined, undefined]);
    }
  });

  it('without a steady state the whole start-up the page draws is looked at, and only it', () => {
    // a boost charging a capacitor alone from a weak source: in the start-up's second cycle the bus falls to -2.3 V
    // and the idle switch voltage with it, where the switch's body diode would conduct
    const boost = simulate({ topology: 'boost', Vg: 5.11, D: 0.234, fs, L: 1.71e-5, source: { Voc: 5.11, Rs: 13.1, Cbus: 7.21e-7 }, load: { kind: 'network', C: 8.53e-6, V0: 0 } });
    expect(boost.status).toBe('charging');
    expect(boost.switchBelowZero).toBe(minOf(boost.startUp!.waveforms, 'v_sw'));
    expect(boost.switchBelowZero!).toBeLessThan(-0.5);
    // the first cycle that leaves the model: the start-up does not hold from there on
    const w = boost.startUp!.waveforms;
    const k = (w.v_sw as number[]).findIndex((v) => v < -1e-6);
    expect(boost.switchFrom).toBe(Math.max(1, Math.ceil((w.t as number[])[k]! * fs - 1e-9)));
    expect(boost.switchFrom).toBe(2);
    // a forward converter beyond its reset limit, the search cut short: its search's last cycle leaves the model,
    // but the start-up the page draws does not, and the page says what it draws
    const p = { topology: 'forward', Vg: 89.2, D: 0.51, fs, L: 3.83e-4, RL: 0.0663, VF: 0.18, n: 0.162, nr: 2, LM: 3.55e-4, source: { Voc: 89.2, Rs: 2.67, Cbus: 2.18e-6 }, load: { kind: 'network', C: 4.88e-8, V0: 0 } } as SimParams;
    const r = simulate(p, { maxCycles: 10 });
    expect(r.status).toBe('unsettled');
    expect(minOf(r.startUp!.waveforms, 'v_in')).toBeGreaterThan(0);
    expect([r.diodes, r.switchBelowZero]).toEqual([undefined, undefined]);
    // and a start-up that has stopped gives no change per cycle for a search that did not settle
    expect(r.drift).toBeUndefined();
  });

  it("a start-up drawn without a steady state resolves the circuit's fastest ring: no event is missed", () => {
    // the fifth review's circuits: a flyback and a boost charging a small capacitor alone. At the start-up's former
    // 50 sub-steps per period, about one per ring of the output L-C, the diode's current rang through zero between
    // two samples and it conducted backwards: the flyback's output fell from 226 V to -373 V within cycle 1 and ended
    // it at 609.5 V (ngspice: 800.10 V), and its switch voltage was flagged at -1.512 kV; the boost's start-up
    // diverged from cycle 7 and was flagged from cycle 9
    const cases: [SimParams, number][] = [
      [{ topology: 'flyback', Vg: 20.7, D: 0.696, fs: 20800, L: 8.85e-6, n: 0.401, Ron: 0.0796, RL: 0.402, VF: 0.878, load: { kind: 'network', C: 1.77e-8, V0: 0 } }, 800.1],
      [{ topology: 'boost', Vg: 47.6, D: 0.719, fs: 23300, L: 3.66e-6, Ron: 0.0372, RL: 0.407, VF: 0.6, load: { kind: 'network', C: 1.91e-8, V0: 0 }, source: { Voc: 47.6, Rs: 4.35, Cbus: 1.7e-8 } }, 144.11],
    ];
    for (const [p, afterOne] of cases) {
      const r = simulate(p);
      expect(r.status, p.topology).toBe('charging');
      expect([r.diodes, r.switchBelowZero], p.topology).toEqual([undefined, undefined]);
      const model = buildModel(p);
      const iv = model.stateNames.indexOf('v');
      // twenty sub-steps per ring of the fastest ring, from the eigenvalues
      expect(r.startUp!.steps, p.topology).toBe(Math.ceil(20 * ringsPerPeriod(model)));
      expect(r.startUp!.steps, p.topology).toBeGreaterThan(500);
      // the drawn start-up against a grid four times finer, cycle by cycle
      let x = restState(p, model);
      let y = x;
      for (let k = 0; k < r.startUp!.cycles; k++) {
        x = runCycle(model, x, { stepsPerPeriod: r.startUp!.steps }).x;
        y = runCycle(model, y, { stepsPerPeriod: 4 * r.startUp!.steps }).x;
        expect(Math.abs(x[iv]! - y[iv]!), `${p.topology} cycle ${k + 1}`).toBeLessThanOrEqual(1e-9 * Math.abs(y[iv]!));
        if (k === 0) expect(Math.abs(x[iv]! - afterOne), p.topology).toBeLessThan(0.02);
      }
      expect(r.startUp!.end[iv]).toBe(x[iv]);
    }
  });

  it('an ordinary circuit is not flagged: every converter, load, source and node capacitance, a capacitor alone too', () => {
    const loads: SimParams['load'][] = [
      { kind: 'resistive', R: 10, C: 1e-4 },
      { kind: 'network', C: 1e-4, battery: { V: 8, R: 0.5 } },
      { kind: 'network', C: 1e-4, R: 20, battery: { V: 8, R: 0.5 } },
      { kind: 'network', C: 1e-5, V0: 0 },
    ];
    // a fixed output above each converter's balancing voltage at D = 0.4 (it settles in DCM) and within its reach
    const fixedV = { buck: 12, boost: 48, buckboost: 20, flyback: 12, forward: 8 } as const;
    const flagged: string[] = [];
    for (const topology of ['buck', 'boost', 'buckboost', 'flyback', 'forward'] as const) {
      for (const load of [...loads, { kind: 'fixed' as const, V: fixedV[topology] }]) {
        const p = { topology, Vg: 24, D: 0.4, fs, L: 1e-4, n: 0.5, nr: 1, LM: 1e-3, Ron: 0.1, VF: 0.5, load } as SimParams;
        const variants: SimParams[] = [p, { ...p, source: { Voc: 30, Rs: 1, Cbus: 1e-4 } }];
        if (topology !== 'forward') variants.push({ ...p, Cnode: 1e-10 });
        for (const q of variants) {
          const r = simulate(q);
          const what = `${topology} ${load.kind}${q.source ? ' source' : ''}${q.Cnode ? ' C_node' : ''}`;
          if (r.switchBelowZero !== undefined) flagged.push(`${what}: switch ${r.switchBelowZero}`);
          for (const d of r.diodes ?? []) flagged.push(`${what}: ${d.diode} ${d.v}`);
        }
      }
    }
    // the fourth review's buck charging a capacitor alone from a source: its switch voltage rests at -1.7e-17 V
    const b2 = simulate({ topology: 'buck', Vg: 26.3, D: 0.647, fs, L: 1.11e-5, Ron: 0.0102, source: { Voc: 26.3, Rs: 0.986, Cbus: 1.17e-6 }, load: { kind: 'network', C: 1.63e-5, V0: 0 } });
    if (b2.switchBelowZero !== undefined || b2.diodes !== undefined) flagged.push(`buck, capacitor alone, source: ${b2.switchBelowZero} ${JSON.stringify(b2.diodes)}`);
    expect(flagged).toEqual([]);
  });
});
