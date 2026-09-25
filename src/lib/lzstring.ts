/**
 * LZString.compressToEncodedURIComponent: the encoding of CircuitJS1's share links (?ctz=). A port of
 * the compressor of lz-string (pieroxy, MIT licence), the same as scripts/lzstring.py; both match the
 * JavaScript library's output character for character on the vectors made with it (lzstring.test.ts,
 * python/pe_core/tests/test_falstad.py).
 */

// the 64 characters of the URI-safe alphabet, 6 bits a character
const URI_SAFE = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+-$';

export function compressToEncodedURIComponent(text: string): string {
  const bitsPerChar = 6;
  const dictionary = new Map<string, number>();
  const toCreate = new Set<string>();
  let w = '';
  let enlargeIn = 2;
  let dictSize = 3;
  let numBits = 2;
  const out: string[] = [];
  let val = 0;
  let pos = 0;

  const writeBits = (value: number, nbits: number) => {
    for (let i = 0; i < nbits; i++) {
      val = (val << 1) | (value & 1);
      if (pos === bitsPerChar - 1) {
        pos = 0;
        out.push(URI_SAFE[val]!);
        val = 0;
      } else pos++;
      value >>= 1;
    }
  };
  const grow = () => {
    enlargeIn--;
    if (enlargeIn === 0) {
      enlargeIn = 2 ** numBits;
      numBits++;
    }
  };
  const emit = (word: string) => {
    if (toCreate.has(word)) {
      const code = word.charCodeAt(0);
      if (code < 256) {
        writeBits(0, numBits);
        writeBits(code, 8);
      } else {
        writeBits(1, numBits);
        writeBits(code, 16);
      }
      grow();
      toCreate.delete(word);
    } else writeBits(dictionary.get(word)!, numBits);
    grow();
  };

  // a JavaScript string is already a sequence of UTF-16 code units
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (!dictionary.has(c)) {
      dictionary.set(c, dictSize++);
      toCreate.add(c);
    }
    const wc = w + c;
    if (dictionary.has(wc)) w = wc;
    else {
      emit(w);
      dictionary.set(wc, dictSize++);
      w = c;
    }
  }
  if (w !== '') emit(w);
  writeBits(2, numBits); // end of stream
  // flush the last character
  for (;;) {
    val <<= 1;
    if (pos === bitsPerChar - 1) {
      out.push(URI_SAFE[val]!);
      break;
    }
    pos++;
  }
  return out.join('');
}
