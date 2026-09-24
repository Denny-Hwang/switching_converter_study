"""The lint scripts' own rules, tested on small inputs."""

from __future__ import annotations

import importlib.util
import json
import sys
import threading
import time
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[3]


def _script(name: str):
    spec = importlib.util.spec_from_file_location(name, ROOT / "scripts" / f"{name}.py")
    mod = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(mod)
    return mod


@pytest.mark.parametrize(
    "text",
    ["12 V", "3.3µH", "100 kHz", "10 mΩ", "1 MΩ", "-40 °C", "1e5 Hz", "2.5E-3 A", "100 ohms"],
)
def test_privacy_scan_finds_numbers_with_units(text: str) -> None:
    assert _script("privacy_scan").NUM_UNIT.search(f"a value of {text} here")


@pytest.mark.parametrize("text", ["5 V에서 읽습니다", "0.33 µF로 줄어듭니다", "25 °C에서", "정격 6.3 V인", "10 mΩ을 넘는"])
def test_privacy_scan_finds_numbers_with_units_before_korean_particles(text: str) -> None:
    assert _script("privacy_scan").NUM_UNIT.search(text)


@pytest.mark.parametrize("text", ["D = 0.5", "K_crit", "V_g", "the 2nd edition", "Ch. 5", "4/27", "x1e5", "3 Hzx", "2차 고조파"])
def test_privacy_scan_ignores_unitless_text(text: str) -> None:
    assert not _script("privacy_scan").NUM_UNIT.search(text)


@pytest.mark.parametrize(
    ("body", "hand"),
    [
        ("M = D", True),
        ("K = 2L/(R T_s)", True),
        ("D = 0.25", False),
        ("R_L = 0.1\\,\\Omega", False),
        ("L_M = 50\\,\\mu\\mathrm{H}", False),
        ("K > K_\\mathrm{crit}", False),
        ("\\omega_0 = 1/\\sqrt{LC}", True),
    ],
)
def test_mathlint_hand_equation(body: str, hand: bool) -> None:
    assert _script("mathlint").is_hand_equation(body) is hand


@pytest.mark.parametrize(
    ("expect", "text", "found"),
    [
        # case, punctuation and line breaks do not matter
        ("Bidirectional, Low- and High-Side Voltage Output, Current-Sense Amplifiers",
         "INAx181 Bidirectional, Low- and High-Side\nVoltage Output, Current-\nSense Amplifiers", True),
        # a curly apostrophe, a ligature, a soft hyphen
        ("Basic Calculation of a Buck Converter's Power Stage", "Basic Calculation of a Buck Converter’s Power Stage", True),
        ("Output Ripple Voltage for Buck Switching Regulator", "Output Ripple Voltage for Buck Switching Regu­lator", True),
        ("Sensor Design for Inductive Sensing", "LDC Sensor Design for Inductive Sensing Applications", True),
        ("Fundamentals of Filters", "Fundamentals of ﬁlters", True),
        # text extracted from a PDF can lose or gain spaces
        ("Switchmode Power Supplies", "Understanding Buck Power Stages in Switch Mode Power Supplies", True),
        ("What the Nyquist Criterion Means", "WhattheNyquistCriterionMeans to Your Sampled Data System Design", True),
        # another document
        ("TVS clamping protection mode", "Transil clamping protection mode", False),
        ("Snubbing the flyback converter", "Snubbing the forward converter", False),
        # whole words only: a short expectation must not match inside other words
        ("LDC", "You should consider the layout", False),
        ("Sensor Design", "LDC Sensor Designs", False),
        ("", "anything", False),
    ],
)
def test_resources_check_title_in(expect: str, text: str, found: bool) -> None:
    assert _script("resources_check").title_in(expect, text) is found


def _minimal_pdf(title: str, text: str, later: str = "") -> bytes:
    """A one-page PDF with a document-info title, one line of Helvetica text
    at the top, and optionally a second line further down the page."""
    stream = f"BT /F1 12 Tf 72 720 Td ({text}) Tj ET".encode()
    if later:
        stream += f"\nBT /F1 12 Tf 72 100 Td ({later}) Tj ET".encode()
    objects = [
        b"<< /Type /Catalog /Pages 2 0 R >>",
        b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
        b"<< /Length %d >>\nstream\n" % len(stream) + stream + b"\nendstream",
        f"<< /Title ({title}) >>".encode(),
    ]
    out = b"%PDF-1.4\n"
    offsets = []
    for i, body in enumerate(objects, 1):
        offsets.append(len(out))
        out += b"%d 0 obj\n" % i + body + b"\nendobj\n"
    xref = len(out)
    out += b"xref\n0 %d\n0000000000 65535 f \n" % (len(objects) + 1)
    out += b"".join(b"%010d 00000 n \n" % off for off in offsets)
    out += b"trailer\n<< /Size %d /Root 1 0 R /Info 6 0 R >>\nstartxref\n%d\n%%%%EOF\n" % (len(objects) + 1, xref)
    return out


def test_resources_check_reads_a_pdf_title_and_first_page() -> None:
    rc = _script("resources_check")
    pdf = _minimal_pdf("Snubbing the flyback converter", "Technical Article Snubbing the flyback converter")
    titles, pages = rc.pdf_texts(pdf)
    assert dict(titles)["title"] == "Snubbing the flyback converter"
    assert "Snubbing the flyback converter" in pages[0]

    def judge(expect: str, body: bytes = pdf, quotes: tuple[str, ...] = ()) -> tuple[str, str]:
        fetch = rc.Fetch("test", 200, "https://example.org/a.pdf", "application/pdf", body)
        return rc.judge({"src": "bib:test", "url": fetch.url, "expect": expect, "kind": "pdf", "quotes": list(quotes)}, fetch)

    assert judge("Snubbing the flyback converter")[0] == "ok"
    # the right file type is not enough: another document's title fails
    verdict, detail = judge("Snubbing the forward converter")
    assert verdict == "fail"
    assert "Snubbing the flyback converter" in detail
    # only the text on the page (the info title says something else)
    assert judge("Technical Article")[0] == "ok"
    # not a PDF, or a PDF cut short: inconclusive (the Internet Archive decides)
    assert judge("Snubbing", b"<html><title>Log in</title></html>")[0] == "inconclusive"
    assert judge("Snubbing", pdf[:60])[0] == "inconclusive"


def test_resources_check_takes_a_pdf_title_from_its_title_or_the_top_of_page_1_only() -> None:
    """A document that lists another document's title further down its first
    page (a list of related documents) is not that document."""
    rc = _script("resources_check")
    filler = " ".join(["Introduction to the topic of this note."] * 25)
    pdf = _minimal_pdf("Understanding Boost Power Stages", f"Understanding Boost Power Stages. {filler}",
                       later="Related documents: Understanding Buck Power Stages in Switchmode Power Supplies")
    fetch = rc.Fetch("test", 200, "https://example.org/b.pdf", "application/pdf", pdf)

    def verdict(expect: str) -> str:
        return rc.judge({"src": "bib:test", "url": fetch.url, "expect": expect, "kind": "pdf", "quotes": []}, fetch)[0]

    assert verdict("Understanding Boost Power Stages") == "ok"
    assert verdict("Understanding Buck Power Stages in Switchmode Power Supplies") == "fail"


def test_resources_check_confirms_quotes_in_the_pdf_text() -> None:
    rc = _script("resources_check")
    pdf = _minimal_pdf("Snubbing the flyback converter", "Technical Article Snubbing the flyback converter",
                       later="The clamp absorbs more than the leakage energy.")
    fetch = rc.Fetch("test", 200, "https://example.org/c.pdf", "application/pdf", pdf)

    def judge(*quotes: str) -> tuple[str, str]:
        return rc.judge({"src": "bib:t", "url": fetch.url, "expect": "Snubbing the flyback converter", "kind": "pdf",
                         "quotes": list(quotes)}, fetch)

    verdict, detail = judge("absorbs more than the leakage energy", "technical article")
    assert verdict == "ok" and "2 quotes found" in detail
    # a statement the document does not make fails, and the log shows where its first words occur
    verdict, detail = judge("absorbs less than the leakage energy")
    assert verdict == "fail"
    assert "4 of its words in a row occur in" in detail and "absorbs more than the leakage energy" in detail


def test_resources_check_online_checks_urls_at_once_and_reports_in_order(monkeypatch, capsys) -> None:
    rc = _script("resources_check")
    targets = [{"src": f"bib:k{i}", "url": f"https://example.org/{i}", "expect": "x", "kind": "html", "quotes": []}
               for i in range(12)]
    monkeypatch.setattr(rc, "collect", lambda: (targets, []))
    lock, active, peak = threading.Lock(), [0], [0]

    def check(t: dict) -> tuple[str, str]:
        with lock:
            active[0] += 1
            peak[0] = max(peak[0], active[0])
        time.sleep(0.01 * (12 - int(t["url"].rsplit("/", 1)[1])))  # the later URLs answer first
        with lock:
            active[0] -= 1
        return ("FAIL", "HTTP 404 (gone)") if t["src"] == "bib:k3" else ("OK", "fine")

    monkeypatch.setattr(rc, "check_online", check)
    monkeypatch.setattr(sys, "argv", ["resources_check.py", "--online"])
    assert rc.main() == 1
    out, err = capsys.readouterr()
    assert [line.split()[1] for line in out.splitlines() if line.startswith("  ")] == [t["src"] for t in targets]
    assert peak[0] > 1
    assert "bib:k3: HTTP 404 (gone) (https://example.org/3)" in err


def test_resources_check_takes_a_pdf_from_the_archive_before_a_later_web_page(monkeypatch) -> None:
    rc = _script("resources_check")
    asked: list[str] = []

    def cdx(rows: list[list[str]]) -> bytes:
        return json.dumps([["timestamp", "original"], *rows]).encode()

    def slow_get(url: str, how: str, tries: int = 3):
        asked.append(url)
        if "mimetype" in url:  # the PDF captures: an older one
            return rc.Fetch(how, 200, url, "application/json", cdx([["20230101000000", "https://example.org/a.pdf"]]))
        return rc.Fetch(how, 200, url, "application/json", cdx([["20241125000000", "https://example.org/a.pdf"]]))

    monkeypatch.setattr(rc, "_slow_get", slow_get)
    # a PDF: the latest capture stored as a PDF, although a later capture (a web page) exists
    assert rc.latest_capture("https://example.org/a.pdf", pdf=True) == ("20230101000000", "https://example.org/a.pdf")
    assert "mimetype%3Aapplication%2Fpdf" in asked[0] and "statuscode%3A200" in asked[0]
    # a web page: the latest capture, whatever its type
    asked.clear()
    assert rc.latest_capture("https://example.org/a.html") == ("20241125000000", "https://example.org/a.pdf")
    assert len(asked) == 1 and "mimetype" not in asked[0]

    # no PDF capture at all: the latest capture, which the PDF check then judges
    def no_pdf(url: str, how: str, tries: int = 3):
        asked.append(url)
        rows = [] if "mimetype" in url else [["20241125000000", "https://example.org/b.pdf"]]
        return rc.Fetch(how, 200, url, "application/json", cdx(rows))

    monkeypatch.setattr(rc, "_slow_get", no_pdf)
    asked.clear()
    assert rc.latest_capture("https://example.org/b.pdf", pdf=True) == ("20241125000000", "https://example.org/b.pdf")
    assert len(asked) == 2 and "mimetype" in asked[0] and "mimetype" not in asked[1]


def test_resources_check_confirms_quotes_in_an_html_page_text() -> None:
    rc = _script("resources_check")
    page = (
        b"<html><head><title>AN-0: Layout Notes | Example</title><script>var s = 'a ground layer in a script';</script>"
        b"<style>.x{content:'a ground layer in a style'}</style></head><body><!-- a ground layer in a comment -->"
        b"<p>It is important to always have a <b>ground&nbsp;layer</b> next to the power stage layer.</p></body></html>"
    )
    fetch = rc.Fetch("test", 200, "https://example.org/an-0.html", "text/html", page)

    def judge(*quotes: str) -> tuple[str, str]:
        return rc.judge({"src": "bib:t", "url": fetch.url, "expect": "Layout Notes", "kind": "html", "quotes": list(quotes)}, fetch)

    # the page's visible text, across its inline markup and entities
    verdict, detail = judge("always have a ground layer next to the power stage layer")
    assert verdict == "ok" and "1 quotes found" in detail
    # text only in a script, a style or a comment is not on the page
    assert rc.loose(rc.html_text(page)).count("ground layer") == 1
    verdict, detail = judge("a ground layer in a script")
    assert verdict == "fail" and "not in the page's text" in detail
    # without quotes, the title alone decides
    assert judge()[0] == "ok"


def test_resources_check_requires_a_title_for_pdf_references() -> None:
    rc = _script("resources_check")
    _, errors = rc.collect()
    assert errors == []
    kinds = {t["src"]: (t["kind"], t["expect"]) for t in rc.collect()[0]}
    pdfs = {src: expect for src, (kind, expect) in kinds.items() if kind == "pdf"}
    assert pdfs, "no PDF references found"
    for src, expect in pdfs.items():
        assert expect and rc.pdf_expect_error(expect) is None, src
    # too short to identify a PDF, or a placeholder
    for short in ("(pdf)", "LTspice", "Sensor Design"):
        assert rc.pdf_expect_error(short)


def test_modulelint_mirrors_every_block_component() -> None:
    """The Korean page must show the English page's figures, core tables and
    magnetics links too, with the same attributes in the same order."""
    ml = _script("modulelint")
    en = ml.components('<Figure name="buck" />\n<CoreKg example="kg-inductor" />\n<MagWorked example="mag-kg" />\n<TryMag example="mag-kg" />')
    assert [c for c, _ in ml.signature(en, ml.BLOCK)] == ["Figure", "CoreKg", "MagWorked", "TryMag"]
    for changed in (
        '<Figure name="buck" />\n<CoreKg example="kg-inductor" />\n<MagWorked example="mag-kg" />\n<TryMag example="mag-inductor" />',
        '<Figure name="buck" />\n<MagWorked example="mag-kg" />\n<TryMag example="mag-kg" />',
        '<CoreKg example="kg-inductor" />\n<Figure name="buck" />\n<MagWorked example="mag-kg" />\n<TryMag example="mag-kg" />',
    ):
        assert ml.signature(ml.components(changed), ml.BLOCK) != ml.signature(en, ml.BLOCK)


def test_modulelint_names_components_it_does_not_compare() -> None:
    ml = _script("modulelint")
    assert ml.unknown_components('<Eq id="x" /> <NewTable example="a" /> <Cite key="k" /> <b>bold</b>') == ["NewTable"]
    assert ml.unknown_components('<Eq id="x" /> <Val example="a" name="b" /> <em>text</em>') == []
_GOTCHA_EN = """---
title: A gotcha
description: A reading that is high.
gotcha:
  tags: [measurement]
---

<GotchaTags />

## Symptom

It reads high.

## Why

Because <EqRef id="sense.pad_error" label="pad error" />.

## How to confirm

Measure twice.

## Fix

Use four wires.

## References

- <Cite key="keithley_llmh7" />
"""

_GOTCHA_KO = """---
title: 주의할 점
description: 높게 읽히는 값.
gotcha:
  tags: [measurement]
---

<GotchaTags />

## 증상

높게 읽힙니다.

## 원인

<EqRef id="sense.pad_error" label="패드 오차" /> 때문입니다.

## 확인 방법

두 번 잽니다.

## 해결

네 선을 씁니다.

## 참고 자료

- <Cite key="keithley_llmh7" />
"""


_GOTCHA_INDEX = '---\ntitle: Index\n---\n\n<GotchaIndex part="list" />\n\n## By tag\n\n<GotchaIndex part="tags" />\n'


def _gotcha_tree(tmp_path: Path, en: str, ko: str | None, index: str = _GOTCHA_INDEX) -> Path:
    for locale in ("en", "ko"):
        d = tmp_path / "src" / "content" / "docs" / locale / "08-gotchas"
        d.mkdir(parents=True)
        (d / "index.mdx").write_text(index, encoding="utf-8")
    (tmp_path / "src/content/docs/en/08-gotchas/x.mdx").write_text(en, encoding="utf-8")
    if ko is not None:
        (tmp_path / "src/content/docs/ko/08-gotchas/x.mdx").write_text(ko, encoding="utf-8")
    return tmp_path


def _gotcha_errors(tmp_path: Path, en: str, ko: str | None, row: dict[str, str] | None,
                   index: str = _GOTCHA_INDEX, extra: dict[str, str] | None = None,
                   more_rows: dict[str, dict[str, str]] | None = None) -> list[str]:
    lint = _script("modulelint")
    root = _gotcha_tree(tmp_path, en, ko, index)
    for rel, text in (extra or {}).items():
        path = root / "src" / "content" / "docs" / rel
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(text, encoding="utf-8")
    lint.ROOT, lint.DOCS = root, root / "src" / "content" / "docs"
    status = {("08-gotchas", "x"): row} if row is not None else {}
    status.update({("08-gotchas", slug): r for slug, r in (more_rows or {}).items()})
    errors, _ = lint.check_gotchas(status)
    return errors


def test_modulelint_accepts_a_gotcha_page_and_its_mirror(tmp_path: Path) -> None:
    assert _gotcha_errors(tmp_path, _GOTCHA_EN, _GOTCHA_KO, {"EN": "✅", "KO": "✅"}) == []


@pytest.mark.parametrize(
    ("en", "ko", "row", "expect"),
    [
        # the template's sections, in order
        (_GOTCHA_EN.replace("## Why", "## Cause"), _GOTCHA_KO, {"EN": "✅", "KO": "✅"}, "h2 sections must be"),
        # a tag outside src/lib/gotchas.json
        (_GOTCHA_EN.replace("[measurement]", "[wiring]"), _GOTCHA_KO, {"EN": "✅", "KO": "✅"}, "unknown gotcha tag"),
        # no tags at all
        (_GOTCHA_EN.replace("gotcha:\n  tags: [measurement]\n", ""), _GOTCHA_KO, {"EN": "✅", "KO": "✅"}, "needs `gotcha"),
        # the tags shown before the first section
        (_GOTCHA_EN.replace("<GotchaTags />\n", ""), _GOTCHA_KO, {"EN": "✅", "KO": "✅"}, "<GotchaTags />"),
        # a References section without a source
        (_GOTCHA_EN.replace('- <Cite key="keithley_llmh7" />', "- none"), _GOTCHA_KO, {"EN": "✅", "KO": "✅"}, "cites no source"),
        # the Korean page mirrors the tags and the components
        (_GOTCHA_EN, _GOTCHA_KO.replace("[measurement]", "[sensing]"), {"EN": "✅", "KO": "✅"}, "tags"),
        (_GOTCHA_EN, _GOTCHA_KO.replace('<EqRef id="sense.pad_error" label="패드 오차" />', "패드"), {"EN": "✅", "KO": "✅"}, "inline components differ"),
        # no Korean page, and STATUS does not say it is pending
        (_GOTCHA_EN, None, {"EN": "✅", "KO": "⬜"}, "no Korean page"),
        # STATUS lists every gotcha
        (_GOTCHA_EN, _GOTCHA_KO, None, "no row for gotcha"),
        # the index shows each page's description, and each tag once
        (_GOTCHA_EN.replace("description: A reading that is high.\n", ""), _GOTCHA_KO, {"EN": "✅", "KO": "✅"}, "one-line `description`"),
        (_GOTCHA_EN.replace("[measurement]", "[measurement, measurement]"), _GOTCHA_KO, {"EN": "✅", "KO": "✅"}, "listed twice"),
        # a gotcha page is no module page
        (_GOTCHA_EN.replace("gotcha:\n", "module: true\ngotcha:\n"), _GOTCHA_KO, {"EN": "✅", "KO": "✅"}, "not a module page"),
    ],
)
def test_modulelint_gotcha_rules(tmp_path: Path, en: str, ko: str | None, row: dict[str, str] | None, expect: str) -> None:
    errors = _gotcha_errors(tmp_path, en, ko, row)
    assert any(expect in e for e in errors), errors


def test_modulelint_gotcha_pending_korean_page_is_allowed(tmp_path: Path) -> None:
    assert _gotcha_errors(tmp_path, _GOTCHA_EN, None, {"EN": "✅", "KO": "pending"}) == []


@pytest.mark.parametrize(
    ("index", "expect"),
    [
        # the list alone, or the old single embed
        ('---\ntitle: Index\n---\n\n<GotchaIndex part="list" />\n', 'must embed <GotchaIndex part="list" />'),
        ("---\ntitle: Index\n---\n\n<GotchaIndex />\n", 'must embed <GotchaIndex part="list" />'),
        # the lists by tag without an h2 of their own
        ('---\ntitle: Index\n---\n\n<GotchaIndex part="list" />\n\n<GotchaIndex part="tags" />\n', "put an h2"),
    ],
)
def test_modulelint_gotcha_index_rules(tmp_path: Path, index: str, expect: str) -> None:
    errors = _gotcha_errors(tmp_path, _GOTCHA_EN, _GOTCHA_KO, {"EN": "✅", "KO": "✅"}, index=index)
    assert any(expect in e for e in errors), errors


def test_modulelint_gotcha_page_without_its_counterparts(tmp_path: Path) -> None:
    errors = _gotcha_errors(
        tmp_path, _GOTCHA_EN, _GOTCHA_KO, {"EN": "✅", "KO": "✅"},
        # a Korean page with no English page, and a STATUS row with no page
        extra={"ko/08-gotchas/y.mdx": _GOTCHA_KO}, more_rows={"z": {"EN": "✅", "KO": "✅"}},
    )
    assert any("y.mdx: no English page of that name" in e for e in errors), errors
    assert any("gotcha row 'z' has no page" in e for e in errors), errors


def test_modulelint_gotcha_markdown_page_is_checked(tmp_path: Path) -> None:
    errors = _gotcha_errors(tmp_path, _GOTCHA_EN, _GOTCHA_KO, {"EN": "✅", "KO": "✅"},
                            extra={"en/08-gotchas/w.md": _GOTCHA_EN.replace("## Why", "## Cause")})
    assert any("w.md: h2 sections must be" in e for e in errors), errors


def test_modulelint_gotcha_page_in_a_subfolder(tmp_path: Path) -> None:
    errors = _gotcha_errors(tmp_path, _GOTCHA_EN, _GOTCHA_KO, {"EN": "✅", "KO": "✅"}, extra={"en/08-gotchas/more/w.mdx": _GOTCHA_EN})
    assert any("not in a subfolder" in e for e in errors), errors


def test_modulelint_gotcha_wrong_section_reports_only_that(tmp_path: Path) -> None:
    # a page with a wrong section is still a page: its mirror is found, and nothing else is reported
    errors = _gotcha_errors(tmp_path, _GOTCHA_EN.replace("## Why", "## Cause"), _GOTCHA_KO, {"EN": "✅", "KO": "✅"})
    assert len(errors) == 1 and "h2 sections must be" in errors[0], errors


def _resource_errors(tmp_path: Path, en_types: str, ko_types: str, row: dict[str, str] | None, resources: dict[str, dict]) -> list[str]:
    lint = _script("modulelint")
    for locale, types in (("en", en_types), ("ko", ko_types)):
        d = tmp_path / "src" / "content" / "docs" / locale / "10-resources"
        d.mkdir(parents=True)
        (d / "books.mdx").write_text(f"---\ntitle: Books\n---\n\n<ResourceTable types={{{types}}} />\n", encoding="utf-8")
    lint.ROOT, lint.DOCS = tmp_path, tmp_path / "src" / "content" / "docs"
    status = {("10-resources", "books"): row} if row is not None else {}
    return lint.check_resource_pages(status, resources)


def test_modulelint_resource_pages(tmp_path: Path) -> None:
    ok = {"a": {"type": "book"}}
    assert _resource_errors(tmp_path / "1", "['book']", "['book']", {"EN": "✅", "KO": "✅"}, ok) == []
    # the Korean page lists other types
    assert any("lists types" in e for e in _resource_errors(tmp_path / "2", "['book']", "['paper']", {"EN": "✅", "KO": "✅"}, ok))
    # a type that no page lists
    assert any("which no 10-resources page" in e for e in _resource_errors(tmp_path / "3", "['book']", "['book']", {"EN": "✅", "KO": "✅"}, {"a": {"type": "tool"}}))
    # STATUS lists the page
    assert any("needs a row" in e for e in _resource_errors(tmp_path / "4", "['book']", "['book']", None, ok))
    # a type that src/lib/resources.ts does not know, beside one it does
    assert any("unknown resource type 'bokk'" in e for e in _resource_errors(tmp_path / "5", "['book', 'bokk']", "['book', 'bokk']", {"EN": "✅", "KO": "✅"}, ok))


def _resource_tree(root: Path, pages: dict[str, str]) -> None:
    for rel, text in pages.items():
        path = root / "src" / "content" / "docs" / rel
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(text, encoding="utf-8")


def test_modulelint_resource_page_rules(tmp_path: Path) -> None:
    lint = _script("modulelint")
    ok = {"a": {"type": "book"}}
    books = "---\ntitle: Books\n---\n\n<ResourceTable types={['book']} />\n"
    row = {"EN": "✅", "KO": "✅"}

    def errors(name: str, pages: dict[str, str], status: dict, resources: dict) -> list[str]:
        root = tmp_path / name
        _resource_tree(root, pages)
        lint.ROOT, lint.DOCS = root, root / "src" / "content" / "docs"
        return lint.check_resource_pages(status, resources)

    # no resource page at all: every type still needs one
    assert any("which no 10-resources page" in e for e in errors("none", {}, {}, ok))
    # an English page without its Korean page, and a Korean page without its English one
    got = errors("mirror", {"en/10-resources/books.mdx": books, "ko/10-resources/extra.mdx": books}, {("10-resources", "books"): row}, ok)
    assert any("books.mdx: no Korean page" in e for e in got), got
    assert any("extra.mdx: no English page of that name" in e for e in got), got
    # two tables on one page
    two = books + "\n<ResourceTable types={['paper']} />\n"
    got = errors("two", {"en/10-resources/books.mdx": two, "ko/10-resources/books.mdx": two}, {("10-resources", "books"): row}, ok)
    assert any("exactly one <ResourceTable />, found 2" in e for e in got), got
    # a STATUS row without a page
    got = errors("stale", {"en/10-resources/books.mdx": books, "ko/10-resources/books.mdx": books},
                 {("10-resources", "books"): row, ("10-resources", "old"): row}, ok)
    assert any("resources row 'old' has no page" in e for e in got), got
    # a Markdown page is checked like an MDX page
    got = errors("md", {"en/10-resources/books.md": books}, {("10-resources", "books"): row}, ok)
    assert any("books.mdx: no Korean page" in e for e in got), got


def test_resources_check_validates_level_tags_and_korean_line(tmp_path: Path) -> None:
    rc = _script("resources_check")
    entry = {"id": "x", "type": "book", "title": "T", "url": "https://example.org/", "tags": ["a"], "level": "intro",
             "language": "en", "retrieved": "2026-09-24", "why": "w", "why_ko": "w", "title_match": "T"}
    import yaml

    def errors(**change) -> list[str]:
        path = tmp_path / "resources.yaml"
        path.write_text(yaml.safe_dump({"resources": [{**entry, **change}]}), encoding="utf-8")
        rc.RESOURCES = path
        return [e for e in rc.collect()[1] if "resources.yaml" in e]

    assert errors() == []
    assert any("level must be one of" in e for e in errors(level="beginner"))
    assert any("missing why_ko" in e for e in errors(why_ko=""))
    assert any("a tag is listed twice" in e for e in errors(tags=["a", "a"]))
