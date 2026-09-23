/** Engineering formatting with SI prefixes (display only; the engine is pure SI). */

const PREFIXES: readonly [number, string][] = [
  [1e12, 'T'],
  [1e9, 'G'],
  [1e6, 'M'],
  [1e3, 'k'],
  [1, ''],
  [1e-3, 'm'],
  [1e-6, 'µ'],
  [1e-9, 'n'],
  [1e-12, 'p'],
];

/** Units to which an SI prefix may be attached directly. */
const PREFIXABLE = new Set(['V', 'A', 'W', 'Ω', 'H', 'F', 'Hz', 's', 'J', 'C', 'T', 'rad/s', 'H/m', 'W/m³', 'Ω·m']);

/**
 * Lengths, areas and volumes of parts in millimetres, as data sheets give
 * them (0.25 mm, 52.5 mm², 3020 mm³): the factor to mm, the unit, and the
 * size in SI below which a value is written so.
 */
const MILLI: Record<string, readonly [number, string, number]> = {
  m: [1e3, 'mm', 1],
  'm²': [1e6, 'mm²', 1e-2],
  'm³': [1e9, 'mm³', 1e-3],
};

function trim(x: number, sig: number): string {
  const s = x.toPrecision(sig);
  return s.includes('e') ? s : s.replace(/(\.\d*?[1-9])0+$|\.0+$/, '$1');
}

export function formatSI(value: number, unit: string, sig = 3): string {
  if (!Number.isFinite(value)) return String(value);
  if (unit === '1' || unit === '') {
    // Dimensionless: plain digits (2000, not 2.00e+3) between 1e-3 and 1e6.
    const abs = Math.abs(value);
    return minus(abs >= 1e-3 && abs < 1e6 ? String(Number(value.toPrecision(sig))) : trim(value, sig));
  }
  const abs = Math.abs(value);
  const milli = MILLI[unit];
  if (milli && abs < milli[2] && abs * milli[0] >= 1e-3) return `${minus(String(Number((value * milli[0]).toPrecision(sig))))} ${milli[1]}`;
  if (!PREFIXABLE.has(unit) || abs === 0) {
    const txt = abs !== 0 && (abs < 1e-3 || abs >= 1e5) ? value.toExponential(sig - 1) : String(Number(value.toPrecision(sig)));
    return `${minus(txt)} ${unit}`;
  }
  // the prefix of the value as printed: 999.96 V at 4 digits is 1 kV, 999.6 V stays 999.6 V
  const printed = Number(abs.toPrecision(sig));
  for (const [scale, prefix] of PREFIXES) {
    if (printed >= scale) {
      return `${minus(trim(value / scale, sig))} ${prefix}${unit}`;
    }
  }
  return `${minus(value.toExponential(sig - 1))} ${unit}`;
}

/** A negative number with a true minus sign, not a hyphen. */
function minus(txt: string): string {
  return txt.replace(/^-/, '−');
}

/**
 * A value in a tool's results: SI prefixes where the unit takes them
 * ("200 µH", "4.167 µF"), '—' when there is no value, '∞' when it is
 * unbounded.
 */
export function fmtValue(x: number | undefined, unit = '', sig = 4): string {
  if (x === undefined || Number.isNaN(x)) return '—';
  if (!Number.isFinite(x)) return x > 0 ? '∞' : '−∞';
  return formatSI(x, unit, sig);
}
