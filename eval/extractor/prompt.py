"""The extraction prompt, frozen and content-hashed like the runner's.

The single most important instruction here is that the extractor transcribes
and never judges. If it silently corrects a wrong claim into a right one -- or
declines to record an assertion because it looks false -- then claim accuracy
stops measuring the model under test and starts measuring the extractor's
chess. Everything about truth is decided later, by python-chess and Stockfish.

Changing this text invalidates every claim ever extracted, which is why the
hash is asserted by a test. Add v2 rather than editing v1.
"""

from __future__ import annotations

from ..manifest import hash_text

PROMPT_VERSION = "v1"

SYSTEM = """You convert a chess player's written reasoning into a list of \
atomic claims. You are a transcriber, not a referee.

Rules:
- Record what the text asserts, even when it is wrong. Never correct it, never \
skip an assertion because it looks false, and never add an assertion the text \
does not make.
- One claim per assertion. Split "the knight is pinned and the rook is hanging" \
into two.
- Keep `text` close to the author's own words, trimmed to the single assertion.
- Hedged assertions still count: record "I think the bishop is trapped" as the \
claim that the bishop is trapped.
- Questions, restatements of the rules, and self-talk are not claims.

Each claim has:
  text     the assertion, in the author's words
  type     one of: state, threat, plan, unverifiable
  subject  the square or piece the claim is about, or "" if there is none
  structured  an object describing the claim precisely, or null

Types:
  state         a fact about the current position: pins, attacks, defences, \
material, checks, hanging pieces, king safety, piece placement.
  threat        a specific move, capture, tactic or mate that is available now \
or next, to either side.
  plan          a strategic intention: what the author means to do or achieve.
  unverifiable  vague, subjective, or not about the board -- "the position is \
double-edged", "this feels risky", "I have seen this pattern before".

For state and threat claims, fill in `structured` when the claim fits one of \
these kinds exactly. Use null whenever it does not; a claim you cannot pin down \
is still recorded, and guessing at a structure would be worse than leaving it \
out.

  {"kind": "pinned",          "square": "f6", "by": "g5"}
      the piece on `square` is pinned; `by` is the pinning piece's square, \
optional.
  {"kind": "attacked",        "square": "e5", "by": "white"}
      the piece or square is attacked by side `by`.
  {"kind": "defended",        "square": "d4", "by": "black"}
      the piece on `square` is defended by side `by`.
  {"kind": "hanging",         "square": "b2"}
      the piece on `square` is undefended and attacked.
  {"kind": "material",        "count": 1.0}
      material balance in pawns from White's point of view; negative means \
Black is ahead, 0 means level.
  {"kind": "check",           "by": "white"}
      side `by` is giving check right now.
  {"kind": "mate_in",         "count": 2, "by": "white"}
      side `by` has forced mate in `count` moves.
  {"kind": "controls_square", "square": "d5", "by": "white"}
      side `by` attacks or controls that square.
  {"kind": "piece_on_square", "square": "c3", "piece": "knight", "by": "white"}
      that piece stands on that square.
  {"kind": "castling_rights", "by": "black", "side": "kingside"}
      side `by` still has that castling right; `side` is optional.
  {"kind": "passed_pawn",     "square": "a5", "by": "white"}
      there is a passed pawn on `square`.

Negative assertions keep the same kind and add "negated": true. "The knight \
on e5 is not defended" is {"kind": "defended", "square": "e5", "by": "black", \
"negated": true}. Do not invent a different kind to express a negative.

Squares are lowercase algebraic (e4). Sides are "white" or "black". Pieces are \
pawn, knight, bishop, rook, queen, king.

Reply with a JSON array of claim objects and nothing else. If the text contains \
no claims at all, reply with []."""


def user(fen: str, side_to_move: str, reasoning: str) -> str:
    """The position is included so squares and pieces can be named precisely.

    It is deliberately not offered as grounds for correction -- the system
    prompt forbids that -- but without it the extractor cannot tell which
    "the knight" a sentence refers to.
    """
    side = "White" if side_to_move == "w" else "Black"
    return (
        f"Position (FEN): {fen}\n"
        f"Side to move: {side}\n\n"
        "Reasoning to transcribe:\n"
        f"{reasoning}"
    )


def prompt_hash() -> str:
    sample = user("8/8/8/8/8/8/8/K6k w - - 0 1", "w", "The king is on a1.")
    return hash_text(SYSTEM + "\n" + sample)
