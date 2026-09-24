import { describe, expect, it } from 'vitest';
import { kclResiduals, schematic, simulate, type SimParams, type SimResult, type Topology } from '../src/sim';

/**
 * The circuit drawn for the operating modes carries, in every branch, a
 * current taken from the model's outputs. Kirchhoff's current law must hold
 * at every node at every sample of the period, for every topology, load,
 * node capacitance and source: a check that the model's element currents
 * (switch channel, body diode, diode, node capacitance, input, windings)
 * agree with each other.
 */

const fs = 1e5;

type Case = [string, SimParams];

function cases(): Case[] {
  const out: Case[] = [];
  const base: Record<Topology, Partial<SimParams>> = {
    buck: { Vg: 24, D: 0.5 },
    boost: { Vg: 12, D: 0.4 },
    buckboost: { Vg: 12, D: 0.5 },
    flyback: { Vg: 48, D: 0.4, n: 0.25 },
    forward: { Vg: 48, D: 0.4, n: 0.5, nr: 1, LM: 1e-3 },
  };
  const loads: [string, SimParams['load']][] = [
    ['R||C', { kind: 'resistive', R: 10, C: 1e-4 }],
    ['battery', { kind: 'network', C: 1e-4, battery: { V: 8, R: 0.5 } }],
    ['battery and R', { kind: 'network', C: 1e-4, R: 20, battery: { V: 8, R: 0.5 } }],
  ];
  for (const t of ['buck', 'boost', 'buckboost', 'flyback', 'forward'] as Topology[]) {
    for (const [name, load] of loads) {
      // a battery above what the converter can give only discharges; move it below
      const l =
        load.kind === 'network' && load.battery
          ? { ...load, battery: { ...load.battery, V: t === 'boost' ? 16 : t === 'flyback' ? 4 : t === 'forward' ? 6 : 8 } }
          : load;
      for (const L of [1e-4, 5e-6]) {
        const lossy = { Ron: 0.05, RL: 0.02, VF: 0.4 };
        const p = { topology: t, fs, L, ...base[t], ...lossy, load: l } as SimParams;
        out.push([`${t}, ${name}, L = ${L}`, p]);
        if (t !== 'forward') out.push([`${t}, ${name}, L = ${L}, node capacitance`, { ...p, Cnode: 2e-10 }]);
        out.push([`${t}, ${name}, L = ${L}, Thevenin source`, { ...p, source: { Voc: (p.Vg ?? 12) * 1.2, Rs: 0.5, Cbus: 1e-4 } }]);
      }
    }
    // a fixed output high enough for the inductor to reset within the off-interval (DCM)
    const V = { buck: 16, boost: 24, buckboost: 15, flyback: 10, forward: 12 }[t];
    const fixed = { ...base[t], topology: t, fs, L: 2e-6, VF: 0.3, load: { kind: 'fixed', V } } as SimParams;
    out.push([`${t}, fixed output, DCM`, fixed]);
  }
  return out;
}

function samples(r: SimResult): Record<string, number>[] {
  const w = r.waveforms;
  const t = w.t as number[];
  const keys = Object.keys(w).filter((k) => k !== 't' && k !== 'interval');
  return t.map((_, j) => Object.fromEntries(keys.map((k) => [k, (w[k] as number[])[j]!])));
}

describe('the drawn circuit: Kirchhoff\'s current law at every node, every sample', () => {
  for (const [name, p] of cases()) {
    it(name, () => {
      const r = simulate(p);
      expect(r.status, name).toBe('steady');
      const s = schematic(p);
      // every node joins at least two branches, and every branch joins two nodes that exist
      const ids = new Set(s.nodes.map((n) => n.id));
      const degree: Record<string, number> = {};
      for (const b of s.branches) {
        expect(ids.has(b.from), `${b.id}.from`).toBe(true);
        expect(ids.has(b.to), `${b.id}.to`).toBe(true);
        degree[b.from] = (degree[b.from] ?? 0) + 1;
        degree[b.to] = (degree[b.to] ?? 0) + 1;
      }
      for (const n of s.nodes) expect(degree[n.id] ?? 0, `node ${n.id}`).toBeGreaterThanOrEqual(2);
      const all = samples(r);
      let scale = 0;
      for (const o of all) for (const b of s.branches) scale = Math.max(scale, Math.abs(b.current(o)));
      expect(scale).toBeGreaterThan(0);
      let worst = 0;
      let where = '';
      all.forEach((o, j) => {
        for (const [node, res] of Object.entries(kclResiduals(s, o))) {
          if (Math.abs(res) > worst) {
            worst = Math.abs(res);
            where = `node ${node} at sample ${j} (${(r.waveforms.interval as string[])[j]})`;
          }
        }
      });
      expect(worst, where).toBeLessThanOrEqual(1e-9 * scale);
    });
  }
});
