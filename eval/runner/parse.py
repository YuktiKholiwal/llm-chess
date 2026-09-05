"""Pulls the three tagged sections out of a model's reply.

Models are told to emit <reasoning>, <plan> and <move>. The fallbacks below
catch the near-misses that are formatting slips rather than chess failures --
a fenced tag, a bare UCI move on the last line -- because charging a model a
retry for markdown habits would measure the wrong thing.

Format compliance is still recorded: `parse` reports which sections were
actually tagged, so the score can separate "wrote a bad move" from "would not
follow the output contract".
"""

from __future__ import annotations

import re
from dataclasses import dataclass

UCI = r"[a-h][1-8][a-h][1-8][qrbnQRBN]?"

_TAG = {
    name: re.compile(rf"<{name}>(.*?)</{name}>", re.DOTALL | re.IGNORECASE)
    for name in ("reasoning", "plan", "move")
}
_BARE_UCI = re.compile(rf"\b({UCI})\b")


@dataclass(frozen=True)
class Parsed:
    reasoning: str
    plan: str
    move: str | None
    """Which of the three sections arrived inside their tags."""
    tagged: frozenset[str]


def _last(name: str, text: str) -> str | None:
    """The last occurrence wins, so a model that restates its answer is taken
    at its final word rather than its first."""
    found = _TAG[name].findall(text)
    return found[-1].strip() if found else None


def _clean_move(raw: str) -> str | None:
    candidate = re.sub(r"[^a-zA-Z1-8]", "", raw).lower()
    return candidate if re.fullmatch(UCI, candidate) else None


def parse(text: str) -> Parsed:
    tagged: set[str] = set()

    reasoning = _last("reasoning", text)
    if reasoning is not None:
        tagged.add("reasoning")

    plan = _last("plan", text)
    if plan is not None:
        tagged.add("plan")

    move: str | None = None
    raw_move = _last("move", text)
    if raw_move is not None:
        move = _clean_move(raw_move)
        if move is not None:
            tagged.add("move")

    # No usable tag: take the last UCI-shaped token anywhere in the reply. A
    # model that ends with "so I play g1f3" has answered the question.
    if move is None:
        hits = _BARE_UCI.findall(text)
        if hits:
            move = hits[-1].lower()

    # An untagged reply still has reasoning in it; treating it as empty would
    # give the model nothing to extract claims from and score it as silent
    # rather than as non-compliant.
    if reasoning is None:
        reasoning = _strip_tags(text)

    return Parsed(
        reasoning=reasoning.strip(),
        plan=(plan or "").strip(),
        move=move,
        tagged=frozenset(tagged),
    )


def _strip_tags(text: str) -> str:
    for pattern in _TAG.values():
        text = pattern.sub("", text)
    return re.sub(r"</?(reasoning|plan|move)>", "", text, flags=re.IGNORECASE)
