/**
 * Small dense linear algebra for the piecewise-linear simulator: the state
 * vectors have two to four entries, so plain arrays are fast enough and keep
 * the engine free of dependencies.
 */

export type Vec = number[];
export type Mat = number[][];

export function zeros(rows: number, cols = rows): Mat {
  return Array.from({ length: rows }, () => new Array<number>(cols).fill(0));
}

export function identity(n: number): Mat {
  const m = zeros(n);
  for (let i = 0; i < n; i++) m[i]![i] = 1;
  return m;
}

export function matmul(a: Mat, b: Mat): Mat {
  const n = a.length;
  const k = b.length;
  const m = b[0]!.length;
  const out = zeros(n, m);
  for (let i = 0; i < n; i++) {
    const ai = a[i]!;
    const oi = out[i]!;
    for (let p = 0; p < k; p++) {
      const aip = ai[p]!;
      if (aip === 0) continue;
      const bp = b[p]!;
      for (let j = 0; j < m; j++) oi[j]! += aip * bp[j]!;
    }
  }
  return out;
}

export function matvec(a: Mat, x: Vec): Vec {
  return a.map((row) => row.reduce((s, v, j) => s + v * x[j]!, 0));
}

/** a + alpha * b */
export function addScaled(a: Mat, b: Mat, alpha = 1): Mat {
  return a.map((row, i) => row.map((v, j) => v + alpha * b[i]![j]!));
}

export function scaleMat(a: Mat, s: number): Mat {
  return a.map((row) => row.map((v) => v * s));
}

/** Largest absolute column sum (the matrix 1-norm). */
export function norm1(a: Mat): number {
  let best = 0;
  for (let j = 0; j < a[0]!.length; j++) {
    let s = 0;
    for (let i = 0; i < a.length; i++) s += Math.abs(a[i]![j]!);
    best = Math.max(best, s);
  }
  return best;
}

/** Solve a X = b (b may have several columns) by Gaussian elimination with partial pivoting. */
export function solve(a: Mat, b: Mat): Mat {
  const n = a.length;
  const m = b[0]!.length;
  const A = a.map((r) => r.slice());
  const B = b.map((r) => r.slice());
  for (let c = 0; c < n; c++) {
    let piv = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(A[r]![c]!) > Math.abs(A[piv]![c]!)) piv = r;
    if (A[piv]![c] === 0) throw new Error('solve: singular matrix');
    if (piv !== c) {
      [A[c], A[piv]] = [A[piv]!, A[c]!];
      [B[c], B[piv]] = [B[piv]!, B[c]!];
    }
    const Ac = A[c]!;
    const Bc = B[c]!;
    for (let r = c + 1; r < n; r++) {
      const f = A[r]![c]! / Ac[c]!;
      if (f === 0) continue;
      const Ar = A[r]!;
      const Br = B[r]!;
      for (let j = c; j < n; j++) Ar[j]! -= f * Ac[j]!;
      for (let j = 0; j < m; j++) Br[j]! -= f * Bc[j]!;
    }
  }
  const X = zeros(n, m);
  for (let r = n - 1; r >= 0; r--) {
    for (let j = 0; j < m; j++) {
      let s = B[r]![j]!;
      for (let k = r + 1; k < n; k++) s -= A[r]![k]! * X[k]![j]!;
      X[r]![j] = s / A[r]![r]!;
    }
  }
  return X;
}

export function solveVec(a: Mat, b: Vec): Vec {
  return solve(
    a,
    b.map((v) => [v]),
  ).map((r) => r[0]!);
}

// Padé(13) coefficients of the scaling-and-squaring algorithm (Higham 2005).
const B13 = [
  64764752532480000, 32382376266240000, 7771770303897600, 1187353796428800, 129060195264000, 10559470521600,
  670442572800, 33522128640, 1323241920, 40840800, 960960, 16380, 182, 1,
];
const THETA13 = 5.371920351148152;

/** Matrix exponential by scaling and squaring with a degree-13 Padé approximant. */
export function expm(a: Mat): Mat {
  const n = a.length;
  const nrm = norm1(a);
  const s = nrm > THETA13 ? Math.max(0, Math.ceil(Math.log2(nrm / THETA13))) : 0;
  const A = s > 0 ? scaleMat(a, 2 ** -s) : a;
  const I = identity(n);
  const A2 = matmul(A, A);
  const A4 = matmul(A2, A2);
  const A6 = matmul(A4, A2);
  const b = B13;
  const lin = (terms: [number, Mat][]): Mat => terms.reduce((acc, [c, m]) => addScaled(acc, m, c), zeros(n));
  const U = matmul(
    A,
    addScaled(
      matmul(A6, lin([[b[13]!, A6], [b[11]!, A4], [b[9]!, A2]])),
      lin([[b[7]!, A6], [b[5]!, A4], [b[3]!, A2], [b[1]!, I]]),
    ),
  );
  const V = addScaled(
    matmul(A6, lin([[b[12]!, A6], [b[10]!, A4], [b[8]!, A2]])),
    lin([[b[6]!, A6], [b[4]!, A4], [b[2]!, A2], [b[0]!, I]]),
  );
  let R = solve(addScaled(V, U, -1), addScaled(V, U, 1));
  for (let k = 0; k < s; k++) R = matmul(R, R);
  return R;
}

/**
 * Exact step of dx/dt = A x + b over a time h: x(h) = Phi x(0) + Gamma, from
 * the exponential of the augmented matrix [[A, b], [0, 0]].
 */
export function affineStep(A: Mat, b: Vec, h: number): { Phi: Mat; Gamma: Vec } {
  const n = A.length;
  const M = zeros(n + 1);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) M[i]![j] = A[i]![j]! * h;
    M[i]![n] = b[i]! * h;
  }
  const E = expm(M);
  return { Phi: E.slice(0, n).map((r) => r.slice(0, n)), Gamma: E.slice(0, n).map((r) => r[n]!) };
}
