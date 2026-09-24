/**
 * The resource tables' search text, at build time and in the browser: case
 * and accents ignored ("maksimovic" finds "Maksimović", "wurth" finds
 * "Würth"). NFD splits a letter from its accents but also a Hangul syllable
 * into its jamo; NFC puts the syllables back together, so that "변화" does not
 * find "변환".
 */
export const fold = (s: string): string =>
  s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').normalize('NFC').toLowerCase();
