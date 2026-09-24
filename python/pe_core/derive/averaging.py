"""Averaging: the dc component of the switch-node voltage, the two-interval
forms of volt-second and charge balance, and the boost converter with
inductor winding resistance (conversion ratio and efficiency).

Reference: Erickson & Maksimović (2020), Ch. 2 (principles of steady-state
converter analysis) and Ch. 3 (steady-state equivalent circuit modeling,
losses, and efficiency).
"""

from __future__ import annotations

import sympy as sp

from .common import Derivation, S


def derive() -> Derivation:
    d = Derivation(
        module="averaging",
        title="Averaging, balance, and losses in the averaged model",
        title_ko="평균화, 평형 조건, 평균 모델의 손실",
        intro=(
            "A switching converter chops a dc input into a pulse train; a low-pass filter keeps its average. "
            "Averaging each circuit equation over one period turns the switched circuit into a dc model in "
            "which losses such as the inductor winding resistance $R_L$ appear as ordinary resistors."
        ),
        intro_ko=(
            "스위칭 컨버터는 직류 입력을 펄스열로 잘게 자르고, 저역통과 필터가 그 평균을 남긴다. 각 회로 방정식을 "
            "한 주기에 걸쳐 평균하면 스위칭 회로가 직류 모델이 되며, 인덕터 권선 저항 $R_L$ 같은 손실은 평범한 "
            "저항으로 나타난다."
        ),
    )
    D, Vg, V, R, RL = S("D"), S("V_g"), S("V"), S("R"), S("R_L")
    t = d.local("t", "t", real=True)
    Ts = S("T_s")
    vs = d.local("v_s", "v_s", real=True)
    x_on = d.local("x_on", r"x_\mathrm{on}", real=True)
    x_off = d.local("x_off", r"x_\mathrm{off}", real=True)
    I = d.local("I_", "I", positive=True)
    Vv = d.local("V_", "V", positive=True)

    # ------------------------------------------------ switch-node average
    avg = (sp.integrate(Vg, (t, 0, D * Ts)) + sp.integrate(0, (t, D * Ts, Ts))) / Ts
    d.step(
        "The buck switch node is at $V_g$ for $0 < t < D T_s$ and at $0$ for $D T_s < t < T_s$; average it over one period.",
        "벅의 스위치 노드는 $0 < t < D T_s$ 동안 $V_g$, $D T_s < t < T_s$ 동안 $0$이다. 한 주기에 걸쳐 평균한다.",
        sp.Eq(S("v_s_avg"), sp.Integral(vs, (t, 0, Ts)) / Ts),
    )
    d.result("sw.v_avg", sp.simplify(avg), "Evaluate the two pieces.", "두 구간을 계산한다.", S("v_s_avg"))

    # ------------------------------------------------ change over one period
    L = S("L")
    vL = d.local("v_L", "v_L", real=True)
    v_on = d.local("v_on", r"v_{L,\mathrm{on}}", real=True)
    v_off = d.local("v_off", r"v_{L,\mathrm{off}}", real=True)
    d.step(
        "The inductor obeys $v_L = L \\, di/dt$. Integrated over one period, the current's change is the "
        "integral of the voltage over $L$.",
        "인덕터는 $v_L = L \\, di/dt$를 따른다. 한 주기에 걸쳐 적분하면 전류의 변화는 전압의 적분을 $L$로 나눈 값이다.",
        sp.Eq(S("Delta_i"), sp.Integral(vL, (t, 0, Ts)) / L),
    )
    # any piecewise voltage will do; two intervals show the average appearing
    area = sp.integrate(v_on, (t, 0, D * Ts)) + sp.integrate(v_off, (t, D * Ts, Ts))
    v_avg = area / Ts
    d.step(
        "For a voltage $v_{L,\\mathrm{on}}$ during $D T_s$ and $v_{L,\\mathrm{off}}$ for the rest, the integral is "
        "$T_s$ times the average over the period.",
        "$D T_s$ 동안 $v_{L,\\mathrm{on}}$, 나머지 동안 $v_{L,\\mathrm{off}}$인 전압이라면 적분은 한 주기 평균에 $T_s$를 곱한 값이다.",
        sp.Eq(S("v_L_avg"), sp.simplify(v_avg)),
    )
    d.result(
        "vsb.drift",
        S("v_L_avg") * sp.simplify((area / L) / v_avg),
        "So the change over one period is the average voltage times $T_s$ over $L$; it is zero only when the "
        "average is (volt-second balance).",
        "따라서 한 주기 동안의 변화는 평균 전압에 $T_s$를 곱해 $L$로 나눈 값이며, 평균이 0일 때만 0이다(전압-초 평형).",
        S("Delta_i"),
    )

    # ------------------------------------------------ two-interval balance
    bal = sp.Eq(D * x_on + (1 - D) * x_off, 0)
    d.step(
        "With the small-ripple approximation the inductor voltage (or capacitor current) takes one value "
        "$x_\\mathrm{on}$ for $D T_s$ and another value $x_\\mathrm{off}$ for $(1 - D) T_s$; its average must be zero.",
        "소리플 근사를 쓰면 인덕터 전압(또는 커패시터 전류)은 $D T_s$ 동안 $x_\\mathrm{on}$, $(1 - D) T_s$ 동안 "
        "$x_\\mathrm{off}$ 값을 가지며, 그 평균은 0이어야 한다.",
        bal,
    )
    x_off_sol = sp.solve(bal, x_off)[0]
    d.result(
        "vsb.v_off",
        x_off_sol.subs(x_on, S("v_Lon")),
        "For the inductor voltage ($x = v_L$): volt-second balance.",
        "인덕터 전압($x = v_L$)의 경우: 전압-초 평형.",
        S("v_Loff"),
    )
    d.result(
        "csb.i_off",
        x_off_sol.subs(x_on, S("i_Con")),
        "For the capacitor current ($x = i_C$): charge balance.",
        "커패시터 전류($x = i_C$)의 경우: 전하 평형.",
        S("i_Coff"),
    )

    # ------------------------------------------------ boost with R_L
    vsb = sp.Eq(D * (Vg - I * RL) + (1 - D) * (Vg - I * RL - Vv), 0)
    d.step(
        "Boost with inductor winding resistance $R_L$, volt-second balance: the inductor sees $V_g - I R_L$ "
        "while the switch is on and $V_g - I R_L - V$ while the diode conducts ($I$ = dc inductor current).",
        "인덕터 권선 저항 $R_L$이 있는 부스트의 전압-초 평형: 인덕터에는 스위치 온 구간에 $V_g - I R_L$, "
        "다이오드 도통 구간에 $V_g - I R_L - V$가 걸린다($I$ = 인덕터 직류 전류).",
        vsb,
    )
    csb = sp.Eq(D * (-Vv / R) + (1 - D) * (I - Vv / R), 0)
    d.step(
        "Charge balance on the output capacitor: $-V/R$ while the switch is on, $I - V/R$ while the diode conducts.",
        "출력 커패시터의 전하 평형: 스위치 온 구간에 $-V/R$, 다이오드 도통 구간에 $I - V/R$.",
        csb,
    )
    sol = sp.solve([vsb, csb], [Vv, I], dict=True)
    if len(sol) != 1:
        raise ValueError(f"boost with R_L: expected one solution, got {sol}")
    Vsol, Isol = sol[0][Vv], sol[0][I]
    d.step("Solve the two linear equations for $I$.", "두 1차 방정식을 $I$에 대해 푼다.", sp.Eq(I, sp.simplify(Isol)))
    d.result(
        "boost.ccm.M_RL",
        sp.simplify(Vsol / Vg),
        "and for $M = V/V_g$.",
        "그리고 $M = V/V_g$에 대해 푼다.",
        S("M"),
    )
    d.result(
        "boost.ccm.eta_RL",
        sp.simplify((Vsol**2 / R) / (Vg * Isol)),
        "Efficiency is the output power $V^2/R$ over the input power $V_g I$.",
        "효율은 출력 전력 $V^2/R$을 입력 전력 $V_g I$로 나눈 값이다.",
        S("eta"),
    )
    return d
