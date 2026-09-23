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
const PREFIXABLE = new Set(['V', 'A', 'W', 'Ω', 'H', 'F', 'Hz', 's', 'J', 'C', 'T', 'rad/s', 'H/m', 'W/m³']);

function trim(x: number, sig: number): string {
  const s = x.toPrecision(sig);
  return s.includes('e') ? s : s.replace(/(\.\d*?[1-9])0+$|\.0+$/, '$1');
}

export function formatSI(value: number, unit: string, sig = 3): string {
  if (!Number.isFinite(value)) return String(value);
  if (unit === '1' || unit === '') {
    // Dimensionless: plain digits (2000, not 2.00e+3) between 1e-3 and 1e6.
    const abs = Math.abs(value);
    return abs >= 1e-3 && abs < 1e6 ? String(Number(value.toPrecision(sig))) : trim(value, sig);
  }
  const abs = Math.abs(value);
  if (!PREFIXABLE.has(unit) || abs === 0) {
    const txt = abs !== 0 && (abs < 1e-3 || abs >= 1e4) ? value.toExponential(sig - 1) : trim(value, sig);
    return `${txt} ${unit}`;
  }
  // W/m³ and H/m take prefixes only on large/small magnitudes of the whole unit
  for (const [scale, prefix] of PREFIXES) {
    if (abs >= scale * 0.9995) {
      return `${trim(value / scale, sig)} ${prefix}${unit}`;
    }
  }
  return `${value.toExponential(sig - 1)} ${unit}`;
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
