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
    (Eq, Worked, TryIt, TrySim, GoDeeper, Quiz, Figure, CoreKg, MagWorked,
    TryMag) with the same attributes in the same order, the same inline
    components (Cite, EqRef, Val) in any order (Korean word order differs),
    and a quiz with the same answer key; a component that is neither (a new
    one) is an error until it is added to one of the two lists, so that no
    content escapes the comparison;
  * docs/STATUS.md agrees: every existing module page is marked done (✅) in
    its language and in every definition-of-done column, and an English page
    without a Korean page is marked KO "pending".

A page under 08-gotchas/ is a gotcha page (docs/BUILD_SPEC.md section 5).
Each one except the index:

  * has `gotcha: {tags: [...]}` in its frontmatter, every tag one of
    src/lib/gotchas.json, and shows them with <GotchaTags /> before its
    first section;
  * has exactly the h2 sections, in this order,
      EN: Symptom, Why, How to confirm, Fix, References
      KO: 증상, 원인, 확인 방법, 해결, 참고 자료
    and its References section cites at least one source (<Cite>);
  * has a Korean mirror with the same tags and components (as for modules),
    or docs/STATUS.md marks its KO pending; STATUS lists every gotcha.
The gotcha pages sit directly in 08-gotchas/, each with a one-line
description and no tag twice. The index embeds <GotchaIndex part="list" />,
then under an h2 of its own <GotchaIndex part="tags" />, which lists the
pages by their tags.

A page under 10-resources/ other than the bibliography lists resources.yaml
with <ResourceTable types={[...]} />; its Korean mirror lists the same types,
STATUS has its row, and every type used in resources.yaml has a page.

A page is a tool page when it embeds a tool island (<Explorer />,
<Simulator />, ...). Each tool page has a "Screenshot" section (KO: 스크린샷)
that shows an image imported from src/assets/screenshots/<tool>-<locale>.png
(docs/BUILD_SPEC.md section 7, Phase 3: every tool has a screenshot in its doc
page; `node scripts/screenshots.mjs` takes them).

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
BLOCK = ("Eq", "Worked", "TryIt", "TrySim", "GoDeeper", "Quiz", "Figure", "CoreKg", "MagWorked", "TryMag")
SIM_TOPOLOGIES = ("buck", "boost", "buckboost", "flyback", "forward")
TOOLS = ("Explorer", "Simulator", "ConverterDesigner", "MagneticsDesigner", "LossBudget", "ClampCheck", "SourceMatcher", "SenseChain")
TOOL_TAG = re.compile(r"<(" + "|".join(TOOLS) + r")\b")
SHOT_SECTION = {"en": "Screenshot", "ko": "스크린샷"}
SHOT_IMPORT = re.compile(r"^import\s+(\w+)\s+from\s+'((?:\.\./)+assets/screenshots/([\w-]+)\.png)';", re.M)
INLINE = ("Cite", "EqRef", "Val")
COMPONENT = re.compile(r"<(" + "|".join(BLOCK + INLINE) + r")\b((?:[^>\"'{}]|\"[^\"]*\"|'[^']*'|\{(?:[^{}]|\{[^{}]*\})*\})*)/?>")
ATTR = re.compile(r"(\w+)\s*=\s*(?:\"([^\"]*)\"|\{([^}]*)\})")
GOTCHAS_DIR = "08-gotchas"
GOTCHA_TAGS = set(json.loads((ROOT / "src" / "lib" / "gotchas.json").read_text(encoding="utf-8"))["tags"])
GOTCHA_SECTIONS = {
    "en": ["Symptom", "Why", "How to confirm", "Fix", "References"],
    "ko": ["증상", "원인", "확인 방법", "해결", "참고 자료"],
}
RESOURCES_DIR = "10-resources"
RESOURCE_TABLE = re.compile(r"<ResourceTable\b([^>]*)/>")
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


def unknown_components(text: str) -> list[str]:
    """Components on a module page that the EN/KO comparison does not know (neither BLOCK nor INLINE)."""
    return sorted(set(re.findall(r"<([A-Z]\w*)\b", text)) - set(BLOCK + INLINE))


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


def check_gotcha_index(where: str, body: str) -> list[str]:
    """The gotcha index: the list of pages, then, under an h2 of its own, the pages by tag."""
    listed = re.search(r'<GotchaIndex\s+part="list"\s*/>', body)
    by_tag = re.search(r'<GotchaIndex\s+part="tags"\s*/>', body)
    if not listed or not by_tag:
        return [f'{where}: the gotcha index must embed <GotchaIndex part="list" /> and, under an h2 of its own, <GotchaIndex part="tags" />']
    if by_tag.start() < listed.start() or not re.search(r"^## \S", body[listed.end():by_tag.start()], re.M):
        return [f'{where}: put an h2 (the table of contents shows it) between <GotchaIndex part="list" /> and <GotchaIndex part="tags" />']
    return []


def check_gotchas(status: dict[tuple[str, str], dict[str, str]]) -> tuple[list[str], int]:
    """The gotcha pages (08-gotchas): template, tags, Korean mirror, STATUS."""
    errors: list[str] = []
    pages: dict[tuple[str, str], tuple[list[str], list[tuple[str, dict[str, str]]]]] = {}
    for locale in SECTIONS:
        folder = DOCS / locale / GOTCHAS_DIR
        for path in sorted([*folder.rglob("*.mdx"), *folder.rglob("*.md")]) if folder.exists() else []:
            where = str(path.relative_to(ROOT))
            if path.parent != folder:
                errors.append(f"{where}: a gotcha page sits directly in {GOTCHAS_DIR}/, not in a subfolder (the index lists only those)")
                continue
            meta, body = frontmatter(strip_code(path.read_text(encoding="utf-8")))
            if meta.get("module"):
                errors.append(f"{where}: a gotcha page is not a module page (remove `module: true`)")
            if path.stem == "index":
                errors += check_gotcha_index(where, body)
                continue
            if not str(meta.get("description") or "").strip():
                errors.append(f"{where}: frontmatter needs a one-line `description` (the index shows it)")
            tags = (meta.get("gotcha") or {}).get("tags") if isinstance(meta.get("gotcha"), dict) else None
            if not isinstance(tags, list) or not tags:
                errors.append(f"{where}: frontmatter needs `gotcha: {{tags: [...]}}` with at least one tag")
                tags = []
            for tag in tags:
                if tag not in GOTCHA_TAGS:
                    errors.append(f"{where}: unknown gotcha tag {tag!r} (src/lib/gotchas.json)")
            if len({str(x) for x in tags}) != len(tags):
                errors.append(f"{where}: a gotcha tag is listed twice")
            # recorded before the section checks, so that a page with a wrong section still counts as a page
            pages[(locale, path.stem)] = (sorted(str(x) for x in tags), components(body))
            found = sections(body)
            heads = [h for h, _ in found]
            if heads != GOTCHA_SECTIONS[locale]:
                errors.append(f"{where}: h2 sections must be {GOTCHA_SECTIONS[locale]}, found {heads}")
                continue
            intro = re.split(r"^## ", body, maxsplit=1, flags=re.M)[0]
            if not re.search(r"<GotchaTags\s*/>", intro):
                errors.append(f"{where}: show the tags with <GotchaTags /> before the first section")
            refs = dict(found)[GOTCHA_SECTIONS[locale][-1]]
            if not any(c == "Cite" for c, _ in components(refs)):
                errors.append(f"{where}: the {GOTCHA_SECTIONS[locale][-1]} section cites no source (<Cite>)")

    for (locale, slug), (tags, comps) in pages.items():
        if locale != "en":
            continue
        row = status.get((GOTCHAS_DIR, slug))
        if row is None:
            errors.append(f"docs/STATUS.md: no row for gotcha {GOTCHAS_DIR}/{slug}")
            row = {}
        elif "✅" not in row.get("EN", ""):
            errors.append(f"docs/STATUS.md: {GOTCHAS_DIR}/{slug} EN must be ✅")
        ko = pages.get(("ko", slug))
        if ko is None:
            if "pending" not in row.get("KO", "").lower():
                errors.append(f"src/content/docs/en/{GOTCHAS_DIR}/{slug}.mdx: no Korean page, and docs/STATUS.md does not mark KO pending")
            continue
        if "✅" not in row.get("KO", ""):
            errors.append(f"docs/STATUS.md: {GOTCHAS_DIR}/{slug} KO must be ✅")
        ko_tags, ko_comps = ko
        if ko_tags != tags:
            errors.append(f"src/content/docs/ko/{GOTCHAS_DIR}/{slug}.mdx: tags {ko_tags} differ from the English page's {tags}")
        if signature(comps, BLOCK) != signature(ko_comps, BLOCK):
            errors.append(f"src/content/docs/ko/{GOTCHAS_DIR}/{slug}.mdx: block components differ from the English page")
        en_inline = Counter(json.dumps(x, sort_keys=True) for x in signature(comps, INLINE))
        ko_inline = Counter(json.dumps(x, sort_keys=True) for x in signature(ko_comps, INLINE))
        if en_inline != ko_inline:
            errors.append(f"src/content/docs/ko/{GOTCHAS_DIR}/{slug}.mdx: inline components differ from the English page (missing {list(en_inline - ko_inline)}, extra {list(ko_inline - en_inline)})")
    for (locale, slug) in pages:
        if locale == "ko" and ("en", slug) not in pages:
            errors.append(f"src/content/docs/ko/{GOTCHAS_DIR}/{slug}.mdx: no English page of that name")
    for locale in SECTIONS:
        if pages and not (DOCS / locale / GOTCHAS_DIR / "index.mdx").exists():
            errors.append(f"src/content/docs/{locale}/{GOTCHAS_DIR}/index.mdx: the gotcha pages need their index")
    for (section, slug) in status:
        if section == GOTCHAS_DIR and slug != "index" and ("en", slug) not in pages:
            errors.append(f"docs/STATUS.md: gotcha row {slug!r} has no page src/content/docs/en/{GOTCHAS_DIR}/{slug}.mdx")
    return errors, sum(1 for (loc, _) in pages if loc == "en")


def check_resource_pages(status: dict[tuple[str, str], dict[str, str]], resources: dict[str, dict]) -> list[str]:
    """The pages under 10-resources that list resources.yaml."""
    errors: list[str] = []
    listed: dict[tuple[str, str], list[str] | None] = {}
    for locale in SECTIONS:
        folder = DOCS / locale / RESOURCES_DIR
        for path in sorted(folder.glob("*.mdx")) if folder.exists() else []:
            if path.stem == "bibliography":
                continue
            where = str(path.relative_to(ROOT))
            _, body = frontmatter(strip_code(path.read_text(encoding="utf-8")))
            tables = RESOURCE_TABLE.findall(body)
            if len(tables) != 1:
                errors.append(f"{where}: a resource page embeds exactly one <ResourceTable />, found {len(tables)}")
                continue
            m = re.search(r"types\s*=\s*\{([^}]*)\}", tables[0])
            listed[(locale, path.stem)] = sorted(quoted_list(m.group(1))) if m else None
    for (locale, slug), types in listed.items():
        if locale == "en":
            row = status.get((RESOURCES_DIR, slug))
            if row is None or "✅" not in row.get("EN", "") or "✅" not in row.get("KO", ""):
                errors.append(f"docs/STATUS.md: {RESOURCES_DIR}/{slug} needs a row with EN and KO ✅")
            if ("ko", slug) not in listed:
                errors.append(f"src/content/docs/en/{RESOURCES_DIR}/{slug}.mdx: no Korean page")
            elif listed[("ko", slug)] != types:
                errors.append(f"src/content/docs/ko/{RESOURCES_DIR}/{slug}.mdx: lists types {listed[('ko', slug)]}, the English page {types}")
        elif ("en", slug) not in listed:
            errors.append(f"src/content/docs/ko/{RESOURCES_DIR}/{slug}.mdx: no English page of that name")
    if listed:
        covered = {ty for (loc, _), types in listed.items() if loc == "en" and types for ty in types}
        for rid, r in resources.items():
            if r.get("type") not in covered:
                errors.append(f"resources.yaml: {rid} has type {r.get('type')!r}, which no 10-resources page lists by type")
    return errors


def check_tool_page(path: Path, locale: str, body: str) -> list[str]:
    """A tool page shows a screenshot of its tool in its own language."""
    where = str(path.relative_to(ROOT))
    head = SHOT_SECTION.get(locale)
    shots = dict(sections(body)).get(head or "")
    if shots is None:
        return [f"{where}: a tool page needs a '## {head}' section with a screenshot of the tool"]
    errors = []
    used = 0
    for var, rel, stem in SHOT_IMPORT.findall(body):
        if not (path.parent / rel).resolve().is_file():
            errors.append(f"{where}: screenshot {rel} does not exist (node scripts/screenshots.mjs)")
        if not stem.endswith(f"-{locale}"):
            errors.append(f"{where}: screenshot {stem}.png is not the {locale} one ({stem.rsplit('-', 1)[0]}-{locale}.png)")
        if re.search(r"src=\{" + var + r"\}", shots):
            used += 1
    if not used:
        errors.append(f"{where}: the '{head}' section shows no image imported from assets/screenshots/")
    return errors


def main() -> int:
    catalog = json.loads(GENERATED.read_text(encoding="utf-8"))["equations"]
    resources = {r["id"]: r for r in (yaml.safe_load(RESOURCES.read_text(encoding="utf-8")) or {}).get("resources", [])}
    examples = {p.stem for p in EXAMPLES.glob("*.yaml")}
    status = status_rows()
    errors: list[str] = []
    pages: dict[tuple[str, str], list[tuple[str, dict[str, str]]]] = {}
    n_tools = 0

    for path in sorted(DOCS.rglob("*.mdx")):
        rel = path.relative_to(DOCS)
        locale, slug = rel.parts[0], "/".join(rel.with_suffix("").parts[1:])
        meta, body = frontmatter(strip_code(path.read_text(encoding="utf-8")))
        if TOOL_TAG.search(body):
            n_tools += 1
            errors += check_tool_page(path, locale, body)
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
        for a in [a for c, a in components(text[name["Try it"]]) if c == "TrySim"]:
            if a.get("example") not in examples:
                errors.append(f"{where}: <TrySim example=\"{a.get('example')}\"> has no examples/synthetic file")
            if a.get("topology") not in SIM_TOPOLOGIES:
                errors.append(f"{where}: <TrySim topology=\"{a.get('topology')}\"> is not a simulator topology")

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
        for tag in unknown_components(body):
            errors.append(
                f"{where}: <{tag}> is neither a block nor an inline component of modulelint; add it to BLOCK "
                "(compared in order) or INLINE (compared as a set) so the Korean page's mirror check covers it"
            )

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
            errors.append(f"src/content/docs/ko/{slug}.mdx: block components differ from the English page ({', '.join(BLOCK)})")
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

    gotcha_errors, n_gotchas = check_gotchas(status)
    errors += gotcha_errors
    errors += check_resource_pages(status, resources)

    if errors:
        print(f"modulelint: {len(errors)} error(s)", file=sys.stderr)
        for e in errors:
            print("  " + e, file=sys.stderr)
        return 1
    n_en = sum(1 for (loc, _) in pages if loc == "en")
    n_ko = sum(1 for (loc, _) in pages if loc == "ko")
    print(f"modulelint: OK ({n_en} EN and {n_ko} KO module pages, {n_gotchas} gotcha pages, {n_tools} tool pages with screenshots)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
