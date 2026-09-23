"""Control basics: the PWM modulator, the loop gain of a voltage-mode loop,
and the suppression of disturbances by feedback.

References: Erickson & Maksimović (2020), Ch. 7 (AC equivalent circuit
modeling: the pulse-width modulator) and Ch. 9 (controller design).
"""

from __future__ import annotations

import sympy as sp

from .common import Derivation, S


def derive() -> Derivation:
    d = Derivation(
        module="control",
        title="PWM modulator, loop gain and disturbance suppression",
        title_ko="PWM 변조기, 루프 이득, 외란 억제",
        intro=(
            "A voltage-mode controller compares a control voltage with a periodic ramp to set the duty ratio. "
            "Going once around the loop multiplies the gains of the compensator, the modulator, the power stage "
            "and the sensor; that product, the loop gain $T$, decides how strongly the loop rejects disturbances."
        ),
        intro_ko=(
            "전압 모드 제어기는 제어 전압을 주기적인 램프와 비교해 듀티비를 정한다. 루프를 한 바퀴 돌면 보상기, "
            "변조기, 전력단, 센서의 이득이 곱해지며, 그 곱인 루프 이득 $T$가 외란을 얼마나 강하게 억제하는지 정한다."
        ),
    )
    Vc, VM, Gc, Gvd, H, T = S("V_ctrl"), S("V_M"), S("G_c"), S("G_vd"), S("H"), S("T_loop")
    t = d.local("t_off", r"t_\mathrm{off}", positive=True)
    Ts = S("T_s")
    x = d.local("x_dist", r"\hat v_\mathrm{dist}")
    vref = d.local("v_ref", r"\hat v_\mathrm{ref}")
    v = d.local("v_out", r"\hat v")

    ramp = sp.Eq(VM * t / Ts, Vc)
    d.step(
        "The ramp rises from $0$ to $V_M$ in $T_s$; the switch turns off when it crosses $V_\\mathrm{ctrl}$.",
        "램프는 $T_s$ 동안 $0$에서 $V_M$까지 증가하며, $V_\\mathrm{ctrl}$을 넘는 순간 스위치가 꺼진다.",
        ramp,
    )
    t_sol = sp.solve(ramp, t)[0]
    d.result("pwm.d", sp.simplify(t_sol / Ts), "The on-time fraction is $D = t_\\mathrm{off}/T_s$.", "온 시간 비율은 $D = t_\\mathrm{off}/T_s$.", S("D"))

    d.step(
        "Around the loop: the compensator output drives the modulator (gain $1/V_M$), the power stage turns "
        "$\\hat d$ into $\\hat v$ (gain $G_{vd}$), and the sensor feeds back $H \\hat v$.",
        "루프를 따라가면: 보상기 출력이 변조기(이득 $1/V_M$)를 구동하고, 전력단이 $\\hat d$를 $\\hat v$로 바꾸며"
        "(이득 $G_{vd}$), 센서가 $H \\hat v$를 되먹임한다.",
    )
    d.result("loop.T", Gc * Gvd * H / VM, "The loop gain is the product around the loop.", "루프 이득은 루프를 도는 이득의 곱이다.", T)

    loop = sp.Eq(v, x + (vref - H * v) * Gc * Gvd / VM)
    d.step(
        "An output disturbance $\\hat v_\\mathrm{dist}$ adds to the controlled output; the controller acts on the "
        "error $\\hat v_\\mathrm{ref} - H\\hat v$.",
        "출력 외란 $\\hat v_\\mathrm{dist}$가 제어된 출력에 더해지고, 제어기는 오차 $\\hat v_\\mathrm{ref} - H\\hat v$에 반응한다.",
        loop,
    )
    v_sol = sp.solve(loop, v)[0]
    frac = sp.simplify(sp.diff(v_sol, x).subs(Gc * Gvd * H / VM, T))
    frac = sp.simplify(frac.subs(Gc, T * VM / (Gvd * H)))
    d.result(
        "loop.suppression",
        frac,
        "The disturbance reaching the output is divided by $1 + T$.",
        "출력에 도달하는 외란은 $1 + T$로 나누어진다.",
        S("S_dist"),
    )
    return d
