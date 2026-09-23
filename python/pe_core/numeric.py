"""Numeric mirror: fast float evaluation of any equation id.

Built with ``sympy.lambdify`` from the same YAML expressions the TypeScript
engine is tested against, for use in scripts, notebooks and netlist
cross-checks. For exact reference values use ``Catalog.evaluate``.
"""

from __future__ import annotations

from functools import lru_cache
from typing import Callable

import sympy as sp

from .equations import Catalog, load


@lru_cache(maxsize=1)
def _catalog() -> Catalog:
    return load()


@lru_cache(maxsize=None)
def function(eq_id: str) -> tuple[tuple[str, ...], Callable[..., float]]:
    cat = _catalog()
    eq = cat.by_id(eq_id)
    names = tuple(cat.free_names(eq))
    fn = sp.lambdify([cat.sym(n) for n in names], cat.with_constants(cat.expr(eq)), modules="math")
    return names, fn


def evaluate(eq_id: str, **inputs: float) -> float:
    names, fn = function(eq_id)
    missing = [n for n in names if n not in inputs]
    if missing:
        raise KeyError(f"{eq_id}: missing inputs {missing}")
    return float(fn(*(inputs[n] for n in names)))
