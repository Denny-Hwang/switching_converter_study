import { describe, expect, it } from 'vitest';
import { buildModel, checkRange, linearIntegral, periodIntegrals, quadraticIntegral, runCycle, simulate, stepsFor, type CycleRun, type Model, type SimParams, type Topology } from '../src/sim';

const rel = (a: number, b: number) => Math.abs(a - b) / Math.abs(b);

describe('exact integrals of an interval', () => {
  it('a first-order decay, x′ = −a x + b: ∫x and ∫x² in closed form, also far stiffer than the step', () => {
    for (const [a, b, x0, h] of [
      [2, 3, 5, 0.7],
      [1e9, 2e9, -4, 1e-6], // 1000 time constants within the step
      [4.96e8, 1e8, 7, 3.3e-7],
    ] as const) {
      const F = [
        [-a, b],
        [0, 0],
      ];
      const xInf = b / a;
      const d = x0 - xInf;
      const e1 = -Math.expm1(-a * h);
      const e2 = -Math.expm1(-2 * a * h);
      const lin = xInf * h + (d * e1) / a;
      const quad = xInf * xInf * h + (2 * xInf * d * e1) / a + (d * d * e2) / (2 * a);
      const { Phi, Int } = linearIntegral(F, h);
      expect(rel(Phi[0]![0]!, Math.exp(-a * h) || 1e-300) < 1e-9 || Math.abs(Phi[0]![0]!) < 1e-300).toBe(true);
      expect(rel(Int[0]![0]! * x0 + Int[0]![1]!, lin)).toBeLessThan(1e-12);
      // y = x: Q = c cᵀ with c = [1, 0]
      const W = quadraticIntegral(F, [
        [1, 0],
        [0, 0],
      ], h);
      const z = [x0, 1];
      const zWz = z.reduce((s, zi, i) => s + zi * z.reduce((t, zj, j) => t + W[i]![j]! * zj, 0), 0);
      expect(rel(zWz, quad)).toBeLessThan(1e-11);
    }
  });

  it('an undamped L-C ring over whole and partial periods: ∫x² of a sinusoid', () => {
    const w = 2 * Math.PI * 1e6;
    // x′ = y w, y′ = −x w: x = sin(w t) from x = 0, y = 1
    const F = [
      [0, w, 0],
      [-w, 0, 0],
      [0, 0, 0],
    ];
    for (const h of [1e-6, 0.37e-6, 2.5e-6]) {
      const W = quadraticIntegral(F, [
        [1, 0, 0],
        [0, 0, 0],
        [0, 0, 0],
      ], h);
      const z = [0, 1, 1];
      const zWz = z.reduce((s, zi, i) => s + zi * z.reduce((t, zj, j) => t + W[i]![j]! * zj, 0), 0);
      const exact = h / 2 - Math.sin(2 * w * h) / (4 * w);
      expect(Math.abs(zWz - exact)).toBeLessThan(1e-12 * h);
    }
  });
});

describe('extremes inside a segment', () => {
  it('two fast decays and a slow ramp turn the slope twice within one segment whose ends slope the same way: both turns are found', () => {
    // y = d1 e^{-t/tau1} - d2 e^{-t/tau2} + beta t, from three states: the slope is positive at both ends, but
    // negative from a few tau2 to a few tau1; a peak near 4 ns and a dip near 0.7 us, inside one 10 us segment
    const [tau1, tau2, beta, d1, d2, h] = [1e-7, 1e-9, 1e4, 1, 0.5, 1e-5];
    const model = {
      topology: 'test',
      stateNames: ['x1', 'x2', 'x3'],
      Ts: h,
      D: 0.5,
      intervals: {
        only: {
          name: 'only',
          gate: true,
          A: [
            [-1 / tau1, 0, 0],
            [0, -1 / tau2, 0],
            [0, 0, 0],
          ],
          b: [0, 0, beta],
          guards: [],
        },
      },
      idle: [],
      turnOn: () => ({ interval: 'only' }),
      turnOff: () => ({ interval: 'only' }),
      outputs: (x: number[]) => ({ y: d1 * x[0]! - d2 * x[1]! + x[2]! }),
    } as unknown as Model;
    const y = (t: number) => d1 * Math.exp(-t / tau1) - d2 * Math.exp(-t / tau2) + beta * t;
    const dy = (t: number) => (-d1 / tau1) * Math.exp(-t / tau1) + (d2 / tau2) * Math.exp(-t / tau2) + beta;
    const root = (a: number, b: number) => {
      for (let i = 0; i < 200; i++) {
        const m = 0.5 * (a + b);
        if (Math.sign(dy(m)) === Math.sign(dy(a))) a = m;
        else b = m;
      }
      return 0.5 * (a + b);
    };
    const run = {
      samples: [
        { t: 0, interval: 'only', x: [1, 1, 0] },
        { t: h, interval: 'only', x: [Math.exp(-h / tau1), Math.exp(-h / tau2), beta * h] },
      ],
    } as unknown as CycleRun;
    expect(dy(0)).toBeGreaterThan(0);
    expect(dy(h)).toBeGreaterThan(0);
    const ex = periodIntegrals(model, run);
    const peak = y(root(1e-10, 5e-8));
    const dip = y(root(5e-8, 5e-6));
    expect(peak).toBeGreaterThan(Math.max(y(0), y(h)));
    expect(dip).toBeLessThan(Math.min(y(0), y(h)));
    expect(rel(ex.max.y!, peak)).toBeLessThan(1e-9);
    expect(rel(ex.min.y!, dip)).toBeLessThan(1e-9);
    const lin = d1 * tau1 * -Math.expm1(-h / tau1) - d2 * tau2 * -Math.expm1(-h / tau2) + (beta * h * h) / 2;
    expect(rel(ex.lin.y!, lin)).toBeLessThan(1e-12);
  });
});

describe('a peak between two samples of a ring', () => {
  // x = sin(w t + phi0) from one sample to the next: its crest, 1, lies between them
  const w = 2 * Math.PI * 1e6;
  const ring = {
    topology: 'test',
    stateNames: ['x', 'y'],
    Ts: 1,
    D: 0.5,
    intervals: {
      only: {
        name: 'only',
        gate: true,
        A: [
          [0, w],
          [-w, 0],
        ],
        b: [0, 0],
        guards: [],
      },
    },
    idle: [],
    turnOn: () => ({ interval: 'only' }),
    turnOff: () => ({ interval: 'only' }),
    outputs: (x: number[]) => ({ x: x[0]! }),
  } as unknown as Model;
  const between = (phi0: number, wh: number) =>
    ({
      samples: [
        { t: 0, interval: 'only', x: [Math.sin(phi0), Math.cos(phi0)] },
        { t: wh / w, interval: 'only', x: [Math.sin(phi0 + wh), Math.cos(phi0 + wh)] },
      ],
    }) as unknown as CycleRun;

  it('within a radian of the crest (the Taylor series of the solution)', () => {
    const ex = periodIntegrals(ring, between(Math.PI / 2 - 0.3, 0.7));
    expect(Math.abs(ex.max.x! - 1)).toBeLessThan(1e-13);
    // the least value is the later sample's, 0.4 rad past the crest
    expect(Math.abs(ex.min.x! - Math.sin(Math.PI / 2 + 0.4))).toBeLessThan(1e-15);
  });

  it('two and a half radians apart, the crest in the last half (exponentials)', () => {
    const ex = periodIntegrals(ring, between(Math.PI / 2 - 1.8, 2.5));
    expect(Math.abs(ex.max.x! - 1)).toBeLessThan(1e-13);
    expect(Math.abs(ex.min.x! - Math.sin(Math.PI / 2 - 1.8))).toBeLessThan(1e-15);
    // and the integral of the sine: (cos(phi0) - cos(phi0 + w h)) / w
    expect(rel(ex.lin.x!, (Math.cos(Math.PI / 2 - 1.8) - Math.cos(Math.PI / 2 + 0.7)) / w)).toBeLessThan(1e-12);
  });
});

describe('a ring riding on a steeper ramp: its slope dips through zero and back within one sub-step', () => {
  // y = a sin(w t + phi) + beta t with beta = -B a w (B < 1): the slope, a w (cos(w t + phi) - B), is positive only
  // within acos(B) of the ring's rising zero crossing. At 20 sub-steps per ring and at the 3-per-ring floor, a
  // sub-step can hold both turns with both ends sloping down; the slope's rate shows the dip, and both turns are
  // searched
  const segment = (w: number, h: number, beta: number, phi: number) => {
    const model = {
      topology: 'test',
      stateNames: ['p', 'q', 'r'],
      Ts: h,
      D: 0.5,
      intervals: {
        only: {
          name: 'only',
          gate: true,
          A: [
            [0, w, 0],
            [-w, 0, 0],
            [0, 0, 0],
          ],
          b: [0, 0, beta],
          guards: [],
        },
      },
      idle: [],
      turnOn: () => ({ interval: 'only' }),
      turnOff: () => ({ interval: 'only' }),
      outputs: (x: number[]) => ({ y: x[0]! + x[2]! }),
    } as unknown as Model;
    const run = {
      samples: [
        { t: 0, interval: 'only', x: [Math.sin(phi), Math.cos(phi), 0] },
        { t: h, interval: 'only', x: [Math.sin(phi + w * h), Math.cos(phi + w * h), beta * h] },
      ],
    } as unknown as CycleRun;
    return periodIntegrals(model, run);
  };

  it('both turns are found, at 20 and at 3 sub-steps per ring', () => {
    let inside = 0;
    for (const wh of [(2 * Math.PI) / 20, 2]) {
      for (const B of [0.9, 0.99, 0.999]) {
        // sub-steps around the rising zero crossing (theta = 0), and around the crest
        for (let f = 0; f <= 41; f++) {
          const h = 1e-6;
          const w = wh / h;
          const beta = -B * w;
          const phi = (f <= 20 ? 0 : Math.PI / 2) - wh * ((f % 21) / 20);
          const y = (t: number) => Math.sin(w * t + phi) + beta * t;
          let hi = -Infinity;
          let lo = Infinity;
          for (let i = 0; i <= 20000; i++) {
            const v = y((h * i) / 20000);
            hi = Math.max(hi, v);
            lo = Math.min(lo, v);
          }
          const ex = segment(w, h, beta, phi);
          const range = hi - lo;
          // a peak inside the sub-step above both ends, where both ends slope down: the slope dipped through zero and back
          if (hi > Math.max(y(0), y(h)) + 1e-9 * range && Math.cos(phi) - B < 0 && Math.cos(phi + wh) - B < 0) inside++;
          // the dense grid can only fall short of the true extremes, by at most its spacing's second-order error
          expect(ex.max.y! - hi, `wh ${wh} B ${B} f ${f}`).toBeGreaterThanOrEqual(-1e-12 * range);
          expect(lo - ex.min.y!, `wh ${wh} B ${B} f ${f}`).toBeGreaterThanOrEqual(-1e-12 * range);
          expect(ex.max.y! - hi).toBeLessThan(1e-6 * range);
          expect(lo - ex.min.y!).toBeLessThan(1e-6 * range);
        }
      }
    }
    // the cases do hold such double turns
    expect(inside).toBeGreaterThanOrEqual(10);
  });
});

describe('an output that an interval does not define', () => {
  it('is NaN over the period, not zero where it is missing', () => {
    const model = {
      topology: 'test',
      stateNames: ['x'],
      Ts: 2,
      D: 0.5,
      intervals: {
        a: { name: 'a', gate: true, A: [[-1]], b: [1], guards: [] },
        b: { name: 'b', gate: false, A: [[-1]], b: [0], guards: [] },
      },
      idle: [],
      turnOn: () => ({ interval: 'a' }),
      turnOff: () => ({ interval: 'b' }),
      outputs: (x: number[], iv: string) => (iv === 'a' ? { x: x[0]!, w: 2 * x[0]! } : { x: x[0]! }),
    } as unknown as Model;
    const run = {
      samples: [
        { t: 0, interval: 'a', x: [0] },
        { t: 1, interval: 'a', x: [1 - Math.exp(-1)] },
        { t: 1, interval: 'b', x: [1 - Math.exp(-1)] },
        { t: 2, interval: 'b', x: [(1 - Math.exp(-1)) * Math.exp(-1)] },
      ],
    } as unknown as CycleRun;
    const ex = periodIntegrals(model, run, [
      ['x', 'x'],
      ['x', 'w'],
    ]);
    expect(Number.isNaN(ex.lin.w!)).toBe(true);
    expect(Number.isNaN(ex.quad['x*w']!)).toBe(true);
    // x itself is defined throughout: ∫ = (1 - e^-1) (1 + (1 - e^-1)) - (1 - e^-1) + ... in closed form
    const x1 = 1 - Math.exp(-1);
    expect(rel(ex.lin.x!, 1 - x1 + x1 * (1 - Math.exp(-1)))).toBeLessThan(1e-13);
  });
});

describe('exact period integrals of the simulator', () => {
  const fs = 1e5;
  const loads: SimParams['load'][] = [
    { kind: 'resistive', R: 10, C: 1e-4 },
    { kind: 'network', C: 1e-4, battery: { V: 8, R: 0.5 } },
    { kind: 'network', C: 1e-5, R: 20, battery: { V: 8, R: 0.05 } },
  ];

  it("the integrals keep the charge and the volt-seconds exactly: ∫i_C dt = C Δv and ∫(v_L − R_L i_L) dt = L Δi over the period", () => {
    for (const topology of ['buck', 'boost', 'buckboost', 'flyback', 'forward'] as Topology[]) {
      for (const load of loads) {
        for (const extra of [{}, { source: { Voc: 30, Rs: 1, Cbus: 1e-6 } }, ...(topology === 'forward' ? [] : [{ Cnode: 1e-10 }])]) {
          const p = { topology, Vg: 24, D: 0.4, fs, L: 1e-4, n: 0.5, nr: 1, LM: 1e-3, Ron: 0.1, RL: 0.05, VF: 0.5, load, ...extra } as SimParams;
          const r = simulate(p);
          const what = JSON.stringify(p);
          expect(r.status, what).toBe('steady');
          const model = buildModel(p);
          // from a start a little off the orbit, so that the states do change over the period
          const x0 = r.x0.map((v, j) => (model.stateNames[j] === 'v' ? v * 1.001 : v));
          const run = runCycle(model, x0, { stepsPerPeriod: stepsFor(p), record: true });
          const ex = periodIntegrals(model, run);
          const Ts = 1 / fs;
          const iv = model.stateNames.indexOf('v');
          const ii = model.stateNames.indexOf('i');
          const C = (load as { C: number }).C;
          const qScale = Math.max(ex.max.i_C!, -ex.min.i_C!) * Ts;
          expect(Math.abs(ex.lin.i_C! - C * (run.x[iv]! - x0[iv]!)), what).toBeLessThanOrEqual(1e-10 * qScale);
          const vsScale = Math.max(ex.max.v_L!, -ex.min.v_L!) * Ts;
          expect(Math.abs(ex.lin.v_L! - (p.RL ?? 0) * ex.lin.i_L! - p.L * (run.x[ii]! - x0[ii]!)), what).toBeLessThanOrEqual(1e-10 * vsScale);
        }
      }
    }
  });

  it('the averages do not depend on the sub-steps', () => {
    for (const p of [
      { topology: 'boost', Vg: 12, D: 0.5, fs, L: 5e-5, Ron: 0.05, VF: 0.4, load: { kind: 'network', C: 1e-5, R: 50, battery: { V: 20, R: 0.1 } } },
      { topology: 'flyback', Vg: 24, D: 0.3, fs, n: 0.5, L: 1e-4, Ron: 0.05, VF: 0.4, Cnode: 1e-10, load: { kind: 'resistive', R: 50, C: 1e-5 } },
      { topology: 'forward', Vg: 24, D: 0.4, fs, n: 0.5, nr: 1, L: 1e-4, LM: 1e-3, Ron: 0.1, VF: 0.5, load: { kind: 'resistive', R: 10, C: 1e-4 } },
    ] as SimParams[]) {
      const model = buildModel(p);
      const r = simulate(p);
      const n = stepsFor(p);
      const a = periodIntegrals(model, runCycle(model, r.x0, { stepsPerPeriod: n, record: true }), [['v_out', 'i_out']]);
      const b = periodIntegrals(model, runCycle(model, r.x0, { stepsPerPeriod: 3 * n + 7, record: true }), [['v_out', 'i_out']]);
      for (const k of ['v_out', 'i_L', 'i_in', 'i_out', 'i_D']) {
        const size = Math.max(Math.abs(a.lin[k]!), 1e-12 * (Math.abs(a.max[k]!) + Math.abs(a.min[k]!)) / fs);
        expect(Math.abs(a.lin[k]! - b.lin[k]!), `${p.topology} ${k}`).toBeLessThanOrEqual(1e-10 * size + 1e-300);
        expect(Math.abs(a.max[k]! - b.max[k]!), `${p.topology} max ${k}`).toBeLessThanOrEqual(1e-9 * Math.abs(a.max[k]!) + 1e-12);
      }
      expect(rel(a.quad['v_out*i_out']!, b.quad['v_out*i_out']!)).toBeLessThan(1e-10);
    }
  });

  it("a time constant far shorter than a sub-step: the seventh review's circuits, against its own exact integrals", () => {
    // a 200 pF output across 10 ohms at 1.5 kHz: 2 ns against a sub-step of 0.33 us. The trapezoids through the
    // samples gave <v_out> = 1.086 V; converged on 1.28 million sub-steps, 2.27420 V; peak v_out about 5881 V
    const fly: SimParams = { topology: 'flyback', Vg: 24, D: 0.3, fs: 1500, L: 1e-5, n: 0.5, Ron: 0.05, VF: 0.4, load: { kind: 'resistive', R: 10, C: 2e-10 } };
    const r = simulate(fly);
    expect(r.status).toBe('steady');
    expect(rel(r.avg.v_out!, 2.2742)).toBeLessThan(1e-4);
    expect(rel(r.energy.output * fly.fs, 690.4)).toBeLessThan(1e-3);
    expect(r.max.v_out!).toBeGreaterThan(5870);
    expect(r.max.v_out!).toBeLessThan(5890);
    // the output capacitor's charge balances: <i_C> = 0 and <i_out> = <i_R>
    expect(Math.abs(r.avg.i_C!)).toBeLessThan(1e-9 * r.max.i_C!);
    expect(rel(r.avg.i_out!, r.avg.i_R!)).toBeLessThan(1e-9);
    // the same with a weak source: 1.4164 mV against the trapezoids' 1.3117 mV
    const src: SimParams = { ...fly, Vg: 0, source: { Voc: 24, Rs: 100, Cbus: 7.21083e-8 } };
    const s = simulate(src);
    expect(s.status).toBe('steady');
    expect(rel(s.avg.v_out!, 1.4164e-3)).toBeLessThan(1e-3);
    expect(rel(s.avg.i_out!, s.avg.i_R!)).toBeLessThan(1e-9);
    // a boost charging a battery whose R_b C is 12.8 ps: <i_bat> = <i_out> = 1.3510 A (the trapezoids gave 1.3547 A)
    const bat: SimParams = { topology: 'boost', Vg: 4.261, D: 0.9453, fs: 425500, L: 1.801e-4, Ron: 0.1703, VF: 0.3984, load: { kind: 'network', C: 8.179e-9, battery: { V: 4.773, R: 0.001566 } } };
    const b = simulate(bat);
    expect(b.status).toBe('steady');
    expect(rel(b.avg.i_bat!, 1.351)).toBeLessThan(1e-3);
    expect(rel(b.avg.i_bat!, b.avg.i_out!)).toBeLessThan(1e-9);
  });

  it('the load table and the losses use the exact mean squares', () => {
    const p: SimParams = { topology: 'buck', Vg: 24, D: 0.6, fs, L: 1e-4, Ron: 0.1, RL: 0.05, VF: 0.5, load: { kind: 'network', C: 22e-6, R: 40, battery: { V: 12, R: 0.5 } } };
    const r = simulate(p);
    // v_out = V_b + R_b i_b at every instant, so <v_out i_b> = V_b <i_b> + R_b <i_b^2>: the powers add up exactly
    const model = buildModel(p);
    const ex = periodIntegrals(model, runCycle(model, r.x0, { stepsPerPeriod: stepsFor(p), record: true }), [['v_out', 'i_bat']]);
    expect(rel(ex.quad['v_out*i_bat']! / (1 / fs), 12 * r.avg.i_bat! + 0.5 * r.meanSquare.i_bat!)).toBeLessThan(1e-10);
    expect(rel(r.losses.conduction, 0.1 * r.meanSquare.i_sw! + 0.05 * r.meanSquare.i_L!)).toBeLessThan(1e-12);
  });
});

describe("a battery's current whose constant part dwarfs it", () => {
  // i_b = (v - V_b)/R_b with V_b/R_b about 1e8 times its rms value. Integrated from the deviation of the states, with
  // the rate of change at the reference state summed in twice the precision, it keeps its digits (the eighth review:
  // summed from its large terms, <i_b^2> came out 7.3 times too high, 51 times too high, or negative; the ninth: the
  // rate summed plainly left 5e-10). The references are 60-digit integrations of the model's own equations (its
  // coefficients as the doubles they are) through the same samples, the battery's current built exactly from its
  // parameters; recompute them if the engine's samples change
  const T1: SimParams = { topology: 'boost', Vg: 48, D: 0.1, fs: 1e5, L: 1e-3, Ron: 0.05, RL: 0.05, VF: 0.7, load: { kind: 'network', C: 1e-5, battery: { V: 400, R: 1e-3 } } };

  it('a boost charging a 400 V battery behind 1 mΩ lightly, and a flyback at D = 0.02', () => {
    const a = simulate(T1);
    expect(a.status).toBe('steady');
    expect(rel(a.meanSquare.i_bat!, 9.310875559980458e-6)).toBeLessThan(1e-12);
    expect(rel(a.avg.i_bat!, 3.2658902064834465e-4)).toBeLessThan(1e-12);
    const fly: SimParams = { topology: 'flyback', Vg: 48, D: 0.02, fs: 1e5, L: 1e-3, n: 10, Ron: 0.05, VF: 0.5, load: { kind: 'network', C: 1e-4, battery: { V: 400, R: 0.05 } } };
    const b = simulate(fly);
    expect(b.status).toBe('steady');
    expect(rel(b.meanSquare.i_bat!, 1.7214489375789962e-10)).toBeLessThan(1e-12);
    expect(rel(b.avg.i_bat!, 1.1505502491084284e-5)).toBeLessThan(1e-12);
  });

  it('a forward converter whose battery holds its rectifier off: no current, and no negative mean square', () => {
    const p: SimParams = { topology: 'forward', Vg: 24, D: 0.3, fs: 1e5, L: 1e-4, n: 0.5, nr: 1, LM: 1e-3, Ron: 0.1, VF: 0.5, load: { kind: 'network', C: 1e-4, battery: { V: 13, R: 0.05 } } };
    const r = simulate(p);
    expect(r.status).toBe('steady');
    expect(Math.abs(r.avg.i_bat!)).toBeLessThan(1e-15);
    expect(r.meanSquare.i_bat!).toBeGreaterThanOrEqual(0);
    expect(r.meanSquare.i_bat!).toBeLessThan(1e-28);
  });

  it('the mean square does not depend on the sub-steps', () => {
    const model = buildModel(T1);
    const r = simulate(T1);
    const n = stepsFor(T1);
    const pairs: [string, string][] = [['i_bat', 'i_bat']];
    const a = periodIntegrals(model, runCycle(model, r.x0, { stepsPerPeriod: n, record: true }), pairs);
    const b = periodIntegrals(model, runCycle(model, r.x0, { stepsPerPeriod: 3 * n + 7, record: true }), pairs);
    expect(rel(a.quad['i_bat*i_bat']!, b.quad['i_bat*i_bat']!)).toBeLessThan(1e-8);
  });
});

describe('a stiff input bus: the exponentials less the identity', () => {
  // the ninth review's circuits: a 1 mΩ source behind 1 pF, and behind 1 fF, R_s C_bus of 1e-15 s and of 1e-18 s
  // against a sub-step of 5e-7 s. Squared as e^{A τ}, the exponentials carried a slow mode's small change as 1 plus
  // a small number and multiplied its rounding by 2^s: the integrals came out up to 5e-5 off, and the steps moved
  // the results by up to 1e-3 between two grids. The references are 60-digit integrations through the same samples
  const B: SimParams = { topology: 'flyback', Vg: 0, D: 0.4, fs: 1000, L: 1e-3, n: 1, Ron: 0.05, VF: 0.5, source: { Voc: 400, Rs: 1e-3, Cbus: 1e-12 }, load: { kind: 'resistive', R: 100, C: 1e-4 } };
  const B18: SimParams = { ...B, source: { Voc: 400, Rs: 1e-3, Cbus: 1e-15 } };
  const C: SimParams = { topology: 'boost', Vg: 0, D: 0.5, fs: 1000, L: 1e-3, Ron: 0.05, RL: 0.05, VF: 0.5, source: { Voc: 400, Rs: 1e-3, Cbus: 1e-12 }, load: { kind: 'resistive', R: 100, C: 1e-4 } };

  it('the integrals agree with a 60-digit integration through the same samples', () => {
    for (const [p, ref] of [
      [B, { i_sw: 3361.602905260443, i_L: 4553.773166534377, i_D: 1192.1702612739339, v_out: 1119.290933580093 }],
      [B18, { i_sw: 3361.602905260449, i_L: 4553.773166534387, i_D: 1192.1702612739384, v_out: 1119.2909335800944 }],
      [C, { i_sw: 6420.011506816528, i_L: 8507.990961927495, i_D: 2087.9794551109676, v_out: 1588.8374972959648 }],
    ] as [SimParams, Record<string, number>][]) {
      const r = simulate(p);
      expect(r.status).toBe('steady');
      for (const k of ['i_sw', 'i_L', 'i_D']) expect(rel(r.meanSquare[k]!, ref[k]!), `${p.topology} ${k}`).toBeLessThan(1e-12);
      expect(rel(r.avg.v_out!, ref.v_out!)).toBeLessThan(1e-12);
    }
  });

  it('a bus a thousand times stiffer changes nothing, and neither do the sub-steps', () => {
    const a = simulate(B);
    const b = simulate(B18);
    for (const k of ['i_sw', 'i_L', 'i_D']) expect(rel(b.meanSquare[k]!, a.meanSquare[k]!), k).toBeLessThan(1e-12);
    const model = buildModel(B18);
    const n = stepsFor(B18);
    const pairs: [string, string][] = [['i_L', 'i_L']];
    const u = periodIntegrals(model, runCycle(model, b.x0, { stepsPerPeriod: n, record: true }), pairs);
    const w = periodIntegrals(model, runCycle(model, b.x0, { stepsPerPeriod: 3 * n + 7, record: true }), pairs);
    expect(rel(u.quad['i_L*i_L']!, w.quad['i_L*i_L']!)).toBeLessThan(1e-12);
    expect(rel(u.lin.v_out!, w.lin.v_out!)).toBeLessThan(1e-12);
  });

  it("a crest of the bus between two samples, whose slopes the old rounding rule dismissed, is found", () => {
    // v_in turns inside a sub-step, between checkpoints at h/4 and h/2, with slopes of about 100 V/s against the
    // 2e17 V/s of the bus's terms; the 60-digit crest of that segment from its start sample is 100.00150370464143 V
    const p: SimParams = { topology: 'flyback', Vg: 0, D: 0.3, fs: 10000, L: 1e-4, n: 1, Ron: 0.05, VF: 0.5, Cnode: 1e-9, source: { Voc: 100, Rs: 1e-3, Cbus: 1e-12 }, load: { kind: 'resistive', R: 500, C: 1e-5 } };
    const r = simulate(p);
    expect(r.status).toBe('steady');
    expect(Math.abs(r.max.v_in! - 100.00150370464143)).toBeLessThan(1e-12);
    // the samples alone miss it by 2.3 µV
    expect(Math.max(...(r.waveforms.v_in as number[]))).toBeLessThan(100.0015014);
  });
});

describe('a diode current that flows for femtoseconds', () => {
  it('keeps its mean square: from a reference in its own interval, not one whose formula makes it -2.4 A', () => {
    // the ninth review's circuit: the period starts in the reverse interval with the inductor at -2.4 A; the
    // diode's formula of the off interval, evaluated there, is -2.4 A, and taken from that state, <i_D^2> came out
    // -1.1e-28 A². The 60-digit references through the same samples
    const p: SimParams = { topology: 'flyback', Vg: 34.4, D: 0.723, fs: 274000, L: 1.18e-5, n: 0.998, Ron: 0.0085, VF: 0.751, Cnode: 4.5e-12, load: { kind: 'network', C: 3.92e-8, V0: 0 } };
    const r = simulate(p);
    const model = buildModel(p);
    const run = runCycle(model, r.x0, { stepsPerPeriod: stepsFor(p), record: true });
    const ex = periodIntegrals(model, run, [['i_D', 'i_D'], ['v_out', 'i_out']]);
    expect(ex.quad['i_D*i_D']!).toBeGreaterThan(0);
    expect(rel(ex.quad['i_D*i_D']! * p.fs, 8.569997407903061e-24)).toBeLessThan(1e-9);
    expect(rel(ex.quad['v_out*i_out']! * p.fs, 2.687218888048309e-13)).toBeLessThan(1e-9);
    expect(rel(ex.lin.i_D! * p.fs, 3.146720628202002e-17)).toBeLessThan(1e-9);
  });
});

describe('slopes within their own rounding', () => {
  it('start no root searches', () => {
    // the eighth review's circuits whose samples' rounding, amplified by a fast mode, turns the slopes at every
    // sub-step's start: searched, they cost 8092 and 1263 root searches; dismissed as rounding, none and 6
    for (const p of [
      { topology: 'forward', Vg: 25.7, D: 0.513, fs: 24100, L: 2.7e-5, n: 0.588, nr: 0.642, LM: 3.97e-4, Ron: 0.136, RL: 0.00781, VF: 0.632, load: { kind: 'network', C: 1.06e-9, R: 65.4, battery: { V: 317, R: 0.0428 } } },
      { topology: 'boost', Vg: 73.6, D: 0.12, fs: 112000, L: 2.31e-4, Ron: 0.578, RL: 0.00319, VF: 0.972, load: { kind: 'network', C: 3.98e-10, R: 42, battery: { V: 66.2, R: 0.00438 } } },
    ] as SimParams[]) {
      const r = simulate(p);
      expect(r.status).toBe('steady');
      const model = buildModel(p);
      const stats = { searches: 0 };
      periodIntegrals(model, runCycle(model, r.x0, { stepsPerPeriod: stepsFor(p), record: true }), [], { stats });
      expect(stats.searches, p.topology).toBeLessThan(40);
    }
  });
});

describe('parameters whose equations overflow', () => {
  it('are refused before the search, not after it', () => {
    // a switch of 1e300 ohm: its slopes' rates overflow. Refused after the search, it took 17 s
    const p: SimParams = { topology: 'boost', Vg: 12, D: 0.5, fs: 1e5, L: 1e-4, Ron: 1e300, load: { kind: 'resistive', R: 10, C: 1e-4 } };
    expect(() => checkRange(buildModel(p))).toThrow(/out of range/);
    expect(() => simulate(p)).toThrow(/out of range/);
  });

  it('are refused, not integrated for ever', () => {
    for (const p of [
      // a battery of 1e150 V behind 1e-150 ohm: its current's coefficients square to infinity
      { topology: 'boost', Vg: 12, D: 0.5, fs: 1e5, L: 1e-4, Ron: 0.05, VF: 0.5, load: { kind: 'network', C: 1e-5, battery: { V: 1e150, R: 1e-150 } } },
      // a source and a battery of 1e308 V: the matrices' column sums overflow
      { topology: 'boost', Vg: 0, D: 0.5, fs: 1e3, L: 1, Ron: 0.01, VF: 0.5, load: { kind: 'network', C: 1, battery: { V: 1e308, R: 1 } }, source: { Voc: 1e308, Rs: 1, Cbus: 1 } },
    ] as SimParams[]) {
      expect(() => simulate(p), JSON.stringify(p)).toThrow(/out of range/);
    }
  });
});
