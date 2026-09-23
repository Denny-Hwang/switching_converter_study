# Synthetic examples

The only non-textbook numbers allowed on the site (PRIVACY_RULES.md): round,
made-up parameter sets that are **not** taken from any real design. Every
file must declare `synthetic: true`, and a short `label` and `label_ko` that
name it as an example ("Buck example", "벅 예제"; `scripts/privacy_scan.py`
enforces this). The `<Worked>` component shows that label wherever the
numbers appear, and every page's footer says once that example numbers are
synthetic (`src/components/Footer.astro`).

Schema:

```yaml
synthetic: true
label: "Buck example"
label_ko: "벅 예제"
params:      # SI units, keyed by symbol names from equations.yaml
  V_g: 24
steps:       # evaluated in order by pe-core (runSteps); each result is stored
  - def.Ts   # under the equation's lhs symbol, or `as:` if given
  - {eq: buck.dcm.M, as: M_dcm}
checks:      # optional comparisons shown in worked examples
  - {when: "K > K_crit", then: {en: CCM, ko: CCM}, else: {en: DCM, ko: DCM}}
```
