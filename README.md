# Switching Converter Study · 스위칭 컨버터 스터디

[English](#english) · [한국어](#한국어)

Site: <https://denny-hwang.github.io/switching_converter_study/>

---

## English

### What

An open, bilingual (English canonical, Korean mirror) learning repository on
power electronics for electrical engineers — switching-converter theory
(CCM/DCM), topologies, magnetics, loss modeling and energy-harvesting
interfaces — plus a GitHub Pages web app that combines **learning** (docs,
quizzes, missions), **design** (calculators) and **simulation** (an in-browser
time-domain converter simulator, CircuitJS links, LTspice/ngspice files).

### Why

To go from quoting a textbook conversion ratio to designing, simulating and
measuring a converter — and explaining why the measurement disagrees with the
formula. The repository is built to be **verifiable end-to-end**:

- every equation lives once, in `packages/pe-core/equations/equations.yaml`;
  its LaTeX is generated, its derivation is reproduced in sympy, and the
  TypeScript engine must match the Python reference on shared vectors to
  1e-9 relative;
- every equation and device/method claim carries a key from `references.bib`,
  and unverified entries cannot be cited on published pages;
- math renders with KaTeX in strict mode, the built site is link-checked, and
  a privacy scan runs in CI (see `PRIVACY_RULES.md`).

### How to run

Requirements: Node.js ≥ 22.12, Python ≥ 3.11.

```sh
npm install && npm run dev            # site + tools at http://localhost:4321/switching_converter_study/
npm run build                         # strict KaTeX build (fails on math errors)
npm test                              # vitest (pe-core) + TS/Python parity
pip install -e "python[dev]" && pytest # sympy derivations + vectors
python scripts/gen_equations.py       # regenerate LaTeX, test vectors, derivations, bibliography JSON
python scripts/mathlint.py            # math lint
python scripts/privacy_scan.py        # privacy scan
python scripts/refcheck.py            # citation check
node scripts/keyboard_check.mjs       # keyboard focus order of the tool pages (after the build)
```

### Repository map

| Path | Contents |
| --- | --- |
| `CLAUDE.md` | binding repository conventions |
| `PRIVACY_RULES.md` | what may never be committed |
| `docs/BUILD_SPEC.md` | the full build specification and phases |
| `docs/STATUS.md` | module × language × done-criteria matrix |
| `docs/ADR/` | architecture decision records |
| `packages/pe-core/` | TypeScript engine; `equations/` holds the single source of truth |
| `python/pe_core/` | verification side: sympy, LaTeX and vector generation, derivations |
| `scripts/` | generators and lints |
| `src/` | Astro + Starlight site (`content/docs/en`, `content/docs/ko`, components, tools) |

### Roadmap

| Phase | Scope | State |
| --- | --- | --- |
| 0 | Scaffold, CI, Pages deployment, equation pipeline skeleton | done |
| 1 | Equation engine: full seed set, derivations, parity, math/citation lints | done |
| 2 | Core content: theory + main topologies (EN, then KO) | done: 00-foundations, 01-physics, 02-theory and 03-topologies (EN + KO) |
| 3 | Time-domain simulator and design tools | in progress: simulator (3a), converter designer and loss budget (3b) done |
| 4 | Magnetics, bench, harvesting, gotchas, resources | planned |
| 5 | LTspice/ngspice/CircuitJS library, missions, v0.1.0 | planned |

### Contributing and licences

See `CONTRIBUTING.md` for the module template, the equation workflow and the
citation rules. Documentation: CC BY-SA 4.0 (`LICENSE-DOCS`). Code: MIT
(`LICENSE-CODE`).

---

## 한국어

### 무엇인가

전기공학 엔지니어를 위한 전력전자 공개 학습 저장소입니다(영어 원본,
한국어 미러). 스위칭 컨버터 이론(CCM/DCM), 토폴로지, 자성 부품, 손실
모델링, 에너지 하베스팅 인터페이스를 다루며, **학습**(문서, 퀴즈, 미션),
**설계**(계산기), **시뮬레이션**(브라우저 기반 시간 영역 컨버터 시뮬레이터,
CircuitJS 링크, LTspice/ngspice 파일)을 하나로 묶은 GitHub Pages 웹 앱을
함께 제공합니다.

### 왜 만드는가

교과서의 변환비를 외우는 단계에서 벗어나, 컨버터를 설계·시뮬레이션·측정하고
측정값이 공식과 다른 이유까지 설명할 수 있도록 하기 위해서입니다. 이
저장소는 **처음부터 끝까지 검증 가능**하도록 만들어집니다.

- 모든 수식은 `packages/pe-core/equations/equations.yaml` 한 곳에만 존재하며,
  LaTeX는 자동 생성되고, 유도 과정은 sympy로 재현되고, TypeScript 엔진은
  공유 벡터에서 Python 기준 구현과 상대오차 1e-9 이내로 일치해야 합니다.
- 모든 수식과 소자·방법에 대한 주장은 `references.bib`의 키를 가지며,
  검증되지 않은 항목은 공개 페이지에서 인용할 수 없습니다.
- 수식은 KaTeX 엄격 모드로 렌더링되고, 빌드된 사이트의 링크를 검사하며,
  CI에서 개인정보 스캔을 수행합니다(`PRIVACY_RULES.md` 참고).

### 실행 방법

필요 사항: Node.js ≥ 22.12, Python ≥ 3.11.

```sh
npm install && npm run dev            # 사이트 + 도구: http://localhost:4321/switching_converter_study/
npm run build                         # KaTeX 엄격 빌드 (수식 오류 시 실패)
npm test                              # vitest (pe-core) + TS/Python 패리티
pip install -e "python[dev]" && pytest # sympy 유도 + 벡터
python scripts/gen_equations.py       # LaTeX·테스트 벡터·유도·참고문헌 JSON 재생성
python scripts/mathlint.py            # 수식 린트
python scripts/privacy_scan.py        # 개인정보 스캔
python scripts/refcheck.py            # 인용 검사
node scripts/keyboard_check.mjs       # 도구 페이지의 키보드 포커스 순서 (빌드 후)
```

### 저장소 구조

| 경로 | 내용 |
| --- | --- |
| `CLAUDE.md` | 구속력 있는 저장소 규약 |
| `PRIVACY_RULES.md` | 절대 커밋하면 안 되는 것 |
| `docs/BUILD_SPEC.md` | 전체 빌드 명세와 단계 |
| `docs/STATUS.md` | 모듈 × 언어 × 완료 기준 매트릭스 |
| `docs/ADR/` | 아키텍처 결정 기록 |
| `packages/pe-core/` | TypeScript 엔진; `equations/`가 단일 원본(single source of truth) |
| `python/pe_core/` | 검증 측: sympy, LaTeX·벡터 생성, 유도 |
| `scripts/` | 생성기와 린트 |
| `src/` | Astro + Starlight 사이트 (`content/docs/en`, `content/docs/ko`, 컴포넌트, 도구) |

### 로드맵

| 단계 | 범위 | 상태 |
| --- | --- | --- |
| 0 | 골격, CI, Pages 배포, 수식 파이프라인 뼈대 | 완료 |
| 1 | 수식 엔진: 전체 기본 세트, 유도, 패리티, 수식·인용 린트 | 완료 |
| 2 | 핵심 콘텐츠: 이론 + 주요 토폴로지 (영어 후 한국어) | 완료: 00-기초, 01-물리, 02-이론, 03-토폴로지(영어·한국어) |
| 3 | 시간 영역 시뮬레이터와 설계 도구 | 진행 중: 시뮬레이터(3a), 컨버터 설계 도구와 손실 예산(3b) 완료 |
| 4 | 자성 부품, 벤치, 하베스팅, 흔한 함정, 자료 모음 | 예정 |
| 5 | LTspice/ngspice/CircuitJS 라이브러리, 미션, v0.1.0 | 예정 |

### 기여와 라이선스

모듈 템플릿, 수식 작업 흐름, 인용 규칙은 `CONTRIBUTING.md`를 참고하세요.
문서: CC BY-SA 4.0(`LICENSE-DOCS`). 코드: MIT(`LICENSE-CODE`).
