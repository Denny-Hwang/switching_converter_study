import type { Interval, Model } from '../engine';
import type { Vec } from '../linalg';
import {
  add,
  assign,
  common,
  evalLin,
  lin,
  loadAndBus,
  mul,
  outputsFrom,
  stateScales,
  system,
  unit,
  type IntervalSpec,
  type Lin,
  type SimParams,
} from './common';

// ---------------------------------------------------------------------------
// Forward converter with a reset winding: output-inductor current i and the
// magnetizing current iM. While the switch is off, the reset winding returns
// the magnetizing energy to the input (switch voltage V_g (1 + 1/n_r)) and
// the output inductor freewheels through the second diode.
// ---------------------------------------------------------------------------

export function forward(p: SimParams): Model {
  const c = common(p, ['iM']);
  const L = p.L;
  const n = p.n ?? 1;
  const nr = p.nr ?? 1;
  const LM = p.LM;
  if (!(LM && LM > 0)) throw new Error('forward: the magnetizing inductance LM must be positive');
  const { Ron, RL, VF, vin, vout } = c;
  const zero = lin();
  const iL = lin([1, 'i']);
  const iM = lin([1, 'iM']);
  const iPri = add(mul(iL, n), iM); // primary (switch) current
  const vPri = add(vin, mul(iPri, -Ron)); // primary winding voltage while on
  const freewheel = add(lin([-VF, '1'], [-RL, 'i']), mul(vout, -1));
  const resetV = mul(vin, -1 / nr); // magnetizing voltage during reset
  const vswReset = mul(vin, 1 + 1 / nr);

  interface FSpec extends IntervalSpec {
    vM: Lin;
    /** The forward diode D1, the freewheeling diode D2 and the reset winding's diode. */
    iD1: Lin;
    iD2: Lin;
    iDr: Lin;
  }
  const iReset = mul(iM, 1 / nr); // the reset winding returns the magnetizing current, divided by n_r
  const specs: Record<string, FSpec> = {
    on: {
      gate: true,
      vL: add(mul(vPri, n), lin([-VF, '1'], [-RL, 'i']), mul(vout, -1)),
      vM: vPri,
      iOut: iL,
      iIn: iPri,
      vSw: mul(iPri, Ron),
      iSw: iPri,
      iD: iL,
      iD1: iL,
      iD2: zero,
      iDr: zero,
      guards: [],
    },
    off: {
      gate: false,
      vL: freewheel,
      vM: resetV,
      iOut: iL,
      iIn: mul(iM, -1 / nr),
      vSw: vswReset,
      iSw: zero,
      iD: iL,
      iD1: zero,
      iD2: iL,
      iDr: iReset,
      guards: [],
    },
    // The rectifier diode blocks while the switch is on: the output inductor
    // would need a negative current (an output held above n V_g).
    onL0: { gate: true, vL: zero, vM: vPri, iOut: zero, iIn: iPri, vSw: mul(iPri, Ron), iSw: iPri, iD: zero, iD1: zero, iD2: zero, iDr: zero, guards: [] },
    offL0: { gate: false, vL: zero, vM: resetV, iOut: zero, iIn: mul(iM, -1 / nr), vSw: vswReset, iSw: zero, iD: zero, iD1: zero, iD2: zero, iDr: iReset, guards: [] },
    offM0: { gate: false, vL: freewheel, vM: zero, iOut: iL, iIn: zero, vSw: vin, iSw: zero, iD: iL, iD1: zero, iD2: iL, iDr: zero, guards: [] },
    idle: { gate: false, vL: zero, vM: zero, iOut: zero, iIn: zero, vSw: vin, iSw: zero, iD: zero, iD1: zero, iD2: zero, iDr: zero, guards: [] },
  };
  const zeroI = assign(c, { i: 0 });
  const zeroM = assign(c, { iM: 0 });
  const onVL = specs.on!.vL;
  const rising = mul(onVL, -1); // > 0 while the on-interval would drive the inductor current negative
  const scales = stateScales(c, p, { i: L, iM: LM });
  // The rectifier blocks a current that would reverse: a current falling to
  // zero moves to onL0. A current that starts the on-interval at exactly zero
  // (turned on with the on-voltage at zero, which then falls as the bus
  // sags) never is positive for the first guard to see it cross zero; the
  // second one catches it as it passes a rounding-level fraction of the
  // current's natural size below zero.
  specs.on!.guards = [
    { c: unit(c, 'i'), d: 0, next: 'onL0', reset: zeroI },
    { c: unit(c, 'i'), d: 1e-12 * scales[0]!, next: 'onL0', reset: zeroI },
  ];
  specs.onL0!.guards = [{ c: c.names.map((k) => rising[k] ?? 0), d: rising['1'] ?? 0, next: 'on' }];
  specs.off!.guards = [
    { c: unit(c, 'i'), d: 0, next: 'offL0', reset: zeroI },
    { c: unit(c, 'iM'), d: 0, next: 'offM0', reset: zeroM },
  ];
  specs.offL0!.guards = [{ c: unit(c, 'iM'), d: 0, next: 'idle', reset: zeroM }];
  specs.offM0!.guards = [{ c: unit(c, 'i'), d: 0, next: 'idle', reset: zeroI }];

  const intervals: Record<string, Interval> = {};
  for (const [name, s] of Object.entries(specs)) {
    const rows: Record<string, Lin> = {
      i: mul(s.vL, 1 / L),
      iM: mul(s.vM, 1 / LM),
      ...loadAndBus(c, s.iOut, s.iIn),
    };
    const { A, b } = system(c.names, rows);
    intervals[name] = { name, gate: s.gate, A, b, guards: s.guards };
  }
  const outputs = outputsFrom(c, L, specs);
  return {
    topology: 'forward',
    stateNames: c.names,
    scales,
    Ts: c.Ts,
    D: p.D,
    intervals,
    idle: ['onL0', 'offL0', 'idle'],
    turnOn(x) {
      if (x[0]! <= 0 && evalLin(onVL, c.names, x) < 0) return { interval: 'onL0', set: zeroI };
      return { interval: 'on' };
    },
    turnOff(x) {
      const i = x[0]! > 0;
      const m = x[c.idx('iM')]! > 0;
      const iv = i && m ? 'off' : i ? 'offM0' : m ? 'offL0' : 'idle';
      return { interval: iv, set: [...(i ? [] : zeroI), ...(m ? [] : zeroM)] };
    },
    outputs: (x, iv) => {
      const s = specs[iv]!;
      const e = (l: Lin) => evalLin(l, c.names, x);
      const o = outputs(x, iv);
      // the diodes' voltages, anode to cathode. The primary winding holds v_in - v_sw. The rectifier D_1 runs from
      // the secondary (n times that) to the diodes' common cathode, the freewheeling D_2 from ground to it; the
      // cathode sits at the output plus the output inductor's whole voltage (V_F below the conducting diode's
      // anode, or at the output when neither conducts). The reset winding (its dot at ground) holds -n_r times
      // the primary's voltage at the reset diode's anode; its cathode is at the input.
      const vPri = o.v_in! - o.v_sw!;
      const cathode = o.v_out! + o.v_L!;
      return {
        ...o,
        i_M: x[c.idx('iM')]!,
        v_M: e(s.vM),
        i_D1: e(s.iD1),
        i_D2: e(s.iD2),
        i_Dr: e(s.iDr),
        v_D1: n * vPri - cathode,
        v_D2: -cathode,
        v_Dr: -nr * vPri - o.v_in!,
      };
    },
  };
}
