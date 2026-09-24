# STATUS — module × language × done-criteria

## Equation engine (Phase 1)

| Item | State |
| --- | --- |
| `equations.yaml` seed set (BUILD_SPEC §3) | ✅ 39 equations, every test value checked against sympy |
| 02-theory additions (Phase 2a) | ✅ 23 equations: averaging and balance, DCM interval, critical inductance, boost with winding resistance, CCM small-signal parameters, PWM and loop gain |
| 03-topologies additions (Phase 2b) | ✅ 17 equations: dc inductor currents, current and voltage ripple, peak current, buck-boost and forward switch stress, transistor utilization |
| 00/01 refresher additions (Phase 2c) | ✅ 16 equations: inductor and capacitor under constant excitation and their energy, impedance, R-C filter corner and gain, pulse-train harmonics and rms value, self-resonance, ESR ripple, Ampère's law, B-H relation, ideal transformer |
| Simulator compare-panel additions (Phase 3a) | ✅ 2 equations: `buck.Vds`, `boost.Vds` (switch blocking voltages) |
| Design-tool additions (Phase 3b) | ✅ 4 equations: `flyback.IM`, `flyback.ripple.iM`, `flyback.ripple.v` (flyback CCM current and ripples), `loss.core` (core loss of a whole core) |
| Design-tool additions (Phase 3c) | ✅ 12 equations: `flyback.V_OR`, `clamp.Vds`, `clamp.t_reset`, `clamp.P`, `clamp.rcd.V`, `tvs.R_D`, `tvs.V_clamp`, `flyback.V_ceiling` (primary clamp), `src.cv_power`, `lfr.Vg`, `lfr.eta`, `lfr.Vg_power` (linear source and loss-free resistor) |
| Design-tool additions (Phase 3d) | ✅ 8 equations: `sense.burden`, `sense.voltage_out_monitor`, `sense.offset_current`, `sense.pad_error`, `sense.reading`, `sense.rel_error`, `sense.filter_R` (shunt, voltage-output amplifier, offset, pad resistance, what the amplifier reads, error of the reading, filter behind a current-output amplifier), `adc.nyquist` |
| Design-tool additions (Phase 3e) | ✅ 13 equations: `mag.N_Bmax`, `mag.gap_length`, `mag.B_ac` (fewest turns for a flux-density limit, gap without fringing, ac flux amplitude from the ripple), `wind.round_area`, `wind.fill`, `wind.rho_T`, `wind.dcr` (copper, window utilization, dc resistance at temperature), `wind.skin_depth`, `wind.porosity`, `wind.phi_round`, `wind.dowell` (ac resistance factor, Dowell), `xfmr.leakage.ps`, `xfmr.leakage.psp` (leakage by winding arrangement) |
| Simulator review additions | ✅ 2 equations: `vsb.drift` (the inductor current's change over one period, zero in a steady state), `bat.rint` (a battery's current in the Rint model) |
| Derivations reproduce the YAML (`pytest`) | ✅ 119 of 136 (`K.def`, `def.Ts`, `def.V`, `ripple.Ipk`, `mag.B_H`, `loss.core`, `adc.nyquist`, `wind.round_area` and `wind.fill` are definitions, `loss.steinmetz` is an empirical law, `wind.rho_T` is copper's linear temperature coefficient (`nbs_hb100`), `tvs.R_D` and `tvs.V_clamp` are the TVS model of `st_an316`, `wind.porosity`, `wind.phi_round` and `wind.dowell` are Dowell's layer model (`dowell1966`), `bat.rint` is the Rint battery model (`he2011`)) |
| Symbol meanings: every symbol of `symbol_table` says in a few words what it is (`meaning`, `meaning_ko`, required by the loader) | ✅ 177 of 177; shown next to every tool input, under every `<Eq>` and in every worked example |
| TS/Python parity (`vitest`, 1e-9 rel) | ✅ all shared vectors |
| Strict KaTeX on every generated formula and derivation step (`vitest`) | ✅ |
| `references.bib` verified (two web-search rounds + CI Crossref + URL title check; PDFs: title and `urlquotes` read from the file) | ✅ 34 of 34 verified (`steinmetz1984` DOI confirmed by the CI Crossref job; `ti_slva630` and `ti_snoa930` added in Phase 2c; `ti_ssztcv6` and `st_an316` added in Phase 3c; `ti_ina181`, `osullivan2012` and `kester_mt002` added in Phase 3d; `tdk_e25`, `tdk_etd29` and `nbs_hb100` added in Phase 3e, every value the core table and the copper constants take from them found by the CI check in the PDFs; `he2011` added with the simulator's battery load) |

## Simulator and tools (Phase 3)

| Item | State |
| --- | --- |
| Simulator engine (BUILD_SPEC §4): piecewise-linear intervals, exact matrix-exponential steps at T_s/2000, events located on the exact solution, steady state to 1e-6 within 2000 cycles | ✅ Phase 3a (`packages/pe-core/src/sim`). Events: a bracketing search like the spec's bisection (Illinois regula falsi, fewer steps). Steady state: Newton shooting with the exact cycle Jacobian, accepted when the change per cycle (relative to each state's variation) and the remaining Newton step (relative to its size) are both below 1e-6. The Jacobian is accumulated as J - I, exact also for very slow states. A steady state that is not a single point (a fixed output at its balancing duty ratio, a capacitor alone that no more charge reaches) has a state whose row and column of J - I are zero: the Newton step leaves it and solves for the others, and the first test alone decides. A change or a Newton step within rounding of a state's natural size in the circuit (the largest given voltage; the current it builds in a period) counts as none, and so does one below 1e-250 (a subnormal residue); each state's remaining Newton step is measured against the largest of its value, its movement within the period and that size. Cases without a steady state are reported as such (tested); a node capacitance that rings faster than three sub-steps per ring at 20000 sub-steps per period is refused (results at three agree with ten times finer sub-steps) |
| Validation grid: M and Δi_pp within 2 %, mode matches K/K_crit (buck, boost, buck-boost, flyback × 5 duty ratios × 4 values of K/K_crit) | ✅ 80 cases in `packages/pe-core/test/sim.test.ts`, plus forward CCM, energy balance (also with a node capacitance), ringing frequency, and regression cases from three independent reviews (reverse current, very slow states, fast ringing, the node capacitance while the diode conducts, the exact Jacobian against finite differences, the Newton line search, states that do not move within the cycle) |
| Cross-check against ngspice (`scripts/spice_crosscheck.py`, `sim-spice.test.ts`) | ✅ 34 circuits rebuilt as netlists from their schematics: every topology in CCM and DCM, every interval of every converter's model (tested), the forward converter with reset windings of 1 and 0.5 times the primary's turns and a rectifier held off by a battery, node-capacitance ringing (also with a battery), a Thevenin source, batteries with and without a resistor, a battery above the input (reverse current through the body diode), an output lifted above the input by an L-C overshoot (the body diode as the diode's current ends), a fixed output, a runaway start-up, capacitors charging (also a boost with a node capacitance from 0 V), and capacitors alone that stop behind a boost and a buck-boost with a node capacitance. Averages, extremes, end values and 40 waveform instants per quantity agree within 0.5 % of its largest magnitude in these cases, with 5 mV and 1 µA for the SPICE parts' extra diode drop and leakage; not compared: values within 20 ns of an event, and with a node capacitance the diode's peak and the buck's and flyback's input-current extremes (ngspice's picosecond take-over spike). A CI job reruns ngspice against the stored results |
| Invariants with every load (`sim-invariants.test.ts`) | ✅ five converters × R ∥ C, a battery, a battery and R, a fixed output (in DCM, below its balancing duty ratio) × ideal and lossy, and a capacitor alone behind the buck and the forward converter: charge and volt-second balance, i_C = C dv/dt, source power = load power + losses (the balances hold by construction in a periodic steady state; the energy balances check the model); energy conserved over start-ups from rest |
| Source-driven mode: bus pinned at V_g,crit within 2 % (constant V_oc) | ✅ Phase 3a |
| Source-driven mode: sinusoidal and user-drawn V_oc envelopes | ✅ in the SourceMatcher tool (Phase 3c): the simulator's source-driven flyback, cycle by cycle over an envelope period after the bus settles |
| Simulator page (`simulate/simulator`): topology buttons, presets, sliders, waveforms, mode badge, compare-with-formula panel, losses; state in the URL hash; runs in a Web Worker | ✅ EN and KO, Phase 3a |
| Simulator loads: R ∥ C, a battery (open-circuit voltage behind its internal resistance, the Rint model), a battery and R, C alone from V_0, an ideal fixed voltage; a table of where the load's power goes | ✅ EN and KO, with four new presets (a buck and a flyback charging a battery, a flyback charging a capacitor, a buck into a fixed voltage) and a worked example |
| No steady state: the simulator says which state keeps changing and by how much per cycle (the average inductor voltage, the balancing duty ratio, the forward converter's reset limit; a capacitor's gain per cycle) and shows the start-up from rest | ✅ EN and KO (`sim-diagnose.test.ts`): a fixed output at, below and above its balancing duty ratio, the buck-boost's inverted ratio, the forward converter's magnetizing current first; a duty ratio within the tolerance of the balance (steady) and just beyond it (runaway); a capacitor alone that charges without bound, settles at the input (buck, also with a node capacitance, losses and a source), keeps its start voltage, an L-C peak or, above the reset limit with R_on, its start-up's stop (forward), stops where its start-up stops with a node capacitance (the start-up is followed first, for at most 4000 periods and two million sub-steps: a current still alternating, a start-up past a lower stopping voltage, an input bus still recovering; a start-up still charging then is reported up to about 0.07 % below its stop in random trials); searches cut short (unsettled); an input bus that a weak source lets fall below zero (a buck, a buck-boost, a flyback, a forward converter beyond its reset limit) and a switch voltage below zero are flagged as outside the model (a real circuit's diodes would conduct; the models leave them out), also when the search does not settle; a forward converter's rectifier turned on with no voltage across it as its bus sags lets no current back; a negative current through the body diode, the switch on or off, and from the instant the diode's current ends with the output above the input. The messages and the load table are tested in `Simulator.test.ts` |
| "Try it" simulator links (`<TrySim>`) from 02/03 pages | ✅ 10 pages, EN and KO |
| Screenshots on tool pages (`scripts/screenshots.mjs`, checked by `modulelint.py`) | ✅ explorer, simulator, converter designer, magnetics designer, loss budget, clamp check, source matcher, sense chain |
| Keyboard focus order of tool pages (`scripts/keyboard_check.mjs`, CI) | ✅ explorer, simulator, converter designer, magnetics designer, loss budget, clamp check, source matcher, sense chain |
| LTspice `.asc`, ngspice `.cir` and Falstad links on the simulator page | ⬜ Phase 5 (`sim/`) |
| ConverterDesigner (`design/converter-designer`): D range, L or L_M for the ripple target and for CCM at the lightest load, K against K_crit, ripples, stresses, C for the ripple target; each result names its equation, solved with `invert` on the catalogue's evaluator; links to the simulator and the loss budget | 🟡 EN and KO, Phase 3b: CCM target (the designed parts reproduce in the simulator within 2 %, and the CCM boundary, the flyback's diode drop included, matches the simulated mode; tested). A DCM target (BUILD_SPEC §5 "L/L_M for target mode") is not offered yet |
| LossBudget (`design/loss-budget`): conduction, capacitive switching, gate drive, core, diode and flyback leakage losses against the load and f_s, with the efficiency; each point simulated with the duty ratio regulated (bracketed search; the forward converter stops at its reset limit); peak flux density shown for a saturation check | ✅ EN and KO, Phase 3b; the conduction, diode and capacitive buckets equal the simulator's own accounting in every topology (tested) |
| ClampCheck (`design/clamp-check`): TVS or RCD primary clamp of a flyback: reflected voltage, leakage energy and reset time, clamp voltage at the peak current (TVS from its datasheet's V_BR, V_CL and I_PP), switch voltage against its rating, clamp dissipation, open-load output ceiling (TVS; an RCD clamp gives none, and the tool warns); trade-off chart | ✅ EN and KO, Phase 3c |
| SourceMatcher (`design/source-matcher`): a fixed-duty-ratio flyback on a linear source: loss-free-resistor divider and extraction, CCM taking over at V_g,crit (constant-voltage sink), the loss-free resistor's power limit (CCM or the switch's rating), switch voltage against power, envelope simulation; link to the simulator | ✅ EN and KO, Phase 3c; the operating point matches the simulator's steady state (tested) |
| SenseChain (`design/sense-chain`): shunt, current-output or voltage-output amplifier, R-C filter and ADC: gain, full-scale current and what sets it and output floor (both at the worst case of the offset and the pad resistance), burden and shunt dissipation, offset-equivalent current, pad error, error at the smallest current, filter corner against the Nyquist frequency (with R_OUT in series for a current output); a warning for each violation; transfer and error charts | ✅ EN and KO, Phase 3d; headroom against the supply is the amplifier's output limits at the supply used, entered from its data sheet (the LTC6101 gives absolute limits, not a margin below V+) |
| Readability of the tools (maintainer's review): settings beside the chart on wide screens (chart first on narrow ones), chart colours following the light or dark theme, legends and axis titles clear of each other and of the tick labels, 1-2-5 ticks on logarithmic axes, one hover box per instant in the simulator, equal-size buttons, the symbol, its meaning and its unit on every input, results with SI prefixes | ✅ all eight tools, EN and KO (`src/lib/plot.ts`, `src/tools/ToolUi.tsx`); every input's meaning tested |
| MagneticsDesigner (`design/magnetics-designer`): an inductor or a flyback transformer on a table core (E 25/13/7 and ETD 29/16/10 in N87, the values TDK publishes, cited and found in the data sheets by CI) or on any core: fewest turns for B_max at A_min, gap without fringing, the data sheet's gapped sets with their turns and flux density, B_pk and the ripple's ac flux amplitude, window utilization, dc resistance at the winding temperature (NBS copper), Dowell's F_R at f_s and against frequency, leakage for P-S and P-S-P; each result names its equation; worked examples computed at build time (`<MagWorked>`) | ✅ EN and KO, Phase 3e; round wire only; the flyback's windings take Dowell's factor each with its own layers (they do not conduct together); no core-loss or thermal model (B_ac is given for the material's loss data) |

## Readability of the pages (maintainer's review)

| Item | State |
| --- | --- |
| Symbols explained where they appear: under every `<Eq>` (`<dl>` of symbol and meaning) and next to every symbol of a worked example | ✅ every page, EN and KO |
| Example numbers: each worked example, preset and quiz example is labelled an example; every page's footer states once that example numbers are synthetic (`PRIVACY_RULES.md`, checked by `privacy_scan.py`) | ✅ 38 examples, EN and KO |
| Wording: filler and repeated statements removed; Korean pages give the English term in parentheses at the first use of a technical term (BUILD_SPEC §8) | ✅ all 72 pages (36 EN, 36 KO) |
| Figures drawn from code (`scripts/gen_figures.py`): schematics in schemdraw, idealized waveforms in matplotlib, in the site's symbols; inlined in the theme's text colour, with a caption and a text alternative in EN and KO and the source each follows (`src/lib/figures.ts`, tested); CI redraws them and fails on a difference | ✅ 8 figures: buck, boost, buck-boost, flyback and forward schematics; the buck's switch-node voltage, volt-second balance, inductor current in CCM, at the boundary and in DCM |

Definition of done (CLAUDE.md): EN and KO pages present (or KO pending here); theory uses only `<Eq>` embeds and each Eq has ≥ 1 test vector; "Try it" links a tool preset; "Go deeper" has ≥ 2 verified resources with retrieval dates; a gotchas subsection exists; quiz with ≥ 5 explained questions; build, tests and all lints green.

Legend: ✅ done · 🟡 partial · ⬜ not started · ➖ not applicable. "Phase" is the build phase that delivers the module (docs/BUILD_SPEC.md §7); "later" = not scheduled in phases 0–5. 00-foundations and 01-physics are compact refreshers (Phase 2 scope).

_Last updated: Phase 3e (magnetics designer). `python scripts/modulelint.py` checks every ✅ below against the pages themselves._

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
| core-loss | 2 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | homes `loss.steinmetz`, `loss.core` |

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
| flyback | 2 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | homes the twelve `flyback.*` equations (ratios, CCM currents and ripple, stresses, DCM peak, leakage, fixed-output boundary) |
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
| 02-theory/derivations | ✅ | ✅ | auto-rendered from `python/pe_core/derive/*.py`: 14 modules, 118 derived equations (Phase 3e) |
| design/explorer | ✅ | ✅ | Phase 2a: evaluate and sweep any catalogue equation; state in the URL hash ("Try it" target); screenshot and keyboard check (Phase 3a) |
| simulate/simulator | ✅ | ✅ | Phase 3a: the pe-core simulator; state in the URL hash (`<TrySim>` target); screenshot and keyboard check |
| design/converter-designer | ✅ | ✅ | Phase 3b; state in the URL hash; screenshot and keyboard check |
| design/magnetics-designer | ✅ | ✅ | Phase 3e; homes the thirteen magnetics and winding equations (`mag.N_Bmax`, `mag.gap_length`, `mag.B_ac`, `wind.*`, `xfmr.leakage.*`) until the 04-magnetics pages (Phase 4); state in the URL hash; screenshot and keyboard check |
| design/loss-budget | ✅ | ✅ | Phase 3b; state in the URL hash; screenshot and keyboard check |
| design/clamp-check | ✅ | ✅ | Phase 3c; homes the eight clamp equations (`flyback.V_OR`, `clamp.*`, `tvs.*`, `flyback.V_ceiling`); state in the URL hash; screenshot and keyboard check |
| design/source-matcher | ✅ | ✅ | Phase 3c; homes `src.Pmax`, `src.cv_power`, `src.cv_extraction`, `lfr.Vg`, `lfr.eta`, `lfr.Vg_power` until the harvesting pages (Phase 4); state in the URL hash; screenshot and keyboard check |
| design/sense-chain | ✅ | ✅ | Phase 3d; homes the eight `sense.*` equations and `adc.nyquist` until the current-sensing bench page (Phase 4); state in the URL hash; screenshot and keyboard check |
| 10-resources/bibliography | ✅ | ✅ | Phase 1: generated from `references.bib` (verified entries only) |
