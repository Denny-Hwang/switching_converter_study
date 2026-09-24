import { describe, expect, it } from 'vitest';
import { fold } from './fold';

describe('fold, the resource tables’ search text', () => {
  it('ignores case and accents', () => {
    expect(fold('Maksimović')).toBe('maksimovic');
    expect(fold('Würth')).toBe('wurth');
    expect(fold('Erickson & Maksimović').includes(fold('MAKSIMOVIC'))).toBe(true);
  });

  it('keeps Hangul syllables whole', () => {
    // NFD alone leaves the jamo apart: "변화" would then find "변환", "모드" "모든"
    expect(fold('변환')).toBe('변환');
    expect(fold('변환').includes(fold('변화'))).toBe(false);
    expect(fold('모든').includes(fold('모드'))).toBe(false);
    expect(fold('스위칭 변환기').includes(fold('변환'))).toBe(true);
  });
});
