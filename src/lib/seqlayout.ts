/**
 * The drawing of the simulator's circuit for its operating modes
 * (tools/SequenceView.tsx): where every wire, element symbol, current arrow
 * and label goes, in pixels. It is computed apart from React so that a test
 * (seqlayout.test.ts) can check, for every topology, load, source and
 * language, that no label overlaps another label, a wire, a symbol or an
 * arrow, and no symbol another symbol or a wire it does not sit on.
 *
 * The circuit comes from pe-core's schematic() in grid units; the element's
 * symbol sits on the longest straight run of its branch; its name and its
 * state in the mode are drawn on the branch's `label` side (above a
 * horizontal element, right of a vertical one, unless the schematic says
 * otherwise); a current's arrow sits on the wire next to the symbol, in the
 * direction the current flows (two heads when it reverses within the mode).
 */
import type { sim } from 'pe-core';

type Schematic = sim.Schematic;
type SchematicBranch = sim.SchematicBranch;
type Side = sim.Side;

export type P = [number, number];

export interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** Grid unit (px), and a symbol's half length (grid units). */
export const U = 56;
export const H = 0.34;
/** Padding around the drawing, and the legend's height (px). */
const PAD = 8;
export const LEGEND = 26;

/** Text sizes (px) and line metrics: a name (with a subscript) and up to two lines of state below it. */
export const FONT = { name: 14, sub: 10, state: 10.5, legend: 11 } as const;
// (as the browser measures them: a name's box rises 14 px above its baseline, and its subscript
// hangs to 7 px below it, clear of the state line's box, which rises 10 px above its own)
const NAME_ASCENT = 14;
const NAME_H = 22;
const STATE_ASCENT = 9;
const STATE_H = 13;
/** Between a symbol and its label (px). */
const GAP = 7;
/** A state wider than this (px) is broken after its arrow onto two lines. */
const STATE_WRAP = 64;

/**
 * An estimate of a text's width (px), on the generous side of what browsers
 * draw with the site's sans-serif fonts (scripts/seq_check.mjs measures the
 * real one in Chromium, in CI).
 */
export function textWidth(s: string, size: number): number {
  let w = 0;
  for (const ch of s) {
    const c = ch.codePointAt(0)!;
    if ((c >= 0xac00 && c <= 0xd7a3) || (c >= 0x3130 && c <= 0x318f) || (c >= 0x1100 && c <= 0x11ff)) w += 1.1;
    else if (ch === '→' || ch === '↑' || ch === '↓') w += 1.0;
    else if (ch === ' ') w += 0.3;
    else if (/[A-Z]/.test(ch)) w += 0.72;
    else if (/[a-z0-9]/.test(ch)) w += 0.6;
    else w += 0.45;
  }
  return w * size;
}

/** An element's name as drawn: symbols with subscripts, joined by commas. */
export type Name = { main: string; sub?: string }[];

export const NAMES: Record<string, Name> = {
  S: [{ main: 'S' }],
  Cn: [{ main: 'C', sub: 'node' }],
  D: [{ main: 'D' }],
  L: [{ main: 'L' }],
  LM: [{ main: 'L', sub: 'M' }],
  W1: [{ main: 'N', sub: 'p' }],
  W2: [{ main: 'N', sub: 's' }],
  W3: [{ main: 'N', sub: 'r' }],
  D1: [{ main: 'D', sub: '1' }],
  D2: [{ main: 'D', sub: '2' }],
  D3: [{ main: 'D', sub: '3' }],
  C: [{ main: 'C' }],
  R: [{ main: 'R' }],
  B: [
    { main: 'V', sub: 'b' },
    { main: 'R', sub: 'b' },
  ],
  V: [{ main: 'V' }],
  Vg: [{ main: 'V', sub: 'g' }],
  Voc: [{ main: 'V', sub: 'oc' }],
  Rs: [{ main: 'R', sub: 's' }],
  Cbus: [{ main: 'C', sub: 'bus' }],
};

export function nameWidth(name: Name): number {
  // italic letters lean past their advance
  let w = 2;
  name.forEach((part, j) => {
    if (j > 0) w += textWidth(', ', FONT.name);
    w += textWidth(part.main, FONT.name) + (part.sub ? textWidth(part.sub, FONT.sub) + 1 : 0);
  });
  return w;
}

/** A state on one line, or broken after its arrow (or comma) onto two when it is long. */
export function stateLines(state: string): string[] {
  if (!state) return [];
  if (textWidth(state, FONT.state) <= STATE_WRAP) return [state];
  for (const sep of [' → ', ', ']) {
    const k = state.indexOf(sep);
    if (k >= 0) return [state.slice(0, k + sep.length - 1), state.slice(k + sep.length)];
  }
  return [state];
}

export interface LabelLayout {
  /** The anchor's x, and how the text lines up on it. */
  x: number;
  anchor: 'start' | 'middle' | 'end';
  name: Name;
  nameY: number;
  states: { text: string; y: number }[];
  box: Box;
}

export interface ArrowLayout {
  /** The arrow's centre, and the direction the current flows (a unit vector). */
  at: P;
  dir: P;
  /** The current reverses within the mode: heads both ways. */
  both: boolean;
  box: Box;
}

export interface BranchLayout {
  b: SchematicBranch;
  /** The branch's path (px), from `from` to `to`. */
  path: P[];
  /** The run with the symbol (index into the path's segments), its centre (px) and direction. */
  run: number;
  c: P;
  d: P;
  /** The symbol's half length (px). */
  h: number;
  /** The sides, in the run's frame (v = d turned a quarter clockwise on screen): +1 or -1. */
  labelSide: number;
  bulgeSide: number;
  symbol?: Box;
  label?: LabelLayout;
  arrow?: ArrowLayout;
}

export interface CircuitLayout {
  width: number;
  height: number;
  branches: BranchLayout[];
  /** Junctions of three or more branches (px). */
  dots: P[];
  cores: { x: number; y1: number; y2: number }[];
  /** The legend's baseline (px). */
  legendY: number;
}

/** What the drawing shows of a branch in the mode: its name and state, and its current's direction. */
export interface BranchView {
  state?: string;
  /** +1 or -1 along the branch (from -> to or back), 0 for no current. */
  sign: number;
  reverses: boolean;
}

const SIDE_VEC: Record<Side, P> = { above: [0, -1], below: [0, 1], left: [-1, 0], right: [1, 0] };

/** The symbol's extent across its run, towards v = +1 and v = -1 (grid units). */
function extent(kind: sim.ElementKind, labelSide: number, bulgeSide: number): [number, number] {
  const toward = (side: number, near: number, far: number): [number, number] => (side > 0 ? [far, near] : [near, far]);
  switch (kind) {
    case 'resistor':
      return [0.12, 0.12];
    case 'capacitor':
      return [0.2, 0.2];
    case 'inductor':
      return toward(bulgeSide, 0.02, 0.14);
    case 'winding':
      // the turns on the bulge side, the dot on the other
      return toward(bulgeSide, 0.26, 0.14);
    case 'diode':
      return [0.17, 0.17];
    case 'switch':
      // the open blade on the label's side, the body diode on the other
      return labelSide > 0 ? [0.22, 0.46] : [0.46, 0.22];
    case 'vsource':
      return [0.27, 0.27];
    case 'battery':
    case 'fixed':
      return [0.22, 0.22];
    default:
      return [0, 0];
  }
}

/** The side's sign in a run's frame, or 0 when the side is along the run. */
function sideSign(side: Side, d: P): number {
  const v: P = [-d[1], d[0]];
  const s = SIDE_VEC[side];
  const dot = v[0] * s[0] + v[1] * s[1];
  return Math.abs(dot) < 0.5 ? 0 : Math.sign(dot);
}

function boxAround(c: P, half: P): Box {
  return { x0: c[0] - half[0], y0: c[1] - half[1], x1: c[0] + half[0], y1: c[1] + half[1] };
}

/**
 * Lays out the circuit. `view` gives each branch's state text and current
 * direction in the mode (wires have no state).
 */
export function layoutCircuit(s: Schematic, view: (b: SchematicBranch) => BranchView): CircuitLayout {
  const node = new Map(s.nodes.map((n) => [n.id, n]));
  const grid = (q: [number, number]): P => [q[0] * U, q[1] * U];
  const out: BranchLayout[] = [];
  for (const b of s.branches) {
    const a0 = node.get(b.from)!;
    const z0 = node.get(b.to)!;
    const path: P[] = [grid([a0.x, a0.y]), ...(b.via ?? []).map(grid), grid([z0.x, z0.y])];
    // the longest straight run
    let run = 0;
    let len = 0;
    for (let j = 0; j + 1 < path.length; j++) {
      const l = Math.hypot(path[j + 1]![0] - path[j]![0], path[j + 1]![1] - path[j]![1]);
      if (l > len + 1e-9) {
        len = l;
        run = j;
      }
    }
    const a = path[run]!;
    const z = path[run + 1]!;
    const d: P = [(z[0] - a[0]) / len, (z[1] - a[1]) / len];
    const c: P = [(a[0] + z[0]) / 2, (a[1] + z[1]) / 2];
    const el = b.kind !== 'wire';
    const h = el ? Math.min(H * U, len / 2 - 3) : 0;
    const horizontal = Math.abs(d[0]) >= Math.abs(d[1]);
    const defaultSide: Side = horizontal ? 'above' : 'right';
    let labelSide = sideSign(b.label ?? defaultSide, d) || sideSign(defaultSide, d);
    if (!labelSide) labelSide = -1;
    const bulgeSide = b.bulge ? sideSign(b.bulge, d) || labelSide : b.kind === 'switch' ? -labelSide : labelSide;
    const v: P = [-d[1], d[0]];
    // the local frame: u along the run, w across it (px)
    const at = (u: number, w: number): P => [c[0] + d[0] * u + v[0] * w, c[1] + d[1] * u + v[1] * w];
    const lay: BranchLayout = { b, path, run, c, d, h, labelSide, bulgeSide };
    const bv = view(b);
    if (el) {
      const [ePlus, eMinus] = extent(b.kind, labelSide, bulgeSide);
      const p1 = at(-h, ePlus * U);
      const p2 = at(h, -eMinus * U);
      lay.symbol = { x0: Math.min(p1[0], p2[0]), y0: Math.min(p1[1], p2[1]), x1: Math.max(p1[0], p2[0]), y1: Math.max(p1[1], p2[1]) };
      // the label: the name, then the state's lines, beyond the symbol on the label's side
      const name = NAMES[b.element ?? b.id] ?? [{ main: b.id }];
      const lines = stateLines(bv.state ?? '');
      // (and a pixel either side: a glyph's ink may pass its advance)
      const w = Math.max(nameWidth(name), ...lines.map((t) => textWidth(t, FONT.state))) + 2;
      const hh = NAME_H + lines.length * STATE_H;
      const ext = (labelSide > 0 ? ePlus : eMinus) * U + GAP;
      // where the label's near edge meets the symbol, on screen
      const edge = at(0, labelSide * ext);
      const sv: P = [v[0] * labelSide, v[1] * labelSide];
      let box: Box;
      let anchor: LabelLayout['anchor'];
      let x: number;
      if (Math.abs(sv[0]) > 0.5) {
        // beside a vertical run: left or right, centred on the symbol
        const left = sv[0] < 0;
        box = left ? { x0: edge[0] - w, x1: edge[0], y0: c[1] - hh / 2, y1: c[1] + hh / 2 } : { x0: edge[0], x1: edge[0] + w, y0: c[1] - hh / 2, y1: c[1] + hh / 2 };
        anchor = left ? 'end' : 'start';
        x = left ? box.x1 - 1 : box.x0 + 1;
      } else {
        // above or below a horizontal run, centred on it
        const up = sv[1] < 0;
        box = up ? { x0: c[0] - w / 2, x1: c[0] + w / 2, y0: edge[1] - hh, y1: edge[1] } : { x0: c[0] - w / 2, x1: c[0] + w / 2, y0: edge[1], y1: edge[1] + hh };
        anchor = 'middle';
        x = c[0];
      }
      lay.label = {
        x,
        anchor,
        name,
        nameY: box.y0 + NAME_ASCENT,
        states: lines.map((text, j) => ({ text, y: box.y0 + NAME_H + STATE_ASCENT + j * STATE_H })),
        box,
      };
    }
    // the arrow
    if (bv.sign !== 0) {
      // one head, or two (back to back) for a current that reverses; clear of the symbol and the nodes
      const half: P = bv.reverses ? [0.17 * U, 0.09 * U] : [0.12 * U, 0.09 * U];
      const clear = 0.05 * U;
      const place = (): { at: P; dir: P } | undefined => {
        const dir: P = [d[0] * bv.sign, d[1] * bv.sign];
        if (el) {
          // on the lead after the symbol, in the current's direction
          const lead = len / 2 - h;
          if (lead >= 2 * half[0] + 2 * clear) return { at: at(bv.sign * (h + clear + half[0]), 0), dir };
          // or on the branch's longest other run; else none (the wires in series with it show the current)
          let best = -1;
          let bl = 0;
          for (let j = 0; j + 1 < path.length; j++) {
            if (j === run) continue;
            const l = Math.hypot(path[j + 1]![0] - path[j]![0], path[j + 1]![1] - path[j]![1]);
            if (l > bl) {
              bl = l;
              best = j;
            }
          }
          if (best < 0 || bl < 2 * half[0] + 2 * clear) return undefined;
          const q0 = path[best]!;
          const q1 = path[best + 1]!;
          const dd: P = [(q1[0] - q0[0]) / bl, (q1[1] - q0[1]) / bl];
          return { at: [(q0[0] + q1[0]) / 2, (q0[1] + q1[1]) / 2], dir: [dd[0] * bv.sign, dd[1] * bv.sign] };
        }
        if (len < 2 * half[0] + 2 * clear) return undefined;
        return { at: c, dir };
      };
      const pl = place();
      if (pl) {
        const hx = Math.abs(pl.dir[0]) > 0.5 ? half : ([half[1], half[0]] as P);
        lay.arrow = { at: pl.at, dir: pl.dir, both: bv.reverses, box: boxAround(pl.at, hx) };
      }
    }
    out.push(lay);
  }
  // junction dots
  const degree = new Map<string, number>();
  for (const b of s.branches) {
    degree.set(b.from, (degree.get(b.from) ?? 0) + 1);
    degree.set(b.to, (degree.get(b.to) ?? 0) + 1);
  }
  const dots = s.nodes.filter((n) => (degree.get(n.id) ?? 0) >= 3).map((n) => grid([n.x, n.y]));
  const cores = s.cores.map((c) => ({ x: c.x * U, y1: c.y1 * U, y2: c.y2 * U }));
  // the drawing's extent: everything drawn, then the padding and the legend
  const xs: number[] = [];
  const ys: number[] = [];
  const addBox = (bx?: Box) => {
    if (!bx) return;
    xs.push(bx.x0, bx.x1);
    ys.push(bx.y0, bx.y1);
  };
  for (const l of out) {
    for (const q of l.path) {
      xs.push(q[0]);
      ys.push(q[1]);
    }
    addBox(l.symbol);
    addBox(l.label?.box);
    addBox(l.arrow?.box);
  }
  const minX = Math.min(...xs) - PAD;
  const minY = Math.min(...ys) - PAD;
  const maxX = Math.max(...xs) + PAD;
  const maxY = Math.max(...ys) + PAD;
  // shift everything so the drawing starts at (0, 0)
  const sh = (q: P): P => [q[0] - minX, q[1] - minY];
  const shBox = (bx: Box): Box => ({ x0: bx.x0 - minX, y0: bx.y0 - minY, x1: bx.x1 - minX, y1: bx.y1 - minY });
  for (const l of out) {
    l.path = l.path.map(sh);
    l.c = sh(l.c);
    if (l.symbol) l.symbol = shBox(l.symbol);
    if (l.label) {
      l.label.x -= minX;
      l.label.nameY -= minY;
      l.label.states = l.label.states.map((st) => ({ ...st, y: st.y - minY }));
      l.label.box = shBox(l.label.box);
    }
    if (l.arrow) {
      l.arrow.at = sh(l.arrow.at);
      l.arrow.box = shBox(l.arrow.box);
    }
  }
  const height = maxY - minY + LEGEND;
  return {
    width: maxX - minX,
    height,
    branches: out,
    dots: dots.map(sh),
    cores: cores.map((c) => ({ x: c.x - minX, y1: c.y1 - minY, y2: c.y2 - minY })),
    legendY: height - 9,
  };
}

// ---------------------------------------------------------------------------
// the checks
// ---------------------------------------------------------------------------

function boxesMeet(a: Box, b: Box, pad = 0): boolean {
  return a.x0 < b.x1 + pad && b.x0 < a.x1 + pad && a.y0 < b.y1 + pad && b.y0 < a.y1 + pad;
}

/** Whether the segment p-q passes through the box (Liang-Barsky clipping). */
function segmentMeetsBox(p: P, q: P, b: Box): boolean {
  let t0 = 0;
  let t1 = 1;
  const dx = q[0] - p[0];
  const dy = q[1] - p[1];
  const edges: [number, number][] = [
    [-dx, p[0] - b.x0],
    [dx, b.x1 - p[0]],
    [-dy, p[1] - b.y0],
    [dy, b.y1 - p[1]],
  ];
  for (const [pp, qq] of edges) {
    if (pp === 0) {
      if (qq < 0) return false;
    } else {
      const r = qq / pp;
      if (pp < 0) t0 = Math.max(t0, r);
      else t1 = Math.min(t1, r);
      if (t0 > t1) return false;
    }
  }
  return true;
}

/** The wire segments of a branch, without the gap its symbol takes. */
export function wireSegments(l: BranchLayout): [P, P][] {
  const segs: [P, P][] = [];
  for (let j = 0; j + 1 < l.path.length; j++) {
    const p = l.path[j]!;
    const q = l.path[j + 1]!;
    if (l.symbol && j === l.run) {
      segs.push([p, [l.c[0] - l.d[0] * l.h, l.c[1] - l.d[1] * l.h]]);
      segs.push([[l.c[0] + l.d[0] * l.h, l.c[1] + l.d[1] * l.h], q]);
    } else {
      segs.push([p, q]);
    }
  }
  return segs;
}

/**
 * Everything that overlaps in a layout: labels with labels, wires, symbols,
 * arrows, cores and junctions; symbols with other symbols and with wires they
 * do not sit on; arrows with symbols and other arrows; anything outside the
 * drawing. An empty list is a clean drawing.
 */
export function collisions(l: CircuitLayout): string[] {
  const out: string[] = [];
  const bs = l.branches;
  const inside = (bx: Box) => bx.x0 >= 0 && bx.y0 >= 0 && bx.x1 <= l.width && bx.y1 <= l.height;
  for (const x of bs) {
    const id = x.b.id;
    if (x.label && !inside(x.label.box)) out.push(`label ${id} outside the drawing`);
    if (x.symbol && !inside(x.symbol)) out.push(`symbol ${id} outside the drawing`);
    if (x.label) {
      const lb = x.label.box;
      for (const y of bs) {
        if (y !== x && y.label && boxesMeet(lb, y.label.box, 3)) out.push(`label ${id} / label ${y.b.id}`);
        if (y.symbol && boxesMeet(lb, y.symbol, 2)) out.push(`label ${id} / symbol ${y.b.id}`);
        if (y.arrow && boxesMeet(lb, y.arrow.box, 2)) out.push(`label ${id} / arrow ${y.b.id}`);
        const grown = { x0: lb.x0 - 2, y0: lb.y0 - 2, x1: lb.x1 + 2, y1: lb.y1 + 2 };
        if (wireSegments(y).some(([p, q]) => segmentMeetsBox(p, q, grown))) out.push(`label ${id} / wire of ${y.b.id}`);
      }
      for (const c of l.cores) if (segmentMeetsBox([c.x, c.y1], [c.x, c.y2], { x0: lb.x0 - 6, y0: lb.y0, x1: lb.x1 + 6, y1: lb.y1 })) out.push(`label ${id} / core`);
      for (const dt of l.dots) if (boxesMeet(lb, boxAround(dt, [4, 4]))) out.push(`label ${id} / junction`);
    }
    if (x.symbol) {
      const sb = x.symbol;
      for (const y of bs) {
        if (y === x) continue;
        if (y.symbol && boxesMeet(sb, y.symbol, 2)) out.push(`symbol ${id} / symbol ${y.b.id}`);
        // a wire may end at the symbol's own nodes, but not cross it
        const shrunk = { x0: sb.x0 + 1, y0: sb.y0 + 1, x1: sb.x1 - 1, y1: sb.y1 - 1 };
        if (wireSegments(y).some(([p, q]) => segmentMeetsBox(p, q, shrunk))) out.push(`symbol ${id} / wire of ${y.b.id}`);
      }
      for (const c of l.cores) if (segmentMeetsBox([c.x, c.y1], [c.x, c.y2], { x0: sb.x0 - 6, y0: sb.y0, x1: sb.x1 + 6, y1: sb.y1 })) out.push(`symbol ${id} / core`);
    }
    if (x.arrow) {
      for (const y of bs) {
        if (y === x) continue;
        if (y.symbol && boxesMeet(x.arrow.box, y.symbol, 1)) out.push(`arrow ${id} / symbol ${y.b.id}`);
        if (y.arrow && boxesMeet(x.arrow.box, y.arrow.box, 1)) out.push(`arrow ${id} / arrow ${y.b.id}`);
      }
      if (x.symbol && boxesMeet(x.arrow.box, x.symbol, 1)) out.push(`arrow ${id} / its own symbol`);
    }
  }
  return out;
}
