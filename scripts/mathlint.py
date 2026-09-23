#!/usr/bin/env python3
"""mathlint -- enforce the single-source-of-truth rule for math in the docs.

Scans src/content/docs/**/*.md(x) except **/scratch/** (unpublished) and fails on:

  * display math typed by hand: $$...$$, \\[...\\], \\begin{...}
  * inline math that is an equation typed by hand: $a = b$ where both sides
    contain symbols (use <Eq id="..."/>; plain values such as $D = 0.5$ and
    inequalities such as $K > K_\\mathrm{crit}$ are fine)
  * <Eq id="..."> whose id is not in equations.generated.json, has no test
    vectors, or is not a string literal
  * the same <Eq id> embedded twice in one locale (each formula appears once;
    refer back to it with a link); pages under about/ document the site and
    may show an equation to demonstrate the pipeline without counting as
    its home
  * <Derivation module="..."> naming an unknown module, and a derivations page
    that does not render every derivation module

    python scripts/mathlint.py
"""

from __future__ import annotations

import json
import re
import sys
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DOCS = ROOT / "src" / "content" / "docs"
GENERATED = ROOT / "packages" / "pe-core" / "equations" / "equations.generated.json"
DERIVATIONS = ROOT / "packages" / "pe-core" / "equations" / "derivations.generated.json"
DERIVATIONS_PAGE = "02-theory/derivations.mdx"
LOCALES = ("en", "ko")

RELATIONS = re.compile(r"=|\\approx|\\equiv|\\triangleq|\\coloneqq|\\simeq|\\doteq")
LETTER = re.compile(r"[A-Za-z\\]")


def strip_non_prose(text: str) -> str:
    """Blank out frontmatter, fenced code, inline code and MDX comments,
    keeping line numbers intact."""

    def blank(m: re.Match[str]) -> str:
        return re.sub(r"[^\n]", " ", m.group(0))

    text = re.sub(r"\A---\n.*?\n---\n", blank, text, flags=re.S)
    text = re.sub(r"^(```|~~~).*?^\1[^\n]*$", blank, text, flags=re.S | re.M)
    text = re.sub(r"\{/\*.*?\*/\}", blank, text, flags=re.S)
    text = re.sub(r"`[^`\n]*`", blank, text)
    return text


def line_of(text: str, pos: int) -> int:
    return text.count("\n", 0, pos) + 1


def is_hand_equation(body: str) -> bool:
    parts = RELATIONS.split(body)
    if len(parts) < 2:
        return False
    return sum(1 for p in parts if LETTER.search(p)) >= 2


def main() -> int:
    catalog = json.loads(GENERATED.read_text(encoding="utf-8"))["equations"]
    modules = [d["module"] for d in json.loads(DERIVATIONS.read_text(encoding="utf-8"))["derivations"]]
    errors: list[str] = []
    homes: dict[tuple[str, str], list[str]] = defaultdict(list)
    files = sorted(p for p in DOCS.rglob("*") if p.suffix in (".md", ".mdx") and "scratch" not in p.parts)

    for path in files:
        rel = path.relative_to(ROOT)
        locale = path.relative_to(DOCS).parts[0] if len(path.relative_to(DOCS).parts) > 1 else "-"
        raw = path.read_text(encoding="utf-8")
        text = strip_non_prose(raw)

        for m in re.finditer(r"\$\$", text):
            errors.append(f"{rel}:{line_of(text, m.start())}: display math '$$' typed by hand; use <Eq id=\"...\" />")
        for m in re.finditer(r"\\\[|\\begin\{", text):
            errors.append(f"{rel}:{line_of(text, m.start())}: LaTeX display environment typed by hand; use <Eq id=\"...\" />")
        for m in re.finditer(r"(?<![\\$])\$(?!\$)([^$\n]+?)(?<!\\)\$", text):
            if is_hand_equation(m.group(1)):
                errors.append(
                    f"{rel}:{line_of(text, m.start())}: inline equation ${m.group(1)}$ typed by hand; "
                    "put it in equations.yaml and use <Eq>, or rephrase"
                )

        for m in re.finditer(r"<Eq\b([^>]*)/?>", text):
            attrs = m.group(1)
            idm = re.search(r"\bid\s*=\s*\"([^\"]+)\"", attrs) or re.search(r"\bid\s*=\s*'([^']+)'", attrs)
            ln = line_of(text, m.start())
            if not idm:
                errors.append(f"{rel}:{ln}: <Eq> needs a literal id=\"...\" attribute")
                continue
            eq_id = idm.group(1)
            if eq_id not in catalog:
                errors.append(f"{rel}:{ln}: <Eq id=\"{eq_id}\"> is not in equations.generated.json")
            elif catalog[eq_id]["n_tests"] < 1:
                errors.append(f"{rel}:{ln}: <Eq id=\"{eq_id}\"> has no test vectors")
            if path.relative_to(DOCS).parts[1:2] != ("about",):
                homes[(locale, eq_id)].append(f"{rel}:{ln}")

        for m in re.finditer(r"<Derivation\b[^>]*\bmodule\s*=\s*\"([^\"]+)\"", text):
            if m.group(1) not in modules:
                errors.append(f"{rel}:{line_of(text, m.start())}: <Derivation module=\"{m.group(1)}\"> is unknown")

    for (locale, eq_id), where in homes.items():
        if len(where) > 1:
            errors.append(
                f"<Eq id=\"{eq_id}\"> is embedded {len(where)} times in locale '{locale}' ({', '.join(where)}); "
                "embed it once and link to it elsewhere"
            )

    for locale in LOCALES:
        page = DOCS / locale / DERIVATIONS_PAGE
        if not page.exists():
            errors.append(f"missing derivations page {page.relative_to(ROOT)}")
            continue
        shown = set(re.findall(r"<Derivation\b[^>]*\bmodule\s*=\s*\"([^\"]+)\"", page.read_text(encoding="utf-8")))
        for mod in modules:
            if mod not in shown:
                errors.append(f"{page.relative_to(ROOT)}: derivation module '{mod}' is not rendered")

    if errors:
        print(f"mathlint: {len(errors)} error(s)", file=sys.stderr)
        for e in errors:
            print("  " + e, file=sys.stderr)
        return 1
    print(f"mathlint: OK ({len(files)} pages, {len(homes)} <Eq> embeds, {len(modules)} derivation modules)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
