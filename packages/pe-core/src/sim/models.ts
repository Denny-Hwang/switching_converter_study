/**
 * Piecewise-linear models of the basic converters for the simulator engine.
 *
 * States: the inductor current `i` (for the flyback the magnetizing current
 * referred to the primary, for the forward converter the output-inductor
 * current), the output voltage `v` (resistive load only; a fixed output is a
 * constant), and optionally the switch voltage `vc` (when a node capacitance
 * C_node is given), the forward converter's magnetizing current `iM`, and the
 * input-bus voltage `vbus` (source-driven mode: a Thevenin source V_oc behind
 * R_s charging C_bus).
 *
 * Switches are ideal apart from the on-resistance R_on and have an ideal body
 * diode; the diode is a constant forward drop V_F that blocks ideally; the
 * inductor may have a winding resistance R_L. Without a node capacitance the
 * transitions are instantaneous. With one, the inductor current charges it
 * after turn-off until the diode takes over (the "rise" interval), it rings
 * in the DCM idle interval, and the switch discharges it at turn-on, where
 * its energy is counted as capacitive switching loss. The transformers are
 * ideal except for the magnetizing inductance (turns ratio 1:n with
 * n = N_s/N_p, CLAUDE.md conventions).
 */

import type { Edge, Interval, Model } from './engine';
import type { Mat, Vec } from './linalg';

export type Topology = 'buck' | 'boost' | 'buckboost' | 'flyback' | 'forward';

export type Load = { kind: 'resistive'; R: number; C: number } | { kind: 'fixed'; V: number };

export interface Source {
  /** Open-circuit voltage of the Thevenin source during this cycle. */
  Voc: number;
  Rs: number;
  Cbus: number;
}

export interface SimParams {
  topology: Topology;
  /** Input voltage (ignored in source-driven mode). */
  Vg: number;
  D: number;
  fs: number;
  /** Inductance: the filter inductor, or the magnetizing inductance L_M of the flyback (primary side). */
  L: number;
  /** Turns ratio N_s/N_p (flyback, forward). */
  n?: number;
  /** Forward converter: reset-winding ratio N_r/N_p and magnetizing inductance. */
  nr?: number;
  LM?: number;
  Ron?: number;
  RL?: number;
  VF?: number;
  /** Capacitance across the switch (DCM ringing); 0 or undefined to omit. */
  Cnode?: number;
  load: Load;
  source?: Source;
}

type Lin = Record<string, number>; // coefficients by state name; key '1' is the constant

function lin(...terms: [number, string][]): Lin {
  const out: Lin = {};
  for (const [c, k] of terms) out[k] = (out[k] ?? 0) + c;
  return out;
}
function add(...xs: Lin[]): Lin {
  const out: Lin = {};
  for (const x of xs) for (const [k, c] of Object.entries(x)) out[k] = (out[k] ?? 0) + c;
  return out;
}
function mul(x: Lin, s: number): Lin {
  const out: Lin = {};
  for (const [k, c] of Object.entries(x)) out[k] = c * s;
  return out;
}
function evalLin(e: Lin, names: string[], x: Vec): number {
  let s = e['1'] ?? 0;
  for (let i = 0; i < names.length; i++) s += (e[names[i]!] ?? 0) * x[i]!;
  return s;
}

function system(names: string[], rows: Record<string, Lin>): { A: Mat; b: Vec } {
  const n = names.length;
  const A: Mat = names.map(() => new Array<number>(n).fill(0));
  const b: Vec = new Array<number>(n).fill(0);
  names.forEach((row, i) => {
    const e = rows[row] ?? {};
    for (const [k, c] of Object.entries(e)) {
      if (k === '1') b[i] = c;
      else {
        const j = names.indexOf(k);
        if (j < 0) throw new Error(`model: unknown state ${k}`);
        A[i]![j] = c;
      }
    }
  });
  return { A, b };
}

interface Common {
  names: string[];
  idx: (name: string) => number;
  Ts: number;
  Ron: number;
  RL: number;
  VF: number;
  Cn: number;
  vin: Lin;
  vout: Lin;
  resistive: boolean;
  R: number;
  C: number;
  src?: Source;
}

function common(p: SimParams, extraStates: string[]): Common {
  if (!(p.D > 0 && p.D < 1)) throw new Error('duty ratio must be between 0 and 1');
  if (!(p.fs > 0 && p.L > 0)) throw new Error('f_s and L must be positive');
  const resistive = p.load.kind === 'resistive';
  const Cn = p.Cnode ?? 0;
  const names = ['i'];
  if (resistive) names.push('v');
  names.push(...extraStates);
  if (Cn > 0 && p.topology !== 'forward') names.push('vc');
  if (p.source) names.push('vbus');
  const Ron = p.Ron ?? 0;
  if (Cn > 0 && Ron <= 0) throw new Error('a node capacitance needs a positive R_on');
  return {
    names,
    idx: (s) => names.indexOf(s),
    Ts: 1 / p.fs,
    Ron,
    RL: p.RL ?? 0,
    VF: p.VF ?? 0,
    Cn,
    vin: p.source ? lin([1, 'vbus']) : lin([p.Vg, '1']),
    vout: p.load.kind === 'resistive' ? lin([1, 'v']) : lin([p.load.V, '1']),
    resistive,
    R: p.load.kind === 'resistive' ? p.load.R : NaN,
    C: p.load.kind === 'resistive' ? p.load.C : NaN,
    src: p.source,
  };
}

/** dv/dt for a resistive load fed with the current iOut, and dvbus/dt for an input current iIn. */
function loadAndBus(c: Common, iOut: Lin, iIn: Lin): Record<string, Lin> {
  const rows: Record<string, Lin> = {};
  if (c.resistive) rows.v = mul(add(iOut, lin([-1 / c.R, 'v'])), 1 / c.C);
  if (c.src) {
    rows.vbus = mul(add(lin([c.src.Voc / c.src.Rs, '1'], [-1 / c.src.Rs, 'vbus']), mul(iIn, -1)), 1 / c.src.Cbus);
  }
  return rows;
}

interface IntervalSpec {
  gate: boolean;
  /** L di/dt (the voltage across the inductance). */
  vL: Lin;
  iOut: Lin;
  iIn: Lin;
  /** Transistor voltage and current, diode current (for the outputs). */
  vSw: Lin;
  iSw: Lin;
  iD: Lin;
  /** d(vc)/dt times C_node, when vc is a state. */
  qc?: Lin;
  guards: Interval['guards'];
}

function makeInterval(c: Common, L: number, name: string, s: IntervalSpec): Interval {
  const rows: Record<string, Lin> = { i: mul(s.vL, 1 / L), ...loadAndBus(c, s.iOut, s.iIn) };
  if (c.idx('vc') >= 0 && s.qc) rows.vc = mul(s.qc, 1 / c.Cn);
  const { A, b } = system(c.names, rows);
  return { name, gate: s.gate, A, b, guards: s.guards };
}

function unit(c: Common, state: string, sign = 1): Vec {
  const v = new Array<number>(c.names.length).fill(0);
  v[c.idx(state)] = sign;
  return v;
}

function setState(c: Common, x: Vec, values: Record<string, number>): Vec {
  const y = x.slice();
  for (const [k, v] of Object.entries(values)) {
    const j = c.idx(k);
    if (j >= 0) y[j] = v;
  }
  return y;
}

function outputsFrom(c: Common, L: number, specs: Record<string, IntervalSpec>) {
  return (x: Vec, interval: string): Record<string, number> => {
    const s = specs[interval];
    if (!s) throw new Error(`no outputs for interval ${interval}`);
    const e = (l: Lin) => evalLin(l, c.names, x);
    const i = x[0]!;
    const out: Record<string, number> = {
      i_L: i,
      v_L: e(s.vL) + c.RL * i,
      v_sw: e(s.vSw),
      i_sw: e(s.iSw),
      i_D: e(s.iD),
      i_out: e(s.iOut),
      i_in: e(s.iIn),
      v_in: e(c.vin),
      v_out: e(c.vout),
    };
    return out;
  };
}

// ---------------------------------------------------------------------------
// Buck, boost, buck-boost and flyback share one structure: an on-interval,
// an off-interval with the diode conducting, and an idle interval once the
// inductor current reaches zero. With a node capacitance, the inductor
// current first charges it after turn-off ("rise") until the diode takes
// over, and the idle interval rings (the inductance with C_node), clamped by
// the switch's body diode at zero switch voltage and ended early if the
// ringing turns the diode on. A current that is negative at turn-off (a buck
// whose output is held above its input) flows on through the body diode
// ("rev") instead of vanishing.
// ---------------------------------------------------------------------------

function twoSwitch(p: SimParams): Model {
  const c = common(p, []);
  const L = p.L;
  const n = p.n ?? 1;
  const { Ron, RL, VF, vin, vout } = c;
  const zero = lin();
  const iL = lin([1, 'i']);
  const hasVc = c.idx('vc') >= 0;
  const vc = lin([1, 'vc']);

  // Topology-specific pieces: voltage across L while the diode conducts, the
  // current delivered to the output node, the input current, the switch
  // voltage while the diode conducts, and the ringing term.
  let offVL: Lin;
  let offOut: Lin;
  let offIn: Lin;
  let offVsw: Lin;
  let onOut: Lin = zero;
  let idleVsw: Lin;
  let ringW: Lin = zero; // the ringing inductor sees vin - vc - ringW
  let alwaysIn = false; // boost: the input current is the inductor current in every interval
  switch (p.topology) {
    case 'buck':
      offVL = add(lin([-VF, '1'], [-RL, 'i']), mul(vout, -1));
      offOut = iL;
      offIn = zero;
      offVsw = add(vin, lin([VF, '1']));
      onOut = iL;
      idleVsw = add(vin, mul(vout, -1));
      ringW = vout;
      break;
    case 'boost':
      offVL = add(vin, lin([-VF, '1'], [-RL, 'i']), mul(vout, -1));
      offOut = iL;
      offIn = iL;
      offVsw = add(vout, lin([VF, '1']));
      idleVsw = vin;
      alwaysIn = true;
      break;
    case 'buckboost':
      offVL = add(lin([-VF, '1'], [-RL, 'i']), mul(vout, -1));
      offOut = iL;
      offIn = zero;
      offVsw = add(vin, vout, lin([VF, '1']));
      idleVsw = vin;
      break;
    case 'flyback':
      offVL = add(mul(add(vout, lin([VF, '1'])), -1 / n), lin([-RL, 'i']));
      offOut = mul(iL, 1 / n);
      offIn = zero;
      offVsw = add(vin, mul(add(vout, lin([VF, '1'])), 1 / n));
      idleVsw = vin;
      break;
    default:
      throw new Error(`twoSwitch: unsupported topology ${p.topology}`);
  }

  const onVL = add(vin, lin([-(Ron + RL), 'i']), mul(ringW, -1));
  const toIdle = hasVc ? 'ring' : 'idle';
  const specs: Record<string, IntervalSpec> = {
    on: { gate: true, vL: onVL, iOut: onOut, iIn: iL, vSw: lin([Ron, 'i']), iSw: iL, iD: zero, guards: [] },
    off: {
      gate: false,
      vL: offVL,
      iOut: offOut,
      iIn: offIn,
      vSw: offVsw,
      iSw: zero,
      iD: offOut,
      guards: [
        {
          c: unit(c, 'i'),
          d: 0,
          next: toIdle,
          reset: (x) => setState(c, x, hasVc ? { i: 0, vc: evalLin(offVsw, c.names, x) } : { i: 0 }),
        },
      ],
    },
  };
  // The switch's body diode conducts a negative inductor current: the switch
  // voltage is held at zero and the current returns to the input.
  const bodyDiode = (next: string): IntervalSpec => ({
    gate: false,
    vL: add(vin, mul(ringW, -1), lin([-RL, 'i'])),
    iOut: onOut,
    iIn: iL,
    vSw: zero,
    iSw: zero,
    iD: zero,
    qc: zero,
    guards: [{ c: unit(c, 'i', -1), d: 0, next, reset: (x) => setState(c, x, { i: 0 }) }],
  });
  if (!hasVc) {
    const guards: Interval['guards'] = [];
    specs.rev = bodyDiode('idle');
    if (p.topology === 'boost' && (c.resistive || c.src)) {
      // The output has fallen below the input (or the bus has risen above
      // the output): the diode conducts again.
      const g = add(vout, lin([VF, '1']), mul(vin, -1));
      const forward = (x: Vec) => evalLin(g, c.names, x) <= 0;
      guards.push({ c: c.names.map((k) => g[k] ?? 0), d: g['1'] ?? 0, next: 'off' });
      // A reverse current that ends while the diode is forward-biased hands over to it directly.
      const toIdle = specs.rev.guards[0]!;
      specs.rev.guards = [
        { ...toIdle, next: 'off', when: forward },
        { ...toIdle, when: (x) => !forward(x) },
      ];
    }
    specs.idle = { gate: false, vL: zero, iOut: zero, iIn: alwaysIn ? iL : zero, vSw: idleVsw, iSw: zero, iD: zero, guards };
  } else {
    // Switch and diode off, the inductor current flows through C_node:
    // L di/dt = vin - vc - w, C_node dvc/dt = i.
    const ringVL = add(vin, mul(vc, -1), mul(ringW, -1), lin([-RL, 'i']));
    const high = add(offVsw, mul(vc, -1)); // > 0 while the diode stays off
    const diodeOn = { c: c.names.map((k) => high[k] ?? 0), d: high['1'] ?? 0, next: 'off', when: (x: Vec) => x[0]! > 0 };
    const nodeSpec = (guards: Interval['guards']): IntervalSpec => ({
      gate: false,
      vL: ringVL,
      iOut: onOut,
      iIn: iL,
      vSw: vc,
      iSw: zero,
      iD: zero,
      qc: iL,
      guards,
    });
    // After turn-off the current charges C_node up to the diode's turn-on voltage.
    specs.rise = nodeSpec([diodeOn, { c: unit(c, 'i'), d: 0, next: 'ring' }]);
    // DCM idle: the inductance rings with C_node.
    specs.ring = nodeSpec([{ c: unit(c, 'vc'), d: 0, next: 'clamp', reset: (x) => setState(c, x, { vc: 0 }) }, diodeOn]);
    specs.clamp = bodyDiode('ring');
  }

  const intervals: Record<string, Interval> = {};
  for (const [name, s] of Object.entries(specs)) intervals[name] = makeInterval(c, L, name, s);
  const jc = c.idx('vc');
  return {
    topology: p.topology,
    stateNames: c.names,
    Ts: c.Ts,
    D: p.D,
    intervals,
    idle: hasVc ? ['ring', 'clamp'] : ['idle'],
    turnOn(x: Vec): Edge {
      // The switch discharges the node capacitance, and its energy is lost.
      // vc holds the switch voltage in every interval but the on-interval.
      if (!hasVc) return { interval: 'on', x };
      return { interval: 'on', x: setState(c, x, { vc: 0 }), loss: 0.5 * c.Cn * x[jc]! ** 2 };
    },
    turnOff(x: Vec): Edge {
      const i = x[0]!;
      if (i > 0) {
        // The node voltage starts from the on-state voltage R_on i.
        return hasVc ? { interval: 'rise', x: setState(c, x, { vc: Ron * i }) } : { interval: 'off', x };
      }
      if (i < 0) return hasVc ? { interval: 'clamp', x: setState(c, x, { vc: 0 }) } : { interval: 'rev', x };
      return { interval: toIdle, x: hasVc ? setState(c, x, { vc: 0 }) : x };
    },
    outputs: outputsFrom(c, L, specs),
  };
}

// ---------------------------------------------------------------------------
// Forward converter with a reset winding: output-inductor current i and the
// magnetizing current iM. While the switch is off, the reset winding returns
// the magnetizing energy to the input (switch voltage V_g (1 + 1/n_r)) and
// the output inductor freewheels through the second diode.
// ---------------------------------------------------------------------------

function forward(p: SimParams): Model {
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

export function buildModel(p: SimParams): Model {
  return p.topology === 'forward' ? forward(p) : twoSwitch(p);
}
