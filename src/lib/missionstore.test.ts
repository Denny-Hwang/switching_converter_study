import { describe, expect, it } from 'vitest';
import { STORE_KEY, checkAnswer, clearMission, doneCount, parseAnswer, progressStore, readProgress, setDone } from './missionstore';

describe('the stored progress', () => {
  it('reads what setDone writes', () => {
    let p = readProgress(null);
    expect(p).toEqual({});
    p = setDone(p, 'm1', 'sympy', true);
    p = setDone(p, 'm1', 'by-hand', true);
    p = setDone(p, 'm2', 'boundary', true);
    expect(readProgress(JSON.stringify(p))).toEqual({ m1: ['by-hand', 'sympy'], m2: ['boundary'] });
  });

  it('keeps each criterion once, and drops a mission with none left', () => {
    let p = setDone(setDone({}, 'm1', 'a', true), 'm1', 'a', true);
    expect(p).toEqual({ m1: ['a'] });
    p = setDone(p, 'm1', 'a', false);
    expect(p).toEqual({});
    expect(setDone({}, 'm1', 'a', false)).toEqual({});
  });

  it('does not change the object it is given', () => {
    const p = { m1: ['a'] };
    setDone(p, 'm1', 'b', true);
    clearMission(p, 'm1');
    expect(p).toEqual({ m1: ['a'] });
  });

  it('clears one mission and leaves the others', () => {
    expect(clearMission({ m1: ['a'], m2: ['b'] }, 'm1')).toEqual({ m2: ['b'] });
  });

  it('ignores what it did not write: bad JSON, other shapes, other ids', () => {
    for (const text of ['', 'not json', '[1,2]', '"m1"', '42', 'null']) expect(readProgress(text)).toEqual({});
    expect(readProgress('{"m1": "a", "m2": [1, "ok", "ok", "Bad Id"], "x y": ["a"]}')).toEqual({ m2: ['ok'] });
  });

  it('counts only the criteria the page still has', () => {
    const p = { m1: ['a', 'b', 'gone'] };
    expect(doneCount(p, 'm1', ['a', 'b', 'c'])).toBe(2);
    expect(doneCount(p, 'm2', ['a'])).toBe(0);
  });
});

describe('an answer as typed', () => {
  it('takes a plain number, an exponent, a sign and a decimal comma', () => {
    expect(parseAnswer('12', 'V')).toBe(12);
    expect(parseAnswer(' 1.2e1 ', 'V')).toBe(12);
    expect(parseAnswer('.5', '1')).toBe(0.5);
    expect(parseAnswer('0,5', '1')).toBe(0.5);
    expect(parseAnswer('−3', 'V')).toBe(-3);
  });

  it('takes the unit after the number, in either case, and an SI prefix where the unit takes one', () => {
    expect(parseAnswer('12 V', 'V')).toBe(12);
    expect(parseAnswer('12v', 'V')).toBe(12);
    expect(parseAnswer('300m', 'A')).toBeCloseTo(0.3, 15);
    expect(parseAnswer('300 mA', 'A')).toBeCloseTo(0.3, 15);
    expect(parseAnswer('25 µH', 'H')).toBeCloseTo(25e-6, 18);
    expect(parseAnswer('25uH', 'H')).toBeCloseTo(25e-6, 18);
    expect(parseAnswer('50 krad/s', 'rad/s')).toBe(50000);
    expect(parseAnswer('40 kohm', 'Ω')).toBe(40000);
    expect(parseAnswer('40Ω', 'Ω')).toBe(40);
    expect(parseAnswer('1.5 MHz', 'Hz')).toBe(1.5e6);
  });

  it('reads a percentage for a ratio', () => {
    expect(parseAnswer('50 %', '1')).toBe(0.5);
    expect(parseAnswer('12.5%', '1')).toBeCloseTo(0.125, 15);
  });

  it('refuses what is not a number, and a prefix on a unit that takes none', () => {
    for (const text of ['', 'abc', '12 V V', '1..2', '12 W', 'e5']) expect(parseAnswer(text, 'V')).toBeNull();
    expect(parseAnswer('5k', '1')).toBeNull();
    expect(parseAnswer('0.05k', 'cm⁵')).toBeNull();
    expect(parseAnswer('0.0525 cm⁵', 'cm⁵')).toBe(0.0525);
  });

  it('is within the tolerance, relative to the expected value', () => {
    expect(checkAnswer(12.05, 12, 0.005)).toEqual({ rel: expect.closeTo(0.05 / 12, 12), ok: true });
    expect(checkAnswer(12.1, 12, 0.005).ok).toBe(false);
    expect(checkAnswer(-2.99, -3, 0.01).ok).toBe(true);
    expect(checkAnswer(3, -3, 0.01).ok).toBe(false);
  });
});

describe('where the progress is kept (progressStore)', () => {
  /** A localStorage stand-in: `read` and `write` false make getItem and setItem throw. */
  const fake = (read = true, write = true) => {
    const data = new Map<string, string>();
    return {
      data,
      storage: {
        getItem: (k: string) => {
          if (!read) throw new DOMException('storage turned off', 'SecurityError');
          return data.get(k) ?? null;
        },
        setItem: (k: string, v: string) => {
          if (!write) throw new DOMException('storage full', 'QuotaExceededError');
          data.set(k, v);
        },
      },
    };
  };

  it('keeps the progress in the storage, and reads what another page wrote there', () => {
    const { data, storage } = fake();
    const store = progressStore(() => storage);
    store.save(setDone(store.load(), 'm1', 'a', true));
    expect(JSON.parse(data.get(STORE_KEY)!)).toEqual({ m1: ['a'] });
    data.set(STORE_KEY, JSON.stringify({ m1: ['a'], m2: ['b'] })); // the other language's page
    expect(store.load()).toEqual({ m1: ['a'], m2: ['b'] });
  });

  for (const [what, read, write] of [
    ['a storage that refuses to be read', false, true],
    ['a storage that reads nothing and refuses to keep anything', true, false],
    ['no storage at all', false, false],
  ] as const) {
    it(`keeps every tick until the page is left, with ${what}`, () => {
      const { storage } = fake(read, write);
      const store = progressStore(() => storage);
      store.save(setDone(store.load(), 'm1', 'a', true));
      store.save(setDone(store.load(), 'm1', 'b', true));
      store.save(setDone(store.load(), 'm2', 'c', true));
      expect(store.load()).toEqual({ m1: ['a', 'b'], m2: ['c'] });
      store.save(setDone(store.load(), 'm1', 'a', false));
      expect(store.load()).toEqual({ m1: ['b'], m2: ['c'] });
      store.save(clearMission(store.load(), 'm2'));
      expect(store.load()).toEqual({ m1: ['b'] });
    });
  }

  it('keeps the ticks when window.localStorage itself throws', () => {
    const store = progressStore(() => {
      throw new DOMException('denied', 'SecurityError');
    });
    store.save(setDone(store.load(), 'm1', 'a', true));
    store.save(setDone(store.load(), 'm1', 'b', true));
    expect(store.load()).toEqual({ m1: ['a', 'b'] });
  });

  it('goes back to the storage once it keeps a write again, with the ticks made meanwhile', () => {
    const { data, storage } = fake(true, false);
    const store = progressStore(() => storage);
    store.save(setDone(store.load(), 'm1', 'a', true));
    storage.setItem = (k: string, v: string) => void data.set(k, v); // room again
    store.save(setDone(store.load(), 'm1', 'b', true));
    expect(JSON.parse(data.get(STORE_KEY)!)).toEqual({ m1: ['a', 'b'] });
    data.set(STORE_KEY, JSON.stringify({ m1: ['a', 'b'], m3: ['d'] }));
    expect(store.load()).toEqual({ m1: ['a', 'b'], m3: ['d'] });
  });
});
