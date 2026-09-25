/**
 * A number as the tools' fields take it. Besides a plain number (0.0001, 1e-4) a field accepts an SI
 * prefix, the unit after it or both, as a datasheet or a SPICE netlist writes the value: 100u, 100 µH,
 * 100uH, 2.2m, 200k, 200 kHz, 1.5M, 1meg, 330n, 4.7 µF, 10 Ω, and a percentage (30 % is 0.3). The
 * prefixes are SPICE's and SI's: f p n u µ m k M (also meg) G T; M is mega and m milli, as in SI. An
 * empty field, or any other text, is NaN, never 0.
 */
const PREFIX: Record<string, number> = {
  f: 1e-15,
  p: 1e-12,
  n: 1e-9,
  u: 1e-6,
  'µ': 1e-6, // U+00B5 micro sign
  'μ': 1e-6, // U+03BC Greek mu
  m: 1e-3,
  k: 1e3,
  K: 1e3,
  M: 1e6,
  meg: 1e6,
  Meg: 1e6,
  MEG: 1e6,
  G: 1e9,
  T: 1e12,
};

// a number, then an optional prefix, then an optional unit (the tools' units), spaces allowed between
const FORM = /^([+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?)\s*(meg|Meg|MEG|[fpnuµμmkKMGT])?\s*(Hz|H|F|V|A|W|s|\u03a9|\u2126|ohms?|Ohms?)?$/;

export function parseSI(raw: string | undefined): number {
  const t = (raw ?? '').trim();
  if (t === '') return Number.NaN;
  const pct = /^(.*?)\s*%$/.exec(t);
  if (pct) {
    const v = plain(pct[1]!);
    return v === undefined ? Number.NaN : v / 100;
  }
  const m = FORM.exec(t);
  if (!m) return Number.NaN;
  const v = Number(m[1]) * (m[2] ? PREFIX[m[2]]! : 1);
  return Number.isFinite(v) ? v : Number.NaN;
}

/** A plain number, without prefix or unit. */
function plain(t: string): number | undefined {
  return /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(t) ? Number(t) : undefined;
}
