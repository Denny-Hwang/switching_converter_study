"""CCM conversion ratios, the forward-converter reset limit and the buck
inductor ripple, from volt-second balance.

Reference: Erickson & Maksimović (2020), Ch. 2 (principles of steady-state
converter analysis) and Ch. 6 (converter circuits).
"""

from __future__ import annotations

import sympy as sp

from .common import Derivation, S


def derive() -> Derivation:
    d = Derivation(
        module="ccm_ratios",
        title="CCM conversion ratios and ripple by volt-second balance",
        title_ko="전압-초 평형으로 구하는 CCM 변환비와 리플",
        intro=(
            "In periodic steady state every inductor current ends a switching period where it started, "
            "so the average inductor voltage over the period is zero. With the small-ripple approximation "
            "each interval applies a constant voltage, and the balance becomes a linear equation in the "
            "output voltage $V$."
        ),
        intro_ko=(
            "주기적 정상상태에서는 모든 인덕터 전류가 한 스위칭 주기의 끝에서 시작값으로 돌아오므로 "
            "한 주기 동안의 평균 인덕터 전압은 0이다. 소리플 근사를 쓰면 각 구간에 걸리는 전압이 일정하므로 "
            "이 평형 조건은 출력 전압에 대한 1차 방정식이 된다."
        ),
    )
    D, Vg, V, n, n_r = S("D"), S("V_g"), S("V"), S("n"), S("n_r")
    L, Ts, fs = S("L"), S("T_s"), S("f_s")
    vL_avg = d.local("vL_avg", r"\langle v_L \rangle")
    v = d.local("v", "V", real=True)  # signed output voltage for inverting topologies
    D2 = d.local("D_2", "D_2", positive=True)

    d.step(
        "Volt-second balance: the inductor voltage averaged over one switching period is zero.",
        "전압-초 평형: 한 스위칭 주기 동안 평균한 인덕터 전압은 0이다.",
        sp.Eq(vL_avg, 0),
    )

    # --- buck ---------------------------------------------------------------
    buck = sp.Eq(D * (Vg - V) + (1 - D) * (-V), 0)
    d.step(
        "Buck: the inductor sees $V_g - V$ while the switch is on (fraction $D$) and $-V$ while the diode conducts ($1 - D$).",
        "벅: 스위치 온 구간(비율 $D$)에는 인덕터에 $V_g - V$, 다이오드 도통 구간($1 - D$)에는 $-V$가 걸린다.",
        buck,
    )
    V_buck = sp.solve(buck, V)[0]
    d.result("buck.ccm.M", sp.simplify(V_buck / Vg), "Solve for $V$ and divide by $V_g$.", "$V$에 대해 풀고 $V_g$로 나눈다.", S("M"))

    # --- boost --------------------------------------------------------------
    boost = sp.Eq(D * Vg + (1 - D) * (Vg - V), 0)
    d.step(
        "Boost: $V_g$ while the switch is on, $V_g - V$ while the diode conducts.",
        "부스트: 스위치 온 구간에는 $V_g$, 다이오드 도통 구간에는 $V_g - V$.",
        boost,
    )
    V_boost = sp.solve(boost, V)[0]
    d.result("boost.ccm.M", sp.simplify(V_boost / Vg), "Solve for $V$.", "$V$에 대해 푼다.", S("M"))

    # --- buck-boost (output voltage v is negative) ---------------------------
    bb = sp.Eq(D * Vg + (1 - D) * v, 0)
    d.step(
        "Buck-boost: $V_g$ while the switch is on, the (negative) output voltage $V$ while the diode conducts.",
        "벅-부스트: 스위치 온 구간에는 $V_g$, 다이오드 도통 구간에는 (음의) 출력 전압 $V$.",
        bb,
    )
    v_bb = sp.solve(bb, v)[0]
    d.result("buckboost.ccm.M", sp.simplify(v_bb / Vg), "Solve for $V$; the output is inverted.", "$V$에 대해 푼다. 출력 극성이 반전된다.", S("M"))

    # --- flyback: magnetizing inductance referred to the primary ------------
    fly = sp.Eq(D * Vg + (1 - D) * (-V / n), 0)
    d.step(
        "Flyback (1:$n$, magnetizing inductance on the primary): $V_g$ while the switch is on; "
        "while the diode conducts the secondary is clamped at $V$, which reflects to $-V/n$ on the primary.",
        "플라이백(1:$n$, 1차측 자화 인덕턴스): 스위치 온 구간에는 $V_g$; 다이오드 도통 구간에는 2차측이 $V$로 "
        "클램프되어 1차측에 $-V/n$으로 반사된다.",
        fly,
    )
    V_fly = sp.solve(fly, V)[0]
    d.result("flyback.ccm.M", sp.simplify(V_fly / Vg), "Solve for $V$.", "$V$에 대해 푼다.", S("M"))

    # --- forward: output inductor -------------------------------------------
    fwd = sp.Eq(D * (n * Vg - V) + (1 - D) * (-V), 0)
    d.step(
        "Forward: the secondary applies $nV_g$ to the output filter while the switch is on, so the output "
        "inductor sees $nV_g - V$, then $-V$ while the freewheeling diode conducts.",
        "포워드: 스위치 온 구간에 2차측이 출력 필터에 $nV_g$를 인가하므로 출력 인덕터에는 $nV_g - V$, "
        "환류 다이오드 도통 구간에는 $-V$가 걸린다.",
        fwd,
    )
    V_fwd = sp.solve(fwd, V)[0]
    d.result("forward.ccm.M", sp.simplify(V_fwd / Vg), "Solve for $V$.", "$V$에 대해 푼다.", S("M"))

    reset = sp.Eq(D * Vg + D2 * (-Vg / n_r), 0)
    d.step(
        "Forward reset: the magnetizing inductance sees $V_g$ for $D T_s$, then the reset winding ($N_r$ turns) "
        "clamps it to $-V_g/n_r$ for $D_2 T_s$ until the magnetizing current is back to zero.",
        "포워드 리셋: 자화 인덕턴스에는 $D T_s$ 동안 $V_g$가 걸리고, 이후 자화 전류가 0이 될 때까지 $D_2 T_s$ 동안 "
        "리셋 권선($N_r$ 턴)이 $-V_g/n_r$로 클램프한다.",
        reset,
    )
    D2_sol = sp.solve(reset, D2)[0]
    d.step("Solve for the reset interval.", "리셋 구간을 구한다.", sp.Eq(D2, D2_sol))
    Dmax = sp.solve(sp.Eq(D + D2_sol, 1), D)[0]
    d.result(
        "forward.reset.Dmax",
        sp.simplify(Dmax),
        "The reset must finish within the period, $D + D_2 \\le 1$; the equality gives the largest duty ratio.",
        "리셋은 한 주기 안에 끝나야 하므로 $D + D_2 \\le 1$이며, 등호가 최대 듀티비를 준다.",
        S("D_max"),
    )

    # --- buck ripple --------------------------------------------------------
    slope = (Vg - V) / L
    d.step(
        "Buck ripple: during the on-interval the inductor current rises with slope $(V_g - V)/L$ for $D T_s$, "
        "which is the full peak-to-peak ripple, i.e. $2\\Delta i_L$.",
        "벅 리플: 온 구간 $D T_s$ 동안 인덕터 전류가 기울기 $(V_g - V)/L$로 증가하며, 이 증가량이 "
        "피크-투-피크 리플, 즉 $2\\Delta i_L$이다.",
        sp.Eq(2 * S("Delta_i_L"), slope * D * Ts),
    )
    d.result("buck.ripple.iL", sp.simplify(slope * D * Ts / 2), "Half of it is Erickson's $\\Delta i_L$.", "그 절반이 Erickson의 $\\Delta i_L$이다.", S("Delta_i_L"))
    d.result(
        "buck.ripple.iL_pp",
        sp.simplify((slope * D * Ts).subs(Ts, 1 / fs)),
        "The peak-to-peak value, with $T_s = 1/f_s$.",
        "$T_s = 1/f_s$로 쓴 피크-투-피크 값.",
        S("Delta_i_pp"),
    )
    return d
