# Contributing

Read `CLAUDE.md` (binding conventions) and `PRIVACY_RULES.md` first. The full
build specification is `docs/BUILD_SPEC.md`.

## Ground rules

1. **No private data.** Every number is either from a cited textbook example
   (cite chapter/example) or from `examples/synthetic/*.yaml` (round numbers,
   labelled "synthetic" on the page). No measured data, identifiers or sizing
   copied from a real design.
2. **One source of truth for equations.** Never type LaTeX for an equation
   into a page. Add it to `packages/pe-core/equations/equations.yaml`,
   regenerate, and embed it with `<Eq id="…" />`.
3. **Cite everything.** Every equation and every device/method claim carries a
   key from `references.bib`. An entry flagged `note = {VERIFY …}` may not be
   cited from a published page until its DOI/URL/ISBN has been confirmed.
4. **No fabricated links.** Add a resource only with a URL that was opened
   and matched by title, and record `retrieved: YYYY-MM-DD`. If a specific
   video cannot be verified, link the channel or playlist instead.
5. **English is canonical; Korean mirrors it.** Same paths under
   `src/content/docs/en/` and `src/content/docs/ko/`; keep symbols and
   equation ids identical; keep English technical terms in parentheses on
   first use in Korean. If the Korean page is not ready, list it as pending
   in `docs/STATUS.md`.

## Equation workflow

1. Add an entry to `packages/pe-core/equations/equations.yaml`:

   ```yaml
   - id: flyback.dcm.M
     title: "Flyback conversion ratio, DCM"
     title_ko: "플라이백 변환비, DCM"
     lhs: M
     expr: "D/sqrt(K)"                 # sympy-parsable; names from symbol_table
     symbols: {D: "duty ratio", K: "2 L_M/(R T_s)"}
     assumptions: [ideal, dcm, steady_state, resistive_load]
     convention: "1:n transformer, $n = N_s/N_p$; K uses $L_M$ (primary-referred) and the actual load R"
     cite: {key: erickson2020, where: "Ch. 5 (The Discontinuous Conduction Mode)"}
     derived_by: python/pe_core/derive/flyback.py
     tests:
       - {inputs: {D: 0.3, K: 0.09}, expect: 1.0}
   ```

   Every free symbol must be declared in `symbol_table` (display LaTeX, unit,
   random-vector range) and listed in the entry's `symbols`. Each `tests`
   value is checked against the sympy evaluation of `expr`.
2. Run `python scripts/gen_equations.py`. It writes
   `equations.generated.json` (LaTeX + metadata), `test_vectors.json` (your
   tests + seeded random vectors), `derivations.generated.json` (the
   derivation steps) and `src/generated/references.json` (the bibliography).
   Commit them; CI regenerates them and fails on any diff.
3. Add the TypeScript evaluator to `packages/pe-core/src/equations.ts` (write
   it independently; do not generate it). `npm test` checks it against every
   vector to 1e-9 relative and renders every formula with strict KaTeX.
4. If the equation is derived, add or extend a script in
   `python/pe_core/derive/` and point `derived_by` at it; `pytest` checks
   that the derivation reproduces `expr` symbolically. Never edit the YAML to
   match a derivation that disagrees with the cited source — report it.
5. Embed it in a page with `<Eq id="flyback.dcm.M" />`.

## Module page template

Each module page (`src/content/docs/<lang>/<section>/<module>.mdx`) has, in
this order:

1. **Intent** — three lines: what you will be able to do after the page.
2. **Theory** — prose plus `<Eq>` embeds only; each formula appears once and
   is referred to by link afterwards.
3. **Worked example** — numbers from a cited textbook example or from
   `examples/synthetic/`, computed by pe-core at build time (never
   hand-typed results).
4. **Try it** — a deep link into a tool with the parameters preset in the URL.
5. **Bench exercise** — what to build or measure and what to expect.
6. **Gotchas** — may be empty at first, but the heading must exist.
7. **Go deeper** — at least two verified resources (with retrieval dates).
8. **Quiz** — at least five questions with explained answers.

A module is *done* when both `en/` and `ko/` exist (or KO is listed as
pending in `docs/STATUS.md`) and `npm run build`, `npm test`, `pytest` and all
lint scripts pass.

## Citations

- In a page, cite with `<Cite key="erickson2020" where="Ch. 2" />`; an
  equation's sources come from its `cite` list in `equations.yaml` (one
  mapping or a list of mappings).
- Chapter numbers for `erickson2020` are 3rd-edition numbers (see the header
  of `references.bib`).
- Add BibTeX entries to `references.bib`. While the identifier has not been
  confirmed against the publisher or an authoritative index, keep
  `note = {VERIFY …}` on the entry.
- To resolve a VERIFY flag, confirm the DOI/ISBN/URL and the exact title, then
  replace the note with `verified YYYY-MM-DD (how it was verified)`.
- `scripts/refcheck.py` fails if `equations.yaml` or a published page cites a
  missing key or a VERIFY entry; `--online` (run in CI) checks every DOI
  against Crossref. See `docs/ADR/0002-reference-verification.md`.

## Lints

- `scripts/mathlint.py`: no hand-typed display math (`$$`, `\[`, `\begin`),
  no hand-typed inline equations (inline math may hold symbols, values and
  inequalities), every `<Eq id>` exists and is embedded at most once per
  locale, and the derivations page renders every derivation module.
- `scripts/privacy_scan.py`: no e-mail addresses; no number-with-unit in page
  prose unless the same line carries a `<Cite>` (synthetic values are rendered
  from `examples/synthetic/*.yaml` by components); the maintainer's local
  `.private/denylist.txt`, if present.
- `scripts/refcheck.py`: citation integrity (see above).

## Checks to run before a pull request

```sh
python scripts/gen_equations.py && git diff --exit-code
pytest && npm test
python scripts/mathlint.py && python scripts/privacy_scan.py && python scripts/refcheck.py
npm run build
```
