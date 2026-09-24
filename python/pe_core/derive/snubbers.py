"""Snubbers: the parasitic capacitance and inductance of a ringing node from
two measured ringing frequencies, the RC snubber's resistance for a damping
factor, the loss the snubber adds and what its resistor dissipates.

References: Nexperia AN11160 "Designing RC snubbers" (the measurement with an
added capacitor, Sec. 3; the damping factor of the parasitic inductance, the
resistor and the snubber capacitor in series, and the snubber's average power
loss, Sec. 2; the power dissipation in the snubber resistor, Sec. 4); Erickson
& Maksimović (2020), Ch. 4 (energy lost charging a capacitance).
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
    Cs, Vs, fs, P = S("C_snub"), S("V_snub"), S("f_s"), S("P")
    R, zeta = S("R_snub"), S("zeta")
    s_ = d.local("s", "s")
    d.step(
        "AN11160 takes the damping factor of the parasitic inductance, the snubber resistor and the snubber capacitor "
        "in series, leaving the node's own capacitance out. That loop's natural frequencies solve",
        "AN11160은 기생 인덕턴스, 스너버 저항, 스너버 커패시터를 직렬로 본 루프의 감쇠 계수를 쓰며, 노드 자체의 "
        "커패시턴스는 넣지 않는다. 이 루프의 고유 주파수는 다음 식을 만족한다.",
        sp.Eq(s_**2 * Lpar * Cs + s_ * R * Cs + 1, 0),
    )
    w0 = 1 / sp.sqrt(Lpar * Cs)
    zeta_of_R = sp.simplify(R / Lpar / (2 * w0))
    d.step(
        "Divided by $L_\\mathrm{par} C_\\mathrm{snub}$ and written as $s^2 + 2\\zeta\\omega_0 s + \\omega_0^2 = 0$, "
        "with $\\omega_0 = 1/\\sqrt{L_\\mathrm{par} C_\\mathrm{snub}}$, its damping factor is",
        "$L_\\mathrm{par} C_\\mathrm{snub}$로 나누어 $\\omega_0 = 1/\\sqrt{L_\\mathrm{par} C_\\mathrm{snub}}$인 "
        "$s^2 + 2\\zeta\\omega_0 s + \\omega_0^2 = 0$ 꼴로 쓰면, 감쇠 계수는 다음과 같다.",
        sp.Eq(zeta, zeta_of_R),
    )
    d.result(
        "snub.R",
        positive_root(sp.solve(sp.Eq(zeta, zeta_of_R), R), {zeta: 0.75, Lpar: 1e-6, Cs: 1e-10}),
        "Solved for the resistance:",
        "저항에 대해 풀면:",
        R,
    )
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
        "The next edge discharges the capacitor, through the resistor and the switch that turns on, and loses its "
        "stored energy, as much again, so each period loses",
        "다음 에지에서는 커패시터가 저항과 켜지는 스위치를 통해 방전하며 저장된 에너지, 즉 같은 양을 다시 잃는다. 따라서 한 "
        "주기에 잃는 에너지는 다음과 같다.",
        sp.Eq(2 * E, 2 * lost),
    )
    d.result(
        "snub.P",
        2 * lost * fs,
        "At $f_s$ periods per second:",
        "초당 $f_s$ 주기이므로:",
        P,
    )
    Ir = S("I_ring")
    Es = d.local("E_s", "E_s", positive=True)
    W = d.local("W_R", "W_R", positive=True)
    delivered = Vs * (Cs * Vs)
    d.step(
        "AN11160 rates the resistor from the edge that charges the capacitor while the parasitic inductance carries a "
        "current $I_\\mathrm{ring}$. The source delivers the capacitor's charge $C_\\mathrm{snub} V_\\mathrm{snub}$ at "
        "$V_\\mathrm{snub}$:",
        "AN11160은 기생 인덕턴스에 전류 $I_\\mathrm{ring}$이 흐르는 동안 커패시터를 충전하는 에지로 저항의 정격을 정한다. "
        "전원은 커패시터의 전하 $C_\\mathrm{snub} V_\\mathrm{snub}$을 전압 $V_\\mathrm{snub}$에서 공급한다.",
        sp.Eq(Es, delivered),
    )
    W_R = delivered - Cs * Vs**2 / 2 + Lpar * Ir**2 / 2
    d.step(
        "The capacitor keeps half of that energy and the inductance gives up all of its own, $L_\\mathrm{par} "
        "I_\\mathrm{ring}^2/2$; the resistor takes the rest, whatever its value:",
        "커패시터는 그 에너지의 절반을 저장하고 인덕턴스는 자신의 에너지 $L_\\mathrm{par} I_\\mathrm{ring}^2/2$를 모두 "
        "내놓는다. 나머지는 저항값과 관계없이 저항이 가져간다.",
        sp.Eq(W, W_R),
    )
    d.result(
        "snub.P_R",
        sp.factor(W_R * fs),
        "Once per period:",
        "한 주기에 한 번이므로:",
        S("P_Rsnub"),
    )
    return d
