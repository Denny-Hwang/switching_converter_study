/**
 * Phase-0 smoke test for the tool stack: a React island that evaluates
 * pe-core in the browser and plots with Plotly. Real tools live alongside
 * it in src/tools/ from Phase 3 on.
 */
import { useEffect, useRef, useState } from 'react';
import { evaluate } from 'pe-core';

interface Props {
  /** Accessible description of the chart. */
  label: string;
  /** Axis title for the duty-ratio axis. */
  xTitle: string;
}

export default function PipelinePlot({ label, xTitle }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const el = ref.current;
    import('plotly.js-dist-min')
      .then((mod) => {
        if (cancelled || !el) return;
        const Plotly = mod.default ?? mod;
        const D = Array.from({ length: 86 }, (_, i) => 0.05 + i * 0.01);
        const traces = ['buck.ccm.M', 'boost.ccm.M'].map((id) => ({
          x: D,
          y: D.map((d) => evaluate(id, { D: d })),
          name: id,
          mode: 'lines',
        }));
        Plotly.newPlot(
          el,
          traces,
          {
            margin: { t: 40, r: 16, b: 48, l: 56 },
            xaxis: { title: { text: xTitle } },
            yaxis: { title: { text: 'M' }, range: [0, 10] },
            legend: { orientation: 'h', x: 0, y: 1.1 },
            paper_bgcolor: 'rgba(0,0,0,0)',
            plot_bgcolor: 'rgba(0,0,0,0)',
          },
          { responsive: true, displaylogo: false },
        );
      })
      .catch((e: unknown) => setError(String(e)));
    return () => {
      cancelled = true;
    };
  }, [xTitle]);

  return (
    <div className="pe-tool">
      <div ref={ref} role="img" aria-label={label} style={{ width: '100%', height: 320 }} />
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
