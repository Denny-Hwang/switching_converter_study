# Forward converter with a reset winding: LTspice schematics

[한국어](#한국어)

Each file carries the numbers of a synthetic example (not from any design), the example the in-browser [simulator](https://denny-hwang.github.io/switching_converter_study/en/simulate/simulator/) also opens with its preset of the same name. The same circuits as ngspice netlists: [../../ngspice/forward/](../../ngspice/forward/).

| File | Example | Mode | Preset |
| --- | --- | --- | --- |
| [forward-ccm.asc](forward-ccm.asc) | Forward converter example (`forward-basic`): V_g = 48 V, D = 0.4, f_s = 100 kHz, L = 100 µH, L_M = 1 mH, n = 0.5, n_r = 1, C = 100 µF, R = 5 Ω | CCM | Forward |

## Run

Open the file in LTspice and press Run: the schematic carries its `.param`, `.model` and `.tran` lines. The run starts from rest and lasts several hundred periods, so the last ones are the steady state. Click a node for its voltage and a part for its current; the node names are the ngspice netlist's.

## forward-ccm

Plot: `V(d)` (switch voltage), `I(L1)` (output inductor current), `I(Lp)+0.5*I(Ls)+1*I(Lr)` (magnetizing current), `V(out)` (output voltage).

![forward-ccm](../../waveforms/forward-ccm.svg)

| Quantity | ngspice | Ideal | From the catalogue |
| --- | --- | --- | --- |
| output voltage, average | 9.572 V | 9.6 V | `forward.ccm.M` |
| output inductor current, average | 1.914 A | 1.92 A | `buck.IL` |
| output inductor current, largest | 2.202 A | 2.208 A | `buck.IL + forward.ripple.iL` |
| output inductor current, smallest | 1.626 A | 1.632 A | `buck.IL - forward.ripple.iL` |
| switch voltage, largest | 96.02 V | 96 V | `V_g (1 + 1/n_r)` |

## Notes

- The switch is 1 mΩ on and 1 MΩ off, and the diodes drop about 30 mV at an ampere, so the results land within 1 % of the ideal equations; `scripts/sim_library.py --check` confirms it in CI.
- A transformer is coupled inductors with a coupling of 1: the primary's inductance is the magnetizing inductance (referred to the primary), the turns ratio 1:n with n = N_s/N_p. SPICE takes each inductor's first node as its dotted end; LTspice draws the dot at the other end of every winding, so the relative polarity is the same.
- LTspice puts 1 mΩ in series with an inductor that is not coupled (its help, Inductor Models): less than 0.1 % on these results.
- The 1 pF across the switch (Cd) is for the solver: with three windings coupled with 1, SPICE needs a capacitance at the drain for the current to pass from the primary to the reset winding at turn-off. After the reset, the magnetizing current rings once into it, and the forward diode then holds what is left, sqrt(Cd/L_M) V_g (about 1.5 mA here), through the idle interval: less than 1 % of the magnetizing current's peak.

## 한국어

### 리셋 권선이 있는 포워드 컨버터: LTspice 회로도

각 파일은 합성 예제(설계에서 가져오지 않은 수)의 값을 씁니다. 브라우저 [시뮬레이터](https://denny-hwang.github.io/switching_converter_study/ko/simulate/simulator/)의 같은 이름 프리셋(preset)도 같은 예제로 열립니다. 같은 회로의 ngspice 넷리스트는 [../../ngspice/forward/](../../ngspice/forward/)에 있습니다.

| 파일 | 예제 | 모드 | 프리셋 |
| --- | --- | --- | --- |
| [forward-ccm.asc](forward-ccm.asc) | 포워드 컨버터 예제 (`forward-basic`): V_g = 48 V, D = 0.4, f_s = 100 kHz, L = 100 µH, L_M = 1 mH, n = 0.5, n_r = 1, C = 100 µF, R = 5 Ω | CCM | 포워드 |

#### 실행

LTspice에서 파일을 열고 Run을 누릅니다. `.param`, `.model`, `.tran` 줄이 회로도에 있습니다. 정지 상태에서 시작해 수백 주기를 계산하므로, 마지막 주기들이 정상상태(steady state)입니다. 노드를 누르면 전압을, 부품을 누르면 전류를 그립니다. 노드 이름은 ngspice 넷리스트와 같습니다.

#### forward-ccm

그릴 것: `V(d)` (스위치 전압), `I(L1)` (출력 인덕터 전류), `I(Lp)+0.5*I(Ls)+1*I(Lr)` (자화 전류), `V(out)` (출력 전압).

![forward-ccm](../../waveforms/forward-ccm.svg)

| 양 | ngspice | 이상적인 식 | 카탈로그의 식 |
| --- | --- | --- | --- |
| 출력 전압, 평균 | 9.572 V | 9.6 V | `forward.ccm.M` |
| 출력 인덕터 전류, 평균 | 1.914 A | 1.92 A | `buck.IL` |
| 출력 인덕터 전류, 최댓값 | 2.202 A | 2.208 A | `buck.IL + forward.ripple.iL` |
| 출력 인덕터 전류, 최솟값 | 1.626 A | 1.632 A | `buck.IL - forward.ripple.iL` |
| 스위치 전압, 최댓값 | 96.02 V | 96 V | `V_g (1 + 1/n_r)` |

#### 참고

- 스위치는 켜지면 1 mΩ, 꺼지면 1 MΩ이고, 다이오드는 1 A에서 약 30 mV가 떨어집니다. 그래서 결과가 이상적인 식과 1 % 안에서 맞습니다. `scripts/sim_library.py --check`가 CI에서 이를 확인합니다.
- 변압기는 결합 계수 1인 결합 인덕터입니다. 1차 인덕턴스가 자화 인덕턴스(1차 기준)이고, 권선비는 1:n, n = N_s/N_p입니다. SPICE는 각 인덕터의 첫 노드를 점(dot)으로 봅니다. LTspice는 모든 권선에서 점을 다른 끝에 그리므로, 상대 극성은 같습니다.
- LTspice는 결합되지 않은 인덕터에 1 mΩ 직렬 저항을 기본으로 넣습니다(도움말의 Inductor Models). 결과에 주는 영향은 0.1 %보다 작습니다.
- 스위치 양단의 1 pF(Cd)는 계산을 위한 것입니다. 세 권선이 계수 1로 결합되면, 턴오프 때 전류가 1차에서 리셋 권선으로 옮겨 갈 수 있도록 SPICE에 드레인 커패시턴스가 필요합니다. 리셋이 끝나면 자화 전류가 한 번 Cd와 공진하고, 순방향 다이오드가 남은 전류 sqrt(Cd/L_M)·V_g(여기서 약 1.5 mA)를 휴지 구간 동안 붙잡아 둡니다. 자화 전류 최댓값의 1 %보다 작습니다.
