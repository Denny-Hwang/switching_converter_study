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
  | 'idle';

/** The states each kind of element can be in (elementStates() gives no other). */
export const STATES: Record<Exclude<ElementKind, 'wire'>, readonly ElementState[]> = {
  switch: ['on', 'onBodyDiode', 'bodyDiode', 'off'],
  diode: ['conducting', 'blocking'],
  winding: ['conducting', 'idle'],
  resistor: ['conducting', 'idle'],
  inductor: ['storing', 'releasing', 'reversing', 'ringing', 'zero', 'steady'],
  capacitor: ['charging', 'discharging', 'chargeDischarge', 'dischargeCharge', 'ringing', 'idle'],
  battery: ['charging', 'discharging', 'chargeDischarge', 'dischargeCharge', 'ringing', 'idle'],
  vsource: ['delivering', 'absorbing', 'idle'],
  fixed: ['delivering', 'absorbing', 'idle'],
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

/** The modes of a result's recorded period. */
export function modes(r: SimResult): OperatingMode[] {
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

/** A current smaller than this share of the period's largest counts as none. */
export const NONE = 1e-6;

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
export function elementStates(r: SimResult, mode: OperatingMode, s: Schematic = schematic(r.params), scale = currentScale(r, s)): ElementInMode[] {
  const t = r.waveforms.t as number[];
  const eps = NONE * scale;
  const out: ElementInMode[] = [];
  const os: Outputs[] = [];
  for (let k = mode.k0; k <= mode.k1; k++) os.push(outputsAt(r, k));
  const span = mode.t1 - mode.t0;
  for (const b of s.branches) {
    if (b.kind === 'wire') continue;
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
        // its energy, L i^2 / 2, grows while the current's magnitude grows
        const d = Math.abs(i1) - Math.abs(i0);
        if (!active) state = 'zero';
        else if (signChanges >= 2) state = 'ringing';
        else if (signChanges === 1) state = 'reversing';
        else state = Math.abs(d) <= eps ? 'steady' : d > 0 ? 'storing' : 'releasing';
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
        // when current enters its positive terminal
        state = !active ? 'idle' : (b.kind === 'vsource') === avg > 0 ? 'delivering' : 'absorbing';
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
export function branchFlow(r: SimResult, mode: OperatingMode, s: Schematic, scale: number): Map<string, BranchFlow> {
  const t = r.waveforms.t as number[];
  const eps = NONE * scale;
  const out = new Map<string, BranchFlow>();
  const os: Outputs[] = [];
  for (let k = mode.k0; k <= mode.k1; k++) os.push(outputsAt(r, k));
  for (const b of s.branches) {
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
