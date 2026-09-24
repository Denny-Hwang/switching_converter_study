"""Export every derivation module to derivations.generated.json.

The site renders these steps with strict KaTeX (the <Derivation> component),
so the derivations page shows exactly what the sympy code computes.
"""

from __future__ import annotations

import importlib
from typing import Any

import sympy as sp

from .derive import MODULES
from .derive.common import Derivation
from .equations import Catalog
from .gen_latex import rhs_latex, symbol_names


def _latex(expr: Any, names: dict[sp.Symbol, str]) -> str:
    # "old" term order reads naturally for balance equations: D (V_g - V) - V (1 - D)
    return sp.latex(expr, symbol_names=names, order="old", ln_notation=True)


def _step_latex(catalog: Catalog, st: Any, names: dict[sp.Symbol, str]) -> str | None:
    if st.expr is None:
        return None
    if not st.result_for:
        return _latex(st.expr, names)
    eq = catalog.by_id(st.result_for)
    yaml_rhs = rhs_latex(catalog, eq)
    lhs = _latex(st.expr.lhs, names)
    derived = st.expr.rhs
    if derived == catalog.expr(eq):
        # canonically identical: print it in the equations.yaml term order
        return f"{lhs} = {yaml_rhs}"
    # different canonical forms: show both (pytest proves they are equal)
    return f"{lhs} = {_latex(derived, names)} = {yaml_rhs}"


def build_derivations(catalog: Catalog) -> dict[str, Any]:
    out = []
    for mod_name in MODULES:
        d: Derivation = importlib.import_module(f"pe_core.derive.{mod_name}").derive()
        if d.module != mod_name:
            raise ValueError(f"module {mod_name} reports name {d.module}")
        names = {**symbol_names(catalog), **d.names}
        out.append(
            {
                "module": d.module,
                "source": f"python/pe_core/derive/{mod_name}.py",
                "title": d.title,
                "title_ko": d.title_ko,
                "intro": d.intro,
                "intro_ko": d.intro_ko,
                "results": list(d.results),
                "steps": [
                    {
                        "text": st.text,
                        "text_ko": st.text_ko,
                        "latex": _step_latex(catalog, st, names),
                        "result_for": st.result_for,
                    }
                    for st in d.steps
                ],
            }
        )
    derived_ids = {eid for dd in out for eid in dd["results"]}
    for eq in catalog.equations:
        if eq.derived_by and eq.id not in derived_ids:
            raise ValueError(f"{eq.id}: derived_by {eq.derived_by} but no module in MODULES produces it")
    return {
        "_generated_by": "python scripts/gen_equations.py -- DO NOT EDIT; edit python/pe_core/derive/*.py",
        "derivations": out,
    }
