# ADR-0003: Content model for learning pages

- Status: accepted (Phase 2a)
- Date: 2026-09-23

## Context

CLAUDE.md requires that equations come from `equations.yaml` only, that every
number is textbook-cited or synthetic, and that a module is done only when it
meets the definition of done in both languages (or Korean is listed as
pending). BUILD_SPEC §8 adds that each formula appears once, "repeat by
reference, not by re-embedding". The 02-theory pages are the first content
built on these rules, so the mechanics are fixed here.

## Decision

1. **One home per equation and locale.** Exactly one content page per locale
   embeds a given `<Eq id>`; that page is the equation's *home* and carries its
   anchor (`#eq-<id with dots as dashes>`). Every other mention uses
   `<EqRef id>`, which links to the home and fails the build if there is none.
   Pages under `about/` document the site itself and may show an equation to
   demonstrate the pipeline without becoming its home. `mathlint.py` enforces
   the rule.
2. **Numbers are computed, never typed.** A worked example is a synthetic
   parameter file (`examples/synthetic/*.yaml`: parameters plus an ordered
   list of equation ids) that pe-core evaluates at build time (`runSteps`).
   `<Worked>` renders the table, with the example's "synthetic" label and a
   link from each computed row to the equation's home; `<Val>` places a single
   value in a sentence. Prose never contains a number with a unit unless a
   `<Cite>` on the same line supplies it (`privacy_scan.py`).
3. **"Try it" is a URL.** `<TryIt>` links to the equation explorer
   (`design/explorer`) with the example's inputs in the URL hash. The hash is
   explorer state, not an anchor; `anchorcheck.py` skips it. The Phase 3
   design tools and simulator follow the same convention.
4. **Quizzes are data.** `src/content/quizzes/<lang>/<section>/<module>.yaml`
   is a content collection validated by a schema (at least five questions,
   2–6 options, an answer index, an explanation, `numbers: synthetic`).
   `<Quiz>` renders it without JavaScript (answers in `<details>`).
5. **Korean mirrors English mechanically.** A Korean module page has the same
   block components with the same attributes, the same inline components (in
   any order) and the same quiz answer key as the English page
   (`modulelint.py`). A Korean page that is not written yet is listed as
   pending in `docs/STATUS.md`. Starlight then serves the English content at
   the Korean URL; components render in the content's language
   (`pageLocale`), and `EqRef` resolves an equation whose Korean home is
   pending to the same slug under `/ko/`, where the fallback page carries the
   anchor.
6. **The definition of done is checked, not asserted.** `modulelint.py`
   checks the section order, the presence of each required component, the
   resources and quizzes they reference, and that `docs/STATUS.md` marks
   exactly the modules that pass as done.

## Consequences

- Topology pages (Phase 2b) refer to conversion ratios derived on
  02-theory pages with `<EqRef>`, and host only the equations that are
  specific to them (ripple, stresses, component sizing).
- Adding an equation to a page that is not its home is a lint error; the
  author links to the home instead.
- Worked examples change only through their YAML files, and every page that
  uses one updates on the next build.
