# CLAUDE.md — repository conventions

This file is read by Claude Code on every session. Keep it short and binding.
Long-form build instructions live in `docs/BUILD_SPEC.md` (the build prompt).

## What this repository is

An open, bilingual (EN canonical, KO translation) learning repository on
power electronics for electrical engineers: switching-converter theory
(CCM/DCM), topologies, magnetics, loss modeling, and energy-harvesting
interfaces — plus a GitHub Pages web app that combines **learning**
(docs, quizzes, missions), **design** (calculators), and **simulation**
(in-browser time-domain converter simulator, Falstad links, LTspice/ngspice
files) in one place.

## Non-negotiable rules

1. **Privacy.** Read `PRIVACY_RULES.md`. No measured data from any real
   project, no institution / device / deployment identifiers, no vendor
   part-specific sizing tables copied from a real design. Every number is
   either textbook-canonical or explicitly synthetic and labeled as such.
2. **Equations have one source of truth.**
   `packages/pe-core/equations/equations.yaml` (sympy expressions + tests +
   citations). LaTeX shown in docs is **generated** from it into
   `packages/pe-core/equations/equations.generated.json` and embedded with
   the `<Eq id="…" />` component. Hand-typed `$$…$$` blocks in docs are a
   lint error. CI regenerates and fails on diff.
3. **Every equation and every device/method claim carries a citation key**
   from `references.bib`. Entries flagged `note = {VERIFY}` must be resolved
   (DOI/URL confirmed) before the flag is removed; unresolved entries may
   not be cited from published pages. CI runs a link checker on the built
   site and fails on dead links.
4. **Parity.** Python (`python/pe_core`) and TypeScript (`packages/pe-core`)
   implement the same equations and must agree on the shared test vectors
   in `packages/pe-core/equations/test_vectors.json` to 1e-9 relative.
   The simulator is validated against the analytic equations to ≤ 2 %.
5. **Math must render.** KaTeX runs in strict mode at build time
   (`throwOnError: true`); a failed render fails the build. Use only KaTeX-
   supported commands (no `\label`, no `align` environments without KaTeX
   support, no custom macros unless declared in `src/math/macros.ts`).
6. **Language.** English is canonical (`src/content/docs/en`). Korean
   mirrors the same paths (`src/content/docs/ko`). A module is "done" only
   when both exist, or KO is listed as pending in `docs/STATUS.md`.
7. **No fabricated links or videos.** A resource is added only with a URL
   that was opened and matched by title; record `retrieved: YYYY-MM-DD` in
   `resources.yaml`. If a specific video cannot be verified, link the
   channel or playlist instead.

## Stack (do not change without updating BUILD_SPEC.md)

- Site: Astro + Starlight (i18n en/ko, Pagefind search), MDX,
  `remark-math` + `rehype-katex` (strict), React islands for tools,
  Plotly.js for plots. Deployed to GitHub Pages by GitHub Actions.
- Core engine: TypeScript package `packages/pe-core` (equations, mode
  detection, stresses, magnetics, loss model, piecewise-linear time-domain
  simulator). Tested with Vitest.
- Verification side: Python package `python/pe_core` (sympy derivations,
  numeric mirror, LaTeX generation, test-vector generation). Tested with
  pytest. Optional ngspice runs via subprocess for netlist validation.
- Content lint: `scripts/mathlint.py`, `scripts/privacy_scan.py`,
  `scripts/refcheck.py` (every cite key exists and is not VERIFY when used
  on a published page).

## Symbol conventions (site-wide; deviations must be declared in-page)

- `V_g` input voltage, `V` output voltage, `D` duty ratio, `T_s` switching
  period, `f_s = 1/T_s`, `L` filter inductance, `L_M` magnetizing inductance
  referred to the **primary**, `R` load resistance.
- Transformer turns ratio is written **1:n with n = N_s/N_p** (Erickson
  convention). Flyback CCM ratio is therefore `M = nD/(1−D)`.
- `K = 2L/(R T_s)`; converter is CCM when `K > K_crit(D)`.
- Ripple `Δi_L` denotes **half** the peak-to-peak inductor current ripple
  (Erickson). State "peak-to-peak" explicitly when that is meant.
- SI units everywhere; kHz/µH/mΩ only in UI labels, never in the engine.

## Commands

```
npm install && npm run dev            # site + tools, local
npm run build                         # strict KaTeX build (fails on math errors)
npm test                              # vitest (pe-core) + parity check
pip install -e python && pytest        # sympy derivations + vectors
python scripts/gen_equations.py       # regenerate equations.generated.json
python scripts/mathlint.py            # no hand-typed $$ blocks, all <Eq> ids exist
python scripts/privacy_scan.py        # category rules + optional .private/denylist.txt
python scripts/refcheck.py            # cite keys + VERIFY flags
npx lychee --config lychee.toml dist  # link check after build
```

## Definition of done — one module

- `en/` and `ko/` MDX pages present (or KO pending in STATUS.md)
- theory section uses only `<Eq>` embeds; each Eq has ≥ 1 test vector
- "Try it" section links the relevant calculator/simulator preset
- "Go deeper" section: ≥ 2 verified resources with retrieval dates
- gotchas subsection (may be empty at first, must exist)
- quiz with ≥ 5 questions, answers explained
- `npm run build`, `npm test`, `pytest`, all lint scripts green

## Things Claude Code must not do

- Do not paste equations as LaTeX into MDX. Add to `equations.yaml`, run
  the generator, embed with `<Eq>`.
- Do not invent a citation, DOI, or video URL. Add a `VERIFY` entry and say so.
- Do not add any example whose numbers are not either from the cited
  textbook example or from `examples/synthetic/*.yaml`.
- Do not commit `.private/` (gitignored) — it holds the maintainer's local
  denylist for the privacy scan.
