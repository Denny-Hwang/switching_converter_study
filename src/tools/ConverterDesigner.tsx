/**
 * Converter designer (docs/BUILD_SPEC.md §5): sizes the inductance and the
 * output capacitance of a buck, boost, buck-boost, flyback or forward
 * converter for an input-voltage range and a load range. The calculation is
 * pe-core's design(), in which every formula is a catalogue equation; each
 * result names the equation it comes from. All state lives in the URL hash,
 * and the results link to the simulator with the designed parts.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { design, InvertError, type DesignResult, type DesignSpec, type DesignTopology, type DesignWarning } from 'pe-core';

export interface DesignerLabels {
  topology: string;
  presets: string;
  spec: string;
  optional: string;
  results: string;
  quantity: string;
  value: string;
  equation: string;
  dRange: string;
  dReset: string;
  lRipple: string;
  lCcm: string;
  lUsed: string;
  binding: Record<DesignResult['L']['binding'], string>;
  cOut: string;
  ripple: string;
  ipk: string;
  vds: string;
  vr: string;
  kFull: string;
  kLight: string;
  kcritMax: string;
  points: string;
  mode: string;
  chart: string;
  kcritCurve: string;
  dBand: string;
  /** Link texts with {Vg} for the input voltage. */
  simulateAt: string;
  lossesAt: string;
  invalid: string;
  share: string;
  warnings: Record<DesignWarning, string>;
  topologies: Record<DesignTopology, string>;
}

export interface DesignerPreset {
  id: string;
  label: string;
  topology: DesignTopology;
  values: Record<string, number>;
}

interface Props {
  locale: 'en' | 'ko';
  labels: DesignerLabels;
  presets: DesignerPreset[];
  simulatorHref: string;
  lossBudgetHref: string;
}

const TOPOLOGIES: DesignTopology[] = ['buck', 'boost', 'buckboost', 'flyback', 'forward'];
const isolated = (t: DesignTopology) => t === 'flyback' || t === 'forward';

interface Field {
  key: string;
  label: (t: DesignTopology) => string;
  unit: string;
  show: (t: DesignTopology) => boolean;
  optional?: boolean;
}

const always = () => true;
export const FIELDS: Field[] = [
  { key: 'VgMin', label: () => 'V_g,min', unit: 'V', show: always },
  { key: 'VgMax', label: () => 'V_g,max', unit: 'V', show: always },
  { key: 'V', label: (t) => (t === 'buckboost' ? '|V|' : 'V'), unit: 'V', show: always },
  { key: 'P', label: () => 'P', unit: 'W', show: always },
  { key: 'Pmin', label: () => 'P_min (CCM)', unit: 'W', show: always },
  { key: 'fs', label: () => 'f_s', unit: 'Hz', show: always },
  { key: 'rI', label: (t) => (t === 'flyback' ? 'Δi_M / I_M' : 'Δi_L / I_L'), unit: '', show: always },
  { key: 'rV', label: () => 'Δv / V', unit: '', show: always },
  { key: 'n', label: () => 'n = N_s/N_p', unit: '', show: isolated },
  { key: 'nr', label: () => 'n_r = N_r/N_p', unit: '', show: (t) => t === 'forward' },
  { key: 'VD', label: () => 'V_D', unit: 'V', show: (t) => t === 'flyback' },
  { key: 'L', label: (t) => (t === 'flyback' ? 'L_M' : 'L'), unit: 'H', show: always, optional: true },
  { key: 'LM', label: () => 'L_M', unit: 'H', show: (t) => t === 'forward', optional: true },
];
const KEYS = FIELDS.map((f) => f.key);

/** A number field's value; an empty field is NaN, never 0. */
function num(raw: string | undefined): number {
  const t = (raw ?? '').trim();
  return t === '' ? Number.NaN : Number(t);
}

/** The designer's specification from the form, or null when a required field is missing or out of range. */
export function toSpec(topology: DesignTopology, values: Record<string, string>): DesignSpec | null {
  for (const f of FIELDS.filter((f) => f.show(topology))) {
    const v = num(values[f.key]);
    const empty = (values[f.key] ?? '').trim() === '';
    if (f.optional && empty) continue;
    if (f.key === 'Pmin' || f.key === 'VD') {
      if (!(v >= 0)) return null;
    } else if (!(v > 0)) return null;
  }
  const spec: DesignSpec = {
    topology,
    VgMin: num(values.VgMin),
    VgMax: num(values.VgMax),
    V: num(values.V),
    P: num(values.P),
    Pmin: num(values.Pmin),
    fs: num(values.fs),
    rippleI: num(values.rI),
    rippleV: num(values.rV),
  };
  if (!(spec.VgMin <= spec.VgMax) || spec.Pmin > spec.P) return null;
  if (isolated(topology)) spec.n = num(values.n);
  if (topology === 'forward') spec.nr = num(values.nr);
  if (topology === 'flyback') spec.VD = num(values.VD);
  const L = num(values.L);
  if (Number.isFinite(L)) spec.L = L;
  return spec;
}

/** A value for a link: six significant digits, enough for the output to follow the duty ratio to about 1e-6. */
const sig = (x: number) => String(Number(x.toPrecision(6)));

/** The core fields of the loss budget, left empty in a link: the designer does not size the core. */
const CORE_KEYS = ['N', 'Ae', 'Ve', 'k', 'alpha', 'beta'];

/**
 * Loss-budget URL hash for the designed converter at one input voltage: the
 * operating point and the designed parts. The loss budget fills in the
 * switch and diode data from its own synthetic example; the core fields are
 * left empty (no core loss) because the designer does not size the core.
 */
export function lossBudgetHash(r: DesignResult, Vg: number, LM?: number): string {
  const s = r.spec;
  const q = new URLSearchParams({ topo: s.topology });
  q.set('Vg', sig(Vg));
  q.set('V', sig(s.V));
  q.set('P', sig(s.P));
  q.set('fs', sig(s.fs));
  q.set('L', sig(r.L.chosen));
  q.set('C', sig(r.C));
  if (s.n !== undefined) q.set('n', sig(s.n));
  if (s.topology === 'flyback') q.set('VF', sig(s.VD ?? 0));
  if (s.topology === 'forward') {
    q.set('nr', sig(s.nr ?? 1));
    if (LM !== undefined && LM > 0) q.set('LM', sig(LM));
  }
  for (const k of CORE_KEYS) q.set(k, '');
  return q.toString();
}

/**
 * Simulator URL hash for the designed converter at one input voltage, full
 * load, with ideal parts (the flyback's diode drop as designed).
 */
export function simulatorHash(r: DesignResult, Vg: number, LM?: number): string | null {
  const s = r.spec;
  const p = r.points.reduce((best, q) => (Math.abs(q.Vg - Vg) < Math.abs(best.Vg - Vg) ? q : best));
  const q = new URLSearchParams({ topo: s.topology, load: 'res', src: '0' });
  q.set('Vg', sig(p.Vg));
  q.set('D', sig(p.D));
  q.set('fs', sig(s.fs));
  q.set('L', sig(r.L.chosen));
  q.set('R', sig(r.Rfull));
  q.set('C', sig(r.C));
  if (s.n !== undefined) q.set('n', sig(s.n));
  q.set('Ron', '0');
  q.set('RL', '0');
  q.set('Cnode', '0');
  q.set('VF', s.topology === 'flyback' ? sig(s.VD ?? 0) : '0');
  if (s.topology === 'forward') {
    if (LM === undefined || !(LM > 0)) return null;
    q.set('nr', sig(s.nr ?? 1));
    q.set('LM', sig(LM));
  }
  return q.toString();
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
 * The topology and the fields from the URL hash; a field missing from the
 * hash takes the topology's first preset, a field present but empty stays
 * empty (an optional field the user cleared).
 */
export function stateFromHash(h: URLSearchParams, presets: DesignerPreset[]): { topo: DesignTopology; values: Record<string, string> } {
  const topo = (TOPOLOGIES as string[]).includes(h.get('topo') ?? '') ? (h.get('topo') as DesignTopology) : presets[0]?.topology ?? 'buck';
  const base = presets.find((p) => p.topology === topo) ?? presets[0];
  const values: Record<string, string> = {};
  for (const k of KEYS) values[k] = h.has(k) ? h.get(k)! : base?.values[k] !== undefined ? String(base.values[k]) : '';
  return { topo, values };
}

/** The URL hash of the form: every shown field, an empty one as `key=`. */
export function hashOf(topo: DesignTopology, values: Record<string, string>): string {
  const q = new URLSearchParams({ topo });
  for (const f of FIELDS) if (f.show(topo)) q.set(f.key, values[f.key] ?? '');
  return q.toString();
}

const RATIO: Record<DesignTopology, string> = {
  buck: 'buck.ccm.M',
  boost: 'boost.ccm.M',
  buckboost: 'buckboost.ccm.M',
  flyback: 'flyback.ccm.M',
  forward: 'forward.ccm.M',
};
const RIPPLE: Record<DesignTopology, string> = {
  buck: 'buck.ripple.iL',
  boost: 'boost.ripple.iL',
  buckboost: 'buckboost.ripple.iL',
  flyback: 'flyback.ripple.iM',
  forward: 'forward.ripple.iL',
};
const VRIPPLE: Record<DesignTopology, string> = {
  buck: 'buck.ripple.v',
  boost: 'boost.ripple.v',
  buckboost: 'buckboost.ripple.v',
  flyback: 'flyback.ripple.v',
  forward: 'buck.ripple.v',
};
const VDS: Record<DesignTopology, string> = {
  buck: 'buck.Vds',
  boost: 'boost.Vds',
  buckboost: 'buckboost.Vds',
  flyback: 'flyback.Vds_off',
  forward: 'forward.Vds',
};
const VR: Partial<Record<DesignTopology, string>> = {
  buck: 'buck.Vds',
  boost: 'boost.Vds',
  buckboost: 'buckboost.Vds',
  flyback: 'flyback.diode.VR',
};

export default function ConverterDesigner({ labels, presets, simulatorHref, lossBudgetHref }: Props) {
  const init = useMemo(() => stateFromHash(readHash(), presets), [presets]);
  const [topo, setTopo] = useState<DesignTopology>(init.topo);
  const [values, setValues] = useState<Record<string, string>>(init.values);
  const plotRef = useRef<HTMLDivElement>(null);

  const spec = useMemo(() => toSpec(topo, values), [topo, values]);
  const outcome = useMemo((): { result: DesignResult } | { error: 'invalid' | 'unreachable' } => {
    if (!spec) return { error: 'invalid' };
    try {
      return { result: design(spec) };
    } catch (e) {
      // no input voltage in the range reaches the output
      if (e instanceof InvertError) return { error: 'unreachable' };
      return { error: 'invalid' };
    }
  }, [spec]);
  const result = 'result' in outcome ? outcome.result : null;

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

  // K against K_crit(D)
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
    const kFull = result.points[0]!.Kfull;
    const kLight = result.points[0]!.Klight;
    const traces: Record<string, unknown>[] = [
      { x: result.curve.D, y: result.curve.Kcrit, name: labels.kcritCurve, mode: 'lines' },
      { x: [0, 1], y: [kFull, kFull], name: labels.kFull, mode: 'lines', line: { dash: 'dash' } },
    ];
    if (Number.isFinite(kLight)) traces.push({ x: [0, 1], y: [kLight, kLight], name: labels.kLight, mode: 'lines', line: { dash: 'dot' } });
    import('plotly.js-dist-min').then((mod) => {
      if (cancelled) return;
      const Plotly = mod.default ?? mod;
      Plotly.react(
        el,
        traces,
        {
          margin: { t: 16, r: 16, b: 48, l: 64 },
          xaxis: { title: { text: 'D' }, range: [0, 1] },
          yaxis: { title: { text: 'K' }, type: 'log' },
          shapes: [
            {
              type: 'rect',
              xref: 'x',
              yref: 'paper',
              x0: result.D.min,
              x1: result.D.max,
              y0: 0,
              y1: 1,
              fillcolor: 'rgba(128,128,128,0.18)',
              line: { width: 0 },
            },
          ],
          annotations: [{ x: (result.D.min + result.D.max) / 2, y: 1, xref: 'x', yref: 'paper', text: labels.dBand, showarrow: false, yanchor: 'bottom' }],
          paper_bgcolor: 'rgba(0,0,0,0)',
          plot_bgcolor: 'rgba(0,0,0,0)',
          legend: { orientation: 'h', y: -0.25 },
        },
        { responsive: true, displaylogo: false },
      );
    });
    return () => {
      cancelled = true;
    };
  }, [result, labels]);

  function applyPreset(p: DesignerPreset) {
    const next: Record<string, string> = {};
    for (const k of KEYS) next[k] = p.values[k] !== undefined ? String(p.values[k]) : '';
    setTopo(p.topology);
    setValues(next);
  }

  function changeTopology(t: DesignTopology) {
    const base = presets.find((p) => p.topology === t);
    if (base) applyPreset(base);
    else setTopo(t);
  }

  const shown = FIELDS.filter((f) => f.show(topo));
  const input = (f: Field) => {
    const id = `des-${f.key}`;
    return (
      <div key={f.key} className="pe-sim__row">
        <label htmlFor={id}>
          {f.label(topo)} {f.unit && <small>[{f.unit}]</small>} {f.optional && <small>({labels.optional})</small>}
        </label>
        <input id={id} type="number" step="any" value={values[f.key] ?? ''} onChange={(e) => setValues({ ...values, [f.key]: e.target.value })} />
        <span />
      </div>
    );
  };

  const r = result;
  const Lname = topo === 'flyback' ? 'L_M' : 'L';
  const ends = r ? (r.points.length > 1 ? [r.points[0]!, r.points[r.points.length - 1]!] : [r.points[0]!]) : [];
  const LM = num(values.LM);
  const links = r
    ? ends
        .map((p) => ({ Vg: p.Vg, hash: simulatorHash(r, p.Vg, Number.isFinite(LM) ? LM : undefined) }))
        .filter((l): l is { Vg: number; hash: string } => l.hash !== null)
    : [];

  return (
    <div className="pe-tool pe-explorer pe-sim pe-design">
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
      <fieldset>
        <legend>{labels.spec}</legend>
        {shown.map(input)}
      </fieldset>
      <section aria-live="polite">
        {'error' in outcome && (
          <p className="pe-sim__error">{outcome.error === 'unreachable' ? labels.warnings.unreachable : labels.invalid}</p>
        )}
        {r && r.warnings.length > 0 && (
          <ul className="pe-design__warnings">
            {r.warnings.map((w) => (
              <li key={w}>{labels.warnings[w]}</li>
            ))}
          </ul>
        )}
      </section>
      {r && (
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
                <th scope="row">{labels.dRange}</th>
                <td>
                  {fmt(r.D.min)} – {fmt(r.D.max)}
                </td>
                <td>
                  <code>{RATIO[topo]}</code>
                </td>
              </tr>
              {r.Dmax !== undefined && (
                <tr>
                  <th scope="row">{labels.dReset}</th>
                  <td>{fmt(r.Dmax)}</td>
                  <td>
                    <code>forward.reset.Dmax</code>
                  </td>
                </tr>
              )}
              <tr>
                <th scope="row">
                  {labels.lRipple} ({Lname})
                </th>
                <td>{fmt(r.L.ripple, 'H')}</td>
                <td>
                  <code>{RIPPLE[topo]}</code>
                </td>
              </tr>
              <tr>
                <th scope="row">
                  {labels.lCcm} ({Lname})
                </th>
                <td>{fmt(r.L.ccm, 'H')}</td>
                <td>
                  <code>L.crit</code>
                </td>
              </tr>
              <tr>
                <th scope="row">
                  {labels.lUsed} ({Lname})
                </th>
                <td>
                  <strong>{fmt(r.L.chosen, 'H')}</strong> <small>({labels.binding[r.L.binding]})</small>
                </td>
                <td />
              </tr>
              <tr>
                <th scope="row">{labels.cOut}</th>
                <td>
                  <strong>{fmt(r.C, 'F')}</strong>
                </td>
                <td>
                  <code>{VRIPPLE[topo]}</code>
                </td>
              </tr>
              <tr>
                <th scope="row">{labels.ripple}</th>
                <td>{fmt(r.worst.dI, 'A')}</td>
                <td>
                  <code>{RIPPLE[topo]}</code>
                </td>
              </tr>
              <tr>
                <th scope="row">{labels.ipk}</th>
                <td>{fmt(r.worst.Ipk, 'A')}</td>
                <td>
                  <code>ripple.Ipk</code>
                </td>
              </tr>
              <tr>
                <th scope="row">{labels.vds}</th>
                <td>{fmt(r.worst.Vds, 'V')}</td>
                <td>
                  <code>{VDS[topo]}</code>
                </td>
              </tr>
              {r.worst.Vr !== undefined && (
                <tr>
                  <th scope="row">{labels.vr}</th>
                  <td>{fmt(r.worst.Vr, 'V')}</td>
                  <td>
                    <code>{VR[topo]}</code>
                  </td>
                </tr>
              )}
              <tr>
                <th scope="row">{labels.kFull}</th>
                <td>{fmt(r.points[0]!.Kfull)}</td>
                <td>
                  <code>K.def</code>
                </td>
              </tr>
              <tr>
                <th scope="row">{labels.kLight}</th>
                <td>{fmt(r.points[0]!.Klight)}</td>
                <td>
                  <code>K.def</code>
                </td>
              </tr>
              <tr>
                <th scope="row">{labels.kcritMax}</th>
                <td>{fmt(r.worst.KcritMax)}</td>
                <td>
                  <code>Kcrit.{topo === 'forward' ? 'buck' : topo}</code>
                </td>
              </tr>
            </tbody>
          </table>
          <table className="pe-sim__table">
            <caption>{labels.points}</caption>
            <thead>
              <tr>
                <th scope="col">V_g [V]</th>
                <th scope="col">D</th>
                <th scope="col">{topo === 'flyback' ? 'I_M' : 'I_L'} [A]</th>
                <th scope="col">{topo === 'flyback' ? 'Δi_M' : 'Δi_L'} [A]</th>
                <th scope="col">I_pk [A]</th>
                <th scope="col">K / K_crit</th>
                <th scope="col">{labels.mode}</th>
              </tr>
            </thead>
            <tbody>
              {ends.map((p) => (
                <tr key={p.Vg}>
                  <th scope="row">{fmt(p.Vg)}</th>
                  <td>{fmt(p.D)}</td>
                  <td>{fmt(p.IL)}</td>
                  <td>{fmt(p.dI)}</td>
                  <td>{fmt(p.Ipk)}</td>
                  <td>{fmt(p.Kfull / p.Kcrit)}</td>
                  <td>{p.mode}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {links.length > 0 && (
            <p>
              {links.map((l, i) => (
                <span key={l.Vg}>
                  {i > 0 && ' · '}
                  <a href={`${simulatorHref}#${l.hash}`}>▶ {labels.simulateAt.replace('{Vg}', fmt(l.Vg))}</a>
                </span>
              ))}
            </p>
          )}
          <p>
            {ends.map((p, i) => (
              <span key={p.Vg}>
                {i > 0 && ' · '}
                <a href={`${lossBudgetHref}#${lossBudgetHash(r, p.Vg, Number.isFinite(LM) ? LM : undefined)}`}>
                  ▶ {labels.lossesAt.replace('{Vg}', fmt(p.Vg))}
                </a>
              </span>
            ))}
          </p>
        </>
      )}
      <div ref={plotRef} role="img" aria-label={labels.chart} style={{ width: '100%', height: 380 }} />
      <p>
        <small>{labels.share}</small>
      </p>
    </div>
  );
}
