# Gotcha page template

A gotcha is one bench or design mistake, written up so that the next person
recognizes it from its symptom. Each gotcha is one page in
`src/content/docs/en/08-gotchas/<slug>.mdx`, mirrored in Korean at
`src/content/docs/ko/08-gotchas/<slug>.mdx` (or marked KO pending in
`docs/STATUS.md`), and listed in the 08-gotchas table of `docs/STATUS.md`.
`python scripts/modulelint.py` checks the template below; the index page
lists every gotcha by its tags on its own.

Rules that apply as on every page (CLAUDE.md, PRIVACY_RULES.md):

- No number from a real project. A number with a unit comes from a cited
  source (a `<Cite>` on the same line) or from a synthetic example through
  `<Val example="..." name="..." />`.
- No equation typed in the page: link the equation's home with
  `<EqRef id="..." label="..." />`, or add a new equation to
  `packages/pe-core/equations/equations.yaml` and embed it once with
  `<Eq id="..." />`.
- Every claim about a device or a method cites a verified entry of
  `references.bib`.

```mdx
---
title: <The mistake, in a few words>
description: <One sentence: what you see, and what is really going on.>
sidebar:
  order: <position in the list>
gotcha:
  tags: [<one or more of src/lib/gotchas.json>]
---

import GotchaTags from '../../../../components/GotchaTags.astro';
import Cite from '../../../../components/Cite.astro';
import EqRef from '../../../../components/EqRef.astro';

<GotchaTags />

## Symptom

What you see on the bench or in the design, before you know the cause.

## Why

The mechanism, with the equation that sets it (`<EqRef>`) and the source
(`<Cite>`).

## How to confirm

A measurement or a check that tells this cause apart from the others that
give the same symptom.

## Fix

What to change, and how to check that it worked.

## References

- <Cite key="..." />: what the source supports.
- The module page or the tool that works it through.
```

Korean section headings, in the same order: 증상, 원인, 확인 방법, 해결,
참고 자료.
