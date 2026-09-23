"""Generate shared numeric test vectors (test_vectors.json).

For every equation: the hand-written ``tests`` from equations.yaml (already
checked against sympy by :func:`pe_core.equations.validate`) plus
``RANDOM_PER_EQUATION`` seeded random vectors inside the declared symbol
ranges. Values are computed with sympy/mpmath at 30 significant digits and
rounded to the nearest double. The TypeScript evaluators must reproduce
every value to ``TOLERANCE_REL``.

Determinism: the RNG is seeded per equation id (CRC32), sampled inputs are
rounded to 6 significant digits, and values come from arbitrary-precision
arithmetic, so the file is byte-identical across machines.
"""

from __future__ import annotations

import math
import random
import zlib
from typing import Any

from .equations import Catalog, Equation, EquationError

RANDOM_PER_EQUATION = 6
TOLERANCE_REL = 1e-9
MAX_TRIES = 2000


def round_sig(x: float, sig: int = 6) -> float:
    if x == 0:
        return 0.0
    return float(f"{x:.{sig - 1}e}")


def _sample(rng: random.Random, lo: float, hi: float, scale: str) -> float:
    if scale == "log" and lo > 0:
        return round_sig(math.exp(rng.uniform(math.log(lo), math.log(hi))))
    return round_sig(rng.uniform(lo, hi))


def random_inputs(catalog: Catalog, eq: Equation, rng: random.Random) -> dict[str, float]:
    names = catalog.free_names(eq)
    for _ in range(MAX_TRIES):
        inputs = {}
        for name in names:
            info = catalog.symbols[name]
            lo, hi = eq.ranges.get(name) or info.range  # type: ignore[misc]
            inputs[name] = _sample(rng, lo, hi, info.scale)
        if catalog.constraint_ok(eq, inputs):
            return inputs
    raise EquationError(f"{eq.id}: could not satisfy constraints {eq.constraints} in {MAX_TRIES} tries")


def build_vectors(catalog: Catalog) -> dict[str, Any]:
    vectors: list[dict[str, Any]] = []
    for eq in catalog.equations:
        for t in eq.tests:
            inputs = {k: float(v) for k, v in sorted(t["inputs"].items())}
            vectors.append(
                {"id": eq.id, "source": "yaml", "inputs": inputs, "value": catalog.evaluate(eq, inputs)}
            )
        rng = random.Random(zlib.crc32(eq.id.encode("utf-8")))
        for _ in range(RANDOM_PER_EQUATION):
            inputs = dict(sorted(random_inputs(catalog, eq, rng).items()))
            vectors.append(
                {"id": eq.id, "source": "random", "inputs": inputs, "value": catalog.evaluate(eq, inputs)}
            )
    return {
        "_generated_by": "python scripts/gen_equations.py -- DO NOT EDIT",
        "tolerance_rel": TOLERANCE_REL,
        "random_per_equation": RANDOM_PER_EQUATION,
        "vectors": vectors,
    }


def count_by_id(vectors: dict[str, Any]) -> dict[str, int]:
    counts: dict[str, int] = {}
    for v in vectors["vectors"]:
        counts[v["id"]] = counts.get(v["id"], 0) + 1
    return counts
