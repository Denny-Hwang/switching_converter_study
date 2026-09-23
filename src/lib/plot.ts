/**
 * Chart styling shared by the tools:
 * - colours from the page's theme (Starlight's light or dark, followed live);
 * - axis titles, tick labels and the legend make room for themselves
 *   (automargin), so none overlaps another;
 * - logarithmic axes get 1-2-5 or decade ticks instead of Plotly's crowded
 *   digit ticks;
 * - no mode bar (it covered the legend): drag to zoom, double-click to reset,
 *   as the note under the charts says.
 */
import { useEffect, useState } from 'react';
import { symHtml } from './sym';

export interface PlotTheme {
  dark: boolean;
  /** Tick labels and titles. */
  text: string;
  /** Secondary text: annotations. */
  muted: string;
  grid: string;
  /** Axis lines, zero lines, reference lines. */
  line: string;
  /** Shaded bands. */
  band: string;
  font: string;
  /** Trace colours, in order. */
  colors: readonly string[];
}

/** Trace colours that stay distinct from each other and readable on each theme's background. */
const LIGHT = ['#1f6fb4', '#e8710a', '#1e8a4c', '#d1343c', '#7b4fb3', '#8a5a44', '#0f8f8f'] as const;
const DARK = ['#6cb2ff', '#ffa551', '#52cf8f', '#ff737a', '#bb95ff', '#d9a986', '#4fd6d6'] as const;

function cssVar(name: string, fallback: string): string {
  if (typeof document === 'undefined') return fallback;
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
}

/** The theme Starlight has applied to the page (data-theme on <html>). */
export function readTheme(): PlotTheme {
  const dark = typeof document !== 'undefined' && document.documentElement.dataset.theme === 'dark';
  return {
    dark,
    text: cssVar('--sl-color-gray-2', dark ? '#c0c2c7' : '#353841'),
    muted: cssVar('--sl-color-gray-3', dark ? '#888b96' : '#545861'),
    grid: cssVar(dark ? '--sl-color-gray-5' : '--sl-color-gray-6', dark ? '#353841' : '#eceef2'),
    line: cssVar('--sl-color-gray-4', dark ? '#545861' : '#888b96'),
    band: dark ? 'rgba(255, 255, 255, 0.10)' : 'rgba(0, 0, 0, 0.07)',
    font: cssVar('--sl-font', 'system-ui, sans-serif'),
    colors: dark ? DARK : LIGHT,
  };
}

/** The page's theme, updated when the reader switches between light and dark. */
export function usePlotTheme(): PlotTheme {
  const [theme, setTheme] = useState(readTheme);
  useEffect(() => {
    const observer = new MutationObserver(() => setTheme(readTheme()));
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    });
    return () => observer.disconnect();
  }, []);
  return theme;
}

export const PLOT_CONFIG = {
  responsive: true,
  displaylogo: false,
  displayModeBar: false,
} as const;

/** Layout defaults for every chart; the legend sits above the plot area, clear of the axes. */
export function baseLayout(theme: PlotTheme): Record<string, unknown> {
  return {
    font: { family: theme.font, size: 12, color: theme.text },
    colorway: theme.colors,
    paper_bgcolor: 'rgba(0,0,0,0)',
    plot_bgcolor: 'rgba(0,0,0,0)',
    margin: { t: 12, r: 12, b: 12, l: 12, pad: 0 },
    hoverlabel: { font: { family: theme.font, size: 12 }, namelength: -1 },
    legend: {
      orientation: 'h',
      x: 0,
      xanchor: 'left',
      y: 1.02,
      yanchor: 'bottom',
      bgcolor: 'rgba(0,0,0,0)',
      font: { size: 12, color: theme.text },
    },
  };
}

/** An axis: its title (symbols get subscripts), themed lines, and room for its labels. */
export function axis(theme: PlotTheme, title?: string, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    ...(title !== undefined
      ? {
          title: {
            text: title,
            standoff: 8,
            font: { size: 12, color: theme.text },
          },
        }
      : {}),
    automargin: true,
    showline: true,
    linecolor: theme.line,
    gridcolor: theme.grid,
    zerolinecolor: theme.line,
    ticks: 'outside',
    ticklen: 4,
    tickcolor: theme.line,
    tickfont: { size: 11, color: theme.text },
    ...extra,
  };
}

/** "1.5", "0.002", "2000"; outside 1e-3..1e5, "2×10⁻⁶" with a real superscript. */
export function tickNumber(v: number): string {
  const a = Math.abs(v);
  if (a === 0) return '0';
  if (a >= 1e-3 && a < 1e5) return String(Number(v.toPrecision(3)));
  const e = Math.floor(Math.log10(a));
  const m = Number((v / 10 ** e).toPrecision(2));
  const pow = `10<sup>${e < 0 ? '−' : ''}${Math.abs(e)}</sup>`;
  return m === 1 ? pow : m === -1 ? `−${pow}` : `${m}×${pow}`;
}

/**
 * Ticks for a logarithmic axis over [lo, hi]: 1-2-5 per decade up to about
 * three decades, decades beyond, and at least two ticks (else none are set
 * and Plotly places its own). `format` turns a value into its label (default
 * tickNumber).
 */
export function logTicks(lo: number, hi: number, format: (v: number) => string = tickNumber): Record<string, unknown> {
  if (!(lo > 0 && hi > lo) || !Number.isFinite(hi)) return {};
  const span = Math.log10(hi / lo);
  const sets =
    span > 3.5
      ? [[1], [1, 2, 5]]
      : [
          [1, 2, 5],
          [1, 1.5, 2, 3, 4, 5, 6, 7, 8],
        ];
  let vals: number[] = [];
  for (const mant of sets) {
    vals = [];
    for (let e = Math.floor(Math.log10(lo)); e <= Math.ceil(Math.log10(hi)); e++) {
      for (const m of mant) {
        const v = Number((m * 10 ** e).toPrecision(6));
        if (v >= lo * (1 - 1e-9) && v <= hi * (1 + 1e-9)) vals.push(v);
      }
    }
    if (vals.length >= 2) break;
  }
  // a narrow range with no two such ticks in it: leave the ticks to Plotly
  if (vals.length < 2) return {};
  return { tickmode: 'array', tickvals: vals, ticktext: vals.map(format) };
}

/** "i_L" -> "i<sub>L</sub>" for trace names and axis titles. */
export const sub = symHtml;

/** Names in their traces' colours, then the unit: "i_L, i_D [A]" for a stacked chart's axis title. */
export function coloredTitle(items: readonly { name: string; color: string }[], unit: string): string {
  const names = items.map((it) => `<span style="color:${it.color}">${symHtml(it.name)}</span>`).join(', ');
  return unit ? `${names} [${unit}]` : names;
}
