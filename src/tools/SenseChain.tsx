/**
 * Sense chain (docs/BUILD_SPEC.md §5): a shunt, a current-output or
 * voltage-output sense amplifier, an R-C filter and an ADC, checked from
 * zero to the largest current. It gives the gain, the full-scale current and
 * what sets it, the output floor, the burden, the offset-equivalent current,
 * the pad error and the error at the smallest current, and the filter's
 * corner against the Nyquist frequency, and flags each violation. The
 * calculation is pe-core's senseChain(), whose physical relations are all
 * catalogue equations; each result names the equations it comes from. All
 * state lives in the URL hash.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { errorCurve, senseChain, transferCurve, type MonitorKind, type SenseResult, type SenseSpec, type SenseWarning } from 'pe-core';
import { isToolHash } from '../lib/hash';
import { fmtValue } from '../lib/format';
import { useStateHash } from '../lib/useStateHash';
import { PLOT_CONFIG, axis, baseLayout, logTicks, sub, usePlotTheme, type PlotTheme } from '../lib/plot';
import { Choices, FieldLabel, NumInput, Rich } from './ToolUi';
import { parseSI } from '../lib/siparse';

export interface SenseLabels {
  /** How values are entered: SI units, with or without a prefix (lib/siparse.ts). */
  siHint: string;
  kind: string;
  kinds: Record<MonitorKind, string>;
  presets: string;
  range: string;
  shunt: string;
  amplifier: Record<MonitorKind, string>;
  adc: string;
  optional: string;
  results: string;
  quantity: string;
  value: string;
  equation: string;
  gain: string;
  vout0: string;
  voutImax: string;
  voutHi: string;
  adcUse: string;
  ifs: string;
  limitAmp: string;
  limitAdc: string;
  ifloor: string;
  vsense: string;
  pshunt: string;
  ios: string;
  offsetShare: string;
  padError: string;
  errorAtImin: string;
  rfilt: string;
  fc: string;
  fN: string;
  gainAtNyquist: string;
  gainAtFsw: string;
  noFilter: string;
  transferChart: string;
  errorChart: string;
  current: string;
  output: string;
  relError: string;
  outputCurve: string;
  highCurve: string;
  lowCurve: string;
  voutMax: string;
  voutMin: string;
  vfs: string;
  imax: string;
  imin: string;
  offsetCurve: string;
  totalCurve: string;
  target: string;
  noError: string;
  /** Legend entry of the band below the output floor. */
  floorBand: string;
  invalid: string;
  share: string;
  plotHint: string;
  warnings: Record<SenseWarning, string>;
}

export interface SensePreset {
  id: string;
  label: string;
  kind: MonitorKind;
  values: Record<string, number>;
}

interface Props {
  locale: 'en' | 'ko';
  labels: SenseLabels;
  presets: SensePreset[];
  /** What each symbol means (i18n/symbols.ts). */
  symbols: Record<string, string>;
}

const KINDS: MonitorKind[] = ['current', 'voltage'];

type Group = 'range' | 'shunt' | MonitorKind | 'amp' | 'adc';
interface Field {
  key: string;
  label: string;
  unit: string;
  group: Group;
  /** May be zero. */
  zero?: boolean;
  /** May be left empty (the check is then skipped). */
  optional?: boolean;
}

export const FIELDS: Field[] = [
  { key: 'Imax', label: 'I_max', unit: 'A', group: 'range' },
  { key: 'Imin', label: 'I_min', unit: 'A', group: 'range' },
  { key: 'errMax', label: 'ε_max', unit: '1', group: 'range' },
  { key: 'Rsense', label: 'R_SENSE', unit: 'Ω', group: 'shunt' },
  { key: 'Rpad', label: 'R_pad', unit: 'Ω', group: 'shunt', zero: true },
  { key: 'Prating', label: 'P_rated', unit: 'W', group: 'shunt', optional: true },
  { key: 'VburdenMax', label: 'V_SENSE,max', unit: 'V', group: 'shunt', optional: true },
  { key: 'Rin', label: 'R_IN', unit: 'Ω', group: 'current' },
  { key: 'Rout', label: 'R_OUT', unit: 'Ω', group: 'current' },
  { key: 'G', label: 'G', unit: 'V/V', group: 'voltage' },
  { key: 'Vref', label: 'V_REF', unit: 'V', group: 'voltage', zero: true },
  { key: 'Vos', label: '|V_OS|', unit: 'V', group: 'amp', zero: true },
  { key: 'VoutMin', label: 'V_OUT,min', unit: 'V', group: 'amp', zero: true },
  { key: 'VoutMax', label: 'V_OUT,max', unit: 'V', group: 'amp' },
  { key: 'Rf', label: 'R_f', unit: 'Ω', group: 'adc', zero: true },
  { key: 'Cf', label: 'C_f', unit: 'F', group: 'adc', zero: true },
  { key: 'Vfs', label: 'V_FS', unit: 'V', group: 'adc' },
  { key: 'fsamp', label: 'f_samp', unit: 'Hz', group: 'adc' },
  { key: 'fsw', label: 'f_sw', unit: 'Hz', group: 'adc', optional: true },
];
const KEYS = FIELDS.map((f) => f.key);
/** Each field's unit, which its value may carry after the number (lib/siparse.ts). */
const UNIT: Record<string, string> = Object.fromEntries(FIELDS.map((f) => [f.key, f.unit]));
const shownFor = (kind: MonitorKind) => FIELDS.filter((f) => f.group !== (kind === 'current' ? 'voltage' : 'current'));

/** A number field's value; an empty or non-finite field is NaN, never 0. */
function num(raw: string | undefined, unit?: string): number {
  const t = (raw ?? '').trim();
  const v = parseSI(t, unit);
  return Number.isFinite(v) ? v : Number.NaN;
}

/** The sense chain's specification from the form, or null when a field is missing or out of range. */
export function toSenseSpec(kind: MonitorKind, values: Record<string, string>): SenseSpec | null {
  for (const f of shownFor(kind)) {
    if (f.optional && (values[f.key] ?? '').trim() === '') continue;
    const v = num(values[f.key], f.unit);
    if (f.zero ? !(v >= 0) : !(v > 0)) return null;
  }
  const opt = (k: string) => ((values[k] ?? '').trim() === '' ? undefined : num(values[k], UNIT[k]));
  const spec: SenseSpec = {
    Imax: num(values.Imax, UNIT.Imax),
    Imin: num(values.Imin, UNIT.Imin),
    Rsense: num(values.Rsense, UNIT.Rsense),
    Rpad: num(values.Rpad, UNIT.Rpad),
    Prating: opt('Prating'),
    VburdenMax: opt('VburdenMax'),
    monitor:
      kind === 'current'
        ? { kind: 'current', Rin: num(values.Rin, UNIT.Rin), Rout: num(values.Rout, UNIT.Rout) }
        : { kind: 'voltage', G: num(values.G, UNIT.G), Vref: num(values.Vref, UNIT.Vref) },
    Vos: num(values.Vos, UNIT.Vos),
    VoutMin: num(values.VoutMin, UNIT.VoutMin),
    VoutMax: num(values.VoutMax, UNIT.VoutMax),
    Vfs: num(values.Vfs, UNIT.Vfs),
    fsamp: num(values.fsamp, UNIT.fsamp),
    Rf: num(values.Rf, UNIT.Rf),
    Cf: num(values.Cf, UNIT.Cf),
    fsw: opt('fsw'),
    errMax: num(values.errMax, UNIT.errMax),
  };
  // the smallest current lies within the range, and the amplifier's output range is not empty
  if (!(spec.Imin <= spec.Imax) || !(spec.VoutMax > spec.VoutMin)) return null;
  return spec;
}

/** Results with SI prefixes (lib/format.ts). */
const fmt = (x: number | undefined, unit = '') => fmtValue(x, unit);

/** A relative quantity as a percentage. */
const pct = (x: number) => fmt(100 * x, '%');

function readHash(): URLSearchParams {
  return new URLSearchParams(typeof window === 'undefined' ? '' : window.location.hash.replace(/^#/, ''));
}

/**
 * The amplifier kind and the fields from the URL hash; a field missing from
 * the hash takes the kind's preset, a field present but empty stays empty.
 */
export function stateFromHash(h: URLSearchParams, presets: SensePreset[]): { kind: MonitorKind; values: Record<string, string> } {
  const kind = (KINDS as string[]).includes(h.get('mon') ?? '') ? (h.get('mon') as MonitorKind) : (presets[0]?.kind ?? 'current');
  const base = presets.find((p) => p.kind === kind) ?? presets[0];
  const values: Record<string, string> = {};
  for (const k of KEYS) values[k] = h.has(k) ? h.get(k)! : base?.values[k] !== undefined ? String(base.values[k]) : '';
  return { kind, values };
}

/** The URL hash of the form: every field (the other amplifier kind's too), an empty one as `key=`. */
export function hashOf(kind: MonitorKind, values: Record<string, string>): string {
  const q = new URLSearchParams({ mon: kind });
  for (const f of FIELDS) q.set(f.key, values[f.key] ?? '');
  return q.toString();
}

/**
 * The check for the form, or null when a field is missing or out of range,
 * or the inputs overflow (in the results or in the charts' curves, so that no
 * chart can fail on a state the URL keeps).
 */
export function checkOf(kind: MonitorKind, values: Record<string, string>): SenseResult | null {
  const spec = toSenseSpec(kind, values);
  if (!spec) return null;
  try {
    const r = senseChain(spec);
    const numbers = [r.gain, r.Vout0, r.VoutImax, r.VoutHi, r.Vsense, r.Pshunt, r.Ifs, r.Ifloor, r.Ios, r.errorAtImin, r.fN, r.gainAtNyquist];
    if (r.gainAtFsw !== undefined) numbers.push(r.gainAtFsw);
    if (!numbers.every(Number.isFinite) || !(r.gain > 0)) return null;
    const t = transferCurve(r);
    const e = errorCurve(r);
    const curves = [t.I, t.nominal, t.high, t.low, e.I, e.offset, e.total];
    return curves.every((c) => c.every(Number.isFinite)) ? r : null;
  } catch {
    return null;
  }
}

/** Draw (or, with no traces, clear) one Plotly chart in the page's theme; returns a canceller. */
function draw(el: HTMLDivElement | null, traces: Record<string, unknown>[] | null, layout: Record<string, unknown>, theme?: PlotTheme): () => void {
  let cancelled = false;
  if (!el) return () => {};
  if (!traces) {
    // no result for the current inputs: remove the previous chart too
    if (el.hasChildNodes()) import('plotly.js-dist-min').then((mod) => (mod.default ?? mod).purge(el));
    return () => {};
  }
  import('plotly.js-dist-min').then((mod) => {
    if (cancelled) return;
    const Plotly = mod.default ?? mod;
    Plotly.react(el, traces, { ...(theme ? baseLayout(theme) : {}), ...layout }, PLOT_CONFIG);
  });
  return () => {
    cancelled = true;
  };
}

export default function SenseChain({ labels, presets, symbols }: Props) {
  const init = useMemo(() => stateFromHash(readHash(), presets), [presets]);
  const [kind, setKind] = useState<MonitorKind>(init.kind);
  const [values, setValues] = useState<Record<string, string>>(init.values);
  const transferRef = useRef<HTMLDivElement>(null);
  const errorRef = useRef<HTMLDivElement>(null);
  const theme = usePlotTheme();

  const result = useMemo(() => checkOf(kind, values), [kind, values]);

  useStateHash(hashOf(kind, values), [...KEYS, 'mon']);

  // The state follows the URL hash: a link to this page with other values
  // (or the browser's back button) changes only the hash, which does not
  // remount the island. Our own replaceState() fires no hashchange.
  useEffect(() => {
    const onHash = () => {
      const h = readHash();
      if (!isToolHash(h, [...KEYS, 'mon'])) return; // an in-page anchor, not a new state
      const next = stateFromHash(h, presets);
      setKind(next.kind);
      setValues(next.values);
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, [presets]);

  // the output against the current, nominal and at its highest and lowest, within the amplifier's output range
  useEffect(() => {
    if (!result) return draw(transferRef.current, null, {});
    const s = result.spec;
    let t: ReturnType<typeof transferCurve>;
    try {
      t = transferCurve(result);
    } catch {
      return draw(transferRef.current, null, {}); // checkOf rules this out; never unmount the island over a chart
    }
    const x = [0, t.I[t.I.length - 1]!];
    const [c0, c1, c2, c3] = theme.colors;
    const clamp = (v: number[]) => v.map((y) => Math.min(Math.max(y, s.VoutMin), s.VoutMax));
    const volts = '%{y:.4~g} V';
    const level = (y: number, name: string, dash: string, color: string) => ({
      x,
      y: [y, y],
      name: sub(name),
      mode: 'lines',
      line: { dash, color, width: 2 },
      hovertemplate: volts,
    });
    const traces: Record<string, unknown>[] = [
      { x: t.I, y: clamp(t.nominal), name: labels.outputCurve, mode: 'lines', line: { color: c0, width: 2 }, hovertemplate: volts },
      level(s.VoutMax, labels.voutMax, 'dot', c1!),
      level(s.Vfs, labels.vfs, 'dash', c2!),
    ];
    // the band the pad resistance and the offset open around the nominal output
    if (s.Vos > 0 || s.Rpad > 0) {
      const edge = { dash: 'dash', width: 1, color: c3 };
      traces.splice(1, 0, { x: t.I, y: clamp(t.high), name: labels.highCurve, mode: 'lines', line: edge, hovertemplate: volts });
      traces.splice(2, 0, { x: t.I, y: clamp(t.low), name: labels.lowCurve, mode: 'lines', line: edge, hovertemplate: volts });
    }
    if (s.VoutMin > 0) traces.push(level(s.VoutMin, labels.voutMin, 'dot', c1!));
    const vline = (xv: number, text: string) => ({
      shape: { type: 'line', xref: 'x', yref: 'paper', x0: xv, x1: xv, y0: 0, y1: 1, line: { width: 1, dash: 'dashdot', color: theme.muted } },
      annotation: {
        x: xv,
        y: 0.98,
        xref: 'x',
        yref: 'paper',
        text: sub(text),
        showarrow: false,
        xanchor: 'left',
        yanchor: 'top',
        xshift: 3,
        font: { size: 11, color: theme.muted },
      },
    });
    const marks = [vline(s.Imax, labels.imax), vline(s.Imin, labels.imin)];
    return draw(
      transferRef.current,
      traces,
      {
        hovermode: 'x unified',
        xaxis: axis(theme, `${labels.current} [A]`, { rangemode: 'tozero' }),
        // headroom above the highest line, so that the I_min and I_max labels stay clear of it
        yaxis: axis(theme, `${labels.output} [V]`, { range: [0, 1.15 * Math.max(s.VoutMax, s.Vfs)] }),
        shapes: marks.map((m) => m.shape),
        annotations: marks.map((m) => m.annotation),
      },
      theme,
    );
  }, [result, labels, theme]);

  // the relative error of the reading against the current (logarithmic axes)
  useEffect(() => {
    if (!result || (result.Ios === 0 && result.padError === 0)) return draw(errorRef.current, null, {});
    const s = result.spec;
    let c: ReturnType<typeof errorCurve>;
    try {
      c = errorCurve(result);
    } catch {
      return draw(errorRef.current, null, {}); // checkOf rules this out; never unmount the island over a chart
    }
    const [c0, c1, c2] = theme.colors;
    const percent = (v: number) => `${Number((100 * v).toPrecision(3))}%`;
    const traces: Record<string, unknown>[] = [
      { x: c.I, y: c.total, name: labels.totalCurve, mode: 'lines', line: { color: c0, width: 2 }, hovertemplate: '%{y:.2%}' },
      {
        x: [c.I[0], c.I[c.I.length - 1]],
        y: [s.errMax, s.errMax],
        name: labels.target,
        mode: 'lines',
        line: { color: c2, width: 2, dash: 'dot' },
        hovertemplate: '%{y:.2%}',
      },
    ];
    // the offset's part on its own, when the pad adds to it
    if (result.padError > 0 && result.Ios > 0) {
      traces.splice(1, 0, {
        x: c.I,
        y: c.offset,
        name: labels.offsetCurve,
        mode: 'lines',
        line: { color: c1, width: 2, dash: 'dash' },
        hovertemplate: '%{y:.2%}',
      });
    }
    const shapes: Record<string, unknown>[] = [
      { type: 'line', xref: 'x', yref: 'paper', x0: s.Imin, x1: s.Imin, y0: 0, y1: 1, line: { width: 1, dash: 'dashdot', color: theme.muted } },
    ];
    const annotations: Record<string, unknown>[] = [
      {
        x: Math.log10(s.Imin),
        y: 0.98,
        xref: 'x',
        yref: 'paper',
        text: sub(labels.imin),
        showarrow: false,
        xanchor: 'left',
        yanchor: 'top',
        xshift: 3,
        font: { size: 11, color: theme.muted },
      },
    ];
    if (result.Ifloor > c.I[0]!) {
      // below the floor current the output cannot follow the current (a floor left of the plotted range would stretch it)
      shapes.push({
        type: 'rect',
        xref: 'x',
        yref: 'paper',
        x0: c.I[0],
        x1: Math.min(result.Ifloor, c.I[c.I.length - 1]!),
        y0: 0,
        y1: 1,
        fillcolor: theme.band,
        line: { width: 0 },
        name: labels.floorBand,
        showlegend: true,
      });
    }
    const ys = [...c.total, ...c.offset, s.errMax].filter((y) => Number.isFinite(y) && y > 0);
    return draw(
      errorRef.current,
      traces,
      {
        hovermode: 'x unified',
        xaxis: axis(theme, `${labels.current} [A]`, { type: 'log', ...logTicks(c.I[0]!, c.I[c.I.length - 1]!) }),
        yaxis: axis(theme, labels.relError, { type: 'log', ...logTicks(Math.min(...ys), Math.max(...ys), percent) }),
        shapes,
        annotations,
      },
      theme,
    );
  }, [result, labels, theme]);

  function applyPreset(p: SensePreset) {
    const next: Record<string, string> = {};
    for (const k of KEYS) next[k] = p.values[k] !== undefined ? String(p.values[k]) : '';
    setKind(p.kind);
    setValues(next);
  }

  function changeKind(k: MonitorKind) {
    // keep the shunt, the ADC and the targets; take the amplifier's own values from its preset where they are empty
    const base = presets.find((p) => p.kind === k);
    const next = { ...values };
    for (const f of FIELDS.filter((f) => f.group === k)) {
      if ((next[f.key] ?? '') === '' && base?.values[f.key] !== undefined) next[f.key] = String(base.values[f.key]);
    }
    setKind(k);
    setValues(next);
  }

  const input = (f: Field) => {
    const id = `sense-${f.key}`;
    return (
      <div key={f.key} className="pe-row pe-row--full">
        <FieldLabel htmlFor={id} sym={f.label} meaning={symbols[f.label]} unit={f.unit} note={f.optional ? labels.optional : undefined} />
        <NumInput id={id} unit={f.unit} value={values[f.key] ?? ''} onChange={(e) => setValues({ ...values, [f.key]: e.target.value })} />
      </div>
    );
  };

  const r = result;
  const outputEq = r?.spec.monitor.kind === 'voltage' ? 'sense.voltage_out_monitor' : 'sense.current_out_monitor';
  const row = (label: string, value: ReactNode, ...eqs: string[]) => (
    <tr key={label}>
      <th scope="row">
        <Rich text={label} />
      </th>
      <td>{value}</td>
      <td>
        {eqs.map((eq, k) => (
          <span key={eq}>
            {k > 0 && ', '}
            <code>{eq}</code>
          </span>
        ))}
      </td>
    </tr>
  );
  return (
    <div className="pe-tool pe-sense not-content">
      <Choices legend={labels.kind} items={KINDS.map((k) => ({ id: k, label: labels.kinds[k] }))} selected={kind} onPick={changeKind} />
      {presets.length > 0 && (
        <Choices
          legend={labels.presets}
          items={presets.map((p) => ({ id: p.id, label: p.label }))}
          onPick={(id) => applyPreset(presets.find((p) => p.id === id)!)}
          wide
        />
      )}
      <div className="pe-split pe-split--results">
        <div className="pe-split__controls">
          <p className="pe-tool__hint">{labels.siHint}</p>
          <fieldset>
            <legend>
              <Rich text={labels.range} />
            </legend>
            {FIELDS.filter((f) => f.group === 'range').map(input)}
          </fieldset>
          <fieldset>
            <legend>
              <Rich text={labels.shunt} />
            </legend>
            {FIELDS.filter((f) => f.group === 'shunt').map(input)}
          </fieldset>
          <fieldset>
            <legend>
              <Rich text={labels.amplifier[kind]} />
            </legend>
            {FIELDS.filter((f) => f.group === kind || f.group === 'amp').map(input)}
          </fieldset>
          <fieldset>
            <legend>
              <Rich text={labels.adc} />
            </legend>
            {FIELDS.filter((f) => f.group === 'adc').map(input)}
          </fieldset>
        </div>
        <div className="pe-split__view">
          <section aria-live="polite">
            {!r && <p className="pe-sim__error">{labels.invalid}</p>}
            {r && r.warnings.length > 0 && (
              <ul className="pe-design__warnings">
                {r.warnings.map((w) => (
                  <li key={w}>
                    <Rich text={labels.warnings[w]} />
                  </li>
                ))}
              </ul>
            )}
          </section>
          {r && (
            <div className="pe-scroll">
              <table className="pe-sim__table">
                <caption>
                  <Rich text={labels.results} />
                </caption>
                <thead>
                  <tr>
                    <th scope="col">{labels.quantity}</th>
                    <th scope="col">{labels.value}</th>
                    <th scope="col">{labels.equation}</th>
                  </tr>
                </thead>
                <tbody>
                  {row(labels.gain, fmt(r.gain, 'V/A'), outputEq)}
                  {row(labels.vout0, fmt(r.Vout0, 'V'), outputEq)}
                  {row(labels.voutImax, fmt(r.VoutImax, 'V'), outputEq)}
                  {row(labels.voutHi, <strong>{fmt(r.VoutHi, 'V')}</strong>, 'sense.reading', outputEq)}
                  {row(labels.adcUse, pct(r.adcUse), 'sense.reading', outputEq)}
                  {row(
                    labels.ifs,
                    <>
                      <strong>{fmt(r.Ifs, 'A')}</strong> ({r.limit === 'amp' ? labels.limitAmp : labels.limitAdc})
                    </>,
                    'sense.reading',
                    outputEq,
                  )}
                  {r.Ifloor > 0 && row(labels.ifloor, fmt(r.Ifloor, 'A'), 'sense.reading', outputEq)}
                  {row(labels.vsense, fmt(r.Vsense, 'V'), 'sense.burden')}
                  {row(labels.pshunt, fmt(r.Pshunt, 'W'), 'loss.cond')}
                  {row(labels.ios, fmt(r.Ios, 'A'), 'sense.offset_current')}
                  {row(labels.offsetShare, pct(r.offsetShare), 'sense.rel_error')}
                  {row(labels.padError, pct(r.padError), 'sense.pad_error')}
                  {row(labels.errorAtImin, <strong>{pct(r.errorAtImin)}</strong>, 'sense.rel_error')}
                  {r.spec.monitor.kind === 'current' && row(labels.rfilt, fmt(r.Rfilt, 'Ω'), 'sense.filter_R')}
                  {row(labels.fc, Number.isFinite(r.fc) ? fmt(r.fc, 'Hz') : labels.noFilter, 'rc.fc')}
                  {row(labels.fN, fmt(r.fN, 'Hz'), 'adc.nyquist')}
                  {row(labels.gainAtNyquist, fmt(r.gainAtNyquist), 'rc.gain')}
                  {r.gainAtFsw !== undefined && row(labels.gainAtFsw, fmt(r.gainAtFsw), 'rc.gain')}
                </tbody>
              </table>
            </div>
          )}
          <p className="pe-chart__title">
            <Rich text={labels.transferChart} />
          </p>
          <div ref={transferRef} className="pe-chart" role="img" aria-label={labels.transferChart} style={{ height: 360 }} />
          <p className="pe-chart__title">
            <Rich text={labels.errorChart} />
          </p>
          {r && r.Ios === 0 && r.padError === 0 && (
            <p className="pe-tool__hint">
              <Rich text={labels.noError} />
            </p>
          )}
          <div ref={errorRef} className="pe-chart" role="img" aria-label={labels.errorChart} style={{ height: 360 }} />
          {r && <p className="pe-tool__hint">{labels.plotHint}</p>}
        </div>
      </div>
      <p className="pe-tool__hint">{labels.share}</p>
    </div>
  );
}
