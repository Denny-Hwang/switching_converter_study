#!/usr/bin/env python3
"""sim_library -- the SPICE library in sim/: ngspice netlists and LTspice schematics.

Each case is a converter with the numbers of a synthetic example, the same
example the in-browser simulator's preset of that name opens with:

  sim/ngspice/<topology>/<case>.cir   a netlist ngspice runs as it is
  sim/ltspice/<topology>/<case>.asc   the same circuit as an LTspice schematic
  sim/<ngspice|ltspice>/<topology>/README.md   how to run it, what to plot,
                                      the waveforms and numbers to expect
  sim/waveforms/<case>.svg            the last two periods as ngspice computes them
  sim/results.json                    ngspice's numbers for every case: its
                                      measurements, the waveforms at STEPS
                                      points a period, and the analytic values
                                      from the equation catalogue they are
                                      checked against

The circuits are near-ideal: a switch of 1 mOhm (1 MOhm off), diodes that
drop about 30 mV at an ampere, transformers as coupled inductors with a
coupling of 1 (the magnetizing inductance on the primary, 1:n with
n = N_s/N_p). So ngspice's output voltage, inductor currents and switch
voltage must agree with the catalogue's ideal equations within TOL of their
scale, and the run must end in a steady state (the output's average over the
last period within SETTLED of the period before). The .asc and the .cir are
written from the same list of parts; the check reads every .asc back into a
netlist (LTspice's symbol pins from LTSPICE_PINS) and compares it part by part
and node by node with the .cir.

    python scripts/sim_library.py            # write every file (runs ngspice)
    python scripts/sim_library.py --check    # fail if a file is stale, or if ngspice
                                             # now computes other numbers than results.json

Needs ngspice on the PATH and python[figures] for the waveforms.
"""

from __future__ import annotations

import argparse
import json
import math
import re
import shutil
import subprocess
import sys
import tempfile
from dataclasses import dataclass
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "python"))
sys.path.insert(0, str(ROOT / "scripts"))

from pe_core.numeric import evaluate  # noqa: E402

SIM = ROOT / "sim"
EXAMPLES = ROOT / "examples" / "synthetic"
RESULTS = SIM / "results.json"
WAVES = SIM / "waveforms"

# Time steps per switching period: the .tran step and maximum step, and the
# points per period at which the waveforms are recorded.
STEPS = 200
# The waveforms cover the last PLOTTED periods.
PLOTTED = 2
# ngspice's values against the ideal equations: within TOL of the quantity's
# scale (its largest magnitude in the period; for a ripple, its swing)
TOL = 0.01
# and the output's average over the last period against the period before
SETTLED = 1e-4
# a rerun against results.json: within RERUN of each quantity's scale
RERUN = 1e-3

# fmt: off
CASES: list[dict] = [
    # id, topology, the synthetic example (and the simulator preset that opens it), periods simulated
    {"id": "buck-ccm", "topology": "buck", "example": "buck-basic", "preset": "buck", "cycles": 400},
    {"id": "buck-dcm", "topology": "buck", "example": "buck-light-load", "preset": "buck-light", "cycles": 1500},
    {"id": "boost-ccm", "topology": "boost", "example": "boost-ideal", "preset": "boost", "cycles": 800},
    {"id": "buckboost-ccm", "topology": "buckboost", "example": "buckboost-basic", "preset": "buckboost", "cycles": 1200},
    {"id": "flyback-ccm", "topology": "flyback", "example": "flyback-ccm", "preset": "flyback-ccm", "cycles": 1500},
    {"id": "flyback-dcm", "topology": "flyback", "example": "flyback-dcm", "preset": "flyback-dcm", "cycles": 2500},
    {"id": "forward-ccm", "topology": "forward", "example": "forward-basic", "preset": "forward", "cycles": 1200},
]
# fmt: on

TITLES = {
    "buck": ("Buck converter", "벅 컨버터"),
    "boost": ("Boost converter", "부스트 컨버터"),
    "buckboost": ("Buck-boost converter (inverting)", "벅-부스트 컨버터(반전형)"),
    "flyback": ("Flyback converter", "플라이백 컨버터"),
    "forward": ("Forward converter with a reset winding", "리셋 권선이 있는 포워드 컨버터"),
}

# The parts every case shares (near-ideal; not from any design)
SWITCH_MODEL = ".model SWITCH SW(Ron=1m Roff=1Meg Vt=0.5 Vh=0)"
DIODE_MODEL = ".model DIODE D(Is=1n N=0.05)"
# the gate's edges; the pulse is D*Ts long at half its height, so the switch (Vt = 0.5 V) is on for D*Ts
EDGE = "10n"
# the forward converter's drain capacitance (see parts())
C_DRAIN = "10p"


@dataclass(frozen=True)
class Part:
    """One element: its SPICE name, nodes and value text (what follows the nodes on its line)."""

    name: str
    nodes: tuple[str, ...]
    value: str
    note: str = ""

    def line(self) -> str:
        return " ".join([self.name, *self.nodes, self.value])


def example(name: str) -> dict:
    return yaml.safe_load((EXAMPLES / f"{name}.yaml").read_text(encoding="utf-8"))


def eng(x: float) -> str:
    """A SPICE number with a scale suffix (100k, 10u, 1Meg); 'm' is milli, as in SPICE."""
    if x == 0:
        return "0"
    for factor, suffix in ((1e9, "G"), (1e6, "Meg"), (1e3, "k"), (1.0, ""), (1e-3, "m"), (1e-6, "u"), (1e-9, "n"), (1e-12, "p")):
        if abs(x) >= factor * 0.999999:
            return f"{x / factor:.6g}{suffix}"
    return f"{x:.6g}"


def plain(x: float) -> str:
    return f"{x:.6g}"


def case_params(case: dict) -> dict[str, float]:
    """The example's numbers under the netlists' parameter names."""
    # PyYAML reads 1.0e5 (no sign in the exponent) as a string
    p = {k: float(v) for k, v in example(case["example"])["params"].items()}
    t = case["topology"]
    out = {"Vg": p["V_g"], "D": p["D"], "fs": p["f_s"], "C": p["C"], "R": p["R"]}
    if t in ("flyback", "forward"):
        out["Lm"] = p["L_M"]
        out["n"] = p["n"]
    if t != "flyback":
        out["L"] = p["L"]
    if t == "forward":
        out["nr"] = p["n_r"]
    if p.get("V_D"):
        raise ValueError(f"{case['id']}: the library's diodes are near-ideal; the example's V_D would need a model")
    return out


PARAM_ORDER = ("Vg", "D", "fs", "L", "Lm", "n", "nr", "C", "R")
SCALED = {"fs", "L", "Lm", "C"}  # written with a scale suffix; the others as plain numbers


def param_line(p: dict[str, float]) -> str:
    items = [f"{k}={eng(p[k]) if k in SCALED else plain(p[k])}" for k in PARAM_ORDER if k in p]
    return ".param " + " ".join(items)


def parts(case: dict) -> list[Part]:
    """The circuit, from its schematic (docs: the topology pages' figures). Node names: in, gate, sw or d
    (the switch's node), out, and the transformers' winding ends; 0 is ground."""
    t = case["topology"]
    out = [
        Part("V1", ("in", "0"), "{Vg}", "input voltage"),
        Part("Vgate", ("gate", "0"), f"PULSE(0 1 0 {EDGE} {EDGE} {{D*Ts-{EDGE}}} {{Ts}})", "gate: 1 V for D*Ts every period"),
    ]
    if t == "buck":
        out += [
            Part("S1", ("in", "sw", "gate", "0"), "SWITCH", "switch, on while the gate is high"),
            Part("D1", ("0", "sw"), "DIODE", "diode, anode at ground"),
            Part("L1", ("sw", "out"), "{L}", "inductor"),
        ]
    elif t == "boost":
        out += [
            Part("L1", ("in", "sw"), "{L}", "inductor"),
            Part("S1", ("sw", "0", "gate", "0"), "SWITCH", "switch, on while the gate is high"),
            Part("D1", ("sw", "out"), "DIODE", "diode"),
        ]
    elif t == "buckboost":
        out += [
            Part("S1", ("in", "sw", "gate", "0"), "SWITCH", "switch, on while the gate is high"),
            Part("L1", ("sw", "0"), "{L}", "inductor"),
            Part("D1", ("out", "sw"), "DIODE", "diode: the output is below ground"),
        ]
    elif t == "flyback":
        out += [
            Part("Lp", ("in", "d"), "{Lm}", "primary winding: the magnetizing inductance (dot at in)"),
            Part("Ls", ("0", "sx"), "{n*n*Lm}", "secondary winding, n^2 Lm (dot at ground)"),
            Part("K1", (), "Lp Ls 1", "coupling 1: an ideal transformer beside Lm, n = sqrt(Ls/Lp)"),
            Part("S1", ("d", "0", "gate", "0"), "SWITCH", "switch, on while the gate is high"),
            Part("D1", ("sx", "out"), "DIODE", "output diode"),
        ]
    elif t == "forward":
        out += [
            Part("Lp", ("in", "d"), "{Lm}", "primary winding: the magnetizing inductance (dot at in)"),
            Part("Ls", ("s1", "0"), "{n*n*Lm}", "secondary winding (dot at s1)"),
            Part("Lr", ("0", "rn"), "{nr*nr*Lm}", "reset winding, nr^2 Lm (dot at ground)"),
            Part("K1", (), "Lp Ls 1", "the windings coupled pairwise with 1"),
            Part("K2", (), "Lp Lr 1", ""),
            Part("K3", (), "Ls Lr 1", ""),
            Part("S1", ("d", "0", "gate", "0"), "SWITCH", "switch, on while the gate is high"),
            # With three windings coupled with 1, SPICE needs a capacitance at the drain for the
            # current to pass from the primary to the reset winding at turn-off; 10 pF adds
            # a few mW and changes no average.
            Part("Cd", ("d", "0"), C_DRAIN, "drain capacitance, for the solver (see the README)"),
            Part("D3", ("rn", "in"), "DIODE", "reset diode: returns the magnetizing energy to the input"),
            Part("D1", ("s1", "x"), "DIODE", "forward diode"),
            Part("D2", ("0", "x"), "DIODE", "freewheeling diode"),
            Part("L1", ("x", "out"), "{L}", "output inductor"),
        ]
    else:
        raise ValueError(t)
    out += [Part("C1", ("out", "0"), "{C}", "output capacitor"), Part("R1", ("out", "0"), "{R}", "load")]
    return out


# The quantities each case records: name -> (ngspice vector expression, LTspice trace, unit, label).
# "i_M" is the magnetizing current referred to the primary: the primary's current plus n (and n_r)
# times the other windings' currents, each entering its dotted end.
def quantities(case: dict, p: dict[str, float]) -> dict[str, tuple[str, str, str, str]]:
    t = case["topology"]
    node = "sw" if t in ("buck", "boost", "buckboost") else "d"
    q = {"v_sw": (f"v({node})", f"V({node})", "V", "switch node" if t in ("buck", "buckboost") else "switch voltage")}
    if t == "flyback":
        n = plain(p["n"])
        q["i_p"] = ("i(lp)", "I(Lp)", "A", "primary current")
        q["i_s_ref"] = (f"{n}*i(ls)", f"{n}*I(Ls)", "A", "secondary current times n")
        q["i_M"] = (f"i(lp)+{n}*i(ls)", f"I(Lp)+{n}*I(Ls)", "A", "magnetizing current")
    else:
        q["i_L"] = ("i(l1)", "I(L1)", "A", "inductor current" if t != "forward" else "output inductor current")
    if t == "forward":
        n, nr = plain(p["n"]), plain(p["nr"])
        q["i_M"] = (f"i(lp)+{n}*i(ls)+{nr}*i(lr)", f"I(Lp)+{n}*I(Ls)+{nr}*I(Lr)", "A", "magnetizing current")
    q["v_out"] = ("v(out)", "V(out)", "V", "output voltage")
    return q


def title(case: dict) -> str:
    mode = "CCM" if case["id"].endswith("-ccm") else "DCM"
    return f"{TITLES[case['topology']][0]}, {mode}"


def netlist(case: dict) -> str:
    """The .cir: a deck ngspice runs as it is (ngspice -b prints the measurements)."""
    p = case_params(case)
    ex = example(case["example"])
    cyc = case["cycles"]
    ps = parts(case)
    lines = [
        f"* {title(case)}: {ex['label']} (examples/synthetic/{case['example']}.yaml),",
        f"* the numbers of the in-browser simulator's preset \"{case['preset']}\".",
        "* Near-ideal parts: a 1 mOhm switch and diodes of about 30 mV (not from any design).",
        f"* Generated by scripts/sim_library.py; the same circuit as sim/ltspice/{case['topology']}/{case['id']}.asc.",
        "*",
        f"*   ngspice -b {case['id']}.cir         run it and print the measurements of the last period",
        f"*   ngspice {case['id']}.cir            then: run, and plot what the README lists",
        "",
        param_line(p),
        ".param Ts={1/fs}",
        "",
    ]
    width = max(len(x.line()) for x in ps)
    for x in ps:
        lines.append(f"{x.line():<{width}}  ; {x.note}" if x.note else x.line())
    lines += [
        "",
        SWITCH_MODEL,
        DIODE_MODEL,
        "",
        f"* {cyc} periods from rest; the last one is measured",
        f".tran {{Ts/{STEPS}}} {{{cyc}*Ts}} 0 {{Ts/{STEPS}}} uic",
        # Gear's integration, and a relative tolerance of 1e-4 (ngspice's default is 1e-3): with the
        # default the diode's current can overshoot through zero within a step as its conduction
        # ends in DCM, and the winding voltage jumps for that instant
        ".options method=gear reltol=1e-4",
    ]
    for name, (vec, _lt, _unit, _label) in quantities(case, p).items():
        if "*" in vec or "+" in vec:
            continue  # ngspice's .meas takes a node voltage or a branch current, not a sum
        for fn in ("AVG", "MAX", "MIN"):
            lines.append(f".meas tran {name}_{fn.lower()} {fn} {vec} from={{{cyc - 1}*Ts}} to={{{cyc}*Ts}}")
    lines += [".end", ""]
    return "\n".join(lines)


# ---- LTspice ----------------------------------------------------------------------------------

# The pins of the LTspice symbols the schematics use, in their SPICE order, in the symbol's own
# coordinates: read from LTspice's lib/sym/*.asy (res, cap, ind, ind2, diode, voltage, sw).
LTSPICE_PINS: dict[str, list[tuple[int, int]]] = {
    "res": [(16, 16), (16, 96)],
    "cap": [(16, 0), (16, 64)],
    "ind": [(16, 16), (16, 96)],
    "ind2": [(16, 16), (16, 96)],
    "diode": [(16, 0), (16, 64)],
    "voltage": [(0, 16), (0, 96)],
    "sw": [(0, 16), (0, 96), (-48, 80), (-48, 32)],  # A, B, NC+, NC-
}
# A placement's orientation: R rotates by 90 degrees steps (y points down, as on LTspice's sheet),
# M mirrors x first. R90 and M180 are checked against LTspice's own example schematics.
ORIENT = {
    "R0": lambda x, y: (x, y),
    "R90": lambda x, y: (-y, x),
    "R180": lambda x, y: (-x, -y),
    "R270": lambda x, y: (y, -x),
    "M0": lambda x, y: (-x, y),
    "M180": lambda x, y: (x, -y),
}
# a symbol by the part's first letter; windings are drawn with a phase dot
SYMBOL = {"V": "voltage", "S": "sw", "D": "diode", "C": "cap", "R": "res"}
# labels beside a horizontal two-pin symbol (the placements LTspice itself writes)
WINDOWS = {
    ("res", "R270"): ["WINDOW 0 32 56 VTop 2", "WINDOW 3 0 56 VBottom 2"],
    ("ind", "R270"): ["WINDOW 0 32 56 VTop 2", "WINDOW 3 5 56 VBottom 2"],
    ("ind2", "R270"): ["WINDOW 0 32 56 VTop 2", "WINDOW 3 5 56 VBottom 2"],
    ("diode", "R270"): ["WINDOW 0 32 32 VTop 2", "WINDOW 3 0 32 VBottom 2"],
    ("diode", "R90"): ["WINDOW 0 0 32 VBottom 2", "WINDOW 3 32 32 VTop 2"],
}

Point = tuple[int, int]


def pins_at(symbol: str, origin: Point, orient: str) -> list[Point]:
    f = ORIENT[orient]
    return [(origin[0] + f(x, y)[0], origin[1] + f(x, y)[1]) for x, y in LTSPICE_PINS[symbol]]


def place2(symbol: str, p1: Point, p2: Point) -> tuple[Point, str]:
    """The origin and rotation that put a two-pin symbol's first pin on p1 and its second on p2."""
    for orient in ("R0", "R90", "R180", "R270"):
        a, b = (ORIENT[orient](*xy) for xy in LTSPICE_PINS[symbol])
        origin = (p1[0] - a[0], p1[1] - a[1])
        if (origin[0] + b[0], origin[1] + b[1]) == p2:
            return origin, orient
    raise ValueError(f"{symbol}: no rotation puts its pins on {p1} and {p2}")


class Sheet:
    """An LTspice schematic being drawn: symbols, wires, net labels (FLAG) and text."""

    def __init__(self, case: dict) -> None:
        self.parts = {x.name: x for x in parts(case)}
        self.symbols: list[tuple[str, Point, str, str]] = []  # symbol, origin, orientation, part name
        self.wires: list[tuple[Point, Point]] = []
        self.flags: list[tuple[Point, str]] = []

    def symbol_of(self, name: str) -> str:
        return "ind2" if name in ("Lp", "Ls", "Lr") else "ind" if name[0] == "L" else SYMBOL[name[0]]

    def two(self, name: str, p1: Point, p2: Point) -> None:
        """A two-pin part from its first node's pin at p1 to its second node's at p2."""
        sym = self.symbol_of(name)
        origin, orient = place2(sym, p1, p2)
        self.symbols.append((sym, origin, orient, name))

    def switch(self, name: str, a: Point, orient: str) -> None:
        """The switch with its pin A at a; its control pins take the gate's and ground's labels."""
        f = ORIENT[orient]
        dx, dy = f(*LTSPICE_PINS["sw"][0])
        origin = (a[0] - dx, a[1] - dy)
        self.symbols.append(("sw", origin, orient, name))
        _a, _b, ncp, ncm = pins_at("sw", origin, orient)
        # a short stub from each control pin, away from the switch, to its label
        away = {"R0": (-32, 0), "R270": (0, 32)}[orient]
        for pin, net in ((ncp, "gate"), (ncm, "0")):
            end = (pin[0] + away[0], pin[1] + away[1])
            self.wire(pin, end)
            self.flags.append((end, net))

    def wire(self, *points: Point) -> None:
        for a, b in zip(points, points[1:]):
            self.wires.append((a, b))

    def flag(self, point: Point, name: str) -> None:
        self.flags.append((point, name))


def layout(case: dict) -> Sheet:
    """Where each part sits. Every net carries the .cir's node name as a label, so LTspice's traces
    have the same names (V(out), V(sw)); ground and the gate are joined by their labels."""
    t = case["topology"]
    sh = Sheet(case)
    # the input: V1 on the left, the gate's source below it (joined to the switch by its label)
    sh.two("V1", (0, 96), (0, 176))
    sh.wire((0, 64), (0, 96))
    sh.flag((0, 64), "in")
    sh.flag((0, 176), "0")
    sh.two("Vgate", (0, 288), (0, 368))
    sh.flag((0, 288), "gate")
    sh.flag((0, 368), "0")

    def load(x: int, frm: Point) -> None:
        """C1 at x and R1 96 to its right, fed along the top from `frm`; the output's label at C1."""
        sh.wire(frm, (x, 64))
        sh.two("C1", (x, 112), (x, 176))
        sh.wire((x, 64), (x, 112))
        sh.flag((x, 176), "0")
        sh.two("R1", (x + 96, 96), (x + 96, 176))
        sh.wire((x, 64), (x + 96, 64), (x + 96, 96))
        sh.flag((x + 96, 176), "0")
        sh.flag((x, 64), "out")

    if t == "buck":
        sh.switch("S1", (128, 64), "R270")  # A at (128,64), B at (208,64)
        sh.wire((0, 64), (128, 64))
        sh.wire((208, 64), (256, 64))
        sh.two("D1", (256, 176), (256, 112))  # anode at ground, cathode up at the switch node
        sh.wire((256, 64), (256, 112))
        sh.flag((256, 176), "0")
        sh.two("L1", (288, 64), (368, 64))
        sh.wire((256, 64), (288, 64))
        sh.flag((256, 64), "sw")
        load(448, (368, 64))
    elif t == "boost":
        sh.two("L1", (64, 64), (144, 64))
        sh.wire((0, 64), (64, 64))
        sh.wire((144, 64), (192, 64))
        sh.switch("S1", (192, 96), "R0")  # A at the switch node, B at ground
        sh.wire((192, 64), (192, 96))
        sh.flag((192, 176), "0")
        sh.two("D1", (224, 64), (288, 64))
        sh.wire((192, 64), (224, 64))
        sh.flag((192, 64), "sw")
        load(368, (288, 64))
    elif t == "buckboost":
        sh.switch("S1", (128, 64), "R270")
        sh.wire((0, 64), (128, 64))
        sh.wire((208, 64), (256, 64))
        sh.two("L1", (256, 96), (256, 176))  # from the switch node down to ground
        sh.wire((256, 64), (256, 96))
        sh.flag((256, 176), "0")
        sh.two("D1", (352, 64), (288, 64))  # anode at the output, cathode at the switch node
        sh.wire((256, 64), (288, 64))
        sh.flag((256, 64), "sw")
        load(432, (352, 64))
    elif t == "flyback":
        sh.two("Lp", (128, 96), (128, 176))  # in at the top, the drain below
        sh.wire((0, 64), (128, 64), (128, 96))
        sh.switch("S1", (128, 208), "R0")
        sh.wire((128, 176), (128, 208))
        sh.flag((128, 208), "d")
        sh.flag((128, 288), "0")
        sh.two("Ls", (224, 176), (224, 96))  # ground at the bottom, sx at the top
        sh.flag((224, 176), "0")
        sh.two("D1", (272, 64), (336, 64))
        sh.wire((224, 96), (224, 64), (272, 64))
        sh.flag((224, 64), "sx")
        load(416, (336, 64))
    elif t == "forward":
        sh.two("Lp", (128, 96), (128, 176))
        sh.wire((0, 64), (128, 64))
        sh.wire((128, 64), (128, 96))
        sh.wire((128, 64), (224, 64), (224, 96))
        sh.switch("S1", (128, 208), "R0")
        sh.wire((128, 176), (128, 208))
        sh.flag((128, 288), "0")
        sh.two("Cd", (176, 224), (176, 288))
        sh.wire((128, 208), (176, 208), (176, 224))
        sh.flag((176, 288), "0")
        sh.flag((128, 208), "d")
        sh.two("D3", (224, 160), (224, 96))  # anode at rn, cathode up at the input
        sh.two("Lr", (224, 256), (224, 176))  # ground at the bottom, rn at the top
        sh.wire((224, 160), (224, 176))
        sh.flag((224, 256), "0")
        sh.flag((224, 160), "rn")
        sh.two("Ls", (320, 96), (320, 176))  # s1 at the top, ground at the bottom
        sh.flag((320, 176), "0")
        sh.two("D1", (352, 64), (416, 64))
        sh.wire((320, 96), (320, 64), (352, 64))
        sh.flag((320, 64), "s1")
        sh.two("D2", (448, 176), (448, 112))  # anode at ground, cathode up at x
        sh.wire((416, 64), (448, 64), (448, 112))
        sh.flag((448, 176), "0")
        sh.two("L1", (480, 64), (560, 64))
        sh.wire((448, 64), (480, 64))
        sh.flag((448, 64), "x")
        load(640, (560, 64))
    else:
        raise ValueError(t)
    return sh


def directives(case: dict) -> list[str]:
    """The .cir's parameter, coupling, model and analysis lines, which the schematic carries as text."""
    out = []
    for line in netlist(case).splitlines():
        if line.startswith((".param", ".model", ".tran")) or re.match(r"^K\d", line):
            out.append(line.split("  ;")[0].rstrip())
    return out


def schematic(case: dict) -> str:
    """The .asc: the parts where layout() puts them, and the .cir's directives as text."""
    sh = layout(case)
    ps = sh.parts
    xs = [x for (a, b) in sh.wires for x in (a[0], b[0])] + [pt[0] for pt, _ in sh.flags]
    ys = [y for (a, b) in sh.wires for y in (a[1], b[1])] + [pt[1] for pt, _ in sh.flags]
    bottom = max(ys) + 96
    ex = example(case["example"])
    lines = ["Version 4", f"SHEET 1 {max(xs) + 160} {bottom + 32 * (len(directives(case)) + 6)}"]
    lines += [f"WIRE {a[0]} {a[1]} {b[0]} {b[1]}" for a, b in sh.wires]
    lines += [f"FLAG {pt[0]} {pt[1]} {name}" for pt, name in sh.flags]
    for sym, (x, y), orient, name in sh.symbols:
        lines.append(f"SYMBOL {sym} {x} {y} {orient}")
        lines += WINDOWS.get((sym, orient), [])
        lines += [f"SYMATTR InstName {name}", f"SYMATTR Value {ps[name].value}"]
    y = -64
    notes = [
        f"{title(case)}: {ex['label']} (examples/synthetic/{case['example']}.yaml),",
        f"the numbers of the in-browser simulator's preset \"{case['preset']}\". Near-ideal parts, not from any design.",
        f"Generated by scripts/sim_library.py; the same circuit as sim/ngspice/{case['topology']}/{case['id']}.cir.",
    ]
    for note in notes:
        lines.append(f"TEXT -32 {y} Left 2 ;{note}")
        y += 24
    y = bottom
    for d in directives(case):
        lines.append(f"TEXT -32 {y} Left 2 !{d}")
        y += 32
    return "\n".join(lines) + "\n"


class Union:
    def __init__(self) -> None:
        self.up: dict = {}

    def find(self, a):
        self.up.setdefault(a, a)
        while self.up[a] != a:
            self.up[a] = self.up[self.up[a]]
            a = self.up[a]
        return a

    def join(self, a, b) -> None:
        self.up[self.find(a)] = self.find(b)


def read_schematic(text: str) -> tuple[list[str], list[str], list[str]]:
    """An .asc read back as LTspice would: each symbol's pins from LTSPICE_PINS, wires joined at
    their ends, labels joining the nets they name. Returns (part lines 'name node... value' with
    the label names as nodes, directive lines, problems)."""
    problems: list[str] = []
    wires, flags, symbols, texts = [], [], [], []
    current = None
    for line in text.splitlines():
        f = line.split()
        if not f:
            continue
        if f[0] == "WIRE":
            wires.append(((int(f[1]), int(f[2])), (int(f[3]), int(f[4]))))
        elif f[0] == "FLAG":
            flags.append(((int(f[1]), int(f[2])), f[3]))
        elif f[0] == "SYMBOL":
            current = {"sym": f[1], "origin": (int(f[2]), int(f[3])), "orient": f[4], "attrs": {}}
            symbols.append(current)
        elif f[0] == "SYMATTR" and current is not None:
            current["attrs"][f[1]] = line.split(None, 2)[2] if len(f) > 2 else ""
        elif f[0] == "TEXT":
            body = line.split(None, 5)[5]
            if body.startswith("!"):
                texts.append(body[1:])
    uf = Union()
    points = set()
    for a, b in wires:
        if a == b or (a[0] != b[0] and a[1] != b[1]):
            problems.append(f"wire {a}-{b} is not horizontal or vertical")
        uf.join(("pt", a), ("pt", b))
        points |= {a, b}
    pin_points: list[Point] = []
    for s in symbols:
        s["pins"] = pins_at(s["sym"], s["origin"], s["orient"])
        pin_points += s["pins"]
    for pt, name in flags:
        uf.join(("pt", pt), ("net", name))
    # every pin and label on a wire's end, another pin or another label; none inside a wire
    ends = points | set(pin_points) | {pt for pt, _ in flags}
    for pt in ends:
        for a, b in wires:
            inside = (a[0] == b[0] == pt[0] and min(a[1], b[1]) < pt[1] < max(a[1], b[1])) or (
                a[1] == b[1] == pt[1] and min(a[0], b[0]) < pt[0] < max(a[0], b[0])
            )
            if inside:
                problems.append(f"{pt} lies inside the wire {a}-{b} (LTspice would not join it there)")
    for pt in pin_points:
        uf.find(("pt", pt))
    touched = {pt for pt in pin_points} | points | {pt for pt, _ in flags}
    for pt in touched:
        uf.find(("pt", pt))
    names: dict = {}
    for pt, name in flags:
        root = uf.find(("net", name))
        names.setdefault(root, set()).add(name)
    for root, ns in names.items():
        if len(ns) > 1:
            problems.append(f"one net carries the labels {sorted(ns)}")

    def net(pt: Point) -> str:
        root = uf.find(("pt", pt))
        ns = names.get(root)
        if not ns:
            problems.append(f"the net at {pt} has no label")
            return f"?{pt}"
        return sorted(ns)[0]

    # a pin that touches nothing but its own symbol is left open
    counts: dict[Point, int] = {}
    for pt in pin_points:
        counts[pt] = counts.get(pt, 0) + 1
    for s in symbols:
        for pt in s["pins"]:
            if counts[pt] == 1 and pt not in points and pt not in {q for q, _ in flags}:
                problems.append(f"{s['attrs'].get('InstName')}: the pin at {pt} is open")
    lines = [" ".join([s["attrs"]["InstName"], *[net(pt) for pt in s["pins"]], s["attrs"]["Value"]]) for s in symbols]
    return lines, texts, problems


def check_schematic(case: dict, text: str) -> list[str]:
    """The .asc against the .cir: the same parts on the same nodes with the same values, and the
    same directives."""
    lines, texts, problems = read_schematic(text)
    errors = [f"{case['id']}.asc: {p}" for p in problems]
    want = sorted(x.line() for x in parts(case) if not x.name.startswith("K"))
    if sorted(lines) != want:
        errors.append(f"{case['id']}.asc: its parts {sorted(set(lines) ^ set(want))} differ from the .cir's")
    if texts != directives(case):
        errors.append(f"{case['id']}.asc: its directives differ from the .cir's")
    return errors


# ---- ngspice ------------------------------------------------------------------------------------

MEAS = re.compile(r"^(\w+)\s*=\s*([-+0-9.eE]+)")


def run_ngspice(case: dict) -> dict:
    """ngspice on the case's .cir as written, plus a control block that measures every quantity over
    the last period (its average, largest and smallest value, as the .cir's own .meas lines do) and
    the output's average over the period before, and records the waveforms of the last PLOTTED
    periods at STEPS points a period."""
    p = case_params(case)
    q = quantities(case, p)
    Ts = 1 / p["fs"]
    cyc = case["cycles"]
    deck = netlist(case).replace("\n.end\n", "\n")
    t_from, t_to = (cyc - 1) * Ts, cyc * Ts
    lets = [f"let q_{k.lower()} = {vec}" for k, (vec, *_rest) in q.items()]
    meas = [
        f"meas tran q_{k.lower()}_{fn.lower()} {fn} q_{k.lower()} from={t_from:.12g} to={t_to:.12g}"
        for k in q
        for fn in ("AVG", "MAX", "MIN")
    ]
    names = " ".join(f"q_{k.lower()}" for k in q)
    control = [
        ".control",
        # from a period before the recorded ones, for the steady-state check
        f"tran {Ts / STEPS:.12g} {cyc * Ts:.12g} {(cyc - PLOTTED - 1) * Ts:.12g} {Ts / STEPS:.12g} uic",
        *lets,
        *meas,
        f"meas tran prev_avg AVG v(out) from={(cyc - 2) * Ts:.12g} to={(cyc - 1) * Ts:.12g}",
        "linearize",
        *lets,
        "set wr_singlescale",
        "set wr_vecnames",
        "option numdgt=12",
        f"wrdata waves.txt {names}",
        "quit",
        ".endc",
        ".end",
        "",
    ]
    with tempfile.TemporaryDirectory() as tmp:
        path = Path(tmp) / f"{case['id']}.cir"
        path.write_text(deck + "\n".join(control), encoding="utf-8")
        out = subprocess.run(["ngspice", "-b", path.name], cwd=tmp, capture_output=True, text=True, timeout=1800)
        text = out.stdout + out.stderr
        waves = Path(tmp) / "waves.txt"
        if not waves.exists():
            raise RuntimeError(f"{case['id']}: ngspice wrote no waveforms\n{text[-3000:]}")
        rows = [line.split() for line in waves.read_text().splitlines()]
    header, data = rows[0], [[float(v) for v in r] for r in rows[1:]]
    found: dict[str, float] = {}
    for line in text.splitlines():
        m = MEAS.match(line.strip())
        if m:
            found[m.group(1).lower()] = float(m.group(2))
    values = {}
    for k in q:
        for fn in ("avg", "max", "min"):
            key = f"q_{k.lower()}_{fn}"
            if key not in found:
                raise RuntimeError(f"{case['id']}: ngspice gave no {key}\n{text[-3000:]}")
            values[f"{k}_{fn}"] = found[key]
    if "prev_avg" not in found:
        raise RuntimeError(f"{case['id']}: ngspice gave no prev_avg\n{text[-3000:]}")
    values["v_out_prev_avg"] = found["prev_avg"]
    # what the .cir's own .meas lines print (ngspice -b), for the README
    printed = {k: v for k, v in found.items() if not k.startswith("q_") and k != "prev_avg"}
    cols = {name: [r[i] for r in data] for i, name in enumerate(header)}
    t = cols["time"]
    start = (cyc - PLOTTED) * Ts
    keep = [i for i, ti in enumerate(t) if ti >= start - Ts / STEPS / 4]
    samples = {"t": [t[i] - start for i in keep]}
    for k in q:
        samples[k] = [cols[f"q_{k.lower()}"][i] for i in keep]
    return {"values": values, "printed": printed, "samples": samples}


# ---- the ideal equations --------------------------------------------------------------------------


def analytic_with_sources(case: dict) -> dict[str, tuple[float, str]]:
    """What the catalogue's ideal equations give for the case (packages/pe-core/equations/equations.yaml),
    each value with the equations it comes from."""
    p = case_params(case)
    t = case["topology"]
    Vg, D, fs, R = p["Vg"], p["D"], p["fs"], p["R"]
    Ts = 1 / fs
    a: dict[str, tuple[float, str]] = {}
    if t == "buck":
        K = evaluate("K.def", L=p["L"], R=R, T_s=Ts)
        ccm = K > evaluate("Kcrit.buck", D=D)
        m_eq = "buck.ccm.M" if ccm else "buck.dcm.M"
        M = evaluate("buck.ccm.M", D=D) if ccm else evaluate("buck.dcm.M", D=D, K=K)
        V = M * Vg
        IL = evaluate("buck.IL", V=V, R=R)
        dI = evaluate("buck.ripple.iL", D=D, L=p["L"], T_s=Ts, V=V, V_g=Vg)
        a["v_out_avg"] = (V, m_eq)
        a["i_L_avg"] = (IL, "buck.IL")
        if ccm:
            a["i_L_max"] = (IL + dI, "buck.IL + buck.ripple.iL")
            a["i_L_min"] = (IL - dI, "buck.IL - buck.ripple.iL")
        else:
            a["i_L_max"] = (2 * dI, "2 buck.ripple.iL (DCM: from zero)")
            a["i_L_min"] = (0.0, "DCM: zero")
        a["v_sw_max"] = (Vg, "V_g")
    elif t == "boost":
        V = evaluate("boost.ccm.M", D=D) * Vg
        IL = evaluate("boost.IL", D=D, R=R, V=V)
        dI = evaluate("boost.ripple.iL", D=D, L=p["L"], T_s=Ts, V_g=Vg)
        dV = evaluate("boost.ripple.v", C=p["C"], D=D, R=R, T_s=Ts, V=V)
        a["v_out_avg"] = (V, "boost.ccm.M")
        a["i_L_avg"] = (IL, "boost.IL")
        a["i_L_max"] = (IL + dI, "boost.IL + boost.ripple.iL")
        a["i_L_min"] = (IL - dI, "boost.IL - boost.ripple.iL")
        # the switch blocks the output's peak (plus the diode's drop)
        a["v_sw_max"] = (V + dV, "V + boost.ripple.v")
    elif t == "buckboost":
        V = evaluate("buckboost.ccm.M", D=D) * Vg  # negative: the output is below ground
        IL = abs(evaluate("buckboost.IL", D=D, R=R, V=V))
        dI = evaluate("buckboost.ripple.iL", D=D, L=p["L"], T_s=Ts, V_g=Vg)
        dV = abs(evaluate("buckboost.ripple.v", C=p["C"], D=D, R=R, T_s=Ts, V=V))
        a["v_out_avg"] = (V, "buckboost.ccm.M")
        a["i_L_avg"] = (IL, "buckboost.IL")
        a["i_L_max"] = (IL + dI, "buckboost.IL + buckboost.ripple.iL")
        a["i_L_min"] = (IL - dI, "buckboost.IL - buckboost.ripple.iL")
        # the switch node: the input while on, the output's lowest (less the diode's drop) while off
        a["v_sw_max"] = (Vg, "V_g")
        a["v_sw_min"] = (V - dV, "V - buckboost.ripple.v")
    elif t == "flyback":
        K = evaluate("K.def", L=p["Lm"], R=R, T_s=Ts)
        ccm = K > evaluate("Kcrit.flyback", D=D, n=p["n"])
        if ccm:
            V = evaluate("flyback.ccm.M", D=D, n=p["n"]) * Vg
            IM = evaluate("flyback.IM", D=D, R=R, V=V, n=p["n"])
            dI = evaluate("flyback.ripple.iM", D=D, L_M=p["Lm"], T_s=Ts, V_g=Vg)
            dV = evaluate("flyback.ripple.v", C=p["C"], D=D, R=R, T_s=Ts, V=V)
            a["i_M_avg"] = (IM, "flyback.IM")
            a["i_M_max"] = (IM + dI, "flyback.IM + flyback.ripple.iM")
            a["i_M_min"] = (IM - dI, "flyback.IM - flyback.ripple.iM")
            a["v_out_avg"] = (V, "flyback.ccm.M")
            # the switch: the input plus the output's peak reflected to the primary
            a["v_sw_max"] = (Vg + (V + dV) / p["n"], "V_g + (V + flyback.ripple.v)/n")
        else:
            V = evaluate("flyback.dcm.M", D=D, K=K) * Vg
            a["i_M_max"] = (evaluate("flyback.Ipk.dcm", D=D, L_M=p["Lm"], V_g=Vg, f_s=fs), "flyback.Ipk.dcm")
            a["i_M_min"] = (0.0, "DCM: zero")
            a["v_out_avg"] = (V, "flyback.dcm.M")
            a["v_sw_max"] = (Vg + V / p["n"], "V_g + V/n")
    elif t == "forward":
        V = evaluate("forward.ccm.M", D=D, n=p["n"]) * Vg
        IL = evaluate("buck.IL", V=V, R=R)
        dI = evaluate("forward.ripple.iL", D=D, L=p["L"], T_s=Ts, V=V, V_g=Vg, n=p["n"])
        a["v_out_avg"] = (V, "forward.ccm.M")
        a["i_L_avg"] = (IL, "buck.IL")
        a["i_L_max"] = (IL + dI, "buck.IL + forward.ripple.iL")
        a["i_L_min"] = (IL - dI, "buck.IL - forward.ripple.iL")
        # while the core resets through the winding of n_r
        a["v_sw_max"] = (Vg * (1 + 1 / p["nr"]), "V_g (1 + 1/n_r)")
    return a


def analytic(case: dict) -> dict[str, float]:
    return {k: v for k, (v, _src) in analytic_with_sources(case).items()}


def compare(case: dict, got: dict[str, float], want: dict[str, float]) -> list[str]:
    """ngspice against the ideal equations: each value within TOL of its quantity's scale."""
    errors = []
    for key, w in want.items():
        q = key.rsplit("_", 1)[0]
        scale = max(abs(got[f"{q}_max"]), abs(got[f"{q}_min"]), 1e-12)
        if abs(got[key] - w) > TOL * scale:
            errors.append(f"{case['id']}: {key} = {got[key]:.6g} from ngspice, {w:.6g} from the equations (beyond {TOL:.0%} of {scale:.4g})")
    v, prev = got["v_out_avg"], got["v_out_prev_avg"]
    if abs(v - prev) > SETTLED * abs(v):
        errors.append(f"{case['id']}: not settled: the output's average moved by {v - prev:.3g} V in the last period")
    return errors


# ---- waveforms --------------------------------------------------------------------------------


def waveform_svg(case: dict, rec: dict) -> str:
    """The last PLOTTED periods as ngspice computed them (from results.json): the switch's voltage,
    the currents, the output voltage. Drawn like the site's figures (scripts/gen_figures.py), with an
    ink that follows the reader's light or dark colour scheme."""
    import gen_figures as gf  # noqa: PLC0415 - matplotlib and its pinned settings; only drawing needs them

    plt = gf.plt
    s = rec["samples"]
    t = [x * 1e6 for x in s["t"]]
    q = rec["quantities"]
    panels: list[list[tuple[str, str]]] = [[("v_sw", gf.BLUE)]]
    if case["topology"] == "flyback":
        panels.append([("i_p", gf.GREEN), ("i_s_ref", gf.ORANGE)])
    else:
        panels.append([("i_L", gf.GREEN)])
    if case["topology"] == "forward":
        panels.append([("i_M", gf.ORANGE)])
    panels.append([("v_out", gf.BLUE)])
    fig, axes = plt.subplots(len(panels), 1, figsize=(6.4, 1.45 * len(panels) + 0.3), sharex=True, gridspec_kw={"hspace": 0.45})
    for ax, panel in zip(axes, panels):
        for key, colour in panel:
            ax.plot(t, s[key], color=colour, lw=1.4, label=f"{q[key]['label']}, {q[key]['ltspice']}")
        for side in ("top", "right"):
            ax.spines[side].set_visible(False)
        unit = q[panel[0][0]]["unit"]
        ax.set_ylabel(unit, rotation=0, ha="right", va="center")
        ax.tick_params(labelsize=10)
        ax.legend(loc="upper left", bbox_to_anchor=(1.0, 1.0), frameon=False, fontsize=10, handlelength=1.4)
        ax.grid(True, color=gf.INK, alpha=0.12, lw=0.6)
    axes[-1].set_xlabel("time in the last two periods (µs)")
    axes[-1].set_xlim(0, t[-1])
    svg = gf.finish(f"sim-{case['id']}", gf.svg_of(fig))
    style = "<style>svg{color:#1f2328}@media (prefers-color-scheme:dark){svg{color:#e6edf3}}</style>"
    svg = svg.replace(' aria-hidden="true" focusable="false"', "")
    return re.sub(r"(<svg\b[^>]*>)", r"\1" + style, svg, count=1)


# ---- READMEs --------------------------------------------------------------------------------------

SITE = "https://denny-hwang.github.io/switching_converter_study"
ROW = {"avg": ("average", "평균"), "max": ("largest", "최댓값"), "min": ("smallest", "최솟값")}


def fmt(x: float, unit: str) -> str:
    return f"{x:.4g} {unit}"


def example_text(case: dict, ko: bool) -> str:
    p = case_params(case)
    ex = example(case["example"])
    label = ex["label_ko"] if ko else ex["label"]
    parts_ = [f"V_g = {plain(p['Vg'])} V", f"D = {plain(p['D'])}", f"f_s = {eng(p['fs'])}Hz"]
    if "L" in p:
        parts_.append(f"L = {eng(p['L']).replace('u', ' µ')}H")
    if "Lm" in p:
        parts_.append(f"L_M = {eng(p['Lm']).replace('u', ' µ').replace('m', ' m')}H")
    if "n" in p:
        parts_.append(f"n = {plain(p['n'])}")
    if "nr" in p:
        parts_.append(f"n_r = {plain(p['nr'])}")
    parts_ += [f"C = {eng(p['C']).replace('u', ' µ')}F", f"R = {plain(p['R'])} Ω"]
    return f"{label} (`{case['example']}`): " + ", ".join(parts_).replace("100kHz", "100 kHz")


def readme(topology: str, tool: str, results: dict) -> str:
    cases = [c for c in CASES if c["topology"] == topology]
    ext = "asc" if tool == "ltspice" else "cir"
    other = "ngspice" if tool == "ltspice" else "ltspice"
    en_title, ko_title = TITLES[topology]
    tool_name = "LTspice" if tool == "ltspice" else "ngspice"
    out = [f"# {en_title}: {tool_name} {'schematics' if tool == 'ltspice' else 'netlists'}", "", "[한국어](#한국어)", ""]
    for ko in (False, True):
        if ko:
            out += ["## 한국어", "", f"### {ko_title}: {tool_name} {'회로도' if tool == 'ltspice' else '넷리스트'}", ""]
            out.append(
                "각 파일은 합성 예제(설계에서 가져오지 않은 수)의 값을 씁니다. "
                f"브라우저 [시뮬레이터]({SITE}/ko/simulate/simulator/)의 같은 이름 프리셋(preset)도 같은 예제로 열립니다. "
                f"같은 회로의 {'ngspice 넷리스트' if tool == 'ltspice' else 'LTspice 회로도'}는 [../../{other}/{topology}/](../../{other}/{topology}/)에 있습니다."
            )
        else:
            out.append(
                "Each file carries the numbers of a synthetic example (not from any design), the example the "
                f"in-browser [simulator]({SITE}/en/simulate/simulator/) also opens with its preset of the same name. "
                f"The same circuits as {'ngspice netlists' if tool == 'ltspice' else 'LTspice schematics'}: [../../{other}/{topology}/](../../{other}/{topology}/)."
            )
        out += ["", "| 파일 | 예제 | 모드 | 프리셋 |" if ko else "| File | Example | Mode | Preset |", "| --- | --- | --- | --- |"]
        for c in cases:
            mode = "CCM" if c["id"].endswith("-ccm") else "DCM"
            out.append(f"| [{c['id']}.{ext}]({c['id']}.{ext}) | {example_text(c, ko)} | {mode} | {c['preset']} |")
        out.append("")
        head = "#### " if ko else "## "
        if tool == "ltspice":
            if ko:
                out += [
                    f"{head}실행",
                    "",
                    "LTspice에서 파일을 열고 Run을 누릅니다. `.param`, `.model`, `.tran` 줄이 회로도에 있습니다. "
                    "정지 상태에서 시작해 수백 주기를 계산하므로, 마지막 주기들이 정상상태(steady state)입니다. "
                    "노드를 누르면 전압을, 부품을 누르면 전류를 그립니다. 노드 이름은 ngspice 넷리스트와 같습니다.",
                ]
            else:
                out += [
                    f"{head}Run",
                    "",
                    "Open the file in LTspice and press Run: the schematic carries its `.param`, `.model` and `.tran` lines. "
                    "The run starts from rest and lasts several hundred periods, so the last ones are the steady state. "
                    "Click a node for its voltage and a part for its current; the node names are the ngspice netlist's.",
                ]
        else:
            if ko:
                out += [
                    f"{head}실행",
                    "",
                    "```",
                    f"ngspice -b {cases[0]['id']}.cir    # 마지막 주기의 측정값(.meas)을 출력합니다",
                    f"ngspice {cases[0]['id']}.cir       # 대화형: run 다음에 plot",
                    "```",
                ]
            else:
                out += [
                    f"{head}Run",
                    "",
                    "```",
                    f"ngspice -b {cases[0]['id']}.cir    # prints the measurements (.meas) of the last period",
                    f"ngspice {cases[0]['id']}.cir       # interactive: run, then plot",
                    "```",
                ]
        out.append("")
        for c in cases:
            rec = results["cases"][c["id"]]
            q = rec["quantities"]
            names = ", ".join(f"`{q[k]['ltspice' if tool == 'ltspice' else 'ngspice']}` ({q[k]['label_ko' if ko else 'label']})" for k in q)
            out += [f"{head}{c['id']}", ""]
            out.append(("그릴 것: " if ko else "Plot: ") + names + ".")
            out += ["", f"![{c['id']}](../../waveforms/{c['id']}.svg)", ""]
            out += [
                "| 양 | ngspice | 이상적인 식 | 카탈로그의 식 |" if ko else "| Quantity | ngspice | Ideal | From the catalogue |",
                "| --- | --- | --- | --- |",
            ]
            sources = {k: src for k, (_v, src) in analytic_with_sources(c).items()}
            for key, want in rec["analytic"].items():
                qk, fn = key.rsplit("_", 1)
                label = q[qk]["label_ko" if ko else "label"]
                row = f"{label}, {ROW[fn][1 if ko else 0]}"
                out.append(f"| {row} | {fmt(rec['values'][key], q[qk]['unit'])} | {fmt(want, q[qk]['unit'])} | `{sources[key]}` |")
            out.append("")
        if ko:
            out += [
                f"{head}참고",
                "",
                "- 스위치는 켜지면 1 mΩ, 꺼지면 1 MΩ이고, 다이오드는 1 A에서 약 30 mV가 떨어집니다. 그래서 결과가 이상적인 식과 1 % 안에서 맞습니다. "
                "`scripts/sim_library.py --check`가 CI에서 이를 확인합니다.",
                "- 변압기는 결합 계수 1인 결합 인덕터입니다. 1차 인덕턴스가 자화 인덕턴스(1차 기준)이고, 권선비는 1:n, n = N_s/N_p입니다. "
                "SPICE는 각 인덕터의 첫 노드를 점(dot)으로 봅니다. LTspice는 모든 권선에서 점을 다른 끝에 그리므로, 상대 극성은 같습니다.",
            ]
            if tool == "ltspice":
                out.append("- LTspice는 결합되지 않은 인덕터에 1 mΩ 직렬 저항을 기본으로 넣습니다(도움말의 Inductor Models). 결과에 주는 영향은 0.1 %보다 작습니다.")
            if topology == "forward":
                out.append("- 스위치 양단의 10 pF(Cd)는 계산기를 위한 것입니다. 세 권선이 계수 1로 결합되면, 턴오프 때 전류가 1차에서 리셋 권선으로 옮겨 갈 수 있도록 SPICE에 드레인 커패시턴스가 필요합니다. 수 mW를 더할 뿐 평균값은 바꾸지 않습니다.")
        else:
            out += [
                f"{head}Notes",
                "",
                "- The switch is 1 mΩ on and 1 MΩ off, and the diodes drop about 30 mV at an ampere, so the results land within 1 % of the ideal equations; "
                "`scripts/sim_library.py --check` confirms it in CI.",
                "- A transformer is coupled inductors with a coupling of 1: the primary's inductance is the magnetizing inductance (referred to the primary), "
                "the turns ratio 1:n with n = N_s/N_p. SPICE takes each inductor's first node as its dotted end; LTspice draws the dot at the other end of every winding, "
                "so the relative polarity is the same.",
            ]
            if tool == "ltspice":
                out.append("- LTspice puts 1 mΩ in series with an inductor that is not coupled (its help, Inductor Models): less than 0.1 % on these results.")
            if topology == "forward":
                out.append("- The 10 pF across the switch (Cd) is for the solver: with three windings coupled with 1, SPICE needs a capacitance at the drain for the current to pass from the primary to the reset winding at turn-off. It adds a few mW and changes no average.")
        out.append("")
    return "\n".join(out).rstrip() + "\n"


def sim_readme() -> str:
    rows = []
    for c in CASES:
        t = c["topology"]
        rows.append(f"| {title(c)} | [{c['id']}.asc](ltspice/{t}/{c['id']}.asc) | [{c['id']}.cir](ngspice/{t}/{c['id']}.cir) | [svg](waveforms/{c['id']}.svg) |")
    return "\n".join(
        [
            "# SPICE library",
            "",
            "[한국어](#한국어)",
            "",
            "The five converters of the topology pages as LTspice schematics and ngspice netlists, with the numbers of the synthetic "
            f"examples the in-browser [simulator]({SITE}/en/simulate/simulator/) opens with. Each folder's README says what to plot and what to expect.",
            "",
            "| Converter | LTspice | ngspice | Waveforms |",
            "| --- | --- | --- | --- |",
            *rows,
            "",
            "Every file is generated by `scripts/sim_library.py` from one list of parts, so a schematic and its netlist are the same circuit; "
            "CI reads each schematic back into a netlist and compares them part by part, reruns ngspice and compares its numbers with "
            "`results.json` and with the ideal equations of `packages/pe-core/equations/equations.yaml` (within 1 %), and redraws the waveforms.",
            "",
            "## 한국어",
            "",
            "토폴로지 페이지의 다섯 컨버터를 LTspice 회로도와 ngspice 넷리스트로 제공합니다. 값은 브라우저 "
            f"[시뮬레이터]({SITE}/ko/simulate/simulator/)가 여는 합성 예제의 값입니다. 각 폴더의 README에 무엇을 그리고 무엇을 기대할지 적혀 있습니다.",
            "",
            "모든 파일은 `scripts/sim_library.py`가 하나의 부품 목록에서 만듭니다. 그래서 회로도와 넷리스트는 같은 회로입니다. "
            "CI는 각 회로도를 넷리스트로 다시 읽어 부품별로 비교하고, ngspice를 다시 돌려 `results.json`과 "
            "`packages/pe-core/equations/equations.yaml`의 이상적인 식(1 % 이내)과 비교하며, 파형을 다시 그립니다.",
            "",
        ]
    )


# ---- files ----------------------------------------------------------------------------------------


def results_of(runs: dict[str, dict]) -> dict:
    """results.json: per case, ngspice's values and samples (7 significant digits), what the .cir prints,
    the quantities' names, and the ideal equations' values."""
    out = {"ngspice": ngspice_version(), "steps_per_period": STEPS, "periods_recorded": PLOTTED, "cases": {}}
    for c in CASES:
        p = case_params(c)
        r = runs[c["id"]]
        qs = quantities(c, p)
        labels_ko = {
            "switch node": "스위치 노드", "switch voltage": "스위치 전압", "inductor current": "인덕터 전류",
            "output inductor current": "출력 인덕터 전류", "primary current": "1차 전류",
            "secondary current times n": "2차 전류 × n", "magnetizing current": "자화 전류", "output voltage": "출력 전압",
        }
        out["cases"][c["id"]] = {
            "topology": c["topology"],
            "example": c["example"],
            "params": p,
            "cycles": c["cycles"],
            "quantities": {
                k: {"ngspice": v[0], "ltspice": v[1], "unit": v[2], "label": v[3], "label_ko": labels_ko[v[3]]} for k, v in qs.items()
            },
            "values": {k: float(f"{v:.7g}") for k, v in r["values"].items()},
            "printed": {k: float(f"{v:.7g}") for k, v in sorted(r["printed"].items())},
            "analytic": {k: float(f"{v:.7g}") for k, v in analytic(c).items()},
            "samples": {k: [float(f"{x:.7g}") for x in xs] for k, xs in r["samples"].items()},
        }
    return out


def ngspice_version() -> str:
    out = subprocess.run(["ngspice", "--version"], capture_output=True, text=True)
    m = re.search(r"ngspice-(\S+)", out.stdout + out.stderr)
    return m.group(1) if m else "unknown"


def files(results: dict) -> dict[Path, str]:
    """Every generated file and its content (the waveforms and READMEs from `results`)."""
    out: dict[Path, str] = {SIM / "README.md": sim_readme()}
    for c in CASES:
        t = c["topology"]
        out[SIM / "ngspice" / t / f"{c['id']}.cir"] = netlist(c)
        out[SIM / "ltspice" / t / f"{c['id']}.asc"] = schematic(c)
        out[WAVES / f"{c['id']}.svg"] = waveform_svg(c, results["cases"][c["id"]])
    for t in dict.fromkeys(c["topology"] for c in CASES):
        for tool in ("ltspice", "ngspice"):
            out[SIM / tool / t / "README.md"] = readme(t, tool, results)
    return out


def rerun_errors(old: dict, runs: dict[str, dict]) -> list[str]:
    """ngspice now against results.json: every value and sample within RERUN of its quantity's scale."""
    errors = []
    for c in CASES:
        o = old["cases"].get(c["id"])
        if o is None:
            errors.append(f"{c['id']}: not in results.json")
            continue
        if o["params"] != case_params(c) or o["cycles"] != c["cycles"]:
            errors.append(f"{c['id']}: its parameters differ from results.json (regenerate)")
            continue
        r = runs[c["id"]]
        for key, v in r["values"].items():
            qk = key.rsplit("_", 1)[0] if not key.startswith("v_out_prev") else "v_out"
            scale = max(abs(o["values"][f"{qk}_max"]), abs(o["values"][f"{qk}_min"]), 1e-12)
            if abs(v - o["values"][key]) > RERUN * scale:
                errors.append(f"{c['id']}: {key} = {v:.7g} now, {o['values'][key]:.7g} in results.json")
        for qk, xs in r["samples"].items():
            ys = o["samples"][qk]
            if len(xs) != len(ys):
                errors.append(f"{c['id']}: {len(xs)} samples of {qk} now, {len(ys)} in results.json")
                continue
            if qk == "t":
                continue
            scale = max(max(abs(y) for y in ys), 1e-12)
            bad = [i for i, (x, y) in enumerate(zip(xs, ys)) if abs(x - y) > RERUN * scale]
            if bad:
                errors.append(f"{c['id']}: {qk} differs from results.json at {len(bad)} samples (first at {bad[0]})")
    return errors


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--check", action="store_true", help="fail if a file is stale or ngspice now computes other numbers")
    args = ap.parse_args()
    if not shutil.which("ngspice"):
        print("sim_library: ngspice is not on the PATH", file=sys.stderr)
        return 1
    errors: list[str] = []
    runs = {}
    for c in CASES:
        r = run_ngspice(c)
        runs[c["id"]] = r
        errors += compare(c, r["values"], analytic(c))
        errors += check_schematic(c, schematic(c))
    if args.check:
        if not RESULTS.exists():
            errors.append("sim/results.json is missing (run python scripts/sim_library.py)")
        else:
            old = json.loads(RESULTS.read_text(encoding="utf-8"))
            errors += rerun_errors(old, runs)
            want = files(old)
            want[RESULTS] = RESULTS.read_text(encoding="utf-8")
            for path, text in want.items():
                if not path.exists() or path.read_text(encoding="utf-8") != text:
                    errors.append(f"{path.relative_to(ROOT)} is stale (run python scripts/sim_library.py)")
            present = {p for p in SIM.rglob("*") if p.is_file()}
            for path in sorted(present - set(want)):
                errors.append(f"{path.relative_to(ROOT)} is not generated (remove it, or add it to scripts/sim_library.py)")
            # every schematic on disk read back and compared with its netlist
            for c in CASES:
                asc = SIM / "ltspice" / c["topology"] / f"{c['id']}.asc"
                if asc.exists():
                    errors += check_schematic(c, asc.read_text(encoding="utf-8"))
        if errors:
            print("sim_library --check:", file=sys.stderr)
            for e in errors:
                print("  " + e, file=sys.stderr)
            return 1
        print(f"sim_library --check: OK ({len(CASES)} cases: schematics match their netlists, ngspice agrees with "
              f"results.json and with the ideal equations within {TOL:.0%}; ngspice {ngspice_version()})")
        return 0
    if errors:
        print("sim_library: not written:", file=sys.stderr)
        for e in errors:
            print("  " + e, file=sys.stderr)
        return 1
    results = results_of(runs)
    RESULTS.parent.mkdir(parents=True, exist_ok=True)
    RESULTS.write_text(json.dumps(results, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")
    for path, text in files(results).items():
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(text, encoding="utf-8")
    print(f"sim_library: wrote sim/ ({len(CASES)} cases; ngspice {results['ngspice']})")
    return 0


if __name__ == "__main__":
    sys.exit(main())
