"""Measurement: the inductance an impedance meter reads when the winding's
capacitance is in parallel with its inductance.

References: Alexander & Sadiku (2017), Ch. 9 (impedances in parallel) and
Ch. 14 (resonance).
"""

from __future__ import annotations

import sympy as sp

from .common import Derivation, S


def derive() -> Derivation:
    d = Derivation(
        module="measurement",
        title="Measurement: inductance read near self-resonance",
        title_ko="측정: 자기 공진 근처에서 읽히는 인덕턴스",
        intro=(
            "A winding is an inductance with its turns' capacitance in parallel. An impedance meter divides the reactance it "
            "measures by $\\omega$ and reports that as the inductance."
        ),
        intro_ko=(
            "권선은 턴 사이 커패시턴스가 병렬로 붙은 인덕턴스이다. 임피던스 측정기는 측정한 리액턴스를 $\\omega$로 나누어 "
            "인덕턴스로 표시한다."
        ),
    )
    L, Cp, f, fsrf, Lapp = S("L"), S("C_p"), S("f"), S("f_srf"), S("L_app")
    w = d.local("omega", r"\omega", positive=True)
    Z = d.local("Z", "Z")
    d.step(
        "The inductance and the capacitance in parallel:",
        "병렬로 연결된 인덕턴스와 커패시턴스:",
        sp.Eq(Z, 1 / (1 / (sp.I * w * L) + sp.I * w * Cp)),
    )
    z = sp.simplify(1 / (1 / (sp.I * w * L) + sp.I * w * Cp))
    d.step(
        "which is a pure reactance,",
        "이는 순수 리액턴스이다.",
        sp.Eq(Z, z),
    )
    reading = sp.simplify(z / (sp.I * w))
    d.step(
        "so the meter reads the inductance $Z/(j\\omega)$:",
        "따라서 측정기는 $Z/(j\\omega)$를 인덕턴스로 읽는다.",
        sp.Eq(Lapp, reading),
    )
    d.step(
        "The self-resonant frequency (`passive.f_srf`) gives $\\omega^2 L C_p = (f/f_\\mathrm{srf})^2$:",
        "자기 공진 주파수(`passive.f_srf`)로 쓰면 $\\omega^2 L C_p = (f/f_\\mathrm{srf})^2$이다.",
        sp.Eq(fsrf, 1 / (2 * sp.pi * sp.sqrt(L * Cp))),
    )
    at_f = reading.subs(w, 2 * sp.pi * f).subs(Cp, 1 / (L * (2 * sp.pi * fsrf) ** 2))
    d.result(
        "meas.L_app",
        sp.simplify(at_f),
        "Substituting $\\omega = 2\\pi f$:",
        "$\\omega = 2\\pi f$를 대입하면:",
        Lapp,
    )
    return d
