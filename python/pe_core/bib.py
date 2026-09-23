"""Minimal, strict BibTeX reader for references.bib.

Only the subset used in this repository is supported: ``@type{key, field =
{value}, ...}`` with brace-delimited values (nested braces allowed), plain
numbers, and the LaTeX accent commands that appear in author names. The
parser is strict so that a malformed entry fails CI instead of silently
disappearing from the bibliography.
"""

from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass, field
from pathlib import Path

from .equations import REPO_ROOT

BIB_PATH = REPO_ROOT / "references.bib"

ENTRY_TYPES = {"article", "book", "techreport", "manual", "misc", "inproceedings", "incollection", "online"}
REQUIRED = {
    "article": ("author", "title", "journal", "year"),
    "book": ("author", "title", "publisher", "year"),
    "techreport": ("author", "title", "institution", "year"),
    "manual": ("title", "organization"),
    "misc": ("title", "howpublished"),
    "inproceedings": ("author", "title", "booktitle", "year"),
    "incollection": ("author", "title", "booktitle", "year"),
    "online": ("title", "url"),
}

_ACCENTS = {
    "'": "\u0301",
    "`": "\u0300",
    "^": "\u0302",
    '"': "\u0308",
    "~": "\u0303",
    "c": "\u0327",
    "v": "\u030c",
    "u": "\u0306",
    "=": "\u0304",
    ".": "\u0307",
}


class BibError(ValueError):
    pass


@dataclass
class Entry:
    type: str
    key: str
    fields: dict[str, str]
    line: int
    field_order: list[str] = field(default_factory=list)

    @property
    def note(self) -> str:
        return self.fields.get("note", "")

    @property
    def is_verify(self) -> bool:
        return "VERIFY" in self.note

    @property
    def url(self) -> str | None:
        if "url" in self.fields:
            return plain(self.fields["url"])
        m = re.search(r"\\url\{([^}]*)\}", self.fields.get("howpublished", ""))
        return m.group(1) if m else None

    @property
    def doi(self) -> str | None:
        return self.fields.get("doi")


def _read_braced(text: str, i: int) -> tuple[str, int]:
    """text[i] == '{'; return (content, index after the closing brace)."""
    assert text[i] == "{"
    depth = 0
    start = i + 1
    while i < len(text):
        ch = text[i]
        if ch == "\\":
            i += 2
            continue
        if ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0:
                return text[start:i], i + 1
        i += 1
    raise BibError("unbalanced braces")


def parse(text: str) -> list[Entry]:
    entries: list[Entry] = []
    seen: set[str] = set()
    i = 0
    n = len(text)
    while i < n:
        at = text.find("@", i)
        if at < 0:
            break
        # a '@' inside a comment line is ignored
        line_start = text.rfind("\n", 0, at) + 1
        if text[line_start:at].lstrip().startswith("%"):
            i = at + 1
            continue
        line = text.count("\n", 0, at) + 1
        m = re.compile(r"@([A-Za-z]+)\s*\{\s*([^,\s]+)\s*,").match(text, at)
        if not m:
            raise BibError(f"references.bib:{line}: cannot parse entry header")
        etype, key = m.group(1).lower(), m.group(2)
        if etype not in ENTRY_TYPES:
            raise BibError(f"references.bib:{line}: unsupported entry type @{etype}")
        if key in seen:
            raise BibError(f"references.bib:{line}: duplicate key {key!r}")
        seen.add(key)
        j = m.end()
        fields: dict[str, str] = {}
        order: list[str] = []
        while True:
            while j < n and text[j] in " \t\r\n,":
                j += 1
            if j < n and text[j] == "}":
                j += 1
                break
            fm = re.compile(r"([A-Za-z][A-Za-z0-9_-]*)\s*=\s*").match(text, j)
            if not fm:
                raise BibError(f"references.bib:{line}: {key}: cannot parse field near {text[j:j+30]!r}")
            name = fm.group(1).lower()
            j = fm.end()
            if j < n and text[j] == "{":
                value, j = _read_braced(text, j)
            else:
                vm = re.compile(r"[0-9]+").match(text, j)
                if not vm:
                    raise BibError(f"references.bib:{line}: {key}.{name}: values must be {{braced}} or numbers")
                value, j = vm.group(0), vm.end()
            if name in fields:
                raise BibError(f"references.bib:{line}: {key}: duplicate field {name}")
            fields[name] = " ".join(value.split())
            order.append(name)
        missing = [f for f in REQUIRED[etype] if f not in fields]
        if missing:
            raise BibError(f"references.bib:{line}: {key}: missing required fields {missing}")
        entries.append(Entry(type=etype, key=key, fields=fields, line=line, field_order=order))
        i = j
    return entries


def load(path: Path | str = BIB_PATH) -> list[Entry]:
    return parse(Path(path).read_text(encoding="utf-8"))


def plain(tex: str) -> str:
    """Convert the small LaTeX subset used in fields to plain Unicode text."""
    s = tex
    s = re.sub(r"\\url\{([^}]*)\}", r"\1", s)
    # {\'c}, \'{c}, \'c
    def accent(m: re.Match[str]) -> str:
        return unicodedata.normalize("NFC", m.group(2) + _ACCENTS[m.group(1)])

    s = re.sub(r"\{\\([\'`^\"~cvu=.])\s*\{?([A-Za-z])\}?\}", accent, s)
    s = re.sub(r"\\([\'`^\"~=.])\{?([A-Za-z])\}?", accent, s)
    s = s.replace("---", "\u2014").replace("--", "\u2013")
    s = s.replace("\\&", "&").replace("~", "\u00a0")
    s = s.replace("{", "").replace("}", "")
    if "\\" in s:
        raise BibError(f"unsupported LaTeX in bibliography field: {tex!r}")
    return " ".join(s.split())


def split_authors(field_value: str) -> list[str]:
    """'Last, First and {Corp Name}' -> ['First Last', 'Corp Name']."""
    names = []
    for raw in re.split(r"\s+and\s+", field_value):
        raw = raw.strip()
        if raw.startswith("{") and raw.endswith("}"):
            names.append(plain(raw[1:-1]))
            continue
        if "," in raw:
            last, first = [p.strip() for p in raw.split(",", 1)]
            names.append(plain(f"{first} {last}"))
        else:
            names.append(plain(raw))
    return names


def family_names(field_value: str) -> list[str]:
    out = []
    for raw in re.split(r"\s+and\s+", field_value):
        raw = raw.strip()
        if raw.startswith("{") and raw.endswith("}"):
            out.append(plain(raw[1:-1]))
        elif "," in raw:
            out.append(plain(raw.split(",", 1)[0]))
        else:
            out.append(plain(raw.split()[-1]))
    return out


def label(entry: Entry) -> str:
    """Short in-text label: 'Erickson & Maksimović 2020', or for undated
    items (web pages, data sheets) 'Analog Devices, LTC6101/LTC6101HV'."""
    f = entry.fields
    short_title = plain(f["title"]).split(":")[0].strip()
    if "author" in f:
        fam = family_names(f["author"])
        who = fam[0] if len(fam) == 1 else f"{fam[0]} & {fam[1]}" if len(fam) == 2 else f"{fam[0]} et al."
    elif "organization" in f:
        who = plain(f["organization"])
    else:
        return short_title
    year = f.get("year")
    return f"{who} {year}" if year else f"{who}, {short_title}"


def to_json(entry: Entry) -> dict[str, object]:
    f = entry.fields
    out: dict[str, object] = {
        "key": entry.key,
        "type": entry.type,
        "label": label(entry),
        "authors": split_authors(f["author"]) if "author" in f else [],
        "title": plain(f["title"]),
        "verified": not entry.is_verify,
    }
    for name in ("journal", "booktitle", "publisher", "address", "edition", "institution", "organization",
                 "number", "volume", "pages", "year", "isbn", "doi"):
        if name in f:
            out[name] = plain(f[name])
    if "type" in f:  # techreport/manual document kind, e.g. "Application Report"
        out["kind"] = plain(f["type"])
    url = entry.url
    if url:
        out["url"] = url
    return out
