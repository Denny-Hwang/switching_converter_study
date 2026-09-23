# BUILD PROMPT — power-electronics learning repository + GitHub Pages web app

> How to use: commit `CLAUDE.md` and `PRIVACY_RULES.md` at the repo root, save this
> file as `docs/BUILD_SPEC.md`, then start Claude Code in the repo and send:
> "Read CLAUDE.md and docs/BUILD_SPEC.md. Execute Phase 0 only. Stop and report
> with the acceptance checklist." Repeat per phase. Do not let it run all phases
> in one go; review after each.

---

## 0. Mission

Build an open learning repository for electrical engineers on power electronics
that is **verifiable end-to-end**: every equation is derived and tested in code,
every claim is cited, every link is checked, and every concept can be exercised
in a browser (calculators + time-domain simulator) or on a bench (LTspice /
ngspice files + bench exercises). The site is bilingual (EN canonical, KO).

Audience: senior undergraduates, graduate students, working EEs who need to go
from "I can quote V = D·V_g" to "I can design, simulate, measure, and explain why
the measurement disagrees with the formula".

Non-goals: not a product datasheet mirror, not a place for anyone's private
measurement data, not a general electronics course (foundations module is a
compact refresher with links out).

## 1. Hard constraints (repeat of CLAUDE.md, binding)

- Privacy: `PRIVACY_RULES.md`. All example numbers come from (a) cited textbook
  examples or (b) `examples/synthetic/*.yaml`, which are round-number synthetic
  parameter sets, each labeled as an example where it appears; every page's
  footer states that example numbers are synthetic.
- Equations: `packages/pe-core/equations/equations.yaml` is the single source of
  truth; LaTeX is generated; docs embed `<Eq id="…" />`; CI diff-checks.
- Citations: `references.bib` keys everywhere; `VERIFY`-flagged entries cannot be
  cited on published pages until resolved.
- Parity: TS and Python agree on shared vectors to 1e-9 rel; simulator agrees
  with analytic steady state to ≤ 2 % on ideal parameters.
- KaTeX strict build; math lint; link check; privacy scan — all in CI.
- English canonical, Korean mirror; `docs/STATUS.md` tracks translation state.
- No fabricated URLs/videos; `resources.yaml` entries carry `retrieved:` dates.

## 2. Repository layout (create exactly this; add only inside it)

```
.
├── CLAUDE.md
├── PRIVACY_RULES.md
├── README.md                      # bilingual landing: what, why, how to run, roadmap
├── LICENSE-DOCS (CC BY-SA 4.0), LICENSE-CODE (MIT)
├── CONTRIBUTING.md                # module template, equation workflow, citation rules
├── references.bib                 # all citations; VERIFY flags allowed
├── resources.yaml                 # external learning resources (typed, tagged, dated)
├── docs/
│   ├── BUILD_SPEC.md              # this file
│   ├── STATUS.md                  # module × language × done-criteria matrix
│   └── ADR/                       # short architecture decision records
├── packages/pe-core/              # TypeScript engine (npm workspace)
│   ├── equations/
│   │   ├── equations.yaml         # SOURCE OF TRUTH (sympy expr, vars, tests, cite)
│   │   ├── equations.generated.json   # generated LaTeX + metadata (committed)
│   │   └── test_vectors.json      # generated numeric vectors (committed)
│   └── src/
│       ├── equations.ts           # evaluators, one per equation id
│       ├── modes.ts               # K, K_crit, CCM/DCM/BCM classification
│       ├── topologies/            # buck, boost, buckboost, flyback, forward, (sepic, cuk later)
│       ├── magnetics.ts           # A_L, gap, B_pk, ΔB, area product, AC resistance (Dowell)
│       ├── losses.ts              # conduction, capacitive switching, gate, Steinmetz, diode, clamp
│       ├── sim/                   # piecewise-linear time-domain simulator
│       │   ├── engine.ts          # interval state-space integration, event detection
│       │   ├── models/            # per-topology interval definitions
│       │   └── analysis.ts        # steady-state detection, averages, ripple, stresses
│       └── harvesting.ts          # source models, LFR, CV-sink extraction, matching
├── python/pe_core/                # verification side
│   ├── equations.py               # loads equations.yaml, builds sympy objects
│   ├── derive/                    # derivation notebooks/scripts (volt-second, DCM, flyback)
│   ├── gen_latex.py, gen_vectors.py
│   └── tests/                     # pytest: derivations reproduce yaml expressions; vectors
├── scripts/                       # mathlint.py, privacy_scan.py, refcheck.py, resources_check.py
├── sim/
│   ├── ltspice/<topology>/*.asc   # user-facing LTspice schematics + README (expected waveforms)
│   ├── ngspice/<topology>/*.cir   # CI-runnable netlists mirroring the .asc
│   └── falstad/<topology>.txt     # CircuitJS1 circuit text + generated share links
├── examples/synthetic/*.yaml      # the only allowed non-textbook numbers
├── src/                           # Astro/Starlight site
│   ├── content/docs/en/…          # canonical content
│   ├── content/docs/ko/…          # mirror
│   ├── components/                # Eq, Cite, Quiz, Mission, ResourceList, tool islands
│   ├── tools/                     # React islands: ConverterDesigner, MagneticsDesigner,
│   │                              # LossBudget, SenseChain, ClampCheck, SourceMatcher, Simulator
│   └── math/macros.ts             # the only KaTeX macros allowed
└── .github/workflows/             # ci.yml (test+lint), pages.yml (build+deploy)
```

Content tree (same under `en/` and `ko/`):

```
00-foundations/     circuit-laws, phasors-laplace, fourier, passives-real, semiconductors
01-physics/         faraday-inductors, transformers-coupled, ferrites-bh, gap-and-AL, core-loss
02-theory/          switching-principle, volt-second-charge-balance, ccm-dcm, k-parameter,
                    averaged-models, small-signal, rhp-zero, control-basics
03-topologies/      buck, boost, buck-boost, cuk-sepic-zeta, flyback, forward, bridges, llc,
                    charge-pump, ldo, rectifiers, comparison
04-magnetics/       design-procedure, winding-loss, leakage, snubbers-clamps, measurement
05-simulation/      ltspice, ngspice, falstad, python, in-browser-simulator
06-bench/           layout, gate-drive, current-sensing, probes, thermal, protection, low-temp
07-harvesting/      source-models, matching, lfr-dcm-flyback, sece-sshi-mppt, synthetic-case
08-gotchas/         index (one page per gotcha, tagged)
09-missions/        m1 … m9 + quizzes
10-resources/       books, courses, videos, app-notes, tools, papers (generated from resources.yaml)
```

## 3. Equation source of truth — format and workflow

`equations.yaml` entry format:

```yaml
- id: flyback.dcm.M
  title: Flyback conversion ratio, DCM
  lhs: M
  expr: "D/sqrt(K)"                # sympy-parsable; symbols from `symbols:`
  symbols: {D: duty ratio, K: "2*L_M/(R*T_s)"}
  assumptions: [ideal, dcm, steady_state, resistive_load]
  convention: "1:n transformer, n = N_s/N_p; K uses L_M (primary-referred) and actual load R"
  cite: {key: erickson2020, where: "Ch. 5–6 (DCM analysis; flyback)"}
  derived_by: python/pe_core/derive/flyback_dcm.py   # must reproduce `expr` symbolically
  tests:
    - {inputs: {D: 0.3, K: 0.09}, expect: 1.0}
    - {inputs: {D: 0.3, K: 0.01}, expect: 3.0}
  notes: "Independent of n. n only enters K_crit and stresses."
```

Workflow (enforced by CI):
1. `python scripts/gen_equations.py` → parses each `expr` with sympy, applies the
   symbol display map (`V_g`, `T_s`, `L_M`, `\Delta i_L`, …), emits LaTeX via
   `sympy.latex`, and writes `equations.generated.json` (id, latex, title, cite,
   assumptions, convention). It also evaluates `tests` and writes
   `test_vectors.json` (plus extra random vectors within declared ranges).
2. `pytest`: for every entry with `derived_by`, the derivation script must
   return an expression that `simplify(derived - expr) == 0`.
3. `vitest`: `equations.ts` must evaluate every vector to 1e-9 rel.
4. CI: regenerate and `git diff --exit-code` on both generated files.
5. Docs: `<Eq id="flyback.dcm.M" />` renders the LaTeX, a hover/expander with
   assumptions + convention, and a "verified by N tests" badge linking to the
   test file. `scripts/mathlint.py` fails on any raw `$$` in MDX outside
   `src/content/docs/**/scratch/` (which is not published).

Seed equation set (must exist by end of Phase 1; derive, don't just type):

| id | lhs = expr | cite |
|---|---|---|
| buck.ccm.M | M = D | erickson2020 Ch. 2 |
| boost.ccm.M | M = 1/(1−D) | erickson2020 Ch. 2 |
| buckboost.ccm.M | M = −D/(1−D) | erickson2020 Ch. 2 |
| flyback.ccm.M | M = n·D/(1−D) | erickson2020 Ch. 6 |
| forward.ccm.M | M = n·D (reset-winding limit D ≤ 0.5 for 1:1 reset) | erickson2020 Ch. 6 |
| buck.ripple.iL_pp | Δi_pp = (V_g−V)·D/(L·f_s) | erickson2020 Ch. 2 |
| K.def | K = 2L/(R·T_s) | erickson2020 Ch. 5 |
| Kcrit.buck / boost / buckboost | 1−D ; D(1−D)² ; (1−D)² | erickson2020 Ch. 5 |
| Kcrit.flyback | (1−D)²/n²  (K with L_M and actual R) | derive; cite erickson2020 Ch. 5–6 |
| buck.dcm.M | 2/(1+√(1+4K/D²)) | erickson2020 Ch. 5 |
| boost.dcm.M | (1+√(1+4D²/K))/2 | erickson2020 Ch. 5 |
| buckboost.dcm.M, flyback.dcm.M | D/√K (magnitude) | erickson2020 Ch. 5 |
| dcm.P_in | P = V_g²·D²/(2·L_M·f_s) | erickson2020 Ch. 5; singer1990 |
| lfr.R_in | R_in = 2·L_M·f_s/D² | singer1990; erickson2020 (LFR chapter) |
| flyback.V_crit | V_g,crit = (V+V_D)(1−D)/(n·D) — fixed-D, source-driven CCM/DCM boundary | derive from volt-second balance |
| flyback.Vds_off | V_DS = V_g + (V+V_D)/n (+ leakage spike, modeled separately) | erickson2020 Ch. 6 |
| flyback.Vds_clamped | V_DS = (V+V_D)/(n·D) at V_g = V_g,crit | derive |
| flyback.diode.VR | V_R = V + n·V_g | erickson2020 Ch. 6 |
| flyback.Ipk.dcm | I_pk = V_g·D/(L_M·f_s) | erickson2020 Ch. 5 |
| flyback.leak.E | E_lk = ½·L_lk·I_pk²; P_lk = E_lk·f_s | erickson2020 Ch. 6 (snubbers) |
| dcm.ring.f | f_ring = 1/(2π√(L_M·C_node)) | standard LC; cite erickson2020 Ch. 5 |
| mag.L_from_AL | L = A_L·N² | dixon2001; core datasheet convention |
| mag.AL_gap | A_L ≈ μ0·A_e/(l_g + l_e/μ_i) (no fringing) | dixon2001 |
| mag.B_pk | B_pk = L·I_pk/(N·A_e) | dixon2001 |
| mag.dB_faraday | ΔB = V·t_on/(N·A_e) | dixon2001 |
| loss.cond | P = I_rms²·R | erickson2020 Ch. 4 |
| loss.sw.cap | P = ½·C_node·V²·f_s | erickson2020 Ch. 4 |
| loss.gate | P = Q_g·V_gs·f_s | erickson2020 Ch. 4 |
| loss.steinmetz | P_v = k·f^α·B^β | steinmetz1984 (reprint) |
| loss.diode | P = V_F·I_avg + r_d·I_rms² | erickson2020 Ch. 4 |
| src.Pmax | P_max = V_oc²/(4R_s) | any circuits text; cite erickson2020 Ch. 1 or hart2011 |
| src.cv_extraction | η_ext = 4(V_c/V_oc)(1−V_c/V_oc) | derive (linear source, CV sink) |
| sense.current_out_monitor | V_out = I·R_S·R_L/R_G (current-output shunt monitor) | generic device datasheet (add key) |

Derivation scripts required: volt-second balance → CCM ratios; K/K_crit for the
four basic converters; DCM ratios; flyback boundary/V_crit; LFR input resistance;
CV-sink extraction fraction. Each derivation script doubles as a documented,
readable "how this was derived" page (export to MDX via a small generator, with
the sympy steps shown).

## 4. Time-domain simulator (in-browser, `packages/pe-core/src/sim`)

- Piecewise-linear state-space per topology: intervals {switch on, switch off &
  diode on, idle (DCM)}; ideal switch with R_on, diode with V_F and ideal
  blocking; optional C_node across the switch to reproduce DCM ringing.
- Integration: fixed sub-step within each interval using the exact linear
  segment solution (matrix exponential via precomputed `expm(A·dt)` per interval,
  dt = T_s/2000) — no stiffness issues; event detection for diode current
  zero-crossing and gate edges by bisection on the sub-step.
- Run to steady state: iterate cycles until max |Δstate| between cycles < tol
  (default 1e-6 relative) or N_max = 2000 cycles; report convergence.
- Outputs: waveforms (v_L, i_L/i_M, v_sw, i_diode, v_out), per-cycle averages,
  peak-to-peak ripples, detected mode (CCM/DCM/BCM), K vs K_crit, stresses,
  loss estimate (conduction/diode/capacitive), energy-per-cycle.
- Validation tests (vitest): for ideal parameters, simulated M and Δi_pp within
  2 % of analytic for buck/boost/buck-boost/flyback across a grid of D and K
  spanning both sides of K_crit; mode detection matches K/K_crit.
- Source-driven mode (for 07-harvesting): input is a Thevenin source (V_oc(t),
  R_s) charging a bus capacitor C_bus instead of a stiff V_g; V_oc(t) may be
  constant, sinusoidal envelope, or a user-drawn envelope. This is what shows the
  fixed-D flyback pinning the bus at V_g,crit when the source can supply more
  than the DCM power. Test: with V_oc ≫ V_g,crit the steady-state bus voltage
  equals V_g,crit within 2 %.

## 5. Web app (GitHub Pages) — pages and tools

Navigation: Learn · Design · Simulate · Missions · Gotchas · Resources · About.

**Learn** — Starlight docs per §2 tree. Each module page has, in order: intent
(3 lines) · theory (with `<Eq>`) · worked example (textbook/synthetic numbers,
computed by pe-core at build time, never hand-typed) · "Try it" (deep link into a
tool with preset parameters in the URL) · bench exercise · gotchas · "Go deeper"
(resources) · quiz.

**Design** (React islands, all fed by `packages/pe-core`, all parameters in the
URL hash so any state is shareable):
- ConverterDesigner: topology, V_g range, V, P or R, f_s → D range, L/L_M for
  target mode, K vs K_crit chart, ripples, stresses, capacitor sizing.
- MagneticsDesigner: core database (a small, openly documented table of generic
  E/ETD/PQ core geometries with A_e, l_e, and *manufacturer-published* A_L for
  ungapped/gapped variants entered by the contributor with citation) → turns,
  gap, B_pk/ΔB check, fill factor, DCR estimate, AC resistance (Dowell) vs
  frequency, leakage estimate by winding arrangement (interleaved vs not).
- LossBudget: enter device parameters → stacked bar of the five loss buckets
  (+ clamp/leakage for flyback) vs load and f_s; efficiency curve.
- SenseChain: shunt + current-output or voltage-output monitor + ADC:
  gain, full scale, burden, headroom vs supply, offset-equivalent current,
  parasitic pad error, RC filter pole vs sampling rate; flags each violation.
- ClampCheck: TVS/RCD clamp for flyback: reflected voltage, leakage energy,
  clamp voltage at the actual clamp current (V_BR vs V_C), margin to switch
  rating, steady-state clamp dissipation, "open-load output ceiling"
  V_out,max ≈ V_clamp/n − V_D. (Uses generic TVS parameters entered by the user.)
- SourceMatcher: linear source (V_oc, R_s, optional envelope) vs DCM-flyback LFR
  (R_in = 2L_M f_s/D²) vs CV sink; extraction fraction vs amplitude; the
  V_g = √(P·R_in) vs switch-rating conflict plotted explicitly.

**Simulate** — the pe-core simulator UI: topology tabs, parameter sliders,
waveform plots (Plotly), mode badge, "compare with formula" panel (analytic vs
simulated with % error), and per-topology links to (a) the LTspice `.asc`,
(b) the ngspice `.cir`, (c) the Falstad CircuitJS1 share link (generated from
`sim/falstad/*.txt`, opened and checked once by a human before merge).

**Missions** — 9 progressive missions with acceptance criteria and a local-only
progress tracker (localStorage; no accounts, no telemetry):
M1 derive & verify buck (edit equations.yaml, run generator) · M2 find K_crit
experimentally in the simulator · M3 boost RHP zero in small-signal page ·
M4 design a CCM buck inductor with MagneticsDesigner · M5 flyback: reflected
voltage, diode stress, clamp sizing · M6 DCM flyback as an LFR: match a synthetic
source · M7 loss budget + measure-it bench plan · M8 sense chain that does not
clip · M9 write a gotcha page from your own bench mistake (template provided).

**Gotchas** — one page each, template: symptom · why · how to confirm · fix ·
references. Seed list (all device-generic, no project data):
1. LCR meter frequency vs winding self-resonance on high-turn-count windings
2. 2-wire DCR includes lead/contact resistance → 4-wire
3. Class-2 ceramic (X7R) capacitance vs DC bias and temperature
4. TVS clamps: judge by V_C at the real clamp current, not V_BR
5. Current-output shunt monitors: output headroom is (V+ − ~1 V), independent of gain
6. Two-terminal shunts below ~1 Ω: pad/solder mΩ become gain error → Kelvin lands
7. Nano-timer power gating: mode/enable pins must be hard-tied; DONE-type inputs react to ~100 ns edges
8. Open-loop flyback with the load removed: output rises until n·V_out hits the primary clamp
9. Aluminum electrolytic ESR at low temperature
10. Wide-bandgap gate drive: recommended V_gs vs V_gs(th) max; floating gate during MCU reset → pull-down
11. Fixed-D flyback fed from a current-limited source: CCM pins the bus at V_g,crit (constant-voltage sink)
12. A DMM across the shunt reads true average current when the amplifier chain is saturating
13. Sub-Nyquist sampling of a pulsed current: "10× the switching frequency" is not oversampling when pulses are narrower than the sample spacing

**Resources** — generated from `resources.yaml` (type, title, author/org, URL,
tags, level, language, retrieved, one-line why). Filterable table + per-module
"Go deeper" lists pull from the same file.

## 6. Resources — seed list with verification status

Status: `verified` = URL/DOI confirmed on 2026-09-22 by the spec author;
`VERIFY` = known-real resource, URL to be opened and confirmed by Claude Code
before it is published (record the retrieval date; if it cannot be confirmed,
keep it out of the published site).

| type | item | URL / identifier | status |
|---|---|---|---|
| book | Erickson & Maksimović, *Fundamentals of Power Electronics*, 3rd ed., Springer 2020 | doi:10.1007/978-3-030-43881-4 | verified |
| book | Mohan, Undeland, Robbins, *Power Electronics: Converters, Applications, and Design*, 3rd ed., Wiley | ISBN 978-0-471-22693-2 | VERIFY |
| book | Basso, *Switch-Mode Power Supplies: SPICE Simulations and Practical Designs*, 2nd ed., McGraw-Hill | ISBN to confirm | VERIFY |
| book | Hart, *Power Electronics*, McGraw-Hill 2011 | ISBN to confirm | VERIFY |
| book | Würth Elektronik, *Trilogy of Magnetics* | we-online.com | VERIFY |
| course | CU Boulder, *Power Electronics Specialization* (Coursera; Erickson, Maksimović, Afridi) | https://www.coursera.org/specializations/power-electronics | verified (exists; confirm canonical URL) |
| course | CU Boulder, *Modeling and Control of Power Electronics Specialization* (Maksimović) | https://www.coursera.org/specializations/modeling-and-control-of-power-electronics | verified |
| course | MIT OCW 6.334 Power Electronics | ocw.mit.edu | VERIFY |
| video | Sam Ben-Yaakov YouTube channel (analog & power electronics; flyback/DCM intuition) | https://www.youtube.com/user/sambenyaakov/videos | verified |
| video | Analog Devices LTspice tutorial videos | analog.com (LTspice pages) | VERIFY |
| video | TI Power Supply Design Seminar recordings | https://www.ti.com/psds | VERIFY |
| app note | Dixon, *Magnetics Design Handbook* (TI/Unitrode Power Supply Design Seminar, 2001) | TI PSDS archive, SLUP series | VERIFY (locate exact SLUP number) |
| app note | TI PSDS archive index (topology reviews, control, magnetics, gate drive) | https://www.ti.com/psds | VERIFY |
| paper | Zi, Niu, Wang, Wen, Tang, Wang, "Standards and figure-of-merits for quantifying the performance of triboelectric nanogenerators," *Nat. Commun.* 6, 8376 (2015) | doi:10.1038/ncomms9376 | verified |
| paper | Singer, "Realization of loss-free resistive elements," *IEEE Trans. Circuits Syst.*, 1990 | DOI to confirm | VERIFY |
| paper | Steinmetz, "On the law of hysteresis" (1892; *Proc. IEEE* reprint 1984) | DOI to confirm | VERIFY |
| paper | Dowell, "Effects of eddy currents in transformer windings," *Proc. IEE*, 1966 | DOI to confirm | VERIFY |
| paper | Ottman et al., adaptive piezoelectric energy-harvesting circuit (DCM step-down), *IEEE TPEL* 2002 | DOI to confirm | VERIFY |
| paper | Guyomar, Badel, Lefeuvre, Richard — SSHI, *IEEE TUFFC* 2005 | DOI to confirm | VERIFY |
| paper | Lefeuvre et al. — SECE comparison, *Sens. Actuators A* 2006 | DOI to confirm | VERIFY |
| tool | LTspice (Analog Devices) | analog.com | VERIFY |
| tool | ngspice | https://ngspice.sourceforge.io/ | VERIFY |
| tool | Falstad CircuitJS1 | https://www.falstad.com/circuit/ | VERIFY |
| tool | TDK Ferrite Magnetic Design Tool | tdk-electronics.tdk.com | VERIFY |
| tool | KaTeX | https://katex.org | VERIFY |
| tool | Astro Starlight | https://starlight.astro.build | VERIFY |

Per-module "Go deeper" must link **specific** items (a particular lecture, video,
chapter, or app note), not just channels — but only after opening the URL and
matching the title. Prefer primary sources (publisher, author channel, vendor
site) over aggregators. Never link to unauthorized PDF copies of books.

## 7. Phases with acceptance criteria

### Phase 0 — Scaffold and deploy an empty site
- Astro + Starlight, i18n (en default, ko), MDX, remark-math + rehype-katex
  strict, React integration, Plotly, npm workspaces with `packages/pe-core`.
- Python package skeleton, pytest wired; `scripts/*.py` stubs that exit 0.
- CI: `ci.yml` (node test + pytest + lints), `pages.yml` (build → deploy).
- `PRIVACY_RULES.md`, `.gitignore` with `.private/`, `lychee.toml`.
- README (EN + KO sections), STATUS.md skeleton, ADR-0001 (stack choice:
  Starlight for built-in i18n/search; KaTeX for build-time strictness).
- Accept: Pages URL shows the landing page in both languages; one test page
  renders one `<Eq>` from a two-entry `equations.yaml`; CI green.

### Phase 1 — Equation engine and verification
- `equations.yaml` with the full seed set (§3), all `derived_by` scripts,
  generator, vectors, TS evaluators, parity test, `<Eq>` component with the
  "verified by" badge, `mathlint.py`, `refcheck.py`, `references.bib` seeded
  from `references.seed.bib` (keep VERIFY flags).
- Accept: `pytest` proves every derivation; `vitest` parity 1e-9; CI diff-check
  on generated files; a "derivations" page auto-rendered from the scripts.

### Phase 2 — Core content (EN first, then KO)
- 02-theory (all pages) and 03-topologies (buck, boost, buck-boost, flyback,
  forward, comparison) at "definition of done" level, using textbook examples
  (cite chapter/example numbers) and `examples/synthetic/`.
- 00-foundations and 01-physics as compact refreshers with resources.
- Accept: `docs/STATUS.md` matrix updated; every page passes lints; quizzes present.

### Phase 3 — Tools
- Simulator (§4) with validation tests; Design tools (§5) wired to pe-core;
  URL-hash state; "Try it" deep links from every 02/03 page.
- Accept: simulator validation grid ≤ 2 %; source-driven mode reproduces the
  V_g,crit pinning; all tools have a screenshot in their doc page and keyboard
  focus order works.

### Phase 4 — Magnetics, losses, harvesting, gotchas, resources
- 04-magnetics, 06-bench, 07-harvesting (with `examples/synthetic/harvesting-
  source.yaml`: e.g., V_oc,pk 1 kV, R_s 1 MΩ, 10 s sinusoidal envelope,
  f_s 1 kHz — synthetic, round numbers), 08-gotchas (13 seeds), 10-resources
  generated from `resources.yaml` with all seed items resolved or removed.
- Accept: `resources_check.py` (URL opened, title matched, retrieved date set)
  and lychee green; no VERIFY key cited on a published page.

### Phase 5 — Simulation library, missions, polish
- `sim/ltspice` + `sim/ngspice` for buck/boost/buck-boost/flyback/forward with
  READMEs (what to plot, expected waveform PNGs generated by ngspice in CI),
  Falstad share links checked by a human; 09-missions; README final; KO parity
  for all Phase 2–4 pages or STATUS entries explaining what is pending.
- Accept: fresh clone → `npm ci && npm run build` → identical site; CI green;
  release tag v0.1.0 with a CHANGELOG.

## 8. Style rules for content

- Precise, terse, engineer-to-engineer. Prefer a worked number to an adjective.
- Every figure is SVG generated by code (matplotlib/Plotly export) or a
  hand-drawn SVG committed with its source; no screenshots of copyrighted
  figures, no textbook figure reproductions.
- Each formula appears once (via `<Eq>`); repeat by reference, not by re-embedding.
- Korean pages are full translations, not summaries; keep symbols and equation
  ids identical; keep English technical terms in parentheses on first use.
- Do not editorialize about vendors or parts; state datasheet facts with citation.

## 9. PRIVACY_RULES.md (create verbatim)

```
# Privacy and data rules

This is a public repository. The following may never appear in any committed file:

1. Measured data, tables, waveforms, or parameter sets taken from any real
   project, lab, deployment, or product — including "anonymized" versions
   that preserve the actual numbers.
2. Names of institutions, programs, sites, vessels/platforms, devices, or
   revisions of any real design.
3. Sizing choices copied from a real design (e.g., a specific shunt/gain pair
   chosen for a specific measured current). Generic sizing examples are fine
   when the numbers come from a cited textbook example or
   examples/synthetic/*.yaml.
4. Any personal information.

Allowed sources of numbers: (a) cited textbook examples (cite chapter/example),
(b) examples/synthetic/*.yaml (round numbers; each is labeled as an example
where it appears, and every page's footer states that example numbers are
synthetic),
(c) vendor datasheet values for generic parts, with citation, used only to
illustrate a general point.

Enforcement: scripts/privacy_scan.py checks categories (units-with-numbers in
prose must be traceable to a cited example or a synthetic file) and, if the
gitignored .private/denylist.txt exists locally, fails on any listed token.
Maintainers keep their own denylist locally; it is never committed.
```

## 10. Reporting format after each phase

Return: (1) checklist of acceptance items with pass/fail, (2) list of any
`VERIFY` items resolved or removed, (3) any equation whose derivation did not
reproduce the yaml expression (never "fix" the yaml to match a wrong derivation
silently — report it), (4) open questions for the maintainer.
