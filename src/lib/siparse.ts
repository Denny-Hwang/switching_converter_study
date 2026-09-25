/**
 * A number as the tools' fields take it. Besides a plain number (0.0001, 1e-4) a field accepts an SI
 * prefix, the unit after it or both, as a datasheet or a SPICE netlist writes the value: 100u, 100 µH,
 * 100uH, 2.2m, 200k, 200 kHz, 1.5M, 1meg, 330n, 4.7 µF, 10 Ω, and a percentage (30 % is 0.3). The
 * prefixes are SPICE's and SI's: f p n u µ m k M (also meg) G T; M is mega and m milli, as in SI. Text
 * is read after Unicode compatibility normalisation (NFKC), so a Korean keyboard's unit symbols (㎌ ㎑
 * ㏀) and full-width digits read as their plain forms. An empty field, or any other text, is NaN, never 0.
 *
 * Given the field's unit, only that unit may follow the number (and its prefix): a unit that is also a
 * prefix letter then reads as the unit (0.3 T is 0.3 tesla, 5 m five metres, 5 mm five millimetres), and
 * another unit (100 µF in a field of henries) is not a number. On a unit to a power (m², m³) a prefix
 * takes the power too: 100 mm² is 1e-4 m², 10 cm³ is 1e-5 m³.
 */
const PREFIX: Record<string, number> = {
  f: -15,
  p: -12,
  c: -2, // centi: for areas and volumes (cm², cm³)
  n: -9,
  u: -6,
  'µ': -6, // U+00B5 micro sign (NFKC maps it to the Greek mu)
  'μ': -6, // U+03BC Greek mu
  m: -3,
  k: 3,
  K: 3,
  M: 6,
  meg: 6,
  Meg: 6,
  MEG: 6,
  G: 9,
  T: 12,
};
const PREFIXES = 'meg|Meg|MEG|[fpcnuµμmkKMGT]';
// the units a field may carry, when the caller does not say which
const UNITS = 'Hz|H|F|V|A|W|s|\u03a9|ohms?|Ohms?';
const OHM = ['\u03a9', 'ohms', 'ohm', 'Ohms', 'Ohm'];

/** A number with an optional prefix, scaled exactly (100u is 1e-4, not 100 × 1e-6). */
const WITH_PREFIX = new RegExp(`^([+-]?(?:\\d+(?:\\.\\d*)?|\\.\\d+))(?:[eE]([+-]?\\d+))?\\s*(${PREFIXES})?$`);
const WITH_UNIT = new RegExp(`^(.*?)\\s*(?:${UNITS})$`);

function withPrefix(t: string, power = 1): number {
  const m = WITH_PREFIX.exec(t);
  if (!m) return Number.NaN;
  // a prefix on a powered unit is raised with it: 100 mm² is 100 (10⁻³ m)², 1e-4 m²
  const exp = Number(m[2] ?? 0) + (m[3] ? power * PREFIX[m[3]]! : 0);
  const v = Number(`${m[1]}e${exp}`);
  return Number.isFinite(v) ? v : Number.NaN;
}

export function parseSI(raw: string | undefined, unit?: string): number {
  let t = (raw ?? '').normalize('NFKC').trim();
  if (t === '') return Number.NaN;
  const pct = /^(.*?)\s*%$/.exec(t);
  if (pct) {
    const v = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(pct[1]!) ? Number(pct[1]) : Number.NaN;
    return v / 100;
  }
  if (unit !== undefined) {
    const u = unit.normalize('NFKC');
    // (a dimensionless field's unit, '' or '1', is never text after the number)
    const names = u === '\u03a9' ? OHM : u && !/^[\d.]/.test(u) ? [u] : [];
    const name = names.find((n) => t.length > n.length && t.endsWith(n));
    if (name) t = t.slice(0, -name.length).trimEnd();
    // a unit that is one base unit to a power (m2, m3 after NFKC): its prefix takes the power too
    const power = /^[A-Za-z]+([2-9])$/.exec(u)?.[1];
    return withPrefix(t, power && name ? Number(power) : 1);
  }
  const v = withPrefix(t);
  if (!Number.isNaN(v)) return v;
  const m = WITH_UNIT.exec(t);
  return m ? withPrefix(m[1]!) : Number.NaN;
}
