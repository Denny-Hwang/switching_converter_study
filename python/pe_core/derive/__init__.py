"""Derivation scripts.

Each module derives one or more equations from first principles with sympy
and exposes ``derive() -> Derivation`` (see :mod:`pe_core.derive.common`).
pytest checks ``simplify(derived - yaml_expr) == 0`` for every equation whose
``derived_by`` names the module, and the steps are exported to the site's
derivations page. ``MODULES`` fixes the page order.
"""

MODULES = (
    "foundations",
    "averaging",
    "ccm_ratios",
    "dcm",
    "flyback",
    "clamp",
    "topologies",
    "small_signal",
    "control",
    "energy",
    "magnetics",
    "windings",
    "harvesting",
    "sensing",
)
