/**
 * The simulator's operating-mode view (SequenceView): what each mode is,
 * what each element is called and what its state means, and a description of
 * each mode per topology, in English and Korean. `{x}` placeholders are
 * filled in by the view. A test (src/tools/SequenceView.test.ts) requires a
 * text for every mode, element and state the simulator can produce.
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
  'short.idle': '',

  // what happens in each mode
  'desc.buck.on':
    'S conducts and D blocks. L sits between the input and the output, so its voltage is V_g − v_out and its current rises: it stores energy while it also feeds the output. The input supplies the inductor current.',
  'desc.buck.off':
    "S is off. L's current cannot stop: it flows on through D, which now conducts. L sees the output voltage, plus the diode drop, in reverse, so its current falls as it gives its stored energy to the output. The input supplies nothing.",
  'desc.buck.idle': "L's current has fallen to zero and stays there (DCM): S and D are both off. C alone supplies the load.",
  'desc.boost.on':
    "S conducts and connects L's output end to ground: L sees V_g, and its current rises as it stores energy. D blocks, and C alone supplies the load.",
  'desc.boost.off':
    'S is off: L and the input together drive the current through D into the output. L sees V_g − v_out, which is negative, so its current falls as it gives energy to the output.',
  'desc.boost.idle': "L's current is zero (DCM): S and D are both off, the input supplies nothing, and C alone supplies the load.",
  'desc.buckboost.on': 'S conducts: L sees V_g, and its current rises as it stores energy. D blocks, and C alone supplies the load.',
  'desc.buckboost.off':
    "S is off: L's current flows on through D into the output, whose voltage is inverted. L sees the output voltage in reverse, so its current falls as it gives all of its stored energy to the output. The input supplies nothing.",
  'desc.buckboost.idle': "L's current is zero (DCM): S and D are both off, and C alone supplies the load.",
  'desc.twoSwitch.rev':
    "L's current was negative when S turned off: it flows back to the input through the body diode of S, which conducts at zero volts. L sees V_g, so the current rises to zero, and the interval ends.",
  'desc.twoSwitch.onRev':
    "S is on, but L's current is negative: it flows back to the input through the body diode of S, which conducts at zero volts and so takes it from the switch's resistance. L sees V_g, so the current rises to zero, and S takes it over.",
  'desc.buck.rev':
    "L's current is negative and S is off: it flows from the output back to the input through the body diode of S, at zero volts. L sees V_g − v_out: below the input the output lets the current rise back to zero; above it (a battery above the input) the current keeps growing, and the output discharges into the input.",
  'desc.buck.onRev':
    "S is on, but L's current is negative: it flows from the output back to the input through the body diode of S, which conducts at zero volts and so takes it from the switch's resistance. L sees V_g − v_out: below the input the output lets the current rise back to zero, and S takes it over; above it the current keeps growing.",
  'desc.twoSwitch.rise':
    "S has just turned off. L's current charges C_node, the capacitance across S, so the switch voltage rises until D takes over.",
  'desc.twoSwitch.ring':
    'D has stopped conducting: L rings with C_node. Whenever the ringing would take the switch voltage below zero, the body diode of S clamps it there.',
  'desc.flyback.on':
    'S conducts: the primary winding sees V_g, and the magnetizing current in L_M rises as the core stores energy. The secondary\'s dot is at its lower end, so D is reverse biased and no current flows in the secondary; C supplies the load.',
  'desc.flyback.off':
    'S is off. The magnetizing current cannot stop: it moves to the secondary, where D carries it divided by n. The output voltage, reflected to the primary, is across L_M in reverse, so the magnetizing current falls as the core gives its energy to the output.',
  'desc.flyback.idle': 'The core has given up all its energy: the magnetizing current is zero (DCM), S and D are off, and C supplies the load.',
  'desc.flyback.rev':
    'The magnetizing current was negative when S turned off: it returns to the input through the body diode of S. The primary sees V_g, so the current rises to zero.',
  'desc.flyback.onRev':
    'S is on, but the magnetizing current is negative (the ringing left it so): it returns to the input through the body diode of S, at zero volts. The primary sees V_g, so the current rises to zero, and S takes it over. D blocks throughout.',
  'desc.flyback.rise':
    'S has just turned off. The magnetizing current charges C_node, so the switch voltage rises until D takes over.',
  'desc.flyback.ring':
    'D has stopped conducting: L_M rings with C_node. Whenever the switch voltage would go below zero, the body diode of S clamps it there.',
  'desc.forward.on':
    "S conducts: the primary sees V_g, and the secondary's n V_g drives the current through D_1 and L into the output, so L's current rises. The magnetizing current in L_M rises too. D_2 and the reset diode D_3 block.",
  'desc.forward.off':
    "S is off. The magnetizing current flows through the reset winding and D_3 back into the input, resetting the core; S blocks V_g plus the reset winding's voltage reflected to the primary. L freewheels through D_2: its current falls as it feeds the output.",
  'desc.forward.offM0': 'The core has reset: the magnetizing current is zero, and D_3 blocks. L still freewheels through D_2.',
  'desc.forward.offL0': "L's current has reached zero (DCM) and D_2 blocks, while the core is still resetting through D_3.",
  'desc.forward.onL0': 'S conducts, but the rectifier blocks: the output is above n V_g less the diode drop, so only the magnetizing current flows.',
  'desc.forward.idle': "The core's reset and L's current are both over: the diodes block, and C supplies the load.",
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
  'st.idle': '전류 없음',

  'short.on': '온',
  'short.onBodyDiode': '온, 바디 다이오드',
  'short.bodyDiode': '바디 다이오드',
  'short.off': '오프',
  'short.conducting': '도통',
  'short.blocking': '차단',
  'short.storing': '↑ 저장',
  'short.releasing': '↓ 방출',
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
  'short.idle': '',

  'desc.buck.on':
    'S가 도통하고 D는 차단합니다. L이 입력과 출력 사이에 있으므로 L의 전압은 V_g − v_out이고 전류가 증가합니다. L은 에너지를 저장하면서 출력에도 전류를 공급하며, 입력이 인덕터 전류를 공급합니다.',
  'desc.buck.off':
    'S가 꺼집니다. L의 전류는 멈출 수 없으므로 이제 도통하는 D를 통해 계속 흐릅니다. L에는 출력 전압에 다이오드 전압 강하를 더한 전압이 거꾸로 걸리므로, 저장한 에너지를 출력에 내주며 전류가 감소합니다. 입력은 아무것도 공급하지 않습니다.',
  'desc.buck.idle': 'L의 전류가 0까지 떨어져 그대로 머뭅니다(DCM). S와 D가 모두 꺼져 있고, C 혼자 부하에 전류를 공급합니다.',
  'desc.boost.on': 'S가 도통하여 L의 출력 쪽 끝을 접지에 연결합니다. L에는 V_g가 걸려 에너지를 저장하며 전류가 증가합니다. D는 차단하고, C 혼자 부하에 전류를 공급합니다.',
  'desc.boost.off':
    'S가 꺼집니다. L과 입력이 함께 D를 통해 출력으로 전류를 밀어 넣습니다. L에 걸리는 V_g − v_out은 음수이므로, 출력에 에너지를 내주며 전류가 감소합니다.',
  'desc.boost.idle': 'L의 전류가 0입니다(DCM). S와 D가 모두 꺼져 있어 입력은 아무것도 공급하지 않고, C 혼자 부하에 전류를 공급합니다.',
  'desc.buckboost.on': 'S가 도통합니다. L에 V_g가 걸려 에너지를 저장하며 전류가 증가합니다. D는 차단하고, C 혼자 부하에 전류를 공급합니다.',
  'desc.buckboost.off':
    'S가 꺼집니다. L의 전류가 D를 통해 출력으로 계속 흐르며, 출력 전압은 반전되어 있습니다. L에는 출력 전압이 거꾸로 걸리므로, 저장한 에너지를 모두 출력에 내주며 전류가 감소합니다. 입력은 아무것도 공급하지 않습니다.',
  'desc.buckboost.idle': 'L의 전류가 0입니다(DCM). S와 D가 모두 꺼져 있고, C 혼자 부하에 전류를 공급합니다.',
  'desc.twoSwitch.rev':
    'S가 꺼질 때 L의 전류가 음수였습니다. 이 전류는 0 V에서 도통하는 S의 바디 다이오드를 통해 입력으로 되돌아갑니다. L에 V_g가 걸리므로 전류가 0까지 올라가며 이 구간이 끝납니다.',
  'desc.twoSwitch.onRev':
    'S가 켜져 있지만 L의 전류가 음수입니다. 이 전류는 S의 바디 다이오드를 통해 입력으로 되돌아가는데, 바디 다이오드는 0 V에서 도통하므로 스위치의 저항 대신 전류를 넘겨받습니다. L에 V_g가 걸리므로 전류가 0까지 올라가고, 그 뒤 S가 전류를 넘겨받습니다.',
  'desc.buck.rev':
    'S가 꺼져 있고 L의 전류가 음수입니다. 이 전류는 0 V에서 도통하는 S의 바디 다이오드를 통해 출력에서 입력으로 되돌아갑니다. L에는 V_g − v_out이 걸립니다. 출력이 입력보다 낮으면 전류가 0까지 되돌아 올라가고, 높으면(입력보다 높은 배터리) 전류가 계속 커지며 출력이 입력으로 방전됩니다.',
  'desc.buck.onRev':
    'S가 켜져 있지만 L의 전류가 음수입니다. 이 전류는 S의 바디 다이오드를 통해 출력에서 입력으로 되돌아가는데, 바디 다이오드는 0 V에서 도통하므로 스위치의 저항 대신 전류를 넘겨받습니다. L에는 V_g − v_out이 걸립니다. 출력이 입력보다 낮으면 전류가 0까지 올라가고 S가 전류를 넘겨받으며, 높으면 전류가 계속 커집니다.',
  'desc.twoSwitch.rise': 'S가 막 꺼졌습니다. L의 전류가 S 양단의 커패시턴스 C_node를 충전하므로, D가 전류를 넘겨받을 때까지 스위치 전압이 올라갑니다.',
  'desc.twoSwitch.ring': 'D의 도통이 끝났습니다. L이 C_node와 함께 링잉합니다. 링잉이 스위치 전압을 0 아래로 끌어내리려 할 때마다 S의 바디 다이오드가 그 자리에서 클램프합니다.',
  'desc.flyback.on':
    'S가 도통합니다. 1차 권선에 V_g가 걸려 L_M의 자화 전류가 증가하며 코어에 에너지가 저장됩니다. 2차 권선의 점(dot)이 아래쪽 끝에 있으므로 D는 역바이어스되어 2차에는 전류가 흐르지 않고, C가 부하에 전류를 공급합니다.',
  'desc.flyback.off':
    'S가 꺼집니다. 자화 전류는 멈출 수 없으므로 2차로 옮겨 가고, D가 그 전류를 n으로 나눈 값을 흘립니다. 1차로 반사된 출력 전압이 L_M에 거꾸로 걸리므로, 코어가 에너지를 출력에 내주며 자화 전류가 감소합니다.',
  'desc.flyback.idle': '코어가 에너지를 모두 내주었습니다. 자화 전류가 0이고(DCM), S와 D가 꺼져 있으며, C가 부하에 전류를 공급합니다.',
  'desc.flyback.rev': 'S가 꺼질 때 자화 전류가 음수였습니다. 이 전류는 S의 바디 다이오드를 통해 입력으로 되돌아갑니다. 1차에 V_g가 걸리므로 전류가 0까지 올라갑니다.',
  'desc.flyback.onRev':
    'S가 켜져 있지만 자화 전류가 음수입니다(링잉이 남긴 전류). 이 전류는 0 V에서 도통하는 S의 바디 다이오드를 통해 입력으로 되돌아갑니다. 1차에 V_g가 걸리므로 전류가 0까지 올라가고, 그 뒤 S가 전류를 넘겨받습니다. D는 내내 차단합니다.',
  'desc.flyback.rise': 'S가 막 꺼졌습니다. 자화 전류가 C_node를 충전하므로, D가 전류를 넘겨받을 때까지 스위치 전압이 올라갑니다.',
  'desc.flyback.ring': 'D의 도통이 끝났습니다. L_M이 C_node와 함께 링잉합니다. 스위치 전압이 0 아래로 내려가려 할 때마다 S의 바디 다이오드가 그 자리에서 클램프합니다.',
  'desc.forward.on':
    'S가 도통합니다. 1차에 V_g가 걸리고, 2차의 n V_g가 D_1과 L을 통해 출력으로 전류를 흘려 L의 전류가 증가합니다. L_M의 자화 전류도 증가합니다. D_2와 리셋 다이오드 D_3는 차단합니다.',
  'desc.forward.off':
    'S가 꺼집니다. 자화 전류가 리셋 권선과 D_3를 통해 입력으로 되돌아가며 코어를 리셋합니다. 이때 S는 V_g에 1차로 반사된 리셋 권선 전압을 더한 전압을 차단합니다. L은 D_2를 통해 환류(freewheeling)하며, 출력에 전류를 공급하면서 전류가 감소합니다.',
  'desc.forward.offM0': '코어의 리셋이 끝났습니다. 자화 전류가 0이고 D_3는 차단합니다. L은 여전히 D_2를 통해 환류합니다.',
  'desc.forward.offL0': 'L의 전류가 0에 도달하여(DCM) D_2가 차단하는 동안, 코어는 아직 D_3를 통해 리셋되고 있습니다.',
  'desc.forward.onL0': 'S가 도통하지만 정류 다이오드가 차단합니다. 출력이 n V_g에서 다이오드 전압 강하를 뺀 값보다 높으므로 자화 전류만 흐릅니다.',
  'desc.forward.idle': '코어의 리셋과 L의 전류가 모두 끝났습니다. 다이오드가 모두 차단하고, C가 부하에 전류를 공급합니다.',
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
export function descKey(topology: Topology, kind: string, text: Text): string {
  const own = `desc.${topology}.${kind}`;
  return own in text ? own : `desc.twoSwitch.${kind}`;
}
export function elementKey(topology: Topology, id: string): string {
  return topology === 'forward' && id === 'L' ? 'el.forward.L' : `el.${id}`;
}
export function stateKey(kind: string, state: string, prefix: 'st' | 'short'): string {
  if ((kind === 'vsource' || kind === 'fixed') && (state === 'delivering' || state === 'absorbing')) return `${prefix}.${kind}.${state}`;
  return `${prefix}.${state}`;
}
