"""Shared helpers for derivation scripts.

A derivation module exposes ``derive() -> Derivation``. It builds the result
from first principles with sympy, recording readable steps (English and
Korean text plus a sympy object) along the way. The same steps are exported
to derivations.generated.json and rendered on the site's derivations page,
so the page shows exactly what the code computes.

pytest checks every ``Derivation.results[eq_id]`` against the expression in
equations.yaml with :func:`symbolic_equal`.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from functools import lru_cache
from typing import Any

import sympy as sp

from ..equations import Catalog, load


@lru_cache(maxsize=1)
def catalog() -> Catalog:
    return load()


def S(name: str) -> sp.Symbol:
    """The catalogue symbol ``name`` (same object and assumptions as the YAML)."""
    return catalog().sym(name)


@dataclass
class Step:
    text: str
    text_ko: str
    expr: Any | None = None
    result_for: str | None = None


@dataclass
class Derivation:
    module: str
    title: str
    title_ko: str
    intro: str
    intro_ko: str
    steps: list[Step] = field(default_factory=list)
    results: dict[str, sp.Expr] = field(default_factory=dict)
    names: dict[sp.Symbol, str] = field(default_factory=dict)

    def local(self, name: str, latex: str, **assumptions: Any) -> sp.Symbol:
        """A symbol used only inside this derivation, with its display LaTeX."""
        sym = sp.Symbol(name, **assumptions)
        self.names[sym] = latex
        return sym

    def step(self, text: str, text_ko: str, expr: Any | None = None) -> None:
        self.steps.append(Step(text, text_ko, expr))

    def result(self, eq_id: str, expr: sp.Expr, text: str, text_ko: str, lhs: Any | None = None) -> None:
        """Record the derived expression for ``eq_id`` (and show it as a step)."""
        if eq_id in self.results:
            raise ValueError(f"{self.module}: duplicate result {eq_id}")
        self.results[eq_id] = expr
        shown = sp.Eq(lhs, expr, evaluate=False) if lhs is not None else expr
        self.steps.append(Step(text, text_ko, shown, result_for=eq_id))


def symbolic_equal(a: sp.Expr, b: sp.Expr) -> bool:
    """True when ``a - b`` simplifies to zero (with a few algebraic rewrites
    that ``simplify`` alone sometimes misses for nested radicals)."""
    diff = a - b
    if sp.simplify(diff) == 0:
        return True
    for rewrite in (sp.radsimp, sp.together, sp.factor, sp.expand, sp.powsimp):
        try:
            if sp.simplify(rewrite(diff)) == 0:
                return True
        except Exception:  # noqa: BLE001 - try the next rewrite
            continue
    return False


def positive_root(solutions: list[sp.Expr], sample: dict[sp.Symbol, float], lo: float = 0.0) -> sp.Expr:
    """Pick the unique solution that is real and > ``lo`` at a sample point."""
    good = []
    for s in solutions:
        v = complex(s.subs(sample).evalf())
        if abs(v.imag) < 1e-12 and v.real > lo:
            good.append(s)
    if len(good) != 1:
        raise ValueError(f"expected exactly one admissible root, got {good}")
    return good[0]
