# Glossary: English, Korean, Chinese

The terms the site uses, in its three languages. English is canonical. The Korean column is the site's
usage; the Chinese column (Simplified, zh-CN) is the standard term of the field in mainland textbooks and
data sheets. A page gives the English term in parentheses at a term's first use (docs/BUILD_SPEC.md §8).
Symbols (V_g, D, L_M, K, …) and abbreviations that engineers write in English in every language (CCM, DCM,
ESR, MOSFET, PWM, RMS, SPICE, TVS, UVLO) stay as they are.

## Site and page parts

| English | 한국어 | 中文 |
| --- | --- | --- |
| Switching Converter Study (the site) | 스위칭 컨버터 스터디 | 开关变换器学习 |
| Foundations · Physics · Theory · Topologies | 기초 · 물리 · 이론 · 토폴로지 | 基础 · 物理 · 理论 · 拓扑 |
| Magnetics · Simulation · Bench · Harvesting | 자성 부품 · 시뮬레이션 · 벤치(실험대) · 에너지 하베스팅 | 磁性元件 · 仿真 · 实验台 · 能量收集 |
| Gotchas · Missions · Resources · About | 주의할 점 · 미션 · 자료 · 소개 | 易错点 · 任务 · 资料 · 关于 |
| Learn · Design · Simulate | 학습 · 설계 · 시뮬레이션 | 学习 · 设计 · 仿真 |
| Goal (of a page) | 목표 | 目标 |
| Theory · Worked example | 이론 · 풀이 예제 | 理论 · 例题 |
| Try it · Bench exercise | 직접 해 보기 · 벤치 실습 | 动手试试 · 实验练习 |
| Gotchas · Go deeper · Quiz | 주의할 점 · 더 알아보기 · 퀴즈 | 易错点 · 延伸阅读 · 测验 |
| Acceptance criteria | 완료 기준 | 验收标准 |
| derivation | 유도 | 推导 |
| equation explorer | 수식 탐색기 | 公式浏览器 |
| converter designer | 컨버터 설계 도구 | 变换器设计工具 |
| magnetics designer | 자성 부품 설계 도구 | 磁性元件设计工具 |
| loss budget | 손실 예산 | 损耗预算 |
| clamp check | 클램프 점검 | 钳位检查 |
| source matcher | 전원 정합 | 源匹配 |
| sense chain | 센스 체인 | 电流检测链 |
| preset | 프리셋 | 预设 |
| equation catalogue | 수식 카탈로그 | 公式目录 |
| worked example · example (a synthetic example's label) | 풀이 예제 · 예제 | 例题 · 示例 |
| sweep | 스윕 | 扫描 |

## Converters and their operation

| English | 한국어 | 中文 |
| --- | --- | --- |
| switching converter | 스위칭 컨버터 | 开关变换器 |
| topology | 토폴로지 | 拓扑 |
| buck converter | 벅(buck) 컨버터 | 降压（buck）变换器 |
| boost converter | 부스트(boost) 컨버터 | 升压（boost）变换器 |
| (inverting) buck-boost converter | (반전) 벅-부스트 컨버터 | （反相）升降压（buck-boost）变换器 |
| flyback converter | 플라이백 컨버터 | 反激（flyback）变换器 |
| forward converter | 포워드 컨버터 | 正激（forward）变换器 |
| continuous conduction mode (CCM) | 연속 전도 모드(CCM) | 连续导通模式（CCM） |
| discontinuous conduction mode (DCM) | 불연속 전도 모드(DCM) | 断续导通模式（DCM） |
| CCM/DCM boundary | CCM/DCM 경계 | CCM/DCM 临界 |
| operating mode (CCM or DCM) | 동작 모드 | 工作模式 |
| conduction mode (CCM, BCM, DCM, where the text says so) | 전도 모드 | 导通模式 |
| operating mode (an interval of the period) · Mode k | 동작 모드 · 모드 k | 工作模态 · 模态 k |
| operating point | 동작점 | 工作点 |
| duty ratio | 듀티비 | 占空比 |
| conversion ratio | 변환비 | 电压变换比 |
| switching period · switching frequency | 스위칭 주기 · 스위칭 주파수 | 开关周期 · 开关频率 |
| on-interval · off-interval · idle interval | 온 구간 · 오프 구간 · 휴지 구간 | 导通区间 · 关断区间 · 空闲区间 |
| steady state · periodic steady state | 정상상태 · 주기적 정상상태 | 稳态 · 周期稳态 |
| light load · full load · no load | 경부하 · 전부하 · 무부하 | 轻载 · 满载 · 空载 |
| start-up | 기동 | 启动 |
| volt-second balance | 전압-초 평형 | 伏秒平衡 |
| charge balance | 전하 평형 | 电荷平衡 |
| small-ripple approximation | 소리플 근사 | 小纹波近似 |
| ripple · peak-to-peak | 리플 · 피크-피크 | 纹波 · 峰峰值 |
| half the peak-to-peak ripple (Δi_L) | 리플의 절반 | 纹波峰峰值的一半 |
| the ripple's lowest value (its valley) | 최솟값 | 谷值 |
| switch node | 스위치 노드 | 开关节点 |
| switch stress | 스위치 스트레스 | 开关应力 |
| transistor utilization | 트랜지스터 이용률 | 开关管利用率 |
| critical inductance · critical value | 임계 인덕턴스 · 임계값 | 临界电感 · 临界值 |
| inductor parameter K | 인덕터 파라미터 K | 电感参数 K |
| averaged model · state-space averaging | 평균 모델 · 상태 공간 평균화 | 平均模型 · 状态空间平均法 |
| dc transformer (model) | 직류 변압기 | 直流变压器（模型） |
| small-signal model · transfer function | 소신호 모델 · 전달함수 | 小信号模型 · 传递函数 |
| control-to-output transfer function | 제어-출력 전달함수 | 控制-输出传递函数 |
| right-half-plane (RHP) zero | 우반평면(RHP) 영점 | 右半平面（RHP）零点 |
| pole · zero · double pole | 극점 · 영점 · 이중 극점 | 极点 · 零点 · 二重极点 |
| loop gain · crossover frequency · phase margin | 루프 이득 · 크로스오버 주파수 · 위상 여유 | 环路增益 · 穿越频率 · 相位裕度 |
| compensator · PWM modulator | 보상기 · PWM 변조기 | 补偿器 · PWM 调制器 |
| open loop · closed loop | 개루프 · 폐루프 | 开环 · 闭环 |
| quality factor Q · damping | 품질 계수 · 감쇠 | 品质因数 Q · 阻尼 |
| Bode plot | 보드 선도 | 伯德图 |
| phasor · impedance · admittance | 페이저 · 임피던스 · 어드미턴스 | 相量 · 阻抗 · 导纳 |
| Fourier series · harmonic · pulse train | 푸리에 급수 · 고조파 · 펄스열 | 傅里叶级数 · 谐波 · 脉冲序列 |
| rms value | 실효값(rms) | 有效值（rms） |
| damping factor ζ | 감쇠 계수 ζ | 阻尼比 ζ |
| corner frequency · angular frequency | 차단 주파수 · 각주파수 | 转折频率 · 角频率 |
| rail · bus | 레일 · 버스 | 电源轨 · 母线 |
| figure of merit | 성능 지수 | 性能指标 |

## Components and devices

| English | 한국어 | 中文 |
| --- | --- | --- |
| inductor · capacitor · resistor | 인덕터 · 커패시터 · 저항 | 电感 · 电容 · 电阻 |
| diode · switch (transistor) | 다이오드 · 스위치 | 二极管 · 开关管 |
| body diode | 바디 다이오드 | 体二极管 |
| freewheeling diode · rectifier diode · reset diode | 환류 다이오드 · 정류 다이오드 · 리셋 다이오드 | 续流二极管 · 整流二极管 · 复位二极管 |
| synchronous rectification · synchronous rectifier | 동기 정류 · 동기 정류기 | 同步整流 · 同步整流管 |
| on-resistance · forward voltage (drop) | 온 저항 · 순방향 전압(강하) | 导通电阻 · 正向压降 |
| conducting · blocking · reverse bias | 도통 · 차단 · 역바이어스 | 导通 · 阻断 · 反偏 |
| turn-on · turn-off | 턴온 · 턴오프 | 开通 · 关断 |
| reverse recovery | 역회복 | 反向恢复 |
| node capacitance · parasitic capacitance | 노드 커패시턴스 · 기생 커패시턴스 | 节点电容 · 寄生电容 |
| parasitic (stray) inductance | 기생 인덕턴스 | 寄生（杂散）电感 |
| equivalent series resistance (ESR) | 등가 직렬 저항(ESR) | 等效串联电阻（ESR） |
| ceramic · electrolytic capacitor | 세라믹 · 전해 커패시터 | 陶瓷 · 电解电容 |
| dc bias | 직류 바이어스 | 直流偏置 |
| self-resonance · self-resonant frequency | 자기 공진 · 자기 공진 주파수 | 自谐振 · 自谐振频率 |
| load · load resistance | 부하 · 부하 저항 | 负载 · 负载电阻 |
| battery · internal resistance · state of charge | 배터리 · 내부 저항 · 충전 상태 | 电池 · 内阻 · 荷电状态 |
| Thevenin source · open-circuit voltage | 테브난 전원 · 개방 전압 | 戴维南电源 · 开路电压 |
| linear source · source resistance | 선형 전원 · 전원 저항 | 线性源 · 源内阻 |
| current-limited source · constant-voltage sink | 전류 제한 전원 · 정전압 싱크 | 限流电源 · 恒压负载 |
| loss-free resistor (LFR) | 무손실 저항(LFR) | 无损电阻（LFR） |
| linear regulator | 선형 레귤레이터 | 线性稳压器 |
| rating | 정격 | 额定值 |
| fuse | 퓨즈 | 保险丝 |

## Magnetics

| English | 한국어 | 中文 |
| --- | --- | --- |
| magnetics · magnetic component | 자성 부품 | 磁性元件 |
| core · ferrite | 코어 · 페라이트 | 磁芯 · 铁氧体 |
| air gap · fringing | 공극 · 프린징 | 气隙 · 边缘磁通 |
| flux · flux density · flux linkage | 자속 · 자속 밀도 · 쇄교 자속 | 磁通 · 磁通密度 · 磁链 |
| peak flux density · saturation flux density | 최대 자속 밀도 · 포화 자속 밀도 | 峰值磁通密度 · 饱和磁通密度 |
| saturation | 포화 | 饱和 |
| magnetic field intensity · magnetomotive force | 자계 세기 · 기자력 | 磁场强度 · 磁动势 |
| permeability · relative · of free space | 투자율 · 비투자율 · 진공 투자율 | 磁导率 · 相对磁导率 · 真空磁导率 |
| reluctance · magnetic circuit | 자기저항 · 자기 회로 | 磁阻 · 磁路 |
| Ampère's law · Faraday's law | 앙페르 법칙 · 패러데이 법칙 | 安培环路定律 · 法拉第定律 |
| volt-seconds · flux swing | 전압-초 · 자속 변화폭 | 伏秒积 · 磁通摆幅 |
| B-H loop · hysteresis · eddy current | B-H 루프 · 히스테리시스 · 와전류 | B-H 回线 · 磁滞 · 涡流 |
| core loss · Steinmetz equation | 코어 손실 · 스타인메츠 식 | 磁芯损耗 · Steinmetz 公式 |
| inductance factor A_L | 인덕턴스 계수 A_L | 电感系数 A_L |
| effective area · effective path length · effective volume | 유효 단면적 · 유효 자로 길이 · 유효 체적 | 有效截面积 · 有效磁路长度 · 有效体积 |
| core geometrical constant K_g | 코어 기하 상수 K_g | 磁芯几何常数 K_g |
| window · window utilization | 창 · 창 이용률 | 窗口 · 窗口利用率 |
| winding window | 권선 창 | 绕线窗口 |
| winding · turns · turns ratio | 권선 · 턴 수 · 권선비 | 绕组 · 匝数 · 匝比 |
| primary · secondary winding | 1차 권선 · 2차 권선 | 一次绕组 · 二次绕组 |
| dot (polarity mark) | 점 표시(극성) | 同名端 |
| reset winding | 리셋 권선 | 复位绕组 |
| core reset · reset limit | 코어 리셋 · 리셋 한계 | 磁复位 · 磁复位限制 |
| referred to the primary · reflected voltage | 1차 측으로 환산 · 반사 전압 | 折算到一次侧 · 反射电压 |
| magnetizing inductance · magnetizing current | 자화 인덕턴스 · 자화 전류 | 励磁电感 · 励磁电流 |
| leakage inductance · coupling coefficient | 누설 인덕턴스 · 결합 계수 | 漏感 · 耦合系数 |
| coupled inductor · mutual inductance | 결합 인덕터 · 상호 인덕턴스 | 耦合电感 · 互感 |
| short-circuit inductance · short-circuit test | 단락 인덕턴스 · 단락 시험 | 短路电感 · 短路测试 |
| winding resistance · winding loss · copper loss | 권선 저항 · 권선 손실 · 동손 | 绕组电阻 · 绕组损耗 · 铜损 |
| skin effect · skin depth · proximity effect | 표피 효과 · 표피 깊이 · 근접 효과 | 集肤效应 · 集肤深度 · 邻近效应 |
| Dowell's factor · porosity | Dowell 계수 · 층의 점유율 | Dowell 系数 · 孔隙率 |
| round wire · foil · litz wire | 둥근 선 · 박판 · 리츠선 | 圆导线 · 铜箔 · 利兹线 |
| interleaving (P-S-P) | 인터리빙(P-S-P) | 交错绕制（P-S-P） |
| snubber · clamp · RCD clamp | 스너버 · 클램프 · RCD 클램프 | 缓冲电路 · 钳位 · RCD 钳位 |
| clamping voltage · breakdown voltage | 클램프 전압 · 항복 전압 | 钳位电压 · 击穿电压 |
| ringing · resonance | 링잉 · 공진 | 振铃 · 谐振 |

## Losses, bench and measurement

| English | 한국어 | 中文 |
| --- | --- | --- |
| conduction loss · switching loss | 도통 손실 · 스위칭 손실 | 导通损耗 · 开关损耗 |
| capacitive turn-on loss · gate-drive loss | 용량성 턴온 손실 · 게이트 구동 손실 | 容性开通损耗 · 栅极驱动损耗 |
| efficiency | 효율 | 效率 |
| layout · hot loop | 레이아웃 · 핫 루프 | 布局 · 高 di/dt 回路 |
| gate drive · gate charge · Miller plateau | 게이트 구동 · 게이트 전하 · 밀러 플래토 | 栅极驱动 · 栅极电荷 · 米勒平台 |
| gate-drain charge · plateau voltage · driver | 게이트-드레인 전하 · 플래토 전압 · 드라이버 | 栅漏电荷 · 平台电压 · 驱动器 |
| bootstrap capacitor · shoot-through | 부트스트랩 커패시터 · 슛스루 | 自举电容 · 直通 |
| current sensing · shunt · current-sense amplifier | 전류 센싱 · 션트 · 전류 센스 증폭기 | 电流检测 · 分流电阻 · 电流检测放大器 |
| high-side · low-side · Kelvin connection · pad | 하이사이드 · 로우사이드 · 켈빈 연결 · 패드 | 高侧 · 低侧 · 开尔文连接 · 焊盘 |
| sense resistor · sense voltage · full scale | 센스 저항 · 센스 전압 · 풀스케일 | 检测电阻 · 检测电压 · 满量程 |
| input offset voltage · anti-aliasing filter | 입력 오프셋 전압 · 안티에일리어싱 필터 | 输入失调电压 · 抗混叠滤波器 |
| burden voltage · offset | 부담 전압 · 오프셋 | 负担电压 · 失调 |
| four-wire (Kelvin) measurement | 4선식(켈빈) 측정 | 四线（开尔文）测量 |
| probe · oscilloscope · ground lead | 프로브 · 오실로스코프 · 접지 리드 | 探头 · 示波器 · 接地线 |
| an ohmmeter's test leads | 테스트 리드 | 表笔 |
| effective value (a meter's reading, parasitics included) | 유효값 | 等效值 |
| differential probe · current probe | 차동 프로브 · 전류 프로브 | 差分探头 · 电流探头 |
| rise time · bandwidth | 상승 시간 · 대역폭 | 上升时间 · 带宽 |
| Nyquist frequency · aliasing | 나이퀴스트 주파수 · 에일리어싱 | 奈奎斯特频率 · 混叠 |
| thermal resistance · junction temperature | 열저항 · 접합 온도 | 热阻 · 结温 |
| heat sink | 방열판 | 散热器 |
| inrush current · soft start | 돌입 전류 · 소프트 스타트 | 浪涌电流 · 软启动 |
| undervoltage lockout (UVLO) | 저전압 차단(UVLO) | 欠压锁定（UVLO） |
| impedance analyzer · LCR meter | 임피던스 분석기 · LCR 미터 | 阻抗分析仪 · LCR 测试仪 |
| impedance meter · apparent inductance | 임피던스 측정기 · 겉보기 인덕턴스 | 阻抗测量仪 · 表观电感 |
| an oscilloscope's earth | 대지 | 保护接地 |
| evaluation board | 평가 보드 | 评估板 |
| data sheet · manufacturer | 데이터시트 · 제조사 | 数据手册 · 厂商 |
| function generator · square wave · sine wave | 함수 발생기 · 구형파 · 정현파 | 函数发生器 · 方波 · 正弦波 |
| deskew (probes) | 디스큐 | 时延校正（deskew） |
| load transient · worst case | 부하 과도 · 최악 조건 | 负载瞬态 · 最坏情况 |

## Harvesting

| English | 한국어 | 中文 |
| --- | --- | --- |
| energy harvesting | 에너지 하베스팅 | 能量收集 |
| piezoelectric element · source | 압전 소자 · 압전 전원 | 压电元件 · 压电源 |
| maximum power transfer · matched load | 최대 전력 전달 · 정합된 부하 | 最大功率传输 · 匹配负载 |
| maximum power point tracking (MPPT) | 최대 전력점 추종(MPPT) | 最大功率点跟踪（MPPT） |
| synchronous electric charge extraction (SECE) | 동기 전하 추출(SECE) | 同步电荷提取（SECE） |
| synchronized switch harvesting on inductor (SSHI) | SSHI | 同步电感开关收集（SSHI） |
| standard interface (bridge onto a dc voltage) | 표준 인터페이스 | 标准接口电路 |
| envelope | 포락선 | 包络 |
| figure of merit (of a triboelectric generator) | 성능 지수 | 优值（性能优值 · 结构优值） |

## Simulation and numerics

| English | 한국어 | 中文 |
| --- | --- | --- |
| simulation · simulator | 시뮬레이션 · 시뮬레이터 | 仿真 · 仿真器 |
| run (a simulation) | 실행 | 运行（仿真） |
| a simulator advances a circuit in time | 시뮬레이션한다 · 계산한다 | 仿真 · 计算 |
| time step · sub-step | 타임 스텝 · 하위 스텝 | 时间步长 · 子步 |
| schematic · netlist · directive | 회로도 · 넷리스트 · 지시문 | 原理图 · 网表 · 仿真指令 |
| transient analysis | 과도 해석 | 瞬态分析 |
| trapezoidal rule · backward Euler · forward Euler · Gear | 사다리꼴 규칙 · 후진 오일러 · 전진 오일러 · Gear | 梯形法 · 后向欧拉法 · 前向欧拉法 · Gear 法 |
| backward differentiation formula · companion model | 후진 차분 공식 · 동반 모델 | 后向差分公式 · 伴随模型 |
| piecewise-linear · matrix exponential · eigenvalue | 구간별 선형 · 행렬 지수 함수 · 고윳값 | 分段线性 · 矩阵指数 · 特征值 |
| Newton's method · bisection | 뉴턴법 · 이분법 | 牛顿法 · 二分法 |
| event · converge | 이벤트 · 수렴 | 事件 · 收敛 |
| from rest (a start-up) | 정지 상태에서 시작한 | 从零初始状态开始 |
| operating-mode view · all modes at once | 동작 모드 보기 · 모든 모드 한눈에 보기 | 工作模态视图 · 全部模态一览 |
| case (of the SPICE library) | 케이스 | 算例 |
| relative difference · unit roundoff | 상대 차이 · 단위 반올림 오차 | 相对差 · 单位舍入误差 |
| stiff (equations) · test equation | stiff · 시험 방정식 | 刚性（stiff）· 试验方程 |
| decaying mode · tolerance · A-stable · L-stable | 감쇠 모드 · 허용오차 · A-안정 · L-안정 | 衰减模态 · 容差 · A 稳定 · L 稳定 |
| headless browser | 헤드리스 브라우저 | 无头浏览器 |
