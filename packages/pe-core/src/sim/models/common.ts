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

import type { Interval } from '../engine';
import type { Mat, Vec } from '../linalg';

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

export type Lin = Record<string, number>; // coefficients by state name; key '1' is the constant

export function lin(...terms: [number, string][]): Lin {
  const out: Lin = {};
  for (const [c, k] of terms) out[k] = (out[k] ?? 0) + c;
  return out;
}
export function add(...xs: Lin[]): Lin {
  const out: Lin = {};
  for (const x of xs) for (const [k, c] of Object.entries(x)) out[k] = (out[k] ?? 0) + c;
  return out;
}
export function mul(x: Lin, s: number): Lin {
  const out: Lin = {};
  for (const [k, c] of Object.entries(x)) out[k] = c * s;
  return out;
}
export function evalLin(e: Lin, names: string[], x: Vec): number {
  let s = e['1'] ?? 0;
  for (let i = 0; i < names.length; i++) s += (e[names[i]!] ?? 0) * x[i]!;
  return s;
}

export function system(names: string[], rows: Record<string, Lin>): { A: Mat; b: Vec } {
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

export interface Common {
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

export function common(p: SimParams, extraStates: string[]): Common {
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
export function loadAndBus(c: Common, iOut: Lin, iIn: Lin): Record<string, Lin> {
  const rows: Record<string, Lin> = {};
  if (c.resistive) rows.v = mul(add(iOut, lin([-1 / c.R, 'v'])), 1 / c.C);
  if (c.src) {
    rows.vbus = mul(add(lin([c.src.Voc / c.src.Rs, '1'], [-1 / c.src.Rs, 'vbus']), mul(iIn, -1)), 1 / c.src.Cbus);
  }
  return rows;
}

export interface IntervalSpec {
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

export function makeInterval(c: Common, L: number, name: string, s: IntervalSpec): Interval {
  const rows: Record<string, Lin> = { i: mul(s.vL, 1 / L), ...loadAndBus(c, s.iOut, s.iIn) };
  if (c.idx('vc') >= 0 && s.qc) rows.vc = mul(s.qc, 1 / c.Cn);
  const { A, b } = system(c.names, rows);
  return { name, gate: s.gate, A, b, guards: s.guards };
}

export function unit(c: Common, state: string, sign = 1): Vec {
  const v = new Array<number>(c.names.length).fill(0);
  v[c.idx(state)] = sign;
  return v;
}

export function setState(c: Common, x: Vec, values: Record<string, number>): Vec {
  const y = x.slice();
  for (const [k, v] of Object.entries(values)) {
    const j = c.idx(k);
    if (j >= 0) y[j] = v;
  }
  return y;
}

export function outputsFrom(c: Common, L: number, specs: Record<string, IntervalSpec>) {
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
