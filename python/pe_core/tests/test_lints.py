"""The lint scripts' own rules, tested on small inputs."""

from __future__ import annotations

import importlib.util
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


@pytest.mark.parametrize("text", ["D = 0.5", "K_crit", "V_g", "the 2nd edition", "Ch. 5", "4/27", "x1e5"])
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
        ("", "anything", False),
    ],
)
def test_resources_check_title_in(expect: str, text: str, found: bool) -> None:
    assert _script("resources_check").title_in(expect, text) is found


def _minimal_pdf(title: str, text: str) -> bytes:
    """A one-page PDF with a document-info title and one line of Helvetica text."""
    stream = f"BT /F1 12 Tf 72 720 Td ({text}) Tj ET".encode()
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
    texts = dict(rc.pdf_texts(pdf))
    assert texts["title"] == "Snubbing the flyback converter"
    assert "Snubbing the flyback converter" in texts["page 1"]

    def judge(expect: str, body: bytes = pdf) -> tuple[str, str]:
        fetch = rc.Fetch("test", 200, "https://example.org/a.pdf", "application/pdf", body)
        return rc.judge({"src": "bib:test", "url": fetch.url, "expect": expect, "kind": "pdf"}, fetch)

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


def test_resources_check_requires_a_title_for_pdf_references() -> None:
    rc = _script("resources_check")
    _, errors = rc.collect()
    assert errors == []
    kinds = {t["src"]: (t["kind"], t["expect"]) for t in rc.collect()[0]}
    pdfs = {src: expect for src, (kind, expect) in kinds.items() if kind == "pdf"}
    assert pdfs, "no PDF references found"
    for src, expect in pdfs.items():
        assert expect and expect.strip().lower() not in ("(pdf)", "pdf"), src
