import type { Edge, Guard, Interval, Model } from '../engine';
import type { Vec } from '../linalg';
import {
  add,
  assign,
  common,
  evalLin,
  lin,
  loadAndBus,
  makeInterval,
  mul,
  outputsFrom,
  type IntervalSpec,
  type Lin,
  type SimParams,
} from './common';

// ---------------------------------------------------------------------------
// Buck, boost, buck-boost and flyback share one structure: an on-interval,
// an off-interval with the diode conducting, and an idle interval once the
// inductor current reaches zero. A current that is negative at turn-off (a
// buck whose output is held above its input) flows on through the switch's
// body diode ("rev") instead of vanishing.
//
// With a node capacitance C_node across the switch, the inductor current
// first charges it after turn-off ("rise") until the diode takes over. While
// the diode conducts, the switch voltage follows the input and output
// voltages, so C_node is in parallel with their capacitors: it takes its
// share of their current, and the diode carries the rest of the inductor
// current. Once the diode current reaches zero, the inductance rings with
// C_node ("ring"), clamped by the body diode at zero switch voltage
// ("clamp") and ended early if the ringing turns the diode on again. At
// turn-on the switch discharges C_node, and its energy is lost.
// ---------------------------------------------------------------------------

export function twoSwitch(p: SimParams): Model {
  const c = common(p, []);
  const L = p.L;
  const n = p.n ?? 1;
  const { Ron, RL, VF, vin, vout } = c;
  const zero = lin();
  const iL = lin([1, 'i']);
  const hasVc = c.idx('vc') >= 0;
  const vc = lin([1, 'vc']);
  /** A guard that ends the interval when the expression e, positive before, reaches zero. */
  const until = (e: Lin, next: string, more: Partial<Guard> = {}): Guard => ({
    c: c.names.map((k) => e[k] ?? 0),
    d: e['1'] ?? 0,
    next,
    ...more,
  });

  // Topology-specific pieces: voltage across L while the diode conducts, the
  // current delivered to the output node, the input current, the ringing
  // term, and the switch voltage while the diode conducts,
  // a_in vin + a_out vout + kD V_F.
  let offVL: Lin;
  let offOut: Lin;
  let offIn: Lin;
  let onOut: Lin = zero;
  let idleVsw: Lin;
  let ringW: Lin = zero; // the ringing inductor sees vin - vc - ringW
  let alwaysIn = false; // boost: the input current is the inductor current in every interval
  let aIn: number;
  let aOut: number;
  let kD: number;
  switch (p.topology) {
    case 'buck':
      offVL = add(lin([-VF, '1'], [-RL, 'i']), mul(vout, -1));
      offOut = iL;
      offIn = zero;
      [aIn, aOut, kD] = [1, 0, 1];
      onOut = iL;
      idleVsw = add(vin, mul(vout, -1));
      ringW = vout;
      break;
    case 'boost':
      offVL = add(vin, lin([-VF, '1'], [-RL, 'i']), mul(vout, -1));
      offOut = iL;
      offIn = iL;
      [aIn, aOut, kD] = [0, 1, 1];
      idleVsw = vin;
      alwaysIn = true;
      break;
    case 'buckboost':
      offVL = add(lin([-VF, '1'], [-RL, 'i']), mul(vout, -1));
      offOut = iL;
      offIn = zero;
      [aIn, aOut, kD] = [1, 1, 1];
      idleVsw = vin;
      break;
    case 'flyback':
      offVL = add(mul(add(vout, lin([VF, '1'])), -1 / n), lin([-RL, 'i']));
      offOut = mul(iL, 1 / n);
      offIn = zero;
      [aIn, aOut, kD] = [1, 1 / n, 1 / n];
      idleVsw = vin;
      break;
    default:
      throw new Error(`twoSwitch: unsupported topology ${p.topology}`);
  }
  const offVsw = add(mul(vin, aIn), mul(vout, aOut), lin([kD * VF, '1']));

  // While the diode conducts, the switch voltage follows the input and the
  // output, and a current i_Cn into C_node is drawn a_in times from the
  // input, a_out times from the output and kD times from the diode (the
  // coefficients of the switch voltage; the energy balance checks this).
  // With y = (v, vbus) the states among them, a = (a_out, a_in) and
  // D = diag(C, C_bus): (D + C_node a a^T) dy/dt = D (dy/dt without C_node), so
  // i_Cn = C_node a·dy/dt = C_node a^T (dy/dt without C_node) / (1 + C_node a^T D^-1 a).
  // A fixed input and a fixed output give a constant switch voltage and no current.
  let iCn = zero;
  if (hasVc) {
    const free = loadAndBus(c, offOut, offIn);
    const a = { v: aOut, vbus: aIn };
    const cap = { v: c.C, vbus: c.src?.Cbus ?? NaN };
    let num = zero;
    let q = 0;
    for (const k of ['v', 'vbus'] as const) {
      const row = free[k];
      if (!row || a[k] === 0) continue;
      num = add(num, mul(row, a[k]));
      q += (a[k] * a[k]) / cap[k];
    }
    iCn = mul(num, c.Cn / (1 + c.Cn * q));
  }
  const offD = add(offOut, mul(iCn, -kD));

  const onVL = add(vin, lin([-(Ron + RL), 'i']), mul(ringW, -1));
  const toIdle = hasVc ? 'ring' : 'idle';
  const specs: Record<string, IntervalSpec> = {
    on: { gate: true, vL: onVL, iOut: onOut, iIn: iL, vSw: lin([Ron, 'i']), iSw: iL, iD: zero, guards: [] },
    off: {
      gate: false,
      vL: offVL,
      iOut: add(offOut, mul(iCn, -aOut)),
      iIn: add(offIn, mul(iCn, aIn)),
      vSw: offVsw,
      iSw: zero,
      iD: offD,
      qc: iCn,
      // The diode turns off when its current reaches zero. Without C_node
      // that is the inductor current, set to exactly zero for the idle interval.
      guards: [hasVc ? until(offD, 'ring') : until(iL, 'idle', { reset: assign(c, { i: 0 }) })],
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
    guards: [until(mul(iL, -1), next, { reset: assign(c, { i: 0 }) })],
  });
  if (!hasVc) {
    const guards: Interval['guards'] = [];
    specs.rev = bodyDiode('idle');
    if (p.topology === 'boost' && (c.resistive || c.src)) {
      // The output has fallen below the input (or the bus has risen above
      // the output): the diode conducts again.
      const g = add(vout, lin([VF, '1']), mul(vin, -1));
      const forward = (x: Vec) => evalLin(g, c.names, x) <= 0;
      guards.push(until(g, 'off'));
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
    // The diode turns on when the switch voltage reaches its conducting
    // value, if it would then carry a forward current.
    const diodeOn = until(add(offVsw, mul(vc, -1)), 'off', { when: (x: Vec) => evalLin(offD, c.names, x) > 0 });
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
    // After turn-off the current charges C_node up to the diode's turn-on
    // voltage (from zero: the on-interval holds vc at zero).
    specs.rise = nodeSpec([diodeOn, until(iL, 'ring')]);
    // DCM idle: the inductance rings with C_node.
    specs.ring = nodeSpec([until(vc, 'clamp', { reset: assign(c, { vc: 0 }) }), diodeOn]);
    specs.clamp = bodyDiode('ring');
    // A negative current at turn-off: the body diode conducts until it ends.
    specs.rev = bodyDiode('ring');
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
      if (!hasVc) return { interval: 'on' };
      return { interval: 'on', set: assign(c, { vc: 0 }), loss: 0.5 * c.Cn * x[jc]! ** 2 };
    },
    turnOff(x: Vec): Edge {
      const i = x[0]!;
      if (i > 0) return { interval: hasVc ? 'rise' : 'off' };
      if (i < 0) return { interval: 'rev' };
      return { interval: toIdle };
    },
    outputs: outputsFrom(c, L, specs),
  };
}
