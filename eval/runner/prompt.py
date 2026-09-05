"""The prompt every model sees, frozen and content-hashed.

A score is meaningless without knowing which prompt produced it. Reword one
sentence and every previous number silently becomes incomparable, which is how
an eval quietly rots. So the text is immutable, its hash is stamped into the
run manifest, and a test asserts the hash: changing a single character fails
the suite, which makes altering the instrument a deliberate act rather than an
accident.

To change the prompt, add v2 alongside v1. Do not edit v1.
"""

from __future__ import annotations

import chess

from ..manifest import hash_text

PROMPT_VERSION = "v1"

SYSTEM = """You are solving a chess puzzle. Exactly one move is best.

Think about the position, then answer in exactly this format, with nothing \
before or after it:

<reasoning>
Your analysis of the position.
</reasoning>
<plan>One sentence stating the plan behind your move.</plan>
<move>UCI</move>

The move must be in UCI notation: origin square then destination square, with a \
promotion piece appended when the move promotes. Castling is written as the \
king's move. Examples: e2e4, g8f6, e1g1, e7e8q."""


def position(fen: str) -> str:
    """FEN, side to move, and the board drawn out.

    The diagram is redundant with the FEN and is included anyway: reading a FEN
    is a mechanical decoding step, and making a model pay that cost measures
    its notation handling rather than its chess.
    """
    board = chess.Board(fen)
    return "\n".join(
        [
            f"FEN: {fen}",
            f"Side to move: {'White' if board.turn == chess.WHITE else 'Black'}",
            "",
            "Board (uppercase = White, lowercase = Black):",
            str(board),
        ]
    )


def retry(fen: str) -> str:
    """The single retry after an illegal move.

    The legal move list is withheld from the first prompt on purpose -- reading
    legality off the position is part of what is being measured -- but once a
    model has already failed at it, withholding it a second time would only
    measure the same thing twice.
    """
    board = chess.Board(fen)
    legal = " ".join(sorted(move.uci() for move in board.legal_moves))
    return (
        f"That move is illegal. Legal moves: [{legal}]\n\n"
        "Reply again in the same format (<reasoning>, <plan>, <move>)."
    )


def prompt_hash() -> str:
    """Identity of the prompt as a whole, independent of any one position.

    Covers the system text and the shape of the position and retry renderings,
    so a change to any of the three shows up as a different hash.
    """
    sample = "8/8/8/8/8/8/8/K6k w - - 0 1"
    return hash_text("\n".join([SYSTEM, position(sample), retry(sample)]))
