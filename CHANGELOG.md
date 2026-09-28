# Changelog

Every release of this repository and what it holds, newest first. The format follows Keep a Changelog
(version 1.1.0); version numbers follow Semantic Versioning (2.0.0). A Korean summary of each release
follows the English entries.

## [Unreleased]

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
