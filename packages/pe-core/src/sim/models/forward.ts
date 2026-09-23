import type { Interval, Model } from '../engine';
import type { Vec } from '../linalg';
import {
  add,
  common,
  evalLin,
  lin,
  loadAndBus,
  mul,
  outputsFrom,
  setState,
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
  }
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
      guards: [],
    },
    // The rectifier diode blocks while the switch is on: the output inductor
    // would need a negative current (an output held above n V_g).
    onL0: { gate: true, vL: zero, vM: vPri, iOut: zero, iIn: iPri, vSw: mul(iPri, Ron), iSw: iPri, iD: zero, guards: [] },
    offL0: { gate: false, vL: zero, vM: resetV, iOut: zero, iIn: mul(iM, -1 / nr), vSw: vswReset, iSw: zero, iD: zero, guards: [] },
    offM0: { gate: false, vL: freewheel, vM: zero, iOut: iL, iIn: zero, vSw: vin, iSw: zero, iD: iL, guards: [] },
    idle: { gate: false, vL: zero, vM: zero, iOut: zero, iIn: zero, vSw: vin, iSw: zero, iD: zero, guards: [] },
  };
  const zeroI = (x: Vec) => setState(c, x, { i: 0 });
  const zeroM = (x: Vec) => setState(c, x, { iM: 0 });
  const onVL = specs.on!.vL;
  const rising = mul(onVL, -1); // > 0 while the on-interval would drive the inductor current negative
  specs.on!.guards = [{ c: unit(c, 'i'), d: 0, next: 'onL0', reset: zeroI }];
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
    Ts: c.Ts,
    D: p.D,
    intervals,
    idle: ['onL0', 'offL0', 'idle'],
    turnOn(x) {
      if (x[0]! <= 0 && evalLin(onVL, c.names, x) < 0) return { interval: 'onL0', x: setState(c, x, { i: 0 }) };
      return { interval: 'on', x };
    },
    turnOff(x) {
      const i = x[0]! > 0;
      const m = x[c.idx('iM')]! > 0;
      const iv = i && m ? 'off' : i ? 'offM0' : m ? 'offL0' : 'idle';
      return { interval: iv, x: setState(c, x, { ...(i ? {} : { i: 0 }), ...(m ? {} : { iM: 0 }) }) };
    },
    outputs: (x, iv) => ({ ...outputs(x, iv), i_M: x[c.idx('iM')]! }),
  };
}
