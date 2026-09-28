"""docs/STATUS.md's counts are the repository's: the derivations and the equations they leave out, the
symbols with a meaning, the derivation modules, the references, the example files, the pages and the
English/Korean page pairs. A phase that adds any of them updates STATUS in the same change."""

from __future__ import annotations

import re

import pytest

from pe_core import bib
from pe_core.derive import MODULES
from pe_core.equations import REPO_ROOT, Catalog, load

STATUS = REPO_ROOT / "docs" / "STATUS.md"
DOCS = REPO_ROOT / "src" / "content" / "docs"


@pytest.fixture(scope="module")
def catalog() -> Catalog:
    return load()


def row(start: str) -> str:
    rows = [ln for ln in STATUS.read_text(encoding="utf-8").splitlines() if ln.startswith(start)]
    assert len(rows) == 1, f"docs/STATUS.md: {len(rows)} rows start with {start!r}"
    return rows[0]


def pages(locale: str) -> int:
    return sum(1 for p in (DOCS / locale).rglob("*") if p.suffix in (".md", ".mdx"))


def test_derivations(catalog: Catalog) -> None:
    n = len(catalog.equations)
    not_derived = {e.id for e in catalog.equations if not e.derived_by}
    m = re.search(r"\| ✅ (\d+) of (\d+) \((.*)\) \|$", row("| Derivations reproduce the YAML"))
    assert m, "the derivations row must read '✅ N of M (the equations not derived and why)'"
    assert (int(m.group(1)), int(m.group(2))) == (n - len(not_derived), n)
    # the equations it names are those without a derivation
    assert {t for t in re.findall(r"`([^`]+)`", m.group(3)) if t in {e.id for e in catalog.equations}} == not_derived
    assert f": {len(MODULES)} modules, {n - len(not_derived)} derived equations" in row("| 02-theory/derivations |")


def test_symbol_meanings(catalog: Catalog) -> None:
    # the loader refuses a symbol without both meanings, so every symbol has them
    n = len(catalog.symbols)
    assert f"| ✅ {n} of {n};" in row("| Symbol meanings:")


def test_references() -> None:
    entries = bib.load()
    verified = sum(1 for e in entries if not e.is_verify)
    assert f"| ✅ {verified} of {len(entries)} verified" in row("| `references.bib` verified")


def test_examples() -> None:
    n = len(list((REPO_ROOT / "examples" / "synthetic").glob("*.yaml")))
    assert f"| ✅ {n} examples, EN and KO |" in row("| Example numbers:")


def test_pages() -> None:
    en, ko = pages("en"), pages("ko")
    assert f"| ✅ all {en + ko} pages ({en} EN, {ko} KO) |" in row("| Wording:")
    # every English page with its Korean page at the same path (modulelint compares their structure)
    paths = {loc: {p.relative_to(DOCS / loc) for p in (DOCS / loc).rglob("*") if p.suffix in (".md", ".mdx")} for loc in ("en", "ko")}
    pairs = len(paths["en"] & paths["ko"])
    pending = "no Korean page pending" if paths["en"] <= paths["ko"] else f"{len(paths['en'] - paths['ko'])} Korean page(s) pending"
    assert f"| ✅ {pairs} page pairs; {pending} |" in row("| Korean parity")
