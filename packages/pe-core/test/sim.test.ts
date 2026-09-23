import { describe, expect, it } from 'vitest';
import { evaluate } from '../src/equations';
import { affineStep, analyticM, analyticRipplePP, buildModel, expm, runTransient, simulate, stepsFor, type SimParams, type Topology } from '../src/sim';

const rel = (a: number, b: number) => Math.abs(a - b) / Math.abs(b);

describe('linear algebra', () => {
  it('expm of a rotation generator is a rotation', () => {
    const t = 2.3;
    const E = expm([
      [0, t],
      [-t, 0],
    ]);
    expect(E[0]![0]!).toBeCloseTo(Math.cos(t), 13);
    expect(E[0]![1]!).toBeCloseTo(Math.sin(t), 13);
    expect(E[1]![0]!).toBeCloseTo(-Math.sin(t), 13);
  });
  it('expm handles large norms by scaling and squaring', () => {
    const E = expm([
      [-40, 0],
      [0, 3],
    ]);
    expect(rel(E[0]![0]!, Math.exp(-40))).toBeLessThan(1e-10);
    expect(rel(E[1]![1]!, Math.exp(3))).toBeLessThan(1e-13);
  });
  it('affineStep is the exact solution of a first-order lag', () => {
    const tau = 1e-3;
    const u = 5;
    const h = 7e-4;
    const { Phi, Gamma } = affineStep([[-1 / tau]], [u / tau], h);
    const x0 = 1;
    const exact = x0 * Math.exp(-h / tau) + u * (1 - Math.exp(-h / tau));
    expect(rel(Phi[0]![0]! * x0 + Gamma[0]!, exact)).toBeLessThan(1e-13);
  });
});

// Validation grid (docs/BUILD_SPEC.md §4): ideal components, D and K on both
// sides of K_crit; simulated M and peak-to-peak inductor ripple within 2 % of
// the analytic equations, and the detected mode must match K against K_crit.
const Vg = 12;
const R = 10;
const fs = 1e5;
const Ts = 1 / fs;
const kcrit = (topology: Topology, D: number, n: number): number =>
  ({
    buck: evaluate('Kcrit.buck', { D }),
    boost: evaluate('Kcrit.boost', { D }),
    buckboost: evaluate('Kcrit.buckboost', { D }),
    flyback: evaluate('Kcrit.flyback', { D, n }),
    forward: evaluate('Kcrit.buck', { D }),
  })[topology];

describe('simulator validation grid', () => {
  const topologies: Topology[] = ['buck', 'boost', 'buckboost', 'flyback'];
  for (const topology of topologies) {
    for (const D of [0.2, 0.35, 0.5, 0.65, 0.8]) {
      for (const ratio of [0.3, 0.6, 1.6, 3]) {
        const n = topology === 'flyback' ? 0.5 : 1;
        const K = ratio * kcrit(topology, D, n);
        it(`${topology} D=${D} K/Kcrit=${ratio}`, () => {
          const p: SimParams = {
            topology,
            Vg,
            D,
            fs,
            n,
            L: (K * R * Ts) / 2,
            load: { kind: 'resistive', R, C: (100 * Ts) / R },
          };
          const r = simulate(p);
          expect(r.converged).toBe(true);
          expect(r.cycles).toBeLessThan(2000);
          expect(r.mode).toBe(ratio < 1 ? 'DCM' : 'CCM');
          const M = Math.abs(analyticM(p, K, r.Kcrit));
          expect(rel(Math.abs(r.M), M)).toBeLessThan(0.02);
          const ripple = analyticRipplePP(p, Vg, r.avg.v_out!);
          expect(rel(r.pp.i_L!, ripple)).toBeLessThan(0.02);
        });
      }
    }
  }

  it('forward converter in CCM: M = n D, reset completes below D_max', () => {
    const p: SimParams = {
      topology: 'forward',
      Vg: 48,
      D: 0.4,
      fs,
      n: 0.25,
      nr: 1,
      LM: 1e-3,
      L: 1e-4,
      load: { kind: 'resistive', R: 2, C: 5e-4 },
    };
    const r = simulate(p);
    expect(r.converged).toBe(true);
    expect(r.mode).toBe('CCM');
    expect(rel(r.M, 0.1)).toBeLessThan(0.02);
    // the switch blocks V_g (1 + 1/n_r) while the reset winding conducts
    expect(rel(r.max.v_sw!, evaluate('forward.Vds', { V_g: 48, n_r: 1 }))).toBeLessThan(1e-9);
    // the magnetizing current returns to zero in every period
    const iM = r.waveforms.i_M as number[];
    expect(Math.min(...iM)).toBeGreaterThanOrEqual(-1e-12 * Math.max(...iM));
  });
});

describe('no periodic steady state', () => {
  // The convergence measure is relative to how far each state moves within a
  // cycle, not to its peak: a state that grows by the same amount every cycle
  // must never pass, however large it has become (a Newton step can make it
  // very large at once).
  it('a fixed output fed in CCM from a fixed input: the inductor current grows every cycle', () => {
    const r = simulate({ topology: 'buck', Vg: 24, D: 0.8, fs, L: 1e-4, load: { kind: 'fixed', V: 12 } });
    expect(r.converged).toBe(false);
    expect(r.cycles).toBeGreaterThanOrEqual(2000);
    expect(r.residual).toBeGreaterThan(0.1);
  });

  it('a forward converter above its reset limit: the magnetizing current walks up', () => {
    const Dmax = evaluate('forward.reset.Dmax', { n_r: 1 });
    const r = simulate({
      topology: 'forward',
      Vg: 48,
      D: Dmax + 0.2,
      fs,
      n: 0.25,
      nr: 1,
      LM: 1e-3,
      L: 1e-4,
      load: { kind: 'resistive', R: 2, C: 5e-4 },
    });
    expect(r.converged).toBe(false);
  });

  it('the same forward converter below the limit converges', () => {
    const Dmax = evaluate('forward.reset.Dmax', { n_r: 1 });
    const r = simulate({
      topology: 'forward',
      Vg: 48,
      D: Dmax - 0.1,
      fs,
      n: 0.25,
      nr: 1,
      LM: 1e-3,
      L: 1e-4,
      load: { kind: 'resistive', R: 2, C: 5e-4 },
    });
    expect(r.converged).toBe(true);
    expect(r.residual).toBeLessThan(1e-6);
  });
});

describe('losses and energy', () => {
  it('input energy = output energy + losses (no node capacitance)', () => {
    for (const topology of ['buck', 'boost', 'buckboost', 'flyback'] as Topology[]) {
      const p: SimParams = {
        topology,
        Vg: 24,
        D: 0.45,
        fs,
        n: 0.5,
        L: 2e-4,
        Ron: 0.05,
        RL: 0.03,
        VF: 0.4,
        load: { kind: 'resistive', R: 8, C: 1e-3 },
      };
      const r = simulate(p);
      expect(r.converged).toBe(true);
      const lost = r.energy.input - r.energy.output;
      expect(rel(lost, r.losses.total * Ts)).toBeLessThan(5e-3);
    }
  });

  it('a node capacitance rings at the L-C frequency in DCM and adds a turn-on loss', () => {
    const p: SimParams = {
      topology: 'flyback',
      Vg: 24,
      D: 0.2,
      fs: 5e4,
      n: 0.5,
      L: 2e-5,
      Ron: 0.05,
      Cnode: 1e-9,
      load: { kind: 'resistive', R: 50, C: 5e-4 },
    };
    const r = simulate(p);
    expect(r.converged).toBe(true);
    expect(r.mode).toBe('DCM');
    // Ringing period from successive maxima of the switch voltage while idle.
    const t = r.waveforms.t as number[];
    const v = r.waveforms.v_sw as number[];
    const iv = r.waveforms.interval as string[];
    const peaks: number[] = [];
    for (let k = 1; k < t.length - 1; k++) {
      if (iv[k] === 'ring' && iv[k - 1] === 'ring' && iv[k + 1] === 'ring' && v[k]! > v[k - 1]! && v[k]! >= v[k + 1]!) peaks.push(t[k]!);
    }
    expect(peaks.length).toBeGreaterThanOrEqual(2);
    const period = (peaks[peaks.length - 1]! - peaks[0]!) / (peaks.length - 1);
    const f = evaluate('dcm.ring.f', { L_M: p.L, C_node: p.Cnode! });
    expect(rel(1 / period, f)).toBeLessThan(0.02);
    expect(r.losses.capacitive).toBeGreaterThan(0);
  });
});

describe('reviewed cases (energy accounting, reverse current, slow and fast states)', () => {
  const powers = (r: ReturnType<typeof simulate>) => ({ Pin: r.energy.input * (1 / (r.waveforms.t as number[]).at(-1)!), Pout: r.energy.output * (1 / (r.waveforms.t as number[]).at(-1)!) });

  // With a node capacitance the inductor charges it after turn-off, so the
  // energy that the switch later dissipates at turn-on comes from the circuit.
  for (const [name, p] of [
    ['flyback CCM', { topology: 'flyback', Vg: 24, D: 0.45, fs: 1e5, n: 0.5, L: 2e-4, Ron: 0.05, Cnode: 2e-9, load: { kind: 'resistive', R: 8, C: 1e-3 } }],
    ['flyback DCM', { topology: 'flyback', Vg: 24, D: 0.45, fs: 1e5, n: 0.5, L: 5e-6, Ron: 0.05, Cnode: 1e-9, load: { kind: 'resistive', R: 50, C: 1e-3 } }],
    ['boost CCM', { topology: 'boost', Vg: 24, D: 0.45, fs: 1e5, L: 2e-4, Ron: 0.05, Cnode: 2e-9, load: { kind: 'resistive', R: 8, C: 1e-3 } }],
    ['buck DCM', { topology: 'buck', Vg: 24, D: 0.45, fs: 1e5, L: 5e-6, Ron: 0.05, Cnode: 1e-9, load: { kind: 'resistive', R: 50, C: 1e-3 } }],
  ] as [string, SimParams][]) {
    it(`${name} with a node capacitance: input power = output power + losses`, () => {
      const r = simulate(p);
      expect(r.converged).toBe(true);
      expect(r.losses.capacitive).toBeGreaterThan(0);
      const { Pin, Pout } = powers(r);
      expect(Math.abs(Pin - Pout - r.losses.total) / r.losses.total).toBeLessThan(1e-3);
    });
  }

  it('a ringing buck still delivers its inductor current to the output (charge balance)', () => {
    const r = simulate({ topology: 'buck', Vg: 24, D: 0.45, fs: 1e5, L: 5e-6, Ron: 0.05, Cnode: 1e-9, load: { kind: 'resistive', R: 50, C: 1e-3 } });
    expect(r.mode).toBe('DCM');
    expect(rel(r.avg.i_out!, r.avg.v_out! / 50)).toBeLessThan(1e-6);
    expect(rel(r.avg.i_L!, r.avg.i_out!)).toBeLessThan(1e-6);
  });

  it('a forward converter with its output held above n V_g: the rectifier blocks, no current flows', () => {
    const r = simulate({ topology: 'forward', Vg: 48, D: 0.4, fs: 1e5, n: 0.5, nr: 1, LM: 1e-3, L: 1e-4, VF: 0.5, load: { kind: 'fixed', V: 30 } });
    expect(r.converged).toBe(true);
    expect(r.min.i_L!).toBeGreaterThanOrEqual(0);
    expect(r.max.i_L!).toBe(0);
    expect(r.losses.diode).toBe(0);
  });

  it('a buck with its output held above its input has no steady state (the body diode conducts backwards)', () => {
    const r = simulate({ topology: 'buck', Vg: 24, D: 0.5, fs: 1e5, L: 1e-4, VF: 0.5, load: { kind: 'fixed', V: 30 } });
    expect(r.converged).toBe(false);
    expect(r.max.i_L!).toBeLessThan(0);
  });

  it('a very slow output capacitor (a time constant of 1e6 periods) still converges to the hand value', () => {
    const r = simulate({ topology: 'buck', Vg: 24, D: 0.5, fs: 1e5, L: 1e-4, Ron: 0.05, RL: 0.1, VF: 0.5, load: { kind: 'resistive', R: 10, C: 1 } });
    expect(r.converged).toBe(true);
    // CCM buck with losses: V (1 + (R_L + D R_on)/R) = D V_g - (1 - D) V_F
    expect(rel(r.avg.v_out!, (0.5 * 24 - 0.5 * 0.5) / (1 + (0.1 + 0.5 * 0.05) / 10))).toBeLessThan(1e-5);
  });

  it('a source-driven flyback on a 1 F bus converges to the loss-free-resistor divider', () => {
    const r = simulate({
      topology: 'flyback', Vg: 0, D: 0.2, fs: 1e4, n: 0.1, L: 0.02, VF: 0.5,
      load: { kind: 'fixed', V: 5 }, source: { Voc: 200, Rs: 1e4, Cbus: 1 },
    });
    expect(r.converged).toBe(true);
    expect(r.mode).toBe('DCM');
    const Rin = evaluate('lfr.R_in', { L_M: 0.02, f_s: 1e4, D: 0.2 });
    expect(rel(r.avg.v_in!, (200 * Rin) / (Rin + 1e4))).toBeLessThan(1e-4);
  });

  it('a node capacitance that rings fast gets finer sub-steps, and the result matches a much finer run', () => {
    const p: SimParams = { topology: 'flyback', Vg: 24, D: 0.3, fs: 1e5, n: 1, L: 2.08e-5, Ron: 0.05, Cnode: 5e-13, load: { kind: 'resistive', R: 50, C: 1e-4 } };
    const ringPeriod = 2 * Math.PI * Math.sqrt(p.L * p.Cnode!);
    expect(stepsFor(p)).toBeGreaterThanOrEqual(Math.min(20000, 20 / (p.fs * ringPeriod)));
    const r = simulate(p);
    const fine = simulate(p, { stepsPerPeriod: 40000 });
    expect(rel(r.avg.v_out!, fine.avg.v_out!)).toBeLessThan(1e-3);
    expect(Math.abs(r.losses.capacitive - fine.losses.capacitive)).toBeLessThan(0.02 * Math.max(fine.losses.capacitive, 1e-6) + 1e-9);
  });

  it('a source-driven boost with a small bus capacitor: the diode conducts again when the bus exceeds the output', () => {
    const p: SimParams = { topology: 'boost', Vg: 0, D: 0.3, fs: 1e5, L: 1e-4, VF: 0.5, load: { kind: 'fixed', V: 12 }, source: { Voc: 20, Rs: 10, Cbus: 1e-7 } };
    const r = simulate(p);
    const w = r.waveforms;
    const vin = w.v_in as number[];
    const iv = w.interval as string[];
    for (let k = 0; k < vin.length; k++) if (iv[k] === 'idle') expect(vin[k]! - 12.5).toBeLessThan(1e-6);
  });
});

describe('source-driven mode', () => {
  // Fixed-D flyback charging a fixed output from a Thevenin source (§4):
  // when the source can supply more than the DCM power at V_g,crit, CCM sets
  // in and pins the bus at V_g,crit.
  const base = { topology: 'flyback' as const, Vg: 0, D: 0.2, fs: 1e4, n: 0.1, L: 0.02, VF: 0.5, load: { kind: 'fixed' as const, V: 5 } };
  const Vcrit = evaluate('flyback.V_crit', { V: 5, V_D: 0.5, D: 0.2, n: 0.1 });

  it('pins the bus at V_g,crit when V_oc is far above it', () => {
    const r = simulate({ ...base, source: { Voc: 1000, Rs: 1e4, Cbus: 1e-5 } });
    expect(r.converged).toBe(true);
    expect(r.mode).toBe('CCM');
    expect(rel(r.avg.v_in!, Vcrit)).toBeLessThan(0.02);
  });

  it('settles below V_g,crit in DCM when the source cannot supply that much', () => {
    const r = simulate({ ...base, source: { Voc: 150, Rs: 1e4, Cbus: 1e-5 } });
    expect(r.converged).toBe(true);
    expect(r.mode).toBe('DCM');
    expect(r.avg.v_in!).toBeLessThan(Vcrit);
  });

  it('a transient run from an empty bus rises, overshoots and settles at V_g,crit', () => {
    // The magnetizing current needs time to build up once CCM starts, so the
    // bus overshoots and rings (L_M with C_bus, lightly damped by R_s).
    const p: SimParams = { ...base, source: { Voc: 1000, Rs: 1e4, Cbus: 1e-5 } };
    const model = buildModel(p);
    const tr = runTransient(() => model, [0, 0], 6000, { stepsPerPeriod: 200, record: false });
    const vbus = tr.states.map((x) => x[1]!);
    expect(rel(vbus[vbus.length - 1]!, Vcrit)).toBeLessThan(0.03);
    expect(Math.max(...vbus)).toBeLessThan(1.1 * Vcrit);
  });
});
