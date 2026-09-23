"""Stored energy, loss mechanisms and switch-node ringing.

Each loss is derived as (energy moved or dissipated per cycle) × f_s, or as
the period average of the instantaneous power.

References: Erickson & Maksimović (2020), Ch. 3 (conduction losses), Ch. 4
(switching losses, energy in capacitances and leakage inductances), Ch. 8
(L-C resonance); Balogh, TI SLUA618A (gate-drive power).
"""

from __future__ import annotations

import sympy as sp

from .common import Derivation, S


def derive() -> Derivation:
    d = Derivation(
        module="energy",
        title="Stored energy, losses and ringing",
        title_ko="저장 에너지, 손실, 링잉",
        intro=(
            "Energy stored in an inductor or capacitor is the integral of the power $v i$ delivered to it. "
            "A loss that repeats every switching period is the energy lost per cycle times $f_s$; a conduction "
            "loss is the period average of the instantaneous power."
        ),
        intro_ko=(
            "인덕터나 커패시터에 저장된 에너지는 공급된 전력 $v i$의 적분이다. 매 스위칭 주기마다 반복되는 "
            "손실은 주기당 손실 에너지 × $f_s$이고, 도통 손실은 순시 전력의 주기 평균이다."
        ),
    )
    Llk, Ipk, fs, Elk = S("L_lk"), S("I_pk"), S("f_s"), S("E_lk")
    C, Vsw, LM = S("C_node"), S("V_sw"), S("L_M")
    Irms, Rx, VF, rd, Iavg = S("I_rms"), S("R_x"), S("V_F"), S("r_d"), S("I_avg")
    Qg, VGS = S("Q_g"), S("V_GS")
    i = d.local("i", "i", real=True)
    v = d.local("v", "v", real=True)
    t = d.local("t", "t", real=True)
    Ts = S("T_s")
    s = d.local("s", "s")
    q = d.local("q", "q", real=True)
    E_C = d.local("E_C", "E_C", positive=True)
    E_G = d.local("E_G", "E_G", positive=True)
    omega0 = d.local("omega_0", r"\omega_0", positive=True)
    i_t = sp.Function("i", real=True)(t)

    # --------------------------------------------------------- leakage energy
    E_int = sp.Integral(Llk * i, (i, 0, Ipk))
    d.step(
        "Energy delivered to an inductance: $p = v i$ with $v = L\\,di/dt$, so $dE = L i\\,di$. Integrate from zero "
        "to the turn-off current.",
        "인덕턴스에 공급된 에너지: $v = L\\,di/dt$인 $p = v i$이므로 $dE = L i\\,di$. 0에서 턴오프 전류까지 적분한다.",
        sp.Eq(Elk, E_int),
    )
    d.result("flyback.leak.E", E_int.doit(), "Evaluate the integral.", "적분을 계산한다.", Elk)
    d.result(
        "flyback.leak.P",
        Elk * fs,
        "If this energy is removed (clamped or dissipated) every cycle, the average power is $E_\\mathrm{lk} f_s$.",
        "이 에너지가 매 주기 제거(클램프 또는 소산)되면 평균 전력은 $E_\\mathrm{lk} f_s$이다.",
        S("P_lk"),
    )

    # ---------------------------------------------------- capacitive turn-on
    E_c = sp.Integral(C * v, (v, 0, Vsw))
    d.step(
        "Energy stored in the switch-node capacitance charged to $V_\\mathrm{sw}$: $dE = v\\,dq = C v\\,dv$.",
        "$V_\\mathrm{sw}$로 충전된 스위치 노드 커패시턴스의 저장 에너지: $dE = v\\,dq = C v\\,dv$.",
        sp.Eq(E_C, E_c),
    )
    d.result(
        "loss.sw.cap",
        sp.expand(E_c.doit() * fs),
        "A hard turn-on discharges it through the switch channel every cycle: $P = E_C f_s$.",
        "하드 턴온은 매 주기 이 에너지를 스위치 채널로 방전시킨다: $P = E_C f_s$.",
        S("P"),
    )

    # ------------------------------------------------------- conduction loss
    avg_p = sp.Integral(Rx * i_t**2, (t, 0, Ts)) / Ts
    d.step(
        "Conduction loss is the period average of the instantaneous power $i(t)^2 R_x$.",
        "도통 손실은 순시 전력 $i(t)^2 R_x$의 주기 평균이다.",
        sp.Eq(S("P"), avg_p),
    )
    d.step(
        "By definition the rms current is the square root of the period average of $i(t)^2$.",
        "정의상 rms 전류는 $i(t)^2$의 주기 평균의 제곱근이다.",
        sp.Eq(Irms**2, sp.Integral(i_t**2, (t, 0, Ts)) / Ts),
    )
    d.result("loss.cond", Rx * Irms**2, "$R_x$ is constant, so it moves out of the average.", "$R_x$는 상수이므로 평균 밖으로 나온다.", S("P"))

    # ----------------------------------------------------------- diode loss
    d.step(
        "A conducting diode is modelled as a forward-voltage intercept plus a dynamic resistance, "
        "$v_D = V_F + r_d i$, so $p = V_F i + r_d i^2$.",
        "도통 중인 다이오드는 순방향 전압 절편과 동저항으로 모델링한다: $v_D = V_F + r_d i$, 따라서 $p = V_F i + r_d i^2$.",
        sp.Eq(S("P"), sp.Integral(VF * i_t + rd * i_t**2, (t, 0, Ts)) / Ts),
    )
    d.result(
        "loss.diode",
        VF * Iavg + rd * Irms**2,
        "The average of $i$ is $I_\\mathrm{avg}$ and the average of $i^2$ is $I_\\mathrm{rms}^2$.",
        "$i$의 평균은 $I_\\mathrm{avg}$, $i^2$의 평균은 $I_\\mathrm{rms}^2$이다.",
        S("P"),
    )

    # ------------------------------------------------------------ gate drive
    Eg = sp.Integral(VGS, (q, 0, Qg))
    d.step(
        "Each cycle the driver draws the gate charge $Q_g$ from its $V_\\mathrm{GS}$ supply; the energy taken from the "
        "supply is the integral of $V_\\mathrm{GS}\\,dq$.",
        "매 주기 드라이버는 $V_\\mathrm{GS}$ 전원에서 게이트 전하 $Q_g$를 끌어온다. 전원에서 가져가는 에너지는 $V_\\mathrm{GS}\\,dq$의 적분이다.",
        sp.Eq(E_G, Eg),
    )
    d.result(
        "loss.gate",
        Eg.doit() * fs,
        "All of it ends up as heat in the driver and gate resistances; multiply by $f_s$.",
        "그 전부가 드라이버와 게이트 저항에서 열이 되므로 $f_s$를 곱한다.",
        S("P"),
    )

    # ------------------------------------------------------------- ringing
    char = sp.Eq(LM * C * s**2 + 1, 0)
    d.step(
        "An undamped L-C loop obeys $L C\\,d^2v/dt^2 + v = 0$; its characteristic equation is $L C s^2 + 1 = 0$.",
        "감쇠 없는 L-C 루프는 $L C\\,d^2v/dt^2 + v = 0$을 따르며, 특성방정식은 $L C s^2 + 1 = 0$이다.",
        char,
    )
    roots = sp.solve(char, s)
    omega = sp.simplify(sp.Abs(sp.im(roots[0])))
    d.step("The roots are $\\pm j\\omega_0$.", "근은 $\\pm j\\omega_0$이다.", sp.Eq(omega0, omega))
    d.result("dcm.ring.f", omega / (2 * sp.pi), "$f = \\omega_0/(2\\pi)$.", "$f = \\omega_0/(2\\pi)$.", S("f_ring"))
    return d
