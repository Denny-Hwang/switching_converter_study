/**
 * Source matcher (docs/BUILD_SPEC.md §5): a linear source (V_oc behind R_s,
 * optionally with a slowly varying amplitude) feeding a fixed-duty-ratio DCM
 * flyback that charges a fixed output. While the flyback stays in DCM it is a
 * loss-free resistor R_in and takes a fixed share of the available power;
 * above the critical input voltage CCM holds the bus there and it becomes a
 * constant-voltage sink. The tool shows the operating point, the extracted
 * share against the source amplitude, the switch voltage that a higher power
 * needs, and, with an envelope, a cycle-by-cycle simulation over it (in a Web
 * Worker). The calculation is pe-core's matchSource() and envelopeRun(), in
 * which every formula is a catalogue equation. All state lives in the URL
 * hash.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ENVELOPE_MAX_CYCLES,
  ENVELOPE_MIN_CYCLES,
  envelopeCycles,
  evaluate,
  matchSource,
  type Envelope,
  type EnvelopeRun,
  type MatchResult,
  type MatchSpec,
  type SinkMode,
} from 'pe-core';
import { isToolHash } from '../lib/hash';
import type { EnvelopeReply } from './sourcematch.worker';

export type EnvelopeKind = 'none' | 'sine' | 'points';

export interface SourceLabels {
  presets: string;
  source: string;
  converter: string;
  envelope: string;
  envelopeKinds: Record<EnvelopeKind, string>;
  pointsHelp: string;
  results: string;
  quantity: string;
  value: string;
  equation: string;
  rin: string;
  etaLfr: string;
  vgcrit: string;
  voccrit: string;
  mode: string;
  modes: Record<SinkMode, string>;
  vg: string;
  power: string;
  pmax: string;
  eta: string;
  vds: string;
  vdsCcm: string;
  plfr: string;
  limitCcm: string;
  limitSwitch: string;
  overRating: string;
  /** The bus capacitor is small against the switching period: the averaged values are approximate. */
  ripple: string;
  extractionChart: string;
  amplitude: string;
  share: string;
  lfrCurve: string;
  cvCurve: string;
  actual: string;
  switchChart: string;
  powerAxis: string;
  vdsAxis: string;
  rating: string;
  envelopeChart: string;
  time: string;
  voltage: string;
  vbus: string;
  voc: string;
  pIn: string;
  pAvail: string;
  etaEnvelope: string;
  running: string;
  /** "{n}" and "{max}" are replaced by the cycles needed and the limit. */
  tooLong: string;
  /** "{n}" and "{min}" are replaced by the cycles in an envelope period and the least allowed. */
  tooFast: string;
  /** Prefix of an error from the envelope simulation (the error follows in parentheses). */
  runFailed: string;
  simulate: string;
  invalid: string;
  shareUrl: string;
}

export interface SourcePreset {
  id: string;
  label: string;
  values: Record<string, number>;
}

interface Props {
  locale: 'en' | 'ko';
  labels: SourceLabels;
  presets: SourcePreset[];
  simulatorHref: string;
}

type Group = 'source' | 'converter' | 'sine';
interface Field {
  key: string;
  label: string;
  unit: string;
  group: Group;
  zero?: boolean;
}

export const FIELDS: Field[] = [
  { key: 'Voc', label: 'V_oc', unit: 'V', group: 'source' },
  { key: 'Rs', label: 'R_s', unit: 'Ω', group: 'source' },
  { key: 'Cbus', label: 'C_bus', unit: 'F', group: 'source' },
  { key: 'LM', label: 'L_M', unit: 'H', group: 'converter' },
  { key: 'fs', label: 'f_s', unit: 'Hz', group: 'converter' },
  { key: 'D', label: 'D', unit: '', group: 'converter' },
  { key: 'V', label: 'V', unit: 'V', group: 'converter' },
  { key: 'VD', label: 'V_D', unit: 'V', group: 'converter', zero: true },
  { key: 'n', label: 'n = N_s/N_p', unit: '', group: 'converter' },
  { key: 'Vrating', label: 'V_DS,rated', unit: 'V', group: 'converter' },
  { key: 'fenv', label: 'f_env', unit: 'Hz', group: 'sine' },
];
const KEYS = [...FIELDS.map((f) => f.key), 'pts'];
const ENVELOPES: EnvelopeKind[] = ['none', 'sine', 'points'];

/** A number field's value; an empty or non-finite field is NaN, never 0. */
function num(raw: string | undefined): number {
  const t = (raw ?? '').trim();
  const v = t === '' ? Number.NaN : Number(t);
  return Number.isFinite(v) ? v : Number.NaN;
}

/** The source matcher's specification from the form, or null when a field is missing or out of range. */
export function toMatchSpec(values: Record<string, string>): MatchSpec | null {
  for (const f of FIELDS.filter((f) => f.group !== 'sine' && f.key !== 'Cbus')) {
    const v = num(values[f.key]);
    if (f.zero ? !(v >= 0) : !(v > 0)) return null;
  }
  const s: MatchSpec = {
    Voc: num(values.Voc),
    Rs: num(values.Rs),
    LM: num(values.LM),
    fs: num(values.fs),
    D: num(values.D),
    V: num(values.V),
    VD: num(values.VD),
    n: num(values.n),
    Vrating: num(values.Vrating),
  };
  if (!(s.D < 1)) return null;
  return s;
}

/**
 * The envelope from the form: a rectified sine of frequency f_env, or points
 * "t v; t v; ..." (time in s from 0, amplitude as a fraction of V_oc from 0 to
 * 1, times increasing, the last time the period). Null when invalid.
 */
export function toEnvelope(kind: EnvelopeKind, values: Record<string, string>): Envelope | null {
  if (kind === 'sine') {
    const f = num(values.fenv);
    return f > 0 ? { kind: 'sine', f } : null;
  }
  if (kind === 'points') {
    const pairs = (values.pts ?? '')
      .split(';')
      .map((p) => p.trim())
      .filter((p) => p !== '')
      .map((p) => p.split(/[\s,]+/).map(Number));
    if (pairs.length < 2 || pairs.some((p) => p.length !== 2 || !p.every(Number.isFinite))) return null;
    const t = pairs.map((p) => p[0]!);
    const v = pairs.map((p) => p[1]!);
    if (t[0] !== 0 || t.some((x, k) => k > 0 && !(x > t[k - 1]!)) || v.some((x) => x < 0 || x > 1)) return null;
    return { kind: 'points', t, v };
  }
  return null;
}

function fmt(x: number | undefined, unit = ''): string {
  if (x === undefined || !Number.isFinite(x)) return '—';
  const a = Math.abs(x);
  const s = a !== 0 && (a < 1e-3 || a >= 1e5) ? x.toExponential(3) : Number(x.toPrecision(4)).toString();
  return unit ? `${s} ${unit}` : s;
}

function readHash(): URLSearchParams {
  return new URLSearchParams(typeof window === 'undefined' ? '' : window.location.hash.replace(/^#/, ''));
}

/**
 * The envelope kind and the fields from the URL hash; a field missing from
 * the hash takes the first preset, a field present but empty stays empty.
 */
export function stateFromHash(h: URLSearchParams, presets: SourcePreset[]): { env: EnvelopeKind; values: Record<string, string> } {
  const base = presets[0];
  const values: Record<string, string> = {};
  for (const k of KEYS) values[k] = h.has(k) ? h.get(k)! : base?.values[k] !== undefined ? String(base.values[k]) : '';
  const env = (ENVELOPES as string[]).includes(h.get('env') ?? '') ? (h.get('env') as EnvelopeKind) : base?.values.fenv !== undefined ? 'sine' : 'none';
  return { env, values };
}

/** The URL hash of the form: every field, an empty one as `key=`. */
export function hashOf(env: EnvelopeKind, values: Record<string, string>): string {
  const q = new URLSearchParams({ env });
  for (const f of FIELDS) q.set(f.key, values[f.key] ?? '');
  q.set('pts', values.pts ?? '');
  return q.toString();
}

/** Simulator URL hash for the source-driven flyback at the constant amplitude V_oc. */
export function simulatorHash(s: MatchSpec, Cbus: number): string {
  const sig = (x: number) => String(Number(x.toPrecision(6)));
  const q = new URLSearchParams({ topo: 'flyback', load: 'fixed', src: '1' });
  q.set('V', sig(s.V));
  q.set('VF', sig(s.VD));
  q.set('D', sig(s.D));
  q.set('n', sig(s.n));
  q.set('fs', sig(s.fs));
  q.set('L', sig(s.LM));
  q.set('Voc', sig(s.Voc));
  q.set('Rs', sig(s.Rs));
  q.set('Cbus', sig(Cbus));
  q.set('Ron', '0');
  q.set('RL', '0');
  q.set('Cnode', '0');
  return q.toString();
}

type Done = (result: EnvelopeRun | null, error: string | null) => void;

/**
 * Runs envelopeRun() in a Web Worker. A new request, or cancel(), abandons
 * the one in flight (the worker is replaced), so a reply to earlier inputs
 * never arrives after the inputs have changed.
 */
function useEnvelopeRunner(): {
  run: (spec: MatchSpec, Cbus: number, envelope: Envelope, done: Done) => void;
  cancel: () => void;
} {
  const worker = useRef<Worker | null>(null);
  const inFlight = useRef(false);
  const seq = useRef(0);
  useEffect(() => () => worker.current?.terminate(), []);
  const cancel = useCallback(() => {
    seq.current++;
    if (worker.current && inFlight.current) {
      worker.current.terminate();
      worker.current = null;
    }
    inFlight.current = false;
  }, []);
  const run = useCallback((spec: MatchSpec, Cbus: number, envelope: Envelope, done: Done) => {
    const id = ++seq.current;
    if (worker.current && inFlight.current) {
      worker.current.terminate();
      worker.current = null;
    }
    if (!worker.current) worker.current = new Worker(new URL('./sourcematch.worker.ts', import.meta.url), { type: 'module' });
    const w = worker.current;
    inFlight.current = true;
    w.onmessage = (e: MessageEvent<EnvelopeReply>) => {
      if (e.data.id !== seq.current) return;
      inFlight.current = false;
      if ('error' in e.data) done(null, e.data.error);
      else done(e.data.result, null);
    };
    w.onerror = (e) => {
      inFlight.current = false;
      w.terminate();
      if (worker.current === w) worker.current = null;
      done(null, e.message || 'worker error');
    };
    w.postMessage({ id, spec, Cbus, envelope });
  }, []);
  return useMemo(() => ({ run, cancel }), [run, cancel]);
}

/** Purge a Plotly chart (when there is nothing to show for the current inputs). */
function purge(el: HTMLDivElement | null) {
  if (el?.hasChildNodes()) import('plotly.js-dist-min').then((mod) => (mod.default ?? mod).purge(el));
}

const LAYOUT = { paper_bgcolor: 'rgba(0,0,0,0)', plot_bgcolor: 'rgba(0,0,0,0)', legend: { orientation: 'h', y: -0.3 } };

export default function SourceMatcher({ labels, presets, simulatorHref }: Props) {
  const init = useMemo(() => stateFromHash(readHash(), presets), [presets]);
  const [env, setEnv] = useState<EnvelopeKind>(init.env);
  const [values, setValues] = useState<Record<string, string>>(init.values);
  const [run, setRun] = useState<EnvelopeRun | null>(null);
  const [runError, setRunError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const extractRef = useRef<HTMLDivElement>(null);
  const switchRef = useRef<HTMLDivElement>(null);
  const envRef = useRef<HTMLDivElement>(null);
  const runner = useEnvelopeRunner();

  const spec = useMemo(() => toMatchSpec(values), [values]);
  const result: MatchResult | null = useMemo(() => {
    if (!spec) return null;
    try {
      return matchSource(spec);
    } catch {
      return null;
    }
  }, [spec]);
  const envelope = useMemo(() => toEnvelope(env, values), [env, values]);
  const Cbus = num(values.Cbus);
  const envelopeValid = env === 'none' || (envelope !== null && Cbus > 0);
  // switching cycles the envelope run would need; too many, or too few per period, are refused before it starts
  const need = env !== 'none' && spec && envelope && Cbus > 0 ? envelopeCycles(spec, Cbus, envelope) : null;
  const cycles = need?.total ?? 0;
  const tooLong = cycles > ENVELOPE_MAX_CYCLES;
  const tooFast = need !== null && need.period < ENVELOPE_MIN_CYCLES;
  // the averages assume a bus that hardly ripples over a switching period
  const rippling = !!result && Cbus > 0 && ((spec!.Rs * result.Rin) / (spec!.Rs + result.Rin)) * Cbus < 10 / spec!.fs;

  useEffect(() => {
    window.history.replaceState(null, '', `#${hashOf(env, values)}`);
  }, [env, values]);

  // The state follows the URL hash: a link to this page with other values
  // (or the browser's back button) changes only the hash, which does not
  // remount the island. Our own replaceState() fires no hashchange.
  useEffect(() => {
    const onHash = () => {
      const h = readHash();
      if (!isToolHash(h, [...KEYS, 'env'])) return; // an in-page anchor, not a new state
      const next = stateFromHash(h, presets);
      setEnv(next.env);
      setValues(next.values);
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, [presets]);

  // the envelope simulation, debounced, in the worker
  useEffect(() => {
    // new inputs: the run in flight belongs to the old ones
    runner.cancel();
    setRun(null);
    setRunError(null);
    if (env === 'none' || !spec || !envelope || !(Cbus > 0) || tooLong || tooFast) {
      setBusy(false);
      return;
    }
    setBusy(true);
    const id = window.setTimeout(() => {
      runner.run(spec, Cbus, envelope, (r, err) => {
        setBusy(false);
        setRun(r);
        setRunError(err);
      });
    }, 300);
    return () => window.clearTimeout(id);
  }, [env, spec, envelope, Cbus, tooLong, tooFast, runner]);

  // extraction against the amplitude, and the switch voltage against the power
  useEffect(() => {
    if (!result) {
      purge(extractRef.current);
      purge(switchRef.current);
      return;
    }
    let cancelled = false;
    const sw = result.sweep;
    const x = sw.map((p) => p.Voc);
    // a constant-voltage sink at V_g,crit for every amplitude that can reach it
    const cv = sw.map((p) => (p.Voc > result.Vgcrit ? evaluate('src.cv_extraction', { V_c: result.Vgcrit, V_oc: p.Voc }) : NaN));
    const extract: Record<string, unknown>[] = [
      { x, y: sw.map((p) => p.eta), name: labels.actual, mode: 'lines', line: { width: 3 } },
      { x, y: sw.map(() => result.etaLfr), name: labels.lfrCurve, mode: 'lines', line: { dash: 'dash' } },
      { x, y: cv, name: labels.cvCurve, mode: 'lines', line: { dash: 'dot' } },
      { x: [result.point.Voc], y: [result.point.eta], name: 'V_oc', mode: 'markers', marker: { size: 10 } },
    ];
    const sc = result.switchCurve;
    const switchTraces: Record<string, unknown>[] = [
      { x: sc.P, y: sc.Vds, name: labels.vdsAxis, mode: 'lines' },
      { x: [sc.P[0], sc.P[sc.P.length - 1]], y: [result.spec.Vrating, result.spec.Vrating], name: labels.rating, mode: 'lines', line: { dash: 'dot' } },
      { x: [result.point.P], y: [result.point.Vds], name: 'V_oc', mode: 'markers', marker: { size: 10 } },
    ];
    import('plotly.js-dist-min').then((mod) => {
      if (cancelled) return;
      const Plotly = mod.default ?? mod;
      if (extractRef.current) {
        Plotly.react(
          extractRef.current,
          extract,
          {
            ...LAYOUT,
            margin: { t: 16, r: 16, b: 48, l: 64 },
            xaxis: { title: { text: `${labels.amplitude} [V]` }, type: 'log' },
            yaxis: { title: { text: labels.share }, range: [0, 1.05] },
            shapes: [{ type: 'line', xref: 'x', yref: 'paper', x0: result.VocCrit, x1: result.VocCrit, y0: 0, y1: 1, line: { dash: 'dot', width: 1 } }],
          },
          { responsive: true, displaylogo: false },
        );
      }
      if (switchRef.current) {
        Plotly.react(
          switchRef.current,
          switchTraces,
          {
            ...LAYOUT,
            margin: { t: 16, r: 16, b: 48, l: 64 },
            xaxis: { title: { text: `${labels.powerAxis} [W]` }, type: 'log' },
            yaxis: { title: { text: `${labels.vdsAxis} [V]` } },
          },
          { responsive: true, displaylogo: false },
        );
      }
    });
    return () => {
      cancelled = true;
    };
  }, [result, labels]);

  // the envelope simulation
  useEffect(() => {
    if (!run) {
      purge(envRef.current);
      return;
    }
    let cancelled = false;
    const t = run.t.map((x) => x * 1e3);
    const traces: Record<string, unknown>[] = [
      { x: t, y: run.Voc, name: labels.voc, mode: 'lines', yaxis: 'y' },
      { x: t, y: run.Vbus, name: labels.vbus, mode: 'lines', yaxis: 'y' },
      { x: t, y: run.Pmax, name: labels.pAvail, mode: 'lines', line: { dash: 'dot' }, yaxis: 'y2' },
      { x: t, y: run.P, name: labels.pIn, mode: 'lines', yaxis: 'y2' },
    ];
    import('plotly.js-dist-min').then((mod) => {
      if (cancelled || !envRef.current) return;
      const Plotly = mod.default ?? mod;
      Plotly.react(
        envRef.current,
        traces,
        {
          ...LAYOUT,
          margin: { t: 16, r: 64, b: 48, l: 64 },
          xaxis: { title: { text: `${labels.time} [ms]` } },
          yaxis: { title: { text: `${labels.voltage} [V]` } },
          // an overlaying axis syncs its ticks to the first axis by default: give it its own
          yaxis2: { title: { text: `${labels.powerAxis} [W]` }, overlaying: 'y', side: 'right', tickmode: 'auto', showgrid: false },
        },
        { responsive: true, displaylogo: false },
      );
    });
    return () => {
      cancelled = true;
    };
  }, [run, labels]);

  function applyPreset(p: SourcePreset) {
    const next: Record<string, string> = {};
    for (const k of KEYS) next[k] = p.values[k] !== undefined ? String(p.values[k]) : '';
    setEnv(p.values.fenv !== undefined ? 'sine' : 'none');
    setValues(next);
  }

  const input = (f: Field) => {
    const id = `src-${f.key}`;
    return (
      <div key={f.key} className="pe-sim__row">
        <label htmlFor={id}>
          {f.label} {f.unit && <small>[{f.unit}]</small>}
        </label>
        <input id={id} type="number" step="any" value={values[f.key] ?? ''} onChange={(e) => setValues({ ...values, [f.key]: e.target.value })} />
        <span />
      </div>
    );
  };

  const r = result;
  const pt = r?.point;
  return (
    <div className="pe-tool pe-explorer pe-sim pe-design">
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
        <legend>{labels.source}</legend>
        {FIELDS.filter((f) => f.group === 'source').map(input)}
      </fieldset>
      <fieldset>
        <legend>{labels.converter}</legend>
        {FIELDS.filter((f) => f.group === 'converter').map(input)}
      </fieldset>
      <fieldset>
        <legend>{labels.envelope}</legend>
        <div className="pe-sim__buttons" role="group" aria-label={labels.envelope}>
          {ENVELOPES.map((k) => (
            <button key={k} type="button" aria-pressed={env === k} onClick={() => setEnv(k)}>
              {labels.envelopeKinds[k]}
            </button>
          ))}
        </div>
        {env === 'sine' && FIELDS.filter((f) => f.group === 'sine').map(input)}
        {env === 'points' && (
          <div className="pe-sim__row">
            <label htmlFor="src-pts">
              {labels.pointsHelp}
            </label>
            <input id="src-pts" type="text" value={values.pts ?? ''} onChange={(e) => setValues({ ...values, pts: e.target.value })} />
            <span />
          </div>
        )}
      </fieldset>
      <section aria-live="polite">
        {(!r || !envelopeValid) && <p className="pe-sim__error">{labels.invalid}</p>}
        {pt && pt.Vds > r!.spec.Vrating && <p className="pe-sim__error">{labels.overRating}</p>}
        {tooLong && (
          <p className="pe-sim__error">
            {labels.tooLong.replace('{n}', cycles.toLocaleString()).replace('{max}', ENVELOPE_MAX_CYCLES.toLocaleString())}
          </p>
        )}
        {busy && <p>{labels.running}</p>}
        {tooFast && need && (
          <p className="pe-sim__error">
            {labels.tooFast.replace('{n}', need.period.toLocaleString()).replace('{min}', String(ENVELOPE_MIN_CYCLES))}
          </p>
        )}
        {rippling && <p className="pe-sim__error">{labels.ripple}</p>}
        {runError && (
          <p className="pe-sim__error">
            {labels.runFailed} ({runError})
          </p>
        )}
      </section>
      {r && pt && (
        <>
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
              <tr>
                <th scope="row">{labels.rin}</th>
                <td>{fmt(r.Rin, 'Ω')}</td>
                <td>
                  <code>lfr.R_in</code>
                </td>
              </tr>
              <tr>
                <th scope="row">{labels.etaLfr}</th>
                <td>{fmt(100 * r.etaLfr, '%')}</td>
                <td>
                  <code>lfr.eta</code>
                </td>
              </tr>
              <tr>
                <th scope="row">{labels.vgcrit}</th>
                <td>{fmt(r.Vgcrit, 'V')}</td>
                <td>
                  <code>flyback.V_crit</code>
                </td>
              </tr>
              <tr>
                <th scope="row">{labels.voccrit}</th>
                <td>{fmt(r.VocCrit, 'V')}</td>
                <td>
                  <code>lfr.Vg</code>
                </td>
              </tr>
              <tr>
                <th scope="row">{labels.mode}</th>
                <td>
                  <strong>{labels.modes[pt.mode]}</strong>
                </td>
                <td />
              </tr>
              <tr>
                <th scope="row">{labels.vg}</th>
                <td>{fmt(pt.Vg, 'V')}</td>
                <td>
                  <code>{pt.mode === 'LFR' ? 'lfr.Vg' : 'flyback.V_crit'}</code>
                </td>
              </tr>
              <tr>
                <th scope="row">{labels.pmax}</th>
                <td>{fmt(pt.Pmax, 'W')}</td>
                <td>
                  <code>src.Pmax</code>
                </td>
              </tr>
              <tr>
                <th scope="row">{labels.eta}</th>
                <td>
                  <strong>{fmt(100 * pt.eta, '%')}</strong>
                </td>
                <td>
                  <code>{pt.mode === 'LFR' ? 'lfr.eta' : 'src.cv_extraction'}</code>
                </td>
              </tr>
              <tr>
                <th scope="row">{labels.power}</th>
                <td>{fmt(pt.P, 'W')}</td>
                <td />
              </tr>
              <tr>
                <th scope="row">{labels.vds}</th>
                <td>{fmt(pt.Vds, 'V')}</td>
                <td>
                  <code>flyback.Vds_off</code>
                </td>
              </tr>
              <tr>
                <th scope="row">{labels.vdsCcm}</th>
                <td>{fmt(r.VdsCcm, 'V')}</td>
                <td>
                  <code>flyback.Vds_clamped</code>
                </td>
              </tr>
              <tr>
                <th scope="row">{labels.plfr}</th>
                <td>
                  {fmt(r.Plfr, 'W')} ({r.limit === 'ccm' ? labels.limitCcm : labels.limitSwitch})
                </td>
                <td>
                  <code>dcm.P_in</code>
                </td>
              </tr>
              {run && (
                <tr>
                  <th scope="row">{labels.etaEnvelope}</th>
                  <td>
                    <strong>{fmt(100 * run.eta, '%')}</strong>
                  </td>
                  <td>
                    <code>src.cv_extraction</code>, <code>src.Pmax</code>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          {Cbus > 0 && (
            <p>
              <a href={`${simulatorHref}#${simulatorHash(r.spec, Cbus)}`}>▶ {labels.simulate}</a>
            </p>
          )}
        </>
      )}
      <p className="pe-loss__caption">{labels.extractionChart}</p>
      <div ref={extractRef} role="img" aria-label={labels.extractionChart} style={{ width: '100%', height: 340 }} />
      <p className="pe-loss__caption">{labels.switchChart}</p>
      <div ref={switchRef} role="img" aria-label={labels.switchChart} style={{ width: '100%', height: 340 }} />
      {env !== 'none' && (
        <>
          <p className="pe-loss__caption">{labels.envelopeChart}</p>
          <div ref={envRef} role="img" aria-label={labels.envelopeChart} style={{ width: '100%', height: 360 }} />
        </>
      )}
      <p>
        <small>{labels.shareUrl}</small>
      </p>
    </div>
  );
}
