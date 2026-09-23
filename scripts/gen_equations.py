#!/usr/bin/env python3
"""Regenerate the committed equation artefacts from equations.yaml.

    python scripts/gen_equations.py          # write files
    python scripts/gen_equations.py --check  # exit 1 if they are stale

Writes (never edit these by hand):
  packages/pe-core/equations/equations.generated.json  LaTeX + metadata
  packages/pe-core/equations/test_vectors.json         shared numeric vectors

CI runs the generator and then ``git diff --exit-code``.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "python"))

from pe_core.equations import GENERATED_JSON, VECTORS_JSON, EquationError, load  # noqa: E402
from pe_core.gen_latex import build_generated  # noqa: E402
from pe_core.gen_vectors import build_vectors, count_by_id  # noqa: E402


def dumps(obj: object) -> str:
    return json.dumps(obj, indent=2, ensure_ascii=False) + "\n"


def render() -> dict[Path, str]:
    catalog = load()
    vectors = build_vectors(catalog)
    generated = build_generated(catalog, count_by_id(vectors))
    return {GENERATED_JSON: dumps(generated), VECTORS_JSON: dumps(vectors)}


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--check", action="store_true", help="fail if generated files are out of date")
    args = ap.parse_args()
    try:
        outputs = render()
    except EquationError as exc:
        print(f"gen_equations: {exc}", file=sys.stderr)
        return 1
    stale = []
    for path, content in outputs.items():
        current = path.read_text(encoding="utf-8") if path.exists() else None
        if current != content:
            stale.append(path)
            if not args.check:
                path.write_text(content, encoding="utf-8")
    rel = [str(p.relative_to(ROOT)) for p in stale]
    if args.check:
        if stale:
            print("gen_equations --check: stale generated files: " + ", ".join(rel), file=sys.stderr)
            print("run: python scripts/gen_equations.py", file=sys.stderr)
            return 1
        print("gen_equations --check: up to date")
        return 0
    print("gen_equations: wrote " + (", ".join(rel) if rel else "nothing (already up to date)"))
    return 0


if __name__ == "__main__":
    sys.exit(main())
