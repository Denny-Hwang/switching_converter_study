"""Windings: dc resistance, skin depth, Dowell's factor for thin layers and
the layer thickness of least loss, the leakage inductance of two windings
(primary-secondary, and the primary split around the secondary), and the
inductance a winding shows with the other winding shorted, and the voltage
ratio with it open.

References: Erickson & Maksimović (2020), Ch. 10 (eddy currents in winding
conductors; leakage flux in windings and MMF diagrams; interleaving; the
transformer model and coupled inductors) and Ch. 11 (inductor design);
Dowell (1966); Hurley, Gath and Breslin (2000) for the optimum thickness.
The window-utilization definition, Dowell's ac resistance factor and the
coupling coefficient are catalogue definitions, not derived here.
"""

from __future__ import annotations

import sympy as sp

from .common import Derivation, S, positive_root


def derive() -> Derivation:
    d = Derivation(
        module="windings",
        title="Windings: resistance, skin depth, thin layers, leakage and the short circuit",
        title_ko="권선: 저항, 표피 깊이, 얇은 층, 누설, 단락",
        intro=(
            "A winding is a long conductor wound in layers. Its resistance follows from its length and cross-section; "
            "at high frequency the current crowds into a skin; and the field between the windings stores the energy "
            "that appears as leakage inductance."
        ),
        intro_ko=(
            "권선은 층으로 감긴 긴 도체이다. 저항은 길이와 단면적에서 나오고, 주파수가 높으면 전류가 표면층으로 몰리며, "
            "권선 사이의 자계는 누설 인덕턴스로 나타나는 에너지를 저장한다."
        ),
    )
    rho, N, MLT, Aw = S("rho_w"), S("N"), S("MLT"), S("A_w")
    length = d.local("l_w", r"l_w", positive=True)
    d.step("The winding is one conductor, $N$ turns of mean length MLT:", "권선은 평균 길이 MLT인 $N$ 턴의 도체 하나이다.", sp.Eq(length, N * MLT))
    d.result(
        "wind.dcr",
        rho * N * MLT / Aw,
        "Its dc resistance is the resistivity times the length over the conductor's area.",
        "직류 저항은 저항률에 길이를 곱하고 도체 단면적으로 나눈 값이다.",
        S("R_dc"),
    )

    mu0, f = S("mu_0"), S("f")
    omega = 2 * sp.pi * f
    k = d.local("k", "k")
    x = d.local("x", "x", real=True)
    d.step(
        "In a good conductor (conductivity $1/\\rho_w$) a sinusoidal current density obeys "
        "$d^2 J/dx^2 = j\\omega\\mu_0 J/\\rho_w$, so it varies as $e^{-k x}$ with",
        "양도체(전도율 $1/\\rho_w$) 안의 정현파 전류 밀도는 $d^2 J/dx^2 = j\\omega\\mu_0 J/\\rho_w$를 따르므로 $e^{-k x}$로 "
        "변하며, $k$는 다음과 같다.",
        sp.Eq(k**2, sp.I * omega * mu0 / rho),
    )
    kk = sp.sqrt(sp.I) * sp.sqrt(omega * mu0 / rho)
    d.step(
        "The root with a positive real part:",
        "실수부가 양수인 근:",
        sp.Eq(k, sp.expand_complex(kk)),
    )
    d.result(
        "wind.skin_depth",
        sp.simplify(1 / sp.re(sp.expand_complex(kk))),
        "The magnitude falls by $e$ over one skin depth, the inverse of the real part of $k$.",
        "크기는 $k$ 실수부의 역수인 표피 깊이 하나마다 $e$배 줄어든다.",
        S("delta_s"),
    )

    phi, Ml, FR = S("phi_l"), S("M_l"), S("F_R")
    dowell = phi * (
        (sp.sinh(2 * phi) + sp.sin(2 * phi)) / (sp.cosh(2 * phi) - sp.cos(2 * phi))
        + sp.Rational(2, 3) * (Ml**2 - 1) * (sp.sinh(phi) - sp.sin(phi)) / (sp.cosh(phi) + sp.cos(phi))
    )
    d.step(
        "Dowell's ac resistance factor of $M_\\ell$ layers, each $\\varphi$ skin depths thick (`wind.dowell`):",
        "두께가 표피 깊이의 $\\varphi$배인 층 $M_\\ell$개의 Dowell 교류 저항 계수(`wind.dowell`):",
        sp.Eq(FR, dowell),
    )
    low = sp.series(dowell, phi, 0, 5).removeO()
    d.result(
        "wind.dowell_low",
        sp.expand(low),
        "For thin layers, expand the hyperbolic and circular functions in powers of $\\varphi$: the terms up to $\\varphi^3$ "
        "cancel and the first excess is of fourth order.",
        "얇은 층에서는 쌍곡선 함수와 삼각 함수를 $\\varphi$의 거듭제곱으로 전개한다. $\\varphi^3$까지의 항은 상쇄되고 첫 초과 "
        "항은 4차이다.",
        FR,
    )
    rel = S("P_rel")
    Rd = d.local("R_delta", r"R_\delta", positive=True)
    Iw = d.local("I_lyr", "I", positive=True)
    Pl = d.local("P_l", "P", positive=True)
    layer_loss = FR * (Rd / phi) * Iw**2
    d.step(
        "At a given frequency the skin depth is fixed, so a layer $\\varphi$ skin depths thick has the dc resistance "
        "$R_\\delta/\\varphi$, $R_\\delta$ being that of a layer one skin depth thick. Carrying a current $I$, it loses",
        "주파수가 정해지면 표피 깊이도 정해지므로, 두께가 표피 깊이의 $\\varphi$배인 층의 직류 저항은 $R_\\delta/\\varphi$이다"
        "($R_\\delta$는 두께 한 표피 깊이 층의 직류 저항). 전류 $I$가 흐르면 손실은 다음과 같다.",
        sp.Eq(Pl, layer_loss),
    )
    d.result(
        "wind.loss_rel",
        sp.simplify(layer_loss / (Rd * Iw**2)),
        "Relative to the loss of a layer one skin depth thick carrying the same current as dc, $R_\\delta I^2$:",
        "같은 전류가 직류로 흐르는 두께 한 표피 깊이 층의 손실 $R_\\delta I^2$에 대한 비는 다음과 같다.",
        rel,
    )
    d.step(
        "With the series for thin layers:",
        "얇은 층의 급수를 쓰면:",
        sp.Eq(rel, sp.expand(low) / phi),
    )
    stationary = sp.solve(sp.Eq(sp.diff(sp.expand(low) / phi, phi), 0), phi)
    best = positive_root(stationary, {Ml: 2.0})
    d.result(
        "wind.phi_opt",
        best,
        "It is least where its derivative vanishes:",
        "도함수가 0인 곳에서 가장 작다.",
        S("phi_opt"),
    )
    d.step(
        "There the ac resistance factor is the same for every number of layers:",
        "그곳에서 교류 저항 계수는 층 수와 관계없이 같다.",
        sp.Eq(FR, sp.nsimplify(sp.simplify(sp.expand(low).subs(phi, best)))),
    )

    hp, hs, hg, bw = S("h_p"), S("h_s"), S("h_g"), S("b_w")
    I = d.local("I", "I", positive=True)
    F = d.local("F", r"\mathcal{F}", positive=True)
    E = d.local("E", "E", positive=True)
    y = d.local("y", "y", real=True)
    d.step(
        "The field in the window runs along the breadth $b_w$, so $H = \\mathcal{F}/b_w$ where $\\mathcal{F}$ is the MMF "
        "enclosed at that height; the energy it stores over the turn length MLT is",
        "창 안의 자계는 폭 $b_w$ 방향으로 향하므로 그 높이까지 둘러싸인 기자력을 $\\mathcal{F}$라 하면 $H = \\mathcal{F}/b_w$이고, "
        "턴 길이 MLT에 걸쳐 저장되는 에너지는 다음과 같다.",
        sp.Eq(E, mu0 * MLT / (2 * bw) * sp.Integral(F**2, y)),
    )

    def leakage(segments: list[tuple[sp.Expr, sp.Expr, sp.Expr]]) -> sp.Expr:
        """L_lk = 2E/I^2 for an MMF profile given as (height, MMF at start, MMF at end) segments, linear in each."""
        total = 0
        for h, f0, f1 in segments:
            total += sp.integrate((f0 + (f1 - f0) * y / h) ** 2, (y, 0, h))
        energy = mu0 * MLT / (2 * bw) * total
        return sp.simplify(2 * energy / I**2)

    peak = N * I
    d.step(
        "Primary, then secondary: the MMF rises linearly through the primary to $N I$, stays there across the spacing, "
        "and falls back to zero through the secondary.",
        "1차 다음에 2차: 기자력은 1차 권선을 지나며 $N I$까지 직선으로 오르고, 간격에서 그대로 유지되다가, 2차 권선을 지나며 "
        "0으로 돌아온다.",
        sp.Eq(F, peak),
    )
    d.result(
        "xfmr.leakage.ps",
        leakage([(hp, 0, peak), (hg, peak, peak), (hs, peak, 0)]),
        "With $L_\\mathrm{lk} = 2E/I^2$, each winding counts with a third of its height, the spacing in full.",
        "$L_\\mathrm{lk} = 2E/I^2$에서 각 권선은 높이의 1/3이, 간격은 전부가 들어간다.",
        S("L_lk"),
    )
    half = peak / 2
    d.step(
        "Primary split around the secondary: the MMF rises to $N I/2$ through the first half, crosses the secondary "
        "from $N I/2$ to $-N I/2$, and returns to zero through the second half.",
        "1차 권선을 2차 권선 양쪽으로 나누면: 기자력은 첫 번째 절반에서 $N I/2$까지 오르고, 2차 권선을 지나며 $N I/2$에서 "
        "$-N I/2$로 바뀐 뒤, 두 번째 절반에서 0으로 돌아온다.",
        sp.Eq(F, half),
    )
    d.result(
        "xfmr.leakage.psp",
        leakage([(hp / 2, 0, half), (hg, half, half), (hs, half, -half), (hg, -half, -half), (hp / 2, -half, 0)]),
        "The peak MMF is halved, so the energy, and the leakage, fall to about a quarter; the two spacings both count.",
        "최대 기자력이 절반이 되므로 에너지와 누설은 약 1/4로 줄고, 두 간격이 모두 들어간다.",
        S("L_lk"),
    )

    L11, L22, L12, kc = S("L_11"), S("L_22"), S("L_12"), S("k_c")
    v1 = d.local("v_1", "v_1", real=True)
    v2 = d.local("v_2", "v_2", real=True)
    di1 = d.local("di_1", r"\frac{di_1}{dt}", real=True)
    di2 = d.local("di_2", r"\frac{di_2}{dt}", real=True)
    d.step(
        "Two coupled windings, each with its own inductance and the mutual inductance $L_{12}$ between them:",
        "각자의 인덕턴스와 둘 사이의 상호 인덕턴스 $L_{12}$를 갖는 두 결합 권선:",
        sp.Eq(v1, L11 * di1 + L12 * di2),
    )
    d.step("and at winding 2:", "권선 2에서는:", sp.Eq(v2, L12 * di1 + L22 * di2))
    short = sp.solve(sp.Eq(0, L12 * di1 + L22 * di2), di2)[0]
    d.step(
        "Shorting winding 2 sets $v_2 = 0$, so its current changes against winding 1's:",
        "권선 2를 단락하면 $v_2 = 0$이므로 그 전류는 권선 1의 전류와 반대로 변한다.",
        sp.Eq(di2, short),
    )
    Lsc = S("L_sc")
    lsc = sp.simplify((L11 * di1 + L12 * short) / di1)
    d.step(
        "Winding 1 then sees the inductance $v_1/(di_1/dt)$:",
        "그러면 권선 1이 보는 인덕턴스는 $v_1/(di_1/dt)$이다.",
        sp.Eq(Lsc, lsc),
    )
    d.result(
        "xfmr.L_sc",
        sp.simplify(lsc.subs(L12, kc * sp.sqrt(L11 * L22))),
        "With the coupling coefficient $k = L_{12}/\\sqrt{L_{11} L_{22}}$ (`xfmr.k`):",
        "결합 계수 $k = L_{12}/\\sqrt{L_{11} L_{22}}$(`xfmr.k`)를 쓰면:",
        Lsc,
    )
    n, LM, Ll1, Ll2p = S("n"), S("L_M"), S("L_l1"), S("L_l2p")
    tmodel = {L11: Ll1 + LM, L12: n * LM, L22: n**2 * (Ll2p + LM)}
    d.step(
        "In the transformer model (1:$n$, magnetizing inductance $L_M$ and the leakage inductances, all referred to the "
        "primary) the winding inductances are",
        "변압기 모델(1:$n$, 1차 기준의 자화 인덕턴스 $L_M$와 누설 인덕턴스)에서 권선 인덕턴스는 다음과 같다.",
        sp.Eq(L11, tmodel[L11]),
    )
    d.step("the mutual inductance,", "상호 인덕턴스는", sp.Eq(L12, tmodel[L12]))
    d.step("and winding 2's inductance (its leakage $L_{\\ell 2} = n^2 L_{\\ell 2}'$):", "권선 2의 인덕턴스는(누설 $L_{\\ell 2} = n^2 L_{\\ell 2}'$)", sp.Eq(L22, tmodel[L22]))
    d.result(
        "xfmr.L_sc_T",
        Ll1 + sp.factor(sp.simplify(lsc.subs(tmodel) - Ll1)),
        "Substituting them, the turns ratio cancels: the primary's leakage in series with the secondary's in parallel "
        "with $L_M$.",
        "이를 대입하면 권선비가 소거된다. 1차 누설에, 2차 누설과 $L_M$의 병렬이 직렬로 더해진다.",
        Lsc,
    )
    Vr = S("V_ratio")
    open_ratio = sp.simplify((L12 * di1 + L22 * 0) / (L11 * di1 + L12 * 0))
    d.step(
        "With winding 2 open, no current flows in it ($di_2/dt = 0$), and the two voltages stand in the ratio",
        "권선 2를 개방하면 그 권선에는 전류가 흐르지 않으므로($di_2/dt = 0$) 두 전압의 비는 다음과 같다.",
        sp.Eq(Vr, open_ratio),
    )
    d.result(
        "xfmr.V_oc",
        sp.simplify(open_ratio.subs(tmodel)),
        "In the transformer model: slightly below the turns ratio, the primary's leakage taking its share of the voltage.",
        "변압기 모델에서는 1차 누설이 전압의 일부를 나누어 가지므로 권선비보다 조금 작다.",
        Vr,
    )
    return d
