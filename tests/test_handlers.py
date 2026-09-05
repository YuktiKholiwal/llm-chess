"""Every claim handler, against positions built by hand for the purpose.

This is the module the whole eval rests on: a wrong handler does not raise, it
silently reports a model as accurate or inaccurate about a position, and the
error would be invisible in the results. So the positions here are small enough
to check by eye, and each one is chosen to separate a handler from the mistake
it is most likely to make -- a real pin from a blocked one, a hanging piece
from a defended one, a passed pawn from one an enemy pawn still holds up.

The three-valued return is load-bearing. None means the claim could not be
answered as asked, and it must never be conflated with False; scoring an
unanswerable claim as wrong would blame a model for the extractor's silence.
"""

from __future__ import annotations

import chess
import pytest

from eval.verifier import handlers as h


def board(fen: str) -> chess.Board:
    return chess.Board(fen)


class TestPinned:
    # Bb5 through Nc6 to Ke8, with d7 empty: a real absolute pin.
    PIN = "4k3/8/2n5/1B6/8/8/8/4K3 b - - 0 1"
    # The same geometry with a black pawn on d7 interposed, so nothing is pinned.
    BLOCKED = "4k3/3p4/2n5/1B6/8/8/8/4K3 b - - 0 1"

    def test_finds_an_absolute_pin(self):
        assert h.pinned(board(self.PIN), "c6") is True

    def test_a_blocked_line_is_not_a_pin(self):
        assert h.pinned(board(self.BLOCKED), "c6") is False

    def test_accepts_a_correctly_named_pinning_piece(self):
        assert h.pinned(board(self.PIN), "c6", by="b5") is True

    def test_rejects_a_square_that_merely_lies_on_the_pin_ray(self):
        # a4 and d7 are both on the b5-c6-d7-e8 diagonal but neither pins.
        assert h.pinned(board(self.PIN), "c6", by="a4") is False
        assert h.pinned(board(self.PIN), "c6", by="d7") is False

    def test_an_empty_square_cannot_be_pinned_or_unpinned(self):
        assert h.pinned(board(self.PIN), "d5") is None

    def test_an_unparseable_square_is_unverifiable(self):
        assert h.pinned(board(self.PIN), "z9") is None


class TestAttackedAndDefended:
    # Nc6 attacked by Bb5 and defended by the pawn on b7.
    DEFENDED = "4k3/1p6/2n5/1B6/8/8/8/4K3 b - - 0 1"
    # The same, minus the defender.
    UNDEFENDED = "4k3/8/2n5/1B6/8/8/8/4K3 b - - 0 1"

    def test_reads_an_attack_without_being_told_the_attacker(self):
        assert h.attacked(board(self.DEFENDED), "c6") is True

    def test_reads_an_attack_by_a_named_side(self):
        assert h.attacked(board(self.DEFENDED), "c6", by="white") is True
        assert h.attacked(board(self.UNDEFENDED), "c6", by="black") is False

    def test_attack_by_a_pieces_own_side_is_the_same_question_as_defence(self):
        # Worth pinning down, because it looks like a bug at a glance: the
        # black pawn on b7 does attack c6, and that is what defending it means.
        position = board(self.DEFENDED)
        assert h.attacked(position, "c6", by="black") is True
        assert h.defended(position, "c6") is True

    def test_finds_a_defender(self):
        assert h.defended(board(self.DEFENDED), "c6") is True

    def test_reports_an_undefended_piece_as_undefended(self):
        assert h.defended(board(self.UNDEFENDED), "c6") is False

    def test_an_empty_square_has_no_implied_side(self):
        assert h.attacked(board(self.DEFENDED), "h4") is None
        assert h.defended(board(self.DEFENDED), "h4") is None

    def test_an_empty_square_is_still_answerable_when_a_side_is_named(self):
        assert h.attacked(board(self.DEFENDED), "a6", by="white") is True


class TestHanging:
    DEFENDED = "4k3/1p6/2n5/1B6/8/8/8/4K3 b - - 0 1"
    UNDEFENDED = "4k3/8/2n5/1B6/8/8/8/4K3 b - - 0 1"
    # Nc6 defended by nobody and attacked by nobody: safe, not hanging.
    UNTOUCHED = "4k3/8/2n5/8/8/8/8/4K3 b - - 0 1"

    def test_attacked_and_undefended_is_hanging(self):
        assert h.hanging(board(self.UNDEFENDED), "c6") is True

    def test_attacked_but_defended_is_not_hanging(self):
        assert h.hanging(board(self.DEFENDED), "c6") is False

    def test_undefended_but_unattacked_is_not_hanging(self):
        assert h.hanging(board(self.UNTOUCHED), "c6") is False

    def test_an_empty_square_is_unverifiable(self):
        assert h.hanging(board(self.UNDEFENDED), "d4") is None


class TestMaterial:
    # White has an extra rook and knight: +8 pawns.
    WHITE_UP_8 = "4k3/8/8/8/8/8/8/RN2K3 w - - 0 1"
    LEVEL = "4k3/8/8/8/8/8/8/4K3 w - - 0 1"

    def test_measures_the_balance_from_whites_point_of_view(self):
        assert h.material_balance(board(self.WHITE_UP_8)) == 8.0
        assert h.material_balance(board(self.LEVEL)) == 0.0

    def test_accepts_a_correct_claim(self):
        assert h.material(board(self.WHITE_UP_8), 8) is True

    def test_rejects_a_wrong_claim(self):
        assert h.material(board(self.WHITE_UP_8), 5) is False
        assert h.material(board(self.WHITE_UP_8), -8) is False

    def test_reads_a_black_advantage_written_either_way(self):
        black_up = "rn2k3/8/8/8/8/8/8/4K3 w - - 0 1"
        assert h.material(board(black_up), -8) is True
        assert h.material(board(black_up), 8, by="black") is True

    def test_tolerates_the_looseness_of_ordinary_language(self):
        # "A piece up" is 3 or 3.5 depending on who is speaking.
        knight_up = "4k3/8/8/8/8/8/8/1N2K3 w - - 0 1"
        assert h.material(board(knight_up), 3) is True
        assert h.material(board(knight_up), 3.5) is True
        assert h.material(board(knight_up), 5) is False

    def test_an_unparseable_count_is_unverifiable(self):
        assert h.material(board(self.LEVEL), "a lot") is None


class TestCheck:
    # Re1 checks the black king on e8 along the file.
    WHITE_CHECKS = "4k3/8/8/8/8/8/8/4R1K1 b - - 0 1"
    QUIET = "4k3/8/8/8/8/8/8/R5K1 b - - 0 1"

    def test_reports_a_check_with_no_side_named(self):
        assert h.in_check(board(self.WHITE_CHECKS)) is True
        assert h.in_check(board(self.QUIET)) is False

    def test_attributes_the_check_to_the_right_side(self):
        assert h.in_check(board(self.WHITE_CHECKS), by="white") is True
        assert h.in_check(board(self.WHITE_CHECKS), by="black") is False


class TestSquareControlled:
    OPENING = "r1bqkbnr/pppp1ppp/2n5/1B2p3/4P3/5N2/PPPP1PPP/RNBQK2R b KQkq - 0 1"

    def test_reads_control_of_an_empty_square(self):
        assert h.square_controlled(board(self.OPENING), "d5", by="white") is True
        assert h.square_controlled(board(self.OPENING), "d5", by="black") is False

    def test_needs_a_side_to_answer_at_all(self):
        assert h.square_controlled(board(self.OPENING), "d5", by=None) is None


class TestPieceOnSquare:
    OPENING = "r1bqkbnr/pppp1ppp/2n5/1B2p3/4P3/5N2/PPPP1PPP/RNBQK2R b KQkq - 0 1"

    def test_confirms_a_piece_by_type_and_colour(self):
        assert h.piece_on_square(board(self.OPENING), "c6", piece="knight", by="black") is True

    def test_rejects_the_wrong_colour(self):
        assert h.piece_on_square(board(self.OPENING), "c6", piece="knight", by="white") is False

    def test_rejects_the_wrong_piece(self):
        assert h.piece_on_square(board(self.OPENING), "c6", piece="bishop", by="black") is False

    def test_reports_an_empty_square_as_empty(self):
        assert h.piece_on_square(board(self.OPENING), "d5") is False

    def test_accepts_a_bare_occupancy_claim(self):
        assert h.piece_on_square(board(self.OPENING), "c6") is True


class TestCastlingRights:
    # White keeps both rights; Black keeps only the kingside one.
    MIXED = "r3k2r/8/8/8/8/8/8/R3K2R w KQk - 0 1"

    @pytest.mark.parametrize(
        "by,side,expected",
        [
            ("white", None, True),
            ("white", "kingside", True),
            ("white", "queenside", True),
            ("black", None, True),
            ("black", "kingside", True),
            ("black", "queenside", False),
        ],
    )
    def test_reads_each_right_separately(self, by, side, expected):
        assert h.castling_rights(board(self.MIXED), by, side) is expected

    def test_a_side_that_has_castled_has_no_rights_left(self):
        castled = "r3k2r/8/8/8/8/8/8/R4RK1 w kq - 0 1"
        assert h.castling_rights(board(castled), "white") is False

    def test_needs_a_side_to_answer(self):
        assert h.castling_rights(board(self.MIXED), by=None) is None


class TestPassedPawn:
    # White b5 and a4 are both held up by the black pawn on a7: neither is
    # passed, which is exactly the judgement a model most often gets wrong.
    HELD_UP = "8/p7/8/1P6/P7/8/1k1bK3/8 w - - 0 50"
    CLEAR = "8/8/8/1P6/8/8/6p1/4K1k1 w - - 0 1"

    def test_a_pawn_on_an_adjacent_file_stops_it_being_passed(self):
        assert h.passed_pawn(board(self.HELD_UP), "b5") is False

    def test_a_pawn_on_the_same_file_stops_it_being_passed(self):
        assert h.passed_pawn(board(self.HELD_UP), "a4") is False

    def test_recognises_a_genuinely_passed_pawn_for_each_colour(self):
        assert h.passed_pawn(board(self.CLEAR), "b5") is True
        assert h.passed_pawn(board(self.CLEAR), "g2") is True

    def test_only_enemy_pawns_ahead_of_it_matter(self):
        # A white pawn behind it on the same file is irrelevant.
        assert h.passed_pawn(board("8/8/8/1P6/1P6/8/8/4K1k1 w - - 0 1"), "b5") is True

    def test_a_square_holding_no_pawn_is_not_a_passed_pawn(self):
        assert h.passed_pawn(board(self.CLEAR), "e1") is False
        assert h.passed_pawn(board(self.CLEAR), "d4") is False

    def test_rejects_a_pawn_of_the_wrong_colour(self):
        assert h.passed_pawn(board(self.CLEAR), "b5", by="black") is False


class TestMateIn:
    # Qd1 mates on d8; the black king on h8 is boxed in by its own pawns.
    MATE_IN_ONE = "7k/6pp/8/8/8/8/r4PPP/3Q2K1 w - - 1 2"

    def test_is_unverifiable_without_an_engine(self):
        assert h.mate_in(board(self.MATE_IN_ONE), 1, engine=None) is None

    def test_an_unparseable_count_is_unverifiable(self, engine):
        assert h.mate_in(board(self.MATE_IN_ONE), "soon", engine=engine) is None

    def test_confirms_a_mate_the_engine_finds(self, engine):
        assert h.mate_in(board(self.MATE_IN_ONE), 1, by="white", engine=engine) is True

    def test_the_count_has_to_be_right(self, engine):
        assert h.mate_in(board(self.MATE_IN_ONE), 3, by="white", engine=engine) is False

    def test_attributes_the_mate_to_the_right_side(self, engine):
        assert h.mate_in(board(self.MATE_IN_ONE), 1, by="black", engine=engine) is False

    def test_reports_no_mate_where_there_is_none(self, engine):
        quiet = "4k3/8/8/8/8/8/8/4K3 w - - 0 1"
        assert h.mate_in(board(quiet), 2, by="white", engine=engine) is False


class TestCheckAsThreat:
    """"Qd8 delivers check" and "the king is in check" are different claims.

    Models describe checking moves constantly, and running the present-tense
    handler over those sentences would mark almost every correctly-spotted
    check as false -- penalising exactly the models that explain themselves in
    the most concrete terms.
    """

    # White to move; Qd1-d8 is mate, so it certainly gives check. Nobody is in
    # check right now.
    POSITION = "7k/6pp/8/8/8/8/r4PPP/3Q2K1 w - - 1 2"
    CHECK = {"kind": "check", "by": "white"}

    def test_the_present_tense_reading_is_unchanged(self):
        assert h.verdict_for(
            board(self.POSITION), self.CHECK, claim_type="state",
            text="the king is in check",
        ) is False

    def test_a_named_move_that_checks_is_true(self):
        assert h.verdict_for(
            board(self.POSITION), self.CHECK, claim_type="threat",
            text="Qd8 delivers check",
        ) is True

    def test_a_named_move_that_does_not_check_is_false(self):
        assert h.verdict_for(
            board(self.POSITION), self.CHECK, claim_type="threat",
            text="Qd7 delivers check",
        ) is False

    def test_reads_the_move_in_uci_too(self):
        assert h.verdict_for(
            board(self.POSITION), self.CHECK, claim_type="threat",
            text="d1d8 gives check",
        ) is True

    def test_falls_back_to_whether_any_check_exists(self):
        assert h.check_available(board(self.POSITION), by="white") is True

    def test_reports_no_check_available_where_there_is_none(self):
        quiet = "4k3/8/8/8/8/8/8/4K3 w - - 0 1"
        assert h.check_available(board(quiet), by="white") is False

    def test_the_side_not_to_move_cannot_be_answered(self):
        # That claim is about a position two plies away.
        assert h.check_available(board(self.POSITION), by="black") is None


class TestTerminalPositions:
    """A finished game is settled by the rules, not by a search.

    Stockfish reports "mate 0" on a mated position, which carries no sign, so
    reading it naively makes the position a loss for whoever is on move. That
    inverts the score exactly when a model has just delivered mate -- charging
    it the largest possible centipawn loss for the best possible move.
    """

    # Qd1-d8 is mate in one.
    BEFORE_MATE = "7k/6pp/8/8/8/8/r4PPP/3Q2K1 w - - 1 2"

    def test_a_mated_position_scores_for_the_winner(self, engine):
        position = board(self.BEFORE_MATE)
        position.push(chess.Move.from_uci("d1d8"))
        assert position.is_checkmate()
        assert engine.analyse(position)["cp"] == 10000

    def test_delivering_mate_costs_nothing(self, engine):
        assert engine.cp_loss(board(self.BEFORE_MATE), chess.Move.from_uci("d1d8")) == 0

    def test_missing_the_mate_still_costs(self, engine):
        assert engine.cp_loss(board(self.BEFORE_MATE), chess.Move.from_uci("g1h1")) > 1000

    def test_a_draw_is_level_for_both_sides(self, engine):
        stalemate = board("7k/5Q2/6K1/8/8/8/8/8 b - - 0 1")
        assert stalemate.is_stalemate()
        assert engine.analyse(stalemate)["cp"] == 0
