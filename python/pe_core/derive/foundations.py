"""Refresher results used by the 00-foundations and 01-physics pages.

The inductor and capacitor under constant excitation and their stored
energy; impedance magnitudes, the R-C low-pass filter and self-resonance;
the Fourier series and rms value of a rectangular pulse train; the ripple
across a capacitor's series resistance; Ampère's law for an ungapped core;
and the ideal transformer.

The flux density in a linear material, B = mu_0 mu_r H, is the definition of
the relative permeability and is not derived here.

References: Alexander & Sadiku (2017), Ch. 6 (capacitors and inductors),
Ch. 9 (sinusoids and phasors), Ch. 11 (ac power analysis: rms value),
Ch. 13 (magnetically coupled circuits), Ch. 14 (frequency response),
Ch. 17 (the Fourier series); Erickson & Maksimović (2020), Ch. 6 (converter
circuits: the transformer model) and Ch. 10 (basic magnetics theory); TI
SLVA630A (output ripple of a buck regulator, including the ESR term).
"""

from __future__ import annotations

import sympy as sp

from .common import Derivation, S, symbolic_equal


def derive() -> Derivation:
    d = Derivation(
        module="foundations",
        title="Refreshers: reactive elements, impedance, Fourier series, magnetics, the ideal transformer",
        title_ko="기초 복습: 리액티브 소자, 임피던스, 푸리에 급수, 자기학, 이상적 변압기",
        intro=(
            "Circuit laws and magnetics that the converter pages build on. The element laws are integrated "
            "for constant excitation, impedances follow from the phasor form of the same laws, the Fourier "
            "coefficients and the rms value of a pulse train are computed over one period, and the ideal "
            "transformer follows from Faraday's and Ampère's laws with a lossless core of zero reluctance."
        ),
        intro_ko=(
            "컨버터 페이지들이 바탕으로 삼는 회로 법칙과 자기학이다. 소자 법칙을 일정한 여기 조건에서 적분하고, "
            "같은 법칙의 페이저 형태로부터 임피던스를 구하며, 한 주기에 걸쳐 펄스열의 푸리에 계수와 실효값을 "
            "계산한다. 이상적 변압기는 자기저항이 0인 무손실 코어에서 패러데이 법칙과 앙페르 법칙으로부터 얻는다."
        ),
    )
    L, C, t = S("L"), S("C"), S("t")
    V_L, I_C, I_L, V_C = S("V_L"), S("I_C"), S("I_L"), S("V_C")
    tau = d.local("tau", r"\tau", positive=True)
    i = d.local("i", "i", positive=True)
    v = d.local("v", "v", positive=True)

    # ------------------------------------------------------------ element laws
    d.step(
        "Inductor law: $v = L\\,\\mathrm{d}i/\\mathrm{d}t$. With a constant voltage $V_L$ the slope of the "
        "current is constant; integrate it over the interval $t$.",
        "인덕터 법칙은 $v = L\\,\\mathrm{d}i/\\mathrm{d}t$이다. 전압 $V_L$이 일정하면 전류의 기울기도 일정하므로, "
        "구간 $t$에 걸쳐 적분한다.",
        sp.Integral(V_L / L, (tau, 0, t)),
    )
    d.result("ind.di", sp.integrate(V_L / L, (tau, 0, t)), "Evaluate the integral.", "적분을 계산한다.", S("Delta_i"))
    d.step(
        "Capacitor law, the dual: $i = C\\,\\mathrm{d}v/\\mathrm{d}t$, integrated for a constant current $I_C$.",
        "쌍대인 커패시터 법칙 $i = C\\,\\mathrm{d}v/\\mathrm{d}t$를 일정한 전류 $I_C$에 대해 적분한다.",
        sp.Integral(I_C / C, (tau, 0, t)),
    )
    d.result("cap.dv", sp.integrate(I_C / C, (tau, 0, t)), "Evaluate the integral.", "적분을 계산한다.", S("Delta_v_C"))

    d.step(
        "Energy delivered to an inductor: $\\int v\\,i\\,\\mathrm{d}t = \\int L\\,i\\,\\mathrm{d}i$, from zero "
        "current to $I_L$.",
        "인덕터에 전달되는 에너지는 $\\int v\\,i\\,\\mathrm{d}t = \\int L\\,i\\,\\mathrm{d}i$이며, 전류 0에서 "
        "$I_L$까지 적분한다.",
        sp.Integral(L * i, (i, 0, I_L)),
    )
    d.result("ind.E", sp.integrate(L * i, (i, 0, I_L)), "Evaluate the integral.", "적분을 계산한다.", S("E_L"))
    d.step(
        "Energy delivered to a capacitor: $\\int v\\,i\\,\\mathrm{d}t = \\int C\\,v\\,\\mathrm{d}v$, from zero "
        "voltage to $V_C$.",
        "커패시터에 전달되는 에너지는 $\\int v\\,i\\,\\mathrm{d}t = \\int C\\,v\\,\\mathrm{d}v$이며, 전압 0에서 "
        "$V_C$까지 적분한다.",
        sp.Integral(C * v, (v, 0, V_C)),
    )
    d.result("cap.E", sp.integrate(C * v, (v, 0, V_C)), "Evaluate the integral.", "적분을 계산한다.", S("E_C"))

    # ------------------------------------------------------------ impedance
    f = S("f")
    w = 2 * sp.pi * f
    zl = sp.I * w * L
    zc = 1 / (sp.I * w * C)
    ZL = d.local("Z_Lc", r"Z_L", complex=True)
    ZC = d.local("Z_Cc", r"Z_C", complex=True)
    d.step(
        "In sinusoidal steady state $\\mathrm{d}/\\mathrm{d}t$ becomes multiplication by $j\\omega$, with "
        "$\\omega = 2\\pi f$. The inductor law gives the inductor's impedance.",
        "정현파 정상상태에서 $\\mathrm{d}/\\mathrm{d}t$는 $j\\omega$를 곱하는 것이 되며, $\\omega = 2\\pi f$이다. "
        "인덕터 법칙으로부터 인덕터의 임피던스를 얻는다.",
        sp.Eq(ZL, zl),
    )
    d.result("imp.ZL", sp.Abs(zl), "Its magnitude.", "그 크기.", S("Z_L"))
    d.step(
        "The capacitor law gives the capacitor's impedance.",
        "커패시터 법칙으로부터 커패시터의 임피던스를 얻는다.",
        sp.Eq(ZC, zc),
    )
    d.result("imp.ZC", sp.Abs(zc), "Its magnitude.", "그 크기.", S("Z_C"))

    # ------------------------------------------------------------ R-C low-pass filter
    R_f, C_f, f_c = S("R_f"), S("C_f"), S("f_c")
    G = d.local("G_rc", r"G(j\omega)", complex=True)
    g = (1 / (sp.I * w * C_f)) / (R_f + 1 / (sp.I * w * C_f))
    g = sp.simplify(g)
    d.step(
        "Unloaded R-C low-pass filter: the output is the capacitor's share of the divider formed by $R_f$ and "
        "the capacitor's impedance.",
        "부하가 없는 R-C 저역통과 필터에서 출력은 $R_f$와 커패시터 임피던스로 이루어진 분압기에서 커패시터가 "
        "차지하는 몫이다.",
        sp.Eq(G, g),
    )
    mag2 = sp.simplify(sp.Abs(g) ** 2)
    d.step("Squared magnitude.", "크기의 제곱.", sp.Eq(sp.Abs(G) ** 2, mag2))
    corner = [s for s in sp.solve(sp.Eq(mag2, sp.Rational(1, 2)), f) if s.is_positive]
    if len(corner) != 1:
        raise ValueError(f"rc.fc: expected one positive corner frequency, got {corner}")
    d.result(
        "rc.fc",
        corner[0],
        "The corner (-3 dB) frequency is where the squared magnitude falls to one half.",
        "차단(-3 dB) 주파수는 크기의 제곱이 1/2로 떨어지는 주파수이다.",
        f_c,
    )
    gain = sp.sqrt(mag2.subs(R_f, 1 / (2 * sp.pi * f_c * C_f)))
    d.result(
        "rc.gain",
        sp.simplify(gain),
        "Write the magnitude with $f_c$ in place of $R_f C_f$.",
        "$R_f C_f$ 대신 $f_c$로 크기를 나타낸다.",
        S("G_lp"),
    )

    # ------------------------------------------------------------ self-resonance
    C_p = S("C_p")
    Y = d.local("Y_p", "Y", complex=True)
    y = 1 / (sp.I * w * L) + sp.I * w * C_p
    d.step(
        "An inductance with a parasitic capacitance in parallel: the admittances add.",
        "기생 커패시턴스가 병렬로 붙은 인덕턴스에서는 어드미턴스가 더해진다.",
        sp.Eq(Y, y),
    )
    srf = [s for s in sp.solve(sp.Eq(y, 0), f) if s.is_positive]
    if len(srf) != 1:
        raise ValueError(f"passive.f_srf: expected one positive root, got {srf}")
    d.result(
        "passive.f_srf",
        srf[0],
        "At resonance the admittance is zero (the impedance is infinite for the lossless model).",
        "공진에서 어드미턴스는 0이다(무손실 모델에서는 임피던스가 무한대).",
        S("f_srf"),
    )

    # ------------------------------------------------------------ Fourier series of a pulse train
    V_pk, h, D = S("V_pk"), S("h"), S("D")
    T = d.local("T_p", "T", positive=True)
    x = d.local("t_p", "t", positive=True)
    wh = 2 * sp.pi * h / T
    a_cos = sp.simplify(2 / T * sp.integrate(V_pk * sp.cos(wh * x), (x, 0, D * T)))
    b_sin = sp.simplify(2 / T * sp.integrate(V_pk * sp.sin(wh * x), (x, 0, D * T)))
    ac = d.local("a_c", r"a_{h,\cos}", real=True)
    bs = d.local("b_s", r"a_{h,\sin}", real=True)
    d.step(
        "A pulse train of height $V_\\mathrm{pk}$ and width $D T$ in every period $T$. Its cosine coefficient "
        "for the harmonic $h$:",
        "주기 $T$마다 높이 $V_\\mathrm{pk}$, 폭 $D T$인 펄스열이다. $h$차 고조파의 코사인 계수는",
        sp.Eq(ac, a_cos),
    )
    d.step("and its sine coefficient:", "사인 계수는", sp.Eq(bs, b_sin))
    amp2 = sp.simplify(a_cos**2 + b_sin**2)
    target = 2 * V_pk * sp.sin(sp.pi * h * D) / (sp.pi * h)
    if not symbolic_equal(amp2, target**2):
        raise ValueError("fourier.pulse.harm: the squared amplitude does not reduce to (2 V sin(pi h D)/(pi h))^2")
    d.step(
        "The squared amplitude of the harmonic is the sum of their squares; with "
        "$1 - \\cos 2x = 2\\sin^2 x$ it is a perfect square.",
        "고조파 진폭의 제곱은 두 계수의 제곱의 합이며, $1 - \\cos 2x = 2\\sin^2 x$를 쓰면 완전제곱이 된다.",
        sp.Eq(S("a_h") ** 2, target**2),
    )
    d.result(
        "fourier.pulse.harm",
        sp.sqrt(target**2),
        "Take the non-negative root.",
        "음이 아닌 제곱근을 취한다.",
        S("a_h"),
    )
    ms = sp.simplify(1 / T * sp.integrate(V_pk**2, (x, 0, D * T)))
    d.step(
        "The mean square over one period: the pulse contributes $V_\\mathrm{pk}^2$ during $D T$.",
        "한 주기의 제곱 평균: 펄스는 $D T$ 동안 $V_\\mathrm{pk}^2$를 기여한다.",
        sp.Eq(S("V_rms") ** 2, ms),
    )
    d.result("fourier.pulse.rms", sp.sqrt(ms), "The rms value is its square root.", "실효값은 그 제곱근이다.", S("V_rms"))

    # ------------------------------------------------------------ ESR ripple
    R_esr, dipp = S("R_esr"), S("Delta_i_pp")
    ic_max = d.local("i_max", r"i_{C,\mathrm{max}}", real=True)
    ic_min = d.local("i_min", r"i_{C,\mathrm{min}}", real=True)
    d.step(
        "The ripple current flows through the capacitor's series resistance, whose voltage follows the current "
        "at every instant. The difference between its extremes:",
        "리플 전류는 커패시터의 직렬 저항을 흐르며, 그 전압은 매 순간 전류를 따른다. 최댓값과 최솟값의 차는",
        sp.Eq(S("Delta_v_esr"), R_esr * ic_max - R_esr * ic_min),
    )
    d.result(
        "cap.esr.ripple",
        sp.factor(R_esr * ic_max - R_esr * ic_min).subs(ic_max - ic_min, dipp),
        "The current's peak-to-peak value is its maximum minus its minimum.",
        "전류의 피크-피크 값은 최댓값에서 최솟값을 뺀 값이다.",
        S("Delta_v_esr"),
    )

    # ------------------------------------------------------------ Ampère's law
    N, I_w, l_e, H = S("N"), S("I_w"), S("l_e"), S("H_mag")
    amp = sp.Eq(H * l_e, N * I_w)
    d.step(
        "Ampère's law around the core: the line integral of $H$ equals the enclosed current, $N$ turns each "
        "carrying $I_w$. In an ungapped core with a uniform field it is $H$ times the path length.",
        "코어를 한 바퀴 도는 앙페르 법칙: $H$의 선적분은 감싸인 전류, 즉 각각 $I_w$가 흐르는 $N$턴과 같다. "
        "균일한 자계를 갖는 공극이 없는 코어에서 선적분은 $H$와 자로 길이의 곱이다.",
        amp,
    )
    d.result("mag.H_ampere", sp.solve(amp, H)[0], "Solve for $H$.", "$H$에 대해 푼다.", H)

    # ------------------------------------------------------------ ideal transformer
    n, V_1, I_1 = S("n"), S("V_1"), S("I_1")
    N_p = d.local("N_p", "N_p", positive=True)
    N_s = d.local("N_s", "N_s", positive=True)
    dphi = d.local("dphi", r"\mathrm{d}\Phi/\mathrm{d}t", positive=True)
    I_2 = d.local("I_2x", "I_2", positive=True)
    V_2x = d.local("V_2x", "V_2", positive=True)
    d.step(
        "Faraday's law for two windings on one core: each winding voltage is its number of turns times the rate "
        "of change of the common flux. For the primary:",
        "한 코어에 감긴 두 권선에 대한 패러데이 법칙: 각 권선 전압은 턴 수에 공통 자속의 변화율을 곱한 값이다. "
        "1차 권선은",
        sp.Eq(V_1, N_p * dphi),
    )
    d.step("and for the secondary:", "2차 권선은", sp.Eq(V_2x, N_s * dphi))
    ratio = sp.simplify((N_s * dphi) / (N_p * dphi))
    d.result(
        "xfmr.V2",
        sp.simplify(ratio * V_1).subs(N_s, n * N_p),
        "Divide the two: the flux term cancels, and the ratio of the turns is $n$ (1:n convention).",
        "두 식을 나누면 자속 항이 소거되고, 턴 수의 비가 $n$이 된다(1:n 규약).",
        S("V_2"),
    )
    mmf = sp.Eq(N_p * I_1 - N_s * I_2, 0)
    d.step(
        "Ampère's law with a core of zero reluctance (ideal): the net magnetomotive force is zero.",
        "자기저항이 0인 코어(이상적)에서 앙페르 법칙: 순 기자력은 0이다.",
        mmf,
    )
    i2 = sp.solve(mmf, I_2)[0]
    d.result(
        "xfmr.I2",
        sp.simplify(i2.subs(N_s, n * N_p)),
        "Solve for the secondary current, with $N_s = n N_p$.",
        "$N_s = n N_p$로 놓고 2차 전류에 대해 푼다.",
        S("I_2"),
    )
    return d
