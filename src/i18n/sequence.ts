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
  sheetTitle: 'All modes at once',
  sheetIntro:
    'The whole period as a paper draws it: the key waveforms, with the boundaries t_0, t_1, … of the modes, then the circuit in each mode. It follows the values above.',
  sheetRange: '(t_{a} to t_{b}: {t0} to {t1}, {dt})',
  sheetOn: 'on',
  sheetWaves: 'Key waveforms over one period (T_s = {Ts}), in {n} modes',
  rest: 'Nothing moves in this steady state: every current is zero (to rounding), so there are no operating modes to show.',
  tableNote:
    "Each current is positive along its element's arrow on the circuit (the direction of its average current in the mode); a negative value flows against it. An inductor's voltage is taken along its arrow too, and includes the drop across its winding resistance; every other voltage keeps the element's own direction. A current below a thousandth of its scale counts as none and is shown as zero. The scale is the largest current in the mode among the elements it flows with: the switching cell (a transformer's primary side and secondary side apart), the output capacitor with the load, the bus capacitor with the source. An inductor's scale is at most its own largest current over the period; a capacitor's at least what the load or the source draws; the load's and the source's own elements use their own largest current over the period. Rounding, below a billionth of the circuit's natural current, is never a current.",

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

  // what happens in each mode: which parts conduct and how they connect (pe-core's modes() names each mode
  // by the elements that conduct in it); the voltages and the energy sentences below come from the table
  'desc.buck.on': 'S conducts and D blocks: L lies between the input and the output.',
  'desc.buck.off': 'S is off: L\'s current flows on through D, which conducts.',
  'desc.buck.idle': "L's current is zero (DCM): S and D are both off.",
  'desc.boost.on': 'S conducts and connects L\'s output end to ground. D blocks.',
  'desc.boost.off': 'S is off: L\'s current flows through D into the output.',
  'desc.boost.idle': "L's current is zero (DCM): S and D are both off.",
  'desc.buckboost.on': 'S conducts: L is connected across the input. D blocks.',
  'desc.buckboost.off': 'S is off: L\'s current flows on through D into the output, whose voltage is inverted.',
  'desc.buckboost.idle': "L's current is zero (DCM): S and D are both off.",
  'desc.twoSwitch.rev': 'S is off and L\'s current is negative: it flows back to the input through the body diode of S, which conducts at zero volts.',
  'desc.twoSwitch.onRev':
    'S is on, but L\'s current is negative: it flows back to the input through the body diode of S, which conducts at zero volts and so takes it from the switch\'s resistance.',
  'desc.buck.rev':
    'S is off and L\'s current is negative: it flows from the output back to the input through the body diode of S, at zero volts.',
  'desc.buck.onRev':
    'S is on, but L\'s current is negative: it flows from the output back to the input through the body diode of S, which conducts at zero volts and so takes it from the switch\'s resistance.',
  'desc.twoSwitch.rise': "S has just turned off: L's current charges C_node, the capacitance across S, and the switch voltage rises until D takes over.",
  'desc.twoSwitch.riseRing':
    "S has just turned off: L's current charges C_node, the capacitance across S, and the switch voltage rises. The current falls to zero before the switch voltage reaches D's turn-on voltage, so D stays off.",
  'desc.twoSwitch.riseCut': "S has just turned off: L's current charges C_node, the capacitance across S, and the switch voltage rises until S turns on again.",
  'desc.twoSwitch.ring': 'D is off: L rings with C_node. Whenever the ringing would take the switch voltage below zero, the body diode of S clamps it there.',
  'desc.flyback.on':
    'S conducts: the primary winding is connected across the input. The secondary\'s dot is at its lower end, so D is reverse biased and no current flows in the secondary.',
  'desc.flyback.off':
    'S is off: the magnetizing current moves to the secondary, where D carries it, divided by n, into the output.',
  'desc.flyback.idle': 'The magnetizing current is zero (DCM): S and D are both off.',
  'desc.flyback.rev': 'S is off and the magnetizing current is negative: it returns to the input through the body diode of S.',
  'desc.flyback.onRev':
    'S is on, but the magnetizing current is negative: it returns to the input through the body diode of S, at zero volts. D blocks.',
  'desc.flyback.rise': 'S has just turned off: the magnetizing current charges C_node, and the switch voltage rises until D takes over.',
  'desc.flyback.riseRing':
    "S has just turned off: the magnetizing current charges C_node, and the switch voltage rises. The current falls to zero before the switch voltage reaches D's turn-on voltage, so D stays off.",
  'desc.flyback.riseCut': 'S has just turned off: the magnetizing current charges C_node, and the switch voltage rises until S turns on again.',
  'desc.flyback.ring': 'D is off: L_M rings with C_node. Whenever the switch voltage would go below zero, the body diode of S clamps it there.',
  'desc.forward.on':
    'S conducts: the primary winding is connected across the input, and the secondary drives the current through D_1 and L into the output. D_2 and the reset diode D_3 block.',
  'desc.forward.off':
    'S is off: the magnetizing current flows through the reset winding and D_3 back into the input, and S blocks the input voltage plus the reset winding\'s voltage reflected to the primary. L freewheels through D_2.',
  'desc.forward.offM0': 'The core has reset: the magnetizing current is zero and D_3 blocks. L freewheels through D_2.',
  'desc.forward.offL0': 'L\'s current is zero and D_2 blocks, while the magnetizing current flows through the reset winding and D_3 back into the input.',
  'desc.forward.onL0': 'S conducts, but the rectifier blocks: the secondary\'s voltage does not exceed the output voltage plus the diode drop, so only the magnetizing current flows.',
  'desc.forward.idle': "The core has reset and L's current is zero: the diodes block.",

  // what each energy-storing element and each source does in the mode, from its state in the table
  'src.Vg': 'The input',
  'src.Voc': 'The source',
  'say.volts': 'The voltage across {L} averages {v}.',
  'say.voltsR': 'The voltage across {L} averages {v}: {vr} across its winding resistance, {vl} across its inductance.',
  'say.reset': "L_M's current reaches zero: the core has reset.",
  'say.noReset': "L_M's current has not reached zero when S turns on: the core does not reset.",
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
  sheetTitle: '모든 모드 한눈에 보기',
  sheetIntro: '논문에서 그리듯 한 주기 전체를 보여 줍니다. 모드의 경계 t_0, t_1, …을 표시한 주요 파형과 각 모드의 회로입니다. 위의 값을 따릅니다.',
  sheetRange: '(t_{a}에서 t_{b}까지: {t0}에서 {t1}까지, {dt})',
  sheetOn: '켜짐',
  sheetWaves: '한 주기(T_s = {Ts})의 주요 파형, 모드 {n}개',
  rest: '이 정상상태에서는 아무것도 움직이지 않습니다. 모든 전류가 (반올림 오차 수준에서) 0이므로 보여 줄 동작 모드가 없습니다.',
  tableNote:
    '각 전류는 회로도에서 그 소자의 화살표 방향(모드 안 평균 전류의 방향)이 양수이고, 음수는 화살표 반대로 흐르는 전류입니다. 인덕터 전압도 화살표 방향으로 잡으며 권선 저항의 전압 강하를 포함합니다. 다른 전압은 소자 자신의 방향을 따릅니다. 기준값(scale)의 1000분의 1보다 작은 전류는 흐르지 않는 것으로 보고 0으로 표시합니다. 기준값은 그 모드에서 함께 흐르는 소자들의 가장 큰 전류입니다: 스위칭 셀(변압기는 1차 측과 2차 측을 따로), 부하와 함께인 출력 커패시터, 전원과 함께인 버스 커패시터. 인덕터의 기준값은 한 주기 동안 자신의 최대 전류를 넘지 않고, 커패시터의 기준값은 부하나 전원이 끌어가는 전류보다 작지 않습니다. 부하와 전원 자체의 소자는 한 주기 동안 자신의 최대 전류를 기준값으로 씁니다. 회로 고유 전류의 10억분의 1보다 작은 값은 반올림 오차로, 전류로 보지 않습니다.',

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

  'desc.buck.on': 'S가 도통하고 D는 차단합니다. L은 입력과 출력 사이에 있습니다.',
  'desc.buck.off': 'S가 꺼져 있습니다. L의 전류는 도통하는 D를 통해 계속 흐릅니다.',
  'desc.buck.idle': 'L의 전류가 0입니다(DCM). S와 D가 모두 꺼져 있습니다.',
  'desc.boost.on': 'S가 도통하여 L의 출력 쪽 끝을 접지에 연결합니다. D는 차단합니다.',
  'desc.boost.off': 'S가 꺼져 있습니다. L의 전류가 D를 통해 출력으로 흐릅니다.',
  'desc.boost.idle': 'L의 전류가 0입니다(DCM). S와 D가 모두 꺼져 있습니다.',
  'desc.buckboost.on': 'S가 도통하여 L을 입력 양단에 연결합니다. D는 차단합니다.',
  'desc.buckboost.off': 'S가 꺼져 있습니다. L의 전류가 D를 통해 전압이 반전된 출력으로 계속 흐릅니다.',
  'desc.buckboost.idle': 'L의 전류가 0입니다(DCM). S와 D가 모두 꺼져 있습니다.',
  'desc.twoSwitch.rev': 'S가 꺼져 있고 L의 전류가 음수입니다. 이 전류는 0 V에서 도통하는 S의 바디 다이오드를 통해 입력으로 되돌아갑니다.',
  'desc.twoSwitch.onRev':
    'S가 켜져 있지만 L의 전류가 음수입니다. 이 전류는 S의 바디 다이오드를 통해 입력으로 되돌아가는데, 바디 다이오드는 0 V에서 도통하므로 스위치의 저항 대신 전류를 넘겨받습니다.',
  'desc.buck.rev': 'S가 꺼져 있고 L의 전류가 음수입니다. 이 전류는 0 V에서 도통하는 S의 바디 다이오드를 통해 출력에서 입력으로 되돌아갑니다.',
  'desc.buck.onRev':
    'S가 켜져 있지만 L의 전류가 음수입니다. 이 전류는 S의 바디 다이오드를 통해 출력에서 입력으로 되돌아가는데, 바디 다이오드는 0 V에서 도통하므로 스위치의 저항 대신 전류를 넘겨받습니다.',
  'desc.twoSwitch.rise': 'S가 막 꺼졌습니다. L의 전류가 S 양단의 커패시턴스 C_node를 충전하므로, D가 전류를 넘겨받을 때까지 스위치 전압이 올라갑니다.',
  'desc.twoSwitch.riseRing':
    'S가 막 꺼졌습니다. L의 전류가 S 양단의 커패시턴스 C_node를 충전하여 스위치 전압이 올라갑니다. 스위치 전압이 D의 도통 전압에 이르기 전에 전류가 0까지 떨어지므로 D는 꺼진 채로 있습니다.',
  'desc.twoSwitch.riseCut': 'S가 막 꺼졌습니다. L의 전류가 S 양단의 커패시턴스 C_node를 충전하므로, S가 다시 켜질 때까지 스위치 전압이 올라갑니다.',
  'desc.twoSwitch.ring': 'D가 꺼져 있습니다. L이 C_node와 함께 링잉합니다. 링잉이 스위치 전압을 0 아래로 끌어내리려 할 때마다 S의 바디 다이오드가 그 자리에서 클램프합니다.',
  'desc.flyback.on': 'S가 도통하여 1차 권선을 입력 양단에 연결합니다. 2차 권선의 점(dot)이 아래쪽 끝에 있으므로 D는 역바이어스되어 2차에는 전류가 흐르지 않습니다.',
  'desc.flyback.off': 'S가 꺼져 있습니다. 자화 전류가 2차로 옮겨 가, D가 그 전류를 n으로 나눈 값을 출력으로 흘립니다.',
  'desc.flyback.idle': '자화 전류가 0입니다(DCM). S와 D가 모두 꺼져 있습니다.',
  'desc.flyback.rev': 'S가 꺼져 있고 자화 전류가 음수입니다. 이 전류는 S의 바디 다이오드를 통해 입력으로 되돌아갑니다.',
  'desc.flyback.onRev': 'S가 켜져 있지만 자화 전류가 음수입니다. 이 전류는 0 V에서 도통하는 S의 바디 다이오드를 통해 입력으로 되돌아갑니다. D는 차단합니다.',
  'desc.flyback.rise': 'S가 막 꺼졌습니다. 자화 전류가 C_node를 충전하므로, D가 전류를 넘겨받을 때까지 스위치 전압이 올라갑니다.',
  'desc.flyback.riseRing':
    'S가 막 꺼졌습니다. 자화 전류가 C_node를 충전하여 스위치 전압이 올라갑니다. 스위치 전압이 D의 도통 전압에 이르기 전에 전류가 0까지 떨어지므로 D는 꺼진 채로 있습니다.',
  'desc.flyback.riseCut': 'S가 막 꺼졌습니다. 자화 전류가 C_node를 충전하므로, S가 다시 켜질 때까지 스위치 전압이 올라갑니다.',
  'desc.flyback.ring': 'D가 꺼져 있습니다. L_M이 C_node와 함께 링잉합니다. 스위치 전압이 0 아래로 내려가려 할 때마다 S의 바디 다이오드가 그 자리에서 클램프합니다.',
  'desc.forward.on': 'S가 도통하여 1차 권선을 입력 양단에 연결하고, 2차 권선이 D_1과 L을 통해 출력으로 전류를 흘립니다. D_2와 리셋 다이오드 D_3는 차단합니다.',
  'desc.forward.off':
    'S가 꺼져 있습니다. 자화 전류가 리셋 권선과 D_3를 통해 입력으로 되돌아가고, S는 입력 전압에 1차로 반사된 리셋 권선 전압을 더한 전압을 차단합니다. L은 D_2를 통해 환류(freewheeling)합니다.',
  'desc.forward.offM0': '코어의 리셋이 끝났습니다. 자화 전류가 0이고 D_3는 차단합니다. L은 D_2를 통해 환류합니다.',
  'desc.forward.offL0': 'L의 전류가 0이고 D_2가 차단하는 동안, 자화 전류는 리셋 권선과 D_3를 통해 입력으로 되돌아갑니다.',
  'desc.forward.onL0': 'S가 도통하지만 정류 다이오드가 차단합니다. 2차 전압이 출력 전압에 다이오드 전압 강하를 더한 값을 넘지 않으므로 자화 전류만 흐릅니다.',
  'desc.forward.idle': '코어의 리셋이 끝났고 L의 전류가 0입니다. 다이오드가 모두 차단합니다.',

  'src.Vg': '입력이',
  'src.Voc': '전원이',
  'say.volts': '{L} 양단 전압은 평균 {v}입니다.',
  'say.voltsR': '{L} 양단 전압은 평균 {v}입니다: 권선 저항에 {vr}, 인덕턴스에 {vl}.',
  'say.reset': 'L_M의 전류가 0에 이릅니다: 코어의 리셋이 끝났습니다.',
  'say.noReset': 'S가 켜질 때까지 L_M의 전류가 0에 이르지 못합니다: 코어가 리셋되지 않습니다.',
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

/** What the sentences need of an element in a mode: its id and state, and an inductor's average voltage as the table shows it. */
export interface Said {
  id: string;
  state: string;
  /**
   * An inductor's average voltage in the mode, formatted as in the table
   * (along its arrow), and with a winding resistance its parts across the
   * resistance and across the inductance.
   */
  volts?: { v: string; vr?: string; vl?: string };
}

/**
 * What the energy-storing elements and the sources do in a mode, from the
 * same states as the table: the inductors' currents, each after the average
 * voltage across it (the table's number), the output capacitor, the battery
 * or the fixed output, the input or the source, and the bus capacitor. The
 * forward converter's L_M is followed by whether its current has returned to
 * zero, the core's reset (pe-core's coreReset).
 */
export function energySentences(states: Said[], text: Text, reset?: 'reset' | 'noReset'): string[] {
  const byId = new Map(states.map((e) => [e.id, e]));
  const out: string[] = [];
  for (const [id, { kind, sym }] of Object.entries(SAY)) {
    const e = byId.get(id);
    if (e === undefined) continue;
    // an inductor that carries current: the voltage across it first, which makes its current change
    if (kind === 'inductor' && e.state !== 'zero' && e.volts) {
      const { v, vr, vl } = e.volts;
      out.push(fill(text[vr === undefined ? 'say.volts' : 'say.voltsR']!, { L: sym!, v, vr: vr ?? '', vl: vl ?? '' }));
    }
    const t = text[`say.${kind}.${e.state}`];
    if (t) out.push(fill(t, { L: sym ?? '', C: sym ?? '', src: text[`src.${id}`] ?? '' }));
    if (id === 'LM' && reset) out.push(text[reset === 'reset' ? 'say.reset' : 'say.noReset']!);
  }
  return out;
}

/**
 * A mode's description: which parts connect in it (its kind's text, and a
 * rise's by how it ends), then the energy sentences.
 */
export function modeDescription(topology: Topology, kind: string, next: string | undefined, states: Said[], text: Text, reset?: 'reset' | 'noReset'): string {
  return [text[descKey(topology, kind, text, next)] ?? '', ...energySentences(states, text, reset)].filter(Boolean).join(' ');
}

export function elementKey(topology: Topology, id: string): string {
  return topology === 'forward' && id === 'L' ? 'el.forward.L' : `el.${id}`;
}
export function stateKey(kind: string, state: string, prefix: 'st' | 'short' | 'say'): string {
  if (prefix === 'say') return `say.${kind}.${state}`;
  if ((kind === 'vsource' || kind === 'fixed') && (state === 'delivering' || state === 'absorbing')) return `${prefix}.${kind}.${state}`;
  return `${prefix}.${state}`;
}
