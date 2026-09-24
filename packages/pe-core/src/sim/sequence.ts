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
import { buildModel } from './models';
import { schematic, type ElementKind, type Outputs, type Schematic } from './schematic';

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
  // two modes of one kind that a sliver separated are one mode
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
  out.forEach((m, j) => (m.index = j + 1));
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
 * A current smaller than this share of its scale counts as none. The scale
 * of the switching cell (the switch, the diodes, the windings, the
 * inductances, the node capacitance and a direct input) is the largest
 * current in the cell during the mode: the microamperes a node capacitance
 * draws through the input while the diode carries amperes are not a current
 * path worth drawing, nor a state of the input, while a ringing that turns
 * the diode on again for a few nanoseconds conducts a current that is that
 * mode's whole story, however small next to the period's peak. The scale of
 * the load and the source (the output capacitor, the resistor, the battery,
 * a fixed output, the Thevenin source, its resistance and bus capacitor) is
 * the element's own largest current over the period: they carry the load's
 * or the source's current in every mode, beside which the cell's current in
 * a short mode would count for nothing.
 */
export const NONE = 1e-3;

/** The load's and the source's elements, measured against their own peaks. */
const OUTSIDE = new Set(['C', 'R', 'B', 'V', 'Voc', 'Rs', 'Cbus']);

/**
 * Each branch's scale in a mode, by id: for the switching cell's branches
 * and the wires, the largest current in the cell during the mode; for the
 * load's and the source's elements, their own largest current over the period.
 */
export function modeScales(r: SimResult, mode: OperatingMode, s: Schematic = schematic(r.params), peaks = branchScales(r, s)): Map<string, number> {
  let cell = 0;
  for (let k = mode.k0; k <= mode.k1; k++) {
    const o = outputsAt(r, k);
    for (const b of s.branches) if (b.kind !== 'wire' && !OUTSIDE.has(b.id)) cell = Math.max(cell, Math.abs(b.current(o)));
  }
  return new Map(s.branches.map((b) => [b.id, OUTSIDE.has(b.id) ? peaks.get(b.id)! : cell]));
}

/** Below this share of the circuit's natural current (the model's scales), a current is rounding. */
export const ROUNDING = 1e-9;

/** The circuit's natural current: the largest of its inductor currents' scales (pe-core's model scales, V T_s / L). */
function naturalCurrent(r: SimResult): number {
  const m = buildModel(r.params);
  let c = 0;
  m.stateNames.forEach((name, j) => {
    if (name === 'i' || name === 'iM') c = Math.max(c, m.scales?.[j] ?? 0);
  });
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

/** Every element's state in a mode, from its current over the mode's samples. */
export function elementStates(r: SimResult, mode: OperatingMode, s: Schematic = schematic(r.params), scales = modeScales(r, mode, s)): ElementInMode[] {
  const t = r.waveforms.t as number[];
  const out: ElementInMode[] = [];
  const os: Outputs[] = [];
  for (let k = mode.k0; k <= mode.k1; k++) os.push(outputsAt(r, k));
  const span = mode.t1 - mode.t0;
  for (const b of s.branches) {
    if (b.kind === 'wire') continue;
    const eps = countingFloor(r, scales.get(b.id) ?? 0);
    const fine = changeFloor(r, scales.get(b.id) ?? 0);
    const i = os.map((o) => b.current(o));
    let area = 0;
    let tSign: number | undefined;
    // the sign of the last current that counts
    let lastSign = 0;
    for (let j = 0; j < i.length; j++) {
      if (j > 0) area += 0.5 * (i[j - 1]! + i[j]!) * (t[mode.k0 + j]! - t[mode.k0 + j - 1]!);
      if (Math.abs(i[j]!) <= eps) continue;
      const sg = Math.sign(i[j]!);
      if (lastSign !== 0 && sg !== lastSign && tSign === undefined) {
        // between the previous sample and this one, where the straight line between them crosses zero
        const a = Math.abs(i[j - 1]!);
        const dt = t[mode.k0 + j]! - t[mode.k0 + j - 1]!;
        tSign = t[mode.k0 + j - 1]! + (dt * a) / (a + Math.abs(i[j]!));
      }
      lastSign = sg;
    }
    const signChanges = signChangesOf(i, eps);
    const avg = span > 0 ? area / span : i[0]!;
    const min = Math.min(...i);
    const max = Math.max(...i);
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
      let va = 0;
      for (let j = 1; j < v.length; j++) va += 0.5 * (v[j - 1]! + v[j]!) * (t[mode.k0 + j]! - t[mode.k0 + j - 1]!);
      vAvg = span > 0 ? va / span : v[0];
    }
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
        // extremes of its magnitude within the mode (a current that rises and falls again stores, then releases)
        const a0 = Math.abs(i0);
        const a1 = Math.abs(i1);
        const peak = Math.max(Math.abs(min), Math.abs(max));
        const dip = Math.min(...i.map(Math.abs));
        const d = a1 - a0;
        if (!active) state = 'zero';
        else if (signChanges >= 2) state = 'ringing';
        else if (signChanges === 1) state = 'reversing';
        else if (peak > Math.max(a0, a1) + fine) state = 'storeRelease';
        else if (dip < Math.min(a0, a1) - fine) state = 'releaseStore';
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
    out.push({ id: b.id, kind: b.kind as Exclude<ElementKind, 'wire'>, state, i0, i1, avg, min, max, tSign, signChanges, v0, v1, vAvg });
  }
  return out;
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

/** Whether a branch carries current in a mode (for drawing its path), which way on average, and whether it reverses. */
export function branchFlow(r: SimResult, mode: OperatingMode, s: Schematic, scales = modeScales(r, mode, s)): Map<string, BranchFlow> {
  const t = r.waveforms.t as number[];
  const out = new Map<string, BranchFlow>();
  const os: Outputs[] = [];
  for (let k = mode.k0; k <= mode.k1; k++) os.push(outputsAt(r, k));
  for (const b of s.branches) {
    const eps = countingFloor(r, scales.get(b.id) ?? 0);
    const i = os.map((o) => b.current(o));
    let area = 0;
    for (let j = 1; j < i.length; j++) area += 0.5 * (i[j - 1]! + i[j]!) * (t[mode.k0 + j]! - t[mode.k0 + j - 1]!);
    const span = mode.t1 - mode.t0;
    const avg = span > 0 ? area / span : i[0]!;
    const peak = Math.max(...i.map(Math.abs));
    const active = peak > eps;
    out.set(b.id, { active, sign: active ? Math.sign(avg) || Math.sign(firstCounting(i, eps)) : 0, avg, reverses: signChangesOf(i, eps) > 0 });
  }
  return out;
}
