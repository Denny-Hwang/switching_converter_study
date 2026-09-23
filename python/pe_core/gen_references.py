"""Export references.bib to src/generated/references.json for the site
(<Cite>, the <Eq> source line and the bibliography page)."""

from __future__ import annotations

from typing import Any

from . import bib


def build_references() -> dict[str, Any]:
    entries = bib.load()
    return {
        "_generated_by": "python scripts/gen_equations.py -- DO NOT EDIT; edit references.bib",
        "entries": {e.key: bib.to_json(e) for e in entries},
    }
