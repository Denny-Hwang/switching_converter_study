/**
 * Equation explorer: evaluate any equation from the catalogue with pe-core,
 * sweep one input and plot the result. All state lives in the URL hash
 * (#eq=...&D=0.5&K=0.1&sweep=K) so every view is shareable; pages link here
 * with presets from synthetic examples ("Try it").
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import katex from 'katex';
import { catalog, evaluate } from 'pe-core';

interface Labels {
  equation: string;
  inputs: string;
  result: string;
  sweep: string;
  from: string;
  to: string;
  logx: string;
  invalid: string;
  share: string;
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

/** "D" or "V [V]": a symbol name with its unit in brackets, if it has one. */
function withUnit(name: string): string {
  const u = unitLabel(name);
  return u ? `${name} [${u}]` : name;
}

/** A number field's value; an empty or partial field is NaN, never 0. */
export function parseField(raw: string | undefined): number {
  const t = (raw ?? '').trim();
  return t === '' ? Number.NaN : Number(t);
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
    for (const v of meta.variables) out[v] = parseField(values[v]);
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
  useEffect(() => {
    const p = new URLSearchParams({ eq: eqId });
    for (const v of meta.variables) p.set(v, values[v] ?? '');
    p.set('sweep', sweep);
    p.set('from', from);
    p.set('to', to);
    p.set('logx', logx ? '1' : '0');
    window.history.replaceState(null, '', `#${p.toString()}`);
  }, [eqId, meta, values, sweep, from, to, logx]);

  // rendered equation
  useEffect(() => {
    if (mathRef.current) {
      katex.render(meta.latex, mathRef.current, { displayMode: true, throwOnError: false });
    }
  }, [meta]);

  // sweep plot
  useEffect(() => {
    const el = plotRef.current;
    const a = parseField(from);
    const b = parseField(to);
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
    import('plotly.js-dist-min').then((mod) => {
      if (cancelled) return;
      const Plotly = mod.default ?? mod;
      Plotly.react(
        el,
        [{ x: xs, y: ys, mode: 'lines', name: meta.lhs }],
        {
          margin: { t: 16, r: 16, b: 48, l: 64 },
          xaxis: { title: { text: withUnit(sweep) }, type: logx ? 'log' : 'linear' },
          yaxis: { title: { text: withUnit(meta.lhs) } },
          paper_bgcolor: 'rgba(0,0,0,0)',
          plot_bgcolor: 'rgba(0,0,0,0)',
          showlegend: false,
        },
        { responsive: true, displaylogo: false },
      );
    });
    return () => {
      cancelled = true;
    };
  }, [eqId, meta, numeric, sweep, from, to, logx]);

  const title = locale === 'ko' ? meta.title_ko : meta.title;

  return (
    <div className="pe-tool pe-explorer">
      <label className="pe-explorer__row">
        <span>{labels.equation}</span>
        <select value={eqId} onChange={(e) => changeEquation(e.target.value)}>
          {ids.map((id) => (
            <option key={id} value={id}>
              {id} — {locale === 'ko' ? catalog.equations[id]!.title_ko : catalog.equations[id]!.title}
            </option>
          ))}
        </select>
      </label>
      <p className="pe-explorer__title">{title}</p>
      <div ref={mathRef} className="pe-explorer__math" />
      <fieldset>
        <legend>{labels.inputs}</legend>
        {meta.variables.map((v) => (
          <label key={v} className="pe-explorer__row">
            <span>
              {v} {unitLabel(v) && <small>[{unitLabel(v)}]</small>}
            </span>
            <input
              type="number"
              step="any"
              value={values[v] ?? ''}
              onChange={(e) => setValues({ ...values, [v]: e.target.value })}
            />
          </label>
        ))}
      </fieldset>
      <p className="pe-explorer__result" aria-live="polite">
        {labels.result}: <strong>{error ?? `${meta.lhs} = ${fmt(result!)} ${unitLabel(meta.lhs)}`.trim()}</strong>
      </p>
      <fieldset>
        <legend>{labels.sweep}</legend>
        <label className="pe-explorer__row">
          <span>{labels.sweep}</span>
          <select value={sweep} onChange={(e) => changeSweep(e.target.value)}>
            {meta.variables.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        </label>
        <label className="pe-explorer__row">
          <span>{labels.from}</span>
          <input type="number" step="any" value={from} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label className="pe-explorer__row">
          <span>{labels.to}</span>
          <input type="number" step="any" value={to} onChange={(e) => setTo(e.target.value)} />
        </label>
        <label className="pe-explorer__row">
          <span>{labels.logx}</span>
          <input type="checkbox" checked={logx} onChange={(e) => setLogx(e.target.checked)} />
        </label>
      </fieldset>
      <div ref={plotRef} role="img" aria-label={`${meta.lhs}(${sweep})`} style={{ width: '100%', height: 340 }} />
      <p>
        <small>{labels.share}</small>
      </p>
    </div>
  );
}
