"""Bench: the voltage a loop's inductance develops over a switching edge, the
gate current and time on the Miller plateau, the bootstrap capacitance for an
allowed droop, the rise time of a single-pole system, the inrush current into
an empty capacitor (from a step and from a controlled ramp), a junction's
temperature through a series thermal path, and a battery's terminal voltage.

References: Alexander & Sadiku (2017), Ch. 6 (the inductor's and the
capacitor's laws), Ch. 7 (the step response of a first-order circuit) and
Ch. 14 (the corner frequency of a first-order low-pass); TI SPRA953 (thermal
resistance as a temperature difference per watt); He, Xiong & Fan (2011),
Sec. 2.1 (the Rint model).
"""

from __future__ import annotations

import sympy as sp

from .common import Derivation, S


def derive() -> Derivation:
    d = Derivation(
        module="bench",
        title="Bench: edges, gate drive, rise time, inrush, heat and a battery's terminals",
        title_ko="벤치: 에지, 게이트 구동, 상승 시간, 돌입 전류, 열, 배터리 단자",
        intro=(
            "Results of the inductor's and the capacitor's laws, the first-order step response, Ohm's law across a gate "
            "resistor, a series thermal path and the Rint battery model, in the form they take on the bench."
        ),
        intro_ko=(
            "인덕터와 커패시터의 법칙, 1차 회로의 계단 응답, 게이트 저항에 걸린 옴의 법칙, 직렬 열 경로, Rint 배터리 "
            "모델에서 나오는 결과를 벤치에서 보이는 형태로 정리한다."
        ),
    )

    # --- the loop inductance over an edge ------------------------------------------------
    L, dI, te, Vs = S("L_loop"), S("Delta_I"), S("t_edge"), S("V_spike")
    t = d.local("t", "t", positive=True)
    i = sp.Function("i")
    d.step(
        "The voltage across an inductance is proportional to the rate of change of its current:",
        "인덕턴스 양단 전압은 전류의 변화율에 비례한다.",
        sp.Eq(sp.Symbol("v"), L * sp.Derivative(i(t), t)),
    )
    ramp = dI * t / te
    d.step(
        "A current that changes by $\\Delta I$ linearly over the edge $t_\\mathrm{edge}$ changes at a constant rate:",
        "에지 $t_\\mathrm{edge}$ 동안 $\\Delta I$만큼 직선적으로 변하는 전류는 일정한 속도로 변한다.",
        sp.Eq(sp.Derivative(i(t), t), sp.diff(ramp, t)),
    )
    d.result(
        "layout.v_spike",
        L * sp.diff(ramp, t),
        "so throughout the edge the loop's inductance develops",
        "따라서 에지 내내 루프 인덕턴스에 걸리는 전압은",
        Vs,
    )
    fr, Cn = S("f_ring"), S("C_node")
    d.step(
        "After the turn-off edge the loop's inductance rings with the switch node's capacitance, a series L-C, at",
        "턴오프 에지 뒤에 루프 인덕턴스는 스위치 노드 커패시턴스와 직렬 L-C를 이루어 다음 주파수로 링잉한다.",
        sp.Eq(fr, 1 / (2 * sp.pi * sp.sqrt(L * Cn))),
    )
    d.result(
        "layout.L_ring",
        sp.solve(sp.Eq(fr, 1 / (2 * sp.pi * sp.sqrt(L * Cn))), L)[0],
        "so the ring's frequency gives the loop's inductance:",
        "따라서 링잉 주파수로 루프 인덕턴스를 구한다.",
        L,
    )

    # --- the gate on the Miller plateau ---------------------------------------------------------
    Vgs, Vpl, Rg, Ig, Qgd, tpl = S("V_GS"), S("V_pl"), S("R_G"), S("I_G"), S("Q_GD"), S("t_pl")
    d.step(
        "While the drain voltage makes its transition the gate stays at the plateau voltage $V_\\mathrm{pl}$. The "
        "driver switches its output to $V_\\mathrm{GS}$ (turn-on) or to 0 (turn-off) behind the gate loop's resistance "
        "$R_G$, so by Ohm's law the gate current is constant meanwhile:",
        "드레인 전압이 전이하는 동안 게이트는 플래토 전압 $V_\\mathrm{pl}$에 머문다. 드라이버는 게이트 루프 저항 $R_G$ "
        "뒤에서 출력을 $V_\\mathrm{GS}$(턴온) 또는 0(턴오프)으로 바꾸므로, 옴의 법칙에 따라 그동안 게이트 전류는 일정하다.",
    )
    d.result("gate.I_on", (Vgs - Vpl) / Rg, "at turn-on", "턴온 때", Ig)
    d.result("gate.I_off", (Vpl - 0) / Rg, "and at turn-off", "턴오프 때", Ig)
    q = d.local("q", "q")
    d.step(
        "A constant current delivers charge at a constant rate:",
        "일정한 전류는 일정한 속도로 전하를 전달한다.",
        sp.Eq(q, Ig * t),
    )
    d.result(
        "gate.t_pl",
        sp.solve(sp.Eq(Qgd, Ig * tpl), tpl)[0],
        "so the plateau, along which the gate takes the gate-drain charge $Q_\\mathrm{GD}$, lasts",
        "따라서 게이트가 게이트-드레인 전하 $Q_\\mathrm{GD}$를 받는 플래토는 다음 시간 동안 지속된다.",
        tpl,
    )

    # --- the bootstrap capacitor's droop ------------------------------------------------------
    Q, dV, Cb = S("Q_boot"), S("Delta_V_boot"), S("C_boot")
    d.step(
        "A capacitor's charge is its capacitance times its voltage, so supplying the charge $Q_\\mathrm{boot}$ "
        "lowers its voltage by",
        "커패시터의 전하는 커패시턴스와 전압의 곱이므로, 전하 $Q_\\mathrm{boot}$를 공급하면 전압이 다음만큼 떨어진다.",
        sp.Eq(dV, Q / Cb),
    )
    d.result(
        "boot.C",
        sp.solve(sp.Eq(dV, Q / Cb), Cb)[0],
        "For a droop of at most $\\Delta V_\\mathrm{boot}$ the capacitance must be at least",
        "강하가 $\\Delta V_\\mathrm{boot}$ 이하가 되려면 커패시턴스는 적어도 다음과 같아야 한다.",
        Cb,
    )

    # --- the rise time of a single-pole system --------------------------------------------------
    BW, tr = S("BW"), S("t_rise")
    tau = d.local("tau", r"\tau", positive=True)
    x = d.local("x", "x", positive=True)
    step = 1 - sp.exp(-t / tau)
    d.step(
        "A single-pole system answers a unit step with",
        "단일 극점 시스템은 단위 계단에 다음과 같이 응답한다.",
        sp.Eq(sp.Symbol("y"), step),
    )
    # the crossings, written as tau times a logarithm (and checked against the solver's)
    t10 = tau * sp.log(sp.Rational(10, 9))
    t90 = tau * sp.log(10)
    for crossing, level in ((t10, sp.Rational(1, 10)), (t90, sp.Rational(9, 10))):
        solved = sp.solve(sp.Eq(1 - sp.exp(-x / tau), level), x)[0]
        assert sp.simplify(sp.expand_log(solved - crossing, force=True)) == 0
    d.step(
        "It reaches 10 % and 90 % of its final value at",
        "최종값의 10 %와 90 %에 도달하는 시각은 각각 다음과 같다.",
        sp.Tuple(sp.Eq(sp.Symbol("t_{10}"), t10), sp.Eq(sp.Symbol("t_{90}"), t90)),
    )
    rise = sp.simplify(sp.expand_log(t90 - t10, force=True))
    d.step(
        "so its 10-90 % rise time is",
        "따라서 10-90 % 상승 시간은",
        sp.Eq(tr, rise),
    )
    d.step(
        "Its -3 dB bandwidth is the corner frequency of the same pole:",
        "-3 dB 대역폭은 같은 극점의 차단 주파수이다.",
        sp.Eq(BW, 1 / (2 * sp.pi * tau)),
    )
    d.result(
        "probe.t_rise",
        sp.simplify(rise.subs(tau, 1 / (2 * sp.pi * BW))),
        "Eliminating $\\tau$:",
        "$\\tau$를 소거하면:",
        tr,
    )

    # --- a probe's ground loop -----------------------------------------------------------------------------
    Lg, Cp, fp = S("L_gnd"), S("C_probe"), S("f_probe")
    w = d.local("omega_0", r"\omega_0", positive=True)
    d.step(
        "The tip-and-ground loop's inductance and the probe's input capacitance form a series L-C; without loss "
        "its current $i$ obeys",
        "팁과 접지가 이루는 루프의 인덕턴스와 프로브 입력 커패시턴스는 직렬 L-C를 이룬다. 손실이 없으면 전류 $i$는 다음을 따른다.",
        sp.Eq(Lg * sp.Derivative(i(t), t, 2) + i(t) / Cp, 0),
    )
    d.step(
        "whose solutions ring at the angular frequency",
        "그 해는 다음 각주파수로 링잉한다.",
        sp.Eq(w, 1 / sp.sqrt(Lg * Cp)),
    )
    d.result(
        "probe.f_ring",
        1 / (2 * sp.pi * sp.sqrt(Lg * Cp)),
        "that is, the frequency",
        "곧 주파수는",
        fp,
    )

    # --- inrush into an empty capacitor --------------------------------------------------------
    Vg, R, C, Ipk, I2t = S("V_g"), S("R_ser"), S("C_in"), S("I_inrush"), S("I2t")
    cur = Vg / R * sp.exp(-t / (R * C))
    d.step(
        "An empty capacitor switched onto a step $V_g$ through a series resistance charges with the current",
        "빈 커패시터가 직렬 저항을 통해 계단 전압 $V_g$에 연결되면 다음 전류로 충전된다.",
        sp.Eq(sp.Symbol("i"), cur),
    )
    d.result(
        "inrush.I_pk",
        cur.subs(t, 0),
        "which is largest at the step, when the capacitor has no voltage across it:",
        "이 전류는 커패시터 전압이 0인 계단 순간에 가장 크다.",
        Ipk,
    )
    d.result(
        "inrush.I2t",
        sp.integrate(cur**2, (t, 0, sp.oo)),
        "The integral of its square over the whole pulse is",
        "펄스 전체에 걸친 전류 제곱의 적분은",
        I2t,
    )
    tr = S("t_ramp")
    v = sp.Function("v")
    d.step(
        "A capacitor's current is its capacitance times the rate of change of its voltage:",
        "커패시터 전류는 커패시턴스와 전압 변화율의 곱이다.",
        sp.Eq(sp.Symbol("i"), C * sp.Derivative(v(t), t)),
    )
    d.result(
        "inrush.I_ramp",
        C * sp.diff(Vg * t / tr, t),
        "so a voltage ramped linearly from zero to $V_g$ over $t_\\mathrm{ramp}$ draws a constant current:",
        "따라서 전압을 $t_\\mathrm{ramp}$ 동안 0에서 $V_g$까지 선형으로 올리면 일정한 전류가 흐른다.",
        S("I_ramp"),
    )
    # --- the junction temperature through a series thermal path -------------------------------------
    TJ, TA, PD = S("T_J"), S("T_A"), S("P_D")
    tjc, tcs, tsa = S("theta_JC"), S("theta_CS"), S("theta_SA")
    TC = d.local("T_C", "T_C")
    TS = d.local("T_S", "T_S")
    d.step(
        "A thermal resistance is the temperature difference across a part of the heat's path per watt flowing through it. "
        "With all of the device's power flowing from the junction to the case, the case to the heat sink and the heat sink "
        "to the ambient in turn,",
        "열저항은 열 경로의 한 부분 양단 온도 차를 그 부분을 지나는 전력 1 W당으로 나타낸 값이다. 소자의 전력 전부가 "
        "접합에서 케이스로, 케이스에서 방열판으로, 방열판에서 주위로 차례로 흐르면",
        sp.Tuple(sp.Eq(TJ - TC, PD * tjc), sp.Eq(TC - TS, PD * tcs), sp.Eq(TS - TA, PD * tsa)),
    )
    sol = sp.solve([sp.Eq(TJ - TC, PD * tjc), sp.Eq(TC - TS, PD * tcs), sp.Eq(TS - TA, PD * tsa)], [TJ, TC, TS], dict=True)[0]
    d.result(
        "therm.Tj",
        sp.collect(sp.expand(sol[TJ]), PD),
        "and the rises add up from the ambient:",
        "주위 온도부터 상승분이 더해진다.",
        TJ,
    )

    # --- the battery's terminal voltage (Rint) ---------------------------------------------------------
    Vb, Ib, Rb, V = S("V_b"), S("I_b"), S("R_b"), S("V")
    d.step(
        "The Rint model is the open-circuit voltage behind the internal resistance; the charging current flows into the "
        "positive terminal through the resistance (`bat.rint`):",
        "Rint 모델은 내부 저항 뒤의 개방 전압이다. 충전 전류는 저항을 거쳐 양극 단자로 들어간다(`bat.rint`).",
        sp.Eq(Ib, (V - Vb) / Rb),
    )
    d.result(
        "bat.v_term",
        sp.solve(sp.Eq(Ib, (V - Vb) / Rb), V)[0],
        "so the terminals sit at",
        "따라서 단자 전압은",
        V,
    )
    return d
