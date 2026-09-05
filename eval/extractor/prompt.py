"""The extraction prompt, frozen and content-hashed like the runner's.

The single most important instruction here is that the extractor transcribes
and never judges. If it silently corrects a wrong claim into a right one -- or
declines to record an assertion because it looks false -- then claim accuracy
stops measuring the model under test and starts measuring the extractor's
chess. Everything about truth is decided later, by python-chess and Stockfish.

v2 replaces v1 after triage of 100 unverifiable claims found that only about a
quarter were genuinely vague. Roughly half were conditional move lines, which
v1 had no way to express, and another fifth were checkable by handlers that
already existed but were left unstructured. So v2 requires a structured form
for every claim and adds the `line` type, and unverifiable becomes a narrow
category rather than a default.

Changing this text invalidates every claim extracted under it, which is why the
hash is asserted by a test. Add v3 rather than editing v2.
"""

from __future__ import annotations

from ..manifest import hash_text

PROMPT_VERSION = "v2"

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
- EVERY claim gets a `structured` object. Only use type "unverifiable" when the \
claim contains no move sequence AND no checkable fact about the board.

Each claim is:
  {"text": "...", "type": "...", "subject": "...", "structured": {...}}

`type` is one of state, line, best_move, unverifiable.

STATE -- a fact about the position as it stands right now.
`structured` is one of:
  {"kind": "pinned",          "square": "f6", "by": "g5"}
  {"kind": "attacked",        "square": "e5", "by": "white"}
  {"kind": "defended",        "square": "d4", "by": "black"}
  {"kind": "hanging",         "square": "b2"}
  {"kind": "material",        "count": 1.0}      pawns, from White's side
  {"kind": "check",           "by": "white"}
  {"kind": "mate_in",         "count": 2, "by": "white"}
  {"kind": "controls_square", "square": "d5", "by": "white"}
  {"kind": "piece_on_square", "square": "c3", "piece": "knight", "by": "white"}
  {"kind": "castling_rights", "by": "black", "side": "kingside"}
  {"kind": "passed_pawn",     "square": "a5", "by": "white"}
Add "negated": true for a negative assertion. "The knight on e5 is not \
defended" is {"kind": "defended", "square": "e5", "by": "black", "negated": \
true}. Do not invent a different kind to express a negative.

LINE -- any claim about what happens after a sequence of moves. This covers \
every "if X then Y", "after X", "X allows Y", "X fails to Y", "X wins the \
rook", and every variation the author calculates.
  {"kind": "line", "prefix": null, "moves": ["Qxc4", "Nxc4"],
   "assertion": {"type": "captures_piece", "piece": "queen"}}
  - `prefix`: use "played" when the line continues from the move the author is \
choosing ("after I play this, Black must...", "if Black responds..."). Use null \
when the line starts from the position as given. Getting this right matters: \
these positions are puzzles, so a reply by the opponent only exists after the \
author's own move.
  - `moves`: the moves in order, in SAN. Keep the author's move numbers if \
present, they are stripped later. Write alternatives with a slash: "Kf3/Ke3".
  - `assertion` is one of:
      {"type": "gives_check"}
      {"type": "is_mate"}
      {"type": "captures_piece", "piece": "rook"}
      {"type": "material_delta", "side": "white", "min_value": 5}
      {"type": "forced_reply"}                    only one legal answer
      {"type": "forced_reply", "pattern": "king"} every answer is a king move
      {"type": "king_cannot_go", "square": "g2", "side": "white"}
      {"type": "eval_at_least", "cp": 200}        White better by this much
      {"type": "eval_at_most", "cp": -200}        Black better by this much
    Pick the assertion the sentence actually makes. "wins the rook" is \
captures_piece rook; "is up a full rook" is material_delta 5; "forces Kh1" is \
forced_reply.

BEST_MOVE -- a claim that a particular move is best or strongest.
  {"kind": "best_move", "move": "Nf3"}

UNVERIFIABLE -- no moves and no checkable board fact. Subjective assessments \
("the position is double-edged", "this feels risky"), statements about the \
author ("I have seen this pattern"), and vague strategy with no move attached.
  {"kind": "unverifiable"}

Squares are lowercase algebraic (e4). Sides are "white" or "black". Pieces are \
pawn, knight, bishop, rook, queen, king.

Examples.

Text: "The knight on f6 is pinned against the king by the bishop on g5."
[{"text": "The knight on f6 is pinned by the bishop on g5", "type": "state",
  "subject": "f6",
  "structured": {"kind": "pinned", "square": "f6", "by": "g5"}}]

Text: "The rook on b2 is undefended."
[{"text": "The rook on b2 is undefended", "type": "state", "subject": "b2",
  "structured": {"kind": "defended", "square": "b2", "negated": true}}]

Text: "If Qxc4, then Nd2xc4 wins the queen for a rook."
[{"text": "If Qxc4, Nd2xc4 wins the queen for a rook", "type": "line",
  "subject": "c4",
  "structured": {"kind": "line", "prefix": "played", "moves": ["Qxc4", "Nxc4"],
    "assertion": {"type": "captures_piece", "piece": "queen"}}}]

Text: "After 2...Ke8 3.Rxd8+ Kxd8 White is up a full rook."
[{"text": "After 2...Ke8 3.Rxd8+ Kxd8 White is up a full rook", "type": "line",
  "subject": "d8",
  "structured": {"kind": "line", "prefix": "played",
    "moves": ["2...Ke8", "3.Rxd8+", "Kxd8"],
    "assertion": {"type": "material_delta", "side": "white", "min_value": 5}}}]

Text: "Whether the king goes Kf3 or Ke3, Rf8+ keeps the attack going."
[{"text": "Whether the king goes Kf3 or Ke3, Rf8+ keeps the attack going",
  "type": "line", "subject": "f8",
  "structured": {"kind": "line", "prefix": "played",
    "moves": ["Kf3/Ke3", "Rf8+"],
    "assertion": {"type": "gives_check"}}}]

Text: "Nf3 is clearly the strongest move here, and the position is murky."
[{"text": "Nf3 is clearly the strongest move here", "type": "best_move",
  "subject": "f3", "structured": {"kind": "best_move", "move": "Nf3"}},
 {"text": "the position is murky", "type": "unverifiable", "subject": "",
  "structured": {"kind": "unverifiable"}}]

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
