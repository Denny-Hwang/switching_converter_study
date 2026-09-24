"""Magnetic-circuit relations: A_L of a gapped core, L = A_L N², peak flux
density from inductance, and the flux swing from Faraday's law.

References: Dixon, Magnetics Design Handbook (TI SLUP132); Erickson &
Maksimović (2020), Ch. 10 (basic magnetics theory).
"""

from __future__ import annotations

import sympy as sp

from .common import Derivation, S


def derive() -> Derivation:
    d = Derivation(
        module="magnetics",
        title="Magnetic circuits: A_L, inductance, peak and swing flux density",
        title_ko="자기 회로: A_L, 인덕턴스, 피크 및 변화 자속 밀도",
        intro=(
            "A magnetic path behaves like a resistive circuit: the magnetomotive force $N i$ drives flux $\\Phi$ "
            "through reluctances $\\mathcal{R} = l/(\\mu A)$. With a uniform flux density over the effective area $A_e$, "
            "$B = \\Phi/A_e$."
        ),
        intro_ko=(
            "자기 경로는 저항 회로처럼 동작한다. 기자력 $N i$가 자기저항 $\\mathcal{R} = l/(\\mu A)$를 통해 자속 $\\Phi$를 흐르게 한다. "
            "유효 단면적 $A_e$에서 자속 밀도가 균일하면 $B = \\Phi/A_e$이다."
        ),
    )
    mu0, mui, Ae, le, lg = S("mu_0"), S("mu_i"), S("A_e"), S("l_e"), S("l_g")
    N, L, AL, Ipk = S("N"), S("L"), S("A_L"), S("I_pk")
    Vw, ton = S("V_w"), S("t_on")
    Rc = d.local("R_c", r"\mathcal{R}_c", positive=True)
    Rg = d.local("R_g", r"\mathcal{R}_g", positive=True)
    Rtot = d.local("R_tot", r"\mathcal{R}", positive=True)
    Phi = d.local("Phi", r"\Phi", positive=True)
    lam = d.local("lambda_", r"\lambda", positive=True)
    t = d.local("t", "t", real=True)

    rc = le / (mu0 * mui * Ae)
    rg = lg / (mu0 * Ae)
    d.step("Core reluctance (relative permeability $\\mu_i$).", "코어 자기저항(비투자율 $\\mu_i$).", sp.Eq(Rc, rc))
    d.step("Gap reluctance (no fringing: the gap area equals $A_e$).", "공극 자기저항(프린징 무시: 공극 면적 = $A_e$).", sp.Eq(Rg, rg))
    d.step("They are in series.", "두 자기저항은 직렬이다.", sp.Eq(Rtot, rc + rg))
    d.step(
        "Flux linkage $\\lambda = N\\Phi = N (N i/\\mathcal{R})$, so $L = \\lambda/i = N^2/\\mathcal{R}$.",
        "쇄교 자속 $\\lambda = N\\Phi = N (N i/\\mathcal{R})$이므로 $L = \\lambda/i = N^2/\\mathcal{R}$.",
        sp.Eq(L, N**2 / Rtot),
    )
    d.step(
        "The inductance factor is the inductance per turn squared, $A_L = L/N^2 = 1/\\mathcal{R}$.",
        "인덕턴스 계수는 턴 제곱당 인덕턴스이다: $A_L = L/N^2 = 1/\\mathcal{R}$.",
        sp.Eq(AL, 1 / Rtot),
    )
    d.result(
        "mag.AL_gap",
        sp.simplify(1 / (rc + rg)),
        "Substitute the two reluctances.",
        "두 자기저항을 대입한다.",
        AL,
    )
    d.result("mag.L_from_AL", AL * N**2, "Hence $L = A_L N^2$.", "따라서 $L = A_L N^2$.", L)

    d.step(
        "Flux linkage and inductance: $\\lambda = N\\Phi = L i$, so $\\Phi = L i/N$.",
        "쇄교 자속과 인덕턴스: $\\lambda = N\\Phi = L i$이므로 $\\Phi = L i/N$.",
        sp.Eq(lam, N * Phi),
    )
    d.result(
        "mag.B_pk",
        L * Ipk / (N * Ae),
        "At the peak current, $B_\\mathrm{pk} = \\Phi_\\mathrm{pk}/A_e = L I_\\mathrm{pk}/(N A_e)$.",
        "피크 전류에서 $B_\\mathrm{pk} = \\Phi_\\mathrm{pk}/A_e = L I_\\mathrm{pk}/(N A_e)$.",
        S("B_pk"),
    )

    d.result(
        "mag.B_ac",
        L * S("Delta_i_L") / (N * Ae),
        "The flux density follows the current, $B = L i/(N A_e)$. A ripple of $\\pm\\Delta i_L$ about the dc current "
        "moves it by $\\pm L\\,\\Delta i_L/(N A_e)$ about its dc value: that amplitude is $B_\\mathrm{ac}$.",
        "자속 밀도는 전류를 따른다: $B = L i/(N A_e)$. 직류 전류를 중심으로 한 $\\pm\\Delta i_L$의 리플은 자속 밀도를 "
        "직류 값을 중심으로 $\\pm L\\,\\Delta i_L/(N A_e)$만큼 움직이며, 이 진폭이 $B_\\mathrm{ac}$이다.",
        S("B_ac"),
    )

    Bmax = S("B_max")
    d.result(
        "mag.N_Bmax",
        sp.solve(sp.Eq(L * Ipk / (N * Ae), Bmax), N)[0],
        "Holding $B_\\mathrm{pk}$ at the limit $B_\\mathrm{max}$ and solving for the turns gives the fewest turns "
        "that stay within it.",
        "$B_\\mathrm{pk}$를 한계 $B_\\mathrm{max}$에 두고 턴 수에 대해 풀면, 한계 안에 머무는 최소 턴 수가 나온다.",
        N,
    )
    d.result(
        "mag.gap_length",
        sp.solve(sp.Eq(L, N**2 / (rc + rg)), lg)[0],
        "With $N$ fixed, the inductance $L = N^2/(\\mathcal{R}_c + \\mathcal{R}_g)$ sets the gap reluctance, and with "
        "it the gap length.",
        "$N$이 정해지면 인덕턴스 $L = N^2/(\\mathcal{R}_c + \\mathcal{R}_g)$가 공극 자기저항을, 따라서 공극 길이를 "
        "정한다.",
        lg,
    )

    rho, Aw, WA, MLT, Ku, Rdc = S("rho_w"), S("A_w"), S("W_A"), S("MLT"), S("K_u"), S("R_dc")
    d.step(
        "Choosing a core. The winding's $N$ turns of copper area $A_w$ may fill only $K_u$ of the window $W_A$:",
        "코어 고르기. 구리 단면적 $A_w$인 $N$ 턴의 권선은 창 $W_A$의 $K_u$만 차지할 수 있다.",
        sp.Eq(Ku * WA, N * Aw),
    )
    d.step(
        "Its resistance, $N$ turns of mean length MLT, is the copper-loss budget $R_\\mathrm{dc}$:",
        "평균 길이 MLT인 $N$ 턴의 저항이 구리 손실 한도 $R_\\mathrm{dc}$이다.",
        sp.Eq(Rdc, rho * N * MLT / Aw),
    )
    r_fill = sp.solve(sp.Eq(Rdc, rho * N * MLT / Aw).subs(Aw, Ku * WA / N), Rdc)[0]
    d.step(
        "The window fixes the wire, $A_w = K_u W_A/N$, so the resistance grows as the square of the turns:",
        "창이 선재를 정하므로($A_w = K_u W_A/N$) 저항은 턴 수의 제곱으로 커진다.",
        sp.Eq(Rdc, r_fill),
    )
    r_core = r_fill.subs(N, L * Ipk / (Bmax * Ae))
    d.step(
        "The flux limit fixes the turns, $N = L I_\\mathrm{pk}/(B_\\mathrm{max} A_e)$:",
        "자속 한계가 턴 수를 정한다: $N = L I_\\mathrm{pk}/(B_\\mathrm{max} A_e)$.",
        sp.Eq(Rdc, r_core),
    )
    d.step(
        "Collecting the core's dimensions on one side defines the core geometrical constant; the other side depends on "
        "the specification alone.",
        "코어 치수를 한쪽으로 모으면 코어 기하 상수가 정의되고, 다른 쪽은 사양에만 의존한다.",
        sp.Eq(S("K_g"), Ae**2 * WA / MLT),
    )
    d.result(
        "mag.Kg_req",
        sp.simplify(Ae**2 * WA / sp.solve(sp.Eq(Rdc, r_core), MLT)[0]),
        "A core meets the flux limit, the window and the resistance budget together when its $K_g$ is at least:",
        "코어의 $K_g$가 다음 값 이상이면 자속 한계, 창, 저항 한도를 함께 만족한다.",
        S("K_g"),
    )

    faraday = sp.Integral(Vw / (N * Ae), (t, 0, ton))
    d.step(
        "Faraday's law: $v = N A_e\\,dB/dt$, so the change of $B$ over the on-time is the integral of $v/(N A_e)$.",
        "패러데이 법칙: $v = N A_e\\,dB/dt$이므로 온 구간 동안의 $B$ 변화는 $v/(N A_e)$의 적분이다.",
        sp.Eq(S("Delta_B"), faraday),
    )
    d.result(
        "mag.dB_faraday",
        faraday.doit(),
        "With a constant winding voltage $V_w$ the swing is proportional to the volt-seconds $V_w t_\\mathrm{on}$.",
        "권선 전압 $V_w$가 일정하면 변화폭은 전압-초 $V_w t_\\mathrm{on}$에 비례한다.",
        S("Delta_B"),
    )
    return d
