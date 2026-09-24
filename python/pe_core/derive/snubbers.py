"""Snubbers: the parasitic capacitance and inductance of a ringing node from
two measured ringing frequencies, the RC snubber's resistance (the ring's
characteristic impedance) and its loss.

References: Nexperia AN11160 "Designing RC snubbers" (the measurement with an
added capacitor, the resistor equal to the characteristic impedance, the
power in the snubber resistor); Erickson & Maksimović (2020), Ch. 4 (energy
lost charging a capacitance).
"""

from __future__ import annotations

import sympy as sp

from .common import Derivation, S, positive_root


def derive() -> Derivation:
    d = Derivation(
        module="snubbers",
        title="Snubbers: parasitics from the ringing, damping resistance and loss",
        title_ko="스너버: 링잉에서 구한 기생 성분, 감쇠 저항, 손실",
        intro=(
            "A switching edge makes a node's parasitic inductance and capacitance ring. Their values, which cannot be read "
            "from the layout, follow from the ringing frequency measured twice: as built, and with a known capacitor added."
        ),
        intro_ko=(
            "스위칭 에지는 노드의 기생 인덕턴스와 커패시턴스를 링잉시킨다. 레이아웃에서 읽을 수 없는 이 값들은 링잉 주파수를 두 번, "
            "즉 원래 회로에서 한 번, 알려진 커패시터를 더해서 한 번 재면 구할 수 있다."
        ),
    )
    f0, f1, Cadd, Cpar, Lpar = S("f_r0"), S("f_r1"), S("C_add"), S("C_par"), S("L_par")
    d.step(
        "As built, the node rings at the resonance of its inductance and capacitance:",
        "원래 회로에서 노드는 인덕턴스와 커패시턴스의 공진 주파수로 링잉한다.",
        sp.Eq(f0, 1 / (2 * sp.pi * sp.sqrt(Lpar * Cpar))),
    )
    d.step(
        "A known capacitor across the node adds to the capacitance but leaves the inductance as it is:",
        "노드에 알려진 커패시터를 달면 커패시턴스에 더해지고 인덕턴스는 그대로이다.",
        sp.Eq(f1, 1 / (2 * sp.pi * sp.sqrt(Lpar * (Cpar + Cadd)))),
    )
    ratio = sp.simplify((f0 / f1) ** 2)
    x = d.local("x", "x", positive=True)
    d.step(
        "The inductance cancels from the ratio of the two frequencies, $x = f_{r0}/f_{r1}$:",
        "두 주파수의 비 $x = f_{r0}/f_{r1}$에서 인덕턴스가 소거된다.",
        sp.Eq(x**2, sp.simplify(((Cpar + Cadd) / Cpar))),
    )
    sol = sp.solve(sp.Eq((f0 / f1) ** 2, (Cpar + Cadd) / Cpar), Cpar)
    d.result(
        "snub.C_par",
        sol[0],
        "Solved for the node's capacitance:",
        "노드의 커패시턴스에 대해 풀면:",
        Cpar,
    )
    lsol = sp.solve(sp.Eq(f0, 1 / (2 * sp.pi * sp.sqrt(Lpar * Cpar))), Lpar)
    d.result(
        "snub.L_par",
        lsol[0],
        "and the first resonance then gives the inductance:",
        "그러면 첫 번째 공진에서 인덕턴스가 나온다.",
        Lpar,
    )
    w = d.local("omega_r", r"\omega_r", positive=True)
    Z0 = d.local("Z_0", "Z_0", positive=True)
    d.step(
        "At the ringing frequency $\\omega_r = 1/\\sqrt{L_\\mathrm{par} C_\\mathrm{par}}$ the two reactances are equal; "
        "their common value is the characteristic impedance:",
        "링잉 주파수 $\\omega_r = 1/\\sqrt{L_\\mathrm{par} C_\\mathrm{par}}$에서 두 리액턴스는 같고, 그 값이 특성 임피던스이다.",
        sp.Eq(Z0, sp.simplify((w * Lpar).subs(w, 1 / sp.sqrt(Lpar * Cpar)))),
    )
    Q = d.local("Q", "Q", positive=True)
    R = S("R_snub")
    d.step(
        "A resistance $R$ across the ring, through a capacitor that is nearly a short at $\\omega_r$, sets its quality "
        "factor (parallel resonance):",
        "$\\omega_r$에서 거의 단락처럼 보이는 커패시터를 거쳐 링잉 노드에 연결한 저항 $R$은 링잉의 품질 계수를 정한다(병렬 공진).",
        sp.Eq(Q, R / Z0),
    )
    d.result(
        "snub.R",
        positive_root(sp.solve(sp.Eq(1, R / sp.sqrt(Lpar / Cpar)), R), {Lpar: 1e-6, Cpar: 1e-10}),
        "Choosing $Q = 1$ damps the ring within about one period:",
        "$Q = 1$로 고르면 링잉은 약 한 주기 안에 감쇠한다.",
        R,
    )
    Cs, Vs, fs, P = S("C_snub"), S("V_snub"), S("f_s"), S("P")
    t = d.local("t", "t", positive=True)
    Rr = d.local("R", "R", positive=True)
    i = (Vs / Rr) * sp.exp(-t / (Rr * Cs))
    lost = sp.simplify(sp.integrate(i**2 * Rr, (t, 0, sp.oo)))
    E = d.local("E_R", "E_R", positive=True)
    d.step(
        "At an edge the node steps by $V_\\mathrm{snub}$ and the snubber capacitor charges through the resistor, "
        "$i = (V_\\mathrm{snub}/R)\\,e^{-t/(R C_\\mathrm{snub})}$; the energy the resistor takes does not depend on $R$:",
        "에지에서 노드 전압이 $V_\\mathrm{snub}$만큼 바뀌면 스너버 커패시터가 저항을 통해 충전된다: "
        "$i = (V_\\mathrm{snub}/R)\\,e^{-t/(R C_\\mathrm{snub})}$. 저항이 가져가는 에너지는 $R$과 무관하다.",
        sp.Eq(E, lost),
    )
    d.step(
        "The opposite edge discharges the capacitor through the resistor and loses the same energy again, so each "
        "period loses",
        "반대쪽 에지는 저항을 통해 커패시터를 방전시키며 같은 에너지를 다시 잃으므로, 한 주기에 잃는 에너지는 다음과 같다.",
        sp.Eq(2 * E, 2 * lost),
    )
    d.result(
        "snub.P",
        2 * lost * fs,
        "At $f_s$ periods per second:",
        "초당 $f_s$ 주기이므로:",
        P,
    )
    return d
