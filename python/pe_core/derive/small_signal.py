"""Small-signal CCM control-to-output transfer functions of the buck, boost
and buck-boost converters, derived by averaging, perturbation and
linearisation of the converter equations.

For each converter the averaged inductor and capacitor equations are
perturbed around the steady-state operating point (input voltage held
constant), linearised, Laplace-transformed and solved for v̂/d̂. The result
is put in the standard form

    G_vd(s) = G_d0 (1 - s/ω_z) / (1 + s/(Q ω_0) + (s/ω_0)²)

and G_d0, ω_0, Q and (where present) the right-half-plane zero ω_z are read
off symbolically.

References: Erickson & Maksimović (2020), Ch. 7 (AC equivalent circuit
modeling) and Ch. 8 (converter transfer functions).
"""

from __future__ import annotations

import sympy as sp

from .common import Derivation, S


def _standard_form(G: sp.Expr, s: sp.Symbol) -> dict[str, sp.Expr]:
    num, den = sp.fraction(sp.together(sp.simplify(G)))
    dp, npoly = sp.Poly(sp.expand(den), s), sp.Poly(sp.expand(num), s)
    if dp.degree() != 2 or npoly.degree() > 1:
        raise ValueError(f"unexpected transfer-function order: num {npoly}, den {dp}")
    c0, c1, c2 = (dp.coeff_monomial(s**k) for k in range(3))
    n0, n1 = npoly.coeff_monomial(1), npoly.coeff_monomial(s)
    a1, a2 = sp.simplify(c1 / c0), sp.simplify(c2 / c0)
    out = {
        "Gd0": sp.simplify(n0 / c0),
        "a1": a1,
        "a2": a2,
        "w0": sp.simplify(1 / sp.sqrt(a2)),
        "Q": sp.simplify(sp.sqrt(a2) / a1),
    }
    if n1 != 0:
        out["wz"] = sp.simplify(-n0 / n1)  # zero at s = -n0/n1
    return out


def derive() -> Derivation:
    d = Derivation(
        module="small_signal",
        title="Small-signal control-to-output transfer functions (CCM)",
        title_ko="소신호 제어-출력 전달함수(CCM)",
        intro=(
            "Averaging removes the switching ripple; perturbing the averaged equations around the operating "
            "point ($d = D + \\hat d$, $v = V + \\hat v$, $i = I + \\hat i$) and dropping second-order products "
            "gives linear equations whose Laplace transform yields $\\hat v/\\hat d$. Each converter below ends "
            "in the standard second-order form with gain $G_{d0}$, poles at $\\omega_0$ with quality factor $Q$, "
            "and, for the boost and buck-boost, a zero $\\omega_z$ in the right half-plane."
        ),
        intro_ko=(
            "평균화로 스위칭 리플을 없앤 뒤, 평균 방정식을 동작점 주변에서 섭동($d = D + \\hat d$, "
            "$v = V + \\hat v$, $i = I + \\hat i$)하고 2차 곱을 버리면 선형 방정식이 되며, 이를 라플라스 변환하면 "
            "$\\hat v/\\hat d$를 얻는다. 아래 각 컨버터는 이득 $G_{d0}$, 품질계수 $Q$인 $\\omega_0$의 극점, "
            "그리고 부스트와 벅-부스트의 경우 우반평면 영점 $\\omega_z$를 갖는 표준 2차 형태로 정리된다."
        ),
    )
    D, Vg, R, L, C = S("D"), S("V_g"), S("R"), S("L"), S("C")
    s = d.local("s", "s")
    ih = d.local("i_hat", r"\hat i")
    vh = d.local("v_hat", r"\hat v")
    dh = d.local("d_hat", r"\hat d")
    Gvd = d.local("G_vd", r"G_{vd}(s)")
    # D' = 1 - D as a positive symbol, so sqrt(D'^2) simplifies to D';
    # every result is written back in terms of D before it is recorded.
    Dp = d.local("Dp", "D'", positive=True)
    back = {Dp: 1 - D}

    def solve_tf(eqs: list[sp.Eq]) -> sp.Expr:
        sol = sp.solve(eqs, [ih, vh], dict=True)
        if len(sol) != 1:
            raise ValueError(f"expected one solution, got {sol}")
        return sp.simplify(sol[0][vh] / dh)

    # ------------------------------------------------------------------ buck
    e1 = sp.Eq(L * s * ih, Vg * dh - vh)
    e2 = sp.Eq(C * s * vh, ih - vh / R)
    d.step(
        "Buck, linearised averaged equations ($\\hat v_g = 0$): the inductor sees $d\\,v_g - v$, "
        "the capacitor carries $i - v/R$.",
        "벅의 선형화된 평균 방정식($\\hat v_g = 0$): 인덕터에는 $d\\,v_g - v$가 걸리고 커패시터에는 $i - v/R$이 흐른다.",
        sp.Tuple(e1, e2),
    )
    G = solve_tf([e1, e2])
    d.step("Solve for $\\hat v/\\hat d$.", "$\\hat v/\\hat d$를 구한다.", sp.Eq(Gvd, G))
    f = _standard_form(G, s)
    d.result("buck.ss.Gd0", f["Gd0"], "DC gain: the value at $s = 0$.", "직류 이득: $s = 0$에서의 값.", S("G_d0"))
    d.result("buck.ss.w0", f["w0"], "Poles: $\\omega_0 = 1/\\sqrt{a_2}$ from the $s^2$ coefficient $a_2$.", "극점: $s^2$ 계수 $a_2$로부터 $\\omega_0 = 1/\\sqrt{a_2}$.", S("omega_0"))
    d.result("buck.ss.Q", f["Q"], "$Q = \\sqrt{a_2}/a_1$ from the $s$ coefficient $a_1$.", "$s$ 계수 $a_1$로부터 $Q = \\sqrt{a_2}/a_1$.", S("Q"))

    # ----------------------------------------------------------------- boost
    V_op, I_op = Vg / Dp, Vg / (Dp**2 * R)  # with D' = 1 - D
    V, I = d.local("V_op", "V", positive=True), d.local("I_op", "I", positive=True)
    e1 = sp.Eq(L * s * ih, -Dp * vh + V * dh)
    e2 = sp.Eq(C * s * vh, Dp * ih - I * dh - vh / R)
    d.step(
        "Boost: the averaged inductor voltage is $v_g - d' v$ and the capacitor current $d' i - v/R$ "
        "($d' = 1 - d$). Perturbing $d' = D' - \\hat d$ and linearising:",
        "부스트: 평균 인덕터 전압은 $v_g - d' v$, 커패시터 전류는 $d' i - v/R$이다($d' = 1 - d$). "
        "$d' = D' - \\hat d$로 섭동하고 선형화하면:",
        sp.Tuple(e1, e2),
    )
    d.step(
        "Operating point from the steady state, writing $D' = 1 - D$: $V = V_g/D'$, $I = V/(D' R)$.",
        "$D' = 1 - D$로 쓴 정상상태 동작점: $V = V_g/D'$, $I = V/(D' R)$.",
        sp.Tuple(sp.Eq(V, V_op), sp.Eq(I, I_op)),
    )
    G = sp.simplify(solve_tf([e1, e2]).subs({V: V_op, I: I_op}))
    d.step("Solve for $\\hat v/\\hat d$.", "$\\hat v/\\hat d$를 구한다.", sp.Eq(Gvd, G))
    f = _standard_form(G, s)
    d.result("boost.ss.Gd0", f["Gd0"].subs(back), "DC gain (results are written back with $D' = 1 - D$).", "직류 이득(결과는 $D' = 1 - D$로 되돌려 씀).", S("G_d0"))
    d.result("boost.ss.w0", f["w0"].subs(back), "Pole frequency.", "극점 주파수.", S("omega_0"))
    d.result("boost.ss.Q", f["Q"].subs(back), "Quality factor.", "품질계수.", S("Q"))
    d.result(
        "boost.ss.wz",
        f["wz"].subs(back),
        "The numerator vanishes at a positive real $s$: a right-half-plane zero.",
        "분자가 양의 실수 $s$에서 0이 된다: 우반평면 영점.",
        S("omega_z"),
    )

    # ------------------------------------------------ buck-boost (V < 0)
    Vn = d.local("V_n", "V", negative=True)
    Dd = 1 - Dp  # D written through D'
    Vn_op, Ibb_op = -Dd * Vg / Dp, Dd * Vg / (Dp**2 * R)
    e1 = sp.Eq(L * s * ih, (Vg - Vn) * dh + Dp * vh)
    e2 = sp.Eq(C * s * vh, -Dp * ih + I * dh - vh / R)
    d.step(
        "Buck-boost: averaged inductor voltage $d\\,v_g + d' v$ and capacitor current $-d' i - v/R$, with the "
        "output $v$ negative. Linearised:",
        "벅-부스트: 평균 인덕터 전압 $d\\,v_g + d' v$, 커패시터 전류 $-d' i - v/R$이며 출력 $v$는 음수이다. 선형화하면:",
        sp.Tuple(e1, e2),
    )
    d.step(
        "Operating point, with $D' = 1 - D$: $V = -D V_g/D'$, $I = D V_g/(D'^2 R)$.",
        "$D' = 1 - D$로 쓴 동작점: $V = -D V_g/D'$, $I = D V_g/(D'^2 R)$.",
        sp.Tuple(sp.Eq(Vn, Vn_op), sp.Eq(I, Ibb_op)),
    )
    G = sp.simplify(solve_tf([e1, e2]).subs({Vn: Vn_op, I: Ibb_op}))
    d.step("Solve for $\\hat v/\\hat d$.", "$\\hat v/\\hat d$를 구한다.", sp.Eq(Gvd, G))
    f = _standard_form(G, s)
    d.result(
        "buckboost.ss.Gd0",
        sp.simplify(-f["Gd0"]).subs(back),
        "The dc gain is negative (inverting output); its magnitude is:",
        "직류 이득은 음수(반전 출력)이며, 그 크기는:",
        S("G_d0"),
    )
    d.result("buckboost.ss.w0", f["w0"].subs(back), "Pole frequency.", "극점 주파수.", S("omega_0"))
    d.result("buckboost.ss.Q", f["Q"].subs(back), "Quality factor.", "품질계수.", S("Q"))
    d.result("buckboost.ss.wz", sp.simplify(f["wz"].subs(back)), "Right-half-plane zero.", "우반평면 영점.", S("omega_z"))
    return d
