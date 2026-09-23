"""CCM/DCM boundary (K_crit) and DCM conversion ratios of the buck, boost
and buck-boost converters.

Reference: Erickson & Maksimović (2020), Ch. 5 (the discontinuous conduction
mode). K = 2L/(R T_s) is the definition used there.
"""

from __future__ import annotations

import sympy as sp

from .common import Derivation, S, positive_root


def derive() -> Derivation:
    d = Derivation(
        module="dcm",
        title="CCM/DCM boundary and DCM conversion ratios (buck, boost, buck-boost)",
        title_ko="CCM/DCM 경계와 DCM 변환비(벅, 부스트, 벅-부스트)",
        intro=(
            "The converter leaves CCM when the inductor current ripple is large enough for the current to "
            "reach zero: at the boundary the half-ripple $\\Delta i_L$ equals the dc inductor current. In DCM a third "
            "interval $D_3 T_s$ appears in which both switch and diode are off; its length is unknown, so "
            "volt-second balance is combined with capacitor charge balance (the average diode or inductor "
            "current must equal what the load draws)."
        ),
        intro_ko=(
            "인덕터 전류 리플이 커져 전류가 0에 닿으면 CCM을 벗어난다. 경계에서는 리플의 절반 $\\Delta i_L$이 "
            "인덕터 직류 전류와 같다. DCM에서는 스위치와 다이오드가 모두 꺼진 세 번째 구간 $D_3 T_s$가 생기고 "
            "그 길이를 모르므로, 전압-초 평형에 커패시터 전하 평형(평균 다이오드 또는 인덕터 전류가 "
            "부하 전류와 같음)을 함께 쓴다."
        ),
    )
    D, Vg, V, R, L, Ts, K = S("D"), S("V_g"), S("V"), S("R"), S("L"), S("T_s"), S("K")
    M = d.local("M_", "M", positive=True)
    Mneg = d.local("M_neg", "M", negative=True)
    D2 = d.local("D_2", "D_2", positive=True)
    ipk = d.local("i_pk", r"i_\mathrm{pk}", positive=True)
    I_L = d.local("I_L", "I_L", positive=True)
    dI = d.local("dI", r"\Delta i_L", positive=True)
    L_of_K = K * R * Ts / 2  # K = 2L/(R T_s)

    d.step(
        "Definition used throughout: $K = 2L/(R T_s)$, i.e. $L = K R T_s/2$.",
        "전 과정에서 쓰는 정의: $K = 2L/(R T_s)$, 즉 $L = K R T_s/2$.",
        sp.Eq(K, 2 * L / (R * Ts)),
    )

    # ---------------------------------------------------------------- K_crit
    def kcrit(eq_id: str, label: str, label_ko: str, IL_expr: sp.Expr, ripple: sp.Expr) -> None:
        d.step(label, label_ko, sp.Eq(I_L, IL_expr))
        d.step(
            "The half-ripple over the on-interval, with the CCM operating point substituted.",
            "CCM 동작점을 대입한 온 구간의 리플 절반.",
            sp.Eq(dI, ripple),
        )
        boundary = sp.Eq(IL_expr, ripple.subs(L, L_of_K))
        sol = sp.solve(boundary, K)
        if len(sol) != 1:
            raise ValueError(f"{eq_id}: expected one solution, got {sol}")
        d.result(
            eq_id,
            sp.simplify(sol[0]),
            "Boundary $\\Delta i_L = I_L$, with $L = K R T_s/2$, solved for $K$.",
            "경계 조건 $\\Delta i_L = I_L$에 $L = K R T_s/2$를 넣고 $K$에 대해 푼다.",
            S("K_crit"),
        )

    kcrit(
        "Kcrit.buck",
        "Buck: the dc inductor current equals the load current $V/R$, with $V = D V_g$ in CCM.",
        "벅: 인덕터 직류 전류는 부하 전류 $V/R$이며, CCM에서 $V = D V_g$.",
        D * Vg / R,
        (Vg - D * Vg) * D * Ts / (2 * L),
    )
    kcrit(
        "Kcrit.boost",
        "Boost: the inductor carries the input current, $V/((1 - D)R)$, with $V = V_g/(1 - D)$.",
        "부스트: 인덕터는 입력 전류 $V/((1 - D)R)$를 흘리며, $V = V_g/(1 - D)$.",
        Vg / ((1 - D) ** 2 * R),
        Vg * D * Ts / (2 * L),
    )
    kcrit(
        "Kcrit.buckboost",
        "Buck-boost: the inductor current is $|V|/((1 - D)R)$, with $|V| = D V_g/(1 - D)$.",
        "벅-부스트: 인덕터 전류는 $|V|/((1 - D)R)$이며, $|V| = D V_g/(1 - D)$.",
        D * Vg / ((1 - D) ** 2 * R),
        Vg * D * Ts / (2 * L),
    )

    Kc = S("K_crit")
    d.result(
        "L.crit",
        sp.solve(sp.Eq(Kc, 2 * L / (R * Ts)), L)[0],
        "At the boundary $K$ equals $K_\\mathrm{crit}$; solve the definition of $K$ for $L$.",
        "경계에서 $K$는 $K_\\mathrm{crit}$과 같다; $K$의 정의를 $L$에 대해 푼다.",
        S("L_crit"),
    )

    sample = {D: 0.3, K: 0.05}

    # ----------------------------------------------------------- buck, DCM
    vs = sp.Eq(D * (Vg - M * Vg) + D2 * (-M * Vg), 0)
    d.step(
        "Buck DCM, volt-second balance with $V = M V_g$: $V_g - V$ for $D T_s$, $-V$ for $D_2 T_s$, $0$ for $D_3 T_s$.",
        "벅 DCM, $V = M V_g$로 쓴 전압-초 평형: $D T_s$ 동안 $V_g - V$, $D_2 T_s$ 동안 $-V$, $D_3 T_s$ 동안 $0$.",
        vs,
    )
    D2_sol = sp.solve(vs, D2)[0]
    d.result(
        "buck.dcm.D2",
        sp.simplify(D2_sol.subs(M, S("M"))),
        "Solve for $D_2$.",
        "$D_2$를 구한다.",
        S("D_2"),
    )
    pk = (Vg - M * Vg) * D * Ts / L
    d.step("Peak inductor current at the end of the on-interval.", "온 구간 끝의 인덕터 피크 전류.", sp.Eq(ipk, pk))
    cb = sp.Eq(pk * (D + D2_sol) / 2, M * Vg / R)
    d.step(
        "Charge balance: the average inductor current (a triangle of height $i_\\mathrm{pk}$ and base $(D + D_2)T_s$) "
        "equals the load current $V/R$.",
        "전하 평형: 평균 인덕터 전류(높이 $i_\\mathrm{pk}$, 밑변 $(D + D_2)T_s$인 삼각형)가 부하 전류 $V/R$과 같다.",
        cb,
    )
    quad = sp.simplify(cb.lhs.subs(L, L_of_K) - cb.rhs)
    roots = sp.solve(sp.Eq(quad, 0), M)
    d.result(
        "buck.dcm.M",
        sp.simplify(positive_root(roots, sample)),
        "Substitute $L = K R T_s/2$ and take the positive root of the quadratic in $M$.",
        "$L = K R T_s/2$를 대입하고 $M$에 대한 2차식의 양의 근을 택한다.",
        S("M"),
    )

    # ---------------------------------------------------------- boost, DCM
    vs = sp.Eq(D * Vg + D2 * (Vg - M * Vg), 0)
    d.step(
        "Boost DCM, volt-second balance: $V_g$ for $D T_s$, $V_g - V$ for $D_2 T_s$.",
        "부스트 DCM 전압-초 평형: $D T_s$ 동안 $V_g$, $D_2 T_s$ 동안 $V_g - V$.",
        vs,
    )
    D2_sol = sp.solve(vs, D2)[0]
    d.step("Solve for $D_2$.", "$D_2$를 구한다.", sp.Eq(D2, D2_sol))
    pk = Vg * D * Ts / L
    cb = sp.Eq(pk * D2_sol / 2, M * Vg / R)
    d.step(
        "Charge balance at the output: the average diode current (a triangle of height $i_\\mathrm{pk}$ over $D_2 T_s$) "
        "equals the load current.",
        "출력의 전하 평형: 평균 다이오드 전류($D_2 T_s$ 동안 높이 $i_\\mathrm{pk}$인 삼각형)가 부하 전류와 같다.",
        cb,
    )
    eqn = sp.Eq(sp.simplify(cb.lhs.subs(L, L_of_K)), cb.rhs)
    roots = sp.solve(eqn, M)
    d.result(
        "boost.dcm.M",
        sp.simplify(positive_root(roots, sample, lo=1.0)),
        "Substitute $L = K R T_s/2$ and keep the root with $M > 1$.",
        "$L = K R T_s/2$를 대입하고 $M > 1$인 근을 택한다.",
        S("M"),
    )

    # ------------------------------------------------ buck-boost, DCM (M < 0)
    vs = sp.Eq(D * Vg + D2 * (Mneg * Vg), 0)
    d.step(
        "Buck-boost DCM, volt-second balance with the negative output $V = M V_g$: $V_g$ for $D T_s$, $V$ for $D_2 T_s$.",
        "벅-부스트 DCM, 음의 출력 $V = M V_g$로 쓴 전압-초 평형: $D T_s$ 동안 $V_g$, $D_2 T_s$ 동안 $V$.",
        vs,
    )
    D2_sol = sp.solve(vs, D2)[0]
    d.step("Solve for $D_2$.", "$D_2$를 구한다.", sp.Eq(D2, D2_sol))
    pk = Vg * D * Ts / L
    cb = sp.Eq(pk * D2_sol / 2, -Mneg * Vg / R)
    d.step(
        "Charge balance: the average diode current equals the load current $|V|/R$.",
        "전하 평형: 평균 다이오드 전류가 부하 전류 $|V|/R$과 같다.",
        cb,
    )
    eqn = sp.Eq(sp.simplify(cb.lhs.subs(L, L_of_K)), cb.rhs)
    roots = sp.solve(eqn, Mneg)
    if len(roots) != 1:
        raise ValueError(f"buck-boost DCM: expected one negative root, got {roots}")
    d.result(
        "buckboost.dcm.M",
        sp.simplify(roots[0]),
        "Substitute $L = K R T_s/2$ and solve ($M < 0$).",
        "$L = K R T_s/2$를 대입해 푼다($M < 0$).",
        S("M"),
    )
    return d
