/**
 * The site's figures, drawn by scripts/gen_figures.py into
 * src/assets/figures/<name>.svg: caption and text alternative in the site's
 * languages, and the source each figure follows. <Figure name="…" /> renders
 * them; every figure file needs an entry here and every entry a file
 * (figures.test.ts).
 */

import type { Texts } from '../i18n/ui';

const files = import.meta.glob<string>('../assets/figures/*.svg', { query: '?raw', import: 'default', eager: true });

/** The names of the figure files, without the extension. */
export function figureFiles(): string[] {
  return Object.keys(files)
    .map((f) => f.replace(/^.*\//, '').replace(/\.svg$/, ''))
    .sort();
}

/** A figure's SVG, ready to inline. */
export function figureSvg(name: string): string {
  const svg = files[`../assets/figures/${name}.svg`];
  if (!svg) throw new Error(`figure "${name}": src/assets/figures/${name}.svg is missing (python scripts/gen_figures.py)`);
  return svg;
}

export interface FigureInfo {
  caption: Texts;
  /** What the figure shows, for readers who cannot see it. */
  alt: Texts;
  cite: { key: string; where: string };
}

export const FIGURES: Record<string, FigureInfo> = {
  buck: {
    caption: {
      en: 'Buck converter. $Q_1$ and $D_1$ connect the inductor to $V_g$ or to ground; $L$ and $C$ filter the switched voltage into the output $V$ across the load $R$.',
      ko: '벅(buck) 컨버터. $Q_1$과 $D_1$이 인덕터를 $V_g$ 또는 접지에 연결하고, $L$과 $C$가 스위칭된 전압을 걸러 부하 $R$ 양단의 출력 $V$를 만듭니다.',
      zh: '降压（buck）变换器。$Q_1$ 和 $D_1$ 将电感接到 $V_g$ 或地；$L$ 和 $C$ 将斩波后的电压滤波为输出 $V$，加在负载 $R$ 两端。',
    },
    alt: {
      en: 'Schematic of a buck converter: source V_g, series switch Q1, diode D1 from the switch node to ground, inductor L carrying i_L, then capacitor C and load R in parallel across the output voltage V.',
      ko: '벅 컨버터 회로도: 전원 V_g, 직렬 스위치 Q1, 스위치 노드에서 접지로 가는 다이오드 D1, 전류 i_L이 흐르는 인덕터 L, 그리고 출력 전압 V 양단에 병렬로 연결된 커패시터 C와 부하 R.',
      zh: '降压变换器原理图：电源 V_g、串联开关管 Q1、从开关节点接到地的二极管 D1、流过 i_L 的电感 L，然后是并联在输出电压 V 两端的电容 C 和负载 R。',
    },
    cite: { key: 'erickson2020', where: 'Ch. 2' },
  },
  boost: {
    caption: {
      en: 'Boost converter. While $Q_1$ is on, $V_g$ drives the current in $L$ up; while it is off, $L$ and $V_g$ together supply the output through $D_1$, so $V > V_g$.',
      ko: '부스트(boost) 컨버터. $Q_1$이 켜진 동안 $V_g$가 $L$의 전류를 키우고, 꺼진 동안 $L$과 $V_g$가 함께 $D_1$을 거쳐 출력에 전력을 공급하므로 $V > V_g$입니다.',
      zh: '升压（boost）变换器。$Q_1$ 导通时，$V_g$ 使 $L$ 中的电流上升；关断时，$L$ 与 $V_g$ 一起经 $D_1$ 向输出供电，因此 $V > V_g$。',
    },
    alt: {
      en: 'Schematic of a boost converter: source V_g, series inductor L carrying i_L, switch Q1 from the switch node to ground, diode D1 to the output, capacitor C and load R across the output voltage V.',
      ko: '부스트 컨버터 회로도: 전원 V_g, 전류 i_L이 흐르는 직렬 인덕터 L, 스위치 노드에서 접지로 가는 스위치 Q1, 출력으로 가는 다이오드 D1, 출력 전압 V 양단의 커패시터 C와 부하 R.',
      zh: '升压变换器原理图：电源 V_g、流过 i_L 的串联电感 L、从开关节点接到地的开关管 Q1、接到输出的二极管 D1、输出电压 V 两端的电容 C 和负载 R。',
    },
    cite: { key: 'erickson2020', where: 'Ch. 2' },
  },
  'buck-boost': {
    caption: {
      en: 'Inverting buck-boost converter. $L$ takes energy from $V_g$ while $Q_1$ is on and delivers it to the output through $D_1$ while $Q_1$ is off. The output is negative; $V$ is its magnitude.',
      ko: '반전(inverting) 벅-부스트 컨버터. $Q_1$이 켜진 동안 $L$이 $V_g$에서 에너지를 받고, 꺼진 동안 $D_1$을 거쳐 출력으로 내보냅니다. 출력은 음(−)의 극성이며 $V$는 그 크기입니다.',
      zh: '反相升降压（inverting buck-boost）变换器。$L$ 在 $Q_1$ 导通时从 $V_g$ 获取能量，在 $Q_1$ 关断时经 $D_1$ 将能量送到输出。输出为负；$V$ 为其绝对值。',
    },
    alt: {
      en: 'Schematic of an inverting buck-boost converter: source V_g, series switch Q1, inductor L from the switch node to ground carrying i_L, diode D1 pointing from the output toward the switch node, capacitor C and load R; the output terminal on top is negative.',
      ko: '반전 벅-부스트 컨버터 회로도: 전원 V_g, 직렬 스위치 Q1, 스위치 노드에서 접지로 연결되어 전류 i_L이 흐르는 인덕터 L, 출력에서 스위치 노드 쪽으로 향하는 다이오드 D1, 커패시터 C와 부하 R. 위쪽 출력 단자가 음극입니다.',
      zh: '反相升降压变换器原理图：电源 V_g、串联开关管 Q1、从开关节点接到地且流过 i_L 的电感 L、由输出指向开关节点的二极管 D1、电容 C 和负载 R；上方的输出端为负。',
    },
    cite: { key: 'erickson2020', where: 'Ch. 2' },
  },
  flyback: {
    caption: {
      en: 'Flyback converter. Coupled windings with turns ratio $1:n$ take the place of the buck-boost inductor: energy stored in the magnetizing inductance while $Q_1$ is on reaches the output through $D_1$ while $Q_1$ is off. The dots at opposite ends show that the windings conduct in turn.',
      ko: '플라이백(flyback) 컨버터. 권선비 $1:n$의 결합 권선(coupled windings)이 벅-부스트의 인덕터를 대신합니다. $Q_1$이 켜진 동안 자화 인덕턴스(magnetizing inductance)에 저장된 에너지는, $Q_1$이 꺼진 동안 $D_1$을 거쳐 출력으로 갑니다. 점(dot)이 서로 반대쪽 끝에 있으므로 두 권선은 번갈아 도통(conduction)합니다.',
      zh: '反激（flyback）变换器。匝比为 $1:n$ 的耦合绕组（coupled windings）取代了升降压变换器的电感：$Q_1$ 导通时储存在励磁电感（magnetizing inductance）中的能量，在 $Q_1$ 关断时经 $D_1$ 送到输出。两绕组的同名端（dot）位于相反的一端，表明两绕组轮流导通（conduction）。',
    },
    alt: {
      en: 'Schematic of a flyback converter: source V_g in series with the primary winding and switch Q1; the secondary winding, with its dot at the opposite end, feeds diode D1, capacitor C and load R across the output voltage V; turns ratio 1:n.',
      ko: '플라이백 컨버터 회로도: 전원 V_g에 1차 권선과 스위치 Q1이 직렬로 연결되고, 점이 반대쪽 끝에 있는 2차 권선이 다이오드 D1, 커패시터 C, 부하 R에 연결되어 출력 전압 V를 만듭니다. 권선비는 1:n입니다.',
      zh: '反激变换器原理图：电源 V_g 与一次绕组及开关管 Q1 串联；二次绕组的同名端位于相反一端，它为二极管 D1 以及输出电压 V 两端的电容 C 和负载 R 供电；匝比 1:n。',
    },
    cite: { key: 'erickson2020', where: 'Ch. 6' },
  },
  forward: {
    caption: {
      en: 'Forward converter with a reset winding. Primary and secondary conduct together (dots at the same end, turns ratio $1:n$). While $Q_1$ is off, the reset winding ($n_r$ turns per primary turn) returns the magnetizing energy to $V_g$ through $D_r$. $D_1$, $D_2$, $L$ and $C$ form a buck-like output stage.',
      ko: '리셋 권선(reset winding)이 있는 포워드(forward) 컨버터. 1차와 2차 권선은 함께 도통(conduction)합니다(같은 쪽 끝의 점(dot), 권선비 $1:n$). $Q_1$이 꺼진 동안 리셋 권선(1차 1턴당 $n_r$턴)이 $D_r$을 거쳐 자화(magnetizing) 에너지를 $V_g$로 되돌립니다. $D_1$, $D_2$, $L$, $C$는 벅과 같은 출력단을 이룹니다.',
      zh: '带复位绕组（reset winding）的正激（forward）变换器。一次绕组与二次绕组同时导通（conduction），同名端（dot）位于同一端，匝比为 $1:n$。$Q_1$ 关断时，复位绕组（一次绕组每匝对应 $n_r$ 匝）经 $D_r$ 将励磁（magnetizing）能量回馈至 $V_g$。$D_1$、$D_2$、$L$ 和 $C$ 构成类似降压变换器的输出级。',
    },
    alt: {
      en: 'Schematic of a forward converter: source V_g feeding the primary winding with switch Q1, and a reset winding in series with diode Dr across the source; the secondary winding feeds diode D1, freewheeling diode D2, inductor L carrying i_L, capacitor C and load R across the output voltage V.',
      ko: '포워드 컨버터 회로도: 전원 V_g에 스위치 Q1이 달린 1차 권선과, 다이오드 Dr과 직렬인 리셋 권선이 연결됩니다. 2차 권선은 다이오드 D1, 환류 다이오드 D2, 전류 i_L이 흐르는 인덕터 L, 출력 전압 V 양단의 커패시터 C와 부하 R로 이어집니다.',
      zh: '正激变换器原理图：电源 V_g 为带开关管 Q1 的一次绕组供电，与二极管 Dr 串联的复位绕组跨接在电源两端；二次绕组为二极管 D1、续流二极管 D2、流过 i_L 的电感 L 以及输出电压 V 两端的电容 C 和负载 R 供电。',
    },
    cite: { key: 'erickson2020', where: 'Ch. 6' },
  },
  'switch-node': {
    caption: {
      en: "The buck's switch-node voltage $v_s(t)$: $V_g$ for $DT_s$, zero for the rest of each period. Its average is $DV_g$, which the $L$-$C$ filter passes to the output.",
      ko: '벅의 스위치 노드(switch node) 전압 $v_s(t)$: 각 주기의 $DT_s$ 동안은 $V_g$, 나머지 동안은 0입니다. 그 평균 $DV_g$가 $L$-$C$ 필터를 지나 출력이 됩니다.',
      zh: '降压变换器的开关节点（switch node）电压 $v_s(t)$：每个周期中，$V_g$ 持续 $DT_s$，其余时间为零。其平均值为 $DV_g$，由 $L$-$C$ 滤波器传递到输出。',
    },
    alt: {
      en: 'Plot of the switch-node voltage over two switching periods: a rectangular pulse of height V_g lasting D T_s in each period, with a dashed line at its average D V_g.',
      ko: '두 스위칭 주기 동안의 스위치 노드 전압 그래프: 각 주기에서 D T_s 동안 높이 V_g인 직사각형 펄스와, 평균값 D V_g를 나타내는 점선.',
      zh: '两个开关周期内的开关节点电压波形图：每个周期内一个高度为 V_g、持续 D T_s 的矩形脉冲，并用虚线标出其平均值 D V_g。',
    },
    cite: { key: 'erickson2020', where: 'Ch. 2' },
  },
  balance: {
    caption: {
      en: 'Buck in CCM. The inductor voltage $v_L$ is $V_g - V$ while the switch is on and $-V$ while it is off. In steady state the two shaded volt-second areas are equal, so $i_L$ ends each period where it began. $\\Delta i_L$ is half the peak-to-peak ripple.',
      ko: 'CCM의 벅. 인덕터 전압 $v_L$은 스위치가 켜진 동안 $V_g - V$, 꺼진 동안 $-V$입니다. 정상상태(steady state)에서는 음영으로 표시한 두 전압-초(volt-second) 면적이 같아서, $i_L$이 매 주기 시작한 값으로 돌아옵니다. $\\Delta i_L$은 피크-피크 리플(ripple)의 절반입니다.',
      zh: 'CCM 下的降压变换器。电感电压 $v_L$ 在开关管导通时为 $V_g - V$，关断时为 $-V$。稳态（steady state）下，两块阴影所示的伏秒（volt-second）面积相等，因此 $i_L$ 在每个周期结束时回到起始值。$\\Delta i_L$ 为纹波（ripple）峰峰值的一半。',
    },
    alt: {
      en: 'Two stacked plots over two periods. Top: inductor voltage, positive V_g minus V during D T_s and negative V for the rest, with the positive and negative areas shaded. Bottom: inductor current, a triangle wave around its dc value I, with an arrow marking the half-ripple Delta i_L.',
      ko: '두 주기에 걸쳐 위아래로 놓인 그래프 두 개. 위: D T_s 동안 V_g − V, 나머지 동안 −V인 인덕터 전압과 그 양·음의 면적. 아래: 직류값 I를 중심으로 한 삼각파 인덕터 전류와, 리플의 절반 Δi_L을 표시한 화살표.',
      zh: '上下排列的两幅图，横跨两个周期。上图：电感电压，在 D T_s 内为正的 V_g 减 V，其余时间为负的 V，正、负面积以阴影标出。下图：电感电流，为围绕其直流值 I 的三角波，并用箭头标出纹波峰峰值的一半 Delta i_L。',
    },
    cite: { key: 'erickson2020', where: 'Ch. 2' },
  },
  'ccm-dcm': {
    caption: {
      en: 'Inductor current in CCM, at the boundary $K = K_\\mathrm{crit}$, and in DCM, where it rises for $DT_s$, falls to zero in $D_2T_s$ and stays at zero for $D_3T_s$.',
      ko: 'CCM, 경계(boundary) $K = K_\\mathrm{crit}$, DCM에서의 인덕터 전류. DCM에서는 $DT_s$ 동안 오르고, $D_2T_s$ 동안 0까지 내려간 뒤, $D_3T_s$ 동안 0에 머뭅니다.',
      zh: 'CCM 下、临界（boundary）$K = K_\\mathrm{crit}$ 时以及 DCM 下的电感电流；DCM 下电流在 $DT_s$ 内上升，在 $D_2T_s$ 内降到零，并在 $D_3T_s$ 内保持为零。',
    },
    alt: {
      en: 'Three plots of inductor current over two periods: in CCM a triangle wave that stays above zero; at the boundary a triangle wave that just touches zero; in DCM triangular pulses separated by intervals at zero, with the intervals D, D2 and D3 marked.',
      ko: '두 주기에 걸친 인덕터 전류 그래프 세 개: CCM에서는 0보다 위에 머무는 삼각파, 경계에서는 0에 닿는 삼각파, DCM에서는 0인 구간으로 떨어진 삼각 펄스와 D, D2, D3 구간 표시.',
      zh: '两个周期内电感电流的三幅图：CCM 下为始终高于零的三角波；临界时为恰好触及零的三角波；DCM 下为由零值区间隔开的三角脉冲，并标出区间 D、D2 和 D3。',
    },
    cite: { key: 'erickson2020', where: 'Ch. 5' },
  },
};
