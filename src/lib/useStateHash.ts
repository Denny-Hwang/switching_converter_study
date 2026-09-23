/**
 * useStateHash(hash, keys) -- keep a tool's state in the URL hash.
 *
 * Every change of state replaces the hash (history.replaceState, which fires
 * no hashchange). One exception: a page opened at an in-page anchor (a link
 * to #screenshot or to an equation) keeps that anchor until the state first
 * changes, so the link and a reload still land on that section.
 */
import { useEffect, useRef } from 'react';
import { isAnchorHash } from './hash';

export function useStateHash(hash: string, keys: readonly string[]): void {
  const opened = useRef<{ hash: string; anchored: boolean } | null>(null);
  if (opened.current === null) {
    const h = new URLSearchParams(typeof window === 'undefined' ? '' : window.location.hash.replace(/^#/, ''));
    opened.current = { hash, anchored: isAnchorHash(h, keys) };
  }
  useEffect(() => {
    const o = opened.current!;
    if (o.anchored) {
      if (hash === o.hash) return; // still the state the page opened with: leave the anchor
      o.anchored = false; // from the first change on, the URL follows the state
    }
    window.history.replaceState(null, '', `#${hash}`);
  }, [hash]);
}
