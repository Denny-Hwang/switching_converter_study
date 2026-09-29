"""The release's version is one number everywhere: the npm workspace and its lock file, pe-core, the
Python package, and the latest release in CHANGELOG.md (whose date is a real date and which the Korean
and the Chinese summaries start with)."""

from __future__ import annotations

import datetime as dt
import json
import re
import tomllib
from pathlib import Path

import pe_core

ROOT = Path(__file__).resolve().parents[3]


def latest_release() -> tuple[str, str]:
    m = re.search(r"^## \[(\d+\.\d+\.\d+)\] - (\d{4}-\d{2}-\d{2})$", (ROOT / "CHANGELOG.md").read_text(encoding="utf-8"), re.M)
    assert m, "CHANGELOG.md: no release heading '## [X.Y.Z] - YYYY-MM-DD'"
    return m.group(1), m.group(2)


def test_one_version_everywhere() -> None:
    version, _ = latest_release()
    lock = json.loads((ROOT / "package-lock.json").read_text(encoding="utf-8"))
    found = {
        "package.json": json.loads((ROOT / "package.json").read_text(encoding="utf-8"))["version"],
        "package-lock.json": lock["version"],
        'package-lock.json packages[""]': lock["packages"][""]["version"],
        "package-lock.json packages/pe-core": lock["packages"]["packages/pe-core"]["version"],
        "packages/pe-core/package.json": json.loads((ROOT / "packages/pe-core/package.json").read_text(encoding="utf-8"))["version"],
        "python/pyproject.toml": tomllib.loads((ROOT / "python/pyproject.toml").read_text(encoding="utf-8"))["project"]["version"],
        "pe_core.__version__": pe_core.__version__,
    }
    assert {k: v for k, v in found.items() if v != version} == {}, f"CHANGELOG.md's latest release is {version}"


def test_the_release_date_is_a_date() -> None:
    _, date = latest_release()
    dt.date.fromisoformat(date)


def summary_starts_with_latest(heading: str) -> bool:
    version, date = latest_release()
    text = (ROOT / "CHANGELOG.md").read_text(encoding="utf-8")
    assert f"\n## {heading}\n" in text, f"CHANGELOG.md: no '## {heading}' section"
    m = re.search(r"^### \[(\d+\.\d+\.\d+)\] - (\d{4}-\d{2}-\d{2})$", text.split(f"\n## {heading}\n", 1)[1], re.M)
    return bool(m) and (m.group(1), m.group(2)) == (version, date)


def test_the_korean_summary_has_the_latest_release() -> None:
    assert summary_starts_with_latest("한국어 요약"), "CHANGELOG.md: the Korean summary must start with the latest release"


def test_the_chinese_summary_has_the_latest_release() -> None:
    assert summary_starts_with_latest("中文摘要"), "CHANGELOG.md: the Chinese summary must start with the latest release"
