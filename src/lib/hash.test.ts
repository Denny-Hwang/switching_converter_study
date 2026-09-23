import { describe, expect, it } from 'vitest';
import { isAnchorHash, isToolHash } from './hash';

describe('tool hashes and in-page anchors', () => {
  const keys = ['clamp', 'Vg', 'V'];
  it("a hash with one of the tool's keys is a state, a heading or equation anchor is not", () => {
    expect(isToolHash(new URLSearchParams('clamp=rcd&Vg=72'), keys)).toBe(true);
    expect(isToolHash(new URLSearchParams('V='), keys)).toBe(true);
    for (const anchor of ['screenshot', 'eq-clamp.P', '스크린샷', '']) expect(isToolHash(new URLSearchParams(anchor), keys)).toBe(false);
  });

  it('an anchor is a non-empty hash without the tool keys; no hash at all is not one', () => {
    for (const anchor of ['screenshot', 'eq-clamp.P', '스크린샷', 'what-it-computes']) {
      expect(isAnchorHash(new URLSearchParams(anchor), keys)).toBe(true);
    }
    expect(isAnchorHash(new URLSearchParams(''), keys)).toBe(false);
    expect(isAnchorHash(new URLSearchParams('clamp=rcd&Vg=72'), keys)).toBe(false);
  });
});
