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
    d.step("Gap reluctance (no fringing: the gap area equals $A_e$).", "갭 자기저항(프린징 무시: 갭 면적 = $A_e$).", sp.Eq(Rg, rg))
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
