/**
 * Phase-0 smoke test for the tool stack: a React island that evaluates
 * pe-core in the browser and plots with Plotly. Real tools live alongside
 * it in src/tools/ from Phase 3 on.
 */
import { useEffect, useRef, useState } from 'react';
import { evaluate } from 'pe-core';
import { PLOT_CONFIG, axis, baseLayout, usePlotTheme } from '../lib/plot';

interface Props {
  /** Accessible description of the chart. */
  label: string;
  /** Axis title for the duty-ratio axis. */
  xTitle: string;
}

export default function PipelinePlot({ label, xTitle }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const theme = usePlotTheme();

  useEffect(() => {
    let cancelled = false;
    const el = ref.current;
    import('plotly.js-dist-min')
      .then((mod) => {
        if (cancelled || !el) return;
        const Plotly = mod.default ?? mod;
        const D = Array.from({ length: 86 }, (_, i) => 0.05 + i * 0.01);
        const traces = ['buck.ccm.M', 'boost.ccm.M'].map((id, i) => ({
          x: D,
          y: D.map((d) => evaluate(id, { D: d })),
          name: id,
          mode: 'lines',
          line: { color: theme.colors[i], width: 2 },
        }));
        Plotly.react(
          el,
          traces,
          {
            ...baseLayout(theme),
            xaxis: axis(theme, xTitle),
            yaxis: axis(theme, 'M', { range: [0, 10] }),
          },
          PLOT_CONFIG,
        );
      })
      .catch((e: unknown) => setError(String(e)));
    return () => {
      cancelled = true;
    };
  }, [xTitle, theme]);

  return (
    <div className="pe-tool not-content">
      <div ref={ref} role="img" aria-label={label} style={{ width: '100%', height: 320 }} />
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
