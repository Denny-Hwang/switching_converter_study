# ADR-0002: How references are verified

- Status: accepted (Phase 1)
- Date: 2026-09-23

## Context

CLAUDE.md rule 3 requires every citation key to exist in `references.bib`, and
entries flagged `VERIFY` to be resolved (identifier confirmed) before they may
be cited. Rule 7 requires resources to be linked only after the URL was
opened and matched by title. The maintainer additionally asked that every
reference be checked twice.

The sandbox that builds this repository cannot open most external hosts:
publisher pages, doi.org and api.crossref.org are blocked by its egress
policy, while a web-search tool is available. GitHub Actions runners have
open network access.

## Decision

Verification has three layers.

1. **Round 1 (maintainer's assistant).** For every entry, at least two
   different web searches: one restricted to the publisher or primary site
   (ieeexplore.ieee.org, link.springer.com, sciencedirect.com, ti.com,
   analog.com, coursera.org, ...) and one general or index search (PubMed,
   Semantic Scholar, retailer/ISBN listings, institutional repositories).
   Evidence is a search result whose URL and title match the claimed
   identifier and title.
2. **Round 2 (independent reviewer).** A separate reviewer that did not see
   round 1 repeated the exercise from scratch under the same rules, reporting
   verdict, identifiers and evidence per item. The two rounds were then
   reconciled; they agreed on existence and identifiers for every entry.
3. **Mechanical checks in CI.** `python scripts/refcheck.py --online` resolves
   every DOI in Crossref and compares the Crossref title (and volume, issue,
   pages, year) with `references.bib`; `python scripts/resources_check.py
   --online` opens every URL in `references.bib` and `resources.yaml` and
   requires the page title to contain the expected text (`urltitle` in the
   bib entry, `title_match` in resources.yaml). For a PDF, the file must
   carry the PDF signature, and its own title (document info or XMP) or the
   top of its first page must contain the expected text, of at least three
   words, as whole words and ignoring case and punctuation (pypdf reads the
   file). A PDF that only mentions the document further down, in a list of
   related documents say, does not pass. The statements a page cites a PDF
   or a web page for are listed in the bib entry's `urlquotes`, and each
   must occur in the PDF's text, or in the web page's visible text (its
   markup, scripts, styles and comments removed): the claim is then checked
   in the document itself, not only in search results.
   lychee opens every URL rendered on the built site. It skips `doi.org`
   links (publishers answer bots with 403; the Crossref check is stronger)
   and `www.analog.com` and `www.st.com` (they reject lychee's HTTP/2
   client; covered by resources_check).

   Some hosts refuse cloud CI runners outright (timeouts, 403, bot walls,
   consent pages). resources_check therefore tries each URL with an honest
   tool User-Agent and a browser User-Agent over HTTP/2 and HTTP/1.1. A 404
   or a real page with another title fails at once. Only when every attempt
   is inconclusive does it fall back to the most recent Internet Archive
   capture of the *exact* URL (Wayback CDX API; for a PDF, the most recent
   capture the archive stored as a PDF, since a later capture can be the
   site's web page), which must pass the same title check. Such URLs are
   reported as `OK (archived YYYY-MM-DD)` in the CI log, so a live check
   and an archive check are never confused. Each blocked host costs minutes
   of retries and archive lookups, so six URLs are checked at a time; the
   log keeps their order.

An identifier seen only in search-result summaries, but never in a result
URL or title, keeps its `VERIFY` flag until layer 3 confirms it. In Phase 1
this applied to one entry, the DOI of the 1984 reprint of Steinmetz's
hysteresis paper; the Crossref record matched title, volume, issue, pages
and year, and the flag was cleared.

A verified entry records how it was verified in its `note`
(`verified YYYY-MM-DD (evidence)`). `refcheck.py` rejects entries that neither
record verification nor carry `VERIFY`. `<Cite>` and `<Eq>` refuse VERIFY keys
at build time as well.

## Consequences

- Chapter-level pointers into Erickson & Maksimović use 3rd-edition numbers
  taken from SpringerLink chapter DOIs, and `refcheck.py --online` checks each
  cited "Ch. N (Title)" against the Crossref record of chapter N. Chapters the
  search rounds saw only in tables of contents are cited only once that check
  confirms them: Ch. 1 "Introduction", Ch. 7 "AC Equivalent Circuit Modeling"
  and Ch. 9 "Controller Design" were confirmed this way in Phase 2a. Ch. 22 is
  not cited.
- Where the spec's suggested source for an equation could not be tied to
  verifiable content, a verifiable source was cited instead: TI SLUA618A for
  gate-drive power, Alexander & Sadiku §4.8 for maximum power transfer,
  Erickson Ch. 8 for the L-C resonant frequency, and Erickson Ch. 3 for
  conduction losses. The per-equation deviations are listed in the Phase 1
  pull request.
- Specific videos, lectures and app-note pages ("Go deeper" links) are added
  in later phases under the same two-search rule. Where a specific item
  cannot be confirmed, the channel or index page is linked instead.
