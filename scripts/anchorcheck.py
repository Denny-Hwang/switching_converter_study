#!/usr/bin/env python3
"""anchorcheck -- every internal link with a #fragment lands on an element id.

lychee (CI job "site") checks that every link target exists; this script
checks the part it does not: that a link such as
/switching_converter_study/en/02-theory/derivations/#deriv-dcm or
../10-resources/bibliography/#erickson2020 points at an element that
actually carries that id in the built page (equation anchors, derivation
sections, bibliography entries, headings).

Links into the tool pages are skipped: their hash holds the tool's state
(#eq=...&D=0.5, src/lib/useStateHash.ts), not an anchor.

    npm run build && python scripts/anchorcheck.py [dist]
"""

from __future__ import annotations

import sys
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import unquote, urljoin, urlsplit

ROOT = Path(__file__).resolve().parents[1]
BASE = "/switching_converter_study"
STATE_HASH_PAGES = (
    "/design/explorer/",
    "/simulate/simulator/",
    "/design/converter-designer/",
    "/design/magnetics-designer/",
    "/design/loss-budget/",
    "/design/clamp-check/",
    "/design/source-matcher/",
    "/design/sense-chain/",
)


class Page(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.ids: set[str] = set()
        self.links: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        a = dict(attrs)
        if a.get("id"):
            self.ids.add(a["id"])
        if tag == "a" and a.get("name"):
            self.ids.add(a["name"])
        if tag == "a" and a.get("href"):
            self.links.append(a["href"])


def url_of(dist: Path, file: Path) -> str:
    rel = file.relative_to(dist).as_posix()
    rel = rel[: -len("index.html")] if rel.endswith("index.html") else rel
    return f"{BASE}/{rel}"


def main() -> int:
    dist = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / "dist"
    if not dist.is_dir():
        print(f"anchorcheck: {dist} not found; run `npm run build` first", file=sys.stderr)
        return 1
    pages: dict[str, Page] = {}
    for file in sorted(dist.rglob("*.html")):
        page = Page()
        page.feed(file.read_text(encoding="utf-8"))
        pages[url_of(dist, file)] = page

    errors: list[str] = []
    checked = 0
    for url, page in pages.items():
        for href in page.links:
            target = urlsplit(urljoin(f"https://pages.invalid{url}", href))
            if target.netloc != "pages.invalid" or not target.fragment:
                continue
            path = target.path if target.path.endswith((".html", "/")) else target.path + "/"
            if any(path.endswith(p) for p in STATE_HASH_PAGES):
                continue
            checked += 1
            dest = pages.get(path)
            fragment = unquote(target.fragment)
            if dest is None:
                errors.append(f"{url}: link {href!r} -> page {path} does not exist")
            elif fragment not in dest.ids:
                errors.append(f"{url}: link {href!r} -> no element with id {fragment!r} on {path}")

    if errors:
        print(f"anchorcheck: {len(errors)} broken fragment link(s)", file=sys.stderr)
        for e in sorted(set(errors)):
            print("  " + e, file=sys.stderr)
        return 1
    print(f"anchorcheck: OK ({checked} fragment links on {len(pages)} pages)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
