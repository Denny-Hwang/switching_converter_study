#!/usr/bin/env python3
"""resources_check -- every external resource URL is opened and title-matched.

Collects URLs from references.bib (url / howpublished=\\url{...}) and from
resources.yaml (when present), then:

  offline (always): each resources.yaml entry has type, title, url, tags,
      level, language, retrieved (YYYY-MM-DD) and why; bib entries with a
      URL that are verified carry a `urltitle` hint or are PDFs/login pages
      explicitly marked;
  --online (CI): opens every URL and checks that the page title (<title> in
      <head>, falling back to og:title / name="title" / itemprop="name")
      contains the expected text (`urltitle` in references.bib,
      `title_match` in resources.yaml). A PDF must carry the %PDF
      signature, and its own title (document info or XMP) or the top of its
      first page must contain the expected text, as whole words, ignoring
      case and punctuation (pypdf reads the file). A bib entry's `urlquotes`
      ("a | b") must each occur in the PDF's text: the statements the site
      cites it for, confirmed in the document itself.
      Each URL is tried with an honest tool User-Agent and with a browser
      User-Agent, over HTTP/2 and HTTP/1.1 (curl), then urllib: some hosts
      reject one client and accept another.

      A 404/410, or a real page or PDF whose title does not match, fails.
      When the live host never answers with content -- timeouts,
      403/429/5xx, or a bot wall/consent page without the page title (hosts
      that block cloud runners) -- the check falls back to the most recent
      Internet Archive capture of the exact URL (Wayback CDX API), which
      must pass the same title check. Such URLs are reported as "OK
      (archived YYYY-MM-DD)", never silently as live.

This complements lychee (which checks every link on the built site): some
hosts reject lychee's HTTP/2 client, and a title match proves the URL still
points at the intended page rather than a generic landing page.

    python scripts/resources_check.py
    python scripts/resources_check.py --online
    python scripts/resources_check.py --dump KEY   # the text read from a bib entry's PDF

`--dump` prints, page by page, the text the check reads from the PDF of a
references.bib entry, so that its `urlquotes` can be copied from what the
check will search.
"""

from __future__ import annotations

import argparse
import html
import io
import json
import logging
import re
import shutil
import subprocess
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

RESOURCES = ROOT / "resources.yaml"
DATE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
RESOURCE_TYPES = {"book", "course", "video", "channel", "app-note", "article", "tool", "paper", "datasheet", "lecture", "chapter"}
TOOL_AGENT = "switching-converter-study-linkcheck/1.0 (+https://github.com/Denny-Hwang/switching_converter_study)"
CAP = 6_000_000  # bytes of a page searched for its title; some pages carry megabytes of inline script before <title>
PDF_CAP = 60_000_000  # bytes kept per response: a PDF is read whole (its cross-reference table is at the end)
PAGE1_TOP = 600  # characters (normalised) at the top of page 1 where a document shows its title
MAX_PAGES = 150  # pages read when a bib entry has urlquotes
BROWSER_AGENT = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36"
# Titles of interstitial pages served instead of content (consent walls, bot
# checks). Seeing one is inconclusive, not a mismatch.
INTERSTITIAL = ("before you continue", "just a moment", "attention required", "access denied", "are you a robot",
                "captcha", "unusual traffic", "request blocked", "robot or human", "security check")


def norm(s: str) -> str:
    return re.sub(r"\s+", " ", html.unescape(s)).strip().lower()


def loose(s: str) -> str:
    """Text for a tolerant title match: Unicode-normalised (ligatures such as
    "fi"), without soft hyphens, lower case, and every run of characters other
    than letters and digits (spaces, hyphens, quotes, line breaks) one space."""
    s = unicodedata.normalize("NFKC", html.unescape(s)).replace("\u00ad", "")
    return re.sub(r"[\W_]+", " ", s.lower()).strip()


def title_in(expect: str, text: str) -> bool:
    """True if `expect` occurs in `text` as whole words, ignoring case and
    punctuation. Text extracted from a PDF can lose or gain spaces, so an
    expectation of three words or more may also match with every space
    removed; a shorter one could then match inside other words."""
    e, t = loose(expect), loose(text)
    if not e:
        return False
    if f" {e} " in f" {t} ":
        return True
    return len(e.split()) >= 3 and e.replace(" ", "") in t.replace(" ", "")


def near(quote: str, text: str) -> str:
    """Where the longest run of a quote's consecutive words occurs in the text
    (for the log when the whole quote does not, so the wording can be read)."""
    words, t = loose(quote).split(), f" {loose(text)} "
    for n in range(len(words) - 1, 1, -1):
        for i in range(len(words) - n + 1):
            at = t.find(f" {' '.join(words[i : i + n])} ")
            if at >= 0:
                return f"{n} of its words in a row occur in: '…{t[max(0, at - 80) : at + 160].strip()}…'"
    return "no two of its words occur together"


def load_resources() -> list[dict]:
    if not RESOURCES.exists():
        return []
    import yaml  # noqa: PLC0415

    data = yaml.safe_load(RESOURCES.read_text(encoding="utf-8")) or {}
    return list(data.get("resources") or [])


def pdf_expect_error(expect: str | None) -> str | None:
    """Why an expected PDF title cannot identify the document, or None."""
    if not expect:
        return None
    if len(loose(expect).split()) < 3:
        return f"{expect!r} is too short to identify a PDF: give at least three words of its title"
    return None


def collect() -> tuple[list[dict], list[str]]:
    """(targets, offline errors). A target: {src, url, expect, kind, quotes}."""
    errors: list[str] = []
    targets: list[dict] = []
    for e in bib.load():
        url = e.url
        if not url:
            continue
        where = f"references.bib:{e.line}: {e.key}"
        expect = e.fields.get("urltitle")
        kind = e.fields.get("urlkind", "html")
        quotes = [q.strip() for q in e.fields.get("urlquotes", "").split("|") if q.strip()]
        if kind not in ("html", "pdf", "login"):
            errors.append(f"{where}: urlkind must be html|pdf|login")
        if kind in ("html", "pdf") and not expect and not e.is_verify:
            what = "page title" if kind == "html" else "the PDF's title or first page"
            errors.append(f"{where}: verified URL needs urltitle = {{...}} (text expected in {what})")
        if kind == "pdf" and (problem := pdf_expect_error(expect)):
            errors.append(f"{where}: urltitle {problem}")
        if quotes and kind != "pdf":
            errors.append(f"{where}: urlquotes are checked in PDFs only")
        for q in quotes:
            if len(loose(q).split()) < 2:
                errors.append(f"{where}: urlquotes entry {q!r} needs at least two words")
        targets.append({"src": f"bib:{e.key}", "url": url, "expect": expect, "kind": kind, "quotes": quotes})

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
        if r.get("urlkind") == "pdf" and (problem := pdf_expect_error(r.get("title_match"))):
            errors.append(f"{where}: title_match {problem}")
        if r.get("url"):
            targets.append(
                {
                    "src": f"resource:{r.get('id')}",
                    "url": r["url"],
                    "expect": r.get("title_match"),
                    "kind": r.get("urlkind", "html"),
                    "quotes": [],
                }
            )
    return targets, errors


class Fetch:
    """One HTTP attempt: status 0 means no response (network error)."""

    def __init__(self, how: str, status: int = 0, url: str = "", ctype: str = "", body: bytes = b"", error: str = ""):
        self.how, self.status, self.url, self.ctype, self.body, self.error = how, status, url, ctype, body, error

    def describe(self) -> str:
        return f"{self.how}: {self.error or f'HTTP {self.status}'}"


def _curl(url: str, agent: str, http1: bool, how: str, max_time: int = 30) -> Fetch:
    cmd = [
        "curl", "-sS", "-L", "--compressed", "--max-time", str(max_time), "--connect-timeout", "15",
        "--max-filesize", str(PDF_CAP),
        "-A", agent,
        "-H", "Accept: text/html,application/xhtml+xml,application/pdf;q=0.9,*/*;q=0.8",
        "-H", "Accept-Language: en-US,en;q=0.9",
        "-o", "-", "-w", "\n__STATUS__%{http_code} %{url_effective} %{content_type}",
    ]
    if http1:
        cmd.append("--http1.1")
    try:
        out = subprocess.run(cmd + [url], capture_output=True, timeout=max_time + 15)
    except subprocess.TimeoutExpired:
        return Fetch(how, error="timeout")
    if out.returncode != 0:
        return Fetch(how, error=(out.stderr.decode("utf-8", "replace").strip() or f"curl exit {out.returncode}")[:120])
    body, _, trailer = out.stdout.rpartition(b"\n__STATUS__")
    code, _, rest = trailer.decode("utf-8", "replace").partition(" ")
    final, _, ctype = rest.partition(" ")
    return Fetch(how, int(code), final, ctype, body[:PDF_CAP])


def _urllib(url: str, agent: str, how: str, timeout: int = 30) -> Fetch:
    req = urllib.request.Request(url, headers={"User-Agent": agent, "Accept": "text/html,application/pdf,*/*"})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return Fetch(how, resp.status, resp.geturl(), resp.headers.get("Content-Type", ""), resp.read(PDF_CAP))
    except urllib.error.HTTPError as exc:
        return Fetch(how, exc.code, url)
    except (urllib.error.URLError, OSError) as exc:
        return Fetch(how, error=str(exc)[:120])


def attempts(url: str):
    """Yield fetches of `url`, one client configuration at a time."""
    if shutil.which("curl"):
        yield _curl(url, TOOL_AGENT, False, "curl tool-UA")
        yield _curl(url, TOOL_AGENT, True, "curl tool-UA http1.1")
        yield _curl(url, BROWSER_AGENT, False, "curl browser-UA")
        yield _curl(url, BROWSER_AGENT, True, "curl browser-UA http1.1")
    yield _urllib(url, TOOL_AGENT, "urllib tool-UA")


def _text(raw: bytes) -> str:
    return html.unescape(raw.decode("utf-8", "replace")).strip()


def page_title(body: bytes) -> str:
    """The document <title> (first non-empty one in <head>, else anywhere)."""
    body = body[:CAP]
    head_end = body.find(b"</head>")
    for part in ((body[:head_end],) if head_end > 0 else ()) + (body,):
        for m in re.finditer(rb"<title[^>]*>(.*?)</title>", part, re.S | re.I):
            if m.group(1).strip():
                return _text(m.group(1))
    return ""


def title_candidates(body: bytes) -> list[str]:
    """Every title-like string a page declares: <title>, og:title, name="title",
    itemprop="name" (some sites render <title> client-side)."""
    out = [page_title(body)]
    body = body[:CAP]
    for pattern in (
        rb'<meta[^>]+property="og:title"[^>]+content="([^"]*)"',
        rb'<meta[^>]+content="([^"]*)"[^>]+property="og:title"',
        rb'<meta[^>]+name="title"[^>]+content="([^"]*)"',
        rb'<(?:meta|link)[^>]+itemprop="name"[^>]+content="([^"]*)"',
    ):
        out += [_text(m.group(1)) for m in re.finditer(pattern, body, re.S | re.I)]
    return [t for t in out if t]


class PdfSetupError(RuntimeError):
    """pypdf lacks an optional dependency it needs for this PDF (a setup
    problem, not a property of the document)."""


def pdf_texts(body: bytes, pages: int = 1) -> tuple[list[tuple[str, str]], list[str]]:
    """(titles, page texts): a PDF's document-info title and XMP titles, each
    where present, and the text of its first `pages` pages. Raises when the
    file cannot be parsed at all, and PdfSetupError when pypdf lacks an
    optional dependency."""
    from pypdf import PdfReader  # noqa: PLC0415 - only the online check needs these
    from pypdf.errors import DependencyError  # noqa: PLC0415

    # pypdf warns about every font it cannot fully decode; the result says what it could read
    logging.getLogger("pypdf").setLevel(logging.ERROR)
    titles: list[tuple[str, str]] = []
    texts: list[str] = []
    try:
        reader = PdfReader(io.BytesIO(body), strict=False)
        count = len(reader.pages)
        try:
            info = reader.metadata
            if info is not None and info.title:
                titles.append(("title", str(info.title)))
        except DependencyError:
            raise
        except Exception:  # noqa: BLE001 - a damaged info dictionary: use the pages
            pass
        try:
            xmp = reader.xmp_metadata
            for title in ((xmp.dc_title or {}).values() if xmp is not None else ()):
                titles.append(("XMP title", str(title)))
        except DependencyError:
            raise
        except Exception:  # noqa: BLE001 - damaged XMP metadata: use the pages
            pass
        for i in range(min(pages, count)):
            try:
                texts.append(reader.pages[i].extract_text() or "")
            except DependencyError:
                raise
            except Exception:  # noqa: BLE001 - one unreadable page
                texts.append("")
    except DependencyError as exc:
        raise PdfSetupError(str(exc)) from exc
    return titles, texts


def judge_pdf(t: dict, f: Fetch) -> tuple[str, str]:
    """A PDF: its own title, or the top of its first page, must contain the
    expected text (a document names itself there; other documents it lists
    further down do not count), and every quote must occur in its text."""
    quotes = t.get("quotes") or []
    try:
        titles, pages = pdf_texts(f.body, MAX_PAGES if quotes else 1)
    except PdfSetupError as exc:
        return "fail", f"{f.how}: pypdf needs an optional dependency to read this PDF ({exc}); install python[dev]"
    except Exception as exc:  # noqa: BLE001 - a damaged or truncated file
        return "inconclusive", f"{f.how}: PDF unreadable ({type(exc).__name__}: {str(exc)[:80]})"
    if not t["expect"]:
        return "ok", "(pdf)"

    def flat(text: str, n: int) -> str:
        return repr(re.sub(r"\s+", " ", text).strip()[:n])

    top = loose(pages[0] if pages else "")[:PAGE1_TOP]
    tag = f"(pdf, {len(quotes)} quotes found)" if quotes else "(pdf)"
    evidence = next((f"{where}: {flat(text, 110)}" for where, text in titles if title_in(t["expect"], text)), None)
    if evidence is None and title_in(t["expect"], top):
        e = loose(t["expect"])
        at = top.find(e)
        evidence = f"top of page 1: '…{top[max(0, at - 30) : at + len(e) + 30] if at >= 0 else e}…'"
    if evidence is None:
        if not titles and not top:
            return "inconclusive", f"{f.how}: a PDF with no title and no extractable text"
        seen = "; ".join([f"{where}: {flat(text, 90)}" for where, text in titles[:2]] + [f"top of page 1: {top[:90]!r}"])
        return "fail", f"{f.how}: neither the PDF's title nor the top of its first page contains {t['expect']!r} ({seen})"
    if quotes:
        full = " ".join(pages)
        missing = [q for q in quotes if not title_in(q, full)]
        if missing:
            where = "; ".join(f"{q!r}: {near(q, full)}" for q in missing)
            return "fail", f"{f.how}: {evidence}; not in the PDF's text ({len(pages)} pages read): {where}"
    return "ok", f"{tag} {evidence}"


def judge(t: dict, f: Fetch) -> tuple[str, str]:
    """('ok' | 'fail' | 'inconclusive', detail) for one fetch of target t."""
    if f.status in (404, 410):
        return "fail", f"HTTP {f.status} (gone)"
    if f.status != 200:
        return "inconclusive", f.describe()
    if t["kind"] == "pdf" or "pdf" in f.ctype:
        if b"%PDF" in f.body[:1024]:
            return judge_pdf(t, f)
        return "inconclusive", f"{f.how}: expected a PDF, got {f.ctype or 'unknown type'} from {f.url}"
    title = page_title(f.body)
    if t["kind"] == "login":
        return "ok", title
    for cand in title_candidates(f.body):
        if t["expect"] and norm(t["expect"]) in norm(cand):
            return "ok", cand
    if not title or any(w in norm(title) for w in INTERSTITIAL):
        snippet = re.sub(rb"\s+", b" ", f.body[:160]).decode("utf-8", "replace")
        return "inconclusive", f"{f.how}: no page title (title {title!r}, final URL {f.url}, body starts {snippet!r})"
    return "fail", f"{f.how}: page title {title!r} does not contain {t['expect']!r} (final URL {f.url})"


def _slow_get(url: str, how: str, tries: int = 3) -> Fetch:
    """GET from the Internet Archive, which can take a minute to answer."""
    f = Fetch(how, error="not tried")
    for i in range(tries):
        f = _curl(url, TOOL_AGENT, False, how, max_time=90) if shutil.which("curl") else _urllib(url, TOOL_AGENT, how, 90)
        if f.status == 200 or f.status in (404, 410):
            return f
        time.sleep(5 * (i + 1))
    return f


def latest_capture(url: str) -> tuple[str, str] | None:
    """(timestamp, original URL) of the most recent HTTP-200 capture, or None."""
    q = urllib.parse.urlencode({"url": url, "output": "json", "fl": "timestamp,original",
                                "filter": "statuscode:200", "limit": "-1"})
    cdx = _slow_get("https://web.archive.org/cdx/search/cdx?" + q, "wayback cdx")
    if cdx.status == 200:
        try:
            rows = json.loads(cdx.body.decode("utf-8") or "[]")
        except ValueError:
            rows = []
        if len(rows) >= 2:
            return rows[-1][0], rows[-1][1]
    avail = _slow_get("https://archive.org/wayback/available?" + urllib.parse.urlencode({"url": url}), "wayback available")
    if avail.status == 200:
        try:
            snap = json.loads(avail.body.decode("utf-8")).get("archived_snapshots", {}).get("closest") or {}
        except ValueError:
            snap = {}
        if snap.get("available") and str(snap.get("status")) == "200":
            return str(snap["timestamp"]), url
    return None


def archived(t: dict) -> tuple[str, str]:
    """Check the latest Internet Archive capture (HTTP 200) of the exact URL."""
    found = latest_capture(t["url"])
    if not found:
        return "fail", "no Internet Archive capture found (or the archive did not answer)"
    stamp, original = found
    snap = _slow_get(f"https://web.archive.org/web/{stamp}id_/{original}", "wayback capture")
    verdict, detail = judge(t, snap)
    when = f"{stamp[0:4]}-{stamp[4:6]}-{stamp[6:8]}"
    if verdict == "ok":
        return "ok", f"archived {when}: {detail}"
    return "fail", f"archive capture {when}: {detail}"


def check_online(t: dict) -> tuple[str, str]:
    """('OK' | 'OK (archived)' | 'FAIL', detail).

    OK as soon as one client configuration gets the expected page. A
    conclusive failure (404/410, or a real page with another title) from any
    configuration fails the URL; only when every configuration was
    inconclusive does the archive decide."""
    notes: list[str] = []
    failed = False
    for f in attempts(t["url"]):
        verdict, detail = judge(t, f)
        if verdict == "ok":
            return "OK", detail
        notes.append(detail)
        failed = failed or verdict == "fail"
        time.sleep(1)
    if failed:
        return "FAIL", " | ".join(notes)
    verdict, detail = archived(t)
    if verdict == "ok":
        return "OK (archived)", f"{detail}; live: " + " | ".join(notes)
    return "FAIL", f"{detail}; live: " + " | ".join(notes)


def dump(key: str, targets: list[dict]) -> bool:
    """Print the text the check reads from a bib entry's PDF, page by page."""
    t = next((x for x in targets if x["src"] == f"bib:{key}"), None)
    if t is None:
        print(f"--- {key}: no bib entry with a URL", flush=True)
        return False
    fetches = list(attempts(t["url"]))
    if not any(f.status == 200 and b"%PDF" in f.body[:1024] for f in fetches):
        # the host does not answer this runner: its latest Internet Archive capture, as the check falls back to
        if found := latest_capture(t["url"]):
            stamp, original = found
            fetches.append(_slow_get(f"https://web.archive.org/web/{stamp}id_/{original}", f"wayback capture {stamp[:8]}"))
    for f in fetches:
        if f.status == 200 and b"%PDF" in f.body[:1024]:
            _, pages = pdf_texts(f.body, MAX_PAGES)
            print(f"--- {key}: {t['url']} ({f.how}, {len(pages)} pages read)", flush=True)
            for i, text in enumerate(pages, 1):
                print(f"--- {key}: page {i}\n{text}", flush=True)
            return True
    print(f"--- {key}: no PDF from {t['url']} ({'; '.join(f.describe() for f in fetches)})", flush=True)
    return False


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--online", action="store_true", help="open every URL and match its title")
    ap.add_argument("--dump", action="append", default=[], metavar="KEY",
                    help="print the text read from the PDF of this references.bib entry (repeatable)")
    args = ap.parse_args()

    targets, errors = collect()
    if args.dump:
        return 0 if all([dump(k, targets) for k in args.dump]) else 1
    archived_ok = []
    if args.online:
        for t in targets:
            status, detail = check_online(t)
            print(f"  {status:14s} {t['src']:32s} {t['url']}  {detail[:200]}", flush=True)
            if status == "FAIL":
                errors.append(f"{t['src']}: {detail} ({t['url']})")
            elif status != "OK":
                archived_ok.append(t["src"])
            time.sleep(0.5)
        if archived_ok:
            print(f"resources_check: {len(archived_ok)} URL(s) unreachable from this runner, confirmed from their "
                  f"latest Internet Archive capture: {', '.join(archived_ok)}")

    if errors:
        print(f"resources_check: {len(errors)} error(s)", file=sys.stderr)
        for e in errors:
            print("  " + e, file=sys.stderr)
        return 1
    print(f"resources_check: OK ({len(targets)} URLs{', opened and title-matched' if args.online else ' (offline checks)'})")
    return 0


if __name__ == "__main__":
    sys.exit(main())
