"""Flyback converter: DCM conversion ratio, CCM/DCM boundary (K_crit and the
fixed-output critical input voltage), switch and diode stresses, the CCM
magnetizing current and ripples, peak current, DCM input power and the
loss-free-resistor input resistance.

Conventions (CLAUDE.md): 1:n transformer with n = N_s/N_p, magnetizing
inductance L_M referred to the primary, K = 2 L_M/(R T_s) with the actual
secondary-side load R.

References: Erickson & Maksimović (2020), Ch. 5 (DCM), Ch. 6 (flyback),
Ch. 15 (DCM equivalent circuit, loss-free resistor); Singer (1990).
"""

from __future__ import annotations

import sympy as sp

from .common import Derivation, S, positive_root


def derive() -> Derivation:
    d = Derivation(
        module="flyback",
        title="Flyback: DCM ratio, boundaries, stresses and the loss-free resistor",
        title_ko="플라이백: DCM 변환비, 경계, 스트레스, 무손실 저항",
        intro=(
            "The flyback stores energy in the magnetizing inductance $L_M$ while the switch is on and releases "
            "it to the output through the diode while the switch is off. With a 1:$n$ transformer "
            "($n = N_s/N_p$) the secondary voltage reflects to the primary divided by $n$, and the secondary "
            "current is the primary-referred magnetizing current divided by $n$."
        ),
        intro_ko=(
            "플라이백은 스위치 온 구간에 자화 인덕턴스 $L_M$에 에너지를 저장하고, 오프 구간에 다이오드를 "
            "통해 출력으로 내보낸다. 1:$n$ 변압기($n = N_s/N_p$)에서 2차측 전압은 $n$으로 나누어 1차측에 반사되고, "
            "2차측 전류는 1차측 환산 자화 전류를 $n$으로 나눈 값이다."
        ),
    )
    D, Vg, V, VD, n = S("D"), S("V_g"), S("V"), S("V_D"), S("n")
    LM, R, Ts, fs, K = S("L_M"), S("R"), S("T_s"), S("f_s"), S("K")
    D2 = d.local("D_2", "D_2", positive=True)
    ipk = d.local("i_pk", r"i_\mathrm{pk}", positive=True)
    E = d.local("E", "E", positive=True)

    # ------------------------------------------------------- DCM conversion
    pk = Vg * D * Ts / LM
    d.step(
        "On-interval: $V_g$ across $L_M$, so the magnetizing current rises from zero (DCM) to $i_\\mathrm{pk}$.",
        "온 구간: $L_M$ 양단에 $V_g$가 걸려 자화 전류가 0(DCM)에서 $i_\\mathrm{pk}$까지 증가한다.",
        sp.Eq(ipk, pk),
    )
    vs = sp.Eq(D * Vg + D2 * (-V / n), 0)
    d.step(
        "Volt-second balance on $L_M$: $V_g$ for $D T_s$, then the reflected output $-V/n$ for $D_2 T_s$.",
        "$L_M$의 전압-초 평형: $D T_s$ 동안 $V_g$, 이후 $D_2 T_s$ 동안 반사된 출력 $-V/n$.",
        vs,
    )
    D2_sol = sp.solve(vs, D2)[0]
    d.step("Solve for $D_2$.", "$D_2$를 구한다.", sp.Eq(D2, D2_sol))
    cb = sp.Eq((pk / n) * D2_sol / 2, V / R)
    d.step(
        "Charge balance: the secondary current starts at $i_\\mathrm{pk}/n$ and falls to zero over $D_2 T_s$; its "
        "average equals the load current $V/R$.",
        "전하 평형: 2차측 전류는 $i_\\mathrm{pk}/n$에서 시작해 $D_2 T_s$ 동안 0으로 감소하며, 그 평균이 부하 전류 $V/R$과 같다.",
        cb,
    )
    eqn = sp.Eq(cb.lhs.subs(LM, K * R * Ts / 2), cb.rhs)
    V_sol = positive_root(sp.solve(eqn, V), {D: 0.3, K: 0.05, Vg: 10.0, n: 2.0, R: 5.0, Ts: 1e-5})
    d.result(
        "flyback.dcm.M",
        sp.simplify(V_sol / Vg),
        "Substitute $L_M = K R T_s/2$ and solve for $V/V_g$; $n$ cancels.",
        "$L_M = K R T_s/2$를 대입해 $V/V_g$를 구한다. $n$은 소거된다.",
        S("M"),
    )

    # ----------------------------------------------------------- K_crit
    Dccm = sp.simplify(D2_sol.subs(V, V_sol))
    d.step(
        "The DCM demagnetizing interval, with the DCM output voltage substituted.",
        "DCM 출력 전압을 대입한 DCM 감자(demagnetizing) 구간.",
        sp.Eq(D2, Dccm),
    )
    kc = sp.solve(sp.Eq(D + Dccm, 1), K)
    if len(kc) != 1:
        raise ValueError(f"Kcrit.flyback: expected one solution, got {kc}")
    d.result(
        "Kcrit.flyback",
        sp.simplify(kc[0]),
        "The boundary is reached when the demagnetizing interval fills the rest of the period, $D + D_2 = 1$.",
        "감자 구간이 주기의 나머지를 모두 채울 때, 즉 $D + D_2 = 1$일 때 경계에 도달한다.",
        S("K_crit"),
    )

    # ------------------------------------------- fixed output: V_g,crit
    vs2 = sp.Eq(D * Vg + D2 * (-(V + VD) / n), 0)
    d.step(
        "Output held at $V$ (battery or regulated bus) and the diode dropping $V_D$: the reflected voltage is "
        "$-(V + V_D)/n$ during demagnetization.",
        "출력이 $V$로 고정(배터리 또는 정전압 버스)되고 다이오드 강하가 $V_D$이면 감자 구간의 반사 전압은 $-(V + V_D)/n$이다.",
        vs2,
    )
    D2_fixed = sp.solve(vs2, D2)[0]
    Vcrit = sp.solve(sp.Eq(D + D2_fixed, 1), Vg)[0]
    d.result(
        "flyback.V_crit",
        sp.simplify(Vcrit),
        "Setting $D + D_2 = 1$ gives the input voltage at which the converter enters CCM; above it CCM "
        "volt-second balance holds $V_g$ at this value.",
        "$D + D_2 = 1$로 두면 CCM에 진입하는 입력 전압을 얻는다. 그 이상에서는 CCM 전압-초 평형이 $V_g$를 이 값에 묶어 둔다.",
        S("V_gcrit"),
    )

    # --------------------------------------------------------- stresses
    vds = Vg + (V + VD) / n
    d.result(
        "flyback.Vds_off",
        vds,
        "While the diode conducts, the primary winding carries the reflected $(V + V_D)/n$ on top of $V_g$, "
        "so the off-state switch voltage is their sum (the leakage spike comes on top of this).",
        "다이오드 도통 중 1차 권선에는 반사 전압 $(V + V_D)/n$이 $V_g$ 위에 더해지므로 오프 상태 스위치 전압은 "
        "그 합이다(누설 스파이크는 여기에 추가된다).",
        S("V_DS"),
    )
    d.result(
        "flyback.Vds_clamped",
        sp.simplify(vds.subs(Vg, Vcrit)),
        "With the input pinned at $V_{g,\\mathrm{crit}}$ the off-state switch voltage simplifies.",
        "입력이 $V_{g,\\mathrm{crit}}$에 묶이면 오프 상태 스위치 전압이 간단해진다.",
        S("V_DS"),
    )
    d.result(
        "flyback.diode.VR",
        V + n * Vg,
        "While the switch is on the secondary winding voltage $n V_g$ adds to the output voltage across the "
        "reverse-biased diode.",
        "스위치 온 구간에는 2차 권선 전압 $n V_g$가 출력 전압에 더해져 역바이어스된 다이오드에 걸린다.",
        S("V_R"),
    )

    # ------------------------------------------- CCM current and ripples
    IM, dIM, dv, C = S("I_M"), S("Delta_i_M"), S("Delta_v"), S("C")
    cb_ccm = sp.Eq((1 - D) * IM / n, V / R)
    d.step(
        "CCM charge balance: while the diode conducts, for $(1 - D) T_s$, the secondary carries $I_M/n$ "
        "(small ripple); its average equals the load current $V/R$.",
        "CCM 전하 평형: 다이오드가 도통하는 $(1 - D) T_s$ 동안 2차 측에는 $I_M/n$이 흐르며(소리플 근사), "
        "그 평균이 부하 전류 $V/R$과 같다.",
        cb_ccm,
    )
    d.result("flyback.IM", sp.solve(cb_ccm, IM)[0], "Solve for $I_M$.", "$I_M$에 대해 푼다.", IM)
    rip = sp.Eq(2 * dIM, Vg * D * Ts / LM)
    d.step(
        "On-interval: $V_g$ across $L_M$ for $D T_s$, so the magnetizing current rises by twice the half-ripple "
        "$\\Delta i_M$.",
        "온 구간: $D T_s$ 동안 $L_M$ 양단에 $V_g$가 걸리므로 자화 전류는 리플 절반 $\\Delta i_M$의 두 배만큼 증가한다.",
        rip,
    )
    d.result("flyback.ripple.iM", sp.solve(rip, dIM)[0], "Solve for $\\Delta i_M$.", "$\\Delta i_M$에 대해 푼다.", dIM)
    ripv = sp.Eq(2 * dv, (V / R) * D * Ts / C)
    d.step(
        "While the switch is on the diode is off, so the capacitor alone supplies the load current $V/R$ for "
        "$D T_s$ and its voltage falls by twice the half-ripple $\\Delta v$.",
        "스위치가 켜져 있는 동안 다이오드는 꺼져 있으므로 커패시터 혼자 $D T_s$ 동안 부하 전류 $V/R$을 공급하고, "
        "그 전압은 리플 절반 $\\Delta v$의 두 배만큼 떨어진다.",
        ripv,
    )
    d.result("flyback.ripple.v", sp.solve(ripv, dv)[0], "Solve for $\\Delta v$.", "$\\Delta v$에 대해 푼다.", dv)

    # ------------------------------------------------ peak current, power
    d.result(
        "flyback.Ipk.dcm",
        sp.simplify(pk.subs(Ts, 1 / fs)),
        "The DCM peak magnetizing current, with $T_s = 1/f_s$.",
        "$T_s = 1/f_s$로 쓴 DCM 피크 자화 전류.",
        S("I_pk"),
    )
    energy = sp.Rational(1, 2) * LM * pk**2
    d.step(
        "Energy stored in $L_M$ at the end of each on-interval (all of it is delivered every cycle in DCM).",
        "매 온 구간 끝에 $L_M$에 저장되는 에너지(DCM에서는 매 주기 전부 전달된다).",
        sp.Eq(E, energy),
    )
    P = sp.simplify((energy / Ts).subs(Ts, 1 / fs))
    d.result(
        "dcm.P_in",
        P,
        "Power = energy per cycle × switching frequency; it depends on $V_g$, $D$, $L_M$, $f_s$ but not on the load.",
        "전력 = 주기당 에너지 × 스위칭 주파수. $V_g$, $D$, $L_M$, $f_s$에만 의존하고 부하와는 무관하다.",
        S("P"),
    )
    d.result(
        "lfr.R_in",
        sp.simplify(Vg**2 / P),
        "Since $P = V_g^2/R_\\mathrm{in}$ the input behaves as a resistance that dissipates nothing (a loss-free resistor).",
        "$P = V_g^2/R_\\mathrm{in}$이므로 입력은 아무것도 소산하지 않는 저항(무손실 저항)처럼 동작한다.",
        S("R_in"),
    )
    return d
