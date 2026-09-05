"""The bank's one silent-failure mode is getting the Lichess move offset wrong.

If `Moves[0]` is not applied, every task asks the wrong side to move and every
solution is shifted by one. Nothing downstream would raise; solve rates would
simply come back near zero and look like a finding about the models.
"""

from __future__ import annotations

from dataclasses import replace

import chess
import pytest

from eval.tasks.build import Candidate, band_for, to_task

# Black to move. Black abandons the back rank with Ra8-a2, and White mates with
# Qd1-d8. So the position a solver should be shown is the one after a8a2, with
# White to move, and the solution is the single move d1d8.
BACK_RANK = Candidate(
    puzzle_id="TEST01",
    fen="r6k/6pp/8/8/8/8/5PPP/3Q2K1 b - - 0 1",
    moves=("a8a2", "d1d8"),
    rating=1600,
    themes=("mate", "mateIn1", "backRankMate"),
    band=1600,
)


def test_puzzle_position_is_after_the_opponents_move():
    task = to_task(BACK_RANK)
    assert task is not None
    assert task["fen"] == "7k/6pp/8/8/8/8/r4PPP/3Q2K1 w - - 1 2"
    assert task["fen"] != BACK_RANK.fen


def test_side_to_move_is_the_solver_not_the_blunderer():
    task = to_task(BACK_RANK)
    assert task["side_to_move"] == "w"
    assert chess.Board(task["fen"]).turn == chess.WHITE


def test_solution_starts_at_the_second_move():
    task = to_task(BACK_RANK)
    assert task["solution_uci"] == ["d1d8"]
    assert BACK_RANK.moves[0] not in task["solution_uci"]


def test_the_solution_actually_solves_the_position_it_is_paired_with():
    task = to_task(BACK_RANK)
    board = chess.Board(task["fen"])
    for uci in task["solution_uci"]:
        board.push_uci(uci)
    assert board.is_checkmate()


def test_metadata_is_carried_through():
    task = to_task(BACK_RANK)
    assert task["id"] == "TEST01"
    assert task["rating"] == 1600
    assert task["rating_band"] == 1600
    assert task["themes"] == ["mate", "mateIn1", "backRankMate"]


@pytest.mark.parametrize(
    "moves",
    [
        ("a8a2", "f2f5"),  # setup move is legal, the solution move is not
        ("h1h2", "d1d8"),  # setup move is not legal in the given position
        ("zzzz", "d1d8"),  # not parseable as UCI at all
    ],
)
def test_rows_whose_moves_do_not_play_out_are_rejected(moves):
    assert to_task(replace(BACK_RANK, moves=moves)) is None


class TestBands:
    bands = (1200, 1600, 2000, 2400)

    def test_assigns_a_rating_inside_the_tolerance(self):
        assert band_for(1180, self.bands, 100) == 1200
        assert band_for(2400, self.bands, 100) == 2400

    def test_rejects_a_rating_that_falls_between_bands(self):
        # 1400 is equidistant from two bands and is evidence about neither.
        assert band_for(1400, self.bands, 100) is None
        assert band_for(1750, self.bands, 100) is None

    def test_rejects_ratings_outside_the_outermost_bands(self):
        assert band_for(800, self.bands, 100) is None
        assert band_for(3000, self.bands, 100) is None
