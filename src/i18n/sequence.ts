/**
 * The simulator's operating-mode view (SequenceView): what each mode is,
 * what each element is called and what its state means, and a description of
 * each mode per topology, in English and Korean. `{x}` placeholders are
 * filled in by the view. A test (src/i18n/sequence.test.ts) requires a text
 * for every mode, element and state the simulator can produce.
 */

type Text = Record<string, string>;

const en: Text = {
  title: 'Operating modes',
  intro:
    'One switching period, mode by mode, the way papers describe a converter. Pick a mode, or click on the charts: the circuit shows which parts carry current and which way it flows (two arrowheads where it reverses within the mode), the table what every element does, and the shaded band on the charts where the mode lies.',
  mode: 'Mode {k}',
  modeShort: 'M{k}',
  modeRange: 'Mode {k}: {t0} to {t1} ({dt})',
  element: 'Element',
  state: 'State',
  current: 'Current: start → end (average)',
  voltage: 'Voltage: start → end (average)',
  reverses: 'reverses at {t}',
  diagram: 'Circuit in mode {k}: the branches that carry current are coloured, arrows show which way it flows',
  legendActive: 'carries current',
  legendIdle: 'no current',
  rest: 'Nothing moves in this steady state: every current is zero (to rounding), so there are no operating modes to show.',
  tableNote:
    "Each current is positive in the direction of its element's arrow on the circuit, the direction of its average current in the mode; a negative value flows against the arrow. A current below a thousandth of its scale (in the switching cell, the cell's largest current in the mode; in the load and the source, the element's own largest over the period) counts as none and is shown as zero. The inductor's voltage includes the drop across its winding resistance.",

  // what each mode is, in the mode strip
  'kind.on': 'switch on',
  'kind.off': 'switch off',
  'kind.idle': 'idle',
  'kind.rev': 'reverse current',
  'kind.onRev': 'on, body diode',
  'kind.rise': 'voltage rise',
  'kind.ring': 'ringing',
  'kind.forward.off': 'reset and freewheeling',
  'kind.onL0': 'rectifier blocked',
  'kind.offL0': 'reset only',
  'kind.offM0': 'freewheeling',

  // elements
  'el.S': 'Switch S',
  'el.Cn': 'Node capacitance C_node',
  'el.D': 'Diode D',
  'el.L': 'Inductor L',
  'el.forward.L': 'Output inductor L',
  'el.LM': 'Magnetizing inductance L_M',
  'el.W1': 'Primary winding N_p (ideal)',
  'el.W2': 'Secondary winding N_s',
  'el.W3': 'Reset winding N_r',
  'el.D1': 'Rectifier diode D_1',
  'el.D2': 'Freewheeling diode D_2',
  'el.D3': 'Reset diode D_3',
  'el.C': 'Output capacitor C',
  'el.R': 'Load resistor R',
  'el.B': 'Battery (V_b behind R_b)',
  'el.V': 'Fixed output V',
  'el.Vg': 'Input V_g',
  'el.Voc': 'Source V_oc',
  'el.Rs': 'Source resistance R_s',
  'el.Cbus': 'Bus capacitor C_bus',

  // states in the table
  'st.on': 'on',
  'st.onBodyDiode': 'on; its body diode carries the current',
  'st.bodyDiode': 'off; its body diode conducts',
  'st.off': 'off (blocking)',
  'st.conducting': 'conducting',
  'st.blocking': 'blocking (reverse biased)',
  'st.storing': 'current growing: storing energy',
  'st.releasing': 'current shrinking: releasing energy',
  'st.storeRelease': 'current grows, then shrinks: stores, then releases energy',
  'st.releaseStore': 'current shrinks, then grows: releases, then stores energy',
  'st.reversing': 'current reverses direction',
  'st.ringing': 'ringing',
  'st.zero': 'no current',
  'st.steady': 'constant current',
  'st.charging': 'charging',
  'st.discharging': 'discharging',
  'st.chargeDischarge': 'charging, then discharging',
  'st.dischargeCharge': 'discharging, then charging',
  'st.vsource.delivering': 'delivering power',
  'st.vsource.absorbing': 'taking energy back',
  'st.fixed.absorbing': 'absorbing power',
  'st.fixed.delivering': 'delivering power',
  'st.alternating': 'current changes direction: power flows both ways',
  'st.idle': 'no current',

  // states on the drawing (short)
  'short.on': 'ON',
  'short.onBodyDiode': 'ON, body diode',
  'short.bodyDiode': 'body diode',
  'short.off': 'OFF',
  'short.conducting': 'on',
  'short.blocking': 'off',
  'short.storing': '↑ stores',
  'short.releasing': '↓ releases',
  'short.storeRelease': 'stores → releases',
  'short.releaseStore': 'releases → stores',
  'short.reversing': 'reverses',
  'short.ringing': 'rings',
  'short.zero': '0',
  'short.steady': 'constant',
  'short.charging': 'charging',
  'short.discharging': 'discharging',
  'short.chargeDischarge': 'charge → discharge',
  'short.dischargeCharge': 'discharge → charge',
  'short.vsource.delivering': 'supplies',
  'short.vsource.absorbing': 'takes back',
  'short.fixed.absorbing': 'absorbs',
  'short.fixed.delivering': 'supplies',
  'short.alternating': 'both ways',
  'short.idle': '',

  // what happens in each mode: the circuit (which parts conduct, what the inductor is connected across),
  // true whatever the load and the operating point; the energy sentences below follow from the states
  'desc.buck.on': 'S conducts and D blocks: L lies between the input and the output, and sees the input voltage minus the output voltage.',
  'desc.buck.off': "S is off: L's current flows on through D, which conducts, and L sees the output voltage plus the diode drop in reverse.",
  'desc.buck.idle': "L's current is zero (DCM): S and D are both off.",
  'desc.boost.on': "S conducts and connects L's output end to ground: L sees the input voltage. D blocks.",
  'desc.boost.off': 'S is off: the input and L drive the current through D into the output, and L sees the input voltage minus the output voltage and the diode drop.',
  'desc.boost.idle': "L's current is zero (DCM): S and D are both off.",
  'desc.buckboost.on': 'S conducts: L sees the input voltage. D blocks.',
  'desc.buckboost.off': "S is off: L's current flows on through D into the output, whose voltage is inverted, and L sees the output voltage plus the diode drop in reverse.",
  'desc.buckboost.idle': "L's current is zero (DCM): S and D are both off.",
  'desc.twoSwitch.rev': "S is off and L's current is negative: it flows back to the input through the body diode of S, which conducts at zero volts, and L sees the input voltage.",
  'desc.twoSwitch.onRev':
    "S is on, but L's current is negative: it flows back to the input through the body diode of S, which conducts at zero volts and so takes it from the switch's resistance. L sees the input voltage.",
  'desc.buck.rev':
    "S is off and L's current is negative: it flows from the output back to the input through the body diode of S, at zero volts, and L sees the input voltage minus the output voltage.",
  'desc.buck.onRev':
    "S is on, but L's current is negative: it flows from the output back to the input through the body diode of S, which conducts at zero volts and so takes it from the switch's resistance. L sees the input voltage minus the output voltage.",
  'desc.twoSwitch.rise': "S has just turned off: L's current charges C_node, the capacitance across S, and the switch voltage rises until D takes over.",
  'desc.twoSwitch.riseRing':
    "S has just turned off: L's current charges C_node, the capacitance across S, and the switch voltage rises. The current falls to zero before the switch voltage reaches D's turn-on voltage, so D stays off.",
  'desc.twoSwitch.riseCut': "S has just turned off: L's current charges C_node, the capacitance across S, and the switch voltage rises until S turns on again.",
  'desc.twoSwitch.ring': 'D is off: L rings with C_node. Whenever the ringing would take the switch voltage below zero, the body diode of S clamps it there.',
  'desc.flyback.on':
    "S conducts: the primary winding sees the input voltage. The secondary's dot is at its lower end, so D is reverse biased and no current flows in the secondary.",
  'desc.flyback.off':
    'S is off: the magnetizing current moves to the secondary, where D carries it divided by n, and the output voltage plus the diode drop, reflected to the primary, is across L_M in reverse.',
  'desc.flyback.idle': 'The magnetizing current is zero (DCM): S and D are both off.',
  'desc.flyback.rev': 'S is off and the magnetizing current is negative: it returns to the input through the body diode of S, and the primary sees the input voltage.',
  'desc.flyback.onRev':
    'S is on, but the magnetizing current is negative: it returns to the input through the body diode of S, at zero volts, and the primary sees the input voltage. D blocks.',
  'desc.flyback.rise': 'S has just turned off: the magnetizing current charges C_node, and the switch voltage rises until D takes over.',
  'desc.flyback.riseRing':
    "S has just turned off: the magnetizing current charges C_node, and the switch voltage rises. The current falls to zero before the switch voltage reaches D's turn-on voltage, so D stays off.",
  'desc.flyback.riseCut': 'S has just turned off: the magnetizing current charges C_node, and the switch voltage rises until S turns on again.',
  'desc.flyback.ring': 'D is off: L_M rings with C_node. Whenever the switch voltage would go below zero, the body diode of S clamps it there.',
  'desc.forward.on':
    "S conducts: the primary sees the input voltage, and the secondary's n times that drives the current through D_1 and L into the output. D_2 and the reset diode D_3 block.",
  'desc.forward.off':
    "S is off: the magnetizing current flows through the reset winding and D_3 back into the input, resetting the core, and S blocks the input voltage plus the reset winding's voltage reflected to the primary. L freewheels through D_2.",
  'desc.forward.offM0': 'The core has reset: the magnetizing current is zero and D_3 blocks. L freewheels through D_2.',
  'desc.forward.offL0': "L's current is zero and D_2 blocks, while the core resets through D_3.",
  'desc.forward.onL0': 'S conducts, but the rectifier blocks: the output is above n times the input voltage less the diode drop, so only the magnetizing current flows.',
  'desc.forward.idle': "The core has reset and L's current is zero: the diodes block.",

  // what each energy-storing element and each source does in the mode, from its state in the table
  'src.Vg': 'The input',
  'src.Voc': 'The source',
  'say.inductor.storing': "{L}'s current grows: it stores energy.",
  'say.inductor.releasing': "{L}'s current shrinks: it releases energy.",
  'say.inductor.storeRelease': "{L}'s current grows, then shrinks: it stores energy, then releases it.",
  'say.inductor.releaseStore': "{L}'s current shrinks, then grows: it releases energy, then stores it again.",
  'say.inductor.steady': "{L}'s current stays constant.",
  'say.inductor.reversing': "{L}'s current reverses direction.",
  'say.inductor.ringing': "{L}'s current rings, changing direction.",
  'say.inductor.zero': '{L} carries no current.',
  'say.capacitor.charging': '{C} charges.',
  'say.capacitor.discharging': '{C} discharges.',
  'say.capacitor.chargeDischarge': '{C} charges, then discharges.',
  'say.capacitor.dischargeCharge': '{C} discharges, then charges.',
  'say.capacitor.ringing': "{C}'s current rings, changing direction.",
  'say.capacitor.idle': '{C} carries no current.',
  'say.battery.charging': 'The battery charges.',
  'say.battery.discharging': 'The battery discharges.',
  'say.battery.chargeDischarge': 'The battery charges, then discharges.',
  'say.battery.dischargeCharge': 'The battery discharges, then charges.',
  'say.battery.ringing': "The battery's current rings, changing direction.",
  'say.battery.idle': 'The battery carries no current.',
  'say.fixed.absorbing': 'The fixed output absorbs power.',
  'say.fixed.delivering': 'The fixed output delivers power.',
  'say.fixed.alternating': "The fixed output's current changes direction.",
  'say.fixed.idle': 'The fixed output carries no current.',
  'say.vsource.delivering': '{src} delivers power.',
  'say.vsource.absorbing': '{src} takes energy back.',
  'say.vsource.alternating': "{src}'s current changes direction.",
  'say.vsource.idle': '{src} supplies nothing.',
};

const ko: Text = {
  title: '동작 모드',
  intro:
    '논문이 컨버터를 설명하듯 한 스위칭 주기를 모드별로 나누어 보여 줍니다. 모드를 고르거나 그래프를 클릭하면, 회로도는 어느 부분에 전류가 흐르고 어느 방향으로 흐르는지(모드 안에서 방향이 바뀌면 양쪽 화살표)를, 표는 각 소자가 하는 일을, 그래프의 음영은 그 모드의 구간을 보여 줍니다.',
  mode: '모드 {k}',
  modeShort: 'M{k}',
  modeRange: '모드 {k}: {t0} ~ {t1} ({dt})',
  element: '소자',
  state: '상태',
  current: '전류: 시작 → 끝 (평균)',
  voltage: '전압: 시작 → 끝 (평균)',
  reverses: '{t}에서 방향이 바뀜',
  diagram: '모드 {k}의 회로: 전류가 흐르는 가지는 색으로, 흐르는 방향은 화살표로 표시합니다',
  legendActive: '전류가 흐름',
  legendIdle: '전류 없음',
  rest: '이 정상상태에서는 아무것도 움직이지 않습니다. 모든 전류가 (반올림 오차 수준에서) 0이므로 보여 줄 동작 모드가 없습니다.',
  tableNote:
    '각 전류는 회로도에서 그 소자의 화살표 방향, 즉 모드 안 평균 전류의 방향이 양수이며, 음수는 화살표 반대 방향으로 흐르는 전류입니다. 기준 크기(스위칭 셀에서는 그 모드 동안 셀의 최대 전류, 부하와 전원 쪽에서는 주기 동안 그 소자의 최대 전류)의 1000분의 1보다 작은 전류는 흐르지 않는 것으로 보고 0으로 표시합니다. 인덕터 전압에는 권선 저항의 전압 강하가 포함됩니다.',

  'kind.on': '스위치 온',
  'kind.off': '스위치 오프',
  'kind.idle': '휴지',
  'kind.rev': '역전류',
  'kind.onRev': '온, 바디 다이오드',
  'kind.rise': '전압 상승',
  'kind.ring': '링잉',
  'kind.forward.off': '리셋과 환류',
  'kind.onL0': '정류기 차단',
  'kind.offL0': '리셋만',
  'kind.offM0': '환류',

  'el.S': '스위치 S',
  'el.Cn': '노드 커패시턴스 C_node',
  'el.D': '다이오드 D',
  'el.L': '인덕터 L',
  'el.forward.L': '출력 인덕터 L',
  'el.LM': '자화 인덕턴스 L_M',
  'el.W1': '1차 권선 N_p(이상적)',
  'el.W2': '2차 권선 N_s',
  'el.W3': '리셋 권선 N_r',
  'el.D1': '정류 다이오드 D_1',
  'el.D2': '환류 다이오드 D_2',
  'el.D3': '리셋 다이오드 D_3',
  'el.C': '출력 커패시터 C',
  'el.R': '부하 저항 R',
  'el.B': '배터리(R_b 뒤의 V_b)',
  'el.V': '고정 출력 V',
  'el.Vg': '입력 V_g',
  'el.Voc': '전원 V_oc',
  'el.Rs': '전원 저항 R_s',
  'el.Cbus': '버스 커패시터 C_bus',

  'st.on': '온',
  'st.onBodyDiode': '온, 바디 다이오드로 전류가 흐름',
  'st.bodyDiode': '오프, 바디 다이오드 도통',
  'st.off': '오프(차단)',
  'st.conducting': '도통',
  'st.blocking': '차단(역바이어스)',
  'st.storing': '전류 증가: 에너지 저장',
  'st.releasing': '전류 감소: 에너지 방출',
  'st.storeRelease': '전류가 커졌다가 줄어듦: 저장 후 방출',
  'st.releaseStore': '전류가 줄었다가 커짐: 방출 후 저장',
  'st.reversing': '전류 방향이 바뀜',
  'st.ringing': '링잉',
  'st.zero': '전류 없음',
  'st.steady': '일정한 전류',
  'st.charging': '충전',
  'st.discharging': '방전',
  'st.chargeDischarge': '충전 후 방전',
  'st.dischargeCharge': '방전 후 충전',
  'st.vsource.delivering': '전력 공급',
  'st.vsource.absorbing': '에너지 회수',
  'st.fixed.absorbing': '전력 흡수',
  'st.fixed.delivering': '전력 공급',
  'st.alternating': '전류 방향이 바뀜: 전력이 양방향으로 흐름',
  'st.idle': '전류 없음',

  'short.on': '온',
  'short.onBodyDiode': '온, 바디 다이오드',
  'short.bodyDiode': '바디 다이오드',
  'short.off': '오프',
  'short.conducting': '도통',
  'short.blocking': '차단',
  'short.storing': '↑ 저장',
  'short.releasing': '↓ 방출',
  'short.storeRelease': '저장 → 방출',
  'short.releaseStore': '방출 → 저장',
  'short.reversing': '방향 바뀜',
  'short.ringing': '링잉',
  'short.zero': '0',
  'short.steady': '일정',
  'short.charging': '충전',
  'short.discharging': '방전',
  'short.chargeDischarge': '충전 → 방전',
  'short.dischargeCharge': '방전 → 충전',
  'short.vsource.delivering': '공급',
  'short.vsource.absorbing': '회수',
  'short.fixed.absorbing': '흡수',
  'short.fixed.delivering': '공급',
  'short.alternating': '양방향',
  'short.idle': '',

  'desc.buck.on': 'S가 도통하고 D는 차단합니다. L은 입력과 출력 사이에 있으며, 입력 전압에서 출력 전압을 뺀 전압이 걸립니다.',
  'desc.buck.off': 'S가 꺼져 있습니다. L의 전류는 도통하는 D를 통해 계속 흐르고, L에는 출력 전압에 다이오드 전압 강하를 더한 전압이 거꾸로 걸립니다.',
  'desc.buck.idle': 'L의 전류가 0입니다(DCM). S와 D가 모두 꺼져 있습니다.',
  'desc.boost.on': 'S가 도통하여 L의 출력 쪽 끝을 접지에 연결합니다. L에는 입력 전압이 걸립니다. D는 차단합니다.',
  'desc.boost.off': 'S가 꺼져 있습니다. 입력과 L이 D를 통해 출력으로 전류를 밀어 넣고, L에는 입력 전압에서 출력 전압과 다이오드 전압 강하를 뺀 전압이 걸립니다.',
  'desc.boost.idle': 'L의 전류가 0입니다(DCM). S와 D가 모두 꺼져 있습니다.',
  'desc.buckboost.on': 'S가 도통합니다. L에는 입력 전압이 걸립니다. D는 차단합니다.',
  'desc.buckboost.off': 'S가 꺼져 있습니다. L의 전류가 D를 통해 전압이 반전된 출력으로 계속 흐르고, L에는 출력 전압에 다이오드 전압 강하를 더한 전압이 거꾸로 걸립니다.',
  'desc.buckboost.idle': 'L의 전류가 0입니다(DCM). S와 D가 모두 꺼져 있습니다.',
  'desc.twoSwitch.rev': 'S가 꺼져 있고 L의 전류가 음수입니다. 이 전류는 0 V에서 도통하는 S의 바디 다이오드를 통해 입력으로 되돌아가며, L에는 입력 전압이 걸립니다.',
  'desc.twoSwitch.onRev':
    'S가 켜져 있지만 L의 전류가 음수입니다. 이 전류는 S의 바디 다이오드를 통해 입력으로 되돌아가는데, 바디 다이오드는 0 V에서 도통하므로 스위치의 저항 대신 전류를 넘겨받습니다. L에는 입력 전압이 걸립니다.',
  'desc.buck.rev': 'S가 꺼져 있고 L의 전류가 음수입니다. 이 전류는 0 V에서 도통하는 S의 바디 다이오드를 통해 출력에서 입력으로 되돌아가며, L에는 입력 전압에서 출력 전압을 뺀 전압이 걸립니다.',
  'desc.buck.onRev':
    'S가 켜져 있지만 L의 전류가 음수입니다. 이 전류는 S의 바디 다이오드를 통해 출력에서 입력으로 되돌아가는데, 바디 다이오드는 0 V에서 도통하므로 스위치의 저항 대신 전류를 넘겨받습니다. L에는 입력 전압에서 출력 전압을 뺀 전압이 걸립니다.',
  'desc.twoSwitch.rise': 'S가 막 꺼졌습니다. L의 전류가 S 양단의 커패시턴스 C_node를 충전하므로, D가 전류를 넘겨받을 때까지 스위치 전압이 올라갑니다.',
  'desc.twoSwitch.riseRing':
    'S가 막 꺼졌습니다. L의 전류가 S 양단의 커패시턴스 C_node를 충전하여 스위치 전압이 올라갑니다. 스위치 전압이 D의 도통 전압에 이르기 전에 전류가 0까지 떨어지므로 D는 꺼진 채로 있습니다.',
  'desc.twoSwitch.riseCut': 'S가 막 꺼졌습니다. L의 전류가 S 양단의 커패시턴스 C_node를 충전하므로, S가 다시 켜질 때까지 스위치 전압이 올라갑니다.',
  'desc.twoSwitch.ring': 'D가 꺼져 있습니다. L이 C_node와 함께 링잉합니다. 링잉이 스위치 전압을 0 아래로 끌어내리려 할 때마다 S의 바디 다이오드가 그 자리에서 클램프합니다.',
  'desc.flyback.on': 'S가 도통합니다. 1차 권선에는 입력 전압이 걸립니다. 2차 권선의 점(dot)이 아래쪽 끝에 있으므로 D는 역바이어스되어 2차에는 전류가 흐르지 않습니다.',
  'desc.flyback.off': 'S가 꺼져 있습니다. 자화 전류가 2차로 옮겨 가 D가 그 전류를 n으로 나눈 값을 흘리고, 1차로 반사된 출력 전압과 다이오드 전압 강하가 L_M에 거꾸로 걸립니다.',
  'desc.flyback.idle': '자화 전류가 0입니다(DCM). S와 D가 모두 꺼져 있습니다.',
  'desc.flyback.rev': 'S가 꺼져 있고 자화 전류가 음수입니다. 이 전류는 S의 바디 다이오드를 통해 입력으로 되돌아가며, 1차에는 입력 전압이 걸립니다.',
  'desc.flyback.onRev': 'S가 켜져 있지만 자화 전류가 음수입니다. 이 전류는 0 V에서 도통하는 S의 바디 다이오드를 통해 입력으로 되돌아가며, 1차에는 입력 전압이 걸립니다. D는 차단합니다.',
  'desc.flyback.rise': 'S가 막 꺼졌습니다. 자화 전류가 C_node를 충전하므로, D가 전류를 넘겨받을 때까지 스위치 전압이 올라갑니다.',
  'desc.flyback.riseRing':
    'S가 막 꺼졌습니다. 자화 전류가 C_node를 충전하여 스위치 전압이 올라갑니다. 스위치 전압이 D의 도통 전압에 이르기 전에 전류가 0까지 떨어지므로 D는 꺼진 채로 있습니다.',
  'desc.flyback.riseCut': 'S가 막 꺼졌습니다. 자화 전류가 C_node를 충전하므로, S가 다시 켜질 때까지 스위치 전압이 올라갑니다.',
  'desc.flyback.ring': 'D가 꺼져 있습니다. L_M이 C_node와 함께 링잉합니다. 스위치 전압이 0 아래로 내려가려 할 때마다 S의 바디 다이오드가 그 자리에서 클램프합니다.',
  'desc.forward.on': 'S가 도통합니다. 1차에는 입력 전압이 걸리고, 2차에 걸리는 그 n배의 전압이 D_1과 L을 통해 출력으로 전류를 흘립니다. D_2와 리셋 다이오드 D_3는 차단합니다.',
  'desc.forward.off':
    'S가 꺼져 있습니다. 자화 전류가 리셋 권선과 D_3를 통해 입력으로 되돌아가며 코어를 리셋하고, S는 입력 전압에 1차로 반사된 리셋 권선 전압을 더한 전압을 차단합니다. L은 D_2를 통해 환류(freewheeling)합니다.',
  'desc.forward.offM0': '코어의 리셋이 끝났습니다. 자화 전류가 0이고 D_3는 차단합니다. L은 D_2를 통해 환류합니다.',
  'desc.forward.offL0': 'L의 전류가 0이고 D_2가 차단하는 동안, 코어는 D_3를 통해 리셋됩니다.',
  'desc.forward.onL0': 'S가 도통하지만 정류 다이오드가 차단합니다. 출력이 입력 전압의 n배에서 다이오드 전압 강하를 뺀 값보다 높으므로 자화 전류만 흐릅니다.',
  'desc.forward.idle': '코어의 리셋이 끝났고 L의 전류가 0입니다. 다이오드가 모두 차단합니다.',

  'src.Vg': '입력이',
  'src.Voc': '전원이',
  'say.inductor.storing': '{L}의 전류가 커집니다: 에너지를 저장합니다.',
  'say.inductor.releasing': '{L}의 전류가 줄어듭니다: 에너지를 내줍니다.',
  'say.inductor.storeRelease': '{L}의 전류가 커졌다가 줄어듭니다: 에너지를 저장했다가 내줍니다.',
  'say.inductor.releaseStore': '{L}의 전류가 줄었다가 다시 커집니다: 에너지를 내줬다가 다시 저장합니다.',
  'say.inductor.steady': '{L}의 전류가 일정합니다.',
  'say.inductor.reversing': '{L}의 전류 방향이 바뀝니다.',
  'say.inductor.ringing': '{L}의 전류가 방향을 바꾸며 링잉합니다.',
  'say.inductor.zero': '{L}에는 전류가 흐르지 않습니다.',
  'say.capacitor.charging': '{C}가 충전됩니다.',
  'say.capacitor.discharging': '{C}가 방전됩니다.',
  'say.capacitor.chargeDischarge': '{C}가 충전되었다가 방전됩니다.',
  'say.capacitor.dischargeCharge': '{C}가 방전되었다가 충전됩니다.',
  'say.capacitor.ringing': '{C}의 전류가 방향을 바꾸며 링잉합니다.',
  'say.capacitor.idle': '{C}에는 전류가 흐르지 않습니다.',
  'say.battery.charging': '배터리가 충전됩니다.',
  'say.battery.discharging': '배터리가 방전됩니다.',
  'say.battery.chargeDischarge': '배터리가 충전되었다가 방전됩니다.',
  'say.battery.dischargeCharge': '배터리가 방전되었다가 충전됩니다.',
  'say.battery.ringing': '배터리의 전류가 방향을 바꾸며 링잉합니다.',
  'say.battery.idle': '배터리에는 전류가 흐르지 않습니다.',
  'say.fixed.absorbing': '고정 출력이 전력을 흡수합니다.',
  'say.fixed.delivering': '고정 출력이 전력을 공급합니다.',
  'say.fixed.alternating': '고정 출력의 전류 방향이 바뀝니다.',
  'say.fixed.idle': '고정 출력에는 전류가 흐르지 않습니다.',
  'say.vsource.delivering': '{src} 전력을 공급합니다.',
  'say.vsource.absorbing': '{src} 에너지를 되돌려 받습니다.',
  'say.vsource.alternating': '{src} 공급하는 전류의 방향이 바뀝니다.',
  'say.vsource.idle': '{src} 아무것도 공급하지 않습니다.',
};

export const SEQ_TEXT: Record<'en' | 'ko', Text> = { en, ko };

export type SeqText = Text;

/** Fills a text's `{name}` placeholders. */
export function fill(s: string, v: Record<string, string | number>): string {
  return s.replace(/\{(\w+)\}/g, (_, k: string) => String(v[k] ?? ''));
}

type Topology = 'buck' | 'boost' | 'buckboost' | 'flyback' | 'forward';

/** The text keys of a mode, a description, an element and a state, with their topology-specific variants. */
export function kindKey(topology: Topology, kind: string): string {
  return topology === 'forward' && kind === 'off' ? 'kind.forward.off' : `kind.${kind}`;
}
/**
 * A mode's description key. A rise (a node capacitance charging after
 * turn-off) ends in one of three ways, which the following mode shows: the
 * diode takes over ('off'), the current falls to zero first and the ringing
 * begins, or the switch turns on again.
 */
export function descKey(topology: Topology, kind: string, text: Text, next?: string): string {
  const variant = kind === 'rise' ? (next === 'off' ? 'rise' : next === 'ring' ? 'riseRing' : 'riseCut') : kind;
  const own = `desc.${topology}.${variant}`;
  return own in text ? own : `desc.twoSwitch.${variant}`;
}

/** The elements whose state the energy sentences put into words, in order, with the symbol each sentence names. */
export const SAY: Record<string, { kind: string; sym?: string }> = {
  L: { kind: 'inductor', sym: 'L' },
  LM: { kind: 'inductor', sym: 'L_M' },
  C: { kind: 'capacitor', sym: 'C' },
  B: { kind: 'battery' },
  V: { kind: 'fixed' },
  Vg: { kind: 'vsource' },
  Voc: { kind: 'vsource' },
  Cbus: { kind: 'capacitor', sym: 'C_bus' },
};

/**
 * What the energy-storing elements and the sources do in a mode, one
 * sentence each, from the same states as the table: the inductors' currents,
 * the output capacitor, the battery or the fixed output, the input or the
 * source, and the bus capacitor.
 */
export function energySentences(states: { id: string; state: string }[], text: Text): string[] {
  const byId = new Map(states.map((e) => [e.id, e.state]));
  const out: string[] = [];
  for (const [id, { kind, sym }] of Object.entries(SAY)) {
    const st = byId.get(id);
    if (st === undefined) continue;
    const t = text[`say.${kind}.${st}`];
    if (t) out.push(fill(t, { L: sym ?? '', C: sym ?? '', src: text[`src.${id}`] ?? '' }));
  }
  return out;
}
export function elementKey(topology: Topology, id: string): string {
  return topology === 'forward' && id === 'L' ? 'el.forward.L' : `el.${id}`;
}
export function stateKey(kind: string, state: string, prefix: 'st' | 'short' | 'say'): string {
  if (prefix === 'say') return `say.${kind}.${state}`;
  if ((kind === 'vsource' || kind === 'fixed') && (state === 'delivering' || state === 'absorbing')) return `${prefix}.${kind}.${state}`;
  return `${prefix}.${state}`;
}
