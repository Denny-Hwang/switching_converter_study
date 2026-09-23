"""Linear-source power: maximum power transfer and the extraction fraction
of a constant-voltage sink.

Reference: Alexander & Sadiku (2017), Sec. 4.8 (maximum power transfer).
"""

from __future__ import annotations

import sympy as sp

from .common import Derivation, S


def derive() -> Derivation:
    d = Derivation(
        module="harvesting",
        title="Linear source: maximum power and constant-voltage extraction",
        title_ko="선형 전원: 최대 전력과 정전압 추출",
        intro=(
            "A linear energy source is modelled by its Thevenin equivalent: open-circuit voltage $V_\\mathrm{oc}$ behind "
            "a source resistance $R_s$. How much of its available power reaches the converter depends on what "
            "the converter's input looks like."
        ),
        intro_ko=(
            "선형 에너지원은 테브난 등가회로, 즉 전원 저항 $R_s$ 뒤의 개방 전압 $V_\\mathrm{oc}$로 모델링한다. "
            "가용 전력 중 얼마가 컨버터에 도달하는지는 컨버터 입력이 어떻게 보이는지에 달려 있다."
        ),
    )
    Voc, Rs, Vc = S("V_oc"), S("R_s"), S("V_c")
    RL = d.local("R_L", "R_L", positive=True)
    P = d.local("P_L", r"P_L", positive=True)
    I = d.local("I_", "I", positive=True)

    PL = Voc**2 * RL / (Rs + RL) ** 2
    d.step("Power into a load resistance $R_L$.", "부하 저항 $R_L$로 들어가는 전력.", sp.Eq(P, PL))
    crit = sp.solve(sp.Eq(sp.diff(PL, RL), 0), RL)
    if crit != [Rs]:
        raise ValueError(f"unexpected stationary points {crit}")
    d.step("$dP_L/dR_L = 0$ gives the matched load.", "$dP_L/dR_L = 0$에서 정합 부하를 얻는다.", sp.Eq(RL, crit[0]))
    Pmax = sp.simplify(PL.subs(RL, Rs))
    d.result("src.Pmax", Pmax, "Substitute $R_L = R_s$.", "$R_L = R_s$를 대입한다.", S("P_max"))

    Ic = (Voc - Vc) / Rs
    d.step(
        "A constant-voltage sink at $V_c$ (e.g. a converter pinned at a fixed input voltage) draws $I = (V_\\mathrm{oc} - V_c)/R_s$.",
        "$V_c$의 정전압 싱크(예: 입력이 고정 전압에 묶인 컨버터)는 $I = (V_\\mathrm{oc} - V_c)/R_s$를 끌어온다.",
        sp.Eq(I, Ic),
    )
    d.step("The power it absorbs.", "싱크가 흡수하는 전력.", sp.Eq(P, Vc * Ic))
    d.result(
        "src.cv_extraction",
        sp.simplify(Vc * Ic / Pmax),
        "Normalise by $P_\\mathrm{max}$.",
        "$P_\\mathrm{max}$로 정규화한다.",
        S("eta_ext"),
    )
    return d
