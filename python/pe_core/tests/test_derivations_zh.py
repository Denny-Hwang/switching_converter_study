"""The Chinese of the derivations (pe_core/derive/zh.json): every title, intro and step has it, every
entry belongs to a step, and each keeps its English's math."""

from __future__ import annotations

import re
from importlib import import_module

import pytest

from pe_core.derive import MODULES
from pe_core.derive.common import zh_texts

MATH = re.compile(r"(?<!\\)\$(.+?)(?<!\\)\$")


@pytest.fixture(scope="module")
def derivations():
    return {m: import_module(f"pe_core.derive.{m}").derive() for m in MODULES}


def test_every_text_has_its_chinese(derivations) -> None:
    for m, d in derivations.items():
        assert d.title_zh and d.intro_zh, f"{m}: title or intro without Chinese in zh.json"
        missing = [st.text for st in d.steps if not st.text_zh]
        assert not missing, f"{m}: steps without Chinese in zh.json: {missing[:3]}"


def test_every_chinese_text_belongs_to_a_step(derivations) -> None:
    assert set(zh_texts()) == set(derivations), "zh.json must have exactly the derivation modules"
    for m, d in derivations.items():
        stale = set(zh_texts()[m]["steps"]) - {st.text for st in d.steps}
        assert not stale, f"{m}: zh.json has steps no derivation shows (English changed?): {sorted(stale)[:3]}"


def test_chinese_keeps_the_math(derivations) -> None:
    for m, d in derivations.items():
        pairs = [(d.intro, d.intro_zh)] + [(st.text, st.text_zh) for st in d.steps]
        for en, zh in pairs:
            assert MATH.findall(zh) == MATH.findall(en), f"{m}: math differs in {zh!r}"
