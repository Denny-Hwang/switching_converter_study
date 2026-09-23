import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { analyse, buildModel, restState, runCycle, simulate, stepsFor, type SimParams, type SimResult } from '../src/sim';

/**
 * The simulator against ngspice, an independent solver (scripts/spice_crosscheck.py).
 * Each case is the same circuit written as a SPICE netlist from its schematic,
 * run from rest by ngspice's own integrator; the fixture holds ngspice's
 * measurements of the last switching period: each quantity's average, largest,
 * smallest and end value, and its value at 40 instants spread over the period.
 * The SPICE parts are near-ideal: the switch's on-resistance is the case's (the
 * simulator uses the same), its off-resistance 1 GΩ, and each diode drops a few
 * millivolts on top of the case's V_F. So each value must agree within 0.5 % of
 * the quantity's largest magnitude in the period, and each peak-to-peak swing
 * within 2 % of itself. The waveform values are compared away from the
 * simulator's events (switching, a diode starting or stopping), where the
 * timing of a real edge and an ideal one differ by nanoseconds.
 *
 * One exception, with a node capacitance: at the end of the rise the diode
 * takes over the inductor current from the capacitance at once, and ngspice's
 * steep diode overshoots at that instant for a few picoseconds (a spike of up
 * to half an ampere; its charge, some 1e-12 C, is nothing). An ideal diode has
 * no such spike, so there the diode current's largest value, and the input
 * current's extremes (for the buck the capacitance returns the spike to the
 * input), are left out.
 */

interface SpiceCase {
  id: string;
  topology: SimParams['topology'];
  Vg: number;
  D: number;
  fs: number;
  L: number;
  n?: number;
  nr?: number;
  LM?: number;
  Ron: number;
  RL?: number;
  VF?: number;
  Cnode?: number;
  source?: SimParams['source'];
  load: SimParams['load'];
  cycles: number;
  startup?: boolean;
}

const fixture = JSON.parse(readFileSync(new URL('./fixtures/spice.json', import.meta.url), 'utf8')) as {
  ngspice: string;
  cases: { case: SpiceCase; spice: Record<string, number>; samples: Record<string, number[]> }[];
};

const VALUE_TOL = 0.005;
const SWING_TOL = 0.02;
/** Waveform values within this time of an event are not compared. */
const EVENT_GAP = 2e-8;

/** The simulator's waveform at time t (linear between its samples; at an event, the value after it). */
function at(t: number[], y: number[], tq: number): number {
  let lo = 0;
  let hi = t.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (t[mid]! <= tq) lo = mid;
    else hi = mid;
  }
  const dt = t[hi]! - t[lo]!;
  return dt > 0 ? y[lo]! + ((y[hi]! - y[lo]!) * (tq - t[lo]!)) / dt : y[hi]!;
}

function params(c: SpiceCase): SimParams {
  const p: SimParams = { topology: c.topology, Vg: c.Vg, D: c.D, fs: c.fs, L: c.L, Ron: c.Ron, load: c.load };
  for (const k of ['n', 'nr', 'LM', 'RL', 'VF', 'Cnode', 'source'] as const) if (c[k] !== undefined) (p as unknown as Record<string, unknown>)[k] = c[k];
  return p;
}

/** The simulator's last period: the steady state, or the case's number of cycles from rest. */
function lastPeriod(c: SpiceCase): SimResult {
  const p = params(c);
  if (!c.startup) return simulate(p);
  const model = buildModel(p);
  const steps = stepsFor(p);
  let x = restState(p, model);
  for (let k = 0; k < c.cycles - 1; k++) x = runCycle(model, x, { stepsPerPeriod: steps }).x;
  const run = runCycle(model, x, { stepsPerPeriod: steps, record: true });
  return analyse(p, model, { x0: x, cycles: c.cycles, converged: false, residual: NaN, run });
}

describe(`simulator against ngspice ${fixture.ngspice} (${fixture.cases.length} cases)`, () => {
  it('the fixture covers every topology, both modes, the node capacitance, a source, each load and the start-up', () => {
    const cs = fixture.cases.map((x) => x.case);
    for (const t of ['buck', 'boost', 'buckboost', 'flyback', 'forward']) expect(cs.some((c) => c.topology === t)).toBe(true);
    expect(cs.some((c) => c.Cnode)).toBe(true);
    expect(cs.some((c) => c.source)).toBe(true);
    expect(cs.some((c) => c.load.kind === 'fixed')).toBe(true);
    expect(cs.some((c) => c.load.kind === 'network' && c.load.battery && c.load.R === undefined)).toBe(true);
    expect(cs.some((c) => c.load.kind === 'network' && c.load.battery && c.load.R !== undefined)).toBe(true);
    expect(cs.some((c) => c.load.kind === 'network' && !c.load.battery && c.load.R === undefined)).toBe(true);
    expect(cs.some((c) => c.startup)).toBe(true);
  });

  for (const { case: c, spice, samples } of fixture.cases) {
    it(c.id, () => {
      const r = lastPeriod(c);
      if (!c.startup) {
        expect(r.status).toBe('steady');
        expect(r.converged).toBe(true);
      }
      const w = r.waveforms;
      const t = w.t as number[];
      const iv = w.interval as string[];
      // the simulator's events: where one interval hands over to the next
      const events = [0, ...t.filter((_, k) => k > 0 && iv[k] !== iv[k - 1]), t.at(-1)!];
      const quantities = [...new Set(Object.keys(spice).map((k) => k.replace(/_(avg|max|min|end)$/, '')))];
      expect(quantities.length).toBeGreaterThanOrEqual(5);
      let compared = 0;
      for (const q of quantities) {
        const series = w[q] as number[] | undefined;
        expect(series, `${c.id}: the simulator has no ${q}`).toBeDefined();
        const ts = { avg: r.avg[q]!, max: r.max[q]!, min: r.min[q]!, end: series!.at(-1)! };
        const sp = { avg: spice[`${q}_avg`]!, max: spice[`${q}_max`]!, min: spice[`${q}_min`]!, end: spice[`${q}_end`]! };
        const scale = Math.max(Math.abs(sp.max), Math.abs(sp.min), 1e-12);
        // the diode's take-over spike at the end of a node capacitance's rise (see above)
        const spike = c.Cnode !== undefined && (q === 'i_D' || q === 'i_in');
        const fns = spike ? (['avg', 'end'] as const) : (['avg', 'max', 'min', 'end'] as const);
        for (const fn of fns) {
          expect(Math.abs(ts[fn] - sp[fn]), `${c.id}: ${q} ${fn}: simulator ${ts[fn]}, ngspice ${sp[fn]}`).toBeLessThanOrEqual(VALUE_TOL * scale);
        }
        if (!spike) {
          const swing = sp.max - sp.min;
          expect(Math.abs(ts.max - ts.min - swing), `${c.id}: ${q} peak-to-peak: simulator ${ts.max - ts.min}, ngspice ${swing}`).toBeLessThanOrEqual(SWING_TOL * swing + 1e-4 * scale);
        }
        // the waveform, instant by instant
        const tk = samples.t!;
        const yk = samples[q]!;
        expect(yk.length).toBe(tk.length);
        for (let k = 0; k < tk.length; k++) {
          if (events.some((e) => Math.abs(e - tk[k]!) < EVENT_GAP)) continue;
          const y = at(t, series!, tk[k]!);
          expect(Math.abs(y - yk[k]!), `${c.id}: ${q} at t = ${(tk[k]! * 1e6).toFixed(3)} µs: simulator ${y}, ngspice ${yk[k]}`).toBeLessThanOrEqual(VALUE_TOL * scale);
          compared++;
        }
      }
      // nearly every instant is away from the events
      expect(compared).toBeGreaterThanOrEqual(0.9 * quantities.length * samples.t!.length);
    });
  }
});
