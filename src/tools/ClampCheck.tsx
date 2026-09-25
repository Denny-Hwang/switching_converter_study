/**
 * Clamp check (docs/BUILD_SPEC.md §5): a flyback's primary clamp, a TVS or an
 * RCD clamp, at one operating point: the reflected voltage, the leakage
 * energy, the clamp voltage at the actual clamp current, the switch voltage
 * against its rating, the clamp dissipation and the output voltage an
 * unloaded flyback runs up to. The calculation is pe-core's clampCheck(), in
 * which every formula is a catalogue equation; each result names its
 * equation. All state lives in the URL hash.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { clampCheck, evaluate, type ClampKind, type ClampResult, type ClampSpec, type ClampWarning } from 'pe-core';
import { isToolHash } from '../lib/hash';
import { PLOT_CONFIG, axis, baseLayout, logTicks, sub, usePlotTheme } from '../lib/plot';
import { fmtValue } from '../lib/format';
import { useStateHash } from '../lib/useStateHash';
import { Choices, FieldLabel, NumInput, Rich } from './ToolUi';
import { parseSI } from '../lib/siparse';

export interface ClampLabels {
  /** How values are entered: SI units, with or without a prefix (lib/siparse.ts). */
  siHint: string;
  kind: string;
  kinds: Record<ClampKind, string>;
  presets: string;
  operating: string;
  tvsParts: string;
  rcdParts: string;
  results: string;
  quantity: string;
  value: string;
  equation: string;
  vor: string;
  elk: string;
  plk: string;
  treset: string;
  rd: string;
  vclamp: string;
  vds: string;
  margin: string;
  pclamp: string;
  ratio: string;
  ceiling: string;
  chart: string;
  clampAxis: string;
  powerAxis: string;
  vdsAxis: string;
  rating: string;
  design: string;
  invalid: string;
  share: string;
  plotHint: string;
  warnings: Record<ClampWarning, string>;
}

export interface ClampPreset {
  id: string;
  label: string;
  kind: ClampKind;
  values: Record<string, number>;
}

interface Props {
  locale: 'en' | 'ko';
  labels: ClampLabels;
  presets: ClampPreset[];
  /** What each symbol means (i18n/symbols.ts). */
  symbols: Record<string, string>;
}

const KINDS: ClampKind[] = ['tvs', 'rcd'];

type Group = 'operating' | 'tvs' | 'rcd';
interface Field {
  key: string;
  label: string;
  unit: string;
  group: Group;
  /** May be zero (the diode drop). */
  zero?: boolean;
}

export const FIELDS: Field[] = [
  { key: 'Vg', label: 'V_g,max', unit: 'V', group: 'operating' },
  { key: 'V', label: 'V', unit: 'V', group: 'operating' },
  { key: 'VD', label: 'V_D', unit: 'V', group: 'operating', zero: true },
  { key: 'n', label: 'n = N_s/N_p', unit: '', group: 'operating' },
  { key: 'Llk', label: 'L_lk', unit: 'H', group: 'operating' },
  { key: 'Ipk', label: 'I_pk', unit: 'A', group: 'operating' },
  { key: 'fs', label: 'f_s', unit: 'Hz', group: 'operating' },
  { key: 'Vrating', label: 'V_DS,rated', unit: 'V', group: 'operating' },
  { key: 'VBR', label: 'V_BR', unit: 'V', group: 'tvs' },
  { key: 'VCL', label: 'V_CL', unit: 'V', group: 'tvs' },
  { key: 'IPP', label: 'I_PP', unit: 'A', group: 'tvs' },
  { key: 'R', label: 'R_clamp', unit: 'Ω', group: 'rcd' },
];
const KEYS = FIELDS.map((f) => f.key);
const shownFor = (kind: ClampKind) => FIELDS.filter((f) => f.group === 'operating' || f.group === kind);

/** A number field's value; an empty or non-finite field is NaN, never 0. */
function num(raw: string | undefined): number {
  const t = (raw ?? '').trim();
  const v = parseSI(t);
  return Number.isFinite(v) ? v : Number.NaN;
}

/** The clamp check's specification from the form, or null when a field is missing or out of range. */
export function toClampSpec(kind: ClampKind, values: Record<string, string>): ClampSpec | null {
  for (const f of shownFor(kind)) {
    const v = num(values[f.key]);
    if (f.zero ? !(v >= 0) : !(v > 0)) return null;
  }
  const base = {
    Vg: num(values.Vg),
    V: num(values.V),
    VD: num(values.VD),
    n: num(values.n),
    Llk: num(values.Llk),
    Ipk: num(values.Ipk),
    fs: num(values.fs),
    Vrating: num(values.Vrating),
  };
  if (kind === 'tvs') {
    const clamp = { kind: 'tvs' as const, VBR: num(values.VBR), VCL: num(values.VCL), IPP: num(values.IPP) };
    // the clamping voltage at the peak pulse current lies above the breakdown voltage
    if (!(clamp.VCL > clamp.VBR)) return null;
    return { ...base, clamp };
  }
  return { ...base, clamp: { kind: 'rcd', R: num(values.R) } };
}

/** Results with SI prefixes (lib/format.ts). */
const fmt = (x: number | undefined, unit = '') => fmtValue(x, unit);

/** A value, or a range when its two ends differ; the unit is written once when both ends share it ("60 – 66 V"). */
export function range(r: { low: number; high: number }, unit: string): string {
  if (Math.abs(r.high - r.low) <= 1e-12 * Math.abs(r.low)) return fmt(r.low, unit);
  const lo = fmt(r.low, unit);
  const hi = fmt(r.high, unit);
  if (lo === hi) return lo;
  const i = lo.lastIndexOf(' ');
  const j = hi.lastIndexOf(' ');
  return i > 0 && j > 0 && lo.slice(i) === hi.slice(j) ? `${lo.slice(0, i)} – ${hi}` : `${lo} – ${hi}`;
}

function readHash(): URLSearchParams {
  return new URLSearchParams(typeof window === 'undefined' ? '' : window.location.hash.replace(/^#/, ''));
}

/**
 * The clamp type and the fields from the URL hash; a field missing from the
 * hash takes the clamp type's preset, a field present but empty stays empty.
 */
export function stateFromHash(h: URLSearchParams, presets: ClampPreset[]): { kind: ClampKind; values: Record<string, string> } {
  const kind = (KINDS as string[]).includes(h.get('clamp') ?? '') ? (h.get('clamp') as ClampKind) : (presets[0]?.kind ?? 'tvs');
  const base = presets.find((p) => p.kind === kind) ?? presets[0];
  const values: Record<string, string> = {};
  for (const k of KEYS) values[k] = h.has(k) ? h.get(k)! : base?.values[k] !== undefined ? String(base.values[k]) : '';
  return { kind, values };
}

/** The URL hash of the form: every field (the other clamp's too), an empty one as `key=`. */
export function hashOf(kind: ClampKind, values: Record<string, string>): string {
  const q = new URLSearchParams({ clamp: kind });
  for (const f of FIELDS) q.set(f.key, values[f.key] ?? '');
  return q.toString();
}

/** The check for the form, or null when a field is missing or out of range, or the inputs overflow. */
export function checkOf(kind: ClampKind, values: Record<string, string>): ClampResult | null {
  const spec = toClampSpec(kind, values);
  if (!spec) return null;
  try {
    const r = clampCheck(spec);
    const finite = [r.VOR, r.Elk, r.Plk, r.Vclamp.low, r.Vclamp.high, r.Vds].every(Number.isFinite);
    return finite ? r : null;
  } catch {
    return null;
  }
}

/** Clamp dissipation and switch voltage against the clamp voltage, for the trade-off chart (catalogue equations). */
export function tradeoff(r: ClampResult): { V: number[]; P: number[]; Vds: number[] } {
  const s = r.spec;
  const lo = 1.05 * r.VOR;
  const hi = Math.max(3 * r.VOR, 1.2 * Math.max(r.Vclamp.high, s.Vrating - s.Vg));
  const V = Array.from({ length: 121 }, (_, k) => lo + ((hi - lo) * k) / 120);
  return {
    V,
    P: V.map((v) => evaluate('clamp.P', { L_lk: s.Llk, I_pk: s.Ipk, f_s: s.fs, V_clamp: v, V_OR: r.VOR })),
    Vds: V.map((v) => evaluate('clamp.Vds', { V_g: s.Vg, V_clamp: v })),
  };
}

export default function ClampCheck({ labels, presets, symbols }: Props) {
  const init = useMemo(() => stateFromHash(readHash(), presets), [presets]);
  const [kind, setKind] = useState<ClampKind>(init.kind);
  const [values, setValues] = useState<Record<string, string>>(init.values);
  const plotRef = useRef<HTMLDivElement>(null);
  const theme = usePlotTheme();

  const result = useMemo(() => checkOf(kind, values), [kind, values]);

  useStateHash(hashOf(kind, values), [...KEYS, 'clamp']);

  // The state follows the URL hash: a link to this page with other values
  // (or the browser's back button) changes only the hash, which does not
  // remount the island. Our own replaceState() fires no hashchange.
  useEffect(() => {
    const onHash = () => {
      const h = readHash();
      if (!isToolHash(h, [...KEYS, 'clamp'])) return; // an in-page anchor, not a new state
      const next = stateFromHash(h, presets);
      setKind(next.kind);
      setValues(next.values);
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, [presets]);

  // clamp dissipation and switch voltage against the clamp voltage
  useEffect(() => {
    const el = plotRef.current;
    if (!el) return;
    if (!result || result.warnings.includes('belowReflected')) {
      // no result for the current inputs: remove the previous chart too
      if (el.hasChildNodes()) {
        import('plotly.js-dist-min').then((mod) => (mod.default ?? mod).purge(el));
      }
      return;
    }
    let cancelled = false;
    const t = tradeoff(result);
    const [c0, c1, c2] = theme.colors;
    const traces: Record<string, unknown>[] = [
      { x: t.V, y: t.P, name: labels.powerAxis, mode: 'lines', yaxis: 'y', line: { color: c0, width: 2 }, hovertemplate: '%{y:.3~g} W' },
      { x: t.V, y: t.Vds, name: labels.vdsAxis, mode: 'lines', yaxis: 'y2', line: { color: c1, width: 2 }, hovertemplate: '%{y:.4~g} V' },
      {
        x: [t.V[0], t.V[t.V.length - 1]],
        y: [result.spec.Vrating, result.spec.Vrating],
        name: labels.rating,
        mode: 'lines',
        line: { color: c2, width: 2, dash: 'dot' },
        yaxis: 'y2',
        hovertemplate: '%{y:.4~g} V',
      },
    ];
    const P = t.P.filter((y) => Number.isFinite(y) && y > 0);
    import('plotly.js-dist-min').then((mod) => {
      if (cancelled) return;
      const Plotly = mod.default ?? mod;
      Plotly.react(
        el,
        traces,
        {
          ...baseLayout(theme),
          hovermode: 'x unified',
          xaxis: axis(theme, `${sub(labels.clampAxis)} [V]`),
          yaxis: axis(theme, `${labels.powerAxis} [W]`, { type: 'log', ...logTicks(Math.min(...P), Math.max(...P)) }),
          // an overlaying axis syncs its ticks to the first axis by default: give it its own
          yaxis2: axis(theme, `${labels.vdsAxis} [V]`, { overlaying: 'y', side: 'right', tickmode: 'auto', showgrid: false }),
          shapes: [
            {
              type: 'rect',
              xref: 'x',
              yref: 'paper',
              x0: result.Vclamp.low,
              x1: Math.max(result.Vclamp.high, result.Vclamp.low * 1.002),
              y0: 0,
              y1: 1,
              fillcolor: theme.band,
              line: { width: 0 },
            },
          ],
          annotations: [
            {
              x: result.Vclamp.high,
              y: 0.98,
              xref: 'x',
              yref: 'paper',
              text: labels.design,
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

  function applyPreset(p: ClampPreset) {
    const next: Record<string, string> = {};
    for (const k of KEYS) next[k] = p.values[k] !== undefined ? String(p.values[k]) : '';
    setKind(p.kind);
    setValues(next);
  }

  function changeKind(k: ClampKind) {
    // keep the operating point; take the clamp's own values from its preset where they are empty
    const base = presets.find((p) => p.kind === k);
    const next = { ...values };
    for (const f of FIELDS.filter((f) => f.group === k)) {
      if ((next[f.key] ?? '') === '' && base?.values[f.key] !== undefined) next[f.key] = String(base.values[f.key]);
    }
    setKind(k);
    setValues(next);
  }

  const input = (f: Field) => {
    const id = `clamp-${f.key}`;
    return (
      <div key={f.key} className="pe-row pe-row--full">
        <FieldLabel htmlFor={id} sym={f.label} meaning={symbols[f.label]} unit={f.unit} />
        <NumInput id={id} value={values[f.key] ?? ''} onChange={(e) => setValues({ ...values, [f.key]: e.target.value })} />
      </div>
    );
  };

  const r = result;
  return (
    <div className="pe-tool pe-clamp not-content">
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
              <Rich text={labels.operating} />
            </legend>
            {FIELDS.filter((f) => f.group === 'operating').map(input)}
          </fieldset>
          <fieldset>
            <legend>
              <Rich text={kind === 'tvs' ? labels.tvsParts : labels.rcdParts} />
            </legend>
            {FIELDS.filter((f) => f.group === kind).map(input)}
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
                  <tr>
                    <th scope="row">
                      <Rich text={labels.vor} />
                    </th>
                    <td>{fmt(r.VOR, 'V')}</td>
                    <td>
                      <code>flyback.V_OR</code>
                    </td>
                  </tr>
                  <tr>
                    <th scope="row">
                      <Rich text={labels.elk} />
                    </th>
                    <td>{fmt(r.Elk, 'J')}</td>
                    <td>
                      <code>flyback.leak.E</code>
                    </td>
                  </tr>
                  <tr>
                    <th scope="row">
                      <Rich text={labels.plk} />
                    </th>
                    <td>{fmt(r.Plk, 'W')}</td>
                    <td>
                      <code>flyback.leak.P</code>
                    </td>
                  </tr>
                  <tr>
                    <th scope="row">
                      <Rich text={labels.treset} />
                    </th>
                    <td>{fmt(r.tReset, 's')}</td>
                    <td>
                      <code>clamp.t_reset</code>
                    </td>
                  </tr>
                  {r.RD !== undefined && (
                    <tr>
                      <th scope="row">
                        <Rich text={labels.rd} />
                      </th>
                      <td>{fmt(r.RD, 'Ω')}</td>
                      <td>
                        <code>tvs.R_D</code>
                      </td>
                    </tr>
                  )}
                  <tr>
                    <th scope="row">
                      <Rich text={labels.vclamp} />
                    </th>
                    <td>
                      <strong>{range(r.Vclamp, 'V')}</strong>
                    </td>
                    <td>
                      <code>{r.spec.clamp.kind === 'tvs' ? 'tvs.V_clamp' : 'clamp.rcd.V'}</code>
                    </td>
                  </tr>
                  <tr>
                    <th scope="row">
                      <Rich text={labels.vds} />
                    </th>
                    <td>
                      <strong>{fmt(r.Vds, 'V')}</strong>
                    </td>
                    <td>
                      <code>clamp.Vds</code>
                    </td>
                  </tr>
                  <tr>
                    <th scope="row">
                      <Rich text={labels.margin} />
                    </th>
                    <td>
                      {fmt(r.margin, 'V')} ({fmt((100 * r.margin) / r.spec.Vrating, '%')})
                    </td>
                    <td />
                  </tr>
                  <tr>
                    <th scope="row">
                      <Rich text={labels.pclamp} />
                    </th>
                    <td>
                      <strong>{range(r.P, 'W')}</strong>
                    </td>
                    <td>
                      <code>clamp.P</code>
                    </td>
                  </tr>
                  <tr>
                    <th scope="row">
                      <Rich text={labels.ratio} />
                    </th>
                    <td>{range({ low: r.P.low / r.Plk, high: r.P.high / r.Plk }, '×')}</td>
                    <td />
                  </tr>
                  {r.ceiling && (
                    <tr>
                      <th scope="row">
                        <Rich text={labels.ceiling} />
                      </th>
                      <td>{range(r.ceiling, 'V')}</td>
                      <td>
                        <code>flyback.V_ceiling</code>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
          <p className="pe-chart__title">
            <Rich text={labels.chart} />
          </p>
          <div ref={plotRef} className="pe-chart" role="img" aria-label={labels.chart} style={{ height: 380 }} />
          {r && <p className="pe-tool__hint">{labels.plotHint}</p>}
        </div>
      </div>
      <p className="pe-tool__hint">{labels.share}</p>
    </div>
  );
}
