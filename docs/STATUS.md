# STATUS — module × language × done-criteria

Definition of done (CLAUDE.md): EN and KO pages present (or KO pending here); theory uses only `<Eq>` embeds and each Eq has ≥ 1 test vector; "Try it" links a tool preset; "Go deeper" has ≥ 2 verified resources with retrieval dates; a gotchas subsection exists; quiz with ≥ 5 explained questions; build, tests and all lints green.

Legend: ✅ done · 🟡 partial · ⬜ not started · ➖ not applicable. "Phase" is the build phase that delivers the module (docs/BUILD_SPEC.md §7); "later" = not scheduled in phases 0–5. 00-foundations and 01-physics are compact refreshers (Phase 2 scope).

_Last updated: Phase 0 (scaffold)._


## 00-foundations

| Module | Phase | EN | KO | `<Eq>` only | Try it | Go deeper ≥ 2 | Gotchas | Quiz ≥ 5 | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| circuit-laws | 2 | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | |
| phasors-laplace | 2 | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | |
| fourier | 2 | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | |
| passives-real | 2 | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | |
| semiconductors | 2 | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | |

## 01-physics

| Module | Phase | EN | KO | `<Eq>` only | Try it | Go deeper ≥ 2 | Gotchas | Quiz ≥ 5 | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| faraday-inductors | 2 | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | |
| transformers-coupled | 2 | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | |
| ferrites-bh | 2 | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | |
| gap-and-AL | 2 | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | |
| core-loss | 2 | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | |

## 02-theory

| Module | Phase | EN | KO | `<Eq>` only | Try it | Go deeper ≥ 2 | Gotchas | Quiz ≥ 5 | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| switching-principle | 2 | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | |
| volt-second-charge-balance | 2 | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | |
| ccm-dcm | 2 | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | |
| k-parameter | 2 | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | |
| averaged-models | 2 | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | |
| small-signal | 2 | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | |
| rhp-zero | 2 | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | |
| control-basics | 2 | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | |

## 03-topologies

| Module | Phase | EN | KO | `<Eq>` only | Try it | Go deeper ≥ 2 | Gotchas | Quiz ≥ 5 | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| buck | 2 | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | |
| boost | 2 | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | |
| buck-boost | 2 | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | |
| cuk-sepic-zeta | later | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | |
| flyback | 2 | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | |
| forward | 2 | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | |
| bridges | later | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | |
| llc | later | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | |
| charge-pump | later | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | |
| ldo | later | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | |
| rectifiers | later | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | |
| comparison | 2 | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | |

## 04-magnetics

| Module | Phase | EN | KO | `<Eq>` only | Try it | Go deeper ≥ 2 | Gotchas | Quiz ≥ 5 | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| design-procedure | 4 | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | |
| winding-loss | 4 | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | |
| leakage | 4 | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | |
| snubbers-clamps | 4 | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | |
| measurement | 4 | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | |

## 05-simulation

| Module | Phase | EN | KO | `<Eq>` only | Try it | Go deeper ≥ 2 | Gotchas | Quiz ≥ 5 | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| ltspice | 5 | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | |
| ngspice | 5 | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | |
| falstad | 5 | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | |
| python | 5 | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | |
| in-browser-simulator | 5 | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | |

## 06-bench

| Module | Phase | EN | KO | `<Eq>` only | Try it | Go deeper ≥ 2 | Gotchas | Quiz ≥ 5 | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| layout | 4 | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | |
| gate-drive | 4 | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | |
| current-sensing | 4 | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | |
| probes | 4 | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | |
| thermal | 4 | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | |
| protection | 4 | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | |
| low-temp | 4 | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | |

## 07-harvesting

| Module | Phase | EN | KO | `<Eq>` only | Try it | Go deeper ≥ 2 | Gotchas | Quiz ≥ 5 | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| source-models | 4 | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | |
| matching | 4 | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | |
| lfr-dcm-flyback | 4 | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | |
| sece-sshi-mppt | 4 | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | |
| synthetic-case | 4 | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | |

## 08-gotchas

| Module | Phase | EN | KO | `<Eq>` only | Try it | Go deeper ≥ 2 | Gotchas | Quiz ≥ 5 | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| index | 4 | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | |

## 09-missions

| Module | Phase | EN | KO | `<Eq>` only | Try it | Go deeper ≥ 2 | Gotchas | Quiz ≥ 5 | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| m1 … m9 + quizzes | 5 | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | |

## 10-resources

| Module | Phase | EN | KO | `<Eq>` only | Try it | Go deeper ≥ 2 | Gotchas | Quiz ≥ 5 | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| books | 4 | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | |
| courses | 4 | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | |
| videos | 4 | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | |
| app-notes | 4 | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | |
| tools | 4 | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | |
| papers | 4 | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | |

## Site infrastructure pages

| Page | EN | KO | Notes |
| --- | --- | --- | --- |
| landing (`index`) | ✅ | ✅ | Phase 0 |
| about | ✅ | ✅ | Phase 0 |
| about/equation-pipeline | ✅ | ✅ | Phase 0 acceptance page: one `<Eq>` + Plotly island |
