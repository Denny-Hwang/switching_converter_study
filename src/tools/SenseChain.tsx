/**
 * Sense chain (docs/BUILD_SPEC.md §5): a shunt, a current-output or
 * voltage-output sense amplifier, an R-C filter and an ADC, checked from
 * zero to the largest current. It gives the gain, the full-scale current and
 * what sets it, the output floor, the burden, the offset-equivalent current,
 * the pad error and the error at the smallest current, and the filter's
 * corner against the Nyquist frequency, and flags each violation. The
 * calculation is pe-core's senseChain(), in which every formula is a
 * catalogue equation; each result names its equation. All state lives in the
 * URL hash.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { errorCurve, senseChain, transferCurve, type MonitorKind, type SenseResult, type SenseSpec, type SenseWarning } from 'pe-core';
import { isToolHash } from '../lib/hash';

export interface SenseLabels {
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
  noFilter: string;
  transferChart: string;
  errorChart: string;
  current: string;
  output: string;
  relError: string;
  outputCurve: string;
  voutMax: string;
  voutMin: string;
  vfs: string;
  imax: string;
  imin: string;
  offsetCurve: string;
  totalCurve: string;
  target: string;
  noError: string;
  invalid: string;
  share: string;
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
];
const KEYS = FIELDS.map((f) => f.key);
const shownFor = (kind: MonitorKind) => FIELDS.filter((f) => f.group !== (kind === 'current' ? 'voltage' : 'current'));

/** A number field's value; an empty or non-finite field is NaN, never 0. */
function num(raw: string | undefined): number {
  const t = (raw ?? '').trim();
  const v = t === '' ? Number.NaN : Number(t);
  return Number.isFinite(v) ? v : Number.NaN;
}

/** The sense chain's specification from the form, or null when a field is missing or out of range. */
export function toSenseSpec(kind: MonitorKind, values: Record<string, string>): SenseSpec | null {
  for (const f of shownFor(kind)) {
    if (f.optional && (values[f.key] ?? '').trim() === '') continue;
    const v = num(values[f.key]);
    if (f.zero ? !(v >= 0) : !(v > 0)) return null;
  }
  const opt = (k: string) => ((values[k] ?? '').trim() === '' ? undefined : num(values[k]));
  const spec: SenseSpec = {
    Imax: num(values.Imax),
    Imin: num(values.Imin),
    Rsense: num(values.Rsense),
    Rpad: num(values.Rpad),
    Prating: opt('Prating'),
    VburdenMax: opt('VburdenMax'),
    monitor:
      kind === 'current'
        ? { kind: 'current', Rin: num(values.Rin), Rout: num(values.Rout) }
        : { kind: 'voltage', G: num(values.G), Vref: num(values.Vref) },
    Vos: num(values.Vos),
    VoutMin: num(values.VoutMin),
    VoutMax: num(values.VoutMax),
    Vfs: num(values.Vfs),
    fsamp: num(values.fsamp),
    Rf: num(values.Rf),
    Cf: num(values.Cf),
    errMax: num(values.errMax),
  };
  // the smallest current lies within the range, and the amplifier's output range is not empty
  if (!(spec.Imin <= spec.Imax) || !(spec.VoutMax > spec.VoutMin)) return null;
  return spec;
}

function fmt(x: number | undefined, unit = ''): string {
  if (x === undefined || Number.isNaN(x)) return '—';
  if (!Number.isFinite(x)) return '∞';
  const a = Math.abs(x);
  const s = a !== 0 && (a < 1e-3 || a >= 1e5) ? x.toExponential(3) : Number(x.toPrecision(4)).toString();
  return unit ? `${s} ${unit}` : s;
}

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
  const kind = (KINDS as string[]).includes(h.get('mon') ?? '') ? (h.get('mon') as MonitorKind) : presets[0]?.kind ?? 'current';
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

/** The check for the form, or null when a field is missing or out of range, or the inputs overflow. */
export function checkOf(kind: MonitorKind, values: Record<string, string>): SenseResult | null {
  const spec = toSenseSpec(kind, values);
  if (!spec) return null;
  try {
    const r = senseChain(spec);
    const finite = [r.gain, r.Vout0, r.VoutImax, r.Vsense, r.Pshunt, r.Ifs, r.Ifloor, r.Ios, r.errorAtImin, r.fN, r.gainAtNyquist].every(
      Number.isFinite,
    );
    return finite && r.gain > 0 ? r : null;
  } catch {
    return null;
  }
}

const LAYOUT = {
  paper_bgcolor: 'rgba(0,0,0,0)',
  plot_bgcolor: 'rgba(0,0,0,0)',
  legend: { orientation: 'h', y: -0.25 },
};

/** Draw (or, with no traces, clear) one Plotly chart; returns a canceller. */
function draw(el: HTMLDivElement | null, traces: Record<string, unknown>[] | null, layout: Record<string, unknown>): () => void {
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
    Plotly.react(el, traces, { ...LAYOUT, ...layout }, { responsive: true, displaylogo: false });
  });
  return () => {
    cancelled = true;
  };
}

export default function SenseChain({ labels, presets }: Props) {
  const init = useMemo(() => stateFromHash(readHash(), presets), [presets]);
  const [kind, setKind] = useState<MonitorKind>(init.kind);
  const [values, setValues] = useState<Record<string, string>>(init.values);
  const transferRef = useRef<HTMLDivElement>(null);
  const errorRef = useRef<HTMLDivElement>(null);

  const result = useMemo(() => checkOf(kind, values), [kind, values]);

  useEffect(() => {
    window.history.replaceState(null, '', `#${hashOf(kind, values)}`);
  }, [kind, values]);

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

  // the output against the current, with the limits it runs into
  useEffect(() => {
    if (!result) return draw(transferRef.current, null, {});
    const s = result.spec;
    const t = transferCurve(result);
    const x = [0, t.I[t.I.length - 1]!];
    const level = (y: number, name: string, dash: string) => ({ x, y: [y, y], name, mode: 'lines', line: { dash } });
    const traces: Record<string, unknown>[] = [
      { x: t.I, y: t.Vout, name: labels.outputCurve, mode: 'lines' },
      level(s.VoutMax, labels.voutMax, 'dot'),
      level(s.Vfs, labels.vfs, 'dash'),
    ];
    if (s.VoutMin > 0) traces.push(level(s.VoutMin, labels.voutMin, 'dot'));
    const vline = (xv: number, text: string) => ({
      shape: { type: 'line', xref: 'x', yref: 'paper', x0: xv, x1: xv, y0: 0, y1: 1, line: { width: 1, dash: 'dashdot', color: 'gray' } },
      annotation: { x: xv, y: 1, xref: 'x', yref: 'paper', text, showarrow: false, yanchor: 'bottom' },
    });
    const marks = [vline(s.Imax, labels.imax), vline(s.Imin, labels.imin)];
    return draw(transferRef.current, traces, {
      margin: { t: 24, r: 24, b: 48, l: 64 },
      xaxis: { title: { text: `${labels.current} [A]` }, rangemode: 'tozero' },
      // headroom above the highest line, so that the I_min and I_max labels stay clear of it
      yaxis: { title: { text: `${labels.output} [V]` }, range: [0, 1.15 * Math.max(...t.Vout, s.VoutMax, s.Vfs)] },
      shapes: marks.map((m) => m.shape),
      annotations: marks.map((m) => m.annotation),
    });
  }, [result, labels]);

  // the relative error of the reading against the current (logarithmic axes)
  useEffect(() => {
    if (!result || (result.Ios === 0 && result.padError === 0)) return draw(errorRef.current, null, {});
    const s = result.spec;
    const c = errorCurve(result);
    const traces: Record<string, unknown>[] = [
      { x: c.I, y: c.total, name: labels.totalCurve, mode: 'lines' },
      { x: [c.I[0], c.I[c.I.length - 1]], y: [s.errMax, s.errMax], name: labels.target, mode: 'lines', line: { dash: 'dot' } },
    ];
    // the offset's part on its own, when the pad adds to it
    if (result.padError > 0 && result.Ios > 0) traces.splice(1, 0, { x: c.I, y: c.offset, name: labels.offsetCurve, mode: 'lines', line: { dash: 'dash' } });
    const shapes: Record<string, unknown>[] = [
      { type: 'line', xref: 'x', yref: 'paper', x0: s.Imin, x1: s.Imin, y0: 0, y1: 1, line: { width: 1, dash: 'dashdot', color: 'gray' } },
    ];
    const annotations: Record<string, unknown>[] = [{ x: Math.log10(s.Imin), y: 1, xref: 'x', yref: 'paper', text: labels.imin, showarrow: false, yanchor: 'bottom' }];
    if (result.Ifloor > 0) {
      // below the floor current the output cannot follow the current
      shapes.push({
        type: 'rect',
        xref: 'x',
        yref: 'paper',
        x0: c.I[0],
        x1: Math.min(result.Ifloor, c.I[c.I.length - 1]!),
        y0: 0,
        y1: 1,
        fillcolor: 'rgba(128,128,128,0.25)',
        line: { width: 0 },
      });
    }
    return draw(errorRef.current, traces, {
      margin: { t: 24, r: 24, b: 48, l: 64 },
      xaxis: { title: { text: `${labels.current} [A]` }, type: 'log' },
      yaxis: { title: { text: labels.relError }, type: 'log', tickformat: '~%' },
      shapes,
      annotations,
    });
  }, [result, labels]);

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
      <div key={f.key} className="pe-sim__row">
        <label htmlFor={id}>
          {f.label} {f.unit && <small>[{f.unit}]</small>}
          {f.optional && <small> ({labels.optional})</small>}
        </label>
        <input id={id} type="number" step="any" value={values[f.key] ?? ''} onChange={(e) => setValues({ ...values, [f.key]: e.target.value })} />
        <span />
      </div>
    );
  };

  const r = result;
  const outputEq = r?.spec.monitor.kind === 'voltage' ? 'sense.voltage_out_monitor' : 'sense.current_out_monitor';
  const row = (label: string, value: ReactNode, eq?: string) => (
    <tr key={label}>
      <th scope="row">{label}</th>
      <td>{value}</td>
      <td>{eq && <code>{eq}</code>}</td>
    </tr>
  );
  return (
    <div className="pe-tool pe-explorer pe-sim pe-design">
      <fieldset>
        <legend>{labels.kind}</legend>
        <div className="pe-sim__buttons" role="group" aria-label={labels.kind}>
          {KINDS.map((k) => (
            <button key={k} type="button" aria-pressed={kind === k} onClick={() => changeKind(k)}>
              {labels.kinds[k]}
            </button>
          ))}
        </div>
      </fieldset>
      {presets.length > 0 && (
        <fieldset>
          <legend>{labels.presets}</legend>
          <div className="pe-sim__buttons">
            {presets.map((p) => (
              <button key={p.id} type="button" onClick={() => applyPreset(p)}>
                {p.label}
              </button>
            ))}
          </div>
        </fieldset>
      )}
      <fieldset>
        <legend>{labels.range}</legend>
        {FIELDS.filter((f) => f.group === 'range').map(input)}
      </fieldset>
      <fieldset>
        <legend>{labels.shunt}</legend>
        {FIELDS.filter((f) => f.group === 'shunt').map(input)}
      </fieldset>
      <fieldset>
        <legend>{labels.amplifier[kind]}</legend>
        {FIELDS.filter((f) => f.group === kind || f.group === 'amp').map(input)}
      </fieldset>
      <fieldset>
        <legend>{labels.adc}</legend>
        {FIELDS.filter((f) => f.group === 'adc').map(input)}
      </fieldset>
      <section aria-live="polite">
        {!r && <p className="pe-sim__error">{labels.invalid}</p>}
        {r && r.warnings.length > 0 && (
          <ul className="pe-design__warnings">
            {r.warnings.map((w) => (
              <li key={w}>{labels.warnings[w]}</li>
            ))}
          </ul>
        )}
      </section>
      {r && (
        <table className="pe-sim__table">
          <caption>{labels.results}</caption>
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
            {row(labels.voutImax, <strong>{fmt(r.VoutImax, 'V')}</strong>, outputEq)}
            {row(labels.adcUse, pct(r.adcUse))}
            {row(
              labels.ifs,
              <>
                <strong>{fmt(r.Ifs, 'A')}</strong> ({r.limit === 'amp' ? labels.limitAmp : labels.limitAdc})
              </>,
              outputEq,
            )}
            {r.Ifloor > 0 && row(labels.ifloor, fmt(r.Ifloor, 'A'), outputEq)}
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
          </tbody>
        </table>
      )}
      <div ref={transferRef} role="img" aria-label={labels.transferChart} style={{ width: '100%', height: 360 }} />
      {r && r.Ios === 0 && r.padError === 0 && (
        <p>
          <small>{labels.noError}</small>
        </p>
      )}
      <div ref={errorRef} role="img" aria-label={labels.errorChart} style={{ width: '100%', height: 360 }} />
      <p>
        <small>{labels.share}</small>
      </p>
    </div>
  );
}
