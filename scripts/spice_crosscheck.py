#!/usr/bin/env python3
"""spice_crosscheck -- the simulator against ngspice, an independent solver.

Each case is one of the simulator's circuits written again as a SPICE
netlist from its schematic, not from the simulator's equations:
- the switch is a resistance that moves from 1 GOhm to R_on on a log scale
  while the gate rises (1 ns), with a body diode across it;
- a diode is a steep exponential diode (a few mV at its current) in series
  with a source for its forward drop V_F;
- a transformer is its magnetizing inductance with an ideal transformer of
  controlled sources (turns ratio 1:n, n = N_s/N_p);
- a node capacitance, a battery (V_b behind R_b), a Thevenin source (V_oc
  behind R_s, charging C_bus) are the parts themselves.
ngspice (its own variable-step integrator) runs each case from rest, and its
measurements of the last switching period (each quantity's average, largest,
smallest and end value, and its value at SAMPLES instants) go to
packages/pe-core/test/fixtures/spice.json. The vitest test
packages/pe-core/test/sim-spice.test.ts runs the simulator on the same cases
and compares (docs/BUILD_SPEC.md section 4: the simulator is validated; the
SPICE parts are not quite ideal, so the tolerance there is 0.5 %).

    python scripts/spice_crosscheck.py           # run every case, write the fixture
    python scripts/spice_crosscheck.py --check   # run again, compare with the fixture
    python scripts/spice_crosscheck.py --netlist ID   # print one case's netlist

Needs ngspice with its XSPICE code models on the PATH (Ubuntu: apt-get
install ngspice).
"""

from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FIXTURE = ROOT / "packages/pe-core/test/fixtures/spice.json"

# Near-ideal parts: a switch of 1 mOhm when a case gives none (the fixture
# records it, and the simulator runs with the same R_on) with a body diode,
# and diodes whose drop at 1 A is about 4 mV (N = 0.005) on top of the
# case's V_F.
RON_MIN = 1e-3
DIODE = "D(Is=1e-12 N=0.005)"

# Every case starts from rest (no current, the output capacitor at its start
# voltage). "cycles": how many switching periods ngspice runs; the last one is
# measured. Steady-state cases run long enough to settle (many times the
# slowest time constant); "startup" cases compare the start-up itself.
# "spice": the integration method and time steps per period (default gear,
# 400); a node capacitance rings, and its phase needs fine steps.
RING = {"method": "gear", "steps": 40000}
# Besides each quantity's average, largest, smallest and end value in the
# last period, its value at SAMPLES instants spread over that period.
SAMPLES = 40
# fmt: off
CASES: list[dict] = [
    # resistive loads, each converter in CCM and DCM
    {"id": "buck-ccm", "topology": "buck", "Vg": 24, "D": 0.5, "fs": 1e5, "L": 1e-4, "load": {"kind": "resistive", "R": 6, "C": 22e-6}, "cycles": 1000},
    {"id": "buck-dcm", "topology": "buck", "Vg": 24, "D": 0.3, "fs": 1e5, "L": 2e-5, "load": {"kind": "resistive", "R": 50, "C": 22e-6}, "cycles": 1500},
    {"id": "buck-lossy", "topology": "buck", "Vg": 24, "D": 0.5, "fs": 1e5, "L": 1e-4, "Ron": 0.05, "RL": 0.1, "VF": 0.7, "load": {"kind": "resistive", "R": 6, "C": 22e-6}, "cycles": 1000},
    {"id": "boost-ccm", "topology": "boost", "Vg": 12, "D": 0.5, "fs": 1e5, "L": 1e-4, "load": {"kind": "resistive", "R": 24, "C": 22e-6}, "cycles": 1500},
    {"id": "boost-dcm", "topology": "boost", "Vg": 12, "D": 0.3, "fs": 1e5, "L": 1e-5, "load": {"kind": "resistive", "R": 100, "C": 22e-6}, "cycles": 2000},
    {"id": "buckboost-ccm", "topology": "buckboost", "Vg": 12, "D": 0.6, "fs": 1e5, "L": 1e-4, "load": {"kind": "resistive", "R": 12, "C": 22e-6}, "cycles": 1500},
    {"id": "flyback-ccm", "topology": "flyback", "Vg": 48, "D": 0.4, "fs": 1e5, "L": 5e-4, "n": 0.25, "VF": 0.5, "load": {"kind": "resistive", "R": 6, "C": 47e-6}, "cycles": 1500},
    {"id": "flyback-dcm", "topology": "flyback", "Vg": 48, "D": 0.3, "fs": 1e5, "L": 2e-5, "n": 0.25, "VF": 0.5, "load": {"kind": "resistive", "R": 10, "C": 47e-6}, "cycles": 1500},
    {"id": "forward-ccm", "topology": "forward", "Vg": 48, "D": 0.4, "fs": 1e5, "L": 1e-4, "n": 0.5, "nr": 1, "LM": 1e-3, "VF": 0.5, "load": {"kind": "resistive", "R": 4, "C": 47e-6}, "cycles": 1500},
    {"id": "forward-dcm", "topology": "forward", "Vg": 48, "D": 0.3, "fs": 1e5, "L": 2e-5, "n": 0.5, "nr": 1, "LM": 1e-3, "VF": 0.5, "load": {"kind": "resistive", "R": 20, "C": 22e-6}, "cycles": 1000},
    # a node capacitance across the switch: the DCM ringing, clamped by the body diode
    {"id": "buck-dcm-ring", "topology": "buck", "Vg": 24, "D": 0.3, "fs": 1e5, "L": 2e-5, "Ron": 0.05, "Cnode": 1e-10, "load": {"kind": "resistive", "R": 50, "C": 4.7e-6}, "cycles": 500, "spice": RING},
    {"id": "boost-dcm-ring", "topology": "boost", "Vg": 12, "D": 0.3, "fs": 1e5, "L": 1e-5, "Ron": 0.05, "Cnode": 1e-10, "load": {"kind": "resistive", "R": 100, "C": 4.7e-6}, "cycles": 500, "spice": RING},
    {"id": "flyback-dcm-ring", "topology": "flyback", "Vg": 48, "D": 0.3, "fs": 1e5, "L": 2e-5, "n": 0.25, "VF": 0.5, "Ron": 0.1, "Cnode": 1e-10, "load": {"kind": "resistive", "R": 10, "C": 47e-6}, "cycles": 500, "spice": RING},
    # a Thevenin source (V_oc behind R_s, charging C_bus) instead of a stiff input
    {"id": "boost-source", "topology": "boost", "Vg": 10, "D": 0.5, "fs": 1e5, "L": 1e-4, "source": {"Voc": 10, "Rs": 1, "Cbus": 1e-4}, "load": {"kind": "resistive", "R": 40, "C": 22e-6}, "cycles": 2000},
    # batteries (open-circuit voltage behind an internal resistance), with and without a resistor
    {"id": "buck-battery", "topology": "buck", "Vg": 24, "D": 0.6, "fs": 1e5, "L": 1e-4, "load": {"kind": "network", "C": 22e-6, "battery": {"V": 12, "R": 0.5}}, "cycles": 1000},
    {"id": "buckboost-battery", "topology": "buckboost", "Vg": 12, "D": 0.6, "fs": 1e5, "L": 1e-4, "load": {"kind": "network", "C": 22e-6, "battery": {"V": 14, "R": 0.5}}, "cycles": 3000},
    {"id": "flyback-battery", "topology": "flyback", "Vg": 48, "D": 0.3, "fs": 1e5, "L": 2e-5, "n": 0.25, "VF": 0.5, "load": {"kind": "network", "C": 1e-4, "battery": {"V": 12, "R": 0.05}}, "cycles": 1000},
    {"id": "boost-battery-r", "topology": "boost", "Vg": 12, "D": 0.4, "fs": 1e5, "L": 1e-4, "load": {"kind": "network", "C": 22e-6, "R": 40, "battery": {"V": 16, "R": 1}}, "cycles": 1500},
    # a fixed output voltage (an ideal battery): DCM has a steady state
    {"id": "flyback-fixed-dcm", "topology": "flyback", "Vg": 400, "D": 0.02, "fs": 1e5, "L": 5e-5, "n": 0.25, "load": {"kind": "fixed", "V": 4}, "cycles": 200},
    # no steady state, or not from rest within the run: the start-up itself
    {"id": "flyback-fixed-runaway", "topology": "flyback", "Vg": 400, "D": 0.3, "fs": 1e5, "L": 5e-5, "n": 0.25, "load": {"kind": "fixed", "V": 4}, "cycles": 20, "startup": True},
    {"id": "flyback-charging", "topology": "flyback", "Vg": 24, "D": 0.3, "fs": 1e5, "L": 5e-5, "n": 1, "load": {"kind": "network", "C": 1e-4, "V0": 0}, "cycles": 400, "startup": True},
    # (the buck's capacitor is still charging at cycle 10; by cycle 30 it has reached V_g and the current has stopped)
    {"id": "buck-charging", "topology": "buck", "Vg": 24, "D": 0.5, "fs": 1e5, "L": 1e-4, "load": {"kind": "network", "C": 22e-6, "V0": 0}, "cycles": 10, "startup": True},
]
# fmt: on
for _c in CASES:
    _c.setdefault("Ron", RON_MIN)


def g(x: float) -> str:
    return f"{x:.12g}"


def load_lines(load: dict, pos: str, neg: str) -> list[str]:
    """The load between the output's positive terminal `pos` and negative terminal `neg`: C with R, a
    battery (V_b behind R_b), both or neither; or a fixed voltage. The current into a battery's (or the
    fixed voltage's) positive terminal is the current through Vbat (Vfix)."""
    if load["kind"] == "fixed":
        return [f"Vfix {pos} {neg} DC {g(load['V'])}"]
    b = load.get("battery")
    v0 = load.get("V0", b["V"] if b else 0)
    lines = [f"Cout {pos} {neg} {g(load['C'])} IC={g(v0)}"]
    if load.get("R") is not None:
        lines.append(f"Rload {pos} {neg} {g(load['R'])}")
    if b:
        lines += [f"Rbat {pos} bat {g(b['R'])}", f"Vbat bat {neg} DC {g(b['V'])}"]
    return lines


def diode(name: str, anode: str, cathode: str, vf: float) -> list[str]:
    """An ideal-ish diode with its forward drop V_F as a series source (the current through V<name> is the diode current)."""
    mid = f"{name.lower()}m"
    return [f"D{name} {anode} {mid} DM", f"V{name} {mid} {cathode} DC {g(vf)}"]


def netlist(c: dict) -> tuple[str, dict[str, str]]:
    """The case's netlist and the SPICE expressions of the quantities to measure."""
    t = c["topology"]
    Ts = 1 / c["fs"]
    D = c["D"]
    rl = c.get("RL") or 0
    vf = c.get("VF") or 0
    n = c.get("n", 1)
    src = c.get("source")
    lines = [f"* {c['id']}"]
    if src:
        # a Thevenin source: V_oc behind R_s, charging C_bus; Vin measures the converter's input current
        lines += [
            f"Vg vs 0 DC {g(src['Voc'])}",
            f"Rs vs bus {g(src['Rs'])}",
            f"Cbus bus 0 {g(src['Cbus'])} IC={g(src['Voc'])}",
            "Vin bus in DC 0",
        ]
    else:
        lines.append(f"Vg in 0 DC {g(c['Vg'])}")
    lines += [
        # the gate: on from t = 0 for D T_s, with 1 ns edges
        f"Vgate gate 0 PULSE(0 1 0 1n 1n {g(D * Ts - 1e-9)} {g(Ts)})",
        # the switch: a resistance that moves from R_off to R_on on a log scale
        # as the gate crosses 0..1 V (smooth, so the solver can follow it)
        f".model SWM aswitch(cntl_off=0 cntl_on=1 r_off=1e9 r_on={g(c['Ron'])} log=TRUE)",
        f".model DM {DIODE}",
    ]
    q: dict[str, str] = {}

    def sw(a: str, b: str) -> list[str]:
        """The switch from a to b, driven by the gate, with its body diode (b to a) and, when the case
        has one, the node capacitance across it."""
        out = [f"AS1 %vd(gate 0) %gd({a} {b}) SWM", f"DB {b} {a} DM"]
        if c.get("Cnode"):
            out.append(f"Cnode {a} {b} {g(c['Cnode'])}")
        return out

    def inductor(name: str, a: str, b: str, L: float, r: float) -> list[str]:
        """An inductor with its winding resistance in series."""
        if r > 0:
            return [f"R{name} {a} {name.lower()}r {g(r)}", f"{name} {name.lower()}r {b} {g(L)}"]
        return [f"{name} {a} {b} {g(L)}"]

    if t == "buck":
        lines += [*sw("in", "sw"), *diode("D1", "0", "sw", vf), *inductor("Lm", "sw", "out", c["L"], rl)]
        q["v_sw"] = "v(in)-v(sw)"
    elif t == "boost":
        lines += [*inductor("Lm", "in", "lx", c["L"], rl), *sw("lx", "0"), *diode("D1", "lx", "out", vf)]
        q["v_sw"] = "v(lx)"
    elif t == "buckboost":
        # inverting: the output's positive terminal is ground, its negative
        # terminal the node outn; the simulator's v_out is its magnitude
        lines += [*sw("in", "sw"), *inductor("Lm", "sw", "0", c["L"], rl), *diode("D1", "outn", "sw", vf)]
        q["v_sw"] = "v(in)-v(sw)"
    elif t == "flyback":
        # the magnetizing inductance (with the winding resistance) from in, the
        # primary's dot, to the drain d. The ideal transformer: the secondary's
        # dot at ground through Vss, so its other end sn is at -n v_p and the
        # diode blocks while the switch is on; Fp puts n times the secondary
        # current back into the primary.
        lines += [
            *inductor("Lm", "in", "d", c["L"], rl),
            *sw("d", "0"),
            f"Es sx sn in d {g(n)}",
            "Vss sx 0 DC 0",
            f"Fp in d Vss {g(n)}",
            *diode("D1", "sn", "out", vf),
        ]
        q["v_sw"] = "v(d)"
    elif t == "forward":
        nr = c.get("nr", 1)
        lines += [
            # the magnetizing inductance, ideal (the winding resistance R_L is the output inductor's)
            f"Lm in d {g(c['LM'])}",
            *sw("d", "0"),
            # secondary: dot at s1, conducting through D1 while the switch is on
            f"Es sx 0 in d {g(n)}",
            "Vss sx s1 DC 0",
            f"Fp in d Vss {g(n)}",
            *diode("D1", "s1", "x", vf),
            *diode("D2", "0", "x", vf),
            *inductor("Lf", "x", "out", c["L"], rl),
            # an RC snubber across D2 (10 pF, 1 kOhm): it gives the rectifier
            # node the capacitance the solver needs when D1 takes over from D2
            # (the ideal transformer makes that hand-over instantaneous), and
            # damps the output inductor's ringing once both diodes are off in DCM
            "Csn x xsn 10p",
            "Rsn xsn 0 1k",
            # reset winding: dot at ground, its other end at -n_r v_p, returning to the input through D3
            f"Er rx rn in d {g(nr)}",
            "Vsr rx 0 DC 0",
            f"Fr in d Vsr {g(nr)}",
            *diode("D3", "rn", "in", 0),
        ]
        q["v_sw"] = "v(d)"
    else:
        raise ValueError(t)
    pos, neg = ("0", "outn") if t == "buckboost" else ("out", "0")
    lines += load_lines(c["load"], pos, neg)
    q["v_out"] = f"-v({neg})" if pos == "0" else f"v({pos})"
    # the simulator's i_L: the magnetizing current for the flyback, the output inductor's for the forward
    q["i_L"] = "i(Lf)" if t == "forward" else "i(Lm)"
    if t == "forward":
        q["i_M"] = "i(Lm)"
    # the diode current: the forward's two output diodes together carry the output inductor current
    q["i_D"] = "i(VD1)+i(VD2)" if t == "forward" else "i(VD1)"
    # the converter's input current (Vg's own current flows from + through it)
    q["i_in"] = "i(Vin)" if src else "-i(Vg)"
    if src:
        q["v_in"] = "v(in)"
    if c["load"]["kind"] == "fixed":
        q["i_bat"] = "i(Vfix)"
    elif c["load"].get("battery"):
        q["i_bat"] = "i(Vbat)"
    cycles = c["cycles"]
    tstop = cycles * Ts
    t0 = tstop - Ts
    solver = {"method": "gear", "steps": 400, **c.get("spice", {})}
    h = Ts / solver["steps"]
    lines += [
        f".options method={solver['method']} reltol=1e-5 abstol=1e-9 vntol=1e-6 chgtol=1e-16 itl4=100",
        ".control",
        f"tran {g(h)} {g(tstop)} {g(t0)} {g(h)} uic",
    ]
    for name, expr in q.items():
        vec = f"q_{name.lower()}"
        lines.append(f"let {vec} = {expr}")
        for fn in ("avg", "max", "min"):
            lines.append(f"meas tran {vec}_{fn} {fn.upper()} {vec} from={g(t0)} to={g(tstop)}")
        lines.append(f"meas tran {vec}_end FIND {vec} AT={g(tstop)}")
        for k, tk in enumerate(sample_times(c)):
            lines.append(f"meas tran {vec}_s{k:02d} FIND {vec} AT={g(t0 + tk)}")
    lines += ["quit", ".endc", ".end", ""]
    return "\n".join(lines), q


def sample_times(c: dict) -> list[float]:
    """The instants, from the start of the last period, at which each quantity's value is recorded."""
    Ts = 1 / c["fs"]
    return [(k + 0.5) * Ts / SAMPLES for k in range(SAMPLES)]


MEAS = re.compile(r"^q_(\w+?)_(avg|max|min|end|s\d\d)\s*=\s*([-+0-9.eE]+)")


def run(c: dict) -> dict:
    """ngspice's measurements of the case's last period: {"values": {q_avg, q_max, q_min, q_end},
    "samples": {"t": instants, q: values at those instants}}."""
    text, q = netlist(c)
    with tempfile.TemporaryDirectory() as tmp:
        path = Path(tmp) / "case.cir"
        path.write_text(text)
        out = subprocess.run(["ngspice", "-b", str(path)], capture_output=True, text=True, timeout=1800)
    # ngspice prints the measurements' names in lower case
    names = {k.lower(): k for k in q}
    values: dict[str, float] = {}
    samples: dict[str, list[float | None]] = {k: [None] * SAMPLES for k in q}
    for line in (out.stdout + out.stderr).splitlines():
        m = MEAS.match(line.strip())
        if not m or m.group(1) not in names:
            continue
        name, fn, v = names[m.group(1)], m.group(2), float(m.group(3))
        if fn.startswith("s"):
            samples[name][int(fn[1:])] = v
        else:
            values[f"{name}_{fn}"] = v
    missing = [f"{k}_{fn}" for k in q for fn in ("avg", "max", "min", "end") if f"{k}_{fn}" not in values]
    missing += [f"{k}_s{i:02d}" for k in q for i, v in enumerate(samples[k]) if v is None]
    if missing:
        raise RuntimeError(f"{c['id']}: ngspice gave no {missing[:8]}\n{out.stdout[-2000:]}\n{out.stderr[-2000:]}")
    return {"values": values, "samples": {"t": sample_times(c), **samples}}


def version() -> str:
    out = subprocess.run(["ngspice", "--version"], capture_output=True, text=True)
    m = re.search(r"ngspice-(\S+)", out.stdout + out.stderr)
    return m.group(1) if m else "unknown"


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--check", action="store_true", help="run again and compare with the committed fixture")
    ap.add_argument("--netlist", metavar="ID", help="print one case's netlist")
    ap.add_argument("--jobs", type=int, default=os.cpu_count() or 1, help="cases run at once (default: the CPU count)")
    args = ap.parse_args()
    if args.netlist:
        case = next((c for c in CASES if c["id"] == args.netlist), None)
        if not case:
            print(f"no case {args.netlist}", file=sys.stderr)
            return 1
        print(netlist(case)[0])
        return 0
    if not shutil.which("ngspice"):
        print("spice_crosscheck: ngspice is not on the PATH", file=sys.stderr)
        return 1
    # each case is its own ngspice process
    with ThreadPoolExecutor(max_workers=args.jobs) as pool:
        runs = list(pool.map(run, CASES))
    results = []
    for c, r in zip(CASES, runs):
        values = r["values"]
        results.append({"case": c, "spice": values, "samples": r["samples"]})
        print(f"  {c['id']:24s} v_out avg {values['v_out_avg']:.6g}  i_L avg {values['i_L_avg']:.6g}  end {values['i_L_end']:.6g}")
    data = {"ngspice": version(), "cases": results}
    if args.check:
        old = json.loads(FIXTURE.read_text())
        errors = []
        old_by_id = {r["case"]["id"]: r for r in old["cases"]}
        for r in results:
            o = old_by_id.get(r["case"]["id"])
            if o is None or o["case"] != r["case"]:
                errors.append(f"{r['case']['id']}: case differs from the fixture (regenerate it)")
                continue
            if set(o["spice"]) != set(r["spice"]):
                errors.append(f"{r['case']['id']}: measures {sorted(r['spice'])} now, {sorted(o['spice'])} in the fixture")
                continue
            # each value within 1e-3 of its quantity's largest magnitude in the period
            def scale(q: str) -> float:
                return max(abs(o["spice"][f"{q}_max"]), abs(o["spice"][f"{q}_min"]), 1e-12)

            for k, v in r["spice"].items():
                q = k.rsplit("_", 1)[0]
                if abs(v - o["spice"][k]) > 1e-3 * scale(q):
                    errors.append(f"{r['case']['id']}: {k} = {v} now, {o['spice'][k]} in the fixture")
            for q, vs in r["samples"].items():
                if q == "t":
                    continue
                for i, (v, ov) in enumerate(zip(vs, o["samples"][q])):
                    if abs(v - ov) > 1e-3 * scale(q):
                        errors.append(f"{r['case']['id']}: {q} at sample {i} = {v} now, {ov} in the fixture")
        if len(old["cases"]) != len(results):
            errors.append("the fixture has a different number of cases (regenerate it)")
        if errors:
            print("spice_crosscheck: the fixture is out of date:", file=sys.stderr)
            for e in errors:
                print("  " + e, file=sys.stderr)
            return 1
        print(f"spice_crosscheck: OK ({len(results)} cases agree with the fixture; ngspice {data['ngspice']})")
        return 0
    FIXTURE.parent.mkdir(parents=True, exist_ok=True)
    FIXTURE.write_text(json.dumps(data, indent=1) + "\n")
    print(f"spice_crosscheck: wrote {FIXTURE.relative_to(ROOT)} ({len(results)} cases; ngspice {data['ngspice']})")
    return 0


if __name__ == "__main__":
    sys.exit(main())
