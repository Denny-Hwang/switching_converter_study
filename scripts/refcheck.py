#!/usr/bin/env python3
"""refcheck -- citation integrity (CLAUDE.md rule 3).

Offline checks (always):
  * references.bib parses (strict) and every entry has a note that either
    records its verification ("verified YYYY-MM-DD ...") or flags it VERIFY;
  * every cite key used by equations.yaml or by a published page
    (<Cite key="...">) exists and is not flagged VERIFY;
  * resources.yaml (when present) only references existing keys.

Online checks (--online; run in CI where the network is open):
  * every DOI resolves in Crossref and the Crossref title matches the
    references.bib title; volume/issue/pages/year mismatches are reported;
  * with --strict-online, those metadata mismatches are errors too.

    python scripts/refcheck.py
    python scripts/refcheck.py --online
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import time
import unicodedata
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "python"))

from pe_core import bib  # noqa: E402
from pe_core.equations import load as load_equations  # noqa: E402

DOCS = ROOT / "src" / "content" / "docs"
VERIFIED_NOTE = re.compile(r"\bverified \d{4}-\d{2}-\d{2}\b")
USER_AGENT = "switching-converter-study-refcheck/1.0 (+https://github.com/Denny-Hwang/switching_converter_study)"


def norm(s: str) -> str:
    s = unicodedata.normalize("NFKD", s)
    s = "".join(c for c in s if not unicodedata.combining(c))
    s = re.sub(r"<[^>]+>", " ", s)  # Crossref titles may carry markup
    return re.sub(r"[^a-z0-9]+", " ", s.lower()).strip()


def page_citations() -> list[tuple[str, str]]:
    """(key, where) for every <Cite key="..."> on a published page."""
    out = []
    for path in sorted(DOCS.rglob("*")):
        if path.suffix not in (".md", ".mdx") or "scratch" in path.parts:
            continue
        text = path.read_text(encoding="utf-8")
        for m in re.finditer(r"<Cite\b[^>]*\bkey\s*=\s*\"([^\"]+)\"", text):
            out.append((m.group(1), f"{path.relative_to(ROOT)}:{text.count(chr(10), 0, m.start()) + 1}"))
        for m in re.finditer(r"<Cite\b(?![^>]*\bkey\s*=\s*\")[^>]*>", text):
            out.append(("<non-literal>", f"{path.relative_to(ROOT)}:{text.count(chr(10), 0, m.start()) + 1}"))
    return out


def resource_keys() -> list[tuple[str, str]]:
    path = ROOT / "resources.yaml"
    if not path.exists():
        return []
    import yaml  # noqa: PLC0415 - optional dependency path

    data = yaml.safe_load(path.read_text(encoding="utf-8")) or {}
    out = []
    for i, r in enumerate(data.get("resources") or []):
        if r.get("cite"):
            out.append((str(r["cite"]), f"resources.yaml: resources[{i}]"))
    return out


def fetch_json(url: str, tries: int = 4) -> dict | None:
    for attempt in range(tries):
        req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT, "Accept": "application/json"})
        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                return json.loads(resp.read().decode("utf-8"))
        except urllib.error.HTTPError as exc:
            if exc.code == 404:
                return None
            if attempt == tries - 1:
                raise
        except (urllib.error.URLError, TimeoutError):
            if attempt == tries - 1:
                raise
        time.sleep(2 ** (attempt + 1))
    return None


def online_check(entries: list[bib.Entry], strict: bool) -> tuple[list[str], list[str]]:
    errors: list[str] = []
    warnings: list[str] = []
    for e in entries:
        doi = e.doi
        if not doi:
            continue
        data = fetch_json("https://api.crossref.org/works/" + urllib.parse.quote(doi, safe="/"))
        if data is None:
            errors.append(f"{e.key}: DOI {doi} not found in Crossref")
            continue
        msg = data.get("message", {})
        titles = msg.get("title") or []
        want = norm(bib.plain(e.fields["title"]))
        got = norm(titles[0]) if titles else ""
        status = "OK"
        if not got or (want != got and not got.startswith(want) and not want.startswith(got)):
            errors.append(f"{e.key}: Crossref title {titles!r} does not match references.bib title {e.fields['title']!r}")
            status = "TITLE MISMATCH"
        checks = []
        f = e.fields
        if "volume" in f and msg.get("volume") and str(msg["volume"]) != f["volume"]:
            checks.append(f"volume {msg['volume']} != {f['volume']}")
        if "number" in f and e.type == "article" and msg.get("issue") and str(msg["issue"]) != f["number"]:
            checks.append(f"issue {msg['issue']} != {f['number']}")
        if "pages" in f and msg.get("page"):
            if msg["page"].replace("--", "-").replace("–", "-") != f["pages"].replace("--", "-"):
                checks.append(f"pages {msg['page']} != {f['pages']}")
        year_src = msg.get("published-print") or msg.get("issued") or {}
        parts = (year_src.get("date-parts") or [[None]])[0]
        if "year" in f and parts and parts[0] and str(parts[0]) != f["year"]:
            checks.append(f"year {parts[0]} != {f['year']}")
        for c in checks:
            (errors if strict else warnings).append(f"{e.key}: Crossref {c}")
        print(f"  {e.key:24s} doi:{doi:40s} {status}{' (' + '; '.join(checks) + ')' if checks else ''}")
        time.sleep(0.3)  # be polite to the public API
    return errors, warnings


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--online", action="store_true", help="check DOIs against Crossref")
    ap.add_argument("--strict-online", action="store_true", help="treat metadata mismatches as errors")
    args = ap.parse_args()

    errors: list[str] = []
    warnings: list[str] = []
    try:
        entries = bib.load()
    except bib.BibError as exc:
        print(f"refcheck: {exc}", file=sys.stderr)
        return 1
    by_key = {e.key: e for e in entries}

    for e in entries:
        if not e.is_verify and not VERIFIED_NOTE.search(e.note):
            errors.append(f"references.bib:{e.line}: {e.key}: note must record 'verified YYYY-MM-DD (...)' or contain VERIFY")
        try:
            bib.to_json(e)
        except bib.BibError as exc:
            errors.append(f"references.bib:{e.line}: {e.key}: {exc}")

    uses: list[tuple[str, str]] = []
    for eq in load_equations().equations:
        for c in eq.cites:
            uses.append((c["key"], f"equations.yaml:{eq.line} ({eq.id})"))
    uses += page_citations()
    uses += resource_keys()

    used: set[str] = set()
    for key, where in uses:
        if key == "<non-literal>":
            errors.append(f"{where}: <Cite> needs a literal key=\"...\" attribute")
            continue
        used.add(key)
        if key not in by_key:
            errors.append(f"{where}: unknown citation key {key!r}")
        elif by_key[key].is_verify:
            errors.append(f"{where}: cites {key!r}, which is flagged VERIFY in references.bib")

    pending = [e.key for e in entries if e.is_verify]
    unused = sorted(set(by_key) - used)

    if args.online or args.strict_online:
        print("refcheck --online: Crossref DOI check")
        try:
            e2, w2 = online_check(entries, strict=args.strict_online)
        except Exception as exc:  # noqa: BLE001 - network failure is reported, not hidden
            print(f"refcheck: online check failed: {exc}", file=sys.stderr)
            return 1
        errors += e2
        warnings += w2

    for w in warnings:
        print(f"  warning: {w}")
    if pending:
        print(f"refcheck: {len(pending)} entr{'y' if len(pending) == 1 else 'ies'} flagged VERIFY (not citable): {', '.join(pending)}")
    if unused:
        print(f"refcheck: {len(unused)} entr{'y' if len(unused) == 1 else 'ies'} not cited yet: {', '.join(unused)}")
    if errors:
        print(f"refcheck: {len(errors)} error(s)", file=sys.stderr)
        for e in errors:
            print("  " + e, file=sys.stderr)
        return 1
    print(f"refcheck: OK ({len(entries)} entries, {len(uses)} citations checked)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
