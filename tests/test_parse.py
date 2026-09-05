"""Parsing the output contract.

The distinction that matters here is between a model that gave a bad answer and
one that would not follow the format. Both are real failures and they are not
the same failure, so `tagged` records which sections actually arrived in their
tags while the fallbacks still recover an answer where one is recoverable.
"""

from __future__ import annotations

from eval.runner.parse import parse

WELL_FORMED = """<reasoning>
The knight on f6 is pinned against the king by the bishop on g5.
</reasoning>
<plan>Break the pin before developing.</plan>
<move>e7e6</move>"""


class TestWellFormed:
    def test_reads_all_three_sections(self):
        out = parse(WELL_FORMED)
        assert out.reasoning.startswith("The knight on f6 is pinned")
        assert out.plan == "Break the pin before developing."
        assert out.move == "e7e6"

    def test_records_full_format_compliance(self):
        assert parse(WELL_FORMED).tagged == {"reasoning", "plan", "move"}


class TestFallbacks:
    def test_takes_the_last_move_when_a_model_changes_its_mind(self):
        out = parse("<move>e2e4</move> wait, better: <move>g1f3</move>")
        assert out.move == "g1f3"

    def test_recovers_a_bare_move_with_no_tag(self):
        out = parse("The pin is decisive, so I play g1f3")
        assert out.move == "g1f3"

    def test_does_not_credit_an_untagged_move_as_compliant(self):
        assert "move" not in parse("I play g1f3").tagged

    def test_strips_decoration_around_a_tagged_move(self):
        assert parse("<move>**e2e4**</move>").move == "e2e4"
        assert parse("<move> `g8f6` </move>").move == "g8f6"

    def test_keeps_promotion_pieces(self):
        assert parse("<move>e7e8q</move>").move == "e7e8q"

    def test_normalises_case(self):
        assert parse("<move>E2E4</move>").move == "e2e4"

    def test_keeps_untagged_prose_as_reasoning(self):
        # A model that ignores the tags still said something about the board,
        # and scoring it as silent would confuse non-compliance with vacuity.
        out = parse("The rook on d1 is undefended. I play g1f3.")
        assert "rook on d1" in out.reasoning
        assert out.tagged == frozenset()


class TestNoAnswer:
    def test_reports_no_move_when_there_is_none(self):
        out = parse("I cannot find a good move here.")
        assert out.move is None

    def test_does_not_mistake_prose_for_a_move(self):
        assert parse("This is a quiet position with no tactics.").move is None

    def test_rejects_a_tagged_value_that_is_not_uci(self):
        # SAN in a UCI slot is a format failure, not a move.
        assert parse("<move>Nf3</move>").move is None

    def test_ignores_squares_mentioned_in_analysis_when_a_tag_exists(self):
        out = parse("<reasoning>a1a8 looks tempting</reasoning><move>g1f3</move>")
        assert out.move == "g1f3"
