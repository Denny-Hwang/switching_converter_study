import { describe, expect, it } from 'vitest';
import { branchFlow, branchScales, countingFloor, elementStates, modeScales, modes, netsOf, outputsAt, schematic, simulate, type SimParams, type SimResult } from '../src/sim';

/**
 * The current paths the operating-mode view draws (branchFlow): in every
 * mode of every circuit, a coloured branch is part of a closed path (no node
 * has just one coloured branch), the arrows at a node neither all point in
 * nor all point out, the currents of the coloured elements balance at every
 * node (Kirchhoff's current law, to within a thousandth of the largest of
 * them), an element is coloured exactly when its state says it carries
 * current, and its arrow points the way its average current flows.
 */

/** Which of an element's states say it carries no current. */
const STILL = new Set(['blocking', 'idle', 'zero']);

function problems(r: SimResult): string[] {
  const s = schematic(r.params);
  const net = netsOf(s);
  const peaks = branchScales(r, s);
  const out: string[] = [];
  for (const m of modes(r)) {
    const sc = modeScales(r, m, s, peaks);
    const flow = branchFlow(r, m, s, sc);
    const states = new Map(elementStates(r, m, s, sc).map((e) => [e.id, e]));
    const at = `mode ${m.index} (${m.kind})`;
    // closed paths: no node with exactly one coloured branch
    const deg = new Map<string, number>();
    for (const b of s.branches) if (flow.get(b.id)!.active) for (const n of [b.from, b.to]) deg.set(n, (deg.get(n) ?? 0) + 1);
    for (const [n, k] of deg) if (k === 1) out.push(`${at}: the path ends at ${n}`);
    // the arrows: at a node, the coloured branches' currents cannot all flow in, or all flow out (a branch whose
    // current reverses within the mode, drawn with two heads, goes either way)
    for (const n of deg.keys()) {
      const ways = new Set<string>();
      for (const b of s.branches) {
        const f = flow.get(b.id)!;
        if (!f.active || (b.from !== n && b.to !== n)) continue;
        if (f.reverses) ways.add('in').add('out');
        else ways.add((b.to === n) === f.sign > 0 ? 'in' : 'out');
      }
      if (ways.size < 2) out.push(`${at}: every arrow at ${n} points ${[...ways][0]}`);
    }
    // each coloured element: its state, and its arrow along its average current
    for (const b of s.branches) {
      if (b.kind === 'wire') continue;
      const f = flow.get(b.id)!;
      const e = states.get(b.id)!;
      // a switch is on or off by its gate: whether it carries current is the flow's alone
      if (b.kind !== 'switch' && f.active === STILL.has(e.state)) out.push(`${at}: ${b.id} is ${f.active ? '' : 'not '}coloured but ${e.state}`);
      if (f.active && f.sign * e.avg < 0) out.push(`${at}: ${b.id}'s arrow points against its average current`);
    }
    // Kirchhoff's current law for the coloured elements, at each electrical node, at every sample
    const os: Record<string, number>[] = [];
    for (let k = m.k0; k <= m.k1; k++) os.push(outputsAt(r, k));
    const nets = new Set(net.values());
    for (const N of nets) {
      const on = s.branches.filter((b) => b.kind !== 'wire' && flow.get(b.id)!.active && net.get(b.from) !== net.get(b.to) && (net.get(b.from) === N || net.get(b.to) === N));
      if (!on.length) continue;
      let big = 0;
      let worst = 0;
      for (const o of os) {
        let sum = 0;
        for (const b of on) {
          const i = b.current(o);
          big = Math.max(big, Math.abs(i));
          sum += (net.get(b.to) === N ? 1 : -1) * i;
        }
        worst = Math.max(worst, Math.abs(sum));
      }
      if (worst > countingFloor(r, big)) out.push(`${at}: the coloured currents at ${N} leave ${worst.toExponential(2)} A unbalanced (largest ${big.toExponential(2)} A)`);
    }
  }
  return out;
}

describe('the drawn current paths are closed and balanced', () => {
  const loads: SimParams['load'][] = [
    { kind: 'resistive', R: 10, C: 1e-4 },
    { kind: 'network', C: 1e-4, battery: { V: 5, R: 0.5 } },
    { kind: 'network', C: 1e-4, R: 20, battery: { V: 5, R: 0.5 } },
    { kind: 'network', C: 1e-5, V0: 0 },
  ];
  const fixedV = { buck: 8, boost: 30, buckboost: 6, flyback: 8, forward: 10 } as const;
  for (const t of ['buck', 'boost', 'buckboost', 'flyback', 'forward'] as const) {
    for (const load of [...loads, { kind: 'fixed' as const, V: fixedV[t] }]) {
      const p = { topology: t, Vg: t === 'flyback' || t === 'forward' ? 48 : t === 'buck' ? 24 : 12, D: 0.4, fs: 1e5, L: t === 'flyback' ? 2e-5 : 1e-4, n: t === 'forward' ? 0.5 : 0.25, nr: 1, LM: 1e-3, Ron: 0.1, VF: 0.5, load } as SimParams;
      const variants: [string, SimParams][] = [
        ['', p],
        [', source', { ...p, source: { Voc: 1.2 * p.Vg, Rs: 1, Cbus: 1e-4 } }],
      ];
      if (t !== 'forward') variants.push([', node capacitance', { ...p, Cnode: 1e-10 }]);
      for (const [v, q] of variants) {
        it(`${t}, ${load.kind === 'network' ? (load.battery ? (load.R ? 'battery and R' : 'battery') : 'capacitor alone') : load.kind}${v}`, () => {
          const r = simulate(q);
          if (!r.converged) return;
          expect(problems(r)).toEqual([]);
        });
      }
    }
  }
});

describe('closed paths where scales differ', () => {
  it('a battery that takes amperes in pulses, feeding a resistor between them, is coloured with it', () => {
    // a DCM flyback: while the switch is on, the battery alone feeds the 2.5 kilohm resistor 5.5 mA, a
    // ten-thousandth of its charging pulses (found by a random sweep)
    const p: SimParams = { topology: 'flyback', Vg: 6.18, D: 0.127, fs: 2e4, L: 1.59e-6, n: 0.142, Ron: 0.136, RL: 0.0073, VF: 0.294, Cnode: 1e-11, source: { Voc: 6.18, Rs: 0.0316, Cbus: 1.04e-4 }, load: { kind: 'network', C: 4.17e-7, R: 2475, battery: { V: 13.5, R: 0.81 } } };
    const r = simulate(p);
    expect(r.status).toBe('steady');
    const s = schematic(p);
    const on = modes(r).find((m) => m.kind === 'on')!;
    const sc = modeScales(r, on, s);
    const st = new Map(elementStates(r, on, s, sc).map((e) => [e.id, e]));
    expect(st.get('R')!.state).toBe('conducting');
    expect(st.get('B')!.state).toBe('discharging');
    expect(Math.abs(st.get('B')!.avg + st.get('R')!.avg)).toBeLessThan(1e-3 * st.get('R')!.avg);
    expect(branchFlow(r, on, s, sc).get('B')!.active).toBe(true);
    expect(problems(r)).toEqual([]);
  });

  it('a diode conducting for nanoseconds into a battery-backed output draws its path through the capacitor and the battery', () => {
    // a buck-boost whose 1 nF node capacitance rings the diode on again for 1.4 to 2.2 ns
    const p: SimParams = { topology: 'buckboost', Vg: 22.6, D: 0.24, fs: 2e4, L: 1.48e-5, Ron: 0.0961, VF: 0.23, Cnode: 1e-9, load: { kind: 'network', C: 6.45e-6, battery: { V: 13.2, R: 0.194 } } };
    const r = simulate(p);
    expect(r.status).toBe('steady');
    const s = schematic(p);
    const peaks = branchScales(r, s);
    const short = modes(r).filter((m) => m.kind === 'off' && m.t1 - m.t0 < 1e-8);
    expect(short.length).toBeGreaterThan(0);
    for (const m of short) {
      const flow = branchFlow(r, m, s, modeScales(r, m, s, peaks));
      expect(['D', 'C', 'B'].map((id) => flow.get(id)!.active)).toEqual([true, true, true]);
    }
    expect(problems(r)).toEqual([]);
  });

  it("what is left where a battery's and a resistor's currents cancel draws no path to a capacitor at rest", () => {
    // a buck-boost with a 100 pF node capacitance: while L rings, the battery feeds R 4.9 A and C settles
    // within nanoseconds, its current never above a thousandth of theirs
    const p: SimParams = { topology: 'buckboost', Vg: 50.6, D: 0.204, fs: 2e4, L: 1.7e-4, Ron: 0.02, Cnode: 1e-10, load: { kind: 'network', C: 7.48e-8, R: 6.88, battery: { V: 34, R: 0.0551 } } };
    const r = simulate(p);
    expect(r.status).toBe('steady');
    const s = schematic(p);
    const peaks = branchScales(r, s);
    for (const m of modes(r).filter((x) => x.kind === 'ring')) {
      const flow = branchFlow(r, m, s, modeScales(r, m, s, peaks));
      expect(flow.get('C')!.active).toBe(false);
      expect(flow.get('R')!.active && flow.get('B')!.active).toBe(true);
    }
    expect(problems(r)).toEqual([]);
  });

  it('a capacitor that alone feeds the load is coloured with it (a boost into a megohm)', () => {
    const p: SimParams = { topology: 'boost', Vg: 12, D: 0.1, fs: 1e5, L: 1e-5, Ron: 0.1, load: { kind: 'resistive', R: 1e6, C: 1e-6 } };
    const r = simulate(p);
    const s = schematic(p);
    const idle = modes(r).find((m) => m.kind === 'idle')!;
    const sc = modeScales(r, idle, s);
    const st = new Map(elementStates(r, idle, s, sc).map((e) => [e.id, e]));
    expect([st.get('C')!.state, st.get('R')!.state]).toEqual(['discharging', 'conducting']);
    const flow = branchFlow(r, idle, s, sc);
    expect([flow.get('C')!.active, flow.get('R')!.active]).toEqual([true, true]);
    expect(problems(r)).toEqual([]);
  });

  it("a forward converter's magnetizing current and its reset are drawn, beside a load current a thousand times larger", () => {
    const p: SimParams = { topology: 'forward', Vg: 48, D: 0.4, fs: 1e5, L: 1e-4, n: 0.5, nr: 1, LM: 1e-2, load: { kind: 'resistive', R: 0.5, C: 1e-4 } };
    const r = simulate(p);
    const s = schematic(p);
    const [on, off] = modes(r);
    expect([on!.kind, off!.kind]).toEqual(['on', 'off']);
    const fOn = branchFlow(r, on!, s);
    const fOff = branchFlow(r, off!, s);
    expect(fOn.get('LM')!.active).toBe(true);
    expect(['LM', 'W3', 'D3', 'Vg'].map((id) => fOff.get(id)!.active)).toEqual([true, true, true, true]);
    expect(problems(r)).toEqual([]);
  });
});

describe('the drawn current paths in random circuits', () => {
  // 50 circuits from a fixed seed: every converter, each load, a node capacitance down to 10 pF, a source
  let seed = 104729;
  const rnd = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 2 ** 32;
  };
  const pick = <T,>(a: readonly T[]) => a[Math.floor(rnd() * a.length)]!;
  const logU = (lo: number, hi: number) => Math.exp(Math.log(lo) + rnd() * (Math.log(hi) - Math.log(lo)));
  const r3 = (x: number) => Number(x.toPrecision(3));
  it('50 circuits', () => {
    const wrong: string[] = [];
    let steady = 0;
    for (let k = 0; k < 50; k++) {
      const topology = pick(['buck', 'boost', 'buckboost', 'flyback', 'forward'] as const);
      const kind = pick(['res', 'bat', 'batr', 'fixed', 'cap'] as const);
      const Vg = r3(logU(5, 100));
      const C = r3(logU(1e-7, 1e-4));
      const load: SimParams['load'] =
        kind === 'res'
          ? { kind: 'resistive', R: r3(logU(1, 1e4)), C }
          : kind === 'fixed'
            ? { kind: 'fixed', V: r3(Vg * logU(0.2, 3)) }
            : kind === 'cap'
              ? { kind: 'network', C, V0: 0 }
              : { kind: 'network', C, battery: { V: r3(Vg * logU(0.1, 2)), R: r3(logU(0.05, 5)) }, ...(kind === 'batr' ? { R: r3(logU(5, 5000)) } : {}) };
      const p: SimParams = {
        topology,
        Vg,
        D: r3(0.05 + 0.9 * rnd()),
        fs: pick([5e4, 1e5, 2e5]),
        L: r3(logU(2e-6, 1e-3)),
        n: topology === 'flyback' || topology === 'forward' ? r3(logU(0.1, 2)) : undefined,
        nr: topology === 'forward' ? pick([0.5, 1, 1.5]) : undefined,
        LM: topology === 'forward' ? r3(logU(1e-4, 1e-2)) : undefined,
        Ron: r3(logU(0.01, 0.5)),
        RL: rnd() < 0.5 ? r3(logU(0.01, 0.2)) : undefined,
        VF: rnd() < 0.5 ? r3(logU(0.2, 0.8)) : undefined,
        Cnode: topology !== 'forward' && rnd() < 0.4 ? pick([1e-11, 1e-10, 1e-9]) : undefined,
        load,
      };
      if (rnd() < 0.25) p.source = { Voc: r3(Vg * logU(1, 1.5)), Rs: r3(logU(0.05, 5)), Cbus: r3(logU(1e-6, 1e-3)) };
      let r;
      try {
        r = simulate(p);
      } catch {
        continue; // a node capacitance that rings too fast is refused
      }
      if (r.status !== 'steady') continue;
      steady++;
      for (const x of problems(r)) wrong.push(`${JSON.stringify(p)}: ${x}`);
    }
    expect(steady).toBeGreaterThan(30);
    expect(wrong.slice(0, 10)).toEqual([]);
  });
});
