"""Resolves a written plan to the move it implies, so Stockfish can score it.

Most plans name their move outright -- "trade on c5 with Bxc5" -- and reading
it off the text costs nothing. Only when that fails is a model asked, because
every fallback call is both money and a chance for the resolver's own chess to
leak into a number that is supposed to be about the model under test. The
resolver is therefore given one job with one allowed answer, and is explicitly
forbidden from improving on the plan it was handed.

A plan that resolves to nothing is left unscored rather than assigned the
played move. Assuming they agree would make the consistency metric measure
itself.
"""

from __future__ import annotations

import re

import chess

from ..config import Config
from ..manifest import hash_text
from ..runner.client import chat

UCI_TOKEN = re.compile(r"\b([a-h][1-8][a-h][1-8][qrbn]?)\b", re.IGNORECASE)
SAN_TOKEN = re.compile(
    r"(?:O-O-O|O-O|[KQRBN][a-h]?[1-8]?x?[a-h][1-8](?:=[QRBN])?[+#]?"
    r"|[a-h](?:x[a-h])?[1-8](?:=[QRBN])?[+#]?)"
)

RESOLVER_SYSTEM = """You are given a chess position and one sentence describing \
a player's plan. Name the first move that plan implies.

Answer with a single move in UCI notation and nothing else. If the plan does \
not imply any specific first move, or you cannot tell which move it means, \
answer NONE.

Do not choose the best move. Do not correct the plan. Report only the move the \
sentence itself points to."""


def resolver_hash() -> str:
    return hash_text(RESOLVER_SYSTEM)


def move_from_text(board: chess.Board, text: str) -> chess.Move | None:
    """The first legal move named in the text, read as UCI then as SAN.

    First rather than best: a plan's opening clause is its first move, and
    picking the strongest mention would quietly upgrade a vague plan.
    """
    if not text:
        return None

    for match in UCI_TOKEN.finditer(text):
        try:
            move = chess.Move.from_uci(match.group(1).lower())
        except ValueError:
            continue
        if move in board.legal_moves:
            return move

    for match in SAN_TOKEN.finditer(text):
        try:
            return board.parse_san(match.group(0))
        except (ValueError, chess.IllegalMoveError, chess.AmbiguousMoveError):
            continue
    return None


def resolve(
    client, cfg: Config, board: chess.Board, plan: str
) -> tuple[chess.Move | None, float]:
    """The plan's first move, and what asking for it cost."""
    direct = move_from_text(board, plan)
    if direct is not None or not plan.strip():
        return direct, 0.0

    result = chat(
        client,
        cfg.extractor,
        [
            {"role": "system", "content": RESOLVER_SYSTEM},
            {
                "role": "user",
                "content": (
                    f"FEN: {board.fen()}\n\n"
                    f"Board:\n{board}\n\n"
                    f"Plan: {plan}"
                ),
            },
        ],
        cfg.limits,
    )
    if result.error:
        return None, 0.0

    return move_from_text(board, result.text), result.cost_usd
