"""Catalogue-level checks: the YAML loads, generated files are current,
the display printer is tidy, and the numeric mirror matches the vectors."""

from __future__ import annotations

import importlib.util
import json
from pathlib import Path

import pytest
import sympy as sp

from pe_core import numeric
from pe_core.equations import (
    GENERATED_JSON,
    REPO_ROOT,
    VECTORS_JSON,
    Catalog,
    EquationError,
    close,
    load,
    tidy,
)
from pe_core.gen_latex import build_generated
from pe_core.gen_vectors import build_vectors, count_by_id


@pytest.fixture(scope="module")
def catalog() -> Catalog:
    return load()


def _gen_module():
    spec = importlib.util.spec_from_file_location("gen_equations", REPO_ROOT / "scripts" / "gen_equations.py")
    mod = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(mod)
    return mod


def test_catalog_loads(catalog: Catalog) -> None:
    assert catalog.schema_version == 1
    assert len(catalog.equations) >= 2
    assert len({e.id for e in catalog.equations}) == len(catalog.equations)


def test_generated_files_are_current() -> None:
    outputs = _gen_module().render()
    for path, content in outputs.items():
        assert path.read_text(encoding="utf-8") == content, f"{path.name} is stale: run python scripts/gen_equations.py"


def test_every_equation_has_vectors_and_latex(catalog: Catalog) -> None:
    vectors = build_vectors(catalog)
    counts = count_by_id(vectors)
    generated = build_generated(catalog, counts)
    for eq in catalog.equations:
        assert counts[eq.id] >= len(eq.tests) + 1
        assert generated["equations"][eq.id]["latex"].strip()


@pytest.mark.parametrize(
    ("src", "want"),
    [
        ("1/(1 - D)", r"\frac{1}{1 - D}"),
        ("-D/(1 - D)", r"- \frac{D}{1 - D}"),
        ("n*D/(1 - D)", r"\frac{n D}{1 - D}"),
        ("(1 + sqrt(1 + 4*D**2/K))/2", r"\frac{1 + \sqrt{1 + \frac{4 D^{2}}{K}}}{2}"),
    ],
)
def test_tidy_display(src: str, want: str) -> None:
    syms = {name: sp.Symbol(name, positive=True) for name in ("D", "K", "n")}
    raw = sp.parse_expr(src, local_dict=syms, evaluate=False)
    assert sp.latex(tidy(raw), order="none") == want
    # tidying must never change the value
    assert sp.simplify(tidy(raw) - sp.parse_expr(src, local_dict=syms)) == 0


def test_numeric_mirror_matches_vectors() -> None:
    data = json.loads(VECTORS_JSON.read_text(encoding="utf-8"))
    for v in data["vectors"]:
        got = numeric.evaluate(v["id"], **v["inputs"])
        assert close(got, v["value"], rel=1e-12), (v, got)


def test_wrong_expectation_is_rejected(tmp_path: Path) -> None:
    text = (GENERATED_JSON.parent / "equations.yaml").read_text(encoding="utf-8")
    bad = text.replace("expect: 2.0", "expect: 2.5", 1)
    assert bad != text
    p = tmp_path / "equations.yaml"
    p.write_text(bad, encoding="utf-8")
    with pytest.raises(EquationError, match="expects"):
        load(p)


@pytest.mark.parametrize("value", ['""', '"  "', "null", ""])
def test_symbol_without_a_meaning_is_rejected(tmp_path: Path, value: str) -> None:
    text = (GENERATED_JSON.parent / "equations.yaml").read_text(encoding="utf-8")
    first = 'meaning: "duty ratio",'
    assert first in text
    p = tmp_path / "equations.yaml"
    p.write_text(text.replace(first, f"meaning: {value},", 1), encoding="utf-8")
    with pytest.raises(EquationError, match="meaning and meaning_ko must be non-empty text"):
        load(p)


def test_empty_citation_list_is_rejected(tmp_path: Path) -> None:
    text = (GENERATED_JSON.parent / "equations.yaml").read_text(encoding="utf-8")
    first = 'cite: {key: erickson2020, where: "Ch. 2 (Principles of Steady-State Converter Analysis)"}'
    assert first in text
    p = tmp_path / "equations.yaml"
    p.write_text(text.replace(first, "cite: []", 1), encoding="utf-8")
    with pytest.raises(EquationError, match="at least one citation"):
        load(p)


def test_duplicate_symbol_is_rejected(tmp_path: Path) -> None:
    # YAML keeps the last of two equal keys silently: a second V_M once replaced the PWM ramp's meaning on the
    # control pages. The loader refuses it
    text = (GENERATED_JSON.parent / "equations.yaml").read_text(encoding="utf-8")
    line = next(ln for ln in text.splitlines() if ln.startswith("  V_M: "))
    p = tmp_path / "equations.yaml"
    p.write_text(text.replace(line, line + "\n" + line.replace("PWM ramp amplitude", "another amplitude"), 1), encoding="utf-8")
    with pytest.raises(EquationError, match="duplicate key 'V_M'"):
        load(p)
