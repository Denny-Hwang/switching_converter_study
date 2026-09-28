"""Simulation: the exact time step of a first-order circuit; the factor by
which forward Euler, the trapezoidal rule and backward Euler multiply a
decaying mode in each step; the voltage of a backward Euler step that stops
an inductor's current; the envelope of an L-C filter's ring with a resistive
load; and the switching periods a start-up needs to settle.

References: Alexander & Sadiku (2017), Ch. 6 (an inductor's voltage is L
di/dt), Ch. 7 (the complete response of a first-order circuit) and Ch. 8 (the
source-free parallel RLC circuit); Hairer & Wanner (1996), Sec. IV.2 and IV.3
(a one-step method applied to the test equation multiplies its solution by a
fixed factor in each step; implicit Euler takes the slope at the end of the
step).
"""

from __future__ import annotations

import sympy as sp

from .common import Derivation, S


def derive() -> Derivation:
    d = Derivation(
        module="numerics",
        title="Simulation: stepping a circuit in time, and how long it takes to settle",
        title_ko="시뮬레이션: 회로를 한 타임 스텝씩 계산하기와 정착에 걸리는 시간",
        intro=(
            "A simulator advances a circuit's state in time steps. Within a step a switching converter is a linear "
            "circuit with constant sources, which a first-order example shows can be stepped exactly. The usual "
            "integration rules are compared on one decaying mode, the test equation, where each multiplies the "
            "deviation by a fixed factor per step. The envelope of the output filter's ring then says how many "
            "switching periods a simulation from rest needs before its last periods show the steady state."
        ),
        intro_ko=(
            "시뮬레이터는 회로의 상태를 한 타임 스텝씩 계산합니다. 한 스텝 안에서 스위칭 컨버터는 전원이 일정한 "
            "선형 회로이며, 1차 회로의 예에서 보듯 이런 회로는 한 스텝을 정확히 계산할 수 있습니다. 흔히 쓰는 적분 "
            "규칙들은 감쇠 모드 하나, 곧 시험 방정식(test equation)으로 비교합니다. 이 방정식에서 각 규칙은 "
            "스텝마다 편차에 일정한 배율을 곱합니다. 끝으로 출력 필터 링잉의 포락선을 이용해, 정지 상태에서 시작한 "
            "시뮬레이션을 몇 스위칭 주기 동안 실행해야 마지막 주기들이 정상상태를 보여 주는지 구합니다."
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
        "한 스텝 안에서 회로는 선형이고 전원은 일정합니다. 그러면 저항을 통해 충전되는 커패시터는 남은 전압 차에 "
        "비례하고 시정수 $\\tau$에 반비례하는 속도로 전압 $v_\\infty$에 다가갑니다.",
        ode,
    )
    sol = sp.dsolve(ode, v(t), ics={v(0): v0}).rhs
    d.step(
        "Solve it from the voltage $v_0$ at the start of the step:",
        "스텝이 시작할 때의 전압 $v_0$을 초기값으로 풉니다.",
        sp.Eq(v(t), sol),
    )
    d.result(
        "sim.exact_step",
        sol.subs(t, dt),
        "At the end of the step, $t = \\Delta t$. Nothing was approximated, so the step may be as long as the "
        "interval:",
        "스텝이 끝나는 $t = \\Delta t$에서의 값입니다. 근사한 것이 없으므로 스텝을 그 구간 전체만큼 길게 잡아도 "
        "됩니다.",
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
        "흔히 쓰는 규칙들을 감쇠 모드 하나만 떼어 비교합니다. 이 모드는 회로가 향하는 값에서 벗어난 편차 $x$이며, "
        "$-x/\\tau$의 속도로 변합니다(시험 방정식). $\\Delta t$ 동안 편차를 $x_0$에서 $x_1$로 계산하는 규칙은 "
        "매 스텝 편차에 배율 $g = x_1/x_0$를 곱합니다.",
        sp.Eq(sp.Derivative(x(t), t), -x(t) / tau),
    )
    fe = sp.Eq(x1, x0 + dt * (-x0 / tau))
    d.step(
        "Forward Euler takes the slope at the start of the step:",
        "전진 오일러(forward Euler)는 스텝 시작점의 기울기를 씁니다.",
        fe,
    )
    d.result(
        "num.gain_fe",
        sp.expand(sp.solve(fe, x1)[0] / x0),
        "Its factor per step:",
        "스텝당 배율은 다음과 같습니다.",
        S("g_FE"),
    )
    tr = sp.Eq(x1, x0 + dt / 2 * (-x0 / tau - x1 / tau))
    d.step(
        "The trapezoidal rule averages the slopes at both ends of the step, so $x_1$ appears on both sides:",
        "사다리꼴 규칙(trapezoidal rule)은 스텝 양 끝의 기울기를 평균하므로 $x_1$이 양변에 나타납니다.",
        tr,
    )
    g_tr = sp.factor(sp.solve(tr, x1)[0] / x0)
    d.result(
        "num.gain_tr",
        g_tr,
        "Solve for $x_1$ and divide by $x_0$:",
        "$x_1$에 대해 풀고 $x_0$으로 나눕니다.",
        S("g_TR"),
    )
    be = sp.Eq(x1, x0 + dt * (-x1 / tau))
    d.step(
        "Backward Euler takes the slope at the end of the step:",
        "후진 오일러(backward Euler)는 스텝 끝점의 기울기를 씁니다.",
        be,
    )
    g_be = sp.factor(sp.solve(be, x1)[0] / x0)
    d.result(
        "num.gain_be",
        g_be,
        "Its factor per step:",
        "스텝당 배율은 다음과 같습니다.",
        S("g_BE"),
    )
    d.step(
        "For a step far longer than $\\tau$, a stiff mode, the exact factor $e^{-\\Delta t/\\tau}$ is nearly zero. "
        "Forward Euler's factor grows without bound, the trapezoidal rule's tends to $-1$, so the mode keeps its "
        "size and flips its sign every step, and backward Euler's tends to zero, as the exact one does:",
        "스텝이 $\\tau$보다 훨씬 긴 강성(stiff) 모드에서는 정확한 배율 $e^{-\\Delta t/\\tau}$가 거의 0입니다. 이때 "
        "전진 오일러의 배율은 한없이 커지고, 사다리꼴 규칙의 배율은 $-1$에 가까워져 모드가 크기를 유지한 채 매 "
        "스텝 부호만 바뀌며, 후진 오일러의 배율은 정확한 배율처럼 0에 가까워집니다.",
        sp.Tuple(
            sp.Eq(sp.Limit(g_tr, dt, sp.oo), sp.limit(g_tr, dt, sp.oo)),
            sp.Eq(sp.Limit(g_be, dt, sp.oo), sp.limit(g_be, dt, sp.oo)),
        ),
    )

    # --- the step that stops an inductor's current ---------------------------------------------
    L_ind, i_os = S("L"), S("I_os")
    i0 = d.local("i_0", "i_0")
    i1 = d.local("i_1", "i_1")
    v1 = d.local("v_L1", "v_{L,1}")
    be_ind = sp.Eq(i1, i0 + dt * v1 / L_ind)
    d.step(
        "Backward Euler steps an inductor's current with the slope at the end of the step, the voltage $v_{L,1}$ "
        "across it over its inductance:",
        "후진 오일러는 인덕터 전류를 스텝 끝점의 기울기, 곧 인덕터 전압 $v_{L,1}$을 인덕턴스로 나눈 값으로 "
        "계산합니다.",
        be_ind,
    )
    stop = be_ind.subs({i0: -i_os, i1: 0})
    d.step(
        "A diode's current has gone past zero, to $-I_\\mathrm{os}$, before the diode turns off. If nothing else "
        "takes the current, the next step must end with it at zero:",
        "다이오드가 꺼지기 전에 다이오드 전류가 0을 지나 $-I_\\mathrm{os}$까지 내려갔습니다. 이 전류가 흐를 다른 "
        "경로가 없으면 다음 스텝은 전류가 0인 상태로 끝나야 합니다.",
        stop,
    )
    d.result(
        "sim.step_jump",
        sp.solve(stop, v1)[0],
        "Solve for the voltage across the inductor in that step:",
        "그 스텝에서 인덕터에 걸리는 전압에 대해 풉니다.",
        S("v_jump"),
    )

    # --- the envelope of the output filter's ring ---------------------------------------------
    R, C, L = S("R"), S("C"), S("L")
    s = d.local("s", "s")
    char = s**2 + s / (R * C) + 1 / (L * C)
    d.step(
        "Take a buck with ideal parts. With its source at rest (a voltage source is a short), the filter's "
        "inductance, its capacitance and the load resistance are in parallel. The natural response of this parallel "
        "RLC circuit goes as $e^{st}$, with $s$ a root of its characteristic equation:",
        "이상적인 부품으로 된 벅을 생각합니다. 전원을 끄면(전압원은 단락) 필터의 인덕턴스와 커패시턴스, "
        "부하 저항이 병렬이 됩니다. 이 병렬 RLC 회로의 자연 응답은 $e^{st}$ 꼴이며, $s$는 특성 방정식의 "
        "근입니다.",
        sp.Eq(char, 0),
    )
    roots = sp.solve(char, s)
    alpha = sp.simplify(-(roots[0] + roots[1]) / 2)
    d.step(
        "When the filter rings, the roots are a complex-conjugate pair. Their common real part, half their sum, "
        "is $-\\alpha$, and $\\alpha$ is the decay rate of the ring's envelope (the neper frequency):",
        "필터가 링잉할 때 두 근은 켤레 복소수입니다. 두 근의 합의 절반인 공통 실수부가 $-\\alpha$이며, "
        "$\\alpha$는 링잉 포락선의 감쇠율, 곧 네퍼 주파수(neper frequency)입니다.",
        sp.Eq(sp.Symbol("alpha"), alpha),
    )
    d.result(
        "filter.tau_env",
        sp.simplify(1 / alpha),
        "The envelope decays as $e^{-\\alpha t}$, with the time constant $1/\\alpha$, whatever the inductance "
        "(with ideal parts):",
        "포락선은 $e^{-\\alpha t}$로 감쇠하며, 시정수는 인덕턴스와 관계없이 $1/\\alpha$입니다(이상적인 "
        "부품에서).",
        S("tau_env"),
    )

    # --- periods to settle ---------------------------------------------------------------------
    eps, Ts, tau_env = S("eps_r"), S("T_s"), S("tau_env")
    n = d.local("N", "N", positive=True)
    settle = sp.Eq(eps, sp.exp(-n * Ts / tau_env))
    d.step(
        "A simulation from rest starts with an error as large as the steady state itself. After $N$ switching "
        "periods it has fallen to the fraction $\\varepsilon_r$:",
        "정지 상태에서 시작한 시뮬레이션은 처음 오차가 정상상태 값만큼 큽니다. $N$ 스위칭 주기 뒤에는 이 오차가 "
        "처음 값의 $\\varepsilon_r$배로 줄어듭니다.",
        settle,
    )
    d.result(
        "sim.periods_settle",
        sp.solve(settle, n)[0],
        "Solve for $N$:",
        "$N$에 대해 풉니다.",
        S("N_set"),
    )
    return d
