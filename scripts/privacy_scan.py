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
     appear literally in MDX.
  4. examples/synthetic/*.yaml must declare `synthetic: true` and a `label`
     that contains the word "synthetic".

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
# e.g. "12 V", "3.3µH", "100 kHz", "10 mΩ", "1 MΩ", "25 °C", "-40 °C"
NUM_UNIT = re.compile(
    r"(?<![\w.])[-+−]?\d+(?:[.,]\d+)?\s?(?:[kMGmµunp]?(?:V|A|W|Ω|Hz|H|F|J|C)|°C|ohms?)(?![\w])"
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
            if data.get("synthetic") is not True or "synthetic" not in str(data.get("label", "")).lower():
                errors.append(f"{path.relative_to(ROOT)}: must declare `synthetic: true` and a label containing 'synthetic'")

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
