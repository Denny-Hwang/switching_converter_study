"""Current-output high-side current-sense amplifier transfer function.

Reference: Analog Devices LTC6101/LTC6101HV data sheet (the amplifier forces
the sense voltage across R_IN; the resulting current flows through R_OUT).
"""

from __future__ import annotations

import sympy as sp

from .common import Derivation, S


def derive() -> Derivation:
    d = Derivation(
        module="sensing",
        title="Current-output shunt monitor",
        title_ko="전류 출력형 션트 모니터",
        intro=(
            "A current-output high-side monitor converts the small voltage across a shunt into a current, "
            "which an output resistor turns back into a ground-referenced voltage."
        ),
        intro_ko=(
            "전류 출력형 하이사이드 모니터는 션트 양단의 작은 전압을 전류로 바꾸고, 출력 저항이 이를 다시 "
            "접지 기준 전압으로 바꾼다."
        ),
    )
    I, Rs, Rin, Rout = S("I_SENSE"), S("R_SENSE"), S("R_IN"), S("R_OUT")
    Vs = d.local("V_SENSE", r"V_\mathrm{SENSE}", positive=True)
    Iout = d.local("I_OUT", r"I_\mathrm{OUT}", positive=True)
    d.step("Voltage across the shunt.", "션트 양단 전압.", sp.Eq(Vs, I * Rs))
    d.step(
        "The ideal amplifier forces the same voltage across $R_\\mathrm{IN}$, so the current through $R_\\mathrm{IN}$ is $V_\\mathrm{SENSE}/R_\\mathrm{IN}$.",
        "이상적 증폭기는 같은 전압을 $R_\\mathrm{IN}$ 양단에 걸어, $R_\\mathrm{IN}$을 흐르는 전류가 $V_\\mathrm{SENSE}/R_\\mathrm{IN}$이 된다.",
        sp.Eq(Iout, Vs / Rin),
    )
    d.result(
        "sense.current_out_monitor",
        I * Rs * Rout / Rin,
        "That current flows out through $R_\\mathrm{OUT}$: $V_\\mathrm{OUT} = I_\\mathrm{OUT} R_\\mathrm{OUT}$.",
        "그 전류가 $R_\\mathrm{OUT}$으로 흘러 나간다: $V_\\mathrm{OUT} = I_\\mathrm{OUT} R_\\mathrm{OUT}$.",
        S("V_OUT"),
    )
    return d
