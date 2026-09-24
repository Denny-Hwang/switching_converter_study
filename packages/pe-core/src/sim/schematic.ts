/**
 * The circuit of each simulated converter as a graph for drawing its
 * operating modes: nodes at every junction (the rails split into segments,
 * so that every wire carries one current) and branches between them, each an
 * element or a wire, with its current taken from the model's outputs at one
 * instant. A branch's current is positive from `from` to `to`.
 *
 * The currents come from the model's own outputs of each element (the
 * switch's channel and body diode, the diode, the node capacitance, the
 * inductor, the input, the load's resistor, battery and capacitor), so
 * Kirchhoff's current law at every node is a check on the model, not an
 * identity (test/sim-schematic.test.ts).
 *
 * Coordinates are in grid units: the top rail at y = 0, the bottom rail at
 * y = BOTTOM, x growing to the right.
 */

import type { SimParams, Topology } from './models';

/** The model's outputs at one instant (i_L, i_D, i_sw, i_bd, i_Cn, i_in, i_out, i_R, i_bat, i_C, ...). */
export type Outputs = Record<string, number>;

export type ElementKind =
  | 'vsource'
  | 'resistor'
  | 'capacitor'
  | 'inductor'
  | 'switch'
  | 'diode'
  | 'battery'
  | 'fixed'
  | 'winding'
  | 'wire';

export interface SchematicNode {
  id: string;
  x: number;
  y: number;
}

/** A side of an element on the drawing. */
export type Side = 'left' | 'right' | 'above' | 'below';

export interface SchematicBranch {
  id: string;
  kind: ElementKind;
  /** The current is positive from `from` to `to`. */
  from: string;
  to: string;
  /** Corner points of the wire between the two nodes; the element sits on its longest straight run. */
  via?: [number, number][];
  current: (o: Outputs) => number;
  /** The element's name, a key of the element table ('S', 'D', 'L', 'C', ...); wires have none. */
  element?: string;
  /** Diodes: the anode is at `from` (forward current positive from -> to). Windings: the dotted end. */
  dot?: 'from' | 'to';
  /** A voltage source or a battery: its positive terminal. */
  plus?: 'from' | 'to';
  /** The element's voltage from the outputs, where the model has it (the switch's, the inductor's, a capacitor's). */
  voltage?: (o: Outputs) => number;
  /** Where the element's name and state are drawn (default: above a horizontal element, right of a vertical one). */
  label?: Side;
  /** The side an inductor's or a winding's turns bulge to (a winding's: towards its core), or a switch's body diode is drawn on. */
  bulge?: Side;
}

export interface Schematic {
  topology: Topology;
  nodes: SchematicNode[];
  branches: SchematicBranch[];
  /** Transformer cores: vertical double lines between the windings. */
  cores: { x: number; y1: number; y2: number }[];
  width: number;
  height: number;
}

export const BOTTOM = 4.4;

class Builder {
  nodes: SchematicNode[] = [];
  branches: SchematicBranch[] = [];
  cores: Schematic['cores'] = [];
  node(id: string, x: number, y: number): string {
    if (this.nodes.some((n) => n.id === id)) throw new Error(`schematic: node ${id} twice`);
    this.nodes.push({ id, x, y });
    return id;
  }
  branch(b: SchematicBranch): void {
    if (this.branches.some((x) => x.id === b.id)) throw new Error(`schematic: branch ${b.id} twice`);
    this.branches.push(b);
  }
  el(
    id: string,
    kind: Exclude<ElementKind, 'wire'>,
    from: string,
    to: string,
    current: (o: Outputs) => number,
    more: Partial<SchematicBranch> = {},
  ): void {
    this.branch({ id, kind, from, to, current, element: more.element ?? id, ...more });
  }
  wire(from: string, to: string, current: (o: Outputs) => number, via?: [number, number][]): void {
    this.branch({ id: `w:${from}-${to}`, kind: 'wire', from, to, current, via });
  }
}

const get = (k: string) => (o: Outputs) => o[k] ?? 0;
/** The switch's net current from drain to source: its channel less its body diode. */
const iSwitch = (o: Outputs) => (o.i_sw ?? 0) - (o.i_bd ?? 0);

interface LoadParts {
  hasC: boolean;
  hasR: boolean;
  hasBattery: boolean;
  fixed: boolean;
}

function loadParts(p: SimParams): LoadParts {
  const l = p.load;
  if (l.kind === 'fixed') return { hasC: false, hasR: false, hasBattery: false, fixed: true };
  if (l.kind === 'resistive') return { hasC: true, hasR: true, hasBattery: false, fixed: false };
  return { hasC: true, hasR: l.R !== undefined, hasBattery: !!l.battery, fixed: false };
}

/**
 * The input port: a stiff source V_g, or a Thevenin source (V_oc behind R_s)
 * charging the bus capacitor C_bus. Returns the converter's top and bottom
 * input nodes and the x where the converter starts.
 */
function input(b: Builder, p: SimParams): { top: string; bottom: string; x: number } {
  if (!p.source) {
    b.node('in', 0, 0);
    b.node('g_in', 0, BOTTOM);
    b.el('Vg', 'vsource', 'g_in', 'in', get('i_in'), { plus: 'to', voltage: get('v_in'), label: 'left' });
    return { top: 'in', bottom: 'g_in', x: 0 };
  }
  const { Voc, Rs } = p.source;
  b.node('src', 0, 0);
  b.node('g_src', 0, BOTTOM);
  b.node('in', 2.2, 0);
  b.node('g_in', 2.2, BOTTOM);
  b.el('Voc', 'vsource', 'g_src', 'src', get('i_src'), { plus: 'to', voltage: () => Voc, label: 'left' });
  b.el('Rs', 'resistor', 'src', 'in', get('i_src'), { voltage: (o) => (o.i_src ?? 0) * Rs });
  b.el('Cbus', 'capacitor', 'in', 'g_in', get('i_Cbus'), { voltage: get('v_in'), label: 'left' });
  // the bus capacitor and the converter return their currents to the source
  b.wire('g_in', 'g_src', get('i_src'));
  return { top: 'in', bottom: 'g_in', x: 2.2 };
}

/** The spacing of the load's columns (grid units): room for each one's name and state on its right. */
const COLUMN = 1.9;

/**
 * The load between the output's top node `o` (at x0) and the bottom rail
 * node `g` (at x0): C, R and a battery in columns, or a fixed voltage. `sign`
 * is -1 for the inverting buck-boost, whose top rail is the negative
 * terminal: its load currents then flow from the bottom rail up.
 */
function load(b: Builder, p: SimParams, o: string, g: string, x0: number, sign: 1 | -1): void {
  const parts = loadParts(p);
  const cols: { id: string; kind: 'capacitor' | 'resistor' | 'battery' | 'fixed'; i: (o: Outputs) => number }[] = [];
  if (parts.fixed) cols.push({ id: 'V', kind: 'fixed', i: get('i_bat') });
  if (parts.hasC) cols.push({ id: 'C', kind: 'capacitor', i: get('i_C') });
  if (parts.hasR) cols.push({ id: 'R', kind: 'resistor', i: get('i_R') });
  if (parts.hasBattery) cols.push({ id: 'B', kind: 'battery', i: get('i_bat') });
  let prevTop = o;
  let prevBottom = g;
  cols.forEach((c, k) => {
    const x = x0 + COLUMN * k;
    const top = k === 0 ? o : b.node(`o${k}`, x, 0);
    const bottom = k === 0 ? g : b.node(`g_o${k}`, x, BOTTOM);
    // what the columns from k on take: the rail segments carry it
    const rest = (oo: Outputs) => cols.slice(k).reduce((s, cc) => s + cc.i(oo), 0);
    if (k > 0) {
      if (sign === 1) {
        b.wire(prevTop, top, rest);
        b.wire(bottom, prevBottom, rest);
      } else {
        b.wire(top, prevTop, rest);
        b.wire(prevBottom, bottom, rest);
      }
    }
    // an element's current flows from its positive terminal's side into it: top -> bottom, or
    // bottom -> top for the inverting output
    const [from, to] = sign === 1 ? [top, bottom] : [bottom, top];
    const plus = c.kind === 'battery' || c.kind === 'fixed' ? ({ plus: 'from' } as const) : {};
    b.el(c.id, c.kind, from, to, c.i, { ...plus, voltage: get('v_out') });
    prevTop = top;
    prevBottom = bottom;
  });
}

/**
 * The high-side switch of the buck and the buck-boost, on the top rail from
 * x + 0.4 to x + 1.95, its body diode drawn below it; a node capacitance in
 * a loop below that.
 */
function highSide(b: Builder, p: SimParams, top: string, x: number): void {
  b.node('sL', x + 0.4, 0);
  b.node('sR', x + 1.95, 0);
  b.wire(top, 'sL', get('i_in'));
  b.el('S', 'switch', 'sL', 'sR', iSwitch, { voltage: get('v_sw'), bulge: 'below' });
  if (p.Cnode) {
    b.el('Cn', 'capacitor', 'sL', 'sR', get('i_Cn'), {
      via: [
        [x + 0.4, 0.95],
        [x + 1.95, 0.95],
      ],
      voltage: get('v_sw'),
      label: 'below',
    });
  }
  b.wire('sR', 'sw', (o) => iSwitch(o) + (o.i_Cn ?? 0));
}

/**
 * A low-side switch from node `t` to node `g` in the column at `xs`, its
 * name on `label`'s side and its body diode on the other; with a node
 * capacitance, the switch between y0 and y1 and the capacitance in a loop
 * at `xc`.
 */
function lowSide(b: Builder, p: SimParams, t: string, g: string, xs: number, label: Side, cn?: { y0: number; y1: number; xc: number }): void {
  const bulge: Side = label === 'left' ? 'right' : 'left';
  if (p.Cnode && cn) {
    b.node('sT', xs, cn.y0);
    b.node('sB', xs, cn.y1);
    b.wire(t, 'sT', (o) => iSwitch(o) + (o.i_Cn ?? 0));
    b.el('S', 'switch', 'sT', 'sB', iSwitch, { voltage: get('v_sw'), label, bulge });
    b.el('Cn', 'capacitor', 'sT', 'sB', get('i_Cn'), {
      via: [
        [cn.xc, cn.y0],
        [cn.xc, cn.y1],
      ],
      voltage: get('v_sw'),
      label: cn.xc < xs ? 'left' : 'right',
    });
    b.wire('sB', g, (o) => iSwitch(o) + (o.i_Cn ?? 0));
  } else {
    b.el('S', 'switch', t, g, iSwitch, { voltage: get('v_sw'), label, bulge });
  }
}

function buck(b: Builder, p: SimParams): void {
  const { top, bottom, x } = input(b, p);
  b.node('sw', x + 2.5, 0);
  b.node('out', x + 4.1, 0);
  b.node('g_d', x + 2.5, BOTTOM);
  b.node('g_out', x + 4.1, BOTTOM);
  highSide(b, p, top, x);
  b.el('D', 'diode', 'g_d', 'sw', get('i_D'), { dot: 'from' });
  b.el('L', 'inductor', 'sw', 'out', get('i_L'), { voltage: get('v_L') });
  load(b, p, 'out', 'g_out', x + 4.1, 1);
  b.wire('g_out', 'g_d', get('i_out'));
  b.wire('g_d', bottom, (o) => (o.i_out ?? 0) - (o.i_D ?? 0));
}

function boost(b: Builder, p: SimParams): void {
  const { top, bottom, x } = input(b, p);
  // the switch at x + 3; with a node capacitance on its right, the output further out
  const xs = x + 3;
  const xo = p.Cnode ? x + 5.8 : x + 4.5;
  b.node('lx', xs, 0);
  b.node('out', xo, 0);
  b.node('g_s', xs, BOTTOM);
  b.node('g_out', xo, BOTTOM);
  b.el('L', 'inductor', top, 'lx', get('i_L'), { voltage: get('v_L') });
  lowSide(b, p, 'lx', 'g_s', xs, 'left', { y0: 1.3, y1: 3.1, xc: xs + 0.8 });
  b.el('D', 'diode', 'lx', 'out', get('i_D'), { dot: 'from' });
  load(b, p, 'out', 'g_out', xo, 1);
  b.wire('g_out', 'g_s', get('i_out'));
  b.wire('g_s', bottom, (o) => iSwitch(o) + (o.i_Cn ?? 0) + (o.i_out ?? 0));
}

function buckboost(b: Builder, p: SimParams): void {
  const { top, bottom, x } = input(b, p);
  b.node('sw', x + 2.5, 0);
  b.node('out', x + 4.1, 0);
  b.node('g_l', x + 2.5, BOTTOM);
  b.node('g_out', x + 4.1, BOTTOM);
  highSide(b, p, top, x);
  // the inductor's symbol on the lower part of its column, clear of a node capacitance's name
  b.el('L', 'inductor', 'sw', 'g_l', get('i_L'), { voltage: get('v_L'), label: 'left', via: [[x + 2.5, 1.2]] });
  // the output's top rail is its negative terminal: the diode conducts from it into the switch node
  b.el('D', 'diode', 'out', 'sw', get('i_D'), { dot: 'from' });
  load(b, p, 'out', 'g_out', x + 4.1, -1);
  b.wire('g_l', 'g_out', get('i_out'));
  b.wire('g_l', bottom, (o) => (o.i_L ?? 0) - (o.i_out ?? 0));
}

function flyback(b: Builder, p: SimParams): void {
  const { top, bottom, x } = input(b, p);
  const n = p.n ?? 1;
  // primary: the magnetizing inductance (x + 2.6) in parallel with the ideal primary winding
  // (x + 3.8, dot at the top) beside the core (x + 4.25); the switch below L_M
  b.node('pM', x + 2.6, 0);
  b.node('pW', x + 3.8, 0);
  b.node('wT', x + 3.8, 0.6);
  b.node('wB', x + 3.8, 2.4);
  b.node('d', x + 2.6, 2.4);
  b.node('g_s', x + 2.6, BOTTOM);
  // the ideal winding carries the reflected secondary current n i_D, from its undotted end to its dot
  const iW1 = (o: Outputs) => -n * (o.i_D ?? 0);
  b.wire(top, 'pM', get('i_in'));
  b.el('LM', 'inductor', 'pM', 'd', get('i_L'), { voltage: get('v_L'), label: 'left' });
  b.wire('pM', 'pW', iW1);
  b.wire('pW', 'wT', iW1);
  b.el('W1', 'winding', 'wT', 'wB', iW1, { dot: 'from', label: 'left', bulge: 'right' });
  b.wire('wB', 'd', iW1);
  lowSide(b, p, 'd', 'g_s', x + 2.6, 'right', { y0: 2.55, y1: 4.25, xc: x + 1.7 });
  b.wire('g_s', bottom, (o) => iSwitch(o) + (o.i_Cn ?? 0));
  // secondary, isolated: its dot at the bottom, so the diode blocks while the switch is on
  const xs = x + 4.7;
  b.node('sT2', xs, 0);
  b.node('sWt', xs, 0.6);
  b.node('sWb', xs, 2.4);
  b.node('sB2', xs, BOTTOM);
  b.node('out', xs + 1.7, 0);
  b.node('g_out', xs + 1.7, BOTTOM);
  b.wire('sB2', 'sWb', get('i_D'));
  b.el('W2', 'winding', 'sWb', 'sWt', get('i_D'), { dot: 'from', bulge: 'left' });
  b.wire('sWt', 'sT2', get('i_D'));
  b.el('D', 'diode', 'sT2', 'out', get('i_D'), { dot: 'from' });
  load(b, p, 'out', 'g_out', xs + 1.7, 1);
  b.wire('g_out', 'sB2', get('i_out'));
  b.cores.push({ x: x + 4.25, y1: 0.5, y2: 2.5 });
}

function forward(b: Builder, p: SimParams): void {
  const { top, bottom, x } = input(b, p);
  const n = p.n ?? 1;
  const nr = p.nr ?? 1;
  // primary side: L_M (x + 2.4) above the switch; beside the core (x + 4.5), stacked at x + 3.9,
  // the reset diode D3, the reset winding W3 and the primary winding W1. The primary winding is fed
  // from the top rail at x + 2.85, and the reset winding returns to the bottom rail at x + 4.2.
  b.node('tM', x + 2.4, 0);
  b.node('tW', x + 2.85, 0);
  b.node('tR', x + 3.9, 0);
  b.node('rA', x + 3.9, 0.8);
  b.node('rB', x + 3.9, 1.7);
  b.node('wT', x + 3.9, 2.0);
  b.node('wB', x + 3.9, 3.0);
  b.node('d', x + 2.4, 3.0);
  b.node('g_s', x + 2.4, BOTTOM);
  b.node('g_r', x + 4.2, BOTTOM);
  // The ideal primary winding balances the other windings' ampere-turns: into its dot flows the
  // reflected output-inductor current n i_D1, less the reflected reset current n_r i_Dr (the reset
  // current enters the reset winding's dot). During the reset that is -i_M: the magnetizing current
  // circulates back through the ideal winding, and the switch carries nothing.
  const iR = get('i_Dr');
  const iW1 = (o: Outputs) => n * (o.i_D1 ?? 0) - nr * iR(o);
  b.wire(top, 'tM', get('i_in'));
  b.el('LM', 'inductor', 'tM', 'd', get('i_M'), { label: 'left' });
  b.wire('tM', 'tW', (o) => iW1(o) - iR(o));
  b.wire('tW', 'tR', (o) => -iR(o));
  b.wire('tW', 'wT', iW1, [[x + 2.85, 2.0]]);
  b.el('W1', 'winding', 'wT', 'wB', iW1, { dot: 'from', label: 'left', bulge: 'right' });
  b.wire('wB', 'd', iW1);
  // the reset winding: its dot to the primary's return, its other end through D3 to the input
  b.el('D3', 'diode', 'rA', 'tR', iR, { dot: 'from' });
  b.el('W3', 'winding', 'rB', 'rA', iR, { dot: 'from', label: 'left', bulge: 'right' });
  b.wire('g_r', 'rB', iR, [[x + 4.2, 1.7]]);
  lowSide(b, p, 'd', 'g_s', x + 2.4, 'left');
  b.wire('g_s', 'g_r', iR);
  b.wire('g_s', bottom, (o) => iSwitch(o) - iR(o));
  // secondary, isolated: the dot at the top, D1 forward, D2 freewheeling, then L
  const xs = x + 5;
  b.node('sT2', xs, 0);
  b.node('sWt', xs, 2.0);
  b.node('sWb', xs, 3.0);
  b.node('sB2', xs, BOTTOM);
  b.node('xr', xs + 1.4, 0);
  b.node('g_x', xs + 1.4, BOTTOM);
  b.node('out', xs + 3, 0);
  b.node('g_out', xs + 3, BOTTOM);
  b.wire('sB2', 'sWb', get('i_D1'));
  b.el('W2', 'winding', 'sWb', 'sWt', get('i_D1'), { dot: 'to', bulge: 'left' });
  b.wire('sWt', 'sT2', get('i_D1'));
  b.el('D1', 'diode', 'sT2', 'xr', get('i_D1'), { dot: 'from' });
  b.el('D2', 'diode', 'g_x', 'xr', get('i_D2'), { dot: 'from' });
  b.el('L', 'inductor', 'xr', 'out', get('i_L'), { voltage: get('v_L') });
  load(b, p, 'out', 'g_out', xs + 3, 1);
  b.wire('g_out', 'g_x', get('i_out'));
  b.wire('g_x', 'sB2', (o) => (o.i_out ?? 0) - (o.i_D2 ?? 0));
  b.cores.push({ x: x + 4.5, y1: 0.85, y2: 3.1 });
}

export function schematic(p: SimParams): Schematic {
  const b = new Builder();
  ({ buck, boost, buckboost, flyback, forward })[p.topology](b, p);
  const pts = [...b.nodes.map((n) => [n.x, n.y]), ...b.branches.flatMap((br) => br.via ?? [])];
  const xs = pts.map((q) => q[0]!);
  const ys = pts.map((q) => q[1]!);
  return {
    topology: p.topology,
    nodes: b.nodes,
    branches: b.branches,
    cores: b.cores,
    width: Math.max(...xs) - Math.min(...xs),
    height: Math.max(...ys) - Math.min(...ys),
  };
}

/** Kirchhoff's current law at every node: the sum of currents in, less the sum out (zero for a consistent model). */
export function kclResiduals(s: Schematic, o: Outputs): Record<string, number> {
  const out: Record<string, number> = {};
  for (const n of s.nodes) out[n.id] = 0;
  for (const br of s.branches) {
    const i = br.current(o);
    out[br.to]! += i;
    out[br.from]! -= i;
  }
  return out;
}

