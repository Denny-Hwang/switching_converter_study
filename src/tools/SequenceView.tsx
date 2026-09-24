/**
 * The simulator's operating modes (docs/BUILD_SPEC.md section 5, "Simulate";
 * the maintainer's request for a paper-style, mode-by-mode explanation):
 * - a strip of the period's modes, each a button, as wide as it lasts;
 * - the circuit in the selected mode: the branches that carry current in it
 *   coloured, an arrow in the direction the current flows (two heads when it
 *   reverses within the mode), the switch drawn closed or open, each
 *   element's name and its state next to it;
 * - what happens in the mode, and a table of every element's state, current
 *   and voltage over it.
 * Every state and arrow comes from pe-core's modes(), elementStates() and
 * branchFlow(), which read the simulated waveforms through the element
 * currents of the drawn circuit (sim/schematic.ts, checked by Kirchhoff's
 * current law at every node in the tests); where everything is drawn comes
 * from lib/seqlayout.ts, whose test checks that nothing overlaps.
 */
import { useMemo, type ReactNode } from 'react';
import { sim } from 'pe-core';
import { fmtValue } from '../lib/format';
import type { PlotTheme } from '../lib/plot';
import { FONT, U, layoutCircuit, textWidth, wireSegments, type BranchLayout, type P } from '../lib/seqlayout';
import { descKey, elementKey, fill, kindKey, stateKey, type SeqText } from '../i18n/sequence';
import { Rich } from './ToolUi';

type SimResult = sim.SimResult;
type OperatingMode = sim.OperatingMode;
type ElementInMode = sim.ElementInMode;
type Schematic = sim.Schematic;
type BranchFlow = sim.BranchFlow;

export type { SeqText };

interface Props {
  result: SimResult;
  /** The period's modes (pe-core's modes(result)). */
  modes: OperatingMode[];
  text: SeqText;
  selected: number;
  onSelect: (k: number) => void;
  theme: PlotTheme;
}

export default function SequenceView({ result, modes, text, selected, onSelect, theme }: Props) {
  const s = useMemo(() => sim.schematic(result.params), [result]);
  const scale = useMemo(() => sim.currentScale(result, s), [result, s]);
  const k = Math.min(Math.max(selected, 0), modes.length - 1);
  const mode = modes[k];
  const states = useMemo(() => (mode ? sim.elementStates(result, mode, s, scale) : []), [result, mode, s, scale]);
  const flow = useMemo(() => (mode ? sim.branchFlow(result, mode, s, scale) : new Map<string, BranchFlow>()), [result, mode, s, scale]);
  if (!mode) return null;
  const topo = result.params.topology;
  const Ts = 1 / result.params.fs;
  const byId = new Map(states.map((e) => [e.id, e]));
  const t = (x: number) => fmtValue(x, 's', 3);
  // a current below the period's counting threshold is shown as zero
  const eps = sim.NONE * scale;
  return (
    <section className="pe-seq" aria-labelledby="pe-seq-title">
      <h3 id="pe-seq-title">{text.title}</h3>
      <p className="pe-tool__hint">
        <Rich text={text.intro!} />
      </p>
      <div className="pe-seq__strip" role="group" aria-label={text.title}>
        {modes.map((m, j) => (
          <button
            key={m.index}
            type="button"
            className="pe-seq__mode"
            aria-pressed={j === k}
            onClick={() => onSelect(j)}
            style={{ flexGrow: Math.max((m.t1 - m.t0) / Ts, 0.06) }}
          >
            <strong>{fill(text.mode!, { k: m.index })}</strong>
            <span>{text[kindKey(topo, m.kind)]}</span>
            <span className="pe-seq__dt">{t(m.t1 - m.t0)}</span>
          </button>
        ))}
      </div>
      <div className="pe-seq__body">
        <div className="pe-seq__circuit">
          <Circuit s={s} flow={flow} states={byId} text={text} theme={theme} k={mode.index} />
        </div>
        <div className="pe-seq__text">
          <h4>{fill(text.modeRange!, { k: mode.index, t0: t(mode.t0), t1: t(mode.t1), dt: t(mode.t1 - mode.t0) })}</h4>
          <p>
            <Rich text={text[descKey(topo, mode.kind, text)] ?? ''} />
          </p>
        </div>
      </div>
      <div className="pe-scroll">
        <table className="pe-sim__table pe-seq__table">
          <thead>
            <tr>
              <th scope="col">{text.element}</th>
              <th scope="col">{text.state}</th>
              <th scope="col">{text.current}</th>
              <th scope="col">{text.voltage}</th>
            </tr>
          </thead>
          <tbody>
            {states.map((e) => {
              const still = Math.max(Math.abs(e.min), Math.abs(e.max)) <= eps;
              return (
                <tr key={e.id} className={still ? 'pe-seq__idle' : undefined}>
                  <th scope="row">
                    <Rich text={text[elementKey(topo, e.id)] ?? e.id} />
                  </th>
                  <td>
                    {text[stateKey(e.kind, e.state, 'st')]}
                    {e.tSign !== undefined && e.signChanges === 1 && <span className="pe-field__meaning"> ({fill(text.reverses!, { t: t(e.tSign) })})</span>}
                  </td>
                  <td>{still ? '0' : span(e.i0, e.i1, e.avg, 'A', eps)}</td>
                  <td>{e.v0 === undefined || e.v1 === undefined ? '' : span(e.v0, e.v1, e.vAvg!, 'V', 1e-9 * Math.max(Math.abs(e.v0), Math.abs(e.v1), 1))}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/** A quantity's start, end and average over the mode, with values within `zero` of zero shown as zero. */
function span(a: number, b: number, avg: number, unit: string, zero: number): string {
  const f = (x: number) => fmtValue(Math.abs(x) <= zero ? 0 : x, unit, 3);
  return `${f(a)} → ${f(b)} (${f(avg)})`;
}

// ---------------------------------------------------------------------------
// the circuit
// ---------------------------------------------------------------------------

interface CircuitProps {
  s: Schematic;
  flow: Map<string, BranchFlow>;
  states: Map<string, ElementInMode>;
  text: SeqText;
  theme: PlotTheme;
  /** The mode's number, for the drawing's accessible name. */
  k: number;
}

function Circuit({ s, flow, states, text, theme, k }: CircuitProps) {
  const l = useMemo(
    () =>
      layoutCircuit(s, (b) => {
        const f = flow.get(b.id);
        const st = states.get(b.id);
        return {
          state: b.kind === 'wire' || !st ? undefined : (text[stateKey(st.kind, st.state, 'short')] ?? ''),
          sign: f?.active ? f.sign : 0,
          reverses: !!(f?.active && f.reverses),
        };
      }),
    [s, flow, states, text],
  );
  const active = theme.colors[3]!;
  const idle = theme.line;
  const first = textWidth(text.legendActive!, FONT.legend);
  return (
    <svg
      viewBox={`0 0 ${l.width.toFixed(1)} ${l.height.toFixed(1)}`}
      width="100%"
      role="img"
      aria-label={fill(text.diagram!, { k })}
      className="pe-seq__svg"
      style={{ maxWidth: `${Math.ceil(l.width)}px` }}
    >
      {l.cores.map((c, j) => (
        <g key={`core${j}`} stroke={theme.text} strokeWidth={1.5}>
          <line x1={c.x - 3} y1={c.y1} x2={c.x - 3} y2={c.y2} />
          <line x1={c.x + 3} y1={c.y1} x2={c.x + 3} y2={c.y2} />
        </g>
      ))}
      {l.branches.map((bl) => {
        const on = !!flow.get(bl.b.id)?.active;
        return <Branch key={bl.b.id} bl={bl} on={on} state={states.get(bl.b.id)} color={on ? active : idle} theme={theme} active={active} />;
      })}
      {l.dots.map((d, j) => (
        <circle key={`dot${j}`} cx={d[0]} cy={d[1]} r={3.2} fill={theme.text} />
      ))}
      <g fontSize={FONT.legend} fill={theme.muted} transform={`translate(8 ${l.legendY.toFixed(1)})`}>
        <line x1={0} y1={-4} x2={18} y2={-4} stroke={active} strokeWidth={2.6} />
        <text x={24} y={0}>
          {text.legendActive}
        </text>
        <line x1={48 + first} y1={-4} x2={66 + first} y2={-4} stroke={idle} strokeWidth={1.3} />
        <text x={72 + first} y={0}>
          {text.legendIdle}
        </text>
      </g>
    </svg>
  );
}

interface BranchProps {
  bl: BranchLayout;
  on: boolean;
  state?: ElementInMode;
  color: string;
  theme: PlotTheme;
  active: string;
}

/** One branch: its wire (with a gap for its symbol), its symbol, its current's arrow and its label. */
function Branch({ bl, on, state, color, theme, active }: BranchProps) {
  const width = on ? 2.6 : 1.3;
  const segs = wireSegments(bl)
    .map(([p, q]) => `M${p[0].toFixed(1)},${p[1].toFixed(1)}L${q[0].toFixed(1)},${q[1].toFixed(1)}`)
    .join('');
  const lab = bl.label;
  return (
    <g>
      <path d={segs} stroke={color} strokeWidth={width} fill="none" strokeLinecap="round" />
      {bl.symbol && symbolFor(bl, state, color, width, active, theme.muted)}
      {bl.arrow && <Arrow at={bl.arrow.at} dir={bl.arrow.dir} both={bl.arrow.both} color={color} />}
      {lab && (
        <g className="pe-seq__label" data-box={[lab.box.x0, lab.box.y0, lab.box.x1, lab.box.y1].map((x) => x.toFixed(1)).join(',')}>
          <text x={lab.x} y={lab.nameY} textAnchor={lab.anchor} fontSize={FONT.name} fill={theme.text}>
            {lab.name.map((part, j) => (
              <tspan key={j}>
                {j > 0 && <tspan fontStyle="normal">, </tspan>}
                <tspan fontStyle="italic">{part.main}</tspan>
                {part.sub && (
                  <tspan dy={4} fontSize={FONT.sub}>
                    {part.sub}
                  </tspan>
                )}
                {part.sub && <tspan dy={-4} />}
              </tspan>
            ))}
          </text>
          {lab.states.map((st, j) => (
            <text key={j} x={lab.x} y={st.y} textAnchor={lab.anchor} fontSize={FONT.state} fill={on ? active : theme.muted}>
              {st.text}
            </text>
          ))}
        </g>
      )}
    </g>
  );
}

function Arrow({ at, dir, both, color }: { at: P; dir: P; both: boolean; color: string }) {
  // a head: its tip `tip` px from the centre along dir, its base at `base` px, 0.09 U either side
  const head = (sgn: number, tip: number, base: number) => {
    const d: P = [dir[0] * sgn, dir[1] * sgn];
    const n: P = [-d[1], d[0]];
    const w = 0.09 * U;
    const pts = [
      [at[0] + d[0] * tip, at[1] + d[1] * tip],
      [at[0] + d[0] * base + n[0] * w, at[1] + d[1] * base + n[1] * w],
      [at[0] + d[0] * base - n[0] * w, at[1] + d[1] * base - n[1] * w],
    ];
    return <polygon points={pts.map((q) => q.map((x) => x.toFixed(1)).join(',')).join(' ')} fill={color} />;
  };
  if (!both) return head(1, 0.12 * U, -0.1 * U);
  return (
    <g>
      {head(1, 0.17 * U, 0.02 * U)}
      {head(-1, 0.17 * U, 0.02 * U)}
    </g>
  );
}

/**
 * An element's symbol in its run's frame: u along the run (towards the
 * branch's `to`), w across it (px), w > 0 on the side of v = d turned a
 * quarter clockwise on screen, as in the layout.
 */
function symbolFor(bl: BranchLayout, state: ElementInMode | undefined, color: string, width: number, active: string, muted: string): ReactNode {
  const { c, d, h, labelSide, bulgeSide, b } = bl;
  const v: P = [-d[1], d[0]];
  const pt = (u: number, w: number): P => [c[0] + d[0] * u + v[0] * w, c[1] + d[1] * u + v[1] * w];
  const ps = (u: number, w: number): string =>
    pt(u, w)
      .map((x) => x.toFixed(1))
      .join(',');
  const stroke = { stroke: color, strokeWidth: width, fill: 'none', strokeLinejoin: 'round' as const, strokeLinecap: 'round' as const };
  const zigzag = (u0: number, u1: number, amp: number, n = 6) => {
    let path = `M${ps(u0, 0)}`;
    for (let j = 1; j < n; j++) path += `L${ps(u0 + ((u1 - u0) * j) / n, j % 2 ? -amp : amp)}`;
    return `${path}L${ps(u1, 0)}`;
  };
  switch (b.kind) {
    case 'resistor':
      return <path d={zigzag(-h, h, 0.12 * U)} {...stroke} />;
    case 'capacitor': {
      const g = 0.07 * U;
      return (
        <g {...stroke}>
          <path d={`M${ps(-h, 0)}L${ps(-g, 0)}M${ps(g, 0)}L${ps(h, 0)}`} />
          <path d={`M${ps(-g, -0.2 * U)}L${ps(-g, 0.2 * U)}M${ps(g, -0.2 * U)}L${ps(g, 0.2 * U)}`} strokeWidth={width + 0.8} />
        </g>
      );
    }
    case 'inductor':
    case 'winding': {
      // four turns, bulging to bulgeSide
      const n = 4;
      const r = h / n;
      const w = bulgeSide * 1.6 * r;
      let path = `M${ps(-h, 0)}`;
      for (let j = 0; j < n; j++) {
        const u0 = -h + 2 * r * j;
        path += `Q${ps(u0, w)} ${ps(u0 + r, w)}Q${ps(u0 + 2 * r, w)} ${ps(u0 + 2 * r, 0)}`;
      }
      // a winding's dot at its dotted end, on the side away from its turns
      const dp = b.kind === 'winding' && b.dot ? pt((b.dot === 'from' ? -1 : 1) * (h - 0.06 * U), -bulgeSide * 0.2 * U) : undefined;
      return (
        <g>
          <path d={path} {...stroke} />
          {dp && <circle cx={dp[0]} cy={dp[1]} r={3.5} fill={color} />}
        </g>
      );
    }
    case 'diode': {
      // the anode at `from`: the triangle points along the run
      const a = 0.14 * U;
      return (
        <g>
          <path d={`M${ps(-h, 0)}L${ps(-a, 0)}M${ps(a, 0)}L${ps(h, 0)}`} {...stroke} />
          <polygon points={`${ps(-a, -0.16 * U)} ${ps(-a, 0.16 * U)} ${ps(a, 0)}`} fill={width > 2 ? color : 'none'} stroke={color} strokeWidth={width} strokeLinejoin="round" />
          <path d={`M${ps(a, -0.17 * U)}L${ps(a, 0.17 * U)}`} {...stroke} />
        </g>
      );
    }
    case 'switch': {
      // drawn closed while its gate is on; the blade coloured when the channel carries the current,
      // the body diode when it does
      const closed = state?.state === 'on' || state?.state === 'onBodyDiode';
      const bd = state?.state === 'bodyDiode' || state?.state === 'onBodyDiode';
      const bdColor = bd ? active : muted;
      const bladeColor = bd ? muted : color;
      const k = 0.2 * U;
      const [l0, l1] = [pt(-k, 0), pt(k, 0)];
      // the blade opens towards the label; the body diode, across the switch, on the other side
      const wb = bulgeSide * 0.36 * U;
      const e = 0.1 * U;
      return (
        <g>
          <path d={`M${ps(-h, 0)}L${ps(-k, 0)}M${ps(k, 0)}L${ps(h, 0)}`} {...stroke} />
          <circle cx={l0[0]} cy={l0[1]} r={2.6} fill={color} />
          <circle cx={l1[0]} cy={l1[1]} r={2.6} fill={color} />
          <path d={closed ? `M${ps(-k, 0)}L${ps(k, 0)}` : `M${ps(-k, 0)}L${ps(0.7 * k, labelSide * k)}`} {...stroke} stroke={bladeColor} strokeWidth={bd ? 1.3 : width} />
          <g stroke={bdColor} strokeWidth={bd ? 2.2 : 1} fill="none" strokeLinejoin="round">
            <path d={`M${ps(-0.28 * U, 0)}L${ps(-0.28 * U, wb)}L${ps(-e, wb)}M${ps(e, wb)}L${ps(0.28 * U, wb)}L${ps(0.28 * U, 0)}`} />
            {/* anti-parallel: it conducts from the switch's `to` end to its `from` end */}
            <polygon points={`${ps(e, wb - e)} ${ps(e, wb + e)} ${ps(-e, wb)}`} fill={bd ? bdColor : 'none'} />
            <path d={`M${ps(-e, wb - e)}L${ps(-e, wb + e)}`} />
          </g>
        </g>
      );
    }
    case 'vsource': {
      const plusU = b.plus === 'from' ? -1 : 1;
      const r = 0.27 * U;
      const pp = pt(0.13 * U * plusU, 0);
      const mm = pt(-0.13 * U * plusU, 0);
      return (
        <g>
          <path d={`M${ps(-h, 0)}L${ps(-r, 0)}M${ps(r, 0)}L${ps(h, 0)}`} {...stroke} />
          <circle cx={c[0]} cy={c[1]} r={r} {...stroke} />
          <text x={pp[0]} y={pp[1] + 4} textAnchor="middle" fontSize={12} fill={color}>
            +
          </text>
          <text x={mm[0]} y={mm[1] + 4} textAnchor="middle" fontSize={12} fill={color}>
            −
          </text>
        </g>
      );
    }
    case 'battery': {
      // V_b behind R_b: the cell (its long plate at the positive terminal, `from`), then the resistance
      const long = -0.2 * U;
      const short = -0.08 * U;
      return (
        <g {...stroke}>
          <path d={`M${ps(-h, 0)}L${ps(long, 0)}M${ps(short, 0)}L${ps(0.02 * U, 0)}`} />
          <path d={`M${ps(long, -0.22 * U)}L${ps(long, 0.22 * U)}`} />
          <path d={`M${ps(short, -0.11 * U)}L${ps(short, 0.11 * U)}`} strokeWidth={width + 1.6} />
          <path d={zigzag(0.02 * U, h, 0.1 * U, 4)} />
        </g>
      );
    }
    case 'fixed': {
      // an ideal voltage: the cell alone, its long plate at the positive terminal (`from`)
      const g = 0.07 * U;
      return (
        <g {...stroke}>
          <path d={`M${ps(-h, 0)}L${ps(-g, 0)}M${ps(g, 0)}L${ps(h, 0)}`} />
          <path d={`M${ps(-g, -0.22 * U)}L${ps(-g, 0.22 * U)}`} />
          <path d={`M${ps(g, -0.11 * U)}L${ps(g, 0.11 * U)}`} strokeWidth={width + 1.6} />
        </g>
      );
    }
    default:
      return null;
  }
}
