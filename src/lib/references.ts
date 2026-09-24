/**
 * Typed access to src/generated/references.json (generated from
 * references.bib by `python scripts/gen_equations.py`) and IEEE-style
 * formatting for the bibliography page.
 */
import data from '../generated/references.json';

export interface RefEntry {
  key: string;
  type: string;
  label: string;
  authors: string[];
  title: string;
  verified: boolean;
  journal?: string;
  booktitle?: string;
  publisher?: string;
  address?: string;
  edition?: string;
  institution?: string;
  organization?: string;
  kind?: string;
  number?: string;
  volume?: string;
  pages?: string;
  year?: string;
  isbn?: string;
  doi?: string;
  url?: string;
}

export const references = (data as unknown as { entries: Record<string, RefEntry> }).entries;

/**
 * Look up a citable entry. Throws (failing the build) for an unknown key or
 * an entry still flagged VERIFY in references.bib (CLAUDE.md rule 3).
 */
export function citable(key: string): RefEntry {
  const e = references[key];
  if (!e) throw new Error(`citation key "${key}" is not in references.bib`);
  if (!e.verified) throw new Error(`citation key "${key}" is flagged VERIFY in references.bib and cannot be cited`);
  return e;
}

function ordinal(n: string, locale: string): string {
  if (locale === 'ko') return `제${n}판`;
  const k = Number(n);
  const suffix = k % 10 === 1 && k % 100 !== 11 ? 'st' : k % 10 === 2 && k % 100 !== 12 ? 'nd' : k % 10 === 3 && k % 100 !== 13 ? 'rd' : 'th';
  return `${n}${suffix} ed.`;
}

function joinAuthors(a: string[]): string {
  if (a.length <= 2) return a.join(' and ');
  return `${a.slice(0, -1).join(', ')}, and ${a[a.length - 1]}`;
}

/** Plain-text pieces of an IEEE-style reference; the component adds links. */
export function formatReference(e: RefEntry, locale: string): { lead: string; title: string; italicTitle: boolean; tail: string } {
  const who = e.authors.length ? joinAuthors(e.authors) : (e.organization ?? e.institution ?? '');
  const bits: string[] = [];
  switch (e.type) {
    case 'article':
      bits.push(e.journal ?? '');
      if (e.volume) bits.push(`vol. ${e.volume}`);
      if (e.number) bits.push(`no. ${e.number}`);
      if (e.pages) bits.push(e.pages.includes('–') ? `pp. ${e.pages}` : `art. ${e.pages}`);
      if (e.year) bits.push(e.year);
      return { lead: who, title: e.title, italicTitle: false, tail: bits.filter(Boolean).join(', ') };
    case 'book': {
      if (e.edition) bits.push(ordinal(e.edition, locale));
      const pub = [e.address, e.publisher].filter(Boolean).join(': ');
      if (pub) bits.push(pub);
      if (e.year) bits.push(e.year);
      if (e.isbn) bits.push(`ISBN ${e.isbn}`);
      return { lead: who, title: e.title, italicTitle: true, tail: bits.join(', ') };
    }
    case 'techreport':
      bits.push(e.institution ?? '');
      if (e.kind || e.number) bits.push([e.kind, e.number].filter(Boolean).join(' '));
      if (e.year) bits.push(e.year);
      return { lead: who, title: e.title, italicTitle: false, tail: bits.filter(Boolean).join(', ') };
    case 'manual':
      if (e.kind || e.number) bits.push([e.kind, e.number].filter(Boolean).join(' '));
      if (e.year) bits.push(e.year);
      return { lead: who, title: e.title, italicTitle: true, tail: bits.join(', ') };
    default:
      if (e.year) bits.push(e.year);
      return { lead: who, title: e.title, italicTitle: true, tail: bits.join(', ') };
  }
}
