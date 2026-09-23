import { describe, expect, it } from 'vitest';
import { lossPoint, lossBudget, LOAD_FRACTIONS, FREQ_FACTORS, type LossSpec } from '../src/losses';

const rel = (a: number, b: number) => Math.abs(a - b) / Math.abs(b);

// Synthetic parts, round numbers.
const core = { N: 20, Ae: 5e-5, Ve: 3e-6, k: 1, alpha: 1.5, beta: 2.5 };
const buck: LossSpec = {
  topology: 'buck', Vg: 24, V: 12, P: 24, fs: 1e5, L: 1e-4, C: 1e-5,
  Ron: 0.05, Qg: 1e-8, Vgs: 10, Cnode: 5e-10, VF: 0.5, rd: 0, RL: 0.03, core,
};
const flyback: LossSpec = {
  topology: 'flyback', Vg: 48, V: 12, P: 12, fs: 1e5, L: 4e-4, C: 1e-4, n: 0.25,
  Ron: 0.1, Qg: 1e-8, Vgs: 10, Cnode: 1e-10, VF: 0.5, rd: 0.02, RL: 0.05, core: { ...core, N: 30 }, Llk: 2e-6,
};

describe('loss budget', () => {
  it('holds the output at its set point by adjusting the duty ratio', () => {
    for (const x of [0.1, 0.5, 1]) {
      const p = lossPoint(buck, x, buck.fs);
      expect(p.converged).toBe(true);
      expect(p.regulated).toBe(true);
      expect(rel(p.Vout, 12)).toBeLessThan(1e-3);
      // losses make the duty ratio larger than the ideal V/V_g in CCM
      if (p.mode === 'CCM') expect(p.D).toBeGreaterThan(0.5);
    }
  });

  it('the conduction, diode and capacitive buckets agree with the simulator’s own accounting', () => {
    const p = lossPoint(buck, 1, buck.fs);
    // with r_d = 0 the equations see exactly the losses that are in the simulated circuit
    expect(rel(p.losses.conduction, p.sim.conduction)).toBeLessThan(1e-4);
    expect(rel(p.losses.diode, p.sim.diode)).toBeLessThan(1e-4);
    expect(rel(p.losses.capacitive, p.sim.capacitive)).toBeLessThan(1e-4);
  });

  it('gate, core and clamp follow their equations from the simulated currents', () => {
    const p = lossPoint(flyback, 1, flyback.fs);
    expect(p.mode).toBe('CCM');
    expect(rel(p.losses.gate, 1e-8 * 10 * 1e5)).toBeLessThan(1e-12);
    const Bac = (4e-4 * (p.inputs.IL_pp / 2)) / (30 * 5e-5);
    expect(rel(p.inputs.Bac!, Bac)).toBeLessThan(1e-12);
    expect(rel(p.losses.core, 1 * 1e5 ** 1.5 * Bac ** 2.5 * 3e-6)).toBeLessThan(1e-12);
    expect(rel(p.losses.clamp, 0.5 * 2e-6 * p.inputs.Ipk ** 2 * 1e5)).toBeLessThan(1e-12);
    // r_d adds to the diode loss what the simulated circuit does not have
    expect(p.losses.diode).toBeGreaterThan(p.sim.diode);
    expect(rel(p.losses.diode - p.sim.diode, 0.02 * p.inputs.ID_rms ** 2)).toBeLessThan(1e-3);
  });

  it('every topology: the conduction, diode and capacitive buckets agree with the simulator (C_node followed while the diode conducts)', () => {
    const base = { Vg: 24, P: 24, fs: 1e5, C: 1e-4, Ron: 0.05, Qg: 1e-8, Vgs: 10, VF: 0.5, rd: 0, RL: 0.03 };
    for (const s of [
      { ...base, topology: 'boost', V: 48, L: 2e-4, Cnode: 5e-10 },
      { ...base, topology: 'buckboost', V: 24, L: 2e-4, Cnode: 5e-10 },
      { ...base, topology: 'flyback', V: 12, L: 4e-4, n: 0.25, Cnode: 5e-10 },
      { ...base, topology: 'forward', Vg: 48, V: 5, L: 1e-4, n: 0.25, nr: 1, LM: 1e-3, Cnode: 0 },
    ] as LossSpec[]) {
      for (const x of [0.2, 1]) {
        const p = lossPoint(s, x, s.fs);
        expect(p.regulated).toBe(true);
        expect(rel(p.losses.conduction, p.sim.conduction)).toBeLessThan(1e-4);
        expect(rel(p.losses.diode, p.sim.diode)).toBeLessThan(1e-4);
        if (s.Cnode > 0) expect(rel(p.losses.capacitive, p.sim.capacitive)).toBeLessThan(1e-4);
      }
    }
  });

  it('the duty-ratio search keeps a bracket: a point that eight secant steps missed is regulated', () => {
    const s: LossSpec = {
      topology: 'flyback', Vg: 53.3, V: 18.6, P: 3.93, fs: 2.1e5, L: 1.38e-3, C: 1e-5, n: 0.2,
      Ron: 0.05, RL: 0.03, VF: 0.5, Cnode: 3.54e-10, rd: 0.01, Qg: 1e-8, Vgs: 10,
    };
    const p = lossPoint(s, 0.1, s.fs);
    expect(p.regulated).toBe(true);
    expect(rel(p.Vout, 18.6)).toBeLessThan(1e-3);
  });

  it('an unreachable set point reports the closest output, not the last try', () => {
    // the node capacitance's energy holds this lightly loaded buck above its set point even at the smallest duty ratio
    const s: LossSpec = {
      topology: 'buck', Vg: 75.6759035263876, V: 26.514328423661333, P: 6.333394257041343, fs: 403572.78093862016,
      L: 0.0005768486027618305, C: 0.0000017975834979072207, Ron: 0.10817298645999887, Qg: 1e-8, Vgs: 10,
      Cnode: 5.768090513426853e-10, VF: 0.5297259165112516, rd: 0.01, RL: 0.010347880460483898,
    };
    const p = lossPoint(s, 0.1, s.fs);
    expect(p.regulated).toBe(false);
    expect(rel(p.Vout, s.V)).toBeLessThan(0.01);
  });

  it('a forward converter stops at its reset limit and says so', () => {
    const s: LossSpec = {
      topology: 'forward', Vg: 36, V: 5, P: 25, fs: 1e5, L: 1e-4, C: 1e-4, n: 0.3, nr: 1, LM: 1e-3,
      Ron: 0.01, RL: 0.01, VF: 0.5, Cnode: 0, rd: 0, Qg: 1e-8, Vgs: 10,
    };
    const p = lossPoint(s, 1, s.fs);
    expect(p.D).toBeLessThanOrEqual(0.5);
    expect(p.regulated).toBe(false);
    expect(p.resetLimited).toBe(true);
    expect(p.Vout).toBeLessThan(5);
    // the magnetizing current still resets: no runaway conduction loss
    expect(p.losses.conduction).toBeLessThan(1);
  });

  it('reports the peak flux density of the core at the peak current', () => {
    const p = lossPoint(flyback, 1, flyback.fs);
    expect(rel(p.inputs.Bpk!, (4e-4 * p.inputs.Ipk) / (30 * 5e-5))).toBeLessThan(1e-12);
  });

  it('sweeps the load and the frequency; the fixed losses lower the light-load efficiency', () => {
    const b = lossBudget(buck);
    expect(b.load.map((p) => p.load)).toEqual([...LOAD_FRACTIONS]);
    expect(b.freq).toHaveLength(FREQ_FACTORS.length);
    for (const p of [...b.load, ...b.freq]) {
      expect(p.converged).toBe(true);
      expect(p.regulated).toBe(true);
      expect(p.eta).toBeGreaterThan(0);
      expect(p.eta).toBeLessThan(1);
    }
    expect(b.load[0]!.eta).toBeLessThan(b.load[4]!.eta);
    expect(b.load[0]!.mode).toBe('DCM');
    expect(b.load[9]!.mode).toBe('CCM');
    // gate and capacitive losses grow with f_s
    const f = b.freq;
    expect(f[f.length - 1]!.losses.gate).toBeGreaterThan(f[0]!.losses.gate);
  });
});
