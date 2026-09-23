"""Windings: dc resistance, skin depth, and the leakage inductance of two
windings, primary-secondary and with the primary split around the secondary.

References: Erickson & Maksimović (2020), Ch. 10 (eddy currents in winding
conductors; leakage flux in windings and MMF diagrams; interleaving) and
Ch. 11 (inductor design). The window-utilization definition and Dowell's
ac resistance factor are catalogue definitions, not derived here.
"""

from __future__ import annotations

import sympy as sp

from .common import Derivation, S


def derive() -> Derivation:
    d = Derivation(
        module="windings",
        title="Windings: resistance, skin depth and leakage",
        title_ko="권선: 저항, 표피 깊이, 누설",
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
    return d
