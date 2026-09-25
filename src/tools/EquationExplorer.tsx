/**
 * Equation explorer: evaluate any equation from the catalogue with pe-core,
 * sweep one input and plot the result. All state lives in the URL hash
 * (#eq=...&D=0.5&K=0.1&sweep=K) so every view is shareable; pages link here
 * with presets from synthetic examples ("Try it").
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import katex from 'katex';
import { catalog, evaluate } from 'pe-core';
import { PLOT_CONFIG, axis, baseLayout, usePlotTheme } from '../lib/plot';
import { latexHtml, symHtml } from '../lib/sym';
import { useStateHash } from '../lib/useStateHash';
import { FieldLabel, NumInput, Rich } from './ToolUi';
import { parseSI } from '../lib/siparse';

interface Labels {
  /** How values are entered: SI units, with or without a prefix (lib/siparse.ts). */
  siHint: string;
  equation: string;
  inputs: string;
  result: string;
  sweep: string;
  from: string;
  to: string;
  logx: string;
  invalid: string;
  share: string;
  plotHint: string;
  /** Marker name for the current inputs' point on the sweep. */
  current: string;
}

interface Props {
  locale: 'en' | 'ko';
  labels: Labels;
}

const ids = Object.keys(catalog.equations).sort();

function readHash(): URLSearchParams {
  return new URLSearchParams(typeof window === 'undefined' ? '' : window.location.hash.replace(/^#/, ''));
}

function defaultValue(name: string): number {
  const r = catalog.symbols[name]?.range;
  if (!r) return 1;
  return catalog.symbols[name]?.scale === 'log' ? Math.sqrt(r[0] * r[1]) : (r[0] + r[1]) / 2;
}

/** Display unit of a symbol: empty for dimensionless ("1") quantities. */
function unitLabel(name: string): string {
  const u = catalog.symbols[name]?.unit ?? '';
  return u === '1' ? '' : u;
}

/** What a symbol is, in the page's language. */
function meaningOf(name: string, locale: 'en' | 'ko'): string {
  const s = catalog.symbols[name];
  return (locale === 'ko' ? s?.meaning_ko : s?.meaning) ?? '';
}

/** A symbol inline, rendered by KaTeX from its catalogue LaTeX. */
function symbolHtml(name: string): string {
  return katex.renderToString(catalog.symbols[name]?.latex ?? name, { throwOnError: false });
}

/** Axis title: the symbol, what it is, and its unit ("D — duty ratio", "V — output voltage [V]"). */
function axisTitle(name: string, locale: 'en' | 'ko'): string {
  const u = unitLabel(name);
  const meaning = meaningOf(name, locale);
  return `${latexHtml(catalog.symbols[name]?.latex ?? name)}${meaning ? ` — ${symHtml(meaning)}` : ''}${u ? ` [${u}]` : ''}`;
}

/** A number field's value, the symbol's unit allowed after it; an empty or partial field is NaN, never 0. */
export function parseField(raw: string | undefined, unit?: string): number {
  return parseSI(raw, unit);
}

function fmt(x: number): string {
  if (!Number.isFinite(x)) return String(x);
  const a = Math.abs(x);
  return a !== 0 && (a < 1e-3 || a >= 1e5) ? x.toExponential(4) : Number(x.toPrecision(6)).toString();
}

export default function EquationExplorer({ locale, labels }: Props) {
  const initial = useMemo(readHash, []);
  const [eqId, setEqId] = useState(() => {
    const e = initial.get('eq');
    return e && catalog.equations[e] ? e : 'buck.dcm.M';
  });
  const meta = catalog.equations[eqId]!;
  const [values, setValues] = useState<Record<string, string>>(() => {
    const out: Record<string, string> = {};
    for (const v of catalog.equations[eqId]!.variables) out[v] = initial.get(v) ?? String(defaultValue(v));
    return out;
  });
  const [sweep, setSweep] = useState(() => {
    const s = initial.get('sweep');
    return s && meta.variables.includes(s) ? s : meta.variables[0]!;
  });
  const sweepSym = catalog.symbols[sweep];
  const [from, setFrom] = useState(() => initial.get('from') ?? String(sweepSym?.range?.[0] ?? 0.1));
  const [to, setTo] = useState(() => initial.get('to') ?? String(sweepSym?.range?.[1] ?? 10));
  const [logx, setLogx] = useState(() => (initial.get('logx') ?? (sweepSym?.scale === 'log' ? '1' : '0')) === '1');
  const plotRef = useRef<HTMLDivElement>(null);
  const mathRef = useRef<HTMLDivElement>(null);
  const theme = usePlotTheme();

  // switching equation: keep values of shared inputs, default the rest
  function changeEquation(id: string) {
    const m = catalog.equations[id]!;
    const next: Record<string, string> = {};
    for (const v of m.variables) next[v] = values[v] ?? String(defaultValue(v));
    const sw = m.variables.includes(sweep) ? sweep : m.variables[0]!;
    const r = catalog.symbols[sw]?.range;
    setEqId(id);
    setValues(next);
    setSweep(sw);
    if (!m.variables.includes(sweep) && r) {
      setFrom(String(r[0]));
      setTo(String(r[1]));
      setLogx(catalog.symbols[sw]?.scale === 'log');
    }
  }

  // switching the swept input: take that symbol's default range and scale
  function changeSweep(name: string) {
    const sym = catalog.symbols[name];
    setSweep(name);
    if (sym?.range) {
      setFrom(String(sym.range[0]));
      setTo(String(sym.range[1]));
    }
    setLogx(sym?.scale === 'log');
  }

  const numeric = useMemo(() => {
    const out: Record<string, number> = {};
    for (const v of meta.variables) out[v] = parseField(values[v], unitLabel(v));
    return out;
  }, [meta, values]);

  let result: number | null = null;
  let error: string | null = null;
  try {
    result = evaluate(eqId, numeric);
    if (!Number.isFinite(result)) error = labels.invalid;
  } catch {
    error = labels.invalid;
  }

  // URL hash = state
  const stateHash = useMemo(() => {
    const p = new URLSearchParams({ eq: eqId });
    for (const v of meta.variables) p.set(v, values[v] ?? '');
    p.set('sweep', sweep);
    p.set('from', from);
    p.set('to', to);
    p.set('logx', logx ? '1' : '0');
    return p.toString();
  }, [eqId, meta, values, sweep, from, to, logx]);
  useStateHash(stateHash, ['eq']);

  // rendered equation
  useEffect(() => {
    if (mathRef.current) {
      katex.render(meta.latex, mathRef.current, { displayMode: true, throwOnError: false });
    }
  }, [meta]);

  // sweep plot
  useEffect(() => {
    const el = plotRef.current;
    const a = parseField(from, unitLabel(sweep));
    const b = parseField(to, unitLabel(sweep));
    if (!el || !(a < b) || (logx && a <= 0)) return;
    let cancelled = false;
    const n = 201;
    const xs = Array.from({ length: n }, (_, i) =>
      logx ? Math.exp(Math.log(a) + ((Math.log(b) - Math.log(a)) * i) / (n - 1)) : a + ((b - a) * i) / (n - 1),
    );
    const ys = xs.map((x) => {
      try {
        const y = evaluate(eqId, { ...numeric, [sweep]: x });
        return Number.isFinite(y) ? y : null;
      } catch {
        return null;
      }
    });
    // the current inputs' point on the curve, when the swept value lies in the plotted range
    const x0 = numeric[sweep];
    const here = Number.isFinite(x0) && x0! >= a && x0! <= b && result !== null && Number.isFinite(result) ? [{ x: [x0], y: [result] }] : [];
    const [c0, c1] = theme.colors;
    import('plotly.js-dist-min').then((mod) => {
      if (cancelled) return;
      const Plotly = mod.default ?? mod;
      Plotly.react(
        el,
        [
          {
            x: xs,
            y: ys,
            mode: 'lines',
            name: latexHtml(catalog.symbols[meta.lhs]?.latex ?? meta.lhs),
            line: { color: c0, width: 2 },
            hovertemplate: '%{y:.4~g}',
          },
          ...here.map((p) => ({ ...p, mode: 'markers', name: labels.current, marker: { color: c1, size: 10 }, hovertemplate: '%{y:.4~g}' })),
        ],
        {
          ...baseLayout(theme),
          showlegend: false,
          hovermode: 'x unified',
          xaxis: axis(theme, axisTitle(sweep, locale), { type: logx ? 'log' : 'linear' }),
          yaxis: axis(theme, axisTitle(meta.lhs, locale)),
        },
        PLOT_CONFIG,
      );
    });
    return () => {
      cancelled = true;
    };
  }, [eqId, meta, numeric, sweep, from, to, logx, theme, locale, labels, result]);

  const title = locale === 'ko' ? meta.title_ko : meta.title;

  return (
    <div className="pe-tool pe-explorer not-content">
      <div className="pe-row pe-row--full">
        <label htmlFor="explorer-eq">{labels.equation}</label>
        <select id="explorer-eq" value={eqId} onChange={(e) => changeEquation(e.target.value)}>
          {ids.map((id) => (
            <option key={id} value={id}>
              {id} — {locale === 'ko' ? catalog.equations[id]!.title_ko : catalog.equations[id]!.title}
            </option>
          ))}
        </select>
      </div>
      <p className="pe-explorer__title">{title}</p>
      <div ref={mathRef} className="pe-explorer__math" />
      <div className="pe-split pe-split--sticky pe-split--results">
        <div className="pe-split__controls">
          <p className="pe-tool__hint">{labels.siHint}</p>
          <fieldset>
            <legend>{labels.inputs}</legend>
            {meta.variables.map((v) => (
              <div key={v} className="pe-row pe-row--full">
                <FieldLabel htmlFor={`explorer-${v}`} sym={v} symHtml={symbolHtml(v)} meaning={meaningOf(v, locale)} unit={unitLabel(v)} />
                <NumInput
                  id={`explorer-${v}`}
                  unit={unitLabel(v)}
                  value={values[v] ?? ''}
                  onChange={(e) => setValues({ ...values, [v]: e.target.value })}
                />
              </div>
            ))}
          </fieldset>
          <p className="pe-explorer__result" aria-live="polite">
            {labels.result}:{' '}
            {error ? (
              <strong>{error}</strong>
            ) : (
              <>
                <span className="pe-sym pe-sym--tex" dangerouslySetInnerHTML={{ __html: symbolHtml(meta.lhs) }} /> ={' '}
                <strong>
                  {fmt(result!)} {unitLabel(meta.lhs)}
                </strong>{' '}
                <span className="pe-field__meaning">
                  — <Rich text={meaningOf(meta.lhs, locale)} />
                </span>
              </>
            )}
          </p>
          <fieldset>
            <legend>{labels.sweep}</legend>
            <div className="pe-row pe-row--full">
              <label htmlFor="explorer-sweep">{labels.sweep}</label>
              <select id="explorer-sweep" value={sweep} onChange={(e) => changeSweep(e.target.value)}>
                {meta.variables.map((v) => (
                  <option key={v} value={v}>
                    {v} — {meaningOf(v, locale)}
                  </option>
                ))}
              </select>
            </div>
            <div className="pe-row pe-row--full">
              <label htmlFor="explorer-from">{labels.from}</label>
              <NumInput id="explorer-from" unit={unitLabel(sweep)} value={from} onChange={(e) => setFrom(e.target.value)} />
            </div>
            <div className="pe-row pe-row--full">
              <label htmlFor="explorer-to">{labels.to}</label>
              <NumInput id="explorer-to" unit={unitLabel(sweep)} value={to} onChange={(e) => setTo(e.target.value)} />
            </div>
            <label className="pe-check" htmlFor="explorer-logx">
              <input id="explorer-logx" type="checkbox" checked={logx} onChange={(e) => setLogx(e.target.checked)} />
              <span>{labels.logx}</span>
            </label>
          </fieldset>
        </div>
        <div className="pe-split__view">
          <div ref={plotRef} className="pe-chart" role="img" aria-label={`${meta.lhs}(${sweep})`} style={{ height: 380 }} />
          <p className="pe-tool__hint">{labels.plotHint}</p>
        </div>
      </div>
      <p className="pe-tool__hint">{labels.share}</p>
    </div>
  );
}
