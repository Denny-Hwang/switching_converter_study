/**
 * Solve a catalogue equation for one of its inputs. The design tools size a
 * part from a target: the duty ratio for a conversion ratio, the inductance
 * for a ripple, the capacitance for an output ripple. The formula stays the
 * catalogue's (CLAUDE.md rule 2): `invert` only searches for the input value
 * at which the catalogue's evaluator returns the target.
 */

import { evaluate, type Inputs } from './equations';

export class InvertError extends Error {}

/**
 * The value x in [lo, hi] at which `evaluate(id, {...inputs, [unknown]: x})`
 * equals `target`. Bisection, on log x when lo > 0, down to the resolution of
 * a double; the equation must be continuous and monotonic in the unknown over
 * the bracket. Throws an InvertError when the target is not a finite number,
 * when the equation is not finite at an end of the bracket, or when the
 * target is not bracketed.
 */
export function invert(id: string, unknown: string, target: number, inputs: Inputs, lo: number, hi: number): number {
  if (!(lo < hi)) throw new InvertError(`${id}: empty bracket [${lo}, ${hi}] for ${unknown}`);
  if (!Number.isFinite(target)) throw new InvertError(`${id}: target ${target} for ${unknown} is not a finite number`);
  const log = lo > 0;
  // the ends are evaluated at lo and hi themselves (exp(log(lo)) may differ from lo in the last bit)
  const at = (u: number, end?: number) => end ?? (log ? Math.exp(u) : u);
  const f = (x: number) => evaluate(id, { ...inputs, [unknown]: x }) - target;
  let a = log ? Math.log(lo) : lo;
  let b = log ? Math.log(hi) : hi;
  let fa = f(lo);
  const fb = f(hi);
  if (!Number.isFinite(fa) || !Number.isFinite(fb)) {
    throw new InvertError(`${id}: not finite at an end of [${lo}, ${hi}] for ${unknown}`);
  }
  if (fa === 0) return lo;
  if (fb === 0) return hi;
  if (Math.sign(fa) === Math.sign(fb)) {
    throw new InvertError(`${id}: no ${unknown} in [${lo}, ${hi}] gives ${target}`);
  }
  let aEnd: number | undefined = lo;
  let bEnd: number | undefined = hi;
  for (let k = 0; k < 400; k++) {
    const m = 0.5 * (a + b);
    if (m <= a || m >= b) break;
    const fm = f(at(m));
    if (fm === 0) return at(m);
    if (Math.sign(fm) === Math.sign(fa)) {
      a = m;
      aEnd = undefined;
      fa = fm;
    } else {
      b = m;
      bEnd = undefined;
    }
  }
  return 0.5 * (at(a, aEnd) + at(b, bEnd));
}
