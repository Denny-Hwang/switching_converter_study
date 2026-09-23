# STATUS — module × language × done-criteria

## Equation engine (Phase 1)

| Item | State |
| --- | --- |
| `equations.yaml` seed set (BUILD_SPEC §3) | ✅ 39 equations, every test value checked against sympy |
| 02-theory additions (Phase 2a) | ✅ 23 equations: averaging and balance, DCM interval, critical inductance, boost with winding resistance, CCM small-signal parameters, PWM and loop gain |
| 03-topologies additions (Phase 2b) | ✅ 17 equations: dc inductor currents, current and voltage ripple, peak current, buck-boost and forward switch stress, transistor utilization |
| Derivations reproduce the YAML (`pytest`) | ✅ 74 of 79 (`K.def`, `def.Ts`, `def.V` and `ripple.Ipk` are definitions, `loss.steinmetz` is an empirical law) |
| TS/Python parity (`vitest`, 1e-9 rel) | ✅ all shared vectors |
| Strict KaTeX on every generated formula and derivation step (`vitest`) | ✅ |
| `references.bib` verified (two web-search rounds + CI Crossref + URL title check) | ✅ 23 of 23 verified (`steinmetz1984` DOI confirmed by the CI Crossref job) |

Definition of done (CLAUDE.md): EN and KO pages present (or KO pending here); theory uses only `<Eq>` embeds and each Eq has ≥ 1 test vector; "Try it" links a tool preset; "Go deeper" has ≥ 2 verified resources with retrieval dates; a gotchas subsection exists; quiz with ≥ 5 explained questions; build, tests and all lints green.

Legend: ✅ done · 🟡 partial · ⬜ not started · ➖ not applicable. "Phase" is the build phase that delivers the module (docs/BUILD_SPEC.md §7); "later" = not scheduled in phases 0–5. 00-foundations and 01-physics are compact refreshers (Phase 2 scope).

_Last updated: Phase 2b (03-topologies, EN and KO). `python scripts/modulelint.py` checks every ✅ below against the pages themselves._

"Try it" links open the [equation explorer](../src/content/docs/en/design/explorer.mdx) with a synthetic preset until the Phase 3 design tools and simulator exist; Phase 3 adds tool and simulator presets to every 02/03 page.


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
| switching-principle | 2 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | homes `def.Ts`, `sw.v_avg`, `def.V` |
| volt-second-charge-balance | 2 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | homes `vsb.v_off`, `csb.i_off`, CCM `M` of buck, boost, buck-boost |
| ccm-dcm | 2 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | homes `buck.dcm.D2`, DCM `M` of buck, boost, buck-boost, `dcm.ring.f` |
| k-parameter | 2 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | homes `K.def`, four `Kcrit.*`, `L.crit` |
| averaged-models | 2 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | homes `boost.ccm.M_RL`, `boost.ccm.eta_RL`, `dcm.P_in`, `lfr.R_in` |
| small-signal | 2 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | homes `buck.ss.*` (G_d0, ω0, Q) |
| rhp-zero | 2 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | homes `boost.ss.*`, `buckboost.ss.*` (incl. ω_z) |
| control-basics | 2 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | homes `pwm.d`, `loop.T`, `loop.suppression` |

## 03-topologies

| Module | Phase | EN | KO | `<Eq>` only | Try it | Go deeper ≥ 2 | Gotchas | Quiz ≥ 5 | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| buck | 2 | ✅ | 🟡 pending | ✅ | ✅ | ✅ | ✅ | ✅ | homes `buck.IL`, `buck.ripple.iL`, `buck.ripple.iL_pp`, `ripple.Ipk`, `buck.ripple.v` |
| boost | 2 | ✅ | 🟡 pending | ✅ | ✅ | ✅ | ✅ | ✅ | homes `boost.IL`, `boost.ripple.iL`, `boost.ripple.v` |
| buck-boost | 2 | ✅ | 🟡 pending | ✅ | ✅ | ✅ | ✅ | ✅ | homes `buckboost.V`, `buckboost.IL`, `buckboost.ripple.iL`, `buckboost.ripple.v`, `buckboost.Vds` |
| cuk-sepic-zeta | later | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | |
| flyback | 2 | ✅ | 🟡 pending | ✅ | ✅ | ✅ | ✅ | ✅ | homes the nine `flyback.*` equations (ratios, stresses, DCM peak, leakage, fixed-output boundary) |
| forward | 2 | ✅ | 🟡 pending | ✅ | ✅ | ✅ | ✅ | ✅ | homes `forward.ccm.M`, `forward.reset.Dmax`, `forward.Vds`, `forward.ripple.iL` |
| bridges | later | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | |
| llc | later | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | |
| charge-pump | later | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | |
| ldo | later | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | |
| rectifiers | later | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | |
| comparison | 2 | ✅ | 🟡 pending | ✅ | ✅ | ✅ | ✅ | ✅ | homes `util.buck`, `util.boost`, `util.buckboost`, `util.forward` |

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
| 02-theory/derivations | ✅ | ✅ | auto-rendered from `python/pe_core/derive/*.py`: 11 modules, 74 derived equations (Phase 2b) |
| design/explorer | ✅ | ✅ | Phase 2a: evaluate and sweep any catalogue equation; state in the URL hash ("Try it" target) |
| 10-resources/bibliography | ✅ | ✅ | Phase 1: generated from `references.bib` (verified entries only) |
