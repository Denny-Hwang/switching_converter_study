"""Derivation scripts.

Each module derives one or more equations from first principles with sympy
and exposes ``derive() -> dict[str, sympy.Expr]`` mapping equation ids to
derived expressions. pytest checks ``simplify(derived - yaml_expr) == 0``
for every equation whose ``derived_by`` names the module.
"""
