"""Current sensing with a shunt: the sense voltage, current-output and
voltage-output amplifiers, the offset-equivalent current and the pad error of
a shunt without a Kelvin connection.

References: Analog Devices LTC6101/LTC6101HV data sheet (the amplifier forces
the sense voltage across R_IN; the resulting current flows through R_OUT; the
offset adds directly to the sense voltage); TI INAx181 data sheet (fixed-gain
voltage output with a REF pin); O'Sullivan, Analog Dialogue 46 (2012) (pad and
solder resistance of milliohm shunts).
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
    Vs = S("V_SENSE")
    Iout = d.local("I_OUT", r"I_\mathrm{OUT}", positive=True)
    d.result(
        "sense.burden",
        I * Rs,
        "Ohm's law across the shunt: the signal, and the voltage the shunt takes from the measured circuit.",
        "션트 양단에 옴의 법칙을 적용한다: 신호이자 션트가 측정 대상 회로에서 빼앗는 전압.",
        Vs,
    )
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

    G, Vref = S("G_sense"), S("V_REF")
    d.result(
        "sense.voltage_out_monitor",
        G * I * Rs + Vref,
        "A voltage-output amplifier multiplies the sense voltage by its fixed gain $G$ and adds the voltage on its "
        "REF pin, which sets the output at zero current.",
        "전압 출력형 증폭기는 센스 전압에 고정 이득 $G$를 곱하고, 전류가 0일 때의 출력을 정하는 REF 핀 전압을 더한다.",
        S("V_OUT"),
    )

    Vos = S("V_OS")
    Imeas = d.local("I_meas", r"I_\mathrm{meas}", positive=True)
    d.step(
        "An input offset voltage adds directly to the sense voltage, so the output of either amplifier reads the "
        "current",
        "입력 오프셋 전압은 센스 전압에 그대로 더해지므로, 두 증폭기 모두 출력이 다음 전류를 읽는다.",
        sp.Eq(Imeas, (I * Rs + Vos) / Rs),
    )
    d.result(
        "sense.offset_current",
        sp.expand((I * Rs + Vos) / Rs) - I,
        "The reading exceeds the current by the offset over the sense resistor, whatever the current.",
        "측정값은 전류와 관계없이 오프셋을 센스 저항으로 나눈 만큼 실제 전류보다 크다.",
        S("I_OSeq"),
    )

    Rpad = S("R_pad")
    d.step(
        "Without a Kelvin connection the sense connections sit beyond the pads and solder joints, whose resistance "
        "$R_\\mathrm{pad}$ carries the same current; the reading, scaled by $R_\\mathrm{SENSE}$, is",
        "켈빈 연결이 없으면 센스 연결이 같은 전류가 흐르는 패드와 납땜 저항 $R_\\mathrm{pad}$ 너머에 있으므로, "
        "$R_\\mathrm{SENSE}$로 환산한 측정값은 다음과 같다.",
        sp.Eq(Imeas, I * (Rs + Rpad) / Rs),
    )
    d.result(
        "sense.pad_error",
        sp.simplify((I * (Rs + Rpad) / Rs - I) / I),
        "Its relative error: independent of the current, and larger the smaller the shunt.",
        "상대 오차: 전류와 무관하며, 션트가 작을수록 커진다.",
        S("eps_pad"),
    )
    d.step(
        "With both the offset and the pad resistance, the reading is",
        "오프셋과 패드 저항이 함께 있으면 측정값은 다음과 같다.",
        sp.Eq(Imeas, (I * (Rs + Rpad) + Vos) / Rs),
    )
    d.result(
        "sense.rel_error",
        sp.simplify(((I * (Rs + Rpad) + Vos) / Rs - I) / I),
        "Its relative error is the sum of the two, with no cross term: the offset's share falls as $1/I_\\mathrm{SENSE}$, "
        "the pad's share stays.",
        "상대 오차는 교차 항 없이 두 몫의 합이다: 오프셋의 몫은 $1/I_\\mathrm{SENSE}$로 줄고 패드의 몫은 그대로다.",
        S("eps_I"),
    )

    Rf, Cf = S("R_f"), S("C_f")
    s = d.local("s", "s")
    VA = d.local("V_A", r"V_A")
    VB = d.local("V_B", r"V_B")
    node_a = sp.Eq(Iout, VA / Rout + (VA - VB) / Rf)
    node_b = sp.Eq((VA - VB) / Rf, s * Cf * VB)
    d.step(
        "A current-output amplifier drives its current $I_\\mathrm{OUT}$ into $R_\\mathrm{OUT}$ at node A. An R-C filter "
        "follows: $R_f$ from node A to node B, and $C_f$ from node B to ground, with nothing else loading node B. "
        "The current balance at node A (Laplace domain):",
        "전류 출력형 증폭기는 노드 A에서 전류 $I_\\mathrm{OUT}$을 $R_\\mathrm{OUT}$으로 흘린다. 그 뒤에 R-C 필터가 "
        "이어진다: $R_f$가 노드 A와 노드 B 사이에, $C_f$가 노드 B와 접지 사이에 있고, 노드 B에는 다른 부하가 없다. "
        "노드 A의 전류 평형(라플라스 영역):",
        node_a,
    )
    d.step("and at node B:", "노드 B에서는 다음과 같다.", node_b)
    sol = sp.solve([node_a, node_b], [VA, VB], dict=True)[0]
    H = sp.factor(sol[VB] / Iout)
    d.step(
        "Solving for the capacitor's voltage gives a single pole; at dc the output is still $I_\\mathrm{OUT} R_\\mathrm{OUT}$:",
        "커패시터 전압에 대해 풀면 극점이 하나이며, 직류에서 출력은 그대로 $I_\\mathrm{OUT} R_\\mathrm{OUT}$이다.",
        sp.Eq(VB / Iout, H),
    )
    # the pole's time constant, divided by the capacitance, is the resistance the capacitor sees
    (pole,) = sp.solve(sp.denom(sp.together(H)), s)
    d.result(
        "sense.filter_R",
        sp.simplify(-1 / (pole * Cf)),
        "The pole's time constant is $C_f (R_\\mathrm{OUT} + R_f)$: the capacitor sees $R_\\mathrm{OUT}$ in series with "
        "$R_f$. $R_\\mathrm{OUT}$ is the Thevenin resistance of the current source it loads.",
        "그 극점의 시정수는 $C_f (R_\\mathrm{OUT} + R_f)$이다: 커패시터는 $R_f$와 직렬인 $R_\\mathrm{OUT}$을 본다. "
        "$R_\\mathrm{OUT}$은 자신이 부하로 걸린 전류원의 테브난 저항이다.",
        S("R_filt"),
    )
    return d
