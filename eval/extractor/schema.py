"""The claim contract, shared by the extractor, the verifier and the labelled set.

A claim's `type` decides who checks it: state and threat claims go to
python-chess, plan claims go to Stockfish, and unverifiable claims go nowhere
and are counted. `structured` is the extractor's attempt to say what a claim
asserts in a form a handler can evaluate; when it cannot, the claim still
carries its text and is scored as unverifiable rather than being dropped.

Dropping it would be the tempting mistake. A model whose reasoning cannot be
made checkable has told you something real about that reasoning, and silently
discarding those claims would flatter it.
"""

from __future__ import annotations

CLAIM_TYPES = ("state", "line", "best_move", "unverifiable")

# Every structured kind the verifier implements a handler for. The extractor is
# shown this list; anything outside it is left unstructured on purpose, so a
# mismatch shows up as an unverifiable claim rather than as a crash.
STRUCTURED_KINDS = (
    "pinned",
    "attacked",
    "defended",
    "hanging",
    "material",
    "check",
    "mate_in",
    "controls_square",
    "piece_on_square",
    "castling_rights",
    "passed_pawn",
    "line",
    "best_move",
    "unverifiable",
)

# What each kind needs before a handler can evaluate it. Fields not listed are
# optional and narrow the claim when present.
REQUIRED_FIELDS: dict[str, tuple[str, ...]] = {
    "pinned": ("square",),
    "attacked": ("square",),
    "defended": ("square",),
    "hanging": ("square",),
    "material": ("count",),
    "check": (),
    "mate_in": ("count",),
    "controls_square": ("square", "by"),
    "piece_on_square": ("square",),
    "castling_rights": ("by",),
    "passed_pawn": ("square",),
    "line": ("moves", "assertion"),
    "best_move": (),
    "unverifiable": (),
}


def is_negated(structured: dict | None) -> bool:
    """Whether the claim asserts the opposite of what its kind computes.

    Reasoning is full of negative assertions -- "the knight is not defended",
    "nothing attacks e5" -- and without a way to express them every one would
    land in the unverifiable bucket. That would not be a neutral loss: negative
    claims are where careless reasoning most often goes wrong, so discarding
    them would systematically flatter the models being measured.
    """
    return bool(isinstance(structured, dict) and structured.get("negated"))


def is_well_formed(structured: dict | None) -> bool:
    """Whether a handler could even attempt this claim."""
    if not isinstance(structured, dict):
        return False
    kind = structured.get("kind")
    if kind not in STRUCTURED_KINDS:
        return False
    return all(structured.get(field) is not None for field in REQUIRED_FIELDS[kind])
