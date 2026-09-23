# STATUS — module × language × done-criteria

## Equation engine (Phase 1)

| Item | State |
| --- | --- |
| `equations.yaml` seed set (BUILD_SPEC §3) | ✅ 39 equations, every test value checked against sympy |
| 02-theory additions (Phase 2a) | ✅ 23 equations: averaging and balance, DCM interval, critical inductance, boost with winding resistance, CCM small-signal parameters, PWM and loop gain |
| 03-topologies additions (Phase 2b) | ✅ 17 equations: dc inductor currents, current and voltage ripple, peak current, buck-boost and forward switch stress, transistor utilization |
| 00/01 refresher additions (Phase 2c) | ✅ 16 equations: inductor and capacitor under constant excitation and their energy, impedance, R-C filter corner and gain, pulse-train harmonics and rms value, self-resonance, ESR ripple, Ampère's law, B-H relation, ideal transformer |
| Simulator compare-panel additions (Phase 3a) | ✅ 2 equations: `buck.Vds`, `boost.Vds` (switch blocking voltages) |
| Derivations reproduce the YAML (`pytest`) | ✅ 91 of 97 (`K.def`, `def.Ts`, `def.V`, `ripple.Ipk` and `mag.B_H` are definitions, `loss.steinmetz` is an empirical law) |
| TS/Python parity (`vitest`, 1e-9 rel) | ✅ all shared vectors |
| Strict KaTeX on every generated formula and derivation step (`vitest`) | ✅ |
| `references.bib` verified (two web-search rounds + CI Crossref + URL title check) | ✅ 25 of 25 verified (`steinmetz1984` DOI confirmed by the CI Crossref job; `ti_slva630` and `ti_snoa930` added in Phase 2c) |

## Simulator and tools (Phase 3)

| Item | State |
| --- | --- |
| Simulator engine (BUILD_SPEC §4): piecewise-linear intervals, exact matrix-exponential steps at T_s/2000, bisection on events, steady state to 1e-6 (relative to each state's variation within the cycle) within 2000 cycles | ✅ Phase 3a (`packages/pe-core/src/sim`); cases without a steady state are reported as such (tested) |
| Validation grid: M and Δi_pp within 2 %, mode matches K/K_crit (buck, boost, buck-boost, flyback × 5 duty ratios × 4 values of K/K_crit) | ✅ 80 cases in `packages/pe-core/test/sim.test.ts`, plus forward CCM, energy balance (also with a node capacitance), ringing frequency, and regression cases from an independent review (reverse current, very slow states, fast ringing) |
| Source-driven mode: bus pinned at V_g,crit within 2 % (constant V_oc) | ✅ Phase 3a |
| Source-driven mode: sinusoidal and user-drawn V_oc envelopes | ⬜ with the SourceMatcher tool (Phase 3) |
| Simulator page (`simulate/simulator`): topology buttons, presets, sliders, waveforms, mode badge, compare-with-formula panel, losses; state in the URL hash; runs in a Web Worker | ✅ EN and KO, Phase 3a |
| "Try it" simulator links (`<TrySim>`) from 02/03 pages | ✅ 10 pages, EN and KO |
| Screenshots on tool pages (`scripts/screenshots.mjs`, checked by `modulelint.py`) | ✅ explorer, simulator |
| Keyboard focus order of tool pages (`scripts/keyboard_check.mjs`, CI) | ✅ explorer, simulator |
| LTspice `.asc`, ngspice `.cir` and Falstad links on the simulator page | ⬜ Phase 5 (`sim/`) |
| Design tools (BUILD_SPEC §5): ConverterDesigner, MagneticsDesigner, LossBudget, SenseChain, ClampCheck, SourceMatcher | ⬜ Phase 3 |

Definition of done (CLAUDE.md): EN and KO pages present (or KO pending here); theory uses only `<Eq>` embeds and each Eq has ≥ 1 test vector; "Try it" links a tool preset; "Go deeper" has ≥ 2 verified resources with retrieval dates; a gotchas subsection exists; quiz with ≥ 5 explained questions; build, tests and all lints green.

Legend: ✅ done · 🟡 partial · ⬜ not started · ➖ not applicable. "Phase" is the build phase that delivers the module (docs/BUILD_SPEC.md §7); "later" = not scheduled in phases 0–5. 00-foundations and 01-physics are compact refreshers (Phase 2 scope).

_Last updated: Phase 3a (simulator). `python scripts/modulelint.py` checks every ✅ below against the pages themselves._

"Try it" links open the [equation explorer](../src/content/docs/en/design/explorer.mdx) with a synthetic preset. Pages whose example is a whole converter also open the [simulator](../src/content/docs/en/simulate/simulator.mdx) with it (`<TrySim>`, Phase 3a); design-tool presets come with the design tools.


## 00-foundations

| Module | Phase | EN | KO | `<Eq>` only | Try it | Go deeper ≥ 2 | Gotchas | Quiz ≥ 5 | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| circuit-laws | 2 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | homes `ind.di`, `cap.dv`, `ind.E`, `cap.E` |
| phasors-laplace | 2 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | homes `imp.ZL`, `imp.ZC`, `rc.fc`, `rc.gain` |
| fourier | 2 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | homes `fourier.pulse.harm`, `fourier.pulse.rms` |
| passives-real | 2 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | homes `loss.cond`, `passive.f_srf`, `cap.esr.ripple` |
| semiconductors | 2 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | homes `loss.diode`, `loss.sw.cap`, `loss.gate` |

## 01-physics

| Module | Phase | EN | KO | `<Eq>` only | Try it | Go deeper ≥ 2 | Gotchas | Quiz ≥ 5 | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| faraday-inductors | 2 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | homes `mag.H_ampere`, `mag.dB_faraday` |
| transformers-coupled | 2 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | homes `xfmr.V2`, `xfmr.I2` |
| ferrites-bh | 2 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | homes `mag.B_H`, `mag.B_pk` |
| gap-and-AL | 2 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | homes `mag.AL_gap`, `mag.L_from_AL` |
| core-loss | 2 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | homes `loss.steinmetz` |

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
| buck | 2 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | homes `buck.IL`, `buck.ripple.iL`, `buck.ripple.iL_pp`, `ripple.Ipk`, `buck.ripple.v`, `buck.Vds` |
| boost | 2 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | homes `boost.IL`, `boost.ripple.iL`, `boost.ripple.v`, `boost.Vds` |
| buck-boost | 2 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | homes `buckboost.V`, `buckboost.IL`, `buckboost.ripple.iL`, `buckboost.ripple.v`, `buckboost.Vds` |
| cuk-sepic-zeta | later | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | |
| flyback | 2 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | homes the nine `flyback.*` equations (ratios, stresses, DCM peak, leakage, fixed-output boundary) |
| forward | 2 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | homes `forward.ccm.M`, `forward.reset.Dmax`, `forward.Vds`, `forward.ripple.iL` |
| bridges | later | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | |
| llc | later | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | |
| charge-pump | later | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | |
| ldo | later | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | |
| rectifiers | later | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | |
| comparison | 2 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | homes `util.buck`, `util.boost`, `util.buckboost`, `util.forward` |

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
| 02-theory/derivations | ✅ | ✅ | auto-rendered from `python/pe_core/derive/*.py`: 12 modules, 91 derived equations (Phase 3a) |
| design/explorer | ✅ | ✅ | Phase 2a: evaluate and sweep any catalogue equation; state in the URL hash ("Try it" target); screenshot and keyboard check (Phase 3a) |
| simulate/simulator | ✅ | ✅ | Phase 3a: the pe-core simulator; state in the URL hash (`<TrySim>` target); screenshot and keyboard check |
| 10-resources/bibliography | ✅ | ✅ | Phase 1: generated from `references.bib` (verified entries only) |
