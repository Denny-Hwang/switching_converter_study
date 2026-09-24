"""Piezoelectric source: its model, the best resistive load, and three interfaces.

Under a steady sinusoidal vibration whose amplitude the electrical load does
not change (weak coupling), a piezoelectric element is a current source
I_p sin(wt) in parallel with its clamped capacitance C_0 (Guyomar et al.
2005). Every result below follows from where that current's charge goes in
each half period.

References: Guyomar, Badel, Lefeuvre & Richard (2005), the model and SSHI;
Lefeuvre, Badel, Richard & Guyomar (2005), SECE; Lefeuvre et al. (2006), the
comparison.
"""

from __future__ import annotations

import sympy as sp

from .common import Derivation, S


def _single(solutions: list[sp.Expr], what: str) -> sp.Expr:
    if len(solutions) != 1:
        raise ValueError(f"piezo: expected one {what}, got {solutions}")
    return solutions[0]


def derive() -> Derivation:
    d = Derivation(
        module="piezo",
        title="Piezoelectric source: loads and interfaces",
        title_ko="압전 전원: 부하와 인터페이스",
        intro=(
            "Under a steady sinusoidal vibration of constant amplitude, a piezoelectric element is a current source "
            "$I_p \\sin \\omega t$ in parallel with its clamped capacitance $C_0$. What a load or an interface takes "
            "follows from where that current's charge goes in each half period."
        ),
        intro_ko=(
            "진폭이 일정한 정현파 진동을 받는 압전 소자는 클램프 커패시턴스 $C_0$와 병렬인 전류원 "
            "$I_p \\sin \\omega t$이다. 부하나 인터페이스가 얼마를 받는지는 반주기마다 그 전류의 전하가 어디로 "
            "가는지에서 나온다."
        ),
    )
    Ip, w, C0 = S("I_p"), S("omega"), S("C_0")
    Vdc, g, R = S("V_DC"), S("gamma"), S("R")
    t = d.local("t", "t", positive=True)

    # --- open circuit ---------------------------------------------------------------------------
    v_open = sp.integrate(Ip * sp.sin(w * t), t) / C0
    d.step(
        "With nothing connected, the whole current charges $C_0$: $v = \\frac{1}{C_0}\\int I_p \\sin \\omega t \\, dt$.",
        "아무것도 연결하지 않으면 전류 전부가 $C_0$를 충전한다: $v = \\frac{1}{C_0}\\int I_p \\sin \\omega t \\, dt$.",
        sp.Eq(d.local("v", "v"), v_open),
    )
    VM = sp.simplify(-v_open.coeff(sp.cos(w * t)))
    d.result("piezo.Vp", VM, "Its amplitude.", "그 진폭.", S("V_p"))

    # --- resistive load -------------------------------------------------------------------------
    Z = R / (1 + sp.I * w * R * C0)
    absZ2 = sp.simplify(sp.expand(Z * sp.conjugate(Z)))
    PR = sp.simplify(Ip**2 * absZ2 / (2 * R))
    d.step(
        "A resistor $R$ across the element shares the current with $C_0$: its voltage amplitude is $I_p |R \\parallel "
        "1/(j\\omega C_0)|$, and it takes half the square of that over $R$.",
        "소자 양단의 저항 $R$은 $C_0$와 전류를 나눈다. 전압 진폭은 $I_p |R \\parallel 1/(j\\omega C_0)|$이고, 저항은 "
        "그 제곱의 절반을 $R$로 나눈 만큼을 받는다.",
        sp.Eq(S("P"), PR),
    )
    Ropt = _single(sp.solve(sp.Eq(sp.diff(PR, R), 0), R), "stationary load")
    d.result("piezo.R_opt", Ropt, "$dP/dR = 0$.", "$dP/dR = 0$.", R)
    d.result("piezo.P_R", sp.simplify(PR.subs(R, Ropt)), "Substitute it.", "이를 대입한다.", S("P"))

    # --- charge per half period -----------------------------------------------------------------
    q_half = sp.integrate(Ip * sp.sin(w * t), (t, 0, sp.pi / w))
    d.step(
        "The source drives $2 I_p/\\omega$ of charge each half period, between two extrema of the displacement.",
        "전원은 변위의 두 극값 사이, 즉 반주기마다 $2 I_p/\\omega$의 전하를 흘린다.",
        sp.Eq(d.local("q", "q"), q_half),
    )
    half = sp.pi / w  # half a period

    # --- standard interface ---------------------------------------------------------------------
    E_std = Vdc * (q_half - 2 * C0 * Vdc)
    d.step(
        "Through a full-wave bridge onto $V_\\mathrm{DC}$, the element's voltage swings from $-V_\\mathrm{DC}$ to "
        "$V_\\mathrm{DC}$ before the bridge conducts, which takes $2 C_0 V_\\mathrm{DC}$; the rest of the charge enters "
        "$V_\\mathrm{DC}$.",
        "전파 브리지를 거쳐 $V_\\mathrm{DC}$에 연결하면, 소자 전압이 $-V_\\mathrm{DC}$에서 $V_\\mathrm{DC}$까지 바뀐 뒤에야 "
        "브리지가 도통하며 이 변화에 $2 C_0 V_\\mathrm{DC}$가 든다. 나머지 전하가 $V_\\mathrm{DC}$로 들어간다.",
        sp.Eq(d.local("E_h", "E_{1/2}"), E_std),
    )
    Pstd = sp.simplify(E_std / half)
    d.result("piezo.P_std", sp.expand(Pstd), "Per unit time: one such half period every $\\pi/\\omega$.",
             "단위 시간당: $\\pi/\\omega$마다 반주기 하나.", S("P"))
    vopt = _single(sp.solve(sp.Eq(sp.diff(Pstd, Vdc), 0), Vdc), "stationary voltage")
    d.step("$dP/dV_\\mathrm{DC} = 0$: half the open-circuit amplitude.", "$dP/dV_\\mathrm{DC} = 0$: 개방 전압 진폭의 절반.",
           sp.Eq(Vdc, vopt))
    d.result("piezo.P_std_max", sp.simplify(Pstd.subs(Vdc, vopt)), "Substitute it.", "이를 대입한다.", S("P_std_max"))

    # --- SECE -----------------------------------------------------------------------------------
    V_end = q_half / C0
    E_sece = C0 * V_end**2 / 2
    d.step(
        "SECE leaves the element open between extrema, so its voltage climbs from zero to $2 I_p/(\\omega C_0)$; at "
        "the extremum all of $\\tfrac12 C_0 v^2$ is taken, whatever the load.",
        "SECE는 극값 사이에서 소자를 개방해 두므로 전압이 0에서 $2 I_p/(\\omega C_0)$까지 오른다. 극값에서 "
        "$\\tfrac12 C_0 v^2$ 전부를 꺼내며, 부하와 무관하다.",
        sp.Eq(d.local("E_h2", "E_{1/2}"), sp.simplify(E_sece)),
    )
    d.result("piezo.P_sece", sp.simplify(E_sece / half), "Per unit time.", "단위 시간당.", S("P"))

    # --- parallel SSHI --------------------------------------------------------------------------
    E_sshi = Vdc * (q_half - (1 - g) * C0 * Vdc)
    d.step(
        "Parallel SSHI inverts the element's voltage at each extremum, from $\\mp V_\\mathrm{DC}$ to $\\pm\\gamma "
        "V_\\mathrm{DC}$, so the swing to the other rail takes only $(1 - \\gamma) C_0 V_\\mathrm{DC}$.",
        "병렬 SSHI는 극값마다 소자 전압을 $\\mp V_\\mathrm{DC}$에서 $\\pm\\gamma V_\\mathrm{DC}$로 반전시키므로, 반대쪽 "
        "레일까지의 변화에는 $(1 - \\gamma) C_0 V_\\mathrm{DC}$만 든다.",
        sp.Eq(d.local("E_h3", "E_{1/2}"), E_sshi),
    )
    Psshi = sp.simplify(E_sshi / half)
    d.result("piezo.P_sshi", sp.expand(Psshi), "Per unit time.", "단위 시간당.", S("P"))
    vopt2 = _single(sp.solve(sp.Eq(sp.diff(Psshi, Vdc), 0), Vdc), "stationary voltage")
    # shown as I_p/(omega C_0 (1 - gamma)); solve gives -I_p/(C_0 omega (gamma - 1))
    shown = Ip / (w * C0 * (1 - g))
    assert sp.simplify(vopt2 - shown) == 0
    d.step("$dP/dV_\\mathrm{DC} = 0$.", "$dP/dV_\\mathrm{DC} = 0$.", sp.Eq(Vdc, shown))
    d.result("piezo.P_sshi_max", sp.simplify(Psshi.subs(Vdc, vopt2)), "Substitute it.", "이를 대입한다.", S("P_sshi_max"))
    return d
