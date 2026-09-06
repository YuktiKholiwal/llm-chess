"""Checks a claim about a line of play.

Triage found that just over half of the claims nothing could check were
conditional move lines -- "if Qxc4, Nd2xc4 wins the queen for a rook", "after
2...Ke8 3.Rxd8+ Kxd8 White wins the rook". Those are the most substantive
things a model says about a position and they were all landing in the
unverifiable bucket, which meant the eval was measuring models on their
throwaway observations and ignoring their actual calculation.

A line claim is a sequence of moves plus an assertion about where it ends up.
Play the moves; if any is illegal the claim is false and the index says which.
Otherwise evaluate the assertion on the resulting position.

Where a model offers alternatives -- "Kf3/Ke3" -- every branch is played out and
the claim holds only if the assertion holds in all of them. A model that says
"whichever way the king runs, Rf8+ follows" is making a claim about both, and
letting one branch carry it would credit an argument it did not make.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any

import chess

from .handlers import PIECE_VALUE, material_balance, parse_color, parse_piece, parse_square

# A model that writes six alternatives is waving at a tree rather than naming a
# line; expanding it fully would cost more search than the claim is worth.
MAX_BRANCHES = 12
MAX_PLIES = 20
EVAL_DEPTH = 18

# "13...Rxd2", "14.Kxd2", "2. Ke8" -- move numbers and ellipses are notation,
# not moves, and models write them inconsistently.
_NUMBER = re.compile(r"^\d+\s*\.*(?:\.\.\.)?\s*")
_DECORATION = re.compile(r"[!?]+$")


@dataclass(frozen=True)
class LineVerdict:
    value: bool | None
    reason: str


def clean_san(token: str) -> str | None:
    """One SAN move, stripped of numbering and annotation glyphs."""
    token = _NUMBER.sub("", token.strip())
    token = _DECORATION.sub("", token)
    token = token.strip().strip(",;")
    return token or None


def tokenise(moves: Any) -> list[str]:
    """Accepts a list of moves or one string holding the whole line."""
    if isinstance(moves, str):
        raw = moves.split()
    elif isinstance(moves, (list, tuple)):
        raw = [part for move in moves for part in str(move).split()]
    else:
        return []
    return [cleaned for token in raw if (cleaned := clean_san(token))]


def branches(tokens: list[str]) -> list[list[str]]:
    """Expands "Kf3/Ke3" alternatives into the concrete lines they stand for."""
    lines: list[list[str]] = [[]]
    for token in tokens:
        options = [part for part in token.split("/") if part]
        if not options:
            continue
        expanded = [line + [option] for line in lines for option in options]
        if len(expanded) > MAX_BRANCHES:
            return []
        lines = expanded
    return lines


def play(board: chess.Board, tokens: list[str]) -> tuple[chess.Board | None, str, list[chess.Move]]:
    """Plays a line out, reporting which move broke if one did."""
    position = board.copy()
    played: list[chess.Move] = []
    for index, san in enumerate(tokens, start=1):
        try:
            move = position.parse_san(san)
        except (ValueError, chess.IllegalMoveError, chess.AmbiguousMoveError, chess.InvalidMoveError):
            return None, f"illegal move {index}", played
        played.append(move)
        position.push(move)
    return position, "", played


def _captured_types(board: chess.Board, moves: list[chess.Move]) -> set[int]:
    """Piece types taken over the course of a line."""
    position = board.copy()
    taken: set[int] = set()
    for move in moves:
        if position.is_en_passant(move):
            taken.add(chess.PAWN)
        else:
            victim = position.piece_at(move.to_square)
            if victim is not None:
                taken.add(victim.piece_type)
        position.push(move)
    return taken


def king_cannot_go(board: chess.Board, square: str, side: Any = None) -> bool | None:
    """Whether that king has no legal move to the square.

    The side is inferred from adjacency when it is not stated: only a king next
    to a square can move to it, so in practice exactly one king is ever in
    question. Where both or neither are, the claim is left unanswered rather
    than attributed to a guess.
    """
    target = parse_square(square)
    if target is None:
        return None

    colour = parse_color(side)
    if colour is None:
        adjacent = [
            piece_colour
            for piece_colour in (chess.WHITE, chess.BLACK)
            if (king := board.king(piece_colour)) is not None
            and chess.square_distance(king, target) == 1
        ]
        if len(adjacent) != 1:
            return None
        colour = adjacent[0]

    king_square = board.king(colour)
    if king_square is None:
        return None

    # Asked from that side's point of view, whether or not it is their turn --
    # "the king cannot escape to f7" is about the king, not about the clock.
    position = board.copy()
    position.turn = colour
    try:
        if not position.is_valid():
            raise ValueError
        return not any(
            move.from_square == king_square and move.to_square == target
            for move in position.legal_moves
        )
    except ValueError:
        occupant = board.piece_at(target)
        if occupant is not None and occupant.color == colour:
            return True
        return board.is_attacked_by(not colour, target)


def _forced_reply(board: chess.Board, pattern: Any) -> bool:
    legal = list(board.legal_moves)
    if not legal:
        return False
    if not pattern:
        return len(legal) == 1

    wanted = str(pattern).strip()
    piece_type = parse_piece(wanted) or (
        chess.PIECE_TYPES[chess.PIECE_SYMBOLS.index(wanted.lower())]
        if wanted.lower() in chess.PIECE_SYMBOLS[1:]
        else None
    )
    if piece_type is not None:
        return all(
            (piece := board.piece_at(move.from_square)) is not None
            and piece.piece_type == piece_type
            for move in legal
        )

    square = parse_square(wanted)
    if square is not None:
        return all(move.to_square == square for move in legal)
    return False


def evaluate(
    board: chess.Board,
    start: chess.Board,
    moves: list[chess.Move],
    assertion: dict,
    engine=None,
) -> bool | None:
    """Applies one assertion to the position a line reached."""
    kind = str(assertion.get("type", "")).strip().lower()

    if kind == "gives_check":
        return board.is_check()
    if kind == "is_mate":
        return board.is_checkmate()

    if kind == "captures_piece":
        wanted = parse_piece(assertion.get("piece") or assertion.get("value"))
        return None if wanted is None else wanted in _captured_types(start, moves)

    if kind == "material_delta":
        side = parse_color(assertion.get("side"))
        minimum = assertion.get("min_value")
        if side is None or minimum is None:
            return None
        try:
            minimum = float(minimum)
        except (TypeError, ValueError):
            return None
        balance = material_balance(board)
        return (balance if side == chess.WHITE else -balance) >= minimum

    if kind == "forced_reply":
        return _forced_reply(board, assertion.get("pattern"))

    if kind == "king_cannot_go":
        return king_cannot_go(board, assertion.get("square"), assertion.get("side"))

    if kind in ("eval_at_least", "eval_at_most"):
        if engine is None:
            return None
        threshold = assertion.get("cp")
        try:
            threshold = float(threshold)
        except (TypeError, ValueError):
            return None
        # White's perspective throughout, as everywhere else in the verifier.
        score = engine.analyse(board, depth=EVAL_DEPTH)["cp"]
        return score >= threshold if kind == "eval_at_least" else score <= threshold

    return None


def _with_prefix(board: chess.Board, token: str | None) -> chess.Board | None:
    """The position after the prefix move, or None if it will not play."""
    if not token:
        return None
    position = board.copy()
    for candidate in (token, clean_san(token) or ""):
        try:
            position.push(chess.Move.from_uci(candidate))
            return position
        except ValueError:
            try:
                position.push_san(candidate)
                return position
            except (ValueError, chess.IllegalMoveError, chess.AmbiguousMoveError, chess.InvalidMoveError):
                position = board.copy()
    return None


def _play_all(start: chess.Board, lines: list[list[str]]) -> tuple[bool, str, list]:
    """Plays every branch from one starting position."""
    results = []
    for line in lines:
        final, failure, moves = play(start, line)
        if final is None:
            return False, failure, []
        results.append((final, moves))
    return True, "", results


def check_line(
    board: chess.Board,
    structured: dict,
    engine=None,
    played_move: str | None = None,
) -> LineVerdict:
    """Verdict on one line claim, across every branch it offers.

    The starting position is decided by legality rather than by the extractor's
    guess. A conditional line either continues from the position as given or
    from after the move the author is choosing, and which one a sentence means
    is exactly the kind of thing an extractor gets wrong -- measured at 42% of
    line claims on the first full run, every one of them scored false for a
    mistake the model did not make. Where the moves play out from only one of
    the two, that is plainly the reading intended; the extractor's `prefix` is
    consulted only to break a genuine tie.
    """
    assertion = structured.get("assertion")
    if not isinstance(assertion, dict):
        return LineVerdict(None, "no assertion")

    tokens = tokenise(structured.get("moves"))
    if len(tokens) > MAX_PLIES:
        return LineVerdict(None, "line too long")

    concrete = branches(tokens)
    if not concrete:
        return LineVerdict(None, "too many branches")

    prefix = structured.get("prefix")
    token = played_move if str(prefix).lower() in ("played", "self") else prefix
    after_prefix = _with_prefix(board, token if prefix else played_move)

    # Preferred reading first, so a tie falls the way the extractor read it.
    candidates = [after_prefix, board.copy()] if prefix else [board.copy(), after_prefix]

    failure = "illegal move 1"
    for start in candidates:
        if start is None:
            continue
        ok, why, results = _play_all(start, concrete)
        if not ok:
            failure = why
            continue

        verdicts: list[bool] = []
        for final, moves in results:
            answer = evaluate(final, start, moves, assertion, engine)
            if answer is None:
                return LineVerdict(None, "assertion not answerable")
            verdicts.append(answer)
        if not verdicts:
            return LineVerdict(None, "no line to play")
        # Every branch must hold: a model offering alternatives claims all of them.
        return LineVerdict(
            all(verdicts), "" if all(verdicts) else "assertion fails in a branch"
        )

    return LineVerdict(False, failure)
