#!/usr/bin/env python3
"""privacy_scan -- enforce PRIVACY_RULES.md mechanically.

Checks every tracked (or new, not ignored) text file:

  1. Maintainer denylist: if the gitignored file .private/denylist.txt exists
     locally, any listed token (case-insensitive; '#' starts a comment) found
     in any file is an error. The denylist itself is never committed.
  2. Personal data: e-mail addresses (except no-reply addresses).
  3. Numbers with units in published prose (src/content/docs/**/*.md(x)):
     a literal such as "12 V" or "100 kHz" must be traceable to a cited
     source, so the same line must carry a <Cite key="..."> (a textbook
     example or a data-sheet fact). Numbers from synthetic examples are
     rendered by components that read examples/synthetic/*.yaml and never
     appear literally in MDX. The check covers the electrical units a
     design's values come in -- V, A, W, Ω (or ohms), Hz, H, F, J, C and
     °C, with an SI prefix -- written as symbols, in English or in Korean
     prose; percentages, times, decibels and units spelt out in words are
     outside it.
  4. examples/synthetic/*.yaml must declare `synthetic: true`, and a `label`
     and `label_ko` that name it as an example ("example", "예제"); every
     page's footer states once that example numbers are synthetic, so the
     footer component and that statement (EN and KO) must be in place.
  5. Quizzes (src/content/quizzes/**/*.yaml) may state exercise numbers with
     units, so each must declare `numbers: synthetic` (the footer's
     statement covers them).

    python scripts/privacy_scan.py
"""

from __future__ import annotations

import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DOCS = ROOT / "src" / "content" / "docs"
DENYLIST = ROOT / ".private" / "denylist.txt"
SKIP_SUFFIXES = {".png", ".jpg", ".jpeg", ".gif", ".webp", ".ico", ".woff", ".woff2", ".ttf", ".pdf", ".zip"}
SKIP_FILES = {"package-lock.json"}

EMAIL = re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}")
EMAIL_OK = re.compile(r"(^|[._-])no-?reply@|@users\.noreply\.github\.com$", re.I)
# e.g. "12 V", "3.3µH", "100 kHz", "10 mΩ", "1 MΩ", "25 °C", "-40 °C", "1e5 Hz", and in Korean prose "5 V에",
# "0.33 µF로", "25 °C에서": the boundaries are ASCII word characters, since Python's \w takes Hangul as a letter and a
# particle follows a unit directly
NUM_UNIT = re.compile(
    r"(?<![A-Za-z0-9_.])[-+−]?\d+(?:[.,]\d+)?(?:[eE][-+−]?\d+)?\s?(?:[kMGmµunp]?(?:V|A|W|Ω|Hz|H|F|J|C)|°C|ohms?)(?![A-Za-z0-9_])"
)


def tracked_files() -> list[Path]:
    try:
        out = subprocess.run(
            ["git", "ls-files", "--cached", "--others", "--exclude-standard"],
            cwd=ROOT, check=True, capture_output=True, text=True,
        ).stdout
    except (OSError, subprocess.CalledProcessError):
        return [p for p in ROOT.rglob("*") if p.is_file() and ".git" not in p.parts]
    return [ROOT / line for line in out.splitlines() if line]


def read_text(path: Path) -> str | None:
    if path.suffix.lower() in SKIP_SUFFIXES or path.name in SKIP_FILES or not path.is_file():
        return None
    try:
        return path.read_text(encoding="utf-8")
    except (UnicodeDecodeError, OSError):
        return None


def prose_lines(text: str) -> list[tuple[int, str]]:
    """Lines of MDX prose: no frontmatter, fenced code, imports or inline code."""
    out = []
    in_front = text.startswith("---\n")
    in_fence = False
    for i, line in enumerate(text.splitlines(), start=1):
        if in_front:
            if i > 1 and line.strip() == "---":
                in_front = False
            continue
        if line.lstrip().startswith(("```", "~~~")):
            in_fence = not in_fence
            continue
        if in_fence or line.startswith("import "):
            continue
        out.append((i, re.sub(r"`[^`]*`", "", line)))
    return out


def main() -> int:
    errors: list[str] = []
    files = tracked_files()

    deny: list[str] = []
    if DENYLIST.exists():
        for raw in DENYLIST.read_text(encoding="utf-8").splitlines():
            tok = raw.split("#", 1)[0].strip()
            if tok:
                deny.append(tok.lower())

    for path in files:
        if ".private" in path.parts:
            errors.append(f"{path.relative_to(ROOT)}: files under .private/ must never be committed")
            continue
        text = read_text(path)
        if text is None:
            continue
        rel = path.relative_to(ROOT)
        lower = text.lower()
        for tok in deny:
            start = 0
            while (i := lower.find(tok, start)) >= 0:
                errors.append(f"{rel}:{lower.count(chr(10), 0, i) + 1}: denylisted token")
                start = i + len(tok)
        for m in EMAIL.finditer(text):
            if not EMAIL_OK.search(m.group(0)):
                errors.append(f"{rel}:{text.count(chr(10), 0, m.start()) + 1}: e-mail address {m.group(0)!r}")

        if path.suffix in (".md", ".mdx") and DOCS in path.parents and "scratch" not in path.parts:
            for ln, line in prose_lines(text):
                hits = NUM_UNIT.findall(line)
                if hits and "<Cite" not in line:
                    errors.append(
                        f"{rel}:{ln}: number with unit {hits[0].strip()!r} in prose without a <Cite> on the same line "
                        "(use a cited example, or a synthetic value rendered from examples/synthetic/)"
                    )

    synth = ROOT / "examples" / "synthetic"
    if synth.exists():
        import yaml  # noqa: PLC0415

        for path in sorted(synth.glob("*.yaml")):
            data = yaml.safe_load(path.read_text(encoding="utf-8")) or {}
            if data.get("synthetic") is not True or "example" not in str(data.get("label", "")).lower():
                errors.append(f"{path.relative_to(ROOT)}: must declare `synthetic: true` and a label naming it an example")
            if "예제" not in str(data.get("label_ko", "")):
                errors.append(f"{path.relative_to(ROOT)}: label_ko must name it an example ('예제'), shown on Korean pages")

    # the one statement every page carries: the footer override, and its text in both languages
    config = read_text(ROOT / "astro.config.mjs") or ""
    footer = read_text(ROOT / "src" / "components" / "Footer.astro") or ""
    ui_text = read_text(ROOT / "src" / "i18n" / "ui.ts") or ""
    statements = re.findall(r"'site\.synthetic': ['\"](.*)['\"],", ui_text)
    if "Footer: './src/components/Footer.astro'" not in config or "t['site.synthetic']" not in footer:
        errors.append("the page footer (src/components/Footer.astro, overriding Starlight's) must print t['site.synthetic']")
    if len(statements) != 2 or "synthetic" not in statements[0] or "합성" not in statements[1]:
        errors.append("src/i18n/ui.ts: 'site.synthetic' must say, in EN and KO, that example numbers are synthetic (합성)")

    quizzes = ROOT / "src" / "content" / "quizzes"
    if quizzes.exists():
        import yaml  # noqa: PLC0415

        for path in sorted(quizzes.rglob("*.yaml")):
            data = yaml.safe_load(path.read_text(encoding="utf-8")) or {}
            if data.get("numbers") != "synthetic":
                errors.append(f"{path.relative_to(ROOT)}: a quiz must declare `numbers: synthetic`")

    if errors:
        print(f"privacy_scan: {len(errors)} error(s)", file=sys.stderr)
        for e in errors:
            print("  " + e, file=sys.stderr)
        return 1
    print(
        f"privacy_scan: OK ({len(files)} files; denylist: "
        f"{'%d tokens' % len(deny) if DENYLIST.exists() else 'not present (maintainer-local, optional)'})"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
