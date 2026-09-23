import type { Edge, Interval, Model } from '../engine';
import type { Vec } from '../linalg';
import {
  add,
  common,
  evalLin,
  lin,
  makeInterval,
  mul,
  outputsFrom,
  setState,
  unit,
  type IntervalSpec,
  type Lin,
  type SimParams,
} from './common';

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

export function twoSwitch(p: SimParams): Model {
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
