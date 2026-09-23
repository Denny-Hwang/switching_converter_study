"""pe_core -- verification side of the power-electronics learning repository.

* :mod:`pe_core.equations`  load/validate equations.yaml, build sympy objects
* :mod:`pe_core.gen_latex`  generate LaTeX + metadata (equations.generated.json)
* :mod:`pe_core.gen_vectors` generate shared numeric vectors (test_vectors.json)
* :mod:`pe_core.numeric`    fast float evaluation (numeric mirror of pe-core TS)
* :mod:`pe_core.derive`     derivation scripts that must reproduce the YAML
"""

__version__ = "0.0.1"
