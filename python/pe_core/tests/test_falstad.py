"""The SPICE library's CircuitJS1 circuits (scripts/falstad_library.py): the share links' compression, the
CircuitJS1 geometry the wiring check relies on, every circuit against its SPICE netlist, and the committed
files. CircuitJS1 itself runs the circuits in the CI's falstad job (scripts/falstad_check.mjs)."""

from __future__ import annotations

import importlib.util
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / "scripts"))


def _load(name: str):
    spec = importlib.util.spec_from_file_location(name, ROOT / "scripts" / f"{name}.py")
    mod = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    sys.modules[name] = mod
    spec.loader.exec_module(mod)
    return mod


lz = _load("lzstring")
fl = _load("falstad_library")
IDS = [c["id"] for c in fl.lib.CASES]

# made with lz-string's own compressToEncodedURIComponent (the lz-string.min.js CircuitJS1 ships)
VECTORS = [
    ("", "Q"),
    ("a", "IZA"),
    ("hello world", "BYUwNmD2AEDukCcwBMg"),
    ("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", "IY18ZVkA"),
    (
        "$ 1 2e-08 1000 50 24 50 5e-11\nw 80 176 176 176 0\nr 464 176 464 336 0 10\n",
        "CQAgjCBMCmC0AMAOc9UgKzygFg19cYYAUAO4iJZgDsAbOHQ-fMQE4ja2432e4DM-ZimJA",
    ),
    ("Ω µ 한글 °C", "pXAAIK0oOquAB1IA0GEg"),
    ("😀 emoji", "rwbgA9gECmC2D2BWBLIA"),
]


@pytest.mark.parametrize(("text", "want"), VECTORS)
def test_the_links_compress_as_lz_string_does(text, want) -> None:
    assert lz.compress_to_encoded_uri_component(text) == want


def test_numbers_never_carry_a_plus_sign() -> None:
    # CircuitJS1 splits a circuit's lines on '+', so 1e+20 would read as two numbers
    assert fl.num(1e20) == "1e20"
    assert fl.num(1e-9) == "1e-09"
    assert fl.num(0.25) == "0.25"
    assert fl.num(100.0) == "100"
    for case in fl.lib.CASES:
        assert "+" not in fl.circuit_text(case)


def test_the_switch_control_post_is_where_circuitjs_puts_it() -> None:
    # the working circuits: a switch drawn right, down and up, with its gate wired to these points
    assert fl.switch_control((176, 176), (240, 176)) == (208, 192)
    assert fl.switch_control((240, 240), (240, 368)) == (224, 304)
    assert fl.switch_control((256, 336), (256, 176)) == (272, 256)
    with pytest.raises(ValueError):
        fl.switch_control((176, 176), (224, 176))  # its middle off the 16 px grid


def test_the_transformers_posts_are_where_circuitjs_puts_them() -> None:
    reversed_ = fl.Elm("T", 352, 176, 416, 240, fl.BACK_EULER | fl.REVERSE, ["5e-05", "0.25", "0", "0", "0.99999"])
    assert reversed_.posts() == [(352, 176), (416, 240), (352, 240), (416, 176)]
    plain = fl.Elm("T", 352, 176, 416, 240, 0, ["5e-05", "0.25", "0", "0", "0.99999"])
    assert plain.posts() == [(352, 176), (416, 176), (352, 240), (416, 240)]
    # three windings: the primary's two posts at x1, its last one moved down to the deepest post; the
    # secondary's and the reset winding's at x2, 32 px apart within a coil and 16 px between coils
    three = fl.Elm("406", 352, 176, 416, 176, 2, ["0.001", "0.99999", "1:0.5,1", "3", "0", "0", "0"])
    assert three.posts() == [(352, 176), (352, 256), (416, 176), (416, 208), (416, 224), (416, 256)]
    two_primaries = fl.Elm("406", 288, 160, 352, 160, 2, ["0.001", "0.99999", "1,1:0.5", "3", "0", "0", "0"])
    assert two_primaries.posts() == [(288, 160), (288, 192), (288, 208), (288, 240), (352, 160), (352, 240)]


@pytest.mark.parametrize("case", fl.lib.CASES, ids=IDS)
def test_every_circuit_is_wired_as_its_spice_netlist(case) -> None:
    assert fl.check_wiring(case, fl.elements(case)) == []


def test_the_wiring_check_finds_a_miswired_circuit() -> None:
    case = next(c for c in fl.lib.CASES if c["id"] == "buck-ccm")
    elms = fl.elements(case)
    # the freewheeling diode turned round
    d1 = next(e for e in elms if e.name == "D1")
    d1.x1, d1.y1, d1.x2, d1.y2 = d1.x2, d1.y2, d1.x1, d1.y1
    errors = fl.check_wiring(case, elms)
    assert any("D1" in e for e in errors)
    # a wire that misses the switch's post by one grid step
    elms = fl.elements(case)
    w = next(e for e in elms if e.kind == "w" and (e.x2, e.y2) == (176, 176))
    w.x2 = 160
    assert fl.check_wiring(case, fl.elements(case)) == []
    assert fl.check_wiring(case, elms) != []


def test_the_committed_files_are_current() -> None:
    for path, text in fl.files().items():
        assert path.read_text(encoding="utf-8") == text, f"{path.relative_to(ROOT)}: run python scripts/falstad_library.py"


@pytest.mark.parametrize("case", fl.lib.CASES, ids=IDS)
def test_the_check_copy_differs_only_in_its_speed(case) -> None:
    shown = fl.circuit_text(case).splitlines()
    check = fl.circuit_text(case, fl.CHECK_SPEED).splitlines()
    assert shown[1:] == check[1:]
    a, b = shown[0].split(), check[0].split()
    assert a[:3] + a[4:] == b[:3] + b[4:]
    assert float(a[3]) == pytest.approx(fl.STEPS / 160) and float(b[3]) == fl.CHECK_SPEED
    entry = next(c for c in fl.generated()["cases"] if c["id"] == case["id"])
    assert entry["check_link"] == fl.link("\n".join(check) + "\n")


@pytest.mark.parametrize("case", fl.lib.CASES, ids=IDS)
def test_the_circuits_start_at_the_ideal_steady_state(case) -> None:
    a = fl.lib.analytic(case)
    elms = fl.start_state(case, fl.elements(case))
    caps = [e for e in elms if e.kind == "c"]
    assert caps and all(abs(float(e.values[1])) == pytest.approx(abs(a["v_out_avg"]), rel=1e-5) for e in caps if "out" in e.nodes[:2])
    for e in elms:
        if e.kind == "l":
            assert float(e.values[1]) == float(e.values[2]) == pytest.approx(a["i_L_min"], rel=1e-5, abs=1e-12)
        if e.kind == "T":
            assert float(e.values[2]) == pytest.approx(a["i_M_min"], rel=1e-5, abs=1e-12)


@pytest.mark.parametrize("case", fl.lib.CASES, ids=IDS)
def test_the_current_dots_move_about_the_chosen_pace(case) -> None:
    import math

    c = fl.current_bar(case)
    assert 1 <= c <= 100
    load = abs(fl.lib.analytic(case)["v_out_avg"]) / fl.lib.case_params(case)["R"]
    px = 1.7 * 16 * load * math.exp(c / 3.5 - 14.2)
    assert fl.DOT_PX / 1.2 < px < fl.DOT_PX * 1.2
