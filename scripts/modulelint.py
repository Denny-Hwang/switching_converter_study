#!/usr/bin/env python3
"""modulelint -- the definition of done (CLAUDE.md) for learning-module pages.

A page is a module page when its frontmatter has `module: true`. For each:

  * the h2 sections are exactly, in this order,
      EN: Intent, Theory, Worked example, Try it, Bench exercise, Gotchas,
          Go deeper, Quiz
      KO: 목표, 이론, 풀이 예제, 직접 해 보기, 벤치 실습, 주의할 점,
          더 알아보기, 퀴즈
  * Theory embeds at least one <Eq id="..."> (mathlint checks the ids and
    their test vectors);
  * Worked example uses <Worked example="..."> with an existing
    examples/synthetic/<name>.yaml;
  * Try it has a <TryIt eq="..." example="..."> with a known equation and
    example;
  * Go deeper lists at least two resources.yaml ids, each with a retrieval
    date;
  * Quiz embeds <Quiz id="<section>/<page>"> and that quiz exists for the
    page's locale with >= 5 questions, 2-6 options each, answers in range and
    `numbers: synthetic`;
  * the Korean page mirrors the English one: the same block components
    (Eq, Worked, TryIt, GoDeeper, Quiz) with the same attributes in the same
    order, the same inline components (Cite, EqRef, Val) in any order (Korean
    word order differs), and a quiz with the same answer key;
  * docs/STATUS.md agrees: every existing module page is marked done (✅) in
    its language and in every definition-of-done column, and an English page
    without a Korean page is marked KO "pending".

    python scripts/modulelint.py
"""

from __future__ import annotations

import json
import re
import sys
from collections import Counter
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parents[1]
DOCS = ROOT / "src" / "content" / "docs"
QUIZZES = ROOT / "src" / "content" / "quizzes"
EXAMPLES = ROOT / "examples" / "synthetic"
RESOURCES = ROOT / "resources.yaml"
STATUS = ROOT / "docs" / "STATUS.md"
GENERATED = ROOT / "packages" / "pe-core" / "equations" / "equations.generated.json"

SECTIONS = {
    "en": ["Intent", "Theory", "Worked example", "Try it", "Bench exercise", "Gotchas", "Go deeper", "Quiz"],
    "ko": ["목표", "이론", "풀이 예제", "직접 해 보기", "벤치 실습", "주의할 점", "더 알아보기", "퀴즈"],
}
BLOCK = ("Eq", "Worked", "TryIt", "GoDeeper", "Quiz")
INLINE = ("Cite", "EqRef", "Val")
COMPONENT = re.compile(r"<(" + "|".join(BLOCK + INLINE) + r")\b((?:[^>\"'{}]|\"[^\"]*\"|'[^']*'|\{[^}]*\})*)/?>")
ATTR = re.compile(r"(\w+)\s*=\s*(?:\"([^\"]*)\"|\{([^}]*)\})")
DOD_COLUMNS = ("EN", "KO", "`<Eq>` only", "Try it", "Go deeper ≥ 2", "Gotchas", "Quiz ≥ 5")


def strip_code(text: str) -> str:
    """Blank out fenced code and MDX comments, keeping line numbers."""

    def blank(m: re.Match[str]) -> str:
        return re.sub(r"[^\n]", " ", m.group(0))

    text = re.sub(r"^(```|~~~).*?^\1[^\n]*$", blank, text, flags=re.S | re.M)
    return re.sub(r"\{/\*.*?\*/\}", blank, text, flags=re.S)


def frontmatter(text: str) -> tuple[dict, str]:
    m = re.match(r"\A---\n(.*?)\n---\n", text, re.S)
    if not m:
        return {}, text
    return yaml.safe_load(m.group(1)) or {}, text[m.end():]


def components(text: str) -> list[tuple[str, dict[str, str]]]:
    out = []
    for m in COMPONENT.finditer(text):
        attrs = {a.group(1): (a.group(2) if a.group(2) is not None else "{" + a.group(3) + "}") for a in ATTR.finditer(m.group(2))}
        out.append((m.group(1), attrs))
    return out


def sections(body: str) -> list[tuple[str, str]]:
    """[(h2 heading, section text)] in order."""
    parts = re.split(r"^## +(.+?)\s*$", body, flags=re.M)
    return [(parts[i].strip(), parts[i + 1]) for i in range(1, len(parts) - 1, 2)]


def quoted_list(value: str) -> list[str]:
    """"{['a', "b"]}" -> ['a', 'b']"""
    return [a or b for a, b in re.findall(r"'([^']+)'|\"([^\"]+)\"", value)]


def signature(comps: list[tuple[str, dict[str, str]]], kinds: tuple[str, ...]) -> list[tuple[str, dict[str, str]]]:
    """Components of the given kinds, without translatable attributes (an EqRef label)."""
    return [(c, {k: v for k, v in a.items() if not (c == "EqRef" and k == "label")}) for c, a in comps if c in kinds]


def load_quiz(locale: str, quiz_id: str) -> dict | None:
    path = QUIZZES / locale / f"{quiz_id}.yaml"
    return yaml.safe_load(path.read_text(encoding="utf-8")) if path.exists() else None


def check_quiz(data: dict | None, where: str) -> list[str]:
    if data is None:
        return [f"{where}: quiz file is missing"]
    errors = []
    if data.get("numbers") != "synthetic":
        errors.append(f"{where}: quiz must declare `numbers: synthetic`")
    questions = data.get("questions") or []
    if len(questions) < 5:
        errors.append(f"{where}: quiz has {len(questions)} questions, needs at least 5")
    for i, q in enumerate(questions, 1):
        opts = q.get("options") or []
        if not 2 <= len(opts) <= 6:
            errors.append(f"{where}: question {i} needs 2-6 options")
        if not isinstance(q.get("answer"), int) or not 0 <= q["answer"] < len(opts):
            errors.append(f"{where}: question {i} answer index out of range")
        for field in ("q", "explain"):
            if not str(q.get(field) or "").strip():
                errors.append(f"{where}: question {i} has no {field}")
    return errors


def status_rows() -> dict[tuple[str, str], dict[str, str]]:
    """(section, module) -> {column: cell} from the tables in docs/STATUS.md."""
    rows: dict[tuple[str, str], dict[str, str]] = {}
    section = None
    header: list[str] = []
    for line in STATUS.read_text(encoding="utf-8").splitlines():
        h = re.match(r"^## +(\S+)", line)
        if h:
            section, header = h.group(1), []
            continue
        if not line.startswith("|") or section is None:
            continue
        cells = [c.strip() for c in line.strip().strip("|").split("|")]
        if not header:
            header = cells
        elif not set(line) <= set("|-: "):
            rows[(section, cells[0])] = dict(zip(header, cells))
    return rows


def main() -> int:
    catalog = json.loads(GENERATED.read_text(encoding="utf-8"))["equations"]
    resources = {r["id"]: r for r in (yaml.safe_load(RESOURCES.read_text(encoding="utf-8")) or {}).get("resources", [])}
    examples = {p.stem for p in EXAMPLES.glob("*.yaml")}
    status = status_rows()
    errors: list[str] = []
    pages: dict[tuple[str, str], list[tuple[str, dict[str, str]]]] = {}

    for path in sorted(DOCS.rglob("*.mdx")):
        rel = path.relative_to(DOCS)
        locale, slug = rel.parts[0], "/".join(rel.with_suffix("").parts[1:])
        meta, body = frontmatter(strip_code(path.read_text(encoding="utf-8")))
        if meta.get("module") is not True:
            continue
        where = str(path.relative_to(ROOT))
        if locale not in SECTIONS:
            errors.append(f"{where}: unknown locale {locale!r}")
            continue
        found = sections(body)
        heads = [h for h, _ in found]
        if heads != SECTIONS[locale]:
            errors.append(f"{where}: h2 sections must be {SECTIONS[locale]}, found {heads}")
            continue
        text = dict(found)
        name = dict(zip(SECTIONS["en"], SECTIONS[locale]))

        theory = [a for c, a in components(text[name["Theory"]]) if c == "Eq"]
        if not theory:
            errors.append(f"{where}: the Theory section embeds no <Eq id=\"...\" />")

        worked = [a for c, a in components(text[name["Worked example"]]) if c == "Worked"]
        if not worked:
            errors.append(f"{where}: the Worked example section has no <Worked example=\"...\" />")
        for a in worked:
            if a.get("example") not in examples:
                errors.append(f"{where}: <Worked example=\"{a.get('example')}\"> has no examples/synthetic file")

        tries = [a for c, a in components(text[name["Try it"]]) if c == "TryIt"]
        if not tries:
            errors.append(f"{where}: the Try it section has no <TryIt eq=\"...\" example=\"...\" />")
        for a in tries:
            if a.get("eq") not in catalog:
                errors.append(f"{where}: <TryIt eq=\"{a.get('eq')}\"> is not a catalogue equation")
            if a.get("example") not in examples:
                errors.append(f"{where}: <TryIt example=\"{a.get('example')}\"> has no examples/synthetic file")

        ids = [i for c, a in components(text[name["Go deeper"]]) if c == "GoDeeper" for i in quoted_list(a.get("ids", ""))]
        if len(set(ids)) < 2:
            errors.append(f"{where}: Go deeper needs at least two resources, found {ids}")
        for rid in ids:
            if rid not in resources:
                errors.append(f"{where}: Go deeper resource {rid!r} is not in resources.yaml")
            elif not resources[rid].get("retrieved"):
                errors.append(f"{where}: resource {rid!r} has no retrieval date")

        quizzes = [a.get("id") for c, a in components(text[name["Quiz"]]) if c == "Quiz"]
        if quizzes != [slug]:
            errors.append(f"{where}: the Quiz section must embed exactly <Quiz id=\"{slug}\" />, found {quizzes}")
        else:
            errors += check_quiz(load_quiz(locale, slug), f"src/content/quizzes/{locale}/{slug}.yaml")

        pages[(locale, slug)] = components(body)

        section, module = slug.split("/", 1) if "/" in slug else ("", slug)
        row = status.get((section, module))
        if row is None:
            errors.append(f"docs/STATUS.md: no row for module {section}/{module}")
        else:
            col = "EN" if locale == "en" else "KO"
            if "✅" not in row.get(col, ""):
                errors.append(f"docs/STATUS.md: {section}/{module} {col} must be ✅ (the page exists and passes modulelint)")
            if locale == "en":
                for c in DOD_COLUMNS[2:]:
                    if "✅" not in row.get(c, ""):
                        errors.append(f"docs/STATUS.md: {section}/{module} column {c!r} must be ✅")

    # Korean mirrors English
    for (locale, slug), comps in pages.items():
        if locale != "en":
            continue
        section, module = slug.split("/", 1) if "/" in slug else ("", slug)
        ko = pages.get(("ko", slug))
        if ko is None:
            row = status.get((section, module), {})
            if "pending" not in row.get("KO", "").lower():
                errors.append(f"src/content/docs/en/{slug}.mdx: no Korean page, and docs/STATUS.md does not mark KO pending")
            continue
        if signature(comps, BLOCK) != signature(ko, BLOCK):
            errors.append(f"src/content/docs/ko/{slug}.mdx: block components differ from the English page (Eq, Worked, TryIt, GoDeeper, Quiz)")
        en_inline = Counter(json.dumps(x, sort_keys=True) for x in signature(comps, INLINE))
        ko_inline = Counter(json.dumps(x, sort_keys=True) for x in signature(ko, INLINE))
        if en_inline != ko_inline:
            missing = en_inline - ko_inline
            extra = ko_inline - en_inline
            errors.append(f"src/content/docs/ko/{slug}.mdx: inline components differ from the English page (missing {list(missing)}, extra {list(extra)})")
        en_quiz, ko_quiz = load_quiz("en", slug), load_quiz("ko", slug)
        if en_quiz and ko_quiz:
            en_key = [(q.get("answer"), len(q.get("options") or [])) for q in en_quiz.get("questions") or []]
            ko_key = [(q.get("answer"), len(q.get("options") or [])) for q in ko_quiz.get("questions") or []]
            if en_key != ko_key:
                errors.append(f"src/content/quizzes/ko/{slug}.yaml: answer key or option counts differ from the English quiz")

    if errors:
        print(f"modulelint: {len(errors)} error(s)", file=sys.stderr)
        for e in errors:
            print("  " + e, file=sys.stderr)
        return 1
    n_en = sum(1 for (loc, _) in pages if loc == "en")
    n_ko = sum(1 for (loc, _) in pages if loc == "ko")
    print(f"modulelint: OK ({n_en} EN and {n_ko} KO module pages)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
