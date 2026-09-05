"""The prompt is the instrument, so changing it must be deliberate.

The hash assertion below fails on any edit to the system text or to how a
position or retry is rendered. That is the point: a reworded prompt makes every
previously published number incomparable, and a failing test is a better way to
find that out than an unexplained shift in the results. When you genuinely mean
to change it, add v2 alongside v1 rather than editing v1 and updating the hash.
"""

from __future__ import annotations

import chess

from eval.runner import prompt

PUZZLE = "7k/6pp/8/8/8/8/r4PPP/3Q2K1 w - - 1 2"


def test_prompt_is_frozen():
    assert prompt.PROMPT_VERSION == "v1"
    assert prompt.prompt_hash() == "b9e2bde11137"


class TestPosition:
    def test_states_the_fen_and_the_side_to_move(self):
        rendered = prompt.position(PUZZLE)
        assert f"FEN: {PUZZLE}" in rendered
        assert "Side to move: White" in rendered

    def test_names_black_when_black_is_to_move(self):
        assert "Side to move: Black" in prompt.position(
            "r6k/6pp/8/8/8/8/5PPP/3Q2K1 b - - 0 1"
        )

    def test_draws_the_board_out(self):
        rendered = prompt.position(PUZZLE)
        assert str(chess.Board(PUZZLE)) in rendered

    def test_withholds_the_legal_moves(self):
        # Reading legality off the position is part of what is measured, so the
        # first ask must not hand it over.
        assert "Legal moves" not in prompt.position(PUZZLE)


class TestRetry:
    def test_uses_the_wording_the_spec_fixes(self):
        assert prompt.retry(PUZZLE).startswith("That move is illegal. Legal moves: [")

    def test_lists_every_legal_move_in_uci(self):
        rendered = prompt.retry(PUZZLE)
        legal = {move.uci() for move in chess.Board(PUZZLE).legal_moves}
        assert legal
        assert all(uci in rendered for uci in legal)

    def test_restates_the_output_contract(self):
        rendered = prompt.retry(PUZZLE)
        assert "<reasoning>" in rendered and "<plan>" in rendered and "<move>" in rendered


def test_system_prompt_fixes_uci_and_the_three_sections():
    assert "UCI" in prompt.SYSTEM
    for tag in ("<reasoning>", "<plan>", "<move>"):
        assert tag in prompt.SYSTEM
