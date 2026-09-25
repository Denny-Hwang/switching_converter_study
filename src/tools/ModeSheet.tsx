/**
 * Every operating mode of one steady period at once, the way a converter
 * paper lays them out: the key waveforms over the period with the modes'
 * boundaries t_0, t_1, ... marked, then the circuit of each mode, "(a) Mode 1"
 * to the last, with the branches that carry current in colour and a line on
 * what happens. It draws nothing interactive, so the page can also render it
 * at build time (components/ModeSheet.astro) as a static figure of an
 * example, and the simulator shows it for whatever values are in its form.
 * The waveforms are the simulated period's own samples; the circuits and
 * descriptions are SequenceView's (modeParts, Circuit).
 */
import type { ReactNode } from 'react';
import { sim } from 'pe-core';
import { fmtValue } from '../lib/format';
import type { PlotTheme } from '../lib/plot';
import { fill, kindKey, type SeqText } from '../i18n/sequence';
import { Circuit, modeParts, timeIn } from './SequenceView';
import { Rich } from './ToolUi';

type SimResult = sim.SimResult;
type OperatingMode = sim.OperatingMode;

interface Props {
  result: SimResult;
  /** The period's modes (pe-core's modes(result)). */
  modes: OperatingMode[];
  text: SeqText;
  theme: PlotTheme;
}

/** A waveform row: the series it draws, its symbol (base, subscript), and its unit ('' for the gate). */
export interface SheetRow {
  key: string;
  base: string;
  sub: string;
  unit: 'A' | 'V' | '';
}

/**
 * The key waveforms of each topology, top to bottom as papers draw them: the
 * gate, the inductor's current (the flyback's magnetizing current), the
 * switch's and the diodes' currents, the switch's voltage and the
 * inductor's voltage. The forward converter adds its magnetizing current and
 * draws both output diodes; its reset current shows in i_M.
 */
export function sheetRows(topology: sim.Topology): SheetRow[] {
  const gate: SheetRow = { key: 'gate', base: 'v', sub: 'GS', unit: '' };
  const vDS: SheetRow = { key: 'v_sw', base: 'v', sub: 'DS', unit: 'V' };
  const iS: SheetRow = { key: 'i_sw', base: 'i', sub: 'S', unit: 'A' };
  if (topology === 'forward') {
    return [gate, { key: 'i_L', base: 'i', sub: 'L', unit: 'A' }, { key: 'i_M', base: 'i', sub: 'M', unit: 'A' }, iS, { key: 'i_D1', base: 'i', sub: 'D1', unit: 'A' }, { key: 'i_D2', base: 'i', sub: 'D2', unit: 'A' }, vDS];
  }
  const L = topology === 'flyback' ? 'LM' : 'L';
  return [gate, { key: 'i_L', base: 'i', sub: L, unit: 'A' }, iS, { key: 'i_D', base: 'i', sub: 'D', unit: 'A' }, vDS, { key: 'v_L', base: 'v', sub: L, unit: 'V' }];
}

/** The mode's letter in the sheet: (a), (b), ... */
export const letter = (k: number) => String.fromCharCode(97 + k);

export default function ModeSheet({ result, modes, text, theme }: Props) {
  if (!modes.length) return null;
  const s = sim.schematic(result.params);
  const peaks = sim.branchScales(result, s);
  const parts = modes.map((_, k) => modeParts(result, s, peaks, modes, k, text));
  const topo = result.params.topology;
  const dt = (m: OperatingMode) => fmtValue(m.t1 - m.t0, 's', 3);
  const active = theme.colors[3]!;
  return (
    <div className="pe-sheet">
      <div className="pe-sheet__scroll">
        <KeyWaveforms result={result} modes={modes} text={text} theme={theme} />
      </div>
      <p className="pe-sheet__legend">
        <svg width="18" height="10" aria-hidden="true">
          <line x1={0} y1={5} x2={18} y2={5} stroke={active} strokeWidth={2.6} />
        </svg>{' '}
        {text.legendActive}
        {'\u2003'}
        <svg width="18" height="10" aria-hidden="true">
          <line x1={0} y1={5} x2={18} y2={5} stroke={theme.muted} strokeWidth={1.3} />
        </svg>{' '}
        {text.legendIdle}
      </p>
      <div className={topo === 'forward' ? 'pe-sheet__grid pe-sheet__grid--wide' : 'pe-sheet__grid'}>
        {parts.map(({ mode, flow, byId, description }, k) => (
          <figure key={mode.index} className="pe-sheet__mode">
            <figcaption>
              <strong>
                ({letter(k)}) {fill(text.mode!, { k: mode.index })}
              </strong>{' '}
              {text[kindKey(topo, mode.kind)]}
              <span className="pe-sheet__range">
                {' '}
                <Rich text={fill(text.sheetRange!, { a: String(k), b: String(k + 1), t0: timeIn(mode.t0, mode), t1: timeIn(mode.t1, mode), dt: dt(mode) })} />
              </span>
            </figcaption>
            <Circuit s={s} flow={flow} states={byId} text={text} theme={theme} k={mode.index} legend={false} />
            <p className="pe-sheet__desc">
              <Rich text={description} />
            </p>
          </figure>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// the key waveforms
// ---------------------------------------------------------------------------

const W = 720;
const LEFT = 58;
const RIGHT = 78;
const TOP = 24;
const ROW = 50;
const GAP = 12;
const BOTTOM = 30;

function Symbol({ base, sub, x, y, anchor = 'end', size = 15 }: { base: string; sub: string; x: number; y: number; anchor?: 'start' | 'end' | 'middle'; size?: number }) {
  return (
    <text x={x} y={y} textAnchor={anchor} fontSize={size} fontStyle="italic">
      {base}
      <tspan fontSize={size * 0.68} fontStyle="normal" dy={size * 0.3}>
        {sub}
      </tspan>
    </text>
  );
}

/** One steady period's samples, from t = 0, and the gate's level (1 while it is on) from the modes. */
function samples(result: SimResult, modes: OperatingMode[], key: string): { t: number[]; y: number[] } {
  const w = result.waveforms;
  const t0 = (w.t as number[])[0] ?? 0;
  const t = (w.t as number[]).map((x) => x - t0);
  if (key === 'gate') {
    const tt: number[] = [];
    const yy: number[] = [];
    for (const m of modes) {
      const g = m.gate ? 1 : 0;
      tt.push(m.t0, m.t1);
      yy.push(g, g);
    }
    return { t: tt, y: yy };
  }
  return { t, y: (w[key] as number[] | undefined) ?? [] };
}

function KeyWaveforms({ result, modes, text, theme }: Props) {
  const topo = result.params.topology;
  const rows = sheetRows(topo).filter((r) => r.key === 'gate' || Array.isArray(result.waveforms[r.key]));
  const Ts = 1 / result.params.fs;
  const plotW = W - LEFT - RIGHT;
  const H = TOP + rows.length * ROW + (rows.length - 1) * GAP + BOTTOM;
  const x = (t: number) => LEFT + (t / Ts) * plotW;
  const bottom = H - BOTTOM;
  // the boundaries: t_0 = 0 to t_N = T_s; a label only where it keeps 3 % of the period from the last one
  const bounds = [...modes.map((m) => m.t0), Ts];
  const labelled: number[] = [0];
  for (let j = 1; j < bounds.length; j++) {
    const last = labelled[labelled.length - 1]!;
    if (bounds[j]! - bounds[last]! >= 0.03 * Ts) labelled.push(j);
    else if (j === bounds.length - 1) {
      // t_N always: it takes the place of a label too close before it (never t_0's)
      if (last !== 0) labelled.pop();
      labelled.push(j);
    }
  }
  const out: ReactNode[] = [];
  // every other mode lightly shaded, so that each reads as a band
  modes.forEach((m, j) => {
    if (j % 2 === 1) out.push(<rect key={`band${j}`} x={x(m.t0)} y={TOP - 4} width={Math.max(x(m.t1) - x(m.t0), 0.5)} height={bottom - TOP + 4} fill="currentColor" opacity={0.06} />);
  });
  // the modes' names above, where they have room
  for (const m of modes) {
    if ((m.t1 - m.t0) / Ts < 0.045) continue;
    out.push(
      <text key={`m${m.index}`} x={(x(m.t0) + x(m.t1)) / 2} y={TOP - 9} textAnchor="middle" fontSize={11} fill={theme.muted}>
        {fill(text.modeShort!, { k: m.index })}
      </text>,
    );
  }
  rows.forEach((r, i) => {
    const top = TOP + i * (ROW + GAP);
    const { t, y } = samples(result, modes, r.key);
    let lo = Math.min(0, ...y);
    let hi = Math.max(0, ...y);
    if (hi - lo <= 0) hi = lo + 1;
    const pad = 0.1 * (hi - lo);
    lo -= pad;
    hi += pad;
    const yOf = (v: number) => top + ROW - ((v - lo) / (hi - lo)) * ROW;
    const color = theme.colors[i % theme.colors.length]!;
    let d = '';
    for (let j = 0; j < t.length; j++) d += `${j ? 'L' : 'M'}${x(t[j]!).toFixed(2)} ${yOf(y[j]!).toFixed(2)}`;
    out.push(<line key={`z${i}`} x1={LEFT} x2={LEFT + plotW} y1={yOf(0)} y2={yOf(0)} stroke={theme.line} strokeWidth={0.8} />);
    out.push(<path key={`p${i}`} d={d} fill="none" stroke={color} strokeWidth={1.8} strokeLinejoin="round" />);
    out.push(
      <g key={`s${i}`} fill={theme.text}>
        <Symbol base={r.base} sub={r.sub} x={LEFT - 10} y={top + ROW / 2 + 5} />
      </g>,
    );
    if (r.unit) {
      // the row's largest and smallest values, at its right
      const max = Math.max(...y);
      const min = Math.min(...y);
      const f = (v: number) => fmtValue(Math.abs(v) < 1e-9 * Math.max(Math.abs(max), Math.abs(min), 1e-30) ? 0 : v, r.unit, 3);
      out.push(
        <text key={`hi${i}`} x={LEFT + plotW + 6} y={yOf(max) + 4} fontSize={10.5} fill={theme.muted}>
          {f(max)}
        </text>,
      );
      if (Math.abs(yOf(min) - yOf(max)) >= 13) {
        out.push(
          <text key={`lo${i}`} x={LEFT + plotW + 6} y={yOf(min) + 4} fontSize={10.5} fill={theme.muted}>
            {f(min)}
          </text>,
        );
      }
    } else {
      out.push(
        <text key={`on${i}`} x={LEFT + plotW + 6} y={yOf(1) + 4} fontSize={10.5} fill={theme.muted}>
          {text.sheetOn}
        </text>,
      );
    }
  });
  // the boundaries through every row, and t_0 ... t_N under the last
  bounds.forEach((b, j) => {
    out.push(<line key={`b${j}`} x1={x(b)} x2={x(b)} y1={TOP - 4} y2={bottom + 4} stroke={theme.line} strokeWidth={0.8} strokeDasharray="3 3" />);
  });
  for (const j of labelled) {
    out.push(
      <g key={`t${j}`} fill={theme.text}>
        <Symbol base="t" sub={String(j)} x={x(bounds[j]!)} y={bottom + 20} anchor="middle" size={13} />
      </g>,
    );
  }
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={fill(text.sheetWaves!, { n: modes.length, Ts: fmtValue(Ts, 's', 3) })} className="pe-sheet__waves" style={{ maxWidth: `${W}px` }}>
      {out}
    </svg>
  );
}
