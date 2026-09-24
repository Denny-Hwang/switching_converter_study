# Buck converter: ngspice netlists

[한국어](#한국어)

Each file carries the numbers of a synthetic example (not from any design), the example the in-browser [simulator](https://denny-hwang.github.io/switching_converter_study/en/simulate/simulator/) also opens with its preset of the same name. The same circuits as LTspice schematics: [../../ltspice/buck/](../../ltspice/buck/).

| File | Example | Mode | Preset |
| --- | --- | --- | --- |
| [buck-ccm.cir](buck-ccm.cir) | Buck example (`buck-basic`): V_g = 24 V, D = 0.5, f_s = 100 kHz, L = 100 µH, C = 10 µF, R = 10 Ω | CCM | Buck, CCM |
| [buck-dcm.cir](buck-dcm.cir) | Buck example at light load (`buck-light-load`): V_g = 24 V, D = 0.5, f_s = 100 kHz, L = 100 µH, C = 10 µF, R = 100 Ω | DCM | Buck, light load (DCM) |

## Run

```
ngspice -b buck-ccm.cir    # prints the measurements (.meas) of the last period
ngspice buck-ccm.cir       # interactive: run, then plot
```

## buck-ccm

Plot: `v(sw)` (switch node), `i(l1)` (inductor current), `v(out)` (output voltage).

![buck-ccm](../../waveforms/buck-ccm.svg)

| Quantity | ngspice | Ideal | From the catalogue |
| --- | --- | --- | --- |
| output voltage, average | 11.99 V | 12 V | `buck.ccm.M` |
| inductor current, average | 1.199 A | 1.2 A | `buck.IL` |
| inductor current, largest | 1.499 A | 1.5 A | `buck.IL + buck.ripple.iL` |
| inductor current, smallest | 0.8978 A | 0.9 A | `buck.IL - buck.ripple.iL` |
| switch node, largest | 24 V | 24 V | `V_g` |

## buck-dcm

Plot: `v(sw)` (switch node), `i(l1)` (inductor current), `v(out)` (output voltage).

![buck-dcm](../../waveforms/buck-dcm.svg)

| Quantity | ngspice | Ideal | From the catalogue |
| --- | --- | --- | --- |
| output voltage, average | 15.74 V | 15.74 V | `buck.dcm.M` |
| inductor current, average | 0.1574 A | 0.1574 A | `buck.IL` |
| inductor current, largest | 0.4134 A | 0.413 A | `2 buck.ripple.iL (DCM: from zero)` |
| inductor current, smallest | 8.216e-06 A | 0 A | `DCM: zero` |
| switch node, largest | 24 V | 24 V | `V_g` |

## Notes

- The switch is 1 mΩ on and 1 MΩ off, and the diodes drop about 30 mV at an ampere, so the results land within 1 % of the ideal equations; `scripts/sim_library.py --check` confirms it in CI.
- A transformer is coupled inductors with a coupling of 1: the primary's inductance is the magnetizing inductance (referred to the primary), the turns ratio 1:n with n = N_s/N_p. SPICE takes each inductor's first node as its dotted end; LTspice draws the dot at the other end of every winding, so the relative polarity is the same.

## 한국어

### 벅 컨버터: ngspice 넷리스트

각 파일은 합성 예제(설계에서 가져오지 않은 수)의 값을 씁니다. 브라우저 [시뮬레이터](https://denny-hwang.github.io/switching_converter_study/ko/simulate/simulator/)의 같은 이름 프리셋(preset)도 같은 예제로 열립니다. 같은 회로의 LTspice 회로도는 [../../ltspice/buck/](../../ltspice/buck/)에 있습니다.

| 파일 | 예제 | 모드 | 프리셋 |
| --- | --- | --- | --- |
| [buck-ccm.cir](buck-ccm.cir) | 벅 예제 (`buck-basic`): V_g = 24 V, D = 0.5, f_s = 100 kHz, L = 100 µH, C = 10 µF, R = 10 Ω | CCM | 벅, CCM |
| [buck-dcm.cir](buck-dcm.cir) | 경부하 벅 예제 (`buck-light-load`): V_g = 24 V, D = 0.5, f_s = 100 kHz, L = 100 µH, C = 10 µF, R = 100 Ω | DCM | 벅, 경부하(DCM) |

#### 실행

```
ngspice -b buck-ccm.cir    # 마지막 주기의 측정값(.meas)을 출력합니다
ngspice buck-ccm.cir       # 대화형: run 다음에 plot
```

#### buck-ccm

그릴 것: `v(sw)` (스위치 노드), `i(l1)` (인덕터 전류), `v(out)` (출력 전압).

![buck-ccm](../../waveforms/buck-ccm.svg)

| 양 | ngspice | 이상적인 식 | 카탈로그의 식 |
| --- | --- | --- | --- |
| 출력 전압, 평균 | 11.99 V | 12 V | `buck.ccm.M` |
| 인덕터 전류, 평균 | 1.199 A | 1.2 A | `buck.IL` |
| 인덕터 전류, 최댓값 | 1.499 A | 1.5 A | `buck.IL + buck.ripple.iL` |
| 인덕터 전류, 최솟값 | 0.8978 A | 0.9 A | `buck.IL - buck.ripple.iL` |
| 스위치 노드, 최댓값 | 24 V | 24 V | `V_g` |

#### buck-dcm

그릴 것: `v(sw)` (스위치 노드), `i(l1)` (인덕터 전류), `v(out)` (출력 전압).

![buck-dcm](../../waveforms/buck-dcm.svg)

| 양 | ngspice | 이상적인 식 | 카탈로그의 식 |
| --- | --- | --- | --- |
| 출력 전압, 평균 | 15.74 V | 15.74 V | `buck.dcm.M` |
| 인덕터 전류, 평균 | 0.1574 A | 0.1574 A | `buck.IL` |
| 인덕터 전류, 최댓값 | 0.4134 A | 0.413 A | `2 buck.ripple.iL (DCM: from zero)` |
| 인덕터 전류, 최솟값 | 8.216e-06 A | 0 A | `DCM: zero` |
| 스위치 노드, 최댓값 | 24 V | 24 V | `V_g` |

#### 참고

- 스위치는 켜지면 1 mΩ, 꺼지면 1 MΩ이고, 다이오드는 1 A에서 약 30 mV가 떨어집니다. 그래서 결과가 이상적인 식과 1 % 안에서 맞습니다. `scripts/sim_library.py --check`가 CI에서 이를 확인합니다.
- 변압기는 결합 계수 1인 결합 인덕터입니다. 1차 인덕턴스가 자화 인덕턴스(1차 기준)이고, 권선비는 1:n, n = N_s/N_p입니다. SPICE는 각 인덕터의 첫 노드를 점(dot)으로 봅니다. LTspice는 모든 권선에서 점을 다른 끝에 그리므로, 상대 극성은 같습니다.
