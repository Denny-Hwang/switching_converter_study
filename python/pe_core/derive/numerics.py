"""Simulation: the exact time step of a first-order circuit; the factor by
which forward Euler, the trapezoidal rule and backward Euler multiply a
decaying mode in each step; the envelope of an L-C filter's ring with a
resistive load; and the switching periods a start-up needs to settle.

References: Alexander & Sadiku (2017), Ch. 7 (the complete response of a
first-order circuit) and Ch. 8 (the source-free parallel RLC circuit); Hairer
& Wanner (1996), Sec. IV.2 and IV.3 (a one-step method applied to the test
equation multiplies its solution by a fixed factor in each step).
"""

from __future__ import annotations

import sympy as sp

from .common import Derivation, S


def derive() -> Derivation:
    d = Derivation(
        module="numerics",
        title="Simulation: stepping a circuit in time, and how long it takes to settle",
        title_ko="시뮬레이션: 회로를 시간에 따라 진행시키기와 정착에 걸리는 시간",
        intro=(
            "A simulator advances a circuit's state in time steps. Within a step a switching converter is a linear "
            "circuit with constant sources, which a first-order example shows can be stepped exactly. The usual "
            "integration rules are compared on one decaying mode, the test equation, where each multiplies the "
            "deviation by a fixed factor per step. The envelope of the output filter's ring then says how many "
            "switching periods a simulation from rest needs before its last periods show the steady state."
        ),
        intro_ko=(
            "시뮬레이터는 회로의 상태를 시간 스텝마다 진행시킨다. 한 스텝 안에서 스위칭 컨버터는 전원이 일정한 선형 "
            "회로이며, 1차 회로의 예로 이를 정확히 진행시킬 수 있음을 보인다. 흔히 쓰는 적분 규칙들은 감쇠 모드 하나, "
            "곧 시험 방정식에서 비교하는데, 각 규칙은 스텝마다 편차에 일정한 배율을 곱한다. 끝으로 출력 필터 링잉의 "
            "포락선으로부터, 정지 상태에서 시작한 시뮬레이션의 마지막 주기들이 정상상태를 보여 주기까지 필요한 "
            "스위칭 주기 수를 구한다."
        ),
    )

    # --- the exact step of a first-order circuit ----------------------------------------------
    v0, vinf, dt, tau = S("v_0"), S("v_inf"), S("Delta_t"), S("tau")
    t = d.local("t", "t", positive=True)
    v = sp.Function("v")
    ode = sp.Eq(sp.Derivative(v(t), t), (vinf - v(t)) / tau)
    d.step(
        "Within a step the circuit is linear and its sources are constant. A capacitor charged through a "
        "resistance then approaches the voltage $v_\\infty$ at a rate proportional to the distance left, over "
        "the time constant $\\tau$:",
        "스텝 안에서 회로는 선형이고 전원은 일정하다. 그러면 저항을 통해 충전되는 커패시터는 남은 거리에 비례하고 "
        "시정수 $\\tau$에 반비례하는 속도로 전압 $v_\\infty$에 다가간다.",
        ode,
    )
    sol = sp.dsolve(ode, v(t), ics={v(0): v0}).rhs
    d.step(
        "Solve it from the voltage $v_0$ at the start of the step:",
        "스텝 시작의 전압 $v_0$에서 출발해 푼다.",
        sp.Eq(v(t), sol),
    )
    d.result(
        "sim.exact_step",
        sol.subs(t, dt),
        "At the end of the step, $t = \\Delta t$. Nothing was approximated, so the step may be as long as the "
        "interval:",
        "스텝의 끝, 곧 $t = \\Delta t$에서의 값이다. 아무것도 근사하지 않았으므로 스텝은 구간만큼 길어도 된다.",
        S("v_1"),
    )

    # --- three integration rules on the test equation -----------------------------------------
    x = sp.Function("x")
    x0 = d.local("x_0", "x_0")
    x1 = d.local("x_1", "x_1")
    d.step(
        "Compare the usual rules on one decaying mode on its own, the deviation $x$ from where the circuit is "
        "going, which changes at the rate $-x/\\tau$ (the test equation). A rule that steps it from $x_0$ to "
        "$x_1$ over $\\Delta t$ multiplies it by a factor $g = x_1/x_0$ in every step:",
        "흔히 쓰는 규칙들을 감쇠 모드 하나, 곧 회로가 향하는 값으로부터의 편차 $x$에서 비교한다. 이 편차는 "
        "$-x/\\tau$의 속도로 변한다(시험 방정식). $\\Delta t$ 동안 $x_0$에서 $x_1$로 진행시키는 규칙은 스텝마다 "
        "편차에 배율 $g = x_1/x_0$를 곱한다.",
        sp.Eq(sp.Derivative(x(t), t), -x(t) / tau),
    )
    fe = sp.Eq(x1, x0 + dt * (-x0 / tau))
    d.step(
        "Forward Euler takes the slope at the start of the step:",
        "전진 오일러는 스텝 시작의 기울기를 쓴다.",
        fe,
    )
    d.result(
        "num.gain_fe",
        sp.expand(sp.solve(fe, x1)[0] / x0),
        "Its factor per step:",
        "스텝당 배율은 다음과 같다.",
        S("g_FE"),
    )
    tr = sp.Eq(x1, x0 + dt / 2 * (-x0 / tau - x1 / tau))
    d.step(
        "The trapezoidal rule averages the slopes at both ends of the step, so $x_1$ appears on both sides:",
        "사다리꼴 규칙은 스텝 양 끝의 기울기를 평균하므로 $x_1$이 양변에 나타난다.",
        tr,
    )
    g_tr = sp.factor(sp.solve(tr, x1)[0] / x0)
    d.result(
        "num.gain_tr",
        g_tr,
        "Solve for $x_1$ and divide by $x_0$:",
        "$x_1$에 대해 풀고 $x_0$으로 나눈다.",
        S("g_TR"),
    )
    be = sp.Eq(x1, x0 + dt * (-x1 / tau))
    d.step(
        "Backward Euler takes the slope at the end of the step:",
        "후진 오일러는 스텝 끝의 기울기를 쓴다.",
        be,
    )
    g_be = sp.factor(sp.solve(be, x1)[0] / x0)
    d.result(
        "num.gain_be",
        g_be,
        "Its factor per step:",
        "스텝당 배율은 다음과 같다.",
        S("g_BE"),
    )
    d.step(
        "For a step far longer than $\\tau$, a stiff mode, the exact factor $e^{-\\Delta t/\\tau}$ is nearly zero. "
        "Forward Euler's factor grows without bound, the trapezoidal rule's tends to $-1$, so the mode keeps its "
        "size and flips its sign every step, and backward Euler's tends to zero, as the exact one does:",
        "스텝이 $\\tau$보다 훨씬 긴 강성(stiff) 모드에서 정확한 배율 $e^{-\\Delta t/\\tau}$는 거의 0이다. 전진 "
        "오일러의 배율은 한없이 커지고, 사다리꼴 규칙의 배율은 $-1$로 가서 모드가 크기를 유지한 채 매 스텝 부호를 "
        "바꾸며, 후진 오일러의 배율은 정확한 배율처럼 0으로 간다.",
        sp.Tuple(
            sp.Eq(sp.Limit(g_tr, dt, sp.oo), sp.limit(g_tr, dt, sp.oo)),
            sp.Eq(sp.Limit(g_be, dt, sp.oo), sp.limit(g_be, dt, sp.oo)),
        ),
    )

    # --- the envelope of the output filter's ring ---------------------------------------------
    R, C, L = S("R"), S("C"), S("L")
    s = d.local("s", "s")
    char = s**2 + s / (R * C) + 1 / (L * C)
    d.step(
        "Take a buck with ideal parts. With its source at rest (a voltage source is a short), the filter's "
        "inductance, its capacitance and the load resistance are in parallel. The natural response of this parallel "
        "RLC circuit goes as $e^{st}$, with $s$ a root of its characteristic equation:",
        "이상적인 부품으로 된 벅을 생각한다. 전원이 멈춘 상태에서(전압원은 단락) 필터의 인덕턴스, 커패시턴스, 부하 "
        "저항은 병렬이다. 이 병렬 RLC 회로의 자연 응답은 $e^{st}$를 따르며, $s$는 특성 방정식의 근이다.",
        sp.Eq(char, 0),
    )
    roots = sp.solve(char, s)
    alpha = sp.simplify(-(roots[0] + roots[1]) / 2)
    d.step(
        "When the filter rings, the roots are a complex-conjugate pair. Their common real part, half their sum, "
        "is $-\\alpha$, and $\\alpha$ is the decay rate of the ring's envelope (the neper frequency):",
        "필터가 진동할 때 두 근은 켤레 복소수이다. 두 근의 합의 절반인 공통 실수부가 $-\\alpha$이며, $\\alpha$가 링잉 "
        "포락선의 감쇠율(네퍼 주파수)이다.",
        sp.Eq(sp.Symbol("alpha"), alpha),
    )
    d.result(
        "filter.tau_env",
        sp.simplify(1 / alpha),
        "The envelope decays as $e^{-\\alpha t}$, with the time constant $1/\\alpha$, whatever the inductance "
        "(with ideal parts):",
        "포락선은 $e^{-\\alpha t}$로 감쇠하며, 시정수는 (이상적인 부품에서) 인덕턴스와 관계없이 $1/\\alpha$이다.",
        S("tau_env"),
    )

    # --- periods to settle ---------------------------------------------------------------------
    eps, Ts, tau_env = S("eps_r"), S("T_s"), S("tau_env")
    n = d.local("N", "N", positive=True)
    settle = sp.Eq(eps, sp.exp(-n * Ts / tau_env))
    d.step(
        "A simulation from rest starts with an error as large as the steady state itself. After $N$ switching "
        "periods it has fallen to the fraction $\\varepsilon_r$:",
        "정지 상태에서 시작한 시뮬레이션의 처음 오차는 정상상태 값만큼 크다. $N$ 스위칭 주기 뒤에는 그 오차가 "
        "비율 $\\varepsilon_r$까지 줄어든다.",
        settle,
    )
    d.result(
        "sim.periods_settle",
        sp.solve(settle, n)[0],
        "Solve for $N$:",
        "$N$에 대해 푼다.",
        S("N_set"),
    )
    return d
