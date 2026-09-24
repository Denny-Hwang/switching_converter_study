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
  // an infinite or NaN norm would scale by 2^-Infinity and square for ever
  if (!Number.isFinite(nrm)) throw new Error('expm: the matrix is not finite');
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

/**
 * The matrices of an exact step over a time h for any input b:
 * x(h) = Phi x(0) + W b, with W = integral of expm(A s) over [0, h], from the
 * exponential of the augmented matrix [[A, I], [0, 0]]. W is computed
 * directly, without the cancellation of (Phi - I) A^-1 for slow states.
 */
export function stepMatrices(A: Mat, h: number): { Phi: Mat; W: Mat } {
  const n = A.length;
  const M = zeros(2 * n);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) M[i]![j] = A[i]![j]! * h;
    M[i]![n + i] = h;
  }
  const E = expm(M);
  return { Phi: E.slice(0, n).map((r) => r.slice(0, n)), W: E.slice(0, n).map((r) => r.slice(n)) };
}

/**
 * Eigenvalues of a small real square matrix: balanced (Parlett and
 * Reinsch), reduced to upper Hessenberg form by elimination with pivoting,
 * then the shifted QR algorithm with Francis double steps (the EISPACK
 * routines balanc, elmhes and hqr, as in Press et al., Numerical Recipes,
 * Sec. 11.5-11.6). The simulator needs them only to find how fast a
 * circuit rings (the largest imaginary part), so that its sub-steps resolve
 * every ring. Throws if the iteration does not converge.
 */
export function eigenvalues(m: Mat): { re: number; im: number }[] {
  const n = m.length;
  if (n === 0) return [];
  // 1-based copy, as the classic routines index it
  const a: number[][] = Array.from({ length: n + 1 }, (_, i) => Array.from({ length: n + 1 }, (_, j) => (i > 0 && j > 0 ? m[i - 1]![j - 1]! : 0)));
  for (let i = 1; i <= n; i++) for (let j = 1; j <= n; j++) if (!Number.isFinite(a[i]![j]!)) throw new Error('eigenvalues: the matrix is not finite');

  // balance: scale rows and columns by powers of two until their norms are close
  const RADIX = 2;
  const sqrdx = RADIX * RADIX;
  for (let done = false; !done; ) {
    done = true;
    for (let i = 1; i <= n; i++) {
      let r = 0;
      let c = 0;
      for (let j = 1; j <= n; j++) {
        if (j === i) continue;
        c += Math.abs(a[j]![i]!);
        r += Math.abs(a[i]![j]!);
      }
      if (c !== 0 && r !== 0) {
        let g = r / RADIX;
        let f = 1;
        const s = c + r;
        while (c < g) {
          f *= RADIX;
          c *= sqrdx;
        }
        g = r * RADIX;
        while (c > g) {
          f /= RADIX;
          c /= sqrdx;
        }
        if ((c + r) / f < 0.95 * s) {
          done = false;
          g = 1 / f;
          for (let j = 1; j <= n; j++) a[i]![j]! *= g;
          for (let j = 1; j <= n; j++) a[j]![i]! *= f;
        }
      }
    }
  }

  // reduce to upper Hessenberg form by elimination with partial pivoting
  for (let mm = 2; mm < n; mm++) {
    let x = 0;
    let i = mm;
    for (let j = mm; j <= n; j++) {
      if (Math.abs(a[j]![mm - 1]!) > Math.abs(x)) {
        x = a[j]![mm - 1]!;
        i = j;
      }
    }
    if (i !== mm) {
      for (let j = mm - 1; j <= n; j++) [a[i]![j], a[mm]![j]] = [a[mm]![j]!, a[i]![j]!];
      for (let j = 1; j <= n; j++) [a[j]![i], a[j]![mm]] = [a[j]![mm]!, a[j]![i]!];
    }
    if (x !== 0) {
      for (let ii = mm + 1; ii <= n; ii++) {
        let y = a[ii]![mm - 1]!;
        if (y !== 0) {
          y /= x;
          a[ii]![mm - 1] = y;
          for (let j = mm; j <= n; j++) a[ii]![j]! -= y * a[mm]![j]!;
          for (let j = 1; j <= n; j++) a[j]![mm]! += y * a[j]![ii]!;
        }
      }
    }
  }
  // the multipliers left below the subdiagonal are not part of the Hessenberg matrix
  for (let i = 3; i <= n; i++) for (let j = 1; j < i - 1; j++) a[i]![j] = 0;

  // shifted QR with Francis double steps
  const wr = new Array<number>(n + 1).fill(0);
  const wi = new Array<number>(n + 1).fill(0);
  const sign = (x: number, y: number) => (y >= 0 ? Math.abs(x) : -Math.abs(x));
  let anorm = 0;
  for (let i = 1; i <= n; i++) for (let j = Math.max(i - 1, 1); j <= n; j++) anorm += Math.abs(a[i]![j]!);
  let nn = n;
  let t = 0;
  let p = 0;
  let q = 0;
  let r = 0;
  let s = 0;
  let w = 0;
  let x = 0;
  let y = 0;
  let z = 0;
  while (nn >= 1) {
    let its = 0;
    let l: number;
    do {
      for (l = nn; l >= 2; l--) {
        s = Math.abs(a[l - 1]![l - 1]!) + Math.abs(a[l]![l]!);
        if (s === 0) s = anorm;
        if (Math.abs(a[l]![l - 1]!) + s === s) {
          a[l]![l - 1] = 0;
          break;
        }
      }
      x = a[nn]![nn]!;
      if (l === nn) {
        // one root found
        wr[nn] = x + t;
        wi[nn] = 0;
        nn--;
      } else {
        y = a[nn - 1]![nn - 1]!;
        w = a[nn]![nn - 1]! * a[nn - 1]![nn]!;
        if (l === nn - 1) {
          // two roots found
          p = 0.5 * (y - x);
          q = p * p + w;
          z = Math.sqrt(Math.abs(q));
          x += t;
          if (q >= 0) {
            z = p + sign(z, p);
            wr[nn - 1] = wr[nn] = x + z;
            if (z !== 0) wr[nn] = x - w / z;
            wi[nn - 1] = wi[nn] = 0;
          } else {
            wr[nn - 1] = wr[nn] = x + p;
            wi[nn] = z;
            wi[nn - 1] = -z;
          }
          nn -= 2;
        } else {
          if (its === 60) throw new Error('eigenvalues: the QR iteration did not converge');
          if (its === 10 || its === 20 || its === 30 || its === 40 || its === 50) {
            // exceptional shift
            t += x;
            for (let i = 1; i <= nn; i++) a[i]![i]! -= x;
            s = Math.abs(a[nn]![nn - 1]!) + Math.abs(a[nn - 1]![nn - 2]!);
            y = x = 0.75 * s;
            w = -0.4375 * s * s;
          }
          ++its;
          let mm: number;
          for (mm = nn - 2; mm >= l; mm--) {
            z = a[mm]![mm]!;
            r = x - z;
            s = y - z;
            p = (r * s - w) / a[mm + 1]![mm]! + a[mm]![mm + 1]!;
            q = a[mm + 1]![mm + 1]! - z - r - s;
            r = a[mm + 2]![mm + 1]!;
            s = Math.abs(p) + Math.abs(q) + Math.abs(r);
            p /= s;
            q /= s;
            r /= s;
            if (mm === l) break;
            const u = Math.abs(a[mm]![mm - 1]!) * (Math.abs(q) + Math.abs(r));
            const v = Math.abs(p) * (Math.abs(a[mm - 1]![mm - 1]!) + Math.abs(z) + Math.abs(a[mm + 1]![mm + 1]!));
            if (u + v === v) break;
          }
          for (let i = mm + 2; i <= nn; i++) {
            a[i]![i - 2] = 0;
            if (i !== mm + 2) a[i]![i - 3] = 0;
          }
          for (let k = mm; k <= nn - 1; k++) {
            if (k !== mm) {
              p = a[k]![k - 1]!;
              q = a[k + 1]![k - 1]!;
              r = 0;
              if (k !== nn - 1) r = a[k + 2]![k - 1]!;
              x = Math.abs(p) + Math.abs(q) + Math.abs(r);
              if (x !== 0) {
                p /= x;
                q /= x;
                r /= x;
              }
            }
            s = sign(Math.sqrt(p * p + q * q + r * r), p);
            if (s !== 0) {
              if (k === mm) {
                if (l !== mm) a[k]![k - 1] = -a[k]![k - 1]!;
              } else a[k]![k - 1] = -s * x;
              p += s;
              x = p / s;
              y = q / s;
              z = r / s;
              q /= p;
              r /= p;
              for (let j = k; j <= nn; j++) {
                p = a[k]![j]! + q * a[k + 1]![j]!;
                if (k !== nn - 1) {
                  p += r * a[k + 2]![j]!;
                  a[k + 2]![j]! -= p * z;
                }
                a[k + 1]![j]! -= p * y;
                a[k]![j]! -= p * x;
              }
              const mmin = nn < k + 3 ? nn : k + 3;
              for (let i = l; i <= mmin; i++) {
                p = x * a[i]![k]! + y * a[i]![k + 1]!;
                if (k !== nn - 1) {
                  p += z * a[i]![k + 2]!;
                  a[i]![k + 2]! -= p * r;
                }
                a[i]![k + 1]! -= p * q;
                a[i]![k]! -= p;
              }
            }
          }
        }
      }
    } while (l < nn - 1);
  }
  const out: { re: number; im: number }[] = [];
  for (let i = 1; i <= n; i++) out.push({ re: wr[i]!, im: wi[i]! });
  return out;
}
