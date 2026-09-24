"""The SPICE library's generator (scripts/sim_library.py): its schematics against its netlists, the
LTspice geometry it relies on, and the committed files (ngspice itself runs in the CI's spice job)."""

from __future__ import annotations

import importlib.util
import json
import re
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[3]


def _load():
    spec = importlib.util.spec_from_file_location("sim_library", ROOT / "scripts" / "sim_library.py")
    mod = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    sys.modules["sim_library"] = mod
    spec.loader.exec_module(mod)
    return mod


sl = _load()
IDS = [c["id"] for c in sl.CASES]


def test_ltspice_orientations_match_its_example_schematics() -> None:
    # LTspice's Educational/Vswitch.asc: a switch placed at (192, 272) mirrored (M180) has its switch
    # pins at (192, 256) and (192, 176) and its control pins at (144, 192) and (144, 240), where that
    # schematic's wires end; a resistor at (320, 128) turned by R90 spans (304, 144) to (224, 144)
    assert sl.pins_at("sw", (192, 272), "M180") == [(192, 256), (192, 176), (144, 192), (144, 240)]
    assert sl.pins_at("res", (320, 128), "R90") == [(304, 144), (224, 144)]
    # Educational/Transformer.asc: ind2 at (96, 288) M180 from (112, 272) up to (112, 192), and at
    # (176, 176) M0 from (160, 192) down to (160, 272)
    assert sl.pins_at("ind2", (96, 288), "M180") == [(112, 272), (112, 192)]
    assert sl.pins_at("ind2", (176, 176), "M0") == [(160, 192), (160, 272)]


def test_place2_puts_each_pin_where_asked() -> None:
    for sym in ("res", "cap", "ind", "diode", "voltage"):
        (a, b) = sl.LTSPICE_PINS[sym]
        span = abs(b[1] - a[1])
        for p1, p2 in (((0, 0), (0, span)), ((0, span), (0, 0)), ((0, 0), (span, 0)), ((span, 0), (0, 0))):
            origin, orient = sl.place2(sym, p1, p2)
            assert sl.pins_at(sym, origin, orient) == [p1, p2]
    with pytest.raises(ValueError):
        sl.place2("res", (0, 0), (0, 64))  # a resistor's pins are 80 apart


@pytest.mark.parametrize("case", sl.CASES, ids=IDS)
def test_every_schematic_reads_back_as_its_netlist(case) -> None:
    assert sl.check_schematic(case, sl.schematic(case)) == []


@pytest.mark.parametrize("case", sl.CASES, ids=IDS)
def test_the_netlist_carries_every_part_once(case) -> None:
    text = sl.netlist(case)
    lines = [re.split(r"\s+;", line)[0].rstrip() for line in text.splitlines() if re.match(r"^[VSDLCRK]\w*\s", line)]
    assert sorted(lines) == sorted(p.line() for p in sl.parts(case))
    assert text.rstrip().endswith(".end")


def _mutations(asc: str):
    """(what, changed schematic) for small drawing mistakes the check must catch."""
    lines = asc.splitlines()
    wires = [i for i, line in enumerate(lines) if line.startswith("WIRE ")]
    flags = [i for i, line in enumerate(lines) if line.startswith("FLAG ") and not line.endswith(" 0")]
    symbols = [i for i, line in enumerate(lines) if line.startswith("SYMBOL ")]
    yield "a wire removed", "\n".join(lines[: wires[0]] + lines[wires[0] + 1 :])
    f = lines[flags[-1]].split()
    yield "a label renamed", "\n".join(lines[: flags[-1]] + [" ".join(f[:3] + [f[3] + "x"])] + lines[flags[-1] + 1 :])
    s = lines[symbols[-1]].split()
    moved = " ".join(s[:2] + [str(int(s[2]) + 16), s[3], s[4]])
    yield "a symbol moved", "\n".join(lines[: symbols[-1]] + [moved] + lines[symbols[-1] + 1 :])
    d = next(i for i in symbols if lines[i].split()[1] == "diode")
    ds = lines[d].split()
    turned = {"R0": "R180", "R180": "R0", "R90": "R270", "R270": "R90"}[ds[4]]
    flipped = " ".join(ds[:4] + [turned])
    yield "a diode turned round", "\n".join(lines[:d] + [flipped] + lines[d + 1 :])
    t = next(i for i, line in enumerate(lines) if line.startswith("TEXT") and "!.param Vg=" in line)
    yield "a parameter changed", "\n".join(lines[:t] + [lines[t].replace("Vg=", "Vg=1", 1)] + lines[t + 1 :])


@pytest.mark.parametrize("case", sl.CASES, ids=IDS)
def test_the_schematic_check_catches_drawing_mistakes(case) -> None:
    asc = sl.schematic(case)
    for what, changed in _mutations(asc):
        assert changed != asc, what
        assert sl.check_schematic(case, changed), f"{case['id']}: {what} went unnoticed"


def test_a_pin_on_a_wire_without_a_joint_is_reported() -> None:
    case = sl.CASES[0]
    asc = sl.schematic(case)
    # join two collinear wires into one that passes over the switch node's joint
    assert "WIRE 208 64 256 64" in asc and "WIRE 256 64 288 64" in asc
    joined = asc.replace("WIRE 208 64 256 64\n", "").replace("WIRE 256 64 288 64", "WIRE 208 64 288 64")
    errors = sl.check_schematic(case, joined)
    assert any("inside the wire" in e for e in errors)


def test_numbers_in_spice_notation() -> None:
    assert [sl.eng(x) for x in (1e5, 1e-4, 1e-5, 1e-3, 1e6, 1e-11, 2e-4, 24.0)] == ["100k", "100u", "10u", "1m", "1Meg", "10p", "200u", "24"]


@pytest.mark.parametrize("case", sl.CASES, ids=IDS)
def test_the_ideal_values_come_from_the_catalogue(case) -> None:
    from pe_core.numeric import evaluate

    a = sl.analytic(case)
    p = sl.case_params(case)
    t = case["topology"]
    if t == "buck" and case["id"].endswith("ccm"):
        assert a["v_out_avg"] == pytest.approx(evaluate("buck.ccm.M", D=p["D"]) * p["Vg"])
    if t == "flyback" and case["id"].endswith("ccm"):
        assert a["v_out_avg"] == pytest.approx(p["n"] * p["D"] / (1 - p["D"]) * p["Vg"])
    # every compared quantity is one the netlist records
    names = set(sl.quantities(case, p))
    assert {k.rsplit("_", 1)[0] for k in a} <= names


def test_the_committed_files_are_the_generators() -> None:
    """Without ngspice: the files drawn from results.json (READMEs, waveforms) and the ones written
    from the parts (netlists, schematics) are what is committed; ngspice's numbers themselves are
    checked in the spice job (sim_library.py --check)."""
    pytest.importorskip("matplotlib")
    pytest.importorskip("schemdraw")
    results = json.loads((ROOT / "sim" / "results.json").read_text(encoding="utf-8"))
    stale = [str(p.relative_to(ROOT)) for p, text in sl.files(results).items() if not p.exists() or p.read_text(encoding="utf-8") != text]
    assert stale == []
    for c in sl.CASES:
        rec = results["cases"][c["id"]]
        assert rec["params"] == sl.case_params(c) and rec["cycles"] == c["cycles"]
        # ngspice's values in results.json within 1 % of the ideal equations, and settled
        assert sl.compare(c, rec["values"], sl.analytic(c)) == []
