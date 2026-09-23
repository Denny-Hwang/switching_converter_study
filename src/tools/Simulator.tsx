/**
 * In-browser converter simulator (docs/BUILD_SPEC.md §4, §5 "Simulate"):
 * pick a topology, set the parameters (SI units), and see one steady-state
 * switching period computed by pe-core's piecewise-linear engine, the
 * detected conduction mode, and the simulated values next to the analytic
 * equations of the catalogue. All state lives in the URL hash, so "Try it"
 * links can preset it and any view can be shared.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { evaluate, sim } from 'pe-core';
import { isToolHash } from '../lib/hash';
import type { SimReply } from './simulator.worker';

type Topology = sim.Topology;
type SimParams = sim.SimParams;
type SimResult = sim.SimResult;

export interface SimLabels {
  topology: string;
  presets: string;
  parameters: string;
  load: string;
  loadResistive: string;
  loadFixed: string;
  source: string;
  sourceHint: string;
  nonideal: string;
  status: string;
  mode: string;
  converged: string;
  notConverged: string;
  cycles: string;
  compare: string;
  compareNote: string;
  quantity: string;
  simulated: string;
  formula: string;
  error: string;
  losses: string;
  conduction: string;
  diode: string;
  capacitive: string;
  efficiency: string;
  invalid: string;
  nodeNeedsRon: string;
  share: string;
  time: string;
  running: string;
  slider: string;
  topologies: Record<Topology, string>;
}

export interface SimPreset {
  id: string;
  label: string;
  topology: Topology;
  values: Record<string, number>;
}

interface Props {
  locale: 'en' | 'ko';
  labels: SimLabels;
  presets: SimPreset[];
}

const TOPOLOGIES: Topology[] = ['buck', 'boost', 'buckboost', 'flyback', 'forward'];

interface FieldState {
  topo: Topology;
  load: 'res' | 'fixed';
  source: boolean;
}

interface Field {
  key: string;
  label: (s: FieldState) => string;
  unit: string;
  show: (s: FieldState) => boolean;
  group: 'main' | 'nonideal' | 'source';
}

const always = () => true;
const isolated = (s: FieldState) => s.topo === 'flyback' || s.topo === 'forward';
const FIELDS: Field[] = [
  { key: 'Vg', label: () => 'V_g', unit: 'V', show: (s) => !s.source, group: 'main' },
  { key: 'D', label: () => 'D', unit: '', show: always, group: 'main' },
  { key: 'fs', label: () => 'f_s', unit: 'Hz', show: always, group: 'main' },
  { key: 'L', label: (s) => (s.topo === 'flyback' ? 'L_M' : 'L'), unit: 'H', show: always, group: 'main' },
  { key: 'n', label: () => 'n', unit: '', show: isolated, group: 'main' },
  { key: 'nr', label: () => 'n_r', unit: '', show: (s) => s.topo === 'forward', group: 'main' },
  { key: 'LM', label: () => 'L_M', unit: 'H', show: (s) => s.topo === 'forward', group: 'main' },
  { key: 'R', label: () => 'R', unit: 'Ω', show: (s) => s.load === 'res', group: 'main' },
  { key: 'C', label: () => 'C', unit: 'F', show: (s) => s.load === 'res', group: 'main' },
  { key: 'V', label: () => 'V', unit: 'V', show: (s) => s.load === 'fixed', group: 'main' },
  { key: 'Ron', label: () => 'R_on', unit: 'Ω', show: always, group: 'nonideal' },
  { key: 'RL', label: () => 'R_L', unit: 'Ω', show: always, group: 'nonideal' },
  { key: 'VF', label: () => 'V_F', unit: 'V', show: always, group: 'nonideal' },
  { key: 'Cnode', label: () => 'C_node', unit: 'F', show: (s) => s.topo !== 'forward', group: 'nonideal' },
  { key: 'Voc', label: () => 'V_oc', unit: 'V', show: (s) => s.source, group: 'source' },
  { key: 'Rs', label: () => 'R_s', unit: 'Ω', show: (s) => s.source, group: 'source' },
  { key: 'Cbus', label: () => 'C_bus', unit: 'F', show: (s) => s.source, group: 'source' },
];
const KEYS = FIELDS.map((f) => f.key);

/** Sliders: D is linear on (0, 1); the other positive parameters move over one decade either side of an anchor. */
const D_RANGE = { min: 0.01, max: 0.99, step: 0.01 };
const DECADES = 1;

/** Anchor of each positive field's logarithmic slider (the value when a preset was loaded or typed). */
export function sliderAnchors(values: Record<string, string>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const k of KEYS) {
    const v = parseField(values[k]);
    if (Number.isFinite(v) && v > 0) out[k] = v;
  }
  return out;
}

/** The value a logarithmic slider position (decades from the anchor) stands for, to three significant digits. */
export function fromSlider(anchor: number, decades: number): string {
  return String(Number((anchor * 10 ** decades).toPrecision(3)));
}

function readHash(): URLSearchParams {
  return new URLSearchParams(typeof window === 'undefined' ? '' : window.location.hash.replace(/^#/, ''));
}

/** A number field's value; an empty or partial field is NaN, never 0. */
export function parseField(raw: string | undefined): number {
  const t = (raw ?? '').trim();
  return t === '' ? Number.NaN : Number(t);
}

/** Simulator parameters from the form state, or an error key. */
export function toParams(fs: FieldState, values: Record<string, string>): SimParams | { error: 'invalid' | 'node' } {
  const num = (k: string, fallback?: number) => {
    const v = parseField(values[k]);
    return Number.isFinite(v) ? v : (fallback ?? Number.NaN);
  };
  const shown = FIELDS.filter((f) => f.show(fs));
  for (const f of shown) {
    const optional = f.group === 'nonideal';
    const v = parseField(values[f.key]);
    if (!(Number.isFinite(v) || (optional && (values[f.key] ?? '').trim() === ''))) return { error: 'invalid' };
    if (!optional && f.key !== 'Vg' && !(v > 0)) return { error: 'invalid' };
    if (optional && v < 0) return { error: 'invalid' };
  }
  const D = num('D');
  if (!(D > 0 && D < 1)) return { error: 'invalid' };
  const Cnode = fs.topo === 'forward' ? 0 : num('Cnode', 0);
  const Ron = num('Ron', 0);
  if (Cnode > 0 && !(Ron > 0)) return { error: 'node' };
  const p: SimParams = {
    topology: fs.topo,
    Vg: fs.source ? 0 : num('Vg'),
    D,
    fs: num('fs'),
    L: num('L'),
    Ron,
    RL: num('RL', 0),
    VF: num('VF', 0),
    Cnode,
    load: fs.load === 'res' ? { kind: 'resistive', R: num('R'), C: num('C') } : { kind: 'fixed', V: num('V') },
  };
  if (isolated(fs)) p.n = num('n');
  if (fs.topo === 'forward') {
    p.nr = num('nr');
    p.LM = num('LM');
  }
  if (fs.source) p.source = { Voc: num('Voc'), Rs: num('Rs'), Cbus: num('Cbus') };
  if (!fs.source && !(p.Vg > 0)) return { error: 'invalid' };
  return p;
}

function fmt(x: number | undefined): string {
  if (x === undefined || !Number.isFinite(x)) return '—';
  const a = Math.abs(x);
  return a !== 0 && (a < 1e-3 || a >= 1e5) ? x.toExponential(3) : Number(x.toPrecision(4)).toString();
}

interface CompareRow {
  label: string;
  unit: string;
  sim: number;
  formula: number;
  eq?: string;
}

/**
 * Simulated quantities next to the catalogue's equations, at the operating
 * point the result was computed for (its own parameters, so a pending run
 * never pairs new parameters with an old result).
 */
export function compareRows(r: SimResult): CompareRow[] {
  const p = r.params;
  const rows: CompareRow[] = [];
  const Vin = r.avg.v_in!;
  const V = r.avg.v_out!;
  const n = p.n ?? 1;
  if (p.load.kind === 'resistive') {
    const RL = p.RL ?? 0;
    if (p.topology === 'boost' && r.mode === 'CCM' && RL > 0 && !p.Ron && !p.VF) {
      // the winding resistance is the only loss: the catalogue has the boost's ratio with it
      rows.push({
        label: '|M|',
        unit: '',
        sim: Math.abs(r.M),
        formula: evaluate('boost.ccm.M_RL', { D: p.D, R: p.load.R, R_L: RL }),
        eq: 'boost.ccm.M_RL',
      });
    } else {
      rows.push({ label: '|M|', unit: '', sim: Math.abs(r.M), formula: Math.abs(sim.analyticM(p, r.K, r.Kcrit)) });
    }
    if (r.mode !== 'DCM' && (p.topology === 'buck' || p.topology === 'boost' || p.topology === 'buckboost')) {
      const eq = `${p.topology}.IL`;
      rows.push({
        label: 'I_L',
        unit: 'A',
        sim: r.avg.i_L!,
        formula: evaluate(eq, p.topology === 'buck' ? { V, R: p.load.R } : { V, D: p.D, R: p.load.R }),
        eq,
      });
    }
  }
  // the rise of the inductor current while the switch is on (from the start of
  // the period to the last sample of the gate-on intervals): the peak-to-peak
  // ripple in CCM and DCM, also when a node capacitance rings in the idle
  // interval or makes the current peak after turn-off; not shown when the
  // ideal converter would not raise the current (an output held at or above
  // the buck's V_g or the forward converter's n V_g)
  const iL = r.waveforms.i_L as number[];
  const t = r.waveforms.t as number[];
  const ivs = r.waveforms.interval as string[];
  const tOff = (p.D / p.fs) * (1 + 1e-9);
  let kOff = 0;
  for (let k = 0; k < t.length && t[k]! <= tOff; k++) if (ivs[k] === 'on' || ivs[k] === 'onL0') kOff = k;
  const ripple = sim.analyticRipplePP(p, Vin, V);
  if (ripple > 0) rows.push({ label: 'Δi_L,pp (on)', unit: 'A', sim: iL[kOff]! - iL[0]!, formula: ripple });
  const vds: Record<Topology, [string, Record<string, number>]> = {
    buck: ['buck.Vds', { V_g: Vin }],
    boost: ['boost.Vds', { V }],
    buckboost: ['buckboost.Vds', { V_g: Vin, V }],
    flyback: ['flyback.Vds_off', { V_g: Vin, V, V_D: p.VF ?? 0, n }],
    forward: ['forward.Vds', { V_g: Vin, n_r: p.nr ?? 1 }],
  };
  const [eq, inputs] = vds[p.topology];
  if (r.mode !== 'DCM' || p.Cnode === undefined || p.Cnode === 0) {
    rows.push({ label: 'V_DS,max', unit: 'V', sim: r.max.v_sw!, formula: evaluate(eq, inputs), eq });
  }
  if (p.topology === 'flyback' && r.mode === 'DCM') {
    // in DCM the flyback's input is a loss-free resistor
    rows.push({ label: 'R_in', unit: 'Ω', sim: Vin / r.avg.i_in!, formula: evaluate('lfr.R_in', { L_M: p.L, f_s: p.fs, D: p.D }), eq: 'lfr.R_in' });
  }
  if (p.topology === 'flyback' && p.load.kind === 'fixed' && p.source && r.mode !== 'DCM') {
    // CCM holds the bus at the critical input voltage
    rows.push({
      label: 'V_g,crit',
      unit: 'V',
      sim: Vin,
      formula: evaluate('flyback.V_crit', { V: p.load.V, V_D: p.VF ?? 0, D: p.D, n }),
      eq: 'flyback.V_crit',
    });
  }
  return rows;
}

/** The anchor a slider takes when its field is committed: the typed value if it lies outside the slider's range. */
export function nextAnchor(anchor: number | undefined, raw: string): number | undefined {
  const v = parseField(raw);
  if (!(Number.isFinite(v) && v > 0)) return anchor;
  if (anchor === undefined || v < anchor / 10 ** DECADES || v > anchor * 10 ** DECADES) return v;
  return anchor;
}

/**
 * The simulator's state from a URL hash: a field missing from the hash takes
 * the topology's preset, a field present but empty stays empty (an ideal part).
 */
export function stateFromHash(h: URLSearchParams, presets: SimPreset[]): { fs: FieldState; values: Record<string, string> } {
  const first = presets[0];
  const topo = (TOPOLOGIES as string[]).includes(h.get('topo') ?? '') ? (h.get('topo') as Topology) : (first?.topology ?? 'buck');
  const base = presets.find((p) => p.topology === topo) ?? first;
  const values: Record<string, string> = {};
  for (const k of KEYS) values[k] = h.get(k) ?? (base?.values[k] !== undefined ? String(base.values[k]) : '');
  return {
    fs: { topo, load: h.get('load') === 'fixed' ? 'fixed' : 'res', source: h.get('src') === '1' },
    values,
  };
}

/** The URL hash of the form: every shown field, an empty one as `key=`. */
export function hashOf(fs: FieldState, values: Record<string, string>): string {
  const q = new URLSearchParams({ topo: fs.topo, load: fs.load, src: fs.source ? '1' : '0' });
  for (const f of FIELDS) if (f.show(fs)) q.set(f.key, values[f.key] ?? '');
  return q.toString();
}

function initialState(presets: SimPreset[]): { fs: FieldState; values: Record<string, string> } {
  return stateFromHash(readHash(), presets);
}

type Done = (result: SimResult | null, error: string | null) => void;

/**
 * Runs the simulator in a Web Worker. A new request, or cancel(), abandons
 * the run in flight (the worker is replaced), so a long run never delays the
 * next one and a stale result never arrives.
 */
function useSimRunner(): { run: (params: SimParams, done: Done) => void; cancel: () => void } {
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
  const run = useCallback((params: SimParams, done: Done) => {
    const id = ++seq.current;
    if (typeof Worker === 'undefined') {
      try {
        done(sim.simulate(params), null);
      } catch (e) {
        done(null, e instanceof Error ? e.message : String(e));
      }
      return;
    }
    if (worker.current && inFlight.current) {
      worker.current.terminate();
      worker.current = null;
    }
    if (!worker.current) {
      worker.current = new Worker(new URL('./simulator.worker.ts', import.meta.url), { type: 'module' });
    }
    const w = worker.current;
    inFlight.current = true;
    w.onmessage = (e: MessageEvent<SimReply>) => {
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
    w.postMessage({ id, params });
  }, []);
  return useMemo(() => ({ run, cancel }), [run, cancel]);
}

export default function Simulator({ labels, presets }: Props) {
  const init = useMemo(() => initialState(presets), [presets]);
  const [fstate, setFstate] = useState<FieldState>(init.fs);
  const [values, setValues] = useState<Record<string, string>>(init.values);
  const [anchors, setAnchors] = useState<Record<string, number>>(() => sliderAnchors(init.values));
  const [result, setResult] = useState<SimResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [slow, setSlow] = useState(false);
  const plotRef = useRef<HTMLDivElement>(null);
  const runner = useSimRunner();

  const params = useMemo(() => toParams(fstate, values), [fstate, values]);

  // URL hash = state
  useEffect(() => {
    window.history.replaceState(null, '', `#${hashOf(fstate, values)}`);
  }, [fstate, values]);

  // simulate (debounced, in a worker; "Simulating…" appears only for a slow run)
  useEffect(() => {
    runner.cancel();
    setSlow(false);
    if ('error' in params) {
      setBusy(false);
      setError(params.error === 'node' ? labels.nodeNeedsRon : labels.invalid);
      setResult(null);
      return;
    }
    setBusy(true);
    let slowTimer = 0;
    const id = window.setTimeout(() => {
      slowTimer = window.setTimeout(() => setSlow(true), 400);
      runner.run(params, (r, err) => {
        window.clearTimeout(slowTimer);
        setSlow(false);
        setBusy(false);
        if (r) {
          setResult(r);
          setError(null);
        } else {
          setResult(null);
          setError(`${labels.invalid} (${err})`);
        }
      });
    }, 150);
    return () => {
      window.clearTimeout(id);
      window.clearTimeout(slowTimer);
    };
  }, [params, labels, runner]);

  // The state follows the URL hash: a link to this page with another preset
  // (or the browser's back button) changes only the hash, which does not
  // remount the island. Our own replaceState() fires no hashchange.
  useEffect(() => {
    const onHash = () => {
      const h = readHash();
      if (!isToolHash(h, [...KEYS, 'topo', 'load', 'src'])) return; // an in-page anchor, not a new state
      const next = stateFromHash(h, presets);
      setFstate(next.fs);
      setValues(next.values);
      setAnchors(sliderAnchors(next.values));
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, [presets]);

  // waveforms
  useEffect(() => {
    const el = plotRef.current;
    if (!el) return;
    if (!result) {
      // no result for the current inputs: remove the previous waveforms too
      if (el.hasChildNodes()) {
        import('plotly.js-dist-min').then((mod) => (mod.default ?? mod).purge(el));
      }
      return;
    }
    let cancelled = false;
    const w = result.waveforms;
    const t = (w.t as number[]).map((x) => x * 1e6);
    const src = !!result.params.source;
    const traces: Record<string, unknown>[] = [
      { x: t, y: w.i_L, name: 'i_L', mode: 'lines', xaxis: 'x', yaxis: 'y' },
      { x: t, y: w.i_D, name: 'i_D', mode: 'lines', line: { dash: 'dot' }, xaxis: 'x', yaxis: 'y' },
      { x: t, y: w.v_L, name: 'v_L', mode: 'lines', xaxis: 'x', yaxis: 'y2' },
      { x: t, y: w.v_sw, name: 'v_DS', mode: 'lines', xaxis: 'x', yaxis: 'y3' },
      { x: t, y: w.v_out, name: 'v_out', mode: 'lines', xaxis: 'x', yaxis: 'y4' },
    ];
    if (src) traces.push({ x: t, y: w.v_in, name: 'v_bus', mode: 'lines', xaxis: 'x', yaxis: 'y5' });
    if (result.params.topology === 'forward') {
      traces.push({ x: t, y: w.i_M, name: 'i_M', mode: 'lines', line: { dash: 'dash' }, xaxis: 'x', yaxis: 'y' });
    }
    const rows = src ? 5 : 4;
    import('plotly.js-dist-min').then((mod) => {
      if (cancelled) return;
      const Plotly = mod.default ?? mod;
      Plotly.react(
        el,
        traces,
        {
          grid: { rows, columns: 1, pattern: 'coupled', roworder: 'top to bottom' },
          margin: { t: 16, r: 16, b: 48, l: 64 },
          xaxis: { title: { text: `${labels.time} [µs]` } },
          yaxis: { title: { text: '[A]' } },
          yaxis2: { title: { text: 'v_L [V]' } },
          yaxis3: { title: { text: 'v_DS [V]' } },
          yaxis4: { title: { text: 'v_out [V]' } },
          ...(src ? { yaxis5: { title: { text: 'v_bus [V]' } } } : {}),
          paper_bgcolor: 'rgba(0,0,0,0)',
          plot_bgcolor: 'rgba(0,0,0,0)',
          legend: { orientation: 'h', y: 1.08 },
        },
        { responsive: true, displaylogo: false },
      );
    });
    return () => {
      cancelled = true;
    };
  }, [result, labels]);

  function applyPreset(p: SimPreset) {
    const next: Record<string, string> = {};
    for (const k of KEYS) next[k] = p.values[k] !== undefined ? String(p.values[k]) : '';
    setFstate({ topo: p.topology, load: p.values.V !== undefined && p.values.R === undefined ? 'fixed' : 'res', source: p.values.Voc !== undefined });
    setValues(next);
    setAnchors(sliderAnchors(next));
  }

  function setField(key: string, raw: string) {
    setValues((prev) => ({ ...prev, [key]: raw }));
  }

  /** Re-anchor a field's slider when the typed value is committed (not on every keystroke). */
  function commitField(key: string) {
    setAnchors((prev) => {
      const a = nextAnchor(prev[key], values[key] ?? '');
      return a === prev[key] ? prev : { ...prev, [key]: a! };
    });
  }

  function changeTopology(t: Topology) {
    const base = presets.find((p) => p.topology === t);
    if (base) applyPreset(base);
    else setFstate({ ...fstate, topo: t });
  }

  const shown = FIELDS.filter((f) => f.show(fstate));
  const slider = (f: Field) => {
    const name = `${f.label(fstate)} (${labels.slider})`;
    const v = parseField(values[f.key]);
    const text = `${values[f.key] ?? ''} ${f.unit}`.trim();
    if (f.key === 'D') {
      return (
        <input
          type="range"
          aria-label={name}
          aria-valuetext={text}
          min={D_RANGE.min}
          max={D_RANGE.max}
          step={D_RANGE.step}
          value={Number.isFinite(v) ? Math.min(D_RANGE.max, Math.max(D_RANGE.min, v)) : 0.5}
          onChange={(e) => setField('D', e.target.value)}
        />
      );
    }
    const a = anchors[f.key];
    if (a === undefined) return <span />;
    const pos = Number.isFinite(v) && v > 0 ? Math.log10(v / a) : 0;
    return (
      <input
        type="range"
        aria-label={name}
        aria-valuetext={text}
        min={-DECADES}
        max={DECADES}
        step={0.01}
        value={Math.min(DECADES, Math.max(-DECADES, pos))}
        onChange={(e) => setValues((prev) => ({ ...prev, [f.key]: fromSlider(a, Number(e.target.value)) }))}
      />
    );
  };
  const input = (f: Field) => {
    const id = `sim-${f.key}`;
    return (
      <div key={f.key} className="pe-sim__row">
        <label htmlFor={id}>
          {f.label(fstate)} {f.unit && <small>[{f.unit}]</small>}
        </label>
        <input
          id={id}
          type="number"
          step="any"
          value={values[f.key] ?? ''}
          onChange={(e) => setField(f.key, e.target.value)}
          onBlur={() => commitField(f.key)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commitField(f.key);
          }}
        />
        {f.group !== 'nonideal' && slider(f)}
      </div>
    );
  };
  const eff = result && result.energy.input > 0 ? result.energy.output / result.energy.input : Number.NaN;
  const rows = result?.converged ? compareRows(result) : [];

  return (
    <div className="pe-tool pe-explorer pe-sim">
      <fieldset>
        <legend>{labels.topology}</legend>
        <div className="pe-sim__buttons" role="group" aria-label={labels.topology}>
          {TOPOLOGIES.map((t) => (
            <button key={t} type="button" aria-pressed={fstate.topo === t} onClick={() => changeTopology(t)}>
              {labels.topologies[t]}
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
        <legend>{labels.parameters}</legend>
        <label className="pe-explorer__row" htmlFor="sim-load">
          <span>{labels.load}</span>
          <select
            id="sim-load"
            value={fstate.load}
            onChange={(e) => setFstate({ ...fstate, load: e.target.value === 'fixed' ? 'fixed' : 'res' })}
          >
            <option value="res">{labels.loadResistive}</option>
            <option value="fixed">{labels.loadFixed}</option>
          </select>
        </label>
        <label className="pe-explorer__row" htmlFor="sim-src">
          <span>{labels.source}</span>
          <input id="sim-src" type="checkbox" checked={fstate.source} onChange={(e) => setFstate({ ...fstate, source: e.target.checked })} />
        </label>
        {fstate.source && (
          <p>
            <small>{labels.sourceHint}</small>
          </p>
        )}
        {shown.filter((f) => f.group !== 'nonideal').map(input)}
      </fieldset>
      <fieldset>
        <legend>{labels.nonideal}</legend>
        {shown.filter((f) => f.group === 'nonideal').map(input)}
      </fieldset>
      <section className="pe-sim__status" aria-live="polite">
        <h3>{labels.status}</h3>
        {error && <p className="pe-sim__error">{error}</p>}
        {((busy && !result && !error) || slow) && <p>{labels.running}</p>}
        {result && (
          <p>
            {labels.mode}: <strong className={`pe-sim__mode pe-sim__mode--${result.mode}`}>{result.mode}</strong>
            {Number.isFinite(result.K) && (
              <>
                {' '}
                · K = {fmt(result.K)}, K_crit = {fmt(result.Kcrit)}
              </>
            )}{' '}
            · {result.converged ? labels.converged : labels.notConverged} ({labels.cycles}: {result.cycles})
          </p>
        )}
      </section>
      {result?.converged && (
        <>
          <table className="pe-sim__table">
            <caption>{labels.compare}</caption>
            <thead>
              <tr>
                <th scope="col">{labels.quantity}</th>
                <th scope="col">{labels.simulated}</th>
                <th scope="col">{labels.formula}</th>
                <th scope="col">{labels.error}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.label}>
                  <th scope="row">
                    {r.label} {r.unit && <small>[{r.unit}]</small>}
                    {r.eq && (
                      <>
                        {' '}
                        <code>{r.eq}</code>
                      </>
                    )}
                  </th>
                  <td>{fmt(r.sim)}</td>
                  <td>{fmt(r.formula)}</td>
                  <td>{fmt(((r.sim - r.formula) / Math.abs(r.formula)) * 100)} %</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p>
            <small>{labels.compareNote}</small>
          </p>
          <table className="pe-sim__table">
            <caption>{labels.losses}</caption>
            <tbody>
              <tr>
                <th scope="row">{labels.conduction}</th>
                <td>{fmt(result.losses.conduction)} W</td>
              </tr>
              <tr>
                <th scope="row">{labels.diode}</th>
                <td>{fmt(result.losses.diode)} W</td>
              </tr>
              <tr>
                <th scope="row">{labels.capacitive}</th>
                <td>{fmt(result.losses.capacitive)} W</td>
              </tr>
              <tr>
                <th scope="row">{labels.efficiency}</th>
                <td>{fmt(eff * 100)} %</td>
              </tr>
            </tbody>
          </table>
        </>
      )}
      <div
        ref={plotRef}
        role="img"
        aria-label={`${labels.topologies[fstate.topo]}: i_L, i_D, v_L, v_DS, v_out`}
        style={{ width: '100%', height: fstate.source ? 760 : 640 }}
      />
      <p>
        <small>{labels.share}</small>
      </p>
    </div>
  );
}
