"""Linear-source power: maximum power transfer and the extraction fraction
of a constant-voltage sink.

Reference: Alexander & Sadiku (2017), Sec. 4.8 (maximum power transfer).
"""

from __future__ import annotations

import sympy as sp

from .common import Derivation, S, positive_root


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
    d.result(
        "src.cv_power",
        Vc * Ic,
        "The power it absorbs: negative when $V_c > V_\\mathrm{oc}$, when the sink returns energy to the source.",
        "싱크가 흡수하는 전력. $V_c > V_\\mathrm{oc}$이면 음수이며, 싱크가 전원으로 에너지를 되돌려 보낸다.",
        S("P"),
    )
    d.result(
        "src.cv_extraction",
        sp.simplify(Vc * Ic / Pmax),
        "Normalise by $P_\\mathrm{max}$.",
        "$P_\\mathrm{max}$로 정규화한다.",
        S("eta_ext"),
    )

    Rin, Vg, Pin = S("R_in"), S("V_g"), S("P")
    d.step(
        "A converter in DCM draws an average input current proportional to its input voltage: its input is a "
        "resistance $R_\\mathrm{in}$, the loss-free resistor, which takes the place of $R_L$.",
        "DCM 컨버터는 입력 전압에 비례하는 평균 입력 전류를 끌어오므로, 입력이 저항 $R_\\mathrm{in}$, 즉 무손실 "
        "저항으로 보이며 $R_L$ 자리에 들어간다.",
    )
    d.result(
        "lfr.Vg",
        Voc * Rin / (Rs + Rin),
        "The source resistance and $R_\\mathrm{in}$ divide the source voltage.",
        "전원 저항과 $R_\\mathrm{in}$이 전원 전압을 분압한다.",
        Vg,
    )
    d.result(
        "lfr.eta",
        sp.simplify(PL.subs(RL, Rin) / Pmax),
        "$P_L$ with $R_L = R_\\mathrm{in}$, normalised by $P_\\mathrm{max}$: the source voltage cancels.",
        "$R_L = R_\\mathrm{in}$일 때의 $P_L$을 $P_\\mathrm{max}$로 정규화한다. 전원 전압은 소거된다.",
        S("eta_ext"),
    )
    d.step(
        "The loss-free resistor draws the power of a resistance at its input voltage.",
        "무손실 저항은 입력 전압에서 저항이 끌어오는 만큼의 전력을 끌어온다.",
        sp.Eq(Pin, Vg**2 / Rin),
    )
    d.result(
        "lfr.Vg_power",
        positive_root(sp.solve(sp.Eq(Pin, Vg**2 / Rin), Vg), {Pin: 0.5, Rin: 200.0}),
        "Solve for $V_g$: a larger power needs a higher input voltage.",
        "$V_g$에 대해 푼다. 전력이 클수록 입력 전압이 높아야 한다.",
        Vg,
    )

    LM, D, fs = S("L_M"), S("D"), S("f_s")
    d.step(
        "A DCM flyback's input resistance is $R_\\mathrm{in} = 2 L_M f_s / D^2$ (derived with the flyback).",
        "DCM 플라이백의 입력 저항은 $R_\\mathrm{in} = 2 L_M f_s / D^2$이다(플라이백과 함께 유도).",
        sp.Eq(Rin, 2 * LM * fs / D**2),
    )
    sol = sp.solve(sp.Eq(Rin, 2 * LM * fs / D**2), LM)
    if len(sol) != 1:
        raise ValueError(f"unexpected solutions {sol}")
    d.result(
        "lfr.L_M",
        sol[0],
        "Solve for $L_M$: the inductance that presents a wanted $R_\\mathrm{in}$, such as $R_s$ to match the source.",
        "$L_M$에 대해 푼다. 원하는 $R_\\mathrm{in}$(전원에 정합하려면 $R_s$)을 보이는 인덕턴스.",
        LM,
    )

    Vpk, eta, t, Te = S("V_ocpk"), S("eta_ext"), d.local("t", "t", positive=True), S("T_env")
    Voc_t = Vpk * sp.sin(sp.pi * t / Te)
    d.step(
        "Under an envelope slow against the bus, the loss-free resistor takes $\\eta_\\mathrm{ext} V_\\mathrm{oc}^2/(4 R_s)$ "
        "at every instant; take $V_\\mathrm{oc}(t) = \\hat{V}_\\mathrm{oc} \\sin(\\pi t / T_\\mathrm{env})$, one half-wave of the "
        "envelope (a rectified sine repeats it).",
        "포락선이 버스보다 충분히 느리면 무손실 저항은 매 순간 $\\eta_\\mathrm{ext} V_\\mathrm{oc}^2/(4 R_s)$를 받는다. "
        "$V_\\mathrm{oc}(t) = \\hat{V}_\\mathrm{oc} \\sin(\\pi t / T_\\mathrm{env})$, 즉 포락선의 반파 하나를 잡는다(정류된 사인은 이를 반복한다).",
        sp.Eq(S("P"), eta * Voc_t**2 / (4 * Rs)),
    )
    avg = sp.simplify(sp.integrate(eta * Voc_t**2 / (4 * Rs), (t, 0, Te)) / Te)
    d.result(
        "lfr.P_env",
        avg,
        "Average over the half-wave: the square of a sine averages to half its peak's.",
        "반파에 걸쳐 평균한다. 사인의 제곱은 평균이 최댓값 제곱의 절반이다.",
        S("P_avg"),
    )
    return d
