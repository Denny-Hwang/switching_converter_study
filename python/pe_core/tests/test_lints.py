"""The lint scripts' own rules, tested on small inputs."""

from __future__ import annotations

import importlib.util
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[3]


def _script(name: str):
    spec = importlib.util.spec_from_file_location(name, ROOT / "scripts" / f"{name}.py")
    mod = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(mod)
    return mod


@pytest.mark.parametrize(
    "text",
    ["12 V", "3.3µH", "100 kHz", "10 mΩ", "1 MΩ", "-40 °C", "1e5 Hz", "2.5E-3 A", "100 ohms"],
)
def test_privacy_scan_finds_numbers_with_units(text: str) -> None:
    assert _script("privacy_scan").NUM_UNIT.search(f"a value of {text} here")


@pytest.mark.parametrize("text", ["D = 0.5", "K_crit", "V_g", "the 2nd edition", "Ch. 5", "4/27", "x1e5"])
def test_privacy_scan_ignores_unitless_text(text: str) -> None:
    assert not _script("privacy_scan").NUM_UNIT.search(text)


@pytest.mark.parametrize(
    ("body", "hand"),
    [
        ("M = D", True),
        ("K = 2L/(R T_s)", True),
        ("D = 0.25", False),
        ("R_L = 0.1\\,\\Omega", False),
        ("L_M = 50\\,\\mu\\mathrm{H}", False),
        ("K > K_\\mathrm{crit}", False),
        ("\\omega_0 = 1/\\sqrt{LC}", True),
    ],
)
def test_mathlint_hand_equation(body: str, hand: bool) -> None:
    assert _script("mathlint").is_hand_equation(body) is hand
