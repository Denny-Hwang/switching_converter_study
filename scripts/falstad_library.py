#!/usr/bin/env python3
"""falstad_library -- the SPICE library's circuits for CircuitJS1, Falstad's circuit simulator.

Each case of the SPICE library (scripts/sim_library.py, CASES) is written again as a CircuitJS1
circuit, with the numbers of the same synthetic example:

  sim/falstad/<case>.txt       the circuit as CircuitJS1 text (File > Import From Text)
  sim/falstad/README.md        the share links, and what the circuits add to the SPICE library's
  src/generated/falstad.json   the links for the site, and what scripts/falstad_check.mjs compares:
                               the catalogue's ideal values and the quantities to measure

A share link is CircuitJS1's own: circuitjs.html?ctz= and the circuit text compressed with
LZString (scripts/lzstring.py). The parts are the SPICE library's near-ideal ones (a 1 mOhm
switch, 1 MOhm off; diodes of about 30 mV at an ampere), with three changes CircuitJS1 needs:

- a body diode across each switch, as the site's simulator has: CircuitJS1 steps with a fixed
  time step and accepts a diode's step once its voltage moves by no more than 10 mV, so a
  diode's current goes past zero before the diode turns off (a little more than a step's change
  in the DCM buck), and the node that current leaves behind would jump far past the rails;
- backward Euler for the inductors and transformers (their flag 2), which damps a mode much
  faster than the step where the trapezoidal rule would ring (05-simulation/ngspice);
- a coupling of 0.99999 instead of 1: CircuitJS1 inverts the windings' inductance matrix,
  which is singular at 1. The leakage left (2e-5 of the primary's inductance in a two-winding
  transformer) adds a spike of under a volt at turn-off at this step (it grows as the step
  shrinks).

The check below reads every circuit back: it finds each element's connections from its
coordinates as CircuitJS1 places them, and compares the circuit node by node with the SPICE
library's netlist (sim_library.parts) and the parts added here.

    python scripts/falstad_library.py            # write every file
    python scripts/falstad_library.py --check    # fail if a file is stale or a circuit is miswired
"""

from __future__ import annotations

import argparse
import json
import math
import sys
from dataclasses import dataclass, field
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
sys.path.insert(0, str(ROOT / "python"))

import sim_library as lib  # noqa: E402
from lzstring import compress_to_encoded_uri_component  # noqa: E402

FALSTAD = ROOT / "sim" / "falstad"
GENERATED = ROOT / "src" / "generated" / "falstad.json"
APP = "https://www.falstad.com/circuit/circuitjs.html"

# time steps per switching period (fixed: CircuitJS1 does not adapt its step here)
STEPS = 500
# the near-ideal parts of the SPICE library, as CircuitJS1 writes them
R_ON, R_OFF = 0.001, 1e6
DIODE_MODEL = "near-ideal"
DIODE_LINE = f"34 {DIODE_MODEL} 0 1e-9 0 0.05 0 0"  # flags, Is, Rs, N, breakdown, forward current
COUPLING = 0.99999
BACK_EULER = 2  # Inductor.FLAG_BACK_EULER, also the transformers'
REVERSE = 4  # TransformerElm.FLAG_REVERSE: the second winding's dot at its other end
# the gate: a square wave from 0 to 5 V (bias 2.5 V, amplitude 2.5 V) at f_s with duty ratio D; the
# switch closes above 2.5 V
GATE_V = 2.5
# ngspice's values against the ideal equations: within TOL of the quantity's scale, as in the SPICE library
TOL = 0.01


# ---- numbers ---------------------------------------------------------------------------------------


def num(x: float) -> str:
    """A number as CircuitJS1 reads it: no '+' (its tokenizer splits on '+'), shortest round-trip form."""
    if x == 0:
        return "0"
    s = repr(float(x))
    if s.endswith(".0"):
        s = s[:-2]
    s = s.replace("e+", "e")
    if "+" in s:
        raise ValueError(s)
    return s


# ---- elements ---------------------------------------------------------------------------------------

Point = tuple[int, int]


@dataclass
class Elm:
    """One CircuitJS1 element: its dump type, end points, flags and the values after them, and the
    SPICE-style name and node names it stands for (checked against its placement)."""

    kind: str
    x1: int
    y1: int
    x2: int
    y2: int
    flags: int = 0
    values: list[str] = field(default_factory=list)
    name: str = ""
    nodes: tuple[str, ...] = ()

    def line(self) -> str:
        return " ".join([self.kind, str(self.x1), str(self.y1), str(self.x2), str(self.y2), str(self.flags), *self.values])

    def posts(self) -> list[Point]:
        a, b = (self.x1, self.y1), (self.x2, self.y2)
        if self.kind in ("g", "207"):
            return [a]
        if self.kind == "159":
            return [a, b, switch_control(a, b)]
        if self.kind == "T":
            return transformer_posts(self)
        if self.kind == "406":
            return custom_transformer_posts(self)
        return [a, b]


def switch_control(a: Point, b: Point) -> Point:
    """The control post of an analog switch (AnalogSwitchElm.setPoints, no flips): 16 px to the side of
    its middle, on the left of the direction from its first point to its second."""
    dx, dy = b[0] - a[0], b[1] - a[1]
    length = math.hypot(dx, dy)
    if (dx and dy) or length < 64 or ((a[0] + b[0]) // 2) % 16 or ((a[1] + b[1]) // 2) % 16:
        raise ValueError(f"switch {a}-{b}: keep it on an axis, 64 px or longer, with its middle on the grid")
    mx, my = (a[0] + b[0]) // 2, (a[1] + b[1]) // 2
    return (mx + round(-16 * dy / length), my + round(16 * dx / length))


def transformer_posts(e: Elm) -> list[Point]:
    """TransformerElm.setPoints, drawn left to right: the first winding from (x1, y1) down to (x1, y1+w),
    the second from (x2, y1) down to (x2, y1+w), w = max(32, |y2 - y1|); the posts in node order
    0 (x1, y1), 1 (x2, y1), 2 (x1, y1+w), 3 (x2, y1+w), the second winding's swapped when reversed.
    Winding 1 is nodes 0-2, winding 2 nodes 1-3."""
    if e.x2 <= e.x1:
        raise ValueError("draw transformers left to right")
    w = max(32, abs(e.y2 - e.y1))
    p = [(e.x1, e.y1), (e.x2, e.y1), (e.x1, e.y1 + w), (e.x2, e.y1 + w)]
    if e.flags & REVERSE:
        p[1], p[3] = p[3], p[1]
    return p


def custom_transformer_posts(e: Elm) -> list[Point]:
    """CustomTransformerElm.setPoints for a description such as '1,1:0.5' (coils separated by ',', the
    primary's from the secondary's by ':'): each coil's two posts, in coil order, the primary's at x1 and
    the secondary's at x2, 32 px apart within a coil and 16 px between coils; the last post of each
    side is moved down to the deepest one."""
    desc = e.values[2]
    if "+" in desc:
        raise ValueError("tapped coils are not handled")
    primary, _, secondary = desc.partition(":")
    counts = [len(primary.split(",")), len(secondary.split(",")) if secondary else 0]
    coil_nodes = []
    for side, count in enumerate(counts):
        coil_nodes += [side] * count
    node_count = 2 * len(coil_nodes)
    primary_nodes = 2 * counts[0]
    coil_first = [2 * i for i in range(len(coil_nodes))]
    width = 32

    def offsets(max_width: int) -> tuple[list[int], int]:
        offs, c, off, mw = [], 0, 0, max_width
        for i in range(node_count):
            if i == primary_nodes:
                off = 0
            if max_width and (i == primary_nodes - 1 or i == node_count - 1):
                off = max_width
            offs.append(off)
            mw = max(mw, off)
            if c < len(coil_first) and coil_first[c] == i:
                c += 1
                off += width
            else:
                off += 16
        return offs, mw

    _, max_width = offsets(0)
    offs, _ = offsets(max_width)
    return [((e.x1 if i < primary_nodes else e.x2), e.y1 + offs[i]) for i in range(node_count)]


# ---- the circuits -----------------------------------------------------------------------------------


def wire(a: Point, b: Point) -> Elm:
    return Elm("w", *a, *b)


def ground(a: Point, direction: str = "down") -> Elm:
    dx, dy = {"down": (0, 16), "left": (-16, 0), "right": (16, 0)}[direction]
    return Elm("g", *a, a[0] + dx, a[1] + dy, name="ground", nodes=("0",))


def label(a: Point, b: Point, text: str) -> Elm:
    return Elm("207", *a, *b, 0, [text], name="label:" + text, nodes=(text,))


SHOW_VOLTAGE = 16  # VoltageElm.FLAG_SHOW_VOLTAGE: write the source's voltage beside it


def source(neg: Point, pos: Point, volts: float, name: str, nodes: tuple[str, str]) -> Elm:
    # DC: waveform 0, frequency (unused) 40, maximum voltage, bias 0, phase 0, duty 0.5
    return Elm("v", *neg, *pos, SHOW_VOLTAGE, ["0", "40", num(volts), "0", "0", "0.5"], name, nodes)


def gate(neg: Point, pos: Point, fs: float, D: float) -> Elm:
    # square wave: waveform 2 at f_s, 2.5 V either side of a 2.5 V bias, duty ratio D
    return Elm("v", *neg, *pos, 0, ["2", num(fs), num(GATE_V), num(GATE_V), "0", num(D)], "Vgate", ("0", "gate"))


def switch(a: Point, b: Point, nodes: tuple[str, str]) -> Elm:
    return Elm("159", *a, *b, 0, [num(R_ON), num(R_OFF), num(GATE_V)], "S1", (*nodes, "gate"))


def diode(anode: Point, cathode: Point, name: str, nodes: tuple[str, str]) -> Elm:
    return Elm("d", *anode, *cathode, 2, [DIODE_MODEL], name, nodes)


def inductor(a: Point, b: Point, L: float, name: str, nodes: tuple[str, str]) -> Elm:
    return Elm("l", *a, *b, BACK_EULER, [num(L), "0", "0", "0"], name, nodes)


def capacitor(a: Point, b: Point, C: float, nodes: tuple[str, str]) -> Elm:
    # capacitance, the voltage now and the voltage it resets to: empty
    return Elm("c", *a, *b, 0, [num(C), "0", "0"], "C1", nodes)


def resistor(a: Point, b: Point, R: float, nodes: tuple[str, str]) -> Elm:
    return Elm("r", *a, *b, 0, [num(R)], "R1", nodes)


def switch_stage(x: int, drain_y: int, fs: float, D: float) -> list[Elm]:
    """A low-side switch from the drain at (x, drain_y) down 128 px to ground, its gate source 48 px to its
    left (the source writes its frequency on its left) and its body diode 160 px to its left, joined to the
    drain by a wire that carries the label."""
    bottom = drain_y + 128
    mid = drain_y + 64
    return [
        switch((x, drain_y), (x, bottom), ("d", "0")),
        ground((x, bottom)),
        gate((x - 48, bottom), (x - 48, mid), fs, D),
        ground((x - 48, bottom)),
        wire((x - 48, mid), (x - 16, mid)),
        diode((x - 160, bottom), (x - 160, drain_y), "DB", ("0", "d")),
        ground((x - 160, bottom)),
        wire((x - 160, drain_y), (x, drain_y)),
        label((x - 160, drain_y), (x - 208, drain_y), "drain"),
    ]


def output_stage(x: int, y: int, bottom: int, p: dict[str, float]) -> list[Elm]:
    """The output capacitor at x and the load 80 px to its right, both from the node at (x, y) to ground."""
    return [
        capacitor((x, y), (x, bottom), p["C"], ("out", "0")),
        ground((x, bottom)),
        wire((x, y), (x + 80, y)),
        resistor((x + 80, y), (x + 80, bottom), p["R"], ("out", "0")),
        ground((x + 80, bottom)),
        label((x + 80, y), (x + 128, y), "vout"),
    ]


def elements(case: dict) -> list[Elm]:
    """The circuit, drawn on CircuitJS1's 16 px grid. Node names as in the SPICE library's netlist."""
    t = case["topology"]
    p = lib.case_params(case)
    fs, D = p["fs"], p["D"]
    top, bottom = 176, 336
    e: list[Elm] = [source((80, bottom), (80, top), p["Vg"], "V1", ("0", "in")), ground((80, bottom))]
    if t in ("buck", "buckboost"):
        # the switch from the input to the node sw, its body diode above it, the gate below it
        e += [
            wire((80, top), (176, top)),
            switch((176, top), (240, top), ("in", "sw")),
            wire((240, top), (240, 128)),
            diode((240, 128), (176, 128), "DB", ("sw", "in")),
            wire((176, 128), (176, top)),
            gate((208, 272), (208, 192), fs, D),
            ground((208, 272)),
            wire((240, top), (288, top)),
        ]
        if t == "buck":
            e += [
                diode((288, bottom), (288, top), "D1", ("0", "sw")),
                ground((288, bottom)),
                inductor((288, top), (384, top), p["L"], "L1", ("sw", "out")),
            ]
        else:
            e += [
                inductor((288, top), (288, bottom), p["L"], "L1", ("sw", "0")),
                ground((288, bottom)),
                diode((384, top), (288, top), "D1", ("out", "sw")),
            ]
        e += [label((288, top), (288, 128), "sw")]
        e += output_stage(384, top, bottom, p)
    elif t == "boost":
        # the inductor from the input to sw, the switch from sw down to ground with its gate on the right
        e += [
            inductor((80, top), (208, top), p["L"], "L1", ("in", "sw")),
            wire((208, top), (256, top)),
            switch((256, bottom), (256, top), ("0", "sw")),
            ground((256, bottom)),
            gate((304, bottom), (304, 256), fs, D),
            ground((304, bottom)),
            wire((304, 256), (272, 256)),
            diode((208, bottom), (208, top), "DB", ("0", "sw")),
            ground((208, bottom)),
            label((208, top), (208, 128), "sw"),
            diode((256, top), (384, top), "D1", ("sw", "out")),
        ]
        e += output_stage(384, top, bottom, p)
    elif t == "flyback":
        # the primary from the input down to the drain and the switch below it; left of the switch its
        # gate, then its body diode; the secondary's dot at ground (the transformer reversed), its other
        # end to the output diode
        e += [
            wire((80, top), (352, top)),
            Elm("T", 352, top, 416, top + 64, BACK_EULER | REVERSE, [num(p["Lm"]), num(p["n"]), "0", "0", num(COUPLING)],
                "Tx", ("in", "0", "d", "sx")),
            *switch_stage(352, 240, fs, D),
            ground((416, 240), "right"),
            diode((416, top), (512, top), "D1", ("sx", "out")),
        ]
        e += output_stage(512, top, bottom, p)
    elif t == "forward":
        # the primary from the input down to the drain and the switch below it, as in the flyback; the
        # secondary and the reset winding on the right: the reset winding's start at ground, its end
        # through D3 back to the input (the labels vin)
        e += [
            label((80, top), (80, 128), "vin"),
            wire((80, top), (352, top)),
            Elm("406", 352, top, 416, top, BACK_EULER, [num(p["Lm"]), num(COUPLING), f"1:{num(p['n'])},{num(p['nr'])}", "3", "0", "0", "0"],
                "Tx", ("in", "d", "s1", "0", "0", "rn")),
            *switch_stage(352, 256, fs, D),
            ground((416, 208), "right"),
            ground((416, 224), "right"),
            diode((416, 256), (416, 320), "D3", ("rn", "in")),
            label((416, 320), (416, 368), "vin"),
            diode((416, top), (512, top), "D1", ("s1", "x")),
            diode((512, bottom), (512, top), "D2", ("0", "x")),
            ground((512, bottom)),
            inductor((512, top), (608, top), p["L"], "L1", ("x", "out")),
        ]
        e += output_stage(608, top, bottom, p)
    else:
        raise ValueError(t)
    return e


# what each case lets you watch: the scopes along the bottom of CircuitJS1's window
def scopes(case: dict, elms: list[Elm]) -> list[str]:
    def index(name: str) -> int:
        return next(i for i, x in enumerate(elms) if x.name == name)

    t = case["topology"]
    node = "label:drain" if t in ("flyback", "forward") else "label:sw"
    current = "S1" if t == "flyback" else "L1"
    # old-style scope lines: element, speed, value, flags, voltage and current scales, position;
    # flags: 1 current, 2 voltage, 512 scale, 8192 automatic range
    speed = 8
    return [
        f"o {index(current)} {speed} 0 {1 | 512 | 8192} 1 1 0",
        f"o {index(node)} {speed} 0 {2 | 512 | 8192} 1 1 1",
        f"o {index('R1')} {speed} 0 {2 | 512 | 8192} 1 1 2",
    ]


def circuit_text(case: dict) -> str:
    p = lib.case_params(case)
    elms = elements(case)
    Ts = 1 / p["fs"]
    vmax = max(p["Vg"], 1.0)
    # options: flags 1 (current dots), the time step, the simulation speed, the current and power
    # bars' positions, the voltage range of the colours, and the smallest time step
    lines = [f"$ 1 {num(Ts / STEPS)} 1000 50 {num(vmax)} 50 5e-11", DIODE_LINE]
    lines += [x.line() for x in elms]
    lines += scopes(case, elms)
    return "\n".join(lines) + "\n"


def link(text: str) -> str:
    return f"{APP}?ctz={compress_to_encoded_uri_component(text)}"


# ---- reading a circuit back ---------------------------------------------------------------------------


class Union:
    def __init__(self) -> None:
        self.parent: dict = {}

    def find(self, x):
        self.parent.setdefault(x, x)
        while self.parent[x] != x:
            self.parent[x] = self.parent[self.parent[x]]
            x = self.parent[x]
        return x

    def join(self, a, b) -> None:
        self.parent[self.find(a)] = self.find(b)


def check_wiring(case: dict, elms: list[Elm]) -> list[str]:
    """Connect the elements by their posts' coordinates (and labels, and ground) as CircuitJS1 does, then
    require every named node to be one net, different names different nets, no post left alone, and the
    parts the SPICE netlist has to sit between the same nodes."""
    errors: list[str] = []
    u = Union()
    count: dict[Point, int] = {}
    for x in elms:
        for pt in x.posts():
            count[pt] = count.get(pt, 0) + 1
            u.find(pt)
        if x.kind == "w":
            u.join((x.x1, x.y1), (x.x2, x.y2))
        elif x.kind == "g":
            u.join((x.x1, x.y1), "net:0")
        elif x.kind == "207":
            u.join((x.x1, x.y1), "net:" + x.values[0])
    lonely = [pt for pt, n in count.items() if n == 1 and not any(x.kind in ("g", "207") and (x.x1, x.y1) == pt for x in elms)]
    if lonely:
        errors.append(f"{case['id']}: posts connected to nothing: {lonely}")
    names: dict[str, object] = {}
    for x in elms:
        if not x.nodes or x.kind in ("g", "207"):
            continue
        posts = x.posts()
        if len(posts) != len(x.nodes):
            errors.append(f"{case['id']}: {x.name} has {len(posts)} posts, {len(x.nodes)} node names")
            continue
        for pt, name in zip(posts, x.nodes):
            net = u.find(pt)
            if name in names and names[name] != net:
                errors.append(f"{case['id']}: {x.name}: node {name} at {pt} is not the node {name} elsewhere")
            names.setdefault(name, net)
    if names.get("0") != u.find("net:0"):
        errors.append(f"{case['id']}: the node named 0 is not ground")
    nets = {}
    for name, net in names.items():
        if net in nets:
            errors.append(f"{case['id']}: nodes {nets[net]} and {name} are shorted together")
        nets[net] = name
    # the SPICE library's parts, by name and node; windings by their ends
    spice = {q.name: q.nodes for q in lib.parts(case)}
    here = {x.name: x.nodes for x in elms if x.name and not x.name.startswith(("label:", "ground"))}
    for name, nodes in spice.items():
        if name in ("K1", "K2", "K3"):
            continue
        if name == "Vgate":
            want = tuple(reversed(nodes))  # its negative end first, as CircuitJS1 draws it
            if here.get(name) != want:
                errors.append(f"{case['id']}: Vgate between {here.get(name)}, SPICE {nodes}")
            continue
        if name in ("Lp", "Ls", "Lr"):
            if not windings_match(case, name, nodes, here.get("Tx", ())):
                errors.append(f"{case['id']}: winding {name} {nodes} is not on the transformer")
            continue
        if name == "Cd":
            continue  # a capacitance ngspice needs at the drain, not CircuitJS1
        got = here.get(name)
        if got is None:
            errors.append(f"{case['id']}: {name} missing")
        elif name == "S1":
            if got[:2] not in (nodes[:2], nodes[1::-1]):
                errors.append(f"{case['id']}: S1 between {got[:2]}, SPICE {nodes[:2]}")
        elif name == "V1":
            if got != tuple(reversed(nodes)):
                errors.append(f"{case['id']}: V1 between {got}, SPICE {nodes}")
        elif name.startswith("D") and got != nodes:
            errors.append(f"{case['id']}: {name} from {got[0]} to {got[1]}, SPICE from {nodes[0]} to {nodes[1]}")
        elif got not in (nodes, nodes[::-1]):
            errors.append(f"{case['id']}: {name} between {got}, SPICE {nodes}")
    extra = set(here) - set(spice) - {"Tx", "DB"}
    if extra:
        errors.append(f"{case['id']}: parts the SPICE netlist does not have: {sorted(extra)}")
    body = here.get("DB")
    if body is None or tuple(reversed(body)) not in (here["S1"][:2], here["S1"][1::-1]):
        errors.append(f"{case['id']}: no body diode across the switch")
    return errors


def windings_match(case: dict, name: str, nodes: tuple[str, ...], tx: tuple[str, ...]) -> bool:
    """A SPICE winding (dotted end first) against the transformer's ends: the flyback's are
    (primary start, secondary dot, primary end, secondary end), the forward's (primary start, end,
    secondary start, end, reset start, end), the dotted ends first."""
    if case["topology"] == "flyback":
        pairs = {"Lp": (tx[0], tx[2]), "Ls": (tx[1], tx[3])}
    else:
        pairs = {"Lp": (tx[0], tx[1]), "Ls": (tx[2], tx[3]), "Lr": (tx[4], tx[5])}
    return pairs.get(name) == tuple(nodes)


# ---- what the check compares ---------------------------------------------------------------------------


def measures(case: dict, elms: list[Elm]) -> dict[str, dict]:
    """How scripts/falstad_check.mjs reads each quantity: a labeled node's voltage, or an element's current
    (sign: +1 when CircuitJS1's current runs the way the SPICE library measures it)."""
    t = case["topology"]

    def index(name: str) -> int:
        return next(i for i, x in enumerate(elms) if x.name == name)

    m = {"v_out": {"node": "vout"}, "v_sw": {"node": "drain" if t in ("flyback", "forward") else "sw"}}
    if t != "flyback":
        m["i_L"] = {"element": index("L1"), "sign": 1}
    return m


def expected(case: dict) -> dict[str, dict]:
    """The catalogue's ideal values the check compares with, each with its equations; the flyback's
    magnetizing current is left out (CircuitJS1 gives the windings' currents, not their sum)."""
    out = {}
    for key, (value, source_) in lib.analytic_with_sources(case).items():
        if key.startswith("i_M"):
            continue
        out[key] = {"value": value, "from": source_}
    return out


def generated(results: dict | None = None) -> dict:
    cases = []
    for case in lib.CASES:
        p = lib.case_params(case)
        text = circuit_text(case)
        elms = elements(case)
        cases.append({
            "id": case["id"],
            "topology": case["topology"],
            "title": lib.title(case),
            "title_ko": f"{lib.TITLES[case['topology']][1]}, {'CCM' if case['id'].endswith('-ccm') else 'DCM'}",
            "example": case["example"],
            "file": f"sim/falstad/{case['id']}.txt",
            "link": link(text),
            "Ts": 1 / p["fs"],
            "periods": case["cycles"],
            "measure": measures(case, elms),
            "expected": expected(case),
        })
    return {"app": APP, "steps_per_period": STEPS, "tol": TOL, "cases": cases}


# ---- README ------------------------------------------------------------------------------------------


def readme() -> str:
    rows_en, rows_ko = [], []
    for case in lib.CASES:
        text = circuit_text(case)
        rows_en.append(f"| {lib.title(case)} | [{case['id']}.txt]({case['id']}.txt) | [open in CircuitJS1]({link(text)}) | `{case['example']}` |")
        mode = "CCM" if case["id"].endswith("-ccm") else "DCM"
        rows_ko.append(f"| {lib.TITLES[case['topology']][1]}, {mode} | [{case['id']}.txt]({case['id']}.txt) | [CircuitJS1에서 열기]({link(text)}) | `{case['example']}` |")
    en = [
        "# The SPICE library in CircuitJS1",
        "",
        "The library's cases as circuits for CircuitJS1, Paul Falstad's circuit simulator, with the numbers of the",
        "same synthetic examples (`examples/synthetic/`). A link opens the circuit on falstad.com; the `.txt` file",
        "is the same circuit as text (File > Import From Text).",
        "",
        "Generated by `scripts/falstad_library.py`; do not edit by hand. `scripts/falstad_check.mjs` runs every",
        "link in a browser and compares the averages and extremes of the last periods with the ideal equations.",
        "",
        "| Case | Circuit | Link | Example |",
        "|---|---|---|---|",
        *rows_en,
        "",
        "## What differs from the SPICE library",
        "",
        "The parts are the SPICE library's near-ideal ones: a switch of 1 mOhm (1 MOhm off) and diodes that",
        "drop about 30 mV at an ampere. CircuitJS1 steps with a fixed time step, a five-hundredth of the",
        "switching period. Two changes follow from that, and a third from how it models a transformer:",
        "",
        "- **A body diode across each switch**, as the site's simulator has. A diode's current reaches zero",
        "  within a step, and in CircuitJS1 it goes past zero before the diode turns off: the iteration stops",
        "  once a diode's voltage moves by no more than 10 mV, while these diodes' current changes e-fold every",
        "  1.3 mV (in the DCM buck the current reaches 3.7 mA below zero, a little more than its change in",
        "  one step). Without a body diode the current would have to stop within one step, and the node it",
        "  leaves would jump far outside the supply: to 34 V against the buck's 24 V input, and to -50 V at",
        "  the DCM flyback's drain. A shorter step does not help, as the overshoot shrinks with the step. The",
        "  body diode bounds the jump to a diode drop past a rail; a one-step dip within the rails can remain.",
        "- **Backward Euler for the inductors and transformers** (the Trapezoidal Approximation box in their",
        "  edit dialogs, unchecked). A mode much faster than the step, such as the leakage inductance's, then",
        "  dies out within a step. With the trapezoidal rule it rings from one step to the next: while the",
        "  output diode conducts, the DCM flyback's drain alternates between about 258 V and 0 V around the",
        "  129 V it should show.",
        "- **A coupling of 0.99999**, not 1: CircuitJS1 inverts the windings' inductance matrix, which is",
        "  singular at 1, and accepts only a coupling between 0 and 1. The leakage left adds a one-step spike",
        "  to the drain at turn-off, since the switch stops the leakage inductance's current within one step:",
        "  under a volt at this step (0.2 V in the CCM flyback, 0.7 V in the forward), in proportion to one",
        "  minus the coupling and to one over the step.",
        "",
        "The scopes along the bottom show the inductor current (the flyback's switch current), the switch",
        "node and the output. Right-click an element and choose View in New Scope to add another.",
        "",
        "# CircuitJS1로 보는 SPICE 라이브러리",
        "",
        "라이브러리의 사례를 Paul Falstad의 회로 시뮬레이터 CircuitJS1용 회로로, 같은 합성 예제(`examples/synthetic/`)의",
        "수치로 옮겼습니다. 링크는 falstad.com에서 회로를 열고, `.txt` 파일은 같은 회로를 텍스트로 담고 있습니다",
        "(File > Import From Text).",
        "",
        "`scripts/falstad_library.py`가 생성하므로 손으로 고치지 않습니다. `scripts/falstad_check.mjs`는 모든 링크를",
        "브라우저에서 실행해 마지막 주기들의 평균과 최댓값·최솟값을 이상적인 식과 비교합니다.",
        "",
        "| 사례 | 회로 | 링크 | 예제 |",
        "|---|---|---|---|",
        *rows_ko,
        "",
        "## SPICE 라이브러리와 다른 점",
        "",
        "부품은 SPICE 라이브러리와 같은 이상에 가까운 부품입니다. 1 mOhm(꺼지면 1 MOhm)의 스위치와 1 A에서 약 30 mV가",
        "떨어지는 다이오드입니다. CircuitJS1은 스위칭 주기의 500분의 1인 고정 시간 간격으로 진행합니다. 여기에서",
        "두 가지가, 변압기를 모델링하는 방식에서 한 가지가 달라집니다.",
        "",
        "- **스위치마다 바디 다이오드**(body diode)를 둡니다. 사이트의 시뮬레이터와 같습니다. 다이오드 전류는",
        "  스텝 도중에 0에 이르는데, CircuitJS1에서는 다이오드가 꺼지기 전에 0을 지나칩니다. 반복 계산은 다이오드",
        "  전압의 변화가 10 mV 이하가 되면 멈추는데, 이 다이오드의 전류는 1.3 mV마다 e배씩 바뀌기 때문입니다",
        "  (DCM 벅에서는 전류가 0 아래 3.7 mA까지 내려가며, 한 스텝 동안의 변화보다 조금 큽니다). 바디 다이오드가",
        "  없으면 전류가 한 스텝 안에 멈춰야 하므로, 전류가 떠난 노드가 전원 범위를 훨씬 벗어나 튑니다. 벅에서는",
        "  24 V 입력에 대해 34 V까지, DCM 플라이백의 드레인에서는 -50 V까지 튑니다. 초과 전류가 스텝과 함께",
        "  줄어들므로 스텝을 줄여도 나아지지 않습니다. 바디 다이오드는 점프를 레일(rail)에서 다이오드 강하 이내로",
        "  묶어 두며, 레일 안쪽에서 한 스텝 동안의 처짐은 남을 수 있습니다.",
        "- **인덕터와 변압기에 후진 오일러**(backward Euler)를 씁니다(편집 대화 상자의 Trapezoidal Approximation",
        "  확인란을 끔). 그러면 누설 인덕턴스의 모드처럼 스텝보다 훨씬 빠른 모드가 한 스텝 안에 사라집니다.",
        "  사다리꼴 규칙에서는 이 모드가 스텝마다 링잉합니다. 출력 다이오드가 도통하는 동안 DCM 플라이백의",
        "  드레인은 보여야 할 129 V를 사이에 두고 약 258 V와 0 V를 번갈아 오갑니다.",
        "- **결합 계수는 1이 아니라 0.99999**입니다. CircuitJS1은 권선의 인덕턴스 행렬을 역행렬로 푸는데, 1에서는",
        "  그 행렬이 특이 행렬이며, 결합 계수로 0과 1 사이의 값만 받습니다. 남는 누설 때문에 턴오프 때 드레인에",
        "  한 스텝 동안 스파이크가 더해집니다. 스위치가 누설 인덕턴스의 전류를 한 스텝 안에 멈추기 때문입니다. 이",
        "  스텝에서는 1 V 미만이며(CCM 플라이백 0.2 V, 포워드 0.7 V), 1에서 결합 계수를 뺀 값에 비례하고 스텝에",
        "  반비례합니다.",
        "",
        "아래쪽의 스코프는 인덕터 전류(플라이백은 스위치 전류), 스위치 노드, 출력을 보여 줍니다. 요소를",
        "오른쪽 클릭하고 View in New Scope를 고르면 스코프를 더할 수 있습니다.",
        "",
    ]
    return "\n".join(en)


def files() -> dict[Path, str]:
    out = {FALSTAD / f"{case['id']}.txt": circuit_text(case) for case in lib.CASES}
    out[FALSTAD / "README.md"] = readme()
    out[GENERATED] = json.dumps(generated(), indent=1, ensure_ascii=False) + "\n"
    return out


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--check", action="store_true", help="fail if a file is stale or a circuit is miswired")
    args = ap.parse_args()
    errors = []
    for case in lib.CASES:
        errors += check_wiring(case, elements(case))
    want = files()
    if args.check:
        for path, text in want.items():
            if not path.exists() or path.read_text(encoding="utf-8") != text:
                errors.append(f"{path.relative_to(ROOT)} is stale: run python scripts/falstad_library.py")
        # every file in sim/falstad/ comes from here (scripts/sim_library.py leaves the folder to this script)
        for path in sorted(p for p in FALSTAD.rglob("*") if p.is_file() and p not in want):
            errors.append(f"{path.relative_to(ROOT)} is not generated: remove it, or add it to scripts/falstad_library.py")
    else:
        FALSTAD.mkdir(parents=True, exist_ok=True)
        for path, text in want.items():
            path.write_text(text, encoding="utf-8")
    for e in errors:
        print("  " + e)
    if errors:
        print(f"falstad_library: {len(errors)} error(s)")
        return 1
    print(f"falstad_library: OK ({len(lib.CASES)} circuits{'' if args.check else ' written'}, wiring checked against the SPICE netlists)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
