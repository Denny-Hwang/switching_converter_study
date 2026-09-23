"""Every equation with `derived_by` must be reproduced symbolically by its
derivation module: simplify(derived - yaml_expr) == 0 (BUILD_SPEC §3)."""

from __future__ import annotations

import importlib
from pathlib import Path

import pytest

from pe_core.derive.common import Derivation, symbolic_equal
from pe_core.equations import REPO_ROOT, load

CATALOG = load()
DERIVED = [eq for eq in CATALOG.equations if eq.derived_by]


def module_name(derived_by: str) -> str:
    path = Path(derived_by)
    assert path.parts[:3] == ("python", "pe_core", "derive"), derived_by
    assert (REPO_ROOT / path).is_file(), f"{derived_by} does not exist"
    return "pe_core.derive." + path.stem


_cache: dict[str, Derivation] = {}


def derivation(derived_by: str) -> Derivation:
    name = module_name(derived_by)
    if name not in _cache:
        _cache[name] = importlib.import_module(name).derive()
    return _cache[name]


@pytest.mark.parametrize("eq", DERIVED, ids=[e.id for e in DERIVED])
def test_derivation_reproduces_yaml(eq) -> None:
    d = derivation(eq.derived_by)
    assert eq.id in d.results, f"{d.module}.derive() does not produce {eq.id}"
    derived = d.results[eq.id]
    assert symbolic_equal(derived, CATALOG.expr(eq)), (
        f"{eq.id}: derivation gives {derived}, equations.yaml has {CATALOG.expr(eq)}"
    )


def test_modules_only_claim_equations_that_point_back() -> None:
    by_module: dict[str, set[str]] = {}
    for eq in DERIVED:
        by_module.setdefault(eq.derived_by, set()).add(eq.id)
    for derived_by, ids in by_module.items():
        produced = set(derivation(derived_by).results)
        assert produced == ids, f"{derived_by}: produces {sorted(produced)}, yaml points {sorted(ids)} at it"


def test_required_derivations_exist() -> None:
    # BUILD_SPEC §3: CCM ratios; K/K_crit for the four basic converters; DCM
    # ratios; flyback boundary/V_crit; LFR input resistance; CV-sink fraction.
    required = {
        "buck.ccm.M", "boost.ccm.M", "buckboost.ccm.M", "flyback.ccm.M", "forward.ccm.M",
        "Kcrit.buck", "Kcrit.boost", "Kcrit.buckboost", "Kcrit.flyback",
        "buck.dcm.M", "boost.dcm.M", "buckboost.dcm.M", "flyback.dcm.M",
        "flyback.V_crit", "lfr.R_in", "src.cv_extraction",
    }
    missing = required - {eq.id for eq in DERIVED}
    assert not missing, f"required derivations missing: {sorted(missing)}"
