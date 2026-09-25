/**
 * Magnetics designer (docs/BUILD_SPEC.md §5): an inductor or a flyback
 * transformer on a core of the core table (the manufacturer's published
 * values, cited on the page) or on any core entered by hand. It gives the
 * turns for the flux-density limit, the gap, the peak flux density and the
 * swing, the data sheet's gapped sets, the window utilization, each winding's
 * dc resistance and ac resistance factor (Dowell) and, for the flyback, the
 * leakage of the winding arrangement. The calculation is pe-core's
 * magnetics(), in which every formula is a catalogue equation; each result
 * names its equation. All state lives in the URL hash.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { COPPER, frCurve, magnetics, type Arrangement, type MagCore, type MagDevice, type MagResult, type MagSpec, type MagWarning, type WindingResult } from 'pe-core';
import { CORES, coreById, type CoreId } from '../lib/cores';
import { fmtValue, formatSI } from '../lib/format';
import { isToolHash } from '../lib/hash';
import { PLOT_CONFIG, axis, baseLayout, logTicks, sub, usePlotTheme } from '../lib/plot';
import { useStateHash } from '../lib/useStateHash';
import { Choices, FieldLabel, NumInput, Rich } from './ToolUi';
import { parseSI } from '../lib/siparse';

export interface MagLabels {
  /** How values are entered: SI units, with or without a prefix (lib/siparse.ts). */
  siHint: string;
  device: string;
  devices: Record<MagDevice, string>;
  presets: string;
  core: string;
  custom: string;
  coreSource: string;
  operating: string;
  coreData: string;
  window: string;
  winding: string;
  primary: string;
  secondary: string;
  arrangement: string;
  arrangements: Record<Arrangement, string>;
  optional: string;
  fewest: string;
  turnsTable: string;
  windingsTable: string;
  quantity: string;
  value: string;
  equation: string;
  primaryCol: string;
  secondaryCol: string;
  nmin: string;
  n: string;
  nP: string;
  nFewest: string;
  nGiven: string;
  alreq: string;
  mue: string;
  gap: string;
  bpk: string;
  bpkMin: string;
  bac: string;
  ns: string;
  nActual: string;
  rho: string;
  delta: string;
  turns: string;
  aw: string;
  nl: string;
  eta: string;
  rdc: string;
  phi: string;
  fr: string;
  rac: string;
  pdc: string;
  ku: string;
  pdcTotal: string;
  llk: string;
  options: string;
  gapCol: string;
  alCol: string;
  turnsCol: string;
  lCol: string;
  bCol: string;
  fitsCol: string;
  useCol: string;
  yes: string;
  no: string;
  use: string;
  /** "Use {N} turns": the button's name for assistive technology. */
  useAria: string;
  chart: string;
  freqAxis: string;
  invalid: string;
  share: string;
  plotHint: string;
  warnings: Record<MagWarning, string>;
}

export interface MagPreset {
  id: string;
  label: string;
  device: MagDevice;
  core: CoreId;
  arrangement?: Arrangement;
  values: Record<string, number>;
}

interface Props {
  locale: 'en' | 'ko';
  labels: MagLabels;
  presets: MagPreset[];
  /** What each symbol means (i18n/symbols.ts). */
  symbols: Record<string, string>;
  /** Each table core's data sheet: its citation label and its bibliography entry. */
  coreSources: Record<CoreId, { label: string; href: string }>;
}

const DEVICES: MagDevice[] = ['inductor', 'flyback'];
const ARRANGEMENTS: Arrangement[] = ['ps', 'psp'];
type CoreChoice = CoreId | 'custom';
const CORE_CHOICES: CoreChoice[] = [...CORES.map((c) => c.id), 'custom'];

type Group = 'operating' | 'core' | 'window' | 'primary' | 'secondary';
interface Field {
  key: string;
  label: (d: MagDevice) => string;
  unit: string;
  group: Group;
  /** Shown for the flyback only. */
  flyback?: boolean;
  /** May be zero. */
  zero?: boolean;
  /** May be left empty. */
  optional?: boolean;
  /** A whole number (strands, layers, turns). */
  integer?: boolean;
  /** Any finite value (a temperature). */
  signed?: boolean;
}

const fly = (d: MagDevice) => d === 'flyback';
export const FIELDS: Field[] = [
  { key: 'L', label: (d) => (fly(d) ? 'L_M' : 'L'), unit: 'H', group: 'operating' },
  { key: 'Ipk', label: (d) => (fly(d) ? 'I_p,pk' : 'I_L,pk'), unit: 'A', group: 'operating' },
  { key: 'Irms', label: (d) => (fly(d) ? 'I_p,rms' : 'I_L,rms'), unit: 'A', group: 'operating' },
  { key: 'dI', label: (d) => (fly(d) ? 'Δi_M' : 'Δi_L'), unit: 'A', group: 'operating', zero: true, optional: true },
  { key: 'fs', label: () => 'f_s', unit: 'Hz', group: 'operating' },
  { key: 'Bmax', label: () => 'B_max', unit: 'T', group: 'operating' },
  { key: 'n', label: () => 'n = N_s/N_p', unit: '', group: 'operating', flyback: true },
  { key: 'IrmsS', label: () => 'I_s,rms', unit: 'A', group: 'operating', flyback: true },
  { key: 'Ae', label: () => 'A_e', unit: 'm²', group: 'core' },
  { key: 'Amin', label: () => 'A_min', unit: 'm²', group: 'core' },
  { key: 'le', label: () => 'l_e', unit: 'm', group: 'core' },
  { key: 'AL0', label: () => 'A_L0', unit: 'H', group: 'core' },
  { key: 'WA', label: () => 'W_A', unit: 'm²', group: 'core' },
  { key: 'MLT', label: () => 'MLT', unit: 'm', group: 'core' },
  { key: 'N', label: (d) => (fly(d) ? 'N_p' : 'N'), unit: '', group: 'window', optional: true, integer: true },
  { key: 'Tw', label: () => 'T_w', unit: '°C', group: 'window', signed: true },
  { key: 'bw', label: () => 'b_w', unit: 'm', group: 'window' },
  { key: 'KuMax', label: () => 'K_u,max', unit: '', group: 'window' },
  { key: 'hg', label: () => 'h_g', unit: 'm', group: 'window', flyback: true, zero: true },
  { key: 'dP', label: () => 'd_w', unit: 'm', group: 'primary' },
  { key: 'oP', label: () => 'd_o', unit: 'm', group: 'primary' },
  { key: 'ksP', label: () => 'k_s', unit: '', group: 'primary', integer: true },
  { key: 'mP', label: () => 'M_l', unit: '', group: 'primary', integer: true },
  { key: 'dS', label: () => 'd_w', unit: 'm', group: 'secondary', flyback: true },
  { key: 'oS', label: () => 'd_o', unit: 'm', group: 'secondary', flyback: true },
  { key: 'ksS', label: () => 'k_s', unit: '', group: 'secondary', flyback: true, integer: true },
  { key: 'mS', label: () => 'M_l', unit: '', group: 'secondary', flyback: true, integer: true },
];
const KEYS = FIELDS.map((f) => f.key);
const CORE_KEYS = FIELDS.filter((f) => f.group === 'core').map((f) => f.key);
const HASH_KEYS = [...KEYS, 'dev', 'core', 'arr'];
const shownFor = (d: MagDevice) => FIELDS.filter((f) => !f.flyback || fly(d));

/** A number field's value; an empty or non-finite field is NaN, never 0. */
function num(raw: string | undefined): number {
  const t = (raw ?? '').trim();
  const v = parseSI(t);
  return Number.isFinite(v) ? v : Number.NaN;
}

/** A value for the form and the URL: six significant digits (the table's values exactly). */
const sig = (x: number) => String(Number(x.toPrecision(6)));

/** The form's core fields with a table core's values. */
export function withCore(values: Record<string, string>, id: CoreId): Record<string, string> {
  const c = coreById(id)!.core;
  return { ...values, Ae: sig(c.Ae), Amin: sig(c.Amin ?? c.Ae), le: sig(c.le), AL0: sig(c.AL0), WA: sig(c.WA), MLT: sig(c.MLT) };
}

/** The designer's specification from the form, or null when a field is missing or out of range. */
export function toMagSpec(device: MagDevice, coreId: CoreChoice, arr: Arrangement, values: Record<string, string>): MagSpec | null {
  for (const f of shownFor(device)) {
    if (f.optional && (values[f.key] ?? '').trim() === '') continue;
    const v = num(values[f.key]);
    if (f.signed ? !Number.isFinite(v) : f.zero ? !(v >= 0) : !(v > 0)) return null;
    if (f.integer && !Number.isInteger(v)) return null;
  }
  const v = (k: string) => num(values[k]);
  const table = coreId === 'custom' ? undefined : coreById(coreId);
  const core: MagCore = table ? table.core : { Ae: v('Ae'), Amin: v('Amin'), le: v('le'), AL0: v('AL0'), WA: v('WA'), MLT: v('MLT') };
  const alpha = COPPER.alpha20;
  // the smallest cross-section is at most the effective area; an insulated wire at least as thick as its copper;
  // a utilization of at most 1; copper's resistivity positive at the temperature
  if (!((core.Amin ?? core.Ae) <= core.Ae) || !(v('KuMax') <= 1) || !(1 + alpha * (v('Tw') - 20) > 0)) return null;
  if (!(v('oP') >= v('dP'))) return null;
  // the half ripple rides on a dc current of at least zero, so it cannot exceed the peak
  if (v('dI') > v('Ipk')) return null;
  const spec: MagSpec = {
    device,
    L: v('L'),
    Ipk: v('Ipk'),
    Irms: v('Irms'),
    fs: v('fs'),
    Bmax: v('Bmax'),
    core,
    primary: { d: v('dP'), dOuter: v('oP'), ks: v('ksP'), layers: v('mP') },
    bw: v('bw'),
    Tw: v('Tw'),
    KuMax: v('KuMax'),
  };
  if (Number.isFinite(v('dI'))) spec.dI = v('dI');
  if (Number.isFinite(v('N'))) spec.N = v('N');
  if (fly(device)) {
    if (!(v('oS') >= v('dS'))) return null;
    spec.n = v('n');
    spec.IrmsS = v('IrmsS');
    spec.secondary = { d: v('dS'), dOuter: v('oS'), ks: v('ksS'), layers: v('mS') };
    spec.arrangement = arr;
    spec.hg = v('hg');
  }
  return spec;
}

/** The design for the form, or null when a field is missing or out of range, or the inputs overflow. */
export function resultOf(device: MagDevice, coreId: CoreChoice, arr: Arrangement, values: Record<string, string>): MagResult | null {
  const spec = toMagSpec(device, coreId, arr, values);
  if (!spec) return null;
  try {
    const r = magnetics(spec);
    const w = [r.primary, ...(r.secondary ? [r.secondary] : [])];
    const finite = [r.Nmin, r.ALreq, r.mue, r.gap, r.Bpk, r.BpkMin, r.rho, r.delta, r.Ku, r.Pdc, ...w.flatMap((x) => [x.Rdc, x.FR, x.eta])].every(Number.isFinite);
    return finite ? r : null;
  } catch {
    return null;
  }
}

/** F_R of each winding from f_s/20 to 50 f_s (logarithmic), for the chart. */
export function frChart(r: MagResult): { f: number[]; primary: number[]; secondary?: number[] } {
  const s = r.spec;
  const f = Array.from({ length: 121 }, (_, k) => (s.fs / 20) * 1000 ** (k / 120));
  const layers = (w: { layers: number }) => Math.max(1, Math.round(w.layers));
  const primary = frCurve(s.primary, r.N, layers(s.primary), s, f);
  const secondary = s.secondary && r.Ns !== undefined ? frCurve(s.secondary, r.Ns, layers(s.secondary), s, f) : undefined;
  return { f, primary, secondary };
}

function readHash(): URLSearchParams {
  return new URLSearchParams(typeof window === 'undefined' ? '' : window.location.hash.replace(/^#/, ''));
}

interface State {
  device: MagDevice;
  core: CoreChoice;
  arr: Arrangement;
  values: Record<string, string>;
}

/**
 * The device, core, arrangement and fields from the URL hash; a field missing
 * from the hash takes the device's preset, a field present but empty stays
 * empty. A table core's fields always hold its table values.
 */
export function stateFromHash(h: URLSearchParams, presets: MagPreset[]): State {
  const device = (DEVICES as string[]).includes(h.get('dev') ?? '') ? (h.get('dev') as MagDevice) : (presets[0]?.device ?? 'inductor');
  const base = presets.find((p) => p.device === device) ?? presets[0];
  const core = (CORE_CHOICES as string[]).includes(h.get('core') ?? '') ? (h.get('core') as CoreChoice) : (base?.core ?? CORES[0]!.id);
  const arr = (ARRANGEMENTS as string[]).includes(h.get('arr') ?? '') ? (h.get('arr') as Arrangement) : (base?.arrangement ?? 'ps');
  let values: Record<string, string> = {};
  for (const k of KEYS) values[k] = base?.values[k] !== undefined ? String(base.values[k]) : '';
  // an own core's fields missing from the hash start from the preset's core
  if (base) values = withCore(values, base.core);
  for (const k of KEYS) if (h.has(k)) values[k] = h.get(k)!;
  if (core !== 'custom') values = withCore(values, core);
  return { device, core, arr, values };
}

/** The URL hash of the form: every field shown for the device, an empty one as `key=`. */
export function hashOf(s: State): string {
  const q = new URLSearchParams({ dev: s.device, core: s.core });
  if (fly(s.device)) q.set('arr', s.arr);
  for (const f of shownFor(s.device)) q.set(f.key, s.values[f.key] ?? '');
  return q.toString();
}

/** Results with SI prefixes, lengths and areas in millimetres (lib/format.ts). */
const fmt = (x: number | undefined, unit = '', digits = 4) => fmtValue(x, unit, digits);
/** A frequency tick: "5k", "100k", "2M". */
const freqTick = (v: number) => formatSI(v, 'Hz', 3).replace(/\s*Hz$/, '').replace(' ', '');

function Row({ label, value, eq, strong }: { label: string; value: string; eq?: string; strong?: boolean }) {
  return (
    <tr>
      <th scope="row">
        <Rich text={label} />
      </th>
      <td>{strong ? <strong>{value}</strong> : value}</td>
      <td>{eq && <code>{eq}</code>}</td>
    </tr>
  );
}

export default function MagneticsDesigner({ labels, presets, symbols, coreSources }: Props) {
  const init = useMemo(() => stateFromHash(readHash(), presets), [presets]);
  const [state, setState] = useState<State>(init);
  const plotRef = useRef<HTMLDivElement>(null);
  const theme = usePlotTheme();
  const { device, core, arr, values } = state;

  const result = useMemo(() => resultOf(device, core, arr, values), [device, core, arr, values]);

  useStateHash(hashOf(state), HASH_KEYS);

  // The state follows the URL hash: a link to this page with other values
  // (or the browser's back button) changes only the hash, which does not
  // remount the island. Our own replaceState() fires no hashchange.
  useEffect(() => {
    const onHash = () => {
      const h = readHash();
      if (!isToolHash(h, HASH_KEYS)) return; // an in-page anchor, not a new state
      setState(stateFromHash(h, presets));
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, [presets]);

  // F_R of each winding against frequency, with the switching frequency marked
  useEffect(() => {
    const el = plotRef.current;
    if (!el) return;
    if (!result) {
      // no result for the current inputs: remove the previous chart too
      if (el.hasChildNodes()) {
        import('plotly.js-dist-min').then((mod) => (mod.default ?? mod).purge(el));
      }
      return;
    }
    let cancelled = false;
    const c = frChart(result);
    const [c0, c1] = theme.colors;
    const flyback = result.spec.device === 'flyback';
    const traces: Record<string, unknown>[] = [
      {
        x: c.f,
        y: c.primary,
        name: flyback ? labels.primaryCol : 'F_R',
        mode: 'lines',
        line: { color: c0, width: 2 },
        hovertemplate: '%{y:.3~g}',
      },
    ];
    if (c.secondary) {
      traces.push({ x: c.f, y: c.secondary, name: labels.secondaryCol, mode: 'lines', line: { color: c1, width: 2 }, hovertemplate: '%{y:.3~g}' });
    }
    const ys = [...c.primary, ...(c.secondary ?? [])];
    const fs = result.spec.fs;
    import('plotly.js-dist-min').then((mod) => {
      if (cancelled) return;
      const Plotly = mod.default ?? mod;
      Plotly.react(
        el,
        traces,
        {
          ...baseLayout(theme),
          showlegend: flyback,
          hovermode: 'x unified',
          xaxis: axis(theme, `${labels.freqAxis} [Hz]`, { type: 'log', ...logTicks(c.f[0]!, c.f[c.f.length - 1]!, freqTick) }),
          yaxis: axis(theme, sub('F_R'), { type: 'log', ...logTicks(Math.min(...ys), Math.max(...ys)) }),
          shapes: [{ type: 'line', xref: 'x', yref: 'paper', x0: fs, x1: fs, y0: 0, y1: 1, line: { color: theme.line, width: 1.5, dash: 'dot' } }],
          annotations: [
            {
              x: Math.log10(fs),
              y: 1,
              xref: 'x',
              yref: 'paper',
              text: sub('f_s'),
              showarrow: false,
              xanchor: 'left',
              yanchor: 'top',
              xshift: 4,
              font: { size: 11, color: theme.muted },
            },
          ],
        },
        PLOT_CONFIG,
      );
    });
    return () => {
      cancelled = true;
    };
  }, [result, labels, theme]);

  function applyPreset(p: MagPreset) {
    const next: Record<string, string> = {};
    for (const k of KEYS) next[k] = p.values[k] !== undefined ? String(p.values[k]) : '';
    setState({ device: p.device, core: p.core, arr: p.arrangement ?? 'ps', values: withCore(next, p.core) });
  }

  function changeDevice(d: MagDevice) {
    // keep the core and the shared fields; take the device's own values from its preset where they are empty
    const base = presets.find((p) => p.device === d);
    const next = { ...values };
    for (const f of FIELDS.filter((f) => f.flyback)) {
      if ((next[f.key] ?? '') === '' && base?.values[f.key] !== undefined) next[f.key] = String(base.values[f.key]);
    }
    setState({ ...state, device: d, arr: state.arr, values: next });
  }

  function changeCore(c: CoreChoice) {
    setState({ ...state, core: c, values: c === 'custom' ? values : withCore(values, c) });
  }

  function edit(key: string, raw: string) {
    // editing a table core's value makes it a core of one's own
    const toCustom = CORE_KEYS.includes(key) && core !== 'custom';
    setState({ ...state, core: toCustom ? 'custom' : core, values: { ...values, [key]: raw } });
  }

  const input = (f: Field, idPrefix = 'mag') => {
    const id = `${idPrefix}-${f.key}`;
    const sym = f.label(device);
    const note = f.key === 'N' ? labels.fewest : f.optional ? labels.optional : undefined;
    return (
      <div key={f.key} className="pe-row pe-row--full">
        <FieldLabel htmlFor={id} sym={sym} meaning={symbols[sym]} unit={f.unit} note={note} />
        <NumInput id={id} value={values[f.key] ?? ''} onChange={(e) => edit(f.key, e.target.value)} />
      </div>
    );
  };
  const group = (g: Group) => shownFor(device).filter((f) => f.group === g).map((f) => input(f));

  const r = result;
  const flyback = device === 'flyback';
  const table = core === 'custom' ? undefined : coreById(core);
  const source = table ? coreSources[table.id] : undefined;
  const windings: WindingResult[] = r ? [r.primary, ...(r.secondary ? [r.secondary] : [])] : [];
  const cols = windings.length;
  /** One row of the windings table: a value per winding. */
  const wrow = (label: string, value: (w: WindingResult) => string, eq?: string) => (
    <tr key={label}>
      <th scope="row">
        <Rich text={label} />
      </th>
      {windings.map((w, i) => (
        <td key={i}>{value(w)}</td>
      ))}
      <td>{eq && <code>{eq}</code>}</td>
    </tr>
  );
  /** A row with one value for the whole device. */
  const srow = (label: string, value: string, eq?: string, strong?: boolean) => (
    <tr key={label}>
      <th scope="row">
        <Rich text={label} />
      </th>
      <td colSpan={cols}>{strong ? <strong>{value}</strong> : value}</td>
      <td>{eq && <code>{eq}</code>}</td>
    </tr>
  );

  return (
    <div className="pe-tool pe-mag not-content">
      <Choices legend={labels.device} items={DEVICES.map((d) => ({ id: d, label: labels.devices[d] }))} selected={device} onPick={changeDevice} />
      {presets.length > 0 && (
        <Choices
          legend={labels.presets}
          items={presets.map((p) => ({ id: p.id, label: p.label }))}
          onPick={(id) => applyPreset(presets.find((p) => p.id === id)!)}
          wide
        />
      )}
      <Choices
        legend={labels.core}
        items={CORE_CHOICES.map((c) => {
          const t = coreById(c);
          return { id: c, label: t ? `${t.name}, ${t.material}` : labels.custom };
        })}
        selected={core}
        onPick={changeCore}
        wide
      />
      {source && (
        <p className="pe-tool__hint">
          {labels.coreSource}: <a href={source.href}>{source.label}</a>
        </p>
      )}
      <div className="pe-split pe-split--results">
        <div className="pe-split__controls">
          <p className="pe-tool__hint">{labels.siHint}</p>
          <fieldset>
            <legend>
              <Rich text={labels.operating} />
            </legend>
            {group('operating')}
          </fieldset>
          <fieldset>
            <legend>
              <Rich text={labels.coreData} />
            </legend>
            {group('core')}
          </fieldset>
          <fieldset>
            <legend>
              <Rich text={labels.window} />
            </legend>
            {group('window')}
          </fieldset>
          {flyback && (
            <Choices legend={labels.arrangement} items={ARRANGEMENTS.map((a) => ({ id: a, label: labels.arrangements[a] }))} selected={arr} onPick={(a) => setState({ ...state, arr: a })} wide />
          )}
          <fieldset>
            <legend>
              <Rich text={flyback ? labels.primary : labels.winding} />
            </legend>
            {group('primary')}
          </fieldset>
          {flyback && (
            <fieldset>
              <legend>
                <Rich text={labels.secondary} />
              </legend>
              {group('secondary')}
            </fieldset>
          )}
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
                  <Rich text={labels.turnsTable} />
                </caption>
                <thead>
                  <tr>
                    <th scope="col">{labels.quantity}</th>
                    <th scope="col">{labels.value}</th>
                    <th scope="col">{labels.equation}</th>
                  </tr>
                </thead>
                <tbody>
                  <Row label={labels.nmin} value={fmt(r.Nmin)} eq="mag.N_Bmax" />
                  <Row label={`${flyback ? labels.nP : labels.n} (${r.spec.N !== undefined ? labels.nGiven : labels.nFewest})`} value={String(r.N)} strong />
                  <Row label={labels.alreq} value={fmt(r.ALreq, 'H')} eq="mag.L_from_AL" />
                  <Row label={labels.mue} value={fmt(r.mue, '', 4)} eq="mag.AL_gap" />
                  <Row label={labels.gap} value={r.gap > 0 ? fmt(r.gap, 'm', 3) : '—'} eq="mag.gap_length" strong />
                  <Row label={labels.bpk} value={fmt(r.Bpk, 'T', 3)} eq="mag.B_pk" />
                  <Row label={labels.bpkMin} value={fmt(r.BpkMin, 'T', 3)} eq="mag.B_pk" strong />
                  {r.Bac !== undefined && <Row label={labels.bac} value={`${fmt(r.Bac, 'T', 3)} (ΔB = ${fmt(2 * r.Bac, 'T', 3)})`} eq="mag.B_ac" />}
                  {r.Ns !== undefined && <Row label={labels.ns} value={String(r.Ns)} />}
                  {r.nActual !== undefined && <Row label={labels.nActual} value={fmt(r.nActual, '', 4)} />}
                </tbody>
              </table>
            </div>
          )}
          {r && (
            <div className="pe-scroll">
              <table className="pe-sim__table">
                <caption>
                  <Rich text={labels.windingsTable} />
                </caption>
                <thead>
                  <tr>
                    <th scope="col">{labels.quantity}</th>
                    {flyback ? (
                      <>
                        <th scope="col">{labels.primaryCol}</th>
                        <th scope="col">{labels.secondaryCol}</th>
                      </>
                    ) : (
                      <th scope="col">{labels.value}</th>
                    )}
                    <th scope="col">{labels.equation}</th>
                  </tr>
                </thead>
                <tbody>
                  {srow(labels.rho, fmt(r.rho, 'Ω·m'), 'wind.rho_T')}
                  {srow(labels.delta, fmt(r.delta, 'm', 3), 'wind.skin_depth')}
                  {flyback && wrow(labels.turns, (w) => String(w.N))}
                  {wrow(labels.aw, (w) => fmt(w.Aw, 'm²', 3), 'wind.round_area')}
                  {wrow(labels.nl, (w) => String(w.Nl))}
                  {wrow(labels.eta, (w) => fmt(w.eta, '', 3), 'wind.porosity')}
                  {wrow(labels.rdc, (w) => fmt(w.Rdc, 'Ω', 3), 'wind.dcr')}
                  {wrow(labels.phi, (w) => fmt(w.phi, '', 3), 'wind.phi_round')}
                  {wrow(labels.fr, (w) => fmt(w.FR, '', 3), 'wind.dowell')}
                  {wrow(labels.rac, (w) => fmt(w.Rac, 'Ω', 3))}
                  {wrow(labels.pdc, (w) => fmt(w.Pdc, 'W', 3), 'loss.cond')}
                  {srow(labels.ku, fmt(r.Ku, '', 3), 'wind.fill', true)}
                  {flyback && srow(labels.pdcTotal, fmt(r.Pdc, 'W', 3), undefined, true)}
                  {r.Llk !== undefined && srow(labels.llk, fmt(r.Llk, 'H', 3), arr === 'psp' ? 'xfmr.leakage.psp' : 'xfmr.leakage.ps', true)}
                </tbody>
              </table>
            </div>
          )}
          {r && r.options.length > 0 && (
            <div className="pe-scroll">
              <table className="pe-sim__table pe-mag__options">
                <caption>
                  <Rich text={labels.options} />
                </caption>
                <thead>
                  <tr>
                    <th scope="col">{labels.gapCol}</th>
                    <th scope="col">
                      <Rich text={labels.alCol} />
                    </th>
                    <th scope="col">{labels.turnsCol}</th>
                    <th scope="col">
                      <Rich text={labels.lCol} />
                    </th>
                    <th scope="col">
                      <Rich text={labels.bCol} />
                    </th>
                    <th scope="col">
                      <Rich text={labels.fitsCol} />
                    </th>
                    <th scope="col">{labels.useCol}</th>
                  </tr>
                </thead>
                <tbody>
                  {r.options.map((o) => (
                    <tr key={o.g} aria-current={o.N === r.N ? 'true' : undefined}>
                      <td>{fmt(o.g, 'm', 3)}</td>
                      <td>{fmt(o.AL, 'H', 3)}</td>
                      <td>{o.N}</td>
                      <td>{fmt(o.L, 'H', 4)}</td>
                      <td>{fmt(o.Bpk, 'T', 3)}</td>
                      <td>{o.ok ? labels.yes : labels.no}</td>
                      <td>
                        <button type="button" className="pe-mag__use" aria-label={labels.useAria.replace('{N}', String(o.N))} onClick={() => edit('N', String(o.N))}>
                          {labels.use}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="pe-chart__title">
            <Rich text={labels.chart} />
          </p>
          <div ref={plotRef} className="pe-chart" role="img" aria-label={labels.chart} style={{ height: 340 }} />
          {r && <p className="pe-tool__hint">{labels.plotHint}</p>}
        </div>
      </div>
      <p className="pe-tool__hint">{labels.share}</p>
    </div>
  );
}
