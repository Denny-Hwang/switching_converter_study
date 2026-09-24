/**
 * The operating modes of a simulated period, the way a paper describes a
 * converter: Mode 1, Mode 2, ... each an interval of the switching period in
 * which one linear circuit holds (switch on; switch off with the diode
 * conducting; idle in DCM; the node capacitance's rise and ringing; the
 * forward converter's reset), with the state of every element in it.
 *
 * A mode is a run of samples of one interval; the ringing of a node
 * capacitance and its clamping by the body diode alternate quickly, so their
 * runs form one mode. Every state comes from the simulated waveforms of the
 * mode (the element's current at its start and end, its average, and where
 * it changes sign), through the element currents of the drawn circuit
 * (schematic.ts), so the table, the arrows and the waveforms agree.
 */

import type { SimResult } from './analysis';
import type { Model, Sample } from './engine';
import { periodIntegrals } from './integrals';
import { buildModel } from './models';
import { schematic, type ElementKind, type Outputs, type Schematic } from './schematic';

/** A result's model and recorded samples, built once per result: the mode's averages integrate between them. */
const recordedOf = new WeakMap<SimResult, { model: Model; samples: Sample[] }>();
function recorded(r: SimResult): { model: Model; samples: Sample[] } {
  let e = recordedOf.get(r);
  if (!e) {
    const t = r.waveforms.t as number[];
    const iv = r.waveforms.interval as string[];
    e = { model: buildModel(r.params), samples: t.map((tk, k) => ({ t: tk, interval: iv[k]!, x: r.states[k]! })) };
    recordedOf.set(r, e);
  }
  return e;
}

/**
 * The averages over a mode of functions of the outputs (an element's current
 * or voltage, a wire's current), like the period's averages: the exact
 * integral of the simulated solution between the mode's samples
 * (periodIntegrals over them), divided by the mode's length; a mode of no
 * length gives the value at its sample. For the names in `peaks`, also their
 * exact least and greatest values in the mode, between the samples too; the
 * others' are their samples'.
 */
function modeIntegrals(
  r: SimResult,
  mode: OperatingMode,
  fns: Map<string, (o: Outputs) => number>,
  peaks: ReadonlySet<string> = new Set(),
): { avg: Map<string, number>; min: Map<string, number>; max: Map<string, number> } {
  const avg = new Map<string, number>();
  const min = new Map<string, number>();
  const max = new Map<string, number>();
  // the mode's length from its own samples' times
  const t = r.waveforms.t as number[];
  const span = t[mode.k1]! - t[mode.k0]!;
  if (!(span > 0)) {
    const o = outputsAt(r, mode.k0);
    for (const [k, f] of fns) {
      const v = f(o);
      avg.set(k, v);
      min.set(k, v);
      max.set(k, v);
    }
    return { avg, min, max };
  }
  const { model, samples } = recorded(r);
  const map = (y: Record<string, number>) => {
    const v: Record<string, number> = {};
    for (const [k, f] of fns) v[k] = f(y);
    return v;
  };
  const ex = periodIntegrals(model, { samples }, [], { from: mode.k0, to: mode.k1, map, extremes: (k) => peaks.has(k) });
  for (const k of fns.keys()) {
    avg.set(k, ex.lin[k]! / span);
    min.set(k, ex.min[k]!);
    max.set(k, ex.max[k]!);
  }
  return { avg, min, max };
}

export type ModeKind = string;

export interface OperatingMode {
  /** 1, 2, ... in the order of the period. */
  index: number;
  /** The engine's intervals in this mode, in order (one, or ring and clamp alternating). */
  intervals: string[];
  /** The mode's interval (the first, or 'ring' for a ringing with clamps). */
  kind: ModeKind;
  /** Start and end within the period (s). */
  t0: number;
  t1: number;
  /** First and last sample of the mode. */
  k0: number;
  k1: number;
  /** The switch's gate is on in this mode. */
  gate: boolean;
}

export type ElementState =
  | 'on'
  | 'onBodyDiode'
  | 'bodyDiode'
  | 'off'
  | 'conducting'
  | 'blocking'
  | 'storing'
  | 'releasing'
  | 'storeRelease'
  | 'releaseStore'
  | 'reversing'
  | 'ringing'
  | 'zero'
  | 'steady'
  | 'charging'
  | 'discharging'
  | 'chargeDischarge'
  | 'dischargeCharge'
  | 'delivering'
  | 'absorbing'
  | 'alternating'
  | 'idle';

/** The states each kind of element can be in (elementStates() gives no other). */
export const STATES: Record<Exclude<ElementKind, 'wire'>, readonly ElementState[]> = {
  switch: ['on', 'onBodyDiode', 'bodyDiode', 'off'],
  diode: ['conducting', 'blocking'],
  winding: ['conducting', 'idle'],
  resistor: ['conducting', 'idle'],
  inductor: ['storing', 'releasing', 'storeRelease', 'releaseStore', 'reversing', 'ringing', 'zero', 'steady'],
  capacitor: ['charging', 'discharging', 'chargeDischarge', 'dischargeCharge', 'ringing', 'idle'],
  battery: ['charging', 'discharging', 'chargeDischarge', 'dischargeCharge', 'ringing', 'idle'],
  vsource: ['delivering', 'absorbing', 'alternating', 'idle'],
  fixed: ['delivering', 'absorbing', 'alternating', 'idle'],
};

export interface ElementInMode {
  /** Branch id and element name ('S', 'D', 'L', 'C', 'LM', 'W1', ...). */
  id: string;
  kind: Exclude<ElementKind, 'wire'>;
  state: ElementState;
  /** The element's current at the mode's start and end, its average and extremes (A). */
  i0: number;
  i1: number;
  avg: number;
  min: number;
  max: number;
  /** Where the current first changes sign inside the mode (s), if it does, and how often it does. */
  tSign?: number;
  signChanges: number;
  /** The element's voltage at the mode's start and end, and its average (V), where the model has it. */
  v0?: number;
  v1?: number;
  vAvg?: number;
  /** An inductor's average voltage across its winding resistance (V), part of vAvg; the rest is across its inductance. */
  vRes?: number;
}

/** Interval families whose runs form one mode. */
const FAMILY: Record<string, string> = { ring: 'ring', clamp: 'ring' };

/**
 * A mode shorter than this share of the period is a numerical sliver (a
 * current left at -1e-21 A by rounding sends the switch through its body
 * diode for 1e-26 s): it joins the mode that follows it, or the one before.
 */
export const SLIVER = 1e-9;

/** The modes of a result's recorded period. */
export function modes(r: SimResult): OperatingMode[] {
  const out = runs(r);
  const Ts = 1 / r.params.fs;
  for (let j = 0; j < out.length && out.length > 1; ) {
    const m = out[j]!;
    if (m.t1 - m.t0 >= SLIVER * Ts) {
      j++;
      continue;
    }
    const next = out[j + 1];
    if (next) {
      next.t0 = m.t0;
      next.k0 = m.k0;
      next.intervals = [...m.intervals.filter((x) => x !== next.intervals[0]), ...next.intervals];
    } else {
      const prev = out[j - 1]!;
      prev.t1 = m.t1;
      prev.k1 = m.k1;
      for (const x of m.intervals) if (prev.intervals.at(-1) !== x) prev.intervals.push(x);
    }
    out.splice(j, 1);
  }
  mergeSameKind(out);
  // what a mode is follows from what its elements do: an interval whose defining current counts as none
  // (a rectifier carrying rounding, a diode carrying a ringing's last nanoamperes) is the interval without it
  relabel(r, out);
  mergeSameKind(out);
  out.forEach((m, j) => (m.index = j + 1));
  return out;
}

/** Two neighbouring modes of one kind (a sliver or a relabelling separated them) are one mode. */
function mergeSameKind(out: OperatingMode[]): void {
  for (let j = 1; j < out.length; ) {
    const prev = out[j - 1]!;
    const m = out[j]!;
    if (m.kind !== prev.kind) {
      j++;
      continue;
    }
    prev.t1 = m.t1;
    prev.k1 = m.k1;
    for (const x of m.intervals) if (prev.intervals.at(-1) !== x) prev.intervals.push(x);
    out.splice(j, 1);
  }
}

/**
 * Names each mode by what its elements do, where the engine's interval says
 * more than the currents: the forward converter's rectifier, freewheeling
 * diode and reset diode, the diode of the others, and the switch's body
 * diode, each counted as conducting only when its current counts
 * (countingFloor). A forward converter turned on with its output at exactly
 * n V_g carries rounding in its rectifier: that is the rectifier blocked.
 */
function relabel(r: SimResult, out: OperatingMode[]): void {
  const s = schematic(r.params);
  const peaks = branchScales(r, s);
  const hasCn = !!r.params.Cnode && r.params.topology !== 'forward';
  for (const m of out) {
    const on = activeElements(r, m, s, modeScales(r, m, s, peaks));
    if (r.params.topology === 'forward') {
      if (m.gate) m.kind = on.has('D1') ? 'on' : 'onL0';
      else if (m.kind !== 'ring') {
        const L = on.has('D2') || on.has('D1');
        const M = on.has('D3');
        m.kind = L && M ? 'off' : L ? 'offM0' : M ? 'offL0' : 'idle';
      }
      continue;
    }
    if (m.kind === 'on' || m.kind === 'onRev') {
      // the switch's channel or, for a negative current, its body diode
      const st = elementStates(r, m, s, modeScales(r, m, s, peaks)).find((e) => e.id === 'S')?.state;
      m.kind = st === 'onBodyDiode' ? 'onRev' : 'on';
    } else if (m.kind === 'off' && !on.has('D')) m.kind = hasCn ? 'ring' : 'idle';
    else if (m.kind === 'rev' && !on.has('S')) m.kind = 'idle';
  }
}

/** The elements whose current counts somewhere in a mode. */
function activeElements(r: SimResult, mode: OperatingMode, s: Schematic, scales: Map<string, number>): Set<string> {
  const out = new Set<string>();
  for (let k = mode.k0; k <= mode.k1; k++) {
    const o = outputsAt(r, k);
    for (const b of s.branches) {
      if (b.kind === 'wire' || out.has(b.id)) continue;
      if (Math.abs(b.current(o)) > countingFloor(r, scales.get(b.id) ?? 0)) out.add(b.id);
    }
  }
  return out;
}

/** The runs of one interval (or of one family) in a result's recorded period, however short. */
function runs(r: SimResult): OperatingMode[] {
  const gate = (iv: string) => buildModel(r.params).intervals[iv]?.gate ?? false;
  const t = r.waveforms.t as number[];
  const iv = r.waveforms.interval as string[];
  const out: OperatingMode[] = [];
  let k0 = 0;
  const fam = (s: string) => FAMILY[s] ?? s;
  for (let k = 1; k <= t.length; k++) {
    if (k < t.length && fam(iv[k]!) === fam(iv[k0]!)) continue;
    // samples k0 .. k-1 form a run; it ends where the next one starts
    const t0 = t[k0]!;
    const t1 = k < t.length ? t[k]! : t[t.length - 1]!;
    if (t1 > t0) {
      const intervals: string[] = [];
      for (let j = k0; j < k; j++) if (intervals.at(-1) !== iv[j]) intervals.push(iv[j]!);
      const prev = out.at(-1);
      // a zero-length run between two runs of one family would split a mode: join them
      if (prev && fam(prev.kind) === fam(iv[k0]!)) {
        prev.t1 = t1;
        prev.k1 = k - 1;
        for (const x of intervals) if (prev.intervals.at(-1) !== x) prev.intervals.push(x);
      } else {
        out.push({ index: out.length + 1, intervals, kind: fam(iv[k0]!), t0, t1, k0, k1: k - 1, gate: gate(iv[k0]!) });
      }
    }
    k0 = k;
  }
  return out;
}

/** The outputs at one sample. */
export function outputsAt(r: SimResult, k: number): Outputs {
  const o: Outputs = {};
  for (const [key, series] of Object.entries(r.waveforms)) {
    if (key === 't' || key === 'interval') continue;
    o[key] = (series as number[])[k]!;
  }
  return o;
}

/** The largest current of any element in the period: the scale below which a current counts as none. */
export function currentScale(r: SimResult, s: Schematic): number {
  const n = (r.waveforms.t as number[]).length;
  let m = 0;
  for (let k = 0; k < n; k++) {
    const o = outputsAt(r, k);
    for (const b of s.branches) m = Math.max(m, Math.abs(b.current(o)));
  }
  return m;
}

/**
 * A current smaller than this share of its scale counts as none. The scale is
 * the largest current, during the mode, of the current system the element
 * belongs to:
 * - the switching cell: the switch, the diode, the inductor, the node
 *   capacitance and the input; for a flyback or a forward converter, the
 *   primary's (the switch, the primary and reset windings, the magnetizing
 *   inductance, the reset diode, the node capacitance, the input) and the
 *   secondary's (the secondary winding, the rectifier and freewheeling
 *   diodes, the output inductor) apart, since the transformer scales one
 *   against the other. The microamperes a node capacitance draws through the
 *   input while the diode carries amperes are not a current path worth
 *   drawing, while a ringing that turns the diode on again for a few
 *   nanoseconds conducts a current that is that mode's whole story, however
 *   small next to the period's peak;
 * - the output capacitor, with the load's resistor, battery and fixed
 *   output: the capacitor that alone feeds the load in a mode counts, however
 *   small next to the pulse that charged it; and never against less than the
 *   smaller of the resistor's and the battery's own largest currents, so that
 *   a trickle into a battery that draws amperes does not count;
 * - the bus capacitor, with the source's resistance, and never against less
 *   than the resistance's own largest current.
 * An inductor is also measured against its own largest current over the
 * period, if that is smaller: a magnetizing current growing beside the
 * reflected load current is its own story. The load's resistor and battery, a
 * fixed output, the source and its resistance, which conduct in every mode by
 * nature, are measured against their own largest current over the period.
 * Where these scales would leave the currents that count at an electrical
 * node unbalanced, the element at the node with the largest current that
 * does not count is measured against the largest one that does (closePaths):
 * a battery feeding a resistor between its charging pulses counts with the
 * resistor. Never below rounding (countingFloor).
 */
export const NONE = 1e-3;

/** The load's and the source's branches that conduct in every mode, measured against their own peaks. */
const OWN = new Set(['R', 'B', 'V', 'Voc', 'Rs']);

/** The current system an element belongs to (see NONE). */
export function systemOf(topology: string, id: string): string {
  if (id === 'C' || id === 'R' || id === 'B' || id === 'V') return 'load';
  if (id === 'Cbus' || id === 'Rs' || id === 'Voc') return 'source';
  if (topology === 'forward') return ['W2', 'D1', 'D2', 'L'].includes(id) ? 'secondary' : 'primary';
  if (topology === 'flyback') return ['W2', 'D'].includes(id) ? 'secondary' : 'primary';
  return 'cell';
}

/**
 * Each element's scale in a mode, by id (see NONE); wires have none of their
 * own: branchFlow routes the currents of the elements that carry one.
 */
export function modeScales(r: SimResult, mode: OperatingMode, s: Schematic = schematic(r.params), peaks = branchScales(r, s)): Map<string, number> {
  const topo = r.params.topology;
  const most = new Map<string, number>();
  const os: Outputs[] = [];
  for (let k = mode.k0; k <= mode.k1; k++) os.push(outputsAt(r, k));
  for (const o of os) {
    for (const b of s.branches) {
      if (b.kind === 'wire') continue;
      const g = systemOf(topo, b.id);
      most.set(g, Math.max(most.get(g) ?? 0, Math.abs(b.current(o))));
    }
  }
  // what the load and the source draw by nature: the smaller of their own peaks
  const draws = (ids: string[]) => Math.min(...ids.map((id) => (peaks.has(id) ? peaks.get(id)! : Infinity)));
  const load = draws(['R', 'B']);
  const source = draws(['Rs']);
  const out = new Map<string, number>();
  for (const b of s.branches) {
    if (b.kind === 'wire') {
      out.set(b.id, 0);
      continue;
    }
    const own = peaks.get(b.id) ?? 0;
    const sys = most.get(systemOf(topo, b.id)) ?? 0;
    let scale = OWN.has(b.id) ? own : b.kind === 'inductor' ? Math.min(own, sys) : sys;
    // the output and the bus capacitor count against what the load or the source draws, too: a capacitor
    // feeding a load's 850 µA counts, one trickling 10 nA into a battery that draws amperes does not
    if (b.id === 'C' && Number.isFinite(load)) scale = Math.max(scale, load);
    if (b.id === 'Cbus' && Number.isFinite(source)) scale = Math.max(scale, source);
    out.set(b.id, scale);
  }
  closePaths(r, s, os, out);
  return out;
}

/**
 * Kirchhoff's current law for what counts: at each electrical node (the
 * nodes wires join), the currents that count must add up to zero, to within
 * a thousandth of the largest of them. Where they do not, the path of a
 * current that counts would end at the node: a resistor fed by a battery
 * whose charging pulses put its discharge below a thousandth of its own
 * scale, a diode conducting for nanoseconds into an output whose capacitor
 * and battery carry amperes at other times. The element at the node with the
 * largest current that does not count is then measured against the largest
 * current that does, and so counts; until every node balances.
 */
function closePaths(r: SimResult, s: Schematic, os: Outputs[], scales: Map<string, number>): void {
  const net = netsOf(s);
  const els = s.branches.filter((b) => b.kind !== 'wire' && net.get(b.from) !== net.get(b.to));
  const cur = new Map(els.map((b) => [b.id, os.map((o) => b.current(o))]));
  const peak = new Map(els.map((b) => [b.id, Math.max(...cur.get(b.id)!.map(Math.abs))]));
  const counts = (id: string) => peak.get(id)! > countingFloor(r, scales.get(id) ?? 0);
  const nets = [...new Set(net.values())];
  for (let pass = 0; pass <= els.length; pass++) {
    let changed = false;
    for (const N of nets) {
      const at = els.filter((b) => net.get(b.from) === N || net.get(b.to) === N);
      const on = at.filter((b) => counts(b.id));
      if (!on.length) continue;
      const big = Math.max(...on.map((b) => peak.get(b.id)!));
      const tol = countingFloor(r, big);
      let worst = 0;
      for (let k = 0; k < os.length; k++) {
        let sum = 0;
        for (const b of on) sum += (net.get(b.to) === N ? 1 : -1) * cur.get(b.id)![k]!;
        worst = Math.max(worst, Math.abs(sum));
      }
      if (worst <= tol) continue;
      const off = at.filter((b) => !counts(b.id) && peak.get(b.id)! > tol).sort((a, b) => peak.get(b.id)! - peak.get(a.id)!);
      if (!off.length) continue;
      scales.set(off[0]!.id, big);
      changed = true;
    }
    if (!changed) break;
  }
}

const NETS = new WeakMap<Schematic, Map<string, string>>();
/** Each node's electrical node: the nodes wires join, by one representative node id. */
export function netsOf(s: Schematic): Map<string, string> {
  const hit = NETS.get(s);
  if (hit) return hit;
  const out = netsOfUncached(s);
  NETS.set(s, out);
  return out;
}
function netsOfUncached(s: Schematic): Map<string, string> {
  const up = new Map(s.nodes.map((n) => [n.id, n.id]));
  const root = (x: string): string => {
    let y = x;
    while (up.get(y) !== y) y = up.get(y)!;
    return y;
  };
  for (const b of s.branches) if (b.kind === 'wire') up.set(root(b.from), root(b.to));
  return new Map(s.nodes.map((n) => [n.id, root(n.id)]));
}

const SIDES = new WeakMap<Schematic, Map<string, [string[], string[]]>>();
/**
 * The elements on each side of every wire: the wires of an electrical node
 * form a tree, and a wire's current is what the elements attached on one
 * side pass to those on the other. By wire id: [the side of `from`, the side
 * of `to`], element ids (an element with both ends on one side is left out).
 */
export function wireSides(s: Schematic): Map<string, [string[], string[]]> {
  const hit = SIDES.get(s);
  if (hit) return hit;
  const out = wireSidesUncached(s);
  SIDES.set(s, out);
  return out;
}
function wireSidesUncached(s: Schematic): Map<string, [string[], string[]]> {
  const net = netsOf(s);
  const wires = s.branches.filter((b) => b.kind === 'wire');
  // an element joins two electrical nodes: at each, it is attached to one side of every wire there
  const els = s.branches.filter((b) => b.kind !== 'wire' && net.get(b.from) !== net.get(b.to));
  const out = new Map<string, [string[], string[]]>();
  for (const w of wires) {
    // the nodes reached from `from` through the other wires
    const near = new Set([w.from]);
    const todo = [w.from];
    while (todo.length) {
      const n = todo.pop()!;
      for (const v of wires) {
        const m = v === w ? undefined : v.from === n ? v.to : v.to === n ? v.from : undefined;
        if (m !== undefined && !near.has(m)) {
          near.add(m);
          todo.push(m);
        }
      }
    }
    if (near.has(w.to)) throw new Error(`schematic: the wires at ${w.from} form a loop`);
    const far = new Set([...net.keys()].filter((n) => net.get(n) === net.get(w.from) && !near.has(n)));
    const on = (side: Set<string>) => els.filter((e) => side.has(e.from) || side.has(e.to)).map((e) => e.id);
    out.set(w.id, [on(near), on(far)]);
  }
  return out;
}

/** Below this share of the circuit's natural current (the model's scales), a current is rounding. */
export const ROUNDING = 1e-9;

const NATURAL = new WeakMap<SimResult, number>();
/** The circuit's natural current: the largest of its inductor currents' scales (pe-core's model scales, V T_s / L). */
function naturalCurrent(r: SimResult): number {
  const hit = NATURAL.get(r);
  if (hit !== undefined) return hit;
  const m = buildModel(r.params);
  let c = 0;
  m.stateNames.forEach((name, j) => {
    if (name === 'i' || name === 'iM') c = Math.max(c, m.scales?.[j] ?? 0);
  });
  NATURAL.set(r, c);
  return c;
}

/** The current below which an element carries none: NONE of its scale (modeScales), and never below rounding. */
export function countingFloor(r: SimResult, scale: number): number {
  return Math.max(NONE * scale, ROUNDING * naturalCurrent(r));
}

/**
 * Whether a current that counts grows or shrinks is a finer question: a
 * ripple of 0.02 A on 21 A is below NONE of the peak, and still the current
 * stores and releases energy. A change counts above a millionth of the
 * element's scale, and above rounding.
 */
export const CHANGE = 1e-6;

/** The change of an element's current that counts as one (CHANGE of its scale, never below rounding). */
export function changeFloor(r: SimResult, scale: number): number {
  return Math.max(CHANGE * scale, ROUNDING * naturalCurrent(r));
}

/** Every current in the period is rounding: the circuit rests (a capacitor alone at its steady voltage, a fixed output at the input). */
export function atRest(r: SimResult, s: Schematic = schematic(r.params), scale = currentScale(r, s)): boolean {
  return scale <= ROUNDING * naturalCurrent(r);
}

/** Each branch's largest current over the period, by id: the scale of its states and arrows in every mode. */
export function branchScales(r: SimResult, s: Schematic = schematic(r.params)): Map<string, number> {
  const n = (r.waveforms.t as number[]).length;
  const out = new Map<string, number>(s.branches.map((b) => [b.id, 0]));
  for (let k = 0; k < n; k++) {
    const o = outputsAt(r, k);
    for (const b of s.branches) out.set(b.id, Math.max(out.get(b.id)!, Math.abs(b.current(o))));
  }
  return out;
}

/** The first current of a list that counts (its sign), or 0. */
function firstCounting(i: number[], eps: number): number {
  for (const x of i) if (Math.abs(x) > eps) return x;
  return 0;
}

/** How often a current changes sign over a mode's samples, counting only currents above eps. */
function signChangesOf(i: number[], eps: number): number {
  let n = 0;
  let last = 0;
  for (const x of i) {
    if (Math.abs(x) <= eps) continue;
    const sg = Math.sign(x);
    if (last !== 0 && sg !== last) n++;
    last = sg;
  }
  return n;
}

/**
 * Where a current first changes sign, from its samples i at the times t: after
 * a sample beyond the counting floor eps with one sign, and before one with
 * the other. Samples within the floor count as no current, but the zero lies
 * between the two adjacent samples, among those in between, whose own values
 * bracket it: the last one still on the old side and the next one, which is
 * zero or on the other side. The time is where the straight line between them
 * crosses zero. A dip into the floor and back to the same side is no change.
 */
export function firstSignChange(t: readonly number[], i: readonly number[], eps: number): number | undefined {
  let lastSign = 0;
  let lastJ = -1;
  for (let j = 0; j < i.length; j++) {
    if (Math.abs(i[j]!) <= eps) continue;
    const sg = Math.sign(i[j]!);
    if (lastSign !== 0 && sg !== lastSign) {
      let k = lastJ;
      while (k + 1 < j && Math.sign(i[k + 1]!) === lastSign) k++;
      const a = Math.abs(i[k]!);
      const b = Math.abs(i[k + 1]!);
      return t[k]! + ((t[k + 1]! - t[k]!) * a) / (a + b);
    }
    lastSign = sg;
    lastJ = j;
  }
  return undefined;
}

/** Every element's state in a mode, from its current over the mode's samples. */
export function elementStates(r: SimResult, mode: OperatingMode, s: Schematic = schematic(r.params), scales = modeScales(r, mode, s)): ElementInMode[] {
  const t = r.waveforms.t as number[];
  const out: ElementInMode[] = [];
  const os: Outputs[] = [];
  for (let k = mode.k0; k <= mode.k1; k++) os.push(outputsAt(r, k));
  const fns = new Map<string, (o: Outputs) => number>();
  for (const b of s.branches) {
    if (b.kind === 'wire') continue;
    fns.set(`i:${b.id}`, b.current);
    if (b.voltage) fns.set(`v:${b.id}`, b.voltage);
  }
  // an inductor's state reads its current's extremes, so those are found between the samples too
  const peaks = new Set(s.branches.filter((b) => b.kind === 'inductor').map((b) => `i:${b.id}`));
  const ints = modeIntegrals(r, mode, fns, peaks);
  for (const b of s.branches) {
    if (b.kind === 'wire') continue;
    const eps = countingFloor(r, scales.get(b.id) ?? 0);
    const fine = changeFloor(r, scales.get(b.id) ?? 0);
    const i = os.map((o) => b.current(o));
    const tSign = firstSignChange(t.slice(mode.k0, mode.k1 + 1), i, eps);
    const signChanges = signChangesOf(i, eps);
    const avg = ints.avg.get(`i:${b.id}`)!;
    const exact = peaks.has(`i:${b.id}`);
    const min = Math.min(...i, ...(exact ? [ints.min.get(`i:${b.id}`)!] : []));
    const max = Math.max(...i, ...(exact ? [ints.max.get(`i:${b.id}`)!] : []));
    const active = Math.max(Math.abs(min), Math.abs(max)) > eps;
    const i0 = i[0]!;
    const i1 = i.at(-1)!;
    let state: ElementState;
    let v0: number | undefined;
    let v1: number | undefined;
    let vAvg: number | undefined;
    if (b.voltage) {
      const v = os.map((o) => b.voltage!(o));
      v0 = v[0];
      v1 = v.at(-1);
      vAvg = ints.avg.get(`v:${b.id}`)!;
    }
    const vRes = b.resistance ? b.resistance * avg : undefined;
    switch (b.kind) {
      case 'switch': {
        // gate on: the channel carries the current, or (a negative one) the body diode at zero volts;
        // gate off: the body diode conducts, or the switch blocks
        const bd = os.some((o) => (o.i_bd ?? 0) > eps);
        if (mode.gate) state = bd && !os.some((o) => Math.abs(o.i_sw ?? 0) > eps) ? 'onBodyDiode' : 'on';
        else state = bd ? 'bodyDiode' : 'off';
        break;
      }
      case 'diode':
        state = active ? 'conducting' : 'blocking';
        break;
      case 'winding':
      case 'resistor':
        state = active ? 'conducting' : 'idle';
        break;
      case 'inductor': {
        // its energy, L i^2 / 2, grows while the current's magnitude grows: from the start, the end and the
        // extremes of its magnitude within the mode, between the samples too (a current that rises and falls again
        // stores, then releases)
        const a0 = Math.abs(i0);
        const a1 = Math.abs(i1);
        const peak = Math.max(Math.abs(min), Math.abs(max));
        const dip = min <= 0 && max >= 0 ? 0 : Math.min(Math.abs(min), Math.abs(max));
        const d = a1 - a0;
        if (!active) state = 'zero';
        else if (signChanges >= 2) state = 'ringing';
        else if (signChanges === 1) state = 'reversing';
        else if (peak > Math.max(a0, a1) + fine) state = 'storeRelease';
        // (a current that starts or ends within the counting floor stores or releases nothing on that side of its dip:
        // a current that falls to zero and overshoots it by a few microamperes releases)
        else if (dip < Math.min(a0, a1) - fine && Math.min(a0, a1) > eps) state = 'releaseStore';
        else state = Math.abs(d) <= fine ? 'steady' : d > 0 ? 'storing' : 'releasing';
        break;
      }
      case 'capacitor': {
        if (!active) state = 'idle';
        else if (signChanges >= 2) state = 'ringing';
        else if (signChanges === 1) state = firstCounting(i, eps) > 0 ? 'chargeDischarge' : 'dischargeCharge';
        else state = avg > 0 ? 'charging' : 'discharging';
        break;
      }
      case 'battery':
        if (!active) state = 'idle';
        else if (signChanges >= 2) state = 'ringing';
        else if (signChanges === 1) state = firstCounting(i, eps) > 0 ? 'chargeDischarge' : 'dischargeCharge';
        else state = avg > 0 ? 'charging' : 'discharging';
        break;
      case 'vsource':
      case 'fixed':
        // a source delivers when its current leaves its positive terminal; a fixed output absorbs
        // when current enters its positive terminal; a current that changes direction does both in turn
        if (!active) state = 'idle';
        else if (signChanges >= 1) state = 'alternating';
        else state = (b.kind === 'vsource') === avg > 0 ? 'delivering' : 'absorbing';
        break;
      default:
        state = active ? 'conducting' : 'idle';
    }
    out.push({ id: b.id, kind: b.kind as Exclude<ElementKind, 'wire'>, state, i0, i1, avg, min, max, tSign, signChanges, v0, v1, vAvg, vRes });
  }
  return out;
}

/**
 * The forward converter's core reset in a mode, from its magnetizing
 * current: 'reset' when, with the switch off, a magnetizing current that
 * counts has fallen to none by the mode's end (the reset winding has
 * returned the core's energy to the input); 'noReset' when the mode ends the
 * period with the switch off and the magnetizing current still counting (it
 * has not returned to zero when the switch turns on again). Nothing in any
 * other mode or converter.
 */
export function coreReset(r: SimResult, mode: OperatingMode, states: ElementInMode[], scales: Map<string, number>): 'reset' | 'noReset' | undefined {
  if (r.params.topology !== 'forward' || mode.gate) return undefined;
  const lm = states.find((e) => e.id === 'LM');
  if (!lm || lm.state === 'zero') return undefined;
  if (Math.abs(lm.i1) <= countingFloor(r, scales.get('LM') ?? 0)) return 'reset';
  return mode.k1 >= (r.waveforms.t as number[]).length - 1 ? 'noReset' : undefined;
}

export interface BranchFlow {
  /** The branch carries a current that counts somewhere in the mode. */
  active: boolean;
  /** The direction of its average current along the branch (+1 from -> to, -1 back, 0 none). */
  sign: number;
  avg: number;
  /** Its current changes sign within the mode. */
  reverses: boolean;
}

/**
 * Whether a branch carries current in a mode (for drawing its path), which
 * way on average, and whether it reverses. An element carries one when its
 * current counts (NONE of its scale); a wire, when the currents of the
 * elements that count, and of no other, flow through it: its current is what
 * the counting elements on one of its sides pass to those on the other
 * (wireSides), and it counts for the smallest-scaled of them on either side,
 * so that a coloured wire joins coloured branches.
 */
export function branchFlow(r: SimResult, mode: OperatingMode, s: Schematic, scales = modeScales(r, mode, s)): Map<string, BranchFlow> {
  const out = new Map<string, BranchFlow>();
  const os: Outputs[] = [];
  for (let k = mode.k0; k <= mode.k1; k++) os.push(outputsAt(r, k));
  const on = activeElements(r, mode, s, scales);
  const sides = wireSides(s);
  const net = netsOf(s);
  const byId = new Map(s.branches.map((b) => [b.id, b]));
  const cur = new Map<string, number[]>();
  for (const b of s.branches) if (b.kind !== 'wire') cur.set(b.id, os.map((o) => b.current(o)));
  // what the counting elements on one side of a wire (at the electrical node N) put into that side, as a function
  // of the outputs, and sample by sample
  const intoFn = (ids: string[], N: string) => (o: Outputs) => ids.reduce((sum, id) => sum + (net.get(byId.get(id)!.to) === N ? 1 : -1) * byId.get(id)!.current(o), 0);
  const into = (ids: string[], N: string) => os.map((_, k) => ids.reduce((sum, id) => sum + (net.get(byId.get(id)!.to) === N ? 1 : -1) * cur.get(id)![k]!, 0));
  const fns = new Map<string, (o: Outputs) => number>();
  const found = new Map<string, { i: number[]; eps: number }>();
  for (const b of s.branches) {
    let i: number[];
    let eps: number;
    if (b.kind === 'wire') {
      // a wire joins the elements on its two sides: its current, from -> to, is what the counting elements on
      // its `from` side put into that side. It carries a path when that counts for the smallest-scaled of the
      // counting elements on either side: the whole current of a resistor fed from a capacitor that carries
      // amperes counts; what is left where a battery's and a resistor's currents cancel beside a capacitor at
      // rest does not, on either side; a side where nothing counts passes nothing
      const N = net.get(b.from)!;
      const [near, far] = sides.get(b.id)!.map((ids) => ids.filter((id) => on.has(id))) as [string[], string[]];
      i = into(near, N);
      fns.set(b.id, intoFn(near, N));
      const back = into(far, N);
      eps = Infinity;
      if (near.length && far.length) {
        for (const [ids, x] of [
          [near, i],
          [far, back],
        ] as const) {
          const floor = countingFloor(r, Math.min(...ids.map((id) => scales.get(id) ?? 0)));
          if (Math.max(...x.map(Math.abs)) > floor) eps = Math.min(eps, floor);
        }
      }
    } else {
      i = cur.get(b.id)!;
      eps = countingFloor(r, scales.get(b.id) ?? 0);
      fns.set(b.id, b.current);
    }
    found.set(b.id, { i, eps });
  }
  const avgs = modeIntegrals(r, mode, fns).avg;
  for (const b of s.branches) {
    const { i, eps } = found.get(b.id)!;
    const avg = avgs.get(b.id)!;
    const peak = Math.max(...i.map(Math.abs));
    const active = peak > eps;
    // the arrow follows the average; an average at the rounding of the currents in the branch (a billionth of their
    // peak: a capacitor whose charge nets to nothing) has no direction, and the first current that counts sets it
    const sign = Math.abs(avg) > 1e-9 * peak ? Math.sign(avg) : Math.sign(firstCounting(i, eps));
    out.set(b.id, { active, sign: active ? sign : 0, avg, reverses: signChangesOf(i, eps) > 0 });
  }
  return out;
}
