#!/usr/bin/env python3
"""resources_check -- every external resource URL is opened and title-matched.

Collects URLs from references.bib (url / howpublished=\\url{...}) and from
resources.yaml (when present), then:

  offline (always): each resources.yaml entry has type, title, url, tags,
      level, language, retrieved (YYYY-MM-DD) and why; bib entries with a
      URL that are verified carry a `urltitle` hint or are PDFs/login pages
      explicitly marked;
  --online (CI): opens every URL (curl with HTTP/2, then curl over HTTP/1.1,
      then urllib), requires HTTP 200, and checks that the page title
      (<title>, falling back to og:title) contains the expected text
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
import shutil
import subprocess
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
USER_AGENT = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36"


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


def _curl(url: str, http1: bool) -> tuple[int, str, bytes]:
    cmd = [
        "curl", "-sS", "-L", "--compressed", "--max-time", "45", "--connect-timeout", "20",
        "-A", USER_AGENT,
        "-H", "Accept: text/html,application/xhtml+xml,application/pdf;q=0.9,*/*;q=0.8",
        "-H", "Accept-Language: en-US,en;q=0.9",
        "-o", "-", "-w", "\n__STATUS__%{http_code} %{content_type}",
    ]
    if http1:
        cmd.append("--http1.1")
    out = subprocess.run(cmd + [url], capture_output=True, timeout=60)
    if out.returncode != 0:
        raise RuntimeError(out.stderr.decode("utf-8", "replace").strip() or f"curl exit {out.returncode}")
    body, _, trailer = out.stdout.rpartition(b"\n__STATUS__")
    code, _, ctype = trailer.decode().partition(" ")
    return int(code), ctype, body[:400_000]


def _urllib(url: str) -> tuple[int, str, bytes]:
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT, "Accept": "text/html,application/pdf,*/*"})
    try:
        with urllib.request.urlopen(req, timeout=40) as resp:
            return resp.status, resp.headers.get("Content-Type", ""), resp.read(400_000)
    except urllib.error.HTTPError as exc:
        return exc.code, "", b""


def fetch(url: str) -> tuple[int, str, bytes]:
    """curl (HTTP/2 allowed), then curl over HTTP/1.1, then urllib."""
    errors = []
    attempts = [lambda: _curl(url, False), lambda: _curl(url, True)] if shutil.which("curl") else []
    attempts.append(lambda: _urllib(url))
    for attempt in attempts:
        try:
            status, ctype, body = attempt()
            if status == 200:
                return status, ctype, body
            errors.append(f"HTTP {status}")
        except (RuntimeError, OSError, subprocess.TimeoutExpired, urllib.error.URLError) as exc:
            errors.append(str(exc)[:120])
        time.sleep(2)
    raise RuntimeError(f"{url}: " + " | ".join(errors))


def page_title(body: bytes) -> str:
    """<title>, falling back to og:title (some sites render <title> client-side)."""
    for pattern in (rb"<title[^>]*>(.*?)</title>", rb'<meta[^>]+property="og:title"[^>]+content="([^"]*)"',
                    rb'<meta[^>]+name="title"[^>]+content="([^"]*)"'):
        m = re.search(pattern, body, re.S | re.I)
        if m and m.group(1).strip():
            return html.unescape(m.group(1).decode("utf-8", "replace")).strip()
    return ""


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
            if t["kind"] == "pdf" or "pdf" in ctype:
                ok = body.startswith(b"%PDF") or "pdf" in ctype
                title = "(pdf)"
            else:
                title = page_title(body)
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
