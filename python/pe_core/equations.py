"""Load and validate ``equations.yaml`` and build sympy objects from it.

``packages/pe-core/equations/equations.yaml`` is the single source of truth
for every equation on the site. Nothing in this package hand-types an
equation: expressions are parsed from the YAML, and everything else
(LaTeX, test vectors, derivation checks) is built from the ``Catalog``
returned by :func:`load`.
"""

from __future__ import annotations

import math
import re
from dataclasses import dataclass, field
from functools import cached_property
from pathlib import Path
from typing import Any, Mapping

import sympy as sp
import yaml
from sympy.parsing.sympy_parser import (
    parse_expr,
    rationalize,
    standard_transformations,
)

REPO_ROOT = Path(__file__).resolve().parents[2]
EQUATIONS_DIR = REPO_ROOT / "packages" / "pe-core" / "equations"
YAML_PATH = EQUATIONS_DIR / "equations.yaml"
GENERATED_JSON = EQUATIONS_DIR / "equations.generated.json"
VECTORS_JSON = EQUATIONS_DIR / "test_vectors.json"

ID_RE = re.compile(r"^[A-Za-z][A-Za-z0-9_]*(\.[A-Za-z0-9_]+)+$")
SYMBOL_RE = re.compile(r"^[A-Za-z][A-Za-z0-9_]*$")

# Names usable in `expr` without a symbol_table entry.
BUILTINS: dict[str, Any] = {
    "sqrt": sp.sqrt,
    "pi": sp.pi,
    "exp": sp.exp,
    "log": sp.log,
    "sin": sp.sin,
    "cos": sp.cos,
    "tan": sp.tan,
    "sinh": sp.sinh,
    "cosh": sp.cosh,
    "tanh": sp.tanh,
    "atan": sp.atan,
    "Abs": sp.Abs,
}

TRANSFORMATIONS = standard_transformations + (rationalize,)

REQUIRED_FIELDS = ("id", "title", "title_ko", "lhs", "expr", "symbols", "assumptions", "cite", "tests")
OPTIONAL_FIELDS = (
    "convention",
    "convention_ko",
    "derived_by",
    "notes",
    "notes_ko",
    "relation",
    "ranges",
    "constraints",
)


class EquationError(ValueError):
    """Raised when equations.yaml violates the schema or its own tests."""


@dataclass(frozen=True)
class SymbolInfo:
    name: str
    latex: str
    unit: str
    desc: str
    range: tuple[float, float] | None
    sign: str = "positive"  # "positive" | "real"
    scale: str = "linear"  # random-vector sampling: "linear" | "log"


@dataclass
class Equation:
    id: str
    title: str
    title_ko: str
    lhs: str
    expr_src: str
    symbols: dict[str, str]
    assumptions: list[str]
    cite_key: str
    cite_where: str
    tests: list[dict[str, Any]]
    line: int
    convention: str = ""
    convention_ko: str = ""
    derived_by: str | None = None
    notes: str = ""
    notes_ko: str = ""
    relation: str = "eq"  # "eq" | "approx"
    ranges: dict[str, tuple[float, float]] = field(default_factory=dict)
    constraints: list[str] = field(default_factory=list)


@dataclass
class Catalog:
    schema_version: int
    symbols: dict[str, SymbolInfo]
    assumption_labels: dict[str, dict[str, str]]
    equations: list[Equation]
    source: Path

    # ------------------------------------------------------------------ lookup
    def by_id(self, eq_id: str) -> Equation:
        for eq in self.equations:
            if eq.id == eq_id:
                return eq
        raise KeyError(eq_id)

    @cached_property
    def sympy_symbols(self) -> dict[str, sp.Symbol]:
        out: dict[str, sp.Symbol] = {}
        for name, info in self.symbols.items():
            if info.sign == "positive":
                out[name] = sp.Symbol(name, positive=True)
            else:
                out[name] = sp.Symbol(name, real=True)
        return out

    def sym(self, name: str) -> sp.Symbol:
        return self.sympy_symbols[name]

    @property
    def local_dict(self) -> dict[str, Any]:
        return {**BUILTINS, **self.sympy_symbols}

    # ------------------------------------------------------------- expressions
    def expr(self, eq: Equation) -> sp.Expr:
        """Evaluated (canonical) sympy expression; use for maths and numbers."""
        return parse_expr(eq.expr_src, local_dict=self.local_dict, transformations=TRANSFORMATIONS)

    def display_expr(self, eq: Equation) -> sp.Expr:
        """Unevaluated expression that keeps the author's term order for display."""
        raw = parse_expr(
            eq.expr_src,
            local_dict=self.local_dict,
            transformations=TRANSFORMATIONS,
            evaluate=False,
        )
        return tidy(raw)

    def free_names(self, eq: Equation) -> list[str]:
        return sorted(s.name for s in self.expr(eq).free_symbols)

    def evaluate(self, eq: Equation, inputs: Mapping[str, float], digits: int = 30) -> float:
        """Evaluate ``expr`` at ``inputs`` with ``digits`` significant digits.

        Inputs are taken as the exact binary value of the given floats, which
        is what the TypeScript evaluators receive from JSON.
        """
        e = self.expr(eq)
        subs = {}
        for s in e.free_symbols:
            if s.name not in inputs:
                raise EquationError(f"{eq.id}: missing input {s.name!r}")
            subs[s] = sp.Float(float(inputs[s.name]), digits + 10)
        val = sp.N(e.subs(subs), digits)
        if not val.is_real:
            raise EquationError(f"{eq.id}: non-real value {val} at {dict(inputs)}")
        out = float(val)
        if not math.isfinite(out):
            raise EquationError(f"{eq.id}: non-finite value at {dict(inputs)}")
        return out

    def constraint_ok(self, eq: Equation, inputs: Mapping[str, float]) -> bool:
        for c in eq.constraints:
            rel = parse_expr(c, local_dict=self.local_dict, transformations=TRANSFORMATIONS)
            subs = {self.sym(k): sp.Float(float(v), 40) for k, v in inputs.items()}
            if not bool(rel.subs(subs)):
                return False
        return True


# --------------------------------------------------------------------- tidying
def tidy(e: sp.Basic) -> sp.Basic:
    """Clean an unevaluated parse tree for display.

    ``parse_expr(..., evaluate=False)`` keeps the author's term order but
    leaves artefacts such as ``Mul(1, x)`` (printed "1 x") and nested
    ``Mul(-1, ...)`` (printed "(-1) x"). This removes unit factors and hoists
    signs so the LaTeX printer emits a leading minus instead.
    """
    if not e.args or isinstance(e, sp.Number):
        return e
    args = [tidy(a) for a in e.args]
    if isinstance(e, sp.Mul):
        flat: list[sp.Basic] = []
        for a in args:
            flat.extend(a.args if isinstance(a, sp.Mul) else (a,))
        sign = 1
        rest: list[sp.Basic] = []
        for a in flat:
            if a == sp.Integer(1):
                continue
            if a == sp.Integer(-1):
                sign = -sign
                continue
            rest.append(a)
        if not rest:
            return sp.Integer(sign)
        body = rest[0] if len(rest) == 1 else sp.Mul(*rest, evaluate=False)
        if sign < 0:
            return sp.Mul(sp.Integer(-1), body, evaluate=False)
        return body
    try:
        return e.func(*args, evaluate=False)
    except TypeError:
        return e.func(*args)


# ---------------------------------------------------------------------- loading
def _line_numbers(text: str) -> list[int]:
    """1-based line number of each item of the top-level `equations` list."""
    root = yaml.compose(text)
    if root is None:
        return []
    for key_node, value_node in root.value:
        if key_node.value == "equations":
            return [item.start_mark.line + 1 for item in value_node.value]
    return []


def _range(value: Any, where: str) -> tuple[float, float] | None:
    if value is None:
        return None
    if not (isinstance(value, list) and len(value) == 2):
        raise EquationError(f"{where}: range must be [lo, hi]")
    lo, hi = float(value[0]), float(value[1])
    if not lo < hi:
        raise EquationError(f"{where}: range lo must be < hi")
    return (lo, hi)


def load(path: Path | str = YAML_PATH) -> Catalog:
    """Parse and structurally validate equations.yaml."""
    path = Path(path)
    text = path.read_text(encoding="utf-8")
    data = yaml.safe_load(text)
    if not isinstance(data, dict):
        raise EquationError("equations.yaml: top level must be a mapping")
    lines = _line_numbers(text)

    symbols: dict[str, SymbolInfo] = {}
    for name, spec in (data.get("symbol_table") or {}).items():
        if not SYMBOL_RE.match(name):
            raise EquationError(f"symbol_table: invalid symbol name {name!r}")
        if name in BUILTINS:
            raise EquationError(f"symbol_table: {name!r} shadows a sympy built-in")
        if not isinstance(spec, dict) or "latex" not in spec or "unit" not in spec or "desc" not in spec:
            raise EquationError(f"symbol_table.{name}: needs latex, unit, desc")
        sign = spec.get("sign", "positive")
        scale = spec.get("scale", "linear")
        if sign not in ("positive", "real"):
            raise EquationError(f"symbol_table.{name}: sign must be positive|real")
        if scale not in ("linear", "log"):
            raise EquationError(f"symbol_table.{name}: scale must be linear|log")
        symbols[name] = SymbolInfo(
            name=name,
            latex=str(spec["latex"]),
            unit=str(spec["unit"]),
            desc=str(spec["desc"]),
            range=_range(spec.get("range"), f"symbol_table.{name}"),
            sign=sign,
            scale=scale,
        )

    labels = data.get("assumption_labels") or {}
    for tag, lab in labels.items():
        if not isinstance(lab, dict) or not lab.get("en") or not lab.get("ko"):
            raise EquationError(f"assumption_labels.{tag}: needs en and ko")

    equations: list[Equation] = []
    seen: set[str] = set()
    for idx, raw in enumerate(data.get("equations") or []):
        line = lines[idx] if idx < len(lines) else 0
        where = f"equations.yaml:{line}"
        missing = [f for f in REQUIRED_FIELDS if f not in raw]
        if missing:
            raise EquationError(f"{where}: missing fields {missing}")
        unknown = set(raw) - set(REQUIRED_FIELDS) - set(OPTIONAL_FIELDS)
        if unknown:
            raise EquationError(f"{where}: unknown fields {sorted(unknown)}")
        eq_id = str(raw["id"])
        if not ID_RE.match(eq_id):
            raise EquationError(f"{where}: invalid id {eq_id!r}")
        if eq_id in seen:
            raise EquationError(f"{where}: duplicate id {eq_id!r}")
        seen.add(eq_id)
        cite = raw["cite"]
        if not isinstance(cite, dict) or not cite.get("key"):
            raise EquationError(f"{where}: cite needs a key")
        relation = raw.get("relation", "eq")
        if relation not in ("eq", "approx"):
            raise EquationError(f"{where}: relation must be eq|approx")
        ranges = {k: _range(v, f"{where} ranges.{k}") for k, v in (raw.get("ranges") or {}).items()}
        equations.append(
            Equation(
                id=eq_id,
                title=str(raw["title"]),
                title_ko=str(raw["title_ko"]),
                lhs=str(raw["lhs"]),
                expr_src=str(raw["expr"]),
                symbols={str(k): str(v) for k, v in raw["symbols"].items()},
                assumptions=[str(a) for a in raw["assumptions"]],
                cite_key=str(cite["key"]),
                cite_where=str(cite.get("where", "")),
                tests=list(raw["tests"] or []),
                line=line,
                convention=str(raw.get("convention", "")),
                convention_ko=str(raw.get("convention_ko", "")),
                derived_by=raw.get("derived_by"),
                notes=str(raw.get("notes", "")),
                notes_ko=str(raw.get("notes_ko", "")),
                relation=relation,
                ranges={k: v for k, v in ranges.items() if v is not None},
                constraints=[str(c) for c in (raw.get("constraints") or [])],
            )
        )

    catalog = Catalog(
        schema_version=int(data.get("schema_version", 0)),
        symbols=symbols,
        assumption_labels={k: dict(v) for k, v in labels.items()},
        equations=equations,
        source=path,
    )
    validate(catalog)
    return catalog


def validate(catalog: Catalog) -> None:
    """Semantic checks that need sympy (symbols, tests, assumptions)."""
    for eq in catalog.equations:
        where = f"{eq.id} (equations.yaml:{eq.line})"
        if eq.lhs not in catalog.symbols:
            raise EquationError(f"{where}: lhs {eq.lhs!r} not in symbol_table")
        for tag in eq.assumptions:
            if tag not in catalog.assumption_labels:
                raise EquationError(f"{where}: assumption {tag!r} has no assumption_labels entry")
        try:
            e = catalog.expr(eq)
            catalog.display_expr(eq)
        except Exception as exc:  # noqa: BLE001 - re-raised with context
            raise EquationError(f"{where}: cannot parse expr {eq.expr_src!r}: {exc}") from exc
        declared = set(catalog.symbols)
        names = {s.name for s in e.free_symbols}
        undeclared = names - declared
        if undeclared:
            raise EquationError(f"{where}: symbols not in symbol_table: {sorted(undeclared)}")
        if set(eq.symbols) != names:
            raise EquationError(
                f"{where}: `symbols` keys {sorted(eq.symbols)} must equal the free symbols of expr {sorted(names)}"
            )
        for name in names:
            if catalog.symbols[name].range is None and name not in eq.ranges:
                raise EquationError(f"{where}: symbol {name!r} has no range for random vectors")
        if not eq.tests:
            raise EquationError(f"{where}: at least one test is required")
        for i, t in enumerate(eq.tests):
            inputs = t.get("inputs") or {}
            if set(inputs) != names:
                raise EquationError(f"{where}: test {i} inputs {sorted(inputs)} != {sorted(names)}")
            got = catalog.evaluate(eq, inputs)
            want = float(t["expect"])
            if not close(got, want, rel=1e-9):
                raise EquationError(f"{where}: test {i} expects {want!r} but expr gives {got!r}")


def close(a: float, b: float, rel: float = 1e-9, abs_floor: float = 1e-300) -> bool:
    return abs(a - b) <= max(rel * max(abs(a), abs(b)), abs_floor)
