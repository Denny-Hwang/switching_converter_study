/**
 * The missions' progress (09-missions), kept in this browser only: localStorage
 * under STORE_KEY, as { m1: ['criterion', ...], ... }. No account, nothing is
 * sent anywhere (BUILD_SPEC section 5). Also the answer check's arithmetic.
 * Imported by the pages' scripts, so it must stay free of build-time modules.
 */

export const STORE_KEY = 'pe-missions';

/** Mission id -> the ids of the criteria ticked off. */
export type Progress = Record<string, string[]>;

const ID = /^[a-z0-9-]+$/;

/** The stored progress, keeping only well-formed entries (a hand-edited or foreign value is ignored). */
export function readProgress(text: string | null): Progress {
  if (!text) return {};
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return {};
  }
  if (typeof data !== 'object' || data === null || Array.isArray(data)) return {};
  const out: Progress = {};
  for (const [mission, ids] of Object.entries(data as Record<string, unknown>)) {
    if (!ID.test(mission) || !Array.isArray(ids)) continue;
    const kept = [...new Set(ids.filter((x): x is string => typeof x === 'string' && ID.test(x)))].sort();
    if (kept.length) out[mission] = kept;
  }
  return out;
}

/** The progress with one criterion ticked or cleared (a new object; missions left empty are dropped). */
export function setDone(p: Progress, mission: string, id: string, done: boolean): Progress {
  const ids = new Set(p[mission] ?? []);
  if (done) ids.add(id);
  else ids.delete(id);
  const out: Progress = { ...p };
  if (ids.size) out[mission] = [...ids].sort();
  else delete out[mission];
  return out;
}

/** The progress without one mission. */
export function clearMission(p: Progress, mission: string): Progress {
  const out: Progress = { ...p };
  delete out[mission];
  return out;
}

/** How many of a mission's criteria are ticked (ids no longer on the page do not count). */
export function doneCount(p: Progress, mission: string, ids: readonly string[]): number {
  const done = new Set(p[mission] ?? []);
  return ids.filter((id) => done.has(id)).length;
}

const PREFIX: Record<string, number> = { p: 1e-12, n: 1e-9, u: 1e-6, µ: 1e-6, μ: 1e-6, m: 1e-3, k: 1e3, M: 1e6, G: 1e9 };
/** Units written with an SI prefix (as src/lib/format.ts writes them). */
const PREFIXABLE = new Set(['V', 'A', 'W', 'Ω', 'H', 'F', 'Hz', 's', 'J', 'C', 'T', 'rad/s']);
const SPELLINGS: Record<string, string[]> = { Ω: ['Ω', 'ohms', 'ohm'] };

/**
 * A typed answer as a number in `unit` (the unit the page asks for: V, µ-prefixes allowed for
 * the units that take them, a percentage for a ratio), or null when it is not a number.
 * "12", "12 V", "1.2e1", "25u", "25 µH", "0,5" (a decimal comma), "50 %" for 0.5.
 */
export function parseAnswer(text: string, unit: string): number | null {
  let s = text.trim().replace(/\s+/g, '').replace(/−/g, '-');
  if (!s) return null;
  if (!s.includes('.') && (s.match(/,/g) ?? []).length === 1) s = s.replace(',', '.');
  let scale = 1;
  if (unit === '1' || unit === '') {
    if (s.endsWith('%')) {
      s = s.slice(0, -1);
      scale = 0.01;
    }
  } else {
    // the unit may follow the number, in either case (12 v, 25 uh)
    for (const u of SPELLINGS[unit] ?? [unit]) {
      if (s.toLowerCase().endsWith(u.toLowerCase())) {
        s = s.slice(0, -u.length);
        break;
      }
    }
  }
  const m = /^([-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?)([pnuµμmkMG]?)$/.exec(s);
  if (!m) return null;
  if (m[2] && !PREFIXABLE.has(unit)) return null;
  const x = Number(m[1]) * (m[2] ? PREFIX[m[2]]! : 1) * scale;
  return Number.isFinite(x) ? x : null;
}

/** An answer against the expected value: its relative difference, and whether it is within `tol`. */
export function checkAnswer(answer: number, expected: number, tol: number): { rel: number; ok: boolean } {
  const rel = expected === 0 ? Math.abs(answer) : Math.abs(answer - expected) / Math.abs(expected);
  return { rel, ok: rel <= tol };
}
