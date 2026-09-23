"""references.bib parsing and formatting."""

from __future__ import annotations

import pytest

from pe_core import bib
from pe_core.derive.common import symbolic_equal
from pe_core.equations import load

import sympy as sp


def test_bib_loads_and_keys_are_unique() -> None:
    entries = bib.load()
    keys = [e.key for e in entries]
    assert len(keys) == len(set(keys))
    assert "erickson2020" in keys


@pytest.mark.parametrize(
    ("tex", "plain"),
    [
        ("Maksimovi{\\'c}", "Maksimović"),
        ("pp. 54--60", "pp. 54–60"),
        ("{MOSFET} and {IGBT}", "MOSFET and IGBT"),
        ("\\url{https://example.org/x}", "https://example.org/x"),
    ],
)
def test_plain(tex: str, plain: str) -> None:
    assert bib.plain(tex) == plain


def test_unsupported_latex_is_rejected() -> None:
    with pytest.raises(bib.BibError):
        bib.plain("\\emph{x}")


def test_labels() -> None:
    by = {e.key: e for e in bib.load()}
    assert bib.label(by["erickson2020"]) == "Erickson & Maksimović 2020"
    assert bib.label(by["mohan2003"]) == "Mohan et al. 2003"
    assert bib.label(by["adi_ltc6101"]) == "Analog Devices, LTC6101/LTC6101HV"


def test_parser_rejects_malformed_entries() -> None:
    with pytest.raises(bib.BibError):
        bib.parse("@article{x, title = {T}, year = {2000}}")  # missing author/journal
    with pytest.raises(bib.BibError):
        bib.parse("@article{x, author = {A}, title = {T}, journal = {J}, year = {2000}}\n"
                  "@article{x, author = {A}, title = {T}, journal = {J}, year = {2000}}")  # duplicate key


def test_symbolic_equal_is_not_vacuous() -> None:
    """The derivation comparator must reject a perturbed expression for every equation."""
    cat = load()
    for eq in cat.equations:
        e = cat.expr(eq)
        assert symbolic_equal(e, e)
        assert not symbolic_equal(e, e * sp.Rational(101, 100) + sp.Rational(1, 7)), eq.id
