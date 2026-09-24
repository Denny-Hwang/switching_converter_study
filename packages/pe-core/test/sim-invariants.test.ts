import { describe, expect, it } from 'vitest';
import { analyse, buildModel, restState, runCycle, simulate, stepsFor, type SimParams, type SimResult, type Topology } from '../src/sim';

/**
 * Invariants of the simulated circuits with every kind of load (docs/BUILD_SPEC.md section 4):
 * - in a periodic steady state the inductors' volt-seconds and the output capacitor's charge balance;
 * - the output capacitor's current is C dv/dt of the simulated output voltage;
 * - the energy the source delivers equals what the load takes plus the losses, in a steady state
 *   and over a start-up from rest (where the inductors and the capacitor also store some).
 */

const fs = 1e5;
const Ts = 1 / fs;

const avgOf = (r: SimResult, f: (k: number) => number): number => {
  const t = r.waveforms.t as number[];
  let s = 0;
  for (let k = 1; k < t.length; k++) s += 0.5 * (f(k - 1) + f(k)) * (t[k]! - t[k - 1]!);
  return s / (t.at(-1)! - t[0]!);
};

/** The power the load's parts take: the resistor, and the battery's open-circuit voltage and internal resistance. */
function loadPower(p: SimParams, r: SimResult): number {
  const w = r.waveforms;
  const v = w.v_out as number[];
  const ib = w.i_bat as number[];
  const l = p.load;
  if (l.kind === 'fixed') return avgOf(r, (k) => l.V * ib[k]!);
  let P = 0;
  const R = l.R;
  if (R !== undefined) P += avgOf(r, (k) => v[k]! ** 2 / R);
  if (l.kind === 'network' && l.battery) {
    const b = l.battery;
    P += avgOf(r, (k) => b.V * ib[k]! + b.R * ib[k]! ** 2);
  }
  return P;
}

/** Each converter's input, duty ratio and a battery voltage a little below its ideal output (so that the battery charges). */
const POINT: Record<Topology, { Vg: number; D: number; Vb: number }> = {
  buck: { Vg: 24, D: 0.55, Vb: 12 },
  boost: { Vg: 12, D: 0.3, Vb: 16 },
  buckboost: { Vg: 24, D: 0.4, Vb: 14 },
  flyback: { Vg: 24, D: 0.4, Vb: 14 },
  forward: { Vg: 24, D: 0.45, Vb: 10 },
};

const loads = (Vb: number): [string, SimParams['load']][] => [
  ['R || C', { kind: 'resistive', R: 8, C: 1e-4 }],
  ['battery', { kind: 'network', C: 1e-4, battery: { V: Vb, R: 0.3 } }],
  ['battery and R', { kind: 'network', C: 1e-4, R: 20, battery: { V: Vb, R: 0.3 } }],
];

describe('steady state with each load: balances and energy', () => {
  for (const topology of ['buck', 'boost', 'buckboost', 'flyback', 'forward'] as Topology[]) {
    const { Vg, D, Vb } = POINT[topology];
    for (const [name, load] of loads(Vb)) {
      for (const lossy of [false, true]) {
        const p: SimParams = {
          topology,
          Vg,
          D,
          fs,
          L: 1e-4,
          n: topology === 'flyback' || topology === 'forward' ? 1 : undefined,
          nr: topology === 'forward' ? 1 : undefined,
          LM: topology === 'forward' ? 2e-3 : undefined,
          Ron: lossy ? 0.05 : 0,
          RL: lossy ? 0.03 : 0,
          VF: lossy ? 0.4 : 0,
          load,
        };
        it(`${topology}, ${name}${lossy ? ', with losses' : ''}`, () => {
          const r = simulate(p);
          expect(r.status).toBe('steady');
          if (load.kind === 'network') expect(r.avg.i_bat!).toBeGreaterThan(0);
          const w = r.waveforms;
          const iC = w.i_C as number[];
          const iL = w.i_L as number[];
          // v_L is the voltage across the inductor's terminals, its winding resistance's drop included
          const vInd = (w.v_L as number[]).map((v, k) => v - (p.RL ?? 0) * iL[k]!);
          const scaleI = Math.max(...(w.i_out as number[]).map(Math.abs));
          const scaleV = Math.max(...vInd.map(Math.abs));
          // charge balance on the output capacitor, volt-second balance on the inductance
          expect(Math.abs(avgOf(r, (k) => iC[k]!))).toBeLessThan(1e-7 * scaleI);
          expect(Math.abs(avgOf(r, (k) => vInd[k]!))).toBeLessThan(1e-7 * scaleV);
          // the capacitor's current is C dv/dt of the output voltage (central differences inside each interval)
          const t = w.t as number[];
          const v = w.v_out as number[];
          const iv = w.interval as string[];
          const C = (load as { C: number }).C;
          let worst = 0;
          for (let k = 1; k < t.length - 1; k++) {
            if (iv[k - 1] !== iv[k] || iv[k + 1] !== iv[k] || !(t[k + 1]! > t[k]!) || !(t[k]! > t[k - 1]!)) continue;
            const dvdt = (v[k + 1]! - v[k - 1]!) / (t[k + 1]! - t[k - 1]!);
            worst = Math.max(worst, Math.abs(C * dvdt - iC[k]!));
          }
          expect(worst).toBeLessThan(2e-3 * Math.max(...iC.map(Math.abs)));
          // energy: the source's power = the load's (resistor, battery voltage, battery resistance) + the losses
          const Pin = avgOf(r, (k) => (w.v_in as number[])[k]! * (w.i_in as number[])[k]!);
          const Pload = loadPower(p, r);
          expect(Math.abs(Pin - Pload - r.losses.total)).toBeLessThan(1e-6 * Pin);
          // and the output node's power is what the load takes (the capacitor's averages to zero)
          expect(Math.abs(r.energy.output / Ts - Pload)).toBeLessThan(1e-6 * Pin);
        });
      }
    }
  }
});

describe('steady state with a fixed output or a capacitor alone: balance and energy', () => {
  // a fixed output below its balancing duty ratio settles in DCM
  const FIXED: Record<Topology, { Vg: number; D: number; V: number }> = {
    buck: { Vg: 24, D: 0.3, V: 12 },
    boost: { Vg: 12, D: 0.3, V: 24 },
    buckboost: { Vg: 24, D: 0.25, V: 14 },
    flyback: { Vg: 24, D: 0.25, V: 14 },
    forward: { Vg: 24, D: 0.3, V: 10 },
  };
  for (const topology of ['buck', 'boost', 'buckboost', 'flyback', 'forward'] as Topology[]) {
    for (const lossy of [false, true]) {
      const { Vg, D, V } = FIXED[topology];
      const base = {
        topology,
        Vg,
        fs,
        L: 1e-4,
        n: topology === 'flyback' || topology === 'forward' ? 1 : undefined,
        nr: topology === 'forward' ? 1 : undefined,
        LM: topology === 'forward' ? 2e-3 : undefined,
        Ron: lossy ? 0.05 : 0,
        RL: lossy ? 0.03 : 0,
        VF: lossy ? 0.4 : 0,
      };
      it(`${topology}, fixed output${lossy ? ', with losses' : ''}`, () => {
        const p = { ...base, D, load: { kind: 'fixed', V } } as SimParams;
        const r = simulate(p);
        expect(r.status).toBe('steady');
        expect(r.mode).toBe('DCM');
        const w = r.waveforms;
        const iL = w.i_L as number[];
        const vInd = (w.v_L as number[]).map((v, k) => v - (p.RL ?? 0) * iL[k]!);
        expect(Math.abs(avgOf(r, (k) => vInd[k]!))).toBeLessThan(1e-7 * Math.max(...vInd.map(Math.abs)));
        // the source's power = what the fixed output takes + the losses
        const Pin = avgOf(r, (k) => (w.v_in as number[])[k]! * (w.i_in as number[])[k]!);
        expect(Pin).toBeGreaterThan(0);
        expect(Math.abs(Pin - loadPower(p, r) - r.losses.total)).toBeLessThan(1e-6 * Pin);
      });
      if (topology === 'buck' || topology === 'forward') {
        it(`${topology}, a capacitor alone${lossy ? ', with losses' : ''}`, () => {
          const p = { ...base, D: 0.4, load: { kind: 'network', C: 1e-4, V0: 0 } } as SimParams;
          const r = simulate(p);
          expect(r.status).toBe('steady');
          const w = r.waveforms;
          const iIn = w.i_in as number[];
          const scaleI = Math.max(...iIn.map(Math.abs), 1e-12);
          // nothing takes charge from the capacitor: in its steady state none flows to it (to the search's tolerance)
          expect(Math.max(...(w.i_C as number[]).map(Math.abs))).toBeLessThan(1e-6 * scaleI);
          // what the source gives is lost (the forward converter's magnetizing current, through R_on)
          const Pin = avgOf(r, (k) => (w.v_in as number[])[k]! * iIn[k]!);
          expect(Math.abs(Pin - r.losses.total)).toBeLessThan(1e-9 * Vg * scaleI);
        });
      }
    }
  }
});

describe('batteries: the average charging current against the hand value', () => {
  it('buck in CCM, ideal parts: I_b = (D V_g - V_b) / R_b (the inductor averages the switch node to D V_g)', () => {
    const p: SimParams = { topology: 'buck', Vg: 24, D: 0.6, fs, L: 1e-4, load: { kind: 'network', C: 22e-6, battery: { V: 12, R: 0.5 } } };
    const r = simulate(p);
    expect(r.mode).toBe('CCM');
    expect(r.avg.i_bat!).toBeCloseTo((0.6 * 24 - 12) / 0.5, 9);
  });

  it('flyback in DCM, ideal parts: the battery takes V_g^2 D^2 T_s / (2 L_M), all of the energy stored per cycle', () => {
    const L = 2e-5;
    const p: SimParams = { topology: 'flyback', Vg: 48, D: 0.3, fs, L, n: 0.25, load: { kind: 'network', C: 1e-4, battery: { V: 12, R: 0.05 } } };
    const r = simulate(p);
    expect(r.mode).toBe('DCM');
    const P = (48 * 48 * 0.3 * 0.3 * Ts) / (2 * L);
    // this test's own averages are trapezoids through the samples, 2000 per period: exact to about 1e-7 for these
    // curved waveforms. The simulator's exact integrals give the battery's power to rounding
    expect(Math.abs(loadPower(p, r) - P) / P).toBeLessThan(1e-6);
    expect(Math.abs(12 * r.avg.i_bat! + 0.05 * r.meanSquare.i_bat! - P) / P).toBeLessThan(1e-12);
  });

  it('a battery above what the converter can give: it discharges into the resistor, and no current flows back through the diode', () => {
    const p: SimParams = { topology: 'buck', Vg: 24, D: 0.3, fs, L: 1e-4, load: { kind: 'network', C: 22e-6, R: 5, battery: { V: 12, R: 0.5 } } };
    const r = simulate(p);
    expect(r.status).toBe('steady');
    expect(r.avg.i_bat!).toBeLessThan(0);
    expect(r.min.i_L!).toBeGreaterThanOrEqual(-1e-12 * r.max.i_L!);
    // the output sits between the battery's voltage and the converter's: V = (V_b/R_b + I_L) / (1/R_b + 1/R)
    expect(r.avg.v_out!).toBeLessThan(12);
  });
});

describe('start-up from rest: energy is conserved cycle by cycle', () => {
  const cases: [string, SimParams, number][] = [
    ['flyback charging a capacitor alone, ideal parts', { topology: 'flyback', Vg: 24, D: 0.3, fs, L: 5e-5, n: 1, load: { kind: 'network', C: 1e-4, V0: 0 } }, 400],
    ['buck charging a capacitor alone, ideal parts', { topology: 'buck', Vg: 24, D: 0.5, fs, L: 1e-4, load: { kind: 'network', C: 22e-6, V0: 0 } }, 300],
    ['boost into a battery and a resistor, with losses', { topology: 'boost', Vg: 12, D: 0.4, fs, L: 1e-4, Ron: 0.05, RL: 0.03, VF: 0.4, load: { kind: 'network', C: 22e-6, R: 40, battery: { V: 16, R: 1 } } }, 200],
    ['flyback into a fixed output, running away', { topology: 'flyback', Vg: 300, D: 0.25, fs, L: 1e-4, n: 0.2, load: { kind: 'fixed', V: 5 } }, 20],
    ['flyback with a node capacitance into a battery', { topology: 'flyback', Vg: 48, D: 0.3, fs, L: 2e-5, n: 0.25, VF: 0.5, Ron: 0.1, Cnode: 1e-10, load: { kind: 'network', C: 1e-4, battery: { V: 12, R: 0.05 } } }, 100],
  ];
  for (const [name, p, cycles] of cases) {
    it(name, () => {
      const model = buildModel(p);
      const steps = stepsFor(p);
      let x = restState(p, model);
      const x0 = x;
      let Ein = 0;
      let Eload = 0;
      let Elost = 0;
      for (let k = 0; k < cycles; k++) {
        const run = runCycle(model, x, { stepsPerPeriod: steps, record: true });
        const r = analyse(p, model, { x0: x, cycles: 1, converged: false, residual: NaN, run });
        Ein += avgOf(r, (j) => (r.waveforms.v_in as number[])[j]! * (r.waveforms.i_in as number[])[j]!) * Ts;
        Eload += loadPower(p, r) * Ts;
        Elost += r.losses.total * Ts;
        x = run.x;
      }
      // energy stored in the inductor(s) and the output capacitor, at the end less at the start
      const names = model.stateNames;
      const stored = (s: number[]) => {
        let E = 0.5 * p.L * s[names.indexOf('i')]! ** 2;
        const iM = names.indexOf('iM');
        if (iM >= 0) E += 0.5 * p.LM! * s[iM]! ** 2;
        const iv = names.indexOf('v');
        if (iv >= 0) E += 0.5 * (p.load as { C: number }).C * s[iv]! ** 2;
        const ic = names.indexOf('vc');
        if (ic >= 0) E += 0.5 * p.Cnode! * s[ic]! ** 2;
        return E;
      };
      const dStored = stored(x) - stored(x0);
      expect(Ein).toBeGreaterThan(0);
      expect(Math.abs(Ein - dStored - Eload - Elost)).toBeLessThan(1e-6 * Ein);
    });
  }
});
