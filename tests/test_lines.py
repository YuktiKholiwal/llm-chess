"""The line handler, against real claims models actually made.

Every fixture below is a row from data/triage.csv -- a claim the first run
could not check -- paired with the position it was made about. The expected
verdicts were established by playing each line out and reading the resulting
position, not by trusting the handler that is under test here.

They are worth reading as a group, because they show what the handler is
actually catching. Rows 39, 57, 58 and 19 are all lines whose moves are simply
not available: a king sent to a square it cannot reach, a recapture that is not
legal. That is the most common way a model's calculation is wrong, and until
this handler existed every one of them was scored "unverifiable".
"""

from __future__ import annotations

import chess
import pytest

from eval.verifier.lines import branches, check_line, clean_san, tokenise


def verdict(fen: str, structured: dict, played: str | None = None, engine=None):
    return check_line(
        chess.Board(fen), {"kind": "line", **structured}, engine, played_move=played
    )


class TestNotation:
    """Models write move numbers and glyphs; those are notation, not moves."""

    def test_strips_move_numbers_and_ellipses(self):
        assert tokenise("13...Rxd2 14.Kxd2") == ["Rxd2", "Kxd2"]

    def test_strips_annotation_glyphs(self):
        assert tokenise(["2.", "Kg2", "fxe3!"]) == ["Kg2", "fxe3"]

    def test_drops_a_bare_move_number(self):
        assert clean_san("38.") is None
        assert clean_san("17...") is None

    def test_accepts_a_line_written_as_one_string(self):
        assert tokenise("Qxf7+ Kxf7") == ["Qxf7+", "Kxf7"]


class TestBranches:
    """Alternatives are a claim about every branch, not the convenient one."""

    POSITION = "5rk1/2Q2p1p/2p1p1p1/p2p4/8/q2b4/P4PPP/2RR2K1 w - - 4 26"

    def test_expands_alternatives_into_concrete_lines(self):
        assert branches(["a", "b/c"]) == [["a", "b"], ["a", "c"]]

    def test_holds_when_the_assertion_holds_in_every_branch(self):
        # Both Kxf7 and Rxf7 take the queen.
        assert verdict(
            self.POSITION,
            {"moves": ["Qxf7+", "Kxf7/Rxf7"],
             "assertion": {"type": "captures_piece", "piece": "queen"}},
        ).value is True

    def test_fails_when_any_branch_fails(self):
        # Kh8 declines the capture, so the claim is not true of both.
        assert verdict(
            self.POSITION,
            {"moves": ["Qxf7+", "Kh8/Kxf7"],
             "assertion": {"type": "captures_piece", "piece": "queen"}},
        ).value is False

    def test_an_illegal_branch_makes_the_whole_claim_false(self):
        result = verdict(
            self.POSITION,
            {"moves": ["Qxf7+", "Kh8/Kg7"],
             "assertion": {"type": "captures_piece", "piece": "queen"}},
        )
        assert result.value is False
        assert result.reason == "illegal move 2"


class TestTriageFixtures:
    """Claims lifted verbatim from the triage sample, with their positions."""

    def test_row_16_king_blocked_by_its_own_rook(self):
        # "the king on g8 cannot escape to f7 because its own rook occupies it"
        assert verdict(
            "r5k1/5r2/p2p1p2/2p1qPp1/4P3/1P3Q1R/1pP3P1/1R4K1 w - - 2 26",
            {"moves": [], "assertion": {"type": "king_cannot_go", "square": "f7"}},
        ).value is True

    def test_row_84_an_extra_pawn_that_does_not_exist(self):
        # "White has an extra pawn on the kingside (g4 vs g7/h7)" -- material is
        # level, and on the kingside White is a pawn down rather than up.
        assert verdict(
            "8/6pp/1p6/p2k1K2/P5P1/8/1P5P/8 w - - 1 43",
            {"moves": [], "assertion": {"type": "material_delta", "side": "white", "min_value": 1}},
        ).value is False

    def test_row_23_a_reply_that_is_not_forced(self):
        # "13...Rxd2 forces 14.Kxd2" -- White has a dozen legal answers.
        assert verdict(
            "r2r2k1/pp3pbp/2p1bnp1/4B3/8/P1P1P2P/1P1NBPP1/R3K2R b KQ - 3 13",
            {"moves": ["13...Rxd2"], "assertion": {"type": "forced_reply"}},
        ).value is False

    def test_row_39_a_king_sent_to_a_square_it_cannot_reach(self):
        # "After Rc1+ Kg1, then Qe3+ forces Kh1" -- after Rc1+ the king has only
        # Kg2 and Bd1.
        result = verdict(
            "2r5/q2n1kb1/3R2R1/3Pp3/4Pp2/P4P2/Q3B3/5K2 b - - 0 38",
            {"moves": ["Rc1+", "Kg1", "Qe3+"], "assertion": {"type": "forced_reply"}},
        )
        assert result.value is False
        assert result.reason == "illegal move 2"

    def test_row_57_a_line_whose_first_move_is_illegal(self):
        # "1...Kd4 loses to 2.Rxb3" -- Kd4 walks into the rook on d3.
        result = verdict(
            "8/8/8/8/p1k5/1p1R1P2/1K4P1/8 b - - 1 49",
            {"moves": ["1...Kd4", "2.Rxb3"],
             "assertion": {"type": "captures_piece", "piece": "rook"}},
        )
        assert result.value is False
        assert result.reason == "illegal move 1"

    def test_row_58_a_conditional_line_read_after_the_played_move(self):
        # "After 2...Ke8 3.Rxd8+ Kxd8 White wins the rook" -- after the model's
        # own Rh8+ the king can only go to e7, so Ke8 never happens.
        result = verdict(
            "3r1k2/5nbR/3p1p2/2p5/1pB1rpP1/pP6/P1P5/B1K4R w - - 0 32",
            {"prefix": "played", "moves": ["2...Ke8", "3. Rxd8+", "Kxd8"],
             "assertion": {"type": "material_delta", "side": "white", "min_value": 5}},
            played="h7h8",
        )
        assert result.value is False
        assert result.reason == "illegal move 1"

    def test_row_19_a_recapture_that_is_not_available(self):
        # "after Kxf2 Bxh4+ Kf3/Ke3, Black continues with Rf8+" -- f2 is covered
        # by the rook on f8, so Kxf2 is illegal and the branches never arrive.
        result = verdict(
            "5rk1/4b1p1/3P3p/p1p5/2PpR1QP/1P4P1/P2N2K1/5r2 b - - 0 27",
            {"prefix": "played", "moves": ["Kxf2", "Bxh4+", "Kf3/Ke3", "Rf8+"],
             "assertion": {"type": "gives_check"}},
            played="f1f2",
        )
        assert result.value is False
        assert result.reason == "illegal move 1"

    def test_row_36_a_square_the_enemy_king_covers(self):
        # "the white king can't go to g2" -- after the model's Kf3 it is covered.
        assert verdict(
            "7r/p1p5/1p2R3/2b2P2/P1P3P1/6k1/8/4RK2 b - - 4 36",
            {"prefix": "played", "moves": [],
             "assertion": {"type": "king_cannot_go", "square": "g2", "side": "white"}},
            played="g3f3",
        ).value is True

    def test_row_41_a_capture_the_line_really_makes(self):
        # "Qxf7+ fails to Kxf7"
        assert verdict(
            "5rk1/2Q2p1p/2p1p1p1/p2p4/8/q2b4/P4PPP/2RR2K1 w - - 4 26",
            {"moves": ["Qxf7+", "Kxf7"],
             "assertion": {"type": "captures_piece", "piece": "queen"}},
        ).value is True

    def test_row_73_a_queen_trade_after_the_played_move(self):
        # "if Black goes for 13...Qxh1+, then 14.Bxh1 wins the queen"
        assert verdict(
            "r1b1k2r/pp2nppp/2n5/6N1/2Pp4/8/P2BBPqP/R2QK2R w KQkq - 0 13",
            {"prefix": "played", "moves": ["13...Qxh1+", "14.Bxh1"],
             "assertion": {"type": "captures_piece", "piece": "queen"}},
            played="e2f3",
        ).value is True

    def test_row_78_a_queen_won_for_a_rook(self):
        # "If Qxc4, Nd2xc4 wins the queen for a rook"
        assert verdict(
            "5k1r/p1p2p1p/6p1/3BPn2/1q5b/1P2B3/P2N2PP/2R2K1R w - - 2 21",
            {"prefix": "played", "moves": ["Qxc4", "Nxc4"],
             "assertion": {"type": "captures_piece", "piece": "queen"}},
            played="c1c4",
        ).value is True

    def test_row_89_a_recapture_that_is_available(self):
        # "if White responds 21.Qxb6, Black recaptures 21...axb6"
        assert verdict(
            "2rq1rk1/p4pp1/1N3b1p/8/8/PQ6/1P3PPP/3R1RK1 b - - 0 20",
            {"prefix": "played", "moves": ["21.Qxb6", "21...axb6"],
             "assertion": {"type": "captures_piece", "piece": "queen"}},
            played="d8b6",
        ).value is True


class TestAssertions:
    MATE = "5rk1/2Q2p1p/2p1p1p1/p2p4/8/q2b4/P4PPP/2RR2K1 w - - 4 26"

    def test_gives_check_reads_the_position_the_line_reaches(self):
        assert verdict(
            self.MATE, {"moves": ["Qxf7+"], "assertion": {"type": "gives_check"}}
        ).value is True
        assert verdict(
            self.MATE, {"moves": ["Rc2"], "assertion": {"type": "gives_check"}}
        ).value is False

    def test_is_mate_is_not_satisfied_by_a_mere_check(self):
        assert verdict(
            self.MATE, {"moves": ["Qxf7+"], "assertion": {"type": "is_mate"}}
        ).value is False

    def test_forced_reply_counts_the_answers(self):
        # After Qxf7+ Black has three legal moves, so nothing is forced.
        assert verdict(
            self.MATE, {"moves": ["Qxf7+"], "assertion": {"type": "forced_reply"}}
        ).value is False

    def test_forced_reply_accepts_a_piece_pattern(self):
        # Every legal answer to Qxf7+ is a king or rook move, none a queen move.
        assert verdict(
            self.MATE,
            {"moves": ["Qxf7+"], "assertion": {"type": "forced_reply", "pattern": "queen"}},
        ).value is False

    def test_material_delta_reads_the_balance_after_the_line(self):
        assert verdict(
            self.MATE,
            {"moves": ["Qxf7+", "Kxf7"],
             "assertion": {"type": "material_delta", "side": "black", "min_value": 5}},
        ).value is True

    def test_an_unknown_assertion_is_unverifiable_not_false(self):
        assert verdict(
            self.MATE, {"moves": [], "assertion": {"type": "vibes"}}
        ).value is None

    def test_a_missing_assertion_is_unverifiable(self):
        assert verdict(self.MATE, {"moves": ["Qxf7+"]}).value is None

    def test_engine_assertions_need_an_engine(self):
        assert verdict(
            self.MATE, {"moves": [], "assertion": {"type": "eval_at_least", "cp": 100}}
        ).value is None


class TestEngineAssertions:
    MATE = "5rk1/2Q2p1p/2p1p1p1/p2p4/8/q2b4/P4PPP/2RR2K1 w - - 4 26"

    def test_eval_at_least_reads_from_whites_side(self, engine):
        # White is winning here, so a modest floor holds and a huge one does not.
        assert verdict(
            self.MATE, {"moves": [], "assertion": {"type": "eval_at_least", "cp": 100}},
            engine=engine,
        ).value is True

    def test_eval_at_most_is_the_mirror_of_it(self, engine):
        assert verdict(
            self.MATE, {"moves": [], "assertion": {"type": "eval_at_most", "cp": -100}},
            engine=engine,
        ).value is False


class TestBestMove:
    from eval.verifier import handlers as _h

    # Qd1-d8 is mate in one; anything else throws most of the advantage away.
    POSITION = "7k/6pp/8/8/8/8/r4PPP/3Q2K1 w - - 1 2"

    def test_the_engines_move_is_best(self, engine):
        assert self._h.best_move(
            chess.Board(self.POSITION), move="d1d8", engine=engine
        ) is True

    def test_a_much_worse_move_is_not(self, engine):
        assert self._h.best_move(
            chess.Board(self.POSITION), move="g1h1", engine=engine
        ) is False

    def test_reads_the_move_out_of_a_sentence(self, engine):
        assert self._h.best_move(
            chess.Board(self.POSITION), text="Qd8 is clearly strongest", engine=engine
        ) is True

    def test_without_an_engine_it_is_unverifiable(self):
        assert self._h.best_move(chess.Board(self.POSITION), move="d1d8") is None

    def test_an_unreadable_move_is_unverifiable(self, engine):
        assert self._h.best_move(
            chess.Board(self.POSITION), text="the plan is to improve slowly", engine=engine
        ) is None


class TestPrefixResolution:
    """Which position a conditional line starts from is decided by legality.

    "If Qxc4, Nxc4 wins the queen" continues from after the move the author is
    choosing; "Rxb8+ gives check" starts from the position as given. Telling
    those apart from the wording is exactly what an extractor gets wrong -- it
    did so on 42% of line claims in the first full run, and every one was scored
    false for a mistake the model never made. Where the moves play out from only
    one of the two readings, that is the one meant.
    """

    # White to move. Qxf7+ is White's own move; Kxf7 is only available after it.
    POSITION = "5rk1/2Q2p1p/2p1p1p1/p2p4/8/q2b4/P4PPP/2RR2K1 w - - 4 26"

    def test_a_line_from_the_position_survives_a_wrong_prefix(self):
        # Marked "played" though it starts from the position as given.
        assert verdict(
            self.POSITION,
            {"prefix": "played", "moves": ["Qxf7+"],
             "assertion": {"type": "gives_check"}},
            played="c7f7",
        ).value is True

    def test_a_continuation_survives_a_missing_prefix(self):
        # Marked null though it continues after the author's own Qxf7+.
        assert verdict(
            self.POSITION,
            {"prefix": None, "moves": ["Kxf7"],
             "assertion": {"type": "captures_piece", "piece": "queen"}},
            played="c7f7",
        ).value is True

    def test_a_line_illegal_from_either_reading_is_still_false(self):
        result = verdict(
            self.POSITION,
            {"prefix": "played", "moves": ["Qxa8"],
             "assertion": {"type": "gives_check"}},
            played="c7f7",
        )
        assert result.value is False
        assert result.reason.startswith("illegal move")

    def test_the_extractors_reading_breaks_a_tie(self):
        # Rc2 is legal for White both before and after a null prefix, so the
        # stated reading is the one used rather than an arbitrary choice.
        assert verdict(
            self.POSITION,
            {"prefix": None, "moves": ["Rc2"], "assertion": {"type": "gives_check"}},
        ).value is False
