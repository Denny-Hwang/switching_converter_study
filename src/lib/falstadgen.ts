/**
 * A converter as a CircuitJS1 circuit, from any values: the TypeScript twin of
 * scripts/falstad_library.py, which writes the SPICE library's seven cases (sim/falstad/). The same
 * drawing, parts and options: a body diode across the switch, backward Euler for the inductors and the
 * transformer, a coupling of 0.99999, a fixed step of a five-hundredth of the switching period, about one
 * period a second on the screen, and a start at a steady state's values. For the library's seven cases it
 * writes the library's files character for character (falstadgen.test.ts), so the wiring the Python
 * script checks against the SPICE netlists holds here too. The simulator uses it to open the values in its
 * form in CircuitJS1.
 */
import type { sim } from 'pe-core';
import { compressToEncodedURIComponent } from './lzstring';

export const FALSTAD_APP = 'https://www.falstad.com/circuit/circuitjs.html';
/** Time steps per switching period. */
export const STEPS = 500;
/** The simulation speed a link opens with: CircuitJS1 runs 160 times this many steps a second. */
export const DISPLAY_SPEED = STEPS / 160;
const R_ON = 0.001;
const R_OFF = 1e6;
const DIODE_MODEL = 'near-ideal';
const DIODE_LINE = `34 ${DIODE_MODEL} 0 1e-9 0 0.05 0 0`;
const COUPLING = 0.99999;
const BACK_EULER = 2;
const REVERSE = 4;
const SHOW_VOLTAGE = 16;
const GATE_V = 2.5;
/** The dots move about this many pixels a frame at the load current. */
const DOT_PX = 1.5;

/** The circuit's values (SI). Lm is the flyback's or the forward converter's magnetizing inductance. */
export interface FalstadParams {
  topology: sim.Topology;
  Vg: number;
  D: number;
  fs: number;
  /** The inductor (the flyback has none: its Lm). */
  L: number;
  C: number;
  R: number;
  n?: number;
  nr?: number;
  Lm?: number;
  /** The switch's on-resistance; the library's 1 mOhm when absent. */
  Ron?: number;
}

/**
 * Where the circuit starts: the output voltage, the inductor's current (the forward converter's output
 * inductor) and the flyback's magnetizing current, when the switch turns on at the start of the period.
 */
export interface FalstadStart {
  vOut: number;
  iL: number;
  iM: number;
}

/** A number as CircuitJS1 reads it and Python's repr writes it: shortest round trip, no '+', no ".0". */
export function num(x: number): string {
  if (!Number.isFinite(x)) throw new Error(`not a finite number: ${x}`);
  if (x === 0) return '0';
  const sign = x < 0 ? '-' : '';
  const [m, e] = Math.abs(x).toExponential().split('e') as [string, string];
  const exp = Number(e);
  const digits = m.replace('.', '');
  let s: string;
  if (exp < -4 || exp >= 16) {
    // Python's repr: d.ddde-XX, the exponent at least two digits ('e+' is written 'e': CircuitJS1 splits on '+')
    const mant = digits.length > 1 ? `${digits[0]}.${digits.slice(1)}` : digits;
    s = `${mant}e${exp < 0 ? '-' : ''}${String(Math.abs(exp)).padStart(2, '0')}`;
  } else if (exp >= 0) {
    const int = digits.slice(0, exp + 1).padEnd(exp + 1, '0');
    const frac = digits.slice(exp + 1);
    s = frac ? `${int}.${frac}` : int;
  } else {
    s = `0.${'0'.repeat(-exp - 1)}${digits}`;
  }
  return sign + s;
}

/** Six significant digits: far finer than the ripple, and short in the link. */
const six = (x: number) => Number(x.toPrecision(6));

type Point = readonly [number, number];

interface Elm {
  kind: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  flags: number;
  values: string[];
  name: string;
}

const elm = (kind: string, a: Point, b: Point, flags = 0, values: string[] = [], name = ''): Elm => ({
  kind,
  x1: a[0],
  y1: a[1],
  x2: b[0],
  y2: b[1],
  flags,
  values,
  name,
});
const line = (e: Elm) => [e.kind, e.x1, e.y1, e.x2, e.y2, e.flags, ...e.values].join(' ');

const wire = (a: Point, b: Point) => elm('w', a, b);
function ground(a: Point, direction: 'down' | 'left' | 'right' = 'down'): Elm {
  const [dx, dy] = { down: [0, 16], left: [-16, 0], right: [16, 0] }[direction];
  return elm('g', a, [a[0] + dx!, a[1] + dy!], 0, [], 'ground');
}
const label = (a: Point, b: Point, text: string) => elm('207', a, b, 0, [text], `label:${text}`);
const source = (neg: Point, pos: Point, volts: number, name: string) => elm('v', neg, pos, SHOW_VOLTAGE, ['0', '40', num(volts), '0', '0', '0.5'], name);
const gate = (neg: Point, pos: Point, fs: number, D: number) => elm('v', neg, pos, 0, ['2', num(fs), num(GATE_V), num(GATE_V), '0', num(D)], 'Vgate');
const diode = (anode: Point, cathode: Point, name: string) => elm('d', anode, cathode, 2, [DIODE_MODEL], name);
const inductor = (a: Point, b: Point, L: number, name: string) => elm('l', a, b, BACK_EULER, [num(L), '0', '0', '0'], name);
const capacitor = (a: Point, b: Point, C: number) => elm('c', a, b, 0, [num(C), '0', '0'], 'C1');
const resistor = (a: Point, b: Point, R: number) => elm('r', a, b, 0, [num(R)], 'R1');

function elements(p: FalstadParams): Elm[] {
  const t = p.topology;
  const { fs, D } = p;
  const top = 176;
  const bottom = 336;
  const sw = (a: Point, b: Point) => elm('159', a, b, 0, [num(p.Ron ?? R_ON), num(R_OFF), num(GATE_V)], 'S1');
  const switchStage = (x: number, drainY: number): Elm[] => {
    const b = drainY + 128;
    const mid = drainY + 64;
    return [
      sw([x, drainY], [x, b]),
      ground([x, b]),
      gate([x - 48, b], [x - 48, mid], fs, D),
      ground([x - 48, b]),
      wire([x - 48, mid], [x - 16, mid]),
      diode([x - 160, b], [x - 160, drainY], 'DB'),
      ground([x - 160, b]),
      wire([x - 160, drainY], [x, drainY]),
      label([x - 160, drainY], [x - 208, drainY], 'drain'),
    ];
  };
  const outputStage = (x: number, y: number): Elm[] => [
    capacitor([x, y], [x, bottom], p.C),
    ground([x, bottom]),
    wire([x, y], [x + 80, y]),
    resistor([x + 80, y], [x + 80, bottom], p.R),
    ground([x + 80, bottom]),
    label([x + 80, y], [x + 128, y], 'vout'),
  ];
  const e: Elm[] = [source([80, bottom], [80, top], p.Vg, 'V1'), ground([80, bottom])];
  if (t === 'buck' || t === 'buckboost') {
    e.push(
      wire([80, top], [176, top]),
      sw([176, top], [240, top]),
      wire([240, top], [240, 128]),
      diode([240, 128], [176, 128], 'DB'),
      wire([176, 128], [176, top]),
      gate([208, 272], [208, 192], fs, D),
      ground([208, 272]),
      wire([240, top], [288, top]),
    );
    if (t === 'buck') e.push(diode([288, bottom], [288, top], 'D1'), ground([288, bottom]), inductor([288, top], [384, top], p.L, 'L1'));
    else e.push(inductor([288, top], [288, bottom], p.L, 'L1'), ground([288, bottom]), diode([384, top], [288, top], 'D1'));
    e.push(label([288, top], [288, 128], 'sw'), ...outputStage(384, top));
  } else if (t === 'boost') {
    e.push(
      inductor([80, top], [208, top], p.L, 'L1'),
      wire([208, top], [256, top]),
      sw([256, bottom], [256, top]),
      ground([256, bottom]),
      gate([304, bottom], [304, 256], fs, D),
      ground([304, bottom]),
      wire([304, 256], [272, 256]),
      diode([208, bottom], [208, top], 'DB'),
      ground([208, bottom]),
      label([208, top], [208, 128], 'sw'),
      diode([256, top], [384, top], 'D1'),
      ...outputStage(384, top),
    );
  } else if (t === 'flyback') {
    e.push(
      wire([80, top], [352, top]),
      elm('T', [352, top], [416, top + 64], BACK_EULER | REVERSE, [num(p.Lm!), num(p.n!), '0', '0', num(COUPLING)], 'Tx'),
      ...switchStage(352, 240),
      ground([416, 240], 'right'),
      diode([416, top], [512, top], 'D1'),
      ...outputStage(512, top),
    );
  } else {
    e.push(
      label([80, top], [80, 128], 'vin'),
      wire([80, top], [352, top]),
      elm('406', [352, top], [416, top], BACK_EULER, [num(p.Lm!), num(COUPLING), `1:${num(p.n!)},${num(p.nr!)}`, '3', '0', '0', '0'], 'Tx'),
      ...switchStage(352, 256),
      ground([416, 208], 'right'),
      ground([416, 224], 'right'),
      diode([416, 256], [416, 320], 'D3'),
      label([416, 320], [416, 368], 'vin'),
      diode([416, top], [512, top], 'D1'),
      diode([512, bottom], [512, top], 'D2'),
      ground([512, bottom]),
      inductor([512, top], [608, top], p.L, 'L1'),
      ...outputStage(608, top),
    );
  }
  return e;
}

/** The scopes along the bottom: the inductor's current (the flyback's switch current), the switch node or drain, the output. */
function scopes(t: sim.Topology, elms: Elm[]): string[] {
  const index = (name: string) => elms.findIndex((x) => x.name === name);
  const node = t === 'flyback' || t === 'forward' ? 'label:drain' : 'label:sw';
  const current = t === 'flyback' ? 'S1' : 'L1';
  const speed = 8;
  return [`o ${index(current)} ${speed} 0 ${1 | 512 | 8192} 1 1 0`, `o ${index(node)} ${speed} 0 ${2 | 512 | 8192} 1 1 1`, `o ${index('R1')} ${speed} 0 ${2 | 512 | 8192} 1 1 2`];
}

/** The current bar's position that moves the dots about DOT_PX pixels a frame at the load current (A). */
export function currentBar(load: number): number {
  const c = 3.5 * (Math.log(DOT_PX / (1.7 * 16 * Math.abs(load))) + 14.2);
  return Math.max(1, Math.min(100, Math.round(c)));
}

/** The circuit as CircuitJS1 text (File > Import From Text). */
export function falstadText(p: FalstadParams, start: FalstadStart, opts: { speed?: number; bar?: number } = {}): string {
  const elms = elements(p);
  for (const e of elms) {
    // the capacitor from the output to ground; the inductor; the flyback's primary (its first post to its third)
    if (e.kind === 'c') e.values[1] = e.values[2] = num(six(start.vOut));
    else if (e.kind === 'l') e.values[1] = e.values[2] = num(six(start.iL));
    else if (e.kind === 'T') e.values[2] = num(six(start.iM));
  }
  const Ts = 1 / p.fs;
  const bar = opts.bar ?? currentBar(start.vOut / p.R);
  const lines = [`$ 1 ${num(Ts / STEPS)} ${num(opts.speed ?? DISPLAY_SPEED)} ${bar} ${num(Math.max(p.Vg, 1))} 50 5e-11`, DIODE_LINE];
  lines.push(...elms.map(line), ...scopes(p.topology, elms));
  return `${lines.join('\n')}\n`;
}

/** A link that opens the circuit on falstad.com. */
export function falstadLink(text: string): string {
  return `${FALSTAD_APP}?ctz=${compressToEncodedURIComponent(text)}`;
}
