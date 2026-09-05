"""Checks one structured claim against the position.

Every handler returns True, False, or None. None means "not answerable as
asked" -- an empty square, a colour that was never specified, a value that does
not parse -- and it is deliberately distinct from False. Scoring an
unanswerable claim as false would blame a model for the extractor's failure to
pin down what it said.

The handlers do only chess. They know nothing about claims, models or scoring,
which is what makes them testable against hand-built positions with known
answers.
"""

from __future__ import annotations

import re

import chess

from ..extractor.schema import is_negated, is_well_formed

PIECE_VALUE = {
    chess.PAWN: 1.0,
    chess.KNIGHT: 3.0,
    chess.BISHOP: 3.0,
    chess.ROOK: 5.0,
    chess.QUEEN: 9.0,
    chess.KING: 0.0,
}

PIECE_NAMES = {
    "pawn": chess.PAWN, "p": chess.PAWN,
    "knight": chess.KNIGHT, "n": chess.KNIGHT,
    "bishop": chess.BISHOP, "b": chess.BISHOP,
    "rook": chess.ROOK, "r": chess.ROOK,
    "queen": chess.QUEEN, "q": chess.QUEEN,
    "king": chess.KING, "k": chess.KING,
}

# Models say "a piece up" for anything from 2.5 to 3.5 pawns, so an exact match
# would score ordinary language as false. Half a pawn is wide enough to accept
# that and narrow enough to still reject "I am a rook up" when level.
MATERIAL_TOLERANCE = 0.5

UCI_TOKEN = re.compile(r"\b([a-h][1-8][a-h][1-8][qrbn]?)\b", re.IGNORECASE)
SAN_TOKEN = re.compile(
    r"(?:O-O-O|O-O|[KQRBN][a-h]?[1-8]?x?[a-h][1-8](?:=[QRBN])?[+#]?"
    r"|[a-h](?:x[a-h])?[1-8](?:=[QRBN])?[+#]?)"
)


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


def parse_square(value) -> int | None:
    if not isinstance(value, str):
        return None
    try:
        return chess.parse_square(value.strip().lower())
    except ValueError:
        return None


def parse_color(value) -> chess.Color | None:
    if not isinstance(value, str):
        return None
    text = value.strip().lower()
    if text in ("white", "w"):
        return chess.WHITE
    if text in ("black", "b"):
        return chess.BLACK
    return None


def parse_piece(value) -> int | None:
    if not isinstance(value, str):
        return None
    return PIECE_NAMES.get(value.strip().lower())


def parse_number(value) -> float | None:
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def pinned(board: chess.Board, square: str, by=None) -> bool | None:
    """Absolute pins only: the piece cannot legally move off the pin ray.

    Relative pins -- a knight "pinned" against a queen -- are a different and
    much fuzzier claim, and python-chess does not answer it, so a claim that
    means one of those is not silently scored against the stricter rule.
    """
    target = parse_square(square)
    if target is None:
        return None
    piece = board.piece_at(target)
    if piece is None:
        return None

    is_pinned = board.is_pinned(piece.color, target)

    pinner = parse_square(by)
    if pinner is not None:
        # The claim named the pinning piece too, so both halves must hold.
        # Testing membership of the pin ray is not enough: the ray runs past
        # the pinner to the board edge, so any square behind it would pass.
        if not is_pinned:
            return False
        return _pinner_square(board, piece.color, target) == pinner
    return is_pinned


def _pinner_square(board: chess.Board, color: chess.Color, target: int) -> int | None:
    """The enemy piece doing the pinning.

    A pin ray holds exactly three occupied squares -- the king, the pinned
    piece, and the pinner -- so the one enemy piece on it is the pinner.
    """
    for square in board.pin(color, target):
        piece = board.piece_at(square)
        if piece is not None and piece.color != color:
            return square
    return None


def attacked(board: chess.Board, square: str, by=None) -> bool | None:
    target = parse_square(square)
    if target is None:
        return None

    attacker = parse_color(by)
    if attacker is None:
        # Unstated attacker: the only sensible reading of "the knight on e5 is
        # attacked" is "by the other side".
        piece = board.piece_at(target)
        if piece is None:
            return None
        attacker = not piece.color

    return board.is_attacked_by(attacker, target)


def defended(board: chess.Board, square: str, by=None) -> bool | None:
    target = parse_square(square)
    if target is None:
        return None

    defender = parse_color(by)
    if defender is None:
        piece = board.piece_at(target)
        if piece is None:
            return None
        defender = piece.color

    return bool(board.attackers(defender, target))


def hanging(board: chess.Board, square: str) -> bool | None:
    """Attacked by the enemy and defended by nobody."""
    target = parse_square(square)
    if target is None:
        return None
    piece = board.piece_at(target)
    if piece is None:
        return None

    return board.is_attacked_by(not piece.color, target) and not board.attackers(
        piece.color, target
    )


def material_balance(board: chess.Board) -> float:
    """Pawns of advantage, from White's point of view."""
    total = 0.0
    for square, piece in board.piece_map().items():
        value = PIECE_VALUE[piece.piece_type]
        total += value if piece.color == chess.WHITE else -value
    return total


def material(board: chess.Board, count, by=None) -> bool | None:
    claimed = parse_number(count)
    if claimed is None:
        return None

    # "black is up 2" and "the balance is -2" are the same claim written two
    # ways, and the extractor cannot always tell which convention a model used.
    side = parse_color(by)
    if side == chess.BLACK and claimed > 0:
        claimed = -claimed

    return abs(material_balance(board) - claimed) <= MATERIAL_TOLERANCE


def in_check(board: chess.Board, by=None) -> bool | None:
    giver = parse_color(by)
    if giver is None:
        return board.is_check()
    # The side giving check is by definition not the side to move.
    return board.turn != giver and board.is_check()


def mate_in(board: chess.Board, count, by=None, engine=None) -> bool | None:
    """The one handler that a rules library cannot answer.

    Whether a forced mate exists is a search question, not a legality question,
    so this defers to Stockfish. Without an engine it reports unverifiable
    rather than guessing -- and the count must match exactly, because "mate in
    three" when it is mate in two is a claim about the number.
    """
    wanted = parse_number(count)
    if wanted is None or engine is None:
        return None

    color = parse_color(by)
    if color is None:
        # "there is mate in two" said by the player to move means for them.
        color = board.turn

    distance = engine.mate_distance(board, color)
    return False if distance is None else distance == int(wanted)


def check_available(board: chess.Board, by=None, text: str | None = None) -> bool | None:
    """The threat reading of a check claim: a check is available, not given.

    "Rc6+ delivers check" and "the king is in check" are different assertions,
    and running the second handler over the first would mark almost every
    checking move a model correctly spotted as false. Where the claim names its
    move, that move is the claim and is tested directly; otherwise the question
    is whether the side has any checking move at all.

    A claim that the side NOT to move can check is about a position two plies
    away and is reported unverifiable rather than guessed at.
    """
    if text:
        move = move_from_text(board, text)
        if move is not None:
            return board.gives_check(move)

    side = parse_color(by)
    if side is None:
        side = board.turn
    if side != board.turn:
        return None
    return any(board.gives_check(move) for move in board.legal_moves)


def square_controlled(board: chess.Board, square: str, by) -> bool | None:
    target = parse_square(square)
    side = parse_color(by)
    if target is None or side is None:
        return None
    return board.is_attacked_by(side, target)


def piece_on_square(board: chess.Board, square: str, piece=None, by=None) -> bool | None:
    target = parse_square(square)
    if target is None:
        return None

    found = board.piece_at(target)
    wanted_type = parse_piece(piece)
    wanted_color = parse_color(by)
    if wanted_type is None and wanted_color is None:
        # "there is something on d4" is answerable, if barely.
        return found is not None
    if found is None:
        return False

    if wanted_type is not None and found.piece_type != wanted_type:
        return False
    if wanted_color is not None and found.color != wanted_color:
        return False
    return True


def castling_rights(board: chess.Board, by, side=None) -> bool | None:
    color = parse_color(by)
    if color is None:
        return None

    flank = (side or "").strip().lower() if isinstance(side, str) else ""
    if flank in ("kingside", "king", "short", "k"):
        return board.has_kingside_castling_rights(color)
    if flank in ("queenside", "queen", "long", "q"):
        return board.has_queenside_castling_rights(color)
    return board.has_castling_rights(color)


def passed_pawn(board: chess.Board, square: str, by=None) -> bool | None:
    """No enemy pawn on this file or either neighbour, anywhere ahead of it."""
    target = parse_square(square)
    if target is None:
        return None

    piece = board.piece_at(target)
    if piece is None or piece.piece_type != chess.PAWN:
        return False

    wanted_color = parse_color(by)
    if wanted_color is not None and piece.color != wanted_color:
        return False

    file_index = chess.square_file(target)
    rank_index = chess.square_rank(target)
    files = {f for f in (file_index - 1, file_index, file_index + 1) if 0 <= f <= 7}

    for other_square, other in board.piece_map().items():
        if other.piece_type != chess.PAWN or other.color == piece.color:
            continue
        if chess.square_file(other_square) not in files:
            continue
        ahead = (
            chess.square_rank(other_square) > rank_index
            if piece.color == chess.WHITE
            else chess.square_rank(other_square) < rank_index
        )
        if ahead:
            return False
    return True


DISPATCH = {
    "pinned": lambda b, s, e: pinned(b, s.get("square"), s.get("by")),
    "attacked": lambda b, s, e: attacked(b, s.get("square"), s.get("by")),
    "defended": lambda b, s, e: defended(b, s.get("square"), s.get("by")),
    "hanging": lambda b, s, e: hanging(b, s.get("square")),
    "material": lambda b, s, e: material(b, s.get("count"), s.get("by")),
    "check": lambda b, s, e: in_check(b, s.get("by")),
    "mate_in": lambda b, s, e: mate_in(b, s.get("count"), s.get("by"), engine=e),
    "controls_square": lambda b, s, e: square_controlled(b, s.get("square"), s.get("by")),
    "piece_on_square": lambda b, s, e: piece_on_square(
        b, s.get("square"), s.get("piece"), s.get("by")
    ),
    "castling_rights": lambda b, s, e: castling_rights(b, s.get("by"), s.get("side")),
    "passed_pawn": lambda b, s, e: passed_pawn(b, s.get("square"), s.get("by")),
}


def verdict_for(
    board: chess.Board,
    structured,
    engine=None,
    claim_type: str = "state",
    text: str | None = None,
) -> bool | None:
    """The verdict on one structured claim, with negation applied last.

    A negated claim is the same question with the answer flipped, so "the
    knight is not defended" is right exactly when the knight is undefended.
    An unanswerable question stays unanswerable either way -- negating None
    would invent a verdict out of the extractor's silence.
    """
    if not is_well_formed(structured):
        return None

    kind = structured["kind"]
    # A check asserted as a threat is about a move, not about the position now.
    if kind == "check" and claim_type == "threat":
        answer = check_available(board, structured.get("by"), text)
    else:
        answer = DISPATCH[kind](board, structured, engine)
    if answer is None:
        return None
    return (not answer) if is_negated(structured) else answer
