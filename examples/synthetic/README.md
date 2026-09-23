# Synthetic examples

The only non-textbook numbers allowed on the site (PRIVACY_RULES.md): round,
made-up parameter sets that are **not** taken from any real design. Every
file must declare `synthetic: true` and a `label` containing the word
"synthetic" (`scripts/privacy_scan.py` enforces this), and pages must show
that label wherever the numbers appear (the `<Worked>` component does).

Schema:

```yaml
synthetic: true
label: "Synthetic ... (round numbers, not a real design)"
label_ko: "..."
params:      # SI units, keyed by symbol names from equations.yaml
  V_g: 24
steps:       # evaluated in order by pe-core (runSteps); each result is stored
  - def.Ts   # under the equation's lhs symbol, or `as:` if given
  - {eq: buck.dcm.M, as: M_dcm}
checks:      # optional comparisons shown in worked examples
  - {when: "K > K_crit", then: {en: CCM, ko: CCM}, else: {en: DCM, ko: DCM}}
```
