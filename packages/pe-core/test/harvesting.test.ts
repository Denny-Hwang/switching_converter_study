import { describe, expect, it } from 'vitest';
import { evaluate } from '../src/equations';
import {
  busTimeConstant,
  ENVELOPE_MAX_CYCLES,
  ENVELOPE_SETTLE,
  envelopeCycles,
  envelopeRun,
  matchPoint,
  matchSource,
  type Envelope,
  type MatchSpec,
} from '../src/harvesting';
import { simulate } from '../src/sim';

const rel = (a: number, b: number) => Math.abs(a - b) / Math.abs(b);

// Synthetic source-driven flyback (the simulator page's worked example): R_in = 2 L_M f_s/D^2 = 10 kohm = R_s.
const s: MatchSpec = { Voc: 150, Rs: 1e4, LM: 0.02, fs: 1e4, D: 0.2, V: 5, VD: 0.5, n: 0.1, Vrating: 400 };

describe('source matcher', () => {
  it('a loss-free resistor below V_g,crit, a constant-voltage sink at V_g,crit above it', () => {
    const m = matchSource(s);
    expect(rel(m.Rin, 1e4)).toBeLessThan(1e-12);
    expect(rel(m.etaLfr, 1)).toBeLessThan(1e-12);
    expect(rel(m.Vgcrit, (5.5 * 0.8) / (0.1 * 0.2))).toBeLessThan(1e-12);
    // the divider reaches V_g,crit = 220 V at V_oc = 440 V
    expect(rel(m.VocCrit, 440)).toBeLessThan(1e-9);
    expect(m.point.mode).toBe('LFR');
    expect(rel(m.point.Vg, 75)).toBeLessThan(1e-12);
    const cv = matchPoint(s, 1000, m.Rin, m.Vgcrit);
    expect(cv.mode).toBe('CV');
    expect(rel(cv.eta, (4 * 220 * 780) / 1e6)).toBeLessThan(1e-12);
    // continuous at the boundary
    const below = matchPoint(s, m.VocCrit * (1 - 1e-9), m.Rin, m.Vgcrit);
    const above = matchPoint(s, m.VocCrit * (1 + 1e-9), m.Rin, m.Vgcrit);
    expect(Math.abs(below.eta - above.eta)).toBeLessThan(1e-6);
  });

  it('agrees with the simulator’s source-driven flyback in both regimes', () => {
    const m = matchSource(s);
    for (const Voc of [150, 400, 1000]) {
      const p = matchPoint(s, Voc, m.Rin, m.Vgcrit);
      const r = simulate({
        topology: 'flyback', Vg: 0, D: s.D, fs: s.fs, n: s.n, L: s.LM, VF: s.VD,
        load: { kind: 'fixed', V: s.V }, source: { Voc, Rs: s.Rs, Cbus: 1e-5 },
      });
      expect(r.converged).toBe(true);
      expect(r.mode).toBe(p.mode === 'LFR' ? 'DCM' : 'CCM');
      expect(rel(r.avg.v_in!, p.Vg)).toBeLessThan(1e-3);
    }
  });

  it('CCM caps the loss-free resistor at V_g,crit, or the switch rating earlier when it lies below the CCM plateau', () => {
    // plateau (V + V_D)/(n D) = 5.5/(0.1 * 0.2) = 275 V; at V_g,crit = 220 V the resistor draws 220^2/10 kohm
    const m = matchSource(s);
    expect(m.limit).toBe('ccm');
    expect(rel(m.VdsCcm, 275)).toBeLessThan(1e-12);
    expect(rel(m.Plfr, (220 * 220) / 1e4)).toBeLessThan(1e-12);
    // a 250 V switch reaches its rating at V_g = 250 - 55 V, before CCM
    const low = matchSource({ ...s, Vrating: 250 });
    expect(low.limit).toBe('switch');
    expect(rel(evaluate('lfr.Vg_power', { P: low.Plfr, R_in: low.Rin }) + low.VOR, 250)).toBeLessThan(1e-9);
    expect(matchSource({ ...s, Vrating: 50 }).Plfr).toBe(0);
    // the curve: the resistor's branch rising to the plateau, which it keeps; the operating point lies on it
    const c = m.switchCurve;
    expect(c.Vds.every((v, k) => k === 0 || v >= c.Vds[k - 1]!)).toBe(true);
    expect(rel(c.Vds[c.Vds.length - 1]!, m.VdsCcm)).toBeLessThan(1e-12);
    for (const Voc of [150, 800]) {
      const q = matchSource({ ...s, Voc });
      const k = q.switchCurve.P.findIndex((p) => p >= q.point.P);
      const [p0, p1] = [q.switchCurve.P[k - 1]!, q.switchCurve.P[k]!];
      const [v0, v1] = [q.switchCurve.Vds[k - 1]!, q.switchCurve.Vds[k]!];
      const onCurve = v0 + ((v1 - v0) * (q.point.P - p0)) / (p1 - p0);
      expect(Math.abs(onCurve - q.point.Vds)).toBeLessThan(0.01 * q.point.Vds);
    }
  });

  it('envelope: a constant amplitude settles at the steady state of the simulator', () => {
    for (const Voc of [400, 1000]) {
      const run = envelopeRun({ ...s, Voc }, 1e-5, { kind: 'points', t: [0, 0.05], v: [1, 1] });
      const ss = simulate({
        topology: 'flyback', Vg: 0, D: s.D, fs: s.fs, n: s.n, L: s.LM, VF: s.VD,
        load: { kind: 'fixed', V: s.V }, source: { Voc, Rs: s.Rs, Cbus: 1e-5 },
      });
      const last = run.Vbus[run.Vbus.length - 1]!;
      expect(rel(last, ss.avg.v_in!)).toBeLessThan(2e-3);
      const p = matchPoint({ ...s, Voc }, Voc, matchSource(s).Rin, matchSource(s).Vgcrit);
      expect(rel(run.P[run.P.length - 1]!, p.P)).toBeLessThan(5e-3);
    }
  });

  it('envelope: the bus follows the averaged loss-free-resistor model over a sinusoidal envelope', () => {
    // The averaged model: C dv/dt = (V_oc(t) - v)/R_s - v/R_in while the flyback is a loss-free resistor,
    // and v held at V_g,crit while the source can feed more than the loss-free resistor draws there (CCM).
    const Voc = 800;
    const Cbus = 1e-6;
    const run = envelopeRun({ ...s, Voc }, Cbus, { kind: 'sine', f: 1 }, { stepsPerPeriod: 100 });
    const m = matchSource({ ...s, Voc });
    const T = 0.5;
    const n = Math.round(T * s.fs);
    let v = 0;
    const avg: number[] = [];
    const sub = 20;
    for (let k = -run.settle; k < n; k++) {
      let vk = 0;
      for (let j = 0; j < sub; j++) {
        const t = (k + (j + 0.5) / sub) / s.fs;
        const voc = Voc * Math.abs(Math.sin(2 * Math.PI * t));
        const ccm = v >= m.Vgcrit && (voc - m.Vgcrit) / s.Rs >= m.Vgcrit / m.Rin;
        if (ccm) v = m.Vgcrit;
        else v = Math.min(m.Vgcrit, v + (((voc - v) / s.Rs - v / m.Rin) / Cbus) / (sub * s.fs));
        vk += v / sub;
      }
      if (k >= 0) avg.push(vk);
    }
    expect(avg.length).toBe(run.Vbus.length);
    let worst = 0;
    for (let k = 0; k < avg.length; k++) worst = Math.max(worst, Math.abs(run.Vbus[k]! - avg[k]!));
    // within 1 % of V_g,crit everywhere, the LFR-to-CCM transitions included
    expect(worst).toBeLessThan(0.01 * m.Vgcrit);
    expect(run.eta).toBeGreaterThan(0);
    expect(run.eta).toBeLessThanOrEqual(1);
  });

  it('envelope: the settling before the reported period is long enough (twice as long changes nothing)', () => {
    const e: Envelope = { kind: 'sine', f: 1 };
    // settling times of 0.07 s and 0.7 s against an envelope period of 0.5 s
    for (const Cbus of [1e-6, 1e-5]) {
      const a = envelopeRun({ ...s, Voc: 800 }, Cbus, e);
      const b = envelopeRun({ ...s, Voc: 800 }, Cbus, e, { settle: 2 * ENVELOPE_SETTLE });
      expect(a.settled).toBe(true);
      expect(a.settle).toBeGreaterThanOrEqual(envelopeCycles({ ...s, Voc: 800 }, Cbus, e).settle);
      let worst = 0;
      for (let k = 0; k < a.Vbus.length; k++) worst = Math.max(worst, Math.abs(a.Vbus[k]! - b.Vbus[k]!));
      expect(worst).toBeLessThan(1e-3 * matchSource(s).Vgcrit);
      expect(Math.abs(a.eta - b.eta)).toBeLessThan(1e-3);
    }
  }, 30000);

  it('envelope: a run over the cycle limit is refused before it starts', () => {
    // a 10 s envelope period at 1e5 cycles per second: a million cycles
    const e: Envelope = { kind: 'points', t: [0, 5, 10], v: [0, 1, 0] };
    const c = envelopeCycles({ ...s, fs: 1e5 }, 1e-6, e);
    expect(c.period).toBe(1e6);
    expect(c.total).toBeGreaterThan(ENVELOPE_MAX_CYCLES);
    const t0 = performance.now();
    expect(() => envelopeRun({ ...s, fs: 1e5 }, 1e-6, e)).toThrow(/switching cycles needed/);
    expect(performance.now() - t0).toBeLessThan(100);
  });

  it('envelope: a period shorter than 20 switching cycles is refused (the amplitude is held for a whole cycle)', () => {
    // |sin(2 pi 1 kHz t)| has a 0.5 ms period: 5 cycles at 10 kHz
    expect(() => envelopeRun(s, 1e-5, { kind: 'sine', f: 1000 })).toThrow(/fewer than 20/);
  });

  it('envelope: at zero amplitude the bus feeds the source back, and that energy counts', () => {
    // 10 ms at full amplitude, then 10 ms at none: the bus discharges into R_s, P = -v^2/R_s
    const e: Envelope = { kind: 'points', t: [0, 0.01, 0.0101, 0.02], v: [1, 1, 0, 0] };
    const r = envelopeRun({ ...s, Voc: 800 }, 1e-5, e);
    expect(r.settled).toBe(true);
    let off = 0;
    for (let k = 0; k < r.t.length; k++) {
      if (r.Voc[k] !== 0 || r.Vbus[k]! < 1) continue;
      off++;
      expect(r.P[k]!).toBeLessThan(0);
      expect(rel(r.P[k]!, -(r.Vbus[k]! ** 2) / s.Rs)).toBeLessThan(0.02);
    }
    expect(off).toBeGreaterThan(10);
    // counting only the power in would overstate the share
    const got = r.P.reduce((a, p) => a + p, 0);
    const gotIn = r.P.reduce((a, p) => a + Math.max(p, 0), 0);
    const avail = r.Pmax.reduce((a, p) => a + p, 0);
    expect(rel(r.eta, got / avail)).toBeLessThan(1e-12);
    expect(r.eta).toBeLessThan(0.95 * (gotIn / avail));
  });

  it('envelope: a bus held in CCM settles too, underdamped (weak source) or with a slow mode (stiff source)', () => {
    const constant: Envelope = { kind: 'points', t: [0, 0.02], v: [1, 1] };
    // weak source: R_s C_bus = 0.1 s, the CCM mode rings with a decay time 2 R_s C_bus
    // stiff source: R_s = 10 ohm, C_bus = 0.5 mF, the slow CCM root about L_M/(D^2 R_s)
    for (const [Rs, Cbus] of [[1e4, 1e-5], [10, 5e-4]] as const) {
      const spec = { ...s, Voc: 800, Rs };
      const m = matchSource(spec);
      expect(m.point.mode).toBe('CV');
      const r = envelopeRun(spec, Cbus, constant);
      expect(r.settled).toBe(true);
      // the bus ripple shifts its cycle average from V_g,crit (CCM fixes the average over the on-time):
      // compare with the simulator's steady state
      const ss = simulate({
        topology: 'flyback', Vg: 0, D: s.D, fs: s.fs, n: s.n, L: s.LM, VF: s.VD,
        load: { kind: 'fixed', V: s.V }, source: { Voc: 800, Rs, Cbus },
      });
      for (const v of [r.Vbus[0]!, r.Vbus[r.Vbus.length - 1]!]) expect(rel(v, ss.avg.v_in!)).toBeLessThan(1e-3);
      expect(Math.abs(r.eta - m.point.eta)).toBeLessThan(2e-3);
    }
    // the slow CCM root sets the settling time of the stiff source
    expect(busTimeConstant({ ...s, Rs: 10 }, 5e-4)).toBeGreaterThan(5 * 10 * 5e-4);
  }, 30000);
});
