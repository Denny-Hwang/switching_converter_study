import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { sim } from 'pe-core';
import ModeSheet, { letter, sheetRows } from './ModeSheet';
import { stateFromHash, toParams } from './Simulator';
import { SEQ_TEXT } from '../i18n/sequence';
import { STATIC_THEME } from '../lib/plot';
import { fmtValue } from '../lib/format';
import { PRESETS, presetValues, simulatorHash } from '../lib/simpresets';

/**
 * The sheet of every operating mode (ModeSheet), as the topology pages
 * render it at build time and the simulator shows it: one figure per mode,
 * in order and lettered, the key waveforms of each topology drawn from the
 * simulated period, the boundaries t_0 ... t_N at the modes' own instants,
 * and the gate on exactly in the modes whose gate is on.
 */

const presets = PRESETS.map((p) => ({ id: p.id, label: p.en, topology: p.topology, values: presetValues(p.example, p.topology) }));

function run(example: string, topology: sim.Topology): sim.SimResult {
  const st = stateFromHash(new URLSearchParams(simulatorHash(example, topology)), presets);
  const params = toParams(st.fs, st.values);
  if ('error' in params) throw new Error(`${example}: ${params.error}`);
  return sim.simulate(params);
}

const render = (r: sim.SimResult, ms: sim.OperatingMode[], locale: 'en' | 'ko') =>
  renderToStaticMarkup(createElement(ModeSheet, { result: r, modes: ms, text: SEQ_TEXT[locale], theme: STATIC_THEME }));

// the examples the topology pages draw (the SPICE and CircuitJS1 library's cases), and two battery loads
const CASES: [string, sim.Topology, number][] = [
  ['buck-basic', 'buck', 2],
  ['buck-light-load', 'buck', 3],
  ['boost-ideal', 'boost', 2],
  ['buckboost-basic', 'buckboost', 2],
  ['flyback-ccm', 'flyback', 2],
  ['flyback-dcm', 'flyback', 3],
  ['forward-basic', 'forward', 3],
  ['sim-buck-battery', 'buck', 0],
  ['sim-flyback-battery', 'flyback', 0],
];

describe('ModeSheet', () => {
  it.each(CASES)('%s: every mode once, lettered in order, with its circuit', (example, topology, count) => {
    const r = run(example, topology);
    expect(r.converged).toBe(true);
    const ms = sim.modes(r);
    if (count) expect(ms.length).toBe(count);
    for (const locale of ['en', 'ko'] as const) {
      const html = render(r, ms, locale);
      const figures = [...html.matchAll(/<figure class="pe-sheet__mode"><figcaption><strong>\(([a-z])\) ([^<]*)<\/strong>/g)];
      expect(figures.map((m) => m[1])).toEqual(ms.map((_, k) => letter(k)));
      expect(figures.map((m) => m[2])).toEqual(ms.map((m) => SEQ_TEXT[locale].mode!.replace('{k}', String(m.index))));
      // one circuit per mode, none with its own legend (the sheet draws it once)
      expect(html.match(/class="pe-seq__svg"/g)?.length).toBe(ms.length);
      expect(html).not.toContain('pe-seq__legend');
    }
  });

  it.each(CASES)('%s: the key waveforms are the simulated series, and the boundaries the modes\' instants', (example, topology) => {
    const r = run(example, topology);
    const ms = sim.modes(r);
    const rows = sheetRows(topology);
    for (const row of rows) if (row.key !== 'gate') expect(Array.isArray(r.waveforms[row.key === 'i_S' ? 'i_sw' : row.key]), row.key).toBe(true);
    const html = render(r, ms, 'en');
    const waves = /<svg viewBox="0 0 (\d+) (\d+)"[^>]*class="pe-sheet__waves"[^>]*>(.*?)<\/svg>/s.exec(html);
    expect(waves).not.toBeNull();
    const body = waves![3]!;
    // a trace per row
    expect(body.match(/<path d="M/g)?.length).toBe(rows.length);
    // a dashed boundary at t_0, every mode's start and T_s, placed on the period's scale
    const xs = [...body.matchAll(/<line x1="([\d.]+)" x2="([\d.]+)" y1="[\d.]+" y2="[\d.]+" stroke="[^"]*" stroke-width="0.8" stroke-dasharray="3 3"/g)].map((m) => Number(m[1]));
    const Ts = 1 / r.params.fs;
    const want = [...ms.map((m) => m.t0), Ts].map((t) => 58 + (t / Ts) * (720 - 58 - 78));
    expect(xs.length).toBe(want.length);
    xs.forEach((x, j) => expect(x).toBeCloseTo(want[j]!, 6));
    // every boundary labelled t_0 ... t_N: the cards cite them all
    const labels = [...body.matchAll(/font-style="italic">t<tspan[^>]*>(\d+)<\/tspan>/g)].map((m) => Number(m[1]));
    expect(labels).toEqual(want.map((_, j) => j));
  });

  it.each(CASES)('%s: the gate is on exactly in the modes whose gate is on', (example, topology) => {
    const r = run(example, topology);
    const ms = sim.modes(r);
    const html = render(r, ms, 'en');
    const d = /<path d="(M[^"]*)"/.exec(html)![1]!;
    const pts = [...d.matchAll(/[ML]([\d.]+) ([\d.]+)/g)].map((m) => [Number(m[1]), Number(m[2])] as const);
    expect(pts.length).toBe(2 * ms.length);
    const hi = Math.min(...pts.map((p) => p[1]));
    ms.forEach((m, j) => {
      expect(pts[2 * j]![1] === hi).toBe(m.gate);
      expect(pts[2 * j + 1]![1] === hi).toBe(m.gate);
    });
    // and it is on for D T_s from the start of the period (the modes are the period's own)
    const on = ms.filter((m) => m.gate).reduce((a, m) => a + (m.t1 - m.t0), 0);
    expect(on * r.params.fs).toBeCloseTo(r.params.D, 9);
  });

  it('the switch row is the switch\'s net current, its body diode\'s included, as the circuit cards count it', () => {
    // a buck into a battery above its input: the inductor's current flows back through the body diode,
    // while the channel (i_sw) carries nothing
    const st = stateFromHash(new URLSearchParams(simulatorHash('sim-buck-battery', 'buck')), presets);
    const params = toParams(st.fs, { ...st.values, Vb: String(2 * Number(st.values.Vg)) });
    if ('error' in params) throw new Error('battery');
    const r = sim.simulate(params);
    const w = r.waveforms;
    const net = (w.i_sw as number[]).map((v, j) => v - (w.i_bd as number[])[j]!);
    expect(Math.max(...(w.i_sw as number[]).map(Math.abs))).toBe(0);
    expect(Math.min(...net)).toBeLessThan(0);
    const html = render(r, sim.modes(r), 'en');
    // the third row (i_S) is drawn below its zero line and labels the net current's extremes
    const waves = /class="pe-sheet__waves"[^>]*>(.*?)<\/svg>/s.exec(html)![1]!;
    const labels = [...waves.matchAll(/<text x="[\d.]+" y="[\d.]+" font-size="10.5"[^>]*>([^<]*)<\/text>/g)].map((m) => m[1]!);
    expect(labels).toContain(fmtValue(Math.min(...net), 'A', 3));
  });

  it('draws nothing without modes', () => {
    const r = run('buck-basic', 'buck');
    expect(render(r, [], 'en')).toBe('');
  });
});
