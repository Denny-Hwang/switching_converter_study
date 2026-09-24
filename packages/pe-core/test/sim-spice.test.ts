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
 * millivolts on top of the case's V_F. So each value must agree within 0.5 %
 * of the quantity's largest magnitude in the period, and each peak-to-peak
 * swing within 2 % of itself (and of the scale's 1e-4), with room for what the
 * SPICE parts add: 5 mV for a voltage (a diode's extra drop; a voltage that
 * stays near zero, such as a switch whose body diode conducts all period, has
 * no scale of its own), a microampere for a current (what a switch or a diode
 * leaks when off). The waveform values are compared away from the
 * simulator's events (switching, a diode starting or stopping), where the
 * timing of a real edge and an ideal one differ by nanoseconds.
 *
 * One exception, with a node capacitance: at the end of the rise the diode
 * takes over the inductor current from the capacitance at once, and ngspice's
 * steep diode overshoots at that instant for a few picoseconds (0.4 A to
 * 1.3 A in the buck and boost cases, near 10 A on the flyback's secondary, a
 * few amperes reflected to its primary; it shrinks with a smaller maximum
 * step, an artefact of the integration). An ideal diode has no such spike, so
 * there the diode current's largest value and its swing are left out, and for
 * the buck and the flyback, whose input current carries the spike (through
 * the node capacitance, or reflected, both ways), the input current's
 * extremes and swing too.
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
/** What the SPICE parts add to a value: a diode's extra drop (V), a part's leakage when off (A). */
const PARTS = { v: 5e-3, i: 1e-6 };
/** Waveform values within this time of an event are not compared. */
const EVENT_GAP = 2e-8;
/**
 * Where a current's conduction ends (a mode boundary in DCM: a diode or an
 * inductor current reaching zero, the forward converter's core reset): the
 * last instant in the period where it falls through FALL_LEVEL of its average
 * (not its peak, which a diode's take-over spike inflates in ngspice), found
 * the same way in both. They must agree within FALL_TOL of the period (10 ns
 * at 100 kHz); ngspice's diode, which drops a few millivolts more, ends a few
 * nanoseconds early (buck-battery-ring: see scripts/spice_crosscheck.py).
 */
const FALL_LEVEL = 0.05;
const FALL_TOL = 1e-3;

/** The last instant where y falls through `level` times its average `avg` (linear between samples), after `after`. */
function fallTime(t: number[], y: number[], level: number, avg: number, after: number): number | undefined {
  const thr = level * avg;
  let out: number | undefined;
  for (let k = 1; k < t.length; k++) {
    if (y[k - 1]! > thr && y[k]! <= thr) {
      const tk = t[k - 1]! + ((y[k - 1]! - thr) / (y[k - 1]! - y[k]!)) * (t[k]! - t[k - 1]!);
      if (tk > after) out = tk;
    }
  }
  return out;
}

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
    // a reset winding of other turns than the primary's, and a battery with a node capacitance
    expect(cs.some((c) => c.topology === 'forward' && c.nr !== 1)).toBe(true);
    expect(cs.some((c) => c.Cnode && c.load.kind === 'network' && c.load.battery)).toBe(true);
  });

  it("every interval of every converter's model runs in some case", () => {
    const seen: Record<string, Set<string>> = { twoSwitch: new Set(), forward: new Set() };
    const handovers = new Set<string>();
    for (const { case: c } of fixture.cases) {
      const r = lastPeriod(c);
      const ivs = r.waveforms.interval as string[];
      for (const iv of ivs) seen[c.topology === 'forward' ? 'forward' : 'twoSwitch']!.add(iv);
      for (let k = 1; k < ivs.length; k++) if (ivs[k] !== ivs[k - 1]) handovers.add(`${c.topology}:${ivs[k - 1]}>${ivs[k]}`);
    }
    expect([...seen.twoSwitch!].sort()).toEqual(['clamp', 'idle', 'off', 'on', 'onRev', 'rev', 'ring', 'rise']);
    expect([...seen.forward!].sort()).toEqual(['idle', 'off', 'offL0', 'offM0', 'on', 'onL0']);
    // the body diode taking over as the diode's current ends with the output above the input
    expect(handovers).toContain('buck:off>rev');
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
      const quantities = [...new Set(Object.keys(spice).map((k) => k.replace(/_(avg|max|min|end|fall)$/, '')))];
      expect(quantities.length).toBeGreaterThanOrEqual(5);
      let compared = 0;
      for (const q of quantities) {
        const series = w[q] as number[] | undefined;
        expect(series, `${c.id}: the simulator has no ${q}`).toBeDefined();
        const ts = { avg: r.avg[q]!, max: r.max[q]!, min: r.min[q]!, end: series!.at(-1)! };
        const sp = { avg: spice[`${q}_avg`]!, max: spice[`${q}_max`]!, min: spice[`${q}_min`]!, end: spice[`${q}_end`]! };
        const scale = Math.max(Math.abs(sp.max), Math.abs(sp.min), 1e-12);
        const parts = q.startsWith('v_') ? PARTS.v : PARTS.i;
        // the diode's take-over spike at the end of a node capacitance's rise (see above)
        const spikeD = c.Cnode !== undefined && q === 'i_D';
        const spikeIn = c.Cnode !== undefined && q === 'i_in' && (c.topology === 'buck' || c.topology === 'flyback');
        const spike = spikeD || spikeIn;
        const fns = spikeIn ? (['avg', 'end'] as const) : spikeD ? (['avg', 'min', 'end'] as const) : (['avg', 'max', 'min', 'end'] as const);
        for (const fn of fns) {
          expect(Math.abs(ts[fn] - sp[fn]), `${c.id}: ${q} ${fn}: simulator ${ts[fn]}, ngspice ${sp[fn]}`).toBeLessThanOrEqual(VALUE_TOL * scale + parts);
        }
        if (!spike) {
          const swing = sp.max - sp.min;
          expect(Math.abs(ts.max - ts.min - swing), `${c.id}: ${q} peak-to-peak: simulator ${ts.max - ts.min}, ngspice ${swing}`).toBeLessThanOrEqual(SWING_TOL * swing + 1e-4 * scale + parts);
        }
        // the waveform, instant by instant
        const tk = samples.t!;
        const yk = samples[q]!;
        expect(yk.length).toBe(tk.length);
        for (let k = 0; k < tk.length; k++) {
          if (events.some((e) => Math.abs(e - tk[k]!) < EVENT_GAP)) continue;
          const y = at(t, series!, tk[k]!);
          expect(Math.abs(y - yk[k]!), `${c.id}: ${q} at t = ${(tk[k]! * 1e6).toFixed(3)} µs: simulator ${y}, ngspice ${yk[k]}`).toBeLessThanOrEqual(VALUE_TOL * scale + parts);
          compared++;
        }
      }
      // nearly every instant is away from the events
      expect(compared).toBeGreaterThanOrEqual(0.9 * quantities.length * samples.t!.length);
      // where each current's conduction ends: the modes' boundaries (not the turn-on edge at the period's start)
      const Ts = 1 / c.fs;
      for (const q of ['i_D', 'i_L', 'i_M']) {
        const sp = spice[`${q}_fall`];
        const spFall = sp !== undefined && sp > EVENT_GAP ? sp : undefined;
        const tsFall = w[q] ? fallTime(t, w[q] as number[], FALL_LEVEL, r.avg[q]!, EVENT_GAP) : undefined;
        expect(tsFall === undefined, `${c.id}: ${q} ends in the period: simulator ${tsFall}, ngspice ${spFall}`).toBe(spFall === undefined);
        if (tsFall !== undefined && spFall !== undefined) {
          expect(Math.abs(tsFall - spFall), `${c.id}: ${q} ends at ${(tsFall * 1e6).toFixed(4)} µs, ngspice ${(spFall * 1e6).toFixed(4)} µs`).toBeLessThanOrEqual(FALL_TOL * Ts);
        }
      }
    });
  }
});
