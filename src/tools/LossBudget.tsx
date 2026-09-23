/**
 * Loss budget (docs/BUILD_SPEC.md §5): the loss buckets of a converter --
 * conduction, capacitive switching, gate drive, core, diode, and the leakage
 * energy of a flyback -- against the load and the switching frequency, with
 * the efficiency. pe-core's lossBudget() simulates every point (in a Web
 * Worker) and applies the catalogue's loss equations to the simulated
 * currents. All state lives in the URL hash.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Bucket, LossBudget as Budget, LossPoint, LossSpec, sim } from 'pe-core';
import type { LossReply } from './lossbudget.worker';

type Topology = sim.Topology;

export interface LossLabels {
  topology: string;
  presets: string;
  operating: string;
  switchParts: string;
  diodeParts: string;
  inductorParts: string;
  leakage: string;
  optionalCore: string;
  nominal: string;
  bucket: string;
  power: string;
  share: string;
  equation: string;
  total: string;
  efficiency: string;
  mode: string;
  duty: string;
  vsLoad: string;
  vsFreq: string;
  outputPower: string;
  frequency: string;
  lossAxis: string;
  running: string;
  invalid: string;
  notRegulated: string;
  simulate: string;
  shareUrl: string;
  flybackRL: string;
  bpk: string;
  resetLimited: string;
  buckets: Record<Bucket, string>;
  topologies: Record<Topology, string>;
}

export interface LossPreset {
  id: string;
  label: string;
  topology: Topology;
  values: Record<string, number>;
}

interface Props {
  locale: 'en' | 'ko';
  labels: LossLabels;
  presets: LossPreset[];
  simulatorHref: string;
}

const TOPOLOGIES: Topology[] = ['buck', 'boost', 'buckboost', 'flyback', 'forward'];
const BUCKET_ORDER: Bucket[] = ['conduction', 'capacitive', 'gate', 'core', 'diode', 'clamp'];
const EQUATIONS: Record<Bucket, string[]> = {
  conduction: ['loss.cond'],
  capacitive: ['loss.sw.cap'],
  gate: ['loss.gate'],
  core: ['mag.B_pk', 'loss.steinmetz', 'loss.core'],
  diode: ['loss.diode'],
  clamp: ['flyback.leak.E', 'flyback.leak.P'],
};

type Group = 'operating' | 'switch' | 'diode' | 'inductor' | 'leakage';
interface Field {
  key: string;
  label: (t: Topology) => string;
  unit: string;
  group: Group;
  show: (t: Topology) => boolean;
  /** May be left empty (core data: all or none). */
  optional?: boolean;
}

const always = () => true;
const isolated = (t: Topology) => t === 'flyback' || t === 'forward';
export const FIELDS: Field[] = [
  { key: 'Vg', label: () => 'V_g', unit: 'V', group: 'operating', show: always },
  { key: 'V', label: (t) => (t === 'buckboost' ? '|V|' : 'V'), unit: 'V', group: 'operating', show: always },
  { key: 'P', label: () => 'P', unit: 'W', group: 'operating', show: always },
  { key: 'fs', label: () => 'f_s', unit: 'Hz', group: 'operating', show: always },
  { key: 'L', label: (t) => (t === 'flyback' ? 'L_M' : 'L'), unit: 'H', group: 'operating', show: always },
  { key: 'C', label: () => 'C', unit: 'F', group: 'operating', show: always },
  { key: 'n', label: () => 'n = N_s/N_p', unit: '', group: 'operating', show: isolated },
  { key: 'nr', label: () => 'n_r = N_r/N_p', unit: '', group: 'operating', show: (t) => t === 'forward' },
  { key: 'LM', label: () => 'L_M', unit: 'H', group: 'operating', show: (t) => t === 'forward' },
  { key: 'Ron', label: () => 'R_on', unit: 'Ω', group: 'switch', show: always },
  { key: 'Qg', label: () => 'Q_g', unit: 'C', group: 'switch', show: always },
  { key: 'Vgs', label: () => 'V_GS', unit: 'V', group: 'switch', show: always },
  { key: 'Cnode', label: () => 'C_node', unit: 'F', group: 'switch', show: (t) => t !== 'forward' },
  { key: 'VF', label: () => 'V_F', unit: 'V', group: 'diode', show: always },
  { key: 'rd', label: () => 'r_d', unit: 'Ω', group: 'diode', show: always },
  { key: 'RL', label: () => 'R_L', unit: 'Ω', group: 'inductor', show: always },
  { key: 'N', label: () => 'N', unit: '', group: 'inductor', show: always, optional: true },
  { key: 'Ae', label: () => 'A_e', unit: 'm²', group: 'inductor', show: always, optional: true },
  { key: 'Ve', label: () => 'V_e', unit: 'm³', group: 'inductor', show: always, optional: true },
  { key: 'k', label: () => 'k', unit: 'W/m³', group: 'inductor', show: always, optional: true },
  { key: 'alpha', label: () => 'α', unit: '', group: 'inductor', show: always, optional: true },
  { key: 'beta', label: () => 'β', unit: '', group: 'inductor', show: always, optional: true },
  { key: 'Llk', label: () => 'L_lk', unit: 'H', group: 'leakage', show: (t) => t === 'flyback', optional: true },
];
const KEYS = FIELDS.map((f) => f.key);
const CORE_KEYS = ['N', 'Ae', 'Ve', 'k', 'alpha', 'beta'];
/** Parts that may be zero (an ideal part). */
const MAY_BE_ZERO = new Set(['Ron', 'Qg', 'Vgs', 'Cnode', 'VF', 'rd', 'RL']);

function num(raw: string | undefined): number {
  const t = (raw ?? '').trim();
  return t === '' ? Number.NaN : Number(t);
}

/** The loss-budget specification from the form, or null when it is incomplete or out of range. */
export function toLossSpec(topology: Topology, values: Record<string, string>): LossSpec | null {
  const shown = FIELDS.filter((f) => f.show(topology));
  for (const f of shown) {
    const v = num(values[f.key]);
    const empty = (values[f.key] ?? '').trim() === '';
    if (f.optional && empty) continue;
    if (MAY_BE_ZERO.has(f.key) ? !(v >= 0) : !(v > 0)) return null;
  }
  const coreGiven = CORE_KEYS.filter((k) => (values[k] ?? '').trim() !== '');
  if (coreGiven.length !== 0 && coreGiven.length !== CORE_KEYS.length) return null;
  const s: LossSpec = {
    topology,
    Vg: num(values.Vg),
    V: num(values.V),
    P: num(values.P),
    fs: num(values.fs),
    L: num(values.L),
    C: num(values.C),
    Ron: num(values.Ron),
    Qg: num(values.Qg),
    Vgs: num(values.Vgs),
    Cnode: topology === 'forward' ? 0 : num(values.Cnode),
    VF: num(values.VF),
    rd: num(values.rd),
    RL: num(values.RL),
  };
  if (s.Cnode > 0 && !(s.Ron > 0)) return null; // the simulator discharges C_node through R_on
  if (isolated(topology)) s.n = num(values.n);
  if (topology === 'forward') {
    s.nr = num(values.nr);
    s.LM = num(values.LM);
  }
  if (coreGiven.length) {
    s.core = { N: num(values.N), Ae: num(values.Ae), Ve: num(values.Ve), k: num(values.k), alpha: num(values.alpha), beta: num(values.beta) };
  }
  if (topology === 'flyback' && Number.isFinite(num(values.Llk))) s.Llk = num(values.Llk);
  return s;
}

/** Simulator URL hash for one computed point (its regulated duty ratio, the non-ideal parts included). */
export function simulatorHash(s: LossSpec, p: LossPoint): string {
  // six significant digits: the output follows the duty ratio to about 1e-6
  const sig = (x: number) => String(Number(x.toPrecision(6)));
  const q = new URLSearchParams({ topo: s.topology, load: 'res', src: '0' });
  q.set('Vg', sig(s.Vg));
  q.set('D', sig(p.D));
  q.set('fs', sig(p.fs));
  q.set('L', sig(s.L));
  q.set('R', sig(p.R));
  q.set('C', sig(s.C));
  if (s.n !== undefined) q.set('n', sig(s.n));
  if (s.nr !== undefined) q.set('nr', sig(s.nr));
  if (s.LM !== undefined) q.set('LM', sig(s.LM));
  q.set('Ron', sig(s.Ron));
  q.set('RL', sig(s.RL));
  q.set('VF', sig(s.VF));
  q.set('Cnode', sig(s.topology === 'forward' ? 0 : s.Cnode));
  return q.toString();
}

function fmt(x: number | undefined, unit = ''): string {
  if (x === undefined || !Number.isFinite(x)) return '—';
  const a = Math.abs(x);
  const s = a !== 0 && (a < 1e-3 || a >= 1e5) ? x.toExponential(3) : Number(x.toPrecision(3)).toString();
  return unit ? `${s} ${unit}` : s;
}

function readHash(): URLSearchParams {
  return new URLSearchParams(typeof window === 'undefined' ? '' : window.location.hash.replace(/^#/, ''));
}

/**
 * The topology and the fields from the URL hash; a field missing from the
 * hash takes the topology's first preset, a field present but empty stays
 * empty (the core data or the leakage inductance left out on purpose).
 */
export function stateFromHash(h: URLSearchParams, presets: LossPreset[]): { topo: Topology; values: Record<string, string> } {
  const topo = (TOPOLOGIES as string[]).includes(h.get('topo') ?? '') ? (h.get('topo') as Topology) : presets[0]?.topology ?? 'buck';
  const base = presets.find((p) => p.topology === topo) ?? presets[0];
  const values: Record<string, string> = {};
  for (const k of KEYS) values[k] = h.has(k) ? h.get(k)! : base?.values[k] !== undefined ? String(base.values[k]) : '';
  return { topo, values };
}

/** The URL hash of the form: every shown field, an empty one as `key=`. */
export function hashOf(topo: Topology, values: Record<string, string>): string {
  const q = new URLSearchParams({ topo });
  for (const f of FIELDS) if (f.show(topo)) q.set(f.key, values[f.key] ?? '');
  return q.toString();
}

type Done = (result: Budget | null, error: string | null) => void;

/**
 * Runs lossBudget() in a Web Worker. A new request, or cancel(), abandons the
 * one in flight (the worker is replaced), so a reply to earlier inputs never
 * arrives after the inputs have changed.
 */
function useLossRunner(): { run: (spec: LossSpec, done: Done) => void; cancel: () => void } {
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
  const run = useCallback((spec: LossSpec, done: Done) => {
    const id = ++seq.current;
    if (worker.current && inFlight.current) {
      worker.current.terminate();
      worker.current = null;
    }
    if (!worker.current) worker.current = new Worker(new URL('./lossbudget.worker.ts', import.meta.url), { type: 'module' });
    const w = worker.current;
    inFlight.current = true;
    w.onmessage = (e: MessageEvent<LossReply>) => {
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
    w.postMessage({ id, spec });
  }, []);
  return useMemo(() => ({ run, cancel }), [run, cancel]);
}

export default function LossBudget({ labels, presets, simulatorHref }: Props) {
  const init = useMemo(() => stateFromHash(readHash(), presets), [presets]);
  const [topo, setTopo] = useState<Topology>(init.topo);
  const [values, setValues] = useState<Record<string, string>>(init.values);
  const [budget, setBudget] = useState<Budget | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const loadRef = useRef<HTMLDivElement>(null);
  const freqRef = useRef<HTMLDivElement>(null);
  const runner = useLossRunner();

  const spec = useMemo(() => toLossSpec(topo, values), [topo, values]);

  useEffect(() => {
    window.history.replaceState(null, '', `#${hashOf(topo, values)}`);
  }, [topo, values]);

  // The state follows the URL hash: a link to this page with other values
  // (or the browser's back button) changes only the hash, which does not
  // remount the island. Our own replaceState() fires no hashchange.
  useEffect(() => {
    const onHash = () => {
      const next = stateFromHash(readHash(), presets);
      setTopo(next.topo);
      setValues(next.values);
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, [presets]);

  useEffect(() => {
    // new inputs: the budget in flight belongs to the old ones
    runner.cancel();
    if (!spec) {
      setBudget(null);
      setError(labels.invalid);
      setBusy(false);
      return;
    }
    setBusy(true);
    const id = window.setTimeout(() => {
      runner.run(spec, (b, err) => {
        setBusy(false);
        setBudget(b);
        setError(b ? null : `${labels.invalid} (${err})`);
      });
    }, 250);
    return () => window.clearTimeout(id);
  }, [spec, labels, runner]);

  // stacked bars with the efficiency on a second axis
  useEffect(() => {
    if (!budget) {
      // no budget for the current inputs: remove the previous charts too
      for (const el of [loadRef.current, freqRef.current]) {
        if (el?.hasChildNodes()) import('plotly.js-dist-min').then((mod) => (mod.default ?? mod).purge(el));
      }
      return;
    }
    let cancelled = false;
    const etas = [...budget.load, ...budget.freq].map((p) => 100 * p.eta);
    // a common efficiency axis with some room, so that small changes are not magnified
    const etaRange = [Math.floor(Math.min(...etas) - 1), Math.min(100, Math.ceil(Math.max(...etas) + 0.5))];
    const draw = (el: HTMLDivElement | null, points: LossPoint[], x: (number | string)[], xTitle: string) => {
      if (!el) return;
      const used = BUCKET_ORDER.filter((b) => points.some((p) => p.losses[b] > 0));
      const traces: Record<string, unknown>[] = used.map((b) => ({
        type: 'bar',
        x,
        y: points.map((p) => p.losses[b]),
        name: labels.buckets[b],
      }));
      traces.push({ type: 'scatter', mode: 'lines+markers', x, y: points.map((p) => 100 * p.eta), name: labels.efficiency, yaxis: 'y2' });
      import('plotly.js-dist-min').then((mod) => {
        if (cancelled) return;
        const Plotly = mod.default ?? mod;
        Plotly.react(
          el,
          traces,
          {
            barmode: 'stack',
            margin: { t: 16, r: 64, b: 56, l: 64 },
            xaxis: { title: { text: xTitle }, type: typeof x[0] === 'string' ? 'category' : 'linear' },
            yaxis: { title: { text: labels.lossAxis } },
            yaxis2: { title: { text: `${labels.efficiency} [%]` }, overlaying: 'y', side: 'right', range: etaRange, tickformat: '.1f' },
            legend: { orientation: 'h', y: -0.3 },
            paper_bgcolor: 'rgba(0,0,0,0)',
            plot_bgcolor: 'rgba(0,0,0,0)',
          },
          { responsive: true, displaylogo: false },
        );
      });
    };
    draw(loadRef.current, budget.load, budget.load.map((p) => p.Pout), `${labels.outputPower} [W]`);
    // the frequencies are log-spaced: show them as categories, in kHz (a UI label only)
    draw(freqRef.current, budget.freq, budget.freq.map((p) => String(Number((p.fs / 1000).toPrecision(3)))), `${labels.frequency} [kHz]`);
    return () => {
      cancelled = true;
    };
  }, [budget, labels]);

  function applyPreset(p: LossPreset) {
    const next: Record<string, string> = {};
    for (const k of KEYS) next[k] = p.values[k] !== undefined ? String(p.values[k]) : '';
    setTopo(p.topology);
    setValues(next);
  }

  function changeTopology(t: Topology) {
    const base = presets.find((p) => p.topology === t);
    if (base) applyPreset(base);
    else setTopo(t);
  }

  const shown = FIELDS.filter((f) => f.show(topo));
  const input = (f: Field) => {
    const id = `loss-${f.key}`;
    return (
      <div key={f.key} className="pe-sim__row">
        <label htmlFor={id}>
          {f.label(topo)} {f.unit && <small>[{f.unit}]</small>}
        </label>
        <input id={id} type="number" step="any" value={values[f.key] ?? ''} onChange={(e) => setValues({ ...values, [f.key]: e.target.value })} />
        <span />
      </div>
    );
  };
  const group = (g: Group, legend: string, notes: string[] = []) => {
    const fields = shown.filter((f) => f.group === g);
    if (!fields.length) return null;
    return (
      <fieldset>
        <legend>{legend}</legend>
        {notes.map((note) => (
          <p key={note}>
            <small>{note}</small>
          </p>
        ))}
        {fields.map(input)}
      </fieldset>
    );
  };

  const nominal = budget?.load[budget.load.length - 1];
  const all = budget ? [...budget.load, ...budget.freq] : [];
  const unregulated = all.some((p) => !p.regulated || !p.converged);
  const resetLimited = all.some((p) => p.resetLimited);

  return (
    <div className="pe-tool pe-explorer pe-sim pe-loss">
      <fieldset>
        <legend>{labels.topology}</legend>
        <div className="pe-sim__buttons" role="group" aria-label={labels.topology}>
          {TOPOLOGIES.map((t) => (
            <button key={t} type="button" aria-pressed={topo === t} onClick={() => changeTopology(t)}>
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
      {group('operating', labels.operating)}
      {group('switch', labels.switchParts)}
      {group('diode', labels.diodeParts)}
      {group('inductor', labels.inductorParts, topo === 'flyback' ? [labels.flybackRL, labels.optionalCore] : [labels.optionalCore])}
      {group('leakage', labels.leakage)}
      <section aria-live="polite">
        {error && <p className="pe-sim__error">{error}</p>}
        {busy && <p>{labels.running}</p>}
        {unregulated && <p className="pe-sim__error">{labels.notRegulated}</p>}
        {resetLimited && <p className="pe-sim__error">{labels.resetLimited}</p>}
      </section>
      {budget && nominal && (
        <>
          <table className="pe-sim__table">
            <caption>{labels.nominal}</caption>
            <thead>
              <tr>
                <th scope="col">{labels.bucket}</th>
                <th scope="col">{labels.power}</th>
                <th scope="col">{labels.share}</th>
                <th scope="col">{labels.equation}</th>
              </tr>
            </thead>
            <tbody>
              {BUCKET_ORDER.filter((b) => b !== 'clamp' || budget.spec.topology === 'flyback').map((b) => (
                <tr key={b}>
                  <th scope="row">{labels.buckets[b]}</th>
                  <td>{fmt(nominal.losses[b], 'W')}</td>
                  <td>{fmt((100 * nominal.losses[b]) / nominal.total, '%')}</td>
                  <td>
                    {EQUATIONS[b].map((e) => (
                      <code key={e}>{e} </code>
                    ))}
                  </td>
                </tr>
              ))}
              <tr>
                <th scope="row">{labels.total}</th>
                <td>
                  <strong>{fmt(nominal.total, 'W')}</strong>
                </td>
                <td />
                <td />
              </tr>
              <tr>
                <th scope="row">{labels.efficiency}</th>
                <td>
                  <strong>{fmt(100 * nominal.eta, '%')}</strong>
                </td>
                <td />
                <td />
              </tr>
              <tr>
                <th scope="row">
                  {labels.mode} · {labels.duty}
                </th>
                <td>
                  {nominal.mode} · D = {fmt(nominal.D)}
                </td>
                <td />
                <td />
              </tr>
            </tbody>
          </table>
          {nominal.inputs.Bpk !== undefined && (
            <p>
              {labels.bpk}: <strong>{fmt(nominal.inputs.Bpk, 'T')}</strong> <code>mag.B_pk</code>
            </p>
          )}
          <p>
            <a href={`${simulatorHref}#${simulatorHash(budget.spec, nominal)}`}>▶ {labels.simulate}</a>
          </p>
        </>
      )}
      <p className="pe-loss__caption">{labels.vsLoad}</p>
      <div ref={loadRef} role="img" aria-label={labels.vsLoad} style={{ width: '100%', height: 380 }} />
      <p className="pe-loss__caption">{labels.vsFreq}</p>
      <div ref={freqRef} role="img" aria-label={labels.vsFreq} style={{ width: '100%', height: 380 }} />
      <p>
        <small>{labels.shareUrl}</small>
      </p>
    </div>
  );
}
