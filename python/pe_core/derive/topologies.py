"""Topology details: dc inductor currents, current and voltage ripple, switch
voltage stress, and transistor utilization of the buck, boost, buck-boost,
flyback and forward converters in CCM.

The dc currents follow from capacitor charge balance, the current ripple
from the constant inductor voltage during the on-interval, the voltage
ripple from the charge the capacitor gives or takes in one period, and the
utilization from the definition "load power over the transistor's peak
voltage times its rms current", with small-ripple (flat-topped) currents.

References: Erickson & Maksimović (2020), Ch. 2 (principles of steady-state
converter analysis) and Ch. 6 (converter circuits; switch stress and
utilization).
"""

from __future__ import annotations

import sympy as sp

from .common import Derivation, S


def derive() -> Derivation:
    d = Derivation(
        module="topologies",
        title="Topology details: dc currents, ripple, switch stress, utilization (CCM)",
        title_ko="토폴로지 세부: 직류 전류, 리플, 스위치 스트레스, 이용률(CCM)",
        intro=(
            "Charge balance on the output capacitor gives each converter's dc inductor current. During the "
            "on-interval the inductor sees a constant voltage, so its current changes linearly by twice the "
            "half-ripple $\\Delta i_L$; the capacitor's charge per period gives the voltage ripple $\\Delta v$ "
            "in the same way. The transistor utilization $U$ compares the load power with the product of the "
            "transistor's peak voltage and rms current."
        ),
        intro_ko=(
            "출력 커패시터의 전하 평형으로 각 컨버터의 인덕터 직류 전류를 구한다. 온 구간 동안 인덕터에는 "
            "일정한 전압이 걸리므로 전류는 리플 절반 $\\Delta i_L$의 두 배만큼 직선으로 변하며, 한 주기 동안 "
            "커패시터가 주고받는 전하로부터 같은 방식으로 전압 리플 $\\Delta v$를 구한다. 트랜지스터 이용률 $U$는 "
            "부하 전력을 트랜지스터의 피크 전압과 실효 전류의 곱과 비교한 값이다."
        ),
    )
    D, Vg, V, R, L, C, Ts = S("D"), S("V_g"), S("V"), S("R"), S("L"), S("C"), S("T_s")
    n, n_r = S("n"), S("n_r")
    IL, dI, dv = S("I_L"), S("Delta_i_L"), S("Delta_v")
    iC = d.local("i_C_avg", r"\langle i_C \rangle")
    q = d.local("q", "q", positive=True)
    I = d.local("I_out", "I", positive=True)  # dc load current
    vpri = d.local("v_pri", r"v_\mathrm{pri}", real=True)

    # ------------------------------------------------------------ buck
    d.step(
        "Buck, charge balance: the capacitor current is $I_L - V/R$ in both intervals (small ripple).",
        "벅, 전하 평형: 커패시터 전류는 두 구간 모두에서 $I_L - V/R$이다(소리플 근사).",
        sp.Eq(iC, IL - V / R),
    )
    d.result("buck.IL", sp.solve(sp.Eq(IL - V / R, 0), IL)[0], "Set the average to zero.", "평균을 0으로 놓는다.", IL)

    d.step(
        "Buck output ripple: the capacitor takes the triangular ac part of the inductor current. Its positive "
        "half lasts $T_s/2$ and peaks at $\\Delta i_L$, so it delivers the charge $q$.",
        "벅 출력 리플: 커패시터는 인덕터 전류의 삼각파 교류 성분을 받는다. 그 양의 절반은 $T_s/2$ 동안 "
        "지속되고 최댓값이 $\\Delta i_L$이므로, 전하 $q$를 전달한다.",
        sp.Eq(q, sp.Rational(1, 2) * (Ts / 2) * dI),
    )
    ripple_v = sp.Eq(C * 2 * dv, sp.Rational(1, 2) * (Ts / 2) * dI)
    d.step(
        "That charge raises the capacitor voltage from its minimum to its maximum, $2\\Delta v$.",
        "그 전하가 커패시터 전압을 최솟값에서 최댓값까지, 즉 $2\\Delta v$만큼 올린다.",
        ripple_v,
    )
    d.result("buck.ripple.v", sp.solve(ripple_v, dv)[0], "Solve for $\\Delta v$.", "$\\Delta v$에 대해 푼다.", dv)

    # ------------------------------------------------------------ boost
    cb = sp.Eq(D * (-V / R) + (1 - D) * (IL - V / R), 0)
    d.step(
        "Boost, charge balance: $-V/R$ while the switch is on, $I_L - V/R$ while the diode conducts.",
        "부스트, 전하 평형: 스위치 온 구간에 $-V/R$, 다이오드 도통 구간에 $I_L - V/R$.",
        cb,
    )
    d.result("boost.IL", sp.solve(cb, IL)[0], "Solve for $I_L$.", "$I_L$에 대해 푼다.", IL)
    rip = sp.Eq(2 * dI, Vg * D * Ts / L)
    d.step(
        "Boost current ripple: the inductor sees $V_g$ for $D T_s$, so its current rises by $V_g D T_s/L$, "
        "which is $2\\Delta i_L$.",
        "부스트 전류 리플: 인덕터에 $D T_s$ 동안 $V_g$가 걸리므로 전류는 $V_g D T_s/L$, 즉 $2\\Delta i_L$만큼 증가한다.",
        rip,
    )
    d.result("boost.ripple.iL", sp.solve(rip, dI)[0], "Solve for $\\Delta i_L$.", "$\\Delta i_L$에 대해 푼다.", dI)
    ripv = sp.Eq(2 * dv, (V / R) * D * Ts / C)
    d.step(
        "Boost voltage ripple: while the switch is on, the capacitor alone feeds the load current $V/R$ for "
        "$D T_s$, so its voltage falls by $2\\Delta v$.",
        "부스트 전압 리플: 스위치가 켜져 있는 $D T_s$ 동안 커패시터 혼자 부하 전류 $V/R$을 공급하므로 전압이 "
        "$2\\Delta v$만큼 떨어진다.",
        ripv,
    )
    d.result("boost.ripple.v", sp.solve(ripv, dv)[0], "Solve for $\\Delta v$.", "$\\Delta v$에 대해 푼다.", dv)

    # ------------------------------------------------------------ buck-boost
    vsb = sp.Eq(D * Vg + (1 - D) * (-V), 0)
    d.step(
        "Buck-boost with the output magnitude $V$: the inductor sees $V_g$ while the switch is on and $-V$ "
        "while the diode conducts.",
        "출력 크기 $V$로 쓴 벅-부스트: 인덕터에는 스위치 온 구간에 $V_g$, 다이오드 도통 구간에 $-V$가 걸린다.",
        vsb,
    )
    d.result("buckboost.V", sp.solve(vsb, V)[0], "Solve for $V$.", "$V$에 대해 푼다.", V)
    d.result(
        "buckboost.IL",
        sp.solve(cb, IL)[0],
        "Charge balance is the boost's: the capacitor feeds the load while the switch is on and receives "
        "$I_L$ while the diode conducts.",
        "전하 평형은 부스트와 같다: 스위치 온 구간에는 커패시터가 부하를 공급하고, 다이오드 도통 구간에는 "
        "$I_L$을 받는다.",
        IL,
    )
    d.result(
        "buckboost.ripple.iL",
        sp.solve(rip, dI)[0],
        "The inductor sees $V_g$ during $D T_s$, as in the boost.",
        "부스트와 마찬가지로 인덕터에는 $D T_s$ 동안 $V_g$가 걸린다.",
        dI,
    )
    d.result(
        "buckboost.ripple.v",
        sp.solve(ripv, dv)[0],
        "The capacitor alone feeds the load during $D T_s$, as in the boost.",
        "부스트와 마찬가지로 $D T_s$ 동안 커패시터 혼자 부하를 공급한다.",
        dv,
    )
    d.result(
        "buckboost.Vds",
        Vg - (-V),
        "While the diode conducts, the switch's far end sits at the output, $-V$; the switch blocks $V_g - (-V)$.",
        "다이오드가 도통하는 동안 스위치의 반대쪽 단자는 출력 전위 $-V$에 있으므로, 스위치는 $V_g - (-V)$를 차단한다.",
        S("V_DS"),
    )

    # ------------------------------------------------------------ forward
    reset = sp.Eq(vpri, -Vg / n_r)
    d.step(
        "Forward, reset interval: the reset winding ($N_r$ turns) connects to $V_g$ with reversed polarity, so "
        "the primary ($N_p$ turns) sees $-V_g N_p/N_r$.",
        "포워드, 리셋 구간: 리셋 권선($N_r$턴)이 극성이 반대로 $V_g$에 연결되므로 1차 권선($N_p$턴)에는 "
        "$-V_g N_p/N_r$이 걸린다.",
        reset,
    )
    d.result(
        "forward.Vds",
        sp.factor(Vg - reset.rhs),
        "The switch blocks the input voltage minus the primary voltage.",
        "스위치는 입력 전압에서 1차 전압을 뺀 값을 차단한다.",
        S("V_DS"),
    )
    frip = sp.Eq(2 * dI, (n * Vg - V) * D * Ts / L)
    d.step(
        "Forward output inductor: while the switch is on, the secondary applies $n V_g$, so the inductor sees "
        "$n V_g - V$ for $D T_s$.",
        "포워드 출력 인덕터: 스위치가 켜져 있는 동안 2차 권선이 $n V_g$를 인가하므로 인덕터에는 $D T_s$ 동안 "
        "$n V_g - V$가 걸린다.",
        frip,
    )
    d.result("forward.ripple.iL", sp.solve(frip, dI)[0], "Solve for $\\Delta i_L$.", "$\\Delta i_L$에 대해 푼다.", dI)

    # ------------------------------------------------------------ utilization
    Ul = d.local("U_", "U", positive=True)
    d.step(
        "Transistor utilization: the load power $P = V I$ over the transistor's peak voltage times its rms "
        "current. With small ripple the transistor current is a flat pulse of height $I_Q$ for $D T_s$, whose "
        "rms value is $I_Q \\sqrt{D}$.",
        "트랜지스터 이용률: 부하 전력 $P = V I$를 트랜지스터의 피크 전압과 실효 전류의 곱으로 나눈 값. "
        "소리플 근사에서 트랜지스터 전류는 $D T_s$ 동안 높이 $I_Q$인 평평한 펄스이며, 그 실효값은 "
        "$I_Q \\sqrt{D}$이다.",
    )

    def util(eq_id: str, text: str, text_ko: str, v_out: sp.Expr, v_peak: sp.Expr, i_pulse: sp.Expr) -> sp.Expr:
        u = sp.simplify(v_out * I / (v_peak * i_pulse * sp.sqrt(D)))
        d.step(text, text_ko, sp.Eq(Ul, (v_out * I) / (v_peak * i_pulse * sp.sqrt(D)), evaluate=False))
        d.result(eq_id, u, "Simplify.", "정리한다.", S("U"))
        return u

    util(
        "util.buck",
        "Buck: $V = D V_g$, the transistor blocks $V_g$ and carries the inductor current $I$.",
        "벅: $V = D V_g$, 트랜지스터는 $V_g$를 차단하고 인덕터 전류 $I$를 흘린다.",
        D * Vg, Vg, I,
    )
    util(
        "util.boost",
        "Boost: the transistor blocks $V$ and carries the inductor current $I/(1 - D)$.",
        "부스트: 트랜지스터는 $V$를 차단하고 인덕터 전류 $I/(1 - D)$를 흘린다.",
        V, V, I / (1 - D),
    )
    u_bb = util(
        "util.buckboost",
        "Buck-boost: $V = D V_g/(1 - D)$, the transistor blocks $V_g + V$ and carries $I/(1 - D)$.",
        "벅-부스트: $V = D V_g/(1 - D)$, 트랜지스터는 $V_g + V$를 차단하고 $I/(1 - D)$를 흘린다.",
        D * Vg / (1 - D), Vg + D * Vg / (1 - D), I / (1 - D),
    )
    V_fly = n * D * Vg / (1 - D)
    u_fly = sp.simplify(V_fly * I / ((Vg + V_fly / n) * (n * I / (1 - D)) * sp.sqrt(D)))
    if sp.simplify(u_fly - u_bb) != 0:
        raise ValueError(f"flyback utilization {u_fly} differs from the buck-boost's {u_bb}")
    d.step(
        "Flyback: $V = n D V_g/(1 - D)$, the transistor blocks $V_g + V/n$ and carries the primary-referred "
        "magnetizing current $n I/(1 - D)$; the turns ratio cancels and the result equals the buck-boost's.",
        "플라이백: $V = n D V_g/(1 - D)$, 트랜지스터는 $V_g + V/n$을 차단하고 1차 측 환산 자화 전류 "
        "$n I/(1 - D)$를 흘린다; 권선비가 상쇄되어 벅-부스트와 같은 결과가 된다.",
        sp.Eq(Ul, u_fly),
    )
    util(
        "util.forward",
        "Forward: $V = n D V_g$, the transistor blocks $V_g(1 + 1/n_r)$ and carries the reflected inductor "
        "current $n I$ (magnetizing current neglected).",
        "포워드: $V = n D V_g$, 트랜지스터는 $V_g(1 + 1/n_r)$를 차단하고 반사된 인덕터 전류 $n I$를 흘린다"
        "(자화 전류 무시).",
        n * D * Vg, Vg * (1 + 1 / n_r), n * I,
    )
    return d
