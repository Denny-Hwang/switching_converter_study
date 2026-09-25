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
| Magnetics additions (Phase 4a) | ✅ 16 equations: `mag.Kg_req`, `mag.Kg_core` (the core geometrical constant an inductor needs, and a core's), `wind.phi_foil`, `wind.dowell_low`, `wind.loss_rel`, `wind.phi_opt` (a foil layer's thickness in skin depths, Dowell's series for thin layers, the loss against a one-skin-depth layer, the thickness of least loss), `xfmr.k`, `xfmr.L_sc`, `xfmr.L_sc_T`, `xfmr.V_oc` (coupling and the short-circuit inductance, also from the T model, and the open-circuit voltage ratio, just below the turns ratio), `snub.C_par`, `snub.L_par`, `snub.R`, `snub.P`, `snub.P_R` (a ringing node's capacitance and inductance from two ringing frequencies, the RC snubber, the loss it adds and what its resistor dissipates), `meas.L_app` (an impedance meter's reading below self-resonance) |
| Bench additions (Phase 4b) | ✅ 14 equations: `layout.v_spike`, `layout.L_ring` (the voltage a loop's inductance develops over an edge, and the loop inductance from a ring), `gate.I_on`, `gate.I_off`, `gate.t_pl`, `boot.C` (the gate currents and the time on the Miller plateau, the bootstrap capacitance for an allowed droop), `probe.t_rise`, `probe.f_ring` (a single-pole system's rise time, a probe's ground-lead ring), `therm.Tj`, `therm.psi` (the junction temperature through a series thermal path, and from the package top), `inrush.I_pk`, `inrush.I2t`, `inrush.I_ramp` (the inrush into an empty capacitor, and through a ramp), `bat.v_term` (a battery's terminal voltage in the Rint model) |
| Harvesting additions (Phase 4c) | ✅ 10 equations: `piezo.Vp`, `piezo.R_opt`, `piezo.P_R` (a vibrating piezoelectric element's open-circuit amplitude, its best resistive load and the power into it), `piezo.P_std`, `piezo.P_std_max` (a bridge onto a dc voltage, the standard interface, and its largest power), `piezo.P_sece` (synchronous electric charge extraction), `piezo.P_sshi`, `piezo.P_sshi_max` (parallel SSHI and its largest power), `lfr.L_M` (a DCM flyback's magnetizing inductance for a given input resistance), `lfr.P_env` (a loss-free resistor's average power from a source whose open-circuit voltage follows a sinusoidal envelope) |
| Simulation additions (Phase 5c) | ✅ 8 equations: `sim.exact_step` (one exact step of a first-order circuit), `num.gain_fe`, `num.gain_tr`, `num.gain_be` (the factor forward Euler, the trapezoidal rule and backward Euler multiply a decaying mode by in each step), `filter.tau_env`, `sim.periods_settle` (the envelope time constant of an L-C filter's ring with a resistive load, and the switching periods a run from rest needs to settle), `num.rel_diff`, `num.unit_roundoff` (relative difference, unit roundoff) |
| Derivations reproduce the YAML (`pytest`) | ✅ 161 of 184 (`K.def`, `def.Ts`, `def.V`, `ripple.Ipk`, `mag.B_H`, `loss.core`, `adc.nyquist`, `wind.round_area`, `wind.fill`, `mag.Kg_core`, `wind.phi_foil` and `xfmr.k` are definitions, `loss.steinmetz` is an empirical law, `wind.rho_T` is copper's linear temperature coefficient (`nbs_hb100`), `tvs.R_D` and `tvs.V_clamp` are the TVS model of `st_an316`, `wind.porosity`, `wind.phi_round` and `wind.dowell` are Dowell's layer model (`dowell1966`), `bat.rint` is the Rint battery model (`he2011`), `therm.psi` is the data sheet's characterization parameter (`ti_spra953`), `num.rel_diff` is a definition and `num.unit_roundoff` Higham's (`higham2002`)) |
| Symbol meanings: every symbol of `symbol_table` says in a few words what it is (`meaning`, `meaning_ko`, required by the loader) | ✅ 260 of 260; shown next to every tool input, under every `<Eq>` and in every worked example |
| TS/Python parity (`vitest`, 1e-9 rel) | ✅ all shared vectors |
| Strict KaTeX on every generated formula and derivation step (`vitest`) | ✅ |
| `references.bib` verified (two web-search rounds + CI Crossref + URL title check; PDFs: title and `urlquotes` read from the file) | ✅ 69 of 69 verified (`steinmetz1984` DOI confirmed by the CI Crossref job; `ti_slva630` and `ti_snoa930` added in Phase 2c; `ti_ssztcv6` and `st_an316` added in Phase 3c; `ti_ina181`, `osullivan2012` and `kester_mt002` added in Phase 3d; `tdk_e25`, `tdk_etd29` and `nbs_hb100` added in Phase 3e, every value the core table and the copper constants take from them found by the CI check in the PDFs; `he2011` added with the simulator's battery load, `vanloan1978`, `parlett1969` and `higham2005` with its exact steps; `keysight_5950_3000`, `keithley_llmh7`, `hurley2000` and `nexperia_an11160` added in Phase 4a; `adi_an1144`, `adi_an136`, `adi_ceramic_caps`, `cde_ae_guide`, `epc_wp008`, `jeita_liion`, `keysight_5988_8008`, `littelfuse_fuseology`, `microchip_apt0403`, `tek_bw_risetime`, `ti_slua887`, `ti_slva139`, `ti_slva670`, `ti_slyt614`, `ti_snva021`, `ti_spra953`, `ti_sszta51` and `vishay_an608a` in Phase 4b; `lefeuvre2005`, `esram2007` and `ti_bq25570` in Phase 4c; `kester_mt027`, `nexperia_an90059` and `ti_tpl5110` in Phase 4d; `hairer1996`, `higham2002`, `aprille1972` and `ngspice_manual` in Phase 5c) |

## Simulator and tools (Phase 3)

| Item | State |
| --- | --- |
| Simulator engine (BUILD_SPEC §4): piecewise-linear intervals, exact matrix-exponential steps at T_s/2000, events located on the exact solution, steady state to 1e-6 within 2000 cycles | ✅ Phase 3a (`packages/pe-core/src/sim`). Events: a bracketing search like the spec's bisection (Illinois regula falsi, fewer steps). Steady state: Newton shooting with the exact cycle Jacobian, accepted when the change per cycle (relative to each state's variation) and the remaining Newton step (relative to its size) are both below 1e-6. The Jacobian is accumulated as J - I, exact also for very slow states. A steady state that is not a single point (a fixed output at its balancing duty ratio, a capacitor alone that no more charge reaches) has a state whose row and column of J - I are zero: the Newton step leaves it and solves for the others, and the first test alone decides. A change or a Newton step within rounding of a state's natural size in the circuit (the largest given voltage; the current it builds in a period) counts as none, and so does one below 1e-250 (a subnormal residue); each state's remaining Newton step is measured against the largest of its value, its movement within the period and that size. Cases without a steady state are reported as such (tested). Sub-steps follow the circuit's fastest ring, from the eigenvalues of every interval's matrix (a node capacitance, a small output capacitor with the inductance, the input bus): twenty per ring, at most 20000 per period; a circuit whose ring would span fewer than three sub-steps even then is refused. Averages, powers and the mean squares behind the rms values and conduction losses are the exact integrals of the solution over every sub-step (block matrix exponentials, Van Loan 1978), taken in each state's deviation from the first state the period visits in each interval, with the rate of change there summed in twice the precision, so that a battery's current behind a small resistance keeps the digits its samples give it and a mean square cannot come out negative (tested against 60-digit integrations through the same samples). The exponentials (scaling and squaring with a Padé approximant, Higham 2005), of the steps and of the integrals, are balanced by powers of two (Parlett and Reinsch 1969) and formed and squared less the identity, so a time constant far shorter than a sub-step costs the slow states no digits, also where a tiny bus capacitance sits behind a source resistance that is not small (the full and the partial sub-step's matrices against 90-digit exponentials, tested): within a few parts in 10^12 of the 60-digit integrations in the tested circuits, a time constant several hundred billion times shorter than a sub-step included, and between two grids of sub-steps within about 1e-10 (tested); over hundreds of random circuits, two grids from the same start agree as closely against the circuit's largest current or voltage, down to a battery current's resolution, wherever they see the same events (to rounding where the currents themselves are only rounding, as for a capacitor alone that has settled); extremes include the samples and peaks between them, where a slope changes sign or dips through zero and back, checked also near a sub-step's start for a fast decay (tested); the slopes are the rate of change at the sample, summed in twice the precision and carried by the same exponentials, so a stiff bus's crest is placed to rounding (tested against 60- and 80-digit references); a slope within its own rounding (at a sub-step's start, also that of the rate's terms at the sample, which a fast mode amplifies), a slope that would move its output by less than a trillionth of its range, and a dip that the slope's rate cannot carry to zero are not searched (tested by the number of searches), while a turn far below the rounding of its output's constant terms is found (tested), at a price: an output that barely moves, at the rounding of its own value, is searched on its rounding turns, which makes a few circuits several times slower; parameters whose equations overflow are refused before the search (tested) |
| Validation grid: M and Δi_pp within 2 %, mode matches K/K_crit (buck, boost, buck-boost, flyback × 5 duty ratios × 4 values of K/K_crit) | ✅ 80 cases in `packages/pe-core/test/sim.test.ts`, plus forward CCM, energy balance (also with a node capacitance), ringing frequency, and regression cases from three independent reviews (reverse current, very slow states, fast ringing, the node capacitance while the diode conducts, the exact Jacobian against finite differences, the Newton line search, states that do not move within the cycle) |
| Cross-check against ngspice (`scripts/spice_crosscheck.py`, `sim-spice.test.ts`) | ✅ 34 circuits rebuilt as netlists from their schematics: every topology in CCM and DCM, every interval of every converter's model (tested), the forward converter with reset windings of 1 and 0.5 times the primary's turns and a rectifier held off by a battery, node-capacitance ringing (also with a battery), a Thevenin source, batteries with and without a resistor, a battery above the input (reverse current through the body diode), an output lifted above the input by an L-C overshoot (the body diode as the diode's current ends), a fixed output, a runaway start-up, capacitors charging (also a boost with a node capacitance from 0 V), and capacitors alone that stop behind a boost and a buck-boost with a node capacitance. Averages, extremes, end values and 40 waveform instants per quantity agree within 0.5 % of its largest magnitude in these cases, with 5 mV and 1 µA for the SPICE parts' extra diode drop and leakage; not compared: values within 20 ns of an event, and with a node capacitance the diode's peak and the buck's and flyback's input-current extremes (ngspice's picosecond take-over spike). A CI job reruns ngspice against the stored results |
| Invariants with every load (`sim-invariants.test.ts`) | ✅ five converters × R ∥ C, a battery, a battery and R, a fixed output (in DCM, below its balancing duty ratio) × ideal and lossy, and a capacitor alone behind the buck and the forward converter: charge and volt-second balance, i_C = C dv/dt, source power = load power + losses (the balances hold by construction in a periodic steady state; the energy balances check the model); energy conserved over start-ups from rest |
| Source-driven mode: bus pinned at V_g,crit within 2 % (constant V_oc) | ✅ Phase 3a |
| Source-driven mode: sinusoidal and user-drawn V_oc envelopes | ✅ in the SourceMatcher tool (Phase 3c): the simulator's source-driven flyback, cycle by cycle over an envelope period after the bus settles |
| Simulator page (`simulate/simulator`): topology buttons, presets, sliders, waveforms, mode badge, compare-with-formula panel, losses; state in the URL hash; runs in a Web Worker | ✅ EN and KO, Phase 3a |
| Simulator loads: R ∥ C, a battery (open-circuit voltage behind its internal resistance, the Rint model), a battery and R, C alone from V_0, an ideal fixed voltage; a table of where the load's power goes | ✅ EN and KO, with four new presets (a buck and a flyback charging a battery, a flyback charging a capacitor, a buck into a fixed voltage) and a worked example |
| Operating modes: the steady period split into modes, each with its circuit (branches carrying current coloured, arrows in the current's direction, the switch and its body diode as they conduct, each element's name and state), a description (the parts that conduct; each inductor's average voltage, the table's number, split across its winding resistance and its inductance, and what its current does; the forward converter's core reset; the capacitor, battery, fixed output and source) and a table of every element's state, current and voltage; the charts shade the selected mode | ✅ EN and KO: Kirchhoff's current law at every node of the drawn circuit at every sample (every topology × load × node capacitance × source, `sim-schematic.test.ts`); states against hand-checked cases, each mode's description against its states for every converter (the forward converter's too) in fixed and seeded random circuits, and the states against the physics (an inductance's average voltage along its current has the sign of the current's change, a capacitor's voltage rises while it charges, a battery charges only above its open-circuit voltage) (`sim-sequence.test.ts`); drawn paths closed and the coloured currents balanced at every node in every mode (`sim-flow.test.ts`; a current below a thousandth of its scale counts as none: the largest in the mode among the elements it flows with, capped for an inductor at its own peak and at least the load's or source's draw for a capacitor, the load's and source's elements against their own peaks; where the counting currents at a node do not balance, the element with the largest one that does not count is measured against the largest that does; rounding, below a billionth of the circuit's natural current, never counts); as rendered, each inductor's voltage in the description equals the table's, the core reset is said in its mode, an instant inside a mode is printed inside its range, a circuit at rest shows no modes and no bands (`SequenceView.test.ts`); a text for every mode, element and state in both languages (`sequence.test.ts`); no overlap in the drawing for any circuit in either language (`seqlayout.test.ts` with estimated text widths, `scripts/seq_check.mjs` with the browser's own in CI, also the legend and the mode strip at 1280, 768 and 360 px); the forward converter's magnetizing voltage is L_M di_M/dt (`sim-invariants.test.ts`); the instant each current ends within 3 ns of ngspice (2.1 ns at worst, `sim-spice.test.ts`); each mode's averages are exact integrals over the mode (periodIntegrals over its samples), which add up over the modes to the period's averages within 1e-11 of the current's peak, and the output capacitor's charge to C times its voltage's change, also with a 2 ns output time constant (`sim-sequence.test.ts`) |
| No steady state: the simulator says which state keeps changing and by how much per cycle (the average inductor voltage, the balancing duty ratio, the forward converter's reset limit; a capacitor's gain per cycle) and shows the start-up from rest | ✅ EN and KO (`sim-diagnose.test.ts`): a fixed output at, below and above its balancing duty ratio, the buck-boost's inverted ratio, the forward converter's magnetizing current first; a duty ratio within the tolerance of the balance (steady) and just beyond it (runaway); a capacitor alone that charges without bound, settles at the input (buck, also with a node capacitance, losses and a source), keeps its start voltage, an L-C peak or, above the reset limit with R_on, its start-up's stop (forward), stops where its start-up stops with a node capacitance (the start-up is followed first, for at most 4000 periods and two million sub-steps: a current still alternating, a start-up past a lower stopping voltage, an input bus still recovering; a start-up still charging then is reported up to about 0.07 % below its stop in random trials); searches cut short (unsettled); a diode the model holds off but forward-biased beyond its drop (the two-switch converters' diode, the forward converter's rectifier, freewheeling and reset diodes: a buck, a buck-boost or a flyback on a source too weak for its load, a forward converter beyond its reset limit on one or with a switch drop above its sagging bus, a boost whose output falls below its input) and a switch voltage below zero (also a bus below zero in DCM's idle interval, without a node capacitance), each beyond a ten-thousandth of the circuit's largest voltage, are flagged as outside the model, in the waveforms the page draws (the steady period with its exact extremes between samples, or the whole start-up), and the page says the results may not hold; a bus below zero elsewhere is not (ngspice with every diode agrees with three such circuits); the start-up's sub-steps resolve the circuit's fastest ring (from the eigenvalues of every interval), and so do the search's and a capacitor alone's follow; a forward converter's rectifier turned on with no voltage across it as its bus sags lets no current back; a negative current through the body diode, the switch on or off, and from the instant the diode's current ends with the output above the input. The messages and the load table are tested in `Simulator.test.ts` |
| "Try it" simulator links (`<TrySim>`) from 02/03 pages | ✅ 10 pages, EN and KO |
| Screenshots on tool pages (`scripts/screenshots.mjs`, checked by `modulelint.py`) | ✅ explorer, simulator, converter designer, magnetics designer, loss budget, clamp check, source matcher, sense chain |
| Keyboard focus order of tool pages (`scripts/keyboard_check.mjs`, CI) | ✅ explorer, simulator, converter designer, magnetics designer, loss budget, clamp check, source matcher, sense chain |
| LTspice `.asc`, ngspice `.cir` and Falstad links on the simulator page | 🟡 LTspice and ngspice (Phase 5a): the simulator page links each preset's schematic and netlist (tested, EN and KO); Falstad links come with Phase 5b |
| SPICE library (`sim/`, `scripts/sim_library.py`): the five converters as LTspice schematics and ngspice netlists, seven cases with the examples of the simulator's presets (buck and flyback in CCM and DCM); READMEs with what to plot, the waveforms ngspice computes and its numbers beside the equations' | ✅ Phase 5a: every file generated from one list of parts; each schematic read back into a netlist (the pins from LTspice's own symbol files) equals its `.cir` part by part (tested, with drawing mistakes it must catch); ngspice within 1 % of the catalogue's ideal equations and settled (CI reruns it and compares with `sim/results.json`); the in-browser simulator within 1 % of ngspice on every average and extreme (`sim-library.test.ts`); LTspice 26.1.1 under wine, run once (not in CI): the netlist it writes from each schematic has the `.cir`'s parts, and its results agree with ngspice's within 0.3 % of each quantity's largest magnitude |
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
| Example numbers: each worked example, preset and quiz example is labelled an example; every page's footer states once that example numbers are synthetic (`PRIVACY_RULES.md`, checked by `privacy_scan.py`) | ✅ 68 examples, EN and KO |
| Wording: filler and repeated statements removed; Korean pages give the English term in parentheses at the first use of a technical term (BUILD_SPEC §8) | ✅ all 178 pages (89 EN, 89 KO) |
| Figures drawn from code (`scripts/gen_figures.py`): schematics in schemdraw, idealized waveforms in matplotlib, in the site's symbols; inlined in the theme's text colour, with a caption and a text alternative in EN and KO and the source each follows (`src/lib/figures.ts`, tested); CI redraws them and fails on a difference | ✅ 8 figures: buck, boost, buck-boost, flyback and forward schematics; the buck's switch-node voltage, volt-second balance, inductor current in CCM, at the boundary and in DCM |

Definition of done (CLAUDE.md): EN and KO pages present (or KO pending here); theory uses only `<Eq>` embeds and each Eq has ≥ 1 test vector; "Try it" links a tool preset; "Go deeper" has ≥ 2 verified resources with retrieval dates; a gotchas subsection exists; quiz with ≥ 5 explained questions; build, tests and all lints green.

Legend: ✅ done · 🟡 partial · ⬜ not started · ➖ not applicable. "Phase" is the build phase that delivers the module (docs/BUILD_SPEC.md §7); "later" = not scheduled in phases 0–5. 00-foundations and 01-physics are compact refreshers (Phase 2 scope).

_Last updated: Phase 5c (simulation pages). `python scripts/modulelint.py` checks every ✅ below against the pages themselves._

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
| design-procedure | 4 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | homes `mag.Kg_req`, `mag.Kg_core` |
| winding-loss | 4 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | homes `wind.phi_foil`, `wind.dowell_low`, `wind.loss_rel`, `wind.phi_opt` |
| leakage | 4 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | homes `xfmr.k`, `xfmr.L_sc`, `xfmr.L_sc_T` |
| snubbers-clamps | 4 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | homes `snub.C_par`, `snub.L_par`, `snub.R`, `snub.P`, `snub.P_R` |
| measurement | 4 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | homes `meas.L_app`, `xfmr.V_oc` |

## 05-simulation

| Module | Phase | EN | KO | `<Eq>` only | Try it | Go deeper ≥ 2 | Gotchas | Quiz ≥ 5 | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| ltspice | 5 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | homes `filter.tau_env`, `sim.periods_settle`; the library's schematics, their directives and how long a run from rest needs |
| ngspice | 5 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | homes `num.gain_tr`, `num.gain_be`; the trapezoidal rule's ringing and Gear's damping, what the library found at ngspice's defaults |
| falstad | 5 | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | Phase 5b, with the CircuitJS1 circuits |
| python | 5 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | homes `num.rel_diff`, `num.unit_roundoff`; derivations, generated LaTeX and vectors, the tolerances of the site's checks |
| in-browser-simulator | 5 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | homes `sim.exact_step`, `num.gain_fe`; exact steps within an interval, events, the periodic steady state by Newton's method |

## 06-bench

| Module | Phase | EN | KO | `<Eq>` only | Try it | Go deeper ≥ 2 | Gotchas | Quiz ≥ 5 | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| layout | 4 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | homes `layout.v_spike`, `layout.L_ring` |
| gate-drive | 4 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | homes `gate.I_on`, `gate.I_off`, `gate.t_pl`, `boot.C` |
| current-sensing | 4 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | homes `sense.burden`, `sense.pad_error` (moved from design/sense-chain, which links to them) |
| probes | 4 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | homes `probe.t_rise`, `probe.f_ring` |
| thermal | 4 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | homes `therm.Tj`, `therm.psi` |
| protection | 4 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | homes `inrush.I_pk`, `inrush.I2t`, `inrush.I_ramp` |
| low-temp | 4 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | homes `bat.v_term` |

## 07-harvesting

| Module | Phase | EN | KO | `<Eq>` only | Try it | Go deeper ≥ 2 | Gotchas | Quiz ≥ 5 | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| source-models | 4 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | homes `src.Pmax` (moved from design/source-matcher), `piezo.Vp`, `piezo.R_opt`, `piezo.P_R` |
| matching | 4 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | homes `src.cv_power`, `src.cv_extraction`, `lfr.Vg`, `lfr.eta` (moved from design/source-matcher) |
| lfr-dcm-flyback | 4 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | homes `lfr.L_M`, `lfr.Vg_power` (moved from design/source-matcher); links the simulator's current-limited source |
| sece-sshi-mppt | 4 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | homes `piezo.P_std`, `piezo.P_std_max`, `piezo.P_sece`, `piezo.P_sshi`, `piezo.P_sshi_max` |
| synthetic-case | 4 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | homes `lfr.P_env`; the case of BUILD_SPEC §7 Phase 4 in `examples/synthetic/harvesting-source.yaml` |

## 08-gotchas

Gotcha pages are not modules: each follows the template symptom · why · how to confirm · fix · references
(BUILD_SPEC §5), carries its tags, and has a Korean mirror; `python scripts/modulelint.py` checks all three.

| Gotcha | Phase | EN | KO | Notes |
| --- | --- | --- | --- | --- |
| index | 4 | ✅ | ✅ | the list of every gotcha, then under its own heading the lists by tag, built from the pages (`<GotchaIndex part="list" />`, `<GotchaIndex part="tags" />`); links the template `docs/GOTCHA_TEMPLATE.md` (mission M9) |
| lcr-self-resonance | 4 | ✅ | ✅ | seed 1; links `passive.f_srf`, `meas.L_app`, `mag.L_from_AL`; example `lcr-srf` |
| two-wire-resistance | 4 | ✅ | ✅ | seed 2; links `wind.dcr`, `wind.rho_T` |
| ceramic-dc-bias | 4 | ✅ | ✅ | seed 3; links `buck.ripple.v`; example `ceramic-bias` (new) |
| tvs-clamping-voltage | 4 | ✅ | ✅ | seed 4; links `tvs.V_clamp`, `clamp.Vds`; example `clamp-tvs` |
| current-output-headroom | 4 | ✅ | ✅ | seed 5; links `sense.current_out_monitor`; example `sense-current` |
| shunt-pad-resistance | 4 | ✅ | ✅ | seed 6; links `sense.pad_error`; example `bench-sense` |
| timer-power-gating | 4 | ✅ | ✅ | seed 7; cites `ti_tpl5110` (new, SNAS650A) |
| flyback-open-load | 4 | ✅ | ✅ | seed 8; links `flyback.V_ceiling`, `clamp.rcd.V`; cites `st_an316`, `ti_ssztcv6`; example `clamp-tvs` |
| electrolytic-cold-esr | 4 | ✅ | ✅ | seed 9; links `cap.esr.ripple`; example `bench-cold` |
| wide-bandgap-gate-drive | 4 | ✅ | ✅ | seed 10; cites `nexperia_an90059` (new), `epc_wp008` |
| flyback-source-pinning | 4 | ✅ | ✅ | seed 11; links `lfr.R_in`, `flyback.V_crit`, `src.cv_extraction`, `lfr.Vg`, `flyback.Vds_off`, `lfr.L_M`; example and simulator preset `flyback-source` |
| dmm-true-average | 4 | ✅ | ✅ | seed 12; links `sense.burden`, `fourier.pulse.harm`; cites `kester_mt027` (new) |
| sub-nyquist-pulses | 4 | ✅ | ✅ | seed 13; links `adc.nyquist`, `fourier.pulse.harm` |

## 09-missions

Nine missions with acceptance criteria (`<Mission>`: src/content/missions/<locale>/<id>.yaml, the same criterion ids in
both languages) and a local-only progress tracker: localStorage in the reader's browser (src/lib/missionstore.ts), no
account, nothing sent; the index lists every mission with its progress (`<MissionProgress>`). A criterion with an answer
check takes a number and ticks itself within its tolerance of a synthetic example's value. `modulelint.py` checks each
page: its sections (Goal, Before you start, Steps, Acceptance criteria, Gotchas, Go deeper, Quiz), a tool link in its
steps, its criteria in both languages, two resources and its quiz.

| Mission | Phase | EN | KO | Criteria ≥ 3 | Tool link | Go deeper ≥ 2 | Gotchas | Quiz ≥ 5 | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| m1-derive-buck | 5 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | explorer (`buck.ripple.iL`); checks `buck-basic` V and Δi_L; the catalogue's checks broken on purpose |
| m2-find-k-crit | 5 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | simulator (buck, boost, light-load buck), explorer (`Kcrit.boost`); checks K_crit, the DCM output |
| m3-boost-rhp-zero | 5 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | explorer (`boost.ss.wz`); checks ω_z, ω_0 of `boost-basic`, ω_z of `buckboost-basic` |
| m4-buck-inductor | 5 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | magnetics designer (`mag-kg`); checks K_g and the copper loss of `kg-inductor` |
| m5-flyback-clamp | 5 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | simulator (`flyback-ccm`), clamp check (RCD, TVS); checks V_DS, V_R, V_OR, the clamped V_DS, the ceiling |
| m6-lfr-matching | 5 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | source matcher (`source-lfr`); checks P_max, R_in, L_M, V_g |
| m7-loss-budget | 5 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | loss budget (`loss-buck`, which now computes its gate-drive loss); checks P_gate; a bench plan |
| m8-sense-chain | 5 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | sense chain (`sense-current`); checks the burden, the offset-equivalent current, the filter corner |
| m9-write-a-gotcha | 5 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | simulator (`sim-buck-fixed`); the gotcha template and the site's checks |

## 10-resources

Generated from `resources.yaml` by `<ResourceTable>`: every row is in the page, and a script adds a text search and filters
by type, level and tag. Every seed item of BUILD_SPEC §6 is resolved (none removed; TI's PSDS recordings and its archive
index are one entry, typed video). `scripts/resources_check.py --online` opens every URL and matches its title in CI, or,
where a host turns the runner away, the title of the URL's latest Internet Archive capture.

| Page | Phase | EN | KO | Notes |
| --- | --- | --- | --- | --- |
| index | 4 | ✅ | ✅ | every resource in one table |
| books | 4 | ✅ | ✅ | `book`, `chapter`: Erickson & Maksimović (and its chapters), Mohan et al., Basso, Hart, Würth's *Trilogy of Magnetics*, Dixon's *Magnetics Design Handbook* |
| courses | 4 | ✅ | ✅ | `course`, `lecture`: the CU Boulder specializations and courses, MIT OCW 6.334, 6.002, 6.003 |
| videos | 4 | ✅ | ✅ | `video`, `channel`: ADI's *LTspice Basics*, TI's PSDS library, Ben-Yaakov's channel |
| app-notes | 4 | ✅ | ✅ | `app-note`, `article`, `datasheet` |
| tools | 4 | ✅ | ✅ | LTspice, ngspice, CircuitJS1, TDK's Ferrite Magnetic Design Tool, KaTeX, Starlight |
| papers | 4 | ✅ | ✅ | Zi et al., Singer, Steinmetz, Dowell, Ottman et al. (2002, 2003), Guyomar et al., Lefeuvre et al. (2005, 2006), Esram & Chapman |

## Site infrastructure pages

| Page | EN | KO | Notes |
| --- | --- | --- | --- |
| landing (`index`) | ✅ | ✅ | Phase 0 |
| about | ✅ | ✅ | Phase 0 |
| about/equation-pipeline | ✅ | ✅ | Phase 0 acceptance page: one `<Eq>` + Plotly island |
| 02-theory/derivations | ✅ | ✅ | auto-rendered from `python/pe_core/derive/*.py`: 19 modules, 161 derived equations (Phase 5c) |
| design/explorer | ✅ | ✅ | Phase 2a: evaluate and sweep any catalogue equation; state in the URL hash ("Try it" target); screenshot and keyboard check (Phase 3a) |
| simulate/simulator | ✅ | ✅ | Phase 3a: the pe-core simulator; state in the URL hash (`<TrySim>` target); screenshot and keyboard check |
| design/converter-designer | ✅ | ✅ | Phase 3b; state in the URL hash; screenshot and keyboard check |
| design/magnetics-designer | ✅ | ✅ | Phase 3e; homes the thirteen magnetics and winding equations (`mag.N_Bmax`, `mag.gap_length`, `mag.B_ac`, `wind.round_area`, `wind.fill`, `wind.rho_T`, `wind.dcr`, `wind.skin_depth`, `wind.porosity`, `wind.phi_round`, `wind.dowell`, `xfmr.leakage.ps`, `xfmr.leakage.psp`); the 04-magnetics pages refer to them; state in the URL hash; screenshot and keyboard check |
| design/loss-budget | ✅ | ✅ | Phase 3b; state in the URL hash; screenshot and keyboard check |
| design/clamp-check | ✅ | ✅ | Phase 3c; homes the eight clamp equations (`flyback.V_OR`, `clamp.*`, `tvs.*`, `flyback.V_ceiling`); state in the URL hash; screenshot and keyboard check |
| design/source-matcher | ✅ | ✅ | Phase 3c; links to `src.Pmax`, `src.cv_power`, `src.cv_extraction`, `lfr.Vg`, `lfr.eta`, `lfr.Vg_power`, whose homes moved to the 07-harvesting pages (Phase 4c); state in the URL hash; screenshot and keyboard check |
| design/sense-chain | ✅ | ✅ | Phase 3d; homes six `sense.*` equations and `adc.nyquist`; `sense.burden` and `sense.pad_error` moved to the current-sensing bench page (Phase 4b); state in the URL hash; screenshot and keyboard check |
| 10-resources/bibliography | ✅ | ✅ | Phase 1: generated from `references.bib` (verified entries only) |
