import { describe, expect, it } from 'vitest';
import { buildModel, eigenvalues, ringsPerPeriod, simulate, stepsFor, type SimParams, type Topology } from '../src/sim';

type C = { re: number; im: number };
const mul = (a: C, b: C): C => ({ re: a.re * b.re - a.im * b.im, im: a.re * b.im + a.im * b.re });
const sorted = (e: C[]) => [...e].sort((a, b) => a.re - b.re || a.im - b.im);

/** trace(A^k) for k = 1..3 and det(A), which the eigenvalues must reproduce (power sums and product). */
function invariants(A: number[][]) {
  const n = A.length;
  const mm = (X: number[][], Y: number[][]) => X.map((r) => Y[0]!.map((_, j) => r.reduce((s, v, k) => s + v * Y[k]![j]!, 0)));
  const tr = (X: number[][]) => X.reduce((s, r, i) => s + r[i]!, 0);
  const A2 = mm(A, A);
  const A3 = mm(A2, A);
  // determinant by Gaussian elimination with partial pivoting
  const M = A.map((r) => [...r]);
  let det = 1;
  for (let c = 0; c < n; c++) {
    let piv = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r]![c]!) > Math.abs(M[piv]![c]!)) piv = r;
    if (M[piv]![c] === 0) return { t: [tr(A), tr(A2), tr(A3)], det: 0 };
    if (piv !== c) {
      [M[piv], M[c]] = [M[c]!, M[piv]!];
      det = -det;
    }
    det *= M[c]![c]!;
    for (let r = c + 1; r < n; r++) {
      const f = M[r]![c]! / M[c]![c]!;
      for (let k = c; k < n; k++) M[r]![k]! -= f * M[c]![k]!;
    }
  }
  return { t: [tr(A), tr(A2), tr(A3)], det };
}

function checkInvariants(A: number[][], rel = 1e-9) {
  const e = eigenvalues(A);
  expect(e.length).toBe(A.length);
  const { t, det } = invariants(A);
  const scale = Math.max(...e.map((x) => Math.hypot(x.re, x.im)), 1e-300);
  for (let k = 1; k <= 3; k++) {
    let s: C = { re: 0, im: 0 };
    for (const x of e) {
      let p: C = { re: 1, im: 0 };
      for (let j = 0; j < k; j++) p = mul(p, x);
      s = { re: s.re + p.re, im: s.im + p.im };
    }
    const tol = rel * A.length * scale ** k;
    expect(Math.abs(s.re - t[k - 1]!)).toBeLessThanOrEqual(tol);
    expect(Math.abs(s.im)).toBeLessThanOrEqual(tol);
  }
  let pr: C = { re: 1, im: 0 };
  for (const x of e) pr = mul(pr, x);
  expect(Math.abs(pr.re - det)).toBeLessThanOrEqual(rel * A.length * scale ** A.length);
  // complex eigenvalues come in conjugate pairs
  for (const x of e) if (x.im !== 0) expect(e.some((y) => y.re === x.re && y.im === -x.im)).toBe(true);
  return e;
}

describe('eigenvalues', () => {
  it('a diagonal and a triangular matrix give their diagonal', () => {
    expect(sorted(eigenvalues([[3, 0, 0], [0, -1, 0], [0, 0, 2]]))).toEqual([{ re: -1, im: 0 }, { re: 2, im: 0 }, { re: 3, im: 0 }]);
    const e = sorted(eigenvalues([[1, 5, -2], [0, 4, 7], [0, 0, -3]]));
    expect(e.map((x) => x.re)).toEqual([-3, 1, 4]);
    expect(e.every((x) => x.im === 0)).toBe(true);
  });

  it('a rotation generator gives ±jω, also at circuit magnitudes', () => {
    for (const w of [1, 1e7, 3e10]) {
      const e = sorted(eigenvalues([[0, -w], [w, 0]]));
      expect(e[0]!.re).toBe(0);
      expect(Math.abs(e[0]!.im + w) / w).toBeLessThan(1e-14);
      expect(Math.abs(e[1]!.im - w) / w).toBeLessThan(1e-14);
    }
  });

  it('a series R-L-C loop: -R/(2L) ± j sqrt(1/(LC) - (R/2L)^2)', () => {
    for (const [L, C, R] of [[1e-6, 1e-9, 0.1], [2.29e-5, 1.41e-6, 1.58], [8.85e-6 * 0.401 ** 2, 1.77e-8, 0.402]] as const) {
      const e = sorted(eigenvalues([[-R / L, -1 / L], [1 / C, 0]]));
      const a = -R / (2 * L);
      const w = Math.sqrt(1 / (L * C) - a * a);
      for (const x of e) expect(Math.abs(x.re - a)).toBeLessThan(1e-9 * w);
      expect(Math.abs(e[1]!.im - w) / w).toBeLessThan(1e-12);
      expect(Math.abs(e[0]!.im + w) / w).toBeLessThan(1e-12);
    }
  });

  it("a companion matrix gives its polynomial's roots: (x - 1)(x - 2)(x^2 + 2x + 5)", () => {
    const e = sorted(eigenvalues([[0, 0, 0, -10], [1, 0, 0, 11], [0, 1, 0, -1], [0, 0, 1, 1]]));
    const want = [{ re: -1, im: -2 }, { re: -1, im: 2 }, { re: 1, im: 0 }, { re: 2, im: 0 }];
    e.forEach((x, k) => {
      expect(Math.abs(x.re - want[k]!.re)).toBeLessThan(1e-12);
      expect(Math.abs(x.im - want[k]!.im)).toBeLessThan(1e-12);
    });
  });

  it('a zero row (a state held constant) and a zero matrix', () => {
    const e = sorted(eigenvalues([[0, 0, 0], [0, -2, -3], [0, 4, -1]]));
    expect(e.map((x) => x.im).sort((a, b) => a - b)[0]).toBeLessThan(0);
    checkInvariants([[0, 0, 0], [0, -2, -3], [0, 4, -1]]);
    expect(eigenvalues([[0, 0], [0, 0]])).toEqual([{ re: 0, im: 0 }, { re: 0, im: 0 }]);
  });

  it('seeded random matrices up to 6 by 6 keep the trace, the power sums and the determinant', () => {
    let seed = 12345;
    const rnd = () => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed / 2147483648 - 0.5;
    };
    for (let trial = 0; trial < 300; trial++) {
      const n = 1 + (trial % 6);
      // entries spread over many decades, as a circuit's are (1/L, 1/C, R/L)
      const A = Array.from({ length: n }, () => Array.from({ length: n }, () => rnd() * 10 ** Math.floor(rnd() * 12)));
      checkInvariants(A, 1e-8);
    }
  });

  it("every interval of every converter's model keeps its invariants", () => {
    const base = { Vg: 24, D: 0.4, fs: 1e5, L: 2e-5, n: 0.5, nr: 1, LM: 2e-4, Ron: 0.05, RL: 0.03, VF: 0.5 };
    for (const topology of ['buck', 'boost', 'buckboost', 'flyback', 'forward'] as Topology[]) {
      for (const extra of [
        { load: { kind: 'resistive', R: 10, C: 1e-5 } },
        { load: { kind: 'network', C: 1e-8, V0: 0 }, Cnode: topology === 'forward' ? undefined : 1e-10 },
        { load: { kind: 'network', C: 1e-6, R: 5, battery: { V: 5, R: 0.05 } }, source: { Voc: 24, Rs: 1, Cbus: 1e-6 } },
      ]) {
        const model = buildModel({ ...base, topology, ...extra } as SimParams);
        for (const iv of Object.values(model.intervals)) checkInvariants(iv.A, 1e-8);
      }
    }
  });
});

describe('sub-steps from the fastest ring', () => {
  it("the flyback's secondary ring with a small capacitor alone: rings per period from the eigenvalues", () => {
    const p: SimParams = { topology: 'flyback', Vg: 20.7, D: 0.696, fs: 20800, L: 8.85e-6, n: 0.401, Ron: 0.0796, RL: 0.402, VF: 0.878, load: { kind: 'network', C: 1.77e-8, V0: 0 } };
    const model = buildModel(p);
    // while the diode conducts, the inductance referred to the secondary rings with C (the winding resistance damps it a little)
    const Ls = p.n! ** 2 * p.L;
    const w0 = 1 / Math.sqrt(Ls * 1.77e-8);
    const rings = ringsPerPeriod(model);
    expect(rings).toBeLessThanOrEqual((w0 / (2 * Math.PI)) / p.fs * (1 + 1e-9));
    expect(rings).toBeGreaterThan(0.99 * (w0 / (2 * Math.PI)) / p.fs);
    expect(stepsFor(p)).toBe(2000);
  });

  it('a ring faster than a hundredth of the period gets twenty sub-steps per ring; one faster than MAX_STEPS / 3 is refused', () => {
    const p: SimParams = { topology: 'boost', Vg: 12, D: 0.5, fs: 1e4, L: 1e-6, Ron: 0.01, load: { kind: 'resistive', R: 1e4, C: 1e-9 } };
    const rings = ringsPerPeriod(buildModel(p));
    expect(rings).toBeGreaterThan(100);
    expect(20 * rings).toBeLessThan(20000);
    expect(stepsFor(p)).toBe(Math.ceil(20 * rings));
    // at a tenth of f_s the same ring needs more than MAX_STEPS: capped, still at least three sub-steps per ring
    expect(stepsFor({ ...p, fs: 1e3 })).toBe(20000);
    expect(() => stepsFor({ ...p, fs: 50 })).toThrow(/rings too fast/);
    // the remedy: fewer rings per period, from a higher f_s or a larger L or C
    expect(() => stepsFor({ ...p, fs: 50 })).toThrow(/a larger inductance or capacitance, or a higher switching frequency/);
  });

  it('two nearly identical lossless rings coupled by almost nothing: the QR iteration fails, and a norm bound stands in', () => {
    // the sixth review's circuit: n = 1e-10 and R_s = 1e21 leave the output L-C and the bus L_M-C_bus rings almost
    // uncoupled and equal; without the bound, simulate() threw
    const p: SimParams = { topology: 'forward', Vg: 0, D: 0.3, fs: 1000, L: 0.0009765625, n: 1e-10, nr: 1, LM: 0.0009765625, load: { kind: 'network', C: 9.5367431640625e-7, V0: 0 }, source: { Voc: 10, Rs: 1e21, Cbus: 9.5367431640625e-7 } };
    const rings = ringsPerPeriod(buildModel(p));
    expect(Number.isFinite(rings)).toBe(true);
    // at least the true ring (1/(2 pi sqrt(L C)) = 5.2 kHz, 5.2 per period): the bound only asks for more
    expect(rings).toBeGreaterThan(5.2);
    expect(() => simulate(p)).not.toThrow();
  });

  it('a parameter so small that the equations overflow is refused, not simulated into NaN', () => {
    const p: SimParams = { topology: 'buck', Vg: 12, D: 0.5, fs: 1e5, L: 1e-320, load: { kind: 'resistive', R: 10, C: 1e-5 } };
    expect(() => buildModel(p)).toThrow(/out of range/);
    expect(() => simulate(p)).toThrow(/out of range/);
    expect(() => simulate({ ...p, L: 1e-4, fs: 1e-320 })).toThrow(/out of range/);
    // a source resistance as small: 1/R_s overflows the bus's equation
    expect(() => simulate({ ...p, L: 1e-4, source: { Voc: 12, Rs: 1e-320, Cbus: 1e-6 } })).toThrow(/out of range/);
  });
});
