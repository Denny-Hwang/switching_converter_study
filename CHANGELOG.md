# Changelog

Every release of this repository and what it holds, newest first. The format follows Keep a Changelog
(version 1.1.0); version numbers follow Semantic Versioning (2.0.0). A Korean and a Chinese summary of
each release follow the English entries.

## [Unreleased]

## [0.2.0] - 2026-09-29

The site in a third language, Chinese (Simplified), and a wording pass over the English and Korean
text (pull requests #28 to #31). The numbers, equations, citations and quiz answers are those of
0.1.0, apart from the fixes below.

### Added

- **Chinese (Simplified, zh-CN).** Every page in Chinese, at the English page's path under `/zh/`: the
  90 pages, the 55 quizzes and the nine missions' acceptance criteria. Each page mirrors its English
  page (headings in order, components, inline math, numbers with units, links) and was read against
  the English by a second reader. The text is written as a mainland textbook writes it, with the
  English term in parentheses at a term's first use, as the Korean pages do. (#30, #31)
- **The tools and data in Chinese**: the UI strings, the operating-mode view, the tools' symbol
  meanings, figure captions and text alternatives, example labels, presets, resource notes, the
  equation catalogue and the derivation steps. The tools' screenshots and the README's pictures exist
  in Chinese, and the README has a Chinese section. (#30, #31)
- **Punctuation per language.** Where the code joins translated strings (a colon, a list,
  parentheses, the space between sentences), `PUNCT` gives each language's marks: Chinese uses
  full-width marks and no space between sentences. The operating-mode drawings measure CJK
  characters, and their overlap tests run in every language. (#30)
- **A glossary** (`docs/GLOSSARY.md`): the site's terms in English, Korean and Chinese. (#29 to #31)
- **Checks for the Chinese pages.** `modulelint` compares every English and Chinese page pair as it
  does the Korean ones (headings, components, quizzes, mission criteria), and STATUS's Chinese table
  decides which Chinese pages must exist. The equation catalogue's Chinese fields and a Chinese
  meaning for every tool input are required. The browser checks of the keyboard focus order and of
  the operating-mode drawings open the Chinese pages too. (#30, #31)

### Changed

- **Wording, in English and Korean**: pages, quizzes, mission criteria, derivation steps, the equation
  catalogue, resources, UI strings, the generated SPICE and CircuitJS1 READMEs and code comments. The
  text says what a thing is and what it does, without framing or repeated asides. The Korean is
  natural engineering Korean in the -ㅂ니다 style, with one vocabulary across pages, UI and catalogue.
  BUILD_SPEC §8 states the rules. (#29)
- **Three languages.** The landing page, About, the missions index, M9 and the simulator page no
  longer say "bilingual". M9 also asks for the Chinese page, as a new criterion; ticks already given
  keep their ids. CLAUDE.md and BUILD_SPEC name the Chinese version. (#30)
- **Link checks.** CLAUDE.md's link check copies the site under the Pages path and runs the lychee
  binary, as CI does. `resources_check` tries a URL that neither its host nor the Internet Archive
  answered again after 60, 180 and 300 s, since the archive rate-limits a runner for minutes. (#28)
- **This release**: versions set to 0.2.0. This changelog gains a Chinese summary, which a test keeps
  starting with the latest release, as it does the Korean one.

### Fixed

- **Korean sentences that said something other than the English** (#29):
  - the window utilization K_u is the share of the window that can be wound, not the copper's actual
    share (`04-magnetics/design-procedure`);
  - the RCD clamp settles where the resistor dissipates the power the clamp takes, not a power of the
    resistor's own (`08-gotchas/flyback-open-load`);
  - in the note of `loop.T` (the loop gain), the phases of the factors add, not their magnitudes.
- **M1's install command** is the README's, `pip install -e "python[dev,figures]"`: without the
  extras, its step 5 could not run pytest. (#29)
- **The simulator page** says "Further suites", since three follow, not two; in Korean too, the SPICE
  comparison's default on-resistance is 1 mΩ, as in the netlists. (#29)

## [0.1.0] - 2026-09-28

The first release: the site, its tools and the checks behind them, built in the phases of
`docs/BUILD_SPEC.md` (pull requests #1 to #27). The numbers in examples are round teaching values,
labelled as examples, or a data sheet's cited values for a generic part, such as the magnetics
designer's cores (`PRIVACY_RULES.md`).
Not in this release: the converter designer's DCM target, and the topologies the plan leaves for later
(Ćuk, SEPIC and Zeta, bridges, LLC, charge pumps, LDOs, rectifiers); `docs/STATUS.md` lists them.

### Added

- **Pages, English and Korean.** 90 pages in each language, the Korean a full translation of the
  English:
  - 46 module pages in the full template: intent, theory, worked example, try it, bench exercise,
    gotchas, go deeper and quiz;
  - the sections are 00 Foundations, 01 Physics, 02 Theory, 03 Topologies, 04 Magnetics,
    05 Simulation, 06 Bench, 07 Harvesting, 08 Gotchas (13 mistakes, from symptom to fix) and
    09 Missions (9, with acceptance criteria and a progress tracker kept in the browser);
  - 10 Resources lists 86 books, courses, videos, application notes, tools and papers, each opened
    and title-matched;
  - 55 quizzes in each language. (#1 to #9, #13, #16 to #20, #22 to #24)
- **One source for every equation.** 185 equations in `packages/pe-core/equations/equations.yaml`,
  162 of them derived by sympy. Their LaTeX, test vectors and derivation pages are generated from it,
  and the TypeScript evaluators agree with the Python reference to 1e-9 relative. (#2)
- **Verified references.** 70 entries in `references.bib`, each verified in two rounds, with DOIs
  checked against Crossref. 69 synthetic example files hold the numbers of the worked examples and
  presets; quizzes label their own numbers as synthetic.
- **In-browser simulator** for the buck, boost, buck-boost, flyback and forward converters. It covers:
  - CCM and DCM, with node-capacitance ringing;
  - resistive, battery, capacitor and fixed loads, and a current-limited source;
  - a diagnosis when a circuit has no steady state;
  - the operating modes one by one, with current paths and element states, and all at once as a
    paper lays them out: key waveforms with the modes' boundaries, then each mode's circuit.

  It is validated against the formulas to within 2 % and against ngspice. (#6, #14, #15, #25)
- **Design tools**: the equation explorer, converter designer, loss budget, clamp check, source matcher,
  sense chain and magnetics designer, each result naming its equation. (#3, #7 to #9, #13)
- **Values as a datasheet writes them** in every tool's fields: SI prefixes, the field's unit (0.3 T,
  5 mm, 100 mm²), percentages and a Korean keyboard's unit symbols. Text that is not a number is
  marked. (#26)
- **SPICE library** (`sim/`): the five converters in seven cases, as LTspice schematics and ngspice
  netlists. Each comes with what to plot and ngspice's waveforms, and is checked against ngspice and
  the equations. (#21)
- **CircuitJS1 (Falstad)**: the same seven cases as circuits and share links that open at about one
  switching period a second, starting at the steady state. With a resistive load and no Thevenin
  source, the simulator opens its form's values in CircuitJS1 once they reach a steady state, and
  names what CircuitJS1's circuit leaves out (a winding resistance, a diode drop, a node capacitance).
  (#24, #26)
- **Readable pages and tools**: a short meaning next to every symbol, under every equation, in every
  worked example and at every tool input; settings beside the chart, and charts in the page's light
  or dark theme; the English term in parentheses at a Korean technical term's first use. (#10, #11)
- **Figures drawn from code**: schematics and waveforms, in both themes. A README with screenshots.
  (#12)
- **Checks**, run by CI on every pull request:
  - Node: typecheck; vitest (the engine, the simulator's validation, the tools, and TypeScript/Python
    parity);
  - Python: pytest (the sympy derivations); the generated equations and figures compared with the
    committed files; `mathlint`, `modulelint`, `privacy_scan`, `refcheck` and `resources_check`; the
    CircuitJS1 circuits' wiring against the SPICE netlists;
  - ngspice: the simulator and the SPICE library against ngspice and the equations;
  - online: DOIs against Crossref; every resource URL opened and its title matched; every CircuitJS1
    share link run on falstad.com against the ideal equations;
  - site: the strict KaTeX build; the reproducible-build check; `#fragment` anchors; the keyboard
    focus order of every tool page; the operating-mode drawings' text boxes in a browser; every link
    (lychee).

  After each deployment, the published site is fetched in both languages.
- **Reproducible build** (Phase 5e). Two parts of the built site were not reproducible: React islands'
  ids, which Astro derives from the checkout's path, and the order of Pagefind's languages, which it
  writes in no fixed order. `scripts/postbuild.mjs`, run by `npm run build`, fixes both.
  `scripts/repro_check.sh` builds HEAD's files at another path with `npm ci && npm run build` and
  requires the same site, byte for byte; CI runs it.
- **Korean parity guard** (Phase 5e). `modulelint` compares every English and Korean page pair: the
  same path, the same heading levels in order and the same components, code left out.
- **This release** (Phase 5e): this changelog, and versions set to 0.1.0 in the npm workspace,
  `pe-core` and the Python package. A test keeps the versions equal to the changelog's latest release,
  another keeps `docs/STATUS.md`'s counts equal to the repository's, and the README's list of checks
  now matches CI.

## 한국어 요약

### [0.2.0] - 2026-09-29

세 번째 언어인 중국어(간체)를 더하고, 영어와 한국어 문구를 다듬었습니다(PR #28부터 #31까지). 수치, 수식,
인용, 퀴즈 정답은 아래의 고친 내용을 빼면 0.1.0과 같습니다.

- **중국어 페이지.** 90쪽 전체, 퀴즈 55개, 미션 9개의 완료 기준을 영어 페이지와 같은 경로의 `/zh/` 아래에
  두었습니다. 각 페이지의 제목 순서, 컴포넌트, 수식, 단위가 붙은 수치, 링크는 영어 페이지와 같으며, 두 번째
  검토자가 모든 페이지를 영어와 대조했습니다. 본문은 중국 본토 교과서의 문체를 따르고, 기술 용어를 처음 쓸 때
  영어를 괄호 안에 함께 적습니다.
- **중국어 도구와 데이터.** 화면 문구, 동작 모드 보기, 도구의 기호 설명, 그림 설명과 대체 텍스트, 예제 이름,
  프리셋, 자료 설명, 수식 카탈로그, 유도 과정이 중국어로도 있습니다. 도구 스크린샷과 README 그림도 중국어판이
  있고, README에 중국어 절이 있습니다.
- **언어별 문장 부호.** 코드가 번역 문자열을 이어 붙일 때 쓰는 콜론, 목록 구분, 괄호, 문장 사이 공백을
  언어마다 정합니다. 중국어는 전각 부호를 쓰고 문장 사이를 띄우지 않습니다.
- **용어집**(`docs/GLOSSARY.md`). 사이트의 용어를 영어, 한국어, 중국어로 정리했습니다.
- **중국어 검사.** 모든 영어·중국어 페이지 쌍을 한국어와 같은 방식으로 대조합니다. 수식 카탈로그의 중국어
  필드와 모든 도구 입력의 중국어 설명이 필수이며, 브라우저 검사도 중국어 페이지를 엽니다.
- **문구 정리.** 영어와 한국어 전체에서 설명 방식을 소개하는 말과 되풀이되는 부연을 없앴습니다. 한국어는
  자연스러운 공학 한국어와 -ㅂ니다체로 쓰고, 페이지, 화면, 카탈로그에서 같은 용어를 씁니다. 규칙은
  BUILD_SPEC §8에 있습니다.
- **링크 검사.** CLAUDE.md의 링크 검사 명령이 CI와 같아졌습니다. `resources_check`는 호스트와 인터넷
  아카이브(Internet Archive)가 모두 응답하지 않은 URL을 60초, 180초, 300초 뒤에 다시 확인합니다.
- **고친 내용.** 한국어에서 창 이용률 K_u의 뜻, RCD 클램프의 전력 균형, `loop.T`의 설명(인수들의 위상이
  더해짐)을 영어와 같게 바로잡았습니다. M1의 설치 명령은 README와 같은
  `pip install -e "python[dev,figures]"`입니다.
- **이번 릴리스.** 모든 패키지의 버전을 0.2.0으로 맞추고, 이 변경 기록에 중국어 요약을 더했습니다.

### [0.1.0] - 2026-09-28

첫 릴리스입니다. `docs/BUILD_SPEC.md`의 단계를 따라 만든 사이트, 도구, 그리고 이를 뒷받침하는 검사를 담고
있습니다(PR #1부터 #27까지). 예제의 수치는 예제로 표시한 교육용 어림수이거나, 출처를 밝힌
데이터시트 값(자성 부품 설계 도구의 코어처럼 일반 부품의 값)입니다. 컨버터 설계 도구의 DCM 목표와,
계획에서 뒤로 미룬 토폴로지(Ćuk·SEPIC·Zeta, 브리지, LLC, 차지 펌프, LDO, 정류기)는 이번 릴리스에
없으며 `docs/STATUS.md`에 적혀 있습니다.

- **페이지.** 영어와 한국어로 각각 90쪽이며, 한국어는 영어의 전체 번역입니다.
  - 전체 템플릿을 갖춘 모듈 페이지 46쪽
  - 주의할 점 13가지, 완료 기준과 진행 상황 기록을 갖춘 미션 9개
  - 열어서 제목을 확인한 자료 86건
  - 언어별 퀴즈 55개
- **수식의 단일 원본.** 수식 185개(그중 162개는 sympy로 유도)가 한 파일에서 나오며, TypeScript와
  Python 구현이 상대 오차 1e-9 이내로 일치합니다.
- **검증된 참고문헌.** 두 차례 확인한 70건이며, DOI는 Crossref와 대조합니다.
- **브라우저 시뮬레이터.** 다섯 가지 컨버터를 다룹니다.
  - CCM/DCM, 노드 커패시턴스 링잉, 여러 부하와 전류 제한 전원
  - 정상상태가 없을 때의 진단
  - 모드별 보기와, 논문처럼 모든 모드를 한 번에 보는 그림
  - 수식과 2 % 이내, 그리고 ngspice와 일치하도록 검증
- **설계 도구 7종.** 모든 입력칸에 데이터시트 표기(접두어, 단위, %, 한글 자판 단위 기호)를 쓸 수
  있습니다.
- **SPICE 라이브러리.** 다섯 컨버터의 일곱 사례를 LTspice 회로도와 ngspice 넷리스트로 제공합니다.
- **CircuitJS1 회로와 공유 링크.** 정상상태에서 천천히 시작합니다. 테브난 전원(Thevenin source) 없이
  저항 부하라면 시뮬레이터에 입력한 값으로도 정상상태에 이른 뒤 열 수 있으며, CircuitJS1 회로에서
  빠지는 부분(권선 저항, 다이오드 전압 강하, 노드 커패시턴스)을 함께 알려 줍니다.
- **읽기 쉬운 페이지와 도구.** 모든 기호 옆에 짧은 뜻을 적고, 설정을 차트 옆에 두며, 차트는 페이지의
  밝은 테마와 어두운 테마를 따릅니다. 한국어 기술 용어는 처음 쓸 때 영어를 괄호 안에 함께 적습니다.
- **코드로 그린 그림.** 회로도와 파형을 두 테마 모두에 맞게 그립니다.
- **검사.** CI가 모든 PR에서 엔진, 시뮬레이터, 도구, 유도, 생성 파일, 린트, ngspice, 온라인 링크,
  빌드를 확인합니다.
- **재현 가능한 빌드.** 저장소의 파일을 다른 경로에 새로 풀어 `npm ci && npm run build`로 빌드해도
  바이트 단위로 같은 사이트가 나오는지 CI가 확인합니다.
- **한국어 대응 검사.** 모든 영어·한국어 페이지 쌍의 경로, 제목 수준, 컴포넌트를 대조합니다.
- **이번 릴리스.** 이 변경 기록을 추가하고 모든 패키지의 버전을 0.1.0으로 맞췄습니다. 테스트가 버전과
  `docs/STATUS.md`의 수치를 확인합니다.

## 中文摘要

### [0.2.0] - 2026-09-29

新增第三种语言简体中文，并修订了英文和韩文的措辞（PR #28 至 #31）。除下列更正外，数值、公式、引用和测验答案与 0.1.0 相同。

- **中文页面。** 全部 90 个页面、55 套测验和 9 个任务的验收标准都有中文版，位于与英文页面对应的 `/zh/` 路径下。各页面的标题顺序、组件、公式、带单位的数值和链接与英文页面一致，并由第二位审阅者对照英文逐页审阅。正文采用中国大陆教材的文体，术语首次出现时在括号中给出英文。
- **中文工具与数据。** 界面文字、工作模态视图、工具的符号含义、图题与替代文本、示例名称、预设、资料说明、公式目录和推导步骤都有中文。工具截图和 README 插图有中文版，README 有中文部分。
- **按语言设定标点。** 代码拼接译文时使用的冒号、列表分隔符、括号和句间空格按语言设定：中文使用全角标点，句间不留空格。
- **术语表**（`docs/GLOSSARY.md`）。以英文、韩文和中文列出本站术语。
- **中文检查。** 像检查韩文页面一样，逐对比较英文与中文页面；公式目录的中文字段和每个工具输入项的中文含义为必填项；浏览器检查也打开中文页面。
- **措辞修订。** 删去英文和韩文中交代写法的语句和重复的附带说明；韩文统一为自然的工程用语和 -ㅂ니다 体，页面、界面和公式目录使用同一套术语。规则见 BUILD_SPEC §8。
- **链接检查。** CLAUDE.md 中的链接检查命令与 CI 一致；对主机和互联网档案馆（Internet Archive）均未应答的 URL，`resources_check` 在 60 s、180 s 和 300 s 后重试。
- **更正。** 韩文中窗口利用率 K_u 的含义、RCD 钳位的功率平衡以及 `loop.T` 的说明（各因子的相位相加）已与英文一致；M1 的安装命令与 README 相同，为 `pip install -e "python[dev,figures]"`。
- **本次发布。** 所有软件包的版本统一为 0.2.0，本变更记录增加中文摘要。

### [0.1.0] - 2026-09-28

首个版本：按 `docs/BUILD_SPEC.md` 各阶段构建的网站、工具及其背后的检查（PR #1 至 #27）。示例中的数值是标明为示例的、便于教学的整齐数值，或注明出处的数据手册值（如磁性元件设计工具中通用磁芯的数值）。本版本不含变换器设计工具的 DCM 目标，也不含计划中推迟的拓扑（Ćuk、SEPIC 和 Zeta、桥式、LLC、电荷泵、LDO、整流器），`docs/STATUS.md` 列出了这些内容。

- **页面。** 英文和韩文各 90 个页面，韩文为英文的完整译文。
  - 采用完整模板的模块页面 46 个
  - 易错点 13 个，带验收标准和进度记录的任务 9 个
  - 逐一打开并核对标题的资料 86 条
  - 每种语言 55 套测验
- **公式的单一来源。** 185 个公式（其中 162 个由 sympy 推导）出自同一个文件，TypeScript 与 Python 实现的相对误差在 1e-9 以内。
- **经核实的参考文献。** 共 70 条，每条经两轮核实，DOI 与 Crossref 核对。
- **浏览器内仿真器。** 涵盖五种变换器：
  - CCM/DCM、节点电容引起的振铃、多种负载和限流电源
  - 无稳态时的诊断
  - 逐个查看工作模态，以及像论文那样一次画出全部模态的图
  - 经验证与公式相差在 2 % 以内，并与 ngspice 一致
- **7 种设计工具。** 每个输入框都可以按数据手册的写法输入：SI 词头、单位、百分数，以及韩文键盘的单位符号。
- **SPICE 库。** 五种变换器的七个算例，提供 LTspice 原理图和 ngspice 网表。
- **CircuitJS1 电路与分享链接。** 从稳态开始，慢速运行。无戴维南电源（Thevenin source）且为电阻负载时，仿真器中输入的数值达到稳态后也可在 CircuitJS1 中打开，并注明 CircuitJS1 电路中略去的部分（绕组电阻、二极管压降、节点电容）。
- **易读的页面和工具。** 每个符号旁给出简短含义，设置位于图表旁，图表随页面的浅色和深色主题变化。韩文技术术语首次出现时在括号中给出英文。
- **由代码绘制的图。** 原理图和波形适配两种主题。
- **检查。** CI 在每个 PR 上检查引擎、仿真器、工具、推导、生成文件、lint、ngspice、在线链接和构建。
- **可复现构建。** 将仓库文件解到另一路径，用 `npm ci && npm run build` 构建，CI 检查得到的站点是否逐字节相同。
- **韩文对应检查。** 核对每一对英文和韩文页面的路径、标题级别和组件。
- **本次发布。** 增加本变更记录，所有软件包的版本统一为 0.1.0；测试检查版本和 `docs/STATUS.md` 中的数量。
