#!/usr/bin/env python3
"""resources_check -- every external resource URL is opened and title-matched.

Collects URLs from references.bib (url / howpublished=\\url{...}) and from
resources.yaml (when present), then:

  offline (always): each resources.yaml entry has type, title, url, tags,
      level, language, retrieved (YYYY-MM-DD) and why; bib entries with a
      URL that are verified carry a `urltitle` hint or are PDFs/login pages
      explicitly marked;
  --online (CI): opens every URL over HTTP/1.1 (urllib), requires HTTP 200,
      and checks that the page <title> contains the expected text
      (`urltitle` in references.bib, `title_match` in resources.yaml); for
      PDFs checks the %PDF signature instead.

This complements lychee (which checks every link on the built site): some
hosts reject lychee's HTTP/2 client, and a title match proves the URL still
points at the intended page rather than a generic landing page.

    python scripts/resources_check.py
    python scripts/resources_check.py --online
"""

from __future__ import annotations

import argparse
import html
import re
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "python"))

from pe_core import bib  # noqa: E402

RESOURCES = ROOT / "resources.yaml"
DATE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
RESOURCE_TYPES = {"book", "course", "video", "channel", "app-note", "tool", "paper", "datasheet", "lecture", "chapter"}
USER_AGENT = (
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36 "
    "switching-converter-study-resources-check/1.0"
)


def norm(s: str) -> str:
    return re.sub(r"\s+", " ", html.unescape(s)).strip().lower()


def load_resources() -> list[dict]:
    if not RESOURCES.exists():
        return []
    import yaml  # noqa: PLC0415

    data = yaml.safe_load(RESOURCES.read_text(encoding="utf-8")) or {}
    return list(data.get("resources") or [])


def collect() -> tuple[list[dict], list[str]]:
    """(targets, offline errors). A target: {src, url, expect, kind}."""
    errors: list[str] = []
    targets: list[dict] = []
    for e in bib.load():
        url = e.url
        if not url:
            continue
        expect = e.fields.get("urltitle")
        kind = e.fields.get("urlkind", "html")
        if kind not in ("html", "pdf", "login"):
            errors.append(f"references.bib:{e.line}: {e.key}: urlkind must be html|pdf|login")
        if kind == "html" and not expect and not e.is_verify:
            errors.append(f"references.bib:{e.line}: {e.key}: verified URL needs urltitle = {{...}} (expected page title text)")
        targets.append({"src": f"bib:{e.key}", "url": url, "expect": expect, "kind": kind})

    ids: set[str] = set()
    for i, r in enumerate(load_resources()):
        where = f"resources.yaml: resources[{i}] ({r.get('id', '?')})"
        for field in ("id", "type", "title", "url", "tags", "level", "language", "retrieved", "why", "title_match"):
            if not r.get(field):
                errors.append(f"{where}: missing {field}")
        if r.get("id") in ids:
            errors.append(f"{where}: duplicate id")
        ids.add(r.get("id"))
        if r.get("type") and r["type"] not in RESOURCE_TYPES:
            errors.append(f"{where}: type must be one of {sorted(RESOURCE_TYPES)}")
        if r.get("retrieved") and not DATE.match(str(r["retrieved"])):
            errors.append(f"{where}: retrieved must be YYYY-MM-DD")
        if r.get("language") and r["language"] not in ("en", "ko"):
            errors.append(f"{where}: language must be en or ko")
        if r.get("url"):
            targets.append(
                {"src": f"resource:{r.get('id')}", "url": r["url"], "expect": r.get("title_match"), "kind": r.get("urlkind", "html")}
            )
    return targets, errors


def fetch(url: str, tries: int = 3) -> tuple[int, str, bytes]:
    last: Exception | None = None
    for attempt in range(tries):
        req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT, "Accept": "text/html,application/pdf,*/*"})
        try:
            with urllib.request.urlopen(req, timeout=40) as resp:
                return resp.status, resp.headers.get("Content-Type", ""), resp.read(400_000)
        except urllib.error.HTTPError as exc:
            if exc.code in (404, 410):
                return exc.code, "", b""
            last = exc
        except (urllib.error.URLError, TimeoutError, ConnectionError) as exc:
            last = exc
        time.sleep(3 * (attempt + 1))
    raise RuntimeError(f"{url}: {last}")


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--online", action="store_true", help="open every URL and match its title")
    args = ap.parse_args()

    targets, errors = collect()
    if args.online:
        seen: dict[str, str] = {}
        for t in targets:
            url = t["url"]
            try:
                status, ctype, body = fetch(url)
            except RuntimeError as exc:
                errors.append(f"{t['src']}: {exc}")
                continue
            if status != 200:
                errors.append(f"{t['src']}: HTTP {status} for {url}")
                continue
            if t["kind"] == "pdf" or "pdf" in ctype:
                ok = body.startswith(b"%PDF") or "pdf" in ctype
                title = "(pdf)"
            else:
                m = re.search(rb"<title[^>]*>(.*?)</title>", body, re.S | re.I)
                title = html.unescape(m.group(1).decode("utf-8", "replace")).strip() if m else ""
                if t["kind"] == "login":
                    ok = True
                else:
                    ok = bool(t["expect"]) and norm(t["expect"]) in norm(title)
            status_txt = "OK" if ok else "TITLE MISMATCH"
            print(f"  {status_txt:14s} {t['src']:32s} {url}  <title>{title[:80]}</title>")
            if not ok:
                errors.append(f"{t['src']}: page title {title!r} does not contain {t['expect']!r} ({url})")
            seen[url] = title
            time.sleep(0.5)

    if errors:
        print(f"resources_check: {len(errors)} error(s)", file=sys.stderr)
        for e in errors:
            print("  " + e, file=sys.stderr)
        return 1
    print(f"resources_check: OK ({len(targets)} URLs{', opened and title-matched' if args.online else ' (offline checks)'})")
    return 0


if __name__ == "__main__":
    sys.exit(main())
