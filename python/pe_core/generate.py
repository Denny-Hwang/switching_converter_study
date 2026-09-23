"""Render every committed, generated artefact (used by scripts/gen_equations.py
and by the pytest freshness check)."""

from __future__ import annotations

import json
from pathlib import Path

from .equations import EQUATIONS_DIR, GENERATED_JSON, REPO_ROOT, VECTORS_JSON, load
from .gen_derivations import build_derivations
from .gen_latex import build_generated
from .gen_references import build_references
from .gen_vectors import build_vectors, count_by_id

DERIVATIONS_JSON = EQUATIONS_DIR / "derivations.generated.json"
REFERENCES_JSON = REPO_ROOT / "src" / "generated" / "references.json"


def dumps(obj: object) -> str:
    return json.dumps(obj, indent=2, ensure_ascii=False) + "\n"


def render_all() -> dict[Path, str]:
    catalog = load()
    vectors = build_vectors(catalog)
    generated = build_generated(catalog, count_by_id(vectors))
    return {
        GENERATED_JSON: dumps(generated),
        VECTORS_JSON: dumps(vectors),
        DERIVATIONS_JSON: dumps(build_derivations(catalog)),
        REFERENCES_JSON: dumps(build_references()),
    }
