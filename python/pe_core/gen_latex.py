"""Generate LaTeX + metadata for every equation (equations.generated.json).

The LaTeX is produced by ``sympy.latex`` from the unevaluated, tidied parse
tree of each ``expr``, with the display names from ``symbol_table``. It is
never typed by hand. KaTeX (strict, throwOnError) validates it at site build
time and in the vitest suite.
"""

from __future__ import annotations

from typing import Any

import sympy as sp

from .equations import Catalog, Equation

RELATION_LATEX = {"eq": "=", "approx": r"\approx"}


def symbol_names(catalog: Catalog) -> dict[sp.Symbol, str]:
    return {catalog.sym(name): info.latex for name, info in catalog.symbols.items()}


def rhs_latex(catalog: Catalog, eq: Equation) -> str:
    return sp.latex(catalog.display_expr(eq), symbol_names=symbol_names(catalog), order="none")


def equation_latex(catalog: Catalog, eq: Equation) -> str:
    lhs = catalog.symbols[eq.lhs].latex
    return f"{lhs} {RELATION_LATEX[eq.relation]} {rhs_latex(catalog, eq)}"


def build_generated(catalog: Catalog, n_tests: dict[str, int]) -> dict[str, Any]:
    """Return the JSON-serialisable content of equations.generated.json."""
    equations: dict[str, Any] = {}
    for eq in catalog.equations:
        variables = catalog.free_names(eq)
        equations[eq.id] = {
            "id": eq.id,
            "title": eq.title,
            "title_ko": eq.title_ko,
            "latex": equation_latex(catalog, eq),
            "lhs": eq.lhs,
            "expr": eq.expr_src,
            "relation": eq.relation,
            "variables": variables,
            "symbols": {name: eq.symbols[name] for name in variables},
            "assumptions": eq.assumptions,
            "convention": eq.convention,
            "convention_ko": eq.convention_ko,
            "notes": eq.notes,
            "notes_ko": eq.notes_ko,
            "cite": {"key": eq.cite_key, "where": eq.cite_where},
            "derived_by": eq.derived_by,
            "n_tests": n_tests.get(eq.id, 0),
            "yaml_line": eq.line,
        }
    used = sorted({v for e in equations.values() for v in e["variables"]} | {e["lhs"] for e in equations.values()})
    return {
        "_generated_by": "python scripts/gen_equations.py -- DO NOT EDIT; edit equations.yaml instead",
        "_source": "packages/pe-core/equations/equations.yaml",
        "sympy_version": sp.__version__,
        "schema_version": catalog.schema_version,
        "assumption_labels": catalog.assumption_labels,
        "symbols": {
            name: {
                "latex": catalog.symbols[name].latex,
                "unit": catalog.symbols[name].unit,
                "desc": catalog.symbols[name].desc,
            }
            for name in used
        },
        "equations": equations,
    }
