"""LZString.compressToEncodedURIComponent in Python: the encoding of CircuitJS1's share links.

A port of the compressor of lz-string (pieroxy, MIT licence), which CircuitJS1 uses for the
circuit text in a link's ?ctz= parameter. Strings are handled as UTF-16 code units, as in
JavaScript, so the output matches the JavaScript function character for character
(python/pe_core/tests/test_falstad.py checks it against vectors made with lz-string itself).
"""

from __future__ import annotations

# the 64 characters of the URI-safe alphabet, 6 bits a character
URI_SAFE = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+-$"


def compress_to_encoded_uri_component(text: str) -> str:
    return _compress(text, 6, URI_SAFE)


def _utf16_units(text: str) -> list[str]:
    units: list[str] = []
    for ch in text:
        cp = ord(ch)
        if cp > 0xFFFF:
            cp -= 0x10000
            units += [chr(0xD800 + (cp >> 10)), chr(0xDC00 + (cp & 0x3FF))]
        else:
            units.append(ch)
    return units


def _compress(text: str, bits_per_char: int, alphabet: str) -> str:
    dictionary: dict[str, int] = {}
    to_create: set[str] = set()
    w = ""
    enlarge_in = 2
    dict_size = 3
    num_bits = 2
    out: list[str] = []
    val = 0
    pos = 0

    def write_bits(value: int, nbits: int) -> None:
        nonlocal val, pos
        for _ in range(nbits):
            val = (val << 1) | (value & 1)
            if pos == bits_per_char - 1:
                pos = 0
                out.append(alphabet[val])
                val = 0
            else:
                pos += 1
            value >>= 1

    def emit(word: str) -> None:
        nonlocal enlarge_in, num_bits
        if word in to_create:
            code = ord(word[0])
            if code < 256:
                write_bits(0, num_bits)
                write_bits(code, 8)
            else:
                write_bits(1, num_bits)
                write_bits(code, 16)
            enlarge_in -= 1
            if enlarge_in == 0:
                enlarge_in = 2**num_bits
                num_bits += 1
            to_create.discard(word)
        else:
            write_bits(dictionary[word], num_bits)
        enlarge_in -= 1
        if enlarge_in == 0:
            enlarge_in = 2**num_bits
            num_bits += 1

    for c in _utf16_units(text):
        if c not in dictionary:
            dictionary[c] = dict_size
            dict_size += 1
            to_create.add(c)
        wc = w + c
        if wc in dictionary:
            w = wc
        else:
            emit(w)
            dictionary[wc] = dict_size
            dict_size += 1
            w = c
    if w:
        emit(w)
    write_bits(2, num_bits)  # end of stream
    while True:  # flush the last character
        val <<= 1
        if pos == bits_per_char - 1:
            out.append(alphabet[val])
            break
        pos += 1
    return "".join(out)
