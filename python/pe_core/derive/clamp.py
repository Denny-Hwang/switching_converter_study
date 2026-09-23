"""Flyback primary clamp: the reflected output voltage, the switch voltage
while the clamp conducts, the clamp's dissipation, the voltage of an RCD
clamp set by its resistor, and the output voltage an unloaded flyback runs
up to.

Conventions (CLAUDE.md): 1:n transformer with n = N_s/N_p; the leakage
inductance L_lk is referred to the primary.

References: Erickson & Maksimović (2020), Ch. 6 (the flyback's transformer
model); Kollman, TI technical article SSZTCV6 (clamp dissipation against the
ratio of the clamp voltage to the reflected voltage).
"""

from __future__ import annotations

import sympy as sp

from .common import Derivation, S, positive_root


def derive() -> Derivation:
    d = Derivation(
        module="clamp",
        title="Flyback clamp: reflected voltage, clamp dissipation, output ceiling",
        title_ko="플라이백 클램프: 반사 전압, 클램프 손실, 출력 상한",
        intro=(
            "When the flyback's switch turns off, the magnetizing current passes to the secondary, but the "
            "current in the leakage inductance $L_\\mathrm{lk}$ has nowhere to go except a clamp across the "
            "primary. The clamp holds the primary at $V_\\mathrm{clamp}$ until that current has fallen to zero."
        ),
        intro_ko=(
            "플라이백의 스위치가 꺼지면 자화 전류는 2차 측으로 넘어가지만, 누설 인덕턴스 $L_\\mathrm{lk}$의 전류는 "
            "1차 측에 연결된 클램프 외에는 흐를 곳이 없다. 클램프는 이 전류가 0으로 줄어들 때까지 1차 측을 "
            "$V_\\mathrm{clamp}$에 묶어 둔다."
        ),
    )
    V, VD, n, Vg = S("V"), S("V_D"), S("n"), S("V_g")
    Vor, Vcl, Llk, Ipk, fs, Rcl = S("V_OR"), S("V_clamp"), S("L_lk"), S("I_pk"), S("f_s"), S("R_clamp")
    vs = d.local("v_s", "v_s", real=True)
    t = d.local("t", "t", nonnegative=True)
    i = d.local("i_lk", r"i_\mathrm{lk}", real=True)
    E = d.local("E_clamp", r"E_\mathrm{clamp}", positive=True)

    # ---------------------------------------------------- reflected voltage
    d.step(
        "While the output diode conducts, the secondary winding carries the output voltage plus the diode drop.",
        "출력 다이오드가 도통하는 동안 2차 권선에는 출력 전압과 다이오드 전압 강하의 합이 걸린다.",
        sp.Eq(vs, V + VD),
    )
    d.result(
        "flyback.V_OR",
        (V + VD) / n,
        "An ideal 1:$n$ transformer divides a secondary voltage by $n$ on the primary.",
        "이상적인 1:$n$ 변압기는 2차 측 전압을 1차 측에서 $n$으로 나눈다.",
        Vor,
    )
    d.result(
        "clamp.Vds",
        Vg + Vcl,
        "The switch lies between the input and the primary winding, which the clamp holds at $V_\\mathrm{clamp}$ "
        "while it conducts.",
        "스위치는 입력과 1차 권선 사이에 있으며, 클램프가 도통하는 동안 1차 권선은 $V_\\mathrm{clamp}$에 묶인다.",
        S("V_DS"),
    )

    # --------------------------------------------------------- clamp energy
    it = Ipk - (Vcl - Vor) * t / Llk
    d.step(
        "The magnetizing inductance holds $V_\\mathrm{OR}$ while the output diode conducts, so the leakage "
        "inductance sees $V_\\mathrm{clamp} - V_\\mathrm{OR}$ and its current falls linearly from $I_\\mathrm{pk}$.",
        "출력 다이오드가 도통하는 동안 자화 인덕턴스 양단은 $V_\\mathrm{OR}$이므로, 누설 인덕턴스에는 "
        "$V_\\mathrm{clamp} - V_\\mathrm{OR}$가 걸려 전류가 $I_\\mathrm{pk}$에서 직선적으로 감소한다.",
        sp.Eq(i, it),
    )
    tr_sol = sp.solve(sp.Eq(it, 0), t)[0]
    # shown in a tidy form, checked against the solver's
    tr_show = Llk * Ipk / (Vcl - Vor)
    if sp.simplify(tr_sol - tr_show) != 0:
        raise ValueError(f"reset time {tr_sol} differs from {tr_show}")
    d.result(
        "clamp.t_reset",
        tr_show,
        "It reaches zero after this time, which must fit in the off-time.",
        "전류는 이 시간 뒤에 0이 되며, 이 시간은 오프 시간 안에 들어가야 한다.",
        S("t_r"),
    )
    Ecl_int = sp.integrate(Vcl * it, (t, 0, tr_sol))
    Ecl = sp.Rational(1, 2) * Llk * Ipk**2 * Vcl / (Vcl - Vor)
    if sp.simplify(Ecl_int - Ecl) != 0:
        raise ValueError(f"clamp energy {Ecl_int} differs from {Ecl}")
    d.step(
        "The clamp absorbs its voltage times this falling current: more than the leakage energy "
        "$\\tfrac12 L_\\mathrm{lk} I_\\mathrm{pk}^2$, because the reflected voltage keeps driving the current meanwhile.",
        "클램프는 자기 전압과 이 감소하는 전류의 곱을 흡수한다. 그동안 반사 전압이 전류를 계속 밀어 주므로 "
        "누설 에너지 $\\tfrac12 L_\\mathrm{lk} I_\\mathrm{pk}^2$보다 많다.",
        sp.Eq(E, Ecl),
    )
    Pcl = Ecl * fs
    d.result(
        "clamp.P",
        Pcl,
        "Once per switching period.",
        "스위칭 주기마다 한 번씩.",
        S("P_clamp"),
    )

    # ------------------------------------------------------------ RCD clamp
    rcd = sp.Eq(Vcl**2 / Rcl, Pcl)
    d.step(
        "In an RCD clamp the capacitor holds $V_\\mathrm{clamp}$ and the resistor dissipates the clamp power.",
        "RCD 클램프에서는 커패시터가 $V_\\mathrm{clamp}$를 유지하고 저항이 클램프 전력을 소산한다.",
        rcd,
    )
    Vrcd = positive_root(sp.solve(rcd, Vcl), {Vor: 50.0, Rcl: 5000.0, Llk: 2e-6, Ipk: 2.0, fs: 1e5}, lo=50.0)
    d.result(
        "clamp.rcd.V",
        Vrcd,
        "The root above $V_\\mathrm{OR}$.",
        "$V_\\mathrm{OR}$보다 큰 근.",
        Vcl,
    )

    # ------------------------------------------------------- output ceiling
    Vomax = S("V_omax")
    d.step(
        "With the load removed and no regulation, the output keeps charging and its reflected voltage rises "
        "until it reaches the clamp voltage; from then on the clamp takes all of the input power. This holds "
        "for a clamp whose voltage does not depend on that power (a TVS); an RCD clamp's voltage rises with it.",
        "부하를 떼고 레귤레이션이 없으면 출력은 계속 충전되고, 반사 전압은 클램프 전압에 도달할 때까지 오른다. "
        "그 뒤에는 클램프가 입력 전력을 모두 가져간다. 이는 전압이 그 전력에 따라 변하지 않는 클램프(TVS)에 "
        "해당하며, RCD 클램프의 전압은 그 전력에 따라 올라간다.",
        sp.Eq((Vomax + VD) / n, Vcl),
    )
    d.result(
        "flyback.V_ceiling",
        sp.solve(sp.Eq((Vomax + VD) / n, Vcl), Vomax)[0],
        "Solve for the output voltage.",
        "출력 전압에 대해 푼다.",
        Vomax,
    )
    return d
